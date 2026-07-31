"use strict";

const projectSystem = window.YarnAIProjectSystem;
const bindOffEngine = window.YarnAIFirstBindOff;
const errorPanel = document.querySelector("#bind-off-error");
const errorMessage = document.querySelector("#bind-off-error-message");
const workflow = document.querySelector("#bind-off-workflow");
const projectTitle = document.querySelector("#bind-off-project-title");
const statusMessage = document.querySelector("#bind-off-status-message");
const blockedPanel = document.querySelector("#bind-off-blocked-panel");
const blockersList = document.querySelector("#bind-off-blockers");
const warningsPanel = document.querySelector("#bind-off-warnings-panel");
const warningsList = document.querySelector("#bind-off-warnings");
const preparationPanel = document.querySelector("#bind-off-preparation-panel");
const preparationCount = document.querySelector("#bind-off-preparation-count");
const checklistForm = document.querySelector("#bind-off-checklist-form");
const checklist = document.querySelector("#bind-off-checklist");
const formError = document.querySelector("#bind-off-form-error");
const startButton = document.querySelector("#bind-off-start-button");
const partialButton = document.querySelector("#bind-off-partial-button");
const steppedButton = document.querySelector("#bind-off-stepped-button");
const specialButton = document.querySelector("#bind-off-special-button");
const instructionPanel = document.querySelector("#bind-off-instruction-panel");
const instructions = document.querySelector("#bind-off-instructions");
const progressPanel = document.querySelector("#bind-off-progress-panel");
const savedStatus = document.querySelector("#bind-off-saved-status");
const initialCount = document.querySelector("#bind-off-initial-count");
const boundCount = document.querySelector("#bind-off-bound-count");
const remainingCount = document.querySelector("#bind-off-remaining-count");
const progressText = document.querySelector("#bind-off-progress-text");
const progressBar = document.querySelector("#bind-off-progress");
const actionControls = document.querySelector("#bind-off-action-controls");
const oneButton = document.querySelector("#bind-off-one-button");
const fiveButton = document.querySelector("#bind-off-five-button");
const customForm = document.querySelector("#bind-off-custom-form");
const customAmount = document.querySelector("#bind-off-custom-amount");
const customButton = document.querySelector("#bind-off-custom-button");
const undoButton = document.querySelector("#bind-off-undo-button");
const finishPanel = document.querySelector("#bind-off-finish-panel");
const finishUndoButton = document.querySelector(
  "#bind-off-finish-undo-button",
);
const completeButton = document.querySelector("#bind-off-complete-button");
const completedPanel = document.querySelector("#bind-off-completed-panel");
const completedSummary = document.querySelector(
  "#bind-off-completed-summary",
);
const completedDate = document.querySelector("#bind-off-completed-date");
const shapingLink = document.querySelector("#bind-off-shaping-link");

let repository = null;
let inspection = null;
let projectId = null;
let busy = false;

initialize().catch((error) => {
  showError(
    error?.userMessage ||
      "Не удалось загрузить сохранённое закрытие петель. Данные не изменены.",
  );
});

async function initialize() {
  projectId = new URLSearchParams(window.location.search).get("project");
  if (
    !projectId ||
    !projectSystem ||
    !bindOffEngine ||
    !projectSystem.isUuidv7(projectId)
  ) {
    showError("Ссылка на проект повреждена. Сохранённые данные не изменены.");
    return;
  }
  repository = new projectSystem.ProjectRepository();
  await repository.initialize();
  try {
    inspection = await bindOffEngine.ensureForProject(repository, projectId);
  } catch (error) {
    const aggregate = await repository.getProject(projectId);
    inspection = bindOffEngine.inspectAggregate(aggregate);
    if (inspection.state !== "blocked") {
      throw error;
    }
  }
  bindActions();
  render(false);
}

function bindActions() {
  checklistForm.addEventListener("submit", startBindOff);
  partialButton.addEventListener("click", () => reportUnsupported("partial"));
  steppedButton.addEventListener("click", () => reportUnsupported("stepped"));
  specialButton.addEventListener("click", () => reportUnsupported("special"));
  oneButton.addEventListener("click", () => recordAmount(1));
  fiveButton.addEventListener("click", () => recordAmount(5));
  customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    recordAmount(customAmount.value);
  });
  undoButton.addEventListener("click", undoLast);
  finishUndoButton.addEventListener("click", undoLast);
  completeButton.addEventListener("click", completeBindOff);
}

function render(moveFocus) {
  errorPanel.hidden = true;
  workflow.hidden = false;
  shapingLink.href =
    `/shaping-assistant?project=${encodeURIComponent(projectId)}`;
  projectTitle.textContent =
    inspection.source?.projectTitle ||
    inspection.source?.project?.title ||
    "Сохранённый проект";

  const externalBlocked = inspection.state === "blocked";
  const bindOff = inspection.bindOff;
  const blocked = externalBlocked || bindOff?.status === "blocked";
  blockedPanel.hidden = !blocked;
  warningsPanel.hidden = !bindOff?.warnings?.length;
  preparationPanel.hidden = !(
    inspection.state === "ready" && bindOff.status === "ready"
  );
  instructionPanel.hidden = !(
    inspection.state === "ready" &&
    ["in_progress"].includes(bindOff.status)
  );
  progressPanel.hidden = !(
    inspection.state === "ready" && bindOff.status === "in_progress"
  );
  finishPanel.hidden = !(
    inspection.state === "ready" &&
    bindOff.status === "in_progress" &&
    bindOff.current_stitch_count === 0
  );
  completedPanel.hidden = !(
    inspection.state === "ready" && bindOff.status === "completed"
  );

  if (blocked) {
    const entries = externalBlocked
      ? inspection.blockers ?? [{ message: inspection.message }]
      : bindOff.blockers;
    blockersList.replaceChildren(
      ...entries.map((entry) => listItem(entry.message)),
    );
    statusMessage.textContent =
      "Продолжение заблокировано. Рабочий прогресс закрытия записывать нельзя.";
    return;
  }

  warningsList.replaceChildren(
    ...bindOff.warnings.map((entry) => listItem(entry.message)),
  );
  if (bindOff.status === "ready") {
    statusMessage.textContent =
      "Проверь короткий список подготовки перед началом.";
    preparationCount.textContent = String(bindOff.initial_stitch_count);
    renderChecklist(bindOff);
    return;
  }
  if (bindOff.status === "completed") {
    statusMessage.textContent = "Первая деталь завершена и сохранена.";
    completedSummary.textContent =
      `Фактически закрыто ${bindOff.bound_off_stitch_count} петель. На спице осталось 0.`;
    completedDate.textContent =
      `Сохранено ${new Intl.DateTimeFormat("ru", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(bindOff.completed_at))}.`;
    return;
  }
  renderInstructions(bindOff);
  renderProgress(bindOff, moveFocus);
}

function renderChecklist(bindOff) {
  checklist.replaceChildren(
    ...bindOff.preparation_checklist.map((item) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "preparation";
      input.value = item.id;
      input.required = item.required;
      input.checked = item.confirmed;
      const text = document.createElement("span");
      text.textContent = item.label;
      label.append(input, text);
      return label;
    }),
  );
}

function renderInstructions(bindOff) {
  instructions.replaceChildren(
    ...bindOffEngine.instructionsFor(bindOff).map((instruction) => {
      const item = document.createElement("li");
      item.textContent = instruction;
      return item;
    }),
  );
}

function renderProgress(bindOff, moveFocus) {
  initialCount.textContent = String(bindOff.initial_stitch_count);
  boundCount.textContent = String(bindOff.bound_off_stitch_count);
  remainingCount.textContent = String(bindOff.remaining_stitch_count);
  progressText.textContent =
    `${bindOff.bound_off_stitch_count} из ${bindOff.initial_stitch_count} петель закрыто`;
  progressBar.max = bindOff.initial_stitch_count;
  progressBar.value = bindOff.bound_off_stitch_count;
  progressBar.setAttribute(
    "aria-valuetext",
    `${bindOff.bound_off_stitch_count} закрыто, ${bindOff.remaining_stitch_count} осталось`,
  );
  savedStatus.textContent = "Сохранено";
  const zero = bindOff.current_stitch_count === 0;
  actionControls.hidden = zero;
  oneButton.disabled = busy || zero;
  fiveButton.hidden = bindOff.remaining_stitch_count < 5;
  fiveButton.disabled = busy || bindOff.remaining_stitch_count < 5;
  customAmount.max = String(bindOff.remaining_stitch_count);
  customAmount.disabled = busy || zero;
  customButton.disabled = busy || zero;
  undoButton.hidden = zero;
  undoButton.disabled = busy || bindOff.completed_actions.length === 0;
  finishUndoButton.disabled =
    busy || bindOff.completed_actions.length === 0;
  completeButton.disabled = busy || !bindOffEngine.canComplete(bindOff);
  statusMessage.textContent = zero
    ? "Все петли отмечены. Закрепи последнюю петлю и подтверди завершение."
    : `Осталось закрыть ${bindOff.remaining_stitch_count} петель. Каждое действие сохраняется.`;
  if (moveFocus) {
    progressText.focus();
  }
}

function listItem(message) {
  const item = document.createElement("li");
  item.textContent = message;
  return item;
}

async function startBindOff(event) {
  event.preventDefault();
  const selected = Array.from(
    checklistForm.querySelectorAll('input[name="preparation"]:checked'),
  ).map((input) => input.value);
  await runMutation(
    () => bindOffEngine.startForProject(repository, projectId, selected),
    "Не удалось начать закрытие петель.",
  );
}

async function recordAmount(amount) {
  const actionId = bindOffEngine.makeActionId();
  await runMutation(
    () =>
      bindOffEngine.addForProject(
        repository,
        projectId,
        amount,
        actionId,
      ),
    "Не удалось сохранить закрытые петли.",
  );
  customAmount.value = "";
}

async function reportUnsupported(requirement) {
  await runMutation(
    () =>
      bindOffEngine.reportUnsupportedForProject(
        repository,
        projectId,
        requirement,
      ),
    "Не удалось сохранить требуемый способ закрытия.",
  );
}

async function undoLast() {
  await runMutation(
    () => bindOffEngine.undoForProject(repository, projectId),
    "Не удалось исправить последнее действие.",
  );
}

async function completeBindOff() {
  await runMutation(
    () => bindOffEngine.completeForProject(repository, projectId, true),
    "Не удалось завершить первую деталь.",
  );
}

async function runMutation(operation, fallbackMessage) {
  if (busy) {
    return;
  }
  busy = true;
  setBusy(true);
  formError.textContent = "";
  try {
    inspection = await operation();
    render(true);
  } catch (error) {
    formError.textContent = error?.userMessage || fallbackMessage;
  } finally {
    busy = false;
    setBusy(false);
  }
}

function setBusy(disabled) {
  customAmount.disabled = disabled;
  [
    startButton,
    partialButton,
    steppedButton,
    specialButton,
    oneButton,
    fiveButton,
    customButton,
    undoButton,
    finishUndoButton,
    completeButton,
  ].forEach((button) => {
    button.disabled = disabled;
  });
  if (!disabled && inspection?.state === "ready") {
    const bindOff = inspection.bindOff;
    startButton.disabled = bindOff.status !== "ready";
    partialButton.disabled = bindOff.status !== "ready";
    steppedButton.disabled = bindOff.status !== "ready";
    specialButton.disabled = bindOff.status !== "ready";
    oneButton.disabled =
      bindOff.status !== "in_progress" || bindOff.current_stitch_count === 0;
    fiveButton.disabled =
      bindOff.status !== "in_progress" || bindOff.current_stitch_count < 5;
    customButton.disabled =
      bindOff.status !== "in_progress" || bindOff.current_stitch_count === 0;
    customAmount.disabled =
      bindOff.status !== "in_progress" || bindOff.current_stitch_count === 0;
    undoButton.disabled =
      bindOff.status !== "in_progress" ||
      bindOff.completed_actions.length === 0;
    finishUndoButton.disabled = undoButton.disabled;
    completeButton.disabled = !bindOffEngine.canComplete(bindOff);
  }
}

function showError(message) {
  workflow.hidden = true;
  errorPanel.hidden = false;
  errorMessage.textContent = message;
}
