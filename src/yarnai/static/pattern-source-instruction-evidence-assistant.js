"use strict";

(function initializeSourceInstructionEvidencePage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const evidenceApi = globalObject.YarnAIPatternSourceInstructionEvidence;
  const get = (selector) => document.querySelector(selector);
  const ui = {
    fatal: get("#source-evidence-fatal"), fatalMessage: get("#source-evidence-fatal-message"), workflow: get("#source-evidence-workflow"),
    title: get("#source-evidence-project-title"), status: get("#source-evidence-status"), pdf: get("#source-evidence-pdf"), pdfFingerprint: get("#source-evidence-pdf-fingerprint"), stage19: get("#source-evidence-stage19"), size: get("#source-evidence-size"), coverage: get("#source-evidence-coverage"), revision: get("#source-evidence-revision"),
    build: get("#source-evidence-build"), rebuild: get("#source-evidence-rebuild"), confirm: get("#source-evidence-confirm"), error: get("#source-evidence-error"),
    review: get("#source-evidence-review"), questions: get("#source-evidence-questions"), coverageCard: get("#source-evidence-coverage-card"), coverageList: get("#source-evidence-coverage-list"), blockers: get("#source-evidence-blockers"),
    result: get("#source-evidence-result"), sizeOrder: get("#source-evidence-size-order"), counts: get("#source-evidence-counts"), components: get("#source-evidence-components"), back: get("#source-evidence-back"), stage21: get("#source-evidence-stage21"),
  };
  const COMPONENT_LABELS = Object.freeze({ neckline: "Горловина", yoke: "Кокетка", sleeve_body_separation: "Разделение корпуса и рукавов", body: "Корпус", sleeves: "Рукава", finishing: "Завершение" });
  let repository = null; let projectId = null; let inspected = null; let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть source instructions."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId || !system?.isUuidv7(projectId) || !evidenceApi) return showFatal("Ссылка на проект повреждена или boundary-модуль не загружен.");
    repository = new system.ProjectRepository(); await repository.initialize();
    ui.back.href = `/pattern-analysis-review?project=${encodeURIComponent(projectId)}`;
    ui.stage21.href = `/pattern-technology-review?project=${encodeURIComponent(projectId)}`;
    ui.build.addEventListener("click", () => run(() => evidenceApi.buildForProject(repository, projectId)));
    ui.rebuild.addEventListener("click", () => run(() => evidenceApi.buildForProject(repository, projectId)));
    ui.confirm.addEventListener("click", () => run(() => evidenceApi.confirmForProject(repository, projectId)));
    inspected = await evidenceApi.ensureForProject(repository, projectId); render();
  }

  function render() {
    ui.error.textContent = ""; ui.build.hidden = true; ui.rebuild.hidden = true; ui.confirm.hidden = true; ui.review.hidden = true; ui.coverageCard.hidden = true; ui.result.hidden = true;
    ui.title.textContent = inspected?.project?.title || "Source instructions";
    if (["blocked", "corrupted"].includes(inspected?.state)) return renderBlocked(inspected?.reasonCode || "SOURCE_CHAIN_INCOMPLETE", inspected?.error?.details?.missingFields);
    const state = inspected?.evidence; const source = inspected?.source;
    if (!state || !source) return renderBlocked("SOURCE_CHAIN_INCOMPLETE");
    ui.pdf.textContent = `${state.binding.sourceDocumentName} · ${state.binding.sourceDocumentIdentity} · source revision ${state.binding.sourceDocumentRevision}`;
    ui.pdfFingerprint.textContent = state.binding.sourceDocumentFingerprint;
    ui.stage19.textContent = `${state.binding.stage19ReviewIdentity}, revision ${state.binding.stage19AuthoritativeReviewRevision} · extraction ${state.binding.sourceExtractionIdentity}, revision ${state.binding.sourceExtractionRevision} · analysis ${state.binding.analysisId}`;
    ui.size.textContent = state.binding.selectedSourceSize;
    ui.revision.textContent = `${state.id} · state revision ${state.revision} · ${state.resultIdentity || "результата пока нет"}${state.resultFingerprint ? ` · ${state.resultFingerprint}` : ""}`;
    ui.coverage.textContent = state.result ? `${state.result.coverage.coveredCount}/${state.result.coverage.requiredCount}` : "—";
    ui.status.textContent = statusLabel(inspected.state, state.status);
    if (["waiting", "failed"].includes(state.status)) ui.build.hidden = false;
    if (["draft", "ready_to_confirm", "confirmed", "stale"].includes(state.status)) ui.rebuild.hidden = false;
    if (state.result) renderResult(state);
    if (state.status === "ready_to_confirm") ui.confirm.hidden = false;
  }

  function renderResult(state) {
    const result = state.result;
    ui.result.hidden = false; ui.coverageCard.hidden = false; ui.review.hidden = !result.reviewQuestions.length;
    ui.sizeOrder.textContent = `${result.canonicalSizeOrder.join(" → ")} · выбран ${result.selectedSize} (#${result.selectedSizeIndex + 1})`;
    ui.counts.textContent = `Evidence units ${result.counts.evidenceUnits} · operations ${result.counts.operations} · rows/rounds ${result.counts.rowInstructions} · finishing ${result.counts.finishing} · unresolved critical ${state.unresolvedIssues.length} (${state.unresolvedIssues.map((entry) => `${entry.kind || entry.code}${entry.evidenceUnitIdentity ? `@${entry.evidenceUnitIdentity}` : ""}`).join(", ")}) · kinds: ${Object.entries(result.counts.byKind).map(([kind, count]) => `${kind}=${count}`).join(", ")}`;
    replaceList(ui.coverageList, result.coverage.sections.map((entry) => `${entry.complete ? "✓" : "✗"} ${COMPONENT_LABELS[entry.component]} — operations ${entry.operationCount}, rows ${entry.rowInstructionCount}${entry.missing.length ? `; missing: ${entry.missing.join(", ")}` : ""}`));
    replaceList(ui.blockers, result.blockerResolutionMap.map((entry) => `${entry.resolutionStatus}: ${entry.blocker} (${entry.supportingEvidenceIdentities.length} evidence)`));
    ui.questions.replaceChildren(...result.reviewQuestions.map((question) => questionNode(question, state)));
    ui.components.replaceChildren(...evidenceApi.CONSTRUCTION_SEQUENCE.map((component) => componentNode(component, result.evidenceUnits.filter((unit) => unit.component === component))));
  }

  function questionNode(question, state) {
    const article = document.createElement("article"); article.className = "evidence-question";
    const heading = document.createElement("h3"); heading.textContent = question.prompt; article.append(heading);
    const fieldset = document.createElement("fieldset"); const legend = document.createElement("legend"); legend.textContent = "Обязательный выбор"; fieldset.append(legend);
    const selected = state.reviewDecisions.find((entry) => entry.questionId === question.identity)?.selectedOptionId;
    for (const option of question.options) {
      const label = document.createElement("label"); const input = document.createElement("input"); input.type = "radio"; input.name = question.identity; input.value = option.id; input.checked = selected === option.id; input.disabled = busy || state.status === "confirmed";
      input.addEventListener("change", () => run(() => evidenceApi.decideForProject(repository, projectId, question.identity, option.id)));
      label.append(input, ` ${option.label}`); fieldset.append(label);
    }
    article.append(fieldset); return article;
  }

  function componentNode(component, units) {
    const details = document.createElement("details"); details.className = "card evidence-component"; details.open = component === "neckline";
    const summary = document.createElement("summary"); summary.textContent = `${COMPONENT_LABELS[component]} · ${units.length} фрагм.`; details.append(summary);
    for (const unit of units) {
      const article = document.createElement("article"); article.className = "evidence-unit";
      const title = document.createElement("h3"); title.textContent = `${unit.globalOrder}. ${unit.label || unit.operationType}`;
      const text = document.createElement("p"); text.textContent = unit.rawText;
      const meta = document.createElement("p"); meta.className = "evidence-unit-meta"; meta.textContent = `PDF p.${unit.sourceLocator.displayedPageNumber} (index ${unit.sourceLocator.pdfPageIndex}), ${unit.sourceLocator.sectionHeading || "раздел"}, span ${unit.sourceLocator.textSpan.start}:${unit.sourceLocator.textSpan.end}, ${unit.sourceLocator.fragmentFingerprint}, confidence ${unit.sourceLocator.extractionConfidence}`;
      article.append(title, text, meta);
      for (const vector of unit.sizeSelections) { const row = document.createElement("p"); row.className = "evidence-vector"; row.textContent = `${vector.rawSizeVector} → ${vector.selectedSizeLabel}: ${vector.selectedRawValue ?? "не определено"}${vector.unit ? ` ${vector.unit}` : ""} · ${vector.selectionStatus}`; article.append(row); }
      details.append(article);
    }
    return details;
  }

  async function run(operation) {
    if (busy) return; busy = true; ui.error.textContent = ""; setDisabled(true);
    try { inspected = await operation(); }
    catch (error) { ui.error.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`; inspected = await evidenceApi.ensureForProject(repository, projectId); }
    finally { busy = false; setDisabled(false); render(); }
  }
  function setDisabled(value) { ui.build.disabled = value; ui.rebuild.disabled = value; ui.confirm.disabled = value; }
  function replaceList(node, values) { node.replaceChildren(...values.map((value) => { const item = document.createElement("li"); item.textContent = value; return item; })); }
  function statusLabel(inspectedState, status) { if (inspectedState === "stale") return "Источник изменился"; return ({ waiting: "Готово к извлечению", extracting: "Извлечение", draft: "Нужны решения", ready_to_confirm: "Можно подтвердить", confirmed: "Evidence подтверждено", failed: "Ошибка" })[status] || status; }
  function renderBlocked(code, missingFields = []) { ui.status.textContent = "Source instructions недоступны"; ui.error.textContent = `${code}: требуется один PDF с текстовым слоем и confirmed Stage 19.${missingFields.length ? ` Не хватает: ${missingFields.join(", ")}.` : ""}`; }
  function showFatal(message) { ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(window);
