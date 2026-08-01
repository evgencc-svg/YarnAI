"use strict";

(function exposePatternAnalysisReview(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "PATTERN_ANALYSIS_REVIEW";
  const STATUSES = Object.freeze(["waiting", "reviewing", "needs_attention", "ready_to_confirm", "confirmed", "failed"]);
  const DECISIONS = Object.freeze(["accepted", "corrected", "rejected", "unresolved"]);
  const SEVERITIES = Object.freeze(["critical", "important", "informational"]);
  const UNITS = Object.freeze([null, "", "cm", "mm", "in", "inch", "inches", "stitches", "rows", "repeats", "g", "kg", "m", "yd", "oz", "number", "size", "%"]);
  const activeOperations = new Set();

  class PatternAnalysisReviewError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternAnalysisReviewError";
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
    return JSON.stringify(value);
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

  function semanticFingerprint(semantic) {
    return fingerprint({
      id: semantic?.id,
      revision: semantic?.revision,
      sourceExtractionId: semantic?.sourceExtractionId,
      sourceExtractionRevision: semantic?.sourceExtractionRevision,
      sourceImportRevision: semantic?.sourceImportRevision,
      sourceFingerprint: semantic?.sourceFingerprint,
      result: semantic?.result,
    });
  }

  function createInitialState(input, now = timestampNow()) {
    if (!text(input?.projectId) || !text(input?.sourceSemanticAnalysisId) || !positiveInteger(input?.sourceSemanticAnalysisRevision) || !validFingerprint(input?.sourceSemanticFingerprint) || !positiveInteger(input?.sourceContentExtractionRevision) || !positiveInteger(input?.sourceImportRevision) || !isTimestamp(now)) {
      throw reviewError("REVIEW_SOURCE_INVALID", "Связь проверки с семантическим анализом повреждена.");
    }
    return {
      id: makeId(), projectId: input.projectId, kind: PROGRESS_KIND, version: VERSION,
      revision: 1, status: "waiting",
      sourceSemanticAnalysisId: input.sourceSemanticAnalysisId,
      sourceSemanticAnalysisRevision: input.sourceSemanticAnalysisRevision,
      sourceSemanticFingerprint: input.sourceSemanticFingerprint,
      sourceContentExtractionRevision: input.sourceContentExtractionRevision,
      sourceImportRevision: input.sourceImportRevision,
      originalSnapshot: null, originalSnapshotFingerprint: null,
      reviewedData: null, decisions: [], unresolvedItems: [], warnings: [],
      validation: emptyValidation(now), confirmedSnapshot: null, auditSnapshots: [],
      operation: null, editBaseRevision: null,
      createdAt: now, updatedAt: now, startedAt: null, confirmedAt: null,
      failedAt: null, interruptedAt: null, lastError: null,
    };
  }

  function buildReviewState(state, semantic, now = timestampNow()) {
    requireMutable(state);
    if (state.status !== "waiting") throw reviewError("REVIEW_BUILD_STATE_INVALID", "Проверка уже была подготовлена.");
    assertSemanticMatchesState(state, semantic);
    const originalSnapshot = buildOriginalSnapshot(state.projectId, semantic);
    const reviewedData = buildReviewedData(state.projectId, semantic);
    const next = copy(state);
    next.revision += 1;
    next.originalSnapshot = originalSnapshot;
    next.originalSnapshotFingerprint = fingerprint(originalSnapshot);
    next.reviewedData = reviewedData;
    next.decisions = summarizeDecisions(reviewedData.items);
    next.startedAt = next.startedAt || now;
    next.updatedAt = now;
    next.operation = null;
    next.lastError = null;
    next.validation = validateReviewedData(next, sourceDescriptor(semantic), now);
    next.unresolvedItems = unresolvedIds(reviewedData.items);
    next.warnings = copy(next.validation.warnings);
    next.status = next.validation.errors.length ? "needs_attention" : next.validation.canConfirm ? "ready_to_confirm" : "reviewing";
    return next;
  }

  function beginOperation(state, type, now = timestampNow()) {
    if (!["build", "rebase", "confirm"].includes(type)) throw reviewError("REVIEW_OPERATION_INVALID", "Неизвестная операция проверки.");
    if (state?.status === "confirmed" && type === "rebase") requireValidState(state); else requireMutable(state);
    if (state.operation?.status === "in_progress" && state.operation.type === type) return copy(state);
    const next = copy(state);
    next.revision += 1;
    next.updatedAt = now;
    next.startedAt = next.startedAt || now;
    next.operation = { operationId: makeId(), type, status: "in_progress", startedAt: now, baseRevision: state.revision };
    next.interruptedAt = null;
    return next;
  }

  function recoverInterruptedState(state, now = timestampNow()) {
    if (!state?.operation || state.operation.status !== "in_progress") return copy(state);
    if (state.status === "confirmed" && state.confirmedSnapshot && state.operation.type === "confirm") return copy(state);
    const next = copy(state);
    next.revision += 1;
    next.updatedAt = now;
    next.interruptedAt = now;
    next.operation = null;
    const code = state.operation.type === "build" ? "REVIEW_BUILD_INTERRUPTED" : state.operation.type === "rebase" ? "REVIEW_REBASE_INTERRUPTED" : "REVIEW_CONFIRM_INTERRUPTED";
    next.lastError = { code };
    if (state.status === "confirmed" && state.confirmedSnapshot) next.status = "confirmed";
    else if (state.operation.type === "build" && !state.reviewedData) next.status = "waiting";
    else next.status = "needs_attention";
    return next;
  }

  function buildOriginalSnapshot(projectId, semantic) {
    return deepFreeze(copy({
      schemaVersion: 1,
      projectId,
      semanticAnalysisId: semantic.id,
      semanticAnalysisRevision: semantic.revision,
      semanticFingerprint: semanticFingerprint(semantic),
      sourceContentExtractionRevision: semantic.sourceExtractionRevision,
      sourceImportRevision: semantic.sourceImportRevision,
      result: semantic.result,
    }));
  }

  function buildReviewedData(projectId, semantic) {
    const result = semantic.result || {};
    const items = [];
    const add = (category, subtype, originalValue, source = {}, identity = "") => {
      if (originalValue === undefined || originalValue === null || originalValue === "") return;
      const evidence = normalizeEvidence(source.evidence || evidenceForCategory(result, category));
      const sourceOffsets = offsetsFromEvidence(evidence, source);
      const item = {
        itemId: stableId("item", { category, subtype, originalValue, identity, sourceOffsets, evidence: evidence.map(evidenceIdentity) }),
        projectId, category, subtype, identity: String(identity || ""),
        originalValue: copy(originalValue), reviewedValue: copy(originalValue),
        unit: source.unit ?? unitFromValue(originalValue), status: "pending",
        severity: "informational", confidence: finiteOrNull(source.confidence),
        evidence, sourceOffsets, decision: "unresolved", notes: "", updatedAt: null,
        metadata: copy(source.metadata || {}),
      };
      item.severity = classifyReviewItem(item);
      items.push(item);
    };

    add("craft", "craft", result.craft?.value, { confidence: result.craft?.confidence });
    add("product", "garment", result.garment?.type, result.garment || {});
    for (const key of ["method", "direction", "workedInRound", "seamless"]) add("construction", key, result.construction?.[key], result.construction || {}, key);
    for (const [index, value] of array(result.construction?.features).entries()) add("construction", "feature", value, result.construction || {}, index);
    for (const [index, value] of array(result.sizing?.labels).entries()) add("sizes", "label", value, { confidence: result.sizing?.confidence }, index);
    for (const [index, value] of array(result.sizing?.measurements).entries()) add("sizes", "measurement", value, { ...value, confidence: value?.confidence ?? result.sizing?.confidence, evidence: value?.evidence, metadata: { conflictKey: `measurement:${String(value?.name || value?.type || index)}:${String(value?.unit || "")}` } }, value?.name || value?.type || index);
    for (const subtype of ["stitches", "rows"]) for (const [index, value] of array(result.gauge?.[subtype]).entries()) add("gauge", subtype, value, { ...value, confidence: value?.confidence ?? result.gauge?.confidence, evidence: value?.evidence || result.gauge?.evidence, metadata: { conflictKey: `gauge:${subtype}:${String(value?.per || "")}:${String(value?.unit || "")}` } }, index);
    for (const subtype of ["names", "weights", "fiberContent", "amounts", "colors"]) for (const [index, value] of array(result.yarn?.[subtype]).entries()) add("yarn", subtype, value, { ...(object(value) ? value : {}), confidence: object(value)?.confidence ?? result.yarn?.confidence, evidence: object(value)?.evidence || result.yarn?.evidence }, index);
    for (const subtype of ["needleSizes", "hookSizes", "other"]) for (const [index, value] of array(result.tools?.[subtype]).entries()) add("tools", subtype, value, { ...(object(value) ? value : {}), confidence: object(value)?.confidence ?? result.tools?.confidence, evidence: object(value)?.evidence, metadata: { conflictKey: `${subtype}:primary` } }, index);
    if (result.tools?.cableNeedleMentioned) add("tools", "cableNeedleMentioned", true, { confidence: result.tools?.confidence });
    if (result.tools?.stitchMarkersMentioned) add("tools", "stitchMarkersMentioned", true, { confidence: result.tools?.confidence });
    for (const [index, value] of array(result.abbreviations).entries()) add("abbreviations", "definition", value, { ...value, evidence: value?.evidence, metadata: { conflictKey: `abbreviation:${String(value?.abbreviation || value?.short || "")}` } }, value?.abbreviation || index);
    for (const [index, value] of array(result.sections).entries()) add("sections", "section", value, { ...value, evidence: value?.evidence }, value?.id || value?.title || value?.name || index);
    for (const [index, value] of array(result.rowInstructions).entries()) add("rows", "row", value, { ...value, evidence: value?.evidence }, value?.rowNumber || value?.number || value?.identity || index);
    for (const [index, value] of array(result.repeatInstructions).entries()) add("repeats", "repeat", value, { ...value, evidence: value?.evidence }, value?.rowIdentity || value?.start || index);
    for (const subtype of ["castOn", "bindOff", "stitches", "rows", "repeats"]) for (const [index, value] of array(result.counts?.[subtype]).entries()) add("counts", subtype, value, { ...value, evidence: value?.evidence, metadata: value?.rowIdentity ? { conflictKey: `count:${subtype}:${String(value.rowIdentity)}` } : {} }, value?.rowIdentity || value?.start || index);

    items.sort(compareItems);
    const conflictGroups = buildConflictGroups(items);
    for (const group of conflictGroups) for (const itemId of group.itemIds) {
      const item = items.find((candidate) => candidate.itemId === itemId);
      item.status = "conflict";
      item.severity = group.severity;
    }
    return { schemaVersion: 1, projectId, items, conflictGroups };
  }

  function classifyReviewItem(item) {
    const category = item?.category;
    const value = item?.reviewedValue;
    if (category === "craft") return supportedCraft(value) ? "important" : "critical";
    if (category === "product" && unknownValue(value)) return "critical";
    if (["sizes", "gauge", "tools", "counts", "repeats"].includes(category) && hasImpossibleNumber(value)) return "critical";
    if (category === "gauge" && unitConflictInValue(value)) return "critical";
    if (["counts", "repeats"].includes(category) && structureBroken(value)) return "critical";
    if (["yarn", "tools", "sizes", "abbreviations", "rows"].includes(category)) return "important";
    if (["sections", "metadata", "notes", "construction"].includes(category)) return "informational";
    return "important";
  }

  function buildConflictGroups(items) {
    const buckets = new Map();
    for (const item of items) {
      const key = text(item.metadata?.conflictKey);
      if (!key) continue;
      const bucketKey = `${item.category}:${key}`;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
      buckets.get(bucketKey).push(item);
    }
    const groups = [];
    for (const [key, candidates] of buckets) {
      const values = new Set(candidates.map((item) => canonicalize(item.originalValue)));
      if (candidates.length < 2 || values.size < 2) continue;
      const category = candidates[0].category;
      const severity = ["gauge", "sizes", "counts", "repeats"].includes(category) ? "critical" : "important";
      groups.push({
        conflictId: stableId("conflict", { key, itemIds: candidates.map((item) => item.itemId).sort() }),
        category, itemIds: candidates.map((item) => item.itemId).sort(),
        reasonCode: conflictReason(category), severity,
        selectedItemId: null, customValue: null, status: "unresolved",
      });
    }
    return groups.sort((left, right) => lexical(left.conflictId, right.conflictId));
  }

  function updateItem(state, itemId, patch, now = timestampNow()) {
    requireMutable(state);
    const next = copy(state);
    const item = next.reviewedData?.items?.find((candidate) => candidate.itemId === itemId);
    if (!item) throw reviewError("REVIEW_ITEM_NOT_FOUND", "Элемент проверки не найден.", { itemId });
    if (patch.reviewedValue !== undefined) item.reviewedValue = copy(patch.reviewedValue);
    if (patch.decision !== undefined) {
      if (!DECISIONS.includes(patch.decision)) throw reviewError("REVIEW_DECISION_INVALID", "Выбрано недопустимое решение.", { itemId });
      item.decision = patch.decision;
    }
    if (patch.notes !== undefined) item.notes = String(patch.notes).slice(0, 2000);
    if (item.decision === "accepted") item.reviewedValue = copy(item.originalValue);
    if (item.decision === "corrected" && canonicalize(item.reviewedValue) === canonicalize(item.originalValue)) item.decision = "accepted";
    item.status = item.decision === "unresolved" ? "pending" : "reviewed";
    item.severity = classifyReviewItem(item);
    item.updatedAt = now;
    return finalizeEdit(next, now);
  }

  function resolveConflict(state, conflictId, resolution, now = timestampNow()) {
    requireMutable(state);
    const next = copy(state);
    const group = next.reviewedData?.conflictGroups?.find((candidate) => candidate.conflictId === conflictId);
    if (!group) throw reviewError("REVIEW_CONFLICT_NOT_FOUND", "Группа конфликта не найдена.", { conflictId });
    const candidates = group.itemIds.map((itemId) => next.reviewedData.items.find((item) => item.itemId === itemId));
    if (candidates.some((item) => !item)) throw reviewError("REVIEW_CONFLICT_ITEM_MISSING", "В конфликте отсутствует один из вариантов.", { conflictId });
    const mode = resolution?.mode;
    group.selectedItemId = null;
    group.customValue = null;
    if (mode === "select") {
      if (!group.itemIds.includes(resolution.itemId)) throw reviewError("REVIEW_CONFLICT_SELECTION_INVALID", "Выбранный вариант не входит в конфликт.", { conflictId });
      group.selectedItemId = resolution.itemId;
      group.status = "resolved";
      for (const item of candidates) { item.decision = item.itemId === resolution.itemId ? "accepted" : "rejected"; item.status = "reviewed"; item.updatedAt = now; }
    } else if (mode === "custom") {
      if (resolution.value === undefined || emptyRequiredValue(resolution.value)) throw reviewError("REVIEW_CONFLICT_CUSTOM_INVALID", "Исправленное значение конфликта пусто.", { conflictId });
      group.customValue = copy(resolution.value);
      group.status = "resolved";
      candidates.forEach((item, index) => { item.decision = index === 0 ? "corrected" : "rejected"; if (index === 0) item.reviewedValue = copy(resolution.value); item.status = "reviewed"; item.updatedAt = now; });
    } else if (mode === "reject_all") {
      group.status = "rejected";
      for (const item of candidates) { item.decision = "rejected"; item.status = "reviewed"; item.updatedAt = now; }
    } else if (mode === "unresolved") {
      group.status = "unresolved";
      for (const item of candidates) { item.decision = "unresolved"; item.status = "conflict"; item.updatedAt = now; }
    } else throw reviewError("REVIEW_CONFLICT_RESOLUTION_INVALID", "Неизвестный способ разрешения конфликта.", { conflictId });
    return finalizeEdit(next, now);
  }

  function validateReviewedData(state, currentSource = null, now = timestampNow()) {
    const errors = [];
    const warnings = [];
    const items = state?.reviewedData?.items;
    const groups = state?.reviewedData?.conflictGroups;
    if (!state || state.kind !== PROGRESS_KIND || state.version !== VERSION || !STATUSES.includes(state.status)) addIssue(errors, "REVIEW_STRUCTURE_INVALID");
    if (!state?.reviewedData || state.reviewedData.schemaVersion !== 1 || !Array.isArray(items) || !Array.isArray(groups)) addIssue(errors, "REVIEW_DATA_STRUCTURE_INVALID");
    if (state?.originalSnapshot && fingerprint(state.originalSnapshot) !== state.originalSnapshotFingerprint) addIssue(errors, "REVIEW_ORIGINAL_SNAPSHOT_MUTATED");
    if (state?.reviewedData?.projectId !== state?.projectId) addIssue(errors, "REVIEW_PROJECT_MISMATCH");
    const ids = new Set();
    const safeItems = Array.isArray(items) ? items : [];
    const safeGroups = Array.isArray(groups) ? groups : [];
    const resolvedAlternativeIds = new Set(safeGroups.filter((group) => group.status === "resolved").flatMap((group) => group.itemIds.filter((itemId) => itemId !== group.selectedItemId)));
    for (const item of safeItems) {
      if (!text(item?.itemId) || ids.has(item.itemId)) addIssue(errors, "REVIEW_ITEM_ID_DUPLICATE", item?.itemId || null);
      ids.add(item?.itemId);
      if (item?.projectId !== state.projectId) addIssue(errors, "REVIEW_ITEM_PROJECT_MISMATCH", item?.itemId || null);
      if (!DECISIONS.includes(item?.decision)) addIssue(errors, "REVIEW_DECISION_INVALID", item?.itemId || null);
      if (!SEVERITIES.includes(item?.severity)) addIssue(errors, "REVIEW_SEVERITY_INVALID", item?.itemId || null);
      if (!validUnit(item?.unit)) addIssue(errors, "REVIEW_UNIT_INVALID", item?.itemId || null);
      if (containsNonFiniteNumber(item?.reviewedValue)) addIssue(errors, "REVIEW_NUMBER_NOT_FINITE", item?.itemId || null);
      if (["sizes", "gauge", "tools"].includes(item?.category) && hasImpossibleNumber(item?.reviewedValue)) addIssue(errors, "REVIEW_NUMBER_NOT_POSITIVE", item?.itemId || null);
      if (["craft", "product"].includes(item?.category) && item.decision !== "rejected" && emptyRequiredValue(item?.reviewedValue)) addIssue(errors, "REVIEW_REQUIRED_TEXT_EMPTY", item?.itemId || null);
      if (item?.decision === "accepted" && canonicalize(item.reviewedValue) !== canonicalize(item.originalValue)) addIssue(errors, "REVIEW_ACCEPTED_VALUE_CHANGED", item.itemId);
      if (item?.decision === "corrected" && canonicalize(item.reviewedValue) === canonicalize(item.originalValue)) addIssue(warnings, "REVIEW_CORRECTION_UNCHANGED", item.itemId);
      if (item?.decision === "unresolved") addIssue(warnings, `REVIEW_UNRESOLVED_${String(item.severity).toUpperCase()}`, item.itemId);
      if (item?.decision === "rejected" && item?.severity === "critical" && !resolvedAlternativeIds.has(item.itemId)) addIssue(errors, "REVIEW_REQUIRED_VALUE_REJECTED", item.itemId);
    }
    const conflictIds = new Set();
    for (const group of safeGroups) {
      if (!text(group?.conflictId) || conflictIds.has(group.conflictId)) addIssue(errors, "REVIEW_CONFLICT_ID_DUPLICATE", null, group?.conflictId || null);
      conflictIds.add(group?.conflictId);
      if (!Array.isArray(group?.itemIds) || group.itemIds.length < 2 || group.itemIds.some((itemId) => !ids.has(itemId))) addIssue(errors, "REVIEW_CONFLICT_ITEM_MISSING", null, group?.conflictId || null);
      if (!["unresolved", "resolved", "rejected"].includes(group?.status)) addIssue(errors, "REVIEW_CONFLICT_STATUS_INVALID", null, group?.conflictId || null);
      if (group?.selectedItemId && !group.itemIds.includes(group.selectedItemId)) addIssue(errors, "REVIEW_CONFLICT_SELECTION_INVALID", null, group.conflictId);
      if (group?.status === "resolved" && !group.selectedItemId && group.customValue === null) addIssue(errors, "REVIEW_CONFLICT_RESOLUTION_MISSING", null, group.conflictId);
      if (group?.status === "unresolved") addIssue(group.severity === "critical" ? errors : warnings, "REVIEW_CONFLICT_UNRESOLVED", null, group.conflictId);
    }
    if (currentSource) {
      if (state.sourceSemanticAnalysisId !== currentSource.id || state.sourceSemanticAnalysisRevision !== currentSource.revision || state.sourceContentExtractionRevision !== currentSource.sourceContentExtractionRevision || state.sourceImportRevision !== currentSource.sourceImportRevision) addIssue(errors, "REVIEW_SOURCE_REVISION_STALE");
      if (state.sourceSemanticFingerprint !== currentSource.fingerprint) addIssue(errors, "REVIEW_SOURCE_FINGERPRINT_STALE");
    }
    const unresolvedCriticalCount = safeItems.filter((item) => item.decision === "unresolved" && item.severity === "critical").length + safeGroups.filter((group) => group.status === "unresolved" && group.severity === "critical").length;
    const unresolvedImportantCount = safeItems.filter((item) => item.decision === "unresolved" && item.severity === "important").length + safeGroups.filter((group) => group.status === "unresolved" && group.severity === "important").length;
    const unresolvedInformationalCount = safeItems.filter((item) => item.decision === "unresolved" && item.severity === "informational").length + safeGroups.filter((group) => group.status === "unresolved" && group.severity === "informational").length;
    const isValid = errors.length === 0;
    return { isValid, canConfirm: isValid && unresolvedCriticalCount === 0, errors: stableIssues(errors), warnings: stableIssues(warnings), unresolvedCriticalCount, unresolvedImportantCount, unresolvedInformationalCount, validatedAt: now };
  }

  function revalidateState(state, semantic, now = timestampNow()) {
    requireMutable(state);
    const next = copy(state);
    next.revision += 1;
    next.updatedAt = now;
    next.validation = validateReviewedData(next, sourceDescriptor(semantic), now);
    next.decisions = summarizeDecisions(next.reviewedData?.items || []);
    next.unresolvedItems = unresolvedIds(next.reviewedData?.items || []);
    next.warnings = copy(next.validation.warnings);
    next.status = next.validation.errors.length ? "needs_attention" : next.validation.canConfirm ? "ready_to_confirm" : "reviewing";
    next.lastError = next.validation.errors[0] || null;
    return next;
  }

  function confirmState(state, semantic, now = timestampNow()) {
    requireMutable(state);
    assertSemanticMatchesState(state, semantic);
    const validation = validateReviewedData(state, sourceDescriptor(semantic), now);
    if (!validation.canConfirm) throw reviewError("REVIEW_CONFIRM_BLOCKED", "Проверку нельзя подтвердить, пока не устранены обязательные ошибки.", { validation });
    const next = copy(state);
    const included = next.reviewedData.items.filter((item) => ["accepted", "corrected"].includes(item.decision)).map((item) => ({
      itemId: item.itemId, category: item.category, subtype: item.subtype,
      value: copy(item.reviewedValue), unit: item.unit, decision: item.decision,
      notes: item.notes,
      provenance: { originalValue: copy(item.originalValue), confidence: item.confidence, evidence: copy(item.evidence), sourceOffsets: copy(item.sourceOffsets) },
    }));
    included.sort(compareItems);
    const unresolvedWarnings = next.reviewedData.items.filter((item) => item.decision === "unresolved" && item.severity !== "critical").map((item) => ({ code: "REVIEW_UNRESOLVED_NONCRITICAL", itemId: item.itemId, severity: item.severity }));
    const snapshot = {
      schemaVersion: 1, projectId: state.projectId,
      sourceSemanticAnalysisId: state.sourceSemanticAnalysisId,
      sourceSemanticAnalysisRevision: state.sourceSemanticAnalysisRevision,
      sourceSemanticFingerprint: state.sourceSemanticFingerprint,
      sourceContentExtractionRevision: state.sourceContentExtractionRevision,
      sourceImportRevision: state.sourceImportRevision,
      values: included,
      conflictResolutions: next.reviewedData.conflictGroups.filter((group) => group.status !== "unresolved").map(copy),
      warnings: stableIssues([...validation.warnings, ...unresolvedWarnings]),
      validation: copy(validation), confirmedAt: now,
    };
    next.revision += 1;
    next.status = "confirmed";
    next.validation = validation;
    next.confirmedSnapshot = deepFreeze(snapshot);
    next.confirmedAt = now;
    next.updatedAt = now;
    next.operation = null;
    next.lastError = null;
    return next;
  }

  function rebaseState(state, semantic, now = timestampNow()) {
    if (state?.status === "confirmed") requireValidState(state); else requireMutable(state);
    const oldData = copy(state.reviewedData);
    const fresh = buildReviewedData(state.projectId, semantic);
    const oldByKey = exactMatchMap(oldData?.items || []);
    const freshByKey = exactMatchMap(fresh.items);
    const transferWarnings = [];
    for (const [key, freshItems] of freshByKey) {
      const oldItems = oldByKey.get(key) || [];
      if (oldItems.length === 1 && freshItems.length === 1) {
        const oldItem = oldItems[0]; const freshItem = freshItems[0];
        freshItem.decision = oldItem.decision;
        freshItem.notes = oldItem.notes;
        freshItem.updatedAt = oldItem.updatedAt;
        if (oldItem.decision === "corrected") freshItem.reviewedValue = copy(oldItem.reviewedValue);
        if (oldItem.decision === "rejected") freshItem.status = "reviewed";
      } else if (oldItems.length && freshItems.length) {
        for (const item of freshItems) { item.decision = "unresolved"; item.status = "pending"; }
        transferWarnings.push({ code: "REVIEW_REBASE_AMBIGUOUS", itemId: freshItems[0].itemId });
      }
    }
    const next = copy(state);
    next.auditSnapshots = array(next.auditSnapshots);
    next.auditSnapshots.push({ auditId: makeId(), capturedAt: now, sourceSemanticAnalysisRevision: state.sourceSemanticAnalysisRevision, sourceSemanticFingerprint: state.sourceSemanticFingerprint, reviewedData: oldData, decisions: copy(state.decisions), validation: copy(state.validation) });
    next.sourceSemanticAnalysisId = semantic.id;
    next.sourceSemanticAnalysisRevision = semantic.revision;
    next.sourceSemanticFingerprint = semanticFingerprint(semantic);
    next.sourceContentExtractionRevision = semantic.sourceExtractionRevision;
    next.sourceImportRevision = semantic.sourceImportRevision;
    next.originalSnapshot = buildOriginalSnapshot(state.projectId, semantic);
    next.originalSnapshotFingerprint = fingerprint(next.originalSnapshot);
    next.reviewedData = fresh;
    next.revision += 1;
    next.updatedAt = now;
    next.startedAt = next.startedAt || now;
    next.confirmedAt = null;
    next.confirmedSnapshot = null;
    next.operation = null;
    next.validation = validateReviewedData(next, sourceDescriptor(semantic), now);
    next.validation.warnings = stableIssues([...next.validation.warnings, ...transferWarnings]);
    next.decisions = summarizeDecisions(fresh.items);
    next.unresolvedItems = unresolvedIds(fresh.items);
    next.warnings = copy(next.validation.warnings);
    next.status = next.validation.errors.length ? "needs_attention" : next.validation.canConfirm ? "ready_to_confirm" : "reviewing";
    next.lastError = null;
    return next;
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project || null;
    const calculation = array(aggregate?.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null;
    const progress = calculation ? array(aggregate?.progress).filter((entry) => entry.calculation_id === calculation.calculation_id && entry.epoch === 1) : [];
    const extractionProgress = progress.find((entry) => entry.kind === "PATTERN_CONTENT_EXTRACTION") || null;
    const semanticProgress = progress.find((entry) => entry.kind === "PATTERN_SEMANTIC_ANALYSIS") || null;
    const reviewProgress = progress.find((entry) => entry.kind === PROGRESS_KIND) || null;
    const extraction = extractionProgress?.state || null;
    const semantic = semanticProgress?.state || null;
    const review = reviewProgress?.state || null;
    let state = "missing_project"; let reasonCode = "REVIEW_PROJECT_MISSING";
    if (project && calculation && !extraction) { state = "extraction_missing"; reasonCode = "REVIEW_EXTRACTION_MISSING"; }
    else if (project && calculation && extraction && !semantic) { state = "semantic_missing"; reasonCode = "REVIEW_SEMANTIC_MISSING"; }
    else if (semantic?.status === "waiting") { state = "semantic_waiting"; reasonCode = "REVIEW_SEMANTIC_WAITING"; }
    else if (semantic?.status === "analyzing") { state = "semantic_analyzing"; reasonCode = "REVIEW_SEMANTIC_ANALYZING"; }
    else if (semantic?.status === "failed") { state = "semantic_failed"; reasonCode = "REVIEW_SEMANTIC_FAILED"; }
    else if (semantic && !["completed", "partial"].includes(semantic.status)) { state = "semantic_invalid"; reasonCode = "REVIEW_SEMANTIC_INVALID"; }
    else if (semantic?.status === "partial" && criticallyInsufficient(semantic)) { state = "semantic_insufficient"; reasonCode = "REVIEW_SEMANTIC_INSUFFICIENT"; }
    else if (semantic && !review) { state = "review_missing"; reasonCode = null; }
    else if (review) {
      try { requireValidState(review); state = review.status; reasonCode = review.lastError?.code || null; }
      catch { state = "corrupted"; reasonCode = "REVIEW_RECORD_CORRUPTED"; }
      if (state !== "corrupted" && semantic && sourceIsStale(review, semantic)) { state = "stale"; reasonCode = review.sourceSemanticFingerprint !== semanticFingerprint(semantic) ? "REVIEW_SOURCE_FINGERPRINT_STALE" : "REVIEW_SOURCE_REVISION_STALE"; }
    }
    return { state, reasonCode, project, calculation, extractionProgress, extraction, semanticProgress, semantic, reviewProgress, review };
  }

  async function ensureForProject(repository, projectId) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (["missing_project", "extraction_missing", "semantic_missing", "semantic_waiting", "semantic_analyzing", "semantic_failed", "semantic_invalid", "semantic_insufficient"].includes(inspected.state)) return inspected;
    if (inspected.review) {
      if (inspected.review.operation?.status === "in_progress") {
        const recovered = recoverInterruptedState(inspected.review);
        await repository.updatePatternAnalysisReview(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_ANALYSIS_REVIEW_INTERRUPTED", projectStage: `pattern_analysis_review_${recovered.status}`, allowConfirmedRebase: inspected.review.status === "confirmed" && inspected.review.operation?.type === "rebase" });
        inspected = inspectAggregate(await repository.getProject(projectId));
      }
      if (inspected.state === "stale" && inspected.review.status !== "confirmed" && inspected.review.status !== "needs_attention") {
        const stale = copy(inspected.review); stale.revision += 1; stale.status = "needs_attention"; stale.updatedAt = timestampNow(); stale.lastError = { code: inspected.reasonCode };
        stale.validation = validateReviewedData(stale, sourceDescriptor(inspected.semantic));
        await repository.updatePatternAnalysisReview(projectId, inspected.calculation.calculation_id, stale, { operationKind: "PATTERN_ANALYSIS_REVIEW_SOURCE_STALE", projectStage: "pattern_analysis_review_needs_attention" });
        inspected = inspectAggregate(await repository.getProject(projectId));
      }
      return inspected;
    }
    const initial = createInitialState({ projectId, sourceSemanticAnalysisId: inspected.semantic.id, sourceSemanticAnalysisRevision: inspected.semantic.revision, sourceSemanticFingerprint: semanticFingerprint(inspected.semantic), sourceContentExtractionRevision: inspected.semantic.sourceExtractionRevision, sourceImportRevision: inspected.semantic.sourceImportRevision });
    await repository.ensurePatternAnalysisReview(projectId, inspected.calculation.calculation_id, initial, { operationKind: "PATTERN_ANALYSIS_REVIEW_CREATED", projectStage: "pattern_analysis_review_waiting" });
    inspected = inspectAggregate(await repository.getProject(projectId));
    const building = beginOperation(inspected.review, "build");
    await repository.updatePatternAnalysisReview(projectId, inspected.calculation.calculation_id, building, { operationKind: "PATTERN_ANALYSIS_REVIEW_BUILD_STARTED", projectStage: "pattern_analysis_review_waiting" });
    const built = buildReviewState(building, inspected.semantic);
    await repository.updatePatternAnalysisReview(projectId, inspected.calculation.calculation_id, built, { operationKind: "PATTERN_ANALYSIS_REVIEW_BUILT", projectStage: `pattern_analysis_review_${built.status}` });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function saveForProject(repository, projectId, nextState) {
    if (activeOperations.has(projectId)) throw reviewError("REVIEW_OPERATION_BUSY", "Другая операция проверки ещё выполняется.");
    activeOperations.add(projectId);
    try {
      const inspected = inspectAggregate(await repository.getProject(projectId));
      if (!inspected.review || nextState.editBaseRevision !== inspected.review.revision) throw reviewError("REVIEW_STALE_REVISION", "Проверка изменена в другой вкладке. Обновите страницу.");
      const validated = copy(nextState);
      validated.revision = inspected.review.revision + 1;
      validated.editBaseRevision = null;
      validated.validation = validateReviewedData(validated, sourceDescriptor(inspected.semantic));
      validated.decisions = summarizeDecisions(validated.reviewedData.items);
      validated.unresolvedItems = unresolvedIds(validated.reviewedData.items);
      validated.warnings = copy(validated.validation.warnings);
      validated.status = validated.validation.errors.length ? "needs_attention" : validated.validation.canConfirm ? "ready_to_confirm" : "reviewing";
      await repository.updatePatternAnalysisReview(projectId, inspected.calculation.calculation_id, validated, { operationKind: "PATTERN_ANALYSIS_REVIEW_SAVED", projectStage: `pattern_analysis_review_${validated.status}` });
      return inspectAggregate(await repository.getProject(projectId));
    } finally { activeOperations.delete(projectId); }
  }

  async function confirmForProject(repository, projectId) {
    if (activeOperations.has(projectId)) return inspectAggregate(await repository.getProject(projectId));
    activeOperations.add(projectId);
    try {
      let inspected = inspectAggregate(await repository.getProject(projectId));
      if (inspected.review?.status === "confirmed") return inspected;
      if (inspected.state === "stale") throw reviewError("REVIEW_SOURCE_STALE", "Исходный семантический анализ изменился. Сначала обновите проверку.");
      const confirming = beginOperation(inspected.review, "confirm");
      await repository.updatePatternAnalysisReview(projectId, inspected.calculation.calculation_id, confirming, { operationKind: "PATTERN_ANALYSIS_REVIEW_CONFIRM_STARTED", projectStage: "pattern_analysis_review_ready_to_confirm" });
      inspected = inspectAggregate(await repository.getProject(projectId));
      const confirmed = confirmState(inspected.review, inspected.semantic);
      await repository.updatePatternAnalysisReview(projectId, inspected.calculation.calculation_id, confirmed, { operationKind: "PATTERN_ANALYSIS_REVIEW_CONFIRMED", projectStage: "pattern_analysis_review_confirmed" });
      if (globalObject.YarnAIPatternTechnologyDraft?.ensureForProject) {
        await globalObject.YarnAIPatternTechnologyDraft.ensureForProject(repository, projectId);
      }
      return inspectAggregate(await repository.getProject(projectId));
    } finally { activeOperations.delete(projectId); }
  }

  async function rebaseForProject(repository, projectId) {
    if (activeOperations.has(projectId)) throw reviewError("REVIEW_OPERATION_BUSY", "Обновление уже выполняется.");
    activeOperations.add(projectId);
    try {
      let inspected = inspectAggregate(await repository.getProject(projectId));
      if (!inspected.review || !inspected.semantic || !["completed", "partial"].includes(inspected.semantic.status) || criticallyInsufficient(inspected.semantic)) throw reviewError("REVIEW_REBASE_SOURCE_INVALID", "Новый семантический анализ нельзя использовать для обновления.");
      const started = beginOperation(inspected.review, "rebase");
      await repository.updatePatternAnalysisReview(projectId, inspected.calculation.calculation_id, started, { operationKind: "PATTERN_ANALYSIS_REVIEW_REBASE_STARTED", projectStage: "pattern_analysis_review_needs_attention", allowConfirmedRebase: inspected.review.status === "confirmed" });
      inspected = inspectAggregate(await repository.getProject(projectId));
      const rebased = rebaseState(inspected.review, inspected.semantic);
      await repository.updatePatternAnalysisReview(projectId, inspected.calculation.calculation_id, rebased, { operationKind: "PATTERN_ANALYSIS_REVIEW_REBASED", projectStage: `pattern_analysis_review_${rebased.status}`, allowConfirmedRebase: inspected.review.status === "confirmed" });
      return inspectAggregate(await repository.getProject(projectId));
    } finally { activeOperations.delete(projectId); }
  }

  function requireValidState(state) {
    if (!state || state.kind !== PROGRESS_KIND || state.version !== VERSION || !text(state.id) || !text(state.projectId) || !positiveInteger(state.revision) || !STATUSES.includes(state.status) || !text(state.sourceSemanticAnalysisId) || !positiveInteger(state.sourceSemanticAnalysisRevision) || !validFingerprint(state.sourceSemanticFingerprint) || !positiveInteger(state.sourceContentExtractionRevision) || !positiveInteger(state.sourceImportRevision) || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt)) throw reviewError("REVIEW_RECORD_CORRUPTED", "Запись проверки анализа повреждена.");
    if (state.status === "confirmed" && (!state.confirmedSnapshot || !isTimestamp(state.confirmedAt))) throw reviewError("REVIEW_CONFIRMED_SNAPSHOT_MISSING", "У подтверждённой проверки отсутствует snapshot.");
    if (state.status !== "waiting" && (!state.originalSnapshot || !state.reviewedData)) throw reviewError("REVIEW_DATA_STRUCTURE_INVALID", "Рабочие данные проверки отсутствуют.");
    return true;
  }

  function finalizeEdit(next, now) {
    if (next.editBaseRevision === null || next.editBaseRevision === undefined) next.editBaseRevision = next.revision;
    next.revision += 1; next.updatedAt = now; next.confirmedAt = null; next.confirmedSnapshot = null; next.operation = null; next.lastError = null;
    next.validation = validateReviewedData(next, null, now); next.decisions = summarizeDecisions(next.reviewedData.items); next.unresolvedItems = unresolvedIds(next.reviewedData.items); next.warnings = copy(next.validation.warnings);
    next.status = next.validation.errors.length ? "needs_attention" : next.validation.canConfirm ? "ready_to_confirm" : "reviewing";
    return next;
  }

  function exactMatchMap(items) { const map = new Map(); for (const item of items) { const key = exactMatchKey(item); if (!map.has(key)) map.set(key, []); map.get(key).push(item); } return map; }
  function exactMatchKey(item) { return canonicalize({ category: item.category, sourceOffsets: item.sourceOffsets, originalValue: item.originalValue, identity: item.identity, evidenceFingerprint: fingerprint(array(item.evidence).map(evidenceIdentity)) }); }
  function sourceDescriptor(semantic) { return semantic ? { id: semantic.id, revision: semantic.revision, fingerprint: semanticFingerprint(semantic), sourceContentExtractionRevision: semantic.sourceExtractionRevision, sourceImportRevision: semantic.sourceImportRevision } : null; }
  function sourceIsStale(review, semantic) { const source = sourceDescriptor(semantic); return review.sourceSemanticAnalysisId !== source.id || review.sourceSemanticAnalysisRevision !== source.revision || review.sourceSemanticFingerprint !== source.fingerprint || review.sourceContentExtractionRevision !== source.sourceContentExtractionRevision || review.sourceImportRevision !== source.sourceImportRevision; }
  function assertSemanticMatchesState(state, semantic) { if (sourceIsStale(state, semantic)) throw reviewError("REVIEW_SOURCE_STALE", "Исходный семантический анализ изменился."); }
  function criticallyInsufficient(semantic) { return !semantic?.result || Number(semantic.result.sourceSummary?.textLength || 0) <= 0 || !Array.isArray(semantic.result.evidence) || (semantic.result.analysisSummary?.recognizedFields === 0 && array(semantic.result.rowInstructions).length === 0); }
  function requireMutable(state) { requireValidState(state); if (state.status === "confirmed") throw reviewError("REVIEW_CONFIRMED_IMMUTABLE", "Подтверждённая ревизия недоступна для редактирования."); }
  function emptyValidation(now) { return { isValid: false, canConfirm: false, errors: [], warnings: [], unresolvedCriticalCount: 0, unresolvedImportantCount: 0, unresolvedInformationalCount: 0, validatedAt: now }; }
  function summarizeDecisions(items) { return DECISIONS.map((decision) => ({ decision, itemIds: items.filter((item) => item.decision === decision).map((item) => item.itemId).sort() })); }
  function unresolvedIds(items) { return items.filter((item) => item.decision === "unresolved").map((item) => item.itemId).sort(); }
  function addIssue(target, code, itemId = null, conflictId = null) { target.push({ code, itemId, conflictId }); }
  function stableIssues(issues) { const unique = new Map(); for (const issue of issues) { const normalized = { code: issue.code, itemId: issue.itemId ?? null, conflictId: issue.conflictId ?? null }; if (issue.severity !== undefined) normalized.severity = issue.severity; unique.set(canonicalize(normalized), normalized); } return [...unique.values()].sort((a, b) => lexical(a.code, b.code) || lexical(String(a.itemId), String(b.itemId)) || lexical(String(a.conflictId), String(b.conflictId))); }
  function stableId(prefix, value) { return `${prefix}:${fingerprint(value).slice(8)}`; }
  function normalizeEvidence(value) { const input = Array.isArray(value) ? value : value ? [value] : []; return input.slice(0, 8).map((entry) => ({ sourceFileId: entry?.sourceFileId ?? null, sourceFileName: entry?.sourceFileName ?? null, start: nonNegativeInteger(entry?.start), end: nonNegativeInteger(entry?.end), text: String(entry?.text ?? "").slice(0, 500), ruleId: entry?.ruleId ?? null })); }
  function evidenceForCategory(result, category) { const key = category === "product" ? "garment" : category === "sizes" ? "sizing" : category; return result?.[key]?.evidence || []; }
  function offsetsFromEvidence(evidence, source) { if (evidence.length) return evidence.map((entry) => ({ sourceFileId: entry.sourceFileId, start: entry.start, end: entry.end })); if (nonNegativeInteger(source?.start) !== null && nonNegativeInteger(source?.end) !== null) return [{ sourceFileId: source?.sourceFileId ?? null, start: source.start, end: source.end }]; return []; }
  function evidenceIdentity(entry) { return { sourceFileId: entry.sourceFileId, start: entry.start, end: entry.end, text: entry.text, ruleId: entry.ruleId }; }
  function conflictReason(category) { return category === "gauge" ? "CONFLICTING_GAUGE" : category === "sizes" ? "CONFLICTING_SIZE" : category === "tools" ? "CONFLICTING_TOOL_SIZE" : category === "abbreviations" ? "CONFLICTING_ABBREVIATION" : category === "counts" ? "CONFLICTING_ROW_COUNT" : "INCOMPATIBLE_CANDIDATES"; }
  function supportedCraft(value) { const candidate = object(value)?.value ?? value; return candidate === "knitting"; }
  function unknownValue(value) { const candidate = object(value)?.value ?? object(value)?.type ?? value; return candidate === "unknown" || candidate === "ambiguous" || candidate === null || candidate === ""; }
  function unitConflictInValue(value) { return object(value) && Array.isArray(value.units) && new Set(value.units).size > 1; }
  function structureBroken(value) { if (!object(value)) return false; if (value.start !== undefined && value.end !== undefined && Number(value.end) < Number(value.start)) return true; if (value.repeatCount !== undefined && Number(value.repeatCount) <= 0) return true; return false; }
  function numericCandidates(value, target = []) { if (typeof value === "number") target.push(value); else if (Array.isArray(value)) for (const entry of value) numericCandidates(entry, target); else if (object(value)) for (const [key, entry] of Object.entries(value)) if (["value", "length", "per", "repeatCount", "count", "width", "height", "size"].includes(key)) numericCandidates(entry, target); return target; }
  function hasImpossibleNumber(value) { return numericCandidates(value).some((entry) => !Number.isFinite(entry) || entry <= 0); }
  function containsNonFiniteNumber(value) { if (typeof value === "number") return !Number.isFinite(value); if (Array.isArray(value)) return value.some(containsNonFiniteNumber); if (object(value)) return Object.values(value).some(containsNonFiniteNumber); return false; }
  function emptyRequiredValue(value) { if (typeof value === "string") return !value.trim(); if (value === null || value === undefined) return true; if (object(value)) { const candidate = value.value ?? value.type ?? value.name ?? value.text ?? value.instructionText; return candidate !== undefined ? emptyRequiredValue(candidate) : false; } return false; }
  function validUnit(value) { return UNITS.includes(value ?? null); }
  function unitFromValue(value) { return object(value) && typeof value.unit === "string" ? value.unit : null; }
  function compareItems(left, right) { return lexical(String(left.category), String(right.category)) || lexical(String(left.subtype), String(right.subtype)) || lexical(String(left.itemId), String(right.itemId)); }
  function finiteOrNull(value) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : null; }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `review:${Date.now()}:${Math.random()}`; }
  function timestampNow() { return new Date().toISOString(); }
  function validFingerprint(value) { const candidate = String(value || ""); if (!candidate.startsWith("fnv1a32:") || candidate.length !== 16) return false; for (const character of candidate.slice(8)) if (!"0123456789abcdef".includes(character)) return false; return true; }
  function isTimestamp(value) { return typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)); }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : null; }
  function nonNegativeInteger(value) { return Number.isInteger(value) && value >= 0 ? value : null; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function reviewError(code, message, details = {}) { return new PatternAnalysisReviewError(code, message, details); }

  const api = { VERSION, PROGRESS_KIND, STATUSES, DECISIONS, SEVERITIES, UNITS, PatternAnalysisReviewError, canonicalize, fingerprint, semanticFingerprint, createInitialState, beginOperation, recoverInterruptedState, buildOriginalSnapshot, buildReviewedData, buildReviewState, classifyReviewItem, buildConflictGroups, updateItem, resolveConflict, validateReviewedData, revalidateState, confirmState, rebaseState, inspectAggregate, ensureForProject, saveForProject, confirmForProject, rebaseForProject, requireValidState, sourceDescriptor };
  globalObject.YarnAIPatternAnalysisReview = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
