"use strict";

(function initializePatternTechnologyReviewPage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const reviewApi = globalObject.YarnAIPatternTechnologyReview;
  const decisionUi = globalObject.YarnAIPatternTechnologyReviewDecisionUi;
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("pattern-technology-review-fatal"), fatalMessage: byId("pattern-technology-review-fatal-message"),
    workflow: byId("pattern-technology-review-workflow"), title: byId("pattern-technology-review-project-title"),
    status: byId("pattern-technology-review-status"), source: byId("pattern-technology-review-source"),
    sourceRevision: byId("pattern-technology-review-source-revision"), progress: byId("pattern-technology-review-progress"),
    criticalCount: byId("pattern-technology-review-critical-count"), start: byId("pattern-technology-review-start"),
    validate: byId("pattern-technology-review-validate"), confirm: byId("pattern-technology-review-confirm"),
    confirmGuidance: byId("pattern-technology-review-confirm-guidance"), readOnlyNotice: byId("pattern-technology-review-read-only"),
    reopen: byId("pattern-technology-review-reopen"), newReview: byId("pattern-technology-review-new"),
    back: byId("pattern-technology-review-back"), navBack: byId("pattern-technology-review-nav-back"), navPlan: byId("pattern-technology-review-nav-plan"),
    operationStatus: byId("pattern-technology-review-operation-status"), error: byId("pattern-technology-review-operation-error"), summary: byId("pattern-technology-review-summary"),
    summaryValues: byId("pattern-technology-review-summary-values"), items: byId("pattern-technology-review-items"),
    explanation: byId("pattern-adaptation-explanation"), explanationIntro: byId("pattern-adaptation-explanation-intro"), explanationVariant: byId("pattern-adaptation-explanation-variant"), explanationStatus: byId("pattern-adaptation-explanation-status"), explanationChanges: byId("pattern-adaptation-explanation-changes"), explanationUnchanged: byId("pattern-adaptation-explanation-unchanged"), explanationUnchangedList: byId("pattern-adaptation-explanation-unchanged-list"), explanationGaps: byId("pattern-adaptation-explanation-gaps"), explanationGapList: byId("pattern-adaptation-explanation-gap-list"),
    validation: byId("pattern-technology-review-validation"), validationCritical: byId("pattern-technology-review-validation-critical"),
    validationNonCritical: byId("pattern-technology-review-validation-noncritical"), validationInformational: byId("pattern-technology-review-validation-informational"),
    confirmed: byId("pattern-technology-review-confirmed"), confirmedSummary: byId("pattern-technology-review-confirmed-summary"),
    executable: byId("pattern-technology-executable-input"), executableReadiness: byId("pattern-technology-executable-input-readiness"), executableIdentity: byId("pattern-technology-executable-input-identity"), executableBinding: byId("pattern-technology-executable-input-binding"), executableCoverage: byId("pattern-technology-executable-input-coverage"), executableBlockers: byId("pattern-technology-executable-input-blockers"), executableProvenance: byId("pattern-technology-executable-input-provenance"), executableStatuses: byId("pattern-technology-executable-input-statuses"), executableSelectedBranches: byId("pattern-technology-executable-input-selected-branches"), executableRejectedBranches: byId("pattern-technology-executable-input-rejected-branches"), executableAdaptedOperations: byId("pattern-technology-executable-input-adapted-operations"),
    provenance: byId("pattern-technology-review-provenance"), dialog: byId("pattern-technology-review-correction-dialog"),
    correctionForm: byId("pattern-technology-review-correction-form"), correctionTitle: byId("pattern-technology-review-correction-title"),
    correctionOriginal: byId("pattern-technology-review-correction-original"), correctionType: byId("pattern-technology-review-correction-type"),
    correctionValue: byId("pattern-technology-review-correction-value"), correctionUnit: byId("pattern-technology-review-correction-unit"),
    correctionError: byId("pattern-technology-review-correction-error"), correctionCancel: byId("pattern-technology-review-correction-cancel"),
  };
  const containers = {
    overview: byId("pattern-technology-review-overview"), materials: byId("pattern-technology-review-materials"),
    components: byId("pattern-technology-review-components"), sections: byId("pattern-technology-review-sections"),
    operations: byId("pattern-technology-review-operations"), rows: byId("pattern-technology-review-rows"),
    repeats: byId("pattern-technology-review-repeats"), stitches: byId("pattern-technology-review-stitches"),
    finishing: byId("pattern-technology-review-finishing"), abbreviations: byId("pattern-technology-review-abbreviations"),
    assumptions: byId("pattern-technology-review-assumptions"), missing: byId("pattern-technology-review-missing"),
    conflicts: byId("pattern-technology-review-conflicts"), warnings: byId("pattern-technology-review-warnings"),
  };
  const categoryGroup = Object.freeze({
    craft: "overview", product: "overview", construction: "overview", sizes: "overview", gauge: "materials",
    materials: "materials", yarn: "materials", tools: "materials", components: "components", sections: "sections",
    operations: "operations", rowInstructions: "rows", repeats: "repeats", stitchCountChanges: "stitches",
    finishing: "finishing", abbreviations: "abbreviations", assumptions: "assumptions",
    missing_information: "missing", conflict: "conflicts", warning: "warnings",
  });
  const correctionLabels = Object.freeze({
    product_name: "Название изделия", component_name: "Название компонента", section_name: "Название секции",
    size: "Размер", unit: "Единица измерения", stitch_count: "Количество петель", row_count: "Количество рядов",
    gauge: "Плотность", tool_number: "Номер инструмента", yarn_weight: "Толщина пряжи", yarn_category: "Категория пряжи",
    repeat_count: "Количество повторов", abbreviation_definition: "Расшифровка сокращения",
    component_assignment: "Назначение компонента", section_order: "Порядок секции", range: "Диапазон", user_comment: "Комментарий",
  });
  let repository = null; let projectId = null; let inspected = null; let busy = false; let correctionTargetId = null; let readOnlyCompleted = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть проверку технологии."));

  async function initialize() {
    const parameters = new URLSearchParams(globalObject.location.search);
    projectId = parameters.get("project");
    readOnlyCompleted = parameters.get("view") === "completed";
    if (!projectId) return renderBlocked("Откройте проверку из валидного Stage 20.");
    if (!system?.isUuidv7(projectId) || !reviewApi || !decisionUi) return showFatal("Ссылка на проект повреждена.");
    repository = new system.ProjectRepository(); await repository.initialize();
    const sourceEvidenceLink = document.querySelector("#pattern-technology-review-source-evidence");
    if (sourceEvidenceLink) sourceEvidenceLink.href = `/pattern-source-instruction-evidence?project=${encodeURIComponent(projectId)}`;
    const backUrl = readOnlyCompleted ? "/saved-projects" : `/pattern-technology-draft?project=${encodeURIComponent(projectId)}`;
    ui.back.href = backUrl; ui.navBack.href = backUrl;
    if (readOnlyCompleted) { ui.back.textContent = "К сохранённым проектам"; ui.navBack.textContent = "Мои проекты"; }
    ui.navPlan.href = `/pattern-execution-plan?project=${encodeURIComponent(projectId)}`;
    if (!readOnlyCompleted) {
      ui.start.addEventListener("click", () => runOperation(() => reviewApi.startForProject(repository, projectId)));
      ui.validate.addEventListener("click", () => runOperation(() => reviewApi.validateForProject(repository, projectId)));
      ui.confirm.addEventListener("click", () => runOperation(() => reviewApi.confirmForProject(repository, projectId)));
      ui.reopen.addEventListener("click", () => runOperation(() => reviewApi.reopenForProject(repository, projectId)));
      ui.newReview.addEventListener("click", () => runOperation(() => reviewApi.newReviewForProject(repository, projectId)));
      ui.correctionForm.addEventListener("submit", saveCorrection);
      ui.correctionCancel.addEventListener("click", () => ui.dialog.close());
    }
    inspected = readOnlyCompleted
      ? await reviewApi.inspectForProject(repository, projectId)
      : await reviewApi.ensureForProject(repository, projectId);
    render();
  }

  function render() {
    reset();
    ui.title.textContent = inspected?.project?.title || "Проверка технологии";
    if (!inspected || ["missing_project", "draft_missing"].includes(inspected.state)) return renderBlocked("Валидный черновик Stage 20 не найден.");
    if (["source_invalid", "draft_stale"].includes(inspected.state) && !inspected.review) return renderBlocked(`Stage 20 недоступен: ${inspected.reasonCode || "SOURCE_DRAFT_STATUS_INVALID"}.`);
    if (inspected.state === "corrupted") return showFatal(`Запись Stage 21 повреждена: ${inspected.reasonCode}.`);
    const state = inspected.review;
    if (!state) return renderBlocked("Подготовка review не завершена.");
    if (readOnlyCompleted && (state.status !== "confirmed" || !state.confirmedSnapshot)) return renderBlocked("Сохранённый подтверждённый результат не найден. Данные проекта не изменены.");
    const liveValidation = reviewApi.validateReviewState(state, inspected.draft);
    const validation = readOnlyCompleted ? state.validation : state.status === "stale" ? liveValidation : state.validation;
    const validConfirmed = state.status === "confirmed" && state.confirmedSnapshot && (readOnlyCompleted || !liveValidation.critical.length);
    ui.source.textContent = "Подтверждённая исходная инструкция, параметры пользователя и сохранённый расчёт";
    ui.sourceRevision.textContent = readOnlyCompleted ? "Результат уже принят — повторное действие не требуется" : validConfirmed ? "Объяснение и план подтверждены" : "Проверка ещё не завершена";
    const completed = state.decisions.filter((entry) => entry.decision !== "pending").length;
    ui.progress.textContent = `${completed} из ${state.decisions.length}`;
    ui.criticalCount.textContent = String(validation.critical?.length || 0);
    ui.status.textContent = statusLabel(validConfirmed ? "confirmed" : state.status);
    ui.status.dataset.status = validConfirmed ? "confirmed" : state.status;
    ui.start.hidden = readOnlyCompleted || state.status !== "waiting";
    ui.validate.hidden = readOnlyCompleted || ["waiting", "confirmed", "stale", "failed"].includes(state.status);
    ui.confirm.hidden = readOnlyCompleted || ["waiting", "confirmed", "stale", "failed"].includes(state.status);
    const executableInput = state.immutableSourceSnapshot?.executableTechnologyPlanInput;
    const executableReady = executableInput?.algorithmId === reviewApi.EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID ? executableInput?.readiness?.executableReady === true : true;
    const confirmationGuidance = reviewApi.buildConfirmationGuidance(state, validation);
    ui.confirm.disabled = busy || !confirmationGuidance.canConfirm || !executableReady;
    ui.confirm.setAttribute("aria-disabled", String(ui.confirm.disabled));
    ui.confirmGuidance.dataset.status = confirmationGuidance.canConfirm && executableReady ? "ready" : "blocked";
    ui.confirmGuidance.textContent = executableReady
      ? confirmationGuidance.message
      : "Подтверждение пока недоступно: исполнимый план не прошёл обязательную проверку готовности.";
    ui.confirmGuidance.hidden = readOnlyCompleted;
    ui.navPlan.hidden = readOnlyCompleted ? false : !(validConfirmed && executableReady);
    if (readOnlyCompleted) ui.navPlan.textContent = "Вернуться к текущему этапу";
    ui.reopen.hidden = readOnlyCompleted || !validConfirmed;
    ui.newReview.hidden = readOnlyCompleted || state.status !== "stale";
    ui.readOnlyNotice.hidden = !readOnlyCompleted;
    setDisabled(busy);
    renderSummary(state.immutableSourceSnapshot.structuredDraft);
    renderAdaptationExplanation(state);
    renderExecutableInput(state);
    renderTargets(state, validation);
    revealConfirmationBlocker(confirmationGuidance);
    renderProvenance(state.immutableSourceSnapshot.provenance);
    renderValidation({
      ...validation,
      informational: inspected?.revalidationReasonCode
        ? [...(validation.informational || []), {
          code: `CAUSAL_TRACE_REVALIDATION_BLOCKED_${inspected.revalidationReasonCode}${inspected.revalidationDifferencePaths?.length ? ` — ${inspected.revalidationDifferencePaths.join(", ")}` : ""}`,
        }]
        : validation.informational,
    });
    if (validConfirmed) {
      ui.confirmed.hidden = false;
      ui.confirmedSummary.textContent = readOnlyCompleted
        ? "Решение уже принято и сохранено. Просмотр не меняет проект и не требует повторного подтверждения."
        : "Объяснение и технологический план подтверждены и готовы к повторному открытию.";
    }
  }

  function renderAdaptationExplanation(state) {
    const input = state.immutableSourceSnapshot?.executableTechnologyPlanInput;
    const model = reviewApi.buildAdaptationExplanation(input);
    ui.explanation.hidden = false;
    ui.explanationIntro.textContent = model.intro;
    ui.explanationVariant.textContent = model.sourceVariant;
    ui.explanationStatus.textContent = input?.readiness?.adaptationFullySupported === false || model.status !== "complete"
      ? "Адаптация подтверждена, но поддержана не полностью: ниже перечислены ограничения и недостающие доказательства."
      : "Объяснение построено по сохранённым данным без догадок.";
    ui.explanationStatus.dataset.status = model.status;
    ui.explanationChanges.replaceChildren(...model.changes.map(adaptationChangeNode));
    if (!model.changes.length) ui.explanationChanges.append(emptyNode("Доказанные изменения отсутствуют."));
    ui.explanationUnchanged.hidden = !model.unchanged.length;
    ui.explanationUnchangedList.replaceChildren(...model.unchanged.map(listItem));
    ui.explanationGaps.hidden = !model.gaps.length;
    ui.explanationGapList.replaceChildren(...model.gaps.map((entry) => listItem(`${entry.area}: ${entry.message}`)));
  }

  function adaptationChangeNode(change) {
    const article = document.createElement("article"); article.className = "adaptation-change";
    const title = document.createElement("h3"); title.textContent = change.title;
    article.append(title, adaptationFact("Было", change.before), adaptationFact("Стало", change.after), adaptationFact("Почему", change.why), adaptationFact("Практический смысл", change.practical));
    if (change.affectedActions.length) article.append(adaptationFact("Где это видно в плане", change.affectedActions.join(", ")));
    if (change.basis.length) article.append(adaptationFact("Основание", change.basis.join("; "), "adaptation-basis"));
    return article;
  }

  function adaptationFact(label, value, className = "") {
    const paragraph = document.createElement("p"); if (className) paragraph.className = className;
    const strong = document.createElement("strong"); strong.textContent = `${label}: `;
    paragraph.append(strong, document.createTextNode(String(value))); return paragraph;
  }

  function renderSummary(draft) {
    ui.summary.hidden = false;
    const entries = [
      ["Изделие", draft.product?.value ?? draft.product?.type], ["Конструкция", draft.construction],
      ["Размеры", draft.sizes], ["Материалы", draft.materials], ["Пряжа", draft.yarn],
      ["Инструменты", draft.tools], ["Плотность", draft.gauge],
    ];
    const nodes = entries.map(([label, value]) => {
      const wrapper = document.createElement("div"); const term = document.createElement("dt"); const description = document.createElement("dd");
      term.textContent = label; description.textContent = humanValue(value); wrapper.append(term, description); return wrapper;
    });
    ui.summaryValues.replaceChildren(...nodes);
  }

  function renderExecutableInput(state) {
    const input = state.immutableSourceSnapshot?.executableTechnologyPlanInput;
    ui.executable.hidden = false;
    if (!input) {
      ui.executableReadiness.textContent = "Эта legacy-запись Stage 21 не содержит versioned executable input. Создайте новый review из неизменённого Stage 20.";
      ui.executableIdentity.textContent = "EXECUTABLE_INPUT_UPGRADE_REQUIRED";
      ui.executableBinding.replaceChildren(); ui.executableCoverage.replaceChildren(); ui.executableBlockers.replaceChildren(); ui.executableProvenance.replaceChildren(); ui.executableStatuses.replaceChildren(); ui.executableSelectedBranches.replaceChildren(); ui.executableRejectedBranches.replaceChildren(); ui.executableAdaptedOperations.replaceChildren();
      return;
    }
    ui.executableReadiness.textContent = input.readiness.executableReady ? "Исполнимая технология последовательно проверена и готова к пользовательскому review." : `Не готов к вязанию: coverage ${input.coverage.coveredCount}/${input.coverage.requiredCount}, unresolved blockers ${input.unresolvedBlockers.length}.`;
    ui.executableIdentity.textContent = `${input.identity} · ${input.fingerprint} · ${input.algorithmId}`;
    const binding = input.binding;
    renderDefinitionList(ui.executableBinding, [
      ["Stage 21 review", `${state.id} · revision ${state.revision} · status ${state.status}`],
      ["Stage 21 immutable snapshot", state.immutableSourceSnapshotFingerprint],
      ["Project", binding.projectId], ["Stage 19 revision", binding.stage19AuthoritativeReviewRevision], ["Stage 20 revision", binding.stage20Revision],
      ["Stage 20 result", binding.stage20ResultIdentity], ["Source projection", binding.stage20SourceProjectionFingerprint],
      ["Versions", `contract ${binding.stage20InputContractVersion} · result ${binding.stage20ResultSchemaVersion} · algorithm ${binding.stage20AlgorithmVersion}`],
      ["Confirmed instruction evidence", binding.sourceInstructionEvidenceIdentity], ["Evidence revision", binding.sourceInstructionEvidenceRevision],
      ["Evidence snapshot", binding.sourceInstructionEvidenceFingerprint], ["Evidence result", binding.sourceInstructionResultIdentity],
      ["Source document", binding.sourceDocumentIdentity], ["Source document fingerprint", binding.sourceDocumentFingerprint],
      ["SOURCE_PATTERN_EVIDENCE", binding.sourcePatternEvidenceFingerprint], ["USER_ADAPTATION_PROFILE", binding.userAdaptationProfileFingerprint],
      ["Branch projection", input.branchSelection?.fingerprint],
      ["Adaptation profile", input.adaptedExecution?.adaptationProfile ? `${input.adaptedExecution.adaptationProfile.identity} · revision ${input.adaptedExecution.adaptationProfile.revision} · ${input.adaptedExecution.adaptationProfile.fingerprint}` : null],
      ["Solver result", input.adaptedExecution?.solverIdentity ? `${input.adaptedExecution.solverIdentity} · ${input.adaptedExecution.solverFingerprint}` : null],
      ["Solver candidates", input.adaptedExecution?.solver?.candidatesEvaluated],
      ["Sleeve schedule", input.adaptedExecution?.sleeveSchedule ? `${input.adaptedExecution.sleeveSchedule.algorithmId} · ${input.adaptedExecution.sleeveSchedule.decreaseRepeats} decreases · every ${input.adaptedExecution.sleeveSchedule.decreaseCycleRounds} rounds · ${input.adaptedExecution.sleeveSchedule.remainingStraightRoundsEstimate} estimated straight rounds` : null],
      ["Counts", `components ${input.counts.components} · operations ${input.counts.operations} · rows ${input.counts.rowInstructions} · finishing ${input.counts.finishing}`],
    ]);
    const coverageEntries = Array.isArray(input.coverage?.items)
      ? input.coverage.items
      : Array.isArray(input.coverage?.sections)
        ? input.coverage.sections.map((entry) => ({ order: entry.order, section: entry.component, covered: entry.complete, missing: entry.missing }))
        : [];
    ui.executableCoverage.replaceChildren(...coverageEntries.map((entry) => listItem(`${entry.order}. ${entry.section}: ${entry.covered ? "покрыто" : `не покрыто (${entry.missing.join(", ")})`}`)));
    ui.executableBlockers.replaceChildren(...(input.unresolvedBlockers.length ? input.unresolvedBlockers.map((entry) => listItem(`${entry.code}: ${entry.message} Отсутствуют: ${entry.missingAuthoritativeFields.join(", ")}.`)) : [listItem("Блокирующих пробелов нет.")]));
    const provenanceCounts = input.numericProvenance.reduce((result, entry) => { result[entry.provenance] = (result[entry.provenance] || 0) + 1; return result; }, {});
    renderDefinitionList(ui.executableProvenance, ["SOURCE_EXPLICIT", "USER_CONFIRMED", "ADAPTATION_CALCULATED", "DERIVED_BY_DECLARED_FORMULA", "UNRESOLVED"].map((key) => [key, provenanceCounts[key] || 0]));
    renderDefinitionList(ui.executableStatuses, [
      ["SOURCE_COVERAGE_COMPLETE", statusValue(input.readiness.sourceCoverageComplete)],
      ["BRANCH_SELECTION_RESOLVED", statusValue(input.readiness.branchSelectionResolved)],
      ["ADAPTATION_CALCULATED", statusValue(input.readiness.adaptationCalculated)],
      ["SEQUENTIAL_VALIDATION_COMPLETE", statusValue(input.readiness.sequentialValidationComplete)],
      ["EXECUTABLE_READY", statusValue(input.readiness.executableReady)],
    ]);
    ui.executableSelectedBranches.replaceChildren(...(input.branchSelection?.selectedOptions || []).map((entry) => listItem(`${entry.groupId}: ${entry.selectedOptionId}`)));
    ui.executableRejectedBranches.replaceChildren(...(input.branchSelection?.rejectedAlternatives || []).map((entry) => listItem(`${entry.executionRole || entry.identity} — NON_EXECUTABLE`)));
    ui.executableAdaptedOperations.replaceChildren(...(input.adaptedExecution?.operations || []).map((entry) => listItem(`${entry.order}. ${entry.kind}: ${entry.change.input} ${entry.change.delta >= 0 ? "+" : ""}${entry.change.delta}${entry.change.repeatCount !== 1 ? ` × ${entry.change.repeatCount}` : ""} → ${entry.change.output}${entry.physicalCondition ? `; до ${entry.physicalCondition.adaptedValue} ${entry.physicalCondition.unit}` : ""}`)));
  }

  function statusValue(value) { return value ? "PASS" : "BLOCKED"; }

  function renderDefinitionList(container, entries) {
    container.replaceChildren(...entries.flatMap(([label, value]) => { const term = document.createElement("dt"); term.textContent = label; const description = document.createElement("dd"); description.textContent = String(value ?? "—"); return [term, description]; }));
  }
  function listItem(text) { const item = document.createElement("li"); item.textContent = text; return item; }

  function renderTargets(state, validation) {
    ui.items.hidden = false;
    for (const container of Object.values(containers)) container.replaceChildren();
    for (const target of state.reviewState.targets) {
      const group = categoryGroup[target.category] || "warnings";
      containers[group].append(reviewItemNode(state, target, validation));
    }
    for (const [group, container] of Object.entries(containers)) if (!container.childElementCount) container.append(emptyNode(emptyText(group)));
  }

  function reviewItemNode(state, target, validation) {
    const decision = state.decisions.find((entry) => entry.targetId === target.id);
    const corrections = state.corrections.filter((entry) => entry.targetId === target.id);
    const note = state.userNotes.find((entry) => entry.targetId === target.id);
    const article = document.createElement("article"); article.id = `review-target-${safeId(target.id)}`; article.className = "review-item"; article.dataset.decision = decision.decision; article.dataset.blocking = String(Boolean(target.blocking));
    const heading = document.createElement("h3"); heading.textContent = `${target.code || target.category}: ${target.id}`; article.append(heading);
    const original = document.createElement("p"); original.className = "review-value"; original.textContent = `Исходное значение: ${humanValue(target.originalValue)}`; article.append(original);
    const provenance = document.createElement("p"); provenance.className = "review-provenance"; provenance.textContent = `Provenance: ${target.provenanceRefs?.length ? target.provenanceRefs.join(", ") : "структурный элемент Stage 20"}`; article.append(provenance);
    const current = document.createElement("p"); current.className = "review-decision"; current.textContent = `Решение: ${decision.decision}`; article.append(current);
    for (const correction of corrections) {
      const corrected = document.createElement("p"); corrected.className = "review-value"; corrected.textContent = `Исправлено (${correctionLabels[correction.type] || correction.type}): ${humanValue(correction.correctedValue)}${correction.unit ? ` ${correction.unit}` : ""}. Original: ${humanValue(correction.originalValue)}.`; article.append(corrected);
      if (!readOnlyCompleted) { const remove = actionButton("Удалить исправление", () => runOperation(() => reviewApi.removeCorrectionForProject(repository, projectId, correction.correctionId))); article.append(remove); }
    }
    const targetErrors = [...(validation.critical || []), ...(validation.nonCritical || [])].filter((entry) => entry.targetId === target.id);
    for (const validationIssue of targetErrors) { const error = document.createElement("p"); error.className = "form-error"; error.textContent = `Validation: ${validationIssue.code}`; article.append(error); }
    if (!readOnlyCompleted && target.category === "conflict" && target.conflictValues?.length) article.append(conflictSelect(target, decision));
    if (readOnlyCompleted) return article;
    const actions = document.createElement("div"); actions.className = "review-item-actions";
    actions.append(
      decisionButton("Принять", target, "accepted", article),
      actionButton("Исправить", () => openCorrection(target)),
      decisionButton("Отклонить", target, "rejected", article),
      decisionButton("Оставить нерешённым", target, "unresolved", article),
    );
    article.append(actions);
    if (target.targetKind === "finding") {
      const label = document.createElement("label"); label.textContent = "Комментарий к проблеме"; label.htmlFor = `note-${safeId(target.id)}`;
      const textarea = document.createElement("textarea"); textarea.id = label.htmlFor; textarea.className = "review-note"; textarea.maxLength = 500; textarea.value = note?.text || decision.comment || "";
      const save = actionButton("Сохранить комментарий", () => saveNote(target.id, textarea.value));
      article.append(label, textarea, save);
    }
    return article;
  }

  function revealConfirmationBlocker(guidance) {
    if (!guidance?.targetId) return;
    const article = byId(`review-target-${safeId(guidance.targetId)}`);
    if (!article) return;
    article.dataset.confirmationBlocker = "true";
    let parent = article.parentElement;
    while (parent) { if (parent.tagName === "DETAILS") parent.open = true; parent = parent.parentElement; }
  }

  function conflictSelect(target, decision) {
    const select = document.createElement("select"); select.className = "review-conflict-select"; select.setAttribute("aria-label", `Выбор значения для ${target.id}`);
    target.conflictValues.forEach((value, index) => { const option = document.createElement("option"); option.value = JSON.stringify(value); option.textContent = `Вариант ${index + 1}: ${humanValue(value)}`; if (decision.selectedValue !== null && JSON.stringify(decision.selectedValue) === option.value) option.selected = true; select.append(option); });
    return select;
  }

  function decide(target, decision, article) {
    const select = article.querySelector(".review-conflict-select");
    let selectedValue;
    if (select && decision === "accepted") { try { selectedValue = JSON.parse(select.value); } catch { selectedValue = select.value; } }
    const label = decision === "accepted" ? "Принять" : decision === "rejected" ? "Отклонить" : "Оставить нерешённым";
    return runOperation(
      () => reviewApi.decideForProject(repository, projectId, target.id, decision, { selectedValue }),
      { pending: `Сохраняем решение «${label}»…`, saved: `Решение «${label}» сохранено.` },
    );
  }

  function openCorrection(target) {
    correctionTargetId = target.id; ui.correctionTitle.textContent = `Исправить: ${target.id}`; ui.correctionOriginal.textContent = `Исходное значение: ${humanValue(target.originalValue)}`;
    ui.correctionType.replaceChildren(...target.allowedCorrections.map((type) => { const option = document.createElement("option"); option.value = type; option.textContent = correctionLabels[type] || type; return option; }));
    ui.correctionValue.value = ""; ui.correctionUnit.value = target.unit || ""; ui.correctionError.textContent = ""; ui.dialog.showModal(); ui.correctionValue.focus();
  }

  async function saveCorrection(event) {
    event.preventDefault();
    const type = ui.correctionType.value; const raw = ui.correctionValue.value.trim();
    try {
      const value = parseCorrection(type, raw);
      ui.dialog.close();
      await runOperation(() => reviewApi.correctForProject(repository, projectId, { targetId: correctionTargetId, type, correctedValue: value, unit: ui.correctionUnit.value.trim() || null }));
    } catch (error) { ui.correctionError.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Проверьте исправленное значение."}`; }
  }

  function parseCorrection(type, raw) {
    if (["stitch_count", "row_count", "repeat_count", "section_order", "tool_number", "yarn_weight"].includes(type)) return Number(raw);
    if (type === "range") { const parts = raw.split(/\s*[-–:]\s*/).map(Number); return { start: parts[0], end: parts[1] }; }
    if (type === "gauge") { const parts = raw.split(/\s*\/\s*/).map(Number); return { value: parts[0], per: parts[1] }; }
    if (type === "component_assignment") return { componentId: raw };
    return raw;
  }

  async function saveNote(targetId, note) {
    if (!note.trim()) return;
    await runOperation(async () => {
      const current = await reviewApi.ensureForProject(repository, projectId);
      const next = reviewApi.addUserNote(current.review, targetId, note);
      await repository.updatePatternTechnologyReview(projectId, current.calculation.calculation_id, next, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_NOTE_CHANGED", projectStage: `pattern_technology_review_${next.status}` });
      return reviewApi.inspectAggregate(await repository.getProject(projectId));
    });
  }

  function renderProvenance(entries) {
    ui.provenance.replaceChildren(...entries.map((entry) => { const node = document.createElement("p"); node.textContent = `${entry.id}: Stage 19 item ${entry.sourceReviewedItemId}; source ${entry.sourceSemanticAnalysisId}; evidence ${entry.evidenceFingerprint}.`; return node; }));
    if (!entries.length) ui.provenance.append(emptyNode("Provenance отсутствует."));
  }

  function renderValidation(validation) {
    ui.validation.hidden = false;
    renderIssueList(ui.validationCritical, validation.critical || [], "Критических проблем нет.");
    renderIssueList(ui.validationNonCritical, validation.nonCritical || [], "Некритических замечаний нет.");
    renderIssueList(ui.validationInformational, validation.informational || [], "Информационных сообщений нет.");
  }

  function renderIssueList(container, issues, empty) {
    const nodes = issues.map((entry) => { const node = document.createElement("li"); node.textContent = `${entry.code}${entry.targetId ? ` — ${entry.targetId}` : ""}`; return node; });
    if (!nodes.length) { const node = document.createElement("li"); node.textContent = empty; nodes.push(node); }
    container.replaceChildren(...nodes);
  }

  async function runOperation(operation, messages = {}) {
    if (busy) return;
    busy = true; ui.error.textContent = ""; setOperationStatus(messages.pending || "Сохраняем изменения…", "pending"); ui.workflow.setAttribute("aria-busy", "true"); setDisabled(true);
    try { inspected = await operation(); setOperationStatus(messages.saved || "Изменения сохранены.", "saved"); }
    catch (error) { ui.error.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`; setOperationStatus("Изменения не сохранены.", "failed"); inspected = await reviewApi.ensureForProject(repository, projectId); }
    finally { busy = false; ui.workflow.removeAttribute("aria-busy"); render(); }
  }

  function decisionButton(label, target, decision, article) {
    return decisionUi.createDecisionButton(document, { label, targetId: target.id, decision, disabled: busy, onActivate: () => decide(target, decision, article) });
  }
  function actionButton(label, handler) { const button = document.createElement("button"); button.type = "button"; button.className = "link-button"; button.textContent = label; button.disabled = busy; button.addEventListener("click", handler); return button; }
  function setOperationStatus(message, status) { ui.operationStatus.textContent = message; ui.operationStatus.dataset.status = status; }
  function setDisabled(value) { for (const button of [ui.start, ui.validate, ui.reopen, ui.newReview]) button.disabled = value; if (value) ui.confirm.disabled = true; for (const button of ui.items.querySelectorAll("button")) button.disabled = value; }
  function reset() { ui.fatal.hidden = true; ui.workflow.hidden = false; ui.executable.hidden = true; ui.summary.hidden = true; ui.items.hidden = true; ui.validation.hidden = true; ui.confirmed.hidden = true; ui.start.hidden = true; ui.validate.hidden = true; ui.confirm.hidden = true; ui.confirmGuidance.hidden = false; ui.confirmGuidance.textContent = ""; ui.confirmGuidance.removeAttribute("data-status"); ui.readOnlyNotice.hidden = true; ui.reopen.hidden = true; ui.newReview.hidden = true; ui.navPlan.hidden = true; }
  function renderBlocked(message) { reset(); ui.status.textContent = "Недоступно"; ui.status.dataset.status = "failed"; ui.source.textContent = message; ui.sourceRevision.textContent = "—"; ui.progress.textContent = "—"; ui.criticalCount.textContent = "—"; }
  function showFatal(message) { reset(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function statusLabel(status) { return ({ waiting: "Ожидает начала", reviewing: "Проверяется", needs_attention: "Требует внимания", confirmed: "Подтверждено", stale: "Источник устарел", failed: "Ошибка" })[status] || status; }
  function emptyNode(message) { const node = document.createElement("p"); node.textContent = message; return node; }
  function emptyText(group) { return ({ components: "Компоненты отсутствуют.", sections: "Секции отсутствуют.", operations: "Операции отсутствуют.", rows: "Ряды отсутствуют.", repeats: "Повторы отсутствуют.", stitches: "Изменения петель отсутствуют.", finishing: "Сборка и отделка отсутствуют.", abbreviations: "Сокращения отсутствуют.", assumptions: "Допущения отсутствуют.", missing: "Отсутствующие сведения не отмечены.", conflicts: "Конфликты не отмечены.", warnings: "Предупреждения отсутствуют." })[group] || "Нет элементов."; }
  function humanValue(value) { if (value === null || value === undefined || value === "") return "не указано"; if (Array.isArray(value)) return value.length ? value.map(humanValue).join(", ") : "нет"; if (typeof value === "object") return Object.keys(value).sort().filter((key) => !["evidence", "confidence", "provenanceRefs"].includes(key)).map((key) => `${key}: ${humanValue(value[key])}`).join("; "); return String(value); }
  function safeId(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, "-"); }
})(window);
