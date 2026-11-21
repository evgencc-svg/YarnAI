"use strict";

// TEST/DEV ONLY: completes Stage 76 through production repository/domain APIs,
// then opens the real Stage 77 route with no Stage 77 record forged.
(function exposeStage77HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage77-happy-path-fixture.html";
  function requireApi(name) { const value = globalObject[name]; if (!value) throw new Error(`Missing fixture dependency: ${name}`); return value; }
  async function seedStage77HappyPath(options = {}) {
    requireApi("YarnAIStage70HappyPathFixture").assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem"); const stage76 = requireApi("YarnAIProjectNextSectionPlanning"); const stage77 = requireApi("YarnAIProjectConstructionStrategyPlanning"); const seed76 = requireApi("YarnAIStage76HappyPathFixture").seedStage76HappyPath;
    const repository = options.repository || new system.ProjectRepository(); const ownsRepository = !options.repository; const startedAt = options.startedAt || Date.now(); const at = (offset) => new Date(startedAt + offset * 1000).toISOString();
    try {
      if (ownsRepository) await repository.initialize(); const seeded = await seed76({ repository, startedAt }); const { projectId, calculationId } = seeded; let aggregate = await repository.getProject(projectId);
      const operationId = system.uuidv7(); const snapshot76 = stage76.createCompletedSnapshot(seeded.assessment76, { direction: "bottom_up" }, { timestamp: at(94), operationId, explicitConfirmation: true });
      await repository.ensureProjectNextSectionPlanning(projectId, calculationId, stage76.createProgressState(snapshot76), { expectedProjectRevision: aggregate.project.revision, timestamp: at(94), operationId });
      aggregate = await repository.getProject(projectId); const dependencies = { stage63Domain: globalObject.YarnAISwatchGauge, stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart, stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep, stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, stage70Domain: globalObject.YarnAIFoundationSectionExecutionPreparation, stage71Domain: globalObject.YarnAIFoundationSectionExecution, stage72Domain: globalObject.YarnAIFoundationSectionMeasurement, stage73Domain: globalObject.YarnAIPrimaryFabricPreparation, stage74Domain: globalObject.YarnAIPrimaryFabricExecution, stage75Domain: globalObject.YarnAIPrimaryFabricMeasurement, stage76Domain: stage76 };
      const assessment77 = stage77.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, ...dependencies, validatedAt: at(95) });
      if (assessment77.lifecycle !== "ready") throw new Error(assessment77.diagnostic?.code || "stage77-not-ready"); if (assessment77.knownInputs.constructionDirection !== "bottom_up") throw new Error("stage77-direction-not-bottom-up"); if (await repository.getProjectConstructionStrategyPlanning(projectId, calculationId)) throw new Error("stage77-must-be-absent-before-open");
      const origin = globalObject.location?.origin || "http://127.0.0.1:8000"; return Object.freeze({ projectId, calculationId, snapshot76, assessment77, url: `${origin}${stage77.ROUTE_PATH}?project=${projectId}` });
    } finally { if (ownsRepository) await repository.close().catch(() => undefined); }
  }
  async function runFixturePage() { const status = globalObject.document?.querySelector("#stage77-fixture-status"); try { if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost."); const result = await seedStage77HappyPath(); if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем выбор конструкции…`; globalObject.location.replace(result.url); } catch (error) { if (status) status.textContent = `Fixture failed: ${error?.message || error}`; globalObject.console?.error?.("Stage 77 fixture failed.", error); } }
  const api = Object.freeze({ FIXTURE_PATH, seedStage77HappyPath }); globalObject.YarnAIStage77HappyPathFixture = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && globalObject.location?.pathname === FIXTURE_PATH) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runFixturePage, { once: true }); else runFixturePage(); }
})(typeof window !== "undefined" ? window : globalThis);
