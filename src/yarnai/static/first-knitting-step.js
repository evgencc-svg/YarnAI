"use strict";

(function exposeFirstKnittingStep(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "STEP_ASSISTANT";
  const STATUSES = Object.freeze([
    "not_started",
    "in_progress",
    "completed",
    "blocked",
  ]);
  const SUCCESS_STATUSES = new Set(["READY", "READY_WITH_WARNINGS"]);

  class FirstKnittingStepError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FirstKnittingStepError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = details;
    }
  }

  function createFirstStep(aggregate, now = new Date().toISOString()) {
    const source = calculationSource(aggregate);
    const count = source.workingCount;
    const width = source.workingWidth;
    const gauge = source.stitchGauge;
    const warnings = structuredWarnings(source.structured, source.result);
    const contextWarning = gaugeContextWarning(source.structured);
    if (contextWarning) {
      warnings.unshift(contextWarning);
    }
    return {
      version: VERSION,
      step_id: `cast-on:${source.calculation.calculation_id}`,
      project_id: source.project.project_id,
      status: "not_started",
      title: `Набор ${count} ${pluralizeStitches(count)}`,
      instruction:
        `Набери ${count} ${pluralizeStitches(count)} для рабочей ширины ` +
        `${formatNumber(width.value)} ${unitLabel(width.unit)} при плотности ` +
        `${formatNumber(gauge.stitches)} ${pluralizeStitches(gauge.stitches)} ` +
        `на ${formatNumber(gauge.width_cm)} см.`,
      stitch_count: count,
      working_width: width,
      stitch_gauge: gauge,
      row_gauge: source.structured?.row_gauge
        ? copy(source.structured.row_gauge)
        : null,
      explanation:
        `Сохранённый вычислитель выбрал ${count} ${pluralizeStitches(count)} ` +
        `для этой ширины и фактической плотности. На этом экране число не пересчитывается.`,
      warnings,
      preparation_checklist: preparationChecklist(source),
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null,
      source_calculation_revision: source.calculation.fingerprint,
      current_stitch_count: 0,
      target_stitch_count: count,
      revision: 1,
    };
  }

  function preparationChecklist(source) {
    const intent = source.structured?.project_intent ?? {};
    const calculationInput = source.structured?.calculation_input ?? {};
    const fabric = calculationInput.fabric_context ?? {};
    const yarn = text(intent.yarn) || text(fabric.yarn);
    const needle = finitePositive(fabric.needle_mm);
    const needleType = text(fabric.needle_type);
    return [
      {
        id: "correct_yarn",
        label: yarn
          ? `Выбрана пряжа: ${yarn}.`
          : "Выбрана та же пряжа, для которой выполнен расчёт.",
        required: true,
        checked: false,
      },
      {
        id: "same_tools",
        label: needle
          ? `Используются спицы ${formatNumber(needle)} мм${needleType ? ` (${needleType})` : ""}, на которых измерялся образец.`
          : "Используются спицы, на которых измерялся контрольный образец.",
        required: true,
        checked: false,
      },
      {
        id: "prepared_swatch",
        label:
          "Контрольный образец высох или подготовлен тем же способом, которым будет обработано изделие.",
        required: true,
        checked: false,
      },
      {
        id: "markers_or_counter",
        label: "Рядом есть маркеры или счётчик, если они нужны.",
        required: false,
        checked: false,
      },
      {
        id: "understands_count",
        label: `Понятно, что нужно набрать ${source.workingCount} ${pluralizeStitches(source.workingCount)}.`,
        required: true,
        checked: false,
      },
    ];
  }

  function inspectAggregate(aggregate) {
    let source;
    try {
      source = calculationSource(aggregate);
    } catch (error) {
      return inspectionFromError(error);
    }
    const matches = Array.isArray(aggregate?.progress)
      ? aggregate.progress.filter(
          (entry) =>
            entry?.kind === PROGRESS_KIND &&
            entry?.calculation_id === source.calculation.calculation_id &&
            entry?.epoch === 1,
        )
      : [];
    if (matches.length === 0) {
      return {
        state: "missing",
        reason: "missing_progress",
        source,
        message:
          "Первый шаг проекта не найден. Вернитесь к сохранённому результату расчёта.",
      };
    }
    if (matches.length > 1) {
      return {
        state: "invalid",
        source,
        message:
          "Найдено несколько записей первого шага. Продолжение заблокировано; данные не удалены.",
      };
    }
    const progress = matches[0];
    const step = progress.state;
    if (isLegacyPlaceholder(step)) {
      return {
        state: "missing",
        reason: "uninitialized",
        source,
        progress,
        message: "Первый шаг ещё не подготовлен из сохранённого расчёта.",
      };
    }
    if (isRecord(step) && step.version !== VERSION) {
      return {
        state: "unsupported",
        source,
        progress,
        message:
          "Версия первого шага не поддерживается. Исходные данные сохранены без изменений.",
      };
    }
    if (!isValidStep(step)) {
      return {
        state: "invalid",
        source,
        progress,
        message:
          "Данные первого шага повреждены. Продолжение заблокировано; запись не удалена.",
      };
    }
    if (
      progress.project_id !== source.project.project_id ||
      step.project_id !== source.project.project_id
    ) {
      return {
        state: "mismatch",
        source,
        progress,
        step: copy(step),
        message:
          "Первый шаг относится к другому проекту. Вернитесь к результату расчёта.",
      };
    }
    if (
      step.source_calculation_revision !== source.calculation.fingerprint ||
      step.target_stitch_count !== source.workingCount ||
      step.stitch_count !== source.workingCount
    ) {
      return {
        state: "mismatch",
        source,
        progress,
        step: copy(step),
        message:
          "Количество петель в шаге не совпадает с сохранённым расчётом. Продолжение остановлено.",
      };
    }
    return {
      state: "ready",
      source,
      progress: copy(progress),
      step: copy(step),
    };
  }

  async function ensureForProject(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const inspection = inspectAggregate(aggregate);
    if (inspection.state === "ready") {
      return inspection;
    }
    if (
      inspection.state !== "missing" ||
      inspection.reason !== "uninitialized"
    ) {
      throw errorFromInspection(inspection);
    }
    const timestamp = new Date().toISOString();
    const step = createFirstStep(aggregate, timestamp);
    await repository.updateCalculationProgress(
      projectId,
      inspection.source.calculation.calculation_id,
      PROGRESS_KIND,
      step,
      {
        baseProgressRevision: inspection.progress.revision,
        operationKind: "FIRST_STEP_CREATED",
        projectStage: "first_step_not_started",
        timestamp,
      },
    );
    return loadForProject(repository, projectId);
  }

  async function loadForProject(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const inspection = inspectAggregate(aggregate);
    if (inspection.state !== "ready") {
      throw errorFromInspection(inspection);
    }
    return inspection;
  }

  async function startForProject(repository, projectId, checkedIds = []) {
    let inspection;
    try {
      inspection = await loadForProject(repository, projectId);
    } catch (error) {
      if (error.code !== "FIRST_STEP_MISSING") {
        throw error;
      }
      inspection = await ensureForProject(repository, projectId);
    }
    const step = inspection.step;
    if (step.status === "completed") {
      return inspection;
    }
    if (step.status === "blocked") {
      throw new FirstKnittingStepError(
        "FIRST_STEP_BLOCKED",
        "Начало шага заблокировано сохранённым состоянием проекта.",
      );
    }
    const selected = new Set(
      Array.isArray(checkedIds) ? checkedIds.filter((id) => typeof id === "string") : [],
    );
    const checklist = step.preparation_checklist.map((item) => ({
      ...item,
      checked: item.checked || selected.has(item.id),
    }));
    const missingRequired = checklist.filter(
      (item) => item.required && !item.checked,
    );
    if (missingRequired.length > 0) {
      throw new FirstKnittingStepError(
        "CHECKLIST_INCOMPLETE",
        "Подтвердите обязательные пункты подготовки. Маркеры и счётчик остаются необязательными.",
        { missing_ids: missingRequired.map((item) => item.id) },
      );
    }
    const timestamp = new Date().toISOString();
    const next = {
      ...step,
      status: "in_progress",
      preparation_checklist: checklist,
      started_at: step.started_at ?? timestamp,
      updated_at: timestamp,
      revision: step.revision + 1,
    };
    await saveStep(repository, inspection, next, {
      operationKind: "FIRST_STEP_STARTED",
      projectStage: "first_step_in_progress",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function changeCurrentCount(repository, projectId, delta) {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new FirstKnittingStepError(
        "INVALID_STITCH_DELTA",
        "Изменение счётчика должно быть целым числом.",
      );
    }
    const inspection = await loadForProject(repository, projectId);
    const step = inspection.step;
    if (step.status !== "in_progress") {
      throw new FirstKnittingStepError(
        "FIRST_STEP_NOT_IN_PROGRESS",
        "Счётчик доступен только для начатого шага.",
      );
    }
    const desired = step.current_stitch_count + delta;
    if (desired < 0) {
      return inspection;
    }
    if (desired > step.target_stitch_count) {
      throw new FirstKnittingStepError(
        "STITCH_LIMIT_REACHED",
        `Цель — ${step.target_stitch_count} ${pluralizeStitches(step.target_stitch_count)}. Проверьте счётчик перед добавлением сверх цели.`,
      );
    }
    const timestamp = new Date().toISOString();
    const next = {
      ...step,
      current_stitch_count: desired,
      updated_at: timestamp,
      revision: step.revision + 1,
    };
    await saveStep(repository, inspection, next, {
      operationKind: "FIRST_STEP_PROGRESS_UPDATED",
      projectStage: "first_step_in_progress",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function completeForProject(repository, projectId) {
    const inspection = await loadForProject(repository, projectId);
    const step = inspection.step;
    if (step.status === "completed") {
      return inspection;
    }
    if (
      step.status !== "in_progress" ||
      step.current_stitch_count !== step.target_stitch_count
    ) {
      throw new FirstKnittingStepError(
        "TARGET_NOT_REACHED",
        "Подтвердить завершение можно после достижения рассчитанного количества петель.",
      );
    }
    const timestamp = new Date().toISOString();
    const next = {
      ...step,
      status: "completed",
      completed_at: step.completed_at ?? timestamp,
      updated_at: timestamp,
      revision: step.revision + 1,
    };
    await saveStep(repository, inspection, next, {
      operationKind: "FIRST_STEP_COMPLETED",
      projectStage: "cast_on_completed",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function saveStep(repository, inspection, step, options) {
    return repository.updateCalculationProgress(
      step.project_id,
      inspection.source.calculation.calculation_id,
      PROGRESS_KIND,
      step,
      {
        ...options,
        baseProgressRevision: inspection.progress.revision,
      },
    );
  }

  function continueDestination(calculationInspection, stepInspection, projectId) {
    const encoded = encodeURIComponent(projectId);
    if (
      calculationInspection?.state !== "ready" &&
      calculationInspection?.state !== "legacy"
    ) {
      return `/calculator?project=${encoded}`;
    }
    if (
      stepInspection?.state === "ready" &&
      ["in_progress", "completed"].includes(stepInspection.step.status)
    ) {
      return `/step-assistant?project=${encoded}`;
    }
    return `/calculator?project=${encoded}`;
  }

  function checklistCanStart(step) {
    return (
      isValidStep(step) &&
      step.preparation_checklist.every((item) => !item.required || item.checked)
    );
  }

  function progressSummary(step) {
    if (!isValidStep(step)) {
      return "";
    }
    if (step.status === "completed") {
      return `Набор завершён · ${step.target_stitch_count} ${pluralizeStitches(step.target_stitch_count)}`;
    }
    if (step.status === "in_progress") {
      return `${step.current_stitch_count} из ${step.target_stitch_count} петель`;
    }
    return `Первый шаг готов · ${step.target_stitch_count} ${pluralizeStitches(step.target_stitch_count)}`;
  }

  function calculationSource(aggregate) {
    const project = aggregate?.project;
    if (!isRecord(project) || typeof project.project_id !== "string") {
      throw new FirstKnittingStepError(
        "INVALID_PROJECT",
        "Запись проекта повреждена. Данные не изменены.",
      );
    }
    if (typeof project.active_calculation_id !== "string") {
      throw new FirstKnittingStepError(
        "CALCULATION_MISSING",
        "В проекте нет сохранённого расчёта для первого шага.",
      );
    }
    const calculations = Array.isArray(aggregate.calculations)
      ? aggregate.calculations
      : [];
    const calculation = calculations.find(
      (entry) => entry?.calculation_id === project.active_calculation_id,
    );
    if (!isRecord(calculation)) {
      throw new FirstKnittingStepError(
        "CALCULATION_MISSING",
        "Активный расчёт проекта не найден.",
      );
    }
    const result = calculation.result;
    if (!isRecord(result) || !SUCCESS_STATUSES.has(result.status)) {
      throw new FirstKnittingStepError(
        "CALCULATION_NOT_SUCCESSFUL",
        "Первый шаг создаётся только из успешного, незаблокированного расчёта.",
      );
    }
    const candidate = result.axes?.width?.selected_candidate;
    const gaugeResult = result.gauges?.width;
    const workingCount = positiveInteger(candidate?.working_count);
    const widthValue = finitePositive(candidate?.actual_size_original_unit);
    const widthUnit = text(candidate?.original_unit);
    const gaugeStitches = finitePositive(gaugeResult?.ready_count);
    const gaugeWidth = finitePositive(gaugeResult?.base_length_cm);
    const gaugeDensity = finitePositive(gaugeResult?.density_per_cm);
    if (
      !workingCount ||
      !widthValue ||
      !widthUnit ||
      !gaugeStitches ||
      !gaugeWidth ||
      !gaugeDensity ||
      typeof calculation.fingerprint !== "string" ||
      !calculation.fingerprint
    ) {
      throw new FirstKnittingStepError(
        "INVALID_CALCULATION_RESULT",
        "Сохранённый результат неполон или повреждён. Первый шаг не создан.",
      );
    }
    return {
      project,
      calculation,
      result,
      structured: isRecord(calculation.request) ? calculation.request : {},
      workingCount,
      workingWidth: { value: widthValue, unit: widthUnit },
      stitchGauge: {
        stitches: gaugeStitches,
        width_cm: gaugeWidth,
        density_per_cm: gaugeDensity,
      },
    };
  }

  function isValidStep(step) {
    if (
      !isRecord(step) ||
      step.version !== VERSION ||
      typeof step.step_id !== "string" ||
      !step.step_id ||
      typeof step.project_id !== "string" ||
      !STATUSES.includes(step.status) ||
      !text(step.title) ||
      !text(step.instruction) ||
      !positiveInteger(step.stitch_count) ||
      !isWidth(step.working_width) ||
      !isGauge(step.stitch_gauge) ||
      (step.row_gauge !== null && !isRowGauge(step.row_gauge)) ||
      !Array.isArray(step.warnings) ||
      !Array.isArray(step.preparation_checklist) ||
      !isTimestamp(step.created_at) ||
      !isTimestamp(step.updated_at) ||
      !nullableTimestamp(step.started_at) ||
      !nullableTimestamp(step.completed_at) ||
      typeof step.source_calculation_revision !== "string" ||
      !step.source_calculation_revision ||
      !Number.isInteger(step.current_stitch_count) ||
      step.current_stitch_count < 0 ||
      !positiveInteger(step.target_stitch_count) ||
      step.current_stitch_count > step.target_stitch_count ||
      !Number.isInteger(step.revision) ||
      step.revision < 1
    ) {
      return false;
    }
    if (
      step.preparation_checklist.some(
        (item) =>
          !isRecord(item) ||
          !text(item.id) ||
          !text(item.label) ||
          typeof item.required !== "boolean" ||
          typeof item.checked !== "boolean",
      )
    ) {
      return false;
    }
    if (new Set(step.preparation_checklist.map((item) => item.id)).size !== step.preparation_checklist.length) {
      return false;
    }
    if (step.status === "not_started" && step.started_at !== null) {
      return false;
    }
    if (step.status === "in_progress" && step.started_at === null) {
      return false;
    }
    if (step.status === "completed" && step.completed_at === null) {
      return false;
    }
    return true;
  }

  function gaugeContextWarning(structured) {
    const context = structured?.swatch?.context;
    if (!isRecord(context)) {
      return null;
    }
    const unprepared =
      context.processed === false ||
      context.fullyDry === false ||
      (text(context.processing_state) &&
        context.processing_state !== "after_intended_processing") ||
      context.fully_dry === "no";
    if (!unprepared) {
      return null;
    }
    return {
      code: "SWATCH_NOT_PREPARED",
      reason:
        "Сохранённый контекст указывает, что образец не был полностью подготовлен как готовое изделие.",
      next_action:
        "Перед набором петель сверьте плотность после той же обработки и полного высыхания.",
      source: "project_gauge_context",
    };
  }

  function structuredWarnings(structured, result) {
    const values = Array.isArray(structured?.warnings)
      ? structured.warnings
      : Array.isArray(result?.warnings)
        ? result.warnings
        : [];
    return values.filter(isRecord).map(copy);
  }

  function errorFromInspection(inspection) {
    const codes = {
      missing: "FIRST_STEP_MISSING",
      invalid: "FIRST_STEP_INVALID",
      unsupported: "FIRST_STEP_UNSUPPORTED",
      mismatch: "FIRST_STEP_MISMATCH",
    };
    return new FirstKnittingStepError(
      codes[inspection.state] ?? "FIRST_STEP_UNAVAILABLE",
      inspection.message ?? "Первый шаг проекта недоступен.",
    );
  }

  function inspectionFromError(error) {
    return {
      state: "invalid",
      error,
      message:
        error instanceof FirstKnittingStepError
          ? error.userMessage
          : "Первый шаг проекта недоступен.",
    };
  }

  function isLegacyPlaceholder(value) {
    return (
      isRecord(value) &&
      Number.isInteger(value.current_row) &&
      Number.isInteger(value.current_stitch) &&
      Array.isArray(value.completed_rows) &&
      !Object.prototype.hasOwnProperty.call(value, "version")
    );
  }

  function isWidth(value) {
    return isRecord(value) && finitePositive(value.value) && text(value.unit);
  }

  function isGauge(value) {
    return (
      isRecord(value) &&
      finitePositive(value.stitches) &&
      finitePositive(value.width_cm) &&
      finitePositive(value.density_per_cm)
    );
  }

  function isRowGauge(value) {
    return (
      isRecord(value) &&
      finitePositive(value.rows) &&
      finitePositive(value.height_cm)
    );
  }

  function finitePositive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function isTimestamp(value) {
    return (
      typeof value === "string" &&
      Number.isFinite(Date.parse(value)) &&
      new Date(Date.parse(value)).toISOString() === value
    );
  }

  function nullableTimestamp(value) {
    return value === null || isTimestamp(value);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function copy(value) {
    if (globalObject.structuredClone) {
      return globalObject.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ru", { maximumFractionDigits: 3 }).format(
      Number(value),
    );
  }

  function unitLabel(unit) {
    return unit === "cm" ? "см" : unit;
  }

  function pluralizeStitches(count) {
    const absolute = Math.abs(Number(count)) % 100;
    const lastDigit = absolute % 10;
    if (absolute > 10 && absolute < 20) {
      return "петель";
    }
    if (lastDigit === 1) {
      return "петлю";
    }
    if (lastDigit >= 2 && lastDigit <= 4) {
      return "петли";
    }
    return "петель";
  }

  const api = Object.freeze({
    VERSION,
    PROGRESS_KIND,
    STATUSES,
    FirstKnittingStepError,
    createFirstStep,
    preparationChecklist,
    inspectAggregate,
    ensureForProject,
    loadForProject,
    startForProject,
    changeCurrentCount,
    completeForProject,
    continueDestination,
    checklistCanStart,
    progressSummary,
    isValidStep,
  });

  globalObject.YarnAIFirstKnittingStep = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
