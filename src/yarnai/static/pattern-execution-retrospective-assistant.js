"use strict";

(function initializePatternExecutionRetrospectiveAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("retrospective-fatal"), fatalMessage: byId("retrospective-fatal-message"), workflow: byId("retrospective-workflow"),
    title: byId("retrospective-title"), context: byId("retrospective-context"), status: byId("retrospective-status"),
    revision: byId("retrospective-revision"), summary: byId("retrospective-summary"), integrity: byId("retrospective-integrity"),
    message: byId("retrospective-message"), error: byId("retrospective-error"), back: byId("retrospective-back-follow-up"), learningRoute: byId("retrospective-learning-route"),
    factText: byId("fact-text"), factSourceType: byId("fact-source-type"), factSourceRefs: byId("fact-source-refs"), factEvidenceLevel: byId("fact-evidence-level"),
    conclusionText: byId("conclusion-text"), conclusionFactIds: byId("conclusion-fact-ids"), conclusionStatus: byId("conclusion-status"),
    questionText: byId("question-text"), questionReason: byId("question-reason"), questionSourceRefs: byId("question-source-refs"), questionNextCheck: byId("question-next-check"),
    considerationText: byId("consideration-text"), considerationRationale: byId("consideration-rationale"), considerationFactIds: byId("consideration-fact-ids"), considerationConclusionIds: byId("consideration-conclusion-ids"), considerationScope: byId("consideration-scope"),
    factsList: byId("facts-list"), conclusionsList: byId("conclusions-list"), questionsList: byId("questions-list"), considerationsList: byId("considerations-list"),
  };
  const api = globalObject.YarnAIPatternExecutionRetrospective;
  const system = globalObject.YarnAIProjectSystem;
  const commandButtons = [...document.querySelectorAll("[data-command]")];
  const editorControls = [...document.querySelectorAll(".category input, .category select, .category textarea, .category [data-command]")];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let localRecord = null;
  let busy = false;

  initialize().catch((error) => showFatal(safeMessage(error, "Не удалось открыть ретроспективу.")));

  async function initialize() {
    bindControls();
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на контекст проекта повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    inspected = await repository.readPatternExecutionRetrospective(projectId);
    localRecord = inspected.rawRetrospective || null;
    ui.back.href = `/pattern-execution-follow-up?project=${encodeURIComponent(projectId)}`;
    ui.learningRoute.href = `/pattern-execution-learning?project=${encodeURIComponent(projectId)}`;
    render();
  }

  function bindControls() {
    for (const button of commandButtons) button.addEventListener("click", () => runCommand(button.dataset.command));
    for (const list of [ui.factsList, ui.conclusionsList, ui.questionsList, ui.considerationsList]) {
      list.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-remove-id]");
        if (button) removeItem(button.dataset.collection, button.dataset.removeId);
      });
    }
  }

  function ensureLocal() {
    if (!localRecord) localRecord = api.createPatternExecutionRetrospective(inspected, { epoch: inspected?.nextEpoch || 1 });
    return localRecord;
  }

  async function runCommand(command) {
    if (busy || !command || !inspected || ["blocked", "stale", "corrupted"].includes(inspected.effectiveStatus)) return;
    ui.error.textContent = "";
    try {
      if (command === "add-fact") localRecord = api.addFact(ensureLocal(), {
        text: ui.factText.value, sourceType: ui.factSourceType.value, sourceRefs: parseReferences(ui.factSourceRefs.value), evidenceLevel: ui.factEvidenceLevel.value,
      }, binding());
      else if (command === "add-conclusion") localRecord = api.addConclusion(ensureLocal(), {
        text: ui.conclusionText.value, factIds: csv(ui.conclusionFactIds.value), status: ui.conclusionStatus.value,
      }, binding());
      else if (command === "add-question") localRecord = api.addUnresolvedQuestion(ensureLocal(), {
        text: ui.questionText.value, reason: ui.questionReason.value, sourceRefs: parseReferences(ui.questionSourceRefs.value), nextCheck: ui.questionNextCheck.value,
      }, binding());
      else if (command === "add-consideration") localRecord = api.addFutureConsideration(ensureLocal(), {
        text: ui.considerationText.value, rationale: ui.considerationRationale.value, relatedFactIds: csv(ui.considerationFactIds.value), relatedConclusionIds: csv(ui.considerationConclusionIds.value), scope: ui.considerationScope.value,
      }, binding());
      else if (command === "save-draft") await persist(ensureLocal(), "Черновик сохранён локально.");
      else if (command === "start-review") await persist(api.startReview(ensureLocal(), inspected, binding()), "Ретроспектива переведена на review.");
      else if (command === "return-draft") await persist(api.returnToDraft(ensureLocal(), inspected, binding()), "Ретроспектива возвращена в draft.");
      else if (command === "complete") await persist(api.completeRetrospective(ensureLocal(), inspected, binding()), "Ретроспектива завершена и больше не редактируется.");
      clearEditor(command);
    } catch (error) {
      ui.error.textContent = safeMessage(error, "Действие не выполнено.");
    }
    render();
  }

  async function persist(record, successMessage) {
    if (!repository || !projectId) return;
    busy = true;
    setBusy(true);
    try {
      if (inspected.retrospectiveRecord) {
        await repository.savePatternExecutionRetrospective(projectId, record, {
          recordId: inspected.retrospectiveRecord.progress_id, expectedRevision: inspected.rawRetrospective.revision,
          expectedIdentity: inspected.rawRetrospective.identity, timestamp: record.updatedAt,
        });
      } else await repository.savePatternExecutionRetrospective(projectId, record, { timestamp: record.updatedAt });
      inspected = await repository.readPatternExecutionRetrospective(projectId, record.id);
      localRecord = inspected.rawRetrospective;
      ui.message.textContent = successMessage;
    } finally {
      busy = false;
      setBusy(false);
    }
  }

  function removeItem(collection, itemId) {
    try { localRecord = api.removeItem(ensureLocal(), collection, itemId, binding()); ui.error.textContent = ""; }
    catch (error) { ui.error.textContent = safeMessage(error, "Элемент не удалён."); }
    render();
  }

  function render() {
    const record = localRecord;
    const status = inspected?.effectiveStatus === "blocked" ? "blocked" : inspected?.effectiveStatus === "stale" ? "stale" : inspected?.effectiveStatus === "corrupted" ? "corrupted" : record?.status || "draft";
    ui.title.textContent = inspected?.project?.title ? `Ретроспектива: ${inspected.project.title}` : "Ретроспектива исполнения";
    ui.context.textContent = inspected?.project ? `Проект: ${inspected.project.title || inspected.project.project_id}` : "Проект не найден.";
    ui.status.textContent = statusLabel(status);
    ui.status.dataset.status = status;
    ui.revision.textContent = record ? `Epoch ${record.epoch} · revision ${record.revision}` : "Epoch — · revision —";
    const summary = record?.summary?.machine || emptySummary(inspected?.integrity);
    ui.summary.replaceChildren(...[
      ["Facts", summary.factCount], ["Confirmed conclusions", summary.confirmedConclusionCount],
      ["Open questions", summary.unresolvedQuestionCount], ["Future considerations", summary.futureConsiderationCount],
      ["Completion", summary.completionState], ["Critical chain", summary.criticalChainComplete ? "complete" : "incomplete"],
      ["Integrity", summary.hasIntegrityProblems ? "issues recorded" : "clean"], ["Stale", summary.stale ? "yes" : "no"],
    ].map(([label, value]) => detailItem(label, value)));
    const integrity = inspected?.integrity || record?.integrity;
    ui.integrity.replaceChildren(...(integrity?.issues?.length ? integrity.issues.map((entry) => listText(`${entry.severity}: ${entry.code}${entry.sourceId ? ` (${entry.sourceId})` : ""}`)) : [listText("Source chain integrity issues are not present.")]));
    renderItems(ui.factsList, record?.facts || [], "facts", (item) => `${item.text} · ${item.evidenceLevel} · ${item.id}`);
    renderItems(ui.conclusionsList, record?.conclusions || [], "conclusions", (item) => `${item.text} · ${item.status} · facts: ${item.factIds.join(", ")}`);
    renderItems(ui.questionsList, record?.unresolvedQuestions || [], "unresolvedQuestions", (item) => `${item.text} · open because: ${item.reason}`);
    renderItems(ui.considerationsList, record?.futureConsiderations || [], "futureConsiderations", (item) => `${item.text} · ${item.scope} · ${item.rationale}`);
    const editable = status === "draft";
    for (const control of editorControls) control.disabled = !editable || busy;
    setCommandVisible("save-draft", editable);
    setCommandVisible("start-review", editable);
    setCommandVisible("return-draft", status === "reviewing");
    setCommandVisible("complete", status === "reviewing" && Boolean(integrity?.valid));
    ui.learningRoute.hidden = !(status === "completed" && Boolean(integrity?.valid) && record?.projectId === projectId);
  }

  function renderItems(list, items, collection, formatter) {
    list.replaceChildren(...items.map((item) => {
      const row = document.createElement("li");
      const text = document.createElement("span"); text.textContent = formatter(item); row.append(text);
      const meta = document.createElement("span"); meta.className = "item-meta"; meta.textContent = item.origin === "automatic" ? "Автоматически извлечено из source snapshot" : "Пользовательская запись"; row.append(meta);
      if (item.origin !== "automatic" && localRecord?.status === "draft") {
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-item"; remove.dataset.removeId = item.id; remove.dataset.collection = collection; remove.textContent = "Удалить"; row.append(remove);
      }
      return row;
    }));
  }

  function binding() { return localRecord ? { expectedRevision: localRecord.revision, expectedIdentity: localRecord.identity } : {}; }
  function csv(value) { return [...new Set(String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean))].sort(); }
  function parseReferences(value) { return csv(value).map((entry) => { const separator = entry.indexOf(":"); return separator > 0 ? { sourceType: entry.slice(0, separator), sourceId: entry.slice(separator + 1) } : { sourceType: "record", sourceId: entry }; }); }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = String(value); wrapper.append(label, content); return wrapper; }
  function listText(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function emptySummary(integrity) { return { factCount: 0, confirmedConclusionCount: 0, unresolvedQuestionCount: 0, futureConsiderationCount: 0, completionState: "draft", criticalChainComplete: Boolean(integrity?.criticalChainComplete), hasIntegrityProblems: Boolean(integrity?.issues?.length), stale: false }; }
  function statusLabel(value) { return ({ draft: "Черновик", reviewing: "На review", completed: "Завершено", stale: "Устарело", corrupted: "Повреждено", blocked: "Заблокировано" })[value] || value; }
  function safeMessage(error, fallback) { const code = typeof error?.code === "string" ? error.code : ""; const message = typeof error?.userMessage === "string" ? error.userMessage : fallback; return `${code ? `${code}: ` : ""}${message}`; }
  function setCommandVisible(command, visible) { const button = commandButtons.find((entry) => entry.dataset.command === command); if (button) button.hidden = !visible; }
  function setBusy(value) { for (const button of commandButtons) button.disabled = value; }
  function clearEditor(command) { const map = { "add-fact": [ui.factText, ui.factSourceRefs], "add-conclusion": [ui.conclusionText, ui.conclusionFactIds], "add-question": [ui.questionText, ui.questionReason, ui.questionSourceRefs, ui.questionNextCheck], "add-consideration": [ui.considerationText, ui.considerationRationale, ui.considerationFactIds, ui.considerationConclusionIds] }; for (const control of map[command] || []) control.value = ""; }
  function renderWithoutProject() { inspected = { effectiveStatus: "blocked", integrity: { valid: false, issues: [{ severity: "critical", code: "missing_project", sourceId: null }] } }; ui.context.textContent = "Проект не выбран. Ретроспектива остаётся в безопасном режиме без записи."; ui.back.hidden = true; render(); }
  function showFatal(message) { ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(typeof window !== "undefined" ? window : globalThis);
