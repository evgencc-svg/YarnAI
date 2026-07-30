"use strict";

const calculationState = window.YarnAISmartStartState;
const assistantState = window.YarnAIStepAssistantState;
const emptyState = document.querySelector("#step-assistant-empty");
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
const completionBackButton = document.querySelector(
  "#completion-back-button",
);
const nextRowButton = document.querySelector("#next-row-button");

let calculation = null;
let progress = null;

initializeStepAssistant();

function initializeStepAssistant() {
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
  workflow.hidden = false;
  render(false);

  nextStitchButton.addEventListener("click", advanceStitch);
  backStitchButton.addEventListener("click", goBackStitch);
  completionBackButton.addEventListener("click", goBackStitch);
  nextRowButton.addEventListener("click", advanceRow);
}

function showEmptyState() {
  workflow.hidden = true;
  emptyState.hidden = false;
}

function render(moveFocus) {
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
      `Прогресс ряда сохранён.`;
    if (moveFocus) {
      document.querySelector("#row-completion-title").focus();
    }
  } else if (moveFocus) {
    stitchProgressText.focus();
  }
}

function advanceStitch() {
  assistantState.advanceStitch(progress, calculation.workingCount);
  persistAndRender(true);
}

function goBackStitch() {
  assistantState.goBackStitch(progress, calculation.workingCount);
  persistAndRender(true);
}

function advanceRow() {
  assistantState.advanceRow(progress, calculation.workingCount);
  persistAndRender(true);
}

function persistAndRender(moveFocus) {
  assistantState.saveProgress(
    getLocalStorage(),
    progress,
    calculation.workingCount,
  );
  render(moveFocus);
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
