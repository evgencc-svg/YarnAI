"use strict";

(function exposeProjectExecutionPlanWorkspace(globalObject) {
  function error(code, message) { const value = new Error(message); value.code = code; value.userMessage = message; return value; }
  function text(value) { if (typeof value === "string") return value.trim(); if (typeof value === "number") return String(value); if (value && typeof value === "object") return text(value.label || value.name || value.value); return ""; }
  function waitForPageShow(target) { return new Promise((resolve) => target.addEventListener("pageshow", resolve, { once: true })); }
  function waitForNativeRestoration(target) {
    const frame = typeof target.requestAnimationFrame === "function" ? (resolve) => target.requestAnimationFrame(resolve) : (resolve) => target.setTimeout(resolve, 0);
    return new Promise((resolve) => frame(() => frame(resolve)));
  }
  function latestProgress(aggregate, kind, calculationId) {
    return (Array.isArray(aggregate?.progress) ? aggregate.progress : []).filter((entry) => entry?.kind === kind && entry?.calculation_id === calculationId && !entry.deleted_at).sort((left, right) => String(left.updated_at).localeCompare(String(right.updated_at))).at(-1) || null;
  }
  function sourceFingerprint(domain, assessment) { return domain.fingerprint({ sourceIdentities: assessment.sourceIdentities, sourceFingerprints: assessment.sourceFingerprints }); }
  function latestConfirmedTechnology(aggregate) {
    return (Array.isArray(aggregate?.progress) ? aggregate.progress : []).filter((entry) => entry?.kind === "PATTERN_TECHNOLOGY_REVIEW" && (entry.state?.status === "confirmed" || entry.state?.lifecycle === "completed")).sort((left, right) => String(left.updated_at).localeCompare(String(right.updated_at))).at(-1)?.state || null;
  }
  function confirmedMaterials(aggregate) {
    const state = (Array.isArray(aggregate?.progress) ? aggregate.progress : []).filter((entry) => entry?.kind === "PATTERN_IMPORT" && entry?.state?.status === "completed").at(-1)?.state;
    return (Array.isArray(state?.materials) ? state.materials : []).map((item) => ({ identity: item.id || item.materialId, name: item.displayName || item.name, fingerprint: item.fingerprint || state.sourceFingerprint, confirmed: true })).filter((item) => item.identity && item.fingerprint);
  }
  function safeHref(domain, path, projectId) {
    const result = domain?.safeDestination?.(`${path}?project=${encodeURIComponent(projectId)}`, projectId);
    return result?.valid ? result.href : "";
  }
  function initializationContinuation(projectId) {
    return {
      enabled: true,
      href: `/swatch-assistant?project=${encodeURIComponent(projectId)}`,
      label: "Контрольный образец",
      description: "Проверить подтверждённую плотность.",
    };
  }
  function buildVerifiedAggregateSource(options = {}) {
    const value = options.aggregate;
    const projectId = options.projectId;
    const domain = options.domain;
    const calculationDomain = options.calculationDomain;
    const initializationApi = options.initialization;
    const gaugeApi = options.gauge;
    const experience = options.experience;
    const readinessApi = options.readiness;
    if (!value?.project || value.project.project_id !== projectId) throw error("PROJECT_ID_MISMATCH", "Открыт другой проект.");
    const context = experience.contextFromAggregate(value);
    const draftIntent = context.project.draft_input?.project_intent || context.project.draft_input?.projectIntent || {};
    const effectiveIntent = experience.applyDetailsToIntent(context.intent, context.details);
    const initializationIntent = experience.applyDetailsToIntent(draftIntent, context.details);
    const projectReadiness = readinessApi.evaluateProjectReadiness(initializationIntent);
    const safety = experience.progressSafety(context.relevantProgress);
    // Stage 61 validates the destination that originally followed initialization.
    // It is intentionally the Stage 63 swatch route, not the page that happens to
    // precede Stage 65 today.
    const nextAfterInitialization = initializationContinuation(projectId);
    const initializationAssessment = initializationApi.assessInitialization({
      projectIdentity: projectId,
      closureHistory: context.closureHistory,
      initializationHistory: context.project.draft_input?.[initializationApi.HISTORY_KEY],
      nextDestination: nextAfterInitialization,
      liveInput: {
        projectId,
        garmentType: initializationIntent.garmentType || "изделие",
        details: context.details,
        technology: context.technology,
        intent: initializationIntent,
        collaborationState: context.collaborationState,
        safe: safety.safe,
        nextDestination: nextAfterInitialization,
      },
    });
    if (initializationAssessment.verdict !== "ready" || !initializationAssessment.current || !initializationAssessment.canContinue || !initializationAssessment.existing) {
      throw error(initializationAssessment.reasons?.[0]?.code || "INITIALIZATION_BLOCKED", initializationAssessment.reasons?.[0]?.message || "Основа проекта недоступна.");
    }
    const initializationCheck = initializationApi.validateInitializationRecord(initializationAssessment.existing, { projectIdentity: projectId });
    if (!initializationCheck.valid || !initializationCheck.trusted || initializationCheck.record.lifecycle !== "initialized") throw error("INITIALIZATION_INVALID", "Основа проекта не прошла проверку.");
    const initialization = initializationCheck.record;
    const gaugeSource = gaugeApi.buildSourceSnapshot({
      projectIdentity: projectId,
      initializationIdentity: initialization.identity,
      initializationFingerprint: initialization.integrity.recordFingerprint || initialization.snapshot_fingerprint,
      yarn: text(effectiveIntent.yarn) || text(initialization.snapshot.materials?.yarn),
      tool: text(effectiveIntent.needles) || text(effectiveIntent.hook) || text(effectiveIntent.tool) || text(context.technology?.tool),
      technique: text(effectiveIntent.technique) || text(context.technology?.technique),
      pattern: text(effectiveIntent.mainPattern) || text(effectiveIntent.pattern) || text(context.technology?.pattern),
      recipient: text(initialization.snapshot.garment?.recipient),
      size: text(initialization.snapshot.garment?.standardSize) || text(initialization.snapshot.garment?.sizeMode),
    });
    const gaugeSelection = gaugeApi.selectCurrentRecord(context.project.draft_input?.[gaugeApi.HISTORY_KEY], gaugeSource);
    if (gaugeSelection.state !== "current" || !gaugeSelection.current) throw error(gaugeSelection.reasons?.[0]?.code || "GAUGE_MISSING", gaugeSelection.reasons?.[0]?.message || "Подтверждённая плотность отсутствует или устарела.");
    const selected = domain.selectCurrentCalculation({ projectIdentity: projectId, calculations: value.calculations, activeCalculationIdentity: value.project.active_calculation_id });
    calculationDomain.validateSnapshot(selected.snapshot);
    const closure = initializationAssessment.sourceClosure;
    const sourceChain = domain.validateSourceChain({ projectIdentity: projectId, project: value.project, closure, closureCurrent: true, initialization, initializationCurrent: true, gauge: gaugeSelection.current, gaugeCurrent: true, calculation: selected });
    if (!sourceChain.valid) throw error(sourceChain.blockingErrors[0].code, sourceChain.blockingErrors[0].message);
    return { context, effectiveIntent, projectReadiness, closure, initialization, gauge: gaugeSelection.current, calculation: selected, sourceChain, technology: latestConfirmedTechnology(value), materials: confirmedMaterials(value) };
  }
  function blockedDiagnostic(problem, projectId, domain) {
    const code = String(problem?.code || "SOURCE_CHAIN_INVALID");
    const messages = {
      INVALID_NEXT_DESTINATION: "Проверка основы проекта получила неподдерживаемый маршрут продолжения между этапами.",
      CALCULATION_FINGERPRINT_MISMATCH: "Контрольная сумма активного начального расчёта не совпадает с сохранённым результатом.",
      CALCULATION_STALE: "Активный начальный расчёт создан по другой версии подтверждённых исходных данных.",
      GAUGE_STALE: "Подтверждённая плотность создана по другой версии основы проекта.",
      INITIALIZATION_STALE: "Основа проекта создана по другой версии подтверждённых сведений.",
      CONFIRMED_DETAILS_STALE: "Подтверждённые сведения проекта изменились после сохранения основы.",
    };
    const message = messages[code] || problem?.userMessage || problem?.message || "Исходные данные плана недоступны.";
    let path = "/user-workspace-entry";
    let label = "Исправить сведения проекта";
    if (/^GAUGE_|CONFIRMED_GAUGE|SWATCH/.test(code)) { path = "/swatch-assistant"; label = "Проверить контрольный образец"; }
    else if (/^CALCULATION_|ENTRY_|WORKING_WIDTH|FINAL_RESULT/.test(code)) { path = "/project-calculation-entry"; label = "Проверить начальный расчёт"; }
    else if (/PROJECT_ID|PROJECT_MISSING|PROJECT_NOT_FOUND|DEPENDENCY|INDEXEDDB|STORAGE/.test(code)) return Object.freeze({ code, message: `Причина: ${message}`, href: "/saved-projects", label: "Вернуться к сохранённым проектам" });
    const href = projectId ? safeHref(domain, path, projectId) : "";
    return Object.freeze({ code, message: `Причина: ${message}`, href: href || "/saved-projects", label });
  }
  function assessAggregateReadiness(options = {}) {
    try {
      return Object.freeze({ ready: true, verified: buildVerifiedAggregateSource(options), problem: null });
    } catch (problem) {
      return Object.freeze({ ready: false, verified: null, problem: blockedDiagnostic(problem, options.projectId, options.domain) });
    }
  }
  function createController(options = {}) {
    const target = options.globalObject || globalObject;
    const documentObject = options.document || target.document;
    const domain = options.domain || target.YarnAIProjectExecutionPlan;
    const calculationDomain = options.calculationDomain || target.YarnAIProjectCalculationEntry;
    const system = options.system || target.YarnAIProjectSystem;
    const routes = options.routes || target.YarnAIUserWorkspaceEntry;
    const initializationApi = options.initialization || target.YarnAIProjectInitialization;
    const gaugeApi = options.gauge || target.YarnAISwatchGauge;
    const experience = options.experience || target.YarnAIProjectDetailsExperience;
    const readinessApi = options.readiness || target.YarnAIProjectReadiness;
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository());
    const now = options.now || (() => new Date().toISOString());
    const ui = options.ui || (documentObject ? {
      loading: documentObject.querySelector("#loading-state"), blocked: documentObject.querySelector("#blocked-state"), blockedSummary: documentObject.querySelector("#blocked-summary"), blockedAction: documentObject.querySelector("#blocked-action"), ready: documentObject.querySelector("#ready-state"),
      back: documentObject.querySelector("#project-back"), calculationLink: documentObject.querySelector("#edit-calculation"), gaugeLink: documentObject.querySelector("#edit-gauge"), projectTitle: documentObject.querySelector("#project-title"), garmentType: documentObject.querySelector("#garment-type"), recipient: documentObject.querySelector("#recipient"), gauge: documentObject.querySelector("#gauge-value"), width: documentObject.querySelector("#working-width"), stitches: documentObject.querySelector("#calculation-stitches"), readiness: documentObject.querySelector("#readiness-status"), readinessCopy: documentObject.querySelector("#readiness-copy"),
      errorSummary: documentObject.querySelector("#error-summary"), errorList: documentObject.querySelector("#error-list"), steps: documentObject.querySelector("#plan-steps"), confirmed: documentObject.querySelector("#confirmed-list"), conditional: documentObject.querySelector("#conditional-list"), missing: documentObject.querySelector("#missing-list"), warningSection: documentObject.querySelector("#warnings-section"), warnings: documentObject.querySelector("#warning-list"), assumptions: documentObject.querySelector("#assumption-list"), acknowledgement: documentObject.querySelector("#warning-acknowledgement"),
      direction: documentObject.querySelector("#direction"), workingMethod: documentObject.querySelector("#working-method"), foundationType: documentObject.querySelector("#foundation-type"), pieceLayout: documentObject.querySelector("#piece-layout"), boundedConfirmation: documentObject.querySelector("#bounded-confirmation"), confirmationReason: documentObject.querySelector("#confirmation-reason"), confirm: documentObject.querySelector("#confirm-plan"), saveStatus: documentObject.querySelector("#save-status"), completed: documentObject.querySelector("#completed-section"), completedStitches: documentObject.querySelector("#completed-stitches"), historySection: documentObject.querySelector("#history-section"), history: documentObject.querySelector("#history-list"),
    } : {});
    let repository = null; let projectId = ""; let aggregate = null; let verified = null; let assessment = null; let progressRecord = null; let progressState = null; let hydrated = false; let eventsBound = false; let busy = false; let saveTimer = null; let saveChain = Promise.resolve(); let hydratedAcknowledgements = []; let hydratedBoundedInputs = null;

    function href(path) { const result = domain.safeDestination(`${path}?project=${encodeURIComponent(projectId)}`, projectId); return result.valid ? result.href : ""; }
    function buildVerifiedSource(value) {
      return buildVerifiedAggregateSource({
        aggregate: value,
        projectId,
        domain,
        calculationDomain,
        initialization: initializationApi,
        gauge: gaugeApi,
        experience,
        readiness: readinessApi,
      });
    }
    function readBoundedInputs() { return { direction: ui.direction?.value || "unknown", workingMethod: ui.workingMethod?.value || "unknown", foundationType: ui.foundationType?.value || "unknown", pieceLayout: ui.pieceLayout?.value || "unknown", confirmed: ui.boundedConfirmation?.checked === true }; }
    function readInput() {
      const temporary = domain.assessPlan({ sourceChain: verified.sourceChain, technology: verified.technology, materials: verified.materials, boundedInputs: readBoundedInputs(), acknowledgedWarningCodes: [] });
      return { sourceChain: verified.sourceChain, technology: verified.technology, materials: verified.materials, boundedInputs: readBoundedInputs(), acknowledgedWarningCodes: ui.acknowledgement?.checked ? temporary.requiredAcknowledgementCodes : [] };
    }
    function assess() { assessment = domain.assessPlan(readInput()); return assessment; }
    function restoreState() {
      progressRecord = latestProgress(aggregate, domain.PROGRESS_KIND, verified.calculation.record.calculation_id);
      progressState = null;
      if (progressRecord) {
        try { progressState = domain.validateProgressState(progressRecord.state, { projectIdentity: projectId, calculationId: verified.calculation.record.calculation_id }); } catch { progressState = null; }
      }
      let draft = null;
      try { if (progressState?.draft) draft = domain.validateDraft(progressState.draft, { projectIdentity: projectId }); } catch { draft = null; }
      if (draft) {
        const baseline = domain.assessPlan({ sourceChain: verified.sourceChain, technology: verified.technology, materials: verified.materials, boundedInputs: draft.boundedInputs, acknowledgedWarningCodes: [] });
        if (draft.sourceFingerprint !== sourceFingerprint(domain, baseline) || draft.acknowledgedWarningCodes.some((code) => !baseline.requiredAcknowledgementCodes.includes(code))) draft = null;
      }
      const current = progressState?.history.at(-1) || null;
      const currentAssessment = current ? domain.assessPlan({ sourceChain: verified.sourceChain, technology: verified.technology, materials: verified.materials, boundedInputs: current.planScope.boundedInputs, acknowledgedWarningCodes: current.validation.acknowledgedWarningCodes }) : null;
      const currentStatus = current ? domain.staleStatus(current, currentAssessment) : null;
      const restored = draft || (currentStatus?.current ? { boundedInputs: current.planScope.boundedInputs, acknowledgedWarningCodes: current.validation.acknowledgedWarningCodes } : null);
      if (restored) applyControls(restored);
      hydratedAcknowledgements = [...(restored?.acknowledgedWarningCodes || [])];
      hydratedBoundedInputs = restored?.boundedInputs ? JSON.parse(JSON.stringify(restored.boundedInputs)) : null;
    }
    function applyControls(source) {
      const bounded = source?.boundedInputs || {};
      if (ui.direction) ui.direction.value = bounded.direction || "unknown";
      if (ui.workingMethod) ui.workingMethod.value = bounded.workingMethod || "unknown";
      if (ui.foundationType) ui.foundationType.value = bounded.foundationType || "unknown";
      if (ui.pieceLayout) ui.pieceLayout.value = bounded.pieceLayout || "unknown";
      if (ui.boundedConfirmation) ui.boundedConfirmation.checked = bounded.confirmed === true;
      if (ui.acknowledgement) ui.acknowledgement.checked = (source?.acknowledgedWarningCodes || []).length > 0;
    }
    function list(element, values, label = (value) => value.message || value.title || String(value)) {
      if (!element || !documentObject) return;
      element.replaceChildren(...values.map((value) => { const item = documentObject.createElement("li"); item.textContent = label(value); return item; }));
    }
    function renderSteps(values) {
      if (!ui.steps || !documentObject) return;
      ui.steps.replaceChildren(...values.map((value) => {
        const item = documentObject.createElement("li"); item.className = `plan-step plan-step-${value.status}`;
        const title = documentObject.createElement("h3"); title.textContent = `${value.sequenceNumber}. ${value.title}`;
        const status = documentObject.createElement("p"); status.className = "step-status"; status.textContent = ({ confirmed: "Подтверждён", conditional: "Условный", blocked: "Требует данных" })[value.status];
        const purpose = documentObject.createElement("p"); purpose.textContent = value.purpose;
        const checkpoint = documentObject.createElement("p"); checkpoint.className = "hint"; checkpoint.textContent = `Проверка: ${value.validationCheckpoint.description}`;
        item.append(title, status, purpose, checkpoint); return item;
      }));
    }
    function renderContext() {
      const garment = verified.initialization.snapshot.garment || {}; const calculation = verified.calculation.snapshot; const gauge = verified.gauge.snapshot.computed;
      ui.projectTitle.textContent = aggregate.project.title || "Проект"; ui.garmentType.textContent = garment.type || "Изделие"; ui.recipient.textContent = garment.recipient || "Не указан";
      ui.gauge.textContent = `${gauge.stitchesPer10Cm} п. × ${gauge.rowsPer10Cm} р. на 10 см`; ui.width.textContent = `${calculation.workingWidth.canonicalValueCm} см`; ui.stitches.textContent = `${calculation.finalStitchCount} петель`;
      if (documentObject) documentObject.title = `План работы: ${aggregate.project.title || "проект"} — YarnAI`;
    }
    function render() {
      const value = assess(); const current = progressState?.history.at(-1) || null; const currentStatus = current ? domain.staleStatus(current, value) : null;
      ui.errorSummary.hidden = value.blockingErrors.length === 0; list(ui.errorList, value.blockingErrors);
      ui.readiness.textContent = ({ ready: "Готов", "conditionally-ready": "Готов частично", blocked: "Заблокирован" })[value.readiness] || "Заблокирован";
      ui.readiness.dataset.status = value.readiness; ui.readinessCopy.textContent = value.readiness === "ready" ? "Поддерживаемый план полностью основан на подтверждённых данных." : value.readiness === "conditionally-ready" ? "План ограничен подтверждённой границей; неизвестные сведения не выдуманы." : value.blockingErrors[0]?.message || "План недоступен.";
      renderSteps(value.steps); list(ui.confirmed, value.steps.filter((item) => item.status === "confirmed"), (item) => item.title); list(ui.conditional, value.steps.filter((item) => item.status === "conditional"), (item) => item.title);
      list(ui.missing, value.planScope?.omittedStepTypes || [], (item) => ({ SHAPING: "Формирование изделия", DIVISION: "Разделение полотна", REPEAT_PART: "Повторная деталь", JOINING: "Сборка", FINISHING: "Отделка", BLOCKING: "ВТО и блокировка", FINAL_INSPECTION: "Финальная проверка" })[item] || item);
      ui.warningSection.hidden = value.warnings.length === 0 && value.assumptions.length === 0; list(ui.warnings, value.warnings); list(ui.assumptions, value.assumptions);
      const currentDuplicate = currentStatus?.current && current?.fingerprint === value.fingerprint;
      ui.confirm.disabled = busy || !value.canComplete || currentDuplicate; ui.confirmationReason.textContent = currentDuplicate ? "Эта версия плана уже подтверждена." : value.blockingErrors.length ? value.blockingErrors[0].message : !value.boundedInputs.confirmed ? "Подтвердите выбранные уточнения." : value.requiredAcknowledgementCodes.some((code) => !value.acknowledgedWarningCodes.includes(code)) ? "Прочитайте и подтвердите актуальные предупреждения." : "План можно подтвердить. Вязание при этом не начнётся.";
      ui.completed.hidden = !currentStatus?.current; if (currentStatus?.current) ui.completedStitches.textContent = current.calculationContext.finalStitchCount;
      ui.historySection.hidden = !progressState?.history.length; renderHistory(value);
      return value;
    }
    function renderHistory(currentAssessment) {
      if (!ui.history || !documentObject) return;
      ui.history.replaceChildren(...(progressState?.history || []).map((entry) => { const item = documentObject.createElement("li"); const status = domain.staleStatus(entry, currentAssessment); item.textContent = `${entry.completedAt}: ${entry.calculationContext.finalStitchCount} петель · ${status.current ? "текущая" : "устарела"}`; return item; }));
    }
    async function persistDraft() {
      if (!hydrated || busy) return null;
      const value = assess(); const draft = domain.buildDraft({ projectIdentity: projectId, boundedInputs: value.boundedInputs, acknowledgedWarningCodes: value.acknowledgedWarningCodes, sourceFingerprint: sourceFingerprint(domain, value), updatedAt: now() });
      saveChain = saveChain.then(async () => {
        if (!progressRecord) {
          const state = domain.createProgressState({ projectIdentity: projectId, calculationId: verified.calculation.record.calculation_id, draft, updatedAt: draft.updatedAt });
          progressRecord = await repository.ensureProjectExecutionPlanPreparation(projectId, verified.calculation.record.calculation_id, state, { operationKind: "PROJECT_EXECUTION_PLAN_PREPARATION_DRAFT_CREATED" });
          progressState = domain.validateProgressState(progressRecord.state, { projectIdentity: projectId, calculationId: verified.calculation.record.calculation_id });
        } else {
          const base = progressState || domain.createProgressState({ projectIdentity: projectId, calculationId: verified.calculation.record.calculation_id, updatedAt: draft.updatedAt });
          const next = { ...JSON.parse(JSON.stringify(base)), draft, updatedAt: draft.updatedAt };
          const saved = await repository.updateProjectExecutionPlanPreparation(projectId, verified.calculation.record.calculation_id, next, { operationKind: "PROJECT_EXECUTION_PLAN_PREPARATION_DRAFT_UPDATED" });
          progressRecord = saved.progress; progressState = domain.validateProgressState(saved.progress.state, { projectIdentity: projectId, calculationId: verified.calculation.record.calculation_id });
        }
        ui.saveStatus.textContent = "Черновик плана сохранён."; return draft;
      }).catch((problem) => { ui.saveStatus.textContent = problem.userMessage || "Не удалось сохранить черновик."; return null; });
      return saveChain;
    }
    function handleChange() { if (!hydrated || busy) return; hydratedAcknowledgements = ui.acknowledgement.checked ? assess().requiredAcknowledgementCodes : []; render(); target.clearTimeout(saveTimer); saveTimer = target.setTimeout(() => persistDraft(), 180); }
    async function confirmPlan() {
      if (busy) return null; busy = true;
      try {
        const value = render();
        if (!value.canComplete) { ui.errorSummary.hidden = false; ui.errorSummary.focus(); return null; }
        let snapshot = domain.buildSnapshot({ assessment: value }, { createdAt: now() }); snapshot = domain.startReviewing(snapshot, { timestamp: now() }); snapshot = domain.markReady(snapshot, { timestamp: now() }); snapshot = domain.complete(snapshot, { timestamp: now() });
        const existing = progressState?.history.find((entry) => entry.fingerprint === snapshot.fingerprint); if (existing) { ui.saveStatus.textContent = "Эта версия плана уже подтверждена."; return existing; }
        if (!progressRecord) {
          const initial = domain.createProgressState({ projectIdentity: projectId, calculationId: verified.calculation.record.calculation_id, updatedAt: snapshot.updatedAt });
          progressRecord = await repository.ensureProjectExecutionPlanPreparation(projectId, verified.calculation.record.calculation_id, initial, { operationKind: "PROJECT_EXECUTION_PLAN_PREPARATION_CREATED" });
          progressState = domain.validateProgressState(progressRecord.state, { projectIdentity: projectId, calculationId: verified.calculation.record.calculation_id });
        }
        const next = domain.appendCompleted(progressState, snapshot, { calculationId: verified.calculation.record.calculation_id, updatedAt: snapshot.updatedAt });
        const saved = await repository.updateProjectExecutionPlanPreparation(projectId, verified.calculation.record.calculation_id, next, { operationKind: "PROJECT_EXECUTION_PLAN_PREPARATION_COMPLETED", projectStage: "project_execution_plan_preparation_completed" });
        progressRecord = saved.progress; progressState = domain.validateProgressState(saved.progress.state, { projectIdentity: projectId, calculationId: verified.calculation.record.calculation_id });
        ui.saveStatus.textContent = "План выполнения подтверждён и сохранён. Вязание ещё не начато."; ui.saveStatus.focus(); return snapshot;
      } catch (problem) { ui.saveStatus.textContent = problem.userMessage || "Не удалось подтвердить план."; ui.saveStatus.focus(); return null; } finally { busy = false; render(); }
    }
    function bindEvents() {
      if (eventsBound) return; eventsBound = true;
      [ui.direction, ui.workingMethod, ui.foundationType, ui.pieceLayout, ui.boundedConfirmation, ui.acknowledgement].forEach((element) => element?.addEventListener("change", handleChange));
      ui.confirm?.addEventListener("click", confirmPlan); target.addEventListener("pagehide", close, { once: true });
    }
    function renderBlocked(problem) { const diagnostic = problem?.message?.startsWith?.("Причина:") ? problem : blockedDiagnostic(problem, projectId, domain); ui.loading.hidden = true; ui.ready.hidden = true; ui.blocked.hidden = false; ui.blockedSummary.textContent = diagnostic.message; ui.blockedAction.href = diagnostic.href; ui.blockedAction.textContent = diagnostic.label; ui.blockedSummary.focus(); return diagnostic; }
    async function start() {
      if (!documentObject || !domain || !calculationDomain || !system || !routes || !initializationApi || !gaugeApi || !experience || !readinessApi) throw error("DEPENDENCY_MISSING", "Экран плана загружен не полностью.");
      await waitForPageShow(target); await waitForNativeRestoration(target);
      projectId = routes.projectIdentityFromLocation(target.location, system.isUuidv7);
      if (!projectId || target.location.pathname !== "/project-execution-plan") { renderBlocked(error("PROJECT_ID_INVALID", "Откройте план из рабочего пространства проекта.")); return null; }
      ui.back.href = href("/user-workspace-entry"); ui.calculationLink.href = href("/project-calculation-entry"); ui.gaugeLink.href = href("/swatch-assistant"); ui.blockedAction.href = href("/user-workspace-entry");
      repository = repositoryFactory(); await repository.initialize(); aggregate = await repository.getProject(projectId); verified = buildVerifiedSource(aggregate); renderContext(); restoreState(); render();
      await waitForNativeRestoration(target); applyControls({ boundedInputs: hydratedBoundedInputs || readBoundedInputs(), acknowledgedWarningCodes: hydratedAcknowledgements }); render(); hydrated = true; bindEvents(); ui.loading.hidden = true; ui.blocked.hidden = true; ui.ready.hidden = false; if (assessment.blockingErrors.length) ui.errorSummary.focus();
      return { projectId, aggregate, verified, assessment, progressState };
    }
    async function close() { target.clearTimeout(saveTimer); await repository?.close?.().catch(() => undefined); }
    return Object.freeze({ start, close, render, renderBlocked, confirmPlan, persistDraft, buildVerifiedSource, applyControls, getState: () => ({ projectId, aggregate, verified, assessment, progressRecord, progressState, hydrated }) });
  }
  const api = Object.freeze({ createController, latestProgress, sourceFingerprint, latestConfirmedTechnology, initializationContinuation, buildVerifiedAggregateSource, blockedDiagnostic, assessAggregateReadiness, waitForPageShow, waitForNativeRestoration });
  globalObject.YarnAIProjectExecutionPlanWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
