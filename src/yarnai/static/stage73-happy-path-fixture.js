"use strict";

// TEST/DEV ONLY: reaches Stage 72 TARGET_REACHED through production domain and
// repository APIs, then opens the real primary-fabric preparation route.
(function exposeStage73HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage73-happy-path-fixture.html";
  function requireApi(name) { const value = globalObject[name]; if (!value) throw new Error(`Missing fixture dependency: ${name}`); return value; }
  function stage72Assessment(aggregate, projectId, timestamp) {
    return requireApi("YarnAIFoundationSectionMeasurement").assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: globalObject.YarnAISwatchGauge, stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart, stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep, stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, stage70Domain: globalObject.YarnAIFoundationSectionExecutionPreparation, stage71Domain: globalObject.YarnAIFoundationSectionExecution, validatedAt: timestamp });
  }
  function stage73Assessment(aggregate, projectId, timestamp) {
    return requireApi("YarnAIPrimaryFabricPreparation").assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: globalObject.YarnAISwatchGauge, stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart, stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep, stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, stage70Domain: globalObject.YarnAIFoundationSectionExecutionPreparation, stage71Domain: globalObject.YarnAIFoundationSectionExecution, stage72Domain: globalObject.YarnAIFoundationSectionMeasurement, validatedAt: timestamp });
  }
  async function seedStage73HappyPath(options = {}) {
    requireApi("YarnAIStage70HappyPathFixture").assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem"); const stage72 = requireApi("YarnAIFoundationSectionMeasurement"); const stage73 = requireApi("YarnAIPrimaryFabricPreparation"); const seed72 = requireApi("YarnAIStage72HappyPathFixture").seedStage72HappyPath;
    const repository = options.repository || new system.ProjectRepository(); const ownsRepository = !options.repository; const startedAt = options.startedAt || Date.now(); const at = (offset) => new Date(startedAt + offset * 1000).toISOString();
    try {
      if (ownsRepository) await repository.initialize(); const seeded = await seed72({ repository, startedAt }); const { projectId, calculationId } = seeded;
      let aggregate = await repository.getProject(projectId); let assessment72 = stage72Assessment(aggregate, projectId, at(60)); if (assessment72.lifecycle !== "ready") throw new Error(assessment72.diagnostic?.code || "stage72-not-ready");
      let measurement = await repository.ensureFoundationSectionMeasurement(projectId, calculationId, assessment72, { expectedProjectRevision: aggregate.project.revision, timestamp: at(61) });
      aggregate = await repository.getProject(projectId); assessment72 = stage72Assessment(aggregate, projectId, at(62)); const completed = stage72.completeMeasurement(measurement.state, "5,1", { assessment: assessment72, operationId: system.uuidv7(), timestamp: at(62), expectedRevision: measurement.state.revision, expectedFingerprint: measurement.state.fingerprint, explicitConfirmation: true });
      const saved = await repository.updateFoundationSectionMeasurement(projectId, calculationId, completed, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: measurement.revision, expectedDomainRevision: measurement.state.revision, timestamp: at(62) }); measurement = saved.progress;
      if (measurement.state.completedSnapshot.result !== "TARGET_REACHED") throw new Error("stage72-target-not-reached");
      aggregate = await repository.getProject(projectId); if (aggregate.progress.some((entry) => entry.kind === stage73.KIND && !entry.deleted_at)) throw new Error("stage73-must-be-absent-before-open");
      const assessment73 = stage73Assessment(aggregate, projectId, at(63)); if (assessment73.lifecycle !== "ready") throw new Error(assessment73.diagnostic?.code || "stage73-not-ready");
      const origin = globalObject.location?.origin || "http://127.0.0.1:8000"; return Object.freeze({ projectId, calculationId, measurement, assessment73, url: `${origin}${stage73.ROUTE_PATH}?project=${projectId}` });
    } finally { if (ownsRepository) await repository.close().catch(() => undefined); }
  }
  async function runFixturePage() { const status = globalObject.document?.querySelector("#stage73-fixture-status"); try { if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost."); const result = await seedStage73HappyPath(); if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем подготовку основного полотна…`; globalObject.location.replace(result.url); } catch (error) { if (status) status.textContent = `Fixture failed: ${error?.message || error}`; } }
  const api = Object.freeze({ FIXTURE_PATH, seedStage73HappyPath }); globalObject.YarnAIStage73HappyPathFixture = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && globalObject.location?.pathname === FIXTURE_PATH) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runFixturePage, { once: true }); else runFixturePage(); }
})(typeof window !== "undefined" ? window : globalThis);
