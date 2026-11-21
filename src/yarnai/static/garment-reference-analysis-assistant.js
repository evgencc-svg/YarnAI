"use strict";

(function initializeGarmentReferenceAssistant(globalObject) {
  if (typeof document === "undefined") return;
  const projectSystem = globalObject.YarnAIProjectSystem;
  const domain = globalObject.YarnAIGarmentReferenceAnalysis;
  const intakeDomain = globalObject.YarnAIManualCalculationIntake;
  const byId = (id) => document.getElementById(id);
  const ui = {
    root: byId("garment-reference-root"), loading: byId("loading"), blocked: byId("blocked"), blockedMessage: byId("blocked-message"), content: byId("content"),
    projectTitle: byId("project-title"), provider: byId("provider-state"), photoGrid: byId("photo-grid"), photoStatus: byId("photo-status"), photoInput: byId("add-reference-photo"),
    pilotReadiness: byId("pilot-readiness"), pilotPhoto: byId("pilot-photo"), pilotConfirm: byId("pilot-confirm"), runPilot: byId("run-real-analysis"), pilotPreparation: byId("pilot-preparation"),
    stale: byId("stale-panel"), observations: byId("observations"), inferences: byId("inferences"), unknowns: byId("unknowns"), questions: byId("questions"),
    clarificationForm: byId("clarification-form"), clarificationType: byId("clarification-type"), clarificationText: byId("clarification-text"), savedClarifications: byId("saved-clarifications"),
    options: byId("technology-options"), optionsIntro: byId("options-intro"), decisionConfirmation: byId("decision-confirmation"), decisionConfirmationSummary: byId("decision-confirmation-summary"), confirmTechnology: byId("confirm-technology"), changePanel: byId("change-panel"), changeComment: byId("change-comment"), saveChange: byId("save-change-request"), reject: byId("reject-options"),
    decisionTitle: byId("decision-title"), decisionSummary: byId("decision-summary"), changeTechnologyChoice: byId("change-technology-choice"),
    intakeMessage: byId("manual-intake-message"), openIntake: byId("open-manual-intake"), error: byId("form-error"),
  };
  let repository = null;
  let projectId = null;
  let inspected = null;
  let configuration = { provider: "openai", model: "gpt-5.6-terra", enabled: false, pilotReady: false, pilotRequestId: null, message: "Реальный анализ ещё не запускался." };
  let changeOptionId = null;
  let busy = false;
  const previews = new Map();

  bind();
  initialize().catch((error) => block(userMessage(error, "Не удалось открыть сохранённый проект по фотографии.")));

  async function initialize() {
    if (!projectSystem || !domain) throw new Error("DOMAIN_UNAVAILABLE");
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId || !projectSystem.isUuidv7(projectId)) throw new Error("PROJECT_INVALID");
    repository = new projectSystem.ProjectRepository();
    await repository.initialize();
    inspected = await domain.ensureForProject(repository, projectId);
    if (intakeDomain?.reconcileForProject) {
      await intakeDomain.reconcileForProject(repository, projectId);
      inspected = await domain.ensureForProject(repository, projectId);
    }
    configuration = await readConfiguration();
    if (!configuration.enabled && inspected.state.source.referencePhotos.length && !inspected.state.analysis && inspected.state.status !== "provider_disabled") {
      inspected = await domain.markProviderDisabledForProject(repository, projectId, configuration);
    }
    await hydratePreviews();
    render();
    await renderLocalPilotPreparation();
  }

  async function renderLocalPilotPreparation() {
    const query = new URLSearchParams(globalObject.location.search);
    const exactLocalMode = query.get("pilotPreparation") === "local"
      && globalObject.location.hostname === "127.0.0.1"
      && globalObject.location.port === "8023";
    if (!exactLocalMode || inspected.state.source.referencePhotos.length !== 1) return;
    const selected = inspected.state.source.referencePhotos[0];
    const record = await repository.getPhoto(projectId, selected.photoId);
    const prepared = await domain.preparePilotPhoto(inspected.state, record);
    const summary = {
      project_id: inspected.project.project_id,
      project_revision: inspected.state.source.projectRevision,
      photo_id: prepared.source_photo_id,
      original_sha256: prepared.source_photo_sha256,
      sanitized_sha256: prepared.sanitized.sha256,
      sanitized_width: prepared.sanitized.width,
      sanitized_height: prepared.sanitized.height,
      sanitized_byte_size: prepared.sanitized.bytes.byteLength,
      provider: domain.DEFAULT_PROVIDER,
      model: domain.DEFAULT_MODEL,
      hard_maximum_usd: "0.05",
      retries: 0,
      store: false,
      tools: [],
      exact_payload_hash_verified: true,
    };
    ui.pilotPreparation.textContent = JSON.stringify(summary);
    ui.pilotPreparation.hidden = false;
  }

  function bind() {
    ui.photoInput.addEventListener("change", async () => {
      const files = [...(ui.photoInput.files || [])]; ui.photoInput.value = "";
      if (!files.length) return;
      await mutate(async () => { inspected = await domain.addPhotosForProject(repository, projectId, files); await hydratePreviews(); }, "Не удалось сохранить дополнительную фотографию.");
    });
    ui.clarificationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = ui.clarificationText.value.trim();
      if (!text) return showError("Напиши ответ или желаемое изменение.");
      await mutate(async () => {
        inspected = await domain.recordClarificationForProject(repository, projectId, { type: ui.clarificationType.value, text });
        ui.clarificationText.value = "";
      }, "Не удалось сохранить ответ.");
    });
    ui.saveChange.addEventListener("click", async () => {
      const comment = ui.changeComment.value.trim();
      if (!changeOptionId || !comment) return showError("Напиши, что изменить в выбранном варианте.");
      await saveDecision({ status: "needs_changes", optionId: changeOptionId, comment });
      changeOptionId = null; ui.changeComment.value = ""; ui.changePanel.hidden = true;
    });
    ui.reject.addEventListener("click", () => saveDecision({ status: "rejected", optionId: null, comment: "Предложенные варианты отклонены пользователем." }));
    ui.confirmTechnology.addEventListener("click", async () => {
      const choice = byId("construction-choice-panel").hidden ? "" : byId("construction-choice").value;
      if (!byId("construction-choice-panel").hidden && !choice) return showError("Выбери, как использовать этот вариант.");
      await mutate(async () => { inspected = await domain.confirmDecisionForProject(repository, projectId, choice === "seamed_set_in_sleeve" ? { constructionIdentity: choice } : {}); }, "Не удалось подтвердить выбранную технологию.");
    });
    byId("construction-choice").addEventListener("change", () => { ui.confirmTechnology.disabled = !byId("construction-choice").value; });
    ui.changeTechnologyChoice.addEventListener("click", async () => {
      await mutate(async () => { inspected = await domain.reopenDecisionForProject(repository, projectId); }, "Не удалось снять подтверждение.");
    });
    ui.pilotConfirm.addEventListener("change", renderPilotReadiness);
    ui.pilotPhoto.addEventListener("change", renderPilotReadiness);
    ui.runPilot.addEventListener("click", runPilot);
    globalObject.addEventListener("beforeunload", releasePreviews);
  }

  async function readConfiguration() {
    try {
      const response = await globalObject.fetch("/api/v1/garment-reference-analyses/configuration", { headers: { Accept: "application/json" } });
      if (!response.ok) return configuration;
      const payload = await response.json();
      const normalized = domain.normalizeProviderConfiguration({ provider: payload.provider, model: payload.model, enabled: payload.enabled === true });
      return { ...normalized, pilotReady: payload.pilot_ready === true, pilotRequestId: typeof payload.pilot_request_id === "string" ? payload.pilot_request_id : null, userTestToken: typeof payload.user_test_token === "string" ? payload.user_test_token : null, message: typeof payload.message === "string" ? payload.message : configuration.message, dataNotice: typeof payload.data_notice === "string" ? payload.data_notice : "" };
    } catch { return configuration; }
  }

  async function runPilot() {
    if (!configuration.pilotReady || !configuration.pilotRequestId || !ui.pilotConfirm.checked) return showError("Платный запуск не разрешён или фотография не подтверждена.");
    const photoId = ui.pilotPhoto.value;
    const selected = inspected.state.source.referencePhotos.find((photo) => photo.photoId === photoId);
    if (!selected) return showError("Выбери фотографию для одного контролируемого анализа.");
    await mutate(async () => {
      const record = await repository.getPhoto(projectId, photoId);
      const request = await domain.buildPilotServerRequest(inspected.state, record, { requestId: configuration.pilotRequestId, userConfirmed: true });
      const headers = { "Content-Type": "application/json", Accept: "application/json" };
      if (configuration.userTestToken) headers["X-YarnAI-User-Test-Token"] = configuration.userTestToken;
      const response = await globalObject.fetch("/api/v1/garment-reference-analyses", {
        method: "POST", headers, body: JSON.stringify(request),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw { userMessage: payload?.error?.message || "Реальный анализ не выполнен. Автоматического повтора не будет." };
      inspected = await domain.applyPilotProviderResponseForProject(repository, projectId, payload, configuration, { requestId: configuration.pilotRequestId });
      ui.pilotConfirm.checked = false;
      configuration = { ...configuration, pilotReady: false, pilotRequestId: null, message: "Одноразовое разрешение использовано." };
    }, "Реальный анализ не выполнен. Автоматического повтора не будет.");
  }

  async function saveDecision(decision) {
    await mutate(async () => { inspected = await domain.decideForProject(repository, projectId, decision); }, "Не удалось сохранить решение.");
  }

  async function mutate(operation, fallback) {
    if (busy) return;
    busy = true; ui.root.setAttribute("aria-busy", "true"); showError("");
    try {
      await operation();
      if (intakeDomain?.reconcileForProject) {
        await intakeDomain.reconcileForProject(repository, projectId);
        inspected = await domain.ensureForProject(repository, projectId);
      }
      render();
    }
    catch (error) { showError(userMessage(error, fallback)); }
    finally { busy = false; ui.root.setAttribute("aria-busy", "false"); }
  }

  function render() {
    const state = inspected.state;
    const fixtureMarker = new URLSearchParams(globalObject.location.search).get("fixture");
    const isDeterministicFixture = fixtureMarker === "garment-reference-v1"
      && inspected.project.title.startsWith("TEST ONLY —")
      && ["127.0.0.1", "localhost"].includes(globalObject.location.hostname)
      && globalObject.location.port !== "8000";
    ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false;
    ui.root.setAttribute("aria-busy", "false"); ui.projectTitle.textContent = projectTitleLabel(inspected.project.title);
    ui.provider.textContent = isDeterministicFixture
      ? "ТЕСТОВЫЙ ЭКРАН — детерминированный пример без подключения реального провайдера анализа изображений."
      : state.provider.enabled
      ? "Автоматический анализ доступен на сервере."
      : configuration.message || `Реальный анализ ещё не запускался. ${domain.DISABLED_MESSAGE}`;
    ui.stale.hidden = state.status !== "stale";
    renderPhotos(state); renderPilotReadiness(); renderBrief(state); renderClarifications(state); renderOptions(state); renderDecision(state); renderIntakeGate(state);
  }

  function renderPhotos(state) {
    const photos = state.source.referencePhotos;
    ui.photoGrid.replaceChildren(...photos.map((photo) => {
      const figure = document.createElement("figure"); figure.className = "photo-card";
      const image = document.createElement("img"); image.alt = `Фотография изделия: ${photo.displayName}`; image.src = previews.get(photo.photoId) || "";
      const caption = document.createElement("figcaption"); caption.textContent = photo.displayName;
      figure.append(image, caption); return figure;
    }));
    ui.photoStatus.textContent = `${photos.length} ${photos.length === 1 ? "фотография сохранена" : "фотографии сохранены"}. Фотографии изделия не используются как подтверждение выполненного шага.`;
    const selected = ui.pilotPhoto.value;
    ui.pilotPhoto.replaceChildren(...(photos.length ? photos.map((photo) => { const option = document.createElement("option"); option.value = photo.photoId; option.textContent = photo.displayName; return option; }) : [new Option("Сначала добавь фотографию", "")]));
    if (photos.some((photo) => photo.photoId === selected)) ui.pilotPhoto.value = selected;
  }

  function renderPilotReadiness() {
    const hasPhotos = inspected?.state?.source?.referencePhotos?.length > 0;
    const hasAnalysis = Boolean(inspected?.state?.analysis) && inspected.state.status !== "stale";
    const ready = configuration.pilotReady && Boolean(configuration.pilotRequestId) && hasPhotos;
    byId("pilot-title").textContent = hasAnalysis ? "Разбор фотографии сохранён" : "Анализ фотографии";
    ui.pilotPhoto.disabled = !ready;
    ui.pilotConfirm.disabled = !ready;
    ui.runPilot.disabled = !(ready && ui.pilotPhoto.value && ui.pilotConfirm.checked);
    ui.pilotReadiness.textContent = ready
      ? "Сервер подготовлен к одному запросу. Выбери точную фотографию и отдельно подтверди отправку её очищенной копии."
      : hasAnalysis
        ? "Сохранённый разбор показан ниже. Разрешение на новый запрос не активно; автоматической повторной отправки нет."
        : "Для нового запроса нет активного подключения или одноразового разрешения. Автоматической отправки фотографии нет.";
  }

  function renderBrief(state) {
    const analysis = state.status === "stale" ? null : state.analysis;
    renderCollection(ui.observations, analysis?.visibleObservations, (item) => briefItem(item.value, item.explanation, "На фотографии видно"), "Автоматических наблюдений пока нет. Фотографии сохранены локально.");
    renderCollection(ui.inferences, analysis?.inferences, (item) => briefItem(item.value, `${item.whyPlausible} Чтобы проверить: ${item.confirmOrReject}`, `${analysis.pilotSchemaVersion === 1 ? "Уверенность модели" : "Неопределённость"}: ${uncertaintyLabel(item.uncertainty)}`), "Предположения не создаются без ответа сервера анализа изображений.");
    renderCollection(ui.unknowns, analysis?.unknowns, (item) => briefItem(humanField(item.field), item.explanation, "По этому фото нельзя определить"), "Без автоматического анализа YarnAI не придумывает скрытую конструкцию, состав пряжи, плотность, петли или ряды.");
    renderCollection(ui.questions, analysis?.questions, (item) => {
      const card = document.createElement("div"); card.className = "question"; const strong = document.createElement("strong"); strong.textContent = item.text; const p = document.createElement("p"); p.textContent = item.reason; card.append(strong, p); return card;
    }, state.provider.enabled ? "Уточняющих вопросов нет." : "Чтобы получить вопросы по конкретному изделию, нужен подключённый сервер анализа изображений. Пока можно сохранить свои пояснения ниже.");
  }

  function renderClarifications(state) {
    ui.savedClarifications.replaceChildren(...state.clarifications.map((entry) => {
      const card = document.createElement("div"); card.className = "saved-answer"; card.textContent = `${clarificationLabel(entry.type)}: ${entry.text}`; return card;
    }));
  }

  function renderOptions(state) {
    const analysis = state.status === "stale" ? null : state.analysis;
    const options = analysis?.technologyOptions || [];
    ui.optionsIntro.textContent = options.length
      ? "Я предлагаю связать похожую вещь следующими способами. Это авторские технологии, а не восстановленная коммерческая схема."
      : state.provider.enabled ? "Актуальные варианты ещё не получены." : "Варианты не создаются без реального ответа сервера анализа изображений.";
    ui.options.replaceChildren(...(options.length ? options.map((option) => optionCard(option, state)) : [emptyCard("После валидного анализа здесь появятся от одного до трёх реально отличающихся способов вязания.")]));
    ui.reject.hidden = !options.length;
    const draft = state.ownerDecision.status === "draft"
      ? options.find((option) => option.optionId === state.ownerDecision.optionId)
      : null;
    ui.decisionConfirmation.hidden = !options.length || state.ownerDecision.status === "confirmed";
    const needsConstructionChoice = !!draft && !["Вязание отдельными деталями с втачным рукавом", "Вязание сверху вниз с рукавами реглан", "Промышленное вязание деталей точно по форме"].includes(draft.name);
    const constructionChoice = byId("construction-choice");
    if (constructionChoice.dataset.optionId !== draft?.optionId) constructionChoice.value = "";
    constructionChoice.dataset.optionId = draft?.optionId || "";
    byId("construction-choice-panel").hidden = !needsConstructionChoice;
    ui.confirmTechnology.disabled = !draft || (needsConstructionChoice && !constructionChoice.value);
    ui.decisionConfirmationSummary.textContent = draft
      ? `Будет принят вариант «${draft.name}». Проверь карточку и подтверди решение отдельной кнопкой.`
      : "Сначала выбери один вариант. До этого подтверждение недоступно.";
  }

  function optionCard(option, state) {
    const article = document.createElement("article"); article.className = "technology-card";
    const isDraft = state.ownerDecision.status === "draft" && state.ownerDecision.optionId === option.optionId;
    const isConfirmed = state.ownerDecision.status === "confirmed" && state.ownerDecision.optionId === option.optionId;
    if (isDraft) article.classList.add("selected-draft");
    const title = document.createElement("h3"); title.textContent = option.name;
    const summary = document.createElement("p"); summary.textContent = option.constructionSummary;
    const facts = document.createElement("dl"); facts.className = "technology-facts";
    [
      ["Направление", option.knittingDirection], ["Швы", option.seamMode], ["Формирование", option.shapingApproach],
      ["Визуальное сходство", option.expectedVisualSimilarity], ["Сложность", option.difficultyExplanation],
    ].forEach(([label, value]) => facts.append(definition(label, value)));
    article.append(title, summary, facts, listSection("Основные части", option.majorComponents), listSection("Пряжа по свойствам", option.yarnCharacteristics), listSection("Понадобится", option.toolsAndTechniques), listSection("Плюсы", option.advantages), listSection("Риски", option.risks), listSection("Что ещё нужно до расчётов", option.missingInputsBeforeCalculation));
    if (option.deliberateDifferences.length) article.append(listSection("Сознательные отличия", option.deliberateDifferences));
    const actions = document.createElement("div"); actions.className = "option-actions";
    const select = actionButton(isDraft ? "Выбрано для подтверждения" : "Выбрать этот вариант", async () => {
      await mutate(async () => { inspected = await domain.selectDraftForProject(repository, projectId, option.optionId); }, "Не удалось сохранить черновик выбора.");
    });
    select.disabled = isDraft || state.ownerDecision.status === "confirmed";
    select.setAttribute("aria-pressed", String(isDraft || isConfirmed));
    const change = actionButton("Попросить изменить", () => { changeOptionId = option.optionId; ui.changePanel.hidden = false; ui.changeComment.focus(); });
    const questions = actionButton("Вернуться к вопросам", () => { document.getElementById("questions-panel").scrollIntoView({ behavior: "smooth" }); });
    actions.append(select, change, questions); article.append(actions); return article;
  }

  function renderDecision(state) {
    const decision = state.ownerDecision;
    const selected = state.analysis?.technologyOptions.find((option) => option.optionId === decision.optionId);
    const labels = {
      awaiting_decision: ["Решение ещё не принято", "Можно выбрать вариант, попросить изменения или вернуться к вопросам."],
      draft: ["Выбор ещё не подтверждён", selected ? `Для подтверждения выбран вариант «${selected.name}». До подтверждения его можно свободно сменить.` : "Выбери один из вариантов выше."],
      confirmed: ["Технология подтверждена", selected ? `Принят вариант «${selected.name}». Решение актуально и готово к передаче следующему этапу.` : "Подтверждённый вариант сохранён."],
      selected: ["Нужно повторное подтверждение", selected ? `Ранее был выбран вариант «${selected.name}», но он не считается готовым без явного подтверждения.` : "Ранее сохранённый выбор требует повторного подтверждения."],
      needs_changes: ["Нужны изменения", decision.comment || "Просьба об изменении сохранена."],
      rejected: ["Варианты отклонены", decision.comment || "Можно добавить фото или пояснения и запросить новый анализ позже."],
    };
    [ui.decisionTitle.textContent, ui.decisionSummary.textContent] = labels[decision.status] || labels.awaiting_decision;
    if (decision.constructionIdentity === "seamed_set_in_sleeve") ui.decisionSummary.textContent += " Ты отдельно выбрала адаптацию в прямое поло снизу вверх: перед, спинка и втачные рукава вяжутся отдельно и соединяются швами.";
    ui.changeTechnologyChoice.hidden = !["confirmed", "selected"].includes(decision.status);
  }

  function renderIntakeGate(state) {
    ui.openIntake.hidden = true;
    ui.openIntake.removeAttribute("href");
    const handoff = domain.technologyDecisionHandoff(state);
    const route = intakeDomain?.classifyTechnologyHandoff?.(handoff) || "not_confirmed";
    if (route === "manual") {
      ui.intakeMessage.textContent = "Технология подтверждена. Здесь можно ввести или открыть сохранённые мерки, пряжу и образец. Для прямого поло из отдельных деталей после подтверждения формы и отделки доступен пошаговый план вязания.";
      ui.openIntake.href = `/manual-calculation-intake?project=${encodeURIComponent(projectId)}`;
      ui.openIntake.hidden = false;
      return;
    }
    if (route === "industrial") {
      ui.intakeMessage.textContent = intakeDomain.INDUSTRIAL_MESSAGE;
      return;
    }
    ui.intakeMessage.textContent = "Переход появится только после отдельного подтверждения одного из двух ручных способов вязания.";
  }

  async function hydratePreviews() {
    for (const photo of inspected.state.source.referencePhotos) {
      if (previews.has(photo.photoId)) continue;
      try { const stored = await repository.getPhoto(projectId, photo.photoId); if (stored?.blob) previews.set(photo.photoId, globalObject.URL.createObjectURL(stored.blob)); }
      catch { /* The metadata remains visible; missing binary is not fabricated. */ }
    }
  }

  function renderCollection(container, values, renderer, emptyText) { container.replaceChildren(...((values || []).length ? values.map(renderer) : [emptyCard(emptyText)])); }
  function briefItem(titleText, bodyText, metaText) { const card = document.createElement("div"); card.className = "brief-item"; const title = document.createElement("strong"); title.textContent = titleText; const body = document.createElement("p"); body.textContent = bodyText; const meta = document.createElement("small"); meta.textContent = metaText; card.append(title, body, meta); return card; }
  function emptyCard(text) { const card = document.createElement("div"); card.className = "empty"; card.textContent = text; return card; }
  function definition(label, value) { const div = document.createElement("div"); const dt = document.createElement("dt"); dt.textContent = label; const dd = document.createElement("dd"); dd.textContent = value; div.append(dt, dd); return div; }
  function listSection(titleText, values) { const section = document.createElement("section"); const strong = document.createElement("strong"); strong.textContent = titleText; const list = document.createElement("ul"); (values || []).forEach((value) => { const li = document.createElement("li"); li.textContent = value; list.append(li); }); section.append(strong, list); return section; }
  function actionButton(label, action) { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.addEventListener("click", action); return button; }
  function clarificationLabel(value) { return ({ free_text:"Ответ", desired_change:"Желаемое изменение", unseen_detail:"Невидимая деталь", priority:"Приоритет", observation_correction:"Исправление наблюдения" })[value] || "Пояснение"; }
  function uncertaintyLabel(value) { return ({ low:"низкая", medium:"средняя", high:"высокая" })[value] || value; }
  function humanField(value) { return ({ exact_gauge:"Точная плотность вязания", shoulder_and_sleeve_construction:"Конструкция плеча и рукава" })[value] || (/[а-яё]/i.test(value || "") ? value : "Деталь конструкции"); }
  function projectTitleLabel(value) { return String(value || "Проект по фотографии").replace(/^TEST ONLY(?=\s*—)/, "ТЕСТОВЫЙ ЭКРАН"); }
  function showError(message) { ui.error.textContent = message; }
  function block(message) { ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false; ui.blockedMessage.textContent = message; ui.root.setAttribute("aria-busy", "false"); }
  function userMessage(error, fallback) { return error?.userMessage || fallback; }
  function releasePreviews() { previews.forEach((url) => globalObject.URL.revokeObjectURL(url)); previews.clear(); }
})(typeof window !== "undefined" ? window : globalThis);
