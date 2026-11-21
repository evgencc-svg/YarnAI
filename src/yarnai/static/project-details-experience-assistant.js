"use strict";

(function initializeProjectDetailsExperienceAssistant(globalObject) {
  if (typeof document === "undefined" || globalObject.location.hash !== "#project-details") return;

  const system = globalObject.YarnAIProjectSystem;
  const experience = globalObject.YarnAIProjectDetailsExperience;
  const readinessApi = globalObject.YarnAIProjectReadiness;
  const section = document.querySelector("#project-details");
  if (!section) return;

  const ui = {
    loading: document.querySelector("#project-details-loading"),
    missing: document.querySelector("#project-details-missing"),
    error: document.querySelector("#project-details-error"),
    errorCopy: document.querySelector("#project-details-error-copy"),
    workflow: document.querySelector("#project-details-workflow"),
    titleSlot: document.querySelector("#project-details-title-slot"),
    staticTitle: document.querySelector("#project-details-static-title"),
    projectName: document.querySelector("#project-details-project-name"),
    technologyLink: document.querySelector("#project-details-technology-link"),
    garmentType: document.querySelector("#project-details-garment-type"),
    form: document.querySelector("#project-details-form"),
    standardCard: document.querySelector("#project-details-standard-card"),
    customCard: document.querySelector("#project-details-custom-card"),
    fitCard: document.querySelector("#project-details-fit-card"),
    conflict: document.querySelector("#project-details-conflict"),
    conflictCopy: document.querySelector("#project-details-conflict-copy"),
    save: document.querySelector("#project-details-save"),
    saveStatus: document.querySelector("#project-details-save-status"),
    nextField: document.querySelector("#project-details-next-field"),
    known: document.querySelector("#project-details-known"),
    knownEmpty: document.querySelector("#project-details-known-empty"),
    missingList: document.querySelector("#project-details-missing-list"),
    complete: document.querySelector("#project-details-complete"),
    routeCopy: document.querySelector("#project-details-route-copy"),
    continueButton: document.querySelector("#project-details-continue"),
    continueReason: document.querySelector("#project-details-continue-reason"),
    live: document.querySelector("#project-details-live"),
  };

  let repository = null;
  let aggregate = null;
  let projectId = "";
  let sourceIntent = {};
  let technology = null;
  let relevantProgress = [];
  let viewModel = null;
  let draftDetails = null;
  let busy = false;
  const dirtyFields = new Set();
  globalObject.YarnAIProjectDetailsExperienceController = Object.freeze({
    ensureSaved: () => saveParameters(),
  });

  activatePage();
  bindEvents();
  initialize().catch(renderStorageError);

  function activatePage() {
    document.body.classList.add("project-details-active");
    section.hidden = false;
    document.querySelectorAll("main.flow-shell > section").forEach((candidate) => {
      if (candidate !== section) candidate.hidden = true;
    });
    const pageTitle = document.querySelector("#workspace-title");
    if (pageTitle) {
      pageTitle.textContent = "Для кого и какого размера вяжем?";
      ui.titleSlot.append(pageTitle);
      ui.staticTitle.hidden = true;
      section.setAttribute("aria-labelledby", pageTitle.id);
    }
    globalObject.scrollTo?.({ top: 0, behavior: "auto" });
  }

  function bindEvents() {
    ui.form.addEventListener("input", handleInput);
    ui.form.addEventListener("change", handleInput);
    ui.form.addEventListener("submit", saveParameters);
    ui.continueButton.addEventListener("click", continueToNextStep);
    globalObject.addEventListener("pagehide", () => repository?.close());
  }

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project") || "";
    if (!projectId || !system?.isUuidv7(projectId) || !experience || !readinessApi) {
      renderState("missing_project");
      return;
    }
    repository = new system.ProjectRepository();
    await repository.initialize();
    await loadContext();
    renderCurrent();
  }

  async function loadContext() {
    aggregate = await repository.getProject(projectId);
    const context = experience.contextFromAggregate(aggregate);
    sourceIntent = context.intent;
    relevantProgress = context.relevantProgress;
    technology = context.technology;
  }

  function renderCurrent() {
    const saved = aggregate.project.draft_input?.project_details_experience;
    const initial = experience.mergeDetails(experience.detailsFromIntent(sourceIntent), saved);
    draftDetails = draftDetails || initial;
    const effectiveIntent = experience.applyDetailsToIntent(sourceIntent, draftDetails);
    const readiness = readinessApi.evaluateProjectReadiness(effectiveIntent);
    viewModel = experience.buildViewModel({
      project: aggregate.project,
      intent: effectiveIntent,
      saved: draftDetails,
      technology,
      progressRecords: relevantProgress,
      readiness,
    });
    render(viewModel);
  }

  function render(model) {
    renderState(model?.state || "error");
    if (model?.state !== "ready") return;
    ui.projectName.textContent = model.project.title;
    ui.technologyLink.href = model.links.technology;
    ui.garmentType.textContent = capitalize(model.garmentType);
    setControlValues(model.details);
    const visible = new Set(model.fields.map((field) => field.field));
    document.querySelectorAll("[data-field-row]").forEach((row) => {
      row.hidden = !visible.has(row.dataset.fieldRow);
    });
    const required = new Set(model.required.map((field) => field.field));
    document.querySelectorAll("[data-required-mark]").forEach((mark) => {
      mark.hidden = !required.has(mark.dataset.requiredMark);
    });
    ui.standardCard.hidden = model.details.sizeMode !== "standard";
    ui.customCard.hidden = model.details.sizeMode !== "custom";
    ui.fitCard.hidden = !visible.has("fit");
    ui.conflict.hidden = !model.conflict.message;
    ui.conflictCopy.textContent = model.conflict.message;
    renderKnown(model.known);
    renderMissing(model.missing);
    ui.nextField.textContent = model.readiness.next
      ? `Укажи: ${model.readiness.next.label.toLowerCase()}`
      : "Основные параметры заполнены";
    ui.routeCopy.textContent = model.readiness.action.enabled
      ? "Перед переходом дальше сначала проверь итоговые данные и подтверди их."
      : model.readiness.action.description;
    ui.continueButton.textContent = model.readiness.action.enabled ? "Проверить данные" : model.readiness.action.label;
    ui.continueButton.disabled = busy || !model.readiness.action.enabled;
    ui.continueReason.textContent = model.readiness.action.enabled
      ? model.readiness.action.description
      : model.readiness.blockers[0] || model.readiness.action.description;
    setBusy(busy);
  }

  function renderState(state) {
    ui.loading.hidden = state !== "loading";
    ui.missing.hidden = state !== "missing_project";
    ui.error.hidden = state !== "error";
    ui.workflow.hidden = state !== "ready";
  }

  function setControlValues(details) {
    for (const field of ["sizeMode", "fit"]) {
      const control = ui.form.elements.namedItem(field);
      if (!control) continue;
      [...control].forEach((input) => { input.checked = input.value === details[field]; });
    }
    setValue("recipient", details.recipient);
    setValue("standardSize", details.standardSize);
    for (const field of Object.keys(experience.FIELD_CATALOG)) {
      const measurement = details.bodyMeasurements[field] || details.garmentMeasurements[field];
      if (measurement) setValue(field, String(measurement.value));
    }
  }

  function setValue(name, value) {
    const control = ui.form.elements.namedItem(name);
    if (control && document.activeElement !== control && !dirtyFields.has(name)) control.value = value || "";
  }

  function handleInput(event) {
    const control = event.target;
    if (!control?.name || !experience.FIELD_CATALOG[control.name]) return;
    dirtyFields.add(control.name);
    clearFieldMessage(control.name);
    const patch = {};
    patch[control.name] = control.value;
    draftDetails = experience.applyPatch(draftDetails, patch);
    renderCurrent();
    if (["sizeMode", "fit"].includes(control.name)) control.focus();
  }

  function renderKnown(items) {
    ui.known.replaceChildren(...items.map((item) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      const source = document.createElement("small");
      term.textContent = item.label;
      detail.textContent = item.value;
      source.textContent = item.source;
      detail.append(source);
      row.append(term, detail);
      return row;
    }));
    ui.knownEmpty.hidden = items.length > 0;
  }

  function renderMissing(items) {
    ui.missingList.replaceChildren(...items.map((item) => {
      const row = document.createElement("li");
      row.textContent = item.label;
      return row;
    }));
    ui.missingList.hidden = items.length === 0;
    ui.complete.hidden = items.length > 0;
  }

  function collectPatch() {
    const patch = {};
    dirtyFields.forEach((field) => {
      const control = ui.form.elements.namedItem(field);
      patch[field] = control?.value ?? "";
    });
    return patch;
  }

  function validatePatch(patch) {
    let valid = true;
    for (const [field, value] of Object.entries(patch)) {
      const result = experience.validateField(field, value);
      const control = firstControl(field);
      if (control) control.setAttribute("aria-invalid", String(!result.valid));
      setFieldMessage(field, result.error || result.warning);
      if (!result.valid) valid = false;
    }
    if (!valid) firstInvalidControl()?.focus();
    return valid;
  }

  async function saveParameters(event) {
    event?.preventDefault();
    if (busy) return false;
    const patch = collectPatch();
    if (!Object.keys(patch).length) {
      ui.saveStatus.textContent = "Изменений пока нет.";
      return true;
    }
    if (!validatePatch(patch)) {
      ui.saveStatus.textContent = "Проверь отмеченные значения.";
      return false;
    }
    return runBusy(async () => {
      const stored = experience.applyPatch(draftDetails, patch);
      const nextIntent = experience.applyDetailsToIntent(sourceIntent, stored);
      const latestAggregate = await repository.getProject(projectId);
      const draftInput = latestAggregate.project.draft_input && typeof latestAggregate.project.draft_input === "object"
        ? { ...latestAggregate.project.draft_input }
        : {};
      draftInput.project_details_experience = stored;
      draftInput.project_intent = nextIntent;
      await repository.updateProject(projectId, { draft_input: draftInput });
      dirtyFields.clear();
      draftDetails = null;
      await loadContext();
      renderCurrent();
      ui.saveStatus.textContent = "Параметры сохранены.";
      ui.live.textContent = viewModel.nextMissing
        ? `Параметры сохранены. Дальше: ${viewModel.nextMissing.label}.`
        : "Параметры сохранены. Основные сведения заполнены.";
      focusAfterSave();
      return true;
    }, "Не удалось сохранить параметры. Введённые значения остались на странице — попробуй ещё раз.");
  }

  async function continueToNextStep() {
    if (busy) return;
    if (dirtyFields.size && !await saveParameters()) return;
    if (!viewModel?.readiness.action.enabled) return;
    globalObject.dispatchEvent(new CustomEvent("yarnai:project-details-closure-open"));
    document.querySelector("#project-details-closure")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }

  async function runBusy(operation, fallback) {
    busy = true;
    setBusy(true);
    ui.saveStatus.textContent = "Сохраняем…";
    try {
      return await operation();
    } catch {
      ui.saveStatus.textContent = fallback;
      ui.live.textContent = fallback;
      return false;
    } finally {
      busy = false;
      setBusy(false);
      if (viewModel) ui.continueButton.disabled = !viewModel.readiness.action.enabled;
    }
  }

  function setBusy(value) {
    ui.save.disabled = value;
    [...ui.form.elements].forEach((control) => {
      if (control !== ui.save) control.disabled = value;
    });
    ui.continueButton.disabled = value || !viewModel?.readiness.action.enabled;
  }

  function focusAfterSave() {
    const field = viewModel.nextMissing?.field || viewModel.readiness.next?.field;
    const control = firstControl(field);
    if (control && !control.closest("[hidden]")) control.focus();
    else document.querySelector("#project-details-known-title")?.focus?.();
  }

  function firstControl(field) {
    const control = field ? ui.form.elements.namedItem(field) : null;
    if (!control) return null;
    return typeof control.length === "number" && !control.tagName ? control[0] : control;
  }

  function firstInvalidControl() {
    return ui.form.querySelector('[aria-invalid="true"]');
  }

  function setFieldMessage(field, message) {
    const output = document.querySelector(`[data-error-for="${field}"]`);
    if (output) output.textContent = message || "";
  }

  function clearFieldMessage(field) {
    const control = firstControl(field);
    control?.removeAttribute("aria-invalid");
    setFieldMessage(field, "");
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Изделие";
  }

  function renderStorageError(error) {
    renderState("error");
    ui.errorCopy.textContent = error?.userMessage || "Попробуй обновить страницу.";
  }
})(window);
