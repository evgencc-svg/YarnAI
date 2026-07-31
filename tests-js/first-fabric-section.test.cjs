"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const firstStep = require("../src/yarnai/static/first-knitting-step.js");
const section = require("../src/yarnai/static/first-fabric-section.js");

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
  const intent = {
    schemaVersion: 1,
    yarn: "меринос",
    gauge: {
      stitches: 20,
      widthCm: 10,
      rows: options.rowGauge === null ? null : (options.rowGauge?.rows ?? 30),
      heightCm:
        options.rowGauge === null ? null : (options.rowGauge?.height_cm ?? 10),
    },
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
    row_gauge:
      options.rowGauge === null
        ? null
        : {
            rows: options.rowGauge?.rows ?? 30,
            height_cm: options.rowGauge?.height_cm ?? 10,
          },
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
  const required = prepared.step.preparation_checklist
    .filter((item) => item.required)
    .map((item) => item.id);
  await firstStep.startForProject(repo, project.project_id, required);
  await firstStep.changeCurrentCount(
    repo,
    project.project_id,
    options.count ?? 100,
  );
  await firstStep.completeForProject(repo, project.project_id);
  return project.project_id;
}

async function preparedSection(repo, options = {}) {
  const projectId = await completedCastOn(repo, options);
  const inspection = await section.ensureForProject(repo, projectId);
  return { projectId, inspection };
}

async function answerReadyRows(repo, projectId, rows = 3, mode = "flat") {
  await section.answerForProject(repo, projectId, "knitting_mode", mode);
  await section.answerForProject(repo, projectId, "fabric_type", "stockinette");
  await section.answerForProject(repo, projectId, "shaping_required", false);
  if (mode === "flat") {
    await section.answerForProject(
      repo,
      projectId,
      "edge_stitches_included",
      true,
    );
  }
  await section.answerForProject(repo, projectId, "target_mode", "rows");
  return section.answerForProject(
    repo,
    projectId,
    "target_row_count",
    rows,
  );
}

beforeEach(async () => {
  repositories = [];
  await deleteDatabase();
});

afterEach(async () => {
  await Promise.all(repositories.map((entry) => entry.close()));
  await deleteDatabase();
});

test("readiness is determined from an existing ProjectIntent", async () => {
  const repo = repository();
  const { inspection } = await preparedSection(repo, {
    intent: {
      first_fabric_section: {
        knitting_mode: "round",
        fabric_type: "stockinette",
        shaping_required: false,
        target_mode: "rows",
        target_row_count: 12,
      },
    },
  });
  assert.equal(inspection.section.status, "ready");
  assert.equal(inspection.section.calculated_row_count, 12);
});

test("only the next necessary question is selected", () => {
  const result = section.evaluateReadiness({ answers: {}, stitchCount: 100 });
  assert.equal(result.status, "collecting");
  assert.equal(result.nextQuestion.id, "knitting_mode");
  assert.equal(result.nextQuestion.text.match(/\?/g).length, 1);
});

test("known answers are not asked repeatedly", () => {
  const result = section.evaluateReadiness({
    answers: {
      knitting_mode: "round",
      fabric_type: "stockinette",
    },
    stitchCount: 100,
  });
  assert.equal(result.nextQuestion.id, "shaping_required");
});

test("a straight section becomes ready", () => {
  const result = section.evaluateReadiness({
    answers: {
      knitting_mode: "round",
      fabric_type: "stockinette",
      shaping_required: false,
      target_mode: "rows",
      target_row_count: 8,
    },
    stitchCount: 100,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.calculatedRowCount, 8);
});

test("a section with shaping is blocked without an instruction", () => {
  const result = section.evaluateReadiness({
    answers: { shaping_required: true },
    stitchCount: 100,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.blockingReasons[0].code, "SHAPING_REQUIRED");
  assert.equal(result.calculatedRowCount, null);
});

test("a custom pattern is never decoded automatically", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  await section.answerForProject(repo, projectId, "knitting_mode", "round");
  await section.answerForProject(repo, projectId, "fabric_type", "custom");
  await section.answerForProject(
    repo,
    projectId,
    "custom_pattern_confirmed",
    true,
  );
  await section.answerForProject(repo, projectId, "shaping_required", false);
  await section.answerForProject(repo, projectId, "target_mode", "rows");
  const ready = await section.answerForProject(
    repo,
    projectId,
    "target_row_count",
    2,
  );
  assert.equal(
    section.currentInstruction(ready.section),
    "Вяжи следующий ряд по выбранной схеме",
  );
  assert.doesNotMatch(section.currentInstruction(ready.section), /лицев|изнаноч/i);
});

test("a row target does not require row gauge", () => {
  const result = section.evaluateReadiness({
    answers: {
      knitting_mode: "round",
      fabric_type: "stockinette",
      shaping_required: false,
      target_mode: "rows",
      target_row_count: 7,
    },
    rowGauge: null,
    stitchCount: 100,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.calculatedRowCount, 7);
});

test("a centimetre target asks for row gauge when it is absent", () => {
  const result = section.evaluateReadiness({
    answers: {
      knitting_mode: "round",
      fabric_type: "stockinette",
      shaping_required: false,
      target_mode: "length_cm",
      target_length_cm: 20,
    },
    rowGauge: null,
    stitchCount: 100,
  });
  assert.equal(result.status, "collecting");
  assert.equal(result.nextQuestion.id, "row_gauge");
});

test("row count calculation is centralized", () => {
  const calculated = section.calculateRowCount(20, {
    rows: 30,
    height_cm: 10,
  });
  assert.equal(calculated.rows, 60);
  assert.equal(calculated.rule, "nearest_half_up");
});

test("row rounding is nearest with an exact half rounded upward", () => {
  assert.equal(
    section.calculateRowCount(2.5, { rows: 10, height_cm: 10 }).rows,
    3,
  );
  assert.equal(
    section.calculateRowCount(2.49, { rows: 10, height_cm: 10 }).rows,
    2,
  );
});

test("repeated creation is idempotent and creates no duplicate", async () => {
  const repo = repository();
  const { projectId, inspection } = await preparedSection(repo);
  const repeated = await section.ensureForProject(repo, projectId);
  const aggregate = await repo.getProject(projectId);
  assert.equal(repeated.section.section_id, inspection.section.section_id);
  assert.equal(
    aggregate.progress.filter((entry) => entry.kind === section.PROGRESS_KIND)
      .length,
    1,
  );
});

test("changing an answer updates the same section and increments revision", async () => {
  const repo = repository();
  const { projectId, inspection } = await preparedSection(repo);
  const first = await section.answerForProject(
    repo,
    projectId,
    "knitting_mode",
    "flat",
  );
  const changed = await section.answerForProject(
    repo,
    projectId,
    "knitting_mode",
    "round",
  );
  assert.equal(changed.section.section_id, inspection.section.section_id);
  assert.equal(changed.section.revision, first.section.revision + 1);
});

test("starting changes status to in_progress", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  await answerReadyRows(repo, projectId);
  const started = await section.startForProject(repo, projectId);
  assert.equal(started.section.status, "in_progress");
  assert.ok(started.section.started_at);
});

test("current row starts at one", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  await answerReadyRows(repo, projectId);
  const started = await section.startForProject(repo, projectId);
  assert.equal(started.section.current_row, 1);
});

test("completing a row increments current row", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  await answerReadyRows(repo, projectId);
  await section.startForProject(repo, projectId);
  const progressed = await section.completeCurrentRow(repo, projectId);
  assert.equal(progressed.section.current_row, 2);
});

test("decreasing a row is saved and never goes below one", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  await answerReadyRows(repo, projectId);
  await section.startForProject(repo, projectId);
  const unchanged = await section.decreaseCurrentRow(repo, projectId);
  assert.equal(unchanged.section.current_row, 1);
  await section.completeCurrentRow(repo, projectId);
  const corrected = await section.decreaseCurrentRow(repo, projectId);
  assert.equal(corrected.section.current_row, 1);
  assert.equal(
    (await section.loadForProject(repo, projectId)).section.current_row,
    1,
  );
});

test("repository reload restores section progress", async () => {
  const firstRepository = repository();
  const { projectId } = await preparedSection(firstRepository);
  await answerReadyRows(firstRepository, projectId);
  await section.startForProject(firstRepository, projectId);
  await section.completeCurrentRow(firstRepository, projectId);
  await firstRepository.close();
  repositories = repositories.filter((entry) => entry !== firstRepository);

  const reopened = repository();
  await reopened.initialize();
  const restored = await section.loadForProject(reopened, projectId);
  assert.equal(restored.section.current_row, 2);
  assert.equal(restored.section.status, "in_progress");
});

test("reaching the target does not auto-complete", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  await answerReadyRows(repo, projectId, 1);
  await section.startForProject(repo, projectId);
  const reached = await section.completeCurrentRow(repo, projectId);
  assert.equal(section.targetReached(reached.section), true);
  assert.equal(reached.section.status, "in_progress");
  assert.equal(reached.section.completed_at, null);
});

test("explicit confirmation completes section and updates project stage", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  await answerReadyRows(repo, projectId, 1);
  await section.startForProject(repo, projectId);
  await section.completeCurrentRow(repo, projectId);
  const completed = await section.completeForProject(repo, projectId);
  const aggregate = await repo.getProject(projectId);
  assert.equal(completed.section.status, "completed");
  assert.ok(completed.section.completed_at);
  assert.equal(
    aggregate.project.current_stage,
    "first_fabric_section_completed",
  );
});

test("flat stockinette changes instruction by row parity", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  await answerReadyRows(repo, projectId, 2, "flat");
  let current = await section.startForProject(repo, projectId);
  assert.match(section.currentInstruction(current.section), /лицевой ряд/i);
  current = await section.completeCurrentRow(repo, projectId);
  assert.match(section.currentInstruction(current.section), /изнаночный ряд/i);
});

test("round stockinette instruction does not change", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  await answerReadyRows(repo, projectId, 2, "round");
  let current = await section.startForProject(repo, projectId);
  const firstInstruction = section.currentInstruction(current.section);
  current = await section.completeCurrentRow(repo, projectId);
  assert.equal(section.currentInstruction(current.section), firstInstruction);
  assert.match(firstInstruction, /все петли лицевые/i);
});

test("flat garter fabric shows knit rows", () => {
  const model = {
    version: 1,
    section_id: "section",
    project_id: "project",
    revision: 1,
    source_calculation_fingerprint: "fingerprint",
    source_first_step_id: "step",
    source_stitch_count: 100,
    status: "ready",
    knitting_mode: "flat",
    fabric_type: "garter",
    custom_pattern_reference: null,
    custom_pattern_confirmed: null,
    edge_stitches_included: true,
    target_mode: "rows",
    target_length_cm: null,
    target_row_count: 2,
    calculated_row_count: 2,
    row_gauge: null,
    row_gauge_source: null,
    row_rounding_rule: null,
    row_calculation_explanation: null,
    shaping_required: false,
    instruction_summary: "Платочная вязка",
    warnings: [],
    blocking_reasons: [],
    current_row: 0,
    answers: {},
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
    started_at: null,
    completed_at: null,
  };
  assert.match(section.currentInstruction(model), /лицевые/i);
});

test("rib 1x1 validates its two-stitch repeat", () => {
  const result = section.evaluateReadiness({
    answers: {
      knitting_mode: "round",
      fabric_type: "rib_1x1",
      shaping_required: false,
      target_mode: "rows",
      target_row_count: 2,
    },
    stitchCount: 101,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.blockingReasons[0].details.repeat, 2);
});

test("rib 2x2 validates its four-stitch repeat", () => {
  const result = section.evaluateReadiness({
    answers: {
      knitting_mode: "round",
      fabric_type: "rib_2x2",
      shaping_required: false,
      target_mode: "rows",
      target_row_count: 2,
    },
    stitchCount: 102,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.blockingReasons[0].details.repeat, 4);
});

test("edge stitches are never added automatically", () => {
  const result = section.evaluateReadiness({
    answers: {
      knitting_mode: "flat",
      fabric_type: "stockinette",
      shaping_required: false,
      edge_stitches_included: false,
      target_mode: "rows",
      target_row_count: 2,
    },
    stitchCount: 100,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.calculatedRowCount, 2);
  assert.equal(result.warnings[0].code, "EDGE_STITCHES_NOT_INCLUDED");
});

test("damaged section data is inspected without a JavaScript exception", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  const aggregate = await repo.getProject(projectId);
  const progress = aggregate.progress.find(
    (entry) => entry.kind === section.PROGRESS_KIND,
  );
  progress.state = { version: 1, broken: true };
  assert.equal(section.inspectAggregate(aggregate).state, "invalid");
  progress.state = { version: 99 };
  assert.equal(section.inspectAggregate(aggregate).state, "unsupported");
});

test("fingerprint mismatch blocks continuation", async () => {
  const repo = repository();
  const { projectId } = await preparedSection(repo);
  const aggregate = await repo.getProject(projectId);
  const progress = aggregate.progress.find(
    (entry) => entry.kind === section.PROGRESS_KIND,
  );
  progress.state.source_calculation_fingerprint = "different";
  const inspected = section.inspectAggregate(aggregate);
  assert.equal(inspected.state, "mismatch");
  assert.equal(
    inspected.blockingReasons[0].code,
    "CALCULATION_FINGERPRINT_MISMATCH",
  );
});

test("home state exposes collecting, ready, progress and completed actions", async () => {
  const repo = repository();
  const { projectId, inspection } = await preparedSection(repo);
  assert.equal(section.homeState(inspection, projectId).label, "Уточнить следующий участок");
  let current = await answerReadyRows(repo, projectId, 1);
  assert.equal(section.homeState(current, projectId).label, "Начать участок");
  current = await section.startForProject(repo, projectId);
  assert.equal(section.homeState(current, projectId).summary, "0 из 1 рядов");
  await section.completeCurrentRow(repo, projectId);
  current = await section.completeForProject(repo, projectId);
  assert.equal(section.homeState(current, projectId).summary, "Первый участок завершён");
});

test("creating a section does not alter the completed cast-on step", async () => {
  const repo = repository();
  const projectId = await completedCastOn(repo);
  const before = await firstStep.loadForProject(repo, projectId);
  await section.ensureForProject(repo, projectId);
  const after = await firstStep.loadForProject(repo, projectId);
  assert.equal(after.step.status, "completed");
  assert.equal(after.step.step_id, before.step.step_id);
  assert.equal(after.step.current_stitch_count, before.step.current_stitch_count);
});
