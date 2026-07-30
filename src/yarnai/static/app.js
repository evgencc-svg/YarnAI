"use strict";

const API_PATH = "/api/v1/calculate";

const form = document.querySelector("#width-form");
const calculateButton = document.querySelector("#calculate-button");
const validationSummary = document.querySelector("#validation-summary");
const idlePanel = document.querySelector("#idle-panel");
const loadingPanel = document.querySelector("#loading-panel");
const resultPanel = document.querySelector("#result-panel");
const errorPanel = document.querySelector("#error-panel");
const warningsPanel = document.querySelector("#warnings-panel");
const workingCountElement = document.querySelector("#working-count");
const stitchWordElement = document.querySelector("#stitch-word");
const statusLabelElement = document.querySelector("#status-label");
const errorTitleElement = document.querySelector("#error-title");
const errorContentElement = document.querySelector("#error-content");
const warningsContentElement = document.querySelector("#warnings-content");

const statusLabels = {
  READY: "Расчёт готов",
  READY_WITH_WARNINGS: "Расчёт готов с предупреждениями",
  INPUT_ERROR: "Ошибка входных данных",
  IMPOSSIBLE: "Расчёт невозможен",
  CONFIRMATION_REQUIRED: "Требуется подтверждение",
  OUT_OF_SCOPE: "Сценарий пока не поддерживается",
};

form.addEventListener("submit", handleSubmit);
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
});

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

    showDomainResponse(data);
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

function showDomainResponse(data) {
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
  resultPanel.hidden = false;
  showWarnings(warnings);
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

function focusForm() {
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#width-value").focus({ preventScroll: true });
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
