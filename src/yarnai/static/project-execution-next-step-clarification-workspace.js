"use strict";

(function exposeProjectExecutionNextStepClarificationWorkspace(globalObject) {
  const TYPE_LABELS = Object.freeze({ ribbing: "резинка", other: "другой подтверждённый тип" });
  const TYPE_ACTIONS = Object.freeze({ ribbing: "резинку", other: "выбранный начальный участок" });

  function formatUserTimestamp(value, options = {}) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    const formatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    if (options.timeZone) formatOptions.timeZone = options.timeZone;
    return new Intl.DateTimeFormat(options.locale || "ru-RU", formatOptions).format(date);
  }
  function waitForPageShow(target) { return new Promise((resolve) => target.addEventListener("pageshow", resolve, { once: true })); }
  function waitForNativeRestoration(target) {
    const frame = typeof target.requestAnimationFrame === "function" ? (resolve) => target.requestAnimationFrame(resolve) : (resolve) => target.setTimeout(resolve, 0);
    return new Promise((resolve) => frame(() => frame(resolve)));
  }
  function problem(code, message) { const error = new Error(message); error.code = code; error.userMessage = message; return error; }
  function isStaleOrConflictedRecord(record) {
    const validation = String(record?.validation_status || "").toUpperCase();
    const status = String(record?.status || "").toLowerCase();
    return Boolean(
      record?.deleted_at || record?.stale || record?.conflicted || record?.conflict || record?.quarantined ||
      record?.imported_unproven || record?.importedUnproven ||
      validation === "STALE" || validation === "CONFLICT" || validation === "QUARANTINED" ||
      status === "stale" || status === "conflict" ||
      (record?.revision !== undefined && record.revision !== 1),
    );
  }
  function displayNumber(value) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 20 }).format(value); }
  function projectSummary(source, domain) { const value = domain.validateSnapshot(source); const action = TYPE_ACTIONS[value.clarification.foundationType] || "подтверждённый начальный участок"; return "Связать " + action + " высотой " + displayNumber(value.clarification.target.value) + " см"; }
  function continuationProjection(readiness, domain) {
    if (!readiness) return null;
    if (readiness.lifecycle === "completed") {
      return Object.freeze({ status: "pending", title: "Следующий шаг подготовлен", summary: projectSummary(readiness.snapshot, domain), action: null, destination: null, diagnostic: null });
    }
    if (readiness.lifecycle === "ready") {
      return Object.freeze({ status: "ready", title: "Нужно уточнить следующий шаг", summary: "Подтвердите тип и высоту следующего участка.", action: "clarify-next-step", destination: "/project-execution-next-step-clarification?project=" + encodeURIComponent(readiness.assessment.projectIdentity), diagnostic: null });
    }
    return Object.freeze({ status: "blocked", title: "Уточнение недоступно", summary: readiness.diagnostic?.message || "Не удалось безопасно проверить подтверждённый шаг.", action: null, destination: null, diagnostic: readiness.diagnostic || null });
  }
  function assessAggregateReadiness(options = {}) {
    const domain = options.domain;
    const assessment = domain.assessSource({
      projectIdentity: options.projectId, project: options.aggregate?.project, progress: options.aggregate?.progress,
      stage65Record: options.stage65Record, stage66Record: options.stage66Record, stage67Record: options.stage67Record, stage68Record: options.stage68Record,
      stage65Domain: options.stage65Domain, stage66Domain: options.stage66Domain, stage67Domain: options.stage67Domain, stage68Domain: options.stage68Domain,
    });
    if (assessment.lifecycle === "blocked") return Object.freeze({ lifecycle: "blocked", assessment, record: null, snapshot: null, diagnostic: assessment.diagnostic });
    const matchingRecords = (Array.isArray(options.aggregate?.progress) ? options.aggregate.progress : [])
      .filter((entry) => entry?.kind === domain.KIND && entry?.calculation_id === assessment.calculationId && !entry?.deleted_at);
    if (matchingRecords.length > 1) {
      const diagnostic = domain.diagnostic("REVISION_CONFLICT", "Найдено несколько версий подтверждённого уточнения.");
      return Object.freeze({ lifecycle: "blocked", assessment, record: null, snapshot: null, diagnostic });
    }
    const record = options.record || matchingRecords[0] || null;
    if (!record) return Object.freeze({ lifecycle: "ready", assessment, record: null, snapshot: null, diagnostic: null });
    try {
      if (isStaleOrConflictedRecord(record)) throw problem("REVISION_CONFLICT", "Подтверждённое уточнение устарело или конфликтует с другой версией.");
      if (record.project_id !== options.projectId || record.calculation_id !== assessment.calculationId) throw problem("SOURCE_PROJECT_MISMATCH", "Уточнение относится к другому проекту.");
      const state = domain.validateProgressState(record.state, { projectIdentity: options.projectId, calculationId: assessment.calculationId });
      const snapshot = domain.validateBinding(state.snapshot, assessment);
      return Object.freeze({ lifecycle: "completed", assessment, record, snapshot, diagnostic: null });
    } catch (error) {
      return Object.freeze({ lifecycle: "blocked", assessment, record, snapshot: null, diagnostic: domain.diagnostic(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message) });
    }
  }
  function createController(options = {}) {
    const target = options.globalObject || globalObject;
    const documentObject = options.document || target.document;
    const domain = options.domain || target.YarnAIProjectExecutionNextStepClarification;
    const stage65Domain = options.stage65Domain || target.YarnAIProjectExecutionPlan;
    const stage66Domain = options.stage66Domain || target.YarnAIProjectExecutionStart;
    const stage67Domain = options.stage67Domain || target.YarnAIProjectExecutionFirstStep;
    const stage68Domain = options.stage68Domain || target.YarnAIProjectExecutionNextStep;
    const routes = options.routes || target.YarnAIUserWorkspaceEntry;
    const system = options.system || target.YarnAIProjectSystem;
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository());
    const now = options.now || (() => new Date().toISOString());
    const operationId = options.operationId || (() => system.uuidv7());
    const formatTimestamp = options.formatTimestamp || ((value) => formatUserTimestamp(value, { locale: options.locale, timeZone: options.timeZone }));
    const ui = options.ui || (documentObject ? {
      root: documentObject.querySelector("#next-step-clarification-root"), loading: documentObject.querySelector("#next-step-clarification-loading"),
      blocked: documentObject.querySelector("#next-step-clarification-blocked"), blockedMessage: documentObject.querySelector("#next-step-clarification-blocked-message"),
      content: documentObject.querySelector("#next-step-clarification-content"), form: documentObject.querySelector("#next-step-clarification-form"),
      typeField: documentObject.querySelector("#next-step-clarification-type-field"), type: documentObject.querySelector("#next-step-clarification-type"),
      typeError: documentObject.querySelector("#next-step-clarification-type-error"), heightField: documentObject.querySelector("#next-step-clarification-height-field"),
      height: documentObject.querySelector("#next-step-clarification-height"), heightError: documentObject.querySelector("#next-step-clarification-height-error"),
      summary: documentObject.querySelector("#next-step-clarification-summary"), confirm: documentObject.querySelector("#next-step-clarification-confirm"),
      formError: documentObject.querySelector("#next-step-clarification-form-error"), completed: documentObject.querySelector("#next-step-clarification-completed"),
      completedSummary: documentObject.querySelector("#next-step-clarification-completed-summary"), completedAt: documentObject.querySelector("#next-step-clarification-completed-at"),
    } : {});
    let repository = null;
    let projectId = "";
    let aggregate = null;
    let readiness = null;
    let busy = false;
    let hydrated = false;
    let submitOperationId = "";

    function dependencies() { return domain && stage65Domain && stage66Domain && stage67Domain && stage68Domain && routes && system; }
    function setBusy(value) {
      busy = value;
      ui.root?.setAttribute("aria-busy", String(value));
      if (ui.confirm) ui.confirm.disabled = value || !validFormValue();
    }
    function summaryFor(clarification) {
      const action = TYPE_ACTIONS[clarification.foundationType] || "подтверждённый начальный участок";
      return `После набора 100 петель связать ${action} высотой ${displayNumber(clarification.target.value)} см.`;
    }
    function formInput() {
      const value = {};
      if (readiness?.assessment?.missingInputs.includes("foundation_type")) value.foundationType = ui.type?.value || "";
      if (readiness?.assessment?.missingInputs.includes("foundation_height")) {
        const raw = ui.height?.value || "";
        value.foundationHeight = raw.trim() === "" ? Number.NaN : Number(raw);
      }
      return value;
    }
    function resolvedFormValue() {
      try { return domain.resolveClarification(readiness?.assessment, formInput()); }
      catch { return null; }
    }
    function validFormValue() { return Boolean(resolvedFormValue()); }
    function renderValidation() {
      const clarification = resolvedFormValue();
      if (ui.typeError) ui.typeError.textContent = ui.typeField && !ui.typeField.hidden && !(ui.type?.value || "") ? "Выберите тип начального участка." : "";
      if (ui.heightError) {
        const raw = ui.heightField && !ui.heightField.hidden ? ui.height?.value || "" : "";
        ui.heightError.textContent = raw && !(Number(raw) > 0) ? "Укажите высоту больше нуля." : "";
      }
      if (ui.summary) ui.summary.textContent = clarification ? summaryFor(clarification) : "Заполните недостающие данные — здесь появится точная сводка.";
      if (ui.confirm) ui.confirm.disabled = busy || !clarification;
      return clarification;
    }
    function renderBlocked(diagnostic) {
      ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false;
      ui.blockedMessage.textContent = diagnostic?.message || "Не удалось открыть уточнение.";
      ui.blocked.focus(); setBusy(false); return diagnostic;
    }
    function populateTypeOptions(values) {
      if (!ui.type || !documentObject) return;
      const placeholder = documentObject.createElement("option");
      placeholder.value = ""; placeholder.textContent = "Выберите вариант";
      const optionsList = values.map((value) => { const option = documentObject.createElement("option"); option.value = value; option.textContent = TYPE_LABELS[value] || value; return option; });
      ui.type.replaceChildren(placeholder, ...optionsList);
    }
    function renderReady(nextReadiness) {
      ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.form.hidden = false; ui.completed.hidden = true;
      const missing = nextReadiness.assessment.missingInputs;
      ui.typeField.hidden = !missing.includes("foundation_type");
      ui.heightField.hidden = !missing.includes("foundation_height");
      populateTypeOptions(nextReadiness.assessment.foundationTypeOptions);
      if (ui.formError) ui.formError.textContent = "";
      renderValidation(); setBusy(false);
      const first = !ui.typeField.hidden ? ui.type : ui.height;
      first?.focus();
      return nextReadiness;
    }
    function renderCompleted(snapshotSource) {
      const snapshot = domain.validateSnapshot(snapshotSource);
      ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.form.hidden = true; ui.completed.hidden = false;
      ui.completedSummary.textContent = summaryFor(snapshot.clarification);
      ui.completedAt.textContent = formatTimestamp(snapshot.timestamps.completedAt);
      ui.completed.focus(); setBusy(false); return snapshot;
    }
    async function refresh() {
      aggregate = await repository.getProject(projectId);
      readiness = assessAggregateReadiness({ aggregate, projectId, domain, stage65Domain, stage66Domain, stage67Domain, stage68Domain });
      if (readiness.lifecycle === "blocked") return renderBlocked(readiness.diagnostic);
      if (readiness.lifecycle === "completed") return renderCompleted(readiness.snapshot);
      return renderReady(readiness);
    }
    async function submit(event) {
      event?.preventDefault?.();
      if (busy || readiness?.lifecycle !== "ready") return;
      const clarification = renderValidation();
      if (!clarification) return;
      setBusy(true); ui.formError.textContent = "";
      const confirmedAt = now();
      submitOperationId ||= operationId();
      try {
        const snapshot = domain.createCompletedSnapshot(readiness.assessment, formInput(), { createdAt: confirmedAt, confirmedAt, explicitConfirmation: true, operationId: submitOperationId });
        await repository.ensureProjectExecutionNextStepClarification(projectId, snapshot.calculationId, domain.createProgressState(snapshot), {
          timestamp: confirmedAt, operationId: submitOperationId, expectedProjectRevision: aggregate.project.revision,
          operationKind: "PROJECT_EXECUTION_NEXT_STEP_CLARIFIED", projectStage: "project_execution_next_step_clarification_completed",
        });
        await refresh();
      } catch (error) {
        ui.formError.textContent = error?.userMessage || error?.message || "Не удалось сохранить уточнение.";
        ui.formError.focus(); setBusy(false);
      }
    }
    async function handlePageShow() {
      if (!hydrated || busy) return;
      setBusy(true); await waitForNativeRestoration(target);
      await refresh().catch((error) => renderBlocked(domain.diagnostic(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message)));
    }
    async function start() {
      if (!documentObject || !dependencies()) throw problem("DEPENDENCY_MISSING", "Экран уточнения загружен не полностью.");
      await waitForPageShow(target); await waitForNativeRestoration(target);
      const rawProject = new URLSearchParams(target.location.search || "").get("project");
      if (rawProject === null) return renderBlocked(domain.diagnostic("PROJECT_ID_REQUIRED"));
      projectId = routes.projectIdentityFromLocation(target.location, system.isUuidv7);
      if (!projectId || target.location.pathname !== "/project-execution-next-step-clarification") return renderBlocked(domain.diagnostic("PROJECT_ID_INVALID"));
      repository = repositoryFactory(); setBusy(true);
      try { await repository.initialize(); await refresh(); }
      catch (error) { renderBlocked(domain.diagnostic(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message)); }
      ui.form?.addEventListener("submit", submit);
      ui.type?.addEventListener("change", renderValidation);
      ui.height?.addEventListener("input", renderValidation);
      await waitForNativeRestoration(target); hydrated = true;
      target.addEventListener("pageshow", handlePageShow); target.addEventListener("pagehide", close, { once: true });
      return { projectId, aggregate, readiness };
    }
    async function close() { await repository?.close?.().catch(() => undefined); }
    return Object.freeze({ start, close, refresh, submit, renderReady, renderCompleted, renderBlocked, renderValidation, getState: () => ({ projectId, aggregate, readiness, busy, hydrated }) });
  }

  const api = Object.freeze({
    TYPE_LABELS, TYPE_ACTIONS, formatUserTimestamp, waitForPageShow, waitForNativeRestoration,
    isStaleOrConflictedRecord, projectSummary, continuationProjection, assessAggregateReadiness, createController,
  });
  globalObject.YarnAIProjectExecutionNextStepClarificationWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
