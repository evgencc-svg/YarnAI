"use strict";

(function initializeManualCalculationIntakeAssistant(globalObject) {
  if (typeof document === "undefined") return;
  const system = globalObject.YarnAIProjectSystem;
  const domain = globalObject.YarnAIManualCalculationIntake;
  const requirementsDomain = globalObject.YarnAIGarmentMeasurementRequirements;
  const yarnRequirementsDomain = globalObject.YarnAIGarmentYarnRequirements;
  const yarnRecommendationDomain = globalObject.YarnAIGarmentYarnRecommendation;
  const yarnTargetDecisionDomain = globalObject.YarnAIGarmentYarnTargetDecision;
  const validationDomain = globalObject.YarnAIManualIntakeValidation;
  const byId = (id) => document.getElementById(id);
  const ui = {
    root: byId("manual-intake-root"), loading: byId("loading"), blocked: byId("blocked"), blockedMessage: byId("blocked-message"), blockedBack: byId("blocked-back"), content: byId("content"),
    projectTitle: byId("project-title"), analysisBack: byId("analysis-back"), technologyTitle: byId("technology-title"), draftState: byId("draft-state"), lastSaved: byId("last-saved"), sectionStatus: byId("section-status"),
    requirementsStatus: byId("garment-requirements-status"), requirementsFirstAction: byId("garment-requirements-first-action"), requirementsList: byId("garment-requirements-list"),
    yarnRequirementsStatus: byId("yarn-requirements-status"), yarnRequirementsFirstAction: byId("yarn-requirements-first-action"), yarnRequirementsList: byId("yarn-requirements-list"), photoYarnAdvisory: byId("photo-yarn-advisory"),
    recommendationEmpty: byId("yarn-recommendation-empty"), recommendationContent: byId("yarn-recommendation-content"), recommendationSummary: byId("yarn-recommendation-summary"), recommendationEvidence: byId("yarn-recommendation-evidence"), recommendationSurface: byId("yarn-recommendation-surface"), recommendationLimitations: byId("yarn-recommendation-limitations"), recommendationSwatch: byId("yarn-recommendation-swatch"),
    targetDecision: byId("yarn-target-decision"), targetDecisionStatus: byId("yarn-target-decision-status"), targetOptions: byId("yarn-target-options"), targetConfirmation: byId("yarn-target-confirmation"), targetSelectedSummary: byId("yarn-target-selected-summary"), targetConfirm: byId("confirm-yarn-target"), targetConfirmed: byId("yarn-target-confirmed"), targetConfirmedSummary: byId("yarn-target-confirmed-summary"),
    supplementControls: byId("yarn-supplement-controls"), supplementConfirm: byId("yarn-supplement-confirm"), supplementRun: byId("run-yarn-supplement"), supplementStatus: byId("yarn-supplement-status"),
    form: byId("intake-form"), selectedSize: byId("selected-size"), bodyBust: byId("body-bust"), bodyWaist: byId("body-waist"), bodyHip: byId("body-hip"), bodyLength: byId("body-length"), bodyShoulder: byId("body-shoulder-width"), bodyBack: byId("body-back-width"), garmentBust: byId("garment-bust"), garmentLength: byId("garment-length"), garmentSleeve: byId("garment-sleeve"), garmentUpperArm: byId("garment-upper-arm"), garmentCuff: byId("garment-cuff"), garmentNeckWidth: byId("garment-neck-width"), garmentFrontNeckDepth: byId("garment-front-neck-depth"), garmentWaist: byId("garment-waist"), garmentHip: byId("garment-hip"), garmentYokeDepth: byId("garment-yoke-depth"), garmentArmholeDepth: byId("garment-armhole-depth"), easeBust: byId("ease-bust"), bodyShaping: byId("body-shaping-preference"), necklineStyle: byId("neckline-style"), closureStyle: byId("closure-style"), hemFinish: byId("hem-finish"), cuffFinish: byId("cuff-finish"),
    yarnStatus: byId("yarn-status"), yarnFields: byId("yarn-fields"), yarnName: byId("yarn-name"), yarnStrandCount: byId("yarn-strand-count"), yarnComposition: byId("yarn-composition"), yarnLength: byId("yarn-length"), yarnMass: byId("yarn-mass"), yarnQuantity: byId("yarn-quantity"), yarnNote: byId("yarn-note"),
    needlesStatus: byId("needles-status"), needlesFields: byId("needles-fields"), needlesPrimary: byId("needles-primary"), needlesAdditional: byId("needles-additional"),
    gaugeStitches: byId("gauge-stitches"), gaugeWidth: byId("gauge-width"), gaugeRows: byId("gauge-rows"), gaugeHeight: byId("gauge-height"), gaugeNeedle: byId("gauge-needle"), gaugeTreated: byId("gauge-treated"), normalizedGauge: byId("normalized-gauge"),
    photoRole: byId("photo-role"), photoInput: byId("additional-photo"), photoGrid: byId("photo-grid"), notes: byId("notes"), saveStatus: byId("save-status"), error: byId("form-error"), save: byId("save-draft"),
    validate: byId("validate-intake"), validationStatus: byId("validation-status"), validationResults: byId("validation-results"), validationCompleted: byId("validation-completed"), validationBlockers: byId("validation-blockers"), validationConflicts: byId("validation-conflicts"), validationUnresolved: byId("validation-unresolved"), validationWarnings: byId("validation-warnings"), firstActionPanel: byId("first-action-panel"), firstAction: byId("validation-first-action"), confirm: byId("confirm-validation"), reopen: byId("reopen-validation"),
  };
  let repository = null;
  let projectId = null;
  let inspected = null;
  let validationInspected = null;
  let recommendationInspected = null;
  let targetDecisionInspected = null;
  let protectedProjectsBaseline = null;
  let protectedProjectsAudit = null;
  let supplementConfiguration = { enabled: false, pilotReady: false, requestId: null, authorizationBinding: null, authorizationMatches: false };
  let supplementPrepared = null;
  let supplementPreparationErrorCode = null;
  let supplementControlState = { available: false, mode: "blocked", reasonCode: "NOT_INITIALIZED" };
  let busy = false;
  const previews = new Map();

  bind();
  initialize().catch((error) => block(userMessage(error, "Не удалось открыть подготовку данных.")));

  async function initialize() {
    if (!system || !domain || !requirementsDomain || !yarnRequirementsDomain || !yarnRecommendationDomain || !yarnTargetDecisionDomain || !validationDomain) throw new Error("DOMAIN_UNAVAILABLE");
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId || !system.isUuidv7(projectId)) throw new Error("PROJECT_INVALID");
    ui.analysisBack.href = `/garment-reference-analysis?project=${encodeURIComponent(projectId)}`;
    ui.blockedBack.href = ui.analysisBack.href;
    repository = new system.ProjectRepository();
    await repository.initialize();
    protectedProjectsBaseline = await captureProtectedProjects();
    protectedProjectsAudit = protectedProjectsBaseline;
    inspected = await domain.ensureForProject(repository, projectId);
    recommendationInspected = await yarnRecommendationDomain.inspectForProject(repository, projectId);
    targetDecisionInspected = recommendationInspected?.currentValidation?.semanticValid === true ? await yarnTargetDecisionDomain.inspectForProject(repository, projectId) : null;
    supplementConfiguration = await loadSupplementConfiguration();
    supplementPrepared = await prepareSupplementRequest();
    validationInspected = await validationDomain.validateForProject(repository, projectId, { contractContext: validationContext() });
    inspected = await domain.ensureForProject(repository, projectId);
    await hydratePreviews();
    render();
  }

  function bind() {
    ui.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await mutate(async () => {
        inspected = await domain.saveDraftForProject(repository, projectId, readForm());
        if (validationInspected) validationInspected = await validationDomain.reconcileForProject(repository, projectId);
      }, "Не удалось сохранить черновик.", "Черновик сохранён локально.");
    });
    ui.yarnStatus.addEventListener("change", renderFieldAvailability);
    ui.needlesStatus.addEventListener("change", renderFieldAvailability);
    ui.form.addEventListener("input", () => { renderHumanIntake(); markDraftChanged(); });
    ui.form.addEventListener("change", () => { renderHumanIntake(); markDraftChanged(); });
    byId("apply-polo-proposal").addEventListener("click", () => {
      // An explicit click accepts suggestions only for unanswered questions.
      for (const [field, value] of [[ui.bodyShaping, "straight"], [ui.necklineStyle, "polo_collar_with_placket"], [ui.closureStyle, "short_front_placket"], [ui.hemFinish, "rib"], [ui.cuffFinish, "rib"]]) {
        if (!field.value) field.value = value;
      }
      renderHumanIntake();
      markDraftChanged();
    });
    byId("use-one-strand").addEventListener("click", () => {
      ui.yarnStatus.value = "selected";
      ui.yarnStrandCount.value = "1";
      renderFieldAvailability();
      markDraftChanged();
    });
    byId("copy-swatch-needles").addEventListener("click", () => {
      if (ui.needlesStatus.value === "selected" && Number(ui.needlesPrimary.value) > 0) {
        ui.gaugeNeedle.value = ui.needlesPrimary.value;
        markDraftChanged();
      } else {
        ui.error.textContent = "Сначала укажи размер основных спиц в миллиметрах.";
        ui.needlesStatus.focus();
      }
    });
    [ui.gaugeStitches, ui.gaugeWidth, ui.gaugeRows, ui.gaugeHeight].forEach((input) => input.addEventListener("input", renderGaugePreview));
    ui.photoInput.addEventListener("change", async () => {
      const file = ui.photoInput.files?.[0] || null;
      ui.photoInput.value = "";
      if (!file) return;
      await mutate(async () => {
        inspected = await domain.saveDraftForProject(repository, projectId, readForm());
        inspected = await domain.addPhotoForProject(repository, projectId, file, ui.photoRole.value);
        if (validationInspected) validationInspected = await validationDomain.reconcileForProject(repository, projectId);
        await hydratePreviews();
      }, "Не удалось сохранить дополнительную фотографию.", "Фотография сохранена только локально.");
    });
    ui.validate.addEventListener("click", async () => {
      await mutate(async () => {
        inspected = await domain.saveDraftForProject(repository, projectId, readForm());
        validationInspected = await validationDomain.validateForProject(repository, projectId, { contractContext: validationContext() });
        inspected = await domain.ensureForProject(repository, projectId);
      }, "Не удалось проверить данные.", "Проверка сохранена локально.");
    });
    ui.confirm.addEventListener("click", async () => {
      await mutate(async () => {
        inspected = await domain.saveDraftForProject(repository, projectId, readForm());
        validationInspected = await validationDomain.validateForProject(repository, projectId, { contractContext: validationContext() });
        validationInspected = await validationDomain.confirmForProject(repository, projectId);
      }, "Подтверждение недоступно. Проверь данные ещё раз.", "Исходные данные подтверждены. Ниже — базовые числа, форма и отделка поло. После их подтверждения можно открыть пошаговый план.");
    });
    ui.targetConfirm.addEventListener("click", async () => {
      await mutate(async () => {
        targetDecisionInspected = await yarnTargetDecisionDomain.confirmForProject(repository, projectId);
        protectedProjectsAudit = await captureProtectedProjects();
      }, "Подтверждение целевого профиля недоступно.", "Целевой профиль подтверждён. Конкретная пряжа ещё не выбрана.");
    });
    ui.reopen.addEventListener("click", async () => {
      await mutate(async () => { validationInspected = await validationDomain.reopenForProject(repository, projectId); }, "Не удалось вернуться к редактированию.", "Подтверждённый снимок сохранён в истории; данные снова можно редактировать.");
    });
    ui.supplementConfirm.addEventListener("change", renderSupplementControls);
    ui.supplementRun.addEventListener("click", runYarnSupplement);
    Object.entries(domain.PHOTO_ROLES).forEach(([value, label]) => ui.photoRole.add(new Option(label, value)));
    globalObject.addEventListener("beforeunload", releasePreviews);
    globalObject.addEventListener("yarnai:actual-yarn-confirmed", async () => {
      await mutate(async () => {
        inspected = await domain.ensureForProject(repository, projectId);
        validationInspected = await validationDomain.validateForProject(repository, projectId, { contractContext: validationContext() });
      }, "Не удалось открыть данные после выбора пряжи.", "Пряжа сохранена. Теперь заполни мерки, спицы и плотность.");
    });
  }

  async function mutate(operation, fallback, success) {
    if (busy) return;
    busy = true;
    ui.root.setAttribute("aria-busy", "true");
    ui.save.disabled = true;
    ui.validate.disabled = true;
    ui.confirm.disabled = true;
    ui.reopen.disabled = true;
    ui.targetConfirm.disabled = true;
    ui.error.textContent = "";
    ui.saveStatus.textContent = "Сохраняем…";
    try {
      await operation();
      render();
      ui.saveStatus.textContent = success;
    } catch (error) {
      ui.saveStatus.textContent = "";
      ui.error.textContent = userMessage(error, fallback);
    } finally {
      busy = false;
      renderValidation();
      if (recommendationInspected?.artifact && recommendationInspected.current === true && recommendationInspected.currentValidation?.semanticValid === true) renderTargetDecision(recommendationInspected.artifact);
      ui.root.setAttribute("aria-busy", "false");
    }
  }

  async function loadSupplementConfiguration() {
    try {
      const response = await globalObject.fetch("/api/v1/garment-yarn-recommendations/configuration", { headers: { Accept: "application/json" } });
      if (!response.ok) return { enabled: false, pilotReady: false, requestId: null, authorizationBinding: null, authorizationMatches: false };
      const payload = await response.json();
      return { enabled: payload.enabled === true, pilotReady: payload.pilot_ready === true, requestId: typeof payload.pilot_request_id === "string" ? payload.pilot_request_id : null, authorizationBinding: payload.pilot_authorization_binding && typeof payload.pilot_authorization_binding === "object" ? payload.pilot_authorization_binding : null, authorizationMatches: false };
    } catch { return { enabled: false, pilotReady: false, requestId: null, authorizationBinding: null, authorizationMatches: false }; }
  }

  async function prepareSupplementRequest() {
    supplementPreparationErrorCode = null;
    const retryCandidate = !recommendationInspected?.progress || (recommendationInspected?.artifact && recommendationInspected.current === true && recommendationInspected.currentValidation?.schemaDomainValid === true && recommendationInspected.currentValidation?.semanticValid === false && recommendationInspected.currentValidation?.bindingValid === true);
    if (!retryCandidate) return null;
    if (!supplementConfiguration.enabled || !supplementConfiguration.pilotReady || !supplementConfiguration.requestId) return null;
    try {
      const garmentDomain = globalObject.YarnAIGarmentReferenceAnalysis;
      const garmentProgress = inspected.aggregate.progress.find((entry) => entry.kind === garmentDomain.PROGRESS_KIND && entry.calculation_id === inspected.calculation.calculation_id && entry.epoch === 1);
      const photo = garmentProgress?.state?.source?.referencePhotos?.[0];
      if (!garmentProgress || !photo) throw Object.assign(new Error("PHOTO_BINDING_MISSING"), { code: "PHOTO_BINDING_MISSING" });
      const record = await repository.getPhoto(projectId, photo.photoId);
      const preparedPhoto = await garmentDomain.preparePilotPhoto(garmentProgress.state, record);
      const preparedRequest = await garmentDomain.buildPilotServerRequest(garmentProgress.state, record, { requestId: supplementConfiguration.requestId, userConfirmed: true, sanitizer: async () => preparedPhoto.sanitized });
      supplementConfiguration = { ...supplementConfiguration, authorizationMatches: yarnRecommendationDomain.authorizationMatchesPreparedRequest(supplementConfiguration.authorizationBinding, preparedRequest) };
      if (!supplementConfiguration.authorizationMatches) throw Object.assign(new Error("AUTHORIZATION_BINDING_MISMATCH"), { code: "AUTHORIZATION_BINDING_MISMATCH" });
      return Object.freeze({ garmentState: garmentProgress.state, record, preparedPhoto });
    } catch (error) {
      supplementPreparationErrorCode = error.code || "PHOTO_OR_SANITIZED_PNG_UNAVAILABLE";
      return null;
    }
  }

  async function runYarnSupplement() {
    if (busy || supplementControlState.available !== true || !supplementPrepared || !ui.supplementConfirm.checked) return;
    busy = true; ui.supplementRun.disabled = true; ui.supplementStatus.textContent = "Готовим очищенную копию и выполняем один анализ…"; ui.error.textContent = "";
    try {
      const garmentDomain = globalObject.YarnAIGarmentReferenceAnalysis;
      const request = await garmentDomain.buildPilotServerRequest(supplementPrepared.garmentState, supplementPrepared.record, { requestId: supplementConfiguration.requestId, userConfirmed: true, sanitizer: async () => supplementPrepared.preparedPhoto.sanitized });
      const response = await globalObject.fetch("/api/v1/garment-yarn-recommendations", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(request) });
      const payload = await response.json();
      if (!response.ok) {
        const detail = payload?.error || {};
        const error = new Error(detail.message || "Дополнительный анализ завершился ошибкой.");
        error.code = detail.code || "YARN_SUPPLEMENT_FAILED";
        error.reasonCode = detail.reason_code || error.code;
        error.validationPath = detail.path || "$";
        error.userMessage = `${error.message} Код: ${error.reasonCode}; путь: ${error.validationPath}.`;
        throw error;
      }
      recommendationInspected = await yarnRecommendationDomain.saveForProject(repository, projectId, payload);
      inspected = await domain.ensureForProject(repository, projectId);
      supplementConfiguration = { enabled: false, pilotReady: false, requestId: null, authorizationBinding: null, authorizationMatches: false };
      ui.supplementStatus.textContent = "Рекомендация сохранена локально.";
      render();
    } catch (error) {
      supplementConfiguration = { enabled: false, pilotReady: false, requestId: null, authorizationBinding: null, authorizationMatches: false };
      ui.supplementStatus.textContent = `Повтор автоматически не выполняется. Код: ${error.reasonCode || error.code || "YARN_SUPPLEMENT_FAILED"}.`;
      ui.error.textContent = userMessage(error, "Не удалось сформировать рекомендацию.");
    } finally { busy = false; renderSupplementControls(); }
  }

  function render() {
    const artifact = inspected.artifact;
    ui.loading.hidden = true;
    ui.blocked.hidden = true;
    ui.content.hidden = false;
    ui.root.setAttribute("aria-busy", "false");
    ui.projectTitle.textContent = projectTitleLabel(inspected.project.title);
    ui.technologyTitle.textContent = artifact.source.selectedOptionName;
    ui.draftState.textContent = artifact.status === "draft" ? "Черновик" : "Устаревший черновик";
    ui.lastSaved.textContent = formatTime(artifact.updatedAt);
    fillForm(artifact);
    renderHumanIntake();
    renderSectionStatus(artifact.sectionStatus);
    renderGarmentRequirements(artifact);
    byId("polo-preparation-guide").hidden = artifact.garmentRequirementsProfile?.constructionIdentity !== "seamed_set_in_sleeve";
    renderYarnRequirements(artifact);
    renderYarnRecommendation();
    renderPhotoYarnAdvisory();
    renderGaugePreview();
    renderPhotos(artifact);
    renderFieldAvailability();
    renderValidation();
    globalObject.__YARNAI_MANUAL_INTAKE__ = Object.freeze({
      projectId,
      intakeId: artifact.intakeId,
      intakeRevision: artifact.revision,
      stateRevision: inspected.state.revision,
      status: artifact.status,
      technologyDecisionId: artifact.source.technologyDecisionId,
      technologyDecisionRevision: artifact.source.technologyDecisionRevision,
      technologyDecisionFingerprint: artifact.garmentRequirementsProfile?.technologyDecision?.fingerprint || null,
      analysisId: artifact.garmentRequirementsProfile?.analysis?.id || artifact.source.analysisId,
      analysisRevision: artifact.garmentRequirementsProfile?.analysis?.revision || null,
      analysisFingerprint: artifact.source.sourceAnalysisFingerprint,
      analysisRequestId: artifact.source.analysisRequestId,
      analysisRequestFingerprint: artifact.source.sourceRequestFingerprint,
      fingerprint: artifact.fingerprint,
      garmentRequirementsContractVersion: artifact.garmentRequirementsProfile?.contractVersion || null,
      garmentRequirementsFingerprint: artifact.garmentRequirementsProfile?.canonicalFingerprint || null,
      garmentConstructionIdentity: artifact.garmentRequirementsProfile?.constructionIdentity || null,
      garmentCategory: artifact.garmentRequirementsProfile?.garmentCategory || null,
      yarnRequirementsContractVersion: artifact.yarnRequirementsProfile?.contractVersion || null,
      yarnRequirementsProfileId: artifact.yarnRequirementsProfile?.profileId || null,
      yarnRequirementsFingerprint: artifact.yarnRequirementsProfile?.canonicalFingerprint || null,
      yarnRequirementsStatus: artifact.yarnRequirementsProfile?.status || null,
      yarnSelectionStatus: artifact.yarn?.selectionStatus || null,
      yarnStrandCount: artifact.yarn?.strandCount ?? null,
      yarnRecommendationId: recommendationInspected?.artifact?.recommendationId || null,
      yarnRecommendationRevision: recommendationInspected?.artifact?.revision || null,
      yarnRecommendationFingerprint: recommendationInspected?.artifact?.canonicalFingerprint || null,
      yarnRecommendationStatus: recommendationInspected?.effectiveStatus || null,
      yarnRecommendationSemanticValid: recommendationInspected?.currentValidation?.semanticValid ?? null,
      yarnRecommendationValidationReason: recommendationInspected?.currentValidation?.reasonCode || null,
      yarnRetryControlsAvailable: supplementControlState.available === true,
      yarnRetryMode: supplementControlState.mode,
      yarnRetryReasonCode: supplementControlState.reasonCode,
      yarnSupplementPrepared: Boolean(supplementPrepared),
      yarnSupplementPreparationErrorCode: supplementPreparationErrorCode,
      validationStatus: validationInspected?.state?.status || null,
      validationId: validationInspected?.state?.validationId || null,
      validationRevision: validationInspected?.state?.revision || null,
      validationFingerprint: validationInspected?.state?.fingerprint || null,
      validationAbstain: validationInspected?.state?.abstain ?? null,
      validationInputFingerprint: validationInspected?.state?.inputFingerprint || null,
      validationBlockerCodes: (validationInspected?.state?.blockers || []).map((entry) => entry.reasonCode),
      intakeProgressCount: inspected.aggregate.progress.filter((entry) => entry.kind === domain.PROGRESS_KIND && entry.calculation_id === inspected.calculation.calculation_id && entry.epoch === 1).length,
      validationProgressCount: inspected.aggregate.progress.filter((entry) => entry.kind === validationDomain.PROGRESS_KIND && entry.calculation_id === inspected.calculation.calculation_id && entry.epoch === 1).length,
      yarnRecommendationProgressCount: inspected.aggregate.progress.filter((entry) => entry.kind === yarnRecommendationDomain.PROGRESS_KIND && entry.calculation_id === inspected.calculation.calculation_id && entry.epoch === 1).length,
      yarnTargetDecisionId: targetDecisionInspected?.artifact?.decisionId || null,
      yarnTargetDecisionRevision: targetDecisionInspected?.artifact?.revision || null,
      yarnTargetDecisionFingerprint: targetDecisionInspected?.artifact?.canonicalFingerprint || null,
      yarnTargetDecisionStatus: targetDecisionInspected?.effectiveStatus || null,
      yarnTargetSelectedOptionId: targetDecisionInspected?.artifact?.selectedOptionId || null,
      yarnTargetOwnerIntent: targetDecisionInspected?.artifact?.ownerIntent || null,
      yarnTargetRecommendationRevision: targetDecisionInspected?.artifact?.upstream?.yarnRecommendation?.revision || null,
      yarnTargetRecommendationFingerprint: targetDecisionInspected?.artifact?.upstream?.yarnRecommendation?.fingerprint || null,
      yarnTargetUpstreamProjectId: targetDecisionInspected?.artifact?.upstream?.project?.id || null,
      yarnTargetUpstreamProjectRevision: targetDecisionInspected?.artifact?.upstream?.project?.revision || null,
      yarnTargetUpstreamAnalysisId: targetDecisionInspected?.artifact?.upstream?.analysis?.id || null,
      yarnTargetUpstreamAnalysisRevision: targetDecisionInspected?.artifact?.upstream?.analysis?.revision || null,
      yarnTargetUpstreamAnalysisFingerprint: targetDecisionInspected?.artifact?.upstream?.analysis?.fingerprint || null,
      yarnTargetUpstreamTechnologyId: targetDecisionInspected?.artifact?.upstream?.technologyDecision?.id || null,
      yarnTargetUpstreamTechnologyRevision: targetDecisionInspected?.artifact?.upstream?.technologyDecision?.revision || null,
      yarnTargetUpstreamTechnologyFingerprint: targetDecisionInspected?.artifact?.upstream?.technologyDecision?.fingerprint || null,
      yarnTargetUpstreamGarmentRequirementsId: targetDecisionInspected?.artifact?.upstream?.garmentRequirements?.id || null,
      yarnTargetUpstreamGarmentRequirementsRevision: targetDecisionInspected?.artifact?.upstream?.garmentRequirements?.revision || null,
      yarnTargetUpstreamGarmentRequirementsFingerprint: targetDecisionInspected?.artifact?.upstream?.garmentRequirements?.fingerprint || null,
      yarnTargetUpstreamYarnRequirementsId: targetDecisionInspected?.artifact?.upstream?.yarnRequirements?.id || null,
      yarnTargetUpstreamYarnRequirementsRevision: targetDecisionInspected?.artifact?.upstream?.yarnRequirements?.revision || null,
      yarnTargetUpstreamYarnRequirementsFingerprint: targetDecisionInspected?.artifact?.upstream?.yarnRequirements?.fingerprint || null,
      yarnTargetDecisionProgressCount: targetDecisionInspected?.aggregate?.progress?.filter((entry) => entry.kind === yarnTargetDecisionDomain.PROGRESS_KIND && entry.calculation_id === inspected.calculation.calculation_id && entry.epoch === 1).length || 0,
      yarnTargetConfirmationOperationCount: targetDecisionInspected?.aggregate?.operations?.filter((entry) => entry.kind === "GARMENT_YARN_TARGET_DECISION_CONFIRMED").length || 0,
      protectedProjectCount: protectedProjectsAudit?.entries?.length || 0,
      protectedProjectsAggregateHashBefore: protectedProjectsBaseline?.aggregateHash || null,
      protectedProjectsAggregateHashAfter: protectedProjectsAudit?.aggregateHash || null,
      protectedProjectsUnchanged: Boolean(protectedProjectsBaseline && protectedProjectsAudit && protectedProjectsBaseline.aggregateHash === protectedProjectsAudit.aggregateHash),
      protectedProjectChangedIds: protectedProjectChanges(),
    });
    const diagnostic = globalObject.__YARNAI_MANUAL_INTAKE__;
    ui.root.dataset.projectId = diagnostic.projectId;
    ui.root.dataset.intakeId = diagnostic.intakeId || "";
    ui.root.dataset.intakeRevision = String(diagnostic.intakeRevision || "");
    ui.root.dataset.intakeFingerprint = diagnostic.fingerprint || "";
    ui.root.dataset.analysisId = diagnostic.analysisId || "";
    ui.root.dataset.analysisRevision = String(diagnostic.analysisRevision || "");
    ui.root.dataset.analysisFingerprint = diagnostic.analysisFingerprint || "";
    ui.root.dataset.analysisRequestId = diagnostic.analysisRequestId || "";
    ui.root.dataset.analysisRequestFingerprint = diagnostic.analysisRequestFingerprint || "";
    ui.root.dataset.technologyDecisionId = diagnostic.technologyDecisionId || "";
    ui.root.dataset.technologyDecisionRevision = String(diagnostic.technologyDecisionRevision || "");
    ui.root.dataset.technologyDecisionFingerprint = diagnostic.technologyDecisionFingerprint || "";
    ui.root.dataset.garmentRequirementsContractVersion = diagnostic.garmentRequirementsContractVersion || "";
    ui.root.dataset.garmentRequirementsFingerprint = diagnostic.garmentRequirementsFingerprint || "";
    ui.root.dataset.garmentConstructionIdentity = diagnostic.garmentConstructionIdentity || "";
    ui.root.dataset.garmentCategory = diagnostic.garmentCategory || "";
    ui.root.dataset.yarnRequirementsContractVersion = diagnostic.yarnRequirementsContractVersion || "";
    ui.root.dataset.yarnRequirementsProfileId = diagnostic.yarnRequirementsProfileId || "";
    ui.root.dataset.yarnRequirementsFingerprint = diagnostic.yarnRequirementsFingerprint || "";
    ui.root.dataset.yarnRequirementsStatus = diagnostic.yarnRequirementsStatus || "";
    ui.root.dataset.yarnSelectionStatus = diagnostic.yarnSelectionStatus || "";
    ui.root.dataset.yarnStrandCount = String(diagnostic.yarnStrandCount ?? "");
    ui.root.dataset.yarnRecommendationId = diagnostic.yarnRecommendationId || "";
    ui.root.dataset.yarnRecommendationRevision = String(diagnostic.yarnRecommendationRevision || "");
    ui.root.dataset.yarnRecommendationFingerprint = diagnostic.yarnRecommendationFingerprint || "";
    ui.root.dataset.yarnRecommendationStatus = diagnostic.yarnRecommendationStatus || "";
    ui.root.dataset.yarnRecommendationSemanticValid = String(diagnostic.yarnRecommendationSemanticValid ?? "");
    ui.root.dataset.yarnRecommendationValidationReason = diagnostic.yarnRecommendationValidationReason || "";
    ui.root.dataset.yarnRetryControlsAvailable = String(diagnostic.yarnRetryControlsAvailable);
    ui.root.dataset.yarnRetryMode = diagnostic.yarnRetryMode || "";
    ui.root.dataset.yarnRetryReasonCode = diagnostic.yarnRetryReasonCode || "";
    ui.root.dataset.yarnSupplementPrepared = String(diagnostic.yarnSupplementPrepared);
    ui.root.dataset.yarnSupplementPreparationErrorCode = diagnostic.yarnSupplementPreparationErrorCode || "";
    ui.root.dataset.yarnRecommendationProgressCount = String(diagnostic.yarnRecommendationProgressCount);
    ui.root.dataset.yarnTargetDecisionId = diagnostic.yarnTargetDecisionId || "";
    ui.root.dataset.yarnTargetDecisionRevision = String(diagnostic.yarnTargetDecisionRevision || "");
    ui.root.dataset.yarnTargetDecisionFingerprint = diagnostic.yarnTargetDecisionFingerprint || "";
    ui.root.dataset.yarnTargetDecisionStatus = diagnostic.yarnTargetDecisionStatus || "";
    ui.root.dataset.yarnTargetSelectedOptionId = diagnostic.yarnTargetSelectedOptionId || "";
    ui.root.dataset.yarnTargetOwnerIntent = diagnostic.yarnTargetOwnerIntent || "";
    ui.root.dataset.yarnTargetRecommendationRevision = String(diagnostic.yarnTargetRecommendationRevision || "");
    ui.root.dataset.yarnTargetRecommendationFingerprint = diagnostic.yarnTargetRecommendationFingerprint || "";
    ui.root.dataset.yarnTargetUpstreamProjectId = diagnostic.yarnTargetUpstreamProjectId || "";
    ui.root.dataset.yarnTargetUpstreamProjectRevision = String(diagnostic.yarnTargetUpstreamProjectRevision || "");
    ui.root.dataset.yarnTargetUpstreamAnalysisId = diagnostic.yarnTargetUpstreamAnalysisId || "";
    ui.root.dataset.yarnTargetUpstreamAnalysisRevision = String(diagnostic.yarnTargetUpstreamAnalysisRevision || "");
    ui.root.dataset.yarnTargetUpstreamAnalysisFingerprint = diagnostic.yarnTargetUpstreamAnalysisFingerprint || "";
    ui.root.dataset.yarnTargetUpstreamTechnologyId = diagnostic.yarnTargetUpstreamTechnologyId || "";
    ui.root.dataset.yarnTargetUpstreamTechnologyRevision = String(diagnostic.yarnTargetUpstreamTechnologyRevision || "");
    ui.root.dataset.yarnTargetUpstreamTechnologyFingerprint = diagnostic.yarnTargetUpstreamTechnologyFingerprint || "";
    ui.root.dataset.yarnTargetUpstreamGarmentRequirementsId = diagnostic.yarnTargetUpstreamGarmentRequirementsId || "";
    ui.root.dataset.yarnTargetUpstreamGarmentRequirementsRevision = String(diagnostic.yarnTargetUpstreamGarmentRequirementsRevision || "");
    ui.root.dataset.yarnTargetUpstreamGarmentRequirementsFingerprint = diagnostic.yarnTargetUpstreamGarmentRequirementsFingerprint || "";
    ui.root.dataset.yarnTargetUpstreamYarnRequirementsId = diagnostic.yarnTargetUpstreamYarnRequirementsId || "";
    ui.root.dataset.yarnTargetUpstreamYarnRequirementsRevision = String(diagnostic.yarnTargetUpstreamYarnRequirementsRevision || "");
    ui.root.dataset.yarnTargetUpstreamYarnRequirementsFingerprint = diagnostic.yarnTargetUpstreamYarnRequirementsFingerprint || "";
    ui.root.dataset.yarnTargetDecisionProgressCount = String(diagnostic.yarnTargetDecisionProgressCount);
    ui.root.dataset.yarnTargetConfirmationOperationCount = String(diagnostic.yarnTargetConfirmationOperationCount);
    ui.root.dataset.protectedProjectCount = String(diagnostic.protectedProjectCount);
    ui.root.dataset.protectedProjectsAggregateHashBefore = diagnostic.protectedProjectsAggregateHashBefore || "";
    ui.root.dataset.protectedProjectsAggregateHashAfter = diagnostic.protectedProjectsAggregateHashAfter || "";
    ui.root.dataset.protectedProjectsUnchanged = String(diagnostic.protectedProjectsUnchanged);
    ui.root.dataset.protectedProjectChangedIds = diagnostic.protectedProjectChangedIds.join(",");
    ui.root.dataset.validationStatus = diagnostic.validationStatus || "";
    ui.root.dataset.validationId = diagnostic.validationId || "";
    ui.root.dataset.validationRevision = String(diagnostic.validationRevision || "");
    ui.root.dataset.validationFingerprint = diagnostic.validationFingerprint || "";
    ui.root.dataset.validationAbstain = String(diagnostic.validationAbstain ?? "");
    ui.root.dataset.validationInputFingerprint = diagnostic.validationInputFingerprint || "";
    ui.root.dataset.validationBlockerCodes = diagnostic.validationBlockerCodes.join(",");
    ui.root.dataset.intakeProgressCount = String(diagnostic.intakeProgressCount);
    ui.root.dataset.validationProgressCount = String(diagnostic.validationProgressCount);
  }

  function renderValidation() {
    const state = validationInspected?.state || null;
    const confirmed = state?.status === "confirmed";
    setFormLocked(confirmed);
    ui.validationStatus.className = `validation-status ${state?.status || "not_checked"}`;
    ui.validationStatus.textContent = state ? statusLabel(state.status) : "Проверка ещё не выполнялась";
    ui.validationResults.hidden = !state;
    ui.firstActionPanel.hidden = !state?.firstAction;
    ui.firstAction.textContent = state?.firstAction ? `${state.firstAction.title}. ${state.firstAction.explanation} ${state.firstAction.suggestedAction}` : "";
    renderIssueList(ui.validationCompleted, state?.completedChecks || [], (entry) => entry.title);
    renderIssueList(ui.validationBlockers, (state?.blockers || []).filter((entry) => !["conflict", "unresolved"].includes(entry.category) && !entry.reasonCode.endsWith("_UNRESOLVED")), issueText);
    renderIssueList(ui.validationConflicts, state?.conflicts || [], issueText);
    renderIssueList(ui.validationUnresolved, state?.unresolvedItems || [], issueText);
    renderIssueList(ui.validationWarnings, state?.warnings || [], issueText);
    ui.confirm.hidden = confirmed;
    ui.confirm.disabled = !state?.readyForConfirmation || busy;
    ui.reopen.hidden = !confirmed;
    ui.reopen.disabled = busy;
    ui.validate.disabled = confirmed || busy;
    renderCalculationPreview(state);
    globalObject.YarnAIGarmentSetInDesignUI?.refresh(repository, projectId, state);
  }

  function renderCalculationPreview(state) {
    const panel = byId("garment-calculation-preview");
    panel.hidden = state?.status !== "confirmed";
    byId("calculation-preview-values").replaceChildren();
    byId("calculation-preview-limitations").replaceChildren();
    byId("calculation-preview-source").textContent = "";
    if (panel.hidden) return;
    try {
      const preview = globalObject.YarnAIGarmentCalculationPreview.build(state, inspected.artifact);
      byId("calculation-preview-status").textContent = "Базовые числа рассчитаны. Для прямого поло из отдельных деталей подтверди ниже форму и отделку, затем открой пошаговый план. Эти числа сами по себе не инструкция.";
      byId("calculation-preview-title").textContent = preview.gaugeStatus || "Расчёт по подтверждённому образцу";
      byId("calculation-preview-source").textContent = preview.gaugeStatus ? "Петли и ряды рассчитаны по этикетке. Фактический размер зависит от натяжения нити и выбранных спиц." : "Источник — подтверждённые мерки и обработанный образец выбранной пряжи на указанных выше спицах. После открытия проекта расчёт воспроизводится из тех же сохранённых данных.";
      const format = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
      for (const row of preview.rows) {
        const section = document.createElement("section");
        const title = document.createElement("h3");
        title.textContent = `${row.label}: ${row.value} ${row.unit}`;
        const formula = document.createElement("p");
        formula.textContent = `Формула: ${row.formula} = ${format(row.exact)}. ${row.rounding}.`;
        const size = document.createElement("p");
        size.textContent = `Цель ${format(row.targetCm)} см → после округления ${format(row.resultingCm)} см; отклонение ${format(row.deviationCm)} см.`;
        section.append(title, formula, size);
        byId("calculation-preview-values").append(section);
      }
      for (const text of preview.limitations) {
        const item = document.createElement("li"); item.textContent = text;
        byId("calculation-preview-limitations").append(item);
      }
    } catch (error) {
      byId("calculation-preview-status").textContent = error.message || "Расчёт недоступен. Проверь исходные данные.";
    }
  }

  function renderIssueList(container, values, label) {
    const items = values.length ? values.map((entry) => {
      const item = document.createElement("li");
      const field = fieldElement(entry.field);
      if (field) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "text-button"; button.textContent = label(entry);
        button.addEventListener("click", () => { field.focus(); field.scrollIntoView({ behavior: "smooth", block: "center" }); });
        item.append(button);
      } else item.textContent = label(entry);
      return item;
    }) : [emptyListItem("Нет")];
    container.replaceChildren(...items);
  }

  function issueText(entry) { return `${entry.title}. ${entry.explanation}`; }
  function emptyListItem(text) { const item = document.createElement("li"); item.textContent = text; item.className = "muted"; return item; }

  function fieldElement(field) {
    const exact = {
      finished_bust_circumference: ui.garmentBust, finished_body_length: ui.garmentLength, finished_sleeve_length: ui.garmentSleeve,
      finished_upper_arm_circumference: ui.garmentUpperArm, finished_cuff_circumference: ui.garmentCuff,
      finished_neck_width: ui.garmentNeckWidth, finished_front_neck_depth: ui.garmentFrontNeckDepth,
      finished_waist_circumference: ui.garmentWaist, finished_hip_circumference: ui.garmentHip,
      finished_yoke_depth: ui.garmentYokeDepth, finished_armhole_depth: ui.garmentArmholeDepth,
      body_bust_circumference: ui.bodyBust, body_waist_circumference: ui.bodyWaist, body_hip_circumference: ui.bodyHip,
      body_shoulder_width: ui.bodyShoulder, body_back_width: ui.bodyBack, bust_ease: ui.easeBust,
      body_shaping_preference: ui.bodyShaping, neckline_style: ui.necklineStyle, closure_style: ui.closureStyle,
      hem_finish: ui.hemFinish, cuff_finish: ui.cuffFinish,
      "needles.primaryMm": ui.needlesPrimary, "gauge.needleSizeMm": ui.gaugeNeedle, "gauge.afterTreatment": ui.gaugeTreated, "yarn.name": ui.yarnName, "yarn.strandCount": ui.yarnStrandCount,
    };
    if (byId("gauge-source").value === "manufacturer") {
      const labelField = {"gauge.stitches": "label-stitches", "gauge.rows": "label-rows", "gauge.needleSizeMm": "label-needle"}[field];
      if (labelField) return byId(labelField);
    }
    if (exact[field]) return exact[field];
    if (field?.startsWith("gauge.stitches")) return ui.gaugeStitches;
    if (field?.startsWith("gauge.widthCm")) return ui.gaugeWidth;
    if (field?.startsWith("gauge.rows")) return ui.gaugeRows;
    if (field?.startsWith("gauge.heightCm")) return ui.gaugeHeight;
    if (field?.startsWith("yarn.")) return ui.yarnName;
    return null;
  }

  function statusLabel(status) {
    return ({ incomplete: "Неполные данные — подтверждение недоступно", needs_attention: "Нужно решение — подтверждение недоступно", ready_to_confirm: "Данные достаточны для явного подтверждения", confirmed: "Исходные данные подтверждены", stale: "Проверка устарела — подтверждение недоступно", failed: "Проверка завершилась технической ошибкой" })[status] || status;
  }

  function validationContext() {
    return {};
  }

  function setFormLocked(locked) {
    ui.form.classList.toggle("form-locked", locked);
    [...ui.form.querySelectorAll("input, select, textarea")].forEach((field) => { field.disabled = locked; });
    ui.save.disabled = locked || busy;
    ui.save.closest(".save-panel").hidden = locked;
    ui.photoInput.disabled = locked;
    ["apply-polo-proposal", "use-one-strand", "copy-swatch-needles"].forEach((id) => { byId(id).disabled = locked || busy; });
    if (!locked) renderFieldAvailability();
  }

  function fillForm(artifact) {
    const body = measurementMap(artifact.targetSizing.bodyMeasurements);
    const garment = measurementMap(artifact.targetSizing.finishedGarmentMeasurements);
    const ease = measurementMap(artifact.targetSizing.ease);
    setValue(ui.selectedSize, artifact.targetSizing.selectedSize);
    setValue(ui.bodyBust, body.bust_circumference); setValue(ui.bodyWaist, body.waist_circumference); setValue(ui.bodyHip, body.hip_circumference); setValue(ui.bodyLength, body.body_length); setValue(ui.bodyShoulder, body.body_shoulder_width); setValue(ui.bodyBack, body.body_back_width);
    setValue(ui.garmentBust, garment.finished_bust_circumference); setValue(ui.garmentLength, garment.finished_body_length); setValue(ui.garmentSleeve, garment.finished_sleeve_length); setValue(ui.garmentUpperArm, garment.finished_upper_arm_circumference); setValue(ui.garmentCuff, garment.finished_cuff_circumference); setValue(ui.garmentNeckWidth, garment.finished_neck_width); setValue(ui.garmentFrontNeckDepth, garment.finished_front_neck_depth); setValue(ui.garmentWaist, garment.finished_waist_circumference); setValue(ui.garmentHip, garment.finished_hip_circumference); setValue(ui.garmentYokeDepth, garment.finished_yoke_depth); setValue(ui.garmentArmholeDepth, garment.finished_armhole_depth); setValue(ui.easeBust, ease.bust_ease);
    setValue(ui.bodyShaping, artifact.targetSizing.fitPreferences?.body_shaping_preference); setValue(ui.necklineStyle, artifact.targetSizing.fitPreferences?.neckline_style); setValue(ui.closureStyle, artifact.targetSizing.fitPreferences?.closure_style); setValue(ui.hemFinish, artifact.constructionInputs?.hem_finish); setValue(ui.cuffFinish, artifact.constructionInputs?.cuff_finish);
    byId("bust-method").value = !ui.garmentBust.value && (ui.bodyBust.value || ui.easeBust.value) ? "body" : "garment";
    ui.yarnStatus.value = artifact.yarn.selectionStatus;
    setValue(ui.yarnName, artifact.yarn.name); setValue(ui.yarnStrandCount, artifact.yarn.strandCount); setValue(ui.yarnComposition, artifact.yarn.composition); setValue(ui.yarnLength, artifact.yarn.lengthMeters); setValue(ui.yarnMass, artifact.yarn.skeinMassGrams); setValue(ui.yarnQuantity, artifact.yarn.quantityAvailable); setValue(ui.yarnNote, artifact.yarn.note);
    ui.needlesStatus.value = artifact.needles.selectionStatus;
    setValue(ui.needlesPrimary, artifact.needles.primaryMm); setValue(ui.needlesAdditional, artifact.needles.additionalMm.join(", "));
    const label = artifact.gauge.label || {};
    byId("gauge-source").value = artifact.gauge.source || "measured";
    setValue(byId("label-stitches"), label.stitchesPer10Cm);
    setValue(byId("label-rows"), label.rowsPer10Cm);
    setValue(byId("label-needle"), label.recommendedNeedleMm);
    const gauge = artifact.gauge.sourceMeasurement || {};
    setValue(ui.gaugeStitches, gauge.stitches); setValue(ui.gaugeWidth, gauge.widthCm); setValue(ui.gaugeRows, gauge.rows); setValue(ui.gaugeHeight, gauge.heightCm); setValue(ui.gaugeNeedle, gauge.needleSizeMm); ui.gaugeTreated.value = gauge.afterTreatment || "unknown";
    setValue(ui.notes, artifact.notes);
  }

  function readForm() {
    return {
      targetSizing: {
        selectedSize: ui.selectedSize.value,
        bodyMeasurements: { bust_circumference: ui.bodyBust.value, waist_circumference: ui.bodyWaist.value, hip_circumference: ui.bodyHip.value, body_length: ui.bodyLength.value, body_shoulder_width: ui.bodyShoulder.value, body_back_width: ui.bodyBack.value },
        finishedGarmentMeasurements: { finished_bust_circumference: ui.garmentBust.value, finished_body_length: ui.garmentLength.value, finished_sleeve_length: ui.garmentSleeve.value, finished_upper_arm_circumference: ui.garmentUpperArm.value, finished_cuff_circumference: ui.garmentCuff.value, finished_neck_width: ui.garmentNeckWidth.value, finished_front_neck_depth: ui.garmentFrontNeckDepth.value, finished_waist_circumference: ui.garmentWaist.value, finished_hip_circumference: ui.garmentHip.value, finished_yoke_depth: ui.garmentYokeDepth.value, finished_armhole_depth: ui.garmentArmholeDepth.value },
        ease: { bust_ease: ui.easeBust.value },
        fitPreferences: { body_shaping_preference: ui.bodyShaping.value, neckline_style: ui.necklineStyle.value, closure_style: ui.closureStyle.value },
      },
      constructionInputs: { hem_finish: ui.hemFinish.value, cuff_finish: ui.cuffFinish.value },
      yarn: { selectionStatus: ui.yarnStatus.value, name: ui.yarnName.value, strandCount: ui.yarnStrandCount.value, composition: ui.yarnComposition.value, lengthMeters: ui.yarnLength.value, skeinMassGrams: ui.yarnMass.value, quantityAvailable: ui.yarnQuantity.value, note: ui.yarnNote.value },
      needles: { selectionStatus: ui.needlesStatus.value, primaryMm: ui.needlesPrimary.value, additionalMm: ui.needlesAdditional.value },
      gauge: {
        source: byId("gauge-source").value,
        label: { stitchesPer10Cm: byId("label-stitches").value, rowsPer10Cm: byId("label-rows").value, recommendedNeedleMm: byId("label-needle").value },
        sourceMeasurement: { stitches: ui.gaugeStitches.value, widthCm: ui.gaugeWidth.value, rows: ui.gaugeRows.value, heightCm: ui.gaugeHeight.value, needleSizeMm: ui.gaugeNeedle.value, afterTreatment: ui.gaugeTreated.value },
      },
      notes: ui.notes.value,
    };
  }

  function renderSectionStatus(status) {
    const labels = { targetSizing: "Мерки и параметры изделия", yarn: "Пряжа", needles: "Спицы", gauge: "Плотность полотна", additionalPhotos: "Дополнительные фотографии", notes: "Заметки" };
    ui.sectionStatus.replaceChildren(...Object.entries(labels).map(([key, label]) => {
      const item = document.createElement("li");
      item.className = status[key] ? "filled" : "empty";
      item.textContent = `${label}: ${status[key] ? "есть данные" : "не заполнено"}`;
      return item;
    }));
  }

  function renderGarmentRequirements(artifact) {
    const profile = artifact.garmentRequirementsProfile;
    if (!profile || profile.status !== "resolved") {
      ui.requirementsStatus.textContent = "Профиль не разрешён. Подтверждение недоступно.";
      ui.requirementsFirstAction.textContent = profile?.firstAction || "Вернись к подтверждённому выбору технологии.";
      ui.requirementsList.replaceChildren();
      return;
    }
    const evaluation = requirementsDomain.evaluateProfile(profile, artifact);
    ui.requirementsStatus.textContent = evaluation.blockers.length
      ? "Заполни нужные размеры ниже. Для ширины по груди достаточно одного из двух способов. Черновик можно сохранить в любой момент."
      : "Все обязательные мерки и параметры изделия заполнены. Профиль пряжи показан отдельным разделом ниже.";
    ui.requirementsFirstAction.textContent = evaluation.firstAction || "По меркам изделия обязательных действий больше нет.";
    const itemsById = new Map(evaluation.items.map((entry) => [entry.measurementId, entry]));
    ui.requirementsList.replaceChildren(...profile.measurementRequirements.filter((requirement) => {
      const item = itemsById.get(requirement.measurementId);
      return item.active && requirement.requirementLevel !== "optional" && requirement.valuePath;
    }).map((requirement) => {
      const item = itemsById.get(requirement.measurementId);
      const card = document.createElement("article"); card.className = `requirement-card ${item.status}`;
      const heading = document.createElement("h3"); heading.textContent = requirement.labelRu;
      const meta = document.createElement("p"); meta.className = "requirement-meta"; meta.textContent = `${requirementLevelLabel(requirement.requirementLevel, item.active)} · ${inputTypeLabel(requirement.inputType)} · ${unitLabel(requirement.unit)}`;
      const explanation = document.createElement("p"); explanation.textContent = requirement.explanationRu;
      const reason = document.createElement("p"); reason.className = "muted"; reason.textContent = `Почему нужно: ${requirement.reasonRu}`;
      const state = document.createElement("strong"); state.className = "requirement-state"; state.textContent = requirementStateLabel(item.status);
      card.append(heading, meta, explanation, reason, state);
      const field = fieldElement(requirement.measurementId);
      if (field && item.active && item.status !== "filled") {
        const button = document.createElement("button"); button.type = "button"; button.className = "text-button"; button.textContent = "Перейти к полю"; button.addEventListener("click", () => { field.focus(); field.scrollIntoView({ behavior: "smooth", block: "center" }); }); card.append(button);
      }
      return card;
    }));
  }

  function renderHumanIntake() {
    const profile = inspected?.artifact?.garmentRequirementsProfile;
    if (!profile) return;
    const setIn = profile.constructionIdentity === "seamed_set_in_sleeve";
    byId("polo-design-proposal").hidden = !setIn;
    const manufacturer = byId("gauge-source").value === "manufacturer";
    byId("manufacturer-gauge").hidden = !manufacturer;
    byId("measured-gauge").hidden = manufacturer;
    byId("intake-swatch-instructions").hidden = !setIn;
    // Retain every existing value, including optional legacy data. Only empty,
    // irrelevant fields are omitted from the immediate questionnaire.
    const hideEmpty = (field, irrelevant) => { field.closest("label").hidden = irrelevant && field.value === ""; };
    [ui.bodyWaist, ui.bodyHip, ui.bodyLength, ui.selectedSize].forEach((field) => hideEmpty(field, true));
    hideEmpty(ui.bodyBack, setIn);
    hideEmpty(ui.garmentYokeDepth, setIn);
    hideEmpty(ui.garmentArmholeDepth, !setIn);
    hideEmpty(ui.bodyShoulder, !setIn);
    [ui.garmentWaist, ui.garmentHip].forEach((field) => hideEmpty(field, ui.bodyShaping.value !== "shaped"));
    const hasFinished = Number(ui.garmentBust.value) > 0;
    const hasBody = Number(ui.bodyBust.value) > 0;
    const hasEase = ui.easeBust.value !== "" && Number.isFinite(Number(ui.easeBust.value));
    const bodyMethod = byId("bust-method").value === "body";
    hideEmpty(ui.bodyBust, !bodyMethod);
    hideEmpty(ui.easeBust, !bodyMethod);
    hideEmpty(ui.garmentBust, bodyMethod);
    ui.easeBust.closest("fieldset").hidden = ui.easeBust.closest("label").hidden;
    byId("bust-method-status").textContent = hasFinished
      ? `Обхват готового поло: ${ui.garmentBust.value} см. Мерку груди человека и прибавку повторно вводить не нужно.`
      : hasBody && hasEase
      ? `Обхват поло будет рассчитан: ${ui.bodyBust.value} + ${ui.easeBust.value} = ${Number(ui.bodyBust.value) + Number(ui.easeBust.value)} см.`
      : "Можно начать с удобного поло: измерь ширину под проймами и умножь на два. Или укажи обхват груди человека и желаемую прибавку ниже.";
    const overrides = {
      finished_sleeve_length: "От верхней точки шва рукава у плеча до нижнего края рукава, включая манжету. Нужна полная длина рукава.",
      finished_upper_arm_circumference: "На подходящем поло измерь ширину рукава сразу под подмышкой и умножь на два. Это задаёт ширину верхней части рукава.",
      finished_cuff_circumference: "Измерь ширину нижнего края рукава без растяжения и умножь на два. Это задаёт ширину манжеты.",
      finished_front_neck_depth: "От уровня верхних точек плеч у шеи вертикально до нижней точки самой горловины. Длину разреза с пуговицами сюда не включай — она задаётся позже.",
      bust_ease: "На сколько сантиметров поло должно быть шире обхвата груди человека. Можно измерить удобное поло: его обхват минус обхват груди. YarnAI прибавит это число сам.",
    };
    for (const requirement of profile.measurementRequirements) {
      const field = fieldElement(requirement.measurementId);
      if (!field) continue;
      const id = `${field.id}-help`;
      let help = byId(id);
      if (!help) { help = document.createElement("small"); help.id = id; field.closest("label").append(help); field.setAttribute("aria-describedby", id); }
      help.textContent = (setIn && overrides[requirement.measurementId]) || requirement.explanationRu;
    }
    const unsupported = setIn && [[ui.bodyShaping, "straight"], [ui.necklineStyle, "polo_collar_with_placket"], [ui.closureStyle, "short_front_placket"], [ui.hemFinish, "rib"], [ui.cuffFinish, "rib"]].some(([field, value]) => field.value && field.value !== value);
    byId("polo-design-warning").textContent = unsupported
      ? "Выбран другой вариант. Его можно сохранить, но текущий полный расчёт поддерживает только прямое поло с короткой планкой и резинками. Твой выбор автоматически не меняется."
      : "Кнопка заполнит только пустые ответы. Проверь их и сохрани черновик; свои уже выбранные параметры она не заменит.";
  }

  function markDraftChanged() {
    if (validationInspected?.state?.status === "confirmed") return;
    ui.confirm.disabled = true;
    ui.saveStatus.textContent = "Есть изменения. Сохрани черновик или нажми «Проверить данные».";
    ui.validationStatus.textContent = "Данные изменены — нужна повторная проверка";
  }

  function renderYarnRequirements(artifact) {
    const profile = artifact.yarnRequirementsProfile;
    if (!profile || profile.status !== "resolved") {
      ui.yarnRequirementsStatus.textContent = "Профиль требований к пряже не разрешён. Подтверждение недоступно.";
      ui.yarnRequirementsFirstAction.textContent = profile?.firstAction || "Открой текущий проект заново.";
      ui.yarnRequirementsList.replaceChildren();
      return;
    }
    const evaluation = yarnRequirementsDomain.evaluateProfile(profile, artifact);
    ui.yarnRequirementsStatus.textContent = evaluation.selected
      ? (evaluation.blockers.length ? `Пряжа выбрана, но обязательных незаполненных значений: ${evaluation.blockers.length}.` : "Обязательные сведения о выбранной пряже заполнены.")
      : "Укажи свою пряжу: нужны название и число нитей, которыми будешь вязать поло.";
    ui.yarnRequirementsFirstAction.textContent = evaluation.firstAction || "По пряже обязательных действий больше нет.";
    const itemsById = new Map(evaluation.items.map((entry) => [entry.requirementId, entry]));
    ui.yarnRequirementsList.replaceChildren(...profile.requirements.map((requirement) => {
      const item = itemsById.get(requirement.requirementId);
      const card = document.createElement("article"); card.className = `requirement-card ${item.status}`;
      const heading = document.createElement("h3"); heading.textContent = requirement.labelRu;
      const meta = document.createElement("p"); meta.className = "requirement-meta"; meta.textContent = `${yarnRequirementLevelLabel(requirement.requirementLevel, item.active)} · ${yarnValueTypeLabel(requirement.valueType)} · ${yarnUnitLabel(requirement.unit)}`;
      const explanation = document.createElement("p"); explanation.textContent = requirement.explanationRu;
      const reason = document.createElement("p"); reason.className = "muted"; reason.textContent = `Почему так: ${requirement.reasonRu}`;
      const state = document.createElement("strong"); state.className = "requirement-state"; state.textContent = yarnRequirementStateLabel(item.status);
      card.append(heading, meta, explanation, reason, state);
      const field = fieldElement(requirement.valuePath);
      if (field && item.active && !["filled", "informational"].includes(item.status)) {
        const button = document.createElement("button"); button.type = "button"; button.className = "text-button"; button.textContent = "Перейти к полю"; button.addEventListener("click", () => { field.focus(); field.scrollIntoView({ behavior: "smooth", block: "center" }); }); card.append(button);
      }
      return card;
    }));
  }

  function renderPhotoYarnAdvisory() {
    const garmentKind = globalObject.YarnAIGarmentReferenceAnalysis?.PROGRESS_KIND;
    const garment = inspected.aggregate.progress.find((entry) => entry.kind === garmentKind && entry.calculation_id === inspected.calculation.calculation_id && entry.epoch === 1);
    const analysis = garment?.state?.analysis || {};
    const advisoryField = /пряж|нить|волок|материал|фактур|текстур|цвет|yarn|fiber|material|texture|color/i;
    const candidates = [
      ...(analysis.visibleObservations || []).map((entry) => ({ kind: "Наблюдение", entry })),
      ...(analysis.inferences || []).map((entry) => ({ kind: "Предположение", entry })),
    ].filter(({ entry }) => advisoryField.test(String(entry.field || "")));
    ui.photoYarnAdvisory.replaceChildren(...(candidates.length ? candidates.map(({ kind, entry }) => {
      const item = document.createElement("li");
      const text = String(entry.value || entry.description || entry.visualEvidence || entry.explanation || "Сведения без текстового значения").replace(/\s+/g, " ").replace(/[.!?]+$/, "");
      item.textContent = `${kind} ${entry.id || "без ID"}: ${text}. Ориентир, не факт о пряже.`;
      return item;
    }) : [emptyListItem("В сохранённом анализе нет сведений о пряже, которые можно показать даже как ориентир.")]));
  }

  function renderYarnRecommendation() {
    const recommendation = recommendationInspected?.artifact || null;
    const current = recommendationInspected?.current === true;
    const currentValidation = recommendationInspected?.currentValidation || null;
    const fullyValid = Boolean(recommendation && current && currentValidation?.semanticValid === true);
    const legacySemanticInvalid = Boolean(recommendation && current && currentValidation?.schemaDomainValid === true && currentValidation?.semanticValid === false && currentValidation?.bindingValid === true);
    const bindingInvalid = Boolean(recommendation && currentValidation?.bindingValid === false);
    ui.recommendationEmpty.hidden = fullyValid;
    ui.recommendationContent.hidden = !fullyValid;
    if (!fullyValid) {
      const heading = ui.recommendationEmpty.querySelector("h3"); const paragraph = ui.recommendationEmpty.querySelector("p");
      if (bindingInvalid) {
        heading.textContent = "Сохранённая рекомендация не совпадает с текущей цепочкой";
        paragraph.textContent = `Binding не совпадает (${currentValidation?.reasonCode || "RECOMMENDATION_BINDING_MISMATCH"}) или состояние stale. Исправляющая попытка заблокирована; сохранённая rev1 не изменялась.`;
      } else if (legacySemanticInvalid) {
        heading.textContent = "Существующая рекомендация не прошла текущую проверку качества";
        paragraph.textContent = "Сохранённая rev1 читается, но не соответствует действующему смысловому контракту. Разрешена одна исправляющая попытка: rev1 будет заменена rev2 только после полного validation PASS. При ошибке rev1 останется без изменений; автоматического повтора не будет.";
      } else if (recommendation && !current) {
        heading.textContent = "Старая рекомендация больше не актуальна";
        paragraph.textContent = "Изменилась фотография, анализ или подтверждённая технология. Binding не совпадает или состояние stale; старые диапазоны не используются, исправляющая попытка заблокирована.";
      } else if (recommendationInspected?.progress && recommendationInspected?.integrityStatus === "invalid") {
        heading.textContent = "Сохранённую рекомендацию нельзя безопасно прочитать";
        paragraph.textContent = `Artifact повреждён (${recommendationInspected.errorCode || "RECOMMENDATION_INTEGRITY_INVALID"}). Исправляющая попытка заблокирована; сохранённые данные не изменялись.`;
      } else {
        heading.textContent = "Рекомендация ещё не сформирована";
        paragraph.textContent = "Старый анализ честно не содержит числовой характеристики пряжи. Конкретная пряжа ниже остаётся твоим отдельным выбором.";
      }
      renderSupplementControls();
      return;
    }
    ui.recommendationSummary.textContent = recommendation.summary;
    renderTargetDecision(recommendation);
    replaceList(ui.recommendationEvidence, [
      `Масштаб вязки: ${recommendation.visualEvidence.knitScale}`,
      `Вертикальная фактура: ${recommendation.visualEvidence.verticalTexture}`,
      `Чёткость петель: ${recommendation.visualEvidence.stitchClarity}`,
      `Поверхность: ${recommendation.visualEvidence.surface}`,
      `Полотно: ${recommendation.visualEvidence.fabricBehavior}`,
      `Цветовой эффект: ${recommendation.visualEvidence.colorEffect}`,
      `Уверенность: ${confidenceLabel(recommendation.visualEvidence.confidence)}.`,
    ]);
    replaceList(ui.recommendationSurface, recommendation.semanticContract ? [
      recommendation.surfaceRecommendation.preferred,
      recommendation.surfaceRecommendation.slightHalo,
      recommendation.surfaceRecommendation.mediumHalo,
      recommendation.surfaceRecommendation.strongHalo,
      recommendation.surfaceRecommendation.companionThread,
    ] : [recommendation.surfaceRecommendation.preferred, recommendation.surfaceRecommendation.slightHalo, recommendation.surfaceRecommendation.mediumOrStrongHalo, recommendation.surfaceRecommendation.companionThread]);
    replaceList(ui.recommendationLimitations, [...recommendation.limitations, ...recommendation.visualEvidence.photoLimitations]);
    ui.recommendationSwatch.textContent = recommendation.swatchRequirement.message;
    renderSupplementControls();
  }

  function renderTargetDecision(recommendation) {
    if (!targetDecisionInspected) {
      ui.targetDecisionStatus.textContent = "Сохранённая рекомендация недоступна для безопасного выбора.";
      ui.targetOptions.replaceChildren();
      ui.targetConfirmation.hidden = true;
      ui.targetConfirmed.hidden = true;
      return;
    }
    const effectiveStatus = targetDecisionInspected.effectiveStatus;
    const selectedOptionId = targetDecisionInspected.artifact?.selectedOptionId || null;
    const closestOptionId = targetDecisionInspected.closest.optionId;
    const locked = ["confirmed", "stale", "failed"].includes(effectiveStatus);
    const options = yarnTargetDecisionDomain.optionModels(recommendation);
    ui.targetOptions.replaceChildren(...options.map((option) => {
      const variant = option.variant;
      const closest = option.optionId === closestOptionId;
      const selected = option.optionId === selectedOptionId;
      const card = document.createElement("article");
      card.className = `target-option-card${closest ? " closest" : ""}${selected ? " selected" : ""}`;
      if (selected) card.setAttribute("aria-current", "true");
      const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = closest ? "Сохранённая рекомендация: наиболее похоже" : "Сравнительный вариант";
      const heading = document.createElement("h4"); heading.textContent = targetOptionLabel(option.optionId, closest);
      const details = document.createElement("dl"); details.className = "target-option-details";
      appendDetail(details, "Метраж или толщина", `${formatRange(variant.metersPer100g)} м/100 г · ${variant.categoryRu}`);
      appendDetail(details, "Ожидаемая плотность", `${formatRange(variant.targetStitchesPer10cm)} петель на 10 см; ${variant.targetRowsPer10cm ? `${formatRange(variant.targetRowsPer10cm)} рядов на 10 см` : variant.rowGaugeUncertainty}`);
      appendDetail(details, "Диапазон спиц", `${formatRange(variant.initialNeedlesMm)} мм`);
      appendDetail(details, "Эффект для фактуры", variant.textureEffect);
      appendDetail(details, "Эффект для силуэта", `${variant.drapeStructure} ${variant.garmentWeightVolume}`);
      appendDetail(details, "Поведение поверхности", `${surfaceLabel(variant.surface)}. ${variant.trimBehavior}`);
      appendDetail(details, "Предупреждения и ограничения", `${variant.referenceSimilarity} Риск: ${variant.risk} Уверенность: ${confidenceLabel(variant.confidence)}.`);
      const button = document.createElement("button"); button.type = "button"; button.className = closest ? "button" : "button secondary";
      button.textContent = selected ? "Этот вариант выбран" : "Выбрать как целевой профиль";
      button.disabled = busy || locked || selected || option.optionId !== closestOptionId;
      if (option.optionId !== closestOptionId) button.title = "Для действующего намерения «Максимально похоже на фотографию» этот вариант доступен для сравнения, но не для подтверждения.";
      button.addEventListener("click", async () => {
        await mutate(async () => {
          targetDecisionInspected = await yarnTargetDecisionDomain.selectForProject(repository, projectId, option.optionId, { ownerIntent: yarnTargetDecisionDomain.OWNER_INTENTS.MAXIMUM_PHOTO_SIMILARITY });
        }, "Не удалось выбрать целевой профиль.", "Вариант выбран. Для подтверждения используй отдельную кнопку ниже.");
      });
      card.append(eyebrow, heading, details, button);
      return card;
    }));
    ui.targetConfirmation.hidden = effectiveStatus !== "ready_to_confirm";
    ui.targetConfirmed.hidden = effectiveStatus !== "confirmed";
    ui.targetConfirm.disabled = effectiveStatus !== "ready_to_confirm" || busy;
    if (effectiveStatus === "ready_to_choose") ui.targetDecisionStatus.textContent = "Карточки можно сравнить. Выбор появится только после нажатия отдельной кнопки внутри карточки.";
    else if (effectiveStatus === "ready_to_confirm") ui.targetDecisionStatus.textContent = `Выбран вариант «${targetOptionLabel(selectedOptionId, selectedOptionId === closestOptionId)}», но он ещё не подтверждён.`;
    else if (effectiveStatus === "confirmed") ui.targetDecisionStatus.textContent = `Выбор подтверждён и связан с рекомендацией revision ${targetDecisionInspected.artifact.upstream.yarnRecommendation.revision}.`;
    else if (effectiveStatus === "stale") ui.targetDecisionStatus.textContent = "Рекомендация изменилась. Старое решение сохранено как устаревшее и не переписано.";
    else ui.targetDecisionStatus.textContent = "Решение нельзя безопасно прочитать. Сохранённые данные не изменялись.";
    if (targetDecisionInspected.artifact) {
      const summary = `${targetOptionLabel(selectedOptionId, selectedOptionId === closestOptionId)}: ${targetDecisionInspected.artifact.selectionReason}`;
      ui.targetSelectedSummary.textContent = summary;
      ui.targetConfirmedSummary.textContent = summary;
    }
  }

  function targetOptionLabel(optionId, closest) {
    if (closest) return "Максимально близко к фотографии";
    return ({ thinner: "Тоньше", recommended_middle: "Середина", thicker: "Толще" })[optionId] || "Вариант";
  }

  function appendDetail(list, termText, detailText) {
    const term = document.createElement("dt"); term.textContent = termText;
    const detail = document.createElement("dd"); detail.textContent = detailText;
    list.append(term, detail);
  }

  function renderSupplementControls() {
    supplementControlState = yarnRecommendationDomain.retryControlState(recommendationInspected, supplementConfiguration, Boolean(supplementPrepared));
    ui.supplementControls.hidden = !supplementControlState.available;
    ui.supplementRun.textContent = supplementControlState.mode === "legacy_retry" ? "Исправить рекомендацию по пряже" : "Сформировать рекомендацию по пряже";
    ui.supplementRun.disabled = !supplementControlState.available || !ui.supplementConfirm.checked || busy;
  }

  function recommendationRow(label, variant, primary) {
    const row = document.createElement("tr");
    if (primary) row.className = "recommended-middle";
    const rows = variant.targetRowsPer10cm ? `${formatRange(variant.targetRowsPer10cm)} рядов на 10 см после обработки` : variant.rowGaugeUncertainty;
    const values = [
      label,
      `${formatRange(variant.metersPer100g)} м/100 г (${formatRange(yarnRecommendationDomain.metersPer50g(variant.metersPer100g))} м/50 г), ${variant.categoryRu}, ${variant.strandCount} ${variant.strandCount === 1 ? "нить" : "нити"}`,
      `${formatRange(variant.targetStitchesPer10cm)} петель на 10 см после обработки; ${rows}`,
      `${formatRange(variant.initialNeedlesMm)} мм`,
      surfaceLabel(variant.surface),
      `${variant.textureEffect} ${variant.drapeStructure} ${variant.garmentWeightVolume} ${variant.trimBehavior}`,
      `${variant.referenceSimilarity} Риск: ${variant.risk} Уверенность: ${confidenceLabel(variant.confidence)}.`,
    ];
    values.forEach((value, index) => { const cell = document.createElement("td"); cell.textContent = value; if (index === 0) cell.className = "variant-name"; row.append(cell); });
    return row;
  }

  function variantSummary(variant) {
    return `${formatRange(variant.metersPer100g)} м на 100 г, ${variant.categoryRu}; ориентир ${formatRange(variant.targetStitchesPer10cm)} петель на 10 см; начни с ${formatRange(variant.initialNeedlesMm)} мм. ${variant.referenceSimilarity}`;
  }
  function formatRange(value) { return value.min === value.max ? String(value.min) : `${value.min}–${value.max}`; }
  function surfaceLabel(value) { return ({ smooth: "Гладкая, без выраженного ворса", slight_halo: "Слабый ореол ворса — лёгкая мягкая дымка", medium_halo: "Средний ворс", strong_halo_or_brushed: "Сильный ворс или выраженный начёс" })[value] || value; }
  function confidenceLabel(value) { return ({ low: "низкая", medium: "средняя", high: "высокая" })[value] || value; }
  function replaceList(container, values) { container.replaceChildren(...values.map((value) => { const item = document.createElement("li"); item.textContent = value; return item; })); }

  function requirementLevelLabel(level, active) { if (level === "required") return "Обязательно"; if (level === "optional") return "Необязательно"; return active ? "Условно — сейчас обязательно" : "Условно — сейчас не требуется"; }
  function inputTypeLabel(value) { return ({ BODY_MEASUREMENT: "мерка человека", FINISHED_GARMENT_MEASUREMENT: "размер готового изделия", FIT_PREFERENCE: "предпочтение по посадке", CONSTRUCTION_INPUT: "параметр конструкции" })[value] || value; }
  function unitLabel(value) { return ({ cm: "сантиметры", choice: "выбор", construction_identity: "определено технологией" })[value] || value; }
  function requirementStateLabel(value) { return ({ filled: "Заполнено", missing: "Не заполнено", invalid: "Неверное значение", inactive: "Сейчас не применяется" })[value] || value; }
  function yarnRequirementLevelLabel(level, active) { return ({ required: "Обязательно", conditional: active ? "Условно — применяется" : "Условно — не применяется", optional: "Необязательно", informational: "Справочно" })[level] || level; }
  function yarnValueTypeLabel(value) { return ({ text: "текст", positive_integer: "целое число", positive_number: "число", resolved_text: "определено маршрутом", not_required: "отдельное поле не требуется" })[value] || value; }
  function yarnUnitLabel(value) { return ({ identity: "идентичность", strand_count: "число нитей", g_per_skein: "граммы на моток", m_per_skein: "метры на моток", skeins: "мотки", text: "текст", method: "способ", category: "категория", mm_range: "диапазон миллиметров" })[value] || value; }
  function yarnRequirementStateLabel(value) { return ({ filled: "Заполнено", missing: "Не заполнено", invalid: "Неверное значение", pending_selection: "Ожидает выбора пряжи", informational: "Справочно" })[value] || value; }

  function renderGaugePreview() {
    const numbers = [ui.gaugeStitches.value, ui.gaugeWidth.value, ui.gaugeRows.value, ui.gaugeHeight.value].map(Number);
    if (numbers.every((entry) => Number.isFinite(entry) && entry > 0)) {
      const stitches = Math.round((numbers[0] * 10 / numbers[1] + Number.EPSILON) * 10000) / 10000;
      const rows = Math.round((numbers[2] * 10 / numbers[3] + Number.EPSILON) * 10000) / 10000;
      ui.normalizedGauge.textContent = `Справочная нормализация: ${stitches} п. и ${rows} р. на 10 см. Исходное измерение сохранится отдельно; расчёт изделия не запускается.`;
    } else {
      ui.normalizedGauge.textContent = "Нормализация на 10 см появится только после четырёх фактических чисел.";
    }
  }

  async function hydratePreviews() {
    const photos = inspected?.artifact?.additionalPhotos || [];
    for (const photo of photos) {
      if (previews.has(photo.photoId)) continue;
      const stored = await repository.getPhoto(projectId, photo.photoId);
      if (stored?.blob) previews.set(photo.photoId, globalObject.URL.createObjectURL(stored.blob));
    }
  }

  function renderPhotos(artifact) {
    ui.photoGrid.replaceChildren(...(artifact.additionalPhotos.length ? artifact.additionalPhotos.map((photo) => {
      const figure = document.createElement("figure"); figure.className = "photo-card";
      const image = document.createElement("img"); image.src = previews.get(photo.photoId) || ""; image.alt = `${domain.PHOTO_ROLES[photo.role]}: ${photo.displayName}`;
      const caption = document.createElement("figcaption"); caption.textContent = `${domain.PHOTO_ROLES[photo.role]} — ${photo.displayName} · только локально`;
      figure.append(image, caption); return figure;
    }) : [emptyCard("Дополнительных фотографий пока нет.")]));
  }

  async function captureProtectedProjects() {
    const projects = await repository.listProjects({ section: "all" });
    const entries = [];
    for (const project of projects.filter((entry) => entry.project_id !== projectId).sort((left, right) => left.project_id.localeCompare(right.project_id))) {
      entries.push([project.project_id, await sha256Canonical(await repository.getProject(project.project_id, { includeDeleted: true }))]);
    }
    return Object.freeze({ entries: Object.freeze(entries.map((entry) => Object.freeze(entry))), aggregateHash: await sha256Canonical(entries) });
  }

  function protectedProjectChanges() {
    if (!protectedProjectsBaseline || !protectedProjectsAudit) return [];
    const before = new Map(protectedProjectsBaseline.entries);
    const after = new Map(protectedProjectsAudit.entries);
    return [...new Set([...before.keys(), ...after.keys()])].filter((id) => before.get(id) !== after.get(id)).sort();
  }

  async function sha256Canonical(value) {
    const bytes = new TextEncoder().encode(canonicalize(value));
    const digest = await globalObject.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }

  function renderFieldAvailability() {
    [...ui.yarnFields.querySelectorAll("input, textarea")].forEach((field) => { field.disabled = ui.yarnStatus.value !== "selected"; });
    [...ui.needlesFields.querySelectorAll("input")].forEach((field) => { field.disabled = ui.needlesStatus.value !== "selected"; });
  }

  function measurementMap(values) { return Object.fromEntries(values.map((entry) => [entry.kind, entry.value])); }
  function setValue(element, value) { element.value = value === null || value === undefined ? "" : String(value); }
  function emptyCard(text) { const card = document.createElement("div"); card.className = "empty"; card.textContent = text; return card; }
  function formatTime(value) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Warsaw" }).format(new Date(value)); }
  function projectTitleLabel(value) { return String(value || "Проект по фотографии").replace(/^TEST ONLY(?=\s*—)/, "ТЕСТОВЫЙ ЭКРАН"); }
  function releasePreviews() { previews.forEach((url) => globalObject.URL.revokeObjectURL(url)); previews.clear(); }
  function userMessage(error, fallback) { return error?.userMessage || fallback; }
  function block(message) { ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false; ui.blockedMessage.textContent = message; ui.root.setAttribute("aria-busy", "false"); }
})(typeof window !== "undefined" ? window : globalThis);
