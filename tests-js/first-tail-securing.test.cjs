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
const tailApi = require(
  "../src/yarnai/static/first-tail-securing.js"
);

const PROJECT_ID = "project-stage-13";
const { DB_NAME, ProjectRepository } = global.YarnAIProjectSystem;
let repositories = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function at(minute) {
  return `2026-07-31T14:${String(minute).padStart(2, "0")}:00.000Z`;
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

function preparationInput(totalUnits = 3, projectId = PROJECT_ID) {
  return {
    project: {
      projectId,
      revision: 24,
      currentStage: "second_piece_completed",
    },
    calculationFingerprint: "c".repeat(64),
    firstPiece: piece({
      projectId,
      fingerprint: "first-piece-fingerprint",
      finalStitchCount: totalUnits,
    }),
    secondPiece: piece({
      projectId,
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
}

function completedPreparation(totalUnits = 3, projectId = PROJECT_ID) {
  let progress = preparationApi.createProgress(
    preparationInput(totalUnits, projectId),
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
  projectId = PROJECT_ID,
  preparation = completedPreparation(totalUnits, projectId),
) {
  let progress = joinApi.createProgress(
    {
      project: {
        projectId,
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

function completedInspection(
  totalUnits = 3,
  projectId = PROJECT_ID,
  preparation = completedPreparation(totalUnits, projectId),
  join = completedJoin(totalUnits, projectId, preparation),
) {
  let progress = inspectionApi.createProgress(
    {
      project: {
        projectId,
        revision: 40,
        currentStage: "assembly_join_completed",
      },
      preparation,
      join,
    },
    at(15),
  );
  progress = inspectionApi.startInspection(progress, at(16));
  inspectionApi.USER_CHECKLIST_IDS.forEach((id, index) => {
    progress = inspectionApi.checkItem(
      progress,
      id,
      at(17 + index),
    );
  });
  progress = inspectionApi.confirmNoIssue(progress, at(23));
  return inspectionApi.completeInspection(progress, at(24));
}

function validInput(totalUnits = 3, projectId = PROJECT_ID) {
  const preparation = completedPreparation(totalUnits, projectId);
  const join = completedJoin(totalUnits, projectId, preparation);
  const inspection = completedInspection(
    totalUnits,
    projectId,
    preparation,
    join,
  );
  return {
    project: {
      projectId,
      revision: 50,
      currentStage: "assembly_inspection_completed",
    },
    preparation,
    join,
    inspection,
  };
}

function startedSecuring() {
  return tailApi.startSecuring(
    tailApi.createProgress(validInput(), at(25)),
    at(26),
  );
}

function checkedSecuring() {
  let progress = startedSecuring();
  progress = tailApi.updateTailInformation(
    progress,
    {
      recommendedSecuringCount: 3,
      completedSecuringCount: 3,
      userConfidence: "high",
      assistantConfidence: "high",
    },
    at(27),
  );
  tailApi.USER_CHECKLIST_IDS.forEach((id, index) => {
    progress = tailApi.checkItem(progress, id, at(28 + index));
  });
  return tailApi.confirmNoIssue(progress, at(35));
}

function completedSecuring() {
  return tailApi.completeSecuring(checkedSecuring(), at(36));
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

test("Stage 13 has the independent contract and required statuses", () => {
  assert.equal(tailApi.PROGRESS_KIND, "FIRST_TAIL_SECURING");
  assert.deepEqual(tailApi.STATUSES, [
    "ready",
    "securing",
    "needs_rework",
    "blocked",
    "completed",
  ]);
  assert.deepEqual(tailApi.ISSUE_CODES, [
    "tail_too_short",
    "tail_visible",
    "tail_not_secured",
    "fabric_distorted",
    "tail_pulled",
    "other",
  ]);
});

test("completed Stage 12C is required", () => {
  const input = validInput();
  delete input.inspection;
  const progress = tailApi.createProgress(input, at(25));
  assert.equal(progress.status, "blocked");
  assert.ok(
    progress.blockers.some(
      (entry) => entry.code === "INSPECTION_MISSING",
    ),
  );
});

test("non-completed Stage 12C blocks Stage 13", () => {
  const input = validInput();
  input.inspection.status = "inspecting";
  input.inspection.completedAt = null;
  input.inspection.stage13Fingerprint = undefined;
  const progress = tailApi.createProgress(input, at(25));
  assert.equal(progress.status, "blocked");
  assert.ok(
    progress.blockers.some(
      (entry) => entry.code === "INSPECTION_NOT_COMPLETED",
    ),
  );
});

test("record stores immutable Stage 12C snapshot, references and fingerprints", () => {
  const input = validInput();
  const originalInspection = clone(input.inspection);
  const progress = tailApi.createProgress(input, at(25));
  assert.deepEqual(progress.sourceSnapshot.stage12C, originalInspection);
  assert.equal(
    progress.references.inspection.id,
    originalInspection.id,
  );
  assert.equal(
    progress.references.inspection.revision,
    originalInspection.revision,
  );
  assert.equal(
    progress.references.inspection.fingerprint,
    originalInspection.sourceFingerprint,
  );
  assert.match(progress.stage12Fingerprint, /^assembly-inspection-/);
  assert.match(progress.stage13Fingerprint, /^first-tail-securing-/);
  input.inspection.actionHistory.push({ changed: true });
  assert.deepEqual(progress.sourceSnapshot.stage12C, originalInspection);
});

test("stable checklist includes every required tail check", () => {
  const progress = tailApi.createProgress(validInput(), at(25));
  assert.deepEqual(tailApi.USER_CHECKLIST_IDS, [
    "sufficient_tail",
    "correct_side",
    "securing_count_complete",
    "fabric_not_distorted",
    "no_tail_loop",
    "tail_fully_secured",
  ]);
  assert.deepEqual(progress.stableChecklist, tailApi.CHECKLIST);
  assert.deepEqual(
    progress.stableUserChecklist,
    tailApi.USER_CHECKLIST_IDS,
  );
});

test("tail information and assistant answers are independent data", () => {
  let progress = startedSecuring();
  progress = tailApi.updateTailInformation(
    progress,
    {
      recommendedSecuringCount: 4,
      completedSecuringCount: 2,
      userConfidence: "medium",
      assistantConfidence: "low",
    },
    at(27),
  );
  assert.equal(progress.tailInformation.recommendedSecuringCount, 4);
  assert.equal(progress.tailInformation.completedSecuringCount, 2);
  assert.equal(progress.tailInformation.userConfidence, "medium");
  assert.ok(
    Object.values(progress.assistantAnswers).every(
      (answer) => answer === null,
    ),
  );
});

test("securing count checklist cannot be confirmed too early", () => {
  let progress = startedSecuring();
  progress = tailApi.updateTailInformation(
    progress,
    { recommendedSecuringCount: 3, completedSecuringCount: 2 },
    at(27),
  );
  assert.throws(
    () =>
      tailApi.checkItem(
        progress,
        "securing_count_complete",
        at(28),
      ),
    { code: "SECURING_COUNT_INCOMPLETE" },
  );
});

test("a complete checklist never auto-completes", () => {
  const progress = checkedSecuring();
  assert.equal(progress.status, "securing");
  assert.equal(progress.completedAt, null);
});

test("explicit completion stores completed and its fingerprint", () => {
  const progress = completedSecuring();
  assert.equal(progress.status, "completed");
  assert.equal(progress.completedAt, at(36));
  assert.equal(
    progress.actionHistory.at(-1).actionType,
    "securing_completed",
  );
  assert.equal(
    progress.stage13Fingerprint,
    tailApi.stateFingerprint(progress),
  );
});

test("completion requires tail information, confidence and issue answer", () => {
  let progress = startedSecuring();
  progress = tailApi.updateTailInformation(
    progress,
    { completedSecuringCount: 3 },
    at(27),
  );
  for (const id of tailApi.USER_CHECKLIST_IDS) {
    progress = tailApi.checkItem(progress, id, at(28));
  }
  assert.throws(
    () => tailApi.completeSecuring(progress, at(35)),
    { code: "SECURING_INCOMPLETE" },
  );
});

test("completed is fully immutable, including source revalidation", () => {
  const completed = completedSecuring();
  const changedInput = validInput();
  changedInput.inspection.revision += 1;
  const before = clone(completed);
  assert.deepEqual(
    tailApi.revalidateProgress(completed, changedInput, at(37)),
    before,
  );
  for (const operation of [
    (value) => tailApi.startSecuring(value, at(37)),
    (value) =>
      tailApi.updateTailInformation(
        value,
        { completedSecuringCount: 9 },
        at(37),
      ),
    (value) =>
      tailApi.setChecklistItem(
        value,
        "sufficient_tail",
        false,
        at(37),
      ),
    (value) =>
      tailApi.markIssue(value, "tail_visible", null, at(37)),
    (value) => tailApi.confirmNoIssue(value, at(37)),
  ]) {
    assert.throws(() => operation(completed), {
      code: "FIRST_TAIL_SECURING_COMPLETED",
    });
  }
  assert.deepEqual(
    tailApi.completeSecuring(completed, at(37)),
    before,
  );
});

test("blocked is persistent and cannot be mutated", () => {
  const input = validInput();
  const progress = tailApi.createProgress(input, at(25));
  input.inspection.revision += 1;
  const blocked = tailApi.revalidateProgress(
    progress,
    input,
    at(26),
  );
  assert.equal(blocked.status, "blocked");
  const restored = tailApi.restoreProgress(
    JSON.stringify(blocked),
  );
  assert.deepEqual(
    tailApi.revalidateProgress(restored, validInput(), at(27)),
    restored,
  );
  assert.throws(() => tailApi.startSecuring(restored, at(28)), {
    code: "FIRST_TAIL_SECURING_BLOCKED",
  });
});

test("Stage 12 revision, fingerprint and snapshot conflicts are distinct", () => {
  const input = validInput();
  const progress = tailApi.createProgress(input, at(25));
  const revision = clone(input);
  revision.inspection.revision += 1;
  assert.equal(
    tailApi.revalidateProgress(progress, revision, at(26))
      .blockers[0].code,
    "INSPECTION_REVISION_CONFLICT",
  );
  const fingerprint = clone(input);
  fingerprint.inspection.sourceFingerprint = "changed";
  assert.equal(
    tailApi.revalidateProgress(progress, fingerprint, at(26))
      .blockers[0].code,
    "INSPECTION_FINGERPRINT_CONFLICT",
  );
  const snapshot = clone(input);
  snapshot.inspection.completedAt = at(39);
  assert.equal(
    tailApi.revalidateProgress(progress, snapshot, at(26))
      .blockers[0].code,
    "STAGE12_SNAPSHOT_CONFLICT",
  );
});

test("Stage 13 fingerprint detects internal tampering", () => {
  const input = validInput();
  const progress = tailApi.createProgress(input, at(25));
  progress.notes.push("tampered");
  const blocked = tailApi.revalidateProgress(
    progress,
    input,
    at(26),
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(
    blocked.blockers[0].code,
    "STAGE13_FINGERPRINT_CONFLICT",
  );
  assert.deepEqual(blocked.corruptionEvidence, {});
});

test("issue workflow requires acknowledgement and repeats checklist", () => {
  let progress = checkedSecuring();
  const historyBefore = clone(progress.actionHistory);
  progress = tailApi.markIssue(
    progress,
    "fabric_distorted",
    null,
    at(36),
  );
  assert.equal(progress.status, "needs_rework");
  assert.throws(
    () => tailApi.confirmIssueResolved(progress, at(37)),
    { code: "REWORK_NOT_ACKNOWLEDGED" },
  );
  progress = tailApi.acknowledgeCorrection(progress, at(37));
  progress = tailApi.confirmIssueResolved(progress, at(38));
  assert.equal(progress.status, "securing");
  assert.ok(
    progress.checklist
      .filter((item) => item.source === "user")
      .every((item) => item.checked === false),
  );
  assert.equal(progress.tailInformation.completedSecuringCount, 0);
  assert.deepEqual(
    progress.actionHistory.slice(0, historyBefore.length),
    historyBefore,
  );
  assert.ok(
    progress.actionHistory.some(
      (entry) =>
        entry.actionType === "securing_checklist_restarted",
    ),
  );
});

test("every issue category enters needs_rework", () => {
  for (const code of tailApi.ISSUE_CODES) {
    const note = code === "other" ? "Петля у края" : null;
    const progress = tailApi.markIssue(
      startedSecuring(),
      code,
      note,
      at(30),
    );
    assert.equal(progress.status, "needs_rework");
    assert.equal(progress.issueCode, code);
  }
});

test("history is append-only and repeated actions are idempotent", () => {
  let progress = startedSecuring();
  progress = tailApi.updateTailInformation(
    progress,
    { completedSecuringCount: 1 },
    at(27),
  );
  const revision = progress.revision;
  const history = clone(progress.actionHistory);
  const repeated = tailApi.updateTailInformation(
    progress,
    { completedSecuringCount: 1 },
    at(28),
  );
  assert.equal(repeated.revision, revision);
  assert.deepEqual(repeated.actionHistory, history);
  assert.equal(
    repeated.stage13Fingerprint,
    progress.stage13Fingerprint,
  );
});

test("corrupted history is blocked with original evidence", () => {
  const input = validInput();
  const progress = tailApi.createProgress(input, at(25));
  progress.actionHistory[0].sequence = 9;
  const original = clone(progress.actionHistory);
  const blocked = tailApi.revalidateProgress(
    progress,
    input,
    at(26),
  );
  assert.equal(
    blocked.blockers[0].code,
    "SECURING_ACTION_HISTORY_CORRUPTED",
  );
  assert.deepEqual(blocked.corruptionEvidence.actionHistory, original);
});

test("project stages follow ready, securing, rework, blocked and completed", async () => {
  const repository = new ProjectRepository();
  repositories.push(repository);
  const project = await repository.createProject({
    title: "Stage 13 e2e",
  });
  const calculationResult = await repository.addCalculation(
    project.project_id,
    { schema_version: 1, kind: "CALCULATED_PROJECT" },
    {
      status: "READY",
      axes: { width: { selected_candidate: { working_count: 1 } } },
      warnings: [],
      errors: [],
      clarifications: [],
    },
  );
  const calculation = calculationResult.calculation;
  const input = validInput(1, project.project_id);
  await persistSeed(
    repository,
    project.project_id,
    calculation.calculation_id,
    preparationApi.PROGRESS_KIND,
    input.preparation,
    "assembly_preparation_ready",
  );
  await persistSeed(
    repository,
    project.project_id,
    calculation.calculation_id,
    joinApi.PROGRESS_KIND,
    input.join,
    "assembly_join_completed",
  );
  await persistSeed(
    repository,
    project.project_id,
    calculation.calculation_id,
    inspectionApi.PROGRESS_KIND,
    input.inspection,
    "assembly_inspection_completed",
  );

  let result = await tailApi.ensureForProject(
    repository,
    project.project_id,
  );
  assert.equal(result.project.current_stage, "tail_securing_ready");
  result = await tailApi.startForProject(
    repository,
    project.project_id,
  );
  assert.equal(
    result.project.current_stage,
    "tail_securing_in_progress",
  );
  result = await tailApi.markIssueForProject(
    repository,
    project.project_id,
    "tail_visible",
  );
  assert.equal(
    result.project.current_stage,
    "tail_securing_needs_rework",
  );
  result = await tailApi.acknowledgeForProject(
    repository,
    project.project_id,
  );
  result = await tailApi.resolveForProject(
    repository,
    project.project_id,
  );
  result = await tailApi.updateTailForProject(
    repository,
    project.project_id,
    {
      completedSecuringCount: 3,
      userConfidence: "high",
      assistantConfidence: "high",
    },
  );
  for (const id of tailApi.USER_CHECKLIST_IDS) {
    result = await tailApi.setChecklistForProject(
      repository,
      project.project_id,
      id,
      true,
    );
  }
  result = await tailApi.confirmNoIssueForProject(
    repository,
    project.project_id,
  );
  result = await tailApi.completeForProject(
    repository,
    project.project_id,
  );
  assert.equal(result.securing.status, "completed");
  assert.equal(
    result.project.current_stage,
    "tail_securing_completed",
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
