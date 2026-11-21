"use strict";

(function exposeProjectCalculationEntryWorkspace(globalObject) {
  const CALCULATION_KEY = "project_calculation_entry";

  function createError(code, message) {
    const error = new Error(message);
    error.code = code;
    error.userMessage = message;
    return error;
  }

  function text(value) {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
    if (value && typeof value === "object") return text(value.label || value.name || value.value || value.description);
    return "";
  }

  function waitForPageShow(target) {
    return new Promise((resolve) => target.addEventListener("pageshow", resolve, { once: true }));
  }

  function waitForNativeRestoration(target) {
    const frame = typeof target.requestAnimationFrame === "function"
      ? (resolve) => target.requestAnimationFrame(resolve)
      : (resolve) => target.setTimeout(resolve, 0);
    return new Promise((resolve) => frame(() => frame(resolve)));
  }

  function stage64Calculations(aggregate, domain) {
    return (Array.isArray(aggregate?.calculations) ? aggregate.calculations : [])
      .filter((record) => record?.request?.[CALCULATION_KEY]?.kind === domain.KIND)
      .map((record) => {
        const snapshot = domain.validateSnapshot(record?.result?.snapshot);
        if (snapshot.projectIdentity !== aggregate.project.project_id || snapshot.lifecycle !== "completed") throw createError("CALCULATION_HISTORY_INVALID", "История начальных расчётов повреждена.");
        return { record, snapshot };
      })
      .sort((left, right) => String(left.record.created_at).localeCompare(String(right.record.created_at)));
  }

  function sourceChainFingerprint(domain, initialization, gauge) {
    return domain.fingerprint({
      initializationIdentity: initialization.identity,
      initializationFingerprint: initialization.integrity.recordFingerprint || initialization.snapshot_fingerprint,
      gaugeIdentity: gauge.identity,
      gaugeFingerprint: gauge.fingerprint,
    });
  }

  function createController(options = {}) {
    const target = options.globalObject || globalObject;
    const documentObject = options.document || target.document;
    const domain = options.domain || target.YarnAIProjectCalculationEntry;
    const system = options.system || target.YarnAIProjectSystem;
    const routes = options.routes || target.YarnAIUserWorkspaceEntry;
    const initializationApi = options.initialization || target.YarnAIProjectInitialization;
    const gaugeApi = options.gauge || target.YarnAISwatchGauge;
    const experience = options.experience || target.YarnAIProjectDetailsExperience;
    const readinessApi = options.readiness || target.YarnAIProjectReadiness;
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository());
    const now = options.now || (() => new Date().toISOString());
    const ui = options.ui || (documentObject ? {
      loading: documentObject.querySelector("#loading-state"),
      blocked: documentObject.querySelector("#blocked-state"),
      blockedSummary: documentObject.querySelector("#blocked-summary"),
      blockedAction: documentObject.querySelector("#blocked-action"),
      ready: documentObject.querySelector("#ready-state"),
      back: documentObject.querySelector("#project-back"),
      form: documentObject.querySelector("#entry-form"),
      projectTitle: documentObject.querySelector("#project-title"),
      garmentType: documentObject.querySelector("#garment-type"),
      sizeMode: documentObject.querySelector("#size-mode"),
      recipient: documentObject.querySelector("#recipient"),
      gaugeValue: documentObject.querySelector("#gauge-value"),
      gaugeSource: documentObject.querySelector("#gauge-source"),
      widthSource: documentObject.querySelector("#width-source"),
      readiness: documentObject.querySelector("#readiness-status"),
      widthSection: documentObject.querySelector("#width-input-section"),
      width: documentObject.querySelector("#working-width"),
      widthUnit: documentObject.querySelector("#working-width-unit"),
      widthConfirmation: documentObject.querySelector("#width-confirmation"),
      widthError: documentObject.querySelector("#working-width-error"),
      draftStatus: documentObject.querySelector("#draft-status"),
      errorSummary: documentObject.querySelector("#error-summary"),
      errorList: documentObject.querySelector("#error-list"),
      result: documentObject.querySelector("#calculation-result"),
      humanFormula: documentObject.querySelector("#human-formula"),
      finalStitches: documentObject.querySelector("#final-stitches"),
      rounding: documentObject.querySelector("#rounding-description"),
      warningSection: documentObject.querySelector("#warning-section"),
      warningList: documentObject.querySelector("#warning-list"),
      assumptionList: documentObject.querySelector("#assumption-list"),
      warningAck: documentObject.querySelector("#warning-acknowledgement"),
      confirm: documentObject.querySelector("#confirm-entry"),
      reason: documentObject.querySelector("#confirmation-reason"),
      saveStatus: documentObject.querySelector("#save-status"),
      completedSection: documentObject.querySelector("#completed-section"),
      completedStitches: documentObject.querySelector("#completed-stitches"),
      completedWidth: documentObject.querySelector("#completed-width"),
      completedState: documentObject.querySelector("#completed-state"),
      nextPlan: documentObject.querySelector("#open-execution-plan"),
      historySection: documentObject.querySelector("#history-section"),
      historyList: documentObject.querySelector("#history-list"),
    } : {});

    let repository = null;
    let projectId = "";
    let aggregate = null;
    let source = null;
    let assessment = null;
    let history = [];
    let currentCompleted = null;
    let busy = false;
    let hydrated = false;
    let eventsBound = false;
    let saveTimer = null;
    let saveChain = Promise.resolve();
    let hydratedAcknowledgements = [];

    function safeProjectHref() {
      const candidate = domain.safeDestination(`/user-workspace-entry?project=${encodeURIComponent(projectId)}`, projectId);
      return candidate.valid ? candidate.href : "/";
    }

    function buildVerifiedSource(value) {
      if (!value?.project || value.project.project_id !== projectId) throw createError("PROJECT_ID_MISMATCH", "Открыт другой проект.");
      const context = experience.contextFromAggregate(value);
      const draftIntent = context.project.draft_input?.project_intent || context.project.draft_input?.projectIntent || {};
      const effectiveIntent = experience.applyDetailsToIntent(context.intent, context.details);
      const initializationIntent = experience.applyDetailsToIntent(draftIntent, context.details);
      const readiness = readinessApi.evaluateProjectReadiness(initializationIntent);
      const safety = experience.progressSafety(context.relevantProgress);
      const previousDestination = {
        enabled: true,
        href: `/swatch-assistant?project=${encodeURIComponent(projectId)}`,
        label: "Контрольный образец",
        description: "Подтверждение плотности.",
      };
      const initializationAssessment = initializationApi.assessInitialization({
        projectIdentity: projectId,
        closureHistory: context.closureHistory,
        initializationHistory: context.project.draft_input?.[initializationApi.HISTORY_KEY],
        nextDestination: previousDestination,
        liveInput: {
          projectId,
          garmentType: initializationIntent.garmentType || "изделие",
          details: context.details,
          technology: context.technology,
          intent: initializationIntent,
          collaborationState: context.collaborationState,
          safe: safety.safe,
          nextDestination: previousDestination,
        },
      });
      if (initializationAssessment.verdict !== "ready" || initializationAssessment.current !== true || initializationAssessment.canContinue !== true || !initializationAssessment.existing) {
        throw createError(initializationAssessment.reasons?.[0]?.code || "INITIALIZATION_BLOCKED", initializationAssessment.reasons?.[0]?.message || "Инициализация проекта недоступна.");
      }
      const initializationCheck = initializationApi.validateInitializationRecord(initializationAssessment.existing, { projectIdentity: projectId });
      if (!initializationCheck.valid || !initializationCheck.trusted || initializationCheck.record.lifecycle !== "initialized") throw createError("INITIALIZATION_UNTRUSTED", "Инициализация проекта не прошла проверку.");
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
      const selectedGauge = gaugeApi.selectCurrentRecord(context.project.draft_input?.[gaugeApi.HISTORY_KEY], gaugeSource);
      if (selectedGauge.state !== "current" || !selectedGauge.current) throw createError(selectedGauge.reasons?.[0]?.code || "CONFIRMED_GAUGE_MISSING", selectedGauge.reasons?.[0]?.message || "Подтверждённая плотность отсутствует или устарела.");
      return { context, effectiveIntent, initialization, gauge: selectedGauge.current };
    }

    function restoredDraft() {
      const raw = aggregate.project.draft_input?.[domain.DRAFT_KEY];
      if (!raw) return null;
      try {
        const draft = domain.validateDraft(raw, { projectIdentity: projectId });
        if (draft.sourceFingerprint !== sourceChainFingerprint(domain, source.initialization, source.gauge)) return null;
        return draft;
      } catch {
        return null;
      }
    }

    function readInput() {
      const projectWidth = domain.widthFromInitialization(source.initialization)[0] || null;
      const width = projectWidth ? null : {
        value: ui.width.value,
        unit: ui.widthUnit.value,
        semanticRole: "garment_detail_width",
        confirmed: ui.widthConfirmation.checked,
      };
      const required = assessment?.requiredAcknowledgements || ["UNKNOWN_PATTERN_REPEAT"];
      return {
        projectIdentity: projectId,
        project: aggregate.project,
        initialization: source.initialization,
        gauge: source.gauge,
        draftWidth: width,
        acknowledgedWarningCodes: ui.warningAck.checked ? required : [],
      };
    }

    function currentAssessment() {
      assessment = domain.assessEntry(readInput());
      return assessment;
    }

    function replaceList(element, values) {
      if (!element || !documentObject) return;
      element.replaceChildren(...values.map((value) => {
        const item = documentObject.createElement("li");
        item.textContent = value.message;
        return item;
      }));
    }

    function number(value) {
      return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 }).format(value);
    }

    function renderContext() {
      const garment = source.initialization.snapshot.garment || {};
      ui.projectTitle.textContent = aggregate.project.title || "Проект";
      ui.garmentType.textContent = garment.type || "Изделие";
      ui.sizeMode.textContent = garment.sizeMode === "standard" ? garment.standardSize || "Стандартный размер" : "Индивидуальные мерки";
      ui.recipient.textContent = garment.recipient || "Не указан";
      ui.gaugeValue.textContent = `${number(source.gauge.snapshot.computed.stitchesPer10Cm)} п. × ${number(source.gauge.snapshot.computed.rowsPer10Cm)} р. на 10 см`;
      ui.gaugeSource.textContent = "Подтверждённый контрольный образец";
      if (documentObject) documentObject.title = `Начальный расчёт: ${aggregate.project.title || "проект"} — YarnAI`;
    }

    function renderAssessment(options = {}) {
      const value = currentAssessment();
      ui.widthSection.hidden = !value.widthNeedsInput;
      ui.errorSummary.hidden = value.blockingErrors.length === 0;
      replaceList(ui.errorList, value.blockingErrors);
      ui.widthError.textContent = value.blockingErrors.find((item) => item.field === "workingWidth")?.message || "";
      ui.result.hidden = value.rawResult === null;
      if (value.rawResult !== null) {
        const width = value.workingWidth;
        ui.humanFormula.textContent = `${number(width.valueCm)} см × ${number(value.gauge.snapshot.computed.stitchesPer10Cm)} петель / 10 см = ${number(value.rawResult)} петель`;
        ui.finalStitches.textContent = number(value.finalStitchCount);
        ui.rounding.textContent = domain.ROUNDING_RULE.description;
        ui.widthSource.textContent = width.provenance === "stage_61_initialization"
          ? `${number(width.valueCm)} см — подтверждённая ширина готовой детали`
          : `${number(width.valueCm)} см — введено и подтверждено на этом экране`;
      } else {
        ui.widthSource.textContent = value.widthNeedsInput ? "Нужно указать" : "Недоступна";
      }
      ui.warningSection.hidden = value.warnings.length === 0 && value.assumptions.length === 0;
      replaceList(ui.warningList, value.warnings);
      replaceList(ui.assumptionList, value.assumptions);
      ui.confirm.disabled = busy || !value.canComplete;
      ui.reason.textContent = value.blockingErrors.length
        ? value.blockingErrors[0].message
        : value.missingAcknowledgements.length
          ? "Прочитайте и подтвердите обязательное предупреждение об округлении."
          : "Все обязательные данные готовы. Подтверждение создаст неизменяемую ревизию расчёта.";
      const currentState = currentCompleted ? domain.staleStatus(currentCompleted.snapshot, value) : null;
      const status = currentState?.current ? "completed" : currentState?.stale ? "stale" : value.readiness;
      ui.readiness.dataset.status = status;
      ui.readiness.textContent = ({ ready: "Готово", "conditionally-ready": "Нужно подтверждение", blocked: "Не хватает данных", completed: "Подтверждено", stale: "Расчёт устарел" })[status] || status;
      if (options.focusError && value.blockingErrors.length) ui.errorSummary.focus();
      renderCompleted(currentState);
      return value;
    }

    function renderHistory() {
      ui.historySection.hidden = history.length === 0;
      if (!documentObject) return;
      ui.historyList.replaceChildren(...history.slice().reverse().map((entry) => {
        const item = documentObject.createElement("li");
        const state = domain.staleStatus(entry.snapshot, assessment);
        const label = state.current ? "Текущая ревизия" : "Сохранённая устаревшая ревизия";
        item.textContent = `${label}: ${entry.snapshot.finalStitchCount} петель · ${number(entry.snapshot.workingWidth.canonicalValueCm)} см`;
        return item;
      }));
    }

    function renderCompleted(state = currentCompleted ? domain.staleStatus(currentCompleted.snapshot, assessment) : null) {
      ui.completedSection.hidden = !currentCompleted;
      if (ui.nextPlan) ui.nextPlan.href = domain.safeDestination(`/project-execution-plan?project=${encodeURIComponent(projectId)}`, projectId).href;
      if (!currentCompleted) return;
      const snapshot = currentCompleted.snapshot;
      ui.completedStitches.textContent = number(snapshot.finalStitchCount);
      ui.completedWidth.textContent = `${number(snapshot.workingWidth.canonicalValueCm)} см`;
      ui.completedState.textContent = state?.current
        ? "Это актуальная подтверждённая ревизия. Повторное открытие не создаёт дубликат."
        : "Исходные данные изменились. Старая ревизия сохранена, но для продолжения нужен новый расчёт.";
    }

    function restoreState() {
      history = stage64Calculations(aggregate, domain);
      currentCompleted = history.find((entry) => entry.record.calculation_id === aggregate.project.active_calculation_id) || history.at(-1) || null;
      const draft = restoredDraft();
      if (draft) {
        ui.width.value = draft.width.value;
        ui.widthUnit.value = draft.width.unit;
        ui.widthConfirmation.checked = draft.width.confirmed === true;
        hydratedAcknowledgements = [...draft.acknowledgedWarningCodes];
        ui.draftStatus.textContent = "Черновик восстановлен.";
      } else {
        hydratedAcknowledgements = [];
      }
      const preview = domain.assessEntry({
        projectIdentity: projectId,
        project: aggregate.project,
        initialization: source.initialization,
        gauge: source.gauge,
        draftWidth: domain.widthFromInitialization(source.initialization).length ? null : { value: ui.width.value, unit: ui.widthUnit.value, semanticRole: "garment_detail_width", confirmed: ui.widthConfirmation.checked },
        acknowledgedWarningCodes: hydratedAcknowledgements,
      });
      ui.warningAck.checked = preview.requiredAcknowledgements.length > 0 && preview.requiredAcknowledgements.every((code) => hydratedAcknowledgements.includes(code));
      assessment = preview;
    }

    function restoreHydratedControls() {
      const draft = restoredDraft();
      if (!draft) return;
      ui.width.value = draft.width.value;
      ui.widthUnit.value = draft.width.unit;
      ui.widthConfirmation.checked = draft.width.confirmed === true;
      const preview = domain.assessEntry({ ...readInput(), acknowledgedWarningCodes: draft.acknowledgedWarningCodes });
      ui.warningAck.checked = preview.requiredAcknowledgements.length > 0 && preview.requiredAcknowledgements.every((code) => draft.acknowledgedWarningCodes.includes(code));
    }

    function queueDraftSave() {
      if (!hydrated || busy) return;
      target.clearTimeout(saveTimer);
      saveTimer = target.setTimeout(() => { saveChain = saveChain.catch(() => undefined).then(saveDraft); }, 300);
    }

    async function saveDraft() {
      if (!repository || busy || !hydrated) return;
      const value = currentAssessment();
      const width = value.workingWidth || {
        value: ui.width.value,
        unit: ui.widthUnit.value,
      };
      if (!width || !Number.isFinite(domain.toCentimeters(width.value, width.unit))) return;
      const draft = domain.buildDraft({
        projectIdentity: projectId,
        value: width.value,
        unit: width.unit,
        confirmed: value.workingWidth?.provenance === "stage_61_initialization" || ui.widthConfirmation.checked,
        acknowledgedWarningCodes: ui.warningAck.checked ? value.requiredAcknowledgements : [],
        sourceFingerprint: sourceChainFingerprint(domain, source.initialization, source.gauge),
        updatedAt: now(),
      });
      const latest = await repository.getProject(projectId);
      const previous = latest.project.draft_input?.[domain.DRAFT_KEY];
      const semanticPrevious = previous ? { ...previous, updatedAt: null } : null;
      const semanticNext = { ...draft, updatedAt: null };
      if (domain.canonicalize(semanticPrevious) === domain.canonicalize(semanticNext)) {
        ui.draftStatus.textContent = "Черновик уже сохранён.";
        return;
      }
      const draftInput = { ...(latest.project.draft_input || {}), [domain.DRAFT_KEY]: draft };
      const project = await repository.updateProject(projectId, { draft_input: draftInput }, { baseRevision: latest.project.revision });
      aggregate = { ...latest, project };
      ui.draftStatus.textContent = "Черновик сохранён локально.";
    }

    function handleChange() {
      renderAssessment();
      queueDraftSave();
    }

    async function confirmEntry() {
      if (busy) return null;
      const preview = renderAssessment({ focusError: true });
      if (!preview.canComplete) return null;
      busy = true;
      ui.confirm.disabled = true;
      ui.saveStatus.textContent = "Повторно проверяем исходные данные…";
      try {
        await saveChain.catch(() => undefined);
        const latest = await repository.getProject(projectId);
        aggregate = latest;
        const latestSource = buildVerifiedSource(latest);
        if (sourceChainFingerprint(domain, latestSource.initialization, latestSource.gauge) !== sourceChainFingerprint(domain, source.initialization, source.gauge)) throw createError("SOURCE_CHANGED", "Проект или плотность изменились. Обновите страницу перед подтверждением.");
        source = latestSource;
        const checkedAssessment = currentAssessment();
        if (!checkedAssessment.canComplete) throw createError("ENTRY_BLOCKED", checkedAssessment.blockingErrors[0]?.message || "Расчёт больше не готов к подтверждению.");
        history = stage64Calculations(latest, domain);
        const duplicate = history.find((entry) => entry.snapshot.fingerprint === checkedAssessment.fingerprint);
        if (duplicate) {
          currentCompleted = duplicate;
          ui.saveStatus.textContent = "Этот расчёт уже подтверждён; новая ревизия не создана.";
          renderAssessment();
          renderHistory();
          ui.saveStatus.focus();
          return duplicate;
        }
        const timestamp = now();
        let snapshot = domain.buildSnapshot({ assessment: checkedAssessment }, { identity: system.uuidv7(), createdAt: timestamp, createdBy: "project_owner" });
        snapshot = domain.startReviewing(snapshot, { timestamp });
        snapshot = domain.markReady(snapshot, { timestamp });
        snapshot = domain.complete(snapshot, { timestamp });
        const request = { [CALCULATION_KEY]: {
          kind: domain.KIND,
          version: domain.VERSION,
          fingerprint: snapshot.fingerprint,
          target: snapshot.calculationTarget,
          workingWidthCm: snapshot.workingWidth.canonicalValueCm,
        } };
        const result = {
          status: snapshot.readiness === "conditionally-ready" ? "READY_WITH_WARNINGS" : "READY",
          normalized_inputs: {
            working_width_cm: snapshot.workingWidth.canonicalValueCm,
            stitches_per_10_cm: snapshot.gauge.stitchesPer10Cm,
          },
          warnings: snapshot.warnings,
          errors: [],
          clarifications: [],
          snapshot,
          specification_version: domain.VERSION,
        };
        const saved = await repository.addCalculation(projectId, request, result, { engine_version: domain.FORMULA_IDENTITY });
        aggregate = { ...latest, project: saved.project, calculations: [...latest.calculations, saved.calculation], progress: [...latest.progress, ...saved.progress] };
        history = stage64Calculations(aggregate, domain);
        currentCompleted = history.find((entry) => entry.record.calculation_id === saved.calculation.calculation_id);
        ui.saveStatus.textContent = "Начальный расчёт подтверждён и сохранён.";
        renderAssessment();
        renderHistory();
        ui.saveStatus.focus();
        return currentCompleted;
      } catch (error) {
        ui.saveStatus.textContent = error.userMessage || "Не удалось подтвердить расчёт. Данные на экране сохранены.";
        ui.saveStatus.focus();
        return null;
      } finally {
        busy = false;
        renderAssessment();
      }
    }

    function bindEvents() {
      if (eventsBound) return;
      eventsBound = true;
      ui.form.addEventListener("submit", (event) => event.preventDefault());
      ui.width.addEventListener("input", handleChange);
      ui.widthUnit.addEventListener("change", handleChange);
      ui.widthConfirmation.addEventListener("change", handleChange);
      ui.warningAck.addEventListener("change", handleChange);
      ui.confirm.addEventListener("click", confirmEntry);
      target.addEventListener("pagehide", close, { once: true });
    }

    function renderBlocked(error) {
      ui.loading.hidden = true;
      ui.ready.hidden = true;
      ui.blocked.hidden = false;
      ui.blockedSummary.textContent = error.userMessage || "Не удалось безопасно прочитать проект.";
      ui.blockedAction.href = projectId ? safeProjectHref() : "/#saved-projects";
      ui.blockedSummary.focus();
    }

    async function start() {
      if (!documentObject || !domain || !system || !routes || !initializationApi || !gaugeApi || !experience || !readinessApi) throw createError("DEPENDENCY_MISSING", "Экран расчёта загружен не полностью.");
      await waitForPageShow(target);
      await waitForNativeRestoration(target);
      projectId = routes.projectIdentityFromLocation(target.location, system.isUuidv7);
      if (!projectId || target.location.pathname !== "/project-calculation-entry") {
        renderBlocked(createError("PROJECT_ID_INVALID", "Откройте расчёт из рабочего пространства проекта."));
        return null;
      }
      ui.back.href = safeProjectHref();
      ui.blockedAction.href = safeProjectHref();
      repository = repositoryFactory();
      await repository.initialize();
      aggregate = await repository.getProject(projectId);
      source = buildVerifiedSource(aggregate);
      renderContext();
      restoreState();
      renderAssessment();
      renderHistory();
      await waitForNativeRestoration(target);
      restoreHydratedControls();
      renderAssessment();
      renderHistory();
      hydrated = true;
      bindEvents();
      ui.loading.hidden = true;
      ui.blocked.hidden = true;
      ui.ready.hidden = false;
      if (assessment.blockingErrors.length) ui.errorSummary.focus();
      else if (assessment.widthNeedsInput) ui.width.focus();
      return { projectId, aggregate, assessment, history };
    }

    async function close() {
      target.clearTimeout(saveTimer);
      await repository?.close?.().catch(() => undefined);
    }

    return Object.freeze({
      start,
      close,
      confirmEntry,
      saveDraft,
      renderAssessment,
      buildVerifiedSource,
      restoreHydratedControls,
      getState: () => ({ projectId, aggregate, source, assessment, history, currentCompleted, hydrated }),
    });
  }

  const api = Object.freeze({ CALCULATION_KEY, createController, stage64Calculations, sourceChainFingerprint, waitForPageShow, waitForNativeRestoration });
  globalObject.YarnAIProjectCalculationEntryWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
