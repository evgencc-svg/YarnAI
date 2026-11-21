"use strict";

(function initializeProjectExecutionPlan(globalObject) {
  const FORMAT = "yarnai-project-execution-plan";
  const VERSION = 1;
  const KIND = "PROJECT_EXECUTION_PLAN_PREPARATION";
  const PROGRESS_KIND = KIND;
  const DRAFT_KEY = "project_execution_plan_preparation_draft";
  const LIFECYCLES = Object.freeze(["draft", "reviewing", "ready", "completed"]);
  const READINESS = Object.freeze(["ready", "conditionally-ready", "blocked"]);
  const STEP_TYPES = Object.freeze([
    "CAST_ON", "FOUNDATION_SECTION", "PRIMARY_FABRIC", "SHAPING", "DIVISION",
    "REPEAT_PART", "JOINING", "FINISHING", "BLOCKING", "FINAL_INSPECTION",
  ]);
  const STEP_STATUSES = Object.freeze(["confirmed", "conditional", "blocked"]);
  const BOUNDED_INPUTS = Object.freeze({
    direction: Object.freeze(["bottom_up", "top_down", "unknown"]),
    workingMethod: Object.freeze(["in_round", "flat", "unknown"]),
    foundationType: Object.freeze(["ribbing", "other", "unknown"]),
    pieceLayout: Object.freeze(["separate_front_back", "single_body", "unknown"]),
  });
  const SNAPSHOT_KEYS = Object.freeze([
    "format", "version", "identity", "projectIdentity", "lifecycle", "createdAt",
    "updatedAt", "completedAt", "sourceIdentities", "sourceFingerprints",
    "projectContext", "garmentContext", "sizingContext", "recipientContext",
    "gaugeContext", "calculationContext", "technologyContext", "materialContext",
    "planScope", "steps", "dependencies", "validation", "blockingErrors", "warnings",
    "assumptions", "provenance", "readiness", "audit", "fingerprint",
  ]);
  const STEP_KEYS = Object.freeze([
    "identity", "sequenceNumber", "type", "title", "purpose", "status", "source",
    "confidence", "requiredInputs", "expectedOutput", "validationCheckpoint",
    "dependencies", "warnings", "assumptions", "provenance",
  ]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  class ProjectExecutionPlanError extends Error {
    constructor(code, message) { super(message); this.name = "ProjectExecutionPlanError"; this.code = code; this.userMessage = message; }
  }
  function fail(code, message) { throw new ProjectExecutionPlanError(code, message); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function clean(value, limit = 240) { return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : ""; }
  function issue(code, message, extra = {}) { return { code, message, ...extra }; }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("JSON_UNSAFE", "План содержит недопустимое число."); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("JSON_UNSAFE", "План содержит неподдерживаемое значение.");
  }
  function fingerprint(value) {
    const input = canonicalize(value); let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }
  function exactKeys(value, allowlist, code) {
    if (!record(value)) fail(code, "Сохранённый план повреждён.");
    const keys = Object.keys(value);
    if (keys.length !== allowlist.length || keys.some((key) => !allowlist.includes(key)) || allowlist.some((key) => !keys.includes(key))) fail(code, "Сохранённый план содержит неподдерживаемые поля.");
  }
  function jsonSafe(value) { try { canonicalize(value); return true; } catch { return false; } }
  function validateProjectIdentity(value, expected = "") {
    const identity = clean(value, 180);
    if (!UUID_V7.test(identity) || expected && identity !== expected) fail("PROJECT_ID_INVALID", "Откройте план из рабочего пространства проекта.");
    return identity;
  }
  function normalizeCodes(values) { return [...new Set((Array.isArray(values) ? values : []).map((value) => clean(value, 100)).filter(Boolean))].sort(); }
  function normalizeBoundedInputs(source = {}) {
    const value = {};
    for (const [key, allowed] of Object.entries(BOUNDED_INPUTS)) {
      const candidate = clean(source?.[key], 80) || "unknown";
      if (!allowed.includes(candidate)) fail("BOUNDED_INPUT_INVALID", "Один из уточняющих параметров имеет недопустимое значение.");
      value[key] = candidate;
    }
    value.confirmed = source?.confirmed === true || Object.values(value).every((item) => item === "unknown");
    value.provenance = "user_entered_at_stage_65";
    return deepFreeze(value);
  }

  function normalizeTechnology(source) {
    const state = source?.state || source || {};
    const confirmed = state.status === "confirmed" || state.lifecycle === "completed" || state.confirmed === true;
    const snapshot = state.confirmedSnapshot || state.snapshot || state.reviewedData || {};
    const conflictValues = snapshot.conflicts || state.conflicts || [];
    return deepFreeze({
      identity: clean(state.id || state.identity, 180) || null,
      fingerprint: clean(state.fingerprint || state.confirmedFingerprint || snapshot.fingerprint, 180) || null,
      confirmed,
      conflict: Array.isArray(conflictValues) ? conflictValues.some((item) => item?.resolved !== true) : Boolean(conflictValues),
      direction: clean(snapshot.direction || snapshot.construction?.direction, 80) || null,
      workingMethod: clean(snapshot.workingMethod || snapshot.method || snapshot.construction?.workingMethod, 80) || null,
      foundationType: clean(snapshot.foundationType || snapshot.foundation?.type, 80) || null,
      mainPattern: clean(snapshot.mainPattern || snapshot.pattern?.name || snapshot.fabric?.pattern, 180) || null,
      repeat: snapshot.repeat || snapshot.pattern?.repeat || null,
      edgeStitches: snapshot.edgeStitches ?? snapshot.edges?.stitches ?? null,
      construction: snapshot.construction || null,
      shaping: Array.isArray(snapshot.shaping) ? clone(snapshot.shaping) : [],
      joining: snapshot.joining || null,
      finishing: snapshot.finishing || null,
      raw: confirmed ? clone(snapshot) : null,
    });
  }

  function selectCurrentCalculation(input = {}) {
    const projectIdentity = validateProjectIdentity(input.projectIdentity);
    const records = Array.isArray(input.calculations) ? input.calculations : [];
    const candidates = records.filter((entry) => entry?.request?.project_calculation_entry?.kind === "PROJECT_CALCULATION_ENTRY");
    const active = candidates.find((entry) => entry.calculation_id === input.activeCalculationIdentity) || candidates.at(-1) || null;
    if (!active) fail("CALCULATION_MISSING", "Сначала подтвердите начальный расчёт.");
    if (active.project_id !== projectIdentity) fail("CALCULATION_PROJECT_MISMATCH", "Расчёт относится к другому проекту.");
    const snapshot = active.result?.snapshot;
    if (!record(snapshot) || snapshot.lifecycle !== "completed") fail("CALCULATION_NOT_COMPLETED", "Начальный расчёт ещё не подтверждён.");
    if (snapshot.projectIdentity !== projectIdentity) fail("CALCULATION_PROJECT_MISMATCH", "Расчёт относится к другому проекту.");
    if (!clean(snapshot.fingerprint, 180) || active.request?.project_calculation_entry?.fingerprint !== snapshot.fingerprint) fail("CALCULATION_FINGERPRINT_MISMATCH", "Целостность начального расчёта нарушена.");
    if (!Number.isInteger(snapshot.finalStitchCount) || snapshot.finalStitchCount <= 0) fail("CALCULATION_RESULT_INVALID", "Начальное число петель недоступно.");
    if (!clean(snapshot.calculationTarget?.semanticRole || snapshot.workingWidth?.semanticRole, 100)) fail("CALCULATION_SEMANTIC_ROLE_MISSING", "Неясно, к какой части изделия относится расчёт.");
    if (input.activeCalculationIdentity && active.calculation_id !== input.activeCalculationIdentity) fail("CALCULATION_STALE", "Начальный расчёт устарел.");
    return deepFreeze({ record: clone(active), snapshot: clone(snapshot) });
  }

  function sourceFailure(error, projectIdentity = "") {
    return deepFreeze({ valid: false, projectIdentity, blockingErrors: [issue(error.code || "SOURCE_CHAIN_INVALID", error.userMessage || "Исходные данные плана недоступны.")], warnings: [], assumptions: [], steps: [], dependencies: [], readiness: "blocked", requiredAcknowledgementCodes: [], sourceIdentities: {}, sourceFingerprints: {}, contexts: {}, fingerprint: null, canComplete: false });
  }
  function validateSourceChain(input = {}) {
    try {
      const projectIdentity = validateProjectIdentity(input.projectIdentity);
      if (!record(input.project) || input.project.project_id !== projectIdentity) fail("PROJECT_MISSING", "Проект не найден.");
      const closure = input.closure;
      if (!record(closure) || closure.lifecycle !== "completed") fail("CONFIRMED_DETAILS_MISSING", "Подтверждённые сведения проекта недоступны.");
      if ((closure.projectIdentity || closure.projectId || closure.snapshot?.project?.identity) !== projectIdentity) fail("CONFIRMED_DETAILS_PROJECT_MISMATCH", "Подтверждённые сведения относятся к другому проекту.");
      if (input.closureCurrent === false) fail("CONFIRMED_DETAILS_STALE", "Подтверждённые сведения проекта устарели.");
      const initialization = input.initialization;
      if (!record(initialization) || initialization.lifecycle !== "initialized") fail("INITIALIZATION_MISSING", "Основа проекта не создана.");
      if (initialization.project_identity !== projectIdentity || initialization.snapshot?.project?.identity !== projectIdentity) fail("INITIALIZATION_PROJECT_MISMATCH", "Основа относится к другому проекту.");
      if (initialization.source_closure_identity !== (closure.closureId || closure.identity)) fail("INITIALIZATION_STALE", "Основа проекта построена по другой проверке сведений.");
      if (initialization.source_closure_fingerprint !== (closure.recordFingerprint || closure.fingerprint)) fail("INITIALIZATION_STALE", "Основа проекта построена по устаревшей проверке сведений.");
      if (input.initializationCurrent === false || initialization.integrity?.importedUnproven || initialization.integrity?.collision || initialization.integrity?.quarantined) fail("INITIALIZATION_INVALID", "Основа проекта не прошла проверку.");
      const gauge = input.gauge;
      if (!record(gauge) || gauge.lifecycle !== "confirmed") fail("GAUGE_MISSING", "Подтверждённая плотность отсутствует.");
      if (gauge.projectIdentity !== projectIdentity) fail("GAUGE_PROJECT_MISMATCH", "Плотность относится к другому проекту.");
      if (gauge.sourceInitializationIdentity !== initialization.identity) fail("GAUGE_STALE", "Плотность построена по другой основе проекта.");
      const initFingerprint = initialization.integrity?.recordFingerprint || initialization.snapshot_fingerprint;
      if (gauge.sourceInitializationFingerprint !== initFingerprint || input.gaugeCurrent === false) fail("GAUGE_STALE", "Подтверждённая плотность устарела.");
      if (!clean(gauge.fingerprint, 180)) fail("GAUGE_FINGERPRINT_MISMATCH", "Целостность плотности нарушена.");
      const calculation = input.calculation || selectCurrentCalculation({ projectIdentity, calculations: input.calculations, activeCalculationIdentity: input.project.active_calculation_id });
      const calculationRecord = calculation.record || calculation;
      const calculationSnapshot = calculation.snapshot || calculationRecord.result?.snapshot;
      if (!record(calculationSnapshot) || calculationSnapshot.lifecycle !== "completed") fail("CALCULATION_NOT_COMPLETED", "Начальный расчёт ещё не подтверждён.");
      if (calculationRecord.project_id !== projectIdentity || calculationSnapshot.projectIdentity !== projectIdentity) fail("CALCULATION_PROJECT_MISMATCH", "Расчёт относится к другому проекту.");
      if (calculationRecord.calculation_id !== input.project.active_calculation_id) fail("CALCULATION_STALE", "Начальный расчёт устарел.");
      if (calculationRecord.request?.project_calculation_entry?.fingerprint !== calculationSnapshot.fingerprint) fail("CALCULATION_FINGERPRINT_MISMATCH", "Целостность начального расчёта нарушена.");
      if (calculationSnapshot.sourceIdentities?.initialization !== initialization.identity || calculationSnapshot.sourceFingerprints?.initialization !== initFingerprint || calculationSnapshot.sourceIdentities?.gaugeRevision !== gauge.identity || calculationSnapshot.sourceFingerprints?.gauge !== gauge.fingerprint) fail("CALCULATION_STALE", "Начальный расчёт построен по устаревшим исходным данным.");
      if (calculationSnapshot.sourceIdentities?.projectDetailsClosure !== (closure.closureId || closure.identity) || calculationSnapshot.sourceFingerprints?.projectDetails !== (closure.recordFingerprint || closure.fingerprint)) fail("CALCULATION_STALE", "Начальный расчёт построен по другой проверке сведений.");
      if (!Number.isInteger(calculationSnapshot.finalStitchCount) || calculationSnapshot.finalStitchCount <= 0) fail("CALCULATION_RESULT_INVALID", "Начальное число петель недоступно.");
      return deepFreeze({ valid: true, projectIdentity, project: clone(input.project), closure: clone(closure), initialization: clone(initialization), gauge: clone(gauge), calculation: { record: clone(calculationRecord), snapshot: clone(calculationSnapshot) } });
    } catch (error) { return sourceFailure(error, clean(input.projectIdentity, 180)); }
  }

  function step(input) {
    const value = {
      identity: clean(input.identity, 180), sequenceNumber: input.sequenceNumber, type: input.type,
      title: clean(input.title, 180), purpose: clean(input.purpose, 500), status: input.status,
      source: clone(input.source || {}), confidence: input.confidence,
      requiredInputs: clone(input.requiredInputs || []), expectedOutput: clone(input.expectedOutput || {}),
      validationCheckpoint: clone(input.validationCheckpoint || {}), dependencies: clone(input.dependencies || []),
      warnings: clone(input.warnings || []), assumptions: clone(input.assumptions || []), provenance: clone(input.provenance || []),
    };
    validateStep(value);
    return value;
  }
  function buildStepCandidates(chain, technologySource, boundedSource = {}) {
    if (!chain?.valid) return [];
    const technology = normalizeTechnology(technologySource);
    const bounded = normalizeBoundedInputs(boundedSource);
    const calculation = chain.calculation.snapshot;
    const projectIdentity = chain.projectIdentity;
    const steps = [];
    const add = (type, status, title, purpose, expectedOutput, extra = {}) => steps.push(step({
      identity: `${projectIdentity}:plan-step:${type.toLowerCase()}:${steps.length + 1}`,
      sequenceNumber: steps.length + 1, type, title, purpose, status,
      source: extra.source || { stage: "PROJECT_CALCULATION_ENTRY", identity: chain.calculation.record.calculation_id },
      confidence: status === "confirmed" ? "high" : "limited", requiredInputs: extra.requiredInputs || [], expectedOutput,
      validationCheckpoint: extra.validationCheckpoint || { type: "user_verification", description: "Проверить результат перед следующим этапом." },
      dependencies: extra.dependencies || (steps.length ? [steps.at(-1).identity] : []), warnings: extra.warnings || [], assumptions: extra.assumptions || [],
      provenance: extra.provenance || [{ sourceStage: "PROJECT_CALCULATION_ENTRY", sourceIdentity: chain.calculation.record.calculation_id }],
    }));
    add("CAST_ON", "confirmed", `Набрать ${calculation.finalStitchCount} петель`, "Создать подтверждённый начальный набор для рассчитанной рабочей ширины.", { stitchCount: calculation.finalStitchCount, semanticRole: calculation.calculationTarget?.semanticRole || calculation.workingWidth?.semanticRole }, { validationCheckpoint: { type: "count_stitches", description: `Проверить, что набрано ${calculation.finalStitchCount} петель.` } });
    const foundationKnown = technology.confirmed && technology.foundationType || bounded.confirmed && bounded.foundationType !== "unknown";
    add("FOUNDATION_SECTION", foundationKnown ? "confirmed" : "conditional", foundationKnown ? "Выполнить подтверждённый начальный участок" : "Уточнить и выполнить начальный участок", foundationKnown ? "Связать начальный участок по подтверждённой технологии." : "Перед выполнением выбрать вид и высоту начального участка.", { foundationType: technology.foundationType || bounded.foundationType || null }, { source: foundationKnown ? { stage: technology.confirmed ? "CONFIRMED_TECHNOLOGY" : KIND, identity: technology.identity || projectIdentity } : { stage: KIND, identity: "assumption:foundation-unknown" }, requiredInputs: foundationKnown ? [] : ["foundation_type", "foundation_height"], assumptions: foundationKnown ? [] : ["FOUNDATION_DETAILS_UNKNOWN"] });
    const fabricKnown = technology.confirmed && technology.mainPattern;
    add("PRIMARY_FABRIC", fabricKnown ? "confirmed" : "conditional", fabricKnown ? `Продолжить основное полотно: ${technology.mainPattern}` : "Уточнить и продолжить основное полотно", fabricKnown ? "Вязать подтверждённым узором до следующей контрольной точки." : "До выполнения подтвердить узор, раппорт и требуемую высоту.", { pattern: technology.mainPattern, repeat: technology.repeat }, { source: fabricKnown ? { stage: "CONFIRMED_TECHNOLOGY", identity: technology.identity } : { stage: KIND, identity: "assumption:main-fabric-unknown" }, requiredInputs: fabricKnown ? [] : ["main_pattern", "pattern_repeat", "section_height"], assumptions: fabricKnown ? [] : ["PRIMARY_FABRIC_DETAILS_UNKNOWN"] });
    if (technology.confirmed && technology.construction && technology.shaping.length) add("SHAPING", "confirmed", "Выполнить подтверждённое формирование", "Сформировать изделие только по сохранённой технологии.", { operations: technology.shaping }, { source: { stage: "CONFIRMED_TECHNOLOGY", identity: technology.identity } });
    if (technology.confirmed && technology.joining) add("JOINING", "confirmed", "Соединить детали", "Соединить детали подтверждённым способом.", { joining: technology.joining }, { source: { stage: "CONFIRMED_TECHNOLOGY", identity: technology.identity } });
    if (technology.confirmed && technology.finishing) add("FINISHING", "confirmed", "Выполнить отделку", "Выполнить подтверждённую отделку изделия.", { finishing: technology.finishing }, { source: { stage: "CONFIRMED_TECHNOLOGY", identity: technology.identity } });
    return deepFreeze(steps);
  }

  function semanticInput(value) {
    return {
      projectIdentity: value.projectIdentity, sourceIdentities: value.sourceIdentities,
      sourceFingerprints: value.sourceFingerprints, boundedInputs: value.planScope.boundedInputs,
      stepTypes: value.steps.map((item) => item.type),
      stepParameters: value.steps.map((item) => ({ type: item.type, status: item.status, expectedOutput: item.expectedOutput, requiredInputs: item.requiredInputs })),
      dependencies: value.dependencies, warningCodes: value.warnings.map((item) => item.code).sort(),
      assumptionCodes: value.assumptions.map((item) => item.code).sort(), planScopeVersion: value.planScope.version,
    };
  }
  function assessPlan(input = {}) {
    const chain = input.sourceChain?.valid !== undefined ? input.sourceChain : validateSourceChain(input);
    if (!chain.valid) return chain;
    try {
      const boundedInputs = normalizeBoundedInputs(input.boundedInputs);
      const technology = normalizeTechnology(input.technology);
      const blockingErrors = [];
      if (technology.confirmed && technology.conflict) blockingErrors.push(issue("TECHNOLOGY_CONFLICT", "Подтверждённая технология содержит нерешённый конфликт."));
      const steps = buildStepCandidates(chain, technology, boundedInputs);
      if (!steps.some((item) => item.status === "confirmed")) blockingErrors.push(issue("ACTIONABLE_STEP_MISSING", "Невозможно определить ни одного достоверного шага."));
      const warnings = [];
      const assumptions = [];
      if (!technology.confirmed || !technology.repeat) warnings.push(issue("UNKNOWN_PATTERN_REPEAT", "Раппорт основного узора пока не подтверждён.", { requiresAcknowledgement: true }));
      if (!technology.confirmed || technology.edgeStitches === null) warnings.push(issue("UNKNOWN_EDGE_STITCHES", "Кромочные петли пока не подтверждены.", { requiresAcknowledgement: true }));
      if (!technology.confirmed || !technology.construction) warnings.push(issue("CONSTRUCTION_UNKNOWN", "Конструкция изделия не подтверждена; этапы формирования, рукавов и горловины не включены.", { requiresAcknowledgement: true }));
      steps.filter((item) => item.status === "conditional").forEach((item) => assumptions.push(issue(`CONDITIONAL_${item.type}`, `${item.title}: детали будут подтверждены до выполнения.`)));
      const requiredAcknowledgementCodes = normalizeCodes(warnings.filter((item) => item.requiresAcknowledgement).map((item) => item.code));
      const acknowledged = normalizeCodes(input.acknowledgedWarningCodes);
      if (acknowledged.some((code) => !requiredAcknowledgementCodes.includes(code))) fail("ACKNOWLEDGEMENT_INVALID", "Подтверждения предупреждений устарели.");
      const readiness = blockingErrors.length ? "blocked" : steps.some((item) => item.status === "conditional") || warnings.length ? "conditionally-ready" : "ready";
      const sourceIdentities = {
        project: chain.projectIdentity, closure: chain.closure.closureId || chain.closure.identity,
        initialization: chain.initialization.identity, gauge: chain.gauge.identity,
        calculation: chain.calculation.record.calculation_id, technology: technology.confirmed ? technology.identity : null,
        materials: normalizeCodes(input.materials?.filter((item) => item?.confirmed).map((item) => item.identity || item.id)),
      };
      const sourceFingerprints = {
        closure: chain.closure.recordFingerprint || chain.closure.fingerprint,
        initialization: chain.initialization.integrity?.recordFingerprint || chain.initialization.snapshot_fingerprint,
        gauge: chain.gauge.fingerprint, calculation: chain.calculation.snapshot.fingerprint,
        technology: technology.confirmed ? technology.fingerprint : null,
        materials: normalizeCodes(input.materials?.filter((item) => item?.confirmed).map((item) => item.fingerprint)),
      };
      const dependencies = steps.flatMap((item) => item.dependencies.map((dependencyIdentity) => ({ stepIdentity: item.identity, dependsOn: dependencyIdentity })));
      const contexts = {
        projectContext: { title: clean(chain.project.title, 180) || "Проект" }, garmentContext: clone(chain.initialization.snapshot?.garment || {}),
        sizingContext: clone(chain.initialization.snapshot?.measurements || {}), recipientContext: { recipient: chain.initialization.snapshot?.garment?.recipient || null },
        gaugeContext: { stitchesPer10Cm: chain.gauge.snapshot?.computed?.stitchesPer10Cm, rowsPer10Cm: chain.gauge.snapshot?.computed?.rowsPer10Cm, identity: chain.gauge.identity },
        calculationContext: { identity: chain.calculation.record.calculation_id, workingWidthCm: chain.calculation.snapshot.workingWidth?.canonicalValueCm, finalStitchCount: chain.calculation.snapshot.finalStitchCount, semanticRole: chain.calculation.snapshot.calculationTarget?.semanticRole || chain.calculation.snapshot.workingWidth?.semanticRole },
        technologyContext: technology.confirmed ? { identity: technology.identity, direction: technology.direction, workingMethod: technology.workingMethod, foundationType: technology.foundationType, mainPattern: technology.mainPattern, repeat: clone(technology.repeat), edgeStitches: clone(technology.edgeStitches), constructionKnown: Boolean(technology.construction) } : { identity: null, confirmed: false },
        materialContext: (Array.isArray(input.materials) ? input.materials : []).filter((item) => item?.confirmed).map((item) => ({ identity: item.identity || item.id, label: clean(item.label || item.name, 180), fingerprint: item.fingerprint || null })),
      };
      const planScope = { version: 1, partial: readiness !== "ready", boundedInputs: clone(boundedInputs), omittedStepTypes: STEP_TYPES.filter((type) => !steps.some((item) => item.type === type)) };
      const semanticFingerprint = fingerprint({ projectIdentity: chain.projectIdentity, sourceIdentities, sourceFingerprints, boundedInputs: planScope.boundedInputs, stepTypes: steps.map((item) => item.type), stepParameters: steps.map((item) => ({ type: item.type, status: item.status, expectedOutput: item.expectedOutput, requiredInputs: item.requiredInputs })), dependencies, warningCodes: warnings.map((item) => item.code).sort(), assumptionCodes: assumptions.map((item) => item.code).sort(), planScopeVersion: planScope.version });
      const canComplete = readiness !== "blocked" && boundedInputs.confirmed && requiredAcknowledgementCodes.every((code) => acknowledged.includes(code)) && steps.some((item) => item.status === "confirmed");
      return deepFreeze({ valid: true, projectIdentity: chain.projectIdentity, chain, technology, boundedInputs, blockingErrors, warnings, assumptions, steps, dependencies, readiness, requiredAcknowledgementCodes, acknowledgedWarningCodes: acknowledged, sourceIdentities, sourceFingerprints, contexts, planScope, fingerprint: semanticFingerprint, canComplete });
    } catch (error) { return sourceFailure(error, chain.projectIdentity); }
  }

  function buildSnapshot(input = {}, metadata = {}) {
    const assessment = input.assessment || assessPlan(input);
    if (!assessment.valid || assessment.readiness === "blocked") fail(assessment.blockingErrors?.[0]?.code || "PLAN_BLOCKED", assessment.blockingErrors?.[0]?.message || "План заблокирован.");
    const createdAt = clean(metadata.createdAt, 40);
    if (!createdAt) fail("TIMESTAMP_MISSING", "Не указано время создания плана.");
    const value = {
      format: FORMAT, version: VERSION, identity: clean(metadata.identity, 180) || `${assessment.projectIdentity}:execution-plan:${assessment.fingerprint}`,
      projectIdentity: assessment.projectIdentity, lifecycle: "draft", createdAt, updatedAt: createdAt, completedAt: null,
      sourceIdentities: clone(assessment.sourceIdentities), sourceFingerprints: clone(assessment.sourceFingerprints),
      projectContext: clone(assessment.contexts.projectContext), garmentContext: clone(assessment.contexts.garmentContext), sizingContext: clone(assessment.contexts.sizingContext), recipientContext: clone(assessment.contexts.recipientContext),
      gaugeContext: clone(assessment.contexts.gaugeContext), calculationContext: clone(assessment.contexts.calculationContext), technologyContext: clone(assessment.contexts.technologyContext), materialContext: clone(assessment.contexts.materialContext),
      planScope: clone(assessment.planScope), steps: clone(assessment.steps), dependencies: clone(assessment.dependencies),
      validation: { requiredAcknowledgementCodes: clone(assessment.requiredAcknowledgementCodes), acknowledgedWarningCodes: clone(assessment.acknowledgedWarningCodes), boundedInputsConfirmed: assessment.boundedInputs.confirmed, stale: false },
      blockingErrors: clone(assessment.blockingErrors), warnings: clone(assessment.warnings), assumptions: clone(assessment.assumptions),
      provenance: [{ stage: KIND, action: "built_from_confirmed_sources" }], readiness: assessment.readiness,
      audit: { explicitConfirmation: false, sourceChecked: true }, fingerprint: "",
    };
    value.fingerprint = fingerprint(semanticInput(value));
    if (value.fingerprint !== assessment.fingerprint) fail("FINGERPRINT_MISMATCH", "План изменился во время построения.");
    return validateSnapshot(value);
  }
  function validateStep(value) {
    exactKeys(value, STEP_KEYS, "STEP_NOT_ALLOWLISTED");
    if (!clean(value.identity, 180) || !Number.isInteger(value.sequenceNumber) || value.sequenceNumber < 1 || !STEP_TYPES.includes(value.type) || !STEP_STATUSES.includes(value.status) || !clean(value.title, 180) || !clean(value.purpose, 500) || !["high", "limited"].includes(value.confidence)) fail("STEP_INVALID", "Шаг плана повреждён.");
    for (const key of ["requiredInputs", "dependencies", "warnings", "assumptions", "provenance"]) if (!Array.isArray(value[key])) fail("STEP_INVALID", "Шаг плана повреждён.");
    if (!record(value.source) || !record(value.expectedOutput) || !record(value.validationCheckpoint)) fail("STEP_INVALID", "Шаг плана повреждён.");
    return value;
  }
  function validateSnapshot(source) {
    exactKeys(source, SNAPSHOT_KEYS, "SNAPSHOT_NOT_ALLOWLISTED");
    const value = clone(source);
    validateProjectIdentity(value.projectIdentity);
    if (value.format !== FORMAT || value.version !== VERSION || !clean(value.identity, 180) || !LIFECYCLES.includes(value.lifecycle) || !READINESS.includes(value.readiness) || !clean(value.createdAt, 40) || !clean(value.updatedAt, 40) || !Array.isArray(value.steps) || !Array.isArray(value.dependencies) || !Array.isArray(value.blockingErrors) || !Array.isArray(value.warnings) || !Array.isArray(value.assumptions) || !Array.isArray(value.provenance) || !record(value.validation) || !record(value.audit)) fail("SNAPSHOT_INVALID", "Сохранённый план повреждён.");
    value.steps.forEach(validateStep);
    const identities = value.steps.map((item) => item.identity);
    const sequences = value.steps.map((item) => item.sequenceNumber);
    if (new Set(identities).size !== identities.length) fail("DUPLICATE_STEP_IDENTITY", "План содержит повторяющиеся шаги.");
    if (new Set(sequences).size !== sequences.length || sequences.some((number, index) => number !== index + 1)) fail("STEP_SEQUENCE_INVALID", "Последовательность шагов повреждена.");
    value.steps.forEach((item) => item.dependencies.forEach((identity) => { if (!identities.includes(identity)) fail("STEP_DEPENDENCY_MISSING", "Шаг ссылается на отсутствующую зависимость."); }));
    if (canonicalize(value.dependencies) !== canonicalize(value.steps.flatMap((item) => item.dependencies.map((dependsOn) => ({ stepIdentity: item.identity, dependsOn }))))) fail("DEPENDENCY_GRAPH_INVALID", "Граф зависимостей повреждён.");
    const required = normalizeCodes(value.validation.requiredAcknowledgementCodes);
    const acknowledged = normalizeCodes(value.validation.acknowledgedWarningCodes);
    if (acknowledged.some((code) => !required.includes(code))) fail("ACKNOWLEDGEMENT_INVALID", "Подтверждения предупреждений повреждены.");
    if (value.fingerprint !== fingerprint(semanticInput(value))) fail("FINGERPRINT_MISMATCH", "Fingerprint плана не совпадает с его содержимым.");
    if (value.lifecycle === "completed" && (!value.completedAt || value.audit.explicitConfirmation !== true || value.readiness === "blocked" || value.validation.stale || required.some((code) => !acknowledged.includes(code)) || value.validation.boundedInputsConfirmed !== true)) fail("COMPLETED_SNAPSHOT_INVALID", "Завершённый план не прошёл проверку.");
    if (!jsonSafe(value)) fail("JSON_UNSAFE", "План нельзя безопасно сохранить.");
    return deepFreeze(value);
  }
  function transitionLifecycle(source, target, metadata = {}) {
    const checked = validateSnapshot(source);
    if (checked.lifecycle === "completed") fail("COMPLETED_SNAPSHOT_IMMUTABLE", "Подтверждённый план нельзя изменить.");
    const nextLifecycle = { draft: "reviewing", reviewing: "ready", ready: "completed" }[checked.lifecycle];
    if (nextLifecycle !== target) fail("LIFECYCLE_TRANSITION_INVALID", "Такой переход плана запрещён.");
    const next = clone(checked); next.lifecycle = target; next.updatedAt = clean(metadata.timestamp, 40) || next.updatedAt;
    if (target === "completed") {
      if (next.readiness === "blocked" || next.validation.stale === true) fail("PLAN_NOT_COMPLETABLE", "Заблокированный или устаревший план нельзя подтвердить.");
      if (!next.steps.some((item) => item.status === "confirmed")) fail("ACTIONABLE_STEP_MISSING", "В плане нет подтверждённого шага.");
      if (next.validation.requiredAcknowledgementCodes.some((code) => !next.validation.acknowledgedWarningCodes.includes(code))) fail("ACKNOWLEDGEMENT_REQUIRED", "Подтвердите обязательные предупреждения.");
      if (!next.validation.boundedInputsConfirmed) fail("BOUNDED_INPUT_CONFIRMATION_REQUIRED", "Подтвердите ограниченные параметры плана.");
      next.completedAt = clean(metadata.timestamp, 40); if (!next.completedAt) fail("TIMESTAMP_MISSING", "Не указано время подтверждения плана."); next.audit.explicitConfirmation = true;
    }
    return validateSnapshot(next);
  }
  function startReviewing(source, metadata) { return transitionLifecycle(source, "reviewing", metadata); }
  function markReady(source, metadata) { return transitionLifecycle(source, "ready", metadata); }
  function complete(source, metadata) { return transitionLifecycle(source, "completed", metadata); }
  function staleStatus(snapshotSource, assessment) {
    try {
      const snapshot = validateSnapshot(snapshotSource);
      if (snapshot.lifecycle !== "completed") return deepFreeze({ stale: true, current: false, reasons: [issue("PLAN_NOT_COMPLETED", "План ещё не подтверждён.")] });
      if (!assessment?.valid || assessment.readiness === "blocked" || !assessment.fingerprint) return deepFreeze({ stale: true, current: false, reasons: clone(assessment?.blockingErrors || [issue("SOURCE_CHAIN_INVALID", "Исходные данные недоступны.")]) });
      if (snapshot.fingerprint !== assessment.fingerprint) return deepFreeze({ stale: true, current: false, reasons: [issue("PLAN_STALE", "Подтверждённые исходные данные плана изменились.")] });
      return deepFreeze({ stale: false, current: true, reasons: [] });
    } catch (error) { return deepFreeze({ stale: true, current: false, reasons: [issue(error.code || "SNAPSHOT_INVALID", error.userMessage || "План повреждён.")] }); }
  }
  function buildDraft(input = {}) {
    const projectIdentity = validateProjectIdentity(input.projectIdentity);
    const value = { format: `${FORMAT}-draft`, version: VERSION, projectIdentity, boundedInputs: clone(normalizeBoundedInputs(input.boundedInputs)), acknowledgedWarningCodes: normalizeCodes(input.acknowledgedWarningCodes), sourceFingerprint: clean(input.sourceFingerprint, 180), updatedAt: clean(input.updatedAt, 40) };
    if (!value.sourceFingerprint || !value.updatedAt) fail("DRAFT_INVALID", "Черновик плана повреждён.");
    return deepFreeze(value);
  }
  function validateDraft(source, options = {}) {
    if (!record(source) || source.format !== `${FORMAT}-draft` || source.version !== VERSION || source.projectIdentity !== options.projectIdentity || !record(source.boundedInputs) || !Array.isArray(source.acknowledgedWarningCodes)) fail("DRAFT_INVALID", "Черновик плана повреждён.");
    return buildDraft(source);
  }
  function createProgressState(input = {}) {
    const projectIdentity = validateProjectIdentity(input.projectIdentity);
    return deepFreeze({ kind: KIND, version: VERSION, projectId: projectIdentity, calculationId: clean(input.calculationId, 180), draft: input.draft ? clone(validateDraft(input.draft, { projectIdentity })) : null, currentRevisionIdentity: null, history: [], updatedAt: clean(input.updatedAt, 40) });
  }
  function validateProgressState(source, options = {}) {
    if (!record(source) || source.kind !== KIND || source.version !== VERSION || source.projectId !== options.projectIdentity || source.calculationId !== options.calculationId || !Array.isArray(source.history)) fail("PROGRESS_STATE_INVALID", "Состояние плана повреждено.");
    const identities = new Set(); const fingerprints = new Set();
    const history = source.history.map((entry) => { const value = validateSnapshot(entry); if (value.projectIdentity !== source.projectId || value.lifecycle !== "completed" || identities.has(value.identity) || fingerprints.has(value.fingerprint)) fail("PLAN_HISTORY_INVALID", "История плана повреждена."); identities.add(value.identity); fingerprints.add(value.fingerprint); return clone(value); });
    if ((history.at(-1)?.identity || null) !== source.currentRevisionIdentity) fail("PLAN_HISTORY_CURRENT_MISMATCH", "Текущая revision не согласована с историей.");
    const draft = source.draft ? validateDraft(source.draft, { projectIdentity: source.projectId }) : null;
    return deepFreeze({ kind: KIND, version: VERSION, projectId: source.projectId, calculationId: source.calculationId, draft: clone(draft), currentRevisionIdentity: source.currentRevisionIdentity, history, updatedAt: clean(source.updatedAt, 40) });
  }
  function appendCompleted(stateSource, snapshotSource, metadata = {}) {
    const snapshot = validateSnapshot(snapshotSource); if (snapshot.lifecycle !== "completed") fail("PLAN_NOT_COMPLETED", "В историю можно добавить только подтверждённый план.");
    const state = validateProgressState(stateSource, { projectIdentity: snapshot.projectIdentity, calculationId: metadata.calculationId || stateSource.calculationId });
    const duplicate = state.history.find((entry) => entry.fingerprint === snapshot.fingerprint); if (duplicate) return state;
    const history = [...state.history.map(clone), clone(snapshot)];
    return validateProgressState({ ...clone(state), draft: null, currentRevisionIdentity: snapshot.identity, history, updatedAt: clean(metadata.updatedAt, 40) || snapshot.updatedAt }, { projectIdentity: state.projectId, calculationId: state.calculationId });
  }
  function safeDestination(value, projectIdentity) {
    try {
      const url = new URL(value, "http://localhost");
      const allowed = new Set(["/project-execution-plan", "/project-execution-start", "/user-workspace-entry", "/project-calculation-entry", "/swatch-assistant"]);
      const valid = url.origin === "http://localhost" && allowed.has(url.pathname) && url.searchParams.get("project") === projectIdentity && !url.username && !url.password;
      return deepFreeze({ valid, href: valid ? `${url.pathname}?project=${encodeURIComponent(projectIdentity)}${url.hash || ""}` : "" });
    } catch { return deepFreeze({ valid: false, href: "" }); }
  }

  const api = Object.freeze({
    FORMAT, VERSION, KIND, PROGRESS_KIND, DRAFT_KEY, LIFECYCLES, READINESS, STEP_TYPES,
    STEP_STATUSES, BOUNDED_INPUTS, SNAPSHOT_KEYS, STEP_KEYS, ProjectExecutionPlanError,
    canonicalize, fingerprint, jsonSafe, validateProjectIdentity, normalizeCodes,
    normalizeBoundedInputs, normalizeTechnology, selectCurrentCalculation, validateSourceChain,
    buildStepCandidates, assessPlan, buildSnapshot, validateStep, validateSnapshot,
    transitionLifecycle, startReviewing, markReady, complete, staleStatus, buildDraft,
    validateDraft, createProgressState, validateProgressState, appendCompleted, safeDestination,
  });
  globalObject.YarnAIProjectExecutionPlan = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
