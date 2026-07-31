"use strict";

const projectSystem = window.YarnAIProjectSystem;
const joinEngine = window.YarnAIFirstAssemblyJoin;
const errorPanel = document.querySelector("#join-error");
const errorMessage = document.querySelector("#join-error-message");
const workflow = document.querySelector("#join-workflow");
const projectTitle = document.querySelector("#join-project-title");
const statusMessage = document.querySelector("#join-status-message");
const sourceSummary = document.querySelector("#join-source-summary");
const operationName = document.querySelector("#join-operation-name");
const sectionName = document.querySelector("#join-section-name");
const blockedPanel = document.querySelector("#join-blocked-panel");
const blockersList = document.querySelector("#join-blockers");
const checklistPanel = document.querySelector("#join-checklist-panel");
const checklist = document.querySelector("#join-checklist");
const formError = document.querySelector("#join-form-error");
const startButton = document.querySelector("#join-start-button");
const progressPanel = document.querySelector("#join-progress-panel");
const totalCount = document.querySelector("#join-total-count");
const completedCount = document.querySelector("#join-completed-count");
const remainingCount = document.querySelector("#join-remaining-count");
const progressText = document.querySelector("#join-progress-text");
const progressBar = document.querySelector("#join-progress");
const actionControls = document.querySelector("#join-action-controls");
const nextButton = document.querySelector("#join-next-button");
const undoButton = document.querySelector("#join-undo-button");
const repeatButton = document.querySelector("#join-repeat-button");
const edgeFinishedPanel = document.querySelector(
  "#join-edge-finished-panel",
);
const threadButton = document.querySelector("#join-thread-button");
const threadStatus = document.querySelector("#join-thread-status");
const finishUndoButton = document.querySelector(
  "#join-finish-undo-button",
);
const completeButton = document.querySelector("#join-complete-button");
const completedPanel = document.querySelector("#join-completed-panel");
const completedSummary = document.querySelector(
  "#join-completed-summary",
);
const completedDate = document.querySelector("#join-completed-date");
const inspectionLink = document.querySelector(
  "#join-inspection-link",
);

let repository = null;
let inspection = null;
let projectId = null;
let busy = false;

initialize().catch((error) => {
  showError(
    error?.userMessage ||
      "Не удалось загрузить сохранённое соединение. Данные не изменены.",
  );
});

async function initialize() {
  projectId = new URLSearchParams(window.location.search).get("project");
  if (
    !projectId ||
    !projectSystem ||
    !joinEngine ||
    !projectSystem.isUuidv7(projectId)
  ) {
    showError(
      "Ссылка на проект повреждена. Сохранённые данные не изменены.",
    );
    return;
  }
  repository = new projectSystem.ProjectRepository();
  await repository.initialize();
  inspection = await joinEngine.revalidateForProject(
    repository,
    projectId,
  );
  bindActions();
  render(false);
}

function bindActions() {
  startButton.addEventListener("click", () =>
    runMutation(
      () => joinEngine.startForProject(repository, projectId),
      "Не удалось начать соединение.",
    ),
  );
  nextButton.addEventListener("click", () =>
    runMutation(
      () => joinEngine.completeUnitForProject(repository, projectId),
      "Не удалось сохранить следующий участок.",
    ),
  );
  undoButton.addEventListener("click", undoLast);
  finishUndoButton.addEventListener("click", undoLast);
  repeatButton.addEventListener("click", () =>
    runMutation(
      () => joinEngine.repeatForProject(repository, projectId),
      "Не удалось повторить отменённое действие.",
    ),
  );
  threadButton.addEventListener("click", toggleThread);
  completeButton.addEventListener("click", () =>
    runMutation(
      () => joinEngine.completeForProject(repository, projectId),
      "Не удалось завершить соединение.",
    ),
  );
}

function render(moveFocus) {
  errorPanel.hidden = true;
  workflow.hidden = false;
  const current = inspection.join;
  const blocked = inspection.state === "blocked" || current?.status === "blocked";
  projectTitle.textContent =
    inspection.project?.title || "Сохранённый проект";
  renderSource(current);
  blockedPanel.hidden = !blocked;
  checklistPanel.hidden = blocked || current?.status !== "ready";
  progressPanel.hidden = blocked || current?.status !== "in_progress";
  edgeFinishedPanel.hidden =
    blocked ||
    current?.status !== "in_progress" ||
    current.remainingUnits !== 0;
  completedPanel.hidden = blocked || current?.status !== "completed";

  if (blocked) {
    const entries =
      current?.blockers?.length
        ? current.blockers
        : inspection.blockers ?? [{ message: inspection.message }];
    blockersList.replaceChildren(
      ...entries.map((entry) => listItem(entry.message)),
    );
    statusMessage.textContent =
      "Рабочие действия недоступны, пока источник соединения заблокирован.";
    return;
  }
  if (!current) {
    showError("Запись соединения не найдена.");
    return;
  }
  if (current.status === "ready") {
    statusMessage.textContent =
      "Соединение ещё не начато. Подтверди подготовку края.";
    renderChecklist(current);
    return;
  }
  if (current.status === "completed") {
    statusMessage.textContent =
      "Первый прямой край соединён и сохранён.";
    completedSummary.textContent = joinEngine.progressSummary(current);
    completedDate.textContent =
      `Завершено ${new Intl.DateTimeFormat("ru", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(current.completedAt))}.`;
    inspectionLink.href =
      `/first-assembly-inspection?project=${encodeURIComponent(projectId)}`;
    return;
  }
  renderProgress(current, moveFocus);
}

function renderSource(current) {
  const snapshot = current?.sourceSnapshot;
  sourceSummary.textContent = current
    ? joinEngine.sourceSummary(current)
    : inspection.message || "Источник подготовки недоступен.";
  operationName.textContent =
    snapshot?.operation === joinEngine.SUPPORTED_OPERATION
      ? "Соединение двух одинаковых прямых краёв"
      : snapshot?.operation || "—";
  sectionName.textContent =
    snapshot?.firstPiece?.data?.sectionLabel ||
    snapshot?.section ||
    "—";
}

function renderChecklist(current) {
  checklist.replaceChildren(
    ...current.checklist.map((item) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = item.confirmed;
      input.disabled = item.source === "system" || busy;
      input.dataset.checklistId = item.id;
      input.setAttribute("aria-label", item.label);
      if (item.source === "user") {
        input.addEventListener("change", () =>
          updateChecklist(item.id, input.checked),
        );
      }
      const text = document.createElement("span");
      text.textContent =
        item.source === "system"
          ? `${item.label} Проверено системой.`
          : item.label;
      label.append(input, text);
      return label;
    }),
  );
  const complete = current.checklist.every((item) => item.confirmed);
  startButton.disabled = busy || !complete;
}

function renderProgress(current, moveFocus) {
  totalCount.textContent = String(current.totalUnits);
  completedCount.textContent = String(current.completedUnits);
  remainingCount.textContent = String(current.remainingUnits);
  progressText.textContent =
    `${current.completedUnits} из ${current.totalUnits} петель края соединено`;
  progressBar.max = current.totalUnits;
  progressBar.value = current.completedUnits;
  progressBar.setAttribute(
    "aria-valuetext",
    `${current.completedUnits} соединено, ${current.remainingUnits} осталось`,
  );
  const atEnd = current.remainingUnits === 0;
  const historyState = joinEngine.deriveJoinHistory(
    current.joinHistory,
    current.totalUnits,
  );
  actionControls.hidden = atEnd;
  nextButton.disabled = busy || atEnd || current.threadSecured;
  undoButton.disabled =
    busy || current.completedUnits === 0 || current.threadSecured;
  repeatButton.disabled =
    busy || !historyState.repeatAvailable || current.threadSecured;
  finishUndoButton.disabled = busy || current.threadSecured;
  threadButton.disabled = busy;
  threadButton.textContent = current.threadSecured
    ? "Отменить подтверждение закрепления"
    : "Подтвердить закрепление нити";
  threadStatus.textContent = current.threadSecured
    ? "Нить закреплена. Теперь можно явно завершить соединение."
    : "Закрепление нити ещё не подтверждено.";
  completeButton.disabled = busy || !current.threadSecured;
  statusMessage.textContent = atEnd
    ? "Конец края достигнут. Автоматического завершения нет."
    : `Осталось соединить ${current.remainingUnits} петель края.`;
  if (moveFocus) {
    progressText.focus();
  }
}

function listItem(message) {
  const item = document.createElement("li");
  item.textContent = message;
  return item;
}

async function updateChecklist(itemId, confirmed) {
  await runMutation(
    () =>
      confirmed
        ? joinEngine.confirmForProject(repository, projectId, itemId)
        : joinEngine.unconfirmForProject(repository, projectId, itemId),
    "Не удалось сохранить подтверждение.",
  );
}

async function undoLast() {
  await runMutation(
    () => joinEngine.undoForProject(repository, projectId),
    "Не удалось отменить последнее действие.",
  );
}

async function toggleThread() {
  const current = inspection.join;
  await runMutation(
    () =>
      current.threadSecured
        ? joinEngine.unconfirmThreadForProject(repository, projectId)
        : joinEngine.confirmThreadForProject(repository, projectId),
    "Не удалось изменить подтверждение закрепления нити.",
  );
}

async function runMutation(operation, fallbackMessage) {
  if (busy) {
    return;
  }
  busy = true;
  formError.textContent = "";
  setBusy(true);
  try {
    inspection = await operation();
    render(true);
  } catch (error) {
    formError.textContent = error?.userMessage || fallbackMessage;
  } finally {
    busy = false;
    setBusy(false);
    if (inspection?.join?.status === "ready") {
      renderChecklist(inspection.join);
    } else if (inspection?.join?.status === "in_progress") {
      renderProgress(inspection.join, false);
    }
  }
}

function setBusy(disabled) {
  [
    startButton,
    nextButton,
    undoButton,
    repeatButton,
    threadButton,
    finishUndoButton,
    completeButton,
  ].forEach((button) => {
    button.disabled = disabled;
  });
  checklist
    .querySelectorAll('input[type="checkbox"]')
    .forEach((input) => {
      input.disabled = disabled || !input.dataset.checklistId;
    });
}

function showError(message) {
  workflow.hidden = true;
  errorPanel.hidden = false;
  errorMessage.textContent = message;
}
