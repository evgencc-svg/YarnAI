"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const preparationApi = require(
  "../src/yarnai/static/first-assembly-preparation.js"
);
const joinApi = require(
  "../src/yarnai/static/first-assembly-join.js"
);
const inspectionApi = require(
  "../src/yarnai/static/first-assembly-inspection.js"
);

const PROJECT_ID = "project-stage-12c";
const { DB_NAME, ProjectRepository } = global.YarnAIProjectSystem;
let repositories = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function at(minute) {
  return `2026-07-31T13:${String(minute).padStart(2, "0")}:00.000Z`;
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
    finalStitchCount: 3,
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
      initialStitchCount: 3,
    },
    identical: true,
    valid: true,
    ...overrides,
  };
}

function preparationInput(totalUnits = 3, overrides = {}) {
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
      sectionLabel: "Спинка",
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

function completedPreparation(totalUnits = 3) {
  let progress = preparationApi.createProgress(
    preparationInput(totalUnits),
    at(0),
  );
  preparationApi.USER_CHECKLIST_IDS.forEach((id, index) => {
    progress = preparationApi.confirmChecklistItem(
      progress,
      id,
      at(index + 1),
    );
  });
  return progress;
}

function completedJoin(
  totalUnits = 3,
  preparation = completedPreparation(totalUnits),
) {
  let progress = joinApi.createProgress(
    {
      project: {
        projectId: PROJECT_ID,
        revision: 30,
        currentStage: "assembly_preparation_ready",
      },
      preparation,
    },
    at(4),
  );
  joinApi.USER_CHECKLIST_IDS.forEach((id, index) => {
    progress = joinApi.confirmChecklistItem(
      progress,
      id,
      at(5 + index),
    );
  });
  progress = joinApi.startJoin(progress, at(8));
  for (let index = 0; index < totalUnits; index += 1) {
    progress = joinApi.completeUnit(progress, at(9 + index));
  }
  progress = joinApi.confirmThreadSecured(progress, at(13));
  return joinApi.completeJoin(progress, at(14));
}

function validInput(totalUnits = 3) {
  const preparation = completedPreparation(totalUnits);
  const join = completedJoin(totalUnits, preparation);
  return {
    project: {
      projectId: PROJECT_ID,
      revision: 40,
      currentStage: "assembly_join_completed",
    },
    preparation,
    join,
  };
}

function readyInspection(totalUnits = 3) {
  return inspectionApi.createProgress(validInput(totalUnits), at(15));
}

function startedInspection(totalUnits = 3) {
  return inspectionApi.startInspection(
    readyInspection(totalUnits),
    at(16),
  );
}

function checkedInspection(totalUnits = 3) {
  let progress = startedInspection(totalUnits);
  inspectionApi.USER_CHECKLIST_IDS.forEach((id, index) => {
    progress = inspectionApi.checkItem(
      progress,
      id,
      at(17 + index),
    );
  });
  return inspectionApi.confirmNoIssue(progress, at(23));
}

function completedInspection(totalUnits = 3) {
  return inspectionApi.completeInspection(
    checkedInspection(totalUnits),
    at(24),
  );
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("database deletion blocked"));
  });
}

afterEach(async () => {
  await Promise.all(repositories.map((entry) => entry.close()));
  repositories = [];
  await deleteDatabase();
});

test("1 project is required", () => {
  const input = validInput();
  delete input.project;
  const progress = inspectionApi.createProgress(input, at(15));
  assert.equal(progress.status, "blocked");
  assert.ok(
    progress.blockers.some((entry) => entry.code === "PROJECT_MISSING"),
  );
});

test("2 preparation is required", () => {
  const input = validInput();
  delete input.preparation;
  const progress = inspectionApi.createProgress(input, at(15));
  assert.equal(progress.status, "blocked");
  assert.ok(
    progress.blockers.some(
      (entry) => entry.code === "PREPARATION_MISSING",
    ),
  );
});

test("3 preparation must be completed", () => {
  const input = validInput();
  input.preparation.status = "collecting";
  const progress = inspectionApi.createProgress(input, at(15));
  assert.ok(
    progress.blockers.some(
      (entry) => entry.code === "PREPARATION_NOT_COMPLETED",
    ),
  );
});

test("4 join is required", () => {
  const input = validInput();
  delete input.join;
  const progress = inspectionApi.createProgress(input, at(15));
  assert.ok(
    progress.blockers.some((entry) => entry.code === "JOIN_MISSING"),
  );
});

test("5 join must be completed", () => {
  const input = validInput();
  input.join.status = "in_progress";
  input.join.completedAt = null;
  input.join.joinedAt = null;
  const progress = inspectionApi.createProgress(input, at(15));
  assert.ok(
    progress.blockers.some(
      (entry) => entry.code === "JOIN_NOT_COMPLETED",
    ),
  );
});

test("6 incomplete units block inspection", () => {
  const input = validInput();
  input.join.completedUnits -= 1;
  input.join.remainingUnits = 1;
  const progress = inspectionApi.createProgress(input, at(15));
  assert.ok(
    progress.blockers.some(
      (entry) => entry.code === "JOIN_UNITS_INCOMPLETE",
    ),
  );
});

test("7 remainingUnits conflict blocks inspection", () => {
  const input = validInput();
  input.join.remainingUnits = 1;
  const progress = inspectionApi.createProgress(input, at(15));
  assert.ok(
    progress.blockers.some(
      (entry) =>
        entry.code === "JOIN_REMAINING_UNITS_CONFLICT",
    ),
  );
});

test("8 unsecured thread blocks inspection", () => {
  const input = validInput();
  input.join.threadSecured = false;
  const progress = inspectionApi.createProgress(input, at(15));
  assert.ok(
    progress.blockers.some(
      (entry) => entry.code === "JOIN_THREAD_NOT_SECURED",
    ),
  );
});

test("9 source snapshot is a deep copy", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  const saved = clone(progress.sourceSnapshot);
  input.join.sourceSnapshot.firstPiece.data.sectionLabel = "Изменено";
  input.join.joinHistory[0].unitNumber = 99;
  assert.deepEqual(progress.sourceSnapshot, saved);
});

test("10 snapshot remains immutable across mutations", () => {
  const progress = readyInspection();
  const saved = clone(progress.sourceSnapshot);
  const started = inspectionApi.startInspection(progress, at(16));
  const checked = inspectionApi.checkItem(
    started,
    inspectionApi.USER_CHECKLIST_IDS[0],
    at(17),
  );
  assert.deepEqual(started.sourceSnapshot, saved);
  assert.deepEqual(checked.sourceSnapshot, saved);
});

test("11 fingerprint is deterministic and key-order independent", () => {
  const snapshot = inspectionApi.buildSourceSnapshot(validInput());
  const reordered = Object.fromEntries(
    Object.entries(snapshot).reverse(),
  );
  assert.equal(
    inspectionApi.sourceFingerprint(snapshot),
    inspectionApi.sourceFingerprint(reordered),
  );
});

test("12 changed join revision is detected", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  input.join.revision += 1;
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(blocked.blockers[0].code, "JOIN_REVISION_CONFLICT");
});

test("13 changed join fingerprint is detected", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  input.join.sourceFingerprint = "changed";
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(
    blocked.blockers[0].code,
    "JOIN_FINGERPRINT_CONFLICT",
  );
});

test("14 substituted piece is detected", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  input.join.sourceSnapshot.firstPiece.data.sectionLabel = "Подмена";
  input.join.sourceFingerprint = joinApi.sourceFingerprint(
    input.join.sourceSnapshot,
  );
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(blocked.status, "blocked");
});

test("15 substituted joining edge is detected", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  input.join.sourceSnapshot.joiningEdge.firstLength += 1;
  input.join.sourceFingerprint = joinApi.sourceFingerprint(
    input.join.sourceSnapshot,
  );
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(blocked.status, "blocked");
});

test("16 substituted operation is detected", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  input.join.operation = "another_operation";
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockers[0].code, "JOIN_SNAPSHOT_CONFLICT");
});

test("17 checklist has stable system and user items", () => {
  const progress = readyInspection();
  assert.deepEqual(
    progress.checklist.map((item) => item.id),
    inspectionApi.CHECKLIST.map((item) => item.id),
  );
  assert.equal(
    progress.checklist.filter((item) => item.source === "system")
      .length,
    3,
  );
  assert.equal(
    progress.checklist.filter((item) => item.source === "user").length,
    5,
  );
});

test("18 system checklist definitions cannot be substituted", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  progress.checklist[0].id = "user_supplied";
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(
    blocked.blockers[0].code,
    "INSPECTION_CHECKLIST_CORRUPTED",
  );
  assert.throws(
    () =>
      inspectionApi.setChecklistItem(
        startedInspection(),
        "join_completed",
        false,
        at(17),
      ),
    { code: "CHECKLIST_ITEM_NOT_USER_EDITABLE" },
  );
});

test("19 start changes ready to inspecting", () => {
  const progress = startedInspection();
  assert.equal(progress.status, "inspecting");
  assert.equal(progress.startedAt, at(16));
});

test("20 check and uncheck update answer and timestamps", () => {
  const started = startedInspection();
  const itemId = "edges_aligned";
  const checked = inspectionApi.checkItem(started, itemId, at(17));
  assert.equal(checked.answers.edgesAligned, true);
  assert.equal(
    checked.checklist.find((item) => item.id === itemId).checkedAt,
    at(17),
  );
  const unchecked = inspectionApi.uncheckItem(
    checked,
    itemId,
    at(18),
  );
  assert.equal(unchecked.answers.edgesAligned, false);
  assert.equal(
    unchecked.checklist.find((item) => item.id === itemId).checkedAt,
    null,
  );
});

test("21 reload preserves checklist progress", () => {
  const checked = inspectionApi.checkItem(
    startedInspection(),
    "edges_aligned",
    at(17),
  );
  const restored = inspectionApi.restoreProgress(
    JSON.stringify(checked),
  );
  assert.equal(
    restored.checklist.find(
      (item) => item.id === "edges_aligned",
    ).checked,
    true,
  );
  assert.equal(restored.answers.edgesAligned, true);
});

test("22 issue changes status to needs_correction", () => {
  const progress = inspectionApi.markIssue(
    startedInspection(),
    "seam_too_tight",
    null,
    at(17),
  );
  assert.equal(progress.status, "needs_correction");
  assert.equal(progress.issueDetected, true);
  assert.match(progress.correctionInstruction, /вручную/);
});

test("23 every supported issue code has a safe instruction", () => {
  for (const code of inspectionApi.ISSUE_CODES) {
    const note = code === "other" ? "Другой дефект" : null;
    const progress = inspectionApi.markIssue(
      startedInspection(),
      code,
      note,
      at(17),
    );
    assert.equal(progress.issueCode, code);
    assert.ok(progress.correctionInstruction.length > 20);
  }
});

test("24 other issue requires a short valid note", () => {
  assert.throws(
    () =>
      inspectionApi.markIssue(
        startedInspection(),
        "other",
        " ",
        at(17),
      ),
    { code: "ISSUE_NOTE_REQUIRED" },
  );
  const progress = inspectionApi.markIssue(
    startedInspection(),
    "other",
    "Неровный участок у края",
    at(17),
  );
  assert.equal(progress.issueNote, "Неровный участок у края");
  assert.throws(
    () =>
      inspectionApi.markIssue(
        startedInspection(),
        "other",
        "x".repeat(241),
        at(17),
      ),
    { code: "ISSUE_NOTE_TOO_LONG" },
  );
});

test("25 completion is forbidden while issue is active", () => {
  const issue = inspectionApi.markIssue(
    checkedInspection(),
    "seam_too_tight",
    null,
    at(24),
  );
  assert.throws(
    () => inspectionApi.completeInspection(issue, at(25)),
    { code: "ISSUE_UNRESOLVED" },
  );
});

test("26 correction acknowledgement is persisted", () => {
  const issue = inspectionApi.markIssue(
    startedInspection(),
    "seam_too_loose",
    null,
    at(17),
  );
  const acknowledged = inspectionApi.acknowledgeCorrection(
    issue,
    at(18),
  );
  assert.equal(acknowledged.correctionAcknowledged, true);
  assert.equal(
    inspectionApi.restoreProgress(
      JSON.stringify(acknowledged),
    ).correctionAcknowledged,
    true,
  );
});

test("27 resolving issue keeps append-only audit history", () => {
  const issue = inspectionApi.markIssue(
    startedInspection(),
    "skipped_join_unit",
    null,
    at(17),
  );
  const prefix = clone(issue.actionHistory);
  const acknowledged = inspectionApi.acknowledgeCorrection(
    issue,
    at(18),
  );
  const resolved = inspectionApi.confirmIssueResolved(
    acknowledged,
    at(19),
  );
  assert.deepEqual(
    resolved.actionHistory.slice(0, prefix.length),
    prefix,
  );
  assert.ok(
    resolved.actionHistory.some(
      (entry) => entry.actionType === "issue_marked",
    ),
  );
  assert.ok(
    resolved.actionHistory.some(
      (entry) =>
        entry.actionType === "issue_resolved_confirmed",
    ),
  );
});

test("28 resolved issue restarts the user checklist", () => {
  let progress = checkedInspection();
  progress = inspectionApi.markIssue(
    progress,
    "thread_not_secure",
    null,
    at(24),
  );
  progress = inspectionApi.acknowledgeCorrection(progress, at(25));
  progress = inspectionApi.confirmIssueResolved(progress, at(26));
  assert.equal(progress.status, "inspecting");
  assert.ok(
    progress.checklist
      .filter((item) => item.source === "user")
      .every((item) => item.checked === false),
  );
  assert.ok(
    Object.values(progress.answers).every((answer) => answer === null),
  );
});

test("29 completed checklist does not auto-complete", () => {
  const progress = checkedInspection();
  assert.equal(progress.status, "inspecting");
  assert.equal(progress.completedAt, null);
});

test("30 explicit completion works", () => {
  const progress = completedInspection();
  assert.equal(progress.status, "completed");
  assert.equal(progress.completedAt, at(24));
  assert.equal(
    progress.actionHistory.at(-1).actionType,
    "inspection_completed",
  );
});

test("31 completion requires all required answers", () => {
  let progress = startedInspection();
  for (const id of inspectionApi.USER_CHECKLIST_IDS.slice(0, -1)) {
    progress = inspectionApi.checkItem(progress, id, at(17));
  }
  progress = inspectionApi.confirmNoIssue(progress, at(22));
  assert.throws(
    () => inspectionApi.completeInspection(progress, at(23)),
    { code: "INSPECTION_INCOMPLETE" },
  );
});

test("32 completed inspection is immutable", () => {
  const completed = completedInspection();
  for (const operation of [
    (value) =>
      inspectionApi.setChecklistItem(
        value,
        "edges_aligned",
        false,
        at(25),
      ),
    (value) =>
      inspectionApi.markIssue(
        value,
        "seam_too_tight",
        null,
        at(25),
      ),
    (value) => inspectionApi.confirmNoIssue(value, at(25)),
  ]) {
    assert.throws(() => operation(completed), {
      code: "FIRST_ASSEMBLY_INSPECTION_COMPLETED",
    });
  }
  assert.deepEqual(
    inspectionApi.completeInspection(completed, at(25)),
    completed,
  );
});

test("33 completed state survives reload", () => {
  const completed = completedInspection();
  const restored = inspectionApi.restoreProgress(
    JSON.stringify(completed),
  );
  assert.deepEqual(restored, completed);
});

test("34 corrupted checklist becomes persistently blocked", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  progress.checklist.pop();
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(
    blocked.blockers[0].code,
    "INSPECTION_CHECKLIST_CORRUPTED",
  );
});

test("35 corrupted answers become blocked", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  progress.answers.edgesAligned = "yes";
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(
    blocked.blockers[0].code,
    "INSPECTION_ANSWERS_CORRUPTED",
  );
});

test("36 corrupted issue state becomes blocked", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  progress.issueDetected = true;
  progress.issueCode = null;
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(
    blocked.blockers[0].code,
    "INSPECTION_ISSUE_STATE_CORRUPTED",
  );
});

test("37 corrupted actionHistory becomes blocked with evidence", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  progress.actionHistory[0].sequence = 9;
  const original = clone(progress.actionHistory);
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(
    blocked.blockers[0].code,
    "INSPECTION_ACTION_HISTORY_CORRUPTED",
  );
  assert.deepEqual(blocked.corruptionEvidence.actionHistory, original);
});

test("38 blocked status survives reload and revalidation", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  input.join.revision += 1;
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  const restored = inspectionApi.restoreProgress(
    JSON.stringify(blocked),
  );
  const again = inspectionApi.revalidateProgress(
    restored,
    validInput(),
    at(17),
  );
  assert.deepEqual(again, restored);
});

test("39 project stages follow ready, inspecting, correction and completed", async () => {
  const repository = new ProjectRepository();
  repositories.push(repository);
  const project = await repository.createProject({
    title: "Stage 12C e2e",
  });
  const calculationResult = await repository.addCalculation(
    project.project_id,
    { schema_version: 1, kind: "CALCULATED_PROJECT" },
    {
      status: "READY",
      axes: {
        width: { selected_candidate: { working_count: 1 } },
      },
      warnings: [],
      errors: [],
      clarifications: [],
    },
  );
  const calculation = calculationResult.calculation;
  let preparation = completedPreparation(1);
  preparation.projectId = project.project_id;
  preparation.sourceSnapshot.projectId = project.project_id;
  preparation.sourceFingerprint = preparationApi.sourceFingerprint(
    preparation.sourceSnapshot,
  );
  await persistSeed(
    repository,
    project.project_id,
    calculation.calculation_id,
    preparationApi.PROGRESS_KIND,
    preparation,
    "assembly_preparation_ready",
  );
  let join = joinApi.createProgress(
    {
      project: {
        projectId: project.project_id,
        revision: 1,
        currentStage: "assembly_preparation_ready",
      },
      preparation,
    },
    at(4),
  );
  for (const id of joinApi.USER_CHECKLIST_IDS) {
    join = joinApi.confirmChecklistItem(join, id, at(5));
  }
  join = joinApi.startJoin(join, at(8));
  join = joinApi.completeUnit(join, at(9));
  join = joinApi.confirmThreadSecured(join, at(13));
  join = joinApi.completeJoin(join, at(14));
  await persistSeed(
    repository,
    project.project_id,
    calculation.calculation_id,
    joinApi.PROGRESS_KIND,
    join,
    "assembly_join_completed",
  );

  let result = await inspectionApi.ensureForProject(
    repository,
    project.project_id,
  );
  assert.equal(result.project.current_stage, "assembly_inspection_ready");
  result = await inspectionApi.startForProject(
    repository,
    project.project_id,
  );
  assert.equal(
    result.project.current_stage,
    "assembly_inspection_in_progress",
  );
  result = await inspectionApi.markIssueForProject(
    repository,
    project.project_id,
    "seam_too_tight",
  );
  assert.equal(
    result.project.current_stage,
    "assembly_inspection_needs_correction",
  );
  result = await inspectionApi.acknowledgeForProject(
    repository,
    project.project_id,
  );
  result = await inspectionApi.resolveForProject(
    repository,
    project.project_id,
  );
  for (const id of inspectionApi.USER_CHECKLIST_IDS) {
    result = await inspectionApi.setChecklistForProject(
      repository,
      project.project_id,
      id,
      true,
    );
  }
  result = await inspectionApi.confirmNoIssueForProject(
    repository,
    project.project_id,
  );
  result = await inspectionApi.completeForProject(
    repository,
    project.project_id,
  );
  assert.equal(result.inspection.status, "completed");
  assert.equal(
    result.project.current_stage,
    "assembly_inspection_completed",
  );
});

test("40 repeated actions preserve revision and append-only history", () => {
  let progress = startedInspection();
  progress = inspectionApi.checkItem(
    progress,
    "edges_aligned",
    at(17),
  );
  const revision = progress.revision;
  const history = clone(progress.actionHistory);
  const repeated = inspectionApi.checkItem(
    progress,
    "edges_aligned",
    at(18),
  );
  assert.equal(repeated.revision, revision);
  assert.deepEqual(repeated.actionHistory, history);
  const completed = completedInspection();
  const completedAgain = inspectionApi.completeInspection(
    completed,
    at(25),
  );
  assert.deepEqual(completedAgain, completed);
});

test("41 preparation revision and fingerprint conflicts are distinct", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  const revisionChanged = clone(input);
  revisionChanged.preparation.revision += 1;
  assert.equal(
    inspectionApi.revalidateProgress(
      progress,
      revisionChanged,
      at(16),
    ).blockers[0].code,
    "PREPARATION_REVISION_CONFLICT",
  );
  const fingerprintChanged = clone(input);
  fingerprintChanged.preparation.sourceFingerprint = "changed";
  assert.equal(
    inspectionApi.revalidateProgress(
      progress,
      fingerprintChanged,
      at(16),
    ).blockers[0].code,
    "PREPARATION_FINGERPRINT_CONFLICT",
  );
});

test("42 damaged join history is detected", () => {
  const input = validInput();
  input.join.joinHistory[0].sequence = 8;
  const progress = inspectionApi.createProgress(input, at(15));
  assert.ok(
    progress.blockers.some(
      (entry) => entry.code === "JOIN_HISTORY_CORRUPTED",
    ),
  );
});

test("43 action history has stable ids, sequence, statuses and revisions", () => {
  let progress = startedInspection();
  progress = inspectionApi.checkItem(
    progress,
    "edges_aligned",
    at(17),
  );
  progress = inspectionApi.markIssue(
    progress,
    "edges_misaligned",
    null,
    at(18),
  );
  const ids = new Set(
    progress.actionHistory.map((entry) => entry.actionId),
  );
  assert.equal(ids.size, progress.actionHistory.length);
  progress.actionHistory.forEach((entry, index) => {
    assert.equal(entry.sequence, index + 1);
    assert.ok(entry.resultingStatus);
    assert.ok(entry.revision <= progress.revision);
  });
});

test("44 completed source stays valid after reload", () => {
  const input = validInput();
  const completed = inspectionApi.completeInspection(
    (() => {
      let progress = inspectionApi.startInspection(
        inspectionApi.createProgress(input, at(15)),
        at(16),
      );
      for (const id of inspectionApi.USER_CHECKLIST_IDS) {
        progress = inspectionApi.checkItem(progress, id, at(17));
      }
      return inspectionApi.confirmNoIssue(progress, at(23));
    })(),
    at(24),
  );
  const revalidated = inspectionApi.revalidateProgress(
    inspectionApi.restoreProgress(JSON.stringify(completed)),
    input,
    at(25),
  );
  assert.deepEqual(revalidated, completed);
});

test("45 damaged inspection snapshot becomes blocked", () => {
  const input = validInput();
  const progress = inspectionApi.createProgress(input, at(15));
  progress.sourceSnapshot.firstPiece.data.sectionLabel = "Подмена";
  const blocked = inspectionApi.revalidateProgress(
    progress,
    input,
    at(16),
  );
  assert.equal(
    blocked.blockers[0].code,
    "INSPECTION_SNAPSHOT_CONFLICT",
  );
});

test("46 contradictory completed inspection becomes blocked", () => {
  const input = validInput();
  const completed = completedInspection();
  completed.completedAt = null;
  const blocked = inspectionApi.revalidateProgress(
    completed,
    input,
    at(25),
  );
  assert.equal(
    blocked.blockers[0].code,
    "COMPLETED_INSPECTION_CORRUPTED",
  );
});

async function persistSeed(
  repository,
  projectId,
  calculationId,
  kind,
  state,
  projectStage,
) {
  await repository.ensureCalculationProgress(
    projectId,
    calculationId,
    kind,
    { version: 0, initialized: false },
  );
  const placeholder = await repository.getCalculationProgress(
    projectId,
    calculationId,
    kind,
  );
  await repository.updateCalculationProgress(
    projectId,
    calculationId,
    kind,
    state,
    {
      baseProgressRevision: placeholder.revision,
      projectStage,
    },
  );
}
