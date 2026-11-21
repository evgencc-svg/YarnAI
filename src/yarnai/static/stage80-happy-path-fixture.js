"use strict";

// TEST/DEV ONLY: completes the authoritative Stage 79 plan through production APIs,
// then opens Stage 80 without forging a progress record or weakening validation.
(function exposeStage80HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage80-happy-path-fixture.html";
  function requireApi(name) { const value = globalObject[name]; if (!value) throw new Error(`Missing fixture dependency: ${name}`); return value; }
  async function seedStage80HappyPath(options = {}) {
    requireApi("YarnAIStage70HappyPathFixture").assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem"); const planning = requireApi("YarnAIProjectSleeveTargetGeometryPlanning"); const planningApplication = requireApi("YarnAIProjectSleeveTargetGeometryPlanningApplication"); const executionApplication = requireApi("YarnAIProjectSleevePhysicalExecutionApplication"); const seed79 = requireApi("YarnAIStage79HappyPathFixture").seedStage79HappyPath;
    const repository = options.repository || new system.ProjectRepository(); const ownsRepository = !options.repository; const startedAt = options.startedAt || Date.now(); let tick = 120; const metadata = () => ({ at: new Date(startedAt + (++tick) * 1000).toISOString(), operationId: system.uuidv7() });
    try {
      if (ownsRepository) await repository.initialize(); const seeded = await seed79({ repository, startedAt }); const { projectId, calculationId } = seeded; const app = planningApplication.createController({ repository, projectId, throwErrors: true });
      await app.loadOrStart(projectId); await app.collectCuffCircumference("20", metadata()); await app.collectUpperCircumference("30", metadata()); await app.collectCuffToUnderarmLength("40", metadata());
      const current = await repository.getProjectSleeveTargetGeometryPlanning(projectId, calculationId); const pattern = { ...current.state.construction.mainPattern, source_identity: "stage80-fixture:cuff", source_fingerprint: planning.fingerprint({ fixture: "stage80", purpose: "independent-cuff-gauge-context" }), origin: "user_override" };
      await app.overrideCuff({ pattern, targetHeightCm: "5", transitionIdentity: "cuff-to-main-same-count-pattern-change:v1" }, metadata()); await app.bindCuffGauge({ explicitConfirmation: true }, metadata()); await app.bindMainGauge({ explicitConfirmation: true }, metadata()); const review = await app.enterReview({}, metadata()); await app.confirmReview(review.review.reviewFingerprint, metadata());
      if (await repository.getProjectSleevePhysicalExecution(projectId, calculationId)) throw new Error("stage80-must-be-absent-before-first-physical-action");
      const origin = globalObject.location?.origin || "http://127.0.0.1:8000"; return Object.freeze({ projectId, calculationId, url: `${origin}${executionApplication.ROUTE_METADATA.routePath}?project=${projectId}` });
    } finally { if (ownsRepository) await repository.close().catch(() => undefined); }
  }
  async function runFixturePage() { const status = globalObject.document?.querySelector("#stage80-fixture-status"); try { if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost."); const result = await seedStage80HappyPath(); if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем физическое выполнение рукавов…`; globalObject.location.replace(result.url); } catch (error) { if (status) status.textContent = `Fixture failed: ${error?.message || error}`; globalObject.console?.error?.("Stage 80 fixture failed.", error); } }
  const api = Object.freeze({ FIXTURE_PATH, seedStage80HappyPath }); globalObject.YarnAIStage80HappyPathFixture = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && globalObject.location?.pathname === FIXTURE_PATH) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runFixturePage, { once: true }); else runFixturePage(); }
})(typeof window !== "undefined" ? window : globalThis);
