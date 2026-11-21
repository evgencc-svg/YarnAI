"use strict";

// TEST/DEV ONLY: creates the authoritative Stage 60-70 chain through normal
// repository operations, then opens the real foundation execution workspace.
(function exposeStage71HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage71-happy-path-fixture.html";
  function requireApi(name) { const value = globalObject[name]; if (!value) throw new Error(`Missing fixture dependency: ${name}`); return value; }
  async function seedStage71HappyPath(options = {}) {
    requireApi("YarnAIStage70HappyPathFixture").assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem"); const seed70 = requireApi("YarnAIStage70HappyPathFixture").seedStage70HappyPath;
    const stage70 = requireApi("YarnAIFoundationSectionExecutionPreparation"); const stage71 = requireApi("YarnAIFoundationSectionExecution");
    const repository = options.repository || new system.ProjectRepository(); const ownsRepository = !options.repository;
    const startedAt = options.startedAt || Date.now(); const at = (offset) => new Date(startedAt + offset * 1000).toISOString(); const operationId = () => system.uuidv7();
    try {
      if (ownsRepository) await repository.initialize();
      const seeded = await seed70({ repository, startedAt }); const { projectId, calculationId } = seeded;
      let aggregate = await repository.getProject(projectId);
      const assess70 = (revision = null) => stage70.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: globalObject.YarnAISwatchGauge, stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart, stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep, stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, preparationProgressRevision: revision, validatedAt: at(40) });
      let assessment70 = assess70(); let state70 = stage70.createInitialState(assessment70, { createdAt: at(41) });
      let record70 = await repository.ensureFoundationSectionExecutionPreparation(projectId, calculationId, state70, { expectedProjectRevision: aggregate.project.revision, timestamp: at(41) });
      aggregate = await repository.getProject(projectId); assessment70 = assess70(record70.revision);
      state70 = stage70.editDraft(record70.state, { ribPattern: "rib_1x1", workingMethod: "in_round", tool: "круговые спицы пользователя", instruction: "Вязать попеременно 1 лицевую и 1 изнаночную петлю по кругу.", instructionAttested: true, measurementAcknowledged: true }, { assessment: assessment70, timestamp: at(42), operationId: operationId() });
      record70 = await repository.updateFoundationSectionExecutionPreparation(projectId, calculationId, state70, { expectedProgressRevision: record70.revision, expectedDomainRevision: record70.state.revision, timestamp: at(42) });
      aggregate = await repository.getProject(projectId); assessment70 = assess70(record70.revision);
      state70 = stage70.startReviewing(record70.state, { assessment: assessment70, timestamp: at(43), operationId: operationId() });
      record70 = await repository.updateFoundationSectionExecutionPreparation(projectId, calculationId, state70, { expectedProgressRevision: record70.revision, expectedDomainRevision: record70.state.revision, timestamp: at(43) });
      aggregate = await repository.getProject(projectId); assessment70 = assess70(record70.revision);
      state70 = stage70.complete(record70.state, { assessment: assessment70, timestamp: at(44), operationId: operationId(), explicitConfirmation: true });
      record70 = await repository.updateFoundationSectionExecutionPreparation(projectId, calculationId, state70, { expectedProgressRevision: record70.revision, expectedDomainRevision: record70.state.revision, timestamp: at(44) });
      aggregate = await repository.getProject(projectId);
      const assessment71 = stage71.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: globalObject.YarnAISwatchGauge, stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart, stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep, stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, stage70Domain: stage70, validatedAt: at(45) });
      if (assessment71.lifecycle !== "ready") throw new Error(assessment71.diagnostic?.code || "stage71-fixture-not-ready");
      if (assessment71.executionPlan.target?.value !== 5 || assessment71.executionPlan.rowEstimate !== null) throw new Error("stage71-plan-invalid");
      if (await repository.getFoundationSectionExecution(projectId, calculationId)) throw new Error("stage71-must-be-absent-before-open");
      return Object.freeze({ projectId, calculationId, aggregate, stage70Record: record70, assessment71, url: `${globalObject.location?.origin || "http://127.0.0.1:8000"}/project-foundation-section-execution?project=${projectId}` });
    } finally { if (ownsRepository) await repository.close().catch(() => undefined); }
  }
  async function runFixturePage() {
    const status = globalObject.document?.querySelector("#stage71-fixture-status");
    try { if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost."); const result = await seedStage71HappyPath(); if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем выполнение резинки…`; globalObject.location.replace(result.url); }
    catch (error) { if (status) status.textContent = `Fixture failed: ${error?.message || error}`; }
  }
  const api = Object.freeze({ FIXTURE_PATH, seedStage71HappyPath }); globalObject.YarnAIStage71HappyPathFixture = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && globalObject.location?.pathname === FIXTURE_PATH) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runFixturePage, { once: true }); else runFixturePage(); }
})(typeof window !== "undefined" ? window : globalThis);
