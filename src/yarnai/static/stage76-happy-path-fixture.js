"use strict";

// TEST/DEV ONLY: completes Stage 75 through production repository/domain APIs,
// then opens the real next-section planning route with no planning record forged.
(function exposeStage76HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage76-happy-path-fixture.html";
  function requireApi(name) { const value = globalObject[name]; if (!value) throw new Error(`Missing fixture dependency: ${name}`); return value; }
  function dependencies() { return { stage63Domain: globalObject.YarnAISwatchGauge, stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart, stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep, stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, stage70Domain: globalObject.YarnAIFoundationSectionExecutionPreparation, stage71Domain: globalObject.YarnAIFoundationSectionExecution, stage72Domain: globalObject.YarnAIFoundationSectionMeasurement, stage73Domain: globalObject.YarnAIPrimaryFabricPreparation, stage74Domain: globalObject.YarnAIPrimaryFabricExecution }; }
  async function seedStage76HappyPath(options = {}) {
    requireApi("YarnAIStage70HappyPathFixture").assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem"); const stage75 = requireApi("YarnAIPrimaryFabricMeasurement"); const planning = requireApi("YarnAIProjectNextSectionPlanning"); const seed75 = requireApi("YarnAIStage75HappyPathFixture").seedStage75HappyPath;
    const repository = options.repository || new system.ProjectRepository(); const ownsRepository = !options.repository; const startedAt = options.startedAt || Date.now(); const at = (offset) => new Date(startedAt + offset * 1000).toISOString();
    try {
      if (ownsRepository) await repository.initialize(); const seeded = await seed75({ repository, startedAt }); const { projectId, calculationId } = seeded; let aggregate = await repository.getProject(projectId);
      let assessment75 = stage75.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, ...dependencies(), validatedAt: at(90) });
      let measurement = await repository.ensurePrimaryFabricMeasurement(projectId, calculationId, assessment75, { expectedProjectRevision: aggregate.project.revision, timestamp: at(91) });
      aggregate = await repository.getProject(projectId); assessment75 = stage75.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, ...dependencies(), validatedAt: at(92) });
      const operationId = system.uuidv7(); const completed = stage75.completeMeasurement(measurement.state, "30", { assessment: assessment75, operationId, timestamp: at(92), expectedRevision: measurement.state.revision, expectedFingerprint: measurement.state.fingerprint, explicitConfirmation: true });
      const saved = await repository.updatePrimaryFabricMeasurement(projectId, calculationId, completed, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: measurement.revision, expectedDomainRevision: measurement.state.revision, timestamp: at(92), operationId }); measurement = saved.progress;
      if (measurement.state.completedSnapshot.result !== "TARGET_REACHED") throw new Error("stage75-target-not-reached");
      aggregate = await repository.getProject(projectId); const assessment76 = planning.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, ...dependencies(), stage75Domain: stage75, validatedAt: at(93) });
      if (assessment76.lifecycle !== "ready") throw new Error(assessment76.diagnostic?.code || "stage76-not-ready");
      if (await repository.getProjectNextSectionPlanning(projectId, calculationId)) throw new Error("stage76-must-be-absent-before-open");
      const origin = globalObject.location?.origin || "http://127.0.0.1:8000"; return Object.freeze({ projectId, calculationId, measurement, assessment76, url: `${origin}${planning.ROUTE_PATH}?project=${projectId}` });
    } finally { if (ownsRepository) await repository.close().catch(() => undefined); }
  }
  async function runFixturePage() { const status = globalObject.document?.querySelector("#stage76-fixture-status"); try { if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost."); const result = await seedStage76HappyPath(); if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем планирование следующего участка…`; globalObject.location.replace(result.url); } catch (error) { if (status) status.textContent = `Fixture failed: ${error?.message || error}`; } }
  const api = Object.freeze({ FIXTURE_PATH, seedStage76HappyPath }); globalObject.YarnAIStage76HappyPathFixture = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && globalObject.location?.pathname === FIXTURE_PATH) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runFixturePage, { once: true }); else runFixturePage(); }
})(typeof window !== "undefined" ? window : globalThis);
