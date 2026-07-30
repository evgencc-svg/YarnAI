"use strict";

const state = window.YarnAISmartStartState;
const emptyState = document.querySelector("#smart-start-empty");
const workflow = document.querySelector("#smart-start-workflow");
const stepRegion = document.querySelector("#step-region");
const completionPanel = document.querySelector("#completion-panel");
const stepPosition = document.querySelector("#step-position");
const progressPercent = document.querySelector("#progress-percent");
const stepProgress = document.querySelector("#step-progress");
const stepNumber = document.querySelector("#step-number");
const stepTitle = document.querySelector("#step-title");
const stepContent = document.querySelector("#step-content");
const backButton = document.querySelector("#smart-back-button");
const nextButton = document.querySelector("#smart-next-button");
const resetButton = document.querySelector("#smart-reset-button");
const completionTitle = document.querySelector("#completion-title");
const completionSummary = document.querySelector("#completion-summary");

let calculation = null;
let progress = null;

initializeSmartStart();

function initializeSmartStart() {
  const storage = getLocalStorage();
  const expectedFingerprint = new URLSearchParams(
    window.location.search,
  ).get("calculation") ?? "";

  if (!state || !storage) {
    showEmptyState();
    return;
  }

  calculation = state.readCurrentCalculation(
    storage,
    expectedFingerprint,
  );
  if (!calculation) {
    showEmptyState();
    return;
  }

  progress = state.readProgress(storage, calculation.fingerprint);
  renderProjectSummary();
  workflow.hidden = false;
  emptyState.hidden = true;
  renderProgress(false);

  backButton.addEventListener("click", goBack);
  nextButton.addEventListener("click", completeCurrentStep);
  resetButton.addEventListener("click", restart);
}

function showEmptyState() {
  workflow.hidden = true;
  emptyState.hidden = false;
}

function renderProjectSummary() {
  const count = calculation.workingCount;
  document.querySelector("#project-working-count").textContent = String(count);
  document.querySelector("#project-stitch-word").textContent =
    pluralizeStitches(count);

  const width = formatWidth(calculation.width);
  const gauge = formatGauge(calculation.gauge);
  const needle = formatNeedle(calculation.materials);
  setFact("project-width", "project-width-row", width);
  setFact("project-gauge", "project-gauge-row", gauge);
  setFact("project-needle", "project-needle-row", needle);

  const parts = [`Расчёт: ${count} ${pluralizeStitches(count)}`];
  if (width) {
    parts.push(`ширина ${width}`);
  }
  if (gauge) {
    parts.push(`плотность ${gauge}`);
  }
  document.querySelector("#project-description").textContent =
    `${parts.join(" · ")}.`;
}

function renderProgress(moveFocus) {
  if (progress.completed) {
    stepRegion.hidden = true;
    completionPanel.hidden = false;
    stepPosition.textContent = `Шаг ${state.STEP_COUNT} из ${state.STEP_COUNT}`;
    stepProgress.value = state.STEP_COUNT;
    renderCompletion();
    if (moveFocus) {
      completionTitle.focus();
    }
    return;
  }

  const currentNumber = progress.currentStep + 1;
  const percent = Math.round((currentNumber / state.STEP_COUNT) * 100);
  completionPanel.hidden = true;
  stepRegion.hidden = false;
  stepPosition.textContent =
    `Шаг ${currentNumber} из ${state.STEP_COUNT}`;
  progressPercent.textContent = `${percent}%`;
  stepProgress.value = currentNumber;
  stepNumber.textContent = String(currentNumber).padStart(2, "0");
  backButton.disabled = progress.currentStep === 0;
  nextButton.textContent =
    currentNumber === state.STEP_COUNT ? "Завершить" : "Готово, дальше";

  const step = buildSteps()[progress.currentStep];
  stepTitle.textContent = step.title;
  stepContent.replaceChildren(...step.content);
  if (moveFocus) {
    stepTitle.focus();
  }
}

function buildSteps() {
  const count = calculation.workingCount;
  const stitchWord = pluralizeStitches(count);
  const width = formatWidth(calculation.width);
  const gauge = formatGauge(calculation.gauge);
  const materials = calculation.materials;

  return [
    {
      title: "Проверить исходные данные",
      content: [
        paragraph(
          "Сверь параметры с текущим проектом. Если что-то изменилось, вернись к расчёту и выполни его заново.",
        ),
        factList([
          ["Количество", `${count} ${stitchWord}`],
          ["Ширина", width],
          ["Плотность", gauge],
          ["Пряжа", materials.yarn],
          ["Спицы", formatNeedle(materials)],
        ]),
      ],
    },
    {
      title: "Подготовить материалы",
      content: [
        paragraph("Подготовь всё, что понадобится для уверенного старта:"),
        bulletList([
          materials.yarn ? `выбранную пряжу: ${materials.yarn}` : "выбранную пряжу",
          formatNeedle(materials)
            ? `используемые спицы: ${formatNeedle(materials)}`
            : "используемые спицы",
          "маркеры, если они нужны для проекта",
          "измерительную ленту",
          "средство для записи или счётчик рядов",
        ]),
      ],
    },
    {
      title: "Подтвердить плотность",
      content: [
        paragraph(
          gauge
            ? `Расчёт основан на плотности ${gauge}. Убедись, что эти данные получены по актуальному образцу для выбранных пряжи и спиц.`
            : "Убедись, что плотность в расчёте получена по актуальному образцу для выбранных пряжи и спиц.",
        ),
        paragraph("На этом шаге новая плотность не рассчитывается."),
      ],
    },
    {
      title: "Набрать рассчитанное количество петель",
      content: [
        emphasis(`Набери ${count} ${accusativeStitches(count)}.`),
        paragraph(
          "Используй привычный способ набора, подходящий для твоего проекта.",
        ),
      ],
    },
    {
      title: "Пересчитать петли",
      content: [
        paragraph(
          `Пересчитай набранные петли и подтверди, что на спицах ровно ${count} ${stitchWord}.`,
        ),
        paragraph(
          "Если число не совпало, исправь набор и пересчитай его ещё раз.",
        ),
      ],
    },
    {
      title: "Зафиксировать готовность",
      content: [
        factList([
          ["Расчётное количество", `${count} ${stitchWord}`],
          ["Подготовка", "исходные данные и материалы проверены"],
          ["Петли", "набраны и пересчитаны"],
        ]),
        paragraph(
          "Подтверди завершение Smart Start. Инструкции первого ряда должны оставаться в описании твоего проекта.",
        ),
      ],
    },
  ];
}

function completeCurrentStep() {
  state.advanceProgress(progress);
  state.saveProgress(getLocalStorage(), progress);
  renderProgress(true);
}

function goBack() {
  state.goBackProgress(progress);
  state.saveProgress(getLocalStorage(), progress);
  renderProgress(true);
}

function restart() {
  progress = state.resetProgress(
    getLocalStorage(),
    calculation.fingerprint,
  );
  renderProgress(true);
}

function renderCompletion() {
  const count = calculation.workingCount;
  completionSummary.textContent =
    `Подготовлены материалы, проверены исходные данные и набраны ` +
    `${count} ${pluralizeStitches(count)}. Количество петель подтверждено.`;
}

function setFact(valueId, rowId, value) {
  const row = document.querySelector(`#${rowId}`);
  if (!value) {
    row.hidden = true;
    return;
  }
  document.querySelector(`#${valueId}`).textContent = value;
  row.hidden = false;
}

function paragraph(text) {
  const element = document.createElement("p");
  element.textContent = text;
  return element;
}

function emphasis(text) {
  const element = paragraph(text);
  element.className = "step-emphasis";
  return element;
}

function bulletList(items) {
  const list = document.createElement("ul");
  items.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    list.append(item);
  });
  return list;
}

function factList(items) {
  const list = document.createElement("dl");
  list.className = "step-facts";
  items.forEach(([label, value]) => {
    if (value === undefined || value === "") {
      return;
    }
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = String(value);
    row.append(term, description);
    list.append(row);
  });
  return list;
}

function formatWidth(width) {
  if (width.value === undefined) {
    return "";
  }
  return `${width.value}${width.unit ? ` ${localizeUnit(width.unit)}` : ""}`;
}

function formatGauge(gauge) {
  if (gauge.readyCount === undefined || gauge.baseLength === undefined) {
    return "";
  }
  const unit = gauge.baseUnit ? ` ${localizeUnit(gauge.baseUnit)}` : "";
  return `${gauge.readyCount} петель на ${gauge.baseLength}${unit}`;
}

function formatNeedle(materials) {
  const parts = [];
  if (materials.needleMm !== undefined) {
    parts.push(`${materials.needleMm} мм`);
  }
  if (materials.needleType) {
    parts.push(materials.needleType);
  }
  return parts.join(", ");
}

function localizeUnit(unit) {
  return { cm: "см", mm: "мм" }[unit] ?? unit;
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

function accusativeStitches(count) {
  return Math.abs(count) % 10 === 1 && Math.abs(count) % 100 !== 11
    ? "петлю"
    : pluralizeStitches(count);
}
