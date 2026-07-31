"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const preparationApi = require(
  "../src/yarnai/static/first-assembly-preparation.js"
);
const join = require("../src/yarnai/static/first-assembly-join.js");

const NOW = "2026-07-31T12:00:00.000Z";
const PROJECT_ID = "project-stage-12b";
const { DB_NAME, ProjectRepository } = global.YarnAIProjectSystem;
let repositories = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function at(minute) {
  return `2026-07-31T12:${String(minute).padStart(2, "0")}:00.000Z`;
}

function piece(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    projectRevision: 20,
    calculationFingerprint: "c".repeat(64),
    revision: 8,
    sourceRevision: { shaping: 8, bindOff: 5 },
    fingerprint: "piece-fingerprint",
    sourceFingerprint: "shared-source-fingerprint",
    completed: true,
    completedAt: "2026-07-31T11:00:00.000Z",
    section: "front",
    sectionLabel: "Перед",
    initialStitchCount: 10,
    finalStitchCount: 4,
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
      initialStitchCount: 4,
    },
    identical: true,
    valid: true,
    ...overrides,
  };
}

function preparationInput(totalUnits = 4, overrides = {}) {
  const input = {
    project: {
      projectId: PROJECT_ID,
      revision: 24,
      currentStage: "second_piece_completed",
    },
    calculationFingerprint: "c".repeat(64),
    firstPiece: piece({
      fingerprint: "first-piece-fingerprint",
      finalStitchCount: totalUnits,
      completedAt: "2026-07-31T10:00:00.000Z",
    }),
    secondPiece: piece({
      fingerprint: "second-piece-fingerprint",
      finalStitchCount: totalUnits,
    }),
    requirements: {
      operation: preparationApi.SUPPORTED_OPERATION,
      mirrored: false,
      straightEdge: true,
      requiresEase: false,
      firstEdgeLength: totalUnits,
      secondEdgeLength: totalUnits,
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

function readyPreparation(totalUnits = 4) {
  let preparation = preparationApi.createProgress(
    preparationInput(totalUnits),
    at(0),
  );
  preparationApi.USER_CHECKLIST_IDS.forEach((id, index) => {
    preparation = preparationApi.confirmChecklistItem(
      preparation,
      id,
      at(index + 1),
    );
  });
  return preparation;
}

function joinInput(preparation = readyPreparation()) {
  return {
    project: {
      projectId: preparation.projectId,
      revision: 30,
      currentStage: "assembly_preparation_ready",
    },
    preparation,
  };
}

function readyJoin(totalUnits = 4) {
  return join.createProgress(
    joinInput(readyPreparation(totalUnits)),
    at(4),
  );
}

function startedJoin(totalUnits = 4) {
  let progress = readyJoin(totalUnits);
  join.USER_CHECKLIST_IDS.forEach((id, index) => {
    progress = join.confirmChecklistItem(progress, id, at(5 + index));
  });
  return join.startJoin(progress, at(8));
}

function completeEdge(totalUnits = 4) {
  let progress = startedJoin(totalUnits);
  for (let index = 0; index < totalUnits; index += 1) {
    progress = join.completeUnit(progress, at(9 + index));
  }
  return progress;
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

afterEach(async () => {
  await Promise.all(repositories.map((entry) => entry.close()));
  repositories = [];
  await deleteDatabase();
});

test("1 creates FIRST_ASSEMBLY_JOIN from ready preparation", () => {
  const progress = readyJoin();
  assert.equal(progress.type, "FIRST_ASSEMBLY_JOIN");
  assert.equal(progress.sourceSnapshot.preparationStatus, "ready");
  assert.equal(join.isValidProgress(progress), true);
});

test("2 remains ready before start", () => {
  const progress = readyJoin();
  assert.equal(progress.status, "ready");
  assert.equal(progress.startedAt, null);
  assert.equal(progress.completedUnits, 0);
});

test("3 checklist blocks start", () => {
  assert.throws(() => join.startJoin(readyJoin(), at(5)), {
    code: "CHECKLIST_INCOMPLETE",
  });
});

test("4 start changes ready to in_progress", () => {
  const progress = startedJoin();
  assert.equal(progress.status, "in_progress");
  assert.equal(progress.startedAt, at(8));
  assert.equal(progress.completedUnits, 0);
});

test("5 complete_unit increments progress", () => {
  const progress = join.completeUnit(startedJoin(), at(9));
  assert.equal(progress.completedUnits, 1);
  assert.equal(progress.remainingUnits, 3);
});

test("6 complete_unit never exceeds totalUnits", () => {
  const full = completeEdge(2);
  const unchanged = join.completeUnit(full, at(12));
  assert.equal(unchanged.completedUnits, 2);
  assert.equal(unchanged.revision, full.revision);
});

test("7 undo reduces active progress", () => {
  const one = join.completeUnit(startedJoin(), at(9));
  const undone = join.undoLastUnit(one, at(10));
  assert.equal(undone.completedUnits, 0);
  assert.equal(undone.remainingUnits, 4);
  assert.equal(undone.joinHistory.at(-1).type, "unit_undone");
});

test("8 repeat restores the last undone unit", () => {
  const one = join.completeUnit(startedJoin(), at(9));
  const undone = join.undoLastUnit(one, at(10));
  const repeated = join.repeatLastUnit(undone, at(11));
  assert.equal(repeated.completedUnits, 1);
  assert.equal(repeated.joinHistory.at(-1).type, "unit_repeated");
});

test("9 undo at zero is safe", () => {
  const progress = startedJoin();
  const unchanged = join.undoLastUnit(progress, at(9));
  assert.deepEqual(unchanged, progress);
});

test("10 repeat without an undone unit is safe", () => {
  const progress = startedJoin();
  const unchanged = join.repeatLastUnit(progress, at(9));
  assert.deepEqual(unchanged, progress);
});

test("11 reaching totalUnits does not complete the record", () => {
  const progress = completeEdge();
  assert.equal(progress.status, "in_progress");
  assert.equal(progress.remainingUnits, 0);
  assert.equal(progress.completedAt, null);
});

test("12 thread cannot be secured early", () => {
  assert.throws(
    () => join.confirmThreadSecured(startedJoin(), at(9)),
    { code: "EDGE_NOT_COMPLETE" },
  );
});

test("13 thread can be secured after the full edge", () => {
  const secured = join.confirmThreadSecured(completeEdge(), at(14));
  assert.equal(secured.threadSecured, true);
  assert.equal(secured.status, "in_progress");
});

test("14 thread confirmation can be undone", () => {
  const secured = join.confirmThreadSecured(completeEdge(), at(14));
  const unsecured = join.unconfirmThreadSecured(secured, at(15));
  assert.equal(unsecured.threadSecured, false);
});

test("15 join cannot complete without threadSecured", () => {
  assert.throws(() => join.completeJoin(completeEdge(), at(14)), {
    code: "JOIN_NOT_READY_TO_COMPLETE",
  });
});

test("16 explicit complete creates completed status", () => {
  const secured = join.confirmThreadSecured(completeEdge(), at(14));
  const completed = join.completeJoin(secured, at(15));
  assert.equal(completed.status, "completed");
});

test("17 explicit complete sets joinedAt and completedAt", () => {
  const secured = join.confirmThreadSecured(completeEdge(), at(14));
  const completed = join.completeJoin(secured, at(15));
  assert.equal(completed.joinedAt, at(15));
  assert.equal(completed.completedAt, at(15));
});

test("18 completed working actions are forbidden", () => {
  const secured = join.confirmThreadSecured(completeEdge(), at(14));
  const completed = join.completeJoin(secured, at(15));
  for (const operation of [
    join.completeUnit,
    join.undoLastUnit,
    join.repeatLastUnit,
    join.confirmThreadSecured,
    join.unconfirmThreadSecured,
    join.completeJoin,
  ]) {
    assert.throws(() => operation(completed, at(16)), {
      code: "FIRST_ASSEMBLY_JOIN_COMPLETED",
    });
  }
});

test("19 missing preparation is blocked", () => {
  const evaluation = join.evaluatePreparation({
    project: { projectId: PROJECT_ID },
  });
  assert.ok(
    evaluation.blockers.some(
      (entry) => entry.code === "PREPARATION_MISSING",
    ),
  );
});

test("20 preparation that is not ready is blocked", () => {
  const preparation = preparationApi.createProgress(
    preparationInput(),
    NOW,
  );
  const evaluation = join.evaluatePreparation(joinInput(preparation));
  assert.ok(
    evaluation.blockers.some(
      (entry) => entry.code === "PREPARATION_NOT_READY",
    ),
  );
});

test("21 blocked preparation blocks join creation", () => {
  const preparation = preparationApi.createProgress(
    preparationInput(4, {
      requirements: { mirrored: true },
    }),
    NOW,
  );
  const progress = join.createProgress(joinInput(preparation), at(1));
  assert.equal(progress.status, "blocked");
  assert.ok(
    progress.blockers.some(
      (entry) => entry.code === "PREPARATION_BLOCKED",
    ),
  );
  const unsupported = readyPreparation();
  unsupported.supportedOperation = "unsupported_join";
  const unsupportedProgress = join.createProgress(
    joinInput(unsupported),
    at(2),
  );
  assert.equal(unsupportedProgress.status, "blocked");
  assert.ok(
    unsupportedProgress.blockers.some(
      (entry) => entry.code === "UNSUPPORTED_OPERATION",
    ),
  );
});

test("22 preparation revision conflict blocks revalidation", () => {
  const preparation = readyPreparation();
  const progress = join.createProgress(joinInput(preparation), at(4));
  const changed = clone(preparation);
  changed.revision += 1;
  const blocked = join.revalidateProgress(
    progress,
    joinInput(changed),
    at(5),
  );
  assert.equal(
    blocked.blockers[0].code,
    "PREPARATION_REVISION_CONFLICT",
  );
});

test("23 preparation fingerprint conflict blocks revalidation", () => {
  const preparation = readyPreparation();
  const progress = join.createProgress(joinInput(preparation), at(4));
  const changed = clone(preparation);
  changed.sourceFingerprint = "changed";
  const blocked = join.revalidateProgress(
    progress,
    joinInput(changed),
    at(5),
  );
  assert.equal(
    blocked.blockers[0].code,
    "PREPARATION_FINGERPRINT_CONFLICT",
  );
});

test("24 another immutable snapshot is rejected", () => {
  const preparation = readyPreparation();
  const progress = join.createProgress(joinInput(preparation), at(4));
  progress.sourceSnapshot.section = "back";
  progress.sourceFingerprint = join.sourceFingerprint(
    progress.sourceSnapshot,
  );
  const blocked = join.revalidateProgress(
    progress,
    joinInput(preparation),
    at(5),
  );
  assert.equal(
    blocked.blockers[0].code,
    "EXISTING_SNAPSHOT_MISMATCH",
  );
});

test("25 invalid totalUnits becomes blocked", () => {
  const progress = readyJoin();
  progress.totalUnits = 0;
  const blocked = join.revalidateProgress(
    progress,
    joinInput(readyPreparation()),
    at(5),
  );
  assert.equal(blocked.blockers[0].code, "INVALID_TOTAL_UNITS");
});

test("26 damaged joinHistory becomes blocked", () => {
  const progress = join.completeUnit(startedJoin(), at(9));
  progress.joinHistory[0].unitNumber = 3;
  const blocked = join.revalidateProgress(
    progress,
    joinInput(readyPreparation()),
    at(10),
  );
  assert.equal(blocked.blockers[0].code, "JOIN_HISTORY_DAMAGED");
});

test("27 completedUnits above total becomes blocked", () => {
  const progress = readyJoin();
  progress.completedUnits = 5;
  progress.remainingUnits = -1;
  const blocked = join.revalidateProgress(
    progress,
    joinInput(readyPreparation()),
    at(5),
  );
  assert.equal(
    blocked.blockers[0].code,
    "COMPLETED_UNITS_EXCEEDS_TOTAL",
  );
});

test("28 threadSecured before the full edge becomes blocked", () => {
  const progress = startedJoin();
  progress.threadSecured = true;
  const blocked = join.revalidateProgress(
    progress,
    joinInput(readyPreparation()),
    at(9),
  );
  assert.equal(
    blocked.blockers[0].code,
    "THREAD_SECURED_BEFORE_EDGE_COMPLETE",
  );
});

test("29 contradictory completed state becomes blocked", () => {
  const progress = completeEdge();
  progress.status = "completed";
  progress.completedAt = at(14);
  progress.joinedAt = at(14);
  const blocked = join.revalidateProgress(
    progress,
    joinInput(readyPreparation()),
    at(15),
  );
  assert.equal(
    blocked.blockers[0].code,
    "COMPLETED_WITHOUT_THREAD_SECURED",
  );
});

test("30 source fingerprint is deterministic", () => {
  const snapshot = join.buildSourceSnapshot(
    joinInput(readyPreparation()),
  );
  assert.equal(
    join.sourceFingerprint(snapshot),
    join.sourceFingerprint(clone(snapshot)),
  );
});

test("31 significant snapshot changes alter the fingerprint", () => {
  const base = join.buildSourceSnapshot(
    joinInput(readyPreparation()),
  );
  const changes = [
    (value) => { value.preparationRevision += 1; },
    (value) => { value.preparationSourceFingerprint = "changed"; },
    (value) => { value.firstPiece.revision += 1; },
    (value) => { value.secondPiece.revision += 1; },
    (value) => { value.section = "back"; },
    (value) => { value.stitchCounts.final += 1; },
    (value) => { value.shapingFingerprint = "changed"; },
    (value) => { value.bindOffFingerprint = "changed"; },
    (value) => { value.operation = "changed"; },
    (value) => { value.joiningEdge.firstLength += 1; },
    (value) => { value.totalUnits += 1; },
    (value) => { value.unitType = "changed"; },
  ];
  const fingerprint = join.sourceFingerprint(base);
  for (const change of changes) {
    const changed = clone(base);
    change(changed);
    assert.notEqual(join.sourceFingerprint(changed), fingerprint);
  }
});

test("32 source snapshot is immutable after creation", () => {
  const preparation = readyPreparation();
  const progress = join.createProgress(joinInput(preparation), at(4));
  const saved = clone(progress.sourceSnapshot);
  preparation.sourceSnapshot.section = "mutated";
  preparation.sourceSnapshot.firstPiece.data.finalStitchCount = 99;
  assert.deepEqual(progress.sourceSnapshot, saved);
});

test("33 joinHistory remains append-only", () => {
  const one = join.completeUnit(startedJoin(), at(9));
  const prefix = clone(one.joinHistory);
  const undone = join.undoLastUnit(one, at(10));
  const repeated = join.repeatLastUnit(undone, at(11));
  assert.deepEqual(undone.joinHistory.slice(0, prefix.length), prefix);
  assert.deepEqual(repeated.joinHistory.slice(0, prefix.length), prefix);
  assert.equal(repeated.joinHistory.length, 3);
});

test("34 actionHistory audits all working transitions", () => {
  let progress = startedJoin(1);
  progress = join.completeUnit(progress, at(9));
  progress = join.undoLastUnit(progress, at(10));
  progress = join.repeatLastUnit(progress, at(11));
  progress = join.confirmThreadSecured(progress, at(12));
  progress = join.unconfirmThreadSecured(progress, at(13));
  progress = join.confirmThreadSecured(progress, at(14));
  progress = join.completeJoin(progress, at(15));
  const types = progress.actionHistory.map((entry) => entry.type);
  for (const type of [
    "record_created",
    "checklist_item_confirmed",
    "join_started",
    "unit_completed",
    "unit_undone",
    "unit_repeated",
    "thread_secured",
    "thread_unsecured",
    "join_completed",
  ]) {
    assert.ok(types.includes(type), type);
  }
});

test("35 revision increases for each real mutation", () => {
  let progress = readyJoin();
  const initial = progress.revision;
  progress = join.confirmChecklistItem(
    progress,
    join.USER_CHECKLIST_IDS[0],
    at(5),
  );
  assert.equal(progress.revision, initial + 1);
  const unchanged = join.confirmChecklistItem(
    progress,
    join.USER_CHECKLIST_IDS[0],
    at(6),
  );
  assert.equal(unchanged.revision, progress.revision);
});

test("36 reload preserves progress", () => {
  const progress = join.completeUnit(startedJoin(), at(9));
  const restored = join.restoreProgress(JSON.stringify(progress));
  assert.equal(restored.completedUnits, 1);
  assert.equal(restored.remainingUnits, 3);
});

test("37 reload preserves undo and repeat state", () => {
  const one = join.completeUnit(startedJoin(), at(9));
  const undone = join.undoLastUnit(one, at(10));
  const restored = join.restoreProgress(JSON.stringify(undone));
  assert.equal(
    join.deriveJoinHistory(
      restored.joinHistory,
      restored.totalUnits,
    ).repeatAvailable,
    true,
  );
  const repeated = join.repeatLastUnit(restored, at(11));
  assert.equal(repeated.completedUnits, 1);
});

test("38 reload of a full edge does not auto-complete", () => {
  const restored = join.restoreProgress(
    JSON.stringify(completeEdge()),
  );
  assert.equal(restored.status, "in_progress");
  assert.equal(restored.threadSecured, false);
  assert.equal(restored.completedAt, null);
});

test("39 reload preserves completed join unchanged", () => {
  const preparation = readyPreparation();
  let progress = join.createProgress(joinInput(preparation), at(4));
  join.USER_CHECKLIST_IDS.forEach((id, index) => {
    progress = join.confirmChecklistItem(progress, id, at(5 + index));
  });
  progress = join.startJoin(progress, at(8));
  for (let index = 0; index < progress.totalUnits; index += 1) {
    progress = join.completeUnit(progress, at(9 + index));
  }
  progress = join.confirmThreadSecured(progress, at(14));
  progress = join.completeJoin(progress, at(15));
  const restored = join.restoreProgress(JSON.stringify(progress));
  const revalidated = join.revalidateProgress(
    restored,
    joinInput(preparation),
    at(16),
  );
  assert.deepEqual(revalidated, restored);
});

test("40 repository end-to-end persists join and project stages", async () => {
  const repository = new ProjectRepository();
  repositories.push(repository);
  const project = await repository.createProject({
    title: "Stage 12B e2e",
  });
  const calculationResult = await repository.addCalculation(
    project.project_id,
    { schema_version: 1, kind: "CALCULATED_PROJECT" },
    {
      status: "READY",
      axes: {
        width: {
          selected_candidate: { working_count: 4 },
        },
      },
      warnings: [],
      errors: [],
      clarifications: [],
    },
  );
  const calculation = calculationResult.calculation;
  let aggregate = await repository.getProject(project.project_id);
  let preparation = readyPreparation(1);
  preparation.projectId = project.project_id;
  preparation.sourceSnapshot.projectId = project.project_id;
  preparation.sourceFingerprint = preparationApi.sourceFingerprint(
    preparation.sourceSnapshot,
  );
  await repository.ensureCalculationProgress(
    project.project_id,
    calculation.calculation_id,
    preparationApi.PROGRESS_KIND,
    { version: 0, initialized: false },
  );
  const placeholder = await repository.getCalculationProgress(
    project.project_id,
    calculation.calculation_id,
    preparationApi.PROGRESS_KIND,
  );
  await repository.updateCalculationProgress(
    project.project_id,
    calculation.calculation_id,
    preparationApi.PROGRESS_KIND,
    preparation,
    {
      baseProgressRevision: placeholder.revision,
      projectStage: "assembly_preparation_ready",
    },
  );
  let inspection = await join.ensureForProject(
    repository,
    project.project_id,
  );
  assert.equal(inspection.join.status, "ready");
  for (const id of join.USER_CHECKLIST_IDS) {
    inspection = await join.confirmForProject(
      repository,
      project.project_id,
      id,
    );
  }
  inspection = await join.startForProject(
    repository,
    project.project_id,
  );
  assert.equal(inspection.project.current_stage, "assembly_join_in_progress");
  inspection = await join.completeUnitForProject(
    repository,
    project.project_id,
  );
  inspection = await join.confirmThreadForProject(
    repository,
    project.project_id,
  );
  inspection = await join.completeForProject(
    repository,
    project.project_id,
  );
  assert.equal(inspection.join.status, "completed");
  assert.equal(inspection.project.current_stage, "assembly_join_completed");
  aggregate = await repository.getProject(project.project_id);
  assert.equal(
    aggregate.progress.filter(
      (entry) => entry.kind === join.PROGRESS_KIND,
    ).length,
    1,
  );
});
