"use strict";

const projectSystem = window.YarnAIProjectSystem;
const tailEngine = window.YarnAIFirstTailSecuring;
const element = (selector) => document.querySelector(selector);

const errorPanel = element("#tail-error");
const errorMessage = element("#tail-error-message");
const workflow = element("#tail-workflow");
const projectTitle = element("#tail-project-title");
const statusMessage = element("#tail-status-message");
const sourceSummary = element("#tail-source-summary");
const inspectionReference = element("#tail-inspection-reference");
const inspectionRevision = element("#tail-inspection-revision");
const stage12Fingerprint = element("#tail-stage12-fingerprint");
const blockedPanel = element("#tail-blocked-panel");
const blockers = element("#tail-blockers");
const readyPanel = element("#tail-ready-panel");
const securingPanel = element("#tail-securing-panel");
const reworkPanel = element("#tail-rework-panel");
const completedPanel = element("#tail-completed-panel");
const startButton = element("#tail-start-button");
const recommendedCount = element("#tail-recommended-count");
const completedCount = element("#tail-completed-count");
const userConfidence = element("#tail-user-confidence");
const saveInformationButton = element("#tail-save-information-button");
const checklist = element("#tail-checklist");
const goodButton = element("#tail-good-button");
const problemButton = element("#tail-problem-button");
const choiceStatus = element("#tail-choice-status");
const issueForm = element("#tail-issue-form");
const issueCode = element("#tail-issue-code");
const issueNote = element("#tail-issue-note");
const issueNoteLabel = element("#tail-issue-note-label");
const markIssueButton = element("#tail-mark-issue-button");
const formError = element("#tail-form-error");
const completeButton = element("#tail-complete-button");
const issueTitle = element("#tail-issue-title");
const reworkInstruction = element("#tail-rework-instruction");
const acknowledgeCheckbox = element("#tail-acknowledge-checkbox");
const acknowledgeButton = element("#tail-acknowledge-button");
const resolvedButton = element("#tail-resolved-button");
const reworkError = element("#tail-rework-error");
const completedDate = element("#tail-completed-date");
const firstBlockingLink = element("#tail-first-blocking-link");

let repository = null;
let result = null;
let projectId = null;
let busy = false;

initialize().catch((error) => {
  showError(
    error?.userMessage ||
      "Не удалось загрузить сохранённое закрепление. Данные не изменены.",
  );
});

async function initialize() {
  projectId = new URLSearchParams(window.location.search).get(
    "project",
  );
  if (
    !projectId ||
    !projectSystem ||
    !tailEngine ||
    !projectSystem.isUuidv7(projectId)
  ) {
    showError(
      "Ссылка на проект повреждена. Сохранённые данные не изменены.",
    );
    return;
  }
  repository = new projectSystem.ProjectRepository();
  await repository.initialize();
  result = await tailEngine.revalidateForProject(
    repository,
    projectId,
  );
  bindActions();
  render();
}

function bindActions() {
  startButton.addEventListener("click", () =>
    runMutation(
      () => tailEngine.startForProject(repository, projectId),
      "Не удалось начать закрепление.",
    ),
  );
  saveInformationButton.addEventListener("click", () => {
    const recommended = Number(recommendedCount.value);
    const completed = Number(completedCount.value);
    const confidence = userConfidence.value || null;
    runMutation(
      () =>
        tailEngine.updateTailForProject(repository, projectId, {
          recommendedSecuringCount: recommended,
          completedSecuringCount: completed,
          userConfidence: confidence,
          assistantConfidence:
            completed >= recommended ? "high" : "low",
        }),
      "Проверьте количество закреплений и уверенность.",
    );
  });
  goodButton.addEventListener("click", () =>
    runMutation(
      () =>
        tailEngine.confirmNoIssueForProject(
          repository,
          projectId,
        ),
      "Не удалось сохранить результат проверки.",
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
        tailEngine.markIssueForProject(
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
      reworkError.textContent =
        "Подтвердите, что поняли необходимость ручного исправления.";
      return;
    }
    runMutation(
      () =>
        tailEngine.acknowledgeForProject(
          repository,
          projectId,
        ),
      "Не удалось сохранить подтверждение.",
    );
  });
  resolvedButton.addEventListener("click", () =>
    runMutation(
      () => tailEngine.resolveForProject(repository, projectId),
      "Не удалось подтвердить исправление.",
    ),
  );
  completeButton.addEventListener("click", () =>
    runMutation(
      () => tailEngine.completeForProject(repository, projectId),
      "Не удалось завершить закрепление.",
    ),
  );
}

function render() {
  errorPanel.hidden = true;
  workflow.hidden = false;
  const current = result.securing;
  const blocked =
    result.state === "blocked" || current?.status === "blocked";

  projectTitle.textContent =
    result.project?.title || "Сохранённый проект";
  renderSource(current);
  blockedPanel.hidden = !blocked;
  readyPanel.hidden = blocked || current?.status !== "ready";
  securingPanel.hidden =
    blocked || current?.status !== "securing";
  reworkPanel.hidden =
    blocked || current?.status !== "needs_rework";
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
      "Источник изменён или повреждён. Рабочие действия недоступны.";
    return;
  }
  if (!current) {
    showError("Запись Stage 13 не найдена.");
    return;
  }
  if (current.status === "ready") {
    statusMessage.textContent =
      "Stage 12C завершена. Закрепление хвоста ещё не начато.";
    return;
  }
  if (current.status === "securing") {
    statusMessage.textContent =
      "Проведите хвост по изнаночной стороне, закрепите без натяжения и проверьте каждый пункт.";
    renderTailInformation(current);
    renderChecklist(current);
    renderChoice(current);
    return;
  }
  if (current.status === "needs_rework") {
    statusMessage.textContent =
      "Проблема сохранена. Завершение недоступно до исправления и повторного checklist.";
    renderRework(current);
    return;
  }
  statusMessage.textContent =
    "Хвост закреплён. Stage 13 завершена и неизменяема.";
  firstBlockingLink.href = `/first-blocking?project=${encodeURIComponent(projectId)}`;
  completedDate.textContent = `Подтверждено ${new Intl.DateTimeFormat(
    "ru",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(new Date(current.completedAt))}.`;
}

function renderSource(current) {
  const reference = current?.references?.inspection;
  sourceSummary.textContent = current
    ? "Используется полный неизменяемый snapshot завершённой Stage 12C."
    : result.message || "Источник Stage 12C недоступен.";
  inspectionReference.textContent = reference?.id || "—";
  inspectionRevision.textContent =
    reference?.revision != null ? String(reference.revision) : "—";
  stage12Fingerprint.textContent =
    current?.stage12Fingerprint || "—";
}

function renderTailInformation(current) {
  const information = current.tailInformation;
  recommendedCount.value = String(
    information.recommendedSecuringCount,
  );
  completedCount.value = String(
    information.completedSecuringCount,
  );
  userConfidence.value = information.userConfidence || "";
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
  choiceStatus.textContent = noIssue
    ? "Сохранено: заметных проблем нет."
    : current.issueResolvedConfirmed
      ? "Исправление подтверждено. Пройдите checklist заново."
      : "Выберите результат проверки.";
  const complete =
    current.checklist.every((item) => item.checked) &&
    current.issueDetected === false &&
    current.tailInformation.completedSecuringCount >=
      current.tailInformation.recommendedSecuringCount &&
    Boolean(current.tailInformation.userConfidence);
  completeButton.disabled = busy || !complete;
}

function renderRework(current) {
  const labels = {
    tail_too_short: "Хвост слишком короткий",
    tail_visible: "Хвост виден",
    tail_not_secured: "Хвост закреплён ненадёжно",
    fabric_distorted: "Полотно деформировано",
    tail_pulled: "Хвост натягивает полотно",
    other: "Другая проблема",
  };
  issueTitle.textContent =
    labels[current.issueCode] || "Проблема сохранена";
  reworkInstruction.textContent = current.reworkInstruction;
  acknowledgeCheckbox.checked = current.reworkAcknowledged;
  acknowledgeCheckbox.disabled =
    busy || current.reworkAcknowledged;
  acknowledgeButton.disabled =
    busy || current.reworkAcknowledged;
  resolvedButton.disabled =
    busy || !current.reworkAcknowledged;
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
      tailEngine.setChecklistForProject(
        repository,
        projectId,
        itemId,
        checked,
      ),
    "Не удалось сохранить пункт checklist.",
  );
}

async function runMutation(mutation, fallbackMessage) {
  if (busy) {
    return;
  }
  busy = true;
  formError.textContent = "";
  reworkError.textContent = "";
  setBusy(true);
  try {
    result = await mutation();
    issueForm.hidden = true;
    issueCode.value = "";
    issueNote.value = "";
    render();
  } catch (error) {
    const target =
      result?.securing?.status === "needs_rework"
        ? reworkError
        : formError;
    target.textContent = error?.userMessage || fallbackMessage;
  } finally {
    busy = false;
    setBusy(false);
    if (result?.securing?.status === "securing") {
      renderTailInformation(result.securing);
      renderChecklist(result.securing);
      renderChoice(result.securing);
    } else if (result?.securing?.status === "needs_rework") {
      renderRework(result.securing);
    }
  }
}

function setBusy(disabled) {
  [
    startButton,
    saveInformationButton,
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
        !tailEngine.USER_CHECKLIST_IDS.includes(
          input.dataset.checklistId,
        );
    });
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
