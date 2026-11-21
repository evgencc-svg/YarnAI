"use strict";

(function initializePatternExecutionPrintPage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const exportApi = globalObject.YarnAIPatternExecutionExport;
  const byId = (id) => document.getElementById(id);
  const ui = {
    loading: byId("execution-export-loading"), blocked: byId("execution-export-blocked"), blockedMessage: byId("execution-export-blocked-message"), blockedBack: byId("execution-export-blocked-back"),
    document: byId("execution-export-document"), print: byId("execution-export-print"), back: byId("execution-export-back"),
    title: byId("execution-export-title"), purpose: byId("execution-export-purpose"), before: byId("execution-export-before"), changes: byId("execution-export-changes"),
    glossarySection: byId("execution-export-glossary-section"), glossary: byId("execution-export-glossary"), virtualStatus: byId("execution-export-virtual-status"), physicalStatus: byId("execution-export-physical-status"),
    stepCount: byId("execution-export-step-count"), sections: byId("execution-export-sections"), legal: byId("execution-export-legal"),
  };

  initialize().catch((error) => showBlocked(error?.userMessage || "Не удалось открыть печатную инструкцию."));

  async function initialize() {
    const projectId = new URLSearchParams(globalObject.location.search).get("project");
    const back = projectId && system?.isUuidv7(projectId) ? `/pattern-execution-plan?project=${encodeURIComponent(projectId)}` : "/saved-projects";
    ui.back.href = back;
    ui.blockedBack.href = back;
    if (!projectId || !system?.isUuidv7(projectId) || !exportApi) return showBlocked("Откройте экспорт из готового плана сохранённого проекта.");
    const repository = new system.ProjectRepository();
    try {
      await repository.initialize();
      const aggregate = await repository.getProject(projectId);
      const inspected = exportApi.inspectAggregate(aggregate);
      if (inspected.state !== "ready") return showBlocked(inspected.message);
      render(inspected.model);
      ui.print.addEventListener("click", () => globalObject.print());
    } finally {
      await repository.close();
    }
  }

  function render(model) {
    ui.loading.hidden = true;
    ui.blocked.hidden = true;
    ui.document.hidden = false;
    ui.title.textContent = model.title;
    ui.purpose.textContent = model.purpose;
    ui.before.replaceChildren(...model.beforeStart.map(definitionNode));
    ui.changes.replaceChildren(...model.changes.map(changeNode));
    if (!model.changes.length) ui.changes.append(paragraph("Подтверждённые изменения для вывода отсутствуют; догадки не добавлены."));
    ui.glossarySection.hidden = model.glossary.length === 0;
    ui.glossary.replaceChildren(...model.glossary.flatMap((entry) => glossaryNodes(entry)));
    ui.virtualStatus.textContent = model.statuses.virtual;
    ui.physicalStatus.textContent = model.statuses.physical;
    ui.stepCount.textContent = `Всего: ${model.stepCount} последовательных шагов.`;
    ui.sections.replaceChildren(...model.sections.map(sectionNode));
    ui.legal.textContent = model.legalNotice;
  }

  function definitionNode(entry) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = entry.label;
    description.textContent = entry.value;
    wrapper.append(term, description);
    return wrapper;
  }

  function changeNode(entry) {
    const article = document.createElement("article");
    article.className = "print-change";
    const title = document.createElement("h3");
    title.textContent = entry.title;
    article.append(title, labelledParagraph("Было", entry.before), labelledParagraph("Стало", entry.after), labelledParagraph("Почему", entry.why), labelledParagraph("Практический смысл", entry.practical));
    return article;
  }

  function labelledParagraph(label, value) {
    const node = document.createElement("p");
    const strong = document.createElement("span");
    strong.className = "change-label";
    strong.textContent = `${label}: `;
    node.append(strong, document.createTextNode(value));
    return node;
  }

  function glossaryNodes(entry) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = entry.abbreviation;
    description.textContent = entry.meaning;
    return [term, description];
  }

  function sectionNode(section) {
    const wrapper = document.createElement("section");
    wrapper.className = "print-phase";
    const heading = document.createElement("h3");
    heading.textContent = section.title;
    wrapper.append(heading, ...section.steps.map(stepNode));
    return wrapper;
  }

  function stepNode(step) {
    const article = document.createElement("article");
    article.className = "print-step";
    const number = document.createElement("span");
    number.className = "step-number";
    number.textContent = String(step.number);
    number.setAttribute("aria-label", `Шаг ${step.number}`);
    const body = document.createElement("div");
    body.className = "step-body";
    const heading = document.createElement("h4");
    heading.textContent = step.title;
    body.append(heading, paragraph(step.instruction), ...step.details.map((entry) => paragraph(entry, "step-detail")));
    article.append(number, body);
    return article;
  }

  function paragraph(value, className = "") {
    const node = document.createElement("p");
    node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  function showBlocked(message) {
    ui.loading.hidden = true;
    ui.document.hidden = true;
    ui.blocked.hidden = false;
    ui.blockedMessage.textContent = message;
  }
})(window);
