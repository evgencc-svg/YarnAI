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
const secondApi = require("../src/yarnai/static/second-identical-piece.js");
const assembly = require(
  "../src/yarnai/static/first-assembly-preparation.js"
);

const NOW = "2026-07-31T12:00:00.000Z";
const LATER = "2026-07-31T12:01:00.000Z";
const PROJECT_ID = "project-stage-12a";
const CALCULATION_FINGERPRINT = "c".repeat(64);
const { DB_NAME, ProjectRepository } = global.YarnAIProjectSystem;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function piece(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    projectRevision: 20,
    calculationFingerprint: CALCULATION_FINGERPRINT,
    revision: 8,
    sourceRevision: { shaping: 8, bindOff: 5 },
    fingerprint: "piece-fingerprint",
    sourceFingerprint: "shared-source-fingerprint",
    completed: true,
    completedAt: "2026-07-31T11:00:00.000Z",
    section: "front",
    sectionLabel: "Перед",
    initialStitchCount: 10,
    finalStitchCount: 6,
    shapingPlanFingerprint: "shaping-plan-fingerprint",
    shapingPlan: {
      totalRows: 2,
      decreaseRows: [1, 2],
      stitchesPerEvent: 2,
    },
    bindOffMethod: "ordinary_sequential",
    bindOffFingerprint: "bind-off-fingerprint",
    bindOffData: {
      stitchInstructionMode: "match_last_row",
      initialStitchCount: 6,
    },
    identical: true,
    valid: true,
    ...overrides,
  };
}

function validInput(overrides = {}) {
  const input = {
    project: {
      projectId: PROJECT_ID,
      revision: 24,
      currentStage: "second_piece_completed",
    },
    calculationFingerprint: CALCULATION_FINGERPRINT,
    firstPiece: piece({
      fingerprint: "first-piece-fingerprint",
      completedAt: "2026-07-31T10:00:00.000Z",
    }),
    secondPiece: piece({
      fingerprint: "second-piece-fingerprint",
      completedAt: "2026-07-31T11:00:00.000Z",
    }),
    requirements: {
      operation: assembly.SUPPORTED_OPERATION,
      mirrored: false,
      straightEdge: true,
      requiresEase: false,
      firstEdgeLength: 6,
      secondEdgeLength: 6,
      constructionType: "simple_flat_piece",
    },
  };
  return {
    ...input,
    ...clone(overrides),
    project: { ...input.project, ...clone(overrides.project || {}) },
    requirements: {
      ...input.requirements,
      ...clone(overrides.requirements || {}),
    },
  };
}

function readyProgress() {
  let progress = assembly.createProgress(validInput(), NOW);
  assembly.USER_CHECKLIST_IDS.forEach((id, index) => {
    progress = assembly.confirmChecklistItem(
      progress,
      id,
      `2026-07-31T12:0${index + 1}:00.000Z`,
    );
  });
  return progress;
}

function blockerCodes(input) {
  return assembly.evaluateSources(input).blockers.map((item) => item.code);
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

async function repositoryWithPreparation() {
  const repository = new ProjectRepository();
  const project = await repository.createProject({ title: "Stage 12A" });
  const calculationResult = await repository.addCalculation(
    project.project_id,
    {
      schema_version: 1,
      kind: "CALCULATED_PROJECT",
      project_intent: {
        schemaVersion: 1,
        garmentType: "свитер",
        yarn: "меринос",
        gauge: {
          stitches: 20,
          widthCm: 10,
          rows: 30,
          heightCm: 10,
        },
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
        width: {
          ready_count: 20,
          base_length_cm: 10,
          density_per_cm: 2,
        },
      },
      warnings: [],
      errors: [],
      clarifications: [],
    },
  );
  const calculation = calculationResult.calculation;
  const aggregate = await repository.getProject(project.project_id);
  const currentCalculation = aggregate.calculations.find(
    (entry) => entry.calculation_id === calculation.calculation_id,
  );
  await repository.ensureCalculationProgress(
    project.project_id,
    calculation.calculation_id,
    assembly.PROGRESS_KIND,
    { version: 0, initialized: false },
  );
  const placeholder = await repository.getCalculationProgress(
    project.project_id,
    calculation.calculation_id,
    assembly.PROGRESS_KIND,
  );
  const input = validInput({
    project: {
      projectId: project.project_id,
      revision: aggregate.project.revision,
    },
  });
  input.firstPiece.projectId = project.project_id;
  input.secondPiece.projectId = project.project_id;
  input.calculationFingerprint = currentCalculation.fingerprint;
  input.firstPiece.calculationFingerprint = currentCalculation.fingerprint;
  input.secondPiece.calculationFingerprint = currentCalculation.fingerprint;
  const state = assembly.createProgress(input, NOW);
  await repository.updateCalculationProgress(
    project.project_id,
    calculation.calculation_id,
    assembly.PROGRESS_KIND,
    state,
    {
      baseProgressRevision: placeholder.revision,
      projectStage: "assembly_preparation_collecting",
      operationKind: "FIRST_ASSEMBLY_PREPARATION_CREATED",
    },
  );
  return { repository, project, calculation, state };
}

async function repositoryWithTwoCompletedPieces(repository) {
  const project = await repository.createProject({ title: "Stage 12A e2e" });
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
  for (const [question, answer] of [
    ["knitting_mode", "flat"],
    ["fabric_type", "stockinette"],
    ["shaping_required", false],
    ["edge_stitches_included", true],
    ["target_mode", "rows"],
    ["target_row_count", 1],
  ]) {
    await sectionApi.answerForProject(
      repository,
      project.project_id,
      question,
      answer,
    );
  }
  await sectionApi.startForProject(repository, project.project_id);
  await sectionApi.completeCurrentRow(repository, project.project_id);
  await sectionApi.completeForProject(repository, project.project_id);
  await shapingApi.ensureForProject(repository, project.project_id);
  for (const [question, answer] of [
    ["shaping_required", true],
    ["target_stitch_count", 6],
    ["total_rows", 2],
    ["edge_stitches_mode", "without_edge_stitches"],
  ]) {
    await shapingApi.answerForProject(
      repository,
      project.project_id,
      question,
      answer,
    );
  }
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
    "stage-12a-first-bind-off",
  );
  await bindOffApi.completeForProject(repository, project.project_id, true);
  inspection = await secondApi.ensureForProject(
    repository,
    project.project_id,
  );
  inspection = await secondApi.startForProject(
    repository,
    project.project_id,
    secondApi.CHECKLIST.map((item) => item.id),
    "stage-12a-second-start",
  );
  await secondApi.confirmCastOnForProject(
    repository,
    project.project_id,
    inspection.secondPiece.plan.initialStitchCount,
    "stage-12a-second-cast-on",
  );
  inspection = await secondApi.loadForProject(
    repository,
    project.project_id,
  );
  for (const event of inspection.secondPiece.plan.shapingEvents) {
    await secondApi.completeShapingEventForProject(
      repository,
      project.project_id,
      event.id,
      `stage-12a-${event.id}`,
    );
  }
  await secondApi.startBindOffForProject(
    repository,
    project.project_id,
    "stage-12a-second-bind-off-start",
  );
  await secondApi.addBindOffForProject(
    repository,
    project.project_id,
    6,
    "stage-12a-second-bind-off-all",
  );
  await secondApi.completeForProject(
    repository,
    project.project_id,
    true,
    "stage-12a-second-completed",
  );
  return project.project_id;
}

test("1 creates a separate preparation record from two completed pieces", () => {
  const progress = assembly.createProgress(validInput(), NOW);
  assert.equal(progress.type, "FIRST_ASSEMBLY_PREPARATION");
  assert.equal(progress.sourceSnapshot.firstPiece.type, "FIRST_FINISHED_PIECE");
  assert.equal(
    progress.sourceSnapshot.secondPiece.type,
    "SECOND_IDENTICAL_PIECE",
  );
  assert.equal(assembly.isValidProgress(progress), true);
});

test("2 remains collecting before user confirmations", () => {
  const progress = assembly.createProgress(validInput(), NOW);
  assert.equal(progress.status, "collecting");
  assert.equal(
    progress.checklist.filter((item) => item.source === "system")
      .every((item) => item.confirmed),
    true,
  );
});

test("3 becomes ready only after the complete checklist", () => {
  const progress = readyProgress();
  assert.equal(progress.status, "ready");
  assert.equal(progress.readyAt, "2026-07-31T12:03:00.000Z");
});

test("4 cannot become ready while blocked", () => {
  const input = validInput({
    requirements: { mirrored: true },
  });
  const progress = assembly.createProgress(input, NOW);
  assert.equal(progress.status, "blocked");
  assert.throws(
    () =>
      assembly.confirmChecklistItem(
        progress,
        assembly.USER_CHECKLIST_IDS[0],
        LATER,
      ),
    { code: "FIRST_ASSEMBLY_BLOCKED" },
  );
});

test("5 blocks a missing first piece", () => {
  const input = validInput();
  input.firstPiece = null;
  assert.ok(blockerCodes(input).includes("FIRST_PIECE_MISSING"));
});

test("6 blocks an unfinished first piece", () => {
  const input = validInput();
  input.firstPiece.completed = false;
  input.firstPiece.completedAt = null;
  assert.ok(blockerCodes(input).includes("FIRST_PIECE_NOT_COMPLETED"));
});

test("7 blocks a missing second piece", () => {
  const input = validInput();
  input.secondPiece = null;
  assert.ok(blockerCodes(input).includes("SECOND_PIECE_MISSING"));
});

test("8 blocks an unfinished second piece", () => {
  const input = validInput();
  input.secondPiece.completed = false;
  input.secondPiece.completedAt = null;
  assert.ok(blockerCodes(input).includes("SECOND_PIECE_NOT_COMPLETED"));
});

test("9 blocks different project ids", () => {
  const input = validInput();
  input.secondPiece.projectId = "another-project";
  assert.ok(blockerCodes(input).includes("PROJECT_ID_MISMATCH"));
});

test("10 blocks different sections", () => {
  const input = validInput();
  input.secondPiece.section = "back";
  assert.ok(blockerCodes(input).includes("SECTION_MISMATCH"));
});

test("11 blocks different stitch counts", () => {
  const input = validInput();
  input.secondPiece.finalStitchCount = 7;
  assert.ok(blockerCodes(input).includes("STITCH_COUNT_MISMATCH"));
});

test("12 blocks different shaping fingerprints", () => {
  const input = validInput();
  input.secondPiece.shapingPlanFingerprint = "another-shaping";
  assert.ok(
    blockerCodes(input).includes("SHAPING_FINGERPRINT_MISMATCH"),
  );
});

test("13 blocks different bind-off methods", () => {
  const input = validInput();
  input.secondPiece.bindOffMethod = "three_needle";
  assert.ok(blockerCodes(input).includes("BIND_OFF_METHOD_MISMATCH"));
});

test("14 blocks different bind-off fingerprints", () => {
  const input = validInput();
  input.secondPiece.bindOffFingerprint = "another-bind-off";
  assert.ok(
    blockerCodes(input).includes("BIND_OFF_FINGERPRINT_MISMATCH"),
  );
});

test("15 blocks a mirrored piece request", () => {
  assert.ok(
    blockerCodes(
      validInput({ requirements: { mirrored: true } }),
    ).includes("MIRRORED_PIECE_REQUESTED"),
  );
});

test("16 blocks a non-straight edge", () => {
  assert.ok(
    blockerCodes(
      validInput({ requirements: { straightEdge: false } }),
    ).includes("EDGE_NOT_STRAIGHT"),
  );
});

test("17 blocks different edge lengths", () => {
  assert.ok(
    blockerCodes(
      validInput({ requirements: { secondEdgeLength: 7 } }),
    ).includes("EDGE_LENGTH_MISMATCH"),
  );
});

test("18 blocks an unsupported construction", () => {
  assert.ok(
    blockerCodes(
      validInput({
        requirements: { constructionType: "set_in_sleeve" },
      }),
    ).includes("UNSUPPORTED_CONSTRUCTION"),
  );
});

test("19 source fingerprint is deterministic", () => {
  const snapshot = assembly.buildSourceSnapshot(validInput());
  assert.equal(
    assembly.sourceFingerprint(snapshot),
    assembly.sourceFingerprint(clone(snapshot)),
  );
});

test("20 significant source changes alter the fingerprint", () => {
  const base = assembly.buildSourceSnapshot(validInput());
  const changes = [
    (value) => { value.projectId = "other"; },
    (value) => { value.projectRevision += 1; },
    (value) => { value.calculationFingerprint = "d".repeat(64); },
    (value) => { value.initialStitchCount += 1; },
    (value) => { value.finalStitchCount += 1; },
    (value) => { value.shapingPlanFingerprint = "changed"; },
    (value) => { value.bindOffMethod = "changed"; },
    (value) => { value.bindOffFingerprint = "changed"; },
    (value) => { value.firstPiece.completedAt = LATER; },
    (value) => { value.constructionType = "straight_flat_piece"; },
    (value) => { value.requestedAssemblyOperation = "changed"; },
  ];
  const baseFingerprint = assembly.sourceFingerprint(base);
  for (const change of changes) {
    const changed = clone(base);
    change(changed);
    assert.notEqual(assembly.sourceFingerprint(changed), baseFingerprint);
  }
});

test("21 creation deep-copies the immutable source snapshot", () => {
  const input = validInput();
  const progress = assembly.createProgress(input, NOW);
  const snapshot = clone(progress.sourceSnapshot);
  input.firstPiece.section = "mutated";
  input.firstPiece.shapingPlan.decreaseRows.push(99);
  assert.deepEqual(progress.sourceSnapshot, snapshot);
});

test("22 existing source fingerprint conflict becomes blocked", () => {
  const progress = assembly.createProgress(validInput(), NOW);
  const changed = validInput();
  changed.secondPiece.completedAt = LATER;
  const blocked = assembly.revalidateProgress(progress, changed, LATER);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockers[0].code, "EXISTING_SNAPSHOT_MISMATCH");
  assert.deepEqual(blocked.sourceSnapshot, progress.sourceSnapshot);
});

test("23 damaged checklist becomes a stable blocked record", () => {
  const progress = assembly.createProgress(validInput(), NOW);
  progress.checklist.pop();
  const blocked = assembly.revalidateProgress(progress, validInput(), LATER);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockers[0].code, "CHECKLIST_DAMAGED");
  assert.equal(assembly.isValidProgress(blocked), true);
});

test("24 contradictory ready status becomes blocked", () => {
  const progress = assembly.createProgress(validInput(), NOW);
  progress.status = "ready";
  progress.readyAt = NOW;
  const blocked = assembly.revalidateProgress(progress, validInput(), LATER);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockers[0].code, "READY_STATUS_CONFLICT");
});

test("25 checklist confirmations survive serialization and reload", () => {
  let progress = assembly.createProgress(validInput(), NOW);
  progress = assembly.confirmChecklistItem(
    progress,
    assembly.USER_CHECKLIST_IDS[0],
    LATER,
  );
  const restored = assembly.restoreProgress(JSON.stringify(progress));
  assert.equal(
    restored.checklist.find(
      (item) => item.id === assembly.USER_CHECKLIST_IDS[0],
    ).confirmed,
    true,
  );
});

test("26 confirmations are cleared when source fingerprint changes", () => {
  let progress = assembly.createProgress(validInput(), NOW);
  progress = assembly.confirmChecklistItem(
    progress,
    assembly.USER_CHECKLIST_IDS[0],
    LATER,
  );
  const changed = validInput();
  changed.secondPiece.completedAt = "2026-07-31T11:01:00.000Z";
  const blocked = assembly.revalidateProgress(
    progress,
    changed,
    "2026-07-31T12:02:00.000Z",
  );
  assert.equal(
    blocked.checklist
      .filter((item) => item.source === "user")
      .every((item) => !item.confirmed),
    true,
  );
});

test("27 action history audits checklist and status transitions", () => {
  let progress = readyProgress();
  progress = assembly.unconfirmChecklistItem(
    progress,
    assembly.USER_CHECKLIST_IDS[0],
    "2026-07-31T12:04:00.000Z",
  );
  assert.deepEqual(
    progress.actionHistory.map((entry) => entry.type),
    [
      "record_created",
      "checklist_item_confirmed",
      "checklist_item_confirmed",
      "checklist_item_confirmed",
      "became_ready",
      "checklist_item_unconfirmed",
    ],
  );
});

test("28 revision increases once per significant model mutation", () => {
  let progress = assembly.createProgress(validInput(), NOW);
  assert.equal(progress.revision, 1);
  progress = assembly.confirmChecklistItem(
    progress,
    assembly.USER_CHECKLIST_IDS[0],
    LATER,
  );
  assert.equal(progress.revision, 2);
  const unchanged = assembly.confirmChecklistItem(
    progress,
    assembly.USER_CHECKLIST_IDS[0],
    "2026-07-31T12:02:00.000Z",
  );
  assert.equal(unchanged.revision, 2);
  const revalidated = assembly.revalidateProgress(
    unchanged,
    validInput(),
    "2026-07-31T12:03:00.000Z",
  );
  assert.equal(revalidated.revision, 3);
});

test("29 project repository stores Stage 12A as separate progress", async () => {
  await deleteDatabase();
  const { repository, project, calculation } =
    await repositoryWithPreparation();
  const stored = await repository.getCalculationProgress(
    project.project_id,
    calculation.calculation_id,
    assembly.PROGRESS_KIND,
  );
  const aggregate = await repository.getProject(project.project_id);
  assert.equal(stored.state.type, assembly.PROGRESS_KIND);
  assert.equal(stored.state.status, "collecting");
  assert.equal(
    aggregate.project.current_stage,
    "assembly_preparation_collecting",
  );
  await repository.close();
  await deleteDatabase();
});

test("30 repository reload preserves Stage 12A end to end", async () => {
  await deleteDatabase();
  const { repository, project, calculation } =
    await repositoryWithPreparation();
  await repository.close();
  const reopened = new ProjectRepository();
  const stored = await reopened.getCalculationProgress(
    project.project_id,
    calculation.calculation_id,
    assembly.PROGRESS_KIND,
  );
  assert.equal(assembly.restoreProgress(stored.state).status, "collecting");
  await reopened.close();
  await deleteDatabase();
});

test("31 source and model corruption blockers are stable", () => {
  const revision = validInput();
  revision.secondPiece.sourceRevision = { shaping: 9, bindOff: 5 };
  assert.ok(blockerCodes(revision).includes("SOURCE_REVISION_CONFLICT"));

  const source = validInput();
  source.secondPiece.sourceFingerprint = "changed";
  assert.ok(blockerCodes(source).includes("SOURCE_FINGERPRINT_CONFLICT"));

  const identical = validInput();
  identical.secondPiece.identical = false;
  assert.ok(blockerCodes(identical).includes("PIECES_NOT_IDENTICAL"));

  const history = assembly.createProgress(validInput(), NOW);
  history.actionHistory = [];
  const blocked = assembly.revalidateProgress(history, validInput(), LATER);
  assert.equal(blocked.blockers[0].code, "ACTION_HISTORY_DAMAGED");
});

test("32 two real completed pieces prepare, become ready, and reload", async () => {
  await deleteDatabase();
  const repository = new ProjectRepository();
  const projectId = await repositoryWithTwoCompletedPieces(repository);
  let inspection = await assembly.ensureForProject(repository, projectId);
  assert.equal(inspection.preparation.status, "collecting");
  for (const itemId of assembly.USER_CHECKLIST_IDS) {
    inspection = await assembly.confirmForProject(
      repository,
      projectId,
      itemId,
    );
  }
  assert.equal(inspection.preparation.status, "ready");
  assert.equal(
    inspection.project.current_stage,
    "assembly_preparation_ready",
  );
  await repository.close();

  const reopened = new ProjectRepository();
  inspection = await assembly.loadForProject(reopened, projectId);
  assert.equal(inspection.preparation.status, "ready");
  assert.equal(inspection.state, "ready");
  await reopened.close();
  await deleteDatabase();
});
