"use strict";

// TEST/DEV ONLY: creates a disposable, contract-valid execution plan/session/
// completed step using public domain and repository APIs, then opens the real UI.
(function runVisionReviewHappyPathFixture(globalObject) {
  const CANONICAL_ORIGINS = Object.freeze([
    "http://127.0.0.1:8000",
    "http://localhost:8000",
  ]);

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function assertIsolated() {
    const location = globalObject.location;
    if (CANONICAL_ORIGINS.includes(location.origin)) {
      fail("FIXTURE_PRODUCTION_STORAGE_FORBIDDEN", "Fixture cannot use canonical YarnAI storage.");
    }
    if (!["127.0.0.1", "localhost"].includes(location.hostname)) {
      fail("FIXTURE_NONLOCAL_ORIGIN_FORBIDDEN", "Fixture is available only on localhost.");
    }
    if (new URLSearchParams(location.search).get("testStorage") !== "isolated") {
      fail("FIXTURE_ISOLATION_MARKER_REQUIRED", "Fixture requires testStorage=isolated.");
    }
  }

  function requireApi(name) {
    const api = globalObject[name];
    if (!api) fail("FIXTURE_DEPENDENCY_MISSING", `Missing fixture dependency: ${name}`);
    return api;
  }

  function fingerprint(stepApi, seed) {
    return stepApi.fingerprint({ seed });
  }

  function makePlan(stepApi, planApi, system, projectId, sourceIdentity, planningInputFingerprint) {
    const action = {
      id: "action:fixture",
      order: 1,
      title: "Контрольный одноразовый шаг",
      description: "Завершённый шаг для проверки двух честных вариантов после вязания.",
      required: true,
      sourceTargetIds: ["source:fixture"],
    };
    const plan = {
      id: system.uuidv7(), projectId, kind: "PATTERN_EXECUTION_PLAN", schemaVersion: 1, version: 1,
      revision: 1, status: "ready", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      ...sourceIdentity,
      planningAlgorithmVersion: planApi.PLANNING_ALGORITHM_VERSION,
      planningInputFingerprint, planFingerprint: null,
      blockers: [], warnings: [], audit: [], error: null, interruptedOperation: null,
      plan: {
        schemaVersion: 1, summary: {}, prerequisites: [], materials: [], tools: [], measurements: [], gauge: [],
        components: [{
          id: "component:fixture", type: "body", label: "Контрольная деталь", quantity: 1,
          constructionRole: "body", parentComponentId: null, sourceTargetIds: ["source:component"],
          dependencies: [], completionCriteria: [], status: "planned", sourceComponentId: "source-component", instance: 1,
        }],
        phases: [{
          id: "phase:fixture", order: 1, type: "main_fabric", title: "Контрольная работа",
          componentIds: ["component:fixture"], dependsOnPhaseIds: [], canRunInParallelWith: [],
          sourceTargetIds: ["source:phase"], entryCriteria: [], actions: [action], exitCriteria: [],
          checkpoints: [], unresolved: [], status: "ready", required: true,
        }],
        dependencyGraph: {
          nodes: [{ id: "phase:fixture", type: "phase", order: 1, required: true }],
          edges: [], componentNodes: [{ id: "component:fixture", type: "component" }],
        },
        checkpoints: [],
        firstAction: {
          phaseId: "phase:fixture", actionId: action.id, title: action.title, description: action.description,
          prerequisites: [], sourceTargetIds: action.sourceTargetIds, ready: true, blockedBy: [],
        },
        unresolved: [], completionCriteria: [], planFingerprint: null,
      },
    };
    plan.planFingerprint = planApi.calculatePlanFingerprint(plan);
    plan.plan.planFingerprint = plan.planFingerprint;
    return plan;
  }

  async function seed() {
    assertIsolated();
    const system = requireApi("YarnAIProjectSystem");
    const planApi = requireApi("YarnAIPatternExecutionPlan");
    const sessionApi = requireApi("YarnAIPatternExecutionSession");
    const stepApi = requireApi("YarnAIPatternExecutionStep");
    const repository = new system.ProjectRepository();
    await repository.initialize();
    const project = await repository.createProject({
      title: "TEST ONLY — visual review isolated fixture",
      notes: "Disposable isolated-origin UI evidence; never use as a real project.",
    });
    const added = await repository.addCalculation(project.project_id, { axes: [] }, {
      status: "READY", axes: {}, warnings: [], errors: [], clarifications: [],
    });
    const calculationId = added.calculation.calculation_id;
    const semantic = {
      id: system.uuidv7(), projectId: project.project_id, kind: "PATTERN_SEMANTIC_ANALYSIS",
      version: 1, revision: 4, status: "completed", sourceImportRevision: 3,
    };
    await repository.ensureCalculationProgress(project.project_id, calculationId, semantic.kind, semantic);
    const analysis = {
      id: system.uuidv7(), projectId: project.project_id, kind: "PATTERN_ANALYSIS_REVIEW",
      version: 1, revision: 5, status: "needs_attention", sourceSemanticAnalysisId: semantic.id,
      sourceSemanticAnalysisRevision: 4, sourceImportRevision: 3, reviewedData: { items: [], conflictGroups: [] },
    };
    await repository.ensureCalculationProgress(project.project_id, calculationId, analysis.kind, analysis);
    const draftSnapshot = { projectId: project.project_id, sourceSemanticAnalysisId: semantic.id };
    const draft = {
      id: system.uuidv7(), projectId: project.project_id, sourceProjectId: project.project_id,
      kind: "PATTERN_TECHNOLOGY_DRAFT", version: 1, revision: 6, status: "waiting",
      immutableSourceSnapshot: draftSnapshot, immutableSourceFingerprint: stepApi.fingerprint(draftSnapshot),
      sourceConfirmedFingerprint: stepApi.fingerprint(draftSnapshot), sourceReviewId: analysis.id,
      sourceSemanticAnalysisId: semantic.id, sourceImportRevision: 3,
      draftFingerprint: stepApi.fingerprint({}), algorithmVersion: 1, audit: [],
    };
    const draftProgress = await repository.ensureCalculationProgress(project.project_id, calculationId, draft.kind, draft);
    const reviewId = system.uuidv7();
    const reviewSnapshot = {
      reviewIdentity: { id: reviewId, revision: 7, projectId: project.project_id },
      reviewRevision: 7,
      sourceDraftIdentity: { id: draft.id, revision: 6, algorithmVersion: 1, projectId: project.project_id },
      sourceReviewIdentity: { id: analysis.id, revision: 5, projectId: project.project_id },
      sourceSemanticIdentity: { id: semantic.id, revision: 4, projectId: project.project_id },
      sourceImportRevision: 3,
      sourceFingerprints: { draft: draft.draftFingerprint },
      finalDraft: { projectSummary: { projectId: project.project_id } },
      confirmedValues: [],
      validation: {},
      confirmedSnapshotFingerprint: null,
    };
    reviewSnapshot.confirmedSnapshotFingerprint = planApi.confirmedSnapshotFingerprint(reviewSnapshot);
    const review = {
      id: reviewId, projectId: project.project_id, kind: "PATTERN_TECHNOLOGY_REVIEW",
      version: 1, revision: 7, status: "confirmed", sourceDraftProgressId: draftProgress.progress_id,
      sourceDraftId: draft.id, sourceDraftRevision: 6, sourceDraftFingerprint: draft.draftFingerprint,
      sourceDraftAlgorithmVersion: 1, sourceReviewId: analysis.id, sourceReviewRevision: 5,
      sourceSemanticAnalysisId: semantic.id, sourceSemanticAnalysisRevision: 4, sourceImportRevision: 3,
      confirmedSnapshot: reviewSnapshot, confirmedSnapshotFingerprint: reviewSnapshot.confirmedSnapshotFingerprint,
      immutableSourceSnapshot: reviewSnapshot,
      immutableSourceSnapshotFingerprint: stepApi.fingerprint(reviewSnapshot),
      sourceValidationFingerprint: stepApi.fingerprint(reviewSnapshot.validation), reviewState: { targets: [] },
      decisions: [], corrections: [], audit: [],
    };
    await repository.ensureCalculationProgress(project.project_id, calculationId, review.kind, review);
    const sourceIdentity = planApi.sourceIdentity(review);
    const plan = makePlan(
      stepApi, planApi, system, project.project_id, sourceIdentity,
      planApi.planningInputFingerprint(review, planApi.PLANNING_ALGORITHM_VERSION),
    );
    await repository.ensureCalculationProgress(project.project_id, calculationId, plan.kind, plan);
    let session = sessionApi.createExecutionSession(plan, project.project_id, { expectedPlanRevision: plan.revision });
    session = sessionApi.startExecutionSession(session, plan);
    await repository.ensureCalculationProgress(project.project_id, calculationId, session.kind, session);
    let step = stepApi.createExecutionStep(session, project.project_id, {
      context: { executionPlan: plan, requireCurrentIdentity: false }, expectedSessionRevision: session.revision,
    });
    await repository.ensurePatternExecutionStep(project.project_id, calculationId, step);
    step = stepApi.startStep(step, { expectedRevision: step.revision, operationId: system.uuidv7() });
    await repository.updatePatternExecutionStep(project.project_id, calculationId, step);
    step = stepApi.checkStep(step, {
      expectedRevision: step.revision, operationId: system.uuidv7(), confirmed: true,
    });
    await repository.updatePatternExecutionStep(project.project_id, calculationId, step);
    const completionOperationId = system.uuidv7();
    step = stepApi.beginCompletion(step, session, {
      expectedRevision: step.revision, operationId: completionOperationId, confirmed: true,
      context: { executionPlan: plan, requireCurrentIdentity: false },
    });
    await repository.updatePatternExecutionStep(project.project_id, calculationId, step);
    await repository.syncPatternExecutionStepCompletion(project.project_id, calculationId, {
      stepState: step, expectedSessionRevision: session.revision, operationId: completionOperationId,
    });
    session = (await repository.getPatternExecutionSession(project.project_id, calculationId)).state;
    step = stepApi.finalizeCompletion(step, session, { operationId: completionOperationId });
    await repository.updatePatternExecutionStep(project.project_id, calculationId, step);
    const inspected = stepApi.inspectAggregate(await repository.getProject(project.project_id));
    if (inspected.state === "stale") {
      fail("FIXTURE_STEP_STALE", JSON.stringify(inspected.stale?.errors || inspected.reasonCode));
    }
    await repository.close();
    globalObject.__YARNAI_VISION_FIXTURE__ = Object.freeze({ projectId: project.project_id, calculationId });
    globalObject.location.assign(`/pattern-execution-step?project=${encodeURIComponent(project.project_id)}`);
  }

  globalObject.addEventListener("DOMContentLoaded", () => {
    seed().catch((error) => {
      globalObject.__YARNAI_VISION_FIXTURE_ERROR__ = { code: error.code || "FIXTURE_FAILED", message: error.message };
      const status = globalObject.document.getElementById("fixture-status");
      if (status) status.textContent = `${error.code || "FIXTURE_FAILED"}: ${error.message}`;
    });
  }, { once: true });
})(globalThis);
