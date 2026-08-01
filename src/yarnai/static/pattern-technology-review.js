"use strict";

(function exposePatternTechnologyReview(globalObject) {
  const VERSION = 1;
  const REVIEW_ALGORITHM_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_TECHNOLOGY_REVIEW";
  const STATUSES = Object.freeze(["waiting", "reviewing", "needs_attention", "confirmed", "stale", "failed"]);
  const DECISIONS = Object.freeze(["pending", "accepted", "corrected", "rejected", "unresolved", "not_applicable"]);
  const CORRECTION_TYPES = Object.freeze([
    "product_name", "component_name", "section_name", "size", "unit", "stitch_count",
    "row_count", "gauge", "tool_number", "yarn_weight", "yarn_category", "repeat_count",
    "abbreviation_definition", "component_assignment", "section_order", "range", "user_comment",
  ]);
  const OPERATION_TYPES = Object.freeze([
    "cast_on", "knit", "purl", "work_pattern", "repeat", "increase", "decrease",
    "bind_off", "hold_stitches", "pick_up_stitches", "join", "seam", "finish", "unknown",
  ]);
  const VALID_UNITS = Object.freeze([
    null, "", "cm", "mm", "m", "in", "inch", "inches", "stitches", "rows", "rounds",
    "repeats", "g", "kg", "yd", "oz", "number", "size", "%", "mm needles", "us",
  ]);
  const AUDIT_LIMIT = 24;
  const NOTE_LIMIT = 500;
  const ERROR_CODES = Object.freeze([
    "SOURCE_DRAFT_MISSING", "SOURCE_DRAFT_STATUS_INVALID", "SOURCE_DRAFT_STALE",
    "SOURCE_DRAFT_REVISION_MISMATCH", "SOURCE_DRAFT_FINGERPRINT_MISMATCH",
    "SOURCE_VALIDATION_FINGERPRINT_MISMATCH", "SOURCE_CRITICAL_ISSUES_FINGERPRINT_MISMATCH",
    "OWNERSHIP_MISMATCH", "SOURCE_REFERENCE_INVALID", "REVIEW_DECISION_INVALID",
    "REVIEW_DECISION_DUPLICATE", "REQUIRED_DECISION_PENDING", "CORRECTION_TARGET_MISSING",
    "CORRECTION_TYPE_INVALID", "CORRECTION_VALUE_INVALID", "CORRECTION_UNIT_INCOMPATIBLE",
    "CORRECTION_RANGE_INVALID", "CORRECTION_REPEAT_INVALID", "CORRECTION_COUNT_INVALID",
    "CORRECTION_PROVENANCE_INVALID", "CONFLICT_UNRESOLVED", "CRITICAL_ISSUE_UNRESOLVED",
    "SOURCE_SNAPSHOT_MUTATED", "CONFIRMED_SNAPSHOT_INVALID",
    "CONFIRMED_SNAPSHOT_FINGERPRINT_MISMATCH", "IMPORT_SOURCE_IDENTITY_UNPROVEN",
  ]);
  const activeOperations = new Set();

  class PatternTechnologyReviewError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternTechnologyReviewError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    if (typeof value === "number" && !Number.isFinite(value)) throw reviewError("CORRECTION_VALUE_INVALID", "Недопустимое числовое значение.");
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

  function collectSourceIssues(draftResult) {
    const tagged = [];
    for (const [kind, entries] of [
      ["missing_information", array(draftResult?.missingInformation)],
      ["conflict", array(draftResult?.conflicts)],
      ["warning", array(draftResult?.warnings)],
    ]) {
      entries.forEach((entry, index) => {
        const issue = copy(entry);
        issue.id = text(issue.id) || stableId(`issue:${kind}`, { index, issue });
        issue.issueKind = kind;
        issue.level = normalizeLevel(issue.level);
        tagged.push(issue);
      });
    }
    return tagged;
  }

  function collectCriticalIssues(draftResult) {
    return collectSourceIssues(draftResult)
      .filter((entry) => entry.level === "critical" && !entry.resolved)
      .map((entry) => ({ code: entry.code, entityId: entry.entityIds?.[0] ?? entry.entityId ?? null, level: "critical" }))
      .sort(compareIssues);
  }

  function validateSourceDraft(draft, projectId = draft?.projectId) {
    const critical = [];
    const add = (code, targetId = null) => pushUnique(critical, issue(code, targetId));
    if (!draft) add("SOURCE_DRAFT_MISSING");
    if (draft && draft.kind !== "PATTERN_TECHNOLOGY_DRAFT") add("SOURCE_REFERENCE_INVALID");
    if (draft && draft.projectId !== projectId || draft?.sourceProjectId !== projectId || draft?.draftResult?.projectSummary?.projectId !== projectId) add("OWNERSHIP_MISMATCH");
    if (draft && !["ready", "needs_attention"].includes(draft.status)) add("SOURCE_DRAFT_STATUS_INVALID");
    if (draft && (!positiveInteger(draft.revision) || !positiveInteger(draft.algorithmVersion) || !text(draft.id))) add("SOURCE_REFERENCE_INVALID");
    if (draft && (!draft.draftResult || !object(draft.validation) || !Array.isArray(draft.audit))) add("SOURCE_REFERENCE_INVALID");
    if (draft?.draftResult && fingerprintSafe(draft.draftResult) !== draft.draftFingerprint) add("SOURCE_DRAFT_FINGERPRINT_MISMATCH");
    if (draft?.draftResult && fingerprintSafe(collectCriticalIssues(draft.draftResult)) !== draft.criticalIssuesFingerprint) add("SOURCE_CRITICAL_ISSUES_FINGERPRINT_MISMATCH");
    if (array(draft?.draftResult?.operations).some((entry) => !OPERATION_TYPES.includes(entry?.type))) add("SOURCE_REFERENCE_INVALID");
    if (draft && (!text(draft.sourceReviewId) || !text(draft.sourceSemanticAnalysisId) || !positiveInteger(draft.sourceReviewRevision) || !positiveInteger(draft.sourceSemanticAnalysisRevision))) add("SOURCE_REFERENCE_INVALID");
    if (draft && draft.sourceImportRevision !== null && draft.sourceImportRevision !== undefined && !positiveInteger(draft.sourceImportRevision)) add("SOURCE_REFERENCE_INVALID");
    return { isValid: critical.length === 0, critical, nonCritical: [], informational: [] };
  }

  function createInitialState(projectId, sourceDraft, source = {}, now = timestampNow()) {
    const sourceValidation = validateSourceDraft(sourceDraft, projectId);
    if (!sourceValidation.isValid) throw reviewError(sourceValidation.critical[0].code, "Stage 21 можно создать только из валидного черновика Stage 20.");
    if (!isTimestamp(now)) throw reviewError("SOURCE_REFERENCE_INVALID", "Дата создания review повреждена.");
    const sourceIssues = collectSourceIssues(sourceDraft.draftResult);
    const immutableSourceSnapshot = deepFreeze({
      schemaVersion: 1,
      sourceDraftIdentity: {
        projectId,
        progressId: source.progressId ?? null,
        id: sourceDraft.id,
        kind: sourceDraft.kind,
        version: sourceDraft.version,
        algorithmVersion: sourceDraft.algorithmVersion,
        revision: sourceDraft.revision,
      },
      sourceReviewIdentity: { id: sourceDraft.sourceReviewId, revision: sourceDraft.sourceReviewRevision, projectId },
      sourceSemanticIdentity: { id: sourceDraft.sourceSemanticAnalysisId, revision: sourceDraft.sourceSemanticAnalysisRevision, projectId },
      sourceImportRevision: sourceDraft.sourceImportRevision ?? null,
      draftFingerprint: sourceDraft.draftFingerprint,
      validationFingerprint: fingerprint(sourceDraft.validation),
      criticalIssuesFingerprint: sourceDraft.criticalIssuesFingerprint,
      structuredDraft: copy(sourceDraft.draftResult),
      validation: copy(sourceDraft.validation),
      criticalIssues: sourceIssues.filter((entry) => entry.level === "critical"),
      nonCriticalIssues: sourceIssues.filter((entry) => entry.level === "non_critical"),
      informationalIssues: sourceIssues.filter((entry) => entry.level === "informational"),
      assumptions: copy(array(sourceDraft.draftResult.assumptions)),
      missingInformation: copy(array(sourceDraft.draftResult.missingInformation)),
      conflicts: copy(array(sourceDraft.draftResult.conflicts)),
      warnings: copy(array(sourceDraft.draftResult.warnings)),
      provenance: copy(array(sourceDraft.draftResult.provenance)),
    });
    const targets = buildReviewTargets(immutableSourceSnapshot);
    const id = makeId();
    const state = {
      id, projectId, kind: PROGRESS_KIND, version: VERSION, reviewAlgorithmVersion: REVIEW_ALGORITHM_VERSION,
      revision: 1, status: "waiting", createdAt: now, updatedAt: now, confirmedAt: null,
      sourceDraftProgressId: source.progressId ?? null,
      sourceDraftId: sourceDraft.id, sourceDraftRevision: sourceDraft.revision,
      sourceReviewId: sourceDraft.sourceReviewId, sourceReviewRevision: sourceDraft.sourceReviewRevision,
      sourceSemanticAnalysisId: sourceDraft.sourceSemanticAnalysisId,
      sourceSemanticAnalysisRevision: sourceDraft.sourceSemanticAnalysisRevision,
      sourceImportRevision: sourceDraft.sourceImportRevision ?? null,
      sourceDraftAlgorithmVersion: sourceDraft.algorithmVersion,
      sourceDraftFingerprint: sourceDraft.draftFingerprint,
      sourceValidationFingerprint: fingerprint(sourceDraft.validation),
      sourceCriticalIssuesFingerprint: sourceDraft.criticalIssuesFingerprint,
      immutableSourceSnapshot,
      immutableSourceSnapshotFingerprint: fingerprint(immutableSourceSnapshot),
      reviewState: { startedAt: null, lastValidatedAt: null, targets, operation: null },
      decisions: targets.map((target) => ({ decisionId: stableId("decision", { reviewId: id, targetId: target.id }), targetId: target.id, decision: "pending", selectedValue: null, comment: "", updatedAt: now, revision: 1 })),
      corrections: [], rejectedFindings: [], unresolvedItems: [], userNotes: [],
      validation: emptyValidation(now, 1), confirmedSnapshot: null, confirmedSnapshotFingerprint: null,
      audit: [], lastError: null,
    };
    appendAudit(state, auditEntry("created", state, now));
    state.validation = validateReviewState(state, sourceDraft, now);
    return deepFreeze(copy(state));
  }

  function buildReviewTargets(snapshot) {
    const result = snapshot.structuredDraft;
    const targets = [];
    const addEntity = (entity, category) => {
      if (!entity || !text(entity.id) || targets.some((entry) => entry.id === entity.id)) return;
      targets.push({
        id: entity.id, category, targetKind: "value", required: true, blocking: true,
        originalValue: copy(displayValue(entity)), unit: entity.unit ?? entity.normalized?.unit ?? null,
        provenanceRefs: copy(array(entity.provenanceRefs)), allowedCorrections: allowedCorrections(category, entity),
      });
    };
    addEntity(result.craft, "craft");
    addEntity(result.product, "product");
    for (const category of ["construction", "sizes", "materials", "yarn", "tools", "gauge", "components", "sections", "operations", "rowInstructions", "repeats", "stitchCountChanges", "finishing", "abbreviations", "assumptions"]) {
      for (const entity of array(result[category])) addEntity(entity, category);
    }
    const issues = [...snapshot.criticalIssues, ...snapshot.nonCriticalIssues, ...snapshot.informationalIssues];
    for (const sourceIssue of issues) {
      const resolvable = issueResolutionModel(sourceIssue);
      targets.push({
        id: sourceIssue.id, category: sourceIssue.issueKind, targetKind: "finding",
        required: sourceIssue.level === "critical", blocking: sourceIssue.level === "critical",
        level: sourceIssue.level, code: sourceIssue.code, originalValue: copy(sourceIssue), unit: null,
        provenanceRefs: copy(array(sourceIssue.provenanceRefs)), allowedCorrections: resolvable.corrections,
        userResolvable: resolvable.userResolvable, allowsAbsence: resolvable.allowsAbsence,
        conflictValues: conflictValues(sourceIssue),
      });
    }
    return targets;
  }

  function allowedCorrections(category, entity) {
    const map = {
      product: ["product_name"], components: ["component_name"], sections: ["section_name", "component_assignment", "section_order"],
      sizes: ["size", "unit"], materials: ["yarn_weight", "yarn_category", "unit"], yarn: ["yarn_weight", "yarn_category", "unit"],
      tools: ["tool_number", "unit"], gauge: ["gauge", "unit"], abbreviations: ["abbreviation_definition"],
      repeats: ["repeat_count", "range"], rowInstructions: ["row_count", "range"], operations: ["stitch_count", "row_count", "repeat_count", "range", "component_assignment"],
      stitchCountChanges: ["stitch_count"],
    };
    const values = copy(map[category] || []);
    if (entity?.sectionType === "unassigned" && !values.includes("component_assignment")) values.push("component_assignment");
    values.push("user_comment");
    return values;
  }

  function issueResolutionModel(sourceIssue) {
    if (sourceIssue.issueKind === "conflict") return { userResolvable: true, allowsAbsence: Boolean(sourceIssue.allowsAbsence), corrections: correctionTypesForConflict(sourceIssue) };
    const model = {
      UNASSIGNED_COMPONENT: ["component_assignment"], INVALID_UNIT: ["unit"], AMBIGUOUS_REPEAT: ["repeat_count", "range"],
      STITCH_COUNT_CONFLICT: ["stitch_count"], INVALID_ROW_RANGE: ["range"],
    };
    const corrections = model[sourceIssue.code] || [];
    return { userResolvable: corrections.length > 0, allowsAbsence: false, corrections: [...corrections, "user_comment"] };
  }

  function correctionTypesForConflict(sourceIssue) {
    if (sourceIssue.code === "STITCH_COUNT_CONFLICT") return ["stitch_count", "user_comment"];
    if (sourceIssue.code?.includes("UNIT")) return ["unit", "user_comment"];
    if (sourceIssue.code?.includes("REPEAT")) return ["repeat_count", "range", "user_comment"];
    return ["size", "unit", "stitch_count", "row_count", "repeat_count", "range", "user_comment"];
  }

  function startReview(state, now = timestampNow()) {
    requireState(state);
    if (state.status === "confirmed" || state.status === "stale") throw reviewError("REVIEW_DECISION_INVALID", "Эту review нельзя начать в текущем статусе.");
    if (state.status === "reviewing" && state.reviewState.startedAt) return copy(state);
    const next = mutable(state);
    next.revision += 1; next.status = "reviewing"; next.updatedAt = now; next.reviewState.startedAt = next.reviewState.startedAt || now;
    touchDecisionRevisions(next);
    appendAudit(next, auditEntry("review_started", next, now));
    next.validation = validateReviewState(next, null, now);
    return deepFreeze(next);
  }

  function setDecision(state, targetId, decision, options = {}, now = timestampNow()) {
    requireEditable(state);
    if (!DECISIONS.includes(decision)) throw reviewError("REVIEW_DECISION_INVALID", "Неизвестное решение review.");
    const target = targetById(state, targetId);
    const current = decisionByTarget(state, targetId);
    const next = mutable(state);
    next.revision += 1; next.status = "reviewing"; next.updatedAt = now; next.confirmedAt = null;
    const entry = next.decisions.find((item) => item.decisionId === current.decisionId);
    entry.decision = decision;
    entry.selectedValue = options.selectedValue === undefined ? null : copy(options.selectedValue);
    entry.comment = boundedNote(options.comment || entry.comment);
    entry.updatedAt = now; entry.revision = next.revision;
    if (decision === "rejected" && target.targetKind === "finding") upsertRejected(next, target, entry, now);
    else next.rejectedFindings = next.rejectedFindings.filter((item) => item.targetId !== targetId);
    if (decision === "unresolved") upsertUnresolved(next, target, entry, now);
    else next.unresolvedItems = next.unresolvedItems.filter((item) => item.targetId !== targetId);
    appendAudit(next, auditEntry(decision === "rejected" ? "finding_rejected" : decision === "unresolved" ? "item_marked_unresolved" : "decision_changed", next, now, { targetId, decision }));
    next.validation = validateReviewState(next, null, now);
    if (next.validation.critical.length) next.status = "needs_attention";
    return deepFreeze(next);
  }

  function addCorrection(state, input, now = timestampNow()) {
    requireEditable(state);
    const targetId = input?.targetId ?? input?.sourceElementId;
    const target = targetById(state, targetId);
    const type = input?.type ?? input?.correctionType;
    if (!CORRECTION_TYPES.includes(type) || !array(target.allowedCorrections).includes(type)) throw reviewError("CORRECTION_TYPE_INVALID", "Это поле нельзя исправить на Stage 21.");
    const correctedValue = copy(input.correctedValue === undefined ? input.value : input.correctedValue);
    const unit = input.unit === undefined ? target.unit ?? null : input.unit;
    const validationCode = validateCorrectionValue(type, correctedValue, unit, target, state);
    if (validationCode) throw reviewError(validationCode, "Исправленное значение недопустимо.", { targetId, type });
    const next = mutable(state);
    next.revision += 1; next.status = "reviewing"; next.updatedAt = now;
    const existing = next.corrections.find((entry) => entry.targetId === targetId && entry.type === type);
    const correction = {
      correctionId: existing?.correctionId || stableId("correction", { reviewId: state.id, targetId, type }),
      targetId, sourceElementId: targetId, originalValue: copy(target.originalValue), correctedValue,
      valueType: valueType(correctedValue), type, unit: unit ?? null,
      sourceProvenance: sourceProvenance(state, target),
      correctionProvenance: { kind: "user", reviewId: state.id, reviewRevision: next.revision },
      timestamp: now, revision: next.revision,
    };
    if (existing) Object.assign(existing, correction); else next.corrections.push(correction);
    const decision = next.decisions.find((entry) => entry.targetId === targetId);
    decision.decision = "corrected"; decision.selectedValue = null; decision.updatedAt = now; decision.revision = next.revision;
    next.unresolvedItems = next.unresolvedItems.filter((entry) => entry.targetId !== targetId);
    appendAudit(next, auditEntry("correction_added", next, now, { targetId, correctionType: type }));
    next.validation = validateReviewState(next, null, now);
    if (next.validation.critical.length) next.status = "needs_attention";
    return deepFreeze(next);
  }

  function removeCorrection(state, correctionId, now = timestampNow()) {
    requireEditable(state);
    const existing = array(state.corrections).find((entry) => entry.correctionId === correctionId);
    if (!existing) throw reviewError("CORRECTION_TARGET_MISSING", "Исправление не найдено.");
    const next = mutable(state); next.revision += 1; next.status = "reviewing"; next.updatedAt = now;
    next.corrections = next.corrections.filter((entry) => entry.correctionId !== correctionId);
    const decision = next.decisions.find((entry) => entry.targetId === existing.targetId);
    if (decision && !next.corrections.some((entry) => entry.targetId === existing.targetId)) { decision.decision = "pending"; decision.updatedAt = now; decision.revision = next.revision; }
    appendAudit(next, auditEntry("correction_removed", next, now, { targetId: existing.targetId, correctionType: existing.type }));
    next.validation = validateReviewState(next, null, now);
    return deepFreeze(next);
  }

  function addUserNote(state, targetId, note, now = timestampNow()) {
    requireEditable(state); targetById(state, targetId);
    const value = boundedNote(note);
    const next = mutable(state); next.revision += 1; next.status = "reviewing"; next.updatedAt = now;
    const existing = next.userNotes.find((entry) => entry.targetId === targetId);
    const item = { noteId: existing?.noteId || stableId("note", { reviewId: state.id, targetId }), targetId, text: value, timestamp: now, revision: next.revision };
    if (existing) Object.assign(existing, item); else next.userNotes.push(item);
    appendAudit(next, auditEntry("decision_changed", next, now, { targetId, noteChanged: true }));
    next.validation = validateReviewState(next, null, now);
    return deepFreeze(next);
  }

  function validateCorrectionValue(type, value, unit, target, state) {
    if (type === "user_comment") return text(value) && text(value).length <= NOTE_LIMIT ? null : "CORRECTION_VALUE_INVALID";
    if (["product_name", "component_name", "section_name", "yarn_category", "abbreviation_definition"].includes(type)) return text(value) && text(value).length <= 200 ? null : "CORRECTION_VALUE_INVALID";
    if (["stitch_count", "row_count"].includes(type)) return nonNegativeInteger(value) === null ? "CORRECTION_COUNT_INVALID" : null;
    if (["repeat_count", "section_order"].includes(type)) return positiveInteger(value) ? null : "CORRECTION_REPEAT_INVALID";
    if (["tool_number", "yarn_weight"].includes(type)) return positiveNumber(value) === null ? "CORRECTION_VALUE_INVALID" : validateUnit(unit, target.unit);
    if (type === "gauge") {
      const item = object(value);
      return positiveNumber(item?.value ?? value) === null || item && positiveNumber(item.per) === null ? "CORRECTION_VALUE_INVALID" : validateUnit(unit ?? item?.unit, target.unit);
    }
    if (type === "unit") {
      const candidate = text(value) || unit;
      if (target.category === "tools" && !["mm", "mm needles", "us"].includes(candidate)) return "CORRECTION_UNIT_INCOMPATIBLE";
      return validateUnit(candidate, target.unit);
    }
    if (type === "size") return value === null || value === undefined || typeof value === "object" && !Object.keys(value).length || typeof value === "string" && !text(value) ? "CORRECTION_VALUE_INVALID" : validateUnit(unit, target.unit);
    if (type === "range") {
      const item = object(value); const start = integer(item?.start ?? item?.rowStart); const end = integer(item?.end ?? item?.rowEnd);
      return !positiveInteger(start) || !positiveInteger(end) || end < start ? "CORRECTION_RANGE_INVALID" : null;
    }
    if (type === "component_assignment") {
      const componentId = text(value?.componentId ?? value);
      return componentId && array(state.immutableSourceSnapshot?.structuredDraft?.components).some((entry) => entry.id === componentId) ? null : "CORRECTION_VALUE_INVALID";
    }
    return null;
  }

  function validateUnit(candidate, original) {
    const normalized = candidate ?? null;
    if (!VALID_UNITS.includes(normalized)) return "CORRECTION_VALUE_INVALID";
    if (!original || !normalized) return null;
    return unitFamily(original) === unitFamily(normalized) ? null : "CORRECTION_UNIT_INCOMPATIBLE";
  }

  function validateReviewState(state, sourceDraft = null, now = timestampNow(), extraCritical = []) {
    const critical = []; const nonCritical = []; const informational = [];
    const add = (target, code, targetId = null, details = {}) => pushUnique(target, issue(code, targetId, details));
    if (!state || state.kind !== PROGRESS_KIND || state.version !== VERSION || state.reviewAlgorithmVersion !== REVIEW_ALGORITHM_VERSION || !STATUSES.includes(state.status)) add(critical, "SOURCE_REFERENCE_INVALID");
    if (!text(state?.id) || !text(state?.projectId) || !positiveInteger(state?.revision) || !isTimestamp(state?.createdAt) || !isTimestamp(state?.updatedAt)) add(critical, "SOURCE_REFERENCE_INVALID");
    const snapshot = state?.immutableSourceSnapshot;
    if (!snapshot || fingerprintSafe(snapshot) !== state?.immutableSourceSnapshotFingerprint) add(critical, "SOURCE_SNAPSHOT_MUTATED");
    if (snapshot?.sourceDraftIdentity?.projectId !== state?.projectId || snapshot?.sourceReviewIdentity?.projectId !== state?.projectId || snapshot?.sourceSemanticIdentity?.projectId !== state?.projectId) add(critical, "OWNERSHIP_MISMATCH");
    if (snapshot && (snapshot.draftFingerprint !== state.sourceDraftFingerprint || snapshot.validationFingerprint !== state.sourceValidationFingerprint || snapshot.criticalIssuesFingerprint !== state.sourceCriticalIssuesFingerprint)) add(critical, "SOURCE_REFERENCE_INVALID");
    if (snapshot && fingerprintSafe(snapshot.structuredDraft) !== state.sourceDraftFingerprint) add(critical, "SOURCE_DRAFT_FINGERPRINT_MISMATCH");
    if (snapshot && fingerprintSafe(snapshot.validation) !== state.sourceValidationFingerprint) add(critical, "SOURCE_VALIDATION_FINGERPRINT_MISMATCH");
    if (snapshot && fingerprintSafe(collectCriticalIssues(snapshot.structuredDraft)) !== state.sourceCriticalIssuesFingerprint) add(critical, "SOURCE_CRITICAL_ISSUES_FINGERPRINT_MISMATCH");
    const targets = array(state?.reviewState?.targets); const targetIds = new Set(targets.map((entry) => entry.id));
    if (targetIds.size !== targets.length || targets.some((entry) => !text(entry.id))) add(critical, "SOURCE_REFERENCE_INVALID");
    const seenDecisions = new Set();
    for (const decision of array(state?.decisions)) {
      if (!targetIds.has(decision?.targetId) || !DECISIONS.includes(decision?.decision)) add(critical, "REVIEW_DECISION_INVALID", decision?.targetId ?? null);
      if (seenDecisions.has(decision?.targetId)) add(critical, "REVIEW_DECISION_DUPLICATE", decision?.targetId ?? null);
      seenDecisions.add(decision?.targetId);
    }
    for (const target of targets) {
      const decision = array(state?.decisions).find((entry) => entry.targetId === target.id);
      if (!decision) { add(critical, "REVIEW_DECISION_INVALID", target.id); continue; }
      if (target.required && decision.decision === "pending") add(critical, "REQUIRED_DECISION_PENDING", target.id);
      if (target.blocking && decision.decision === "unresolved") add(critical, target.category === "conflict" ? "CONFLICT_UNRESOLVED" : "CRITICAL_ISSUE_UNRESOLVED", target.id);
      if (target.targetKind === "value" && target.required && ["rejected", "not_applicable"].includes(decision.decision) && !target.allowsAbsence) add(critical, "CRITICAL_ISSUE_UNRESOLVED", target.id);
      if (target.targetKind === "finding" && target.blocking && !findingResolved(target, decision, state)) add(critical, target.category === "conflict" ? "CONFLICT_UNRESOLVED" : "CRITICAL_ISSUE_UNRESOLVED", target.id);
    }
    const correctionKeys = new Set();
    for (const correction of array(state?.corrections)) {
      const target = targets.find((entry) => entry.id === correction?.targetId);
      if (!target) { add(critical, "CORRECTION_TARGET_MISSING", correction?.targetId ?? null); continue; }
      if (!CORRECTION_TYPES.includes(correction.type) || !array(target.allowedCorrections).includes(correction.type)) add(critical, "CORRECTION_TYPE_INVALID", correction.targetId);
      const key = `${correction.targetId}:${correction.type}`;
      if (correctionKeys.has(key)) add(critical, "REVIEW_DECISION_DUPLICATE", correction.targetId);
      correctionKeys.add(key);
      const code = validateCorrectionValue(correction.type, correction.correctedValue, correction.unit, target, state);
      if (code) add(critical, code, correction.targetId);
      if (canonicalizeSafe(correction.originalValue) !== canonicalizeSafe(target.originalValue)) add(critical, "CORRECTION_VALUE_INVALID", correction.targetId);
      if (correction.sourceElementId !== correction.targetId || correction.correctionProvenance?.kind !== "user" || correction.correctionProvenance?.reviewId !== state.id || !isTimestamp(correction.timestamp)) add(critical, "CORRECTION_PROVENANCE_INVALID", correction.targetId);
    }
    for (const decision of array(state?.decisions).filter((entry) => entry.decision === "corrected")) if (!array(state?.corrections).some((entry) => entry.targetId === decision.targetId)) add(critical, "CORRECTION_TARGET_MISSING", decision.targetId);
    for (const note of array(state?.userNotes)) if (!targetIds.has(note.targetId) || !text(note.text) || note.text.length > NOTE_LIMIT) add(nonCritical, "CORRECTION_VALUE_INVALID", note.targetId);
    if (sourceDraft) for (const sourceIssue of validateLiveSource(state, sourceDraft).critical) add(critical, sourceIssue.code, sourceIssue.targetId);
    for (const sourceIssue of extraCritical) add(critical, sourceIssue.code, sourceIssue.targetId ?? null);
    if (state?.status === "confirmed") {
      if (!state.confirmedSnapshot || !validConfirmedSnapshot(state.confirmedSnapshot, state)) add(critical, "CONFIRMED_SNAPSHOT_INVALID");
      else if (confirmedFingerprint(state.confirmedSnapshot) !== state.confirmedSnapshotFingerprint || state.confirmedSnapshot.confirmedSnapshotFingerprint !== state.confirmedSnapshotFingerprint) add(critical, "CONFIRMED_SNAPSHOT_FINGERPRINT_MISMATCH");
    } else if (state?.confirmedSnapshot || state?.confirmedSnapshotFingerprint || state?.confirmedAt) add(critical, "CONFIRMED_SNAPSHOT_INVALID");
    const stableCritical = stableIssues(critical); const stableNonCritical = stableIssues(nonCritical); const stableInformational = stableIssues(informational);
    return {
      isValid: stableCritical.length === 0, canConfirm: stableCritical.length === 0 && state?.status !== "stale" && state?.status !== "failed",
      critical: stableCritical, nonCritical: stableNonCritical, informational: stableInformational,
      errors: stableCritical, warnings: stableNonCritical, validatedAt: now, validatedRevision: state?.revision ?? null,
    };
  }

  function validateLiveSource(state, draft) {
    const critical = [];
    const sourceValidation = validateSourceDraft(draft, state.projectId);
    critical.push(...sourceValidation.critical);
    if (draft?.id !== state.sourceDraftId || draft?.sourceReviewId !== state.sourceReviewId || draft?.sourceSemanticAnalysisId !== state.sourceSemanticAnalysisId || draft?.sourceImportRevision !== state.sourceImportRevision) critical.push(issue("SOURCE_DRAFT_STALE"));
    if (draft?.revision !== state.sourceDraftRevision) critical.push(issue("SOURCE_DRAFT_REVISION_MISMATCH"));
    if (draft?.draftFingerprint !== state.sourceDraftFingerprint) critical.push(issue("SOURCE_DRAFT_FINGERPRINT_MISMATCH"));
    if (fingerprintSafe(draft?.validation) !== state.sourceValidationFingerprint) critical.push(issue("SOURCE_VALIDATION_FINGERPRINT_MISMATCH"));
    if (draft?.criticalIssuesFingerprint !== state.sourceCriticalIssuesFingerprint) critical.push(issue("SOURCE_CRITICAL_ISSUES_FINGERPRINT_MISMATCH"));
    if (draft?.algorithmVersion !== state.sourceDraftAlgorithmVersion) critical.push(issue("SOURCE_DRAFT_FINGERPRINT_MISMATCH"));
    return { isValid: critical.length === 0, critical: stableIssues(critical), nonCritical: [], informational: [] };
  }

  function findingResolved(target, decision, state) {
    if (!target.blocking) return true;
    if (decision.decision === "corrected") return target.userResolvable && array(state.corrections).some((entry) => entry.targetId === target.id && validateCorrectionValue(entry.type, entry.correctedValue, entry.unit, target, state) === null);
    if (target.category === "conflict" && decision.decision === "accepted") return array(target.conflictValues).some((value) => canonicalizeSafe(value) === canonicalizeSafe(decision.selectedValue));
    if (decision.decision === "rejected") return target.allowsAbsence === true;
    if (decision.decision === "not_applicable") return target.allowsAbsence === true;
    return decision.decision === "accepted" && target.userResolvable && target.category !== "missing_information";
  }

  function validateAndApply(state, sourceDraft = null, now = timestampNow()) {
    requireState(state);
    const next = mutable(state); next.revision += 1; next.updatedAt = now; touchDecisionRevisions(next);
    next.validation = validateReviewState(next, sourceDraft, now);
    next.reviewState.lastValidatedAt = now;
    next.status = next.validation.critical.length ? "needs_attention" : "reviewing";
    if (next.validation.critical.length) appendAudit(next, auditEntry("validation_failed", next, now, { codes: next.validation.critical.map((entry) => entry.code) }));
    return deepFreeze(next);
  }

  function beginConfirmation(state, sourceDraft, now = timestampNow()) {
    requireEditable(state);
    const validation = validateReviewState(state, sourceDraft, now);
    if (validation.critical.length) throw reviewError(validation.critical[0].code, "Подтверждение заблокировано критическими проблемами.");
    const next = mutable(state); next.revision += 1; next.updatedAt = now; next.status = "reviewing";
    next.reviewState.operation = { operationId: makeId(), type: "confirm", status: "in_progress", startedAt: now, baseRevision: state.revision };
    next.validation = { ...validation, validatedRevision: next.revision };
    touchDecisionRevisions(next);
    return deepFreeze(next);
  }

  function completeConfirmation(state, sourceDraft, now = timestampNow()) {
    requireState(state);
    if (state.status === "confirmed") {
      const validation = validateReviewState(state, sourceDraft, now);
      if (!validation.critical.length) return copy(state);
      throw reviewError(validation.critical[0].code, "Подтверждённый snapshot повреждён.");
    }
    if (state.reviewState?.operation?.type !== "confirm" || state.reviewState.operation.status !== "in_progress") throw reviewError("CONFIRMED_SNAPSHOT_INVALID", "Подтверждение не было начато.");
    const validation = validateReviewState(state, sourceDraft, now);
    if (validation.critical.length) throw reviewError(validation.critical[0].code, "Подтверждение заблокировано критическими проблемами.");
    const next = mutable(state); next.revision += 1; next.updatedAt = now; next.confirmedAt = now;
    next.reviewState.operation = null;
    const snapshot = buildConfirmedSnapshot(next, now);
    next.confirmedSnapshot = snapshot; next.confirmedSnapshotFingerprint = snapshot.confirmedSnapshotFingerprint; next.status = "confirmed";
    next.validation = validateReviewState(next, sourceDraft, now);
    if (next.validation.critical.length) throw reviewError(next.validation.critical[0].code, "Итоговый snapshot не прошёл validation.");
    appendAudit(next, auditEntry("confirmed", next, now, { confirmedSnapshotFingerprint: next.confirmedSnapshotFingerprint }));
    return deepFreeze(next);
  }

  function confirmReview(state, sourceDraft, now = timestampNow()) {
    if (state.status === "confirmed") return completeConfirmation(state, sourceDraft, now);
    return completeConfirmation(beginConfirmation(state, sourceDraft, now), sourceDraft, now);
  }

  function buildConfirmedSnapshot(state, now) {
    const finalDraft = applyCorrections(state.immutableSourceSnapshot.structuredDraft, state.corrections);
    const snapshot = {
      schemaVersion: 1,
      reviewIdentity: { id: state.id, projectId: state.projectId, revision: state.revision },
      sourceDraftIdentity: copy(state.immutableSourceSnapshot.sourceDraftIdentity),
      sourceReviewIdentity: copy(state.immutableSourceSnapshot.sourceReviewIdentity),
      sourceSemanticIdentity: copy(state.immutableSourceSnapshot.sourceSemanticIdentity),
      sourceImportRevision: state.sourceImportRevision,
      sourceFingerprints: { draft: state.sourceDraftFingerprint, validation: state.sourceValidationFingerprint, criticalIssues: state.sourceCriticalIssuesFingerprint },
      finalDraft,
      confirmedValues: state.reviewState.targets.filter((target) => target.targetKind === "value").map((target) => {
        const correction = state.corrections.filter((entry) => entry.targetId === target.id).at(-1);
        return { targetId: target.id, decision: decisionByTarget(state, target.id).decision, originalValue: copy(target.originalValue), value: correction ? copy(correction.correctedValue) : copy(target.originalValue), unit: correction?.unit ?? target.unit ?? null };
      }),
      originalValues: state.reviewState.targets.map((target) => ({ targetId: target.id, value: copy(target.originalValue) })),
      corrections: copy(state.corrections), rejectedFindings: copy(state.rejectedFindings),
      unresolvedNonBlockingItems: copy(state.unresolvedItems.filter((entry) => !targetById(state, entry.targetId).blocking)),
      assumptions: copy(state.immutableSourceSnapshot.assumptions), warnings: copy(state.immutableSourceSnapshot.warnings),
      conflicts: state.immutableSourceSnapshot.criticalIssues.concat(state.immutableSourceSnapshot.nonCriticalIssues).filter((entry) => entry.issueKind === "conflict").map((entry) => ({ ...copy(entry), resolution: copy(decisionByTarget(state, entry.id)) })),
      provenance: copy(state.immutableSourceSnapshot.provenance), confirmationTimestamp: now,
      reviewRevision: state.revision, confirmedSnapshotFingerprint: null,
    };
    snapshot.confirmedSnapshotFingerprint = confirmedFingerprint(snapshot);
    return deepFreeze(snapshot);
  }

  function confirmedFingerprint(snapshot) {
    const payload = copy(snapshot); delete payload.confirmedSnapshotFingerprint; return fingerprint(payload);
  }

  function validConfirmedSnapshot(snapshot, state) {
    return Boolean(snapshot && snapshot.schemaVersion === 1 && snapshot.reviewIdentity?.id === state.id && snapshot.reviewIdentity?.projectId === state.projectId && snapshot.sourceDraftIdentity?.id === state.sourceDraftId && snapshot.sourceFingerprints?.draft === state.sourceDraftFingerprint && snapshot.sourceFingerprints?.validation === state.sourceValidationFingerprint && snapshot.sourceFingerprints?.criticalIssues === state.sourceCriticalIssuesFingerprint && Array.isArray(snapshot.confirmedValues) && object(snapshot.finalDraft));
  }

  function reopenReview(state, now = timestampNow()) {
    requireState(state);
    if (state.status !== "confirmed" || !state.confirmedSnapshot || !validConfirmedSnapshot(state.confirmedSnapshot, state) || confirmedFingerprint(state.confirmedSnapshot) !== state.confirmedSnapshotFingerprint) throw reviewError("CONFIRMED_SNAPSHOT_INVALID", "Открыть заново можно только валидный confirmed review.");
    const previous = { fingerprint: state.confirmedSnapshotFingerprint, confirmedAt: state.confirmedAt, snapshot: copy(state.confirmedSnapshot) };
    const next = mutable(state); next.revision += 1; next.status = "reviewing"; next.updatedAt = now; next.confirmedAt = null; next.confirmedSnapshot = null; next.confirmedSnapshotFingerprint = null; next.reviewState.operation = null;
    touchDecisionRevisions(next);
    appendAudit(next, auditEntry("reopened", next, now, { previousConfirmed: previous }));
    next.validation = validateReviewState(next, null, now);
    return deepFreeze(next);
  }

  function recoverInterruptedState(state, now = timestampNow()) {
    requireState(state);
    if (state.reviewState?.operation?.status !== "in_progress") return copy(state);
    const next = mutable(state); next.revision += 1; next.updatedAt = now; next.status = "reviewing"; next.reviewState.operation = null; next.confirmedAt = null; next.confirmedSnapshot = null; next.confirmedSnapshotFingerprint = null;
    next.lastError = { code: "CONFIRMATION_INTERRUPTED" };
    appendAudit(next, auditEntry("recovered", next, now, { code: "CONFIRMATION_INTERRUPTED" }));
    next.validation = validateReviewState(next, null, now);
    if (next.validation.critical.length) next.status = "needs_attention";
    return deepFreeze(next);
  }

  function retryReview(state, sourceDraft, now = timestampNow()) {
    requireState(state);
    if (state.status === "confirmed" || state.status === "stale") throw reviewError("SOURCE_DRAFT_STALE", "Retry недоступен для confirmed или stale review.");
    if (!state.lastError && state.reviewState?.operation?.status !== "in_progress") return copy(state);
    const live = validateLiveSource(state, sourceDraft);
    if (!live.isValid) return markStale(state, live.critical[0].code, now);
    let base = state.reviewState?.operation?.status === "in_progress" ? recoverInterruptedState(state, now) : copy(state);
    const next = mutable(base); next.revision += 1; next.updatedAt = now; next.lastError = null; next.reviewState.operation = null;
    appendAudit(next, auditEntry("retry", next, now));
    next.validation = validateReviewState(next, sourceDraft, now);
    next.status = next.validation.critical.length ? "needs_attention" : "reviewing";
    return deepFreeze(next);
  }

  function markFailed(state, code = "SOURCE_REFERENCE_INVALID", now = timestampNow()) {
    requireState(state);
    const next = mutable(state); next.revision += 1; next.status = "failed"; next.updatedAt = now; next.lastError = { code }; next.reviewState.operation = null;
    next.validation = validateReviewState(next, null, now, [{ code }]);
    appendAudit(next, auditEntry("validation_failed", next, now, { codes: [code] }));
    return deepFreeze(next);
  }

  function markStale(state, code = "SOURCE_DRAFT_STALE", now = timestampNow()) {
    requireState(state);
    if (state.status === "stale" && state.lastError?.code === code) return copy(state);
    const next = mutable(state); next.revision += 1; next.status = "stale"; next.updatedAt = now; next.lastError = { code }; next.reviewState.operation = null;
    appendAudit(next, auditEntry("marked_stale", next, now, { code, previousConfirmedSnapshotFingerprint: state.confirmedSnapshotFingerprint }));
    next.validation = validateReviewState(next, null, now, [{ code }]);
    return deepFreeze(next);
  }

  function newReviewFromDraft(state, sourceDraft, source = {}, now = timestampNow()) {
    requireState(state);
    if (state.status !== "stale") throw reviewError("SOURCE_DRAFT_STATUS_INVALID", "Новый review доступен только после stale.");
    const fresh = mutable(createInitialState(state.projectId, sourceDraft, source, now));
    fresh.id = state.id; fresh.revision = state.revision + 1;
    fresh.decisions.forEach((entry) => { entry.decisionId = stableId("decision", { reviewId: fresh.id, targetId: entry.targetId }); entry.revision = fresh.revision; });
    fresh.audit = [...array(state.audit), auditEntry("created", fresh, now, { previousSourceDraftFingerprint: state.sourceDraftFingerprint })].slice(-AUDIT_LIMIT);
    fresh.validation = validateReviewState(fresh, sourceDraft, now);
    return deepFreeze(fresh);
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project || null;
    const calculation = array(aggregate?.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null;
    if (!project || !calculation) return { state: "missing_project", project, calculation, draft: null, review: null };
    const progress = array(aggregate.progress).filter((entry) => entry.calculation_id === calculation.calculation_id && entry.epoch === 1);
    const draftProgress = progress.find((entry) => entry.kind === "PATTERN_TECHNOLOGY_DRAFT") || null;
    const reviewProgress = progress.find((entry) => entry.kind === PROGRESS_KIND) || null;
    if (!draftProgress) return reviewProgress
      ? { state: "stale", reasonCode: "SOURCE_DRAFT_MISSING", project, calculation, draft: null, draftProgress: null, review: reviewProgress.state, reviewProgress }
      : { state: "draft_missing", project, calculation, draft: null, review: null };
    const draft = draftProgress.state;
    const sourceValidation = validateSourceDraft(draft, aggregate.project.project_id);
    if (!sourceValidation.isValid) return reviewProgress
      ? { state: "stale", reasonCode: sourceValidation.critical[0].code, project, calculation, draft, draftProgress, review: reviewProgress.state, reviewProgress }
      : { state: draft?.status === "stale" ? "draft_stale" : "source_invalid", reasonCode: sourceValidation.critical[0].code, project, calculation, draft, draftProgress, review: null };
    if (!reviewProgress) return { state: "creatable", project, calculation, draft, draftProgress, review: null };
    const review = reviewProgress.state;
    const validation = validateReviewState(review, draft);
    if (validation.critical.some((entry) => ["SOURCE_SNAPSHOT_MUTATED", "OWNERSHIP_MISMATCH", "SOURCE_REFERENCE_INVALID"].includes(entry.code))) return { state: "corrupted", reasonCode: validation.critical[0].code, project, calculation, draft, draftProgress, review, reviewProgress };
    const live = validateLiveSource(review, draft);
    return { state: live.isValid ? "ready" : "stale", reasonCode: live.critical[0]?.code ?? null, project, calculation, draft, draftProgress, review, reviewProgress };
  }

  async function ensureForProject(repository, projectId) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (["missing_project", "draft_missing", "source_invalid", "draft_stale", "corrupted"].includes(inspected.state)) return inspected;
    if (!inspected.review) {
      const initial = createInitialState(projectId, inspected.draft, { progressId: inspected.draftProgress.progress_id });
      await repository.ensurePatternTechnologyReview(projectId, inspected.calculation.calculation_id, initial, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_CREATED", projectStage: "pattern_technology_review_waiting" });
      return inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.review.reviewState?.operation?.status === "in_progress") {
      const recovered = recoverInterruptedState(inspected.review);
      await repository.updatePatternTechnologyReview(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_RECOVERED", projectStage: `pattern_technology_review_${recovered.status}` });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.state === "stale" && inspected.review.status !== "stale") {
      const stale = markStale(inspected.review, inspected.reasonCode);
      await repository.updatePatternTechnologyReview(projectId, inspected.calculation.calculation_id, stale, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_STALE", projectStage: "pattern_technology_review_stale" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    return inspected;
  }

  async function mutateForProject(repository, projectId, operation, operationKind) {
    if (activeOperations.has(projectId)) return ensureForProject(repository, projectId);
    activeOperations.add(projectId);
    try {
      const inspected = await ensureForProject(repository, projectId);
      if (!inspected.review || !inspected.draft) throw reviewError("SOURCE_DRAFT_MISSING", "Review или Stage 20 не найден.");
      if (inspected.state === "stale" || inspected.review.status === "stale") return inspected;
      const next = operation(inspected.review, inspected.draft);
      if (canonicalize(next) === canonicalize(inspected.review)) return inspected;
      await repository.updatePatternTechnologyReview(projectId, inspected.calculation.calculation_id, next, { operationKind, projectStage: `pattern_technology_review_${next.status}` });
      return inspectAggregate(await repository.getProject(projectId));
    } finally { activeOperations.delete(projectId); }
  }

  async function startForProject(repository, projectId) { return mutateForProject(repository, projectId, (state) => startReview(state), "PATTERN_TECHNOLOGY_REVIEW_STARTED"); }
  async function decideForProject(repository, projectId, targetId, decision, options = {}) { return mutateForProject(repository, projectId, (state) => setDecision(state, targetId, decision, options), "PATTERN_TECHNOLOGY_REVIEW_DECISION_CHANGED"); }
  async function correctForProject(repository, projectId, input) { return mutateForProject(repository, projectId, (state) => addCorrection(state, input), "PATTERN_TECHNOLOGY_REVIEW_CORRECTION_ADDED"); }
  async function removeCorrectionForProject(repository, projectId, correctionId) { return mutateForProject(repository, projectId, (state) => removeCorrection(state, correctionId), "PATTERN_TECHNOLOGY_REVIEW_CORRECTION_REMOVED"); }
  async function validateForProject(repository, projectId) { return mutateForProject(repository, projectId, (state, draft) => validateAndApply(state, draft), "PATTERN_TECHNOLOGY_REVIEW_VALIDATED"); }

  async function confirmForProject(repository, projectId) {
    if (activeOperations.has(projectId)) return ensureForProject(repository, projectId);
    activeOperations.add(projectId);
    try {
      let inspected = await ensureForProject(repository, projectId);
      if (!inspected.review || !inspected.draft || inspected.state === "stale") return inspected;
      if (inspected.review.status === "confirmed") return inspected;
      const started = beginConfirmation(inspected.review, inspected.draft);
      await repository.updatePatternTechnologyReview(projectId, inspected.calculation.calculation_id, started, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_CONFIRM_STARTED", projectStage: "pattern_technology_review_reviewing" });
      inspected = inspectAggregate(await repository.getProject(projectId));
      const completed = completeConfirmation(inspected.review, inspected.draft);
      await repository.updatePatternTechnologyReview(projectId, inspected.calculation.calculation_id, completed, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_CONFIRMED", projectStage: "pattern_technology_review_confirmed" });
      return inspectAggregate(await repository.getProject(projectId));
    } finally { activeOperations.delete(projectId); }
  }

  async function reopenForProject(repository, projectId) { return mutateForProject(repository, projectId, (state) => reopenReview(state), "PATTERN_TECHNOLOGY_REVIEW_REOPENED"); }
  async function retryForProject(repository, projectId) { return mutateForProject(repository, projectId, (state, draft) => retryReview(state, draft), "PATTERN_TECHNOLOGY_REVIEW_RETRY"); }

  async function newReviewForProject(repository, projectId) {
    if (activeOperations.has(projectId)) return ensureForProject(repository, projectId);
    activeOperations.add(projectId);
    try {
      const aggregate = await repository.getProject(projectId); const inspected = inspectAggregate(aggregate);
      if (!inspected.review || !inspected.draft) throw reviewError("SOURCE_DRAFT_MISSING", "Актуальный Stage 20 не найден.");
      const next = newReviewFromDraft(inspected.review, inspected.draft, { progressId: inspected.draftProgress.progress_id });
      await repository.updatePatternTechnologyReview(projectId, inspected.calculation.calculation_id, next, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_NEW_SOURCE", projectStage: "pattern_technology_review_waiting" });
      return inspectAggregate(await repository.getProject(projectId));
    } finally { activeOperations.delete(projectId); }
  }

  function applyCorrections(sourceDraft, corrections) {
    const result = copy(sourceDraft);
    const byId = new Map();
    walk(result, (entry) => { if (text(entry?.id)) byId.set(entry.id, entry); });
    for (const correction of corrections) {
      const target = byId.get(correction.targetId); if (!target || correction.type === "user_comment") continue;
      const value = copy(correction.correctedValue);
      if (correction.type === "product_name") { target.value = value; target.type = typeof value === "string" ? value : target.type; }
      else if (correction.type === "component_name") target.name = value;
      else if (correction.type === "section_name") target.title = value;
      else if (correction.type === "unit") target.unit = value;
      else if (["size", "tool_number", "yarn_weight", "yarn_category"].includes(correction.type)) target.value = value;
      else if (correction.type === "gauge") target.normalized = object(value) ? value : { value, per: target.normalized?.per ?? null, unit: correction.unit };
      else if (correction.type === "abbreviation_definition") target.definition = value;
      else if (correction.type === "component_assignment") target.componentId = value?.componentId ?? value;
      else if (correction.type === "section_order") target.order = value;
      else if (correction.type === "repeat_count") { target.repeat = object(target.repeat) || {}; target.repeat.count = value; target.repeat.mode = "count"; target.repeat.ambiguous = false; }
      else if (correction.type === "range") { const range = object(value); target.rowStart = range.start ?? range.rowStart; target.rowEnd = range.end ?? range.rowEnd; }
      else if (correction.type === "stitch_count") { const field = correction.field || ("stitchCountAfter" in target ? "stitchCountAfter" : "confirmedStitchCountAfter" in target ? "confirmedStitchCountAfter" : "value"); target[field] = value; }
      else if (correction.type === "row_count") target.rowEnd = value;
    }
    return result;
  }

  function sourceProvenance(state, target) {
    const refs = new Set(array(target.provenanceRefs));
    return state.immutableSourceSnapshot.provenance.filter((entry) => refs.has(entry.id)).map(copy);
  }
  function conflictValues(sourceIssue) { return [sourceIssue.confirmedValue, sourceIssue.calculatedValue, ...(array(sourceIssue.values))].filter((entry) => entry !== undefined); }
  function displayValue(entity) { if (entity.name !== undefined) return entity.name; if (entity.title !== undefined) return entity.title; if (entity.definition !== undefined) return entity.definition; if (entity.value !== undefined) return entity.value; if (entity.normalized !== undefined) return entity.normalized; return entity; }
  function upsertRejected(state, target, decision, now) { state.rejectedFindings = state.rejectedFindings.filter((entry) => entry.targetId !== target.id); state.rejectedFindings.push({ targetId: target.id, code: target.code, originalFinding: copy(target.originalValue), comment: decision.comment, timestamp: now, revision: state.revision }); }
  function upsertUnresolved(state, target, decision, now) { state.unresolvedItems = state.unresolvedItems.filter((entry) => entry.targetId !== target.id); state.unresolvedItems.push({ targetId: target.id, code: target.code ?? null, blocking: target.blocking, originalValue: copy(target.originalValue), comment: decision.comment, timestamp: now, revision: state.revision }); }
  function targetById(state, targetId) { const target = array(state?.reviewState?.targets).find((entry) => entry.id === targetId); if (!target) throw reviewError("CORRECTION_TARGET_MISSING", "Элемент review не найден.", { targetId }); return target; }
  function decisionByTarget(state, targetId) { const matches = array(state?.decisions).filter((entry) => entry.targetId === targetId); if (matches.length !== 1) throw reviewError(matches.length ? "REVIEW_DECISION_DUPLICATE" : "REVIEW_DECISION_INVALID", "Решение review повреждено.", { targetId }); return matches[0]; }
  function requireState(state) { if (!state || state.kind !== PROGRESS_KIND || state.version !== VERSION || !STATUSES.includes(state.status) || !positiveInteger(state.revision)) throw reviewError("SOURCE_REFERENCE_INVALID", "Запись Stage 21 повреждена."); }
  function requireEditable(state) { requireState(state); if (state.status === "confirmed") throw reviewError("CONFIRMED_SNAPSHOT_INVALID", "Сначала явно откройте review заново."); if (state.status === "stale") throw reviewError("SOURCE_DRAFT_STALE", "Stage 20 изменился; начните новый review."); if (state.status === "failed") throw reviewError("SOURCE_REFERENCE_INVALID", "Повреждённую review нельзя редактировать."); }
  function touchDecisionRevisions(state) { for (const entry of state.decisions) if (entry.revision > state.revision) entry.revision = state.revision; }
  function appendAudit(state, entry) { state.audit = [...array(state.audit), copy(entry)].slice(-AUDIT_LIMIT); }
  function auditEntry(type, state, now, details = {}) { return { auditId: makeId(), type, at: now, revision: state.revision, stateFingerprint: fingerprint({ status: state.status, revision: state.revision, decisions: state.decisions, corrections: state.corrections, confirmedSnapshotFingerprint: state.confirmedSnapshotFingerprint }), ...copy(details) }; }
  function emptyValidation(now, revision) { return { isValid: false, canConfirm: false, critical: [], nonCritical: [], informational: [], errors: [], warnings: [], validatedAt: now, validatedRevision: revision }; }
  function issue(code, targetId = null, details = {}) { return { code, targetId, level: "critical", ...copy(details) }; }
  function stableIssues(issues) { const unique = new Map(); for (const entry of issues) unique.set(canonicalize({ code: entry.code, targetId: entry.targetId ?? null }), { ...entry, targetId: entry.targetId ?? null }); return [...unique.values()].sort(compareIssues); }
  function pushUnique(target, entry) { if (!target.some((item) => item.code === entry.code && (item.targetId ?? null) === (entry.targetId ?? null))) target.push(entry); }
  function compareIssues(left, right) { return lexical(left.code || "", right.code || "") || lexical(String(left.targetId ?? left.entityId ?? ""), String(right.targetId ?? right.entityId ?? "")); }
  function normalizeLevel(value) { return value === "critical" ? "critical" : value === "informational" ? "informational" : "non_critical"; }
  function unitFamily(unit) { const value = String(unit || "").toLowerCase(); if (["cm", "mm", "m", "in", "inch", "inches", "yd"].includes(value)) return "length"; if (["g", "kg", "oz"].includes(value)) return "weight"; if (["stitches"].includes(value)) return "stitches"; if (["rows", "rounds"].includes(value)) return "rows"; if (["repeats"].includes(value)) return "repeats"; if (["mm needles", "us"].includes(value)) return "tool"; return value; }
  function boundedNote(value) { const result = text(value); if (result.length > NOTE_LIMIT) throw reviewError("CORRECTION_VALUE_INVALID", `Комментарий ограничен ${NOTE_LIMIT} символами.`); return result; }
  function valueType(value) { return Array.isArray(value) ? "array" : value === null ? "null" : typeof value; }
  function stableId(prefix, value) { return `${prefix}:${fingerprint(value).slice(8)}`; }
  function fingerprintSafe(value) { try { return fingerprint(value); } catch { return null; } }
  function canonicalizeSafe(value) { try { return canonicalize(value); } catch { return null; } }
  function timestampNow() { return new Date().toISOString(); }
  function isTimestamp(value) { return typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)); }
  function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
  function nonNegativeInteger(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : null; }
  function positiveNumber(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
  function integer(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isInteger(number) ? number : null; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function walk(value, visitor) { if (!value || typeof value !== "object") return; visitor(value); for (const child of Object.values(value)) if (child && typeof child === "object") walk(child, visitor); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `review:${Date.now()}:${Math.random()}`; }
  function reviewError(code, message, details = {}) { return new PatternTechnologyReviewError(code, message, details); }

  const api = {
    VERSION, REVIEW_ALGORITHM_VERSION, PROGRESS_KIND, STATUSES, DECISIONS, CORRECTION_TYPES, OPERATION_TYPES, VALID_UNITS, ERROR_CODES, AUDIT_LIMIT,
    PatternTechnologyReviewError, canonicalize, fingerprint, collectCriticalIssues, validateSourceDraft, createInitialState,
    buildReviewTargets, startReview, setDecision, addCorrection, removeCorrection, addUserNote, validateReviewState,
    validateLiveSource, validateAndApply, beginConfirmation, completeConfirmation, confirmReview, buildConfirmedSnapshot,
    confirmedFingerprint, reopenReview, recoverInterruptedState, retryReview, markFailed, markStale, newReviewFromDraft, inspectAggregate,
    ensureForProject, startForProject, decideForProject, correctForProject, removeCorrectionForProject,
    validateForProject, confirmForProject, reopenForProject, retryForProject, newReviewForProject, applyCorrections,
  };
  globalObject.YarnAIPatternTechnologyReview = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
