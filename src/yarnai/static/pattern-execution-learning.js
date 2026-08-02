"use strict";

(function exposePatternExecutionLearning(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_LEARNING";
  const STATUSES = Object.freeze(["draft", "reviewing", "completed", "stale", "corrupted"]);
  const CONFIDENCE_LEVELS = Object.freeze(["low", "medium", "high"]);
  const PRIORITIES = Object.freeze(["low", "medium", "high", "critical"]);
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

  class PatternExecutionLearningError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionLearningError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function compare(left, right) {
    const a = String(left ?? "");
    const b = String(right ?? "");
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function canonicalize(value, seen = new Set()) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw learningError("corrupted_input", "Learning contains an invalid number.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) throw learningError("corrupted_input", "Learning contains an unsupported value.");
    if (seen.has(value)) throw learningError("corrupted_input", "Learning cannot contain cyclic data.");
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = `[${value.map((entry) => canonicalize(entry, seen)).join(",")}]`;
    else if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      result = `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    } else {
      seen.delete(value);
      throw learningError("corrupted_input", "Learning accepts canonical JSON objects only.");
    }
    seen.delete(value);
    return result;
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

  function normalizeText(value) {
    return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : "";
  }

  function stableStrings(values) {
    return [...new Set(array(values).map(normalizeText).filter(Boolean))].sort(compare);
  }

  function recordId(value, type) {
    if (!value || typeof value !== "object") return null;
    return normalizeText(value.id || value.resultId || value[`${type}Id`]) || null;
  }

  function recordIdentity(value) {
    if (!value || typeof value !== "object") return null;
    return normalizeText(value.identity || value.fingerprint || value.resultFingerprint || value.runtimeFingerprint || value.inputFingerprint) || null;
  }

  function recordStatus(value) {
    return normalizeText(value?.status || value?.lifecycle?.state || value?.lifecycle) || null;
  }

  function sourceReference(type, value) {
    if (!value || typeof value !== "object") return null;
    return normalize({
      sourceType: type,
      sourceId: recordId(value, type),
      identity: recordIdentity(value),
      projectId: normalizeText(value.projectId || value.project_id) || null,
      revision: positiveInteger(value.revision) || null,
      epoch: positiveInteger(value.epoch) || null,
      status: recordStatus(value),
    });
  }

  function latest(values) {
    return array(values).filter((entry) => entry && typeof entry === "object").slice().sort((left, right) =>
      positiveInteger(left.epoch) - positiveInteger(right.epoch) ||
      positiveInteger(left.revision) - positiveInteger(right.revision) ||
      compare(recordId(left, "record"), recordId(right, "record"))
    ).at(-1) || null;
  }

  function normalizeSource(source = {}) {
    const followUp = source.followUp || source.follow_up || latest(source.followUps);
    const retrospective = source.retrospective || latest(source.retrospectives);
    return {
      project: source.project || null,
      projectId: normalizeText(source.projectId || source.project?.project_id || source.project?.projectId || retrospective?.projectId || source.result?.projectId) || null,
      calculationId: normalizeText(source.calculationId || source.project?.active_calculation_id || retrospective?.calculationId || source.runtime?.calculationId) || null,
      result: source.result || null,
      runtime: source.runtime || null,
      followUp: followUp || null,
      followUps: array(source.followUps),
      retrospective: retrospective || null,
      retrospectives: array(source.retrospectives),
    };
  }

  function sourceSnapshot(source = {}) {
    const normalized = normalizeSource(source);
    return normalize({
      projectId: normalized.projectId,
      calculationId: normalized.calculationId,
      result: sourceReference("result", normalized.result),
      runtime: sourceReference("runtime", normalized.runtime),
      followUp: sourceReference("follow_up", normalized.followUp),
      retrospective: sourceReference("retrospective", normalized.retrospective),
      retrospectiveSourceSnapshotFingerprint: normalizeText(normalized.retrospective?.sourceSnapshotFingerprint) || null,
    });
  }

  function issue(code, sourceType, sourceId = null) {
    return { code, severity: "critical", sourceType, sourceId: sourceId || null };
  }

  function calculateIntegrity(source = {}, learning = null) {
    const normalized = normalizeSource(source);
    const snapshot = sourceSnapshot(normalized);
    const issues = [];
    for (const type of ["result", "runtime", "followUp", "retrospective"]) {
      if (!normalized[type]) issues.push(issue(`missing_${type === "followUp" ? "follow_up" : type}`, type === "followUp" ? "follow_up" : type));
    }
    const records = [normalized.result, normalized.runtime, normalized.followUp, normalized.retrospective].filter(Boolean);
    for (const value of records) {
      const type = normalizeText(value.kind || value.type).toLowerCase() || "record";
      const id = recordId(value, type);
      const valueProjectId = normalizeText(value.projectId || value.project_id);
      if (normalized.projectId && valueProjectId !== normalized.projectId) issues.push(issue("project_mismatch", type, id));
      const valueCalculationId = normalizeText(value.calculationId || value.sourceCalculationId);
      if (normalized.calculationId && valueCalculationId !== normalized.calculationId) issues.push(issue("calculation_mismatch", type, id));
      if (value.corrupted === true || recordStatus(value) === "corrupted") issues.push(issue("corrupted_source", type, id));
      if (recordStatus(value) === "stale" || value.stale === true || array(value.staleReasons).length) issues.push(issue("stale_source", type, id));
    }
    if (normalized.result && recordStatus(normalized.result) !== "ready") issues.push(issue("result_not_ready", "result", recordId(normalized.result, "result")));
    if (normalized.runtime && normalized.result) {
      if (normalizeText(normalized.runtime.sourceResultId) && normalized.runtime.sourceResultId !== recordId(normalized.result, "result")) issues.push(issue("source_identity_mismatch", "runtime", recordId(normalized.runtime, "runtime")));
      if (normalizeText(normalized.runtime.sourceResultFingerprint) && recordIdentity(normalized.result) && normalized.runtime.sourceResultFingerprint !== recordIdentity(normalized.result)) issues.push(issue("source_identity_mismatch", "runtime", recordId(normalized.runtime, "runtime")));
    }
    if (normalized.followUp && recordStatus(normalized.followUp) !== "completed") issues.push(issue("follow_up_not_completed", "follow_up", recordId(normalized.followUp, "follow_up")));
    const newestFollowUp = latest(normalized.followUps);
    if (newestFollowUp && normalized.followUp && recordId(newestFollowUp, "follow_up") !== recordId(normalized.followUp, "follow_up")) issues.push(issue("older_follow_up_selected", "follow_up", recordId(normalized.followUp, "follow_up")));
    if (normalized.retrospective && recordStatus(normalized.retrospective) !== "completed") issues.push(issue("retrospective_not_completed", "retrospective", recordId(normalized.retrospective, "retrospective")));
    const newestRetrospective = latest(normalized.retrospectives);
    if (newestRetrospective && normalized.retrospective && recordId(newestRetrospective, "retrospective") !== recordId(normalized.retrospective, "retrospective")) issues.push(issue("older_retrospective_selected", "retrospective", recordId(normalized.retrospective, "retrospective")));
    if (normalized.retrospective) {
      const links = [["sourceResultId", normalized.result, "result"], ["sourceRuntimeId", normalized.runtime, "runtime"], ["sourceFollowUpId", normalized.followUp, "follow_up"]];
      for (const [field, value, type] of links) if (value && normalizeText(normalized.retrospective[field]) !== recordId(value, type)) issues.push(issue("source_identity_mismatch", "retrospective", recordId(normalized.retrospective, "retrospective")));
      if (normalized.retrospective.sourceSnapshot && normalized.retrospective.sourceSnapshotFingerprint !== fingerprint(normalized.retrospective.sourceSnapshot)) issues.push(issue("retrospective_snapshot_invalid", "retrospective", recordId(normalized.retrospective, "retrospective")));
      if (normalized.retrospective.integrity?.valid === false) issues.push(issue("retrospective_integrity_invalid", "retrospective", recordId(normalized.retrospective, "retrospective")));
      const retrospectiveReport = globalObject.YarnAIPatternExecutionRetrospective?.validatePatternExecutionRetrospective?.(normalized.retrospective);
      if (retrospectiveReport && !retrospectiveReport.valid) issues.push(issue("retrospective_invalid", "retrospective", recordId(normalized.retrospective, "retrospective")));
      for (const [field, value, type] of [["result", normalized.result, "result"], ["runtime", normalized.runtime, "runtime"], ["followUp", normalized.followUp, "follow_up"]]) {
        if (value && canonicalize(normalized.retrospective.sourceSnapshot?.[field] || null) !== canonicalize(sourceReference(type, value))) issues.push(issue("retrospective_source_changed", "retrospective", recordId(normalized.retrospective, "retrospective")));
      }
    }
    const currentFingerprint = fingerprint(snapshot);
    if (learning?.sourceSnapshotFingerprint && learning.sourceSnapshotFingerprint !== currentFingerprint) issues.push(issue("source_snapshot_changed", "learning", learning.id));
    if (learning?.sourceRetrospectiveId && normalized.retrospective && learning.sourceRetrospectiveId !== recordId(normalized.retrospective, "retrospective")) issues.push(issue("source_identity_mismatch", "learning", learning.id));
    if (learning?.sourceRetrospectiveIdentity && normalized.retrospective && learning.sourceRetrospectiveIdentity !== recordIdentity(normalized.retrospective)) issues.push(issue("source_identity_mismatch", "learning", learning.id));
    const unique = new Map(issues.map((entry) => [canonicalize(entry), entry]));
    const sorted = [...unique.values()].sort((left, right) => compare(left.code, right.code) || compare(left.sourceType, right.sourceType) || compare(left.sourceId, right.sourceId));
    return freeze({ valid: sorted.length === 0, criticalIssues: sorted, issues: sorted, criticalChainComplete: !sorted.some((entry) => entry.code.startsWith("missing_")), sourceSnapshotFingerprint: currentFingerprint });
  }

  function normalizeLesson(value, ordinal = 1) {
    const item = value && typeof value === "object" ? value : {};
    const title = normalizeText(item.title);
    const description = normalizeText(item.description);
    const supportingFacts = stableStrings(item.supportingFacts);
    const confidence = normalizeText(item.confidence || "medium").toLowerCase();
    return { id: normalizeText(item.id) || `lesson:${fingerprint({ title, description, supportingFacts, confidence }).slice(8)}`, title, description, supportingFacts, confidence, order: positiveInteger(item.order) || ordinal };
  }

  function normalizeSuccessfulPattern(value, ordinal = 1) {
    const item = value && typeof value === "object" ? value : {};
    const pattern = normalizeText(item.pattern);
    const rationale = normalizeText(item.rationale);
    const supportingFacts = stableStrings(item.supportingFacts);
    const confidence = normalizeText(item.confidence || "medium").toLowerCase();
    return { id: normalizeText(item.id) || `successful-pattern:${fingerprint({ pattern, rationale, supportingFacts, confidence }).slice(8)}`, pattern, rationale, supportingFacts, confidence, order: positiveInteger(item.order) || ordinal };
  }

  function normalizeAntiPattern(value, ordinal = 1) {
    const item = value && typeof value === "object" ? value : {};
    const pattern = normalizeText(item.pattern);
    const reason = normalizeText(item.reason);
    const possibleMitigation = normalizeText(item.possibleMitigation);
    const supportingFacts = stableStrings(item.supportingFacts);
    const confidence = normalizeText(item.confidence || "medium").toLowerCase();
    return { id: normalizeText(item.id) || `anti-pattern:${fingerprint({ pattern, reason, possibleMitigation, supportingFacts, confidence }).slice(8)}`, pattern, reason, possibleMitigation, supportingFacts, confidence, order: positiveInteger(item.order) || ordinal };
  }

  function normalizeRecommendation(value, ordinal = 1) {
    const item = value && typeof value === "object" ? value : {};
    const title = normalizeText(item.title);
    const priority = normalizeText(item.priority || "medium").toLowerCase();
    const rationale = normalizeText(item.rationale);
    const expectedBenefit = normalizeText(item.expectedBenefit);
    const supportingLessonIds = stableStrings(item.supportingLessonIds);
    return { id: normalizeText(item.id) || `recommendation:${fingerprint({ title, priority, rationale, expectedBenefit, supportingLessonIds }).slice(8)}`, title, priority, rationale, expectedBenefit, supportingLessonIds, order: positiveInteger(item.order) || ordinal };
  }

  function normalizeConfidenceAssessment(value = {}) {
    const item = value && typeof value === "object" ? value : {};
    return { level: normalizeText(item.level || "low").toLowerCase(), rationale: normalizeText(item.rationale), coverage: normalizeText(item.coverage), limitations: stableStrings(item.limitations) };
  }

  function stableItems(values, normalizer) {
    const unique = new Map();
    array(values).forEach((value, index) => { const item = normalizer(value, index + 1); unique.set(item.id, item); });
    return [...unique.values()].sort((left, right) => left.order - right.order || compare(left.id, right.id));
  }

  function metrics(record) {
    return freeze({ lessonCount: array(record.lessonsLearned).length, successfulPatternCount: array(record.successfulPatterns).length, antiPatternCount: array(record.antiPatterns).length, recommendationCount: array(record.recommendations).length, confidence: record.confidenceAssessment?.level || "low", completionState: record.status });
  }

  function identityPayload(record) {
    return { projectId: record.projectId, calculationId: record.calculationId, sourceRetrospectiveId: record.sourceRetrospectiveId, sourceRetrospectiveIdentity: record.sourceRetrospectiveIdentity, sourceSnapshotFingerprint: record.sourceSnapshotFingerprint, epoch: record.epoch, status: record.status, lessonsLearned: record.lessonsLearned, successfulPatterns: record.successfulPatterns, antiPatterns: record.antiPatterns, recommendations: record.recommendations, confidenceAssessment: record.confidenceAssessment };
  }

  function finalize(record) {
    record.lessonsLearned = stableItems(record.lessonsLearned, normalizeLesson);
    record.successfulPatterns = stableItems(record.successfulPatterns, normalizeSuccessfulPattern);
    record.antiPatterns = stableItems(record.antiPatterns, normalizeAntiPattern);
    record.recommendations = stableItems(record.recommendations, normalizeRecommendation);
    record.confidenceAssessment = normalizeConfidenceAssessment(record.confidenceAssessment);
    record.metrics = metrics(record);
    record.identity = fingerprint(identityPayload(record));
    return freeze(record);
  }

  function createPatternExecutionLearning(source = {}, input = {}) {
    const normalizedSource = normalizeSource(source);
    const integrity = calculateIntegrity(normalizedSource);
    if (!normalizedSource.retrospective || recordStatus(normalizedSource.retrospective) !== "completed") throw learningError("completed_retrospective_required", "A completed retrospective is required before learning can be created.");
    if (!integrity.valid) throw learningError("critical_integrity", "The retrospective source chain is incomplete or inconsistent.", { issues: integrity.criticalIssues });
    const snapshot = sourceSnapshot(normalizedSource);
    const epoch = positiveInteger(input.epoch) || 1;
    const timestamp = deterministicTimestamp(input.now, normalizedSource.retrospective?.completedAt, normalizedSource.retrospective?.updatedAt);
    const sourceRetrospectiveId = recordId(normalizedSource.retrospective, "retrospective");
    const sourceRetrospectiveIdentity = recordIdentity(normalizedSource.retrospective);
    const id = normalizeText(input.id) || `learning:${fingerprint({ projectId: normalizedSource.projectId, sourceRetrospectiveId, sourceRetrospectiveIdentity, epoch }).slice(8)}`;
    const record = {
      id, kind: PROGRESS_KIND, type: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      projectId: normalizedSource.projectId, calculationId: normalizedSource.calculationId,
      sourceResultId: recordId(normalizedSource.result, "result"), sourceRuntimeId: recordId(normalizedSource.runtime, "runtime"), sourceFollowUpId: recordId(normalizedSource.followUp, "follow_up"),
      sourceRetrospectiveId, sourceRetrospectiveIdentity, sourceSnapshot: snapshot, sourceSnapshotFingerprint: fingerprint(snapshot),
      identity: null, epoch, revision: 1, createdAt: timestamp, updatedAt: timestamp, completedAt: null, status: "draft",
      lessonsLearned: clone(array(input.lessonsLearned)), successfulPatterns: clone(array(input.successfulPatterns)), antiPatterns: clone(array(input.antiPatterns)), recommendations: clone(array(input.recommendations)),
      confidenceAssessment: clone(input.confidenceAssessment || {}), metrics: null, integrity,
      audit: [{ event: "created", at: timestamp, revision: 1 }], importedDiagnostic: null,
    };
    const next = finalize(record);
    requireRecord(next);
    return next;
  }

  function edit(record, event, command, updater) {
    requireRecord(record);
    if (record.status === "completed") throw learningError("terminal_learning", "Completed learning is immutable; create a new learning record.");
    if (record.status !== "draft") throw learningError("draft_required", "Return learning to draft before editing.");
    checkConcurrency(record, command);
    const next = clone(record); updater(next); next.revision += 1; next.updatedAt = deterministicTimestamp(command?.now, record.updatedAt); next.audit.push({ event, at: next.updatedAt, revision: next.revision });
    const finished = finalize(next); requireRecord(finished); return finished;
  }

  function addLesson(record, value, command = {}) { return edit(record, "lesson_added", command, (next) => next.lessonsLearned.push(clone(value))); }
  function addSuccessfulPattern(record, value, command = {}) { return edit(record, "successful_pattern_added", command, (next) => next.successfulPatterns.push(clone(value))); }
  function addAntiPattern(record, value, command = {}) { return edit(record, "anti_pattern_added", command, (next) => next.antiPatterns.push(clone(value))); }
  function addRecommendation(record, value, command = {}) { return edit(record, "recommendation_added", command, (next) => next.recommendations.push(clone(value))); }
  function setConfidenceAssessment(record, value, command = {}) { return edit(record, "confidence_assessed", command, (next) => { next.confidenceAssessment = clone(value); }); }
  function removeItem(record, collection, itemId, command = {}) {
    if (!["lessonsLearned", "successfulPatterns", "antiPatterns", "recommendations"].includes(collection)) throw learningError("invalid_collection", "Unknown learning category.");
    if (!array(record[collection]).some((entry) => entry.id === itemId)) throw learningError("item_not_found", "Learning item was not found.");
    if (collection === "lessonsLearned" && record.recommendations.some((entry) => entry.supportingLessonIds.includes(itemId))) throw learningError("lesson_in_use", "Lesson is referenced by a recommendation.");
    return edit(record, "item_removed", command, (next) => { next[collection] = next[collection].filter((entry) => entry.id !== itemId); });
  }

  function knowledgeComplete(record, source) {
    const factIds = new Set(array(source?.retrospective?.facts).map((entry) => normalizeText(entry.id)).filter(Boolean));
    const lessonIds = new Set(record.lessonsLearned.map((entry) => entry.id));
    return record.lessonsLearned.length > 0 && record.recommendations.length > 0 && Boolean(record.confidenceAssessment.rationale) && Boolean(record.confidenceAssessment.coverage) &&
      record.lessonsLearned.every((entry) => entry.supportingFacts.length > 0 && entry.supportingFacts.every((id) => factIds.has(id))) &&
      record.successfulPatterns.every((entry) => entry.supportingFacts.length > 0 && entry.supportingFacts.every((id) => factIds.has(id))) &&
      record.antiPatterns.every((entry) => entry.supportingFacts.length > 0 && entry.supportingFacts.every((id) => factIds.has(id))) &&
      record.recommendations.every((entry) => entry.supportingLessonIds.length > 0 && entry.supportingLessonIds.every((id) => lessonIds.has(id)));
  }

  function transition(record, nextStatus, source = null, command = {}) {
    requireRecord(record); checkConcurrency(record, command);
    if (record.status === "completed") throw learningError("terminal_learning", "Completed learning is immutable; create a new learning record.");
    const allowed = { draft: ["reviewing"], reviewing: ["draft", "completed"] };
    if (!array(allowed[record.status]).includes(nextStatus)) throw learningError("invalid_transition", `Cannot transition ${record.status} to ${nextStatus}.`);
    const integrity = source ? calculateIntegrity(source, record) : record.integrity;
    if (nextStatus === "completed" && !integrity.valid) throw learningError("critical_integrity", "Critical source-chain problems must be resolved before completion.", { issues: integrity.criticalIssues });
    if (nextStatus === "completed" && !knowledgeComplete(record, normalizeSource(source || {}))) throw learningError("learning_incomplete", "Learning requires sourced lessons, recommendations, and a confidence assessment.");
    const next = clone(record); next.status = nextStatus; next.integrity = clone(integrity); next.revision += 1; next.updatedAt = deterministicTimestamp(command.now, record.updatedAt); next.completedAt = nextStatus === "completed" ? next.updatedAt : null; next.audit.push({ event: `status_${nextStatus}`, at: next.updatedAt, revision: next.revision });
    return finalize(next);
  }

  function startReview(record, source = null, command = {}) { return transition(record, "reviewing", source, command); }
  function returnToDraft(record, source = null, command = {}) { return transition(record, "draft", source, command); }
  function completeLearning(record, source = null, command = {}) { return transition(record, "completed", source, command); }

  function validatePatternExecutionLearning(record) {
    const errors = [];
    const invalid = (code, field = null) => errors.push({ code, field });
    try { canonicalize(record); } catch { invalid("corrupted_input"); return finishValidation(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.schemaVersion !== SCHEMA_VERSION || record.version !== VERSION) invalid("kind_invalid");
    for (const field of ["id", "projectId", "calculationId", "sourceResultId", "sourceRuntimeId", "sourceFollowUpId", "sourceRetrospectiveId", "sourceRetrospectiveIdentity", "sourceSnapshotFingerprint", "identity", "createdAt", "updatedAt"]) if (!normalizeText(record?.[field])) invalid("required_field_missing", field);
    if (!STATUSES.includes(record?.status) || !positiveInteger(record?.epoch) || !positiveInteger(record?.revision)) invalid("lifecycle_invalid");
    for (const field of ["lessonsLearned", "successfulPatterns", "antiPatterns", "recommendations", "audit"]) if (!Array.isArray(record?.[field])) invalid("collection_invalid", field);
    const lessons = stableItems(record?.lessonsLearned, normalizeLesson);
    const successes = stableItems(record?.successfulPatterns, normalizeSuccessfulPattern);
    const antiPatterns = stableItems(record?.antiPatterns, normalizeAntiPattern);
    const recommendations = stableItems(record?.recommendations, normalizeRecommendation);
    for (const [field, normalizedItems] of [["lessonsLearned", lessons], ["successfulPatterns", successes], ["antiPatterns", antiPatterns], ["recommendations", recommendations]]) if (canonicalize(array(record?.[field])) !== canonicalize(normalizedItems)) invalid("collection_not_normalized", field);
    for (const lesson of lessons) if (!lesson.title || !lesson.description || !lesson.supportingFacts.length || !CONFIDENCE_LEVELS.includes(lesson.confidence)) invalid("lesson_invalid", lesson.id);
    for (const pattern of successes) if (!pattern.pattern || !pattern.rationale || !pattern.supportingFacts.length || !CONFIDENCE_LEVELS.includes(pattern.confidence)) invalid("successful_pattern_invalid", pattern.id);
    for (const pattern of antiPatterns) if (!pattern.pattern || !pattern.reason || !pattern.possibleMitigation || !pattern.supportingFacts.length || !CONFIDENCE_LEVELS.includes(pattern.confidence)) invalid("anti_pattern_invalid", pattern.id);
    const lessonIds = new Set(lessons.map((entry) => entry.id));
    for (const recommendation of recommendations) if (!recommendation.title || !PRIORITIES.includes(recommendation.priority) || !recommendation.rationale || !recommendation.expectedBenefit || !recommendation.supportingLessonIds.length || recommendation.supportingLessonIds.some((id) => !lessonIds.has(id))) invalid("recommendation_invalid", recommendation.id);
    const assessment = normalizeConfidenceAssessment(record?.confidenceAssessment);
    if (canonicalize(record?.confidenceAssessment || {}) !== canonicalize(assessment) || !CONFIDENCE_LEVELS.includes(assessment.level)) invalid("confidence_assessment_invalid", "confidenceAssessment");
    if (record?.status === "completed" && !isTimestamp(record.completedAt)) invalid("completion_timestamp_missing");
    if (!isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("timestamp_invalid");
    if (record?.sourceSnapshotFingerprint !== fingerprint(record?.sourceSnapshot)) invalid("source_snapshot_mismatch");
    if (record?.identity && record.identity !== fingerprint(identityPayload(record))) invalid("identity_mismatch");
    if (record?.metrics && canonicalize(record.metrics) !== canonicalize(metrics(record))) invalid("metrics_mismatch");
    return finishValidation(errors);
  }

  function safeNormalizePatternExecutionLearning(value) {
    try { const parsed = typeof value === "string" ? JSON.parse(value) : clone(value); const report = validatePatternExecutionLearning(parsed); return report.valid ? freeze({ record: freeze(parsed), corrupted: false, errors: [] }) : freeze({ record: null, corrupted: true, errors: report.errors }); }
    catch { return freeze({ record: null, corrupted: true, errors: [{ code: "corrupted_input", field: null }] }); }
  }

  function projectPatternExecutionLearning(record, source = {}) {
    const safe = safeNormalizePatternExecutionLearning(record);
    if (safe.corrupted) return freeze({ effectiveStatus: "corrupted", stale: false, corrupted: true, integrity: null, reasonCode: "corrupted_input" });
    const integrity = calculateIntegrity(source, record);
    const stale = integrity.issues.some((entry) => ["source_snapshot_changed", "stale_source", "source_identity_mismatch"].includes(entry.code));
    return freeze({ effectiveStatus: stale ? "stale" : record.status, stale, corrupted: false, integrity, reasonCode: stale ? "source_snapshot_changed" : integrity.valid ? null : "critical_integrity" });
  }

  function isPatternExecutionLearningStale(record, source = {}) { return projectPatternExecutionLearning(record, source).stale; }
  function serializePatternExecutionLearning(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternExecutionLearning(value) { const safe = safeNormalizePatternExecutionLearning(value); if (safe.corrupted) throw learningError("corrupted_input", "Learning data is corrupted."); return safe.record; }

  function remapPatternExecutionLearning(record, referenceMap) {
    requireRecord(record);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(clone(record), map);
    next.sourceSnapshotFingerprint = fingerprint(next.sourceSnapshot);
    next.sourceRetrospectiveIdentity = next.sourceSnapshot?.retrospective?.identity || next.sourceRetrospectiveIdentity;
    next.id = `learning:${fingerprint({ projectId: next.projectId, sourceRetrospectiveId: next.sourceRetrospectiveId, sourceRetrospectiveIdentity: next.sourceRetrospectiveIdentity, epoch: next.epoch }).slice(8)}`;
    next.integrity = { ...clone(next.integrity), sourceSnapshotFingerprint: next.sourceSnapshotFingerprint };
    return finalize(next);
  }

  function makeImportedPatternExecutionLearningStale(record, options = {}) {
    requireRecord(record);
    const next = clone(record); next.importedDiagnostic = { reason: normalizeText(options.reason) || "import_identity_unproven", collision: Boolean(options.collision), preservedStatus: record.status }; next.status = "stale"; next.revision += 1; next.updatedAt = deterministicTimestamp(options.now, record.updatedAt); next.audit.push({ event: "imported_stale", at: next.updatedAt, revision: next.revision }); return finalize(next);
  }

  function importPatternExecutionLearning(existing, serialized, options = {}) {
    const record = deserializePatternExecutionLearning(serialized);
    const duplicate = array(existing).find((entry) => entry.identity === record.identity);
    if (duplicate) return freeze({ status: "duplicate", record: duplicate, changed: false });
    const imported = options.referenceMap ? remapPatternExecutionLearning(record, options.referenceMap) : record;
    return freeze({ status: "imported", record: imported, changed: true });
  }

  async function loadSource(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const project = aggregate.project || aggregate;
    const calculationId = project.active_calculation_id;
    if (!calculationId) return { project, projectId, calculationId: null };
    const [resultRecord, runtimeRecord, followUpRecords, retrospectiveRecords] = await Promise.all([
      repository.getPatternExecutionResult(projectId, calculationId), repository.getPatternExecutionRuntime(projectId, calculationId), repository.listPatternExecutionFollowUps(projectId, calculationId), repository.listPatternExecutionRetrospectives(projectId, calculationId),
    ]);
    const followUps = followUpRecords.map((entry) => entry.state);
    const retrospectives = retrospectiveRecords.map((entry) => entry.state);
    return { project, projectId, calculationId, result: resultRecord?.state || null, runtime: runtimeRecord?.state || null, followUps, followUp: latest(followUps), retrospectives, retrospective: latest(retrospectives) };
  }

  async function readForProject(repository, projectId, learningId = null) {
    let source;
    try { source = await loadSource(repository, projectId); } catch (error) { return freeze({ projectId, effectiveStatus: "corrupted", reasonCode: normalizeText(error?.code) || "source_load_failed", corrupted: true, stale: false, rawLearning: null, availableCommands: [] }); }
    let record;
    try { record = await repository.getPatternExecutionLearning(projectId, learningId, source.calculationId); } catch (error) { return freeze({ ...source, effectiveStatus: "corrupted", reasonCode: normalizeText(error?.code) || "learning_load_failed", corrupted: true, stale: false, rawLearning: null, availableCommands: [] }); }
    if (!record) {
      const integrity = calculateIntegrity(source);
      return freeze({ ...source, rawLearning: null, learningRecord: null, integrity, effectiveStatus: integrity.valid ? "draft" : "blocked", stale: false, corrupted: false, reasonCode: integrity.valid ? null : "critical_integrity", availableCommands: integrity.valid ? ["create"] : [] });
    }
    const projected = projectPatternExecutionLearning(record.state, source);
    const availableCommands = projected.effectiveStatus === "draft" ? ["save", "review"] : projected.effectiveStatus === "reviewing" ? ["draft", "complete"] : [];
    return freeze({ ...source, rawLearning: record.state, learningRecord: record, ...projected, availableCommands });
  }

  async function createForProject(repository, projectId, input = {}) {
    const source = await loadSource(repository, projectId);
    const existing = await repository.listPatternExecutionLearnings(projectId, source.calculationId);
    const record = createPatternExecutionLearning(source, { ...clone(input), epoch: existing.reduce((maximum, entry) => Math.max(maximum, entry.state?.epoch || 0), 0) + 1 });
    await repository.savePatternExecutionLearning(projectId, record, { timestamp: record.updatedAt, operationKind: "PATTERN_EXECUTION_LEARNING_CREATED" });
    return readForProject(repository, projectId, record.id);
  }

  function requireRecord(record) { const report = validatePatternExecutionLearning(record); if (!report.valid) throw learningError("corrupted_input", "Learning snapshot is corrupted.", { errors: report.errors }); }
  function checkConcurrency(record, command = {}) { if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw learningError("revision_conflict", "Learning revision changed."); if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw learningError("identity_conflict", "Learning identity changed."); }
  function finishValidation(errors) { const sorted = errors.sort((left, right) => compare(left.code, right.code) || compare(left.field, right.field)); return freeze({ valid: sorted.length === 0, errors: sorted }); }
  function deterministicTimestamp(...values) { return values.find(isTimestamp) || DEFAULT_TIMESTAMP; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function remapExact(value, map) { if (typeof value === "string") return map.get(value) || value; if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map)); if (value && typeof value === "object") for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); return value; }
  function normalize(value) { if (value === undefined) return null; if (Array.isArray(value)) return value.map(normalize); if (value && typeof value === "object") { const next = {}; for (const key of Object.keys(value).sort(compare)) next[key] = normalize(value[key]); return next; } return value; }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function learningError(code, message, details) { return new PatternExecutionLearningError(code, message, details); }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, STATUSES, CONFIDENCE_LEVELS, PRIORITIES, DEFAULT_TIMESTAMP,
    PatternExecutionLearningError, canonicalize, fingerprint, normalizeText, normalizeSource, sourceSnapshot, calculateIntegrity,
    createPatternExecutionLearning, addLesson, addSuccessfulPattern, addAntiPattern, addRecommendation, setConfidenceAssessment, removeItem,
    startReview, returnToDraft, completeLearning, validatePatternExecutionLearning, safeNormalizePatternExecutionLearning,
    projectPatternExecutionLearning, isPatternExecutionLearningStale, serializePatternExecutionLearning, deserializePatternExecutionLearning,
    remapPatternExecutionLearning, makeImportedPatternExecutionLearningStale, importPatternExecutionLearning, loadSource, readForProject, createForProject,
  });
  globalObject.YarnAIPatternExecutionLearning = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
