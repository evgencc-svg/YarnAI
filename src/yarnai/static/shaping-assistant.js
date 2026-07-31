"use strict";

const projectSystem = window.YarnAIProjectSystem;
const shapingEngine = window.YarnAIFirstSimpleShaping;
const errorPanel = document.querySelector("#shaping-assistant-error");
const errorMessage = document.querySelector("#shaping-error-message");
const workflow = document.querySelector("#shaping-assistant-workflow");
const projectTitle = document.querySelector("#shaping-project-title");
const statusMessage = document.querySelector("#shaping-status-message");
const questionPanel = document.querySelector("#shaping-question-panel");
const questionForm = document.querySelector("#shaping-question-form");
const questionText = document.querySelector("#shaping-question-text");
const questionInputs = document.querySelector("#shaping-question-inputs");
const questionError = document.querySelector("#shaping-question-error");
const answerButton = document.querySelector("#shaping-answer-button");
const declinedPanel = document.querySelector("#shaping-declined-panel");
const planPanel = document.querySelector("#shaping-plan-panel");
const startCount = document.querySelector("#shaping-start-count");
const targetCount = document.querySelector("#shaping-target-count");
const totalRows = document.querySelector("#shaping-total-rows");
const eventsCount = document.querySelector("#shaping-events-count");
const decreaseRows = document.querySelector("#shaping-decrease-rows");
const startButton = document.querySelector("#shaping-start-button");
const blockedPanel = document.querySelector("#shaping-blocked-panel");
const blockers = document.querySelector("#shaping-blockers");
const warningsPanel = document.querySelector("#shaping-warnings-panel");
const warnings = document.querySelector("#shaping-warnings");
const progressPanel = document.querySelector("#shaping-progress-panel");
const currentRow = document.querySelector("#shaping-current-row");
const currentCount = document.querySelector("#shaping-current-count");
const currentInstruction = document.querySelector(
  "#shaping-current-instruction",
);
const progressText = document.querySelector("#shaping-progress-text");
const progressBar = document.querySelector("#shaping-progress");
const rowBackButton = document.querySelector("#shaping-row-back-button");
const rowCompleteButton = document.querySelector(
  "#shaping-row-complete-button",
);
const targetPanel = document.querySelector("#shaping-target-panel");
const finalCount = document.querySelector("#shaping-final-count");
const targetBackButton = document.querySelector("#shaping-target-back-button");
const completeButton = document.querySelector("#shaping-complete-button");
const completedPanel = document.querySelector("#shaping-completed-panel");
const completedSummary = document.querySelector("#shaping-completed-summary");
const editPanel = document.querySelector("#shaping-edit-panel");
const editField = document.querySelector("#shaping-edit-field");
const editButton = document.querySelector("#shaping-edit-button");
const sectionLink = document.querySelector("#shaping-section-link");

let repository = null;
let inspection = null;
let projectId = null;
let busy = false;

initialize().catch((error) => {
  showError(
    error?.userMessage ||
      "Не удалось загрузить сохранённое формирование. Данные не изменены.",
  );
});

async function initialize() {
  projectId = new URLSearchParams(window.location.search).get("project");
  if (!projectId) {
    showError("В ссылке отсутствует project id.");
    return;
  }
  if (!projectSystem || !shapingEngine || !projectSystem.isUuidv7(projectId)) {
    showError("Ссылка на проект повреждена. Сохранённые данные не удалены.");
    return;
  }
  repository = new projectSystem.ProjectRepository();
  await repository.initialize();
  try {
    inspection = await shapingEngine.ensureForProject(repository, projectId);
  } catch (error) {
    showError(
      error?.userMessage ||
        "Завершённый первый участок не найден. Данные не изменены.",
    );
    return;
  }
  bindActions();
  render(false);
}

function bindActions() {
  questionForm.addEventListener("submit", saveAnswer);
  startButton.addEventListener("click", startShaping);
  rowCompleteButton.addEventListener("click", completeRow);
  rowBackButton.addEventListener("click", decreaseRow);
  targetBackButton.addEventListener("click", decreaseRow);
  completeButton.addEventListener("click", completeShaping);
  editButton.addEventListener("click", editAnswer);
}

function render(moveFocus) {
  errorPanel.hidden = true;
  workflow.hidden = false;
  projectTitle.textContent =
    inspection.source?.project?.title || "Сохранённый проект";
  sectionLink.href =
    `/section-assistant?project=${encodeURIComponent(projectId)}`;

  const state = inspection.state;
  const shaping = inspection.shaping;
  questionPanel.hidden =
    state !== "collecting" &&
    !(state === "ready" && shaping.status === "collecting");
  declinedPanel.hidden = state !== "declined";
  planPanel.hidden = !(
    state === "ready" && ["ready", "in_progress"].includes(shaping.status)
  );
  blockedPanel.hidden = !(
    state === "ready" && shaping.status === "blocked"
  );
  progressPanel.hidden = !(
    state === "ready" &&
    shaping.status === "in_progress" &&
    !shapingEngine.rowsProcessed(shaping)
  );
  targetPanel.hidden = !(
    state === "ready" &&
    shaping.status === "in_progress" &&
    shapingEngine.rowsProcessed(shaping)
  );
  completedPanel.hidden = !(
    state === "ready" && shaping.status === "completed"
  );
  editPanel.hidden = !(
    state === "ready" && ["ready", "blocked"].includes(shaping.status)
  );

  if (state === "collecting") {
    statusMessage.textContent =
      "Первый прямой участок завершён. Нужен только следующий ответ.";
    renderQuestion(inspection.nextQuestion);
    return;
  }
  if (state === "declined") {
    statusMessage.textContent =
      "Ответ сохранён. Этап убавлений не создавался.";
    return;
  }
  if (state !== "ready") {
    showError(inspection.message || "Формирование недоступно.");
    return;
  }

  renderWarnings(shaping);
  renderEditFields(shaping);
  if (shaping.status === "collecting") {
    statusMessage.textContent =
      "Для плана нужен один следующий ответ. Известные данные повторно не спрашиваются.";
    renderQuestion(inspection.nextQuestion);
    return;
  }
  if (shaping.status === "blocked") {
    statusMessage.textContent =
      "Безопасный план не создан: проверь причины блокировки.";
    blockers.replaceChildren(
      ...shaping.blockers.map((blocker) => listItem(blocker.message)),
    );
    return;
  }

  renderPlan(shaping);
  if (shaping.status === "ready") {
    statusMessage.textContent =
      "План рассчитан. После начала список рядов не изменится.";
    startButton.hidden = false;
    if (moveFocus) {
      startButton.focus();
    }
    return;
  }
  startButton.hidden = true;
  if (shaping.status === "in_progress") {
    statusMessage.textContent =
      shapingEngine.rowsProcessed(shaping)
        ? "Все ряды сохранены. Проверь итог и явно заверши этап."
        : "Следуй инструкции текущего ряда.";
    renderProgress(shaping, moveFocus);
    return;
  }
  statusMessage.textContent = "Этап завершён и сохранён.";
  completedSummary.textContent =
    `После ${shaping.total_rows} рядов осталось ` +
    `${shaping.current_stitch_count} петель.`;
}

function renderQuestion(question) {
  questionError.textContent = "";
  questionInputs.replaceChildren();
  if (!question) {
    questionText.textContent = "Не удалось определить следующий вопрос.";
    answerButton.disabled = true;
    return;
  }
  questionText.textContent = question.text;
  questionText.dataset.questionId = question.id;
  answerButton.disabled = busy;
  if (question.type === "choice") {
    question.options.forEach((option, index) => {
      const label = document.createElement("label");
      label.className = "section-choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "shaping-answer";
      input.value = String(option.value);
      input.required = true;
      input.autofocus = index === 0;
      const caption = document.createElement("span");
      caption.textContent = option.label;
      label.append(input, caption);
      questionInputs.append(label);
    });
    return;
  }
  const label = document.createElement("label");
  label.className = "section-number-answer";
  const input = document.createElement("input");
  input.id = "shaping-number-answer";
  input.name = "shaping-answer";
  input.type = "number";
  input.min = String(question.min);
  input.step = String(question.step);
  input.required = true;
  input.inputMode = "numeric";
  const suffix = document.createElement("span");
  suffix.textContent = question.suffix;
  label.append(input, suffix);
  questionInputs.append(label);
}

function renderPlan(shaping) {
  startCount.textContent = String(shaping.starting_stitch_count);
  targetCount.textContent = String(shaping.target_stitch_count);
  totalRows.textContent = String(shaping.total_rows);
  eventsCount.textContent = String(shaping.decrease_events_count);
  decreaseRows.textContent = shaping.decrease_rows.join(", ");
}

function renderProgress(shaping, moveFocus) {
  const completed = shapingEngine.completedRowCount(shaping);
  currentRow.textContent = String(shaping.current_row);
  currentCount.textContent = `${shaping.current_stitch_count} петель`;
  currentInstruction.textContent =
    shapingEngine.currentInstruction(shaping);
  progressText.textContent = `${completed} из ${shaping.total_rows} рядов`;
  progressBar.max = shaping.total_rows;
  progressBar.value = completed;
  progressBar.setAttribute(
    "aria-valuetext",
    `${completed} из ${shaping.total_rows} рядов выполнено`,
  );
  finalCount.textContent = String(shaping.target_stitch_count);
  rowBackButton.disabled = busy || shaping.current_row <= 1;
  targetBackButton.disabled = busy || shaping.current_row <= 1;
  if (moveFocus) {
    progressText.focus();
  }
}

function renderWarnings(shaping) {
  warningsPanel.hidden = shaping.warnings.length === 0;
  warnings.replaceChildren(
    ...shaping.warnings.map((warning) => listItem(warning.message)),
  );
}

function renderEditFields(shaping) {
  const labels = {
    target_stitch_count: "Целевое число петель",
    total_rows: "Количество рядов",
    edge_stitches_mode: "Описание кромочных",
  };
  const keys = Object.keys(shaping.answers).filter((key) => labels[key]);
  editField.replaceChildren(
    ...keys.map((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = labels[key];
      return option;
    }),
  );
  editButton.disabled = busy || keys.length === 0;
}

function listItem(message) {
  const item = document.createElement("li");
  item.textContent = message;
  return item;
}

async function saveAnswer(event) {
  event.preventDefault();
  if (busy || !inspection.nextQuestion) {
    return;
  }
  const input = questionForm.elements.namedItem("shaping-answer");
  const value = input instanceof RadioNodeList ? input.value : input?.value;
  if (value === "") {
    questionError.textContent = "Выбери или введи ответ.";
    return;
  }
  await runMutation(
    () =>
      shapingEngine.answerForProject(
        repository,
        projectId,
        inspection.nextQuestion.id,
        value,
      ),
    "Не удалось сохранить ответ.",
  );
}

async function startShaping() {
  await runMutation(
    () => shapingEngine.startForProject(repository, projectId),
    "Не удалось начать формирование.",
  );
}

async function completeRow() {
  await runMutation(
    () => shapingEngine.completeCurrentRow(repository, projectId),
    "Не удалось сохранить завершение ряда.",
  );
}

async function decreaseRow() {
  await runMutation(
    () => shapingEngine.decreaseCurrentRow(repository, projectId),
    "Не удалось исправить предыдущий ряд.",
  );
}

async function completeShaping() {
  await runMutation(
    () => shapingEngine.completeForProject(repository, projectId),
    "Не удалось завершить формирование.",
  );
}

function editAnswer() {
  const definition = shapingEngine.QUESTION_DEFINITIONS[editField.value];
  if (!definition) {
    return;
  }
  inspection = { ...inspection, nextQuestion: definition };
  renderQuestion(definition);
  questionPanel.hidden = false;
  questionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runMutation(operation, fallbackMessage) {
  if (busy) {
    return;
  }
  busy = true;
  setButtonsDisabled(true);
  questionError.textContent = "";
  try {
    inspection = await operation();
    render(true);
  } catch (error) {
    questionError.textContent = error?.userMessage || fallbackMessage;
  } finally {
    busy = false;
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  if (disabled) {
    [
      answerButton,
      startButton,
      rowBackButton,
      rowCompleteButton,
      targetBackButton,
      completeButton,
      editButton,
    ].forEach((button) => {
      button.disabled = true;
    });
    return;
  }
  const shaping = inspection?.shaping;
  answerButton.disabled = false;
  startButton.disabled = shaping?.status !== "ready";
  rowBackButton.disabled =
    shaping?.status !== "in_progress" || shaping.current_row <= 1;
  rowCompleteButton.disabled =
    shaping?.status !== "in_progress" ||
    shapingEngine.rowsProcessed(shaping);
  targetBackButton.disabled =
    shaping?.status !== "in_progress" || shaping.current_row <= 1;
  completeButton.disabled =
    shaping?.status !== "in_progress" ||
    !shapingEngine.rowsProcessed(shaping);
  editButton.disabled =
    !["ready", "blocked"].includes(shaping?.status) ||
    editField.options.length === 0;
}

function showError(message) {
  workflow.hidden = true;
  errorPanel.hidden = false;
  errorMessage.textContent = message;
}
