"use strict";

(function initializeGarmentActualYarnAssistant(globalObject) {
  if (typeof document === "undefined") return;
  const system = globalObject.YarnAIProjectSystem;
  const domain = globalObject.YarnAIGarmentActualYarn;
  const intakeDomain = globalObject.YarnAIManualCalculationIntake;
  const validationDomain = globalObject.YarnAIManualIntakeValidation;
  const byId = (id) => document.getElementById(id);
  const ui = {
    root: byId("manual-intake-root"), routeStatus: byId("yarn-route-status"), existing: byId("existing-yarn-route"), recommended: byId("recommended-yarn-route"), recommendationPanel: byId("yarn-recommendation-panel"), profiles: byId("recommended-route-profiles"), sections: byId("intake-sections-panel"), form: byId("intake-form"),
    chooseExisting: byId("choose-existing-yarn"), chooseRecommended: byId("choose-recommended-yarn"), showRecommended: byId("show-recommended-from-existing"), assessmentRecommended: byId("assessment-recommended"), assess: byId("assess-existing-yarn"), candidateStatus: byId("candidate-status"),
    labelPhoto: byId("candidate-label-photo"), yarnPhoto: byId("candidate-yarn-photo"), photoList: byId("candidate-photo-list"),
    weight: byId("candidate-weight"), length: byId("candidate-length"), skeins: byId("candidate-skeins"), totalWeight: byId("candidate-total-weight"), manufacturer: byId("candidate-manufacturer"), name: byId("candidate-name"), article: byId("candidate-article"), color: byId("candidate-color"), dyeLot: byId("candidate-dye-lot"), composition: byId("candidate-composition"), needlesMin: byId("candidate-needles-min"), needlesMax: byId("candidate-needles-max"), surface: byId("candidate-surface"),
    assessment: byId("actual-yarn-assessment"), assessmentTitle: byId("actual-yarn-assessment-title"), target: byId("assessment-target"), actual: byId("assessment-actual"), changes: byId("assessment-changes"), swatch: byId("assessment-swatch"), acceptRow: byId("accept-differences-row"), accept: byId("accept-yarn-differences"), confirm: byId("confirm-actual-yarn"), edit: byId("edit-actual-yarn"), confirmed: byId("actual-yarn-confirmed"), confirmedSummary: byId("actual-yarn-confirmed-summary"), changeConfirmed: byId("change-confirmed-yarn"), error: byId("form-error"), saveStatus: byId("save-status"),
  };
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;
  let editingConfirmed = false;
  let renderedCandidateFingerprint = null;
  let protectedBaseline = null;
  let protectedAudit = null;

  start().catch((error) => showError(error, "Не удалось открыть маршрут фактической пряжи."));

  async function start() {
    if (!system || !domain || !intakeDomain || !validationDomain) throw new Error("ACTUAL_YARN_DOMAIN_UNAVAILABLE");
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId || !system.isUuidv7(projectId)) throw new Error("PROJECT_INVALID");
    await waitForBaseAssistant();
    repository = new system.ProjectRepository();
    await repository.initialize();
    protectedBaseline = await captureProtectedProjects();
    protectedAudit = protectedBaseline;
    try { inspected = await domain.inspectForProject(repository, projectId); }
    catch (error) {
      if (error?.code !== "ACTUAL_YARN_RECOMMENDATION_REQUIRED") throw error;
      renderWithoutRecommendation();
      return;
    }
    bind();
    render();
  }

  function renderWithoutRecommendation() {
    // No comparison or target confirmation is fabricated. The existing factual
    // intake remains usable even when the optional provider supplement is absent.
    ui.existing.hidden = true;
    ui.recommended.hidden = true;
    ui.sections.hidden = false;
    ui.form.hidden = false;
    ui.recommendationPanel.hidden = true;
    ui.routeStatus.textContent = "Рекомендации по фотографии пока нет. Можно вручную указать конкретную пряжу, мерки и плотность в форме ниже. Её сходство с фотографией и достаточность запаса ещё не оценены.";
    ui.chooseExisting.addEventListener("click", () => {
      ui.recommendationPanel.hidden = true;
      if (byId("yarn-status").disabled) return;
      byId("yarn-status").value = "selected";
      byId("yarn-fields").querySelectorAll("input, textarea").forEach((field) => { field.disabled = false; });
      byId("yarn-name").focus();
      byId("yarn-title").scrollIntoView({ block: "center" });
    });
    ui.chooseRecommended.addEventListener("click", () => {
      const guide = byId("polo-preparation-guide");
      if (guide && !guide.hidden) {
        byId("polo-yarn-help").open = true;
        guide.scrollIntoView({ block: "start" });
        return;
      }
      ui.recommendationPanel.hidden = false;
      ui.recommendationPanel.scrollIntoView({ block: "start" });
    });
  }

  async function waitForBaseAssistant() {
    const deadline = Date.now() + 15000;
    while (!globalObject.__YARNAI_MANUAL_INTAKE__ && Date.now() < deadline) await new Promise((resolve) => globalObject.setTimeout(resolve, 25));
  }

  function bind() {
    ui.chooseExisting.addEventListener("click", () => selectRoute(domain.ROUTES.ALREADY_HAVE));
    ui.chooseRecommended.addEventListener("click", () => selectRoute(domain.ROUTES.HELP_CHOOSE));
    ui.showRecommended.addEventListener("click", () => selectRoute(domain.ROUTES.HELP_CHOOSE));
    ui.assessmentRecommended.addEventListener("click", () => selectRoute(domain.ROUTES.HELP_CHOOSE));
    ui.assess.addEventListener("click", assessCandidate);
    ui.confirm.addEventListener("click", confirmCandidate);
    ui.edit.addEventListener("click", beginEditing);
    ui.changeConfirmed.addEventListener("click", beginEditing);
    ui.accept.addEventListener("change", renderButtons);
    ui.labelPhoto.addEventListener("change", () => attachPhoto(ui.labelPhoto, "yarn_label"));
    ui.yarnPhoto.addEventListener("change", () => attachPhoto(ui.yarnPhoto, "yarn_appearance"));
    ui.photoList.addEventListener("click", (event) => {
      const button = event.target.closest?.("button[data-delete-yarn-photo]");
      if (button) removePhoto(button.dataset.photoId);
    });
  }

  async function selectRoute(route) {
    await mutate(async () => { inspected = await domain.selectRouteForProject(repository, projectId, route); }, "Не удалось сохранить выбранный маршрут.", "Маршрут сохранён локально.");
  }

  async function assessCandidate() {
    await mutate(async () => {
      inspected = await domain.saveCandidateForProject(repository, projectId, readCandidate());
      inspected = await domain.assessForProject(repository, projectId);
    }, "Не удалось сравнить пряжу.", "Данные сохранены и сравнены с выбранным ориентиром.");
  }

  async function confirmCandidate() {
    await mutate(async () => {
      inspected = await domain.confirmForProject(repository, projectId, { acceptDifferences: ui.accept.checked });
      await validationDomain.validateForProject(repository, projectId, { contractContext: {} });
      inspected = await domain.inspectForProject(repository, projectId);
      protectedAudit = await captureProtectedProjects();
      editingConfirmed = false;
      globalObject.dispatchEvent(new Event("yarnai:actual-yarn-confirmed"));
    }, "Не удалось подтвердить фактическую пряжу.", "Фактическая пряжа подтверждена. Плотность и расчёты не создавались.");
  }

  async function attachPhoto(input, role) {
    const file = input.files?.[0] || null;
    input.value = "";
    if (!file) return;
    await mutate(async () => {
      await intakeDomain.addPhotoForProject(repository, projectId, file, role);
      inspected = await domain.saveCandidateForProject(repository, projectId, readCandidate());
    }, "Не удалось сохранить фотографию.", "Фотография сохранена локально. Данные с неё нужно ввести вручную.");
  }

  async function removePhoto(photoId) {
    await mutate(async () => {
      inspected = await domain.removePhotoForProject(repository, projectId, photoId);
      protectedAudit = await captureProtectedProjects();
    }, "Не удалось удалить фотографию.", "Фотография и её локальный файл удалены только из этого проекта.");
  }

  function beginEditing() {
    editingConfirmed = true;
    ui.assessment.hidden = true;
    ui.confirmed.hidden = true;
    ui.assess.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function mutate(operation, fallback, success) {
    if (busy) return;
    busy = true; setBusy(true); ui.error.textContent = ""; ui.candidateStatus.textContent = "Сохраняем…";
    try { await operation(); ui.candidateStatus.textContent = success; render(); }
    catch (error) { showError(error, fallback); }
    finally { busy = false; setBusy(false); renderButtons(); }
  }

  function setBusy(value) {
    [ui.chooseExisting, ui.chooseRecommended, ui.showRecommended, ui.assessmentRecommended, ui.assess, ui.confirm, ui.edit, ui.changeConfirmed, ui.labelPhoto, ui.yarnPhoto].forEach((control) => { control.disabled = value; });
    ui.photoList.querySelectorAll("button[data-delete-yarn-photo]").forEach((control) => { control.disabled = value; });
  }

  function readCandidate() {
    return { skeinWeightGrams: ui.weight.value, lengthMeters: ui.length.value, availableSkeins: ui.skeins.value, totalWeightGrams: ui.totalWeight.value, manufacturer: ui.manufacturer.value, name: ui.name.value, article: ui.article.value, color: ui.color.value, dyeLot: ui.dyeLot.value, composition: ui.composition.value, needlesMinMm: ui.needlesMin.value, needlesMaxMm: ui.needlesMax.value, surface: ui.surface.value };
  }

  function fillCandidate(candidate) {
    if (!candidate || renderedCandidateFingerprint === candidate.canonicalFingerprint) return;
    renderedCandidateFingerprint = candidate.canonicalFingerprint;
    const data = candidate.data;
    setValue(ui.weight, data.skeinWeightGrams); setValue(ui.length, data.lengthMeters); setValue(ui.skeins, data.availableSkeins); setValue(ui.totalWeight, data.totalWeightGrams); setValue(ui.manufacturer, data.manufacturer); setValue(ui.name, data.name); setValue(ui.article, data.article); setValue(ui.color, data.color); setValue(ui.dyeLot, data.dyeLot); setValue(ui.composition, data.composition); setValue(ui.needlesMin, data.needlesMinMm); setValue(ui.needlesMax, data.needlesMaxMm); ui.surface.value = data.surface;
  }

  function render() {
    const flow = inspected.flow;
    const route = flow.route;
    const confirmed = flow.confirmedActualYarn;
    ui.existing.hidden = route !== domain.ROUTES.ALREADY_HAVE;
    ui.recommended.hidden = route !== domain.ROUTES.HELP_CHOOSE;
    ui.recommendationPanel.hidden = route !== domain.ROUTES.HELP_CHOOSE;
    ui.sections.hidden = route === domain.ROUTES.NOT_SELECTED || (route === domain.ROUTES.ALREADY_HAVE && !confirmed);
    ui.form.hidden = route === domain.ROUTES.NOT_SELECTED || (route === domain.ROUTES.ALREADY_HAVE && !confirmed);
    ui.chooseExisting.setAttribute("aria-pressed", String(route === domain.ROUTES.ALREADY_HAVE));
    ui.chooseRecommended.setAttribute("aria-pressed", String(route === domain.ROUTES.HELP_CHOOSE));
    ui.routeStatus.textContent = route === domain.ROUTES.NOT_SELECTED ? "Выбор маршрута ещё не сохранён. Конкретная пряжа не подтверждена." : route === domain.ROUTES.ALREADY_HAVE ? (confirmed ? "Маршрут сохранён: фактическая пряжа подтверждена отдельным действием." : "Маршрут сохранён: имеющаяся пряжа пока только кандидат.") : "Маршрут сохранён: показаны три существующих профиля рекомендации.";
    fillCandidate(flow.candidate);
    renderProfiles();
    renderPhotos(flow.candidate);
    renderAssessment(flow.assessment, confirmed);
    renderDiagnostics();
    renderButtons();
  }

  function renderProfiles() {
    const recommendation = inspected.recommendation.artifact;
    const entries = [
      ["Более тонкая пряжа", recommendation.thinnerAlternative, "Полотно обычно легче и тоньше, фактура мельче, пластичность выше; на 10 см обычно нужно больше петель."],
      ["Максимально близко к фотографии", recommendation.recommendedMiddle, "Наиболее близкий сохранённый баланс фактуры, мягкости, объёма и пластичности."],
      ["Более толстая пряжа", recommendation.thickerAlternative, "Полотно обычно объёмнее и плотнее, фактура крупнее; на 10 см обычно нужно меньше петель."],
    ];
    ui.profiles.replaceChildren(...entries.map(([label, variant, explanation]) => {
      const card = document.createElement("article"); card.className = `route-profile${variant.kind === "recommended_middle" ? " closest" : ""}`;
      const title = document.createElement("h4"); title.textContent = label;
      const range = document.createElement("p"); range.textContent = `${variant.metersPer100g.min}–${variant.metersPer100g.max} м/100 г`;
      const effect = document.createElement("p"); effect.textContent = `${explanation} ${variant.textureEffect} ${variant.drapeStructure} ${variant.garmentWeightVolume}`;
      const unknown = document.createElement("p"); unknown.className = "muted"; unknown.textContent = "Точное количество петель неизвестно до связанного, обработанного и высушенного образца.";
      card.append(title, range, effect, unknown); return card;
    }));
  }

  function renderPhotos(candidate) {
    const refs = candidate?.data?.photoRefs || [];
    ui.photoList.replaceChildren(...refs.map((photo) => {
      const item = document.createElement("article"); item.className = "photo-card yarn-photo-card";
      const description = document.createElement("p"); description.textContent = `${photo.role === "yarn_label" ? "Этикетка" : "Моток или нить"}: ${photo.displayName}. LOCAL_ONLY, наружу не отправляется.`;
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button secondary"; remove.dataset.deleteYarnPhoto = "true"; remove.dataset.photoId = photo.photoId; remove.textContent = "Удалить фотографию"; remove.disabled = busy;
      item.append(description, remove); return item;
    }));
  }

  function renderAssessment(assessment, confirmed) {
    const visible = Boolean(assessment) && (!confirmed || !editingConfirmed);
    ui.assessment.hidden = !visible || Boolean(confirmed);
    ui.confirmed.hidden = !confirmed || editingConfirmed;
    if (!assessment) return;
    ui.assessmentTitle.textContent = assessmentStatus(assessment.status);
    const range = assessment.knownFacts.targetMetersPer100g;
    ui.target.textContent = `${inspected.target.artifact.selectedOptionSnapshot.optionId === "recommended_middle" ? "Максимально близко к фотографии" : "Сохранённый профиль"}: ${range.min}–${range.max} м/100 г.`;
    ui.actual.textContent = assessment.knownFacts.actualMetersPer100g === null ? `Не хватает: ${assessment.missingFacts.join(", ")}.` : `${formatNumber(assessment.knownFacts.actualMetersPer100g)} м/100 г; поверхность — ${surfaceLabel(assessment.knownFacts.surface)}.`;
    replaceList(ui.changes, assessment.missingFacts.length ? assessment.missingFacts.map((fact) => `Для этой проверки нужно указать: ${fact}.`) : assessment.likelyChanges);
    replaceList(ui.swatch, assessment.onlyAfterSwatch);
    const needsAcceptance = assessment.status !== "close_to_target" && assessment.status !== "insufficient_data";
    ui.acceptRow.hidden = !needsAcceptance;
    if (!needsAcceptance) ui.accept.checked = false;
    if (confirmed) ui.confirmedSummary.textContent = `${candidateLabel(confirmed.candidateSnapshot)}; ${formatNumber(confirmed.candidateSnapshot.metersPer100g)} м/100 г. ${assessmentStatus(confirmed.assessmentSnapshot.status)}.`;
  }

  function renderButtons() {
    const flow = inspected?.flow;
    const assessment = flow?.assessment;
    const confirmed = flow?.confirmedActualYarn;
    ui.confirm.disabled = busy || !assessment || assessment.status === "insufficient_data" || (assessment.status !== "close_to_target" && !ui.accept.checked);
    ui.assess.disabled = busy || Boolean(confirmed && !editingConfirmed);
  }

  function renderDiagnostics() {
    const flow = inspected.flow;
    const confirmed = flow.confirmedActualYarn;
    const aggregate = inspected.intake.aggregate;
    const confirmationOperations = aggregate.operations.filter((entry) => entry.kind === "GARMENT_ACTUAL_YARN_CONFIRMED").length;
    const downstreamOperations = aggregate.operations.filter((entry) => /STAGE_(19|21|22)|EXECUTION_PLAN|CALCULATION_EXECUTED/.test(entry.kind || "")).length;
    const changes = protectedProjectChanges();
    const diagnostic = Object.freeze({ projectId, route: flow.route, candidateId: flow.candidate?.candidateId || null, candidateRevision: flow.candidate?.revision || null, candidateFingerprint: flow.candidate?.canonicalFingerprint || null, candidatePhotoIds: (flow.candidate?.data?.photoRefs || []).map((entry) => entry.photoId), assessmentId: flow.assessment?.assessmentId || null, assessmentRevision: flow.assessment?.candidateRevision || null, assessmentFingerprint: flow.assessment?.canonicalFingerprint || null, assessmentStatus: flow.assessment?.status || null, actualYarnId: confirmed?.actualYarnId || null, actualYarnFingerprint: confirmed?.canonicalFingerprint || null, actualYarnConfirmedAt: confirmed?.confirmedAt || null, actualYarnUpstream: confirmed?.upstream || flow.upstream || null, yarnSelectionStatus: inspected.intake.artifact.yarn.selectionStatus, validationStatus: aggregate.progress.find((entry) => entry.kind === validationDomain.PROGRESS_KIND && entry.calculation_id === inspected.intake.calculation.calculation_id && entry.epoch === 1)?.state?.status || null, confirmationOperationCount: confirmationOperations, downstreamOperationCount: downstreamOperations, protectedProjectCount: protectedAudit?.entries?.length || 0, protectedProjectsAggregateHashBefore: protectedBaseline?.aggregateHash || null, protectedProjectsAggregateHashAfter: protectedAudit?.aggregateHash || null, protectedProjectsUnchanged: changes.length === 0, protectedProjectChangedIds: changes });
    globalObject.__YARNAI_ACTUAL_YARN__ = diagnostic;
    const data = ui.root.dataset;
    data.yarnRoute = diagnostic.route; data.actualYarnCandidateId = diagnostic.candidateId || ""; data.actualYarnCandidateRevision = String(diagnostic.candidateRevision || ""); data.actualYarnCandidateFingerprint = diagnostic.candidateFingerprint || ""; data.actualYarnCandidatePhotoIds = diagnostic.candidatePhotoIds.join(","); data.actualYarnAssessmentId = diagnostic.assessmentId || ""; data.actualYarnAssessmentFingerprint = diagnostic.assessmentFingerprint || ""; data.actualYarnAssessmentStatus = diagnostic.assessmentStatus || ""; data.actualYarnId = diagnostic.actualYarnId || ""; data.actualYarnFingerprint = diagnostic.actualYarnFingerprint || ""; data.actualYarnSelectionStatus = diagnostic.yarnSelectionStatus || ""; data.yarnSelectionStatus = diagnostic.yarnSelectionStatus || ""; data.actualYarnUpstream = diagnostic.actualYarnUpstream ? JSON.stringify(diagnostic.actualYarnUpstream) : ""; data.actualYarnConfirmationOperationCount = String(diagnostic.confirmationOperationCount); data.actualYarnDownstreamOperationCount = String(diagnostic.downstreamOperationCount); data.actualYarnProtectedProjectCount = String(diagnostic.protectedProjectCount); data.actualYarnProtectedHashBefore = diagnostic.protectedProjectsAggregateHashBefore || ""; data.actualYarnProtectedHashAfter = diagnostic.protectedProjectsAggregateHashAfter || ""; data.actualYarnProtectedUnchanged = String(diagnostic.protectedProjectsUnchanged); data.actualYarnProtectedChangedIds = diagnostic.protectedProjectChangedIds.join(",");
  }

  async function captureProtectedProjects() {
    const projects = await repository.listProjects({ section: "all" });
    const entries = [];
    for (const project of projects.filter((entry) => entry.project_id !== projectId).sort((left, right) => left.project_id.localeCompare(right.project_id))) {
      const aggregate = await repository.getProject(project.project_id, { includeDeleted: true });
      entries.push([project.project_id, await sha256Canonical(aggregate)]);
    }
    return Object.freeze({ entries: Object.freeze(entries.map((entry) => Object.freeze(entry))), aggregateHash: await sha256Canonical(entries) });
  }

  function protectedProjectChanges() {
    if (!protectedBaseline || !protectedAudit) return [];
    const before = new Map(protectedBaseline.entries);
    const after = new Map(protectedAudit.entries);
    return [...new Set([...before.keys(), ...after.keys()])].filter((id) => before.get(id) !== after.get(id)).sort();
  }

  async function sha256Canonical(value) {
    const bytes = new TextEncoder().encode(canonicalize(value));
    return [...new Uint8Array(await globalObject.crypto.subtle.digest("SHA-256", bytes))].map((entry) => entry.toString(16).padStart(2, "0")).join("");
  }

  function canonicalize(value) { if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`; return JSON.stringify(value); }
  function assessmentStatus(value) { return ({ close_to_target: "Близко к выбранному ориентиру", usable_with_differences: "Можно использовать, но результат будет отличаться", noticeable_difference_risk: "Риск заметного отличия", insufficient_data: "Недостаточно данных для оценки" })[value] || value; }
  function surfaceLabel(value) { return ({ smooth: "гладкая", slight_halo: "слегка пушистая", strong_halo: "сильно пушистая", unknown: "неизвестна" })[value] || value; }
  function candidateLabel(candidate) { return [candidate.data.manufacturer, candidate.data.name, candidate.data.article].filter(Boolean).join(" · ") || `Имеющаяся пряжа ${candidate.data.skeinWeightGrams} г / ${candidate.data.lengthMeters} м`; }
  function formatNumber(value) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(value); }
  function setValue(element, value) { element.value = value === null || value === undefined ? "" : String(value); }
  function replaceList(container, values) { container.replaceChildren(...values.map((value) => { const item = document.createElement("li"); item.textContent = value; return item; })); }
  function showError(error, fallback) { ui.candidateStatus.textContent = ""; ui.error.textContent = error?.userMessage || fallback; }
})(typeof window !== "undefined" ? window : globalThis);
