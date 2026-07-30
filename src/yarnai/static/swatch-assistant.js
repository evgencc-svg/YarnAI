"use strict";

(function exposeSwatchAssistant(globalObject) {
  const MINIMUM_MEASUREMENTS = 3;
  const MAXIMUM_SPREAD_RATIO = 0.1;
  const REQUIRED_CONTEXT = [
    ["sameYarn", "Свяжите образец из выбранной для проекта пряжи."],
    [
      "sameTools",
      "Используйте те же спицы, число нитей и способ вязания, что и в изделии.",
    ],
    ["samePattern", "Свяжите образец основным узором проекта."],
    [
      "processed",
      "Обработайте образец так же, как будете обрабатывать готовое изделие.",
    ],
    ["fullyDry", "Полностью высушите образец перед измерением."],
    [
      "relaxed",
      "Снимите образец со спиц, дайте полотну отлежаться и измеряйте без растяжения.",
    ],
  ];

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function rounded(value, precision = 2) {
    const factor = 10 ** precision;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function issue(code, field, message) {
    return { code, field, message };
  }

  function assessSwatch(input) {
    const value = input && typeof input === "object" ? input : {};
    const errors = [];
    const widthCm = positiveNumber(value.measurementWidthCm);
    if (!widthCm) {
      errors.push(
        issue(
          "invalid_measurement_width",
          "measurementWidthCm",
          "Укажите положительную ширину измеряемого участка в сантиметрах.",
        ),
      );
    }

    const measurements = Array.isArray(value.stitchMeasurements)
      ? value.stitchMeasurements.map(positiveNumber)
      : [];
    if (measurements.length < MINIMUM_MEASUREMENTS) {
      errors.push(
        issue(
          "not_enough_measurements",
          "stitchMeasurements",
          "Измерьте плотность не менее трёх раз в разных местах образца.",
        ),
      );
    } else if (measurements.some((measurement) => measurement === null)) {
      errors.push(
        issue(
          "invalid_stitch_measurement",
          "stitchMeasurements",
          "Каждое измерение петель должно быть положительным числом.",
        ),
      );
    }

    const context =
      value.context && typeof value.context === "object" ? value.context : {};
    for (const [field, message] of REQUIRED_CONTEXT) {
      if (context[field] !== true) {
        errors.push(issue("unconfirmed_sample_context", field, message));
      }
    }

    const rowCount = positiveNumber(value.rows);
    const rowHeightCm = positiveNumber(value.rowHeightCm);
    if ((rowCount && !rowHeightCm) || (!rowCount && rowHeightCm)) {
      errors.push(
        issue(
          "incomplete_row_gauge",
          "rows",
          "Для плотности рядов укажите и число рядов, и высоту участка — либо оставьте оба поля пустыми.",
        ),
      );
    }

    let spreadRatio = null;
    let averageStitches = null;
    if (
      measurements.length >= MINIMUM_MEASUREMENTS &&
      measurements.every((measurement) => measurement !== null)
    ) {
      averageStitches =
        measurements.reduce((sum, measurement) => sum + measurement, 0) /
        measurements.length;
      spreadRatio =
        (Math.max(...measurements) - Math.min(...measurements)) /
        averageStitches;
      if (spreadRatio > MAXIMUM_SPREAD_RATIO) {
        errors.push(
          issue(
            "inconsistent_measurements",
            "stitchMeasurements",
            "Измерения различаются больше чем на 10%. Проверьте участок без кромок и растяжения; если разброс сохранится, свяжите образец большего размера.",
          ),
        );
      }
    }

    if (errors.length > 0) {
      return {
        ready: false,
        errors,
        spreadRatio:
          spreadRatio === null ? null : rounded(spreadRatio, 4),
        gauge: null,
      };
    }

    const gauge = {
      stitches: rounded(averageStitches),
      widthCm: rounded(widthCm),
      rows: rowCount ? rounded(rowCount) : null,
      heightCm: rowHeightCm ? rounded(rowHeightCm) : null,
      sourceMeasurementCount: measurements.length,
      measurements: measurements.map((measurement) => ({
        stitches: rounded(measurement),
        widthCm: rounded(widthCm),
      })),
      context: {
        sameYarn: true,
        sameTools: true,
        samePattern: true,
        processed: true,
        fullyDry: true,
        relaxed: true,
        offNeedles: true,
        restHours: 12,
      },
      raw: `${rounded(averageStitches)} петель на ${rounded(widthCm)} см`,
    };

    return {
      ready: true,
      errors: [],
      spreadRatio: rounded(spreadRatio, 4),
      gauge,
      summary: `Средняя плотность: ${gauge.stitches} петель на ${gauge.widthCm} см.`,
    };
  }

  function instructionsFor(projectIntent) {
    const yarn =
      typeof projectIntent?.yarn === "string" && projectIntent.yarn.trim()
        ? projectIntent.yarn.trim()
        : "выбранной проектной пряжи";
    return {
      title:
        projectIntent?.sampleKnown === true
          ? "Измерим готовый образец"
          : "Подготовим контрольный образец",
      yarn,
      steps: [
        `Свяжите образец из пряжи «${yarn}» теми же спицами, числом нитей и узором, что планируете для изделия.`,
        "Сделайте образец шире измеряемого участка: кромки не должны попадать в замер.",
        "Обработайте, полностью высушите и дайте полотну отлежаться.",
        "Без растяжения посчитайте петли на одном и том же расстоянии минимум в трёх местах.",
      ],
    };
  }

  const publicApi = {
    MAXIMUM_SPREAD_RATIO,
    MINIMUM_MEASUREMENTS,
    assessSwatch,
    instructionsFor,
  };
  globalObject.YarnAISwatchAssistant = publicApi;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = publicApi;
  }
})(typeof window !== "undefined" ? window : globalThis);
