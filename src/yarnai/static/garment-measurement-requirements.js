"use strict";

(function initializeGarmentMeasurementRequirements(globalObject) {
  const CONTRACT_TYPE = "GARMENT_MEASUREMENT_REQUIREMENTS";
  const CONTRACT_VERSION = "GARMENT_MEASUREMENT_REQUIREMENTS_V1";
  const SCHEMA_VERSION = 1;
  const GARMENT_CATEGORY = "sleeved_upper_body_garment";
  const STATUS_RESOLVED = "resolved";
  const STATUS_UNRESOLVED = "unresolved";
  const REASON_UNRESOLVED = "GARMENT_REQUIREMENTS_UNRESOLVED";
  const INPUT_TYPES = Object.freeze([
    "BODY_MEASUREMENT",
    "FINISHED_GARMENT_MEASUREMENT",
    "FIT_PREFERENCE",
    "CONSTRUCTION_INPUT",
  ]);
  const REQUIREMENT_LEVELS = Object.freeze(["required", "optional", "conditional"]);
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;

  const CONSTRUCTION_PROFILES = Object.freeze({
    "Вязание сверху вниз с рукавами реглан": Object.freeze({
      constructionIdentity: "top_down_raglan",
      constructionAttributes: Object.freeze({
        knittingMethod: "hand_knitting",
        knittingDirection: "top_down",
        shoulderSleeveConstruction: "raglan",
        assemblyMethod: "mostly_seamless",
      }),
      routeRequirements: Object.freeze([
        numericRequirement({
          measurementId: "finished_yoke_depth",
          inputType: "FINISHED_GARMENT_MEASUREMENT",
          requirementLevel: "required",
          labelRu: "Глубина кокетки готового изделия",
          explanationRu: "Измерь по вертикали от верхней точки плеча у горловины до линии подмышки готового изделия.",
          reasonRu: "Для реглана сверху вниз эта глубина задаёт место отделения корпуса от рукавов.",
          valuePath: "targetSizing.finishedGarmentMeasurements.finished_yoke_depth",
        }),
      ]),
    }),
    "Вязание отдельными деталями с втачным рукавом": Object.freeze({
      constructionIdentity: "seamed_set_in_sleeve",
      constructionAttributes: Object.freeze({
        knittingMethod: "hand_knitting",
        knittingDirection: "bottom_up_flat_pieces",
        shoulderSleeveConstruction: "set_in_sleeve",
        assemblyMethod: "seamed",
      }),
      routeRequirements: Object.freeze([
        numericRequirement({
          measurementId: "body_shoulder_width",
          inputType: "BODY_MEASUREMENT",
          requirementLevel: "required",
          labelRu: "Ширина плеч человека",
          explanationRu: "Измерь по спине от края одного плеча до края другого, не захватывая длину рукава.",
          reasonRu: "Для отдельной детали плеча нужна фактическая ширина плеч, чтобы не угадывать посадку втачного рукава.",
          valuePath: "targetSizing.bodyMeasurements.body_shoulder_width",
        }),
        numericRequirement({
          measurementId: "body_back_width",
          inputType: "BODY_MEASUREMENT",
          requirementLevel: "optional",
          labelRu: "Ширина спины человека",
          explanationRu: "Измерь горизонтально между задними складками подмышек при свободно опущенных руках.",
          reasonRu: "Можно сохранить для проверки посадки. Текущий расчёт прямого поло использует обхват изделия, ширину плеч и глубину проймы; отдельную ширину спины он не использует.",
          valuePath: "targetSizing.bodyMeasurements.body_back_width",
        }),
        numericRequirement({
          measurementId: "finished_armhole_depth",
          inputType: "FINISHED_GARMENT_MEASUREMENT",
          requirementLevel: "required",
          labelRu: "Глубина проймы готового изделия",
          explanationRu: "Измерь по вертикали от верхней точки плеча до нижней точки проймы готового изделия.",
          reasonRu: "Втачной рукав требует заданной глубины проймы; фотография её точно не определяет.",
          valuePath: "targetSizing.finishedGarmentMeasurements.finished_armhole_depth",
        }),
      ]),
    }),
  });

  class GarmentMeasurementRequirementsError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "GarmentMeasurementRequirementsError";
      this.code = code;
      this.userMessage = message;
      this.details = copy(details);
    }
  }

  function resolveFromTechnologyDecision(handoff) {
    const source = normalizeSource(handoff);
    if (!source.current || source.decisionStatus !== "confirmed") {
      return unresolvedProfile(source, "Сначала подтверди один ручной способ вязания.");
    }
    const definition = source.selectedConstructionIdentity === "seamed_set_in_sleeve"
      ? CONSTRUCTION_PROFILES["Вязание отдельными деталями с втачным рукавом"] : CONSTRUCTION_PROFILES[source.selectedOptionName];
    if (!definition || !sourceComplete(source)) {
      return unresolvedProfile(source, "Подтверждённая технология не содержит полной категории или конструкции. Вернись к выбору технологии.");
    }
    const measurementRequirements = commonRequirements(definition).concat(copy(definition.routeRequirements));
    const profile = {
      contractType: CONTRACT_TYPE,
      contractVersion: CONTRACT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      status: STATUS_RESOLVED,
      abstain: false,
      reasonCode: null,
      firstAction: null,
      projectId: source.projectId,
      analysis: {
        id: source.analysisId,
        revision: source.analysisRevision,
        fingerprint: source.analysisFingerprint,
        requestId: source.analysisRequestId,
        requestFingerprint: source.analysisRequestFingerprint,
      },
      technologyDecision: {
        id: source.technologyDecisionId,
        revision: source.technologyDecisionRevision,
        fingerprint: source.technologyDecisionFingerprint,
        selectedOptionId: source.selectedOptionId,
      },
      constructionIdentity: definition.constructionIdentity,
      garmentCategory: GARMENT_CATEGORY,
      constructionAttributes: copy(definition.constructionAttributes),
      measurementRequirements,
      canonicalNormalization: canonicalNormalization(measurementRequirements),
      canonicalFingerprint: "",
    };
    profile.canonicalFingerprint = profileFingerprint(profile);
    requireValidProfile(profile);
    return freeze(profile);
  }

  function unresolvedProfile(source, firstAction) {
    const profile = {
      contractType: CONTRACT_TYPE,
      contractVersion: CONTRACT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      status: STATUS_UNRESOLVED,
      abstain: true,
      reasonCode: REASON_UNRESOLVED,
      firstAction,
      projectId: source.projectId,
      analysis: {
        id: source.analysisId,
        revision: source.analysisRevision,
        fingerprint: source.analysisFingerprint,
        requestId: source.analysisRequestId,
        requestFingerprint: source.analysisRequestFingerprint,
      },
      technologyDecision: {
        id: source.technologyDecisionId,
        revision: source.technologyDecisionRevision,
        fingerprint: source.technologyDecisionFingerprint,
        selectedOptionId: source.selectedOptionId,
      },
      constructionIdentity: null,
      garmentCategory: null,
      constructionAttributes: null,
      measurementRequirements: [],
      canonicalNormalization: canonicalNormalization([]),
      canonicalFingerprint: "",
    };
    profile.canonicalFingerprint = profileFingerprint(profile);
    return freeze(profile);
  }

  function commonRequirements(definition) {
    return [
      numericRequirement({
        measurementId: "finished_bust_circumference",
        inputType: "FINISHED_GARMENT_MEASUREMENT",
        requirementLevel: "conditional",
        applicability: { kind: "bust_target_alternative", role: "finished" },
        labelRu: "Обхват готового изделия по груди",
        explanationRu: "Разложи подходящее изделие ровно, измерь ширину на уровне груди и умножь на два либо измерь изделие по кругу.",
        reasonRu: "Это прямой способ задать итоговую ширину корпуса без вывода мерки из фотографии.",
        valuePath: "targetSizing.finishedGarmentMeasurements.finished_bust_circumference",
      }),
      numericRequirement({
        measurementId: "body_bust_circumference",
        inputType: "BODY_MEASUREMENT",
        requirementLevel: "conditional",
        applicability: { kind: "bust_target_alternative", role: "body" },
        labelRu: "Обхват груди человека",
        explanationRu: "Измерь сантиметровой лентой по наиболее выступающим точкам груди, держа ленту горизонтально.",
        reasonRu: "Если итоговый обхват изделия не задан напрямую, он требует фактической мерки человека и отдельной свободы облегания.",
        valuePath: "targetSizing.bodyMeasurements.bust_circumference",
      }),
      numericRequirement({
        measurementId: "bust_ease",
        inputType: "FIT_PREFERENCE",
        requirementLevel: "conditional",
        applicability: { kind: "bust_target_alternative", role: "ease" },
        labelRu: "Свобода облегания по груди",
        explanationRu: "Укажи разницу в сантиметрах между желаемым обхватом изделия и обхватом груди человека; отрицательное значение означает облегание.",
        reasonRu: "Предпочтение по посадке нельзя надёжно получить из фотографии без масштаба и человека.",
        valuePath: "targetSizing.ease.bust_ease",
        normalization: { valueType: "decimal", unit: "cm", minimum: -100, maximum: 500, precision: 4, missing: null },
      }),
      numericRequirement({
        measurementId: "finished_body_length",
        inputType: "FINISHED_GARMENT_MEASUREMENT",
        requirementLevel: "required",
        labelRu: "Длина готового изделия",
        explanationRu: "Измерь по вертикали от верхней точки плеча у горловины до желаемого нижнего края.",
        reasonRu: "Фотография без масштаба не задаёт точную итоговую длину корпуса.",
        valuePath: "targetSizing.finishedGarmentMeasurements.finished_body_length",
      }),
      numericRequirement({
        measurementId: "finished_sleeve_length",
        inputType: "FINISHED_GARMENT_MEASUREMENT",
        requirementLevel: "required",
        labelRu: "Длина готового рукава",
        explanationRu: "Измерь от точки начала рукава выбранной конструкции до желаемого края манжеты по слегка согнутой руке или по подходящему изделию.",
        reasonRu: "Длина рукава является желаемым размером изделия, а не наблюдением по фотографии.",
        valuePath: "targetSizing.finishedGarmentMeasurements.finished_sleeve_length",
      }),
      numericRequirement({
        measurementId: "finished_upper_arm_circumference",
        inputType: "FINISHED_GARMENT_MEASUREMENT",
        requirementLevel: "required",
        labelRu: "Обхват готового рукава в верхней части",
        explanationRu: "Измерь желаемый обхват рукава в самой широкой части плеча с учётом нужной свободы.",
        reasonRu: "Рукав реглан и втачной рукав требуют заданной ширины, которую нельзя точно восстановить по фото.",
        valuePath: "targetSizing.finishedGarmentMeasurements.finished_upper_arm_circumference",
      }),
      numericRequirement({
        measurementId: "finished_cuff_circumference",
        inputType: "FINISHED_GARMENT_MEASUREMENT",
        requirementLevel: "required",
        labelRu: "Обхват края готового рукава",
        explanationRu: "Измерь желаемый обхват готовой манжеты или нижнего края короткого рукава.",
        reasonRu: "Ширина края нужна для формы рукава и не выводится из фотографии.",
        valuePath: "targetSizing.finishedGarmentMeasurements.finished_cuff_circumference",
      }),
      numericRequirement({
        measurementId: "finished_neck_width",
        inputType: "FINISHED_GARMENT_MEASUREMENT",
        requirementLevel: "required",
        labelRu: "Ширина горловины готового изделия",
        explanationRu: "Измерь горизонтально между точками, где горловина встречается с плечом.",
        reasonRu: "Точный размер горловины нужен независимо от её выбранной формы.",
        valuePath: "targetSizing.finishedGarmentMeasurements.finished_neck_width",
      }),
      numericRequirement({
        measurementId: "finished_front_neck_depth",
        inputType: "FINISHED_GARMENT_MEASUREMENT",
        requirementLevel: "required",
        labelRu: "Глубина горловины спереди",
        explanationRu: "Измерь по вертикали от верхней точки плеча у горловины до нижней точки выреза спереди.",
        reasonRu: "Форма выреза требует точной желаемой глубины, а перспектива фотографии её искажает.",
        valuePath: "targetSizing.finishedGarmentMeasurements.finished_front_neck_depth",
      }),
      choiceRequirement({
        measurementId: "body_shaping_preference",
        inputType: "FIT_PREFERENCE",
        requirementLevel: "required",
        labelRu: "Форма корпуса",
        explanationRu: "Выбери прямой корпус или приталивание; это предпочтение будущего изделия.",
        reasonRu: "Нужда в мерках талии и бёдер зависит от желаемой формы, а не от догадки по фотографии.",
        valuePath: "targetSizing.fitPreferences.body_shaping_preference",
        allowedValues: ["straight", "shaped"],
      }),
      numericRequirement({
        measurementId: "finished_waist_circumference",
        inputType: "FINISHED_GARMENT_MEASUREMENT",
        requirementLevel: "conditional",
        applicability: { kind: "equals", valuePath: "targetSizing.fitPreferences.body_shaping_preference", expected: "shaped" },
        labelRu: "Обхват готового изделия по талии",
        explanationRu: "Измерь желаемый обхват изделия на уровне талии.",
        reasonRu: "Поле требуется только для выбранного приталенного корпуса.",
        valuePath: "targetSizing.finishedGarmentMeasurements.finished_waist_circumference",
      }),
      numericRequirement({
        measurementId: "finished_hip_circumference",
        inputType: "FINISHED_GARMENT_MEASUREMENT",
        requirementLevel: "conditional",
        applicability: { kind: "equals", valuePath: "targetSizing.fitPreferences.body_shaping_preference", expected: "shaped" },
        labelRu: "Обхват готового изделия по бёдрам",
        explanationRu: "Измерь желаемый обхват изделия на уровне наиболее выступающих точек бёдер.",
        reasonRu: "Поле требуется только для приталенного корпуса, если изделие доходит до линии бёдер.",
        valuePath: "targetSizing.finishedGarmentMeasurements.finished_hip_circumference",
      }),
      numericRequirement({
        measurementId: "body_waist_circumference",
        inputType: "BODY_MEASUREMENT",
        requirementLevel: "optional",
        labelRu: "Обхват талии человека",
        explanationRu: "Измерь по естественной линии талии без натяжения ленты.",
        reasonRu: "Полезно для проверки посадки, но прямой желаемый обхват изделия остаётся достаточным.",
        valuePath: "targetSizing.bodyMeasurements.waist_circumference",
      }),
      numericRequirement({
        measurementId: "body_hip_circumference",
        inputType: "BODY_MEASUREMENT",
        requirementLevel: "optional",
        labelRu: "Обхват бёдер человека",
        explanationRu: "Измерь горизонтально по наиболее выступающим точкам бёдер.",
        reasonRu: "Полезно для проверки посадки длинного изделия, но не блокирует этот минимальный профиль.",
        valuePath: "targetSizing.bodyMeasurements.hip_circumference",
      }),
      choiceRequirement({
        measurementId: "neckline_style",
        inputType: "FIT_PREFERENCE",
        requirementLevel: "required",
        labelRu: "Форма горловины",
        explanationRu: "Выбери желаемую форму: круглая, V-образная или воротник поло с планкой.",
        reasonRu: "Форма горловины — настоящее предпочтение изделия; выбранный способ вязания её не определяет.",
        valuePath: "targetSizing.fitPreferences.neckline_style",
        allowedValues: ["round_neck", "v_neck", "polo_collar_with_placket"],
      }),
      choiceRequirement({
        measurementId: "closure_style",
        inputType: "FIT_PREFERENCE",
        requirementLevel: "required",
        labelRu: "Вариант застёжки",
        explanationRu: "Выбери изделие без застёжки, с короткой передней планкой или с полной передней застёжкой.",
        reasonRu: "Застёжка меняет конструкцию переда и должна быть выбрана явно.",
        valuePath: "targetSizing.fitPreferences.closure_style",
        allowedValues: ["none", "short_front_placket", "full_front"],
      }),
      choiceRequirement({
        measurementId: "hem_finish",
        inputType: "CONSTRUCTION_INPUT",
        requirementLevel: "required",
        labelRu: "Обработка нижнего края",
        explanationRu: "Выбери резинку, подвёрнутый край или простой край.",
        reasonRu: "Способ обработки определяет переход к нижнему краю, но не должен угадываться по фото.",
        valuePath: "constructionInputs.hem_finish",
        allowedValues: ["rib", "folded", "plain"],
      }),
      choiceRequirement({
        measurementId: "cuff_finish",
        inputType: "CONSTRUCTION_INPUT",
        requirementLevel: "required",
        labelRu: "Обработка края рукава",
        explanationRu: "Выбери резинку, подвёрнутый край или простой край рукава.",
        reasonRu: "Обработка края нужна для будущего расчёта рукава и не выводится автоматически из фотографии.",
        valuePath: "constructionInputs.cuff_finish",
        allowedValues: ["rib", "folded", "plain"],
      }),
      automaticRequirement({
        measurementId: "shoulder_sleeve_construction",
        labelRu: "Конструкция плеча и рукава",
        explanationRu: "Система берёт её из exact подтверждённого способа вязания.",
        reasonRu: "Это внутренний технологический параметр, поэтому пользователь не выбирает его повторно.",
        resolvedValue: definition.constructionAttributes.shoulderSleeveConstruction,
      }),
      automaticRequirement({
        measurementId: "assembly_method",
        labelRu: "Способ сборки",
        explanationRu: "Система берёт его из exact подтверждённого способа вязания.",
        reasonRu: "Швы или почти бесшовная сборка уже определены выбранной технологией.",
        resolvedValue: definition.constructionAttributes.assemblyMethod,
      }),
    ];
  }

  function numericRequirement(input) {
    return requirement({
      ...input,
      unit: "cm",
      allowedSources: input.inputType === "BODY_MEASUREMENT"
        ? ["USER_MEASUREMENT"]
        : input.inputType === "FIT_PREFERENCE"
        ? ["USER_FIT_PREFERENCE"]
        : ["USER_FINISHED_GARMENT_MEASUREMENT"],
      applicability: input.applicability || { kind: "always" },
      normalization: input.normalization || { valueType: "decimal", unit: "cm", minimumExclusive: 0, maximum: 500, precision: 4, missing: null },
    });
  }

  function choiceRequirement(input) {
    return requirement({
      ...input,
      unit: "choice",
      allowedSources: input.inputType === "CONSTRUCTION_INPUT" ? ["USER_CONFIRMED_DESIGN_CHOICE"] : ["USER_FIT_PREFERENCE"],
      applicability: input.applicability || { kind: "always" },
      normalization: { valueType: "enum", allowedValues: [...input.allowedValues].sort(), missing: null },
    });
  }

  function automaticRequirement(input) {
    return requirement({
      ...input,
      inputType: "CONSTRUCTION_INPUT",
      requirementLevel: "required",
      unit: "construction_identity",
      allowedSources: ["CONFIRMED_TECHNOLOGY_DECISION"],
      applicability: { kind: "always" },
      valuePath: null,
      normalization: { valueType: "stable_identifier", missing: null },
    });
  }

  function requirement(input) {
    return {
      measurementId: input.measurementId,
      inputType: input.inputType,
      requirementLevel: input.requirementLevel,
      applicability: copy(input.applicability),
      labelRu: input.labelRu,
      explanationRu: input.explanationRu,
      unit: input.unit,
      allowedSources: copy(input.allowedSources),
      reasonRu: input.reasonRu,
      valuePath: input.valuePath || null,
      resolvedValue: input.resolvedValue || null,
      canonicalNormalization: copy(input.normalization),
    };
  }

  function evaluateProfile(profile, artifact = {}) {
    requireValidProfile(profile);
    if (profile.status !== STATUS_RESOLVED) {
      return freeze({ status: STATUS_UNRESOLVED, abstain: true, items: [], blockers: [], firstAction: profile.firstAction });
    }
    const items = profile.measurementRequirements.map((entry) => evaluateRequirement(entry, artifact));
    const blockers = items.filter((entry) => entry.blocks);
    return freeze({
      status: blockers.length ? "incomplete" : "complete",
      abstain: blockers.length > 0,
      items,
      blockers,
      firstAction: blockers[0]?.suggestedAction || null,
    });
  }

  function evaluateRequirement(requirementValue, artifact) {
    const active = requirementActive(requirementValue, artifact);
    const raw = requirementValue.resolvedValue !== null ? requirementValue.resolvedValue : valueAt(artifact, requirementValue.valuePath);
    const normalized = normalizeRequirementValue(requirementValue, raw);
    const optional = requirementValue.requirementLevel === "optional";
    const blocks = active && !optional && normalized.status !== "valid";
    return {
      measurementId: requirementValue.measurementId,
      requirementLevel: requirementValue.requirementLevel,
      active,
      status: !active ? "inactive" : normalized.status === "valid" ? "filled" : normalized.status,
      normalizedValue: normalized.value,
      blocks,
      suggestedAction: blocks ? `Заполни «${requirementValue.labelRu}».` : null,
    };
  }

  function requirementActive(requirementValue, artifact) {
    if (requirementValue.requirementLevel !== "conditional") return true;
    const rule = requirementValue.applicability;
    if (rule.kind === "equals") return valueAt(artifact, rule.valuePath) === rule.expected;
    if (rule.kind === "bust_target_alternative") {
      const finished = validNumeric(valueAt(artifact, "targetSizing.finishedGarmentMeasurements.finished_bust_circumference"), false);
      const body = validNumeric(valueAt(artifact, "targetSizing.bodyMeasurements.bust_circumference"), false);
      const ease = validNumeric(valueAt(artifact, "targetSizing.ease.bust_ease"), true);
      if (rule.role === "finished") return !(body && ease);
      return !finished;
    }
    return false;
  }

  function normalizeRequirementValue(requirementValue, raw) {
    if (raw === null || raw === undefined || raw === "") return { status: "missing", value: null };
    const normalization = requirementValue.canonicalNormalization;
    if (normalization.valueType === "decimal") {
      const numeric = typeof raw === "number" ? raw : Number(raw);
      const minimumOk = Object.prototype.hasOwnProperty.call(normalization, "minimumExclusive")
        ? numeric > normalization.minimumExclusive
        : numeric >= normalization.minimum;
      if (!Number.isFinite(numeric) || !minimumOk || numeric > normalization.maximum) return { status: "invalid", value: null };
      return { status: "valid", value: { value: round(numeric, normalization.precision), unit: normalization.unit } };
    }
    if (normalization.valueType === "enum") {
      return normalization.allowedValues.includes(raw) ? { status: "valid", value: raw } : { status: "invalid", value: null };
    }
    if (normalization.valueType === "stable_identifier") {
      return typeof raw === "string" && /^[a-z][a-z0-9_]*$/.test(raw) ? { status: "valid", value: raw } : { status: "invalid", value: null };
    }
    return { status: "invalid", value: null };
  }

  function requireValidProfile(profile) {
    if (!profile || profile.contractType !== CONTRACT_TYPE || profile.contractVersion !== CONTRACT_VERSION || profile.schemaVersion !== SCHEMA_VERSION) {
      fail("GARMENT_REQUIREMENTS_PROFILE_INVALID", "Профиль мерок имеет неподдерживаемую версию.");
    }
    if (![STATUS_RESOLVED, STATUS_UNRESOLVED].includes(profile.status) || profile.abstain !== (profile.status !== STATUS_RESOLVED)) {
      fail("GARMENT_REQUIREMENTS_PROFILE_INVALID", "Статус профиля мерок повреждён.");
    }
    if (!Array.isArray(profile.measurementRequirements) || !FINGERPRINT.test(profile.canonicalFingerprint || "")) {
      fail("GARMENT_REQUIREMENTS_PROFILE_INVALID", "Профиль мерок не содержит канонического fingerprint.");
    }
    if (profile.status === STATUS_RESOLVED) {
      if (!profile.projectId || !profile.analysis?.id || !Number.isSafeInteger(profile.analysis?.revision) || profile.analysis.revision < 1 || !FINGERPRINT.test(profile.analysis?.fingerprint || "") || !profile.technologyDecision?.id || !Number.isSafeInteger(profile.technologyDecision?.revision) || profile.technologyDecision.revision < 1 || !FINGERPRINT.test(profile.technologyDecision?.fingerprint || "") || !profile.constructionIdentity || profile.garmentCategory !== GARMENT_CATEGORY) {
        fail("GARMENT_REQUIREMENTS_PROFILE_INVALID", "Профиль мерок не связан с exact подтверждённым решением.");
      }
      const ids = new Set();
      profile.measurementRequirements.forEach((entry) => {
        if (!entry || !/^[a-z][a-z0-9_]*$/.test(entry.measurementId || "") || ids.has(entry.measurementId) || !INPUT_TYPES.includes(entry.inputType) || !REQUIREMENT_LEVELS.includes(entry.requirementLevel) || !entry.labelRu || !entry.explanationRu || !entry.reasonRu || !entry.unit || !Array.isArray(entry.allowedSources) || !entry.allowedSources.length || !entry.canonicalNormalization) {
          fail("GARMENT_REQUIREMENTS_PROFILE_INVALID", "Требование к мерке повреждено или повторяется.");
        }
        ids.add(entry.measurementId);
      });
    }
    if (profileFingerprint(profile) !== profile.canonicalFingerprint) {
      fail("GARMENT_REQUIREMENTS_PROFILE_FINGERPRINT_MISMATCH", "Профиль мерок не прошёл проверку целостности.");
    }
    return true;
  }

  function compactBinding(profile) {
    requireValidProfile(profile);
    return freeze({
      contractType: profile.contractType,
      contractVersion: profile.contractVersion,
      profileFingerprint: profile.canonicalFingerprint,
      analysisId: profile.analysis.id,
      analysisRevision: profile.analysis.revision,
      analysisFingerprint: profile.analysis.fingerprint,
      technologyDecisionId: profile.technologyDecision.id,
      technologyDecisionRevision: profile.technologyDecision.revision,
      technologyDecisionFingerprint: profile.technologyDecision.fingerprint,
    });
  }

  function canonicalNormalization(requirements) {
    return {
      normalizationVersion: "GARMENT_REQUIREMENTS_CANONICAL_NORMALIZATION_V1",
      objectKeyOrder: "lexicographic",
      measurementOrder: requirements.map((entry) => entry.measurementId),
      missingValue: null,
      emptyStringIsMissing: true,
      missingNeverBecomesZero: true,
    };
  }

  function normalizeSource(handoff = {}) {
    return {
      current: handoff.isCurrent === true,
      decisionStatus: handoff.decisionStatus || null,
      projectId: handoff.projectId || null,
      analysisId: handoff.analysisId || null,
      analysisRevision: handoff.analysisRevision || null,
      analysisFingerprint: handoff.sourceAnalysisFingerprint || null,
      analysisRequestId: handoff.analysisRequestId || null,
      analysisRequestFingerprint: handoff.sourceRequestFingerprint || null,
      technologyDecisionId: handoff.technologyDecisionId || null,
      technologyDecisionRevision: handoff.technologyDecisionRevision || null,
      technologyDecisionFingerprint: handoff.technologyDecisionFingerprint || null,
      selectedOptionId: handoff.selectedOptionId || null,
      selectedOptionName: handoff.selectedOption?.name || null,
      ...(handoff.selectedConstructionIdentity ? { selectedConstructionIdentity: handoff.selectedConstructionIdentity } : {}),
    };
  }

  function sourceComplete(source) {
    return Boolean(
      source.projectId && source.analysisId && Number.isSafeInteger(source.analysisRevision) && source.analysisRevision > 0 &&
      FINGERPRINT.test(source.analysisFingerprint || "") && source.analysisRequestId && FINGERPRINT.test(source.analysisRequestFingerprint || "") &&
      source.technologyDecisionId && Number.isSafeInteger(source.technologyDecisionRevision) && source.technologyDecisionRevision > 0 &&
      FINGERPRINT.test(source.technologyDecisionFingerprint || "") && source.selectedOptionId && source.selectedOptionName,
    );
  }

  function profileFingerprint(profile) {
    const core = copy(profile);
    delete core.canonicalFingerprint;
    return fnv1a32(core);
  }

  function valueAt(artifact, path) {
    if (!path) return null;
    const segments = path.split(".");
    let value = artifact;
    for (const segment of segments) {
      if (Array.isArray(value)) {
        const item = value.find((entry) => entry?.kind === segment);
        value = item ? item.value : null;
      } else value = value && typeof value === "object" ? value[segment] : null;
      if (value === null || value === undefined) return null;
    }
    return value;
  }

  function validNumeric(value, allowSigned) {
    return Number.isFinite(value) && (allowSigned || value > 0);
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function fnv1a32(value) {
    const source = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function canonicalize(value) {
    if (value === undefined) return "undefined";
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }

  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
  function fail(code, message, details = {}) { throw new GarmentMeasurementRequirementsError(code, message, details); }

  const api = Object.freeze({
    CONTRACT_TYPE,
    CONTRACT_VERSION,
    SCHEMA_VERSION,
    GARMENT_CATEGORY,
    STATUS_RESOLVED,
    STATUS_UNRESOLVED,
    REASON_UNRESOLVED,
    INPUT_TYPES,
    REQUIREMENT_LEVELS,
    CONSTRUCTION_PROFILES,
    GarmentMeasurementRequirementsError,
    resolveFromTechnologyDecision,
    evaluateProfile,
    requireValidProfile,
    compactBinding,
    profileFingerprint,
    canonicalize,
  });
  globalObject.YarnAIGarmentMeasurementRequirements = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
