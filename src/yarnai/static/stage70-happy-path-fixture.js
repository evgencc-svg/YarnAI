"use strict";

// TEST/DEV ONLY: builds a disposable, production-valid Stage 60-69 chain in
// the normal project repository, then leaves Stage 70 absent for the real UI.
(function exposeStage70HappyPathFixture(globalObject) {
  const FIXTURE_PATH = "/static/stage70-happy-path-fixture.html";
  const CANONICAL_PRODUCTION_ORIGINS = Object.freeze([
    "http://127.0.0.1:8000",
    "http://localhost:8000",
  ]);

  function fixtureIsolationError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function assertIsolatedFixtureEnvironment() {
    const location = globalObject.location;
    if (!globalObject.document || !location) return;
    if (CANONICAL_PRODUCTION_ORIGINS.includes(location.origin)) {
      throw fixtureIsolationError(
        "FIXTURE_PRODUCTION_STORAGE_FORBIDDEN",
        "Test/dev fixture cannot use the canonical YarnAI production origin.",
      );
    }
    if (!["127.0.0.1", "localhost"].includes(location.hostname)) {
      throw fixtureIsolationError(
        "FIXTURE_NONLOCAL_ORIGIN_FORBIDDEN",
        "Test/dev fixture is available only on an isolated localhost origin.",
      );
    }
    if (new URLSearchParams(location.search || "").get("testStorage") !== "isolated") {
      throw fixtureIsolationError(
        "FIXTURE_ISOLATION_MARKER_REQUIRED",
        "Test/dev fixture requires an explicit isolated test-storage marker.",
      );
    }
  }

  function requireApi(name) {
    const value = globalObject[name];
    if (!value) throw new Error(`Missing fixture dependency: ${name}`);
    return value;
  }

  function completeDetails(experience) {
    return experience.applyPatch(null, {
      sizeMode: "custom", recipient: "woman", fit: "regular",
      bust: 96, waist: 76, hips: 102, shoulderWidth: 39, upperArm: 30,
      armholeDepth: 21, neck: 36, garmentWidth: 50, garmentLength: 62,
      sleeveLength: 57, necklineDepth: 10,
    });
  }

  function timestampFactory(start = Date.now()) {
    return (offset) => new Date(start + offset * 1000).toISOString();
  }

  async function seedStage70HappyPath(options = {}) {
    assertIsolatedFixtureEnvironment();
    const system = requireApi("YarnAIProjectSystem");
    const experience = requireApi("YarnAIProjectDetailsExperience");
    const closureDomain = requireApi("YarnAIProjectDetailsClosure");
    const initializationDomain = requireApi("YarnAIProjectInitialization");
    const gaugeDomain = requireApi("YarnAISwatchGauge");
    const calculationDomain = requireApi("YarnAIProjectCalculationEntry");
    const readiness = requireApi("YarnAIProjectReadiness");
    const planDomain = requireApi("YarnAIProjectExecutionPlan");
    const planWorkspace = requireApi("YarnAIProjectExecutionPlanWorkspace");
    const stage66Domain = requireApi("YarnAIProjectExecutionStart");
    const stage66Workspace = requireApi("YarnAIProjectExecutionStartWorkspace");
    const stage67Domain = requireApi("YarnAIProjectExecutionFirstStep");
    const stage68Domain = requireApi("YarnAIProjectExecutionNextStep");
    const stage69Domain = requireApi("YarnAIProjectExecutionNextStepClarification");
    const stage70Domain = requireApi("YarnAIFoundationSectionExecutionPreparation");
    const repository = options.repository || new system.ProjectRepository();
    const ownsRepository = !options.repository;
    const at = timestampFactory(options.startedAt || Date.now());
    const operationId = () => system.uuidv7();

    try {
      if (ownsRepository) await repository.initialize();

      const details = completeDetails(experience);
      const created = await repository.createProject({
        title: "Stage 70 happy-path manual fixture",
        notes: "TEST/DEV ONLY — disposable authoritative Stage 60-69 chain.",
        draft_input: {
          project_intent: { garmentType: "свитер" },
          project_details_experience: details,
          project_details_collaboration: {},
        },
      });
      const projectId = created.project_id;
      let aggregate = await repository.getProject(projectId);
      const context = experience.contextFromAggregate(aggregate);
      const intent = experience.applyDetailsToIntent(context.intent, context.details);
      const nextDestination = {
        enabled: true,
        href: `/swatch-assistant?project=${projectId}`,
        label: "Контрольный образец",
        description: "Подтверждение плотности.",
      };
      const liveInput = {
        projectId,
        garmentType: intent.garmentType || "изделие",
        details: context.details,
        technology: context.technology,
        intent,
        collaborationState: context.collaborationState,
        safe: true,
        nextDestination,
      };

      const stage60Snapshot = closureDomain.buildProjectDetailsSnapshot(liveInput);
      const stage60Draft = closureDomain.buildClosureDraft(
        { snapshot: stage60Snapshot },
        { closureId: `${projectId}:stage60-closure`, createdAt: at(1) },
      );
      const stage60Reviewing = closureDomain.startReviewing(stage60Draft, { reviewedAt: at(2) });
      const stage60Completed = closureDomain.completeClosure(stage60Reviewing, { completedAt: at(3) });
      const closureHistory = closureDomain.appendCompletedClosure(null, stage60Completed);

      const initializationInput = { projectIdentity: projectId, closureHistory, liveInput, nextDestination };
      const stage61Draft = initializationDomain.buildInitializationDraft(initializationInput, {
        identity: `${projectId}:stage61-initialization`, createdAt: at(4), createdBy: "project_owner",
      });
      const stage61Reviewing = initializationDomain.startReviewing(stage61Draft, { reviewedAt: at(5) });
      const stage61Ready = initializationDomain.markReady(stage61Reviewing);
      const stage61Initialized = initializationDomain.initializeProject(stage61Ready, { initializedAt: at(6) });
      const initializationHistory = initializationDomain.appendInitialized(null, stage61Initialized);

      const gaugeSource = gaugeDomain.buildSourceSnapshot({
        projectIdentity: projectId,
        initializationIdentity: stage61Initialized.identity,
        initializationFingerprint: stage61Initialized.integrity.recordFingerprint,
        recipient: stage61Initialized.snapshot.garment.recipient,
        size: stage61Initialized.snapshot.garment.standardSize || stage61Initialized.snapshot.garment.sizeMode,
      });
      const stage63Gauge = gaugeDomain.buildConfirmedRecord({
        stitches: 20, rows: 28, width: 10, height: 10, unit: "cm",
        preparation: {
          knitted: true, washed: true, dry: true, unstretched: true,
          representative: true, sameYarn: true, sameTools: true, samePattern: true,
        },
      }, { source: gaugeSource, identity: `${projectId}:stage63-gauge`, confirmedAt: at(7), createdBy: "project_owner" });
      const gaugeHistory = gaugeDomain.appendHistory(null, stage63Gauge);

      const draftInput = { ...aggregate.project.draft_input };
      draftInput[closureDomain.HISTORY_KEY] = closureHistory;
      draftInput[initializationDomain.HISTORY_KEY] = initializationHistory;
      draftInput[gaugeDomain.HISTORY_KEY] = gaugeHistory;
      await repository.updateProject(projectId, { draft_input: draftInput }, { baseRevision: aggregate.project.revision });
      aggregate = await repository.getProject(projectId);

      const stage64Preview = calculationDomain.assessEntry({
        projectIdentity: projectId, project: aggregate.project,
        initialization: stage61Initialized, gauge: stage63Gauge,
      });
      const stage64Assessment = calculationDomain.assessEntry({
        projectIdentity: projectId, project: aggregate.project,
        initialization: stage61Initialized, gauge: stage63Gauge,
        acknowledgedWarningCodes: stage64Preview.requiredAcknowledgements,
      });
      let stage64Snapshot = calculationDomain.buildSnapshot(
        { assessment: stage64Assessment },
        { identity: `${projectId}:stage64-calculation-snapshot`, createdAt: at(8), createdBy: "project_owner" },
      );
      stage64Snapshot = calculationDomain.startReviewing(stage64Snapshot, { timestamp: at(9) });
      stage64Snapshot = calculationDomain.markReady(stage64Snapshot, { timestamp: at(10) });
      stage64Snapshot = calculationDomain.complete(stage64Snapshot, { timestamp: at(11) });
      const calculationResult = await repository.addCalculation(projectId, {
        project_calculation_entry: {
          kind: calculationDomain.KIND,
          version: calculationDomain.VERSION,
          fingerprint: stage64Snapshot.fingerprint,
        },
      }, {
        status: "READY_WITH_WARNINGS",
        normalized_inputs: {},
        warnings: stage64Snapshot.warnings,
        errors: [], clarifications: [], snapshot: stage64Snapshot,
      });
      const calculationId = calculationResult.calculation.calculation_id;
      aggregate = await repository.getProject(projectId);

      const planOptions = {
        aggregate, projectId, domain: planDomain, calculationDomain,
        initialization: initializationDomain, gauge: gaugeDomain,
        experience, readiness,
      };
      const planVerification = planWorkspace.assessAggregateReadiness(planOptions);
      if (!planVerification.ready) throw new Error(planVerification.problem?.code || "stage65-fixture-invalid");
      const planPreview = planDomain.assessPlan({
        sourceChain: planVerification.verified.sourceChain,
        technology: planVerification.verified.technology,
        materials: planVerification.verified.materials,
        boundedInputs: {}, acknowledgedWarningCodes: [],
      });
      const planAssessment = planDomain.assessPlan({
        sourceChain: planVerification.verified.sourceChain,
        technology: planVerification.verified.technology,
        materials: planVerification.verified.materials,
        boundedInputs: {},
        acknowledgedWarningCodes: planPreview.requiredAcknowledgementCodes,
      });
      let stage65Snapshot = planDomain.buildSnapshot({ assessment: planAssessment }, { createdAt: at(12) });
      stage65Snapshot = planDomain.startReviewing(stage65Snapshot, { timestamp: at(13) });
      stage65Snapshot = planDomain.markReady(stage65Snapshot, { timestamp: at(14) });
      stage65Snapshot = planDomain.complete(stage65Snapshot, { timestamp: at(15) });
      let stage65State = planDomain.createProgressState({ projectIdentity: projectId, calculationId, updatedAt: at(16) });
      stage65State = planDomain.appendCompleted(stage65State, stage65Snapshot, { calculationId, updatedAt: at(17) });
      await repository.ensureProjectExecutionPlanPreparation(projectId, calculationId, stage65State, { timestamp: at(18) });
      aggregate = await repository.getProject(projectId);

      const startVerification = stage66Workspace.assessAggregateReadiness({
        aggregate, projectId, domain: stage66Domain, planDomain, planWorkspace,
        calculationDomain, initialization: initializationDomain, gauge: gaugeDomain,
        experience, readiness,
      });
      if (!startVerification.ready) throw new Error(startVerification.diagnostic?.code || "stage66-fixture-not-ready");
      let stage66Snapshot = stage66Domain.buildDraft(startVerification.assessment, {
        createdAt: at(19), acknowledged: true, acknowledgedAt: at(19), createdBy: "project_owner",
      });
      stage66Snapshot = stage66Domain.markReady(stage66Snapshot, { timestamp: at(20) });
      stage66Snapshot = stage66Domain.start(stage66Snapshot, { startedAt: at(21) });
      const stage66Record = await repository.ensureProjectExecutionStart(
        projectId, calculationId, stage66Domain.createProgressState(stage66Snapshot, calculationId), { timestamp: at(22) },
      );

      aggregate = await repository.getProject(projectId);
      const stage67Assessment = stage67Domain.assessSource({
        projectIdentity: projectId, project: aggregate.project,
        stage66Record, stage66Domain,
      });
      let stage67Snapshot = stage67Domain.createSnapshot(stage67Assessment, { createdAt: at(23), operationId: operationId() });
      stage67Snapshot = stage67Domain.activateFirstStep(stage67Snapshot, {
        expectedRevision: stage67Snapshot.revision, expectedFingerprint: stage67Snapshot.fingerprint,
        operationId: operationId(), timestamp: at(24),
      });
      stage67Snapshot = stage67Domain.startCheckingFirstStep(stage67Snapshot, {
        expectedRevision: stage67Snapshot.revision, expectedFingerprint: stage67Snapshot.fingerprint,
        operationId: operationId(), timestamp: at(25),
      });
      stage67Snapshot = stage67Domain.completeFirstStep(stage67Snapshot, {
        observedStitchCount: 100, explicitConfirmation: true,
      }, {
        expectedRevision: stage67Snapshot.revision, expectedFingerprint: stage67Snapshot.fingerprint,
        operationId: operationId(), timestamp: at(26),
      }).snapshot;
      await repository.ensureProjectExecutionFirstStep(
        projectId, calculationId, stage67Domain.createProgressState(stage67Snapshot), { timestamp: at(27) },
      );

      aggregate = await repository.getProject(projectId);
      const stage68Assessment = stage68Domain.assessSource({
        projectIdentity: projectId, project: aggregate.project, progress: aggregate.progress,
        stage65Domain: planDomain, stage66Domain, stage67Domain,
      });
      const stage68Snapshot = stage68Domain.createSnapshot(stage68Assessment, { createdAt: at(28), operationId: operationId() });
      await repository.ensureProjectExecutionNextStep(
        projectId, calculationId, stage68Domain.createProgressState(stage68Snapshot),
        { timestamp: at(29), operationId: stage68Snapshot.audit.operationId },
      );

      aggregate = await repository.getProject(projectId);
      const stage69Assessment = stage69Domain.assessSource({
        projectIdentity: projectId, project: aggregate.project, progress: aggregate.progress,
        stage65Domain: planDomain, stage66Domain, stage67Domain, stage68Domain,
      });
      if (stage69Assessment.lifecycle !== "ready") throw new Error(stage69Assessment.diagnostic?.code || "stage69-fixture-not-ready");
      const stage69OperationId = operationId();
      const stage69Snapshot = stage69Domain.createCompletedSnapshot(stage69Assessment, {
        foundationType: "ribbing", foundationHeight: 5,
      }, {
        createdAt: at(30), confirmedAt: at(31), explicitConfirmation: true,
        operationId: stage69OperationId,
      });
      await repository.ensureProjectExecutionNextStepClarification(
        projectId, calculationId, stage69Domain.createProgressState(stage69Snapshot),
        { timestamp: at(32), operationId: stage69OperationId, expectedProjectRevision: aggregate.project.revision },
      );

      aggregate = await repository.getProject(projectId);
      const stage70Assessment = stage70Domain.assessSource({
        projectId, project: aggregate.project, progress: aggregate.progress,
        stage63Domain: gaugeDomain, stage65Domain: planDomain, stage66Domain,
        stage67Domain, stage68Domain, stage69Domain, validatedAt: at(33),
      });
      if (stage70Assessment.lifecycle !== "ready") throw new Error(stage70Assessment.diagnostic?.code || "stage70-fixture-not-ready");
      if (stage70Assessment.workingMethod !== null) throw new Error("stage65-working-method-is-not-unknown");
      if (stage70Assessment.confirmedContext.castOnCount !== 100) throw new Error("cast-on-count-is-not-100");
      if (stage70Assessment.confirmedContext.foundationType !== "ribbing" || stage70Assessment.confirmedContext.target?.value !== 5) throw new Error("stage69-clarification-invalid");
      if (await repository.getCurrentFoundationSectionExecutionPreparation(projectId, calculationId)) throw new Error("stage70-must-be-absent-before-open");

      return Object.freeze({
        projectId, calculationId,
        url: `${globalObject.location?.origin || "http://127.0.0.1:8000"}/project-foundation-section-preparation?project=${projectId}`,
        aggregate, stage65Snapshot, stage67Snapshot, stage69Snapshot, stage70Assessment,
      });
    } finally {
      if (ownsRepository) await repository.close().catch(() => undefined);
    }
  }

  async function runFixturePage() {
    const status = globalObject.document?.querySelector("#stage70-fixture-status");
    try {
      if (!["127.0.0.1", "localhost"].includes(globalObject.location.hostname)) throw new Error("This test/dev fixture is available only on localhost.");
      const result = await seedStage70HappyPath();
      if (status) status.textContent = `Fixture ${result.projectId} готов. Открываем Stage 70…`;
      globalObject.location.replace(result.url);
    } catch (error) {
      if (status) status.textContent = `Fixture не создан: ${error?.code || error?.message || error}`;
      globalObject.console?.error?.("Stage 70 happy-path fixture failed.", error);
    }
  }

  const api = Object.freeze({
    FIXTURE_PATH,
    CANONICAL_PRODUCTION_ORIGINS,
    assertIsolatedFixtureEnvironment,
    seedStage70HappyPath,
  });
  globalObject.YarnAIStage70HappyPathFixture = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalObject.document && globalObject.location?.pathname === FIXTURE_PATH) {
    if (globalObject.document.readyState === "loading") globalObject.addEventListener("DOMContentLoaded", runFixturePage, { once: true });
    else runFixturePage();
  }
})(typeof window !== "undefined" ? window : globalThis);
