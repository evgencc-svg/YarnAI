"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PreviewUrlRegistry,
  activeTechnologyReviewReadyForRouting,
  buildProjectWorkspaceViewModel,
  buildWorkspaceViewModel,
  collectProjectMaterials,
  determineNextAction,
  isUnsafeProgress,
  projectIdentityFromLocation,
  projectRoute,
} = require("../src/yarnai/static/user-workspace-entry.js");

function project(id, changes = {}) {
  return {
    project_id: id,
    title: `Проект ${id}`,
    revision: 1,
    workspace_status: "ACTIVE",
    ...changes,
  };
}

function progress(projectId, kind, changes = {}) {
  return {
    project_id: projectId,
    kind,
    state: {},
    ...changes,
  };
}

test("empty list produces a calm actionable empty state", () => {
  const model = buildWorkspaceViewModel([], []);
  assert.equal(model.empty, true);
  assert.equal(model.latestProject, null);
  assert.equal(model.emptyState.title, "Здесь появятся твои проекты");
  assert.match(model.emptyState.description, /фотографии/);
});

test("one project is shown and selected for continuation", () => {
  const model = buildWorkspaceViewModel([project("one")], []);
  assert.equal(model.projects.length, 1);
  assert.equal(model.latestProject.id, "one");
  assert.equal(model.latestProject.action.href, "/user-workspace-entry?project=one");
});

test("photo polo execution resumes from saved projects instead of returning to photo analysis",()=>{
  const model=buildWorkspaceViewModel([project("polo")],[progress("polo","GARMENT_REFERENCE_ANALYSIS"),progress("polo","GARMENT_POLO_EXECUTION",{state:{status:"active",stepIndex:2}})]);
  assert.equal(model.latestProject.action.href,"/garment-polo-execution?project=polo");
  assert.equal(model.latestProject.action.label,"Продолжить поло");
});

test("confirmed Stage 63 gauge routes the saved-project action to Stage 64", () => {
  const projectId = "019fc3ba-4100-71c3-b7f9-bd06e3bff304";
  const model = buildWorkspaceViewModel([
    project(projectId, {
      draft_input: {
        project_intent: {
          sampleKnown: true,
          gaugeKnown: true,
          gauge: { stitches: 20, rows: 28, widthCm: 10, heightCm: 10 },
        },
      },
    }),
  ]);
  assert.equal(model.latestProject.action.href, `/project-calculation-entry?project=${projectId}`);
  assert.equal(model.latestProject.action.href.includes("/calculator"), false);
});

test("multiple projects are ordered by valid saved timestamps", () => {
  const model = buildWorkspaceViewModel([
    project("older", { updated_at: "2026-01-01T10:00:00.000Z" }),
    project("newer", { updated_at: "2026-02-01T10:00:00.000Z" }),
  ]);
  assert.deepEqual(model.projects.map((item) => item.id), ["newer", "older"]);
  assert.equal(model.latestProject.id, "newer");
});

test("latest project choice is stable across repeated calls", () => {
  const input = [
    project("a", { updated_at: "2026-02-01T10:00:00Z" }),
    project("b", { updated_at: "2026-02-01T10:00:00Z" }),
  ];
  assert.deepEqual(buildWorkspaceViewModel(input), buildWorkspaceViewModel(input));
  assert.equal(buildWorkspaceViewModel(input).latestProject.id, "a");
});

test("missing ordering fields use original array order", () => {
  const model = buildWorkspaceViewModel([project("first"), project("second")]);
  assert.deepEqual(model.projects.map((item) => item.id), ["first", "second"]);
});

test("invalid timestamp is treated as absent and never displayed", () => {
  const model = buildWorkspaceViewModel([
    project("invalid", { updated_at: "not-a-date" }),
    project("valid", { updated_at: "2026-02-01T10:00:00Z" }),
  ]);
  assert.equal(model.latestProject.id, "valid");
  assert.equal(model.projects.find((item) => item.id === "invalid").updatedAt, null);
});

test("corrupted project without a usable identity fails closed", () => {
  const model = buildWorkspaceViewModel([{ title: "Повреждён" }, null, "bad"]);
  assert.equal(model.empty, true);
});

test("a project that failed aggregate loading stays neutral and is not latest", () => {
  const model = buildWorkspaceViewModel([
    project("broken", { workspace_unavailable: true }),
    project("safe"),
  ]);
  assert.equal(model.projects[0].action.label, "Открыть проект");
  assert.equal(model.projects[0].canContinue, false);
  assert.equal(model.latestProject.id, "safe");
});

test("quarantined progress is unsafe", () => {
  const record = progress("one", "PATTERN_IMPORT", { state: { quarantined: true } });
  const model = buildWorkspaceViewModel([project("one")], [record]);
  assert.equal(isUnsafeProgress(record), true);
  assert.equal(model.latestProject, null);
  assert.equal(model.projects[0].state, "Открыть проект");
});

test("imported-unproven progress is unsafe", () => {
  const record = progress("one", "PATTERN_ANALYSIS", { state: { importedUnproven: true } });
  assert.equal(isUnsafeProgress(record), true);
  assert.equal(buildWorkspaceViewModel([project("one")], [record]).latestProject, null);
});

test("stale progress is unsafe", () => {
  const record = progress("one", "PATTERN_EXECUTION_STEP", { stale: true });
  assert.equal(isUnsafeProgress(record), true);
  assert.equal(buildWorkspaceViewModel([project("one")], [record]).projects[0].canContinue, false);
});

test("technical progress is mapped to a human state", () => {
  const model = buildWorkspaceViewModel(
    [project("one")],
    [progress("one", "PATTERN_ANALYSIS", { state: { status: "pending" } })],
  );
  assert.equal(model.projects[0].state, "Нужно проверить разбор");
  assert.doesNotMatch(model.projects[0].state, /PATTERN|pending/);
});

test("unknown progress uses a neutral fallback", () => {
  const model = buildWorkspaceViewModel(
    [project("one")],
    [progress("one", "UNKNOWN_INTERNAL_KIND")],
  );
  assert.equal(model.projects[0].state, "Открыть проект");
  assert.equal(model.projects[0].action.label, "Открыть проект");
  assert.equal(model.projects[0].canContinue, false);
});

test("continue route follows the latest supported saved progress", () => {
  const model = buildWorkspaceViewModel(
    [project("one")],
    [
      progress("one", "PATTERN_IMPORT"),
      progress("one", "PATTERN_ANALYSIS", { updated_at: "2026-02-01T10:00:00Z" }),
    ],
  );
  assert.equal(model.projects[0].action.href, "/pattern-analysis?project=one");
});

test("an incomplete Stage 20 remains the reopen target even when a downstream review record exists", () => {
  const projectId = "one";
  const model = buildWorkspaceViewModel([project(projectId)], [
    progress(projectId, "PATTERN_TECHNOLOGY_DRAFT", { state: { status: "needs_attention", draftResult: { components: [], operations: [], rowInstructions: [], finishing: [] } } }),
    progress(projectId, "PATTERN_TECHNOLOGY_REVIEW", { state: { status: "reviewing" } }),
  ]);
  assert.equal(model.projects[0].action.href, "/pattern-technology-draft?project=one");
  assert.equal(model.projects[0].action.label, "Открыть способ вязания");
  assert.equal(model.projects[0].state, "Технологический план ещё не построен");
});

function activeExecutableReview(projectId = "one", changes = {}) {
  const executable = {
    identity: "executable-technology-plan-input:review-v6",
    fingerprint: "fnv1a32:12345678",
    algorithmId: "stage20-v2-branch-resolved-adapted-execution:v6",
    readiness: { executableReady: true },
  };
  return progress(projectId, "PATTERN_TECHNOLOGY_REVIEW", { state: {
    version: 1,
    reviewAlgorithmVersion: 1,
    revision: 25,
    status: "needs_attention",
    immutableSourceSnapshot: { schemaVersion: 2, executableTechnologyPlanInput: executable },
    immutableSourceSnapshotFingerprint: "fnv1a32:87654321",
    executableInputSchemaId: "EXECUTABLE_TECHNOLOGY_PLAN_INPUT_V1",
    executableInputVersion: 1,
    executableInputIdentity: executable.identity,
    executableInputFingerprint: executable.fingerprint,
    validation: { validatedRevision: 25, critical: [{ code: "REQUIRED_DECISION_PENDING" }] },
    ...changes,
  } });
}

test("an active bound Stage 21 v6 overrides old Stage 20 and downstream virtual state on ordinary reopen", () => {
  const projectId = "one";
  const review = activeExecutableReview(projectId);
  const model = buildWorkspaceViewModel([project(projectId)], [
    progress(projectId, "PATTERN_TECHNOLOGY_DRAFT", { state: { status: "needs_attention", draftResult: { components: [], operations: [], rowInstructions: [], finishing: [] } } }),
    progress(projectId, "PATTERN_EXECUTION_PLAN", { state: { status: "stale" } }),
    progress(projectId, "PATTERN_EXECUTION_SESSION", { state: { virtualDryRun: { started: true, status: "completed", completedStepIds: new Array(127).fill("step"), execution: { actions: new Array(127).fill({}) } } } }),
    review,
  ]);
  assert.equal(activeTechnologyReviewReadyForRouting(review), true);
  assert.equal(model.projects[0].action.href, "/pattern-technology-review?project=one");
  assert.equal(model.projects[0].action.label, "Продолжить проверку изменений");
  assert.equal(model.projects[0].state, "Проверка обновлённого плана не завершена");
});

test("Stage 21 v6 routing fails closed when the executable binding is incomplete", () => {
  const review = activeExecutableReview("one", { executableInputFingerprint: "fnv1a32:00000000" });
  const model = buildWorkspaceViewModel([project("one")], [
    progress("one", "PATTERN_TECHNOLOGY_DRAFT", { state: { status: "needs_attention", draftResult: { components: [], operations: [], rowInstructions: [], finishing: [] } } }),
    review,
  ]);
  assert.equal(activeTechnologyReviewReadyForRouting(review), false);
  assert.equal(model.projects[0].action.href, "/pattern-technology-draft?project=one");
});

test("a ready Stage 22 overrides the old incomplete Stage 20 card", () => {
  const projectId = "one";
  const model = buildWorkspaceViewModel([project(projectId)], [
    progress(projectId, "PATTERN_TECHNOLOGY_DRAFT", { state: { status: "needs_attention", draftResult: { components: [], operations: [], rowInstructions: [], finishing: [] } } }),
    progress(projectId, "PATTERN_EXECUTION_PLAN", { state: { revision: 18, status: "ready", planningAlgorithmVersion: 11, planFingerprint: "fnv1a32:12345678", validation: { isValid: true, validatedRevision: 18 }, plan: { contractId: "PATTERN_EXECUTION_PLAN_V2", resultKind: "PATTERN_EXECUTION_PLAN_RESULT", algorithmId: "stage21-confirmed-adapted-execution-plan:v4", resultFingerprint: "fnv1a32:87654321", steps: new Array(127).fill({}), coverage: { sourceOperationCount: 127, userStepCount: 127, exactOneToOne: true }, initialExecutionState: { status: "ready_to_start", started: false, completedStepCount: 0 }, firstAction: { ready: true } } } }),
  ]);
  assert.equal(model.projects[0].action.href, "/pattern-execution-plan?project=one");
  assert.equal(model.projects[0].action.label, "Открыть план вязания");
  assert.equal(model.projects[0].state, "План вязания готов");
});

test("a confirmed Stage 21 adds a read-only history link without replacing the current Stage 22 action", () => {
  const projectId = "one";
  const confirmedReview = progress(projectId, "PATTERN_TECHNOLOGY_REVIEW", { state: {
    revision: 29,
    status: "confirmed",
    confirmedSnapshot: { result: "saved" },
    confirmedSnapshotFingerprint: "fnv1a32:12345678",
    immutableSourceSnapshot: { schemaVersion: 2 },
    decisions: [{ targetId: "plan", decision: "accepted" }],
  } });
  const readyPlan = progress(projectId, "PATTERN_EXECUTION_PLAN", { state: { revision: 33, status: "ready", planningAlgorithmVersion: 11, planFingerprint: "fnv1a32:12345678", validation: { isValid: true, validatedRevision: 33 }, plan: { contractId: "PATTERN_EXECUTION_PLAN_V2", resultKind: "PATTERN_EXECUTION_PLAN_RESULT", algorithmId: "stage21-confirmed-adapted-execution-plan:v4", resultFingerprint: "fnv1a32:87654321", steps: new Array(127).fill({}), coverage: { sourceOperationCount: 127, userStepCount: 127, exactOneToOne: true }, initialExecutionState: { status: "ready_to_start", started: false, completedStepCount: 0 }, firstAction: { ready: true } } } });
  const model = buildWorkspaceViewModel([project(projectId)], [confirmedReview, readyPlan]);
  assert.equal(model.projects[0].action.href, "/pattern-execution-plan?project=one");
  assert.deepEqual(model.projects[0].completedTechnologyReview, {
    label: "Посмотреть принятую адаптацию",
    href: "/pattern-technology-review?project=one&view=completed",
  });
});

test("a pending or stale Stage 21 never gets a completed-result link", () => {
  const projectId = "one";
  const pending = progress(projectId, "PATTERN_TECHNOLOGY_REVIEW", { state: { revision: 29, status: "confirmed", confirmedSnapshot: { result: "saved" }, confirmedSnapshotFingerprint: "fnv1a32:12345678", immutableSourceSnapshot: { schemaVersion: 2 }, decisions: [{ targetId: "plan", decision: "pending" }] } });
  const stale = structuredClone(pending); stale.state.decisions[0].decision = "accepted"; stale.state.status = "stale";
  assert.equal(buildWorkspaceViewModel([project(projectId)], [pending]).projects[0].completedTechnologyReview, null);
  assert.equal(buildWorkspaceViewModel([project(projectId)], [stale]).projects[0].completedTechnologyReview, null);
});

test("an active virtual dry run reopens directly ahead of the unchanged Stage 22", () => {
  const projectId = "one";
  const model = buildWorkspaceViewModel([project(projectId)], [
    progress(projectId, "PATTERN_EXECUTION_PLAN", { state: { revision: 18, status: "ready", planningAlgorithmVersion: 11, planFingerprint: "fnv1a32:12345678", validation: { isValid: true, validatedRevision: 18 }, plan: { contractId: "PATTERN_EXECUTION_PLAN_V2", resultKind: "PATTERN_EXECUTION_PLAN_RESULT", algorithmId: "stage21-confirmed-adapted-execution-plan:v4", resultFingerprint: "fnv1a32:87654321", steps: new Array(127).fill({}), coverage: { sourceOperationCount: 127, userStepCount: 127, exactOneToOne: true }, initialExecutionState: { status: "ready_to_start", started: false, completedStepCount: 0 }, firstAction: { ready: true } } } }),
    progress(projectId, "PATTERN_EXECUTION_SESSION", { updated_at: "2026-08-29T18:00:00.000Z", state: { status: "waiting", virtualDryRun: { mode: "virtual_dry_run", started: true, status: "active", completedStepIds: ["step:001"], execution: { actions: new Array(127).fill({}) } } } }),
  ]);
  assert.equal(model.projects[0].action.href, "/pattern-execution-session?project=one&mode=virtual_dry_run");
  assert.equal(model.projects[0].action.label, "Продолжить виртуальную проверку");
  assert.equal(model.projects[0].state, "Виртуальная проверка: 1 из 127");
});

test("a malformed ready Stage 22 cannot mask an incomplete Stage 20 card", () => {
  const projectId = "one";
  const model = buildWorkspaceViewModel([project(projectId)], [
    progress(projectId, "PATTERN_TECHNOLOGY_DRAFT", { state: { status: "needs_attention", draftResult: { components: [], operations: [], rowInstructions: [], finishing: [] } } }),
    progress(projectId, "PATTERN_EXECUTION_PLAN", { state: { revision: 18, status: "ready", planFingerprint: "fnv1a32:12345678", validation: { isValid: true, validatedRevision: 17 }, plan: { contractId: "PATTERN_EXECUTION_PLAN_V2", resultKind: "PATTERN_EXECUTION_PLAN_RESULT", resultFingerprint: "fnv1a32:87654321", steps: new Array(127).fill({}), coverage: { sourceOperationCount: 127, userStepCount: 127, exactOneToOne: true }, initialExecutionState: { status: "ready_to_start", started: false, completedStepCount: 0 }, firstAction: { ready: true } } } }),
  ]);
  assert.equal(model.projects[0].action.href, "/pattern-technology-draft?project=one");
  assert.equal(model.projects[0].state, "Технологический план ещё не построен");
});

test("an obsolete Stage 22 planning version cannot mask an incomplete Stage 20 card", () => {
  const projectId = "one";
  const model = buildWorkspaceViewModel([project(projectId)], [
    progress(projectId, "PATTERN_TECHNOLOGY_DRAFT", { state: { status: "needs_attention", draftResult: { components: [], operations: [], rowInstructions: [], finishing: [] } } }),
    progress(projectId, "PATTERN_EXECUTION_PLAN", { state: { revision: 18, status: "ready", planningAlgorithmVersion: 10, planFingerprint: "fnv1a32:12345678", validation: { isValid: true, validatedRevision: 18 }, plan: { contractId: "PATTERN_EXECUTION_PLAN_V2", resultKind: "PATTERN_EXECUTION_PLAN_RESULT", algorithmId: "stage21-confirmed-adapted-execution-plan:v4", resultFingerprint: "fnv1a32:87654321", steps: new Array(127).fill({}), coverage: { sourceOperationCount: 127, userStepCount: 127, exactOneToOne: true }, initialExecutionState: { status: "ready_to_start", started: false, completedStepCount: 0 }, firstAction: { ready: true } } } }),
  ]);
  assert.equal(model.projects[0].action.href, "/pattern-technology-draft?project=one");
});

test("an obsolete Stage 22 plan algorithm cannot mask an incomplete Stage 20 card", () => {
  const projectId = "one";
  const model = buildWorkspaceViewModel([project(projectId)], [
    progress(projectId, "PATTERN_TECHNOLOGY_DRAFT", { state: { status: "needs_attention", draftResult: { components: [], operations: [], rowInstructions: [], finishing: [] } } }),
    progress(projectId, "PATTERN_EXECUTION_PLAN", { state: { revision: 18, status: "ready", planningAlgorithmVersion: 11, planFingerprint: "fnv1a32:12345678", validation: { isValid: true, validatedRevision: 18 }, plan: { contractId: "PATTERN_EXECUTION_PLAN_V2", resultKind: "PATTERN_EXECUTION_PLAN_RESULT", algorithmId: "stage21-confirmed-adapted-execution-plan:v3", resultFingerprint: "fnv1a32:87654321", steps: new Array(127).fill({}), coverage: { sourceOperationCount: 127, userStepCount: 127, exactOneToOne: true }, initialExecutionState: { status: "ready_to_start", started: false, completedStepCount: 0 }, firstAction: { ready: true } } } }),
  ]);
  assert.equal(model.projects[0].action.href, "/pattern-technology-draft?project=one");
});

function repairedPatternChain(projectId = "project-one") {
  const operations = Array.from({ length: 127 }, (_, index) => ({ identity: `operation:${index + 1}` }));
  const input = {
    identity: "executable:new", fingerprint: "fnv1a32:22222222", algorithmId: "stage20-v2-branch-resolved-adapted-execution:v6",
    binding: { stage20ResultIdentity: "result-20", stage20SourceProjectionFingerprint: "fnv1a32:33333333", sourceInstructionEvidenceIdentity: "evidence", sourceInstructionEvidenceRevision: 42, sourceInstructionEvidenceFingerprint: "fnv1a32:44444444" },
    branchSelection: { fingerprint: "fnv1a32:55555555" },
    adaptedExecution: { operations, causalTrace: { schemaId: "AUTHORITATIVE_CAUSAL_TRACE_V1" }, adaptationProfile: { identity: "adaptation", revision: 7, fingerprint: "fnv1a32:66666666" }, solverIdentity: "solver", solverFingerprint: "fnv1a32:77777777" },
  };
  const review = progress(projectId, "PATTERN_TECHNOLOGY_REVIEW", { state: { id: "review-21", revision: 21, status: "confirmed", confirmedSnapshotFingerprint: "fnv1a32:88888888", confirmedSnapshot: { executableTechnologyPlanInput: input }, validation: { isValid: true, validatedRevision: 21 }, audit: [{ type: "causal_trace_revalidated", userConfirmationPreserved: true, previousConfirmedSnapshotFingerprint: "fnv1a32:99999999", previousExecutableInputFingerprint: "fnv1a32:aaaaaaaa" }] } });
  const plan = progress(projectId, "PATTERN_EXECUTION_PLAN", { state: {
    id: "plan-22", revision: 33, status: "ready", planningAlgorithmVersion: 11, planFingerprint: "fnv1a32:bbbbbbbb", validation: { isValid: true, validatedRevision: 33 },
    sourceTechnologyReviewId: "review-21", sourceTechnologyReviewRevision: 19, sourceConfirmedSnapshotFingerprint: "fnv1a32:99999999", sourceExecutableInputIdentity: "executable:old", sourceExecutableInputFingerprint: "fnv1a32:aaaaaaaa",
    sourceStage20ResultIdentity: "result-20", sourceStage20ProjectionFingerprint: "fnv1a32:33333333", sourceInstructionEvidenceIdentity: "evidence", sourceInstructionEvidenceRevision: 42, sourceInstructionEvidenceFingerprint: "fnv1a32:44444444",
    sourceBranchFingerprint: "fnv1a32:55555555", sourceAdaptationProfileIdentity: "adaptation", sourceAdaptationProfileRevision: 7, sourceAdaptationProfileFingerprint: "fnv1a32:66666666", sourceSolverResultIdentity: "solver", sourceSolverResultFingerprint: "fnv1a32:77777777", sourceExecutionGraphFingerprint: "fnv1a32:cccccccc", sourceAdaptedOperationCount: 127,
    plan: { contractId: "PATTERN_EXECUTION_PLAN_V2", resultKind: "PATTERN_EXECUTION_PLAN_RESULT", algorithmId: "stage21-confirmed-adapted-execution-plan:v4", resultFingerprint: "fnv1a32:dddddddd", handoff: { executionGraphFingerprint: "fnv1a32:cccccccc", operationCount: 127 }, steps: operations.map((entry) => ({ sourceOperationIdentity: entry.identity })), coverage: { sourceOperationCount: 127, userStepCount: 127, exactOneToOne: true }, initialExecutionState: { status: "ready_to_start", started: false, completedStepCount: 0 }, firstAction: { ready: true } },
  } });
  return { review, plan };
}

function productionLikeStalePatternChain(projectId = "project-one") {
  const chain = repairedPatternChain(projectId);
  chain.review.state.revision = 29;
  chain.review.state.immutableSourceSnapshot = { schemaVersion: 2 };
  chain.review.state.decisions = [{ targetId: "executable-plan", decision: "accepted" }];
  chain.review.state.confirmedSnapshot.executableTechnologyPlanInput.algorithmId = "stage20-v2-branch-resolved-adapted-execution:v5";
  chain.plan.state.status = "ready";
  chain.plan.state.sourceTechnologyReviewRevision = 19;
  chain.plan.state.plan.firstAction.ready = true;
  chain.plan.state.validation = { isValid: true, validatedRevision: 33 };
  return chain;
}

test("confirmed Stage 21 and its existing stale Stage 22 route to the stale Stage 22 screen", () => {
  const projectId = "project-one";
  const chain = productionLikeStalePatternChain(projectId);
  const before = JSON.stringify(chain);
  const model = buildWorkspaceViewModel([{ ...project(projectId), workspace_unavailable: true }], [chain.review, chain.plan]);
  const decision = determineNextAction({ projectId, initializationAssessment: {}, progressRecords: [chain.review, chain.plan], materialState: "ready" });

  assert.equal(model.projects[0].state, "План вязания устарел");
  assert.deepEqual(model.projects[0].action, {
    label: "Открыть проект",
    href: "/pattern-execution-plan?project=project-one",
    canContinue: true,
  });
  assert.deepEqual(model.projects[0].completedTechnologyReview, {
    label: "Посмотреть принятую адаптацию",
    href: "/pattern-technology-review?project=project-one&view=completed",
  });
  assert.notEqual(model.projects[0].action.href, model.projects[0].completedTechnologyReview.href);
  assert.equal(decision.status, "stale");
  assert.equal(decision.action, "continue-pattern-execution");
  assert.equal(decision.destination, "/pattern-execution-plan?project=project-one");
  assert.notEqual(decision.action, "review-details");
  assert.equal(chain.plan.state.revision, 33);
  assert.equal(chain.plan.state.plan.initialExecutionState.started, false);
  assert.equal(chain.plan.state.plan.initialExecutionState.completedStepCount, 0);
  assert.equal(chain.plan.state.plan.steps.length, 127);
  assert.equal(JSON.stringify(chain), before);
});

test("a persisted project without initialization reopens the proved repaired Stage 21 to Stage 22 chain", () => {
  const chain = repairedPatternChain();
  const decision = determineNextAction({ projectId: "project-one", initializationAssessment: {}, progressRecords: [chain.review, chain.plan], materialState: "ready" });
  assert.equal(decision.status, "ready");
  assert.equal(decision.action, "continue-pattern-execution");
  assert.equal(decision.destination, "/pattern-execution-plan?project=project-one");
});

test("project workspace returns an active bound Stage 21 v6 before initialization fallback without mutating it", () => {
  const review = activeExecutableReview("project-one");
  const before = JSON.stringify(review);
  const decision = determineNextAction({ projectId: "project-one", initializationAssessment: {}, progressRecords: [review], materialState: "ready" });
  assert.equal(decision.status, "ready");
  assert.equal(decision.action, "continue-pattern-technology-review");
  assert.equal(decision.destination, "/pattern-technology-review?project=project-one");
  assert.equal(JSON.stringify(review), before);
});

test("workspace reopen does not trust a repaired chain when a solver binding changed", () => {
  const chain = repairedPatternChain();
  chain.plan.state.sourceSolverResultFingerprint = "fnv1a32:00000000";
  const decision = determineNextAction({ projectId: "project-one", initializationAssessment: {}, progressRecords: [chain.review, chain.plan], materialState: "ready" });
  assert.equal(decision.status, "blocked");
  assert.equal(decision.action, "review-details");
});

test("hidden workspace states cannot be made visible by their card layout", () => {
  const css = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/yarnai/static/user-workspace-entry.css"), "utf8");
  assert.match(css, /\.project-workspace \[hidden\]\s*\{\s*display:\s*none !important;/);
});

test("input objects are not mutated", () => {
  const projects = [project("one", { draft_input: { garment_type: "Шапка" } })];
  const records = [progress("one", "PATTERN_IMPORT", { state: { status: "collecting" } })];
  const before = JSON.stringify({ projects, records });
  buildWorkspaceViewModel(projects, records);
  assert.equal(JSON.stringify({ projects, records }), before);
});

test("duplicate project IDs produce one stable card", () => {
  const model = buildWorkspaceViewModel([
    project("same", { title: "Первый" }),
    project("same", { title: "Второй" }),
  ]);
  assert.equal(model.projects.length, 1);
  assert.equal(model.projects[0].title, "Первый");
});

test("administrative evolution progress never creates forward navigation", () => {
  const model = buildWorkspaceViewModel(
    [project("one")],
    [progress("one", "PATTERN_EVOLUTION_CLOSURE", { state: { lifecycle: "closed" } })],
  );
  assert.equal(model.projects[0].action.label, "Открыть проект");
  assert.equal(model.projects[0].canContinue, false);
  assert.doesNotMatch(model.projects[0].action.href, /evolution|stage/i);
});

test("validated completed clarification is a terminal saved-project projection", () => {
  const continuation = { status: "pending", title: "Следующий шаг подготовлен", summary: "Связать резинку высотой 5 см", action: null, destination: null };
  const model = buildWorkspaceViewModel([project("one", { workspace_stage69_status: "completed", workspace_continuation: continuation })], []);
  assert.equal(model.projects[0].state, "Следующий шаг подготовлен");
  assert.equal(model.projects[0].summary, "Связать резинку высотой 5 см");
  assert.equal(model.projects[0].action, null);
  assert.equal(model.projects[0].canContinue, false);
  assert.deepEqual(model.latestProject, model.projects[0]);
  assert.equal(model.latestPresentation.heading, "Последний проект");
  assert.equal(model.latestPresentation.action, null);
  assert.match(model.latestPresentation.description, /Связать резинку высотой 5 см/);
});

test("clarification CTA exists only before confirmation", () => {
  const ready = buildWorkspaceViewModel([project("one", {
    workspace_stage69_status: "ready",
    workspace_continuation: { status: "ready", title: "Нужно уточнить следующий шаг", summary: "Подтвердите тип и высоту следующего участка.", action: "clarify-next-step", destination: "/project-execution-next-step-clarification?project=one" },
  })], []);
  assert.equal(ready.projects[0].action.label, "Уточнить следующий шаг");
  assert.equal(ready.projects[0].action.href, "/project-execution-next-step-clarification?project=one");
  const blocked = buildWorkspaceViewModel([project("one", { workspace_stage69_status: "blocked", workspace_continuation: { status: "blocked", summary: "Не удалось проверить.", action: null, destination: null } })], []);
  assert.equal(blocked.projects[0].action, null);
});

test("production model contains no manual clock or random identity", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../src/yarnai/static/user-workspace-entry.js"),
    "utf8",
  );
  for (const token of ["Math.random", "Date.now", "new Date", "crypto.randomUUID"]) {
    assert.equal(source.includes(token), false, token);
  }
});

function initializedAssessment(overrides = {}) {
  return {
    verdict: "ready",
    current: true,
    canContinue: true,
    existing: {
      lifecycle: "initialized",
      integrity: { quarantined: false, collision: false, importedUnproven: false },
      snapshot: {
        garment: { type: "Кардиган", sizeMode: "standard", standardSize: "M", recipient: "self", fit: "regular" },
        measurements: { body: {}, garment: {} },
        assumptions: [],
        warnings: [],
      },
    },
    reasons: [],
    ...overrides,
  };
}

function next(overrides = {}) {
  return determineNextAction({
    projectId: "project-one",
    initializationAssessment: initializedAssessment(),
    progressRecords: [],
    gaugeKnown: false,
    materialState: "ready",
    ...overrides,
  });
}

test("a newly initialized project starts with the swatch", () => {
  const decision = next();
  assert.equal(decision.status, "ready");
  assert.equal(decision.action, "start-swatch");
  assert.equal(decision.destination, "/user-workspace-entry?project=project-one#swatch-assistant");
});

test("project workspace treats confirmed clarification as pending without navigation", () => {
  const decision = next({ continuationProjection: { status: "pending", title: "Следующий шаг подготовлен", summary: "Связать резинку высотой 5 см", action: null, destination: null } });
  assert.equal(decision.status, "pending");
  assert.equal(decision.title, "Следующий шаг подготовлен");
  assert.equal(decision.description, "Связать резинку высотой 5 см");
  assert.equal(decision.destination, null);
});

test("unprojected clarification progress cannot become a continuation route", () => {
  const decision = next({ progressRecords: [progress("project-one", "PROJECT_EXECUTION_NEXT_STEP_CLARIFICATION")] });
  assert.equal(decision.status, "blocked");
  assert.equal(decision.destination, "/saved-projects");
  assert.doesNotMatch(decision.destination, /clarification/);
});

test("confirmed gauge opens the project calculation entry", () => {
  const decision = next({ gaugeKnown: true });
  assert.equal(decision.action, "open-calculation");
  assert.equal(decision.destination, "/project-calculation-entry?project=project-one");
});

test("current practical progress takes priority over a new start", () => {
  const decision = next({
    gaugeKnown: true,
    progressRecords: [{ project_id: "project-one", kind: "STEP_ASSISTANT", updated_at: "2026-08-01T10:00:00.000Z", state: {} }],
  });
  assert.equal(decision.action, "continue-project");
  assert.equal(decision.destination, "/step-assistant?project=project-one");
});

test("stale initialization blocks work and returns to details", () => {
  const decision = next({ initializationAssessment: initializedAssessment({ verdict: "stale", current: false, canContinue: false }) });
  assert.equal(decision.status, "stale");
  assert.equal(decision.action, "review-details");
  assert.equal(decision.destination, "/user-workspace-entry?project=project-one#project-details");
});

for (const [label, integrity] of [
  ["quarantined", { quarantined: true }],
  ["collided", { collision: true }],
  ["imported-unproven", { importedUnproven: true }],
]) {
  test(`${label} initialization fails closed`, () => {
    const assessment = initializedAssessment();
    assessment.existing.integrity = { ...assessment.existing.integrity, ...integrity };
    const decision = next({ initializationAssessment: assessment });
    assert.equal(decision.status, "blocked");
    assert.equal(decision.action, "review-details");
  });
}

test("unknown initialization state fails closed", () => {
  const decision = next({ initializationAssessment: { verdict: "unknown" } });
  assert.equal(decision.status, "blocked");
  assert.equal(decision.action, "review-details");
});

test("invalid route and identity are rejected", () => {
  assert.equal(projectRoute("https://evil.example", "project-one"), "");
  assert.equal(projectRoute("//evil.example", "project-one"), "");
  assert.equal(projectRoute("/calculator", ""), "");
  assert.equal(projectIdentityFromLocation("/user-workspace-entry?project=bad", (value) => value === "good"), "");
});

test("query and hash identity parsing preserves a validated project", () => {
  assert.equal(
    projectIdentityFromLocation("/user-workspace-entry?project=good#swatch-assistant", (value) => value === "good"),
    "good",
  );
  assert.equal(
    projectIdentityFromLocation("/user-workspace-entry#project=good", (value) => value === "good"),
    "good",
  );
});

test("object key order and mutable destination fields do not change the decision", () => {
  const first = initializedAssessment();
  const second = { reasons: [], existing: first.existing, canContinue: true, current: true, verdict: "ready" };
  assert.deepEqual(
    next({ initializationAssessment: first, destination: "https://evil.example", domDestination: "/evil" }),
    next({ initializationAssessment: second, destination: "/another", localStorageDestination: "/evil" }),
  );
});

test("materials cover empty, photos, pdf, text, broken and unsupported records", () => {
  assert.deepEqual(collectProjectMaterials({ projectId: "one" }), []);
  const materials = collectProjectMaterials({
    projectId: "one",
    photos: [
      { project_id: "one", photo_id: "p1", display_name: "front.png", source_mime: "image/png", purpose: "PROJECT_REFERENCE", status: "READY" },
      { project_id: "one", photo_id: "p2", display_name: "scheme.png", source_mime: "image/png", purpose: "PATTERN_REFERENCE", status: "ERROR" },
      { project_id: "other", photo_id: "foreign", source_mime: "image/png", status: "READY" },
    ],
    patternFiles: [
      { project_id: "one", pattern_file_id: "f1", material_id: "m1", display_name: "pattern.pdf", media_type: "application/pdf" },
      { project_id: "one", pattern_file_id: "f2", material_id: "m2", display_name: "notes.md", media_type: "text/markdown" },
      { project_id: "one", pattern_file_id: "f3", material_id: "m3", display_name: "archive.bin", media_type: "application/octet-stream" },
    ],
  });
  assert.deepEqual(materials.map((item) => item.kind), ["photo", "diagram", "pdf", "text", "unsupported"]);
  assert.equal(materials[1].availability, "broken");
  assert.equal(materials[4].availability, "unsupported");
  assert.equal(materials.some((item) => item.id === "foreign"), false);
});

test("project view model uses the initialization snapshot and main image", () => {
  const assessment = initializedAssessment();
  const model = buildProjectWorkspaceViewModel({
    aggregate: {
      project: project("project-one", { title: "Мой кардиган" }),
      photos: [{ project_id: "project-one", photo_id: "photo", display_name: "main.jpg", source_mime: "image/jpeg", status: "READY" }],
      progress: [],
    },
    patternFiles: [],
    initializationAssessment: assessment,
  });
  assert.equal(model.project.title, "Мой кардиган");
  assert.equal(model.mainMaterial.name, "main.jpg");
  assert.equal(model.nextAction.action, "start-swatch");
});

test("preview object URLs are always revoked", () => {
  const revoked = [];
  const registry = new PreviewUrlRegistry({
    createObjectURL: () => "blob:preview-one",
    revokeObjectURL: (value) => revoked.push(value),
  });
  assert.equal(registry.create(new Blob(["image"], { type: "image/png" })), "blob:preview-one");
  registry.revokeAll();
  registry.revokeAll();
  assert.deepEqual(revoked, ["blob:preview-one"]);
});

test("controller contract includes loading, live validation, focus and safe failure", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../src/yarnai/static/user-workspace-entry-assistant.js"),
    "utf8",
  );
  for (const token of [
    "project-workspace-loading",
    "repository.getProject(projectId)",
    "initializationApi.assessInitialization",
    'globalObject.location.hash !== "#project-details"',
    "inspectMaterialReferences",
    "continueFromSwatch",
    "initializationIntent",
    'workspace.projectRoute("/project-calculation-entry", projectId)',
    "activateSwatchRoute",
    "await refresh({ preserveStatus: true })",
    "allowedDestination(action.destination)",
    "ui.materialStatus.focus()",
    "ui.primaryAction.disabled",
    ".catch(renderFatal)",
  ]) assert.equal(source.includes(token), true, token);
  for (const forbidden of ["localStorage", "sessionStorage", "createObjectStore", "window.onerror"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("repository materials are idempotent, reloadable and project-scoped", async () => {
  require("fake-indexeddb/auto");
  global.window = globalThis;
  require("../src/yarnai/static/project-system.js");
  const system = globalThis.YarnAIProjectSystem;
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(system.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  const first = new system.ProjectRepository();
  await first.initialize();
  const owner = await first.createProject({
    title: "Materials owner",
    draft_input: { project_details_closures: { marker: "closure" }, project_initializations: { marker: "initialization" } },
  });
  const foreign = await first.createProject({ title: "Foreign project" });
  const image = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
  const savedPhoto = await first.addPhoto(owner.project_id, image, { display_name: "front.png" });
  const duplicatePhoto = await first.addPhoto(owner.project_id, image, { display_name: "front-again.png" });
  assert.equal(duplicatePhoto.photo_id, savedPhoto.photo_id);
  assert.equal((await first.getProject(owner.project_id)).photos.length, 1);
  assert.equal((await first.getPhoto(owner.project_id, savedPhoto.photo_id)).blob.size, image.size);
  assert.equal(await first.getPhoto(foreign.project_id, savedPhoto.photo_id), null);
  const pdf = new Blob(["pdf"], { type: "application/pdf" });
  const savedFile = await first.savePatternFile(owner.project_id, "workspace-pdf", pdf, { displayName: "pattern.pdf", mediaType: "application/pdf" });
  const duplicateFile = await first.savePatternFile(owner.project_id, "workspace-pdf", pdf, { displayName: "again.pdf", mediaType: "application/pdf" });
  assert.equal(duplicateFile.pattern_file_id, savedFile.pattern_file_id);
  await first.addCalculation(
    owner.project_id,
    { project_intent: { garmentType: "cardigan" } },
    {
      status: "READY",
      normalized_inputs: { width: 50 },
      axes: { width: { selected_candidate: { working_count: 100 } } },
      warnings: [],
      errors: [],
      clarifications: [],
    },
  );
  const calculatedDraft = (await first.getProject(owner.project_id)).project.draft_input;
  assert.equal(calculatedDraft.project_details_closures.marker, "closure");
  assert.equal(calculatedDraft.project_initializations.marker, "initialization");
  assert.equal(calculatedDraft.project_intent.garmentType, "cardigan");
  await first.close();
  const reopened = new system.ProjectRepository();
  await reopened.initialize();
  assert.equal((await reopened.listPatternFiles(owner.project_id)).length, 1);
  assert.equal((await reopened.getPatternFile(owner.project_id, "workspace-pdf")).blob.size, pdf.size);
  await reopened.close();
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(system.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
});
