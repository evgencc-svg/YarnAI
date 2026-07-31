"use strict";

const projectSystem = window.YarnAIProjectSystem;
const blockingEngine = window.YarnAIFirstBlocking;
const $ = (selector) => document.querySelector(selector);

const ui = {
  error: $("#blocking-error"),
  errorMessage: $("#blocking-error-message"),
  workflow: $("#blocking-workflow"),
  projectTitle: $("#blocking-project-title"),
  status: $("#blocking-status"),
  statusMessage: $("#blocking-status-message"),
  corrupted: $("#blocking-corrupted"),
  diagnostic: $("#blocking-diagnostic"),
  reset: $("#blocking-reset"),
  blocked: $("#blocking-blocked"),
  blockers: $("#blocking-blockers"),
  collecting: $("#blocking-collecting"),
  itemKind: $("#blocking-item-kind"),
  fiber: $("#blocking-fiber"),
  fiberConfirmed: $("#blocking-fiber-confirmed"),
  careText: $("#blocking-care-text"),
  itemReady: $("#blocking-item-ready"),
  saveDetails: $("#blocking-save-details"),
  formError: $("#blocking-form-error"),
  methodPanel: $("#blocking-method-panel"),
  recommendationTitle: $("#blocking-recommendation-title"),
  recommendationReason: $("#blocking-recommendation-reason"),
  method: $("#blocking-method"),
  nonstandardRow: $("#blocking-nonstandard-row"),
  nonstandard: $("#blocking-nonstandard"),
  steamRow: $("#blocking-steam-row"),
  steamCompatible: $("#blocking-steam-compatible"),
  saveMethod: $("#blocking-save-method"),
  warningPanel: $("#blocking-warning-panel"),
  warnings: $("#blocking-warnings"),
  measurementsPanel: $("#blocking-measurements-panel"),
  measurements: $("#blocking-measurements"),
  measurementForm: $("#blocking-measurement-form"),
  measurementKey: $("#measurement-key"),
  measurementLabel: $("#measurement-label"),
  measurementValue: $("#measurement-value"),
  measurementUnit: $("#measurement-unit"),
  measurementNa: $("#measurement-na"),
  checklistPanel: $("#blocking-checklist-panel"),
  checklist: $("#blocking-checklist"),
  start: $("#blocking-start"),
  stepPanel: $("#blocking-step-panel"),
  stepLabel: $("#blocking-step-label"),
  stepTitle: $("#blocking-step-title"),
  stepInstructions: $("#blocking-step-instructions"),
  layoutChecks: $("#blocking-layout-checks"),
  confirmStep: $("#blocking-confirm-step"),
  back: $("#blocking-back"),
  dryingPanel: $("#blocking-drying-panel"),
  dryingMeasurements: $("#blocking-drying-measurements"),
  note: $("#blocking-note"),
  saveNote: $("#blocking-save-note"),
  result: $("#blocking-result"),
  recordResult: $("#blocking-record-result"),
  complete: $("#blocking-complete"),
  correctionPanel: $("#blocking-correction-panel"),
  correctionMessage: $("#blocking-correction-message"),
  restartCorrection: $("#blocking-restart-correction"),
  completed: $("#blocking-completed"),
  completedDate: $("#blocking-completed-date"),
};

let repository;
let projectId;
let result;
let busy = false;

initialize().catch((error) => {
  showFatal(
    error?.userMessage ||
      "Не удалось загрузить Stage 14. Данные проекта не изменены.",
  );
});

async function initialize() {
  projectId = new URLSearchParams(window.location.search).get("project");
  if (
    !projectId ||
    !projectSystem ||
    !blockingEngine ||
    !projectSystem.isUuidv7(projectId)
  ) {
    showFatal("Ссылка на проект повреждена. Данные проекта не изменены.");
    return;
  }
  repository = new projectSystem.ProjectRepository();
  await repository.initialize();
  result = await blockingEngine.ensureForProject(repository, projectId);
  bindActions();
  render();
}

function bindActions() {
  ui.saveDetails.addEventListener("click", () =>
    mutate(
      () =>
        blockingEngine.updateDetailsForProject(repository, projectId, {
          itemKind: ui.itemKind.value,
          fiberType: ui.fiber.value,
          fiberTypeConfirmed: ui.fiberConfirmed.checked,
          careLabelKnown: careLabelValue(),
          careLabelText: ui.careText.value,
          itemReady: ui.itemReady.checked,
        }),
      "Проверьте обязательные сведения.",
    ),
  );
  ui.method.addEventListener("change", renderMethodConfirmations);
  ui.saveMethod.addEventListener("click", () =>
    mutate(
      () =>
        blockingEngine.updateDetailsForProject(repository, projectId, {
          nonstandardMethodConfirmed: ui.nonstandard.checked,
          steamCompatible: ui.steamCompatible.checked,
          blockingMethod: ui.method.value,
        }),
      "Этот способ небезопасен для указанных данных.",
    ),
  );
  ui.measurementNa.addEventListener("change", () => {
    ui.measurementValue.disabled = ui.measurementNa.checked;
  });
  ui.measurementKey.addEventListener("change", () => {
    if (!ui.measurementLabel.value || ui.measurementKey.value !== "customMeasurements") {
      ui.measurementLabel.value =
        ui.measurementKey.options[ui.measurementKey.selectedIndex].text;
    }
  });
  ui.measurementForm.addEventListener("submit", (event) => {
    event.preventDefault();
    mutate(
      () =>
        blockingEngine.setMeasurementForProject(repository, projectId, {
          key: ui.measurementKey.value,
          label: ui.measurementLabel.value,
          value: ui.measurementNa.checked
            ? null
            : Number(ui.measurementValue.value),
          unit: ui.measurementUnit.value,
          source: "user",
          confirmed: true,
        }),
      "Проверьте название и значение размера.",
    );
  });
  ui.start.addEventListener("click", () =>
    mutate(
      () => blockingEngine.startForProject(repository, projectId),
      "Подготовка ещё не завершена.",
    ),
  );
  ui.confirmStep.addEventListener("click", () => {
    const state = result.blocking;
    const confirmation =
      state.currentStep === "laid_out"
        ? checkboxValues("[data-layout]")
        : { done: true };
    mutate(
      () =>
        blockingEngine.confirmStepForProject(
          repository,
          projectId,
          state.currentStep,
          confirmation,
        ),
      "Подтвердите все действия текущего шага.",
    );
  });
  ui.back.addEventListener("click", () => {
    window.location.href = "/";
  });
  ui.saveNote.addEventListener("click", () =>
    mutate(
      () =>
        blockingEngine.saveNoteForProject(
          repository,
          projectId,
          ui.note.value,
        ),
      "Введите заметку.",
    ),
  );
  ui.recordResult.addEventListener("click", () =>
    mutate(
      () =>
        blockingEngine.registerResultForProject(
          repository,
          projectId,
          ui.result.value,
          checkboxValues("[data-dry]"),
          ui.note.value,
        ),
      "Подтвердите полное высыхание и выберите результат.",
    ),
  );
  ui.complete.addEventListener("click", () =>
    mutate(
      () => blockingEngine.completeForProject(repository, projectId),
      "Stage 14 пока нельзя завершить.",
    ),
  );
  ui.restartCorrection.addEventListener("click", () =>
    mutate(
      () => blockingEngine.restartForProject(repository, projectId),
      "Не удалось начать повторную блокировку.",
    ),
  );
  ui.reset.addEventListener("click", () =>
    mutate(
      () => blockingEngine.resetForProject(repository, projectId),
      "Не удалось безопасно создать запись заново.",
    ),
  );
}

function render() {
  ui.error.hidden = true;
  ui.workflow.hidden = false;
  const state = result.blocking;
  ui.projectTitle.textContent = result.project?.title || "Сохранённый проект";
  [
    ui.corrupted,
    ui.blocked,
    ui.collecting,
    ui.methodPanel,
    ui.warningPanel,
    ui.measurementsPanel,
    ui.checklistPanel,
    ui.stepPanel,
    ui.dryingPanel,
    ui.correctionPanel,
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
  if (result.state === "blocked" || state?.status === "blocked") {
    setStatus("Заблокировано", "Безопасное продолжение невозможно.");
    ui.blocked.hidden = false;
    const entries = state?.blockers?.length
      ? state.blockers
      : result.blockers || [];
    ui.blockers.replaceChildren(
      ...entries.map((entry) => listItem(entry.message)),
    );
    return;
  }
  if (!state) {
    showFatal("Запись Stage 14 не найдена.");
    return;
  }

  setStatus(statusLabel(state.status), blockingEngine.progressSummary(state));
  renderWarnings(state);
  if (state.status === "collecting" || state.status === "ready") {
    renderPreparation(state);
  } else if (state.status === "in_progress") {
    renderStep(state);
  } else if (state.status === "drying") {
    renderDrying(state);
  } else if (state.status === "needs_correction") {
    renderCorrection(state);
  } else if (state.status === "completed") {
    ui.completed.hidden = false;
    ui.completedDate.textContent = `Подтверждено ${new Intl.DateTimeFormat(
      "ru",
      { dateStyle: "medium", timeStyle: "short" },
    ).format(new Date(state.completedAt))}.`;
  }
}

function renderPreparation(state) {
  ui.collecting.hidden = false;
  ui.methodPanel.hidden = false;
  ui.measurementsPanel.hidden = false;
  ui.checklistPanel.hidden = false;
  ui.itemKind.value = state.itemKind;
  ui.fiber.value = state.fiberType;
  ui.fiberConfirmed.checked = state.fiberTypeConfirmed;
  ui.careText.value = state.careLabelText || "";
  ui.itemReady.checked = state.itemReady;
  document.querySelectorAll('[name="care-label"]').forEach((radio) => {
    radio.checked =
      state.careLabelKnown === (radio.value === "yes");
  });
  ui.recommendationTitle.textContent = `Рекомендация: ${methodLabel(
    state.recommendedMethod,
  )}`;
  ui.recommendationReason.textContent = state.recommendationReason;
  ui.method.value = state.blockingMethod;
  ui.nonstandard.checked = state.nonstandardMethodConfirmed;
  ui.steamCompatible.checked = state.steamCompatible;
  renderMethodConfirmations();
  renderMeasurements(state, ui.measurements, true);
  renderChecklist(state);
  ui.start.disabled =
    busy ||
    state.status !== "ready" ||
    !blockingEngine.checklistReady(state);
}

function renderWarnings(state) {
  if (!state?.warnings?.length) return;
  ui.warningPanel.hidden = false;
  ui.warnings.replaceChildren(
    ...state.warnings.map((entry) => listItem(entry.message)),
  );
}

function renderMeasurements(state, target, editable) {
  if (!state.targetMeasurements.length) {
    const empty = document.createElement("p");
    empty.textContent =
      "В расчёте нет размеров. Добавьте их или отметьте размер как неприменимый.";
    target.replaceChildren(empty);
    return;
  }
  target.replaceChildren(
    ...state.targetMeasurements.map((measurement) => {
      const row = document.createElement("div");
      row.className = "measurement-row";
      const description = document.createElement("span");
      description.textContent = `${measurement.label}: ${
        measurement.value === null
          ? "не применяется"
          : `${measurement.value} ${unitLabel(measurement.unit)}`
      }`;
      const source = document.createElement("span");
      source.className = "measurement-source";
      source.textContent = `${sourceLabel(measurement.source)} · ${
        measurement.confirmed ? "подтверждено" : "нужно подтвердить"
      }`;
      row.append(description, source);
      if (editable && !measurement.confirmed) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "link-button";
        button.textContent = "Подтвердить";
        button.addEventListener("click", () =>
          mutate(
            () =>
              blockingEngine.setMeasurementForProject(
                repository,
                projectId,
                { ...measurement, confirmed: true },
              ),
            "Не удалось подтвердить размер.",
          ),
        );
        row.append(button);
      }
      return row;
    }),
  );
}

function renderChecklist(state) {
  ui.checklist.replaceChildren(
    ...state.preparationChecklist
      .filter((item) => item.required || item.checked)
      .map((item) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = item.checked;
        input.disabled = busy || item.source === "system";
        const text = document.createElement("span");
        text.textContent = item.label;
        if (item.source === "user") {
          input.addEventListener("change", () =>
            mutate(
              () =>
                blockingEngine.setChecklistForProject(
                  repository,
                  projectId,
                  item.id,
                  input.checked,
                ),
              "Не удалось сохранить пункт подготовки.",
            ),
          );
        }
        label.append(input, text);
        return label;
      }),
  );
}

function renderStep(state) {
  ui.stepPanel.hidden = false;
  const content = stepContent(state.currentStep, state.blockingMethod);
  ui.stepLabel.textContent = content.label;
  ui.stepTitle.textContent = content.title;
  const list = document.createElement("ul");
  list.append(...content.instructions.map((entry) => listItem(entry)));
  ui.stepInstructions.replaceChildren(list);
  ui.layoutChecks.hidden = state.currentStep !== "laid_out";
  ui.confirmStep.textContent =
    state.currentStep === "laid_out"
      ? "Изделие разложено — начать сушку"
      : "Шаг выполнен";
}

function renderDrying(state) {
  ui.dryingPanel.hidden = false;
  renderMeasurements(state, ui.dryingMeasurements, false);
  const readyToComplete =
    state.currentStep === "review" && state.resultCode === "all_good";
  ui.complete.hidden = !readyToComplete;
  ui.recordResult.hidden = readyToComplete;
  if (readyToComplete && state.postDryConfirmation) {
    document.querySelectorAll("[data-dry]").forEach((input) => {
      input.checked = state.postDryConfirmation[input.dataset.dry] === true;
      input.disabled = true;
    });
    ui.result.value = "all_good";
    ui.result.disabled = true;
  }
}

function renderCorrection(state) {
  ui.correctionPanel.hidden = false;
  const latest = state.correctionHistory.at(-1);
  ui.correctionMessage.textContent = `${resultLabel(
    latest?.resultCode,
  )}. История первой попытки сохранена; повтор начнётся с безопасного шага «${stepShortLabel(
    latest?.retryFrom,
  )}».`;
}

function renderMethodConfirmations() {
  const selected = ui.method.value;
  const state = result?.blocking;
  ui.nonstandardRow.hidden =
    !state || selected === "unknown" || selected === state.recommendedMethod;
  ui.steamRow.hidden = selected !== "steam_blocking";
}

function stepContent(step, method) {
  const treatment = {
    wet_blocking: [
      "Используйте прохладную воду или температуру с этикетки.",
      "Погрузите изделие аккуратно: не трите и не меняйте резко температуру.",
    ],
    spray_blocking: [
      "Увлажняйте равномерно, не заливая отдельные участки.",
      "Сразу контролируйте целевые размеры.",
    ],
    steam_blocking: [
      "Держите утюг или отпариватель на безопасной дистанции.",
      "Не касайтесь полотна и остановитесь при изменении фактуры.",
    ],
    gentle_shaping: [
      "Разложите изделие и мягко придайте форму.",
      "Слегка увлажните при необходимости, не растягивая насильно.",
    ],
  };
  const map = {
    prepare: {
      label: "Шаг 3 из 7 · вода или поверхность",
      title: method === "wet_blocking" ? "Подготовьте воду" : "Подготовьте ровную поверхность",
      instructions:
        method === "wet_blocking"
          ? ["Налейте прохладную воду или воду допустимой по этикетке температуры.", "Убедитесь, что изделие можно поддержать целиком."]
          : ["Очистите ровную поверхность.", "Положите рядом полотенце и инструменты, которые действительно нужны."],
    },
    treatment: {
      label: "Шаг 3 из 7 · обработка",
      title: methodLabel(method),
      instructions: treatment[method] || treatment.gentle_shaping,
    },
    water_removed: {
      label: "Шаг 4 из 7 · лишняя вода",
      title: "Удалите воду без выкручивания",
      instructions: [
        "Поддерживайте изделие целиком и не поднимайте за край.",
        "Аккуратно отожмите воду между полотенцами.",
        "Не выкручивайте и не подвешивайте мокрое полотно.",
      ],
    },
    laid_out: {
      label: "Шаг 5 из 7 · раскладывание",
      title: "Разложите по целевым размерам",
      instructions: [
        "Выровняйте стороны и швы на ровной поверхности.",
        "Сверьте размеры и не тяните сильнее цели.",
        "Используйте булавки только там, где они нужны.",
      ],
    },
  };
  return map[step] || map.prepare;
}

async function mutate(operation, fallback) {
  if (busy) return;
  busy = true;
  ui.formError.textContent = "";
  setButtonsDisabled(true);
  try {
    result = await operation();
    ui.note.value = "";
    render();
  } catch (error) {
    const message = error?.userMessage || fallback;
    ui.formError.textContent = message;
    ui.statusMessage.textContent = message;
  } finally {
    busy = false;
    setButtonsDisabled(false);
    if (result?.blocking) render();
  }
}

function setButtonsDisabled(disabled) {
  document
    .querySelectorAll("#blocking-workflow button")
    .forEach((button) => {
      button.disabled = disabled;
    });
}

function setStatus(label, message) {
  ui.status.textContent = label;
  ui.statusMessage.textContent = message || "";
}

function checkboxValues(selector) {
  return Object.fromEntries(
    [...document.querySelectorAll(selector)].map((input) => [
      input.dataset.layout || input.dataset.dry,
      input.checked,
    ]),
  );
}

function careLabelValue() {
  const value = document.querySelector('[name="care-label"]:checked')?.value;
  return value === "yes" ? true : value === "no" ? false : null;
}

function listItem(message) {
  const item = document.createElement("li");
  item.textContent = message;
  return item;
}

function statusLabel(status) {
  return {
    collecting: "Собираем данные",
    ready: "Готово к началу",
    in_progress: "Блокировка идёт",
    drying: "Изделие сохнет",
    needs_correction: "Нужна корректировка",
    completed: "Завершено",
  }[status] || "Проверка";
}

function methodLabel(method) {
  return {
    wet_blocking: "Влажная блокировка",
    spray_blocking: "Равномерное увлажнение",
    steam_blocking: "Паровая блокировка",
    gentle_shaping: "Щадящее формование",
    unknown: "способ ещё не выбран",
  }[method];
}

function sourceLabel(source) {
  return {
    calculation: "из расчёта",
    user: "добавлено вручную",
    user_corrected: "исправлено вручную",
  }[source] || source;
}

function unitLabel(unit) {
  return unit === "cm" ? "см" : unit === "in" ? "дюйма" : unit;
}

function resultLabel(code) {
  return {
    slight_size_difference: "Размер немного отличается",
    stretched: "Изделие растянулось",
    curling_edges: "Края заворачиваются",
    skewed: "Форма перекошена",
  }[code] || "Результат требует проверки";
}

function stepShortLabel(step) {
  return {
    treatment: "обработка",
    water_removed: "удаление воды",
    laid_out: "раскладывание",
  }[step] || "подготовка";
}

function showFatal(message) {
  ui.workflow.hidden = true;
  ui.error.hidden = false;
  ui.errorMessage.textContent = message;
}
