"use strict";

const projectSystem = window.YarnAIProjectSystem;
const patternImport = window.YarnAIPatternImport;
const $ = (selector) => document.querySelector(selector);

const ui = {
  error: $("#pattern-import-error"),
  errorMessage: $("#pattern-import-error-message"),
  workflow: $("#pattern-import-workflow"),
  projectTitle: $("#pattern-import-project-title"),
  status: $("#pattern-import-status"),
  statusMessage: $("#pattern-import-status-message"),
  corrupted: $("#pattern-import-corrupted"),
  diagnostic: $("#pattern-import-diagnostic"),
  reset: $("#pattern-import-reset"),
  blocked: $("#pattern-import-blocked"),
  blockers: $("#pattern-import-blockers"),
  collecting: $("#pattern-import-collecting"),
  add: $("#pattern-import-add"),
  input: $("#pattern-import-input"),
  formError: $("#pattern-import-form-error"),
  materialsPanel: $("#pattern-import-materials-panel"),
  materials: $("#pattern-import-materials"),
  count: $("#pattern-import-count"),
  confirm: $("#pattern-import-confirm"),
  continueButton: $("#pattern-import-continue"),
  completed: $("#pattern-import-completed"),
  completedSummary: $("#pattern-import-completed-summary"),
};

let repository;
let projectId;
let result;
let busy = false;

initialize().catch((error) => {
  showFatal(
    error?.userMessage ||
      "Не удалось загрузить Import Pattern. Данные проекта не изменены.",
  );
});

async function initialize() {
  projectId = new URLSearchParams(window.location.search).get("project");
  if (
    !projectId ||
    !projectSystem ||
    !patternImport ||
    !projectSystem.isUuidv7(projectId)
  ) {
    showFatal("Ссылка на проект повреждена. Данные проекта не изменены.");
    return;
  }
  repository = new projectSystem.ProjectRepository();
  await repository.initialize();
  result = await patternImport.ensureForProject(repository, projectId);
  bindActions();
  render();
}

function bindActions() {
  ui.add.addEventListener("click", () => ui.input.click());
  ui.input.addEventListener("change", () => {
    const files = [...(ui.input.files || [])];
    if (!files.length) return;
    mutate(
      () =>
        patternImport.addMaterialsForProject(
          repository,
          projectId,
          files.map((file) => patternImport.materialFromFile(file)),
        ),
      "Проверьте тип и размер выбранных файлов.",
    ).finally(() => {
      ui.input.value = "";
    });
  });
  ui.confirm.addEventListener("change", updateContinueAvailability);
  ui.continueButton.addEventListener("click", () => {
    if (!ui.confirm.checked) {
      ui.formError.textContent =
        "Сначала подтвердите, что материалы относятся к одному проекту.";
      return;
    }
    mutate(
      () => patternImport.completeForProject(repository, projectId, true),
      "Не удалось подтвердить список материалов.",
    );
  });
  ui.reset.addEventListener("click", () =>
    mutate(
      () => patternImport.resetForProject(repository, projectId),
      "Не удалось безопасно создать intake заново.",
    ),
  );
}

function render() {
  ui.error.hidden = true;
  ui.workflow.hidden = false;
  ui.projectTitle.textContent = result.project?.title || "Сохранённый проект";
  [
    ui.corrupted,
    ui.blocked,
    ui.collecting,
    ui.materialsPanel,
    ui.completed,
  ].forEach((panel) => {
    panel.hidden = true;
  });

  if (result.state === "corrupted") {
    setStatus("Нужно восстановление", result.diagnostic?.message);
    ui.corrupted.hidden = false;
    ui.diagnostic.textContent =
      result.diagnostic?.message || "Запись имеет неподдерживаемый формат.";
    return;
  }
  if (result.state === "blocked" || result.patternImport?.status === "blocked") {
    setStatus("Заблокировано", "Безопасное продолжение невозможно.");
    ui.blocked.hidden = false;
    const entries = result.patternImport?.blockers?.length
      ? result.patternImport.blockers
      : result.blockers || [];
    ui.blockers.replaceChildren(
      ...entries.map((entry) => listItem(entry.message)),
    );
    return;
  }
  const state = result.patternImport;
  if (!state) {
    showFatal("Запись Import Pattern не найдена.");
    return;
  }
  setStatus(statusLabel(state.status), patternImport.progressSummary(state));
  if (state.status === "completed") {
    ui.completed.hidden = false;
    ui.completedSummary.textContent = `${state.materials.length} ${materialLabel(
      state.materials.length,
    )} подтверждено ${formatDate(state.completedAt)}.`;
    return;
  }
  ui.collecting.hidden = false;
  renderMaterials(state);
}

function renderMaterials(state) {
  const hasMaterials = state.materials.length > 0;
  ui.materialsPanel.hidden = !hasMaterials;
  ui.count.textContent = `${state.materials.length} ${materialLabel(
    state.materials.length,
  )}`;
  ui.materials.replaceChildren(
    ...state.materials.map((material) => materialRow(material, state)),
  );
  ui.confirm.checked = false;
  updateContinueAvailability();
}

function materialRow(material, state) {
  const item = document.createElement("li");
  item.className = "pattern-import-material";
  item.dataset.materialId = material.id;

  const order = document.createElement("span");
  order.className = "material-order";
  order.textContent = String(material.order);

  const details = document.createElement("div");
  details.className = "material-details";
  const name = document.createElement("div");
  name.className = "material-name";
  name.textContent = material.displayName;
  const meta = document.createElement("div");
  meta.className = "material-meta";
  const type = document.createElement("span");
  type.className = "material-type";
  type.textContent = typeLabel(material.type);
  const size = document.createElement("span");
  size.textContent = formatSize(material.size);
  const position = document.createElement("span");
  position.textContent = `Порядок: ${material.order}`;
  meta.append(type, size, position);
  details.append(name, meta);

  const controls = document.createElement("div");
  controls.className = "material-controls";
  const up = actionButton("↑", `Поднять «${material.displayName}»`, () =>
    reorder(material, material.order - 1),
  );
  up.disabled = busy || material.order === 1;
  const down = actionButton("↓", `Опустить «${material.displayName}»`, () =>
    reorder(material, material.order + 1),
  );
  down.disabled = busy || material.order === state.materials.length;
  const remove = actionButton("Удалить", `Удалить «${material.displayName}»`, () =>
    mutate(
      () =>
        patternImport.removeMaterialForProject(
          repository,
          projectId,
          material.id,
        ),
      "Не удалось удалить материал.",
    ),
  );
  remove.classList.add("material-remove");
  controls.append(up, down, remove);
  item.append(order, details, controls);
  return item;
}

function reorder(material, targetOrder) {
  return mutate(
    () =>
      patternImport.moveMaterialForProject(
        repository,
        projectId,
        material.id,
        targetOrder,
      ),
    "Не удалось изменить порядок материалов.",
  );
}

function actionButton(label, accessibleLabel, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-button";
  button.textContent = label;
  button.setAttribute("aria-label", accessibleLabel);
  button.addEventListener("click", action);
  return button;
}

async function mutate(operation, fallback) {
  if (busy) return;
  busy = true;
  ui.formError.textContent = "";
  setButtonsDisabled(true);
  try {
    result = await operation();
    render();
  } catch (error) {
    const message = error?.userMessage || fallback;
    ui.formError.textContent = message;
    ui.statusMessage.textContent = message;
  } finally {
    busy = false;
    setButtonsDisabled(false);
    if (result?.patternImport && result.state !== "blocked") render();
  }
}

function setButtonsDisabled(disabled) {
  document
    .querySelectorAll("#pattern-import-workflow button")
    .forEach((button) => {
      button.disabled = disabled;
    });
}

function updateContinueAvailability() {
  const state = result?.patternImport;
  ui.continueButton.disabled =
    busy ||
    state?.status !== "ready" ||
    state.materials.length === 0 ||
    !ui.confirm.checked;
}

function setStatus(label, message) {
  ui.status.textContent = label;
  ui.statusMessage.textContent = message || "";
}

function statusLabel(status) {
  return {
    not_started: "Материалы не добавлены",
    collecting: "Добавьте материалы",
    ready: "Готово к подтверждению",
    importing: "Подтверждение сохранено",
    completed: "Завершено",
    blocked: "Заблокировано",
  }[status] || "Проверка";
}

function typeLabel(type) {
  return { pdf: "PDF", image: "Изображение", text: "Текст" }[type] || type;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function materialLabel(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "материал";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return "материала";
  }
  return "материалов";
}

function listItem(message) {
  const item = document.createElement("li");
  item.textContent = message;
  return item;
}

function showFatal(message) {
  ui.workflow.hidden = true;
  ui.error.hidden = false;
  ui.errorMessage.textContent = message;
}
