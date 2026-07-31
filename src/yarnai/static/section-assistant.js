"use strict";

const projectSystem = window.YarnAIProjectSystem;
const sectionEngine = window.YarnAIFirstFabricSection;
const errorPanel = document.querySelector("#section-assistant-error");
const errorMessage = document.querySelector("#section-error-message");
const errorReturn = document.querySelector("#section-error-return");
const workflow = document.querySelector("#section-assistant-workflow");
const projectTitle = document.querySelector("#section-project-title");
const statusMessage = document.querySelector("#section-status-message");
const questionPanel = document.querySelector("#section-question-panel");
const questionForm = document.querySelector("#section-question-form");
const questionText = document.querySelector("#section-question-text");
const questionInputs = document.querySelector("#section-question-inputs");
const questionHelp = document.querySelector("#section-question-help");
const questionError = document.querySelector("#section-question-error");
const answerButton = document.querySelector("#section-answer-button");
const readyPanel = document.querySelector("#section-ready-panel");
const knittingMode = document.querySelector("#section-knitting-mode");
const fabricType = document.querySelector("#section-fabric-type");
const target = document.querySelector("#section-target");
const calculatedRows = document.querySelector("#section-calculated-rows");
const instructionSummary = document.querySelector("#section-instruction-summary");
const rowCalculation = document.querySelector("#section-row-calculation");
const startButton = document.querySelector("#section-start-button");
const blockedPanel = document.querySelector("#section-blocked-panel");
const blockingReasons = document.querySelector("#section-blocking-reasons");
const warningsPanel = document.querySelector("#section-warnings-panel");
const warnings = document.querySelector("#section-warnings");
const progressPanel = document.querySelector("#section-progress-panel");
const currentRow = document.querySelector("#section-current-row");
const rowType = document.querySelector("#section-row-type");
const currentInstruction = document.querySelector("#section-current-instruction");
const progressText = document.querySelector("#section-progress-text");
const progressBar = document.querySelector("#section-progress");
const rowBackButton = document.querySelector("#section-row-back-button");
const rowCompleteButton = document.querySelector("#section-row-complete-button");
const targetPanel = document.querySelector("#section-target-panel");
const targetBackButton = document.querySelector("#section-target-back-button");
const completeButton = document.querySelector("#section-complete-button");
const completedPanel = document.querySelector("#section-completed-panel");
const editPanel = document.querySelector("#section-edit-panel");
const editField = document.querySelector("#section-edit-field");
const editButton = document.querySelector("#section-edit-button");
const projectLink = document.querySelector("#section-project-link");

let repository = null;
let inspection = null;
let projectId = null;
let busy = false;

initialize().catch((error) => {
  showError(
    error?.userMessage ||
      "Не удалось загрузить сохранённый участок. Данные не изменены.",
  );
});

async function initialize() {
  projectId = new URLSearchParams(window.location.search).get("project");
  if (!projectId) {
    showError("В ссылке отсутствует project id.");
    return;
  }
  if (!projectSystem || !sectionEngine || !projectSystem.isUuidv7(projectId)) {
    showError("Ссылка на проект повреждена. Сохранённые данные не удалены.");
    return;
  }
  repository = new projectSystem.ProjectRepository();
  await repository.initialize();
  try {
    inspection = await sectionEngine.ensureForProject(repository, projectId);
  } catch (error) {
    showError(
      error?.userMessage ||
        "Проект или завершённый набор петель не найден. Данные не изменены.",
    );
    return;
  }
  bindActions();
  render(false);
}

function bindActions() {
  questionForm.addEventListener("submit", saveAnswer);
  startButton.addEventListener("click", startSection);
  rowCompleteButton.addEventListener("click", completeRow);
  rowBackButton.addEventListener("click", decreaseRow);
  targetBackButton.addEventListener("click", decreaseRow);
  completeButton.addEventListener("click", completeSection);
  editButton.addEventListener("click", editAnswer);
}

function render(moveFocus) {
  const section = inspection.section;
  errorPanel.hidden = true;
  workflow.hidden = false;
  projectTitle.textContent =
    inspection.source.project.title || "Сохранённый проект";
  projectLink.href = "/";

  questionPanel.hidden = section.status !== "collecting";
  readyPanel.hidden = section.status !== "ready";
  blockedPanel.hidden = section.status !== "blocked";
  progressPanel.hidden =
    section.status !== "in_progress" || sectionEngine.targetReached(section);
  targetPanel.hidden =
    section.status !== "in_progress" || !sectionEngine.targetReached(section);
  completedPanel.hidden = section.status !== "completed";
  editPanel.hidden = !["ready", "blocked"].includes(section.status);

  renderWarnings(section);
  renderEditFields(section);

  if (section.status === "collecting") {
    statusMessage.textContent =
      "Сохранённых данных пока недостаточно. Нужен только следующий ответ.";
    renderQuestion(inspection.nextQuestion);
    if (moveFocus) {
      questionText.focus?.();
    }
    return;
  }
  if (section.status === "blocked") {
    statusMessage.textContent =
      "Участок заблокирован: безопасная инструкция не создана.";
    blockingReasons.replaceChildren(
      ...section.blocking_reasons.map((reason) => {
        const item = document.createElement("li");
        item.textContent = reason.message;
        return item;
      }),
    );
    return;
  }
  if (section.status === "ready") {
    statusMessage.textContent =
      "Данных достаточно. Проверь проект участка перед началом.";
    renderSectionFacts(section);
    if (moveFocus) {
      startButton.focus();
    }
    return;
  }
  if (section.status === "in_progress") {
    renderProgress(section, moveFocus);
    return;
  }
  statusMessage.textContent =
    "Первый участок завершён. Дальнейшая технология автоматически не создаётся.";
}

function renderQuestion(question) {
  questionError.textContent = "";
  questionInputs.replaceChildren();
  if (!question) {
    questionText.textContent = "Не удалось определить следующий вопрос.";
    answerButton.disabled = true;
    return;
  }
  answerButton.disabled = busy;
  questionText.textContent = question.text;
  questionText.dataset.questionId = question.id;
  questionHelp.hidden = !question.help;
  questionHelp.textContent = question.help || "";
  if (question.type === "choice") {
    question.options.forEach((option, index) => {
      const label = document.createElement("label");
      label.className = "section-choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "section-answer";
      input.value = String(option.value);
      input.required = true;
      if (index === 0) {
        input.autofocus = true;
      }
      const text = document.createElement("span");
      text.textContent = option.label;
      label.append(input, text);
      questionInputs.append(label);
    });
    return;
  }
  const label = document.createElement("label");
  label.className = "section-number-answer";
  const input = document.createElement("input");
  input.id = "section-number-answer";
  input.name = "section-answer";
  input.type = "number";
  input.min = String(question.min);
  input.step = String(question.step);
  input.required = true;
  input.inputMode = "decimal";
  const suffix = document.createElement("span");
  suffix.textContent = question.suffix;
  label.append(input, suffix);
  questionInputs.append(label);
}

async function saveAnswer(event) {
  event.preventDefault();
  if (busy || !inspection?.nextQuestion) {
    return;
  }
  const input = questionForm.elements.namedItem("section-answer");
  const value =
    input instanceof RadioNodeList ? input.value : input?.value;
  if (value === "") {
    questionError.textContent = "Выбери или введи ответ.";
    return;
  }
  await runMutation(
    () =>
      sectionEngine.answerForProject(
        repository,
        projectId,
        inspection.nextQuestion.id,
        value,
      ),
    "Не удалось сохранить ответ.",
  );
}

async function startSection() {
  await runMutation(
    () => sectionEngine.startForProject(repository, projectId),
    "Не удалось начать участок.",
  );
}

async function completeRow() {
  await runMutation(
    () => sectionEngine.completeCurrentRow(repository, projectId),
    "Не удалось сохранить завершение ряда.",
  );
}

async function decreaseRow() {
  await runMutation(
    () => sectionEngine.decreaseCurrentRow(repository, projectId),
    "Не удалось исправить номер ряда.",
  );
}

async function completeSection() {
  await runMutation(
    () => sectionEngine.completeForProject(repository, projectId),
    "Не удалось завершить участок.",
  );
}

async function editAnswer() {
  const questionId = editField.value;
  if (!questionId) {
    return;
  }
  await runMutation(
    () =>
      sectionEngine.clearAnswerForProject(repository, projectId, questionId),
    "Не удалось открыть ответ для исправления.",
  );
}

async function runMutation(action, fallbackMessage) {
  if (busy) {
    return;
  }
  busy = true;
  setButtonsDisabled(true);
  questionError.textContent = "";
  try {
    inspection = await action();
    render(true);
  } catch (error) {
    questionError.textContent = error?.userMessage || fallbackMessage;
  } finally {
    busy = false;
    setButtonsDisabled(false);
  }
}

function renderSectionFacts(section) {
  knittingMode.textContent = sectionEngine.knittingModeLabel(
    section.knitting_mode,
  );
  fabricType.textContent = sectionEngine.fabricTypeLabel(section.fabric_type);
  target.textContent = sectionEngine.targetLabel(section);
  calculatedRows.textContent = String(section.calculated_row_count);
  instructionSummary.textContent = section.instruction_summary;
  rowCalculation.hidden = !section.row_calculation_explanation;
  rowCalculation.textContent = section.row_calculation_explanation || "";
}

function renderProgress(section, moveFocus) {
  const completed = sectionEngine.completedRowCount(section);
  const total = section.calculated_row_count;
  statusMessage.textContent = `${completed} из ${total} рядов выполнено.`;
  currentRow.textContent = String(section.current_row);
  rowType.textContent =
    section.knitting_mode === "round"
      ? "Круговой"
      : section.current_row % 2 === 1
        ? "Нечётный"
        : "Чётный";
  currentInstruction.textContent = sectionEngine.currentInstruction(section);
  progressText.textContent = `${completed} из ${total} рядов`;
  progressBar.max = total;
  progressBar.value = completed;
  progressBar.setAttribute(
    "aria-valuetext",
    `${completed} из ${total} рядов выполнено`,
  );
  rowBackButton.disabled = busy || section.current_row <= 1;
  if (moveFocus) {
    progressText.focus();
  }
}

function renderWarnings(section) {
  warningsPanel.hidden = section.warnings.length === 0;
  warnings.replaceChildren(
    ...section.warnings.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning.message;
      return item;
    }),
  );
}

function renderEditFields(section) {
  const labels = {
    knitting_mode: "Способ вязания",
    fabric_type: "Тип полотна",
    custom_pattern_confirmed: "Наличие схемы узора",
    shaping_required: "Формирование",
    edge_stitches_included: "Кромочные петли",
    target_mode: "Тип цели",
    target_length_cm: "Целевая длина",
    target_row_count: "Целевое число рядов",
    row_gauge: "Плотность рядов",
  };
  const keys = Object.keys(section.answers).filter((key) => labels[key]);
  editField.replaceChildren(
    ...keys.map((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = labels[key];
      return option;
    }),
  );
  editButton.disabled = keys.length === 0 || busy;
}

function setButtonsDisabled(disabled) {
  if (!disabled) {
    const section = inspection?.section;
    const inProgress = section?.status === "in_progress";
    const reached = inProgress && sectionEngine.targetReached(section);
    answerButton.disabled = section?.status !== "collecting";
    startButton.disabled = section?.status !== "ready";
    rowBackButton.disabled =
      !inProgress || reached || section.current_row <= 1;
    rowCompleteButton.disabled = !inProgress || reached;
    targetBackButton.disabled =
      !inProgress || !reached || section.current_row <= 1;
    completeButton.disabled = !inProgress || !reached;
    editButton.disabled =
      !["ready", "blocked"].includes(section?.status) ||
      editField.options.length === 0;
    return;
  }
  [
    answerButton,
    startButton,
    rowBackButton,
    rowCompleteButton,
    targetBackButton,
    completeButton,
    editButton,
  ].forEach((button) => {
    button.disabled = disabled;
  });
}

function showError(message) {
  workflow.hidden = true;
  errorPanel.hidden = false;
  errorMessage.textContent = message;
  errorReturn.href = "/";
}
