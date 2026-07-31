"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const firstStepApi = require("../src/yarnai/static/first-knitting-step.js");
const sectionApi = require("../src/yarnai/static/first-fabric-section.js");
const shapingApi = require("../src/yarnai/static/first-simple-shaping.js");
const bindOffApi = require("../src/yarnai/static/first-bind-off.js");
const second = require("../src/yarnai/static/second-identical-piece.js");

const NOW = "2026-07-31T10:00:00.000Z";
const PROJECT_ID = "project-stage-11";
const CALCULATION_ID = "calculation-stage-11";
const CALCULATION_FINGERPRINT = "a".repeat(64);
const SECTION_ID = "section-stage-11";
const CHECKLIST_IDS = second.CHECKLIST.map((item) => item.id);
const { DB_NAME, ProjectRepository } = global.YarnAIProjectSystem;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

async function completedRepositorySource(repository) {
  const project = await repository.createProject({ title: "Stage 11 e2e" });
  await repository.addCalculation(
    project.project_id,
    {
      schema_version: 1,
      kind: "CALCULATED_PROJECT",
      project_intent: {
        schemaVersion: 1,
        garmentType: "свитер",
        yarn: "меринос",
        gauge: { stitches: 20, widthCm: 10, rows: 30, heightCm: 10 },
      },
      calculation_input: {
        pattern_class: "constant_stitch_count",
        fabric_context: { yarn: "меринос" },
      },
      row_gauge: { rows: 30, height_cm: 10 },
      swatch: { context: {}, measurements: [] },
      warnings: [],
    },
    {
      status: "READY",
      axes: {
        width: {
          selected_candidate: {
            working_count: 10,
            actual_size_original_unit: 5,
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
    },
  );
  let inspection = await firstStepApi.ensureForProject(
    repository,
    project.project_id,
  );
  await firstStepApi.startForProject(
    repository,
    project.project_id,
    inspection.step.preparation_checklist
      .filter((item) => item.required)
      .map((item) => item.id),
  );
  await firstStepApi.changeCurrentCount(repository, project.project_id, 10);
  await firstStepApi.completeForProject(repository, project.project_id);
  await sectionApi.ensureForProject(repository, project.project_id);
  await sectionApi.answerForProject(
    repository,
    project.project_id,
    "knitting_mode",
    "flat",
  );
  await sectionApi.answerForProject(
    repository,
    project.project_id,
    "fabric_type",
    "stockinette",
  );
  await sectionApi.answerForProject(
    repository,
    project.project_id,
    "shaping_required",
    false,
  );
  await sectionApi.answerForProject(
    repository,
    project.project_id,
    "edge_stitches_included",
    true,
  );
  await sectionApi.answerForProject(
    repository,
    project.project_id,
    "target_mode",
    "rows",
  );
  await sectionApi.answerForProject(
    repository,
    project.project_id,
    "target_row_count",
    1,
  );
  await sectionApi.startForProject(repository, project.project_id);
  await sectionApi.completeCurrentRow(repository, project.project_id);
  await sectionApi.completeForProject(repository, project.project_id);
  await shapingApi.ensureForProject(repository, project.project_id);
  await shapingApi.answerForProject(
    repository,
    project.project_id,
    "shaping_required",
    true,
  );
  await shapingApi.answerForProject(
    repository,
    project.project_id,
    "target_stitch_count",
    6,
  );
  await shapingApi.answerForProject(
    repository,
    project.project_id,
    "total_rows",
    2,
  );
  await shapingApi.answerForProject(
    repository,
    project.project_id,
    "edge_stitches_mode",
    "without_edge_stitches",
  );
  await shapingApi.startForProject(repository, project.project_id);
  await shapingApi.completeCurrentRow(repository, project.project_id);
  await shapingApi.completeCurrentRow(repository, project.project_id);
  await shapingApi.completeForProject(repository, project.project_id);
  inspection = await bindOffApi.ensureForProject(
    repository,
    project.project_id,
  );
  await bindOffApi.startForProject(
    repository,
    project.project_id,
    inspection.bindOff.preparation_checklist.map((item) => item.id),
  );
  await bindOffApi.addForProject(
    repository,
    project.project_id,
    6,
    "e2e-first-bind-off",
  );
  await bindOffApi.completeForProject(repository, project.project_id, true);
  return project.project_id;
}

function shapingState(overrides = {}) {
  return {
    id: `first-simple-shaping:${SECTION_ID}`,
    project_id: PROJECT_ID,
    type: "FIRST_SIMPLE_SHAPING",
    version: 1,
    revision: 8,
    source_calculation_fingerprint: CALCULATION_FINGERPRINT,
    source_section_id: SECTION_ID,
    status: "completed",
    title: "Первое простое формирование",
    knitting_mode: "flat",
    starting_stitch_count: 10,
    target_stitch_count: 6,
    total_rows: 2,
    total_stitches_to_decrease: 4,
    decrease_events_count: 2,
    decrease_rows: [1, 2],
    edge_stitches_mode: "without_edge_stitches",
    current_row: 3,
    current_stitch_count: 6,
    completed_decrease_events: 2,
    warnings: [],
    blockers: [],
    answers: {
      shaping_required: true,
      target_stitch_count: 6,
      total_rows: 2,
      edge_stitches_mode: "without_edge_stitches",
    },
    created_at: "2026-07-31T09:00:00.000Z",
    updated_at: "2026-07-31T09:30:00.000Z",
    started_at: "2026-07-31T09:10:00.000Z",
    completed_at: "2026-07-31T09:30:00.000Z",
    ...overrides,
  };
}

function completedBindOff(shapingProgressRevision = 8) {
  const source = {
    projectId: PROJECT_ID,
    projectTitle: "Парная деталь",
    calculationId: CALCULATION_ID,
    calculationFingerprint: CALCULATION_FINGERPRINT,
    sectionId: SECTION_ID,
    progressRevision: shapingProgressRevision,
    stitchCount: 6,
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
      stitchCount: 6,
      knittingMode: "flat",
      partial: false,
      stepped: false,
      multipleRows: false,
      specialMethod: false,
      complexTechnique: false,
      methodKnown: true,
    },
  };
  const collecting = bindOffApi.createBindOff(
    source,
    "2026-07-31T09:31:00.000Z",
  );
  const ready = bindOffApi.prepareBindOff(
    collecting,
    bindOffApi.buildReadiness(source.readinessInput),
    "2026-07-31T09:32:00.000Z",
  );
  const started = bindOffApi.startBindOff(
    ready,
    bindOffApi.PREPARATION_CHECKLIST.map((item) => item.id),
    "2026-07-31T09:33:00.000Z",
  );
  const zero = bindOffApi.addBoundOffStitches(
    started,
    6,
    "first-bind-off-all",
    "2026-07-31T09:34:00.000Z",
  );
  return bindOffApi.completeBindOff(
    zero,
    true,
    "2026-07-31T09:35:00.000Z",
  );
}

function aggregateFixture() {
  const shaping = shapingState();
  assert.equal(shapingApi.isValidShaping(shaping), true);
  const bindOff = completedBindOff();
  assert.equal(bindOffApi.isValidBindOff(bindOff), true);
  const shapingProgress = {
    progress_id: "progress-shaping",
    project_id: PROJECT_ID,
    calculation_id: CALCULATION_ID,
    kind: "FIRST_SIMPLE_SHAPING",
    epoch: 1,
    revision: 8,
    state: shaping,
  };
  const bindProgress = {
    progress_id: "progress-bind-off",
    project_id: PROJECT_ID,
    calculation_id: CALCULATION_ID,
    kind: "FIRST_BIND_OFF",
    epoch: 1,
    revision: 5,
    state: bindOff,
  };
  return {
    project: {
      project_id: PROJECT_ID,
      active_calculation_id: CALCULATION_ID,
      title: "Парная деталь",
      revision: 21,
      current_stage: "first_piece_completed",
    },
    calculations: [
      {
        calculation_id: CALCULATION_ID,
        project_id: PROJECT_ID,
        fingerprint: CALCULATION_FINGERPRINT,
      },
    ],
    progress: [shapingProgress, bindProgress],
    operations: [
      {
        kind: "FIRST_SIMPLE_SHAPING_COMPLETED",
        payload: {
          progress_kind: "FIRST_SIMPLE_SHAPING",
          progress_id: shapingProgress.progress_id,
          progress_revision: shapingProgress.revision,
          progress_state: clone(shaping),
        },
      },
      {
        kind: "FIRST_BIND_OFF_COMPLETED",
        payload: {
          progress_kind: "FIRST_BIND_OFF",
          progress_id: bindProgress.progress_id,
          progress_revision: bindProgress.revision,
          progress_state: clone(bindOff),
        },
      },
    ],
  };
}

function sourceFixture() {
  const result = second.buildSourceSnapshot(aggregateFixture());
  assert.equal(result.ok, true);
  return result.source;
}

function readyFixture() {
  return second.createProgress(sourceFixture(), NOW);
}

function startedFixture() {
  return second.startProgress(
    readyFixture(),
    CHECKLIST_IDS,
    "start-second",
    "2026-07-31T10:01:00.000Z",
  );
}

function castOnFixture() {
  return second.confirmCastOn(
    startedFixture(),
    10,
    "cast-on-ten",
    "2026-07-31T10:02:00.000Z",
  );
}

function shapedFixture() {
  let progress = castOnFixture();
  for (const event of progress.plan.shapingEvents) {
    progress = second.completeShapingEvent(
      progress,
      event.id,
      `shape-${event.index}`,
    );
  }
  return progress;
}

function bindOffFixture() {
  return second.startBindOff(
    shapedFixture(),
    "start-bind-off",
  );
}

function completedFixture() {
  const zero = second.addBindOff(
    bindOffFixture(),
    6,
    "close-all",
  );
  return second.completeProgress(
    zero,
    true,
    "secure-last",
  );
}

function addSecondProgress(aggregate, state, revision = 2) {
  aggregate.progress.push({
    progress_id: "progress-second",
    project_id: PROJECT_ID,
    calculation_id: CALCULATION_ID,
    kind: second.PROGRESS_KIND,
    epoch: 1,
    revision,
    state,
  });
  return aggregate;
}

class MemoryRepository {
  constructor(aggregate) {
    this.aggregate = clone(aggregate);
  }

  async getProject() {
    return clone(this.aggregate);
  }

  async ensureCalculationProgress(projectId, calculationId, kind, state) {
    const existing = this.aggregate.progress.find(
      (entry) => entry.kind === kind,
    );
    if (existing) {
      return clone(existing);
    }
    const progress = {
      progress_id: "progress-second",
      project_id: projectId,
      calculation_id: calculationId,
      kind,
      epoch: 1,
      revision: 1,
      state: clone(state),
    };
    this.aggregate.progress.push(progress);
    this.aggregate.project.revision += 1;
    return clone(progress);
  }

  async updateCalculationProgress(
    projectId,
    calculationId,
    kind,
    state,
    options,
  ) {
    const progress = this.aggregate.progress.find(
      (entry) =>
        entry.kind === kind &&
        entry.project_id === projectId &&
        entry.calculation_id === calculationId,
    );
    assert.equal(progress.revision, options.baseProgressRevision);
    progress.revision += 1;
    progress.state = clone(state);
    this.aggregate.project.current_stage = options.projectStage;
    this.aggregate.project.revision += 1;
    return {
      project: clone(this.aggregate.project),
      progress: clone(progress),
    };
  }
}

test("1 valid completed source creates ready progress", () => {
  const progress = readyFixture();
  assert.equal(progress.type, "SECOND_IDENTICAL_PIECE");
  assert.equal(progress.status, "ready");
  assert.equal(second.isValidProgress(progress), true);
});

test("2 unfinished first piece is blocked", () => {
  const aggregate = aggregateFixture();
  aggregate.progress.find(
    (entry) => entry.kind === "FIRST_BIND_OFF",
  ).state.status = "in_progress";
  const inspection = second.inspectAggregate(aggregate);
  assert.equal(inspection.state, "blocked");
  assert.equal(inspection.code, "BIND_OFF_NOT_COMPLETED");
  const unfinishedStage = aggregateFixture();
  unfinishedStage.project.current_stage = "first_bind_off_in_progress";
  assert.equal(
    second.inspectAggregate(unfinishedStage).code,
    "FIRST_PIECE_NOT_COMPLETED",
  );
  const invalidStage = aggregateFixture();
  invalidStage.project.current_stage = "calculation_completed";
  assert.equal(
    second.inspectAggregate(invalidStage).code,
    "INVALID_PROJECT_STAGE",
  );
});

test("3 missing shaping is blocked", () => {
  const aggregate = aggregateFixture();
  aggregate.progress = aggregate.progress.filter(
    (entry) => entry.kind !== "FIRST_SIMPLE_SHAPING",
  );
  assert.equal(
    second.inspectAggregate(aggregate).code,
    "SHAPING_PROGRESS_MISSING",
  );
});

test("4 damaged shaping is blocked", () => {
  const aggregate = aggregateFixture();
  aggregate.progress.find(
    (entry) => entry.kind === "FIRST_SIMPLE_SHAPING",
  ).state.decrease_rows = [2, 1];
  assert.equal(
    second.inspectAggregate(aggregate).code,
    "SHAPING_PLAN_DAMAGED",
  );
});

test("5 missing bind-off is blocked", () => {
  const aggregate = aggregateFixture();
  aggregate.progress = aggregate.progress.filter(
    (entry) => entry.kind !== "FIRST_BIND_OFF",
  );
  assert.equal(
    second.inspectAggregate(aggregate).code,
    "BIND_OFF_PROGRESS_MISSING",
  );
});

test("6 damaged bind-off is blocked", () => {
  const aggregate = aggregateFixture();
  aggregate.progress.find(
    (entry) => entry.kind === "FIRST_BIND_OFF",
  ).state.completed_actions[0].amount = -1;
  assert.equal(
    second.inspectAggregate(aggregate).code,
    "BIND_OFF_PROGRESS_DAMAGED",
  );
});

test("7 project ID conflict is blocked", () => {
  const aggregate = aggregateFixture();
  aggregate.progress.find(
    (entry) => entry.kind === "FIRST_BIND_OFF",
  ).state.project_id = "other-project";
  assert.equal(
    second.inspectAggregate(aggregate).code,
    "SOURCE_PROJECT_ID_CONFLICT",
  );
});

test("8 section conflict is blocked", () => {
  const aggregate = aggregateFixture();
  aggregate.progress.find(
    (entry) => entry.kind === "FIRST_BIND_OFF",
  ).state.section_id = "other-section";
  assert.equal(
    second.inspectAggregate(aggregate).code,
    "SOURCE_SECTION_CONFLICT",
  );
});

test("9 fingerprint conflict is blocked", () => {
  const aggregate = aggregateFixture();
  aggregate.progress.find(
    (entry) => entry.kind === "FIRST_SIMPLE_SHAPING",
  ).state.source_calculation_fingerprint = "other-fingerprint";
  assert.equal(
    second.inspectAggregate(aggregate).code,
    "SOURCE_FINGERPRINT_CONFLICT",
  );
});

test("10 revision conflict is blocked", () => {
  const aggregate = aggregateFixture();
  aggregate.progress.find(
    (entry) => entry.kind === "FIRST_BIND_OFF",
  ).state.source_progress_revision += 1;
  assert.equal(
    second.inspectAggregate(aggregate).code,
    "SOURCE_REVISION_CONFLICT",
  );
});

test("11 stitch count conflict is blocked", () => {
  const aggregate = aggregateFixture();
  const shapingProgress = aggregate.progress.find(
    (entry) => entry.kind === "FIRST_SIMPLE_SHAPING",
  );
  const changed = shapingState({
    target_stitch_count: 4,
    total_rows: 3,
    total_stitches_to_decrease: 6,
    decrease_events_count: 3,
    decrease_rows: [1, 2, 3],
    current_row: 4,
    current_stitch_count: 4,
    completed_decrease_events: 3,
    answers: {
      shaping_required: true,
      target_stitch_count: 4,
      total_rows: 3,
      edge_stitches_mode: "without_edge_stitches",
    },
  });
  shapingProgress.state = changed;
  aggregate.operations[0].payload.progress_state = clone(changed);
  assert.equal(
    second.inspectAggregate(aggregate).code,
    "SOURCE_STITCH_COUNT_CONFLICT",
  );
});

test("12 size change request is blocked", () => {
  assert.equal(
    second.inspectAggregate(aggregateFixture(), { sizeChanged: true }).code,
    "SIZE_CHANGE_UNSUPPORTED",
  );
  assert.equal(
    second.inspectAggregate(aggregateFixture(), { identical: false }).code,
    "NON_IDENTICAL_PIECE_REQUESTED",
  );
  assert.equal(
    second.inspectAggregate(aggregateFixture(), {
      unsupportedConstruction: true,
    }).code,
    "UNSUPPORTED_CONSTRUCTION",
  );
});

test("13 mirrored piece request is blocked", () => {
  assert.equal(
    second.inspectAggregate(aggregateFixture(), { mirrored: true }).code,
    "MIRRORED_PIECE_UNSUPPORTED",
  );
});

test("14 changed gauge is blocked", () => {
  assert.equal(
    second.inspectAggregate(aggregateFixture(), { gaugeChanged: true }).code,
    "GAUGE_CHANGED",
  );
});

test("15 changed needles are blocked", () => {
  assert.equal(
    second.inspectAggregate(aggregateFixture(), { needlesChanged: true }).code,
    "NEEDLES_CHANGED",
  );
});

test("16 changed yarn is blocked", () => {
  assert.equal(
    second.inspectAggregate(aggregateFixture(), { yarnChanged: true }).code,
    "YARN_CHANGED",
  );
});

test("17 complete checklist starts independent progress", () => {
  const progress = startedFixture();
  assert.equal(progress.status, "in_progress");
  assert.equal(progress.currentStep, "cast_on");
  assert.equal(progress.checklist.every((item) => item.confirmed), true);
});

test("18 repeated action_id is idempotent", () => {
  const started = startedFixture();
  const repeated = second.startProgress(
    started,
    CHECKLIST_IDS,
    "start-second",
  );
  assert.deepEqual(repeated, started);
});

test("19 shaping events follow the immutable plan", () => {
  const shaped = shapedFixture();
  assert.deepEqual(shaped.completedShapingEvents, [
    "decrease-1-row-1",
    "decrease-2-row-2",
  ]);
  assert.equal(shaped.currentStitchCount, 6);
  assert.equal(shaped.plan.immutable, true);
});

test("20 shaping event cannot be skipped", () => {
  const progress = castOnFixture();
  assert.throws(
    () =>
      second.completeShapingEvent(
        progress,
        progress.plan.shapingEvents[1].id,
        "skip",
      ),
    (error) => error.code === "SHAPING_EVENT_OUT_OF_ORDER",
  );
});

test("21 shaping correction removes only the latest shaping action", () => {
  const shaped = shapedFixture();
  const corrected = second.undoLastShapingEvent(
    shaped,
    "undo-shape",
  );
  assert.equal(corrected.shapingHistory.length, 1);
  assert.equal(corrected.currentStitchCount, 8);
  assert.deepEqual(corrected.completedShapingEvents, ["decrease-1-row-1"]);
});

test("22 closing one stitch works", () => {
  const progress = second.addBindOff(bindOffFixture(), 1, "close-one");
  assert.equal(progress.currentStitchCount, 5);
});

test("23 closing five stitches works", () => {
  const progress = second.addBindOff(bindOffFixture(), 5, "close-five");
  assert.equal(progress.currentStitchCount, 1);
});

test("24 closing a custom positive amount works", () => {
  const progress = second.addBindOff(bindOffFixture(), 3, "close-three");
  assert.equal(progress.currentStitchCount, 3);
});

test("25 zero and negative bind-off amounts are rejected", () => {
  for (const amount of [0, -1]) {
    assert.throws(
      () => second.addBindOff(bindOffFixture(), amount, `amount-${amount}`),
      (error) => error.code === "INVALID_BIND_OFF_AMOUNT",
    );
  }
});

test("26 cannot close more stitches than remain", () => {
  assert.throws(
    () => second.addBindOff(bindOffFixture(), 7, "too-many"),
    (error) => error.code === "BIND_OFF_AMOUNT_EXCEEDS_REMAINING",
  );
});

test("27 repeated bind-off action_id is idempotent", () => {
  const once = second.addBindOff(bindOffFixture(), 1, "same-close");
  const repeated = second.addBindOff(once, 1, "same-close");
  assert.deepEqual(repeated, once);
});

test("28 bind-off correction restores only the latest amount", () => {
  const one = second.addBindOff(bindOffFixture(), 1, "first-close");
  const four = second.addBindOff(one, 3, "second-close");
  const corrected = second.undoLastBindOff(four, "undo-close");
  assert.equal(corrected.currentStitchCount, 5);
  assert.deepEqual(
    corrected.bindOffHistory.map((entry) => entry.actionId),
    ["first-close"],
  );
});

test("29 zero stitches does not auto-complete", () => {
  const zero = second.addBindOff(bindOffFixture(), 6, "close-zero");
  assert.equal(zero.currentStitchCount, 0);
  assert.equal(zero.status, "in_progress");
  assert.equal(zero.currentStep, "secure_last_stitch");
  assert.equal(zero.completedAt, null);
});

test("30 explicit last stitch confirmation completes the piece", () => {
  const completed = completedFixture();
  assert.equal(completed.status, "completed");
  assert.equal(completed.lastStitchSecured, true);
  assert.ok(completed.completedAt);
  assert.deepEqual(
    second.completeProgress(
      completed,
      true,
      "secure-last",
    ),
    completed,
  );
});

test("31 completed repository action sets second_piece_completed", async () => {
  const repository = new MemoryRepository(aggregateFixture());
  let inspection = await second.ensureForProject(repository, PROJECT_ID);
  inspection = await second.startForProject(
    repository,
    PROJECT_ID,
    CHECKLIST_IDS,
    "repo-start",
  );
  inspection = await second.confirmCastOnForProject(
    repository,
    PROJECT_ID,
    10,
    "repo-cast-on",
  );
  for (const event of inspection.secondPiece.plan.shapingEvents) {
    inspection = await second.completeShapingEventForProject(
      repository,
      PROJECT_ID,
      event.id,
      `repo-${event.id}`,
    );
  }
  await second.startBindOffForProject(
    repository,
    PROJECT_ID,
    "repo-bind-start",
  );
  await second.addBindOffForProject(
    repository,
    PROJECT_ID,
    6,
    "repo-bind-all",
  );
  await second.completeForProject(
    repository,
    PROJECT_ID,
    true,
    "repo-complete",
  );
  assert.equal(
    (await repository.getProject()).project.current_stage,
    "second_piece_completed",
  );
});

test("32 completed progress rejects further actions", () => {
  const completed = completedFixture();
  assert.throws(
    () => second.addBindOff(completed, 1, "late"),
    (error) => error.code === "SECOND_PIECE_COMPLETED",
  );
  assert.throws(
    () => second.undoLastBindOff(completed, "late-undo"),
    (error) => error.code === "SECOND_PIECE_COMPLETED",
  );
});

test("33 reload restores in_progress exactly", () => {
  const progress = second.addBindOff(bindOffFixture(), 1, "saved-one");
  assert.deepEqual(
    second.restoreProgress(JSON.stringify(progress)),
    progress,
  );
});

test("34 reload restores completed exactly", () => {
  const progress = completedFixture();
  assert.deepEqual(
    second.restoreProgress(JSON.stringify(progress)),
    progress,
  );
});

test("35 damaged history becomes blocked", () => {
  const aggregate = addSecondProgress(
    aggregateFixture(),
    startedFixture(),
  );
  aggregate.progress.find(
    (entry) => entry.kind === second.PROGRESS_KIND,
  ).state.actionHistory.push(
    clone(
      aggregate.progress.find(
        (entry) => entry.kind === second.PROGRESS_KIND,
      ).state.actionHistory[0],
    ),
  );
  aggregate.project.current_stage = "second_piece_in_progress";
  const inspection = second.inspectAggregate(aggregate);
  assert.equal(inspection.state, "blocked");
  assert.equal(inspection.code, "SECOND_PIECE_DATA_DAMAGED");
  const sourceHistoryDamage = aggregateFixture();
  sourceHistoryDamage.operations.pop();
  assert.equal(
    second.inspectAggregate(sourceHistoryDamage).code,
    "SOURCE_ACTION_HISTORY_DAMAGED",
  );
});

test("36 contradictory completed state becomes blocked", () => {
  const aggregate = addSecondProgress(
    aggregateFixture(),
    completedFixture(),
  );
  aggregate.progress.find(
    (entry) => entry.kind === second.PROGRESS_KIND,
  ).state.lastStitchSecured = false;
  aggregate.project.current_stage = "second_piece_completed";
  assert.equal(second.inspectAggregate(aggregate).state, "blocked");
  const sourceContradiction = aggregateFixture();
  const sourceBindOff = sourceContradiction.progress.find(
    (entry) => entry.kind === "FIRST_BIND_OFF",
  ).state;
  sourceBindOff.current_stitch_count = 1;
  sourceBindOff.remaining_stitch_count = 1;
  assert.equal(
    second.inspectAggregate(sourceContradiction).code,
    "SOURCE_COMPLETED_STATE_CONFLICT",
  );
});

test("37 identical source produces identical fingerprint", () => {
  const source = sourceFixture();
  assert.equal(
    second.planFingerprint(source),
    second.planFingerprint(clone(source)),
  );
});

test("38 significant source change changes fingerprint", () => {
  const source = sourceFixture();
  const changed = clone(source);
  changed.bindOff.finalMethod = "different-method";
  assert.notEqual(
    second.planFingerprint(source),
    second.planFingerprint(changed),
  );
  const existing = addSecondProgress(aggregateFixture(), readyFixture());
  assert.equal(
    second.inspectAggregate(existing, {
      expectedFingerprint: "different-fingerprint",
    }).code,
    "SECOND_PIECE_DIFFERENT_FINGERPRINT",
  );
});

test("39 working on second piece never mutates first piece", () => {
  const aggregate = aggregateFixture();
  const before = clone(aggregate.progress);
  let progress = readyFixture();
  progress = second.startProgress(progress, CHECKLIST_IDS, "independent-start");
  progress = second.confirmCastOn(progress, 10, "independent-cast-on");
  second.completeShapingEvent(
    progress,
    progress.plan.shapingEvents[0].id,
    "independent-shaping",
  );
  assert.deepEqual(aggregate.progress, before);
});

test("40 first and second piece histories are independent", () => {
  const aggregate = aggregateFixture();
  const firstHistory = clone(
    aggregate.progress.find(
      (entry) => entry.kind === "FIRST_BIND_OFF",
    ).state.completed_actions,
  );
  const secondProgress = second.addBindOff(
    bindOffFixture(),
    1,
    "second-history-only",
  );
  assert.deepEqual(
    aggregate.progress.find(
      (entry) => entry.kind === "FIRST_BIND_OFF",
    ).state.completed_actions,
    firstHistory,
  );
  assert.notStrictEqual(
    secondProgress.bindOffHistory,
    aggregate.progress.find(
      (entry) => entry.kind === "FIRST_BIND_OFF",
    ).state.completed_actions,
  );
});

test("41 project-system persists Stage 11 separately across repository reload", async () => {
  await deleteDatabase();
  const firstRepository = new ProjectRepository();
  const projectId = await completedRepositorySource(firstRepository);
  let inspection = await second.ensureForProject(firstRepository, projectId);
  inspection = await second.startForProject(
    firstRepository,
    projectId,
    CHECKLIST_IDS,
    "e2e-second-start",
  );
  await second.confirmCastOnForProject(
    firstRepository,
    projectId,
    inspection.secondPiece.plan.initialStitchCount,
    "e2e-second-cast-on",
  );
  await firstRepository.close();

  const reopened = new ProjectRepository();
  const restored = await second.loadForProject(reopened, projectId);
  const aggregate = await reopened.getProject(projectId);
  assert.equal(restored.secondPiece.status, "in_progress");
  assert.equal(restored.secondPiece.currentStep, "shaping");
  assert.equal(aggregate.project.current_stage, "second_piece_in_progress");
  assert.equal(
    aggregate.progress.find(
      (entry) => entry.kind === "FIRST_SIMPLE_SHAPING",
    ).state.status,
    "completed",
  );
  assert.equal(
    aggregate.progress.find(
      (entry) => entry.kind === "FIRST_BIND_OFF",
    ).state.status,
    "completed",
  );
  await reopened.close();
  await deleteDatabase();
});
