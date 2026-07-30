"use strict";

const API_PATH = "/api/v1/calculate";
const CANONICAL_EXAMPLE_PATH = "/static/canonical-example.json";

const form = document.querySelector("#width-form");
const calculateButton = document.querySelector("#calculate-button");
const fillExampleButton = document.querySelector("#fill-example-button");
const clearFormButton = document.querySelector("#clear-form-button");
const shareButton = document.querySelector("#share-button");
const shareFeedback = document.querySelector("#share-feedback");
const validationSummary = document.querySelector("#validation-summary");
const idlePanel = document.querySelector("#idle-panel");
const loadingPanel = document.querySelector("#loading-panel");
const resultPanel = document.querySelector("#result-panel");
const errorPanel = document.querySelector("#error-panel");
const warningsPanel = document.querySelector("#warnings-panel");
const workingCountElement = document.querySelector("#working-count");
const stitchWordElement = document.querySelector("#stitch-word");
const statusLabelElement = document.querySelector("#status-label");
const startKnittingLink = document.querySelector("#start-knitting-link");
const errorTitleElement = document.querySelector("#error-title");
const errorContentElement = document.querySelector("#error-content");
const warningsContentElement = document.querySelector("#warnings-content");
const projectsLoading = document.querySelector("#projects-loading");
const projectsError = document.querySelector("#projects-error");
const projectsEmpty = document.querySelector("#projects-empty");
const projectsList = document.querySelector("#projects-list");
const newProjectTitle = document.querySelector("#new-project-title");
const createProjectButton = document.querySelector("#create-project-button");
const importProjectInput = document.querySelector("#import-project-input");
const projectTransferStatus = document.querySelector(
  "#project-transfer-status",
);
const currentProjectPanel = document.querySelector("#current-project-panel");
const currentProjectTitle = document.querySelector("#current-project-title");
const currentProjectNotes = document.querySelector("#current-project-notes");
const projectSaveStatus = document.querySelector("#project-save-status");
const projectSystem = window.YarnAIProjectSystem;
const cloudSystem = window.YarnAICloudAccounts;
const accountGuest = document.querySelector("#account-guest");
const accountUser = document.querySelector("#account-user");
const accountUserEmail = document.querySelector("#account-user-email");
const accountStatus = document.querySelector("#account-status");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const logoutButton = document.querySelector("#logout-button");
const cloudProjects = document.querySelector("#cloud-projects");
const cloudProjectsList = document.querySelector("#cloud-projects-list");
const cloudProjectsEmpty = document.querySelector("#cloud-projects-empty");
const refreshCloudButton = document.querySelector("#refresh-cloud-button");
const cloudProjectDetails = document.querySelector("#cloud-project-details");
const cloudProjectDetailsTitle = document.querySelector("#cloud-project-details-title");
const cloudProjectDetailsMeta = document.querySelector("#cloud-project-details-meta");
const saveCloudCopyButton = document.querySelector("#save-cloud-copy-button");
const cloudCopyStatus = document.querySelector("#cloud-copy-status");
let detailsStateBeforePrint = [];
let projectRepository = null;
let currentProjectAggregate = null;
let projectAutosave = null;
let currentProjectSection = "active";
let cloudClient = null;

const statusLabels = {
  READY: "Расчёт готов",
  READY_WITH_WARNINGS: "Расчёт готов с предупреждениями",
  INPUT_ERROR: "Ошибка входных данных",
  IMPOSSIBLE: "Расчёт невозможен",
  CONFIRMATION_REQUIRED: "Требуется подтверждение",
  OUT_OF_SCOPE: "Сценарий пока не поддерживается",
};

form.addEventListener("submit", handleSubmit);
fillExampleButton.addEventListener("click", fillCanonicalExample);
clearFormButton.addEventListener("click", clearForm);
shareButton.addEventListener("click", shareForm);
window.addEventListener("beforeprint", preparePrintView);
window.addEventListener("afterprint", restoreDetailsAfterPrint);
document
  .querySelector("#recalculate-button")
  .addEventListener("click", focusForm);
document
  .querySelector("#error-recalculate-button")
  .addEventListener("click", focusForm);

form.addEventListener("input", (event) => {
  if (event.target instanceof HTMLElement) {
    event.target.removeAttribute("aria-invalid");
  }
  validationSummary.hidden = true;
  shareFeedback.hidden = true;
  scheduleProjectFormAutosave();
});
form.addEventListener("focusout", () => {
  projectAutosave?.flush().catch(() => undefined);
});
createProjectButton.addEventListener("click", createProjectFromUi);
newProjectTitle.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    createProjectFromUi();
  }
});
document.querySelectorAll("[data-project-section]").forEach((tab) => {
  tab.addEventListener("click", () => switchProjectSection(tab.dataset.projectSection));
});
projectsList.addEventListener("click", handleProjectListAction);
importProjectInput.addEventListener("change", importProjectFromUi);
loginForm.addEventListener("submit", (event) => authenticateFromForm(event, false));
registerForm.addEventListener("submit", (event) => authenticateFromForm(event, true));
logoutButton.addEventListener("click", logoutFromUi);
refreshCloudButton.addEventListener("click", refreshCloudProjects);
cloudProjectsList.addEventListener("click", openCloudProjectFromUi);
saveCloudCopyButton.addEventListener("click", saveCurrentProjectToCloud);
currentProjectTitle.addEventListener("input", () => {
  projectAutosave?.update({ title: currentProjectTitle.value });
});
currentProjectNotes.addEventListener("input", () => {
  projectAutosave?.update({ notes: currentProjectNotes.value });
});
currentProjectTitle.addEventListener("blur", () => {
  projectAutosave?.flush().catch(() => undefined);
});
currentProjectNotes.addEventListener("blur", () => {
  projectAutosave?.flush().catch(() => undefined);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    projectAutosave?.flush().catch(() => undefined);
  }
});
window.addEventListener("beforeunload", () => {
  projectAutosave?.flush().catch(() => undefined);
});

initializePage();

async function initializePage() {
  const hasSharedValues = applyUrlParameters();
  const testerMode = window.YarnAITesterMode;
  const isNewTest =
    new URLSearchParams(window.location.search).get("tester") === "new";

  if (isNewTest) {
    testerMode?.clearActiveCalculation(getLocalStorage());
    testerMode?.initializeTesterUi();
    clearForm();
    showToolbarFeedback(
      "Новый тест начат. Заполни данные и выполни расчёт.",
    );
  }

  await initializeCloudAccount();
  await initializeProjectWorkspace();

  if (window.location.pathname === "/example") {
    document.title = "Канонический пример — YarnAI";
    document.querySelector(".eyebrow").textContent = "Канонический пример";
    document.querySelector("#page-title").textContent =
      "50 см при плотности 20 петель";
    document.querySelector(".intro-copy").textContent =
      "Пример уже заполнен и рассчитан: при плотности 20 петель на 10 см рабочая ширина 50 см требует 100 петель.";

    if (
      !currentProjectAggregate &&
      !hasSharedValues &&
      (await fillCanonicalExample())
    ) {
      form.requestSubmit();
    }
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  resetFeedback();

  if (!validateForm()) {
    return;
  }

  const payload = buildPayload();
  setLoading(true);

  try {
    const response = await fetch(API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await readJsonResponse(response);

    if (!response.ok) {
      showHttpError(response.status, data);
      return;
    }

    await showDomainResponse(data, payload, true);
  } catch (error) {
    if (error instanceof UnexpectedResponseError) {
      showSafeError(
        "Получен неполный ответ",
        "Сервис ответил в неожиданном формате. Попробуйте выполнить расчёт ещё раз.",
      );
    } else {
      showSafeError(
        "Нет связи с сервисом",
        "Не удалось отправить данные. Проверьте, что YarnAI запущен, и повторите расчёт.",
      );
    }
  } finally {
    setLoading(false);
  }
}

async function fillCanonicalExample() {
  fillExampleButton.disabled = true;
  shareFeedback.hidden = true;

  try {
    const response = await fetch(CANONICAL_EXAMPLE_PATH, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error("Canonical example is unavailable.");
    }
    const payload = await response.json();
    applyPayloadToForm(payload);
    scheduleProjectFormAutosave();
    resetFeedback();
    showIdlePanel();
    showToolbarFeedback("Канонический пример заполнен.");
    return true;
  } catch {
    showSafeError(
      "Пример не загружен",
      "Не удалось загрузить канонический пример. Обновите страницу и попробуйте снова.",
    );
    return false;
  } finally {
    fillExampleButton.disabled = false;
  }
}

function applyPayloadToForm(payload) {
  const fabric = payload.fabric_context;
  const width = payload.width;
  const gauge = width.gauge;
  const context = gauge.context;

  const values = {
    "functional-category": payload.functional_category,
    "knitting-mode": payload.knitting_mode,
    "zone-pattern": payload.zone_pattern,
    "pattern-class": payload.pattern_class,
    "zone-homogeneous": payload.zone_homogeneous,
    "width-value": width.value,
    "width-unit": width.unit,
    "size-kind": width.size_kind,
    direction: width.direction,
    "gauge-count": gauge.ready_count,
    "gauge-length": gauge.base_length,
    "gauge-unit": gauge.base_unit ?? width.unit,
    "measurement-count": gauge.source_measurement_count,
    "gauge-source": gauge.source,
    "off-needles": context.off_needles,
    "processing-state": context.processing_state,
    "fully-dry": context.fully_dry,
    "rest-hours": context.rest_hours,
    "measurement-state": context.measurement_state,
    "swatch-mode": context.mode,
    "heavy-or-large": context.heavy_or_large,
    yarn: fabric.yarn,
    "yarn-batch": fabric.yarn_batch,
    strands: fabric.strands,
    "strands-description": fabric.strands_description,
    "needle-mm": fabric.needle_mm,
    "needle-type": fabric.needle_type,
    "fabric-pattern": fabric.pattern,
    "fabric-mode": fabric.mode,
    "fabric-processing": fabric.processing,
  };

  Object.entries(values).forEach(([name, value]) => {
    const control = form.elements.namedItem(name);
    if (
      (control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement) &&
      value !== undefined &&
      value !== null
    ) {
      control.value = String(value);
    }
  });
}

function clearForm() {
  form.querySelectorAll("input").forEach((input) => {
    input.value = "";
  });
  form.querySelectorAll("select").forEach((select) => {
    select.selectedIndex = -1;
  });
  form.querySelectorAll("details").forEach((details) => {
    details.open = false;
  });
  window.history.replaceState({}, "", window.location.pathname);
  resetFeedback();
  showIdlePanel();
  showToolbarFeedback("Форма очищена.");
  scheduleProjectFormAutosave();
  document.querySelector("#width-value").focus();
}

async function shareForm() {
  const url = new URL(window.location.href);
  url.search = "";

  new FormData(form).forEach((value, name) => {
    if (String(value).trim() !== "") {
      url.searchParams.set(name, String(value));
    }
  });

  window.history.replaceState({}, "", url);

  try {
    await copyText(url.toString());
    showToolbarFeedback("Ссылка на заполненный пример скопирована.");
  } catch {
    showToolbarFeedback(
      "Не удалось скопировать ссылку автоматически. Скопируйте адрес из строки браузера.",
    );
  }
}

function applyUrlParameters() {
  const parameters = new URLSearchParams(window.location.search);
  let applied = false;

  parameters.forEach((value, name) => {
    const control = form.elements.namedItem(name);
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement
    ) {
      control.value = value;
      applied = true;
    }
  });
  return applied;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.className = "clipboard-helper";
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();
  if (!copied) {
    throw new Error("Copy command failed.");
  }
}

function showToolbarFeedback(message) {
  shareFeedback.textContent = message;
  shareFeedback.hidden = false;
}

function preparePrintView() {
  const detailSections = [...form.querySelectorAll("details")];
  detailsStateBeforePrint = detailSections.map((details) => details.open);
  detailSections.forEach((details) => {
    details.open = true;
  });
}

function restoreDetailsAfterPrint() {
  form.querySelectorAll("details").forEach((details, index) => {
    details.open = detailsStateBeforePrint[index] ?? false;
  });
  detailsStateBeforePrint = [];
}

function validateForm() {
  const controls = [...form.querySelectorAll("input, select")];
  let firstInvalid = null;
  let emptyCount = 0;
  let nonNumericCount = 0;

  controls.forEach((control) => {
    control.removeAttribute("aria-invalid");

    if (control.required && control.value.trim() === "") {
      emptyCount += 1;
      control.setAttribute("aria-invalid", "true");
      firstInvalid ??= control;
      return;
    }

    if (
      control instanceof HTMLInputElement &&
      control.type === "number" &&
      control.value !== "" &&
      (control.validity.badInput || !Number.isFinite(control.valueAsNumber))
    ) {
      nonNumericCount += 1;
      control.setAttribute("aria-invalid", "true");
      firstInvalid ??= control;
    }
  });

  if (emptyCount === 0 && nonNumericCount === 0) {
    return true;
  }

  const messages = [];
  if (emptyCount > 0) {
    messages.push("Заполните все обязательные поля.");
  }
  if (nonNumericCount > 0) {
    messages.push("В числовых полях укажите числа.");
  }

  validationSummary.textContent = messages.join(" ");
  validationSummary.hidden = false;
  firstInvalid?.focus();
  return false;
}

function buildPayload() {
  const fabricContext = {
    yarn: valueOf("yarn"),
    yarn_batch: valueOf("yarn-batch"),
    strands: numberOf("strands"),
    strands_description: valueOf("strands-description"),
    needle_mm: numberOf("needle-mm"),
    needle_type: valueOf("needle-type"),
    pattern: valueOf("fabric-pattern"),
    mode: valueOf("fabric-mode"),
    processing: valueOf("fabric-processing"),
  };

  return {
    axes: ["width"],
    functional_category: valueOf("functional-category"),
    knitting_mode: valueOf("knitting-mode"),
    zone_pattern: valueOf("zone-pattern"),
    pattern_class: valueOf("pattern-class"),
    zone_homogeneous: valueOf("zone-homogeneous"),
    fabric_context: fabricContext,
    width: {
      size_kind: valueOf("size-kind"),
      value: numberOf("width-value"),
      unit: valueOf("width-unit"),
      direction: valueOf("direction"),
      gauge: {
        method: "ready_value",
        source: valueOf("gauge-source"),
        ready_count: numberOf("gauge-count"),
        base_length: numberOf("gauge-length"),
        base_unit: valueOf("gauge-unit"),
        source_measurement_count: numberOf("measurement-count"),
        context: {
          off_needles: valueOf("off-needles"),
          processing_state: valueOf("processing-state"),
          fully_dry: valueOf("fully-dry"),
          rest_hours: numberOf("rest-hours"),
          measurement_state: valueOf("measurement-state"),
          fabric: { ...fabricContext },
          mode: valueOf("swatch-mode"),
          heavy_or_large: valueOf("heavy-or-large"),
        },
      },
    },
  };
}

async function showDomainResponse(data, requestPayload = null, persist = false) {
  if (!isRecord(data) || typeof data.status !== "string") {
    throw new UnexpectedResponseError();
  }

  const warnings = Array.isArray(data.warnings) ? data.warnings : [];

  if (data.status === "INPUT_ERROR") {
    showDomainError(
      "Проверьте входные данные",
      data.errors,
      "Некоторые данные не подходят для расчёта.",
    );
    showWarnings(warnings);
    return;
  }

  if (data.status === "IMPOSSIBLE") {
    showDomainError(
      "Эту ширину рассчитать нельзя",
      data.errors,
      "Заданные условия несовместимы. Измените данные и попробуйте снова.",
    );
    showWarnings(warnings);
    return;
  }

  if (
    data.status === "CONFIRMATION_REQUIRED" ||
    data.status === "OUT_OF_SCOPE"
  ) {
    showDomainError(
      statusLabels[data.status],
      data.errors?.length ? data.errors : data.clarifications,
      "Расчёт не может быть завершён с текущими данными.",
    );
    showWarnings(warnings);
    return;
  }

  if (data.status !== "READY" && data.status !== "READY_WITH_WARNINGS") {
    throw new UnexpectedResponseError();
  }

  if (
    !isRecord(data.axes) ||
    !isRecord(data.axes.width) ||
    !isRecord(data.axes.width.selected_candidate)
  ) {
    throw new UnexpectedResponseError();
  }

  const workingCount =
    data.axes.width.selected_candidate.working_count;

  if (
    typeof workingCount !== "number" ||
    !Number.isFinite(workingCount)
  ) {
    throw new UnexpectedResponseError();
  }

  hidePrimaryPanels();
  statusLabelElement.textContent =
    statusLabels[data.status] ?? statusLabels.READY;
  workingCountElement.textContent = String(workingCount);
  stitchWordElement.textContent = pluralizeStitches(workingCount);
  prepareSmartStart(data);
  resultPanel.hidden = false;
  showWarnings(warnings);
  if (persist && requestPayload && currentProjectAggregate) {
    await persistCalculationInCurrentProject(requestPayload, data);
  }
}

function prepareSmartStart(data) {
  startKnittingLink.hidden = true;
  const state = window.YarnAISmartStartState;
  const calculation = state?.createCalculation(data);
  const storage = getLocalStorage();

  if (
    !calculation ||
    !storage ||
    !state.saveCurrentCalculation(storage, calculation)
  ) {
    return;
  }

  const url = new URL("/smart-start", window.location.origin);
  url.searchParams.set("calculation", calculation.fingerprint);
  startKnittingLink.href = `${url.pathname}${url.search}`;
  startKnittingLink.hidden = false;
  window.YarnAITesterMode?.initializeTesterUi();
}

function showDomainError(title, diagnostics, fallback) {
  hidePrimaryPanels();
  errorTitleElement.textContent = title;
  errorContentElement.replaceChildren(
    createDiagnosticList(diagnostics, fallback),
  );
  errorPanel.hidden = false;
}

function showWarnings(warnings) {
  warningsPanel.hidden = true;
  warningsContentElement.replaceChildren();

  if (!Array.isArray(warnings) || warnings.length === 0) {
    return;
  }

  warningsContentElement.append(
    createDiagnosticList(
      warnings,
      "Расчёт выполнен, но требует дополнительной проверки.",
    ),
  );
  warningsPanel.hidden = false;
}

function createDiagnosticList(diagnostics, fallback) {
  const safeDiagnostics = Array.isArray(diagnostics)
    ? diagnostics.filter(isRecord)
    : [];

  if (safeDiagnostics.length === 0) {
    const paragraph = document.createElement("p");
    paragraph.textContent = fallback;
    return paragraph;
  }

  const list = document.createElement("ul");
  safeDiagnostics.forEach((diagnostic) => {
    const item = document.createElement("li");
    item.textContent =
      typeof diagnostic.reason === "string" && diagnostic.reason.trim()
        ? diagnostic.reason
        : fallback;

    if (
      typeof diagnostic.next_action === "string" &&
      diagnostic.next_action.trim()
    ) {
      const action = document.createElement("span");
      action.className = "diagnostic-action";
      action.textContent = diagnostic.next_action;
      item.append(action);
    }
    list.append(item);
  });
  return list;
}

function showHttpError(status) {
  const messages = {
    400: [
      "Запрос не принят",
      "Сервис не смог прочитать отправленные данные. Проверьте форму и повторите расчёт.",
    ],
    422: [
      "Проверьте данные формы",
      "Отправленные данные не соответствуют формату расчёта. Исправьте значения и попробуйте снова.",
    ],
    500: [
      "Техническая ошибка",
      "Сервис временно не смог выполнить расчёт. Повторите попытку позже.",
    ],
  };
  const [title, message] = messages[status] ?? [
    "Не удалось выполнить расчёт",
    "Сервис вернул ошибку. Проверьте данные и повторите попытку.",
  ];
  showSafeError(title, message);
}

function showSafeError(title, message) {
  hidePrimaryPanels();
  errorTitleElement.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  errorContentElement.replaceChildren(paragraph);
  errorPanel.hidden = false;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new UnexpectedResponseError();
  }

  try {
    return await response.json();
  } catch {
    throw new UnexpectedResponseError();
  }
}

function setLoading(isLoading) {
  calculateButton.disabled = isLoading;
  calculateButton.classList.toggle("is-loading", isLoading);
  form.setAttribute("aria-busy", String(isLoading));

  if (isLoading) {
    hidePrimaryPanels();
    warningsPanel.hidden = true;
    loadingPanel.hidden = false;
  } else {
    loadingPanel.hidden = true;
  }
}

function resetFeedback() {
  validationSummary.hidden = true;
  warningsPanel.hidden = true;
  document
    .querySelectorAll('[aria-invalid="true"]')
    .forEach((element) => element.removeAttribute("aria-invalid"));
}

function hidePrimaryPanels() {
  idlePanel.hidden = true;
  loadingPanel.hidden = true;
  resultPanel.hidden = true;
  errorPanel.hidden = true;
}

function showIdlePanel() {
  hidePrimaryPanels();
  warningsPanel.hidden = true;
  idlePanel.hidden = false;
}

function focusForm() {
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#width-value").focus({ preventScroll: true });
}

async function initializeProjectWorkspace() {
  if (!projectSystem) {
    showProjectsError(
      "Система локальных проектов не загрузилась. Обновите страницу.",
    );
    return;
  }
  try {
    projectRepository = new projectSystem.ProjectRepository();
    await projectRepository.initialize();
    const projectId = new URLSearchParams(window.location.search).get("project");
    if (projectId && projectSystem.isUuidv7(projectId)) {
      try {
        await openProjectInWorkspace(projectId);
      } catch (error) {
        showProjectsError(projectErrorMessage(error));
      }
    }
    await refreshProjectsList();
  } catch (error) {
    showProjectsError(projectErrorMessage(error));
  }
}

async function initializeCloudAccount() {
  if (!cloudSystem) {
    accountStatus.textContent = "Облачные функции не загрузились. Локальный режим доступен.";
    return;
  }
  cloudClient = new cloudSystem.CloudAccountClient();
  accountStatus.textContent = "Проверяем активную сессию…";
  try {
    await cloudClient.restoreSession();
    renderAccountState();
    if (cloudClient.user) {
      await refreshCloudProjects();
    }
  } catch (error) {
    accountStatus.textContent = cloudErrorMessage(error);
    renderAccountState();
  }
}

async function authenticateFromForm(event, registration) {
  event.preventDefault();
  if (!cloudClient) {
    return;
  }
  const formElement = event.currentTarget;
  const submit = formElement.querySelector("button[type='submit']");
  const data = new FormData(formElement);
  submit.disabled = true;
  accountStatus.textContent = registration
    ? "Создаём аккаунт…"
    : "Выполняем вход…";
  try {
    if (registration) {
      await cloudClient.register(data.get("email"), data.get("password"));
    } else {
      await cloudClient.login(data.get("email"), data.get("password"));
    }
    formElement.reset();
    renderAccountState();
    accountStatus.textContent = registration
      ? "Аккаунт создан. Вы вошли."
      : "Вход выполнен.";
    await refreshCloudProjects();
  } catch (error) {
    accountStatus.textContent = cloudErrorMessage(error);
  } finally {
    submit.disabled = false;
  }
}

async function logoutFromUi() {
  if (!cloudClient) {
    return;
  }
  logoutButton.disabled = true;
  accountStatus.textContent = "Завершаем сессию…";
  try {
    await cloudClient.logout();
    accountStatus.textContent =
      "Вы вышли. Локальные проекты остались на этом устройстве.";
  } catch (error) {
    accountStatus.textContent = cloudErrorMessage(error);
  } finally {
    logoutButton.disabled = false;
    renderAccountState();
  }
}

function renderAccountState() {
  const signedIn = Boolean(cloudClient?.user);
  accountGuest.hidden = signedIn;
  accountUser.hidden = !signedIn;
  cloudProjects.hidden = !signedIn;
  accountUserEmail.textContent = signedIn ? cloudClient.user.email : "";
  saveCloudCopyButton.disabled = !signedIn || !currentProjectAggregate;
  if (!signedIn) {
    cloudProjectsList.replaceChildren();
    cloudProjectDetails.hidden = true;
    if (accountStatus.textContent === "Проверяем активную сессию…") {
      accountStatus.textContent =
        "Гостевой режим: локальные проекты доступны без аккаунта.";
    }
  } else if (accountStatus.textContent === "Проверяем активную сессию…") {
    accountStatus.textContent = `Сессия восстановлена: ${cloudClient.user.email}`;
  }
}

async function refreshCloudProjects() {
  if (!cloudClient?.user) {
    return;
  }
  refreshCloudButton.disabled = true;
  try {
    const result = await cloudClient.listProjects("active", null, 50);
    cloudProjectsEmpty.hidden = result.projects.length > 0;
    cloudProjectsList.replaceChildren(
      ...result.projects.map((project) => {
        const item = document.createElement("article");
        item.className = "project-list-item";
        const summary = document.createElement("div");
        const title = document.createElement("h3");
        title.className = "project-list-title";
        title.textContent = project.title;
        const meta = document.createElement("p");
        meta.className = "project-list-meta";
        meta.textContent = `Версия ${project.revision} · ${new Date(project.updated_at).toLocaleString("ru")}`;
        summary.append(title, meta);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "project-action";
        button.dataset.cloudProjectId = project.id;
        button.textContent = "Открыть";
        item.append(summary, button);
        return item;
      }),
    );
  } catch (error) {
    accountStatus.textContent = cloudErrorMessage(error);
  } finally {
    refreshCloudButton.disabled = false;
  }
}

async function openCloudProjectFromUi(event) {
  const button = event.target.closest("[data-cloud-project-id]");
  if (!button || !cloudClient?.user) {
    return;
  }
  button.disabled = true;
  try {
    const result = await cloudClient.getProject(button.dataset.cloudProjectId);
    cloudProjectDetailsTitle.textContent = result.project.title;
    cloudProjectDetailsMeta.textContent =
      `Облачная revision ${result.project.revision}. ` +
      `Копия сохранена ${new Date(result.project.updated_at).toLocaleString("ru")}.`;
    cloudProjectDetails.hidden = false;
  } catch (error) {
    accountStatus.textContent = cloudErrorMessage(error);
  } finally {
    button.disabled = false;
  }
}

async function saveCurrentProjectToCloud() {
  if (!cloudClient?.user || !currentProjectAggregate || !projectRepository) {
    cloudCopyStatus.textContent =
      "Войдите и откройте локальный проект перед сохранением.";
    return;
  }
  saveCloudCopyButton.disabled = true;
  cloudCopyStatus.textContent = "Сохраняем независимую копию…";
  try {
    await projectAutosave?.flush();
    currentProjectAggregate = await projectRepository.getProject(
      currentProjectAggregate.project.project_id,
    );
    const result = await cloudClient.saveLocalProject(currentProjectAggregate);
    cloudCopyStatus.textContent =
      `Копия «${result.project.title}» сохранена в облаке. Локальный проект не изменён.`;
    await refreshCloudProjects();
  } catch (error) {
    cloudCopyStatus.textContent = cloudErrorMessage(error);
  } finally {
    saveCloudCopyButton.disabled = !cloudClient?.user || !currentProjectAggregate;
  }
}

function cloudErrorMessage(error) {
  const messages = {
    INVALID_CREDENTIALS: "Email или пароль неверны.",
    ACCOUNT_UNAVAILABLE: "Аккаунт с такими данными создать нельзя.",
    VALIDATION_ERROR: error?.message,
    PROJECT_ID_CONFLICT:
      "Проект с этим ID уже есть в облаке. Он не был перезаписан.",
    REVISION_CONFLICT: "Облачный проект уже изменился на другом устройстве.",
    NETWORK_ERROR:
      "Нет связи с сервером. Локальные проекты продолжают работать.",
    AUTH_REQUIRED: "Войдите, чтобы использовать облачные проекты.",
  };
  return messages[error?.code] ?? error?.message ?? "Облачный запрос не выполнен.";
}

async function refreshProjectsList() {
  if (!projectRepository) {
    return;
  }
  projectsLoading.hidden = false;
  projectsError.hidden = true;
  projectsEmpty.hidden = true;
  projectsList.hidden = true;
  try {
    const projects = await projectRepository.listProjects({
      section: currentProjectSection,
    });
    renderProjects(projects);
    projectsLoading.hidden = true;
    projectsEmpty.hidden = projects.length > 0;
    projectsList.hidden = projects.length === 0;
  } catch (error) {
    projectsLoading.hidden = true;
    showProjectsError(projectErrorMessage(error));
  }
}

function renderProjects(projects) {
  const statusLabelsForProjects = {
    DRAFT: "Черновик",
    ACTIVE: "В работе",
    PAUSED: "Приостановлен",
    COMPLETED: "Завершён",
    ARCHIVED: "В архиве",
    DELETED: "В корзине",
  };
  const formatter = new Intl.DateTimeFormat("ru", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  projectsList.replaceChildren(
    ...projects.map((project) => {
      const item = document.createElement("article");
      item.className = "project-list-item";
      item.dataset.projectId = project.project_id;
      if (project.project_id === currentProjectAggregate?.project.project_id) {
        item.classList.add("is-current");
      }
      const summary = document.createElement("div");
      const title = document.createElement("h3");
      title.className = "project-list-title";
      title.textContent = project.title;
      const meta = document.createElement("p");
      meta.className = "project-list-meta";
      const incomplete = project.has_unfinished_calculation
        ? " · есть незавершённый расчёт"
        : project.active_calculation_id
          ? " · расчёт сохранён"
          : " · расчёт ещё не создан";
      meta.textContent = `${statusLabelsForProjects[project.workspace_status]} · изменён ${formatter.format(new Date(project.updated_at))}${incomplete}`;
      summary.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "project-list-actions";
      projectActionsForStatus(project.workspace_status).forEach(
        ([action, label, danger = false]) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `project-action${danger ? " project-action-danger" : ""}`;
          button.dataset.projectAction = action;
          button.textContent = label;
          actions.append(button);
        },
      );
      item.append(summary, actions);
      return item;
    }),
  );
}

function projectActionsForStatus(status) {
  if (status === "DELETED") {
    return [
      ["restore-deleted", "Восстановить"],
      ["purge", "Удалить навсегда", true],
    ];
  }
  if (status === "ARCHIVED") {
    return [
      ["open", "Открыть"],
      ["duplicate", "Дублировать"],
      ["restore-archive", "Восстановить"],
      ["export", "Экспорт"],
      ["delete", "В корзину", true],
    ];
  }
  return [
    ["open", "Открыть"],
    ["duplicate", "Дублировать"],
    ["archive", "В архив"],
    ["export", "Экспорт"],
    ["delete", "В корзину", true],
  ];
}

function switchProjectSection(section) {
  if (!["active", "archive", "trash"].includes(section)) {
    return;
  }
  currentProjectSection = section;
  document.querySelectorAll("[data-project-section]").forEach((tab) => {
    const active = tab.dataset.projectSection === section;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  refreshProjectsList();
}

async function createProjectFromUi() {
  if (!projectRepository) {
    showProjectsError("Локальное хранилище проектов недоступно.");
    return;
  }
  createProjectButton.disabled = true;
  projectTransferStatus.textContent = "";
  try {
    const input = {};
    if (newProjectTitle.value.trim()) {
      input.title = newProjectTitle.value;
    }
    input.draft_input = captureProjectFormState();
    const project = await projectRepository.createProject(input);
    newProjectTitle.value = "";
    currentProjectSection = "active";
    await openProjectInWorkspace(project.project_id);
    await refreshProjectsList();
    projectTransferStatus.textContent =
      "Проект создан и сохранён на этом устройстве.";
  } catch (error) {
    showProjectsError(projectErrorMessage(error));
  } finally {
    createProjectButton.disabled = false;
  }
}

async function handleProjectListAction(event) {
  const button = event.target.closest("[data-project-action]");
  const item = event.target.closest("[data-project-id]");
  if (!button || !item || !projectRepository) {
    return;
  }
  const projectId = item.dataset.projectId;
  const action = button.dataset.projectAction;
  button.disabled = true;
  projectsError.hidden = true;
  projectTransferStatus.textContent = "";
  try {
    if (action === "open") {
      await flushCurrentProjectBeforeLifecycle();
      await openProjectInWorkspace(projectId);
    } else if (action === "duplicate") {
      await flushCurrentProjectBeforeLifecycle();
      const duplicate = await projectRepository.duplicateProject(projectId);
      currentProjectSection = "active";
      await openProjectInWorkspace(duplicate.project_id);
      projectTransferStatus.textContent = "Независимая копия проекта создана.";
    } else if (action === "archive") {
      await flushCurrentProjectBeforeLifecycle();
      await projectRepository.archiveProject(projectId);
      await closeWorkspaceIfCurrent(projectId);
    } else if (action === "restore-archive") {
      await projectRepository.restoreProject(projectId);
      currentProjectSection = "active";
    } else if (action === "delete") {
      if (!window.confirm("Переместить проект в корзину? Его можно восстановить.")) {
        return;
      }
      await flushCurrentProjectBeforeLifecycle();
      await projectRepository.softDeleteProject(projectId);
      await closeWorkspaceIfCurrent(projectId);
    } else if (action === "restore-deleted") {
      await projectRepository.restoreDeletedProject(projectId);
      currentProjectSection = "active";
    } else if (action === "purge") {
      if (
        !window.confirm(
          "Удалить проект и все связанные расчёты и изображения безвозвратно?",
        )
      ) {
        return;
      }
      await projectRepository.permanentlyDeleteProject(projectId, {
        confirmed: true,
      });
      await closeWorkspaceIfCurrent(projectId);
    } else if (action === "export") {
      await exportProjectFromUi(projectId);
    }
    await refreshProjectsList();
  } catch (error) {
    showProjectsError(projectErrorMessage(error));
  } finally {
    button.disabled = false;
  }
}

async function openProjectInWorkspace(projectId) {
  await projectAutosave?.destroy().catch(() => undefined);
  projectAutosave = null;
  const aggregate = await projectRepository.openProject(projectId, {
    includeDeleted: false,
  });
  currentProjectAggregate = aggregate;
  currentProjectPanel.hidden = false;
  saveCloudCopyButton.disabled = !cloudClient?.user;
  cloudCopyStatus.textContent = "";
  currentProjectTitle.value = aggregate.project.title;
  currentProjectNotes.value = aggregate.project.notes;
  projectAutosave = new projectSystem.ProjectAutosave(
    projectRepository,
    projectId,
    {
      delay: 500,
      onStateChange: updateProjectSaveStatus,
    },
  );
  const activeCalculation = aggregate.calculations.find(
    (entry) =>
      entry.calculation_id === aggregate.project.active_calculation_id,
  );
  if (activeCalculation) {
    applyPayloadToForm(activeCalculation.request);
    await showDomainResponse(
      activeCalculation.result,
      activeCalculation.request,
      false,
    );
  } else {
    showIdlePanel();
  }
  const recoveredPatch = aggregate.recovery_draft?.patch;
  const savedDraft =
    recoveredPatch?.draft_input ?? aggregate.project.draft_input;
  if (savedDraft?.kind === "FORM_V1") {
    applyProjectFormState(savedDraft);
  } else if (!activeCalculation && savedDraft?.axes) {
    applyPayloadToForm(savedDraft);
  }
  if (recoveredPatch) {
    if (typeof recoveredPatch.title === "string") {
      currentProjectTitle.value = recoveredPatch.title;
    }
    if (typeof recoveredPatch.notes === "string") {
      currentProjectNotes.value = recoveredPatch.notes;
    }
    projectAutosave.update(recoveredPatch);
    projectTransferStatus.textContent =
      "Восстановлены последние доступные изменения после сбоя.";
  }
  const url = new URL(window.location.href);
  url.searchParams.set("project", projectId);
  window.history.replaceState({}, "", url);
  updateProjectSaveStatus({ state: "SAVED_LOCAL" });
}

async function closeWorkspaceIfCurrent(projectId) {
  if (currentProjectAggregate?.project.project_id !== projectId) {
    return;
  }
  await projectAutosave?.destroy().catch(() => undefined);
  projectAutosave = null;
  currentProjectAggregate = null;
  currentProjectPanel.hidden = true;
  saveCloudCopyButton.disabled = true;
  cloudCopyStatus.textContent = "";
  const url = new URL(window.location.href);
  url.searchParams.delete("project");
  window.history.replaceState({}, "", url);
}

async function flushCurrentProjectBeforeLifecycle() {
  if (!projectAutosave) {
    return;
  }
  try {
    await projectAutosave.flush();
  } catch (error) {
    throw new projectSystem.ProjectRepositoryError(
      "PENDING_SAVE_FAILED",
      "Последние изменения не сохранены. Действие отменено, чтобы не потерять данные.",
      { cause: error },
    );
  }
}

function captureProjectFormState() {
  const values = {};
  [...form.elements].forEach((control) => {
    if (
      control.name &&
      (control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement)
    ) {
      values[control.name] = control.value;
    }
  });
  return { kind: "FORM_V1", values };
}

function applyProjectFormState(state) {
  if (!state || state.kind !== "FORM_V1" || !isRecord(state.values)) {
    return;
  }
  Object.entries(state.values).forEach(([name, value]) => {
    const control = form.elements.namedItem(name);
    if (
      (control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement) &&
      typeof value === "string"
    ) {
      control.value = value;
    }
  });
}

function scheduleProjectFormAutosave() {
  if (!projectAutosave) {
    return;
  }
  projectAutosave.update({
    draft_input: captureProjectFormState(),
    has_unfinished_calculation: true,
  });
}

async function persistCalculationInCurrentProject(requestPayload, result) {
  const projectId = currentProjectAggregate?.project.project_id;
  if (!projectId) {
    return;
  }
  try {
    await projectAutosave?.flush();
    const saved = await projectRepository.addCalculation(
      projectId,
      requestPayload,
      result,
    );
    currentProjectAggregate.project = saved.project;
    currentProjectAggregate.calculations.push(saved.calculation);
    currentProjectAggregate.progress.push(...saved.progress);
    updateProjectSaveStatus({ state: "SAVED_LOCAL" });
    await refreshProjectsList();
  } catch (error) {
    updateProjectSaveStatus({
      state: "SAVE_FAILED",
      error,
    });
    showProjectsError(
      `Расчёт показан, но не сохранён в проекте. ${projectErrorMessage(error)}`,
    );
  }
}

function updateProjectSaveStatus({ state, error = null }) {
  const messages = {
    CLEAN: "Сохранено на устройстве",
    DIRTY: "Есть несохранённые изменения",
    SAVING: "Сохраняем на устройстве…",
    SAVED_LOCAL: "Сохранено на устройстве",
    SAVE_FAILED:
      "Не удалось сохранить. Изменения остаются в этой вкладке; повторите попытку.",
    CONFLICT_LOCAL:
      "Проект изменён в другой вкладке. Перезагрузите проект.",
  };
  projectSaveStatus.dataset.state = state;
  projectSaveStatus.textContent =
    state === "SAVE_FAILED" && error
      ? `${messages[state]} ${projectErrorMessage(error)}`
      : messages[state] ?? messages.CLEAN;
}

async function exportProjectFromUi(projectId) {
  const exported = await projectRepository.exportProject(projectId);
  const blob = new Blob([exported.json], { type: exported.mime_type });
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = exported.filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
  projectTransferStatus.textContent =
    "Переносимый файл проекта подготовлен.";
}

async function importProjectFromUi() {
  const file = importProjectInput.files?.[0];
  if (!file || !projectRepository) {
    return;
  }
  importProjectInput.disabled = true;
  projectsError.hidden = true;
  try {
    const result = await projectRepository.importProject(file);
    currentProjectSection = "active";
    await openProjectInWorkspace(result.project_id);
    await refreshProjectsList();
    projectTransferStatus.textContent =
      result.status === "ALREADY_IMPORTED"
        ? "Этот файл уже был импортирован."
        : result.collision
          ? "Проект импортирован как независимая копия из-за совпадения идентификатора."
          : "Проект импортирован и сохранён на устройстве.";
  } catch (error) {
    showProjectsError(projectErrorMessage(error));
  } finally {
    importProjectInput.value = "";
    importProjectInput.disabled = false;
  }
}

function showProjectsError(message) {
  projectsError.textContent = message;
  projectsError.hidden = false;
  projectsLoading.hidden = true;
}

function projectErrorMessage(error) {
  if (
    projectSystem &&
    error instanceof projectSystem.ProjectRepositoryError
  ) {
    return error.userMessage;
  }
  return "Произошла ошибка локального хранилища. Обновите страницу и попробуйте снова.";
}

function valueOf(id) {
  return document.querySelector(`#${id}`).value;
}

function numberOf(id) {
  return document.querySelector(`#${id}`).valueAsNumber;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

class UnexpectedResponseError extends Error {}
