"use strict";

// TEST/DEV ONLY: completes Stage 78 through production repository/domain APIs,
// then opens the real Stage 79 route without forging a Stage 79 record.
(function exposeStage79HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage79-happy-path-fixture.html";
  function requireApi(name) { const value = globalObject[name]; if (!value) throw new Error(`Missing fixture dependency: ${name}`); return value; }
  async function seedStage79HappyPath(options = {}) {
    requireApi("YarnAIStage70HappyPathFixture").assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem"); const stage78 = requireApi("YarnAIProjectShapingPolicyPlanning"); const application = requireApi("YarnAIProjectSleeveTargetGeometryPlanningApplication"); const seed78 = requireApi("YarnAIStage78HappyPathFixture").seedStage78HappyPath;
    const repository = options.repository || new system.ProjectRepository(); const ownsRepository = !options.repository; const startedAt = options.startedAt || Date.now(); const at = (offset) => new Date(startedAt + offset * 1000).toISOString();
    try {
      if (ownsRepository) await repository.initialize(); const seeded = await seed78({ repository, startedAt }); const { projectId, calculationId } = seeded; let aggregate = await repository.getProject(projectId); const operationId = system.uuidv7();
      const snapshot78 = stage78.createCompletedSnapshot(seeded.assessment78, { policy: "raglan_synchronized" }, { timestamp: at(102), operationId, explicitConfirmation: true });
      await repository.ensureProjectShapingPolicyPlanning(projectId, calculationId, stage78.createProgressState(snapshot78), { expectedProjectRevision: aggregate.project.revision, timestamp: at(102), operationId });
      aggregate = await repository.getProject(projectId); const sources = application.reconstructAuthoritativeSources({ aggregate, validatedAt: at(103) }); if (sources.stage78_outcome_status !== "blocked_on_prerequisites") throw new Error("stage79-source-not-ready"); if (await repository.getProjectSleeveTargetGeometryPlanning(projectId, calculationId)) throw new Error("stage79-must-be-absent-before-open");
      const origin = globalObject.location?.origin || "http://127.0.0.1:8000"; return Object.freeze({ projectId, calculationId, snapshot78, sources, url: `${origin}${application.ROUTE_METADATA.routePath}?project=${projectId}` });
    } finally { if (ownsRepository) await repository.close().catch(() => undefined); }
  }
  async function runFixturePage() { const status = globalObject.document?.querySelector("#stage79-fixture-status"); try { if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost."); const result = await seedStage79HappyPath(); if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем планирование рукава…`; globalObject.location.replace(result.url); } catch (error) { if (status) status.textContent = `Fixture failed: ${error?.message || error}`; globalObject.console?.error?.("Stage 79 fixture failed.", error); } }
  const api = Object.freeze({ FIXTURE_PATH, seedStage79HappyPath }); globalObject.YarnAIStage79HappyPathFixture = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && globalObject.location?.pathname === FIXTURE_PATH) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runFixturePage, { once: true }); else runFixturePage(); }
})(typeof window !== "undefined" ? window : globalThis);
