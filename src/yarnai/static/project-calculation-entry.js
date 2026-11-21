"use strict";

(function exposeProjectCalculationEntry(globalObject) {
  const FORMAT = "yarnai-project-calculation-entry";
  const VERSION = 1;
  const KIND = "PROJECT_CALCULATION_ENTRY";
  const DRAFT_KEY = "project_calculation_entry_draft";
  const FORMULA_IDENTITY = "working-width-stitches-v1";
  const ROUNDING_RULE = Object.freeze({
    identity: "nearest-whole-stitch-half-up-v1",
    method: "nearest_integer_half_up",
    description: "До ближайшего целого числа петель; половина округляется вверх.",
  });
  const INCH_IN_CM = 2.54;
  const MAX_WIDTH_CM = 500;
  const LIFECYCLES = Object.freeze(["draft", "reviewing", "ready", "completed"]);
  const READINESS = Object.freeze(["ready", "conditionally-ready", "blocked"]);
  const SEMANTIC_ROLES = Object.freeze([
    "garment_detail_width",
    "confirmed_pattern_width",
    "confirmed_construction_width",
  ]);
  const WIDTH_PRIORITY = Object.freeze({
    garment_detail_width: 10,
    confirmed_pattern_width: 20,
    confirmed_construction_width: 30,
  });
  const SNAPSHOT_KEYS = Object.freeze([
    "format", "version", "identity", "projectIdentity", "lifecycle",
    "createdAt", "updatedAt", "completedAt", "sourceIdentities",
    "sourceFingerprints", "garmentContext", "sizingMode", "recipientContext",
    "gauge", "calculationTarget", "workingWidth", "formulaIdentity",
    "rawResult", "roundingRule", "finalStitchCount", "validation",
    "blockingErrors", "warnings", "assumptions", "provenance",
    "readiness", "audit", "fingerprint",
  ]);
  const FORBIDDEN_SNAPSHOT_KEYS = Object.freeze([
    "domState", "activeTab", "scrollPosition", "cssClasses", "route",
    "objectUrl", "notificationText", "loading", "browserHistory",
  ]);

  class ProjectCalculationEntryError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "ProjectCalculationEntryError";
      this.code = code;
      this.userMessage = message;
      this.details = details;
    }
  }

  function fail(code, message, details) {
    throw new ProjectCalculationEntryError(code, message, details);
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (isRecord(value) || Array.isArray(value)) {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }

  function clean(value, maximum = 240) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
  }

  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("NON_FINITE_VALUE", "Числовые данные расчёта повреждены.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("UNSUPPORTED_VALUE", "Данные расчёта нельзя безопасно сохранить.");
  }

  function fingerprint(value) {
    const input = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }

  function round(value, precision = 6) {
    const factor = 10 ** precision;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  function issue(code, message, field = "", requiresAcknowledgement = false) {
    return deepFreeze({ code, message, field, requiresAcknowledgement });
  }

  function uniqueIssues(values) {
    const result = [];
    const codes = new Set();
    for (const value of values) {
      if (!value || codes.has(value.code)) continue;
      codes.add(value.code);
      result.push(value);
    }
    return result;
  }

  function normalizeAcknowledgements(values, requiredCodes = null) {
    const allowed = requiredCodes ? new Set(requiredCodes) : null;
    return [...new Set((Array.isArray(values) ? values : [])
      .map((value) => clean(value, 100))
      .filter((value) => value && (!allowed || allowed.has(value))))].sort();
  }

  function normalizeUnit(unit) {
    const value = clean(unit, 20).toLowerCase();
    if (["cm", "centimeter", "centimeters"].includes(value)) return "cm";
    if (["in", "inch", "inches"].includes(value)) return "in";
    return null;
  }

  function toCentimeters(value, unit) {
    const numeric = Number(value);
    const normalizedUnit = normalizeUnit(unit);
    if (!Number.isFinite(numeric) || !normalizedUnit) return null;
    return round(normalizedUnit === "in" ? numeric * INCH_IN_CM : numeric, 6);
  }

  function normalizeWidthSource(source, options = {}) {
    if (!isRecord(source)) return null;
    const valueCm = toCentimeters(source.value, source.unit || "cm");
    const semanticRole = clean(source.semanticRole, 80);
    const sourceIdentity = clean(source.sourceIdentity, 180);
    const provenance = clean(source.provenance, 120);
    if (!Number.isFinite(valueCm) || valueCm <= 0 || valueCm > MAX_WIDTH_CM) return null;
    if (!SEMANTIC_ROLES.includes(semanticRole) || !sourceIdentity || !provenance) return null;
    if (options.requireConfirmed !== false && source.confirmed !== true) return null;
    return deepFreeze({
      value: round(Number(source.value), 6),
      unit: normalizeUnit(source.unit || "cm"),
      valueCm,
      semanticRole,
      provenance,
      sourceIdentity,
      confirmed: source.confirmed === true,
      priority: WIDTH_PRIORITY[semanticRole],
    });
  }

  function selectWorkingWidth(sources = []) {
    const errors = [];
    const candidates = (Array.isArray(sources) ? sources : [])
      .map((source) => normalizeWidthSource(source))
      .filter(Boolean)
      .sort((left, right) => left.priority - right.priority || left.sourceIdentity.localeCompare(right.sourceIdentity));
    if (!candidates.length) {
      return deepFreeze({ selected: null, candidates: [], errors, missing: true });
    }
    const distinct = [];
    for (const candidate of candidates) {
      if (!distinct.some((value) => Math.abs(value - candidate.valueCm) < 0.000001)) distinct.push(candidate.valueCm);
    }
    if (distinct.length > 1) {
      errors.push(issue("WORKING_WIDTH_CONFLICT", "Подтверждённые источники рабочей ширины противоречат друг другу.", "workingWidth"));
      return deepFreeze({ selected: null, candidates, errors, missing: false });
    }
    return deepFreeze({ selected: candidates[0], candidates, errors, missing: false });
  }

  function validateInitialization(source, projectIdentity) {
    const errors = [];
    if (!isRecord(source)) errors.push(issue("INITIALIZATION_MISSING", "Сначала завершите инициализацию проекта.", "initialization"));
    else {
      if (source.project_identity !== projectIdentity || source.snapshot?.project?.identity !== projectIdentity) errors.push(issue("INITIALIZATION_PROJECT_MISMATCH", "Инициализация относится к другому проекту.", "initialization"));
      if (source.lifecycle !== "initialized") errors.push(issue("INITIALIZATION_NOT_COMPLETED", "Инициализация проекта ещё не завершена.", "initialization"));
      if (!clean(source.identity, 180) || !clean(source.snapshot_fingerprint, 180) || !clean(source.integrity?.recordFingerprint, 180)) errors.push(issue("INITIALIZATION_IDENTITY_INVALID", "Идентификаторы инициализации повреждены.", "initialization"));
      if (source.integrity?.importedUnproven || source.integrity?.quarantined || source.integrity?.collision) errors.push(issue("INITIALIZATION_UNTRUSTED", "Инициализация проекта не прошла проверку доверия.", "initialization"));
    }
    return deepFreeze({ valid: errors.length === 0, errors, record: errors.length ? null : clone(source) });
  }

  function validateGauge(source, projectIdentity, initialization) {
    const errors = [];
    if (!isRecord(source)) errors.push(issue("CONFIRMED_GAUGE_MISSING", "Подтвердите плотность по контрольному образцу.", "gauge"));
    else {
      if (source.projectIdentity !== projectIdentity) errors.push(issue("GAUGE_PROJECT_MISMATCH", "Плотность относится к другому проекту.", "gauge"));
      if (source.lifecycle !== "confirmed") errors.push(issue("GAUGE_NOT_CONFIRMED", "Плотность ещё не подтверждена.", "gauge"));
      if (source.sourceInitializationIdentity !== initialization?.identity || source.sourceInitializationFingerprint !== (initialization?.integrity?.recordFingerprint || initialization?.snapshot_fingerprint)) errors.push(issue("GAUGE_STALE", "Плотность основана на прежней версии проекта.", "gauge"));
      const stitches = Number(source.snapshot?.computed?.stitchesPer10Cm);
      const rows = Number(source.snapshot?.computed?.rowsPer10Cm);
      if (!Number.isFinite(stitches) || stitches <= 0) errors.push(issue("STITCH_GAUGE_INVALID", "Плотность петель должна быть положительным числом.", "gauge"));
      if (!Number.isFinite(rows) || rows <= 0) errors.push(issue("ROW_GAUGE_INVALID", "Плотность рядов должна быть положительным числом.", "gauge"));
      if (!clean(source.identity, 180) || !clean(source.confirmationKey, 180) || !clean(source.fingerprint, 180)) errors.push(issue("GAUGE_IDENTITY_INVALID", "Идентификаторы подтверждённой плотности повреждены.", "gauge"));
    }
    return deepFreeze({ valid: errors.length === 0, errors, record: errors.length ? null : clone(source) });
  }

  function widthFromInitialization(initialization) {
    const measurement = initialization?.snapshot?.measurements?.garment?.garmentWidth;
    if (!measurement) return [];
    return [{
      value: measurement.value,
      unit: measurement.unit || "cm",
      semanticRole: "garment_detail_width",
      provenance: "stage_61_initialization",
      sourceIdentity: `${initialization.identity}:garmentWidth`,
      confirmed: true,
    }];
  }

  function calculateRawStitches(widthCm, stitchesPer10Cm) {
    const width = Number(widthCm);
    const gauge = Number(stitchesPer10Cm);
    if (!Number.isFinite(width) || width <= 0 || width > MAX_WIDTH_CM) fail("WORKING_WIDTH_INVALID", "Рабочая ширина должна быть больше 0 и не больше 500 см.");
    if (!Number.isFinite(gauge) || gauge <= 0) fail("STITCH_GAUGE_INVALID", "Плотность петель должна быть положительным числом.");
    return round(width * gauge / 10, 6);
  }

  function applyRoundingRule(rawValue, rule = ROUNDING_RULE) {
    if (!isRecord(rule) || rule.identity !== ROUNDING_RULE.identity) fail("ROUNDING_RULE_INVALID", "Правило округления не поддерживается.");
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) fail("RAW_RESULT_INVALID", "Расчётное число петель некорректно.");
    return Math.floor(numeric + 0.5 + Number.EPSILON);
  }

  function calculationFingerprintInput(input) {
    return {
      projectIdentity: input.projectIdentity,
      initializationIdentity: input.initialization.identity,
      initializationFingerprint: input.initialization.integrity.recordFingerprint || input.initialization.snapshot_fingerprint,
      detailsIdentity: input.initialization.source_closure_identity,
      detailsFingerprint: input.initialization.source_closure_fingerprint,
      gaugeIdentity: input.gauge.identity,
      gaugeConfirmationIdentity: input.gauge.confirmationKey,
      gaugeFingerprint: input.gauge.fingerprint,
      stitchesPer10Cm: round(Number(input.gauge.snapshot.computed.stitchesPer10Cm), 6),
      rowsPer10Cm: round(Number(input.gauge.snapshot.computed.rowsPer10Cm), 6),
      workingWidthCm: round(Number(input.workingWidth.valueCm), 6),
      workingWidthSemanticRole: input.workingWidth.semanticRole,
      formulaIdentity: FORMULA_IDENTITY,
      roundingRuleIdentity: ROUNDING_RULE.identity,
      construction: clone(input.construction || null),
    };
  }

  function calculateFingerprint(input) {
    return fingerprint(calculationFingerprintInput(input));
  }

  function assessEntry(input = {}) {
    const projectIdentity = clean(input.projectIdentity, 180);
    const blockingErrors = [];
    if (!projectIdentity) blockingErrors.push(issue("PROJECT_ID_INVALID", "Ссылка на проект повреждена.", "project"));
    if (!isRecord(input.project) || input.project.project_id !== projectIdentity) blockingErrors.push(issue("PROJECT_NOT_FOUND", "Проект не найден.", "project"));
    const initializationCheck = validateInitialization(input.initialization, projectIdentity);
    blockingErrors.push(...initializationCheck.errors);
    const gaugeCheck = validateGauge(input.gauge, projectIdentity, initializationCheck.record || input.initialization);
    blockingErrors.push(...gaugeCheck.errors);

    const confirmedWidthSources = [
      ...widthFromInitialization(initializationCheck.record),
      ...(Array.isArray(input.widthSources) ? input.widthSources : []),
    ];
    let widthSelection = selectWorkingWidth(confirmedWidthSources);
    blockingErrors.push(...widthSelection.errors);
    let workingWidth = widthSelection.selected;
    let widthNeedsConfirmation = false;
    if (!workingWidth && widthSelection.missing && isRecord(input.draftWidth)) {
      const normalizedDraft = normalizeWidthSource({
        ...input.draftWidth,
        semanticRole: input.draftWidth.semanticRole || "garment_detail_width",
        provenance: "user_entered_at_stage_64",
        sourceIdentity: `${projectIdentity}:stage64-working-width`,
        confirmed: input.draftWidth.confirmed === true,
      }, { requireConfirmed: false });
      if (normalizedDraft) {
        workingWidth = normalizedDraft;
        widthNeedsConfirmation = input.draftWidth.confirmed !== true;
      } else if (input.draftWidth.value !== "" && input.draftWidth.value !== null && input.draftWidth.value !== undefined) {
        blockingErrors.push(issue("WORKING_WIDTH_INVALID", "Рабочая ширина должна быть больше 0 и не больше 500 см.", "workingWidth"));
      }
    }
    if (!workingWidth) blockingErrors.push(issue("WORKING_WIDTH_MISSING", "Укажите рабочую ширину детали в сантиметрах.", "workingWidth"));
    if (workingWidth && !SEMANTIC_ROLES.includes(workingWidth.semanticRole)) blockingErrors.push(issue("WORKING_WIDTH_ROLE_UNKNOWN", "Неясно, что означает указанная ширина.", "workingWidth"));
    if (widthNeedsConfirmation) blockingErrors.push(issue("WORKING_WIDTH_CONFIRMATION_REQUIRED", "Подтвердите, что введённое значение — рабочая ширина одной детали.", "workingWidth"));

    const warnings = [];
    const assumptions = [];
    if (!input.patternRepeat) warnings.push(issue("UNKNOWN_PATTERN_REPEAT", "Раппорт узора неизвестен: результат округляется только до целого числа петель.", "rounding", true));
    if (!input.edgeStitches) warnings.push(issue("EDGE_STITCHES_NOT_INCLUDED", "Кромочные петли не добавлены, потому что их подтверждённое количество неизвестно.", "rounding", false));
    assumptions.push(issue("BASIC_WIDTH_ONLY", "Расчёт относится к одной подтверждённой рабочей ширине, а не к полной технологии детали."));
    const requiredAcknowledgements = warnings.filter((item) => item.requiresAcknowledgement).map((item) => item.code).sort();
    const acknowledgedWarningCodes = normalizeAcknowledgements(input.acknowledgedWarningCodes, requiredAcknowledgements);
    const missingAcknowledgements = requiredAcknowledgements.filter((code) => !acknowledgedWarningCodes.includes(code));

    let rawResult = null;
    let finalStitchCount = null;
    if (!blockingErrors.length && workingWidth && gaugeCheck.record) {
      rawResult = calculateRawStitches(workingWidth.valueCm, gaugeCheck.record.snapshot.computed.stitchesPer10Cm);
      finalStitchCount = applyRoundingRule(rawResult);
      if (!Number.isInteger(finalStitchCount) || finalStitchCount <= 0) blockingErrors.push(issue("FINAL_RESULT_INVALID", "Итоговое число петель некорректно.", "result"));
    }
    const readiness = blockingErrors.length ? "blocked" : warnings.length ? "conditionally-ready" : "ready";
    const fingerprintValue = !blockingErrors.length ? calculateFingerprint({
      projectIdentity,
      initialization: initializationCheck.record,
      gauge: gaugeCheck.record,
      workingWidth,
      construction: input.construction,
    }) : null;
    return deepFreeze({
      projectIdentity,
      initialization: initializationCheck.record,
      gauge: gaugeCheck.record,
      workingWidth,
      widthCandidates: widthSelection.candidates,
      widthNeedsInput: widthSelection.missing,
      rawResult,
      finalStitchCount,
      blockingErrors: uniqueIssues(blockingErrors),
      warnings: uniqueIssues(warnings),
      assumptions: uniqueIssues(assumptions),
      requiredAcknowledgements,
      acknowledgedWarningCodes,
      missingAcknowledgements,
      readiness,
      canReview: blockingErrors.length === 0,
      canComplete: blockingErrors.length === 0 && missingAcknowledgements.length === 0,
      fingerprint: fingerprintValue,
    });
  }

  function buildSnapshot(input = {}, metadata = {}) {
    const assessment = input.assessment || assessEntry(input);
    if (!assessment.canReview || !assessment.initialization || !assessment.gauge || !assessment.workingWidth) fail("ENTRY_BLOCKED", assessment.blockingErrors[0]?.message || "Расчёт заблокирован.");
    const identity = clean(metadata.identity, 180);
    const createdAt = clean(metadata.createdAt, 40);
    if (!identity || !createdAt) fail("SNAPSHOT_METADATA_MISSING", "Не удалось создать идентификатор расчёта.");
    const initialization = assessment.initialization;
    const gauge = assessment.gauge;
    const snapshot = {
      format: FORMAT,
      version: VERSION,
      identity,
      projectIdentity: assessment.projectIdentity,
      lifecycle: "draft",
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      sourceIdentities: {
        initialization: initialization.identity,
        projectDetailsClosure: initialization.source_closure_identity,
        gaugeRevision: gauge.identity,
        gaugeConfirmation: gauge.confirmationKey,
        workingWidth: assessment.workingWidth.sourceIdentity,
      },
      sourceFingerprints: {
        initialization: initialization.integrity.recordFingerprint || initialization.snapshot_fingerprint,
        projectDetails: initialization.source_closure_fingerprint,
        gauge: gauge.fingerprint,
      },
      garmentContext: {
        type: clean(initialization.snapshot?.garment?.type, 180),
        fit: clean(initialization.snapshot?.garment?.fit, 80) || null,
      },
      sizingMode: clean(initialization.snapshot?.garment?.sizeMode, 40),
      recipientContext: clean(initialization.snapshot?.garment?.recipient, 80) || null,
      gauge: {
        stitchesPer10Cm: round(Number(gauge.snapshot.computed.stitchesPer10Cm), 6),
        rowsPer10Cm: round(Number(gauge.snapshot.computed.rowsPer10Cm), 6),
        sourceRevisionIdentity: gauge.identity,
        confirmationIdentity: gauge.confirmationKey,
      },
      calculationTarget: "stitches_for_working_width",
      workingWidth: {
        value: assessment.workingWidth.value,
        unit: assessment.workingWidth.unit,
        canonicalValueCm: assessment.workingWidth.valueCm,
        semanticRole: assessment.workingWidth.semanticRole,
        provenance: assessment.workingWidth.provenance,
        sourceIdentity: assessment.workingWidth.sourceIdentity,
      },
      formulaIdentity: FORMULA_IDENTITY,
      rawResult: assessment.rawResult,
      roundingRule: clone(ROUNDING_RULE),
      finalStitchCount: assessment.finalStitchCount,
      validation: {
        valid: assessment.blockingErrors.length === 0,
        requiredAcknowledgementCodes: clone(assessment.requiredAcknowledgements),
        acknowledgedWarningCodes: clone(assessment.acknowledgedWarningCodes),
      },
      blockingErrors: clone(assessment.blockingErrors),
      warnings: clone(assessment.warnings),
      assumptions: clone(assessment.assumptions),
      provenance: {
        project: "repository",
        initialization: "stage_61_initialization",
        gauge: "stage_63_confirmed_gauge",
        workingWidth: assessment.workingWidth.provenance,
      },
      readiness: assessment.readiness,
      audit: { explicitConfirmation: false, createdBy: clean(metadata.createdBy, 120) || "project_owner" },
      fingerprint: assessment.fingerprint,
    };
    return validateSnapshot(snapshot);
  }

  function snapshotFingerprintInput(source) {
    return {
      projectIdentity: source.projectIdentity,
      initializationIdentity: source.sourceIdentities.initialization,
      initializationFingerprint: source.sourceFingerprints.initialization,
      detailsIdentity: source.sourceIdentities.projectDetailsClosure,
      detailsFingerprint: source.sourceFingerprints.projectDetails,
      gaugeIdentity: source.sourceIdentities.gaugeRevision,
      gaugeConfirmationIdentity: source.sourceIdentities.gaugeConfirmation,
      gaugeFingerprint: source.sourceFingerprints.gauge,
      stitchesPer10Cm: source.gauge.stitchesPer10Cm,
      rowsPer10Cm: source.gauge.rowsPer10Cm,
      workingWidthCm: source.workingWidth.canonicalValueCm,
      workingWidthSemanticRole: source.workingWidth.semanticRole,
      formulaIdentity: source.formulaIdentity,
      roundingRuleIdentity: source.roundingRule.identity,
      construction: null,
    };
  }

  function validateSnapshot(source) {
    if (!isRecord(source)) fail("SNAPSHOT_MALFORMED", "Сохранённый расчёт повреждён.");
    const keys = Object.keys(source);
    if (keys.length !== SNAPSHOT_KEYS.length || SNAPSHOT_KEYS.some((key) => !keys.includes(key)) || keys.some((key) => !SNAPSHOT_KEYS.includes(key))) fail("SNAPSHOT_NOT_ALLOWLISTED", "Сохранённый расчёт содержит неподдерживаемые поля.");
    if (FORBIDDEN_SNAPSHOT_KEYS.some((key) => key in source)) fail("SNAPSHOT_FORBIDDEN_FIELD", "Сохранённый расчёт содержит данные интерфейса.");
    if (source.format !== FORMAT || source.version !== VERSION || source.projectIdentity !== source.sourceIdentities?.workingWidth?.split(":stage64-working-width")[0] && source.workingWidth?.provenance === "user_entered_at_stage_64") fail("SNAPSHOT_IDENTITY_INVALID", "Идентификаторы расчёта повреждены.");
    if (!LIFECYCLES.includes(source.lifecycle) || !READINESS.includes(source.readiness)) fail("SNAPSHOT_LIFECYCLE_INVALID", "Состояние расчёта повреждено.");
    if (!clean(source.identity, 180) || !clean(source.projectIdentity, 180) || !clean(source.createdAt, 40) || !clean(source.updatedAt, 40)) fail("SNAPSHOT_METADATA_INVALID", "Метаданные расчёта повреждены.");
    if (!Number.isFinite(source.workingWidth?.canonicalValueCm) || source.workingWidth.canonicalValueCm <= 0 || source.workingWidth.canonicalValueCm > MAX_WIDTH_CM) fail("WORKING_WIDTH_INVALID", "Рабочая ширина повреждена.");
    if (!SEMANTIC_ROLES.includes(source.workingWidth.semanticRole)) fail("WORKING_WIDTH_ROLE_UNKNOWN", "Неясно, что означает рабочая ширина.");
    if (!Number.isFinite(source.gauge?.stitchesPer10Cm) || source.gauge.stitchesPer10Cm <= 0 || !Number.isFinite(source.gauge?.rowsPer10Cm) || source.gauge.rowsPer10Cm <= 0) fail("GAUGE_INVALID", "Сохранённая плотность повреждена.");
    const expectedRaw = calculateRawStitches(source.workingWidth.canonicalValueCm, source.gauge.stitchesPer10Cm);
    if (source.rawResult !== expectedRaw || source.finalStitchCount !== applyRoundingRule(expectedRaw, source.roundingRule)) fail("CALCULATION_MISMATCH", "Сохранённый результат не совпадает с исходными данными.");
    if (!Number.isInteger(source.finalStitchCount) || source.finalStitchCount <= 0) fail("FINAL_RESULT_INVALID", "Сохранённое число петель повреждено.");
    const warningCodes = source.warnings.map((item) => item.code);
    if (new Set(warningCodes).size !== warningCodes.length) fail("DUPLICATE_WARNING_CODE", "Предупреждения расчёта повреждены.");
    const required = source.validation.requiredAcknowledgementCodes;
    const acknowledged = source.validation.acknowledgedWarningCodes;
    if (!Array.isArray(required) || !Array.isArray(acknowledged) || acknowledged.some((code) => !required.includes(code))) fail("ACKNOWLEDGEMENT_INVALID", "Подтверждения предупреждений повреждены.");
    const expectedRequired = source.warnings.filter((item) => item.requiresAcknowledgement).map((item) => item.code).sort();
    if (canonicalize([...required].sort()) !== canonicalize(expectedRequired)) fail("ACKNOWLEDGEMENT_INVALID", "Acknowledgement data is invalid.");
    if (source.fingerprint !== fingerprint(snapshotFingerprintInput(source))) fail("FINGERPRINT_MISMATCH", "Calculation fingerprint does not match its inputs.");
    if (source.lifecycle === "completed") {
      if (!source.completedAt || source.audit?.explicitConfirmation !== true || source.blockingErrors.length || required.some((code) => !acknowledged.includes(code))) fail("COMPLETED_SNAPSHOT_INVALID", "Завершённый расчёт не прошёл проверку.");
    }
    canonicalize(source);
    return deepFreeze(clone(source));
  }

  function transitionLifecycle(source, target, metadata = {}) {
    const checked = validateSnapshot(source);
    if (checked.lifecycle === "completed") fail("COMPLETED_SNAPSHOT_IMMUTABLE", "Подтверждённый расчёт нельзя изменить.");
    const allowed = { draft: "reviewing", reviewing: "ready", ready: "completed" };
    if (allowed[checked.lifecycle] !== target) fail("LIFECYCLE_TRANSITION_INVALID", "Такой переход состояния расчёта запрещён.");
    if (target === "completed" && (checked.readiness === "blocked" || metadata.stale === true)) fail("ENTRY_NOT_COMPLETABLE", "Заблокированный или устаревший расчёт нельзя подтвердить.");
    const next = clone(checked);
    next.lifecycle = target;
    next.updatedAt = clean(metadata.timestamp, 40) || next.updatedAt;
    if (target === "completed") {
      const missing = next.validation.requiredAcknowledgementCodes.filter((code) => !next.validation.acknowledgedWarningCodes.includes(code));
      if (missing.length) fail("ACKNOWLEDGEMENT_REQUIRED", "Подтвердите обязательные предупреждения.");
      next.completedAt = clean(metadata.timestamp, 40);
      if (!next.completedAt) fail("COMPLETION_TIME_MISSING", "Не указано время подтверждения расчёта.");
      next.audit.explicitConfirmation = true;
    }
    return validateSnapshot(next);
  }

  function startReviewing(source, metadata = {}) { return transitionLifecycle(source, "reviewing", metadata); }
  function markReady(source, metadata = {}) { return transitionLifecycle(source, "ready", metadata); }
  function complete(source, metadata = {}) { return transitionLifecycle(source, "completed", metadata); }

  function staleStatus(snapshotSource, assessment) {
    try {
      const snapshot = validateSnapshot(snapshotSource);
      if (snapshot.lifecycle !== "completed") return deepFreeze({ stale: true, current: false, reasons: [issue("ENTRY_NOT_COMPLETED", "Расчёт ещё не подтверждён.")] });
      if (!assessment || assessment.readiness === "blocked" || !assessment.fingerprint) return deepFreeze({ stale: true, current: false, reasons: clone(assessment?.blockingErrors || [issue("SOURCE_CHAIN_INVALID", "Исходные данные расчёта недоступны.")]) });
      if (snapshot.fingerprint !== assessment.fingerprint) return deepFreeze({ stale: true, current: false, reasons: [issue("CALCULATION_STALE", "Исходные данные проекта изменились; подтвердите новую ревизию расчёта.")] });
      return deepFreeze({ stale: false, current: true, reasons: [] });
    } catch (error) {
      return deepFreeze({ stale: true, current: false, reasons: [issue(error.code || "SNAPSHOT_INVALID", error.userMessage || "Сохранённый расчёт повреждён.")] });
    }
  }

  function buildDraft(input = {}) {
    if (!clean(input.sourceFingerprint, 180)) fail("DRAFT_SOURCE_INVALID", "Draft source fingerprint is missing.");
    const unit = normalizeUnit(input.unit || "cm");
    const valueCm = toCentimeters(input.value, unit);
    if (!clean(input.projectIdentity, 180) || !unit || !Number.isFinite(valueCm) || valueCm <= 0 || valueCm > MAX_WIDTH_CM) fail("DRAFT_INVALID", "Черновик рабочей ширины повреждён.");
    return deepFreeze({
      format: `${FORMAT}-draft`,
      version: VERSION,
      projectIdentity: input.projectIdentity,
      width: { value: round(Number(input.value), 6), unit, semanticRole: "garment_detail_width", confirmed: input.confirmed === true },
      acknowledgedWarningCodes: normalizeAcknowledgements(input.acknowledgedWarningCodes),
      sourceFingerprint: clean(input.sourceFingerprint, 180),
      updatedAt: clean(input.updatedAt, 40),
    });
  }

  function validateDraft(source, options = {}) {
    if (!isRecord(source) || source.format !== `${FORMAT}-draft` || source.version !== VERSION || source.projectIdentity !== options.projectIdentity || !isRecord(source.width) || !Array.isArray(source.acknowledgedWarningCodes) || !clean(source.updatedAt, 40)) fail("DRAFT_INVALID", "Черновик рабочей ширины повреждён.");
    const normalized = buildDraft({ ...source.width, projectIdentity: source.projectIdentity, acknowledgedWarningCodes: source.acknowledgedWarningCodes, sourceFingerprint: source.sourceFingerprint, updatedAt: source.updatedAt });
    return normalized;
  }

  function safeDestination(value, projectIdentity) {
    try {
      const url = new URL(value, "http://localhost");
      const allowed = new Set(["/project-calculation-entry", "/project-execution-plan", "/user-workspace-entry", "/swatch-assistant"]);
      const valid = url.origin === "http://localhost" && allowed.has(url.pathname) && url.searchParams.get("project") === projectIdentity && !url.username && !url.password;
      return deepFreeze({ valid, href: valid ? `${url.pathname}?project=${encodeURIComponent(projectIdentity)}${url.hash || ""}` : "" });
    } catch {
      return deepFreeze({ valid: false, href: "" });
    }
  }

  const api = Object.freeze({
    FORMAT, VERSION, KIND, DRAFT_KEY, FORMULA_IDENTITY, ROUNDING_RULE,
    INCH_IN_CM, MAX_WIDTH_CM, LIFECYCLES, READINESS, SEMANTIC_ROLES,
    SNAPSHOT_KEYS, FORBIDDEN_SNAPSHOT_KEYS, ProjectCalculationEntryError,
    canonicalize, fingerprint, round, normalizeAcknowledgements, normalizeUnit,
    toCentimeters, normalizeWidthSource, selectWorkingWidth,
    validateInitialization, validateGauge, widthFromInitialization,
    calculateRawStitches, applyRoundingRule, calculationFingerprintInput,
    calculateFingerprint, assessEntry, buildSnapshot, validateSnapshot,
    transitionLifecycle, startReviewing, markReady, complete, staleStatus,
    buildDraft, validateDraft, safeDestination,
  });
  globalObject.YarnAIProjectCalculationEntry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
