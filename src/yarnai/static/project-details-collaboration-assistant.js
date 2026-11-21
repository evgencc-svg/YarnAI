"use strict";

(function initializeProjectDetailsCollaborationAssistant(globalObject) {
  if (typeof document === "undefined") return;
  const helperMode = globalObject.location.hash === "#project-details-collaboration";
  const ownerMode = globalObject.location.hash === "#project-details";
  if (!helperMode && !ownerMode) return;

  const system = globalObject.YarnAIProjectSystem;
  const detailsApi = globalObject.YarnAIProjectDetailsExperience;
  const collaboration = globalObject.YarnAIProjectDetailsCollaboration;
  if (!system || !detailsApi || !collaboration) return;

  const owner = {
    details: document.querySelector("#project-details-collaboration-owner"),
    requestForm: document.querySelector("#project-details-collaboration-request-form"),
    helperLabel: document.querySelector("#project-details-collaboration-helper-label"),
    ownerLabel: document.querySelector("#project-details-collaboration-owner-label"),
    instruction: document.querySelector("#project-details-collaboration-instruction"),
    generate: document.querySelector("#project-details-collaboration-generate"),
    download: document.querySelector("#project-details-collaboration-download-request"),
    responseFile: document.querySelector("#project-details-collaboration-response-file"),
    requestStatus: document.querySelector("#project-details-collaboration-request-status"),
    importStatus: document.querySelector("#project-details-collaboration-import-status"),
    review: document.querySelector("#project-details-collaboration-review"),
    reviewList: document.querySelector("#project-details-collaboration-review-list"),
    reviewSummary: document.querySelector("#project-details-collaboration-review-summary"),
    apply: document.querySelector("#project-details-collaboration-apply"),
    rejectAll: document.querySelector("#project-details-collaboration-reject-all"),
    close: document.querySelector("#project-details-collaboration-close-review"),
    live: document.querySelector("#project-details-collaboration-live"),
  };
  const helper = {
    section: document.querySelector("#project-details-collaboration-helper"),
    loading: document.querySelector("#project-details-collaboration-helper-loading"),
    importPanel: document.querySelector("#project-details-collaboration-helper-import-panel"),
    requestFile: document.querySelector("#project-details-collaboration-request-file"),
    error: document.querySelector("#project-details-collaboration-helper-error"),
    workspace: document.querySelector("#project-details-collaboration-helper-workspace"),
    project: document.querySelector("#project-details-collaboration-helper-project"),
    helperLabel: document.querySelector("#project-details-collaboration-helper-name"),
    instruction: document.querySelector("#project-details-collaboration-helper-instruction"),
    values: document.querySelector("#project-details-collaboration-helper-values"),
    form: document.querySelector("#project-details-collaboration-helper-form"),
    editor: document.querySelector("#project-details-collaboration-helper-editor"),
    save: document.querySelector("#project-details-collaboration-save-draft"),
    download: document.querySelector("#project-details-collaboration-download-response"),
    status: document.querySelector("#project-details-collaboration-helper-status"),
    live: document.querySelector("#project-details-collaboration-helper-live"),
  };

  let repository = null;
  let projectId = "";
  let aggregate = null;
  let currentRequest = null;
  let currentResponse = null;
  let currentDiff = [];
  let helperDraft = null;
  let requestDownload = null;

  initialize().catch((error) => showFatal(error));

  async function initialize() {
    repository = new system.ProjectRepository();
    await repository.initialize();
    globalObject.addEventListener("pagehide", () => repository?.close());
    if (helperMode) await initializeHelper();
    else await initializeOwner();
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function expiresInDays(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  function safeMessage(error, fallback) {
    return error?.userMessage || error?.message || fallback;
  }

  function showFatal(error) {
    const message = safeMessage(error, "Не удалось открыть совместную проверку.");
    if (helperMode) {
      activateHelperPage();
      helper.loading.hidden = true;
      helper.importPanel.hidden = false;
      helper.workspace.hidden = true;
      helper.error.hidden = false;
      helper.error.textContent = message;
      helper.live.textContent = message;
    } else if (owner.importStatus) {
      owner.importStatus.textContent = message;
      owner.importStatus.classList.add("project-details-collaboration-error");
      owner.live.textContent = message;
    }
  }

  function activateHelperPage() {
    document.body.classList.add("project-details-active", "project-details-collaboration-helper-active");
    helper.section.hidden = false;
    document.querySelectorAll("main.flow-shell > section").forEach((section) => {
      if (section !== helper.section) section.hidden = true;
    });
    const title = document.querySelector("#workspace-title");
    if (title) title.textContent = "Проверка данных проекта";
  }

  async function initializeOwner() {
    if (!owner.details || !owner.requestForm) return;
    projectId = new URLSearchParams(globalObject.location.search).get("project") || "";
    if (!system.isUuidv7(projectId)) {
      owner.details.hidden = true;
      return;
    }
    aggregate = await repository.getProject(projectId);
    assertSafeAggregate(aggregate);
    owner.requestForm.addEventListener("submit", createRequest);
    owner.download.addEventListener("click", downloadCurrentRequest);
    owner.responseFile.addEventListener("change", importResponse);
    owner.apply.addEventListener("click", applyReview);
    owner.rejectAll.addEventListener("click", rejectAll);
    owner.close.addEventListener("click", closeReview);
    const collaborationState = aggregate.project.draft_input?.project_details_collaboration;
    const pendingId = collaborationState?.pendingResponseId;
    const pending = pendingId && collaborationState?.responses?.[pendingId];
    const request = pending && collaborationState?.requests?.[pending.requestId];
    if (request && pending) await openReview(request, pending, { persist: false });
  }

  function assertSafeAggregate(value) {
    if (!value?.project || value.project.project_id !== projectId) throw new collaboration.CollaborationError("PROJECT_MISSING", "Проект не найден.");
    const relevant = (value.progress || []).filter((entry) => ["PATTERN_TECHNOLOGY_DRAFT", "PATTERN_TECHNOLOGY_REVIEW"].includes(entry.kind));
    const safety = detailsApi.progressSafety(relevant);
    if (!safety.safe) throw new collaboration.CollaborationError("UNSAFE_PROJECT", "Данные проекта не прошли проверку безопасности.");
  }

  function projectContext(value = aggregate) {
    const project = value.project;
    const calculation = (value.calculations || []).find((entry) => entry.calculation_id === project.active_calculation_id) || (value.calculations || []).at(-1) || null;
    const calculationIntent = calculation?.request?.project_intent || calculation?.request?.projectIntent || {};
    const draftIntent = project.draft_input?.project_intent || project.draft_input?.projectIntent || {};
    const intent = { ...calculationIntent, ...draftIntent, fieldStatus: { ...calculationIntent.fieldStatus, ...draftIntent.fieldStatus } };
    const details = detailsApi.mergeDetails(detailsApi.detailsFromIntent(intent), project.draft_input?.project_details_experience);
    const technologyRecords = (value.progress || []).filter((entry) => entry.kind === "PATTERN_TECHNOLOGY_DRAFT");
    const technologyState = technologyRecords.at(-1)?.state;
    return { project, intent, details, technology: technologyState?.draftResult || technologyState || null, garmentType: intent.garmentType || "изделие" };
  }

  async function createRequest(event) {
    event.preventDefault();
    setOwnerBusy(true);
    clearOwnerStatus();
    try {
      aggregate = await repository.getProject(projectId);
      assertSafeAggregate(aggregate);
      const context = projectContext();
      const groups = [...owner.requestForm.querySelectorAll('input[name="collaboration-group"]:checked')].map((control) => control.value);
      currentRequest = collaboration.buildCollaborationRequest({
        projectId,
        projectTitle: context.project.title,
        projectRevision: context.project.revision,
        ownerLabel: owner.ownerLabel.value,
        helperLabel: owner.helperLabel.value,
        instruction: owner.instruction.value,
        groups,
        details: context.details,
        garmentType: context.garmentType,
        technology: context.technology,
        intent: context.intent,
      }, {
        requestId: system.uuidv7(),
        createdAt: isoNow(),
        expiresAt: expiresInDays(30),
      });
      await persistOwnerRequest(currentRequest);
      requestDownload = collaboration.serializePackage(currentRequest);
      owner.download.disabled = false;
      owner.requestStatus.textContent = `Запрос сформирован: ${currentRequest.scope.groups.length} групп, ${currentRequest.scope.editablePaths.length} редактируемых полей.`;
      owner.live.textContent = "Запрос совместной проверки сформирован и готов к скачиванию.";
    } catch (error) {
      owner.requestStatus.textContent = safeMessage(error, "Не удалось сформировать запрос.");
      owner.requestStatus.classList.add("project-details-collaboration-error");
      owner.live.textContent = owner.requestStatus.textContent;
    } finally {
      setOwnerBusy(false);
    }
  }

  async function persistOwnerRequest(request) {
    const draftInput = cloneRecord(aggregate.project.draft_input);
    const state = cloneRecord(draftInput.project_details_collaboration);
    state.version = collaboration.VERSION;
    state.requests = cloneRecord(state.requests);
    state.requests[request.requestId] = request;
    const ids = Object.keys(state.requests);
    ids.slice(0, Math.max(0, ids.length - 20)).forEach((id) => delete state.requests[id]);
    draftInput.project_details_collaboration = state;
    await repository.updateProject(projectId, { draft_input: draftInput });
    aggregate = await repository.getProject(projectId);
  }

  function downloadCurrentRequest() {
    if (!currentRequest || !requestDownload) return;
    downloadJson(requestDownload, `${projectId}.${currentRequest.requestId}.yarnai-collaboration-request.json`);
    owner.requestStatus.textContent = "Файл запроса скачан. Передай его только выбранному помощнику.";
  }

  async function importResponse(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearOwnerStatus();
    if (file.size > 1024 * 1024) {
      showOwnerImportError("Файл ответа превышает допустимый размер 1 МБ.");
      return;
    }
    setOwnerBusy(true);
    try {
      const parsed = collaboration.parsePackage(await file.text(), "MALFORMED_RESPONSE");
      aggregate = await repository.getProject(projectId);
      assertSafeAggregate(aggregate);
      const state = aggregate.project.draft_input?.project_details_collaboration;
      const request = state?.requests?.[parsed?.requestId];
      if (!request) throw new collaboration.CollaborationError("REQUEST_NOT_FOUND", "Исходный запрос для этого ответа не найден в проекте.");
      const existingResponses = Object.values(state?.responses || {});
      const checked = collaboration.validateCollaborationResponse(parsed, request, { projectId, now: isoNow(), existingResponses });
      await openReview(request, checked.response, { persist: !checked.duplicate });
      owner.importStatus.textContent = checked.duplicate ? "Этот ответ уже был открыт. Review восстановлен." : "Ответ проверен. Проект пока не изменён.";
      owner.live.textContent = owner.importStatus.textContent;
    } catch (error) {
      showOwnerImportError(safeMessage(error, "Не удалось проверить файл ответа."));
    } finally {
      setOwnerBusy(false);
    }
  }

  async function openReview(request, response, options = {}) {
    if (options.persist !== false) {
      const draftInput = cloneRecord(aggregate.project.draft_input);
      const state = cloneRecord(draftInput.project_details_collaboration);
      state.requests = cloneRecord(state.requests);
      state.responses = cloneRecord(state.responses);
      state.responses[response.responseId] = response;
      state.pendingResponseId = response.responseId;
      draftInput.project_details_collaboration = state;
      await repository.updateProject(projectId, { draft_input: draftInput });
      aggregate = await repository.getProject(projectId);
    }
    currentRequest = request;
    currentResponse = response;
    currentDiff = collaboration.computeCollaborationDiff(projectContext().details, request, response, { projectId, now: isoNow() });
    renderReview(currentDiff);
    owner.review.hidden = false;
    owner.review.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }

  function renderReview(diff) {
    owner.reviewList.replaceChildren();
    diff.forEach((row, index) => {
      const article = document.createElement("article");
      article.className = "project-details-review-row";
      article.dataset.path = row.path;
      article.dataset.conflict = String(row.conflict);
      const title = document.createElement("h3");
      title.textContent = row.label;
      article.append(title, reviewValues(row));
      const provenance = document.createElement("p");
      provenance.textContent = `Происхождение текущего значения: ${detailsApi.sourceLabel(row.currentProvenance)}.`;
      article.append(provenance);
      if (row.explanation) {
        const explanation = document.createElement("p");
        explanation.textContent = `Пояснение помощника: ${row.explanation}`;
        article.append(explanation);
      }
      if (row.conflict) {
        const warning = document.createElement("p");
        warning.className = "project-details-collaboration-error";
        warning.textContent = "Конфликт: текущее значение изменилось после создания запроса.";
        article.append(warning);
      }
      const decisions = document.createElement("fieldset");
      decisions.className = "project-details-review-decisions";
      const legend = document.createElement("legend");
      legend.textContent = "Решение владельца";
      decisions.append(legend);
      [["accepted", "Принять"], ["rejected", "Отклонить"], ["undecided", "Оставить без решения"]].forEach(([value, label]) => {
        const wrapper = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `collaboration-decision-${index}`;
        radio.value = value;
        radio.checked = value === "undecided";
        radio.addEventListener("change", updateReviewSummary);
        wrapper.append(radio, document.createTextNode(label));
        decisions.append(wrapper);
      });
      if (row.conflict) {
        const wrapper = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.confirmConflict = row.path;
        wrapper.append(checkbox, document.createTextNode("Я подтверждаю замену изменившегося значения"));
        decisions.append(wrapper);
      }
      article.append(decisions);
      owner.reviewList.append(article);
    });
    updateReviewSummary();
  }

  function reviewValues(row) {
    const list = document.createElement("ul");
    list.className = "project-details-review-values";
    [["Текущее", row.current], ["В запросе", row.base], ["Предложено", row.proposed]].forEach(([label, value]) => {
      const item = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = label;
      const span = document.createElement("span");
      span.textContent = displayValue(value);
      item.append(strong, span);
      list.append(item);
    });
    return list;
  }

  function reviewDecisions() {
    const decisions = {};
    owner.reviewList.querySelectorAll(".project-details-review-row").forEach((row) => {
      decisions[row.dataset.path] = row.querySelector('input[type="radio"]:checked')?.value || "undecided";
    });
    return decisions;
  }

  function confirmedConflicts() {
    return [...owner.reviewList.querySelectorAll("[data-confirm-conflict]:checked")].map((control) => control.dataset.confirmConflict);
  }

  function updateReviewSummary() {
    const summary = collaboration.computeReviewSummary(currentDiff, reviewDecisions());
    owner.reviewSummary.textContent = `Предложений: ${summary.total}. Принято: ${summary.accepted}. Отклонено: ${summary.rejected}. Без решения: ${summary.undecided}. Конфликтов: ${summary.conflicts}.`;
  }

  async function applyReview() {
    if (!currentRequest || !currentResponse) return;
    setOwnerBusy(true);
    try {
      aggregate = await repository.getProject(projectId);
      assertSafeAggregate(aggregate);
      const context = projectContext();
      const diff = collaboration.computeCollaborationDiff(context.details, currentRequest, currentResponse, { projectId, now: isoNow() });
      const decisions = reviewDecisions();
      const acceptedAt = isoNow();
      const draftInput = collaboration.applyAllowedPatchToDraft(aggregate.project.draft_input, context.details, diff, decisions, {
        requestId: currentRequest.requestId,
        responseId: currentResponse.responseId,
        helperLabel: currentResponse.helper.label,
        acceptedAt,
        confirmedConflicts: confirmedConflicts(),
      });
      const state = cloneRecord(draftInput.project_details_collaboration);
      state.pendingResponseId = null;
      state.reviews = cloneRecord(state.reviews);
      state.reviews[currentResponse.responseId] = { decisions, reviewedAt: acceptedAt };
      draftInput.project_details_collaboration = state;
      await repository.updateProject(projectId, { draft_input: draftInput });
      const accepted = Object.values(decisions).filter((value) => value === "accepted").length;
      owner.importStatus.textContent = accepted ? `Принятые изменения сохранены: ${accepted}. Остальные данные проекта сохранены.` : "Принятых изменений нет. Проект не изменён.";
      owner.live.textContent = owner.importStatus.textContent;
      owner.review.hidden = true;
      globalObject.location.reload();
    } catch (error) {
      showOwnerImportError(safeMessage(error, "Не удалось применить выбранные изменения."));
    } finally {
      setOwnerBusy(false);
    }
  }

  function rejectAll() {
    owner.reviewList.querySelectorAll(".project-details-review-row").forEach((row) => {
      const radio = [...row.querySelectorAll('input[type="radio"]')].find((control) => control.value === "rejected");
      if (radio) radio.checked = true;
    });
    updateReviewSummary();
    owner.live.textContent = "Все предложения отмечены как отклонённые. Для фиксации нажми «Принять выбранные».";
  }

  async function closeReview() {
    setOwnerBusy(true);
    try {
      aggregate = await repository.getProject(projectId);
      const draftInput = cloneRecord(aggregate.project.draft_input);
      const state = cloneRecord(draftInput.project_details_collaboration);
      state.pendingResponseId = null;
      draftInput.project_details_collaboration = state;
      await repository.updateProject(projectId, { draft_input: draftInput });
      currentResponse = null;
      currentDiff = [];
      owner.review.hidden = true;
      owner.importStatus.textContent = "Review закрыт без изменения параметров проекта.";
      owner.live.textContent = owner.importStatus.textContent;
    } catch (error) {
      showOwnerImportError(safeMessage(error, "Не удалось закрыть review безопасно."));
    } finally {
      setOwnerBusy(false);
    }
  }

  function clearOwnerStatus() {
    owner.requestStatus.classList.remove("project-details-collaboration-error");
    owner.importStatus.classList.remove("project-details-collaboration-error");
    owner.requestStatus.textContent = "";
    owner.importStatus.textContent = "";
  }

  function showOwnerImportError(message) {
    owner.importStatus.textContent = message;
    owner.importStatus.classList.add("project-details-collaboration-error");
    owner.live.textContent = message;
    owner.review.hidden = true;
  }

  function setOwnerBusy(value) {
    [owner.generate, owner.responseFile, owner.apply, owner.rejectAll, owner.close].forEach((control) => { if (control) control.disabled = value; });
    if (owner.download) owner.download.disabled = value || !currentRequest;
  }

  async function initializeHelper() {
    activateHelperPage();
    helper.requestFile.addEventListener("change", importRequest);
    helper.form.addEventListener("submit", saveHelperDraft);
    helper.download.addEventListener("click", downloadResponse);
    const params = new URLSearchParams(globalObject.location.search);
    const requestId = params.get("collaboration") || "";
    if (requestId && system.isUuidv7(requestId)) {
      const receipt = await repository.getProjectDetailsCollaborationDraft(requestId);
      if (receipt) {
        helperDraft = receipt.payload;
        currentRequest = collaboration.validateCollaborationRequest(helperDraft.request, { projectId: params.get("project") || undefined, now: isoNow() }).request;
        renderHelperWorkspace();
        return;
      }
    }
    helper.loading.hidden = true;
    helper.importPanel.hidden = false;
    helper.workspace.hidden = true;
  }

  async function importRequest(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    helper.error.hidden = true;
    if (file.size > 1024 * 1024) return showHelperError("Файл запроса превышает допустимый размер 1 МБ.");
    try {
      const parsed = collaboration.parsePackage(await file.text(), "MALFORMED_REQUEST");
      currentRequest = collaboration.validateCollaborationRequest(parsed, { now: isoNow() }).request;
      const existing = await repository.getProjectDetailsCollaborationDraft(currentRequest.requestId);
      if (existing && existing.payload?.request?.fingerprint !== currentRequest.fingerprint) {
        throw new collaboration.CollaborationError("REQUEST_IDENTITY_COLLISION", "Запрос с таким identity уже открыт с другим содержимым.");
      }
      helperDraft = existing?.payload || { version: collaboration.VERSION, request: currentRequest, proposals: [] };
      await persistHelperDraft();
      const url = new URL(globalObject.location.href);
      url.searchParams.set("project", currentRequest.projectId);
      url.searchParams.set("collaboration", currentRequest.requestId);
      url.hash = "project-details-collaboration";
      globalObject.history.replaceState({}, "", url);
      renderHelperWorkspace();
    } catch (error) {
      showHelperError(safeMessage(error, "Не удалось открыть файл запроса."));
    }
  }

  function renderHelperWorkspace() {
    helper.loading.hidden = true;
    helper.importPanel.hidden = true;
    helper.error.hidden = true;
    helper.workspace.hidden = false;
    helper.project.textContent = currentRequest.snapshot.project.title;
    helper.helperLabel.textContent = currentRequest.helper.label;
    helper.instruction.textContent = currentRequest.helper.instruction || "Дополнительной инструкции нет.";
    renderTransferredValues();
    renderHelperEditor();
    helper.status.textContent = "Черновик восстановлен локально. Исходный проект владельца недоступен и не изменяется.";
  }

  function renderTransferredValues() {
    helper.values.replaceChildren();
    Object.entries(currentRequest.snapshot.values).forEach(([path, entry]) => {
      const item = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = entry.label;
      const value = document.createElement("span");
      value.textContent = displayValue(entry.value);
      if (!entry.editable) {
        const marker = document.createElement("small");
        marker.className = "project-details-collaboration-readonly";
        marker.textContent = "только для чтения";
        value.append(marker);
      }
      item.append(label, value);
      helper.values.append(item);
    });
  }

  function renderHelperEditor() {
    helper.editor.replaceChildren();
    const saved = new Map((helperDraft.proposals || []).map((proposal) => [proposal.path, proposal]));
    currentRequest.scope.editablePaths.forEach((path) => {
      const entry = currentRequest.snapshot.values[path];
      const wrapper = document.createElement("div");
      wrapper.className = "project-details-collaboration-panel";
      wrapper.dataset.editorPath = path;
      const label = document.createElement("label");
      label.className = "project-details-collaboration-field";
      const title = document.createElement("span");
      title.textContent = `${entry.label}. Было: ${displayValue(entry.value)}`;
      const control = editorControl(path, saved.get(path)?.value ?? entry.value);
      label.append(title, control);
      const explanationLabel = document.createElement("label");
      explanationLabel.className = "project-details-collaboration-field";
      const explanationTitle = document.createElement("span");
      explanationTitle.textContent = "Краткое пояснение к предложению";
      const explanation = document.createElement("textarea");
      explanation.rows = 2;
      explanation.maxLength = 600;
      explanation.dataset.explanationFor = path;
      explanation.value = saved.get(path)?.explanation || "";
      explanationLabel.append(explanationTitle, explanation);
      wrapper.append(label, explanationLabel);
      helper.editor.append(wrapper);
    });
  }

  function editorControl(path, value) {
    const field = path.split(".").at(-1);
    const optionSets = {
      sizeMode: [["", "Не выбрано"], ["standard", "Стандартный размер"], ["custom", "Свои мерки"]],
      recipient: [["", "Не выбрано"], ["woman", "Для женщины"], ["man", "Для мужчины"], ["child", "Для ребёнка"], ["neutral", "Без привязки к полу"], ["other", "Другое"]],
      fit: [["", "Не выбрано"], ["fitted", "По фигуре"], ["regular", "Обычная"], ["relaxed", "Свободная"], ["oversized", "Очень свободная"]],
      standardSize: [["", "Не выбрано"], ...detailsApi.STANDARD_SIZES.map((size) => [size, size])],
    };
    let control;
    if (optionSets[field]) {
      control = document.createElement("select");
      optionSets[field].forEach(([optionValue, optionLabel]) => {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionLabel;
        control.append(option);
      });
    } else {
      control = document.createElement("input");
      control.type = "number";
      control.inputMode = "decimal";
      control.min = "0.1";
      control.max = "500";
      control.step = "0.1";
    }
    control.dataset.proposalPath = path;
    control.value = value ?? "";
    return control;
  }

  function collectHelperProposals() {
    const proposals = [];
    helper.editor.querySelectorAll("[data-editor-path]").forEach((wrapper) => {
      const path = wrapper.dataset.editorPath;
      const control = wrapper.querySelector("[data-proposal-path]");
      const value = control.value;
      if (value === "") return;
      const normalized = collaboration.buildCollaborationResponse(currentRequest, [{ path, value, explanation: wrapper.querySelector("[data-explanation-for]").value }], {
        responseId: system.uuidv7(), createdAt: isoNow(), expiresAt: expiresInDays(30), now: isoNow(),
      }).proposals[0];
      if (normalized) proposals.push(normalized);
    });
    return proposals;
  }

  async function saveHelperDraft(event) {
    event?.preventDefault();
    try {
      helperDraft.proposals = collectHelperProposals();
      await persistHelperDraft();
      helper.status.textContent = "Черновик сохранён локально. Он восстановится после перезагрузки страницы.";
      helper.live.textContent = helper.status.textContent;
      return true;
    } catch (error) {
      showHelperError(safeMessage(error, "Не удалось сохранить черновик."));
      return false;
    }
  }

  async function persistHelperDraft() {
    await repository.saveProjectDetailsCollaborationDraft(currentRequest.requestId, currentRequest.projectId, helperDraft, { timestamp: isoNow() });
  }

  async function downloadResponse() {
    if (!await saveHelperDraft()) return;
    try {
      const response = collaboration.buildCollaborationResponse(currentRequest, helperDraft.proposals, {
        responseId: system.uuidv7(), createdAt: isoNow(), expiresAt: expiresInDays(30), now: isoNow(),
      });
      downloadJson(collaboration.serializePackage(response), `${response.projectId}.${response.responseId}.yarnai-collaboration-response.json`);
      helper.status.textContent = "Response-файл скачан. Передай его владельцу проекта.";
      helper.live.textContent = helper.status.textContent;
    } catch (error) {
      showHelperError(safeMessage(error, "Не удалось сформировать response-файл."));
    }
  }

  function showHelperError(message) {
    helper.error.hidden = false;
    helper.error.textContent = message;
    helper.status.textContent = "Изменения не сохранены и не экспортированы.";
    helper.live.textContent = message;
  }

  function cloneRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? structuredClone(value) : {};
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === "") return "Не указано";
    if (typeof value === "object") {
      if (Array.isArray(value)) return value.map(displayValue).join(", ");
      const known = Array.isArray(value.known) ? value.known.length : 0;
      const missing = Array.isArray(value.missing) ? value.missing.length : 0;
      if ("known" in value || "missing" in value) return `Известно: ${known}; не хватает: ${missing}`;
      return JSON.stringify(value);
    }
    return String(value);
  }

  function downloadJson(text, filename) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
})(window);
