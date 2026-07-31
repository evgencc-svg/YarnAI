"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const firstStep = require("../src/yarnai/static/first-knitting-step.js");

const { DB_NAME, ProjectRepository } = global.YarnAIProjectSystem;
let repositories = [];

function repository() {
  const value = new ProjectRepository();
  repositories.push(value);
  return value;
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

function structuredInput(options = {}) {
  return {
    schema_version: 1,
    kind: "CALCULATED_PROJECT",
    project_intent: {
      schemaVersion: 1,
      yarn: "меринос",
    },
    calculation_input: {
      fabric_context: {
        yarn: "меринос",
        needle_mm: 4,
        needle_type: "circular",
      },
    },
    row_gauge: { rows: 28, height_cm: 10 },
    swatch: {
      context: options.context ?? {
        processed: true,
        fullyDry: true,
      },
      measurements: [{ stitches: 20, widthCm: 10 }],
    },
    warnings: options.warnings ?? [],
  };
}

function successfulResult(count = 3, status = "READY") {
  return {
    status,
    axes: {
      width: {
        selected_candidate: {
          working_count: count,
          actual_size_original_unit: count / 2,
          original_unit: "cm",
        },
      },
    },
    gauges: {
      width: {
        ready_count: 20,
        base_length_cm: 10,
        density_per_cm: 2,
      },
    },
    warnings: [],
    errors: [],
    clarifications: [],
  };
}

async function savedCalculation(repo, count = 3, options = {}) {
  const project = await repo.createProject({ title: "Тестовый свитер" });
  await repo.addCalculation(
    project.project_id,
    structuredInput(options),
    successfulResult(count),
  );
  return project.project_id;
}

async function preparedProject(repo, count = 3, options = {}) {
  const projectId = await savedCalculation(repo, count, options);
  const inspection = await firstStep.ensureForProject(repo, projectId);
  return { projectId, inspection };
}

function requiredChecklistIds(step) {
  return step.preparation_checklist
    .filter((item) => item.required)
    .map((item) => item.id);
}

beforeEach(async () => {
  repositories = [];
  await deleteDatabase();
});

afterEach(async () => {
  await Promise.all(repositories.map((entry) => entry.close()));
  await deleteDatabase();
});

test("first step is created from successful calculation and count comes from engine result", async () => {
  const repo = repository();
  const projectId = await savedCalculation(repo, 100);
  const inspection = await firstStep.ensureForProject(repo, projectId);

  assert.equal(inspection.state, "ready");
  assert.equal(inspection.step.project_id, projectId);
  assert.equal(inspection.step.stitch_count, 100);
  assert.equal(inspection.step.target_stitch_count, 100);
  assert.equal(inspection.step.working_width.value, 50);
  assert.equal(inspection.step.stitch_gauge.density_per_cm, 2);
  assert.match(inspection.step.instruction, /100/);
  assert.equal(inspection.step.status, "not_started");
});

test("repeated creation is idempotent and does not duplicate progress", async () => {
  const repo = repository();
  const projectId = await savedCalculation(repo);
  const first = await firstStep.ensureForProject(repo, projectId);
  const second = await firstStep.ensureForProject(repo, projectId);
  const aggregate = await repo.getProject(projectId);
  const records = aggregate.progress.filter(
    (entry) => entry.kind === firstStep.PROGRESS_KIND,
  );

  assert.equal(first.step.step_id, second.step.step_id);
  assert.equal(second.step.revision, first.step.revision);
  assert.equal(records.length, 1);
});

test("erroneous and blocked results do not create a first step", () => {
  for (const status of [
    "INPUT_ERROR",
    "IMPOSSIBLE",
    "CONFIRMATION_REQUIRED",
  ]) {
    assert.throws(
      () =>
        firstStep.createFirstStep({
          project: {
            project_id: "project",
            active_calculation_id: "calculation",
          },
          calculations: [
            {
              calculation_id: "calculation",
              fingerprint: "revision",
              request: structuredInput(),
              result: successfulResult(3, status),
            },
          ],
        }),
      (error) => error.code === "CALCULATION_NOT_SUCCESSFUL",
    );
  }
});

test("checklist is structured from project context and optional tools do not block start", async () => {
  const repo = repository();
  const { projectId, inspection } = await preparedProject(repo);
  const marker = inspection.step.preparation_checklist.find(
    (item) => item.id === "markers_or_counter",
  );

  assert.equal(marker.required, false);
  assert.match(
    inspection.step.preparation_checklist.find(
      (item) => item.id === "correct_yarn",
    ).label,
    /меринос/,
  );
  assert.match(
    inspection.step.preparation_checklist.find(
      (item) => item.id === "same_tools",
    ).label,
    /4 мм/,
  );

  const started = await firstStep.startForProject(
    repo,
    projectId,
    requiredChecklistIds(inspection.step),
  );
  assert.equal(started.step.status, "in_progress");
  assert.equal(
    started.step.preparation_checklist.find(
      (item) => item.id === "markers_or_counter",
    ).checked,
    false,
  );
});

test("unprepared swatch warning comes from saved gauge context", async () => {
  const repo = repository();
  const { inspection } = await preparedProject(repo, 3, {
    context: { processed: false, fullyDry: false },
  });

  assert.equal(inspection.step.warnings[0].code, "SWATCH_NOT_PREPARED");
  assert.equal(inspection.step.warnings[0].source, "project_gauge_context");
});

test("start is repeat-safe and does not reset existing progress", async () => {
  const repo = repository();
  const { projectId, inspection } = await preparedProject(repo);
  const checked = requiredChecklistIds(inspection.step);
  const started = await firstStep.startForProject(repo, projectId, checked);
  const progressed = await firstStep.changeCurrentCount(repo, projectId, 1);
  const repeated = await firstStep.startForProject(repo, projectId, checked);

  assert.equal(started.step.status, "in_progress");
  assert.ok(started.step.started_at);
  assert.equal(progressed.step.current_stitch_count, 1);
  assert.equal(repeated.step.current_stitch_count, 1);
  assert.equal(repeated.step.started_at, started.step.started_at);
});

test("Step Assistant load by project id restores progress after repository reopen", async () => {
  const firstRepository = repository();
  const { projectId, inspection } = await preparedProject(firstRepository);
  await firstStep.startForProject(
    firstRepository,
    projectId,
    requiredChecklistIds(inspection.step),
  );
  await firstStep.changeCurrentCount(firstRepository, projectId, 1);
  await firstRepository.close();
  repositories = repositories.filter((entry) => entry !== firstRepository);

  const reopened = repository();
  await reopened.initialize();
  const restored = await firstStep.loadForProject(reopened, projectId);
  assert.equal(restored.step.current_stitch_count, 1);
  assert.equal(restored.step.status, "in_progress");
});

test("counter never becomes negative and a saved decrement corrects progress", async () => {
  const repo = repository();
  const { projectId, inspection } = await preparedProject(repo);
  await firstStep.startForProject(
    repo,
    projectId,
    requiredChecklistIds(inspection.step),
  );
  const unchanged = await firstStep.changeCurrentCount(repo, projectId, -1);
  assert.equal(unchanged.step.current_stitch_count, 0);

  await firstStep.changeCurrentCount(repo, projectId, 1);
  await firstStep.changeCurrentCount(repo, projectId, 1);
  const corrected = await firstStep.changeCurrentCount(repo, projectId, -1);
  const restored = await firstStep.loadForProject(repo, projectId);
  assert.equal(corrected.step.current_stitch_count, 1);
  assert.equal(restored.step.current_stitch_count, 1);
});

test("reaching target does not auto-complete and exceeding target is blocked", async () => {
  const repo = repository();
  const { projectId, inspection } = await preparedProject(repo, 2);
  await firstStep.startForProject(
    repo,
    projectId,
    requiredChecklistIds(inspection.step),
  );
  await firstStep.changeCurrentCount(repo, projectId, 1);
  const target = await firstStep.changeCurrentCount(repo, projectId, 1);

  assert.equal(target.step.current_stitch_count, 2);
  assert.equal(target.step.status, "in_progress");
  assert.equal(target.step.completed_at, null);
  await assert.rejects(
    firstStep.changeCurrentCount(repo, projectId, 1),
    (error) => error.code === "STITCH_LIMIT_REACHED",
  );
});

test("explicit completion stores completed_at and project cast-on stage", async () => {
  const repo = repository();
  const { projectId, inspection } = await preparedProject(repo, 1);
  await firstStep.startForProject(
    repo,
    projectId,
    requiredChecklistIds(inspection.step),
  );
  await firstStep.changeCurrentCount(repo, projectId, 1);
  const completed = await firstStep.completeForProject(repo, projectId);
  const aggregate = await repo.getProject(projectId);

  assert.equal(completed.step.status, "completed");
  assert.ok(completed.step.completed_at);
  assert.equal(aggregate.project.current_stage, "cast_on_completed");
  assert.equal(aggregate.project.workspace_status, "ACTIVE");
});

test("home summary and destination follow first-step status", async () => {
  const repo = repository();
  const { projectId, inspection } = await preparedProject(repo, 3);
  const calculationInspection = { state: "ready" };
  assert.match(firstStep.progressSummary(inspection.step), /Первый шаг готов/);
  assert.match(
    firstStep.continueDestination(
      calculationInspection,
      inspection,
      projectId,
    ),
    /^\/calculator/,
  );

  const started = await firstStep.startForProject(
    repo,
    projectId,
    requiredChecklistIds(inspection.step),
  );
  await firstStep.changeCurrentCount(repo, projectId, 1);
  const progress = await firstStep.loadForProject(repo, projectId);
  assert.equal(firstStep.progressSummary(progress.step), "1 из 3 петель");
  assert.match(
    firstStep.continueDestination(calculationInspection, progress, projectId),
    /^\/step-assistant/,
  );
  assert.equal(started.step.status, "in_progress");
});

test("damaged and unsupported steps are handled without exceptions", async () => {
  const repo = repository();
  const { projectId } = await preparedProject(repo);
  const aggregate = await repo.getProject(projectId);
  const progress = aggregate.progress.find(
    (entry) => entry.kind === firstStep.PROGRESS_KIND,
  );

  progress.state = { version: 1, broken: true };
  assert.equal(firstStep.inspectAggregate(aggregate).state, "invalid");
  progress.state = { version: 99 };
  assert.equal(firstStep.inspectAggregate(aggregate).state, "unsupported");
});

test("project id and calculation target mismatches block continuation", async () => {
  const repo = repository();
  const { projectId } = await preparedProject(repo);
  const aggregate = await repo.getProject(projectId);
  const progress = aggregate.progress.find(
    (entry) => entry.kind === firstStep.PROGRESS_KIND,
  );

  progress.state.project_id = "different-project";
  assert.equal(firstStep.inspectAggregate(aggregate).state, "mismatch");

  progress.state.project_id = projectId;
  progress.state.target_stitch_count += 1;
  assert.equal(firstStep.inspectAggregate(aggregate).state, "mismatch");
});

test("missing project, calculation, and first step produce safe user-facing errors", async () => {
  const repo = repository();
  await assert.rejects(
    firstStep.loadForProject(repo, "not-a-project"),
    (error) => Boolean(error.userMessage),
  );

  const project = await repo.createProject({ title: "Без расчёта" });
  await assert.rejects(
    firstStep.ensureForProject(repo, project.project_id),
    (error) => error.code === "FIRST_STEP_INVALID",
  );

  const projectId = await savedCalculation(repo);
  const aggregate = await repo.getProject(projectId);
  aggregate.progress = [];
  const missing = firstStep.inspectAggregate(aggregate);
  assert.equal(missing.state, "missing");
  assert.match(missing.message, /не найден/);
});
