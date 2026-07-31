"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const firstStep = require("../src/yarnai/static/first-knitting-step.js");
const section = require("../src/yarnai/static/first-fabric-section.js");
const shaping = require("../src/yarnai/static/first-simple-shaping.js");
const bindOff = require("../src/yarnai/static/first-bind-off.js");

const { DB_NAME, ProjectRepository } = global.YarnAIProjectSystem;
const CHECKLIST_IDS = bindOff.PREPARATION_CHECKLIST.map((item) => item.id);
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

function structuredInput(intent = {}) {
  return {
    schema_version: 1,
    kind: "CALCULATED_PROJECT",
    project_intent: {
      schemaVersion: 1,
      garmentType: "свитер",
      yarn: "меринос",
      gauge: { stitches: 20, widthCm: 10, rows: 30, heightCm: 10 },
      ...intent,
    },
    calculation_input: {
      pattern_class: "constant_stitch_count",
      fabric_context: { yarn: "меринос" },
    },
    row_gauge: { rows: 30, height_cm: 10 },
    swatch: { context: {}, measurements: [] },
    warnings: [],
  };
}

function successfulResult(count = 82) {
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
      width: { ready_count: 20, base_length_cm: 10, density_per_cm: 2 },
    },
    warnings: [],
    errors: [],
    clarifications: [],
  };
}

async function completedShaping(repo, options = {}) {
  const sourceCount = options.sourceCount ?? 82;
  const finalCount = options.finalCount ?? 80;
  const project = await repo.createProject({ title: "Первая деталь" });
  await repo.addCalculation(
    project.project_id,
    structuredInput(options.intent),
    successfulResult(sourceCount),
  );
  const castOn = await firstStep.ensureForProject(repo, project.project_id);
  await firstStep.startForProject(
    repo,
    project.project_id,
    castOn.step.preparation_checklist
      .filter((item) => item.required)
      .map((item) => item.id),
  );
  await firstStep.changeCurrentCount(repo, project.project_id, sourceCount);
  await firstStep.completeForProject(repo, project.project_id);

  await section.ensureForProject(repo, project.project_id);
  await section.answerForProject(repo, project.project_id, "knitting_mode", "flat");
  await section.answerForProject(
    repo,
    project.project_id,
    "fabric_type",
    "stockinette",
  );
  await section.answerForProject(
    repo,
    project.project_id,
    "shaping_required",
    false,
  );
  await section.answerForProject(
    repo,
    project.project_id,
    "edge_stitches_included",
    true,
  );
  await section.answerForProject(repo, project.project_id, "target_mode", "rows");
  await section.answerForProject(repo, project.project_id, "target_row_count", 1);
  await section.startForProject(repo, project.project_id);
  await section.completeCurrentRow(repo, project.project_id);
  await section.completeForProject(repo, project.project_id);

  await shaping.ensureForProject(repo, project.project_id);
  await shaping.answerForProject(
    repo,
    project.project_id,
    "shaping_required",
    true,
  );
  await shaping.answerForProject(
    repo,
    project.project_id,
    "target_stitch_count",
    finalCount,
  );
  await shaping.answerForProject(repo, project.project_id, "total_rows", 1);
  await shaping.answerForProject(
    repo,
    project.project_id,
    "edge_stitches_mode",
    "without_edge_stitches",
  );
  await shaping.startForProject(repo, project.project_id);
  await shaping.completeCurrentRow(repo, project.project_id);
  await shaping.completeForProject(repo, project.project_id);
  return project.project_id;
}

async function readyBindOff(repo, options = {}) {
  const projectId = await completedShaping(repo, options);
  const inspection = await bindOff.ensureForProject(repo, projectId);
  return { projectId, inspection };
}

async function startedBindOff(repo, options = {}) {
  const { projectId } = await readyBindOff(repo, options);
  const inspection = await bindOff.startForProject(
    repo,
    projectId,
    CHECKLIST_IDS,
  );
  return { projectId, inspection };
}

async function replaceProgressState(repo, projectId, mutate) {
  const aggregate = await repo.getProject(projectId);
  const progress = aggregate.progress.find(
    (entry) => entry.kind === bindOff.PROGRESS_KIND,
  );
  mutate(progress.state, progress);
  const database = await repo._database();
  const transaction = database.transaction("progress", "readwrite");
  transaction.objectStore("progress").put(progress);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function sourceFixture(stitchCount = 80) {
  return {
    projectId: "project-1",
    projectTitle: "Первая деталь",
    calculationId: "calculation-1",
    calculationFingerprint: "fingerprint-1",
    sectionId: "section-1",
    progressRevision: 7,
    stitchCount,
    knittingMode: "flat",
    stitchInstructionMode: "match_last_row",
    readinessInput: {
      sourcePresent: true,
      sourceCompleted: true,
      sourceValid: true,
      projectMatches: true,
      sectionMatches: true,
      fingerprintMatches: true,
      stitchCountMatches: true,
      stitchCount,
      knittingMode: "flat",
      partial: false,
      stepped: false,
      multipleRows: false,
      specialMethod: false,
      complexTechnique: false,
      methodKnown: false,
    },
  };
}

function readyFixture(stitchCount = 80) {
  const collecting = bindOff.createBindOff(
    sourceFixture(stitchCount),
    "2026-07-31T10:00:00.000Z",
  );
  return bindOff.prepareBindOff(
    collecting,
    bindOff.buildReadiness(sourceFixture(stitchCount).readinessInput),
    "2026-07-31T10:00:01.000Z",
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

test("creates FIRST_BIND_OFF from a valid completed source snapshot", () => {
  const created = bindOff.createBindOff(sourceFixture());
  assert.equal(created.progress_type, "FIRST_BIND_OFF");
  assert.equal(created.source_progress_type, "FIRST_SIMPLE_SHAPING");
  assert.equal(created.source_progress_revision, 7);
  assert.equal(created.source_calculation_fingerprint, "fingerprint-1");
  assert.equal(created.status, "collecting");
  assert.equal(bindOff.isValidBindOff(created), true);
});

test("initial stitch count uses the actual source result and target is zero", () => {
  const created = bindOff.createBindOff(sourceFixture(73));
  assert.equal(created.initial_stitch_count, 73);
  assert.equal(created.source_stitch_count, 73);
  assert.equal(created.target_stitch_count, 0);
});

test("collecting becomes ready and checklist starts in_progress", () => {
  const ready = readyFixture();
  const started = bindOff.startBindOff(
    ready,
    CHECKLIST_IDS,
    "2026-07-31T10:01:00.000Z",
  );
  assert.equal(ready.status, "ready");
  assert.equal(started.status, "in_progress");
  assert.ok(started.started_at);
  assert.equal(started.preparation_checklist.every((item) => item.confirmed), true);
});

test("checklist starts progress only once", () => {
  const started = bindOff.startBindOff(readyFixture(), CHECKLIST_IDS);
  const repeated = bindOff.startBindOff(started, CHECKLIST_IDS);
  assert.deepEqual(repeated, started);
});

test("incomplete checklist cannot start progress", () => {
  assert.throws(
    () => bindOff.startBindOff(readyFixture(), CHECKLIST_IDS.slice(1)),
    (error) => error.code === "PREPARATION_CHECKLIST_INCOMPLETE",
  );
});

test("records one closed stitch and recalculates derived counts", () => {
  const started = bindOff.startBindOff(readyFixture(), CHECKLIST_IDS);
  const changed = bindOff.addBoundOffStitches(started, 1, "action-1");
  assert.equal(changed.current_stitch_count, 79);
  assert.equal(changed.bound_off_stitch_count, 1);
  assert.equal(changed.remaining_stitch_count, 79);
});

test("records five closed stitches", () => {
  const started = bindOff.startBindOff(readyFixture(), CHECKLIST_IDS);
  const changed = bindOff.addBoundOffStitches(started, 5, "action-5");
  assert.equal(changed.current_stitch_count, 75);
  assert.equal(changed.bound_off_stitch_count, 5);
});

test("records a custom positive amount", () => {
  const started = bindOff.startBindOff(readyFixture(), CHECKLIST_IDS);
  const changed = bindOff.addBoundOffStitches(started, "17", "custom-17");
  assert.equal(changed.current_stitch_count, 63);
});

test("actions are saved in order with exact before and after counts", () => {
  const started = bindOff.startBindOff(readyFixture(), CHECKLIST_IDS);
  const one = bindOff.addBoundOffStitches(started, 1, "first");
  const six = bindOff.addBoundOffStitches(one, 5, "second");
  assert.deepEqual(
    six.completed_actions.map((action) => [
      action.action_id,
      action.stitch_count_before,
      action.stitch_count_after,
    ]),
    [["first", 80, 79], ["second", 79, 74]],
  );
});

test("zero and negative amounts are rejected", () => {
  const started = bindOff.startBindOff(readyFixture(), CHECKLIST_IDS);
  for (const amount of [0, -1]) {
    assert.throws(
      () => bindOff.addBoundOffStitches(started, amount, `action-${amount}`),
      (error) => error.code === "INVALID_BIND_OFF_AMOUNT",
    );
  }
});

test("an amount above the remaining stitches is rejected", () => {
  const started = bindOff.startBindOff(readyFixture(3), CHECKLIST_IDS);
  assert.throws(
    () => bindOff.addBoundOffStitches(started, 4, "too-many"),
    (error) => error.code === "BIND_OFF_AMOUNT_EXCEEDS_REMAINING",
  );
});

test("undo removes only the latest action and restores its stitches", () => {
  const started = bindOff.startBindOff(readyFixture(), CHECKLIST_IDS);
  const one = bindOff.addBoundOffStitches(started, 1, "first");
  const six = bindOff.addBoundOffStitches(one, 5, "second");
  const undone = bindOff.undoLastAction(six);
  assert.equal(undone.current_stitch_count, 79);
  assert.deepEqual(
    undone.completed_actions.map((action) => action.action_id),
    ["first"],
  );
});

test("undo without action history is rejected", () => {
  const started = bindOff.startBindOff(readyFixture(), CHECKLIST_IDS);
  assert.throws(
    () => bindOff.undoLastAction(started),
    (error) => error.code === "NO_BIND_OFF_ACTION_TO_UNDO",
  );
});

test("reaching zero does not complete progress automatically", () => {
  const started = bindOff.startBindOff(readyFixture(6), CHECKLIST_IDS);
  const zero = bindOff.addBoundOffStitches(started, 6, "all");
  assert.equal(zero.current_stitch_count, 0);
  assert.equal(zero.status, "in_progress");
  assert.equal(zero.completed_at, null);
  assert.equal(bindOff.canComplete(zero), true);
});

test("explicit confirmation at zero completes the piece", () => {
  const started = bindOff.startBindOff(readyFixture(6), CHECKLIST_IDS);
  const zero = bindOff.addBoundOffStitches(started, 6, "all");
  const completed = bindOff.completeBindOff(zero, true);
  assert.equal(completed.status, "completed");
  assert.equal(completed.current_stitch_count, 0);
  assert.ok(completed.completed_at);
});

test("completion without explicit confirmation is rejected", () => {
  const started = bindOff.startBindOff(readyFixture(1), CHECKLIST_IDS);
  const zero = bindOff.addBoundOffStitches(started, 1, "all");
  assert.throws(
    () => bindOff.completeBindOff(zero, false),
    (error) => error.code === "BIND_OFF_COMPLETION_NOT_CONFIRMED",
  );
});

test("completion is rejected while stitches remain", () => {
  const started = bindOff.startBindOff(readyFixture(), CHECKLIST_IDS);
  assert.throws(
    () => bindOff.completeBindOff(started, true),
    (error) => error.code === "BIND_OFF_STITCHES_REMAIN",
  );
});

test("completed state cannot record or undo actions", () => {
  const started = bindOff.startBindOff(readyFixture(1), CHECKLIST_IDS);
  const zero = bindOff.addBoundOffStitches(started, 1, "all");
  const completed = bindOff.completeBindOff(zero, true);
  assert.throws(
    () => bindOff.addBoundOffStitches(completed, 1, "late"),
    (error) => error.code === "FIRST_BIND_OFF_COMPLETED",
  );
  assert.throws(
    () => bindOff.undoLastAction(completed),
    (error) => error.code === "FIRST_BIND_OFF_COMPLETED",
  );
});

test("serialization restores valid in_progress and completed states", () => {
  const started = bindOff.startBindOff(readyFixture(2), CHECKLIST_IDS);
  const inProgress = bindOff.addBoundOffStitches(started, 1, "one");
  assert.deepEqual(
    bindOff.restoreBindOff(bindOff.serializeBindOff(inProgress)),
    inProgress,
  );
  const zero = bindOff.addBoundOffStitches(inProgress, 1, "two");
  const completed = bindOff.completeBindOff(zero, true);
  assert.deepEqual(
    bindOff.restoreBindOff(bindOff.serializeBindOff(completed)),
    completed,
  );
});

test("ensure creates one progress and reopening reuses it", async () => {
  const repo = repository();
  const { projectId, inspection } = await readyBindOff(repo);
  const reopened = await bindOff.ensureForProject(repo, projectId);
  const aggregate = await repo.getProject(projectId);
  assert.equal(
    aggregate.progress.filter((entry) => entry.kind === bindOff.PROGRESS_KIND)
      .length,
    1,
  );
  assert.equal(reopened.progress.progress_id, inspection.progress.progress_id);
});

test("repository reload restores in_progress actions", async () => {
  const firstRepository = repository();
  const { projectId } = await startedBindOff(firstRepository);
  await bindOff.addForProject(firstRepository, projectId, 6, "saved-six");
  await firstRepository.close();
  repositories = repositories.filter((entry) => entry !== firstRepository);
  const reopened = repository();
  const restored = await bindOff.loadForProject(reopened, projectId);
  assert.equal(restored.bindOff.status, "in_progress");
  assert.equal(restored.bindOff.bound_off_stitch_count, 6);
  assert.equal(restored.bindOff.remaining_stitch_count, 74);
});

test("repository reload restores completed and first_piece_completed", async () => {
  const firstRepository = repository();
  const { projectId } = await startedBindOff(firstRepository, {
    sourceCount: 4,
    finalCount: 2,
  });
  await bindOff.addForProject(firstRepository, projectId, 2, "all");
  await bindOff.completeForProject(firstRepository, projectId, true);
  await firstRepository.close();
  repositories = repositories.filter((entry) => entry !== firstRepository);
  const reopened = repository();
  const restored = await bindOff.loadForProject(reopened, projectId);
  const aggregate = await reopened.getProject(projectId);
  assert.equal(restored.bindOff.status, "completed");
  assert.equal(aggregate.project.current_stage, "first_piece_completed");
});

test("missing source is blocked", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Без источника" });
  await repo.addCalculation(
    project.project_id,
    structuredInput(),
    successfulResult(),
  );
  const inspection = bindOff.inspectAggregate(
    await repo.getProject(project.project_id),
  );
  assert.equal(inspection.state, "blocked");
  assert.equal(inspection.code, "SOURCE_MISSING");
});

test("unfinished source is blocked", async () => {
  const repo = repository();
  const projectId = await completedShaping(repo);
  const aggregate = await repo.getProject(projectId);
  const source = aggregate.progress.find(
    (entry) => entry.kind === shaping.PROGRESS_KIND,
  );
  source.state.status = "in_progress";
  source.state.completed_at = null;
  const database = await repo._database();
  const transaction = database.transaction("progress", "readwrite");
  transaction.objectStore("progress").put(source);
  await new Promise((resolve) => {
    transaction.oncomplete = resolve;
  });
  const inspection = bindOff.inspectAggregate(await repo.getProject(projectId));
  assert.equal(inspection.state, "blocked");
  assert.equal(inspection.code, "SOURCE_NOT_COMPLETED");
});

test("project conflict blocks existing progress", async () => {
  const repo = repository();
  const { projectId } = await readyBindOff(repo);
  await replaceProgressState(repo, projectId, (state) => {
    state.project_id = "different-project";
  });
  const inspection = bindOff.inspectAggregate(await repo.getProject(projectId));
  assert.equal(inspection.state, "blocked");
  assert.equal(inspection.code, "SOURCE_PROJECT_MISMATCH");
});

test("section conflict blocks existing progress", async () => {
  const repo = repository();
  const { projectId } = await readyBindOff(repo);
  await replaceProgressState(repo, projectId, (state) => {
    state.section_id = "different-section";
  });
  const inspection = bindOff.inspectAggregate(await repo.getProject(projectId));
  assert.equal(inspection.state, "blocked");
  assert.equal(inspection.code, "SOURCE_SECTION_MISMATCH");
});

test("fingerprint conflict blocks existing progress", async () => {
  const repo = repository();
  const { projectId } = await readyBindOff(repo);
  await replaceProgressState(repo, projectId, (state) => {
    state.source_calculation_fingerprint = "different-fingerprint";
  });
  const inspection = bindOff.inspectAggregate(await repo.getProject(projectId));
  assert.equal(inspection.state, "blocked");
  assert.equal(inspection.code, "SOURCE_CALCULATION_MISMATCH");
});

test("source progress revision conflict blocks existing progress", async () => {
  const repo = repository();
  const { projectId } = await readyBindOff(repo);
  await replaceProgressState(repo, projectId, (state) => {
    state.source_progress_revision += 1;
  });
  const inspection = bindOff.inspectAggregate(await repo.getProject(projectId));
  assert.equal(inspection.state, "blocked");
  assert.equal(inspection.code, "SOURCE_PROGRESS_REVISION_MISMATCH");
});

test("stitch count conflict blocks existing progress", async () => {
  const repo = repository();
  const { projectId } = await readyBindOff(repo);
  await replaceProgressState(repo, projectId, (state) => {
    state.source_stitch_count = 79;
    state.initial_stitch_count = 79;
    state.current_stitch_count = 79;
    state.remaining_stitch_count = 79;
    state.instruction = "Последовательно закрой все 79 петель обычным способом.";
  });
  const inspection = bindOff.inspectAggregate(await repo.getProject(projectId));
  assert.equal(inspection.state, "blocked");
  assert.equal(inspection.code, "SOURCE_STITCH_COUNT_MISMATCH");
});

test("round, partial, stepped and special bind-off requirements are blocked", () => {
  const base = sourceFixture().readinessInput;
  for (const patch of [
    { knittingMode: "round" },
    { partial: true },
    { stepped: true },
    { multipleRows: true },
    { specialMethod: true },
    { complexTechnique: true },
  ]) {
    const readiness = bindOff.buildReadiness({ ...base, ...patch });
    assert.ok(readiness.blockers.length > 0);
  }
});

test("round knitting produces a valid blocked state instead of a startable plan", () => {
  const source = sourceFixture();
  source.knittingMode = "round";
  source.readinessInput.knittingMode = "round";
  const collecting = bindOff.createBindOff(source);
  const blocked = bindOff.prepareBindOff(
    collecting,
    bindOff.buildReadiness(source.readinessInput),
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(bindOff.isValidBindOff(blocked), true);
  assert.equal(
    blocked.blockers.some(
      (entry) => entry.code === "ROUND_BIND_OFF_UNSUPPORTED",
    ),
    true,
  );
});

test("complex ProjectIntent creates a persisted blocked progress", async () => {
  const repo = repository();
  const projectId = await completedShaping(repo, {
    intent: {
      first_bind_off: {
        method: "italian",
        source_stitch_count: 80,
      },
    },
  });
  const inspection = await bindOff.ensureForProject(repo, projectId);
  assert.equal(inspection.bindOff.status, "blocked");
  assert.equal(
    inspection.bindOff.blockers.some(
      (entry) => entry.code === "SPECIAL_BIND_OFF_UNSUPPORTED",
    ),
    true,
  );
  const restored = await bindOff.loadForProject(repo, projectId);
  assert.equal(restored.bindOff.status, "blocked");
  await assert.rejects(
    bindOff.startForProject(repo, projectId, CHECKLIST_IDS),
    (error) => error.code === "FIRST_BIND_OFF_BLOCKED",
  );
});

test("a reported special requirement is saved to ProjectIntent and blocks start", async () => {
  const repo = repository();
  const { projectId } = await readyBindOff(repo);
  const blocked = await bindOff.reportUnsupportedForProject(
    repo,
    projectId,
    "special",
  );
  const aggregate = await repo.getProject(projectId);
  assert.equal(blocked.bindOff.status, "blocked");
  assert.equal(
    aggregate.project.draft_input.project_intent.first_bind_off.method,
    "special",
  );
  assert.equal(aggregate.project.current_stage, "first_bind_off_blocked");
  await assert.rejects(
    bindOff.startForProject(repo, projectId, CHECKLIST_IDS),
    (error) => error.code === "FIRST_BIND_OFF_BLOCKED",
  );
});

test("damaged completed_actions history is safely rejected", async () => {
  const repo = repository();
  const { projectId } = await startedBindOff(repo);
  await bindOff.addForProject(repo, projectId, 1, "first");
  await replaceProgressState(repo, projectId, (state) => {
    state.completed_actions[0].stitch_count_after = -1;
  });
  const inspection = bindOff.inspectAggregate(await repo.getProject(projectId));
  assert.equal(inspection.state, "blocked");
  assert.equal(inspection.code, "FIRST_BIND_OFF_DATA_DAMAGED");
});

test("domain revision increases on every successful state change", () => {
  const collecting = bindOff.createBindOff(sourceFixture());
  const ready = bindOff.prepareBindOff(
    collecting,
    bindOff.buildReadiness(sourceFixture().readinessInput),
  );
  const started = bindOff.startBindOff(ready, CHECKLIST_IDS);
  const changed = bindOff.addBoundOffStitches(started, 1, "one");
  const undone = bindOff.undoLastAction(changed);
  assert.deepEqual(
    [
      collecting.revision,
      ready.revision,
      started.revision,
      changed.revision,
      undone.revision,
    ],
    [1, 2, 3, 4, 5],
  );
});

test("a duplicate action id is not recorded twice", () => {
  const started = bindOff.startBindOff(readyFixture(), CHECKLIST_IDS);
  const first = bindOff.addBoundOffStitches(started, 5, "same-action");
  const duplicate = bindOff.addBoundOffStitches(
    first,
    5,
    "same-action",
  );
  assert.deepEqual(duplicate, first);
  assert.equal(duplicate.completed_actions.length, 1);
});

test("instructions adapt to the actual count without claiming universality", () => {
  const ready = readyFixture(80);
  const instructions = bindOff.instructionsFor(ready);
  assert.match(instructions.join(" "), /80/);
  assert.match(instructions[0], /последнем ряду/);
  assert.doesNotMatch(instructions.join(" "), /любого узора|любой кромки/i);
});
