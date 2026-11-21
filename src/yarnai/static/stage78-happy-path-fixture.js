"use strict";

// TEST/DEV ONLY: completes Stage 77 through production repository/domain APIs,
// then opens the real Stage 78 route with no Stage 78 record forged.
(function exposeStage78HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage78-happy-path-fixture.html";
  function requireApi(name) { const value = globalObject[name]; if (!value) throw new Error(`Missing fixture dependency: ${name}`); return value; }
  async function seedStage78HappyPath(options = {}) {
    requireApi("YarnAIStage70HappyPathFixture").assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem"); const stage77 = requireApi("YarnAIProjectConstructionStrategyPlanning"); const stage78 = requireApi("YarnAIProjectShapingPolicyPlanning"); const seed77 = requireApi("YarnAIStage77HappyPathFixture").seedStage77HappyPath;
    const repository = options.repository || new system.ProjectRepository(); const ownsRepository = !options.repository; const startedAt = options.startedAt || Date.now(); const at = (offset) => new Date(startedAt + offset * 1000).toISOString();
    try {
      if (ownsRepository) await repository.initialize(); const seeded = await seed77({ repository, startedAt }); const { projectId, calculationId } = seeded; let aggregate = await repository.getProject(projectId);
      const operationId = system.uuidv7(); const snapshot77 = stage77.createCompletedSnapshot(seeded.assessment77, { strategy: "body_sleeves_joined_raglan" }, { timestamp: at(96), operationId, explicitConfirmation: true });
      await repository.ensureProjectConstructionStrategyPlanning(projectId, calculationId, stage77.createProgressState(snapshot77), { expectedProjectRevision: aggregate.project.revision, timestamp: at(96), operationId });
      aggregate = await repository.getProject(projectId); const dependencies = { stage63Domain: globalObject.YarnAISwatchGauge, stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart, stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep, stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, stage70Domain: globalObject.YarnAIFoundationSectionExecutionPreparation, stage71Domain: globalObject.YarnAIFoundationSectionExecution, stage72Domain: globalObject.YarnAIFoundationSectionMeasurement, stage73Domain: globalObject.YarnAIPrimaryFabricPreparation, stage74Domain: globalObject.YarnAIPrimaryFabricExecution, stage75Domain: globalObject.YarnAIPrimaryFabricMeasurement, stage76Domain: globalObject.YarnAIProjectNextSectionPlanning, stage77Domain: stage77 };
      const assessment78 = stage78.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, ...dependencies, validatedAt: at(97) });
      if (assessment78.lifecycle !== "ready") throw new Error(assessment78.diagnostic?.code || "stage78-not-ready"); if (assessment78.firstMissingInput !== "shaping_policy") throw new Error("stage78-wrong-input"); if (await repository.getProjectShapingPolicyPlanning(projectId, calculationId)) throw new Error("stage78-must-be-absent-before-open");
      const origin = globalObject.location?.origin || "http://127.0.0.1:8000"; return Object.freeze({ projectId, calculationId, snapshot77, assessment78, url: `${origin}${stage78.ROUTE_PATH}?project=${projectId}` });
    } finally { if (ownsRepository) await repository.close().catch(() => undefined); }
  }
  async function runFixturePage() { const status = globalObject.document?.querySelector("#stage78-fixture-status"); try { if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost."); const result = await seedStage78HappyPath(); if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем выбор формирования…`; globalObject.location.replace(result.url); } catch (error) { if (status) status.textContent = `Fixture failed: ${error?.message || error}`; globalObject.console?.error?.("Stage 78 fixture failed.", error); } }
  const api = Object.freeze({ FIXTURE_PATH, seedStage78HappyPath }); globalObject.YarnAIStage78HappyPathFixture = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && globalObject.location?.pathname === FIXTURE_PATH) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runFixturePage, { once: true }); else runFixturePage(); }
})(typeof window !== "undefined" ? window : globalThis);
