"use strict";

// TEST/DEV ONLY: completes Stage 73 through production APIs, then opens the
// real primary-fabric execution route without writing directly to IndexedDB.
(function exposeStage74HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage74-happy-path-fixture.html";
  function requireApi(name) { const value = globalObject[name]; if (!value) throw new Error(`Missing fixture dependency: ${name}`); return value; }
  function stage74Assessment(aggregate, projectId, timestamp) {
    return requireApi("YarnAIPrimaryFabricExecution").assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: globalObject.YarnAISwatchGauge, stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart, stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep, stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, stage70Domain: globalObject.YarnAIFoundationSectionExecutionPreparation, stage71Domain: globalObject.YarnAIFoundationSectionExecution, stage72Domain: globalObject.YarnAIFoundationSectionMeasurement, stage73Domain: globalObject.YarnAIPrimaryFabricPreparation, validatedAt: timestamp });
  }
  async function seedStage74HappyPath(options = {}) {
    requireApi("YarnAIStage70HappyPathFixture").assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem"); const stage73 = requireApi("YarnAIPrimaryFabricPreparation"); const stage74 = requireApi("YarnAIPrimaryFabricExecution"); const seed73 = requireApi("YarnAIStage73HappyPathFixture").seedStage73HappyPath;
    const repository = options.repository || new system.ProjectRepository(); const ownsRepository = !options.repository; const startedAt = options.startedAt || Date.now(); const at = (offset) => new Date(startedAt + offset * 1000).toISOString();
    try {
      if (ownsRepository) await repository.initialize(); const seeded = await seed73({ repository, startedAt }); const { projectId, calculationId } = seeded; const operationId = system.uuidv7();
      const preparationState = stage73.createCompletedState(seeded.assessment73, { mainPattern: "Лицевая гладь", patternRepeat: "Вязать все петли лицевыми по кругу", sectionHeightCm: "30" }, { timestamp: at(70), operationId, explicitConfirmation: true });
      let aggregate = await repository.getProject(projectId); const preparation = await repository.ensurePrimaryFabricPreparation(projectId, calculationId, preparationState, { expectedProjectRevision: aggregate.project.revision, timestamp: at(70), operationId });
      aggregate = await repository.getProject(projectId); if (aggregate.progress.some((entry) => entry.kind === stage74.KIND && !entry.deleted_at)) throw new Error("stage74-must-be-absent-before-open");
      const assessment74 = stage74Assessment(aggregate, projectId, at(71)); if (assessment74.lifecycle !== "ready") throw new Error(assessment74.diagnostic?.code || "stage74-not-ready");
      const origin = globalObject.location?.origin || "http://127.0.0.1:8000"; return Object.freeze({ projectId, calculationId, preparation, assessment74, url: `${origin}${stage74.ROUTE_PATH}?project=${projectId}` });
    } finally { if (ownsRepository) await repository.close().catch(() => undefined); }
  }
  async function runFixturePage() { const status = globalObject.document?.querySelector("#stage74-fixture-status"); try { if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost."); const result = await seedStage74HappyPath(); if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем выполнение основного полотна…`; globalObject.location.replace(result.url); } catch (error) { if (status) status.textContent = `Fixture failed: ${error?.message || error}`; } }
  const api = Object.freeze({ FIXTURE_PATH, seedStage74HappyPath }); globalObject.YarnAIStage74HappyPathFixture = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && globalObject.location?.pathname === FIXTURE_PATH) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runFixturePage, { once: true }); else runFixturePage(); }
})(typeof window !== "undefined" ? window : globalThis);
