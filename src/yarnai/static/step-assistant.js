"use strict";

const calculationState = window.YarnAISmartStartState;
const assistantState = window.YarnAIStepAssistantState;
const projectSystem = window.YarnAIProjectSystem;
const firstKnittingStep = window.YarnAIFirstKnittingStep;
const emptyState = document.querySelector("#step-assistant-empty");
const errorState = document.querySelector("#step-assistant-error");
const errorMessage = document.querySelector("#step-assistant-error-message");
const errorReturn = document.querySelector("#step-assistant-error-return");
const workflow = document.querySelector("#step-assistant-workflow");
const activeRowPanel = document.querySelector("#active-row-panel");
const rowCompletionPanel = document.querySelector("#row-completion-panel");
const rowNumber = document.querySelector("#row-number");
const rowType = document.querySelector("#row-type");
const stitchTarget = document.querySelector("#stitch-target");
const stitchCompleted = document.querySelector("#stitch-completed");
const stitchRemaining = document.querySelector("#stitch-remaining");
const stitchProgressText = document.querySelector("#stitch-progress-text");
const stitchProgress = document.querySelector("#stitch-progress");
const nextStitchButton = document.querySelector("#next-stitch-button");
const backStitchButton = document.querySelector("#back-stitch-button");
const completedRowNumber = document.querySelector("#completed-row-number");
const completedRowSummary = document.querySelector("#completed-row-summary");
const completionBackButton = document.querySelector("#completion-back-button");
const nextRowButton = document.querySelector("#next-row-button");
const projectTitle = document.querySelector("#assistant-project-title");
const stepInstruction = document.querySelector("#assistant-step-instruction");
const projectTargetLabel = document.querySelector("#project-target-label");
const currentLabel = document.querySelector("#assistant-current-label");
const currentTitle = document.querySelector("#assistant-current-title");
const targetCountLabel = document.querySelector("#assistant-target-count-label");
const completedCountLabel = document.querySelector(
  "#assistant-completed-count-label",
);
const completionLabel = document.querySelector("#assistant-completion-label");
const smartStartLink = document.querySelector("#assistant-smart-start-link");
const projectLink = document.querySelector("#assistant-project-link");
const nextTechnologyMessage = document.querySelector(
  "#next-technology-message",
);

let calculation = null;
let progress = null;
let repository = null;
let projectInspection = null;
let projectId = null;
let busy = false;

initializeStepAssistant().catch((error) => {
  showProjectError(
    error?.userMessage ||
      "Step Assistant не смог загрузить сохранённый проект. Данные не изменены.",
  );
});

async function initializeStepAssistant() {
  projectId = new URLSearchParams(window.location.search).get("project");
  if (projectId !== null) {
    await initializeProjectMode(projectId);
    return;
  }
  initializeStandaloneMode();
}

async function initializeProjectMode(requestedProjectId) {
  if (
    !projectSystem ||
    !firstKnittingStep ||
    !projectSystem.isUuidv7(requestedProjectId)
  ) {
    showProjectError(
      requestedProjectId
        ? "Ссылка на проект повреждена. Сохранённые данные не удалены."
        : "В ссылке отсутствует идентификатор проекта.",
    );
    return;
  }
  repository = new projectSystem.ProjectRepository();
  await repository.initialize();
  try {
    projectInspection = await firstKnittingStep.loadForProject(
      repository,
      requestedProjectId,
    );
  } catch (error) {
    showProjectError(
      error?.userMessage ||
        "Первый шаг проекта не найден. Вернитесь к сохранённому результату.",
      requestedProjectId,
    );
    return;
  }
  if (projectInspection.step.status === "not_started") {
    showProjectError(
      "Сначала подтверди подготовку и начало вязания на экране результата.",
      requestedProjectId,
    );
    return;
  }
  if (projectInspection.step.status === "blocked") {
    showProjectError(
      "Первый шаг заблокирован сохранённым состоянием проекта.",
      requestedProjectId,
    );
    return;
  }

  configureProjectMode();
  bindProjectActions();
  renderProjectMode(false);
}

function configureProjectMode() {
  const step = projectInspection.step;
  const project = projectInspection.source.project;
  emptyState.hidden = true;
  errorState.hidden = true;
  workflow.hidden = false;
  smartStartLink.hidden = true;
  projectLink.href = `/calculator?project=${encodeURIComponent(project.project_id)}`;
  projectTitle.textContent = project.title || "Сохранённый проект";
  stepInstruction.textContent = step.instruction;
  projectTargetLabel.textContent = "петель нужно набрать";
  currentLabel.textContent = "Набор петель";
  currentTitle.textContent = step.title;
  targetCountLabel.textContent = "Нужно набрать";
  completedCountLabel.textContent = "Уже набрано";
  completionLabel.textContent = "Первый шаг";
  rowType.hidden = true;
  stitchProgress.setAttribute("aria-label", "Прогресс набора петель");
  document.querySelector("#page-title").textContent = "Первый шаг проекта";
  document.querySelector(".intro-copy").textContent =
    "Отмечай набранные петли. Прогресс сохраняется в проекте после каждого изменения.";
}

function bindProjectActions() {
  nextStitchButton.addEventListener("click", () => changeProjectCount(1));
  backStitchButton.addEventListener("click", () => changeProjectCount(-1));
  completionBackButton.addEventListener("click", () => changeProjectCount(-1));
  nextRowButton.addEventListener("click", completeProjectStep);
}

async function changeProjectCount(delta) {
  if (busy || !repository || !projectId) {
    return;
  }
  busy = true;
  setProjectButtonsDisabled(true);
  try {
    projectInspection = await firstKnittingStep.changeCurrentCount(
      repository,
      projectId,
      delta,
    );
    renderProjectMode(true);
  } catch (error) {
    completedRowSummary.textContent =
      error?.userMessage || "Не удалось сохранить изменение счётчика.";
  } finally {
    busy = false;
    setProjectButtonsDisabled(false);
    renderProjectButtonAvailability();
  }
}

async function completeProjectStep() {
  if (busy || !repository || !projectId) {
    return;
  }
  busy = true;
  setProjectButtonsDisabled(true);
  try {
    projectInspection = await firstKnittingStep.completeForProject(
      repository,
      projectId,
    );
    renderProjectMode(true);
  } catch (error) {
    completedRowSummary.textContent =
      error?.userMessage || "Не удалось подтвердить завершение шага.";
  } finally {
    busy = false;
    setProjectButtonsDisabled(false);
    renderProjectButtonAvailability();
  }
}

function renderProjectMode(moveFocus) {
  const step = projectInspection.step;
  const total = step.target_stitch_count;
  const completed = step.current_stitch_count;
  const remaining = total - completed;
  const targetReached = completed === total;
  const explicitlyCompleted = step.status === "completed";

  document.querySelector("#project-stitch-count").textContent = String(total);
  rowNumber.textContent = "1";
  stitchTarget.textContent = String(total);
  stitchCompleted.textContent = String(completed);
  stitchRemaining.textContent = String(remaining);
  stitchProgressText.textContent = `${completed} / ${total}`;
  stitchProgress.max = total;
  stitchProgress.value = completed;
  stitchProgress.setAttribute(
    "aria-valuetext",
    `${completed} из ${total} петель набрано`,
  );
  activeRowPanel.hidden = targetReached;
  rowCompletionPanel.hidden = !targetReached;
  nextTechnologyMessage.hidden = !explicitlyCompleted;
  completionBackButton.hidden = explicitlyCompleted;
  nextRowButton.hidden = explicitlyCompleted;

  if (targetReached) {
    completedRowNumber.textContent = "";
    if (explicitlyCompleted) {
      document.querySelector("#row-completion-title").textContent =
        "Набор петель завершён";
      completedRowSummary.textContent =
        `${total} ${pluralizeStitches(total)} сохранено в проекте.`;
    } else {
      document.querySelector("#row-completion-title").textContent =
        "Целевое количество набрано";
      completedRowSummary.textContent =
        `Набрано ${total} ${pluralizeStitches(total)}. ` +
        "Шаг ещё не завершён — проверь количество и подтверди.";
      nextRowButton.textContent = "Подтвердить завершение набора";
    }
    if (moveFocus) {
      document.querySelector("#row-completion-title").focus();
    }
  } else if (moveFocus) {
    stitchProgressText.focus();
  }
  renderProjectButtonAvailability();
}

function renderProjectButtonAvailability() {
  const step = projectInspection?.step;
  if (!step) {
    return;
  }
  backStitchButton.disabled = busy || step.current_stitch_count === 0;
  nextStitchButton.disabled =
    busy || step.current_stitch_count >= step.target_stitch_count;
  completionBackButton.disabled = busy || step.status === "completed";
  nextRowButton.disabled =
    busy ||
    step.status === "completed" ||
    step.current_stitch_count !== step.target_stitch_count;
}

function setProjectButtonsDisabled(disabled) {
  nextStitchButton.disabled = disabled;
  backStitchButton.disabled = disabled;
  completionBackButton.disabled = disabled;
  nextRowButton.disabled = disabled;
}

function initializeStandaloneMode() {
  const storage = getLocalStorage();
  if (!calculationState || !assistantState || !storage) {
    showEmptyState();
    return;
  }

  calculation = calculationState.readCurrentCalculation(storage);
  if (!calculation) {
    showEmptyState();
    return;
  }

  const smartStartProgress = calculationState.readProgress(
    storage,
    calculation.fingerprint,
  );
  if (!smartStartProgress.completed) {
    showEmptyState();
    return;
  }

  progress = assistantState.readProgress(
    storage,
    calculation.fingerprint,
    calculation.workingCount,
  );
  emptyState.hidden = true;
  errorState.hidden = true;
  workflow.hidden = false;
  renderStandalone(false);

  nextStitchButton.addEventListener("click", advanceStandaloneStitch);
  backStitchButton.addEventListener("click", goBackStandaloneStitch);
  completionBackButton.addEventListener("click", goBackStandaloneStitch);
  nextRowButton.addEventListener("click", advanceStandaloneRow);
}

function showEmptyState() {
  workflow.hidden = true;
  errorState.hidden = true;
  emptyState.hidden = false;
}

function showProjectError(message, requestedProjectId = null) {
  workflow.hidden = true;
  emptyState.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = message;
  if (requestedProjectId) {
    errorReturn.href =
      `/calculator?project=${encodeURIComponent(requestedProjectId)}`;
  } else {
    errorReturn.href = "/calculator";
  }
}

function renderStandalone(moveFocus) {
  const total = calculation.workingCount;
  const completed = progress.currentStitch;
  const remaining = total - completed;
  const rowComplete = completed === total;

  document.querySelector("#project-stitch-count").textContent = String(total);
  rowNumber.textContent = String(progress.currentRow);
  rowType.textContent = describeRowType(
    progress.currentRow,
    calculation.context.knittingMode,
  );
  stitchTarget.textContent = String(total);
  stitchCompleted.textContent = String(completed);
  stitchRemaining.textContent = String(remaining);
  stitchProgressText.textContent = `${completed} / ${total}`;
  stitchProgress.max = total;
  stitchProgress.value = completed;
  stitchProgress.setAttribute(
    "aria-valuetext",
    `${completed} из ${total} петель выполнено`,
  );
  backStitchButton.disabled = completed === 0;

  activeRowPanel.hidden = rowComplete;
  rowCompletionPanel.hidden = !rowComplete;
  if (rowComplete) {
    completedRowNumber.textContent = String(progress.currentRow);
    completedRowSummary.textContent =
      `Выполнено ${total} ${pluralizeStitches(total)}. ` +
      "Прогресс ряда сохранён.";
    if (moveFocus) {
      document.querySelector("#row-completion-title").focus();
    }
  } else if (moveFocus) {
    stitchProgressText.focus();
  }
}

function advanceStandaloneStitch() {
  assistantState.advanceStitch(progress, calculation.workingCount);
  persistStandaloneAndRender(true);
}

function goBackStandaloneStitch() {
  assistantState.goBackStitch(progress, calculation.workingCount);
  persistStandaloneAndRender(true);
}

function advanceStandaloneRow() {
  assistantState.advanceRow(progress, calculation.workingCount);
  persistStandaloneAndRender(true);
}

function persistStandaloneAndRender(moveFocus) {
  assistantState.saveProgress(
    getLocalStorage(),
    progress,
    calculation.workingCount,
  );
  renderStandalone(moveFocus);
}

function describeRowType(number, knittingMode) {
  if (knittingMode === "round") {
    return "Круговой";
  }
  return number % 2 === 1 ? "Нечётный" : "Чётный";
}

function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function pluralizeStitches(count) {
  const absolute = Math.abs(count) % 100;
  const lastDigit = absolute % 10;
  if (absolute > 10 && absolute < 20) {
    return "петель";
  }
  if (lastDigit === 1) {
    return "петля";
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return "петли";
  }
  return "петель";
}
