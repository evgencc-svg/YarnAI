"use strict";

(function initializeMaterialUnderstandingPage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const experience = globalObject.YarnAIMaterialUnderstandingExperience;
  const extractionApi = globalObject.YarnAIPatternContentExtraction;
  const semanticApi = globalObject.YarnAIPatternSemanticAnalysis;
  const reviewApi = globalObject.YarnAIPatternAnalysisReview;
  const readinessApi = globalObject.YarnAIProjectReadiness;
  const get = (selector) => document.querySelector(selector);
  const ui = {
    live: get("#understanding-live"), missingProject: get("#understanding-missing-project"),
    error: get("#understanding-error"), errorTitle: get("#understanding-error-title"),
    errorMessage: get("#understanding-error-message"), errorMaterials: get("#understanding-error-materials"), retry: get("#understanding-retry"),
    workflow: get("#understanding-workflow"), projectTitle: get("#understanding-project-title"),
    title: get("#understanding-title"), lead: get("#understanding-lead"),
    loading: get("#understanding-loading"), loadingCopy: get("#understanding-loading-copy"), content: get("#understanding-content"),
    materialsTop: get("#understanding-materials-top"), materialsBottom: get("#understanding-materials-bottom"),
    summaryTitle: get("#understanding-summary-title"), summaryDescription: get("#understanding-summary-description"), summaryTrust: get("#understanding-summary-trust"),
    confirmed: get("#understanding-confirmed"), confirmedEmpty: get("#understanding-confirmed-empty"),
    assumed: get("#understanding-assumed"), assumedEmpty: get("#understanding-assumed-empty"),
    missing: get("#understanding-missing"), missingEmpty: get("#understanding-missing-empty"),
    conflictsCard: get("#understanding-conflicts-card"), conflicts: get("#understanding-conflicts"),
    questionCard: get("#understanding-question-card"), questionForm: get("#understanding-question-form"), questionText: get("#understanding-question-text"), questionControl: get("#understanding-question-control"), questionSave: get("#understanding-question-save"), questionError: get("#understanding-question-error"),
    sources: get("#understanding-sources"), sourcesEmpty: get("#understanding-sources-empty"),
    correctionOpen: get("#understanding-correction-open"), correctionForm: get("#understanding-correction-form"), correctionField: get("#understanding-correction-field"), correctionValue: get("#understanding-correction-value"), correctionSave: get("#understanding-correction-save"), correctionCancel: get("#understanding-correction-cancel"), correctionError: get("#understanding-correction-error"),
    continueButton: get("#understanding-continue"), continueCopy: get("#understanding-continue-copy"), operationError: get("#understanding-operation-error"),
  };
  let repository = null;
  let projectId = "";
  let context = null;
  let viewModel = experience?.buildViewModel();
  let busy = false;
  let correctionReturnFocus = null;

  initialize().catch((error) => renderStorageError(error));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project") || "";
    bindEvents();
    if (!projectId || !system?.isUuidv7(projectId) || !experience) {
      render(experience?.buildViewModel({}) || null);
      return;
    }
    repository = new system.ProjectRepository();
    await repository.initialize();
    await loadContext();
    if (context.analysisState === "analyzer_stale" && semanticApi?.ensureForProject) {
      await semanticApi.ensureForProject(repository, projectId);
      await loadContext();
    }
    if (await reconcileSavedUnderstanding()) await loadContext();
    renderCurrent();
    if (needsFirstAnalysis()) await runFirstAnalysis();
  }

  function bindEvents() {
    get("#graded-fit-form").addEventListener("submit", saveFit);
    get("#graded-fit-form").addEventListener("input", () => {
      get("#graded-fit-result").replaceChildren();
      get("#graded-fit-message").textContent = "После изменения мерок сохрани расчёт снова.";
    });
    ui.questionForm.addEventListener("submit", saveAnswer);
    ui.correctionOpen.addEventListener("click", openCorrection);
    ui.correctionCancel.addEventListener("click", cancelCorrection);
    ui.correctionForm.addEventListener("submit", saveCorrection);
    ui.continueButton.addEventListener("click", confirmAndContinue);
    ui.retry.addEventListener("click", retryAnalysis);
    globalObject.addEventListener("pagehide", () => repository?.close());
  }

  async function loadContext() {
    const aggregate = await repository.getProject(projectId);
    const calculation = (aggregate.calculations || []).find((entry) => entry.calculation_id === aggregate.project.active_calculation_id) || null;
    const progressFor = (kind) => (aggregate.progress || []).filter((entry) => entry.calculation_id === calculation?.calculation_id && entry.epoch === 1 && entry.kind === kind);
    const one = (kind) => { const matches = progressFor(kind); return matches.length === 1 ? matches[0] : null; };
    const semanticProgress = one("PATTERN_SEMANTIC_ANALYSIS");
    const reviewProgress = one("PATTERN_ANALYSIS_REVIEW");
    const importProgress = one("PATTERN_IMPORT");
    const semanticInspection = semanticApi?.inspectAggregate(aggregate) || { state: semanticProgress?.state?.status || "missing", analysis: semanticProgress?.state || null };
    const intake = aggregate.project?.draft_input?.material_intake || {};
    const intent = calculation?.request?.project_intent || calculation?.request?.projectIntent || aggregate.project?.draft_input?.project_intent || null;
    const readiness = intent && readinessApi?.evaluateProjectReadiness ? readinessApi.evaluateProjectReadiness(intent) : null;
    context = {
      aggregate, project: aggregate.project, calculation, intent, readiness,
      semantic: semanticInspection.analysis, review: reviewProgress?.state || null,
      importState: importProgress?.state || null, purposes: intake.purposes || {},
      saved: aggregate.project?.draft_input?.material_understanding || null,
      semanticProgress, analysisState: semanticInspection.state,
    };
  }

  function needsFirstAnalysis() {
    if (!context?.importState || context.importState.status !== "completed") return false;
    if (context.semantic) return false;
    const base = (context.aggregate.progress || []).find((entry) => entry.kind === "PATTERN_ANALYSIS" && entry.calculation_id === context.calculation?.calculation_id && entry.epoch === 1);
    return Boolean(base?.state && ["waiting", "queued", "analyzing"].includes(base.state.status));
  }

  async function runFirstAnalysis() {
    if (busy || !extractionApi || !semanticApi) return;
    busy = true;
    showLoading("Читаем содержимое сохранённых материалов…");
    try {
      let extraction = extractionApi.inspectAggregate(context.aggregate);
      if (!extraction.extraction || extraction.extraction.status === "waiting") extraction = await extractionApi.runForProject(repository, projectId);
      if (!["completed", "partial"].includes(extraction.extraction?.status)) {
        await loadContext(); renderCurrent(); return;
      }
      showLoading("Собираем понятное описание без догадок сверх материалов…");
      let semantic = semanticApi.inspectAggregate(await repository.getProject(projectId));
      if (!semantic.analysis) semantic = await semanticApi.ensureForProject(repository, projectId);
      if (semantic.analysis?.status === "waiting") semantic = await semanticApi.runForProject(repository, projectId);
      if (semantic.analysis?.status === "completed") await ensureCurrentReview();
      await loadContext(); renderCurrent();
    } catch (error) {
      await loadContext().catch(() => {});
      renderCurrent(error?.userMessage || "Не удалось разобрать материалы.");
    } finally {
      busy = false;
      setInteractive(false);
      if (viewModel) ui.continueButton.disabled = !viewModel.continueAction.enabled;
    }
  }

  async function retryAnalysis() {
    if (busy || !context?.semantic || !semanticApi?.retryForProject) return;
    await runBusy(async () => {
      showLoading("Повторно проверяем сохранённые материалы…");
      const result = await semanticApi.retryForProject(repository, projectId);
      if (result.analysis?.status === "completed") await ensureCurrentReview();
      await loadContext(); renderCurrent();
    }, "Повторный разбор не выполнен.");
  }

  async function ensureCurrentReview() {
    if (!reviewApi?.ensureForProject) return;
    let inspected = await reviewApi.ensureForProject(repository, projectId);
    if (inspected.state === "stale" && reviewApi.rebaseForProject) inspected = await reviewApi.rebaseForProject(repository, projectId);
    return inspected;
  }

  function renderCurrent(operationMessage = "") {
    viewModel = experience.buildViewModel(context || {});
    render(viewModel);
    if (operationMessage) ui.operationError.textContent = operationMessage;
  }

  function render(model) {
    ui.missingProject.hidden = model?.state !== "missing_project";
    ui.error.hidden = model?.state !== "error";
    ui.workflow.hidden = !model || ["missing_project", "error"].includes(model.state);
    if (!model || model.state === "missing_project") return;
    ui.projectTitle.textContent = model.project?.title || "Проект";
    ui.title.textContent = model.heading;
    ui.lead.textContent = model.lead;
    setLinks(model.links.materials);
    if (model.state === "error") {
      ui.errorTitle.textContent = model.error?.title || model.heading;
      ui.errorMessage.textContent = model.error?.message || model.lead;
      ui.errorMaterials.href = model.links.materials;
      ui.retry.hidden = !canRetry();
      return;
    }
    ui.loading.hidden = model.state !== "loading";
    ui.content.hidden = model.state !== "ready";
    if (model.state === "loading") return;
    renderSummary(model);
    renderGradedSource();
    renderFacts(ui.confirmed, ui.confirmedEmpty, model.confirmed, false);
    renderFacts(ui.assumed, ui.assumedEmpty, model.assumed, true);
    renderMissing(model.missing);
    renderConflicts(model.conflicts);
    renderQuestion(model.nextQuestion);
    renderSources(model.sources);
    renderCorrectionFields(model.correctionFields);
    ui.continueButton.disabled = !model.continueAction.enabled || busy;
    ui.continueButton.textContent = model.continueAction.label;
    ui.continueCopy.textContent = model.continueAction.enabled ? "Понимание достаточно для следующего шага." : "Ответь на обязательный вопрос или устрани противоречие, чтобы продолжить.";
  }

  function renderGradedSource() {
    get("#graded-fit").hidden = true;
    const panel = get("#graded-source");
    panel.hidden = true;
    const analysis = context?.semantic?.result;
    const selectedSize = analysis?.sizing?.selectedSize;
    if (!selectedSize || !["completed", "partial"].includes(context.analysisState)) return;
    const extraction = extractionApi.inspectAggregate(context.aggregate).extraction;
    const sourceIds = analysis.evidenceDomains?.sourcePatternFileIds || [];
    const sources = (extraction?.result?.files || []).filter((file) => sourceIds.includes(file.sourceFileId) && file.extractionStatus === "extracted" && file.text);
    if (sources.length !== 1) return;
    const source = sources[0];
    const reading = globalObject.YarnAIPatternSourceInstructionEvidence.readGradedSource(source.text, selectedSize);
    if (!reading) return;
    const labels = { "NECK EDGE": "Горловина", YOKE: "Кокетка и реглан", "DIVIDING FOR BODY AND SLEEVES": "Разделение корпуса и рукавов", BODY: "Корпус и нижняя резинка", SLEEVES: "Рукава и манжеты" };
    get("#graded-source-title").textContent = `Авторские операции · ${selectedSize}`;
    const credit = reading.attribution;
    get("#graded-source-file").textContent = credit ? `${credit.title} · ${credit.author} · ${credit.number} · ${source.name}` : source.name;
    const uncertain = reading.sections.flatMap((section) => section.vectors).some((vector) => vector.selectionStatus !== "selected");
    get("#graded-source-status").textContent = uncertain
      ? "Число значений в некоторых группах отличается от числа размеров. Сверь эти группы с оригиналом."
      : `Показан столбец ${reading.order.indexOf(selectedSize) + 1} из ${reading.order.length}. Длины, общие числа и формулировки взяты из файла. Посадка и арифметика требуют отдельной проверки.`;
    get("#graded-source-sections").replaceChildren(...reading.sections.map((section) => {
      const detail = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = labels[section.heading] || section.heading;
      const paragraph = document.createElement("p");
      paragraph.style.whiteSpace = "pre-line";
      paragraph.textContent = section.projected;
      detail.append(summary, paragraph);
      return detail;
    }));
    const replay = globalObject.YarnAIPatternSourceInstructionEvidence.readTwoPhaseRaglan(reading);
    const gauge = analysis.gauge.entries.filter((g) => g.unit === "cm" && g.stitches > 0 && g.rows > 0);
    renderSourceReplay(replay, gauge.length === 1 ? gauge[0] : null);
    showFit(replay, gauge.length === 1 ? gauge[0] : null);
    panel.hidden = false;
  }

  function renderSourceReplay(replay, gauge) {
    const status = get("#graded-source-check");
    const steps = get("#graded-source-steps");
    steps.replaceChildren();
    if (!replay?.valid || !gauge) {
      status.textContent = "Баланс авторских операций пока не подтверждён.";
      return;
    }
    const f = replay.facts;
    const cm = (stitches) => (stitches * gauge.per / gauge.stitches).toFixed(1);
    const rows = (length) => Math.round(length * gauge.rows / gauge.per);
    status.textContent = `Баланс авторских операций проверен. Плотность лицевой глади — ${gauge.stitches} п. × ${gauge.rows} р. на ${gauge.per} см. Число кругов по длине приблизительное. При вязании ориентируйся на сантиметры.`;
    const lines = [
      `Горловина. Набери ${f.castOn} п. на спицы ${f.ribNeedle} мм и свяжи резинкой 1 × 1 ${f.neckCm} см. Отметь середину переда после ${f.midFrontMarker}-й петли. Отсюда измеряется высота кокетки.`,
      `Кокетка. Перейди на ${f.mainNeedle} мм. Выдели ${f.markers} петли реглана. Между ними по кругу — ${f.firstSleeve}, ${f.firstFront}, ${f.secondSleeve} и ${f.firstBack} п. Начало круга у правого плеча со стороны спинки.`,
      `В каждом втором круге прибавь по ${f.fullDelta} п., всего ${f.fullRepeats} раз. Получится ${f.midYoke} п. Затем прибавляй только на переде и спинке по ${f.bodyDelta} п. через круг ${f.bodyRepeats} раз. Получится ${f.endYoke} п. Вяжи до ${f.yokeCm} см от маркера середины переда, ориентир — ${rows(f.yokeCm)} кругов от маркера.`,
      `Разделение. Первая петля относится к спинке. Отложи ${f.leftHeld} п. рукава, набери ${f.leftUnderarm} п. подреза, провяжи ${f.front} п. переда. Отложи ${f.rightHeld} п. второго рукава, набери ${f.rightUnderarm} п. подреза и провяжи оставшиеся ${f.backRemainder} п. спинки. Корпус — ${f.bodyStart} п., около ${cm(f.bodyStart)} см по груди.`,
      `Через ${f.firstDecreaseCm} см после разделения убавь по петле с каждой стороны обоих боковых маркеров. Всего ${f.bodyDecreaseTimes} таких кругов с интервалом ${f.bodyIntervalCm} см. Останется ${f.preHem} п. Вяжи до ${f.hemStartCm} см от маркера переда.`,
      `Низ. На спицах ${f.hemNeedle} мм равномерно прибавь ${f.hemGain} п. в первом круге резинки. На ${f.hem} п. вяжи резинку 1 × 1 высотой ${f.hemCm} см и закрой по рисунку. Длина — ${f.frontLength} см от маркера или около ${f.shoulderLength} см от плеча.`,
      `Каждый рукав. На спицах ${f.sleeveNeedle} мм верни ${f.heldPickup} п. и подними ${f.pickup} п. из подреза. Начни круг в середине подреза. Всего ${f.sleeveStart} п. После ${f.sleevePlain} круга начни убавления. Убавь по ${f.fastLoss} п. через круг ${f.fastRepeats} раз, затем по ${f.slowLoss} п. каждые ${f.slowCm} см ${f.slowRepeats} раз. Останется ${f.preCuff} п.`,
      `На длине ${f.cuffStartCm} см от подреза перейди на ${f.cuffNeedle} мм. Равномерно прибавь ${f.cuffGain} п. в первом круге. Свяжи ${f.cuffCm} см резинкой 1 × 1 на ${f.cuff} п. и закрой по рисунку. Рукав от подреза — около ${f.sleeveLength} см.`,
    ];
    for (const line of lines) {
      const item = document.createElement("li");
      item.textContent = line;
      steps.append(item);
    }
  }

  let fitBinding = null;

  function showFit(replay, gauge) {
    const fit = get("#graded-fit");
    fitBinding = null;
    fit.hidden = !replay?.valid || !gauge;
    if (fit.hidden) return;
    const semantic = context.semantic;
    const key = JSON.stringify([semantic.sourceFingerprint, semantic.sourceExtractionRevision, semantic.result.sizing.selectedSize]);
    fitBinding = { key, replay, gauge, revision: context.project.revision };
    const saved = context.project.draft_input?.graded_body_fit;
    const form = get("#graded-fit-form");
    form.reset();
    get("#graded-fit-result").replaceChildren();
    get("#graded-fit-message").textContent = "";
    if (saved?.source === key) {
      for (const [name, value] of Object.entries(saved.input)) {
        if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value;
      }
      renderFitResult(saved.input);
    } else if (saved) {
      get("#graded-fit-message").textContent = "Источник или выбранный размер изменился. Проверь мерки и сохрани новый расчёт.";
    }
  }

  async function saveFit(event) {
    event.preventDefault();
    if (!fitBinding || busy) return;
    const form = event.currentTarget;
    const input = {};
    for (const el of form.elements) {
      if (el.name) input[el.name] = el.type === "number" ? el.valueAsNumber : el.value.trim();
    }
    const result = globalObject.YarnAIPatternTechnologyReview.planTwoPhaseBodyTaper(fitBinding.replay, fitBinding.gauge, input);
    const message = get("#graded-fit-message");
    if (!result?.options.length) {
      message.textContent = "Для этих размеров вариант не найден. Проверь грудь относительно авторской ширины, границы низа и доступную высоту сужения.";
      get("#graded-fit-result").replaceChildren();
      return;
    }
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const saved = { source: fitBinding.key, input };
      await repository.updateProject(projectId, { draft_input: { ...context.project.draft_input, graded_body_fit: saved } }, { baseRevision: fitBinding.revision });
      await loadContext();
      fitBinding.revision = context.project.revision;
      renderFitResult(input);
      message.textContent = "Предварительный расчёт сохранён в этом проекте.";
    } catch (error) {
      message.textContent = error?.userMessage || "Сохранить расчёт не удалось. Открой актуальную версию проекта.";
    } finally {
      button.disabled = false;
    }
  }

  function renderFitResult(input) {
    const { replay, gauge } = fitBinding;
    const f = replay.facts;
    const plan = globalObject.YarnAIPatternTechnologyReview.planTwoPhaseBodyTaper(replay, gauge, input);
    const panel = get("#graded-fit-result");
    panel.replaceChildren();
    if (!plan?.options.length) return;
    const add = (tag, text) => { const item = document.createElement(tag); item.textContent = text; panel.append(item); };
    add("h3", "Предварительная инструкция");
    add("p", `Мерки тела: грудь ${input.chest} см, уровень ремня ${input.belt} см, бёдра ${input.hips} см. Предложение: грудь ${input.finishedChest} см (прибавка ${plan.ease} см), низ ${input.minHem}–${input.maxHem} см.`);
    if (input.notes) add("p", input.notes);
    add("p", `Выполни горловину, обе серии реглана, разделение и оба рукава по авторским шагам выше. Начни корпус на ${f.bodyStart} петлях. Пример ниже использует авторскую длину ${f.shoulderLength} см от плеча и ${plan.bodyRounds} кругов глади от разделения до резинки. Первый круг после разделительного считай № 1.`);
    for (const option of plan.options) {
      add("p", `Вариант ${option.width.toFixed(1)} см по глади перед резинкой. В кругах ${option.rounds.join(", ")} убавляй по одной петле с каждой стороны двух боковых маркеров (минус ${f.bodyLoss} п.). В остальных кругах вяжи прямо до круга ${plan.bodyRounds} включительно. Всего убавлено ${option.totalRemoved} п., на ${option.extraRemoved} больше авторского. Остаток ${option.plain} п. вместо ${f.preHem}. На спицах ${f.hemNeedle} мм равномерно прибавь ${option.gain} п. в первом круге резинки 1 × 1: ${option.rib} п. вместо ${f.hem}. Довяжи до ${f.hemCm} см и закрой по рисунку.`);
    }
    add("p", "Число петель резинки рассчитано по авторскому отношению петель резинки к глади и округлено до чётного. Фактический обхват нижнего края зависит от пряжи и плотности резинки после стирки.");
    add("p", "Для проверки посадки нужны ширина плеч, обхват верхней части руки, длина руки от подмышки и обхват живота в самом широком месте. Отметь желаемый край чуть ниже ремня, измерь обхват тела на этой высоте и расстояние до края от верхней точки плеча. Для проверки реглана измерь глубину до подмышки на удобном свитере. Нужны также измеренный образец глади и резинки и выбранная ширина низа. Схема сужения по высоте изменится, если изменится длина.");
  }

  function renderSummary(model) {
    ui.summaryTitle.textContent = model.summary.title;
    ui.summaryDescription.textContent = model.summary.description;
    ui.summaryDescription.hidden = !model.summary.description;
    ui.summaryTrust.textContent = model.summary.trustLabel;
    ui.summaryTrust.dataset.trust = model.summary.trust;
  }

  function renderFacts(list, empty, items, assumed) {
    list.replaceChildren(...items.map((item) => {
      const row = document.createElement("li");
      const label = document.createElement("span"); label.className = "fact-label"; label.textContent = item.label;
      const value = document.createElement("span"); value.textContent = assumed ? assumptionText(item.value) : item.value;
      row.append(label, value); return row;
    }));
    empty.hidden = items.length > 0;
  }

  function assumptionText(value) { return /^похоже|^возможно/i.test(value) ? value : `Похоже, ${lowerFirst(value)}`; }

  function renderMissing(items) {
    ui.missing.replaceChildren(...items.map((item) => { const row = document.createElement("li"); row.textContent = item.label; return row; }));
    ui.missingEmpty.hidden = items.length > 0;
  }

  function renderConflicts(items) {
    ui.conflictsCard.hidden = items.length === 0;
    ui.conflicts.replaceChildren(...items.map((item) => { const row = document.createElement("li"); row.textContent = item.message; return row; }));
  }

  function renderQuestion(question) {
    ui.questionCard.hidden = !question;
    ui.questionError.textContent = "";
    ui.questionControl.replaceChildren();
    if (!question) return;
    ui.questionText.textContent = question.text;
    if (question.options.length) {
      const wrapper = document.createElement("div"); wrapper.className = "radio-list";
      const options = [...question.options];
      if (!options.includes("Не уверена")) options.push("Не уверена");
      options.forEach((value, index) => {
        const label = document.createElement("label"); label.className = "radio-option";
        const input = document.createElement("input"); input.type = "radio"; input.name = "answer"; input.value = value; input.required = question.required; if (index === 0) input.id = "understanding-answer-first";
        const copyNode = document.createElement("span"); copyNode.textContent = value;
        label.append(input, copyNode); wrapper.append(label);
      });
      ui.questionControl.append(wrapper);
    } else {
      const control = question.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
      if (control instanceof HTMLInputElement) control.type = question.type === "number" ? "number" : "text";
      control.id = "understanding-answer"; control.name = "answer"; control.required = question.required; control.maxLength = 500;
      ui.questionControl.append(control);
    }
  }

  function renderSources(items) {
    ui.sources.replaceChildren(...items.map((item) => { const row = document.createElement("li"); row.textContent = item.label; return row; }));
    ui.sourcesEmpty.hidden = items.length > 0;
  }

  function renderCorrectionFields(items) {
    const selected = ui.correctionField.value;
    ui.correctionField.replaceChildren(...items.map((item) => { const option = document.createElement("option"); option.value = item.field; option.textContent = item.label; return option; }));
    if (items.some((item) => item.field === selected)) ui.correctionField.value = selected;
  }

  async function saveAnswer(event) {
    event.preventDefault();
    if (busy || !viewModel.nextQuestion) return;
    const answer = new FormData(ui.questionForm).get("answer")?.toString().trim() || "";
    if (!experience.validAnswer(viewModel.nextQuestion, answer)) { ui.questionError.textContent = "Добавь однозначный допустимый ответ перед сохранением."; return; }
    await runBusy(async () => {
      const reviewItem = findReviewItem(viewModel.nextQuestion.field);
      if (reviewItem && context.review?.status !== "confirmed" && reviewApi?.updateItem && reviewApi?.saveForProject) {
        const edited = reviewApi.updateItem(context.review, reviewItem.itemId, {
          reviewedValue: experience.reviewValueForAnswer(viewModel.nextQuestion.field, answer),
          decision: "corrected",
        });
        await reviewApi.saveForProject(repository, projectId, edited);
      } else {
        const saved = experience.recordAnswer(context.saved, viewModel.nextQuestion, answer);
        await saveUnderstanding(saved);
      }
      await loadContext(); renderCurrent();
      ui.live.textContent = "Ответ сохранён. Понимание проекта обновлено.";
      (ui.questionCard.hidden ? ui.summaryTitle : ui.questionText).focus?.();
    }, "Не удалось сохранить ответ.");
  }

  function openCorrection() {
    correctionReturnFocus = document.activeElement;
    ui.correctionForm.hidden = false;
    ui.correctionError.textContent = "";
    ui.correctionValue.value = "";
    ui.correctionField.focus();
  }

  function cancelCorrection() {
    ui.correctionForm.hidden = true;
    ui.correctionError.textContent = "";
    correctionReturnFocus?.focus?.();
  }

  async function saveCorrection(event) {
    event.preventDefault();
    const field = ui.correctionField.value;
    const value = ui.correctionValue.value.trim();
    if (!value) { ui.correctionError.textContent = "Напиши, как будет верно."; return; }
    await runBusy(async () => {
      const reviewItem = findReviewItem(field);
      if (reviewItem && context.review?.status !== "confirmed" && reviewApi?.updateItem && reviewApi?.saveForProject) {
        const edited = reviewApi.updateItem(context.review, reviewItem.itemId, { reviewedValue: value, decision: "corrected" });
        await reviewApi.saveForProject(repository, projectId, edited);
      } else {
        const saved = experience.recordCorrection(context.saved, field, value);
        await saveUnderstanding(saved);
      }
      await loadContext(); renderCurrent(); cancelCorrection();
      ui.live.textContent = "Исправление сохранено как ответ пользователя.";
      ui.summaryTitle.focus?.();
    }, "Не удалось сохранить исправление.");
  }

  function findReviewItem(field) {
    return experience.reviewItemForField(context.review, field);
  }

  async function reconcileSavedUnderstanding() {
    if (!context.review || context.review.status === "confirmed" || !reviewApi?.updateItem || !reviewApi?.saveForProject) return false;
    const saved = experience.normalizeSaved(context.saved);
    const latestByField = new Map([...saved.answers, ...saved.corrections].map((entry) => [entry.field, entry]));
    let next = context.review;
    let changed = false;
    for (const entry of latestByField.values()) {
      const item = experience.reviewItemForField(next, entry.field);
      if (!item) continue;
      const reviewedValue = experience.reviewValueForAnswer(entry.field, entry.value);
      if (item.decision === "corrected" && JSON.stringify(item.reviewedValue) === JSON.stringify(reviewedValue)) continue;
      next = reviewApi.updateItem(next, item.itemId, { reviewedValue, decision: "corrected" });
      changed = true;
    }
    if (changed) await reviewApi.saveForProject(repository, projectId, next);
    return changed;
  }

  async function saveUnderstanding(saved) {
    const draft = context.project?.draft_input && typeof context.project.draft_input === "object" ? context.project.draft_input : {};
    await repository.updateProject(projectId, { draft_input: { ...draft, material_understanding: saved } });
  }

  async function confirmAndContinue() {
    if (busy || !viewModel.continueAction.enabled) return;
    await runBusy(async () => {
      if (!context.review && context.semantic?.status === "completed" && reviewApi.ensureForProject) {
        await reviewApi.ensureForProject(repository, projectId);
        await loadContext();
      }
      globalObject.location.assign(viewModel.continueAction.href);
    }, "Не удалось открыть проверку проекта.");
  }

  async function runBusy(operation, fallback) {
    if (busy) return;
    busy = true; setInteractive(true); ui.operationError.textContent = "";
    try { await operation(); }
    catch (error) { ui.operationError.textContent = error?.userMessage || error?.message || fallback; }
    finally { busy = false; setInteractive(false); if (viewModel) ui.continueButton.disabled = !viewModel.continueAction.enabled; }
  }

  function setInteractive(disabled) { [ui.questionSave, ui.correctionSave, ui.correctionCancel, ui.continueButton, ui.retry].forEach((control) => { control.disabled = disabled; }); }
  function setLinks(href) { ui.materialsTop.href = href; ui.materialsBottom.href = href; ui.errorMaterials.href = href; }
  function showLoading(copy) { ui.workflow.hidden = false; ui.error.hidden = true; ui.missingProject.hidden = true; ui.loading.hidden = false; ui.content.hidden = true; ui.title.textContent = "Разбираем материалы"; ui.lead.textContent = "Результат появится сразу после реальной проверки сохранённых источников."; ui.loadingCopy.textContent = copy; }
  function canRetry() { return ["failed", "partial"].includes(context?.semantic?.status) && Boolean(semanticApi?.retryForProject); }
  function renderStorageError(error) { const model = experience?.buildViewModel({ project: context?.project || { project_id: projectId }, storageError: true }) || null; render(model); if (model) ui.errorMessage.textContent = error?.userMessage || model.lead; }
  function lowerFirst(value) { const text = String(value || ""); return text ? text[0].toLowerCase() + text.slice(1) : text; }
})(window);
