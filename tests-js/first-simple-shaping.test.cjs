"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const firstStep = require("../src/yarnai/static/first-knitting-step.js");
const section = require("../src/yarnai/static/first-fabric-section.js");
const shaping = require("../src/yarnai/static/first-simple-shaping.js");

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
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

function structuredInput(options = {}) {
  const intent = {
    schemaVersion: 1,
    garmentType: "свитер",
    yarn: "меринос",
    gauge: { stitches: 20, widthCm: 10, rows: 30, heightCm: 10 },
    ...(options.intent ?? {}),
  };
  return {
    schema_version: 1,
    kind: "CALCULATED_PROJECT",
    project_intent: intent,
    calculation_input: {
      pattern_class: "constant_stitch_count",
      fabric_context: { yarn: "меринос" },
    },
    row_gauge: { rows: 30, height_cm: 10 },
    swatch: { context: {}, measurements: [] },
    warnings: [],
  };
}

function successfulResult(count = 100) {
  return {
    status: "READY",
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

async function completedCastOn(repo, options = {}) {
  const project = await repo.createProject({ title: "Тестовый проект" });
  await repo.addCalculation(
    project.project_id,
    structuredInput(options),
    successfulResult(options.count ?? 100),
  );
  const prepared = await firstStep.ensureForProject(repo, project.project_id);
  const checklist = prepared.step.preparation_checklist
    .filter((item) => item.required)
    .map((item) => item.id);
  await firstStep.startForProject(repo, project.project_id, checklist);
  await firstStep.changeCurrentCount(
    repo,
    project.project_id,
    options.count ?? 100,
  );
  await firstStep.completeForProject(repo, project.project_id);
  return project.project_id;
}

async function completedFirstSection(repo, options = {}) {
  const projectId = await completedCastOn(repo, options);
  await section.ensureForProject(repo, projectId);
  await section.answerForProject(
    repo,
    projectId,
    "knitting_mode",
    options.mode ?? "flat",
  );
  await section.answerForProject(
    repo,
    projectId,
    "fabric_type",
    options.fabricType ?? "stockinette",
  );
  if (options.fabricType === "custom") {
    await section.answerForProject(
      repo,
      projectId,
      "custom_pattern_confirmed",
      true,
    );
  }
  await section.answerForProject(
    repo,
    projectId,
    "shaping_required",
    false,
  );
  if ((options.mode ?? "flat") === "flat") {
    await section.answerForProject(
      repo,
      projectId,
      "edge_stitches_included",
      true,
    );
  }
  await section.answerForProject(repo, projectId, "target_mode", "rows");
  await section.answerForProject(repo, projectId, "target_row_count", 1);
  await section.startForProject(repo, projectId);
  await section.completeCurrentRow(repo, projectId);
  await section.completeForProject(repo, projectId);
  return projectId;
}

async function readyShaping(repo, options = {}) {
  const projectId =
    options.projectId ?? (await completedFirstSection(repo, options));
  let inspection = await shaping.ensureForProject(repo, projectId);
  if (inspection.state === "collecting") {
    inspection = await shaping.answerForProject(
      repo,
      projectId,
      "shaping_required",
      true,
    );
  }
  if (inspection.shaping.status === "collecting") {
    inspection = await shaping.answerForProject(
      repo,
      projectId,
      "target_stitch_count",
      options.target ?? 80,
    );
  }
  if (inspection.shaping.status === "collecting") {
    inspection = await shaping.answerForProject(
      repo,
      projectId,
      "total_rows",
      options.rows ?? 20,
    );
  }
  if (inspection.shaping.status === "collecting") {
    inspection = await shaping.answerForProject(
      repo,
      projectId,
      "edge_stitches_mode",
      options.edgeMode ?? "without_edge_stitches",
    );
  }
  return { projectId, inspection };
}

async function replaceProgressState(repo, projectId, mutate) {
  const aggregate = await repo.getProject(projectId);
  const progress = aggregate.progress.find(
    (entry) => entry.kind === shaping.PROGRESS_KIND,
  );
  mutate(progress.state);
  const database = await repo._database();
  const transaction = database.transaction("progress", "readwrite");
  transaction.objectStore("progress").put(progress);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

beforeEach(async () => {
  repositories = [];
  await deleteDatabase();
});

afterEach(async () => {
  await Promise.all(repositories.map((entry) => entry.close()));
  await deleteDatabase();
});

test("calculates the number of paired decrease events", () => {
  const plan = shaping.calculateDecreasePlan({
    startingStitchCount: 100,
    targetStitchCount: 80,
    totalRows: 20,
  });
  assert.equal(plan.totalStitchesToDecrease, 20);
  assert.equal(plan.decreaseEventsCount, 10);
});

test("distributes 10 events over 20 rows deterministically", () => {
  assert.deepEqual(
    shaping.distributeDecreaseRows(10, 20),
    [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  );
});

test("distributes 3 events over 10 rows deterministically", () => {
  assert.deepEqual(shaping.distributeDecreaseRows(3, 10), [3, 7, 10]);
});

test("distributes one event into one row", () => {
  assert.deepEqual(shaping.distributeDecreaseRows(1, 1), [1]);
});

test("uses every row when event count equals row count", () => {
  assert.deepEqual(shaping.distributeDecreaseRows(5, 5), [1, 2, 3, 4, 5]);
});

test("blocks an odd stitch difference", () => {
  assert.throws(
    () =>
      shaping.calculateDecreasePlan({
        startingStitchCount: 100,
        targetStitchCount: 79,
        totalRows: 20,
      }),
    (error) => error.code === "ODD_STITCH_DIFFERENCE",
  );
});

test("blocks a target equal to or above the starting count", () => {
  for (const targetStitchCount of [100, 101]) {
    assert.throws(
      () =>
        shaping.calculateDecreasePlan({
          startingStitchCount: 100,
          targetStitchCount,
          totalRows: 20,
        }),
      (error) => error.code === "TARGET_NOT_SMALLER",
    );
  }
});

test("blocks more decrease events than rows", () => {
  assert.throws(
    () =>
      shaping.calculateDecreasePlan({
        startingStitchCount: 100,
        targetStitchCount: 80,
        totalRows: 9,
      }),
    (error) => error.code === "TOO_MANY_DECREASE_EVENTS",
  );
});

test("readiness blocks round knitting", () => {
  const readiness = shaping.evaluateReadiness({
    sourceSectionPresent: true,
    sourceSectionValid: true,
    fingerprintMatches: true,
    projectMatches: true,
    stitchCountMatches: true,
    knittingMode: "round",
    startingStitchCount: 100,
    targetStitchCount: 80,
    totalRows: 20,
    edgeStitchesMode: "without_edge_stitches",
  });
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.blockers[0].code, "ROUND_KNITTING_UNSUPPORTED");
});

test("readiness blocks project and source section conflicts", () => {
  const readiness = shaping.evaluateReadiness({
    sourceSectionPresent: true,
    sourceSectionValid: true,
    fingerprintMatches: true,
    projectMatches: false,
    sourceSectionMatches: false,
    stitchCountMatches: true,
    knittingMode: "flat",
    startingStitchCount: 100,
    targetStitchCount: 80,
    totalRows: 20,
    edgeStitchesMode: "without_edge_stitches",
  });
  assert.equal(readiness.status, "blocked");
  assert.deepEqual(
    readiness.blockers.map((entry) => entry.code),
    ["PROJECT_ID_MISMATCH", "SOURCE_SECTION_ID_MISMATCH"],
  );
});

test("forming cannot start without a completed source section", async () => {
  const repo = repository();
  const projectId = await completedCastOn(repo);
  const inspection = shaping.inspectAggregate(await repo.getProject(projectId));
  assert.equal(inspection.state, "missing_source");
  await assert.rejects(
    shaping.ensureForProject(repo, projectId),
    (error) => error.code === "FIRST_SIMPLE_SHAPING_SOURCE_MISSING",
  );
});

test("decrease row instruction does not choose a technique", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo, { target: 98, rows: 1 });
  const started = await shaping.startForProject(repo, projectId);
  assert.equal(
    shaping.currentInstruction(started.shaping),
    "В этом ряду убавь 1 петлю у начала ряда и 1 петлю у конца ряда. После ряда должно остаться 98 петель.",
  );
  assert.doesNotMatch(shaping.currentInstruction(started.shaping), /2 вместе|протяж/);
});

test("plain row instruction preserves the stitch count", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo);
  const started = await shaping.startForProject(repo, projectId);
  assert.equal(started.shaping.current_row, 1);
  assert.equal(
    shaping.currentInstruction(started.shaping),
    "Провяжи ряд без убавлений. После ряда должно остаться 100 петель.",
  );
});

test("edge stitch instruction describes both edge stitches", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo, {
    target: 98,
    rows: 1,
    edgeMode: "with_edge_stitches",
  });
  const started = await shaping.startForProject(repo, projectId);
  assert.equal(
    shaping.currentInstruction(started.shaping),
    "Провяжи кромочную, убавь 1 петлю. Не доходя до последней кромочной, убавь ещё 1 петлю. Провяжи кромочную. После ряда должно остаться 98 петель.",
  );
});

test("starts shaping once and preserves started_at", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo);
  const started = await shaping.startForProject(repo, projectId);
  const repeated = await shaping.startForProject(repo, projectId);
  assert.equal(started.shaping.status, "in_progress");
  assert.equal(started.shaping.current_row, 1);
  assert.equal(started.shaping.current_stitch_count, 100);
  assert.equal(repeated.shaping.started_at, started.shaping.started_at);
});

test("completing a decrease row subtracts two stitches", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo, { target: 98, rows: 1 });
  await shaping.startForProject(repo, projectId);
  const completed = await shaping.completeCurrentRow(repo, projectId);
  assert.equal(completed.shaping.current_stitch_count, 98);
  assert.equal(completed.shaping.completed_decrease_events, 1);
  assert.equal(completed.shaping.current_row, 2);
});

test("completing a plain row does not change stitches", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo);
  await shaping.startForProject(repo, projectId);
  const completed = await shaping.completeCurrentRow(repo, projectId);
  assert.equal(completed.shaping.current_stitch_count, 100);
  assert.equal(completed.shaping.completed_decrease_events, 0);
  assert.equal(completed.shaping.current_row, 2);
});

test("correcting a decrease row restores two stitches", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo, { target: 98, rows: 1 });
  await shaping.startForProject(repo, projectId);
  await shaping.completeCurrentRow(repo, projectId);
  const corrected = await shaping.decreaseCurrentRow(repo, projectId);
  assert.equal(corrected.shaping.current_row, 1);
  assert.equal(corrected.shaping.current_stitch_count, 100);
  assert.equal(corrected.shaping.completed_decrease_events, 0);
});

test("correction cannot move below row one", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo);
  const started = await shaping.startForProject(repo, projectId);
  const unchanged = await shaping.decreaseCurrentRow(repo, projectId);
  assert.equal(unchanged.shaping.current_row, 1);
  assert.equal(unchanged.shaping.revision, started.shaping.revision);
});

test("processing the final row does not auto-complete", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo, { target: 98, rows: 1 });
  await shaping.startForProject(repo, projectId);
  const processed = await shaping.completeCurrentRow(repo, projectId);
  assert.equal(processed.shaping.status, "in_progress");
  assert.equal(shaping.rowsProcessed(processed.shaping), true);
  assert.equal(processed.shaping.completed_at, null);
});

test("explicit completion saves status and project stage", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo, { target: 98, rows: 1 });
  await shaping.startForProject(repo, projectId);
  await shaping.completeCurrentRow(repo, projectId);
  const completed = await shaping.completeForProject(repo, projectId);
  const aggregate = await repo.getProject(projectId);
  assert.equal(completed.shaping.status, "completed");
  assert.ok(completed.shaping.completed_at);
  assert.equal(
    aggregate.project.current_stage,
    "first_simple_shaping_completed",
  );
});

test("saved progress restores after repository reopen", async () => {
  const firstRepository = repository();
  const { projectId } = await readyShaping(firstRepository);
  await shaping.startForProject(firstRepository, projectId);
  await shaping.completeCurrentRow(firstRepository, projectId);
  await firstRepository.close();
  repositories = repositories.filter((entry) => entry !== firstRepository);
  const reopened = repository();
  const restored = await shaping.loadForProject(reopened, projectId);
  assert.equal(restored.shaping.current_row, 2);
  assert.equal(restored.shaping.current_stitch_count, 100);
  assert.equal(restored.shaping.status, "in_progress");
});

test("fingerprint mismatch blocks loading without mutation", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo);
  await replaceProgressState(repo, projectId, (state) => {
    state.source_calculation_fingerprint = "different-fingerprint";
  });
  const before = await repo.getProject(projectId);
  const inspection = shaping.inspectAggregate(before);
  assert.equal(inspection.state, "mismatch");
  assert.equal(inspection.code, "CALCULATION_FINGERPRINT_MISMATCH");
  const after = await repo.getProject(projectId);
  assert.deepEqual(after.progress, before.progress);
});

test("damaged shaping model is rejected without reset", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo);
  await replaceProgressState(repo, projectId, (state) => {
    state.decrease_rows = [2, 2];
  });
  const before = await repo.getProject(projectId);
  const inspection = shaping.inspectAggregate(before);
  assert.equal(inspection.state, "invalid");
  await assert.rejects(
    shaping.loadForProject(repo, projectId),
    (error) => error.code === "FIRST_SIMPLE_SHAPING_INVALID",
  );
  const after = await repo.getProject(projectId);
  assert.deepEqual(after.progress, before.progress);
});

test("invalid inputs remain exact and are never silently changed", async () => {
  const repo = repository();
  const projectId = await completedFirstSection(repo);
  await shaping.ensureForProject(repo, projectId);
  await shaping.answerForProject(
    repo,
    projectId,
    "shaping_required",
    true,
  );
  await shaping.answerForProject(
    repo,
    projectId,
    "target_stitch_count",
    79,
  );
  await shaping.answerForProject(repo, projectId, "total_rows", 20);
  const blocked = await shaping.answerForProject(
    repo,
    projectId,
    "edge_stitches_mode",
    "without_edge_stitches",
  );
  assert.equal(blocked.shaping.status, "blocked");
  assert.equal(blocked.shaping.starting_stitch_count, 100);
  assert.equal(blocked.shaping.target_stitch_count, 79);
  assert.equal(blocked.shaping.total_rows, 20);
  assert.deepEqual(blocked.shaping.decrease_rows, []);
});

test("declining shaping saves intent without creating progress", async () => {
  const repo = repository();
  const projectId = await completedFirstSection(repo);
  const initial = await shaping.ensureForProject(repo, projectId);
  assert.equal(initial.state, "collecting");
  const declined = await shaping.answerForProject(
    repo,
    projectId,
    "shaping_required",
    false,
  );
  const aggregate = await repo.getProject(projectId);
  assert.equal(declined.state, "declined");
  assert.equal(
    aggregate.project.draft_input.project_intent.first_simple_shaping
      .shaping_required,
    false,
  );
  assert.equal(
    aggregate.progress.some((entry) => entry.kind === shaping.PROGRESS_KIND),
    false,
  );
});

test("known ProjectIntent answers create a ready immutable plan", async () => {
  const repo = repository();
  const projectId = await completedFirstSection(repo);
  const aggregate = await repo.getProject(projectId);
  const draft = structuredClone(aggregate.project.draft_input);
  draft.project_intent.first_simple_shaping = {
    shaping_required: true,
    target_stitch_count: 80,
    total_rows: 20,
    edge_stitches_mode: "without_edge_stitches",
    source_calculation_fingerprint:
      aggregate.calculations[0].fingerprint,
    source_section_id: aggregate.progress.find(
      (entry) => entry.kind === section.PROGRESS_KIND,
    ).state.section_id,
    starting_stitch_count: 100,
  };
  await repo.updateProject(projectId, {
    draft_input: draft,
    has_unfinished_calculation: false,
  });
  const ready = await shaping.ensureForProject(repo, projectId);
  assert.equal(ready.shaping.status, "ready");
  assert.deepEqual(
    ready.shaping.decrease_rows,
    [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  );
});

test("custom pattern adaptation is honestly blocked", async () => {
  const repo = repository();
  const projectId = await completedFirstSection(repo, {
    fabricType: "custom",
  });
  await shaping.ensureForProject(repo, projectId);
  const created = await shaping.answerForProject(
    repo,
    projectId,
    "shaping_required",
    true,
  );
  assert.equal(created.shaping.status, "blocked");
  assert.equal(
    created.shaping.blockers.some(
      (entry) => entry.code === "CUSTOM_PATTERN_ADAPTATION_UNSUPPORTED",
    ),
    true,
  );
});

test("completed shaping remains completed when reopened", async () => {
  const repo = repository();
  const { projectId } = await readyShaping(repo, { target: 98, rows: 1 });
  await shaping.startForProject(repo, projectId);
  await shaping.completeCurrentRow(repo, projectId);
  const completed = await shaping.completeForProject(repo, projectId);
  const reopened = await shaping.ensureForProject(repo, projectId);
  assert.equal(reopened.shaping.status, "completed");
  assert.equal(reopened.shaping.completed_at, completed.shaping.completed_at);
  await assert.rejects(
    shaping.decreaseCurrentRow(repo, projectId),
    (error) => error.code === "COMPLETED_SHAPING_CORRECTION_BLOCKED",
  );
});
