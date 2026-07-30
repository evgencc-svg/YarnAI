"use strict";

(function exposeProjectReadinessEngine(globalObject) {
  const READINESS_SCHEMA_VERSION = 1;
  const SUPPORTED_INTENT_SCHEMA_VERSION = 1;
  const WEARABLES = new Set([
    "кардиган",
    "свитер",
    "жилет",
    "платье",
    "топ",
    "шапка",
    "носки",
    "варежки",
  ]);
  const CONSTRUCTION_GARMENTS = new Set([
    "кардиган",
    "свитер",
    "жилет",
    "платье",
    "топ",
  ]);

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function hasText(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function entry(field, label, value, reason = "") {
    const result = { field, label };
    if (value !== undefined) {
      result.value = copy(value);
    }
    if (reason) {
      result.reason = reason;
    }
    return result;
  }

  function formatWidth(width) {
    if (!isRecord(width)) {
      return "";
    }
    const value = positiveNumber(width.value);
    if (!value) {
      return "";
    }
    return `${value} ${width.unit === "inch" ? "дюйм." : "см"}`;
  }

  function formatGauge(gauge) {
    if (!isRecord(gauge)) {
      return "";
    }
    const parts = [];
    if (positiveNumber(gauge.stitches) && positiveNumber(gauge.widthCm)) {
      parts.push(`${gauge.stitches} п. на ${gauge.widthCm} см`);
    }
    if (positiveNumber(gauge.rows) && positiveNumber(gauge.heightCm)) {
      parts.push(`${gauge.rows} р. на ${gauge.heightCm} см`);
    }
    return parts.join(", ");
  }

  function isAssumed(intent, field) {
    return (
      intent.fieldStatus?.[field] === "assumed" ||
      (Array.isArray(intent.assumptions) &&
        intent.assumptions.some((item) => item?.field === field))
    );
  }

  function collectKnownFacts(intent) {
    const facts = [];
    const add = (field, label, value, formattedValue = value) => {
      if (
        value === null ||
        value === undefined ||
        value === "" ||
        isAssumed(intent, field)
      ) {
        return;
      }
      facts.push(entry(field, label, formattedValue));
    };

    add("garmentType", "Изделие", intent.garmentType);
    add("recipient", "Для кого", intent.recipient);
    add("size", "Размер одежды", intent.size);
    add("style", "Стиль", intent.style);
    add("construction", "Конструкция", intent.construction);
    add("technique", "Техника", intent.technique);
    add("yarn", "Пряжа", intent.yarn);
    add("yarnAmount", "Количество пряжи", intent.yarnAmount);
    add(
      "targetWidth",
      "Готовая ширина первой детали",
      intent.targetWidth,
      formatWidth(intent.targetWidth),
    );
    if (intent.sampleKnown === true && !isAssumed(intent, "sampleKnown")) {
      facts.push(entry("sampleKnown", "Контрольный образец", "связан"));
    }
    add("gauge", "Плотность", intent.gauge, formatGauge(intent.gauge));

    const preferences = isRecord(intent.preferences) ? intent.preferences : {};
    add("preserve", "Важно сохранить", preferences.preserve);
    add("desiredChanges", "Изменения", preferences.desiredChanges);
    add("desiredFeatures", "Желаемый результат", preferences.desiredFeatures);
    add("backDetails", "Спинка", preferences.backDetails);
    return facts.filter((fact) => fact.value !== "");
  }

  function collectIntentAssumptions(intent) {
    if (!Array.isArray(intent.assumptions)) {
      return [];
    }
    return intent.assumptions.map((assumption) => {
      const labels = {
        goal: "Цель проекта",
        technique: "Техника",
        sampleKnown: "Контрольный образец",
        targetWidth: "Готовая ширина",
        gauge: "Плотность",
      };
      let value = assumption.value;
      if (assumption.field === "sampleKnown") {
        value = assumption.value ? "образец связан" : "образца пока нет";
      } else if (assumption.field === "targetWidth") {
        value = formatWidth(assumption.value);
      } else if (assumption.field === "gauge") {
        value = formatGauge(assumption.value);
      }
      return entry(
        assumption.field || "assumption",
        labels[assumption.field] || "Предположение",
        value,
        assumption.reason || "значение выведено по правилам",
      );
    });
  }

  function missingEntry(field, label, reason, requiredFor) {
    return {
      field,
      label,
      reason,
      requiredFor,
    };
  }

  function collectMissingRequired(intent) {
    const missing = [];
    if (!hasText(intent.garmentType)) {
      missing.push(
        missingEntry(
          "garmentType",
          "вид изделия",
          "нужно понять, какой проект создаётся",
          "project",
        ),
      );
    }
    if (intent.yarnKnown !== true || !hasText(intent.yarn)) {
      missing.push(
        missingEntry(
          "yarn",
          "выбранная пряжа",
          "контрольный образец должен быть связан из проектной пряжи",
          "sample",
        ),
      );
    }
    if (!validTargetWidth(intent.targetWidth)) {
      missing.push(
        missingEntry(
          "targetWidth",
          "готовая ширина первой детали",
          "калькулятор переводит конкретную ширину в число петель",
          "calculation",
        ),
      );
    }
    if (intent.sampleKnown !== true) {
      missing.push(
        missingEntry(
          "sampleKnown",
          "готовый контрольный образец",
          "расчёт опирается на фактическую плотность обработанного образца",
          "calculation",
        ),
      );
    }
    if (!validStitchGauge(intent.gauge)) {
      missing.push(
        missingEntry(
          "gauge",
          "плотность петель",
          "нужно знать, сколько петель занимает измеренная ширина образца",
          "calculation",
        ),
      );
    }
    return missing;
  }

  function collectMissingOptional(intent) {
    const missing = [];
    const add = (field, label, reason) => {
      missing.push({ field, label, reason });
    };
    if (WEARABLES.has(intent.garmentType) && !hasText(intent.recipient)) {
      add("recipient", "для кого изделие", "поможет уточнить посадку");
    }
    if (WEARABLES.has(intent.garmentType) && !hasText(intent.size)) {
      add("size", "размер одежды", "пригодится для следующих деталей проекта");
    }
    if (!hasText(intent.style)) {
      add("style", "стиль и посадка", "не влияет на первый расчёт ширины");
    }
    if (
      CONSTRUCTION_GARMENTS.has(intent.garmentType) &&
      !hasText(intent.construction)
    ) {
      add(
        "construction",
        "конструкция изделия",
        "понадобится для технологии, но не для числа петель по ширине",
      );
    }
    if (!hasText(intent.yarnAmount)) {
      add(
        "yarnAmount",
        "количество пряжи",
        "нужно для оценки запаса, но не для расчёта петель",
      );
    }
    if (
      isRecord(intent.gauge) &&
      (!positiveNumber(intent.gauge.rows) ||
        !positiveNumber(intent.gauge.heightCm))
    ) {
      add(
        "rowGauge",
        "плотность рядов",
        "понадобится для расчётов высоты; текущий калькулятор считает ширину",
      );
    }
    return missing;
  }

  function collectBlockers(intent) {
    const blockers = [];
    if (intent.schemaVersion !== SUPPORTED_INTENT_SCHEMA_VERSION) {
      blockers.push({
        code: "unsupported_intent_schema",
        message: `Поддерживается ProjectIntent версии ${SUPPORTED_INTENT_SCHEMA_VERSION}.`,
      });
    }
    if (
      hasText(intent.technique) &&
      !isAssumed(intent, "technique") &&
      intent.technique.toLowerCase() !== "спицы"
    ) {
      blockers.push({
        code: "unsupported_technique",
        field: "technique",
        message:
          "Текущий калькулятор подготовлен для вязания спицами и не рассчитывает проекты крючком.",
      });
    }
    if (
      isRecord(intent.targetWidth) &&
      intent.targetWidth.value !== null &&
      intent.targetWidth.value !== undefined &&
      !positiveNumber(intent.targetWidth.value)
    ) {
      blockers.push({
        code: "invalid_target_width",
        field: "targetWidth",
        message: "Готовая ширина должна быть положительным числом.",
      });
    }
    if (
      isRecord(intent.gauge) &&
      ((intent.gauge.stitches !== null &&
        intent.gauge.stitches !== undefined &&
        !positiveNumber(intent.gauge.stitches)) ||
        (intent.gauge.widthCm !== null &&
          intent.gauge.widthCm !== undefined &&
          !positiveNumber(intent.gauge.widthCm)))
    ) {
      blockers.push({
        code: "invalid_gauge",
        field: "gauge",
        message: "Значения плотности должны быть положительными числами.",
      });
    }
    return blockers;
  }

  function validTargetWidth(width) {
    return (
      isRecord(width) &&
      positiveNumber(width.value) !== null &&
      ["cm", "inch"].includes(width.unit || "cm")
    );
  }

  function validStitchGauge(gauge) {
    return (
      isRecord(gauge) &&
      positiveNumber(gauge.stitches) !== null &&
      positiveNumber(gauge.widthCm) !== null
    );
  }

  function calculationAssumptions(intent) {
    const category =
      intent.ageGroup === "child" ? "детская чувствительная категория" : "обычное изделие";
    return [
      entry(
        "calculationCategory",
        "Категория расчёта",
        category,
        intent.ageGroup === "child"
          ? "категория выбрана по возрастной группе"
          : "ProjectIntent не содержит признаков специальной категории",
      ),
      entry(
        "fabricDefaults",
        "Полотно для первого расчёта",
        "лицевая гладь, поворотные ряды, постоянное число петель",
        "узор и режим образца пока не представлены отдельными полями ProjectIntent",
      ),
      entry(
        "swatchDefaults",
        "Состояние образца",
        "снят со спиц, обработан, высушен и измерен 3 раза после 12 часов отдыха",
        "использованы базовые значения действующего калькулятора; их нужно проверить перед запуском",
      ),
      entry(
        "toolDefaults",
        "Инструменты и нити",
        "1 нить, спицы 4 мм",
        "эти параметры нужны контексту калькулятора и не меняют перевод уже измеренной плотности в петли",
      ),
      entry(
        "rounding",
        "Округление",
        "до ближайшего допустимого числа петель",
        "явное направление округления не собрано",
      ),
    ];
  }

  function buildCalculationInput(intent) {
    const width = intent.targetWidth;
    const gauge = intent.gauge;
    const yarn = intent.yarn.trim();
    const mode = "flat";
    const pattern = "stockinette";
    const fabricContext = {
      yarn,
      yarn_batch: "not specified",
      strands: 1,
      strands_description: "one strand",
      needle_mm: 4,
      needle_type: "circular",
      pattern,
      mode,
      processing: "wash and dry flat",
    };
    return {
      axes: ["width"],
      functional_category:
        intent.ageGroup === "child" ? "child_sensitive" : "ordinary",
      knitting_mode: mode,
      zone_pattern: pattern,
      pattern_class: "constant_stitch_count",
      zone_homogeneous: "yes",
      fabric_context: fabricContext,
      width: {
        size_kind: width.sizeKind || "finished",
        value: positiveNumber(width.value),
        unit: width.unit || "cm",
        direction: "nearest",
        gauge: {
          method: "ready_value",
          source: "personal_swatch",
          ready_count: positiveNumber(gauge.stitches),
          base_length: positiveNumber(gauge.widthCm),
          base_unit: "cm",
          source_measurement_count: 3,
          context: {
            off_needles: "yes",
            processing_state: "after_intended_processing",
            fully_dry: "yes",
            rest_hours: 12,
            measurement_state: "relaxed",
            fabric: copy(fabricContext),
            mode,
            heavy_or_large: "no",
          },
        },
      },
    };
  }

  function buildCalculatorUrl(input) {
    const fabric = input.fabric_context;
    const width = input.width;
    const gauge = width.gauge;
    const context = gauge.context;
    const parameters = new URLSearchParams({
      "width-value": String(width.value),
      "width-unit": width.unit,
      "size-kind": width.size_kind,
      direction: width.direction,
      "gauge-count": String(gauge.ready_count),
      "gauge-length": String(gauge.base_length),
      "gauge-unit": gauge.base_unit,
      "measurement-count": String(gauge.source_measurement_count),
      "gauge-source": gauge.source,
      "functional-category": input.functional_category,
      "knitting-mode": input.knitting_mode,
      "zone-pattern": input.zone_pattern,
      "pattern-class": input.pattern_class,
      "zone-homogeneous": input.zone_homogeneous,
      "off-needles": context.off_needles,
      "processing-state": context.processing_state,
      "fully-dry": context.fully_dry,
      "rest-hours": String(context.rest_hours),
      "measurement-state": context.measurement_state,
      "swatch-mode": context.mode,
      "heavy-or-large": context.heavy_or_large,
      yarn: fabric.yarn,
      "yarn-batch": fabric.yarn_batch,
      strands: String(fabric.strands),
      "strands-description": fabric.strands_description,
      "needle-mm": String(fabric.needle_mm),
      "needle-type": fabric.needle_type,
      "fabric-pattern": fabric.pattern,
      "fabric-mode": fabric.mode,
      "fabric-processing": fabric.processing,
    });
    return `/calculator?${parameters.toString()}`;
  }

  function calculationPlan(intent) {
    const width = formatWidth(intent.targetWidth) || "ещё не заданную ширину";
    const gauge = formatGauge(intent.gauge) || "ещё не заданную плотность";
    return {
      title: "Первый расчёт ширины",
      description: `Калькулятор переведёт ${width} при плотности ${gauge} в рабочее число петель.`,
      outputs: [
        "рабочее число петель для заданной готовой ширины",
        "фактическая ширина после округления",
        "предупреждения и пояснение расчёта",
      ],
      notIncluded: [
        "полная выкройка изделия",
        "расчёты высоты и рядов",
        "расход пряжи",
      ],
    };
  }

  function nextActionFor(status, intent, missingRequired, blockers, input) {
    if (status === "blocked") {
      return {
        type: "resolve_blocker",
        label: "Исправить блокирующие данные",
        description: blockers[0]?.message || "Проверьте данные проекта.",
      };
    }
    if (status === "ready_for_calculation") {
      return {
        type: "open_calculator",
        label: "Перейти к расчёту",
        description:
          "Откроется действующий калькулятор с предзаполненными данными. Перед запуском проверьте предположения.",
        href: buildCalculatorUrl(input),
      };
    }
    if (status === "ready_for_sample") {
      if (intent.sampleKnown === null || intent.sampleKnown === undefined) {
        return {
          type: "continue_dialog",
          label: "Уточнить контрольный образец",
          description:
            "Сначала уточним, есть ли уже связанный контрольный образец.",
        };
      }
      const sampleExists = intent.sampleKnown === true;
      return {
        type: sampleExists ? "measure_sample" : "make_sample",
        label: sampleExists ? "Измерить образец" : "Связать контрольный образец",
        description: sampleExists
          ? "Измерьте число петель на известной ширине обработанного образца и сообщите плотность."
          : "Свяжите образец выбранной пряжей, обработайте, высушите и измерьте плотность.",
      };
    }
    const first = missingRequired[0];
    return {
      type: "continue_dialog",
      label: "Продолжить уточнение",
      description: first
        ? `Следующий обязательный параметр: ${first.label}.`
        : "Продолжите уточнение проекта.",
    };
  }

  class ProjectReadinessEngine {
    evaluate(projectIntent) {
      if (!isRecord(projectIntent)) {
        return {
          schemaVersion: READINESS_SCHEMA_VERSION,
          status: "blocked",
          knownFacts: [],
          assumptions: [],
          missingRequired: [],
          missingOptional: [],
          blockers: [
            {
              code: "invalid_project_intent",
              message: "ProjectIntent должен быть объектом.",
            },
          ],
          nextAction: {
            type: "resolve_blocker",
            label: "Собрать описание проекта",
            description: "Сначала нужно получить корректный ProjectIntent.",
          },
          calculationPlan: calculationPlan({}),
          calculationInput: null,
        };
      }

      const intent = copy(projectIntent);
      const blockers = collectBlockers(intent);
      const missingRequired = collectMissingRequired(intent);
      const missingOptional = collectMissingOptional(intent);
      const knownFacts = collectKnownFacts(intent);
      let assumptions = collectIntentAssumptions(intent);
      let status;

      if (blockers.length > 0) {
        status = "blocked";
      } else if (
        !hasText(intent.garmentType) ||
        intent.yarnKnown !== true ||
        !hasText(intent.yarn) ||
        !validTargetWidth(intent.targetWidth)
      ) {
        status = "collecting";
      } else if (
        intent.sampleKnown !== true ||
        !validStitchGauge(intent.gauge)
      ) {
        status = "ready_for_sample";
      } else {
        status = "ready_for_calculation";
        assumptions = assumptions.concat(calculationAssumptions(intent));
      }

      const calculationInput =
        status === "ready_for_calculation"
          ? buildCalculationInput(intent)
          : null;
      return {
        schemaVersion: READINESS_SCHEMA_VERSION,
        status,
        knownFacts,
        assumptions,
        missingRequired,
        missingOptional,
        blockers,
        nextAction: nextActionFor(
          status,
          intent,
          missingRequired,
          blockers,
          calculationInput,
        ),
        calculationPlan: calculationPlan(intent),
        calculationInput,
      };
    }
  }

  function evaluateProjectReadiness(projectIntent) {
    return new ProjectReadinessEngine().evaluate(projectIntent);
  }

  const publicApi = {
    ProjectReadinessEngine,
    READINESS_SCHEMA_VERSION,
    evaluateProjectReadiness,
  };
  globalObject.YarnAIProjectReadiness = publicApi;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = publicApi;
  }
})(typeof window !== "undefined" ? window : globalThis);
