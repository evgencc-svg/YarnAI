"use strict";

const projectSystem = window.YarnAIProjectSystem;
const secondPieceEngine = window.YarnAISecondIdenticalPiece;

const elements = {
  error: document.querySelector("#second-piece-error"),
  errorMessage: document.querySelector("#second-piece-error-message"),
  workflow: document.querySelector("#second-piece-workflow"),
  projectTitle: document.querySelector("#second-piece-project-title"),
  status: document.querySelector("#second-piece-status-message"),
  sourcePanel: document.querySelector("#second-piece-source-panel"),
  sourceSection: document.querySelector("#second-piece-source-section"),
  sourceInitial: document.querySelector("#second-piece-source-initial"),
  sourceTarget: document.querySelector("#second-piece-source-target"),
  sourceEvents: document.querySelector("#second-piece-source-events"),
  sourceRows: document.querySelector("#second-piece-source-rows"),
  sourceBindOff: document.querySelector("#second-piece-source-bind-off"),
  sourceCompleted: document.querySelector("#second-piece-source-completed"),
  blockedPanel: document.querySelector("#second-piece-blocked-panel"),
  blockers: document.querySelector("#second-piece-blockers"),
  warningsPanel: document.querySelector("#second-piece-warnings-panel"),
  warnings: document.querySelector("#second-piece-warnings"),
  preparationPanel: document.querySelector("#second-piece-preparation-panel"),
  checklistForm: document.querySelector("#second-piece-checklist-form"),
  checklist: document.querySelector("#second-piece-checklist"),
  formError: document.querySelector("#second-piece-form-error"),
  startButton: document.querySelector("#second-piece-start-button"),
  overview: document.querySelector("#second-piece-progress-overview"),
  currentStep: document.querySelector("#second-piece-current-step"),
  currentStitches: document.querySelector("#second-piece-current-stitches"),
  shapingCount: document.querySelector("#second-piece-shaping-count"),
  boundCount: document.querySelector("#second-piece-bound-count"),
  nextStep: document.querySelector("#second-piece-next-step"),
  castOnPanel: document.querySelector("#second-piece-cast-on-panel"),
  castOnCount: document.querySelector("#second-piece-cast-on-count"),
  castOnButton: document.querySelector("#second-piece-cast-on-button"),
  shapingPanel: document.querySelector("#second-piece-shaping-panel"),
  shapingTitle: document.querySelector("#second-piece-shaping-title"),
  shapingInstruction: document.querySelector(
    "#second-piece-shaping-instruction",
  ),
  shapingProgress: document.querySelector("#second-piece-shaping-progress"),
  shapingUndo: document.querySelector("#second-piece-shaping-undo"),
  shapingComplete: document.querySelector("#second-piece-shaping-complete"),
  bindOffStart: document.querySelector("#second-piece-bind-off-start"),
  bindOffPanel: document.querySelector("#second-piece-bind-off-panel"),
  bindOffProgress: document.querySelector("#second-piece-bind-off-progress"),
  bindOffBar: document.querySelector("#second-piece-bind-off-bar"),
  bindOffActions: document.querySelector("#second-piece-bind-off-actions"),
  bindOne: document.querySelector("#second-piece-bind-one"),
  bindFive: document.querySelector("#second-piece-bind-five"),
  customForm: document.querySelector("#second-piece-bind-custom-form"),
  customAmount: document.querySelector("#second-piece-bind-custom"),
  customButton: document.querySelector("#second-piece-bind-custom-button"),
  bindUndo: document.querySelector("#second-piece-bind-undo"),
  finishPanel: document.querySelector("#second-piece-finish-panel"),
  finishUndo: document.querySelector("#second-piece-finish-undo"),
  completeButton: document.querySelector("#second-piece-complete-button"),
  completedPanel: document.querySelector("#second-piece-completed-panel"),
  completedSummary: document.querySelector("#second-piece-completed-summary"),
  completedDate: document.querySelector("#second-piece-completed-date"),
  firstDetailLink: document.querySelector("#second-piece-first-detail-link"),
  differenceButtons: Array.from(
    document.querySelectorAll("[data-difference]"),
  ),
};

let repository = null;
let inspection = null;
let projectId = null;
let busy = false;

initialize().catch((error) => {
  showError(
    error?.userMessage ||
      "Не удалось загрузить прогресс второй детали. Данные не изменены.",
  );
});

async function initialize() {
  projectId = new URLSearchParams(window.location.search).get("project");
  if (
    !projectId ||
    !projectSystem ||
    !secondPieceEngine ||
    !projectSystem.isUuidv7(projectId)
  ) {
    showError("Ссылка на проект повреждена. Сохранённые данные не изменены.");
    return;
  }
  repository = new projectSystem.ProjectRepository();
  await repository.initialize();
  try {
    inspection = await secondPieceEngine.ensureForProject(
      repository,
      projectId,
    );
  } catch (error) {
    const aggregate = await repository.getProject(projectId);
    inspection = secondPieceEngine.inspectAggregate(aggregate);
    if (inspection.state !== "blocked") {
      throw error;
    }
  }
  bindActions();
  render(false);
}

function bindActions() {
  elements.checklistForm.addEventListener("submit", startSecondPiece);
  elements.castOnButton.addEventListener("click", confirmCastOn);
  elements.shapingComplete.addEventListener("click", completeShapingEvent);
  elements.shapingUndo.addEventListener("click", undoShapingEvent);
  elements.bindOffStart.addEventListener("click", startBindOff);
  elements.bindOne.addEventListener("click", () => recordBindOff(1));
  elements.bindFive.addEventListener("click", () => recordBindOff(5));
  elements.customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    recordBindOff(elements.customAmount.value);
  });
  elements.bindUndo.addEventListener("click", undoBindOff);
  elements.finishUndo.addEventListener("click", undoBindOff);
  elements.completeButton.addEventListener("click", completeSecondPiece);
  elements.differenceButtons.forEach((button) => {
    button.addEventListener("click", () =>
      reportDifference(button.dataset.difference),
    );
  });
}

function render(moveFocus) {
  elements.error.hidden = true;
  elements.workflow.hidden = false;
  elements.firstDetailLink.href =
    `/bind-off-assistant?project=${encodeURIComponent(projectId)}`;
  const source = inspection.source || inspection.secondPiece?.source;
  const project = inspection.project;
  elements.projectTitle.textContent =
    project?.title || source?.projectTitle || "Сохранённый проект";
  renderSource(source);

  const externalBlocked = inspection.state === "blocked";
  const progress = inspection.secondPiece;
  const blocked = externalBlocked || progress?.status === "blocked";
  hideActivePanels();
  elements.blockedPanel.hidden = !blocked;
  elements.warningsPanel.hidden =
    blocked || !progress?.warnings?.length;
  if (blocked) {
    const blockers = externalBlocked
      ? inspection.blockers || [{ message: inspection.message }]
      : progress.blockers;
    elements.blockers.replaceChildren(
      ...blockers.map((entry) => listItem(entry.message)),
    );
    elements.status.textContent =
      "Продолжение заблокировано. Первая деталь и её история не изменены.";
    setBusy(false);
    return;
  }

  elements.warnings.replaceChildren(
    ...progress.warnings.map((entry) => listItem(entry.message)),
  );
  if (progress.status === "ready") {
    elements.preparationPanel.hidden = false;
    elements.status.textContent =
      "Первая деталь проверена. Подтверди, что повтор будет полностью идентичным.";
    renderChecklist(progress);
    setBusy(false);
    return;
  }
  if (progress.status === "completed") {
    elements.completedPanel.hidden = false;
    elements.status.textContent = "Вторая одинаковая деталь готова и сохранена.";
    elements.completedSummary.textContent =
      `Набрано ${progress.plan.initialStitchCount} петель, выполнено ` +
      `${progress.plan.shapingEvents.length} события формирования и закрыто ` +
      `${progress.plan.bindOffStitchCount} петель.`;
    elements.completedDate.textContent =
      `Завершено ${formatDate(progress.completedAt)}.`;
    setBusy(false);
    return;
  }

  elements.overview.hidden = false;
  renderOverview(progress);
  if (progress.currentStep === "cast_on") {
    elements.castOnPanel.hidden = false;
    elements.castOnCount.textContent = String(progress.plan.initialStitchCount);
  } else if (progress.currentStep === "shaping") {
    elements.shapingPanel.hidden = false;
    renderShaping(progress);
  } else if (progress.currentStep === "bind_off") {
    elements.bindOffPanel.hidden = false;
    renderBindOff(progress, moveFocus);
  } else if (progress.currentStep === "secure_last_stitch") {
    elements.finishPanel.hidden = false;
  }
  elements.status.textContent = secondPieceEngine.progressSummary(progress);
  if (moveFocus) {
    elements.nextStep.focus();
  }
  setBusy(false);
}

function renderSource(source) {
  elements.sourcePanel.hidden = !source;
  if (!source) {
    return;
  }
  elements.sourceSection.textContent =
    source.sectionLabel || source.section;
  elements.sourceInitial.textContent = String(source.initialStitchCount);
  elements.sourceTarget.textContent = String(source.targetStitchCount);
  elements.sourceEvents.textContent = String(
    source.shaping.plan.decreaseEventsCount,
  );
  elements.sourceRows.textContent =
    source.shaping.plan.decreaseRows.join(", ");
  elements.sourceBindOff.textContent =
    `${source.bindOff.stitchCountBeforeBindOff} петель · обычный способ`;
  elements.sourceCompleted.textContent =
    `Формирование завершено ${formatDate(source.shaping.completedAt)}. ` +
    `Первая деталь подтверждена ${formatDate(source.bindOff.completedAt)}.`;
}

function renderChecklist(progress) {
  elements.checklist.replaceChildren(
    ...progress.checklist.map((item) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "second-piece-check";
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

function renderOverview(progress) {
  const stepLabels = {
    cast_on: "Набор исходных петель",
    shaping: "Простое формирование",
    bind_off: "Закрытие петель",
    secure_last_stitch: "Закрепление последней петли",
  };
  elements.currentStep.textContent =
    stepLabels[progress.currentStep] || "Вторая деталь";
  elements.currentStitches.textContent = String(progress.currentStitchCount);
  elements.shapingCount.textContent =
    `${progress.completedShapingEvents.length} из ` +
    `${progress.plan.shapingEvents.length}`;
  elements.boundCount.textContent = String(
    progress.bindOffHistory.reduce(
      (total, action) => total + action.amount,
      0,
    ),
  );
  elements.nextStep.textContent =
    secondPieceEngine.progressSummary(progress);
}

function renderShaping(progress) {
  const next = secondPieceEngine.nextShapingEvent(progress);
  const completed = progress.completedShapingEvents.length;
  const total = progress.plan.shapingEvents.length;
  elements.shapingProgress.max = Math.max(total, 1);
  elements.shapingProgress.value = completed;
  elements.shapingUndo.hidden = progress.shapingHistory.length === 0;
  elements.shapingUndo.disabled = busy || progress.shapingHistory.length === 0;
  elements.shapingComplete.hidden = !next;
  elements.bindOffStart.hidden = Boolean(next);
  if (!next) {
    elements.shapingTitle.textContent = "Формирование выполнено";
    elements.shapingInstruction.textContent =
      `Все ${total} события выполнены. На спице должно быть ` +
      `${progress.plan.targetStitchCount} петель.`;
    return;
  }
  elements.shapingTitle.textContent =
    `Событие ${next.index + 1} из ${total} · ряд ${next.row}`;
  elements.shapingInstruction.textContent =
    `Провяжи по сохранённому плану до ряда ${next.row}. ` +
    `В этом ряду убавь ${next.stitchesToDecrease} петли — по одной с каждой стороны. ` +
    `После события останется ${progress.currentStitchCount - next.stitchesToDecrease} петель.`;
}

function renderBindOff(progress, moveFocus) {
  const initial = progress.plan.bindOffStitchCount;
  const remaining = progress.currentStitchCount;
  const bound = initial - remaining;
  elements.bindOffProgress.textContent =
    `${bound} из ${initial} петель закрыто · ${remaining} осталось`;
  elements.bindOffBar.max = initial;
  elements.bindOffBar.value = bound;
  elements.bindOffActions.hidden = remaining === 0;
  elements.bindOne.disabled = busy || remaining === 0;
  elements.bindFive.hidden = remaining < 5;
  elements.bindFive.disabled = busy || remaining < 5;
  elements.customAmount.max = String(remaining);
  elements.customAmount.disabled = busy || remaining === 0;
  elements.customButton.disabled = busy || remaining === 0;
  elements.bindUndo.hidden = progress.bindOffHistory.length === 0;
  elements.bindUndo.disabled = busy || progress.bindOffHistory.length === 0;
  if (moveFocus) {
    elements.bindOffProgress.focus();
  }
}

function hideActivePanels() {
  [
    elements.blockedPanel,
    elements.preparationPanel,
    elements.overview,
    elements.castOnPanel,
    elements.shapingPanel,
    elements.bindOffPanel,
    elements.finishPanel,
    elements.completedPanel,
  ].forEach((panel) => {
    panel.hidden = true;
  });
}

async function startSecondPiece(event) {
  event.preventDefault();
  const selected = Array.from(
    elements.checklistForm.querySelectorAll(
      'input[name="second-piece-check"]:checked',
    ),
  ).map((input) => input.value);
  await runMutation(
    () =>
      secondPieceEngine.startForProject(
        repository,
        projectId,
        selected,
        secondPieceEngine.makeActionId(),
      ),
    "Не удалось начать вторую деталь.",
  );
}

async function confirmCastOn() {
  await runMutation(
    () =>
      secondPieceEngine.confirmCastOnForProject(
        repository,
        projectId,
        inspection.secondPiece.plan.initialStitchCount,
        secondPieceEngine.makeActionId(),
      ),
    "Не удалось подтвердить набор петель.",
  );
}

async function completeShapingEvent() {
  const event = secondPieceEngine.nextShapingEvent(inspection.secondPiece);
  if (!event) {
    return;
  }
  await runMutation(
    () =>
      secondPieceEngine.completeShapingEventForProject(
        repository,
        projectId,
        event.id,
        secondPieceEngine.makeActionId(),
      ),
    "Не удалось сохранить событие формирования.",
  );
}

async function undoShapingEvent() {
  await runMutation(
    () =>
      secondPieceEngine.undoShapingForProject(
        repository,
        projectId,
        secondPieceEngine.makeActionId(),
      ),
    "Не удалось исправить последнее событие формирования.",
  );
}

async function startBindOff() {
  await runMutation(
    () =>
      secondPieceEngine.startBindOffForProject(
        repository,
        projectId,
        secondPieceEngine.makeActionId(),
      ),
    "Не удалось начать закрытие петель.",
  );
}

async function recordBindOff(amount) {
  await runMutation(
    () =>
      secondPieceEngine.addBindOffForProject(
        repository,
        projectId,
        amount,
        secondPieceEngine.makeActionId(),
      ),
    "Не удалось сохранить закрытые петли.",
  );
  elements.customAmount.value = "";
}

async function undoBindOff() {
  await runMutation(
    () =>
      secondPieceEngine.undoBindOffForProject(
        repository,
        projectId,
        secondPieceEngine.makeActionId(),
      ),
    "Не удалось исправить последнее закрытие.",
  );
}

async function completeSecondPiece() {
  await runMutation(
    () =>
      secondPieceEngine.completeForProject(
        repository,
        projectId,
        true,
        secondPieceEngine.makeActionId(),
      ),
    "Не удалось завершить вторую деталь.",
  );
}

async function reportDifference(difference) {
  await runMutation(
    () =>
      secondPieceEngine.reportDifferenceForProject(
        repository,
        projectId,
        difference,
        secondPieceEngine.makeActionId(),
      ),
    "Не удалось сохранить отличие второй детали.",
  );
}

async function runMutation(operation, fallbackMessage) {
  if (busy) {
    return;
  }
  busy = true;
  setBusy(true);
  elements.formError.textContent = "";
  try {
    inspection = await operation();
    render(true);
  } catch (error) {
    elements.formError.textContent = error?.userMessage || fallbackMessage;
  } finally {
    busy = false;
    setBusy(false);
  }
}

function setBusy(disabled) {
  [
    elements.startButton,
    elements.castOnButton,
    elements.shapingUndo,
    elements.shapingComplete,
    elements.bindOffStart,
    elements.bindOne,
    elements.bindFive,
    elements.customButton,
    elements.bindUndo,
    elements.finishUndo,
    elements.completeButton,
    ...elements.differenceButtons,
  ].forEach((button) => {
    button.disabled = disabled;
  });
  elements.customAmount.disabled = disabled;
}

function listItem(message) {
  const item = document.createElement("li");
  item.textContent = message;
  return item;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("ru", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function showError(message) {
  elements.workflow.hidden = true;
  elements.error.hidden = false;
  elements.errorMessage.textContent = message;
}
