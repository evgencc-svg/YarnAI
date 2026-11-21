"use strict";

// TEST/DEV ONLY: builds both immutable Stage 80 physical results through production
// controllers, then leaves Stage 81 ready (or performs an explicitly requested decision).
(function exposeStage81HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage81-happy-path-fixture.html";
  function requireApi(name) { const value = globalObject[name]; if (!value) throw new Error(`Missing fixture dependency: ${name}`); return value; }
  async function seedStage81HappyPath(options = {}) {
    requireApi("YarnAIStage70HappyPathFixture").assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem"); const executionApplication = requireApi("YarnAIProjectSleevePhysicalExecutionApplication"); const validationApplication = requireApi("YarnAIProjectSleevePairValidationApplication"); const seed80 = requireApi("YarnAIStage80HappyPathFixture").seedStage80HappyPath;
    const repository = options.repository || new system.ProjectRepository(); const ownsRepository = !options.repository; const startedAt = options.startedAt || Date.now(); let tick = 300; const metadata = () => ({ at: new Date(startedAt + (++tick) * 1000).toISOString(), operationId: system.uuidv7() });
    try {
      if (ownsRepository) await repository.initialize(); const seeded = await seed80({ repository, startedAt }); const { projectId, calculationId } = seeded; const execution = executionApplication.createController({ repository, projectId, throwErrors: true });
      const initial = await execution.load(projectId); const planned = initial.preparation.planned; const scenario = options.scenario === "difference" ? "difference" : "exact";
      async function complete(slot) {
        await execution.startComponent(slot, metadata()); await execution.confirmCuffCount(slot, planned.cuffStitchCount, metadata()); await execution.declareTargetReached(slot, metadata()); await execution.openResultReview(slot, metadata());
        const differs = scenario === "difference" && slot === "sleeve_2"; const length = differs ? String(Number(planned.cuffToUnderarmLengthCm) + 1) : String(planned.cuffToUnderarmLengthCm);
        await execution.editResultDraft(slot, { actualCuffStitchCount: planned.cuffStitchCount, actualUnderarmFullTubeStitchCount: planned.underarmFullTubeStitchCount, actualCuffToUnderarmLengthCm: length, actualCuffCircumferenceCm: String(planned.cuffTargetCircumferenceCm), actualUpperSleeveCircumferenceCm: String(planned.upperSleeveTargetCircumferenceCm), actualIncreaseEventCount: planned.increaseEventCount, completionBoundary: "full_sleeve_tube_at_underarm_before_allocation", deviationNote: differs ? "Test/dev fixture: visible length difference." : null, observedRoundCount: 80 }, metadata());
        await execution.completeComponent(slot, metadata());
      }
      await complete("sleeve_1"); await complete("sleeve_2");
      if (await repository.getProjectSleevePairValidation(projectId, calculationId)) throw new Error("stage81-must-be-absent-before-first-pair-action");
      const validation = validationApplication.createController({ repository, projectId, throwErrors: true }); let view = await validation.load(projectId);
      if (options.decision) {
        view = await validation.startPairReview(metadata());
        if (options.decision === "accept") view = await validation.completePairDecision({ decision: "accept_pair", acceptanceNote: scenario === "difference" ? "Test/dev fixture explicit acceptance." : null, reworkComponents: [], explicitConfirmation: true }, metadata());
        else if (options.decision === "rework") view = await validation.completePairDecision({ decision: "rework", acceptanceNote: null, reworkComponents: [options.reworkComponent === "sleeve_2" ? "sleeve_2" : "sleeve_1"], explicitConfirmation: true }, metadata());
      }
      const origin = globalObject.location?.origin || "http://127.0.0.1:8000"; return Object.freeze({ projectId, calculationId, scenario, lifecycle: view.lifecycle, url: `${origin}${validationApplication.ROUTE_METADATA.routePath}?project=${projectId}` });
    } finally { if (ownsRepository) await repository.close().catch(() => undefined); }
  }
  async function runFixturePage() { const status = globalObject.document?.querySelector("#stage81-fixture-status"); try { if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost."); const params = new URLSearchParams(globalObject.location.search); const result = await seedStage81HappyPath({ scenario: params.get("scenario"), decision: params.get("decision"), reworkComponent: params.get("component") }); if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем проверку пары рукавов…`; globalObject.location.replace(result.url); } catch (error) { if (status) status.textContent = `Fixture failed: ${error?.message || error}`; globalObject.console?.error?.("Stage 81 fixture failed.", error); } }
  const api = Object.freeze({ FIXTURE_PATH, seedStage81HappyPath }); globalObject.YarnAIStage81HappyPathFixture = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && globalObject.location?.pathname === FIXTURE_PATH) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runFixturePage, { once: true }); else runFixturePage(); }
})(typeof window !== "undefined" ? window : globalThis);
