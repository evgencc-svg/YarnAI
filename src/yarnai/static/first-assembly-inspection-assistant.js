"use strict";

const projectSystem = window.YarnAIProjectSystem;
const inspectionEngine = window.YarnAIFirstAssemblyInspection;
const errorPanel = document.querySelector("#inspection-error");
const errorMessage = document.querySelector(
  "#inspection-error-message",
);
const workflow = document.querySelector("#inspection-workflow");
const projectTitle = document.querySelector(
  "#inspection-project-title",
);
const statusMessage = document.querySelector(
  "#inspection-status-message",
);
const sourceSummary = document.querySelector(
  "#inspection-source-summary",
);
const pieces = document.querySelector("#inspection-pieces");
const edges = document.querySelector("#inspection-edges");
const operation = document.querySelector("#inspection-operation");
const units = document.querySelector("#inspection-units");
const thread = document.querySelector("#inspection-thread");
const blockedPanel = document.querySelector(
  "#inspection-blocked-panel",
);
const blockers = document.querySelector("#inspection-blockers");
const readyPanel = document.querySelector("#inspection-ready-panel");
const startButton = document.querySelector(
  "#inspection-start-button",
);
const checkPanel = document.querySelector("#inspection-check-panel");
const checklist = document.querySelector("#inspection-checklist");
const goodButton = document.querySelector("#inspection-good-button");
const problemButton = document.querySelector(
  "#inspection-problem-button",
);
const choiceStatus = document.querySelector(
  "#inspection-choice-status",
);
const issueForm = document.querySelector("#inspection-issue-form");
const issueCode = document.querySelector("#inspection-issue-code");
const issueNote = document.querySelector("#inspection-issue-note");
const issueNoteLabel = document.querySelector(
  "#inspection-issue-note-label",
);
const markIssueButton = document.querySelector(
  "#inspection-mark-issue-button",
);
const formError = document.querySelector("#inspection-form-error");
const completeButton = document.querySelector(
  "#inspection-complete-button",
);
const correctionPanel = document.querySelector(
  "#inspection-correction-panel",
);
const issueTitle = document.querySelector("#inspection-issue-title");
const correctionInstruction = document.querySelector(
  "#inspection-correction-instruction",
);
const acknowledgeCheckbox = document.querySelector(
  "#inspection-acknowledge-checkbox",
);
const acknowledgeButton = document.querySelector(
  "#inspection-acknowledge-button",
);
const resolvedButton = document.querySelector(
  "#inspection-resolved-button",
);
const correctionError = document.querySelector(
  "#inspection-correction-error",
);
const completedPanel = document.querySelector(
  "#inspection-completed-panel",
);
const completedDate = document.querySelector(
  "#inspection-completed-date",
);
const tailSecuringLink = document.querySelector(
  "#inspection-tail-securing-link",
);

let repository = null;
let result = null;
let projectId = null;
let busy = false;

initialize().catch((error) => {
  showError(
    error?.userMessage ||
      "Не удалось загрузить сохранённую проверку. Данные не изменены.",
  );
});

async function initialize() {
  projectId = new URLSearchParams(window.location.search).get(
    "project",
  );
  if (
    !projectId ||
    !projectSystem ||
    !inspectionEngine ||
    !projectSystem.isUuidv7(projectId)
  ) {
    showError(
      "Ссылка на проект повреждена. Сохранённые данные не изменены.",
    );
    return;
  }
  repository = new projectSystem.ProjectRepository();
  tailSecuringLink.href =
    `/first-tail-securing?project=${encodeURIComponent(projectId)}`;
  await repository.initialize();
  result = await inspectionEngine.revalidateForProject(
    repository,
    projectId,
  );
  bindActions();
  render();
}

function bindActions() {
  startButton.addEventListener("click", () =>
    runMutation(
      () => inspectionEngine.startForProject(repository, projectId),
      "Не удалось начать проверку.",
    ),
  );
  goodButton.addEventListener("click", () =>
    runMutation(
      () =>
        inspectionEngine.confirmNoIssueForProject(
          repository,
          projectId,
        ),
      "Не удалось сохранить результат осмотра.",
    ),
  );
  problemButton.addEventListener("click", () => {
    issueForm.hidden = false;
    issueCode.focus();
  });
  issueCode.addEventListener("change", renderIssueNote);
  markIssueButton.addEventListener("click", () => {
    if (!issueCode.value) {
      formError.textContent = "Выберите тип проблемы.";
      return;
    }
    runMutation(
      () =>
        inspectionEngine.markIssueForProject(
          repository,
          projectId,
          issueCode.value,
          issueNote.value,
        ),
      "Не удалось сохранить проблему.",
    );
  });
  acknowledgeButton.addEventListener("click", () => {
    if (!acknowledgeCheckbox.checked) {
      correctionError.textContent =
        "Подтвердите, что поняли необходимость ручного исправления.";
      return;
    }
    runMutation(
      () =>
        inspectionEngine.acknowledgeForProject(
          repository,
          projectId,
        ),
      "Не удалось сохранить подтверждение.",
    );
  });
  resolvedButton.addEventListener("click", () =>
    runMutation(
      () =>
        inspectionEngine.resolveForProject(repository, projectId),
      "Не удалось подтвердить исправление.",
    ),
  );
  completeButton.addEventListener("click", () =>
    runMutation(
      () =>
        inspectionEngine.completeForProject(repository, projectId),
      "Не удалось подтвердить первый шов.",
    ),
  );
}

function render() {
  errorPanel.hidden = true;
  workflow.hidden = false;
  const current = result.inspection;
  const blocked =
    result.state === "blocked" || current?.status === "blocked";

  projectTitle.textContent =
    result.project?.title || "Сохранённый проект";
  renderSource(current);
  blockedPanel.hidden = !blocked;
  readyPanel.hidden = blocked || current?.status !== "ready";
  checkPanel.hidden = blocked || current?.status !== "inspecting";
  correctionPanel.hidden =
    blocked || current?.status !== "needs_correction";
  completedPanel.hidden =
    blocked || current?.status !== "completed";

  if (blocked) {
    const entries =
      current?.blockers?.length
        ? current.blockers
        : result.blockers ?? [{ message: result.message }];
    blockers.replaceChildren(
      ...entries.map((entry) => listItem(entry.message)),
    );
    statusMessage.textContent =
      "Источник проверки изменён или повреждён. Рабочие действия недоступны.";
    return;
  }
  if (!current) {
    showError("Запись проверки первого шва не найдена.");
    return;
  }
  if (current.status === "ready") {
    statusMessage.textContent =
      "Соединение завершено. Проверка качества ещё не начата.";
    return;
  }
  if (current.status === "inspecting") {
    statusMessage.textContent =
      "Осмотрите шов и сохраните отдельный ответ для каждого пункта.";
    renderChecklist(current);
    renderChoice(current);
    return;
  }
  if (current.status === "needs_correction") {
    statusMessage.textContent =
      "Проблема сохранена. Завершение недоступно до явного исправления.";
    renderCorrection(current);
    return;
  }
  statusMessage.textContent =
    "Первый шов проверен и принят. Первая сборочная операция завершена.";
  completedDate.textContent = `Подтверждено ${new Intl.DateTimeFormat(
    "ru",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(current.completedAt))}.`;
}

function renderSource(current) {
  const snapshot = current?.sourceSnapshot;
  sourceSummary.textContent = current
    ? inspectionEngine.sourceSummary(current)
    : result.message || "Источник соединения недоступен.";
  const first = pieceName(snapshot?.firstPiece, "Первая деталь");
  const second = pieceName(snapshot?.secondPiece, "Вторая деталь");
  pieces.textContent = `${first} + ${second}`;
  const edge = snapshot?.joiningEdge;
  edges.textContent = edge
    ? `${edge.firstLabel || "край первой детали"} + ${
        edge.secondLabel || "край второй детали"
      }`
    : snapshot?.section || "Прямые края деталей";
  operation.textContent =
    snapshot?.operation === "join_two_identical_straight_edges"
      ? "Соединение двух одинаковых прямых краёв"
      : snapshot?.operation || "—";
  units.textContent =
    snapshot?.completedUnits != null
      ? `${snapshot.completedUnits} из ${snapshot.totalUnits}`
      : "—";
  thread.textContent = snapshot?.threadSecured
    ? "Закреплена"
    : "Не подтверждена";
}

function renderChecklist(current) {
  checklist.replaceChildren(
    ...current.checklist.map((item) => {
      const label = document.createElement("label");
      label.dataset.source = item.source;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = item.checked;
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
}

function renderChoice(current) {
  const noIssue =
    current.issueDetected === false &&
    current.issueCode === null;
  goodButton.dataset.selected = String(noIssue);
  problemButton.dataset.selected = "false";
  choiceStatus.textContent = noIssue
    ? "Сохранено: заметных проблем нет."
    : current.issueResolvedConfirmed
      ? "Исправление подтверждено. Пройдите список заново."
      : "Выберите результат осмотра.";
  const allChecked = current.checklist.every(
    (item) => item.checked,
  );
  completeButton.disabled =
    busy ||
    !allChecked ||
    current.issueDetected !== false ||
    (current.issueCode !== null &&
      !current.issueResolvedConfirmed);
}

function renderCorrection(current) {
  const labels = {
    edges_misaligned: "Края смещены",
    skipped_join_unit: "Пропущена петля или участок",
    seam_too_tight: "Шов слишком тугой",
    seam_too_loose: "Шов слишком свободный",
    thread_not_secure: "Нить закреплена ненадёжно",
    other: "Другая проблема",
  };
  issueTitle.textContent =
    labels[current.issueCode] || "Проблема сохранена";
  correctionInstruction.textContent =
    current.correctionInstruction;
  acknowledgeCheckbox.checked =
    current.correctionAcknowledged;
  acknowledgeCheckbox.disabled =
    busy || current.correctionAcknowledged;
  acknowledgeButton.disabled =
    busy || current.correctionAcknowledged;
  resolvedButton.disabled =
    busy || !current.correctionAcknowledged;
}

function renderIssueNote() {
  const visible = issueCode.value === "other";
  issueNote.hidden = !visible;
  issueNoteLabel.hidden = !visible;
  if (!visible) {
    issueNote.value = "";
  }
}

async function updateChecklist(itemId, checked) {
  await runMutation(
    () =>
      inspectionEngine.setChecklistForProject(
        repository,
        projectId,
        itemId,
        checked,
      ),
    "Не удалось сохранить пункт проверки.",
  );
}

async function runMutation(mutation, fallbackMessage) {
  if (busy) {
    return;
  }
  busy = true;
  formError.textContent = "";
  correctionError.textContent = "";
  setBusy(true);
  try {
    result = await mutation();
    issueForm.hidden = true;
    issueCode.value = "";
    issueNote.value = "";
    render();
  } catch (error) {
    const target =
      result?.inspection?.status === "needs_correction"
        ? correctionError
        : formError;
    target.textContent = error?.userMessage || fallbackMessage;
  } finally {
    busy = false;
    setBusy(false);
    if (result?.inspection?.status === "inspecting") {
      renderChecklist(result.inspection);
      renderChoice(result.inspection);
    } else if (
      result?.inspection?.status === "needs_correction"
    ) {
      renderCorrection(result.inspection);
    }
  }
}

function setBusy(disabled) {
  [
    startButton,
    goodButton,
    problemButton,
    markIssueButton,
    acknowledgeButton,
    resolvedButton,
    completeButton,
  ].forEach((button) => {
    button.disabled = disabled;
  });
  checklist
    .querySelectorAll('input[type="checkbox"]')
    .forEach((input) => {
      input.disabled =
        disabled ||
        !inspectionEngine.USER_CHECKLIST_IDS.includes(
          input.dataset.checklistId,
        );
    });
}

function pieceName(piece, fallback) {
  return (
    piece?.data?.sectionLabel ||
    piece?.sectionLabel ||
    piece?.section ||
    fallback
  );
}

function listItem(message) {
  const item = document.createElement("li");
  item.textContent = message;
  return item;
}

function showError(message) {
  workflow.hidden = true;
  errorPanel.hidden = false;
  errorMessage.textContent = message;
}
