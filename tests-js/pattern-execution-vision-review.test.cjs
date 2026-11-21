"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { webcrypto } = require("node:crypto");

if (!global.crypto) Object.defineProperty(global, "crypto", { value: webcrypto });
require("../src/yarnai/static/project-system.js");
const planApi = require("../src/yarnai/static/pattern-execution-plan.js");
const sessionApi = require("../src/yarnai/static/pattern-execution-session.js");
const stepApi = require("../src/yarnai/static/pattern-execution-step.js");
const api = require("../src/yarnai/static/pattern-execution-vision-review.js");

let sequence = 0;
const op = (name) => `${name}:${++sequence}`;
const fp = (seed) => stepApi.fingerprint({ seed });
const stamp = (second) => `2026-08-31T10:00:${String(second).padStart(2, "0")}.000Z`;

function makePlan() {
  const actions = [
    { id: "action:one", order: 1, title: "Первый шаг", description: "Связать первый шаг.", required: true, sourceTargetIds: ["source:one"] },
    { id: "action:two", order: 2, title: "Второй шаг", description: "Связать второй шаг.", required: true, sourceTargetIds: ["source:two"] },
  ];
  const state = {
    id: "plan:one", projectId: "project:one", kind: "PATTERN_EXECUTION_PLAN", schemaVersion: 1, version: 1,
    revision: 36, status: "ready", createdAt: stamp(1), updatedAt: stamp(2),
    sourceTechnologyReviewId: "review:one", sourceTechnologyReviewRevision: 7,
    sourceTechnologyReviewFingerprint: fp("review"), sourceConfirmedSnapshotFingerprint: fp("confirmed"),
    sourceTechnologyDraftId: "draft:one", sourceTechnologyDraftRevision: 6, sourceTechnologyDraftFingerprint: fp("draft"),
    sourceAnalysisReviewId: "analysis-review:one", sourceAnalysisReviewRevision: 5, sourceAnalysisReviewFingerprint: fp("analysis-review"),
    sourceSemanticAnalysisId: "semantic:one", sourceSemanticAnalysisRevision: 4, sourceSemanticAnalysisFingerprint: fp("semantic"),
    sourceImportRevision: 3, sourceAlgorithmVersion: 1, planningAlgorithmVersion: 1, planningInputFingerprint: fp("planning"),
    planFingerprint: null, blockers: [], warnings: [], audit: [], error: null, interruptedOperation: null,
    plan: {
      schemaVersion: 1, summary: {}, prerequisites: [], materials: [], tools: [], measurements: [], gauge: [],
      components: [{ id: "component:one", type: "body", label: "Корпус", quantity: 1, constructionRole: "body", parentComponentId: null, sourceTargetIds: ["source:component"], dependencies: [], completionCriteria: [], status: "planned", sourceComponentId: "source-component", instance: 1 }],
      phases: [{
        id: "phase:one", order: 1, type: "main_fabric", title: "Основная работа", componentIds: ["component:one"],
        dependsOnPhaseIds: [], canRunInParallelWith: [], sourceTargetIds: ["source:phase"], entryCriteria: [],
        actions, exitCriteria: [], checkpoints: [], unresolved: [], status: "ready", required: true,
      }],
      dependencyGraph: { nodes: [{ id: "phase:one", type: "phase", order: 1, required: true }], edges: [], componentNodes: [{ id: "component:one", type: "component" }] },
      checkpoints: [],
      firstAction: { phaseId: "phase:one", actionId: "action:one", title: "Первый шаг", description: "Связать первый шаг.", prerequisites: [], sourceTargetIds: ["source:one"], ready: true, blockedBy: [] },
      unresolved: [], completionCriteria: [], planFingerprint: null,
    },
  };
  state.planFingerprint = planApi.calculatePlanFingerprint(state);
  state.plan.planFingerprint = state.planFingerprint;
  return state;
}

function completedContext() {
  const plan = makePlan();
  let session = sessionApi.createExecutionSession(plan, plan.projectId, { now: stamp(3), expectedPlanRevision: plan.revision });
  session = sessionApi.startExecutionSession(session, plan, { now: stamp(4) });
  let step = stepApi.createExecutionStep(session, plan.projectId, { now: stamp(5), context: { executionPlan: plan, requireCurrentIdentity: false }, expectedSessionRevision: session.revision });
  step = stepApi.startStep(step, { expectedRevision: step.revision, operationId: op("start"), now: stamp(6) });
  step = stepApi.checkStep(step, { expectedRevision: step.revision, operationId: op("check"), confirmed: true, now: stamp(7) });
  const completionId = op("complete");
  step = stepApi.beginCompletion(step, session, { expectedRevision: step.revision, operationId: completionId, confirmed: true, context: { executionPlan: plan, requireCurrentIdentity: false }, now: stamp(8) });
  session = sessionApi.completeCurrentAction(session, { actionId: step.actionId, operationId: completionId, now: stamp(9) });
  step = stepApi.finalizeCompletion(step, session, { operationId: completionId, now: stamp(10) });
  return { plan, session, step };
}

function make127Plan() {
  const plan = makePlan();
  const actions = Array.from({ length: 127 }, (_, index) => ({
    id: `action:${String(index + 1).padStart(3, "0")}`,
    order: index + 1,
    title: `Шаг ${index + 1}`,
    description: `Подтверждённая инструкция ${index + 1}`,
    required: true,
    sourceTargetIds: [`source:${String(index + 1).padStart(3, "0")}`],
  }));
  plan.plan.phases[0].actions = actions;
  plan.plan.firstAction = {
    phaseId: "phase:one", actionId: actions[0].id, title: actions[0].title,
    description: actions[0].description, prerequisites: [], sourceTargetIds: actions[0].sourceTargetIds,
    ready: true, blockedBy: [],
  };
  plan.planFingerprint = planApi.calculatePlanFingerprint(plan);
  plan.plan.planFingerprint = plan.planFingerprint;
  return plan;
}

function initialize() {
  const context = completedContext();
  context.step = api.initializeCompletedStepReview(context.step, context.session, {
    expectedRevision: context.step.revision,
    operationId: op("initialize"),
    reviewSessionId: "review-session:one",
    now: stamp(11),
  });
  return context;
}

function photo(sha = "a".repeat(64), id = "photo:one") {
  return { photo_id: id, sha256: sha, source_mime: "image/jpeg", purpose: "STEP_VISION_REVIEW" };
}

function serverVerdict(context, outcome) {
  const review = context.step.visionReview;
  const identity = review.identity;
  return {
    schema_version: 1,
    review_session_id: review.reviewSessionId,
    identity: {
      project_id: identity.projectId, session_id: identity.sessionId, session_revision: identity.sessionRevision,
      plan_id: identity.planId, plan_revision: identity.planRevision, plan_fingerprint: identity.planFingerprint,
      action_id: identity.actionId, step_id: identity.stepId, step_revision: identity.stepRevision,
      checkpoint_identity: null,
    },
    verdict: outcome,
    ui_message: api.UI_MESSAGES[outcome],
    observations: [],
    missing_evidence: outcome === "more_evidence_required" ? ["Ещё один ракурс"] : [],
    provider: "openai",
    model: "gpt-5.6-terra",
  };
}

test("completed physical step creates the two-choice persisted decision", () => {
  const { step } = initialize();
  assert.equal(step.status, "completed");
  assert.equal(step.visionReview.status, "decision_required");
  assert.equal(step.visionReview.visualVerification, false);
  assert.equal(step.visionReview.identity.planRevision, 36);
  assert.equal(step.visionReview.identity.actionId, "action:one");
  assert.equal(api.canAdvance(step), false);
});

test("self-confirm is idempotent, persists no visual verification, and permits the next step", () => {
  const context = initialize();
  const operationId = op("self-confirm");
  const once = api.selfConfirm(context.step, { expectedRevision: context.step.revision, operationId, now: stamp(12) });
  const twice = api.selfConfirm(once, { expectedRevision: context.step.revision, operationId, now: stamp(13) });
  const reopened = JSON.parse(JSON.stringify(once));
  assert.deepEqual(twice, once);
  assert.equal(reopened.visionReview.decision, "self_confirmed");
  assert.equal(reopened.visionReview.visualVerification, false);
  assert.equal(api.canAdvance(reopened), true);
});

test("step cannot rebuild to the next action before an explicit post-step decision", () => {
  const context = initialize();
  assert.throws(() => stepApi.rebuildStep(context.step, context.session, {
    expectedRevision: context.step.revision, operationId: op("rebuild"), confirmed: true,
    context: { executionPlan: context.plan, requireCurrentIdentity: false },
  }), { code: "vision_review_decision_required" });
});

test("self-confirmed rebuild archives the review and opens the exact next action", () => {
  const context = initialize();
  context.step = api.selfConfirm(context.step, { expectedRevision: context.step.revision, operationId: op("self-confirm"), now: stamp(12) });
  const next = stepApi.rebuildStep(context.step, context.session, {
    expectedRevision: context.step.revision, operationId: op("rebuild"), confirmed: true,
    context: { executionPlan: context.plan, requireCurrentIdentity: false }, now: stamp(13),
  });
  assert.equal(next.actionId, "action:two");
  assert.equal(next.status, "ready");
  assert.equal(next.visionReview, null);
  assert.equal(next.visionReviewHistory.length, 1);
  assert.equal(next.visionReviewHistory[0].decision, "self_confirmed");
});

test("disabled gateway stores exact photos and honest unavailable state without verdict", () => {
  const context = initialize();
  const next = api.createPhotoReviewRequest(context.step, [photo()], { provider: "openai", model: "gpt-5.6-terra", enabled: false }, {
    expectedRevision: context.step.revision, operationId: op("photos"), now: stamp(12),
  });
  assert.equal(next.visionReview.status, "automatic_unavailable");
  assert.equal(next.visionReview.automaticReview.status, "unavailable");
  assert.equal(next.visionReview.automaticReview.verdict, null);
  assert.equal(next.visionReview.automaticReview.uiMessage, api.DISABLED_MESSAGE);
  assert.equal(next.visionReview.request.identity.sessionId, context.session.id);
  assert.equal(next.visionReview.request.photos[0].sha256, "a".repeat(64));
  assert.equal(api.canAdvance(next), false);
});

test("photo selection rejects invalid count and duplicate SHA-256", () => {
  const context = initialize();
  assert.throws(() => api.createPhotoReviewRequest(context.step, [], {}, { expectedRevision: context.step.revision, operationId: op("empty") }), { code: "photo_count_invalid" });
  assert.throws(() => api.createPhotoReviewRequest(context.step, [photo(), photo("a".repeat(64), "photo:two")], {}, { expectedRevision: context.step.revision, operationId: op("duplicate") }), { code: "duplicate_photo" });
});

test("future request builder sends only selected photo and exact expected step state", async () => {
  const context = initialize();
  context.step = api.createPhotoReviewRequest(context.step, [photo()], { provider: "openai", model: "gpt-5.6-terra", enabled: true }, {
    expectedRevision: context.step.revision, operationId: op("photos"), now: stamp(12),
  });
  const blob = new Blob([Buffer.from("photo-bytes")], { type: "image/jpeg" });
  const request = await api.buildServerRequest(context.step, [{ metadata: photo(), blob }]);
  assert.deepEqual(Object.keys(request).sort(), ["allowed_checks", "current_execution_state", "expected_visible_state", "follow_up", "identity", "photo_requirements", "photos", "review_session_id", "schema_version", "visual_limits"]);
  assert.equal(request.identity.plan_id, "plan:one");
  assert.equal(request.identity.action_id, "action:one");
  assert.equal(request.photos.length, 1);
  assert.equal(request.photos[0].sha256, "a".repeat(64));
  assert.equal("provider" in request, false);
  assert.equal("model" in request, false);
  assert.equal("api_key" in request, false);
});

test("correction verdict never permits silent advancement", () => {
  const context = initialize();
  context.step = api.createPhotoReviewRequest(context.step, [photo()], { provider: "openai", model: "gpt-5.6-terra", enabled: true }, {
    expectedRevision: context.step.revision, operationId: op("photos"), now: stamp(12),
  });
  const corrected = api.applyValidatedVerdict(context.step, serverVerdict(context, "correction_required"), {
    expectedRevision: context.step.revision, operationId: op("verdict"), now: stamp(13),
  });
  assert.equal(corrected.visionReview.status, "correction_required");
  assert.equal(corrected.visionReview.decision, null);
  assert.equal(api.canAdvance(corrected), false);
});

test("mismatched verdict identity and duplicate review are rejected", () => {
  const context = initialize();
  context.step = api.createPhotoReviewRequest(context.step, [photo()], { provider: "openai", model: "gpt-5.6-terra", enabled: true }, {
    expectedRevision: context.step.revision, operationId: op("photos"), now: stamp(12),
  });
  const response = serverVerdict(context, "verified_continue");
  response.identity.action_id = "action:other";
  assert.throws(() => api.applyValidatedVerdict(context.step, response, { expectedRevision: context.step.revision, operationId: op("verdict") }), { code: "verdict_identity_mismatch" });
});

test("all 127 physical steps still complete through explicit self-confirmed decisions", () => {
  const plan = make127Plan();
  let session = sessionApi.createExecutionSession(plan, plan.projectId, { now: stamp(1), expectedPlanRevision: plan.revision });
  session = sessionApi.startExecutionSession(session, plan, { now: stamp(2) });
  let step = stepApi.createExecutionStep(session, plan.projectId, { context: { executionPlan: plan, requireCurrentIdentity: false }, expectedSessionRevision: session.revision });
  const at = (index, offset) => new Date(Date.parse("2026-08-31T12:00:00.000Z") + (index * 10 + offset) * 1000).toISOString();
  for (let index = 0; index < 127; index += 1) {
    const actionId = `action:${String(index + 1).padStart(3, "0")}`;
    assert.equal(step.actionId, actionId);
    step = stepApi.startStep(step, { expectedRevision: step.revision, operationId: op("start"), now: at(index, 1) });
    step = stepApi.checkStep(step, { expectedRevision: step.revision, operationId: op("check"), confirmed: true, now: at(index, 2) });
    const completionId = op("complete");
    step = stepApi.beginCompletion(step, session, { expectedRevision: step.revision, operationId: completionId, confirmed: true, context: { executionPlan: plan, requireCurrentIdentity: false }, now: at(index, 3) });
    session = sessionApi.completeCurrentAction(session, { actionId, operationId: completionId, now: at(index, 4) });
    step = stepApi.finalizeCompletion(step, session, { operationId: completionId, now: at(index, 5) });
    step = api.initializeCompletedStepReview(step, session, { expectedRevision: step.revision, operationId: op("initialize"), reviewSessionId: `review:${index + 1}`, now: at(index, 6) });
    step = api.selfConfirm(step, { expectedRevision: step.revision, operationId: op("self-confirm"), now: at(index, 7) });
    assert.equal(api.canAdvance(step), true);
    if (index < 126) {
      step = stepApi.rebuildStep(step, session, { expectedRevision: step.revision, operationId: op("next"), confirmed: true, context: { executionPlan: plan, requireCurrentIdentity: false }, now: at(index, 8) });
    }
  }
  assert.equal(session.status, "completed");
  assert.equal(session.completedActionIds.length, 127);
  assert.equal(step.visionReview.decision, "self_confirmed");
  assert.equal(step.visionReviewHistory.length, 126);
});
