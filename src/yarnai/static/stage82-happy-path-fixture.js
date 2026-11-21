"use strict";

// TEST/DEV ONLY: creates the complete Stage 79-81 predecessor chain and drives
// Stage 82 exclusively through production controllers/repositories.
(function exposeStage82HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage82-happy-path-fixture.html";
  function requireApi(name) { const value = globalObject[name]; if (!value) throw new Error(`Missing fixture dependency: ${name}`); return value; }
  async function seedStage82HappyPath(options = {}) {
    requireApi("YarnAIStage70HappyPathFixture").assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem"); const seed81 = requireApi("YarnAIStage81HappyPathFixture").seedStage81HappyPath; const application = requireApi("YarnAIProjectBodyUnderarmPhysicalConfirmationApplication"); const executionApplication = requireApi("YarnAIProjectSleevePhysicalExecutionApplication");
    const repository = options.repository || new system.ProjectRepository(); const ownsRepository = !options.repository; const startedAt = options.startedAt || Date.now(); let tick = 700; const metadata = () => ({ at: new Date(startedAt + (++tick) * 1000).toISOString(), operationId: system.uuidv7() });
    try {
      if (ownsRepository) await repository.initialize(); const seeded = await seed81({ repository, startedAt, decision: "accept" }); const { projectId, calculationId } = seeded; const controller = application.createController({ repository, projectId, throwErrors: true }); let view = await controller.load(projectId); if (view.lifecycle !== "ready") throw new Error("stage82-must-open-ready");
      view = await controller.confirmAlreadyAtBoundary(metadata()); const count = view.context.plannedBodyFullTubeStitchCount; const height = view.context.orientationUnderarmHeightCm;
      view = await controller.editResultDraft({ actualBodyFullTubeStitchCount: count, actualBodyHeightAtUnderarmCm: height, heightMeasurementPath: "lower_body_edge_to_underarm_boundary", physicalBoundaryExplicit: true, underarmStitchesHeldOrRemoved: false, deviationNote: null }, metadata());
      view = await controller.completeConfirmation({ explicitConfirmation: true }, metadata());
      if (options.scenario === "upstream-replacement") { const sleeves = executionApplication.createController({ repository, projectId, throwErrors: true }); await sleeves.startComponentRework("sleeve_1", metadata()); }
      const origin = globalObject.location?.origin || "http://127.0.0.1:8000"; return Object.freeze({ projectId, calculationId, lifecycle: view.lifecycle, url: `${origin}${application.ROUTE_METADATA.routePath}?project=${projectId}` });
    } finally { if (ownsRepository) await repository.close().catch(() => undefined); }
  }
  async function runFixturePage() { const status = globalObject.document?.querySelector("#stage82-fixture-status"); try { if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost."); const result = await seedStage82HappyPath({ scenario: new URLSearchParams(globalObject.location.search).get("scenario") }); if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем Stage 82…`; globalObject.location.replace(result.url); } catch (error) { if (status) status.textContent = `Fixture failed: ${error?.message || error}`; globalObject.console?.error?.("Stage 82 fixture failed.", error); } }
  const api = Object.freeze({ FIXTURE_PATH, seedStage82HappyPath }); globalObject.YarnAIStage82HappyPathFixture = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && globalObject.location?.pathname === FIXTURE_PATH) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runFixturePage, { once: true }); else runFixturePage(); }
})(typeof window !== "undefined" ? window : globalThis);
