"use strict";

(function initializePatternExecutionLearningAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("learning-fatal"), fatalMessage: byId("learning-fatal-message"), workflow: byId("learning-workflow"), title: byId("learning-title"), context: byId("learning-context"),
    status: byId("learning-status"), revision: byId("learning-revision"), metrics: byId("learning-metrics"), integrity: byId("learning-integrity"), message: byId("learning-message"), error: byId("learning-error"), back: byId("learning-back-retrospective"), adaptationRoute: byId("learning-adaptation-route"),
    lessonTitle: byId("lesson-title"), lessonDescription: byId("lesson-description"), lessonFacts: byId("lesson-facts"), lessonConfidence: byId("lesson-confidence"), lessonsList: byId("lessons-list"),
    successPattern: byId("success-pattern"), successRationale: byId("success-rationale"), successFacts: byId("success-facts"), successConfidence: byId("success-confidence"), successesList: byId("successful-patterns-list"),
    antiPattern: byId("anti-pattern"), antiReason: byId("anti-reason"), antiMitigation: byId("anti-mitigation"), antiFacts: byId("anti-facts"), antiConfidence: byId("anti-confidence"), antiList: byId("anti-patterns-list"),
    recommendationTitle: byId("recommendation-title"), recommendationPriority: byId("recommendation-priority"), recommendationRationale: byId("recommendation-rationale"), recommendationBenefit: byId("recommendation-benefit"), recommendationLessons: byId("recommendation-lessons"), recommendationsList: byId("recommendations-list"),
    assessmentLevel: byId("assessment-level"), assessmentRationale: byId("assessment-rationale"), assessmentCoverage: byId("assessment-coverage"), assessmentLimitations: byId("assessment-limitations"), confidenceValue: byId("confidence-value"),
  };
  const api = globalObject.YarnAIPatternExecutionLearning;
  const system = globalObject.YarnAIProjectSystem;
  const commandButtons = [...document.querySelectorAll("[data-command]")];
  const editorControls = [...document.querySelectorAll(".category input, .category select, .category textarea, .category [data-command]")];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let localRecord = null;
  let busy = false;

  initialize().catch((error) => showFatal(safeMessage(error, "Learning could not be opened.")));

  async function initialize() {
    bindControls();
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("The project context link is invalid.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    inspected = await repository.readPatternExecutionLearning(projectId);
    localRecord = inspected.rawLearning || null;
    ui.back.href = `/pattern-execution-retrospective?project=${encodeURIComponent(projectId)}`;
    ui.adaptationRoute.href = `/pattern-execution-adaptation?project=${encodeURIComponent(projectId)}`;
    if (!localRecord && inspected.availableCommands.includes("create")) {
      inspected = await repository.createPatternExecutionLearning(projectId);
      localRecord = inspected.rawLearning;
    }
    render();
  }

  function bindControls() {
    document.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-id]");
      if (remove) return removeItem(remove.dataset.collection, remove.dataset.removeId);
      const button = event.target.closest("[data-command]");
      if (button) runCommand(button.dataset.command);
    });
  }

  async function runCommand(command) {
    if (busy) return;
    ui.error.textContent = "";
    ui.message.textContent = "";
    try {
      if (command === "add-lesson") localRecord = api.addLesson(ensureLocal(), { title: ui.lessonTitle.value, description: ui.lessonDescription.value, supportingFacts: csv(ui.lessonFacts.value), confidence: ui.lessonConfidence.value }, binding());
      else if (command === "add-success") localRecord = api.addSuccessfulPattern(ensureLocal(), { pattern: ui.successPattern.value, rationale: ui.successRationale.value, supportingFacts: csv(ui.successFacts.value), confidence: ui.successConfidence.value }, binding());
      else if (command === "add-anti") localRecord = api.addAntiPattern(ensureLocal(), { pattern: ui.antiPattern.value, reason: ui.antiReason.value, possibleMitigation: ui.antiMitigation.value, supportingFacts: csv(ui.antiFacts.value), confidence: ui.antiConfidence.value }, binding());
      else if (command === "add-recommendation") localRecord = api.addRecommendation(ensureLocal(), { title: ui.recommendationTitle.value, priority: ui.recommendationPriority.value, rationale: ui.recommendationRationale.value, expectedBenefit: ui.recommendationBenefit.value, supportingLessonIds: csv(ui.recommendationLessons.value) }, binding());
      else if (command === "set-confidence") localRecord = api.setConfidenceAssessment(ensureLocal(), { level: ui.assessmentLevel.value, rationale: ui.assessmentRationale.value, coverage: ui.assessmentCoverage.value, limitations: csv(ui.assessmentLimitations.value) }, binding());
      else if (command === "save-draft") await persist(ensureLocal(), "Draft saved locally.");
      else if (command === "start-review") await persist(api.startReview(ensureLocal(), inspected, binding()), "Learning moved to review.");
      else if (command === "return-draft") await persist(api.returnToDraft(ensureLocal(), inspected, binding()), "Learning returned to draft.");
      else if (command === "complete") await persist(api.completeLearning(ensureLocal(), inspected, binding()), "Learning completed and is now immutable.");
      clearEditor(command);
    } catch (error) { ui.error.textContent = safeMessage(error, "The action could not be completed."); }
    render();
  }

  async function persist(record, successMessage) {
    if (!repository || !projectId) return;
    busy = true; setBusy(true);
    try {
      if (inspected.learningRecord) await repository.savePatternExecutionLearning(projectId, record, { recordId: inspected.learningRecord.progress_id, expectedRevision: inspected.rawLearning.revision, expectedIdentity: inspected.rawLearning.identity, timestamp: record.updatedAt });
      else await repository.savePatternExecutionLearning(projectId, record, { timestamp: record.updatedAt });
      inspected = await repository.readPatternExecutionLearning(projectId, record.id);
      localRecord = inspected.rawLearning;
      ui.message.textContent = successMessage;
    } finally { busy = false; setBusy(false); }
  }

  function ensureLocal() { if (!localRecord) throw Object.assign(new Error("Learning is unavailable."), { code: "missing_learning", userMessage: "A completed retrospective is required." }); return localRecord; }
  function removeItem(collection, itemId) { try { localRecord = api.removeItem(ensureLocal(), collection, itemId, binding()); ui.error.textContent = ""; } catch (error) { ui.error.textContent = safeMessage(error, "Item was not removed."); } render(); }

  function render() {
    const record = localRecord;
    const status = ["blocked", "stale", "corrupted"].includes(inspected?.effectiveStatus) ? inspected.effectiveStatus : record?.status || "draft";
    ui.title.textContent = inspected?.project?.title ? `Execution learning: ${inspected.project.title}` : "Execution learning";
    ui.context.textContent = inspected?.retrospective ? `Source: completed retrospective ${inspected.retrospective.id}` : "A completed retrospective is required before learning can be created.";
    ui.status.textContent = status; ui.status.dataset.status = status;
    ui.revision.textContent = record ? `Epoch ${record.epoch} · revision ${record.revision}` : "Epoch — · revision —";
    const values = record?.metrics || { lessonCount: 0, successfulPatternCount: 0, antiPatternCount: 0, recommendationCount: 0, confidence: "low", completionState: status };
    ui.metrics.replaceChildren(...[["Lessons", values.lessonCount], ["Successful patterns", values.successfulPatternCount], ["Anti-patterns", values.antiPatternCount], ["Recommendations", values.recommendationCount], ["Confidence", values.confidence], ["State", values.completionState]].map(([label, value]) => detailItem(label, value)));
    const integrity = inspected?.integrity || record?.integrity;
    ui.integrity.replaceChildren(...(integrity?.issues?.length ? integrity.issues.map((entry) => listText(`${entry.severity}: ${entry.code}${entry.sourceId ? ` (${entry.sourceId})` : ""}`)) : [listText("The critical source chain is intact.")]));
    renderItems(ui.lessonsList, record?.lessonsLearned || [], "lessonsLearned", (item) => `${item.title} · ${item.description} · confidence ${item.confidence}`);
    renderItems(ui.successesList, record?.successfulPatterns || [], "successfulPatterns", (item) => `${item.pattern} · ${item.rationale} · confidence ${item.confidence}`);
    renderItems(ui.antiList, record?.antiPatterns || [], "antiPatterns", (item) => `${item.pattern} · ${item.reason} · mitigation: ${item.possibleMitigation}`);
    renderItems(ui.recommendationsList, record?.recommendations || [], "recommendations", (item) => `${item.priority}: ${item.title} · ${item.expectedBenefit}`);
    ui.confidenceValue.textContent = record ? `${record.confidenceAssessment.level}: ${record.confidenceAssessment.rationale || "Not assessed"} · coverage: ${record.confidenceAssessment.coverage || "not set"}` : "Not assessed";
    const editable = status === "draft";
    for (const control of editorControls) control.disabled = !editable || busy;
    setCommandVisible("save-draft", editable); setCommandVisible("start-review", editable); setCommandVisible("return-draft", status === "reviewing"); setCommandVisible("complete", status === "reviewing" && Boolean(integrity?.valid));
    ui.adaptationRoute.hidden = !(status === "completed" && record?.status === "completed" && record?.projectId === projectId && Boolean(integrity?.valid));
  }

  function renderItems(list, items, collection, formatter) { list.replaceChildren(...items.map((item) => { const row = document.createElement("li"); const text = document.createElement("span"); text.textContent = formatter(item); row.append(text); const meta = document.createElement("span"); meta.className = "item-meta"; meta.textContent = item.id; row.append(meta); if (localRecord?.status === "draft") { const remove = document.createElement("button"); remove.type = "button"; remove.dataset.removeId = item.id; remove.dataset.collection = collection; remove.textContent = "Remove"; row.append(remove); } return row; })); }
  function binding() { return localRecord ? { expectedRevision: localRecord.revision, expectedIdentity: localRecord.identity } : {}; }
  function csv(value) { return [...new Set(String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean))].sort(); }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = String(value); wrapper.append(label, content); return wrapper; }
  function listText(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function safeMessage(error, fallback) { const code = typeof error?.code === "string" ? error.code : ""; const message = typeof error?.userMessage === "string" ? error.userMessage : fallback; return `${code ? `${code}: ` : ""}${message}`; }
  function setCommandVisible(command, visible) { const button = commandButtons.find((entry) => entry.dataset.command === command); if (button) button.hidden = !visible; }
  function setBusy(value) { for (const button of commandButtons) button.disabled = value; }
  function clearEditor(command) { const map = { "add-lesson": [ui.lessonTitle, ui.lessonDescription, ui.lessonFacts], "add-success": [ui.successPattern, ui.successRationale, ui.successFacts], "add-anti": [ui.antiPattern, ui.antiReason, ui.antiMitigation, ui.antiFacts], "add-recommendation": [ui.recommendationTitle, ui.recommendationRationale, ui.recommendationBenefit, ui.recommendationLessons] }; for (const control of map[command] || []) control.value = ""; }
  function renderWithoutProject() { inspected = { effectiveStatus: "blocked", integrity: { valid: false, issues: [{ severity: "critical", code: "missing_project", sourceId: null }] } }; ui.context.textContent = "No project selected. Learning remains read-only and is not stored."; ui.back.hidden = true; render(); }
  function showFatal(message) { ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(typeof window !== "undefined" ? window : globalThis);
