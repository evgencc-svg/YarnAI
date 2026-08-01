"use strict";

(function exposePatternTechnologyDraft(globalObject) {
  const VERSION = 1;
  const RESULT_SCHEMA_VERSION = 1;
  const ALGORITHM_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_TECHNOLOGY_DRAFT";
  const STATUSES = Object.freeze(["waiting", "building", "needs_attention", "ready", "failed"]);
  const OPERATION_TYPES = Object.freeze([
    "cast_on", "knit", "purl", "work_pattern", "repeat", "increase", "decrease",
    "bind_off", "hold_stitches", "pick_up_stitches", "join", "seam", "finish", "unknown",
  ]);
  const ISSUE_LEVELS = Object.freeze(["critical", "non_critical", "informational"]);
  const VALID_UNITS = Object.freeze([
    null, "", "cm", "mm", "in", "inch", "inches", "stitches", "rows", "rounds",
    "repeats", "g", "kg", "m", "yd", "oz", "number", "size", "%",
  ]);
  const AUDIT_LIMIT = 24;
  const activeOperations = new Set();

  class PatternTechnologyDraftError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternTechnologyDraftError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    }
    if (typeof value === "number" && !Number.isFinite(value)) throw draftError("INVALID_NUMERIC_VALUE", "Обнаружено недопустимое числовое значение.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
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

  function createInitialState(projectId, review, now = timestampNow()) {
    assertConfirmedReview(review, projectId);
    if (!isTimestamp(now)) throw draftError("INVALID_DRAFT_SCHEMA", "Дата создания черновика повреждена.");
    const immutableSourceSnapshot = deepFreeze(copy(review.confirmedSnapshot));
    const sourceConfirmedFingerprint = fingerprint(immutableSourceSnapshot);
    return {
      id: makeId(), projectId, kind: PROGRESS_KIND, version: VERSION,
      algorithmVersion: ALGORITHM_VERSION, revision: 1, status: "waiting",
      sourceReviewId: review.id,
      sourceReviewRevision: review.revision,
      sourceConfirmedRevision: review.revision,
      sourceConfirmedFingerprint,
      sourceSemanticAnalysisId: immutableSourceSnapshot.sourceSemanticAnalysisId,
      sourceSemanticAnalysisRevision: immutableSourceSnapshot.sourceSemanticAnalysisRevision,
      sourceImportRevision: immutableSourceSnapshot.sourceImportRevision ?? null,
      sourceProjectId: immutableSourceSnapshot.projectId,
      immutableSourceSnapshot,
      immutableSourceFingerprint: sourceConfirmedFingerprint,
      draftResult: null,
      draftFingerprint: null,
      criticalIssuesFingerprint: fingerprint([]),
      validation: emptyValidation(now, 1),
      audit: [], operation: null, lastError: null,
      createdAt: now, updatedAt: now, builtAt: null, failedAt: null, interruptedAt: null,
    };
  }

  function buildDraftFromConfirmedSnapshot(confirmedSnapshot) {
    assertConfirmedSnapshot(confirmedSnapshot);
    const sourceValues = stableSourceValues(confirmedSnapshot.values);
    const provenance = sourceValues.map((item) => createProvenance(item, confirmedSnapshot));
    const provenanceByItem = new Map(provenance.map((entry) => [entry.sourceReviewedItemId, entry]));
    const result = {
      schemaVersion: RESULT_SCHEMA_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
      projectSummary: {
        id: stableId("summary", { projectId: confirmedSnapshot.projectId }),
        projectId: confirmedSnapshot.projectId,
        sourceReviewItemIds: sourceValues.map((item) => item.itemId),
      },
      craft: null, product: null, construction: [], sizes: [], materials: [], yarn: [], tools: [], gauge: [],
      components: [], sections: [], operations: [], rowInstructions: [], repeats: [], stitchCountChanges: [],
      finishing: [], abbreviations: [], assumptions: [], missingInformation: [], conflicts: [], warnings: [],
      provenance,
      generationSummary: {
        sourceValueCount: sourceValues.length,
        includedValueCount: 0,
        operationCount: 0,
        componentCount: 0,
        sectionCount: 0,
        criticalIssueCount: 0,
        nonCriticalIssueCount: 0,
      },
    };

    const sectionItems = sourceValues.filter((item) => item.category === "sections");
    for (const item of sourceValues) {
      const provenanceRefs = [provenanceByItem.get(item.itemId).id];
      const base = { id: entityId(item.category, item), value: copy(item.value), unit: item.unit ?? unitOf(item.value), provenanceRefs };
      if (item.category === "craft") result.craft = { ...base, type: scalar(item.value) };
      else if (item.category === "product") result.product = { ...base, type: scalar(item.value) };
      else if (item.category === "construction") result.construction.push({ ...base, property: item.subtype });
      else if (item.category === "sizes") result.sizes.push({ ...base, type: item.subtype, selected: explicitlySelected(item.value) });
      else if (item.category === "gauge") result.gauge.push({ ...base, type: item.subtype, normalized: normalizeGauge(item.value, item.unit) });
      else if (item.category === "yarn") {
        const yarn = { ...base, type: item.subtype };
        result.yarn.push(yarn);
        result.materials.push({ ...yarn, id: entityId("material", item), materialType: "yarn" });
      } else if (item.category === "tools") result.tools.push({ ...base, type: item.subtype });
      else if (item.category === "abbreviations") result.abbreviations.push(normalizeAbbreviation(base, item.value));
      else if (item.category === "sections") result.sections.push(normalizeSection(base, item));
      else if (item.category === "rows") result.rowInstructions.push(normalizeRow(base, item));
      else if (item.category === "repeats") result.repeats.push(normalizeRepeat(base, item));
    }

    buildComponents(result, sectionItems);
    ensureUnassignedSection(result);
    buildOperations(result, sourceValues, provenanceByItem);
    attachOperationReferences(result);
    calculateStitchCounts(result);
    result.finishing = result.operations.filter((operation) => ["join", "seam", "finish"].includes(operation.type)).map((operation) => ({ id: stableId("finishing", { operationId: operation.id }), type: operation.type, instructionText: operation.instructionSource, operationId: operation.id, provenanceRefs: copy(operation.provenanceRefs) }));
    collectMissingInformation(result, sourceValues);
    collectStructuralConflicts(result);
    result.generationSummary.includedValueCount = provenance.length;
    result.generationSummary.operationCount = result.operations.length;
    result.generationSummary.componentCount = result.components.length;
    result.generationSummary.sectionCount = result.sections.length;
    result.generationSummary.criticalIssueCount = issueCount(result, "critical");
    result.generationSummary.nonCriticalIssueCount = issueCount(result, "non_critical");
    return deepFreeze(result);
  }

  function beginBuild(state, type = "build", now = timestampNow()) {
    requireValidIdentity(state);
    if (!["build", "rebuild", "retry"].includes(type)) throw draftError("INVALID_BUILD_OPERATION", "Неизвестная операция построения.");
    if (state.operation?.status === "in_progress") return copy(state);
    const next = copy(state);
    next.revision += 1;
    next.status = "building";
    next.updatedAt = now;
    next.operation = { operationId: makeId(), type, status: "in_progress", startedAt: now, baseRevision: state.revision, previousStatus: state.status };
    next.interruptedAt = null;
    return next;
  }

  function completeBuild(state, review, now = timestampNow(), auditType = "build") {
    requireValidIdentity(state);
    assertConfirmedReview(review, state.projectId);
    if (state.status !== "building" || state.operation?.status !== "in_progress") throw draftError("INVALID_BUILD_OPERATION", "Построение черновика не было начато.");
    const next = copy(state);
    const sourceChanged = !sourceIdentityMatches(next, review);
    if (sourceChanged && state.operation.type !== "rebuild") throw draftError("SOURCE_REVIEW_STALE", "Подтверждённый источник изменился. Выполните явное перестроение.");
    if (auditType === "rebuild" && state.draftResult) appendAudit(next, auditEntry("rebuild", state, now));
    applyReviewIdentity(next, review);
    next.draftResult = buildDraftFromConfirmedSnapshot(next.immutableSourceSnapshot);
    next.draftFingerprint = fingerprint(next.draftResult);
    const criticalIssues = collectCriticalIssues(next.draftResult);
    next.criticalIssuesFingerprint = fingerprint(criticalIssues);
    next.revision += 1;
    next.updatedAt = now;
    next.builtAt = now;
    next.failedAt = null;
    next.interruptedAt = null;
    next.operation = null;
    next.lastError = null;
    next.status = criticalIssues.length ? "needs_attention" : "ready";
    next.validation = validateDraftState(next, review, now);
    if (!next.validation.isValid || !next.validation.canBecomeReady) next.status = "needs_attention";
    appendAudit(next, { auditId: stableId("audit", { type: auditType, revision: next.revision, source: next.sourceConfirmedFingerprint }), type: auditType, at: now, revision: next.revision, sourceConfirmedFingerprint: next.sourceConfirmedFingerprint, draftFingerprint: next.draftFingerprint, status: next.status });
    next.validation = validateDraftState(next, review, now);
    return next;
  }

  function buildState(state, review, now = timestampNow()) {
    const started = beginBuild(state, state.draftResult ? "rebuild" : "build", now);
    return completeBuild(started, review, now, state.draftResult ? "rebuild" : "build");
  }

  function rebuildState(state, review, now = timestampNow()) {
    requireValidIdentity(state);
    assertConfirmedReview(review, state.projectId);
    const sourceFingerprint = fingerprint(review.confirmedSnapshot);
    if (
      state.draftResult && state.algorithmVersion === ALGORITHM_VERSION &&
      state.sourceReviewRevision === review.revision &&
      state.sourceConfirmedFingerprint === sourceFingerprint &&
      state.immutableSourceFingerprint === sourceFingerprint &&
      state.draftFingerprint === fingerprint(state.draftResult) &&
      state.validation?.isValid
    ) return copy(state);
    return completeBuild(beginBuild(state, "rebuild", now), review, now, "rebuild");
  }

  function recoverInterruptedState(state, now = timestampNow()) {
    if (state?.status !== "building" || state.operation?.status !== "in_progress") return copy(state);
    const next = copy(state);
    const previousStatus = state.operation.previousStatus;
    next.revision += 1;
    next.status = state.draftResult && ["ready", "needs_attention"].includes(previousStatus) ? previousStatus : "waiting";
    next.updatedAt = now;
    next.interruptedAt = now;
    next.operation = null;
    next.lastError = { code: "BUILD_INTERRUPTED" };
    appendAudit(next, { auditId: stableId("audit", { type: "interrupted_recovery", revision: next.revision }), type: "interrupted_recovery", at: now, revision: next.revision, restoredStatus: next.status, draftFingerprint: next.draftFingerprint });
    return next;
  }

  function invalidateSourceState(state, code, now = timestampNow(), failed = false) {
    requireValidIdentity(state);
    const next = copy(state);
    if (next.lastError?.code === code && next.status === (failed ? "failed" : "needs_attention")) return next;
    next.revision += 1;
    next.status = failed ? "failed" : "needs_attention";
    next.updatedAt = now;
    next.failedAt = failed ? now : null;
    next.lastError = { code };
    next.operation = null;
    appendAudit(next, { auditId: stableId("audit", { type: "source_invalidation", code, revision: next.revision }), type: "source_invalidation", at: now, revision: next.revision, code, sourceConfirmedFingerprint: next.sourceConfirmedFingerprint });
    next.validation = validateDraftState(next, null, now, [{ code, level: "critical", entityId: null }]);
    return next;
  }

  function validateDraftState(state, sourceReview = null, now = timestampNow(), extraErrors = []) {
    const errors = [];
    const warnings = [];
    const criticalIssueCodes = [];
    const add = (target, code, entityId = null, level = "critical") => target.push({ code, entityId, level });
    if (!state || state.kind !== PROGRESS_KIND || state.version !== VERSION || !STATUSES.includes(state.status) || state.algorithmVersion !== ALGORITHM_VERSION) add(errors, "INVALID_DRAFT_SCHEMA");
    if (!text(state?.id) || !text(state?.projectId) || !positiveInteger(state?.revision) || !isTimestamp(state?.createdAt) || !isTimestamp(state?.updatedAt)) add(errors, "INVALID_DRAFT_SCHEMA");
    if (state?.sourceProjectId !== state?.projectId || state?.immutableSourceSnapshot?.projectId !== state?.projectId) add(errors, "PROJECT_OWNERSHIP_MISMATCH");
    if (!text(state?.sourceReviewId) || !positiveInteger(state?.sourceReviewRevision) || !positiveInteger(state?.sourceConfirmedRevision) || !validFingerprint(state?.sourceConfirmedFingerprint)) add(errors, "INVALID_SOURCE_IDENTITY");
    if (!state?.immutableSourceSnapshot || fingerprintSafe(state.immutableSourceSnapshot) !== state?.immutableSourceFingerprint) add(errors, "IMMUTABLE_SOURCE_CHANGED");
    if (state?.immutableSourceFingerprint !== state?.sourceConfirmedFingerprint) add(errors, "SOURCE_FINGERPRINT_MISMATCH");
    if (state?.draftResult) validateResult(state, errors, warnings);
    else if (!["waiting", "building", "failed"].includes(state?.status)) add(errors, "INVALID_DRAFT_SCHEMA");
    if (state?.draftResult && fingerprintSafe(state.draftResult) !== state?.draftFingerprint) add(errors, "DRAFT_FINGERPRINT_MISMATCH");
    const resultCritical = state?.draftResult ? collectCriticalIssues(state.draftResult) : [];
    if (state?.criticalIssuesFingerprint !== fingerprintSafe(resultCritical)) add(errors, "CRITICAL_ISSUES_FINGERPRINT_MISMATCH");
    for (const issue of resultCritical) criticalIssueCodes.push(issue.code);
    if (sourceReview) {
      if (sourceReview.projectId !== state?.projectId) add(errors, "PROJECT_OWNERSHIP_MISMATCH");
      if (sourceReview.status !== "confirmed" || !sourceReview.confirmedSnapshot) add(errors, "SOURCE_REVIEW_NOT_CONFIRMED");
      else {
        if (sourceReview.id !== state.sourceReviewId || sourceReview.revision !== state.sourceReviewRevision || sourceReview.revision !== state.sourceConfirmedRevision) add(errors, "SOURCE_REVIEW_STALE");
        if (fingerprintSafe(sourceReview.confirmedSnapshot) !== state.sourceConfirmedFingerprint) add(errors, "SOURCE_FINGERPRINT_MISMATCH");
        if (canonicalizeSafe(sourceReview.confirmedSnapshot) !== canonicalizeSafe(state.immutableSourceSnapshot)) add(errors, "IMMUTABLE_SOURCE_CHANGED");
      }
    }
    for (const issue of extraErrors) add(errors, issue.code, issue.entityId, issue.level);
    if (resultCritical.length) add(errors, "UNRESOLVED_CRITICAL_ISSUE");
    if (state?.status === "ready" && resultCritical.length) add(errors, "READY_WITH_CRITICAL_ISSUES");
    const stableErrors = stableIssues(errors);
    const stableWarnings = stableIssues(warnings);
    for (const issue of stableErrors) if (issue.level === "critical") criticalIssueCodes.push(issue.code);
    const canBecomeReady = stableErrors.length === 0 && resultCritical.length === 0 && Boolean(state?.draftResult);
    if (state?.status === "ready" && !canBecomeReady && !stableErrors.some((issue) => issue.code === "READY_WITH_CRITICAL_ISSUES")) add(stableErrors, "READY_WITH_CRITICAL_ISSUES");
    return {
      isValid: stableErrors.length === 0,
      canBecomeReady,
      errors: stableIssues(stableErrors), warnings: stableWarnings,
      criticalIssueCodes: [...new Set(criticalIssueCodes)].sort(lexical),
      validatedAt: now, validatedRevision: state?.revision ?? null,
    };
  }

  function validateResult(state, errors, warnings) {
    const result = state.draftResult;
    const add = (target, code, entityId = null, level = "critical") => target.push({ code, entityId, level });
    if (result.schemaVersion !== RESULT_SCHEMA_VERSION || result.algorithmVersion !== ALGORITHM_VERSION || result.projectSummary?.projectId !== state.projectId) add(errors, "INVALID_DRAFT_SCHEMA");
    const arrays = ["construction", "sizes", "materials", "yarn", "tools", "gauge", "components", "sections", "operations", "rowInstructions", "repeats", "stitchCountChanges", "finishing", "abbreviations", "assumptions", "missingInformation", "conflicts", "warnings", "provenance"];
    for (const key of arrays) if (!Array.isArray(result[key])) add(errors, "INVALID_DRAFT_SCHEMA", key);
    const entityArrays = arrays.filter((key) => !["missingInformation", "warnings"].includes(key));
    const ids = new Set();
    for (const key of entityArrays) for (const entity of array(result[key])) {
      if (!text(entity?.id) || ids.has(entity.id)) add(errors, "DUPLICATE_ENTITY_ID", entity?.id || null);
      ids.add(entity?.id);
    }
    if (result.craft?.id) { if (ids.has(result.craft.id)) add(errors, "DUPLICATE_ENTITY_ID", result.craft.id); ids.add(result.craft.id); }
    if (result.product?.id) { if (ids.has(result.product.id)) add(errors, "DUPLICATE_ENTITY_ID", result.product.id); ids.add(result.product.id); }
    const provenanceIds = new Set(array(result.provenance).map((entry) => entry.id));
    const sourceItemIds = new Set(array(state.immutableSourceSnapshot?.values).map((entry) => entry.itemId));
    for (const entry of array(result.provenance)) {
      if (!sourceItemIds.has(entry.sourceReviewedItemId) || !["accepted", "corrected"].includes(entry.decisionType) || entry.sourceProjectId !== state.projectId || !validFingerprint(entry.evidenceFingerprint)) add(errors, "INVALID_PROVENANCE", entry.id);
    }
    for (const key of ["construction", "sizes", "materials", "yarn", "tools", "gauge", "components", "sections", "operations", "rowInstructions", "repeats", "finishing", "abbreviations"]) for (const entity of array(result[key])) {
      if (entity.structural === true) continue;
      if (!Array.isArray(entity.provenanceRefs) || !entity.provenanceRefs.length || entity.provenanceRefs.some((id) => !provenanceIds.has(id))) add(errors, "INVALID_PROVENANCE", entity.id);
    }
    const componentIds = new Set(array(result.components).map((entry) => entry.id));
    const sectionIds = new Set(array(result.sections).map((entry) => entry.id));
    const operationIds = new Set(array(result.operations).map((entry) => entry.id));
    for (const section of array(result.sections)) if (section.componentId && !componentIds.has(section.componentId)) add(errors, "BROKEN_ENTITY_REFERENCE", section.id);
    for (const operation of array(result.operations)) {
      if (!OPERATION_TYPES.includes(operation.type)) add(errors, "INVALID_OPERATION_TYPE", operation.id);
      if (operation.componentId && !componentIds.has(operation.componentId)) add(errors, "BROKEN_ENTITY_REFERENCE", operation.id);
      if (!sectionIds.has(operation.sectionId)) add(errors, "BROKEN_ENTITY_REFERENCE", operation.id);
      validateRange(operation.rowStart, operation.rowEnd, operation.id, errors, "INVALID_ROW_RANGE");
      validateRange(operation.roundStart, operation.roundEnd, operation.id, errors, "INVALID_ROW_RANGE");
      for (const field of ["stitchCountBefore", "stitchCountAfter", "countDelta"]) if (operation[field] !== null && operation[field] !== undefined && (!Number.isFinite(operation[field]) || !Number.isInteger(operation[field]))) add(errors, "INVALID_NUMERIC_VALUE", operation.id);
      if (operation.repeat && !validRepeat(operation.repeat, operationIds)) add(errors, "AMBIGUOUS_REPEAT", operation.id);
    }
    for (const repeat of array(result.repeats)) if (!validRepeat(repeat.repeat, operationIds)) add(errors, "AMBIGUOUS_REPEAT", repeat.id);
    for (const key of ["sizes", "materials", "yarn", "tools", "gauge"]) for (const entity of array(result[key])) if (!validUnit(entity.unit ?? unitOf(entity.value))) add(errors, "INVALID_UNIT", entity.id);
    for (const issue of array(result.warnings)) warnings.push({ code: issue.code, entityId: issue.entityId ?? null, level: issue.level || "non_critical" });
  }

  function normalizeGauge(value, fallbackUnit) {
    const objectValue = object(value);
    return { value: numeric(objectValue?.value ?? value), per: numeric(objectValue?.per), unit: objectValue?.unit ?? fallbackUnit ?? null };
  }

  function normalizeAbbreviation(base, value) {
    const objectValue = object(value);
    return { ...base, abbreviation: text(objectValue?.abbreviation ?? objectValue?.short ?? ""), definition: text(objectValue?.definition ?? objectValue?.meaning ?? objectValue?.value ?? "") };
  }

  function normalizeSection(base, item) {
    const value = object(item.value);
    return { ...base, title: text(value?.title ?? value?.name ?? scalar(item.value)) || "Секция без названия", sectionType: text(value?.type ?? item.subtype) || "section", order: finiteOrder(value?.order), componentId: null, structural: false };
  }

  function normalizeRow(base, item) {
    const value = object(item.value) || {};
    const kind = text(value.kind).toLowerCase();
    const start = integer(value.rowStart ?? value.startRow ?? value.rowNumber ?? value.number);
    const end = integer(value.rowEnd ?? value.endRow ?? value.rowNumber ?? value.number);
    const roundStart = kind === "round" || kind === "круг" ? start : integer(value.roundStart);
    const roundEnd = kind === "round" || kind === "круг" ? end : integer(value.roundEnd);
    return { ...base, instructionText: text(value.instructionText ?? value.text ?? scalar(item.value)), rowStart: roundStart === null ? start : null, rowEnd: roundStart === null ? end : null, roundStart, roundEnd, parity: normalizeParity(value.parity), order: finiteOrder(value.order), componentHint: text(value.componentId ?? value.component ?? ""), sectionHint: text(value.sectionId ?? value.section ?? "") };
  }

  function normalizeRepeat(base, item) {
    const value = object(item.value) || {};
    const repeat = {
      mode: repeatMode(value), count: positiveInteger(value.repeatCount ?? value.count),
      rowStart: integer(value.rowStart ?? value.fromRow), rowEnd: integer(value.rowEnd ?? value.toRow),
      untilRow: integer(value.untilRow), untilStitchCount: integer(value.untilStitchCount ?? value.untilStitches),
      untilLength: numeric(value.untilLength ?? value.length), untilUnit: value.untilUnit ?? value.unit ?? null,
      operationRef: text(value.operationRef ?? value.repeatRef ?? "") || null,
      instructionText: text(value.instructionText ?? value.text ?? scalar(item.value)), ambiguous: false,
    };
    repeat.ambiguous = !repeat.count && !repeat.untilRow && !repeat.untilStitchCount && repeat.untilLength === null && !repeat.operationRef && !(repeat.rowStart && repeat.rowEnd);
    return { ...base, repeat, order: finiteOrder(value.order), componentHint: text(value.componentId ?? value.component ?? ""), sectionHint: text(value.sectionId ?? value.section ?? "") };
  }

  function buildComponents(result, sectionItems) {
    const componentNames = ["front", "back", "sleeve", "collar", "band", "yoke", "body", "cuff", "left front", "right front", "перед", "спинка", "рукав", "воротник", "планка", "кокетка", "тело", "манжета", "левая полочка", "правая полочка", "образец узора"];
    for (const item of sectionItems) {
      const section = result.sections.find((entry) => entry.provenanceRefs?.[0] === provenanceId(item.itemId));
      const value = object(item.value);
      const explicit = text(value?.component ?? value?.componentName ?? value?.title ?? value?.name ?? scalar(item.value));
      const normalized = explicit.toLowerCase();
      const isComponent = Boolean(text(value?.component ?? value?.componentName)) || componentNames.some((name) => normalized === name || normalized.startsWith(`${name} `) || normalized.endsWith(` ${name}`));
      if (!isComponent || !section) continue;
      const component = { id: stableId("component", { itemId: item.itemId }), name: explicit, order: section.order, provenanceRefs: copy(section.provenanceRefs) };
      result.components.push(component);
      section.componentId = component.id;
    }
  }

  function ensureUnassignedSection(result) {
    if (!result.sections.length) result.sections.push({ id: "section:unassigned", title: "Не назначено", sectionType: "unassigned", order: null, componentId: null, provenanceRefs: [], structural: true });
  }

  function buildOperations(result, sourceValues, provenanceByItem) {
    const sectionItems = sourceValues.filter((item) => item.category === "sections");
    for (const item of sourceValues.filter((entry) => ["rows", "repeats", "counts"].includes(entry.category))) {
      const provenanceRefs = [provenanceByItem.get(item.itemId).id];
      const value = object(item.value) || {};
      const nearestSection = chooseSection(result, sectionItems, item);
      const componentId = chooseComponent(result, value, nearestSection);
      if (item.category === "rows") {
        const row = result.rowInstructions.find((entry) => entry.provenanceRefs[0] === provenanceRefs[0]);
        result.operations.push(operationFromRow(item, row, nearestSection.id, componentId, provenanceRefs));
      } else if (item.category === "repeats") {
        const repeat = result.repeats.find((entry) => entry.provenanceRefs[0] === provenanceRefs[0]);
        result.operations.push({ id: stableId("operation", { itemId: item.itemId }), type: "repeat", componentId, sectionId: nearestSection.id, order: operationOrder(item), instructionSource: repeat.repeat.instructionText, rowStart: repeat.repeat.rowStart, rowEnd: repeat.repeat.rowEnd, roundStart: null, roundEnd: null, repeat: copy(repeat.repeat), stitchCountBefore: null, stitchCountAfter: null, countDelta: null, parameters: {}, provenanceRefs, warnings: repeat.repeat.ambiguous ? ["AMBIGUOUS_REPEAT"] : [] });
      } else {
        const type = item.subtype === "castOn" ? "cast_on" : item.subtype === "bindOff" ? "bind_off" : "unknown";
        const count = integer(value.value ?? item.value);
        result.operations.push({ id: stableId("operation", { itemId: item.itemId }), type, componentId, sectionId: nearestSection.id, order: operationOrder(item), instructionSource: text(value.instructionText ?? item.subtype), rowStart: integer(value.rowNumber), rowEnd: integer(value.rowNumber), roundStart: null, roundEnd: null, repeat: null, stitchCountBefore: type === "bind_off" ? integer(value.stitchCountBefore) : null, stitchCountAfter: type === "cast_on" ? count : null, countDelta: type === "cast_on" ? count : type === "bind_off" && count !== null ? -count : null, parameters: { confirmedCount: count, countKind: item.subtype }, provenanceRefs, warnings: [] });
      }
    }
    result.operations.sort(compareOperations);
    result.operations.forEach((operation, index) => { operation.order = index + 1; });
  }

  function operationFromRow(item, row, sectionId, componentId, provenanceRefs) {
    const value = object(item.value) || {};
    const type = classifyOperation(value, row.instructionText);
    const repeat = object(value.repeat) ? normalizeRepeat({ id: "", value: null, unit: null, provenanceRefs }, { value: value.repeat }).repeat : null;
    const before = integer(value.stitchCountBefore ?? value.beforeStitches);
    const after = integer(value.stitchCountAfter ?? value.afterStitches);
    const increaseCount = integer(value.increaseCount ?? value.increases);
    const decreaseCount = integer(value.decreaseCount ?? value.decreases);
    const explicitDelta = integer(value.countDelta);
    const delta = explicitDelta ?? (type === "increase" && increaseCount !== null ? increaseCount : type === "decrease" && decreaseCount !== null ? -decreaseCount : null);
    return { id: stableId("operation", { itemId: item.itemId }), type, componentId, sectionId, order: operationOrder(item), instructionSource: row.instructionText, rowStart: row.rowStart, rowEnd: row.rowEnd, roundStart: row.roundStart, roundEnd: row.roundEnd, repeat, stitchCountBefore: before, stitchCountAfter: after, countDelta: delta, parameters: { parity: row.parity, increaseCount, decreaseCount, explicitStitchCountAfter: after }, provenanceRefs, warnings: type === "unknown" ? ["UNKNOWN_OPERATION"] : [] };
  }

  function attachOperationReferences(result) {
    const operationByProvenance = new Map(result.operations.flatMap((operation) => operation.provenanceRefs.map((ref) => [ref, operation.id])));
    for (const row of result.rowInstructions) row.operationId = operationByProvenance.get(row.provenanceRefs[0]) ?? null;
    for (const repeat of result.repeats) repeat.operationId = operationByProvenance.get(repeat.provenanceRefs[0]) ?? null;
  }

  function calculateStitchCounts(result) {
    const counts = new Map();
    for (const operation of result.operations) {
      const key = operation.componentId || "unassigned";
      if (operation.type === "cast_on" && operation.stitchCountAfter !== null) {
        counts.set(key, operation.stitchCountAfter);
        addStitchChange(result, operation, null, operation.stitchCountAfter, operation.stitchCountAfter, "cast_on");
        continue;
      }
      const before = operation.stitchCountBefore ?? counts.get(key) ?? null;
      if (["increase", "decrease", "bind_off"].includes(operation.type) && before === null) continue;
      if (before !== null && operation.countDelta !== null) {
        const multiplier = operation.repeat?.count ?? 1;
        if (!positiveInteger(multiplier)) continue;
        const calculatedAfter = before + operation.countDelta * multiplier;
        if (!Number.isInteger(calculatedAfter) || calculatedAfter < 0) continue;
        const explicitAfter = operation.parameters.explicitStitchCountAfter;
        operation.stitchCountBefore = before;
        if (explicitAfter !== null && explicitAfter !== calculatedAfter) {
          result.conflicts.push({ id: stableId("conflict", { operationId: operation.id, explicitAfter, calculatedAfter }), code: "STITCH_COUNT_CONFLICT", level: "critical", entityId: operation.id, confirmedValue: explicitAfter, calculatedValue: calculatedAfter, resolved: false, provenanceRefs: copy(operation.provenanceRefs) });
        } else operation.stitchCountAfter = calculatedAfter;
        counts.set(key, explicitAfter === null ? calculatedAfter : null);
        addStitchChange(result, operation, before, explicitAfter, calculatedAfter, "arithmetic");
      } else if (operation.stitchCountAfter !== null) counts.set(key, operation.stitchCountAfter);
    }
  }

  function addStitchChange(result, operation, before, confirmedAfter, calculatedAfter, reason) {
    result.stitchCountChanges.push({ id: stableId("stitch-change", { operationId: operation.id }), operationId: operation.id, componentId: operation.componentId, stitchCountBefore: before, confirmedStitchCountAfter: confirmedAfter, calculatedStitchCountAfter: calculatedAfter, formula: before === null ? `cast_on=${calculatedAfter}` : `${before}+(${operation.countDelta})×${operation.repeat?.count ?? 1}=${calculatedAfter}`, provenance: { type: "calculated", reason, inputItemIds: operation.provenanceRefs.map((ref) => result.provenance.find((entry) => entry.id === ref)?.sourceReviewedItemId).filter(Boolean), sourceValues: operation.provenanceRefs.map((ref) => result.provenance.find((entry) => entry.id === ref)?.confirmedValue), formulaInputs: { before, delta: operation.countDelta, repeatCount: operation.repeat?.count ?? 1 } }, provenanceRefs: copy(operation.provenanceRefs) });
  }

  function collectMissingInformation(result, sourceValues) {
    const add = (code, level, message, entityIds = []) => result.missingInformation.push({ id: stableId("missing", { code, entityIds }), code, level, message, entityIds, resolved: false });
    if (!result.craft || unknownScalar(result.craft.type)) add("MISSING_CRAFT", "critical", "Не подтверждён вид рукоделия.");
    if (!result.product || unknownScalar(result.product.type)) add("MISSING_PRODUCT", "critical", "Не подтверждён тип изделия.");
    if (!result.operations.length) add("MISSING_OPERATIONS", "critical", "Нет подтверждённых операций вязания.");
    if (!result.yarn.length) add("MISSING_YARN", "critical", "Не подтверждена пряжа.");
    if (!result.tools.length) add("MISSING_TOOLS", "critical", "Не подтверждены инструменты.");
    if (!result.gauge.length) add("MISSING_GAUGE", "critical", "Не подтверждена плотность.");
    if (!result.sizes.length) add("MISSING_SIZE", "non_critical", "Размер или исходные мерки не подтверждены.");
    const labels = result.sizes.filter((entry) => entry.type === "label");
    if (labels.length > 1 && !labels.some((entry) => entry.selected)) add("MISSING_SELECTED_SIZE", "critical", "Для нескольких размерных веток не выбран один размер.", labels.map((entry) => entry.id));
    for (const operation of result.operations) {
      if (["increase", "decrease", "bind_off"].includes(operation.type) && operation.stitchCountBefore === null) add("MISSING_CRITICAL_VALUE", "critical", "Перед изменением не известно количество петель.", [operation.id]);
      if (!operation.componentId) result.warnings.push({ id: stableId("warning", { code: "UNASSIGNED_COMPONENT", operationId: operation.id }), code: "UNASSIGNED_COMPONENT", level: result.components.length > 1 ? "critical" : "non_critical", entityId: operation.id, message: "Операция не привязана к подтверждённому компоненту." });
    }
    for (const repeat of result.repeats) if (repeat.repeat.ambiguous) add("AMBIGUOUS_REPEAT", "critical", "Границы или условие повтора неоднозначны.", [repeat.id]);
    if (!result.finishing.length) add("MISSING_FINISHING", "non_critical", "Отделка не описана.");
    if (!result.abbreviations.length && sourceValues.some((item) => item.category === "rows")) result.warnings.push({ id: stableId("warning", { code: "NO_ABBREVIATIONS" }), code: "NO_ABBREVIATIONS", level: "informational", entityId: null, message: "Отдельный список сокращений не подтверждён." });
  }

  function collectStructuralConflicts(result) {
    for (const operation of result.operations) {
      if (operation.rowStart !== null && operation.rowEnd !== null && operation.rowEnd < operation.rowStart) result.conflicts.push({ id: stableId("conflict", { code: "INVALID_ROW_RANGE", operationId: operation.id }), code: "INVALID_ROW_RANGE", level: "critical", entityId: operation.id, resolved: false, provenanceRefs: copy(operation.provenanceRefs) });
    }
    const byScope = new Map();
    for (const operation of result.operations.filter((entry) => entry.rowStart !== null && entry.type !== "repeat")) {
      const key = `${operation.componentId || ""}:${operation.sectionId}`;
      if (!byScope.has(key)) byScope.set(key, []);
      byScope.get(key).push(operation);
    }
    for (const operations of byScope.values()) {
      let end = null;
      for (const operation of operations) {
        if (end !== null && operation.rowStart < end) result.conflicts.push({ id: stableId("conflict", { code: "ROW_SEQUENCE_CONFLICT", operationId: operation.id }), code: "ROW_SEQUENCE_CONFLICT", level: "critical", entityId: operation.id, resolved: false, provenanceRefs: copy(operation.provenanceRefs) });
        end = Math.max(end ?? operation.rowEnd ?? operation.rowStart, operation.rowEnd ?? operation.rowStart);
      }
    }
  }

  function collectCriticalIssues(result) {
    return stableIssues([
      ...array(result.missingInformation).filter((entry) => entry.level === "critical" && !entry.resolved).map((entry) => ({ code: entry.code, entityId: entry.entityIds?.[0] ?? null, level: "critical" })),
      ...array(result.conflicts).filter((entry) => entry.level === "critical" && !entry.resolved).map((entry) => ({ code: entry.code, entityId: entry.entityId ?? null, level: "critical" })),
      ...array(result.warnings).filter((entry) => entry.level === "critical").map((entry) => ({ code: entry.code, entityId: entry.entityId ?? null, level: "critical" })),
    ]);
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project || null;
    const calculation = array(aggregate?.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null;
    const progress = calculation ? array(aggregate?.progress).filter((entry) => entry.calculation_id === calculation.calculation_id && entry.epoch === 1) : [];
    const reviewProgress = progress.find((entry) => entry.kind === "PATTERN_ANALYSIS_REVIEW") || null;
    const draftProgress = progress.find((entry) => entry.kind === PROGRESS_KIND) || null;
    const review = reviewProgress?.state || null;
    const draft = draftProgress?.state || null;
    let state = "missing_project"; let reasonCode = "PROJECT_NOT_FOUND";
    if (project && calculation && !review) { state = "review_missing"; reasonCode = "SOURCE_REVIEW_NOT_FOUND"; }
    else if (review && (review.projectId !== project.project_id || review.confirmedSnapshot?.projectId !== project.project_id)) { state = "source_invalid"; reasonCode = "PROJECT_OWNERSHIP_MISMATCH"; }
    else if (review && (review.status !== "confirmed" || !review.confirmedSnapshot)) { state = "review_not_confirmed"; reasonCode = "SOURCE_REVIEW_NOT_CONFIRMED"; }
    else if (review && !draft) { state = "draft_missing"; reasonCode = null; }
    else if (draft) {
      try { requireValidIdentity(draft); state = draft.status; reasonCode = draft.lastError?.code || null; }
      catch { state = "corrupted"; reasonCode = "INVALID_DRAFT_SCHEMA"; }
      if (state !== "corrupted" && review?.status === "confirmed" && !sourceIdentityMatches(draft, review)) { state = "stale"; reasonCode = draft.sourceConfirmedFingerprint !== fingerprintSafe(review.confirmedSnapshot) ? "SOURCE_FINGERPRINT_MISMATCH" : "SOURCE_REVIEW_STALE"; }
    }
    return { state, reasonCode, project, calculation, reviewProgress, review, draftProgress, draft };
  }

  async function ensureForProject(repository, projectId) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (["missing_project", "review_missing", "review_not_confirmed", "source_invalid"].includes(inspected.state)) return inspected;
    if (!inspected.draft) {
      const initial = createInitialState(projectId, inspected.review);
      await repository.ensurePatternTechnologyDraft(projectId, inspected.calculation.calculation_id, initial, { operationKind: "PATTERN_TECHNOLOGY_DRAFT_CREATED", projectStage: "pattern_technology_draft_waiting" });
      return inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.draft.status === "building" && inspected.draft.operation?.status === "in_progress") {
      const recovered = recoverInterruptedState(inspected.draft);
      await repository.updatePatternTechnologyDraft(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_TECHNOLOGY_DRAFT_INTERRUPTED", projectStage: `pattern_technology_draft_${recovered.status}` });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.state === "stale" && inspected.draft.status !== "needs_attention") {
      const stale = invalidateSourceState(inspected.draft, inspected.reasonCode);
      await repository.updatePatternTechnologyDraft(projectId, inspected.calculation.calculation_id, stale, { operationKind: "PATTERN_TECHNOLOGY_DRAFT_SOURCE_INVALIDATED", projectStage: "pattern_technology_draft_needs_attention" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    return inspected;
  }

  async function buildForProject(repository, projectId, options = {}) {
    if (activeOperations.has(projectId)) return inspectAggregate(await repository.getProject(projectId));
    activeOperations.add(projectId);
    try {
      let inspected = await ensureForProject(repository, projectId);
      if (!inspected.review || inspected.review.status !== "confirmed") throw draftError("SOURCE_REVIEW_NOT_CONFIRMED", "Сначала подтвердите результат Stage 19.");
      if (options.rebuild) {
        const noOp = rebuildState(inspected.draft, inspected.review);
        if (canonicalize(noOp) === canonicalize(inspected.draft)) return inspected;
      } else if (inspected.draft.status === "ready" || inspected.draft.status === "needs_attention" && inspected.draft.draftResult && !inspected.draft.lastError) return inspected;
      const type = options.rebuild ? "rebuild" : options.retry ? "retry" : "build";
      const started = beginBuild(inspected.draft, type);
      await repository.updatePatternTechnologyDraft(projectId, inspected.calculation.calculation_id, started, { operationKind: `PATTERN_TECHNOLOGY_DRAFT_${type.toUpperCase()}_STARTED`, projectStage: "pattern_technology_draft_building" });
      inspected = inspectAggregate(await repository.getProject(projectId));
      const completed = completeBuild(inspected.draft, inspected.review, timestampNow(), type === "rebuild" ? "rebuild" : "build");
      await repository.updatePatternTechnologyDraft(projectId, inspected.calculation.calculation_id, completed, { operationKind: `PATTERN_TECHNOLOGY_DRAFT_${type.toUpperCase()}_COMPLETED`, projectStage: `pattern_technology_draft_${completed.status}` });
      return inspectAggregate(await repository.getProject(projectId));
    } finally { activeOperations.delete(projectId); }
  }

  async function rebuildForProject(repository, projectId) { return buildForProject(repository, projectId, { rebuild: true }); }
  async function retryForProject(repository, projectId) { return buildForProject(repository, projectId, { retry: true }); }

  function assertConfirmedReview(review, projectId) {
    if (!review || review.kind !== "PATTERN_ANALYSIS_REVIEW" || review.status !== "confirmed" || !review.confirmedSnapshot) throw draftError("SOURCE_REVIEW_NOT_CONFIRMED", "Для черновика требуется подтверждённый результат Stage 19.");
    if (review.projectId !== projectId || review.confirmedSnapshot.projectId !== projectId) throw draftError("PROJECT_OWNERSHIP_MISMATCH", "Источник относится к другому проекту.");
    if (!text(review.id) || !positiveInteger(review.revision) || review.confirmedSnapshot.sourceSemanticAnalysisId !== review.sourceSemanticAnalysisId || review.confirmedSnapshot.sourceSemanticAnalysisRevision !== review.sourceSemanticAnalysisRevision || review.confirmedSnapshot.sourceImportRevision !== review.sourceImportRevision) throw draftError("INVALID_SOURCE_IDENTITY", "Цепочка подтверждённого источника повреждена.");
    assertConfirmedSnapshot(review.confirmedSnapshot);
  }

  function assertConfirmedSnapshot(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !text(snapshot.projectId) || !text(snapshot.sourceSemanticAnalysisId) || !positiveInteger(snapshot.sourceSemanticAnalysisRevision) || !Array.isArray(snapshot.values) || Number(snapshot.validation?.unresolvedCriticalCount || 0) > 0) throw draftError("INVALID_SOURCE_IDENTITY", "Подтверждённый snapshot повреждён или недействителен.");
    const ids = new Set();
    for (const item of snapshot.values) {
      if (!text(item?.itemId) || ids.has(item.itemId) || !["accepted", "corrected"].includes(item.decision)) throw draftError("INVALID_SOURCE_IDENTITY", "Подтверждённый snapshot содержит недопустимые элементы.");
      ids.add(item.itemId);
    }
  }

  function applyReviewIdentity(state, review) {
    const snapshot = deepFreeze(copy(review.confirmedSnapshot));
    state.sourceReviewId = review.id;
    state.sourceReviewRevision = review.revision;
    state.sourceConfirmedRevision = review.revision;
    state.sourceConfirmedFingerprint = fingerprint(snapshot);
    state.sourceSemanticAnalysisId = snapshot.sourceSemanticAnalysisId;
    state.sourceSemanticAnalysisRevision = snapshot.sourceSemanticAnalysisRevision;
    state.sourceImportRevision = snapshot.sourceImportRevision ?? null;
    state.sourceProjectId = snapshot.projectId;
    state.immutableSourceSnapshot = snapshot;
    state.immutableSourceFingerprint = state.sourceConfirmedFingerprint;
    state.algorithmVersion = ALGORITHM_VERSION;
  }

  function sourceIdentityMatches(state, review) {
    if (!state || !review?.confirmedSnapshot) return false;
    return state.projectId === review.projectId && state.sourceProjectId === review.projectId && state.sourceReviewId === review.id && state.sourceReviewRevision === review.revision && state.sourceConfirmedRevision === review.revision && state.sourceConfirmedFingerprint === fingerprintSafe(review.confirmedSnapshot) && state.immutableSourceFingerprint === fingerprintSafe(state.immutableSourceSnapshot) && canonicalizeSafe(state.immutableSourceSnapshot) === canonicalizeSafe(review.confirmedSnapshot);
  }

  function createProvenance(item, snapshot) {
    const evidence = array(item.provenance?.evidence).slice(0, 8).map((entry) => ({ sourceFileId: entry?.sourceFileId ?? null, start: integer(entry?.start), end: integer(entry?.end), excerpt: text(entry?.text).slice(0, 240), ruleId: entry?.ruleId ?? null }));
    return {
      id: provenanceId(item.itemId), sourceReviewedItemId: item.itemId,
      sourceReviewId: null, sourceProjectId: snapshot.projectId,
      sourceSemanticAnalysisId: snapshot.sourceSemanticAnalysisId,
      decisionType: item.decision, originalValue: copy(item.provenance?.originalValue), confirmedValue: copy(item.value),
      correctionProvenance: item.decision === "corrected" ? { corrected: true, notes: text(item.notes).slice(0, 500) } : null,
      evidenceFingerprint: fingerprint(evidence), offsets: array(item.provenance?.sourceOffsets).slice(0, 8).map((entry) => ({ sourceFileId: entry?.sourceFileId ?? null, start: integer(entry?.start), end: integer(entry?.end) })),
      sourceCategory: item.category, evidence,
    };
  }

  function chooseSection(result, sectionItems, item) {
    const value = object(item.value) || {};
    const explicit = text(value.sectionId ?? value.section);
    if (explicit) {
      const match = result.sections.find((entry) => entry.id === explicit || entry.title === explicit);
      if (match) return match;
    }
    const offset = firstOffset(item);
    let candidate = null;
    for (const sectionItem of sectionItems) {
      if (firstOffset(sectionItem) > offset) continue;
      const section = result.sections.find((entry) => entry.provenanceRefs?.[0] === provenanceId(sectionItem.itemId));
      if (section) candidate = section;
    }
    return candidate || result.sections.find((entry) => entry.id === "section:unassigned") || result.sections[0];
  }

  function chooseComponent(result, value, section) {
    const hint = text(value.componentId ?? value.component);
    if (hint) {
      const match = result.components.find((entry) => entry.id === hint || entry.name === hint);
      if (match) return match.id;
    }
    return section?.componentId || null;
  }

  function classifyOperation(value, instructionText) {
    const explicit = text(value.type ?? value.operationType).toLowerCase().replaceAll("-", "_");
    if (OPERATION_TYPES.includes(explicit)) return explicit;
    const source = `${explicit} ${text(instructionText).toLowerCase()}`;
    const rules = [
      ["cast_on", ["cast on", "набрать", "набор петель"]], ["bind_off", ["bind off", "закрыть петли", "закрыть"]],
      ["hold_stitches", ["hold stitches", "оставить петли", "отложить петли"]], ["pick_up_stitches", ["pick up", "поднять петли", "набрать по краю"]],
      ["increase", ["increase", "прибав"]], ["decrease", ["decrease", "убав"]], ["purl", ["purl", "изнан"]],
      ["knit", ["knit", "лицев"]], ["join", ["join", "соедин"]], ["seam", ["seam", "сшить", "шов"]],
      ["finish", ["finish", "отделк", "заправить концы", "блокиров"]], ["repeat", ["repeat", "повтор"]],
      ["work_pattern", ["pattern", "узор", "раппорт"]],
    ];
    return rules.find(([, terms]) => terms.some((term) => source.includes(term)))?.[0] || "unknown";
  }

  function repeatMode(value) {
    if (text(value.operationRef ?? value.repeatRef)) return "reference";
    if (integer(value.untilRow)) return "until_row";
    if (integer(value.untilStitchCount ?? value.untilStitches)) return "until_stitch_count";
    if (numeric(value.untilLength ?? value.length) !== null) return "until_length";
    if (positiveInteger(value.repeatCount ?? value.count)) return "count";
    if (integer(value.rowStart ?? value.fromRow) && integer(value.rowEnd ?? value.toRow)) return "row_range";
    return "ambiguous";
  }

  function validRepeat(repeat, operationIds) {
    if (!object(repeat) || repeat.ambiguous || !["reference", "until_row", "until_stitch_count", "until_length", "count", "row_range"].includes(repeat.mode)) return false;
    if (repeat.count !== null && !positiveInteger(repeat.count)) return false;
    if (repeat.rowStart !== null && repeat.rowEnd !== null && repeat.rowEnd < repeat.rowStart) return false;
    if (repeat.untilLength !== null && (!Number.isFinite(repeat.untilLength) || repeat.untilLength <= 0 || !validUnit(repeat.untilUnit))) return false;
    if (repeat.operationRef && operationIds.size && !operationIds.has(repeat.operationRef)) return false;
    return true;
  }

  function stableSourceValues(values) { return copy(array(values)).sort(compareSourceItems); }
  function compareSourceItems(left, right) { return firstOffset(left) - firstOffset(right) || sourceOrder(left) - sourceOrder(right) || lexical(String(left.itemId), String(right.itemId)); }
  function compareOperations(left, right) { return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || (left.rowStart ?? left.roundStart ?? Number.MAX_SAFE_INTEGER) - (right.rowStart ?? right.roundStart ?? Number.MAX_SAFE_INTEGER) || lexical(left.id, right.id); }
  function firstOffset(item) { const values = array(item?.provenance?.sourceOffsets); const offsets = values.map((entry) => integer(entry?.start)).filter((entry) => entry !== null); return offsets.length ? Math.min(...offsets) : Number.MAX_SAFE_INTEGER; }
  function sourceOrder(item) { const value = object(item?.value); return finiteOrder(value?.sourceOrder ?? value?.sectionOrder ?? value?.order ?? value?.rowNumber ?? value?.number) ?? Number.MAX_SAFE_INTEGER; }
  function operationOrder(item) { const offset = firstOffset(item); return offset === Number.MAX_SAFE_INTEGER ? sourceOrder(item) : offset; }
  function explicitlySelected(value) { const objectValue = object(value); return objectValue?.selected === true || objectValue?.isSelected === true; }
  function unknownScalar(value) { return value === null || value === undefined || ["", "unknown", "ambiguous"].includes(String(value).trim().toLowerCase()); }
  function normalizeParity(value) { const normalized = text(value).toLowerCase(); return ["odd", "even", "нечётные", "четные", "чётные"].includes(normalized) ? normalized : null; }
  function entityId(prefix, item) { return stableId(prefix, { itemId: item.itemId }); }
  function provenanceId(itemId) { return stableId("provenance", { itemId }); }
  function stableId(prefix, value) { return `${prefix}:${fingerprint(value).slice(8)}`; }
  function scalar(value) { const objectValue = object(value); return objectValue?.value ?? objectValue?.type ?? objectValue?.name ?? objectValue?.title ?? objectValue?.text ?? objectValue?.instructionText ?? value; }
  function unitOf(value) { return object(value)?.unit ?? null; }
  function issueCount(result, level) { return [...array(result.missingInformation), ...array(result.conflicts), ...array(result.warnings)].filter((entry) => entry.level === level && !entry.resolved).length; }
  function validateRange(start, end, id, errors, code) { if ((start === null) !== (end === null) || start !== null && (!positiveInteger(start) || !positiveInteger(end) || end < start)) errors.push({ code, entityId: id, level: "critical" }); }
  function appendAudit(state, entry) { state.audit = [...array(state.audit), copy(entry)].slice(-AUDIT_LIMIT); }
  function auditEntry(type, state, now) { return { auditId: stableId("audit", { type, revision: state.revision, fingerprint: state.draftFingerprint }), type, at: now, revision: state.revision, previousSourceIdentity: { projectId: state.projectId, sourceReviewId: state.sourceReviewId, sourceSemanticAnalysisId: state.sourceSemanticAnalysisId, sourceConfirmedFingerprint: state.sourceConfirmedFingerprint }, previousResult: copy(state.draftResult), previousDraftFingerprint: state.draftFingerprint, previousValidation: copy(state.validation), previousStatus: state.status }; }
  function emptyValidation(now, revision) { return { isValid: false, canBecomeReady: false, errors: [], warnings: [], criticalIssueCodes: [], validatedAt: now, validatedRevision: revision }; }
  function stableIssues(issues) { const unique = new Map(); for (const issue of issues) { const normalized = { code: issue.code, entityId: issue.entityId ?? null, level: issue.level || "critical" }; unique.set(canonicalize(normalized), normalized); } return [...unique.values()].sort((a, b) => lexical(a.code, b.code) || lexical(String(a.entityId), String(b.entityId))); }
  function requireValidIdentity(state) { if (!state || state.kind !== PROGRESS_KIND || state.version !== VERSION || !text(state.id) || !text(state.projectId) || !positiveInteger(state.revision) || !STATUSES.includes(state.status) || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt)) throw draftError("INVALID_DRAFT_SCHEMA", "Запись черновика технологии повреждена."); return true; }
  function validUnit(value) { return VALID_UNITS.includes(value ?? null); }
  function validFingerprint(value) { return typeof value === "string" && value.startsWith("fnv1a32:") && value.length === 16 && [...value.slice(8)].every((character) => "0123456789abcdef".includes(character)); }
  function fingerprintSafe(value) { try { return fingerprint(value); } catch { return null; } }
  function canonicalizeSafe(value) { try { return canonicalize(value); } catch { return null; } }
  function timestampNow() { return new Date().toISOString(); }
  function isTimestamp(value) { return typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)); }
  function finiteOrder(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
  function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
  function integer(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isInteger(number) ? number : null; }
  function numeric(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `technology:${Date.now()}`; }
  function draftError(code, message, details = {}) { return new PatternTechnologyDraftError(code, message, details); }

  const api = { VERSION, RESULT_SCHEMA_VERSION, ALGORITHM_VERSION, PROGRESS_KIND, STATUSES, OPERATION_TYPES, ISSUE_LEVELS, VALID_UNITS, AUDIT_LIMIT, PatternTechnologyDraftError, canonicalize, fingerprint, createInitialState, buildDraftFromConfirmedSnapshot, beginBuild, completeBuild, buildState, rebuildState, recoverInterruptedState, invalidateSourceState, validateDraftState, collectCriticalIssues, inspectAggregate, ensureForProject, buildForProject, rebuildForProject, retryForProject, sourceIdentityMatches };
  globalObject.YarnAIPatternTechnologyDraft = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
