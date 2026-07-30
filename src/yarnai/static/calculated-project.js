(function exposeCalculatedProjects(globalObject) {
  "use strict";

  const DATA_SCHEMA_VERSION = 1;
  const CALCULATION_KIND = "CALCULATED_PROJECT";
  const CURRENT_STAGE = "calculation_complete";
  const HANDOFF_KEY = "yarnai:calculated-project:handoff:v1";
  const HANDOFF_PARAMETER = "project-intent";
  const SUCCESS_STATUSES = new Set(["READY", "READY_WITH_WARNINGS"]);

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function finitePositive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function capitalize(value) {
    const normalized = text(value);
    return normalized
      ? `${normalized[0].toLocaleUpperCase("ru-RU")}${normalized.slice(1)}`
      : "";
  }

  function fallbackProjectIntent(request) {
    const width = isRecord(request?.width) ? request.width : {};
    const gauge = isRecord(width.gauge) ? width.gauge : {};
    return {
      schemaVersion: 1,
      goal: "связать изделие",
      garmentType: "изделие",
      recipient: null,
      gender: null,
      ageGroup: null,
      size: null,
      style: null,
      construction: null,
      technique: "спицы",
      yarnKnown: Boolean(text(request?.fabric_context?.yarn)),
      yarn: text(request?.fabric_context?.yarn) || null,
      yarnAmount: null,
      sampleKnown: true,
      targetWidth: {
        value: finitePositive(width.value),
        unit: text(width.unit) || "cm",
        sizeKind: text(width.size_kind) || "finished",
        raw: "",
      },
      gaugeKnown: true,
      gauge: {
        stitches: finitePositive(gauge.ready_count),
        widthCm: finitePositive(gauge.base_length),
        rows: null,
        heightCm: null,
        sourceMeasurementCount:
          finitePositive(gauge.source_measurement_count) || 3,
        measurements: [],
        context: {},
        raw: "",
      },
      preferences: {},
      assumptions: [],
      fieldStatus: {
        garmentType: "assumed",
        technique: "assumed",
        yarn: text(request?.fabric_context?.yarn) ? "known" : "unknown",
        targetWidth: "known",
        sampleKnown: "known",
        gauge: "known",
      },
    };
  }

  function normalizeIntent(projectIntent, request) {
    if (
      isRecord(projectIntent) &&
      projectIntent.schemaVersion === DATA_SCHEMA_VERSION
    ) {
      return copy(projectIntent);
    }
    return fallbackProjectIntent(request);
  }

  function projectTitle(projectIntent) {
    const intent = isRecord(projectIntent) ? projectIntent : {};
    const candidates = [
      intent.projectName,
      intent.title,
      intent.description,
      intent.goal,
      intent.preferences?.desiredFeatures,
      intent.garmentType,
    ];
    const chosen = candidates.map(text).find(Boolean);
    return capitalize(chosen || "Изделие · расчёт ширины").slice(0, 120);
  }

  function createStructuredInput({ projectIntent, request, result }) {
    if (!isRecord(request)) {
      throw new TypeError("Calculation request must be an object.");
    }
    if (!isRecord(result) || !SUCCESS_STATUSES.has(result.status)) {
      throw new TypeError("Only a successful calculation can be saved.");
    }

    const intent = normalizeIntent(projectIntent, request);
    const gauge = isRecord(intent.gauge) ? intent.gauge : {};
    const targetWidth = isRecord(request.width)
      ? request.width
      : intent.targetWidth;
    const resultGauge = isRecord(result.gauges?.width)
      ? result.gauges.width
      : {};
    const measurements = Array.isArray(gauge.measurements)
      ? gauge.measurements.slice(0, 3).map(copy)
      : [];

    return {
      schema_version: DATA_SCHEMA_VERSION,
      kind: CALCULATION_KIND,
      project_intent: intent,
      garment_type: text(intent.garmentType) || "изделие",
      target_width: {
        value: finitePositive(targetWidth?.value),
        unit: text(targetWidth?.unit) || "cm",
        size_kind:
          text(targetWidth?.sizeKind) ||
          text(targetWidth?.size_kind) ||
          "finished",
      },
      stitch_gauge: {
        stitches:
          finitePositive(resultGauge.ready_count) ||
          finitePositive(request.width?.gauge?.ready_count) ||
          finitePositive(gauge.stitches),
        width_cm:
          finitePositive(resultGauge.base_length_cm) ||
          finitePositive(request.width?.gauge?.base_length) ||
          finitePositive(gauge.widthCm),
        density_per_cm: finitePositive(resultGauge.density_per_cm),
      },
      row_gauge:
        finitePositive(gauge.rows) && finitePositive(gauge.heightCm)
          ? {
              rows: finitePositive(gauge.rows),
              height_cm: finitePositive(gauge.heightCm),
            }
          : null,
      swatch: {
        context: isRecord(gauge.context) ? copy(gauge.context) : {},
        measurements,
        measurement_count:
          finitePositive(gauge.sourceMeasurementCount) ||
          finitePositive(request.width?.gauge?.source_measurement_count) ||
          measurements.length,
      },
      average_gauge: {
        stitches: finitePositive(gauge.stitches),
        width_cm: finitePositive(gauge.widthCm),
        density_per_cm: finitePositive(resultGauge.density_per_cm),
      },
      calculation_input: copy(request),
      warnings: Array.isArray(result.warnings) ? copy(result.warnings) : [],
      current_stage: CURRENT_STAGE,
    };
  }

  function activeCalculation(aggregate) {
    const project = isRecord(aggregate?.project) ? aggregate.project : null;
    const calculations = Array.isArray(aggregate?.calculations)
      ? aggregate.calculations
      : [];
    if (!project || !text(project.active_calculation_id)) {
      return null;
    }
    return (
      calculations.find(
        (calculation) =>
          calculation?.calculation_id === project.active_calculation_id,
      ) || null
    );
  }

  function inspectAggregate(aggregate) {
    const project = isRecord(aggregate?.project) ? aggregate.project : null;
    if (!project) {
      return {
        state: "invalid",
        message:
          "Запись проекта повреждена. Начните новый расчёт; исходная запись сохранена.",
      };
    }
    if (project.schema_version !== DATA_SCHEMA_VERSION) {
      return {
        state: "unsupported",
        project,
        message:
          "Версия данных проекта пока не поддерживается. Начните новый расчёт; проект не удалён.",
      };
    }

    const calculation = activeCalculation(aggregate);
    if (!calculation) {
      return {
        state: "draft",
        project,
        message: "В проекте пока нет завершённого расчёта.",
      };
    }
    if (!isRecord(calculation.result) || !SUCCESS_STATUSES.has(calculation.result.status)) {
      return {
        state: "invalid",
        project,
        message:
          "Сохранённый результат повреждён. Начните новый расчёт; проект не удалён.",
      };
    }

    const structured = calculation.request;
    if (!isRecord(structured) || structured.kind !== CALCULATION_KIND) {
      return {
        state: "legacy",
        project,
        calculation,
        request: calculation.request,
        result: calculation.result,
        garmentType: "изделие",
        stage: CURRENT_STAGE,
        warnings: Array.isArray(calculation.result.warnings)
          ? calculation.result.warnings
          : [],
      };
    }
    if (structured.schema_version !== DATA_SCHEMA_VERSION) {
      return {
        state: "unsupported",
        project,
        message:
          "Версия сохранённого расчёта пока не поддерживается. Начните новый расчёт; проект не удалён.",
      };
    }
    if (
      !isRecord(structured.project_intent) ||
      structured.project_intent.schemaVersion !== DATA_SCHEMA_VERSION ||
      !isRecord(structured.calculation_input) ||
      !Array.isArray(structured.swatch?.measurements)
    ) {
      return {
        state: "invalid",
        project,
        message:
          "Структурированные данные проекта повреждены. Начните новый расчёт; проект не удалён.",
      };
    }

    return {
      state: "ready",
      project,
      calculation,
      structured,
      projectIntent: copy(structured.project_intent),
      request: copy(structured.calculation_input),
      result: copy(calculation.result),
      garmentType: text(structured.garment_type) || "изделие",
      stage: text(structured.current_stage) || CURRENT_STAGE,
      warnings: Array.isArray(structured.warnings)
        ? copy(structured.warnings)
        : [],
    };
  }

  function resultSummary(result) {
    const candidate = result?.axes?.width?.selected_candidate;
    const count = finitePositive(candidate?.working_count);
    const width = finitePositive(candidate?.actual_size_original_unit);
    const unit = text(candidate?.original_unit);
    if (!count) {
      return "Результат расчёта недоступен";
    }
    return width && unit
      ? `${count} петель · рабочая ширина ${width} ${unit === "cm" ? "см" : unit}`
      : `${count} петель`;
  }

  function stageLabel(stage) {
    return stage === CURRENT_STAGE ? "Расчёт завершён" : "Проект в работе";
  }

  function prepareCalculatorHandoff(href, projectIntent, storage) {
    if (!text(href) || !isRecord(projectIntent)) {
      return href;
    }
    try {
      storage?.setItem(
        HANDOFF_KEY,
        JSON.stringify({
          schema_version: DATA_SCHEMA_VERSION,
          project_intent: copy(projectIntent),
        }),
      );
      const url = new URL(href, "https://yarnai.local");
      url.searchParams.set(HANDOFF_PARAMETER, "session");
      return `${url.pathname}${url.search}`;
    } catch {
      return href;
    }
  }

  function readCalculatorHandoff(search, storage) {
    const parameters = new URLSearchParams(search);
    if (parameters.get(HANDOFF_PARAMETER) !== "session") {
      return null;
    }
    try {
      const value = JSON.parse(storage?.getItem(HANDOFF_KEY) || "null");
      if (
        !isRecord(value) ||
        value.schema_version !== DATA_SCHEMA_VERSION ||
        !isRecord(value.project_intent) ||
        value.project_intent.schemaVersion !== DATA_SCHEMA_VERSION
      ) {
        return null;
      }
      return copy(value.project_intent);
    } catch {
      return null;
    }
  }

  const publicApi = Object.freeze({
    CALCULATION_KIND,
    CURRENT_STAGE,
    DATA_SCHEMA_VERSION,
    createStructuredInput,
    inspectAggregate,
    prepareCalculatorHandoff,
    projectTitle,
    readCalculatorHandoff,
    resultSummary,
    stageLabel,
  });

  globalObject.YarnAICalculatedProjects = publicApi;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = publicApi;
  }
})(typeof window !== "undefined" ? window : globalThis);
