"use strict";

(function exposePatternExecutionRetrospective(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_RETROSPECTIVE";
  const STATUSES = Object.freeze(["draft", "reviewing", "completed", "stale", "corrupted"]);
  const EVIDENCE_LEVELS = Object.freeze(["direct", "verified", "derived"]);
  const CONCLUSION_STATUSES = Object.freeze(["proposed", "confirmed", "rejected"]);
  const CONSIDERATION_SCOPES = Object.freeze(["this_project", "similar_project", "general_review"]);
  const CRITICAL_SOURCES = Object.freeze(["result", "runtime", "follow_up"]);
  const OPTIONAL_SOURCES = Object.freeze(["monitoring", "intervention", "action", "evidence", "verification", "decision"]);
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

  class PatternExecutionRetrospectiveError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionRetrospectiveError";
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
      if (!Number.isFinite(value)) throw retrospectiveError("corrupted_input", "Retrospective contains an invalid number.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) throw retrospectiveError("corrupted_input", "Retrospective contains an unsupported value.");
    if (seen.has(value)) throw retrospectiveError("corrupted_input", "Retrospective cannot contain cyclic data.");
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = `[${value.map((entry) => canonicalize(entry, seen)).join(",")}]`;
    else if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      result = `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    } else {
      seen.delete(value);
      throw retrospectiveError("corrupted_input", "Retrospective accepts canonical JSON objects only.");
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

  function normalizeReference(value) {
    if (typeof value === "string") return normalizeText(value) ? { sourceType: "record", sourceId: normalizeText(value), identity: null } : null;
    if (!value || typeof value !== "object") return null;
    const sourceType = normalizeText(value.sourceType || value.type || value.kind).toLowerCase();
    const sourceId = normalizeText(value.sourceId || value.id || value.resultId);
    if (!sourceType || !sourceId) return null;
    return {
      sourceType,
      sourceId,
      identity: normalizeText(value.identity || value.fingerprint || value.resultFingerprint || value.runtimeFingerprint) || null,
    };
  }

  function stableReferences(values) {
    const unique = new Map();
    for (const value of array(values)) {
      const reference = normalizeReference(value);
      if (reference) unique.set(canonicalize(reference), reference);
    }
    return [...unique.entries()].sort((left, right) => compare(left[0], right[0])).map((entry) => entry[1]);
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
    const followUp = source.followUp || source.follow_up || source.rawFollowUp || latest(source.followUps);
    const projectId = normalizeText(source.projectId || source.project?.project_id || source.project?.projectId || source.result?.projectId || source.runtime?.projectId || followUp?.projectId);
    const calculationId = normalizeText(source.calculationId || source.project?.active_calculation_id || source.result?.sourceCalculationId || source.runtime?.calculationId || followUp?.calculationId);
    const normalized = {
      project: source.project || null,
      projectId: projectId || null,
      calculationId: calculationId || null,
      result: source.result || null,
      runtime: source.runtime || null,
      monitoring: source.monitoring || null,
      interventions: array(source.interventions || source.intervention),
      actions: array(source.actions || source.action),
      evidence: array(source.evidence),
      verifications: array(source.verifications || source.verification),
      decisions: array(source.decisions || source.decision),
      followUp: followUp || null,
      followUps: array(source.followUps),
      declaredSourceIdentity: normalizeText(source.sourceIdentity) || null,
      followUpSourceIdentity: normalizeText(followUp?.sourceIdentity || followUp?.sourceIdentityFingerprint) || null,
    };
    if (source.intervention && !Array.isArray(source.intervention)) normalized.interventions = [source.intervention];
    if (source.action && !Array.isArray(source.action)) normalized.actions = [source.action];
    if (source.verification && !Array.isArray(source.verification)) normalized.verifications = [source.verification];
    if (source.decision && !Array.isArray(source.decision)) normalized.decisions = [source.decision];
    return normalized;
  }

  function sourceSnapshot(source = {}) {
    const normalized = normalizeSource(source);
    const list = (type, values) => array(values).map((entry) => sourceReference(type, entry)).filter(Boolean)
      .sort((left, right) => compare(left.sourceId, right.sourceId) || compare(left.identity, right.identity));
    return normalize({
      projectId: normalized.projectId,
      calculationId: normalized.calculationId,
      result: sourceReference("result", normalized.result),
      runtime: sourceReference("runtime", normalized.runtime),
      monitoring: sourceReference("monitoring", normalized.monitoring),
      interventions: list("intervention", normalized.interventions),
      actions: list("action", normalized.actions),
      evidence: list("evidence", normalized.evidence),
      verifications: list("verification", normalized.verifications),
      decisions: list("decision", normalized.decisions),
      followUp: sourceReference("follow_up", normalized.followUp),
      declaredSourceIdentity: normalized.declaredSourceIdentity,
      followUpSourceIdentity: normalized.followUpSourceIdentity,
    });
  }

  function issue(code, severity, sourceType, sourceId = null) {
    return { code, severity, sourceType, sourceId: sourceId || null };
  }

  function calculateIntegrity(source = {}, retrospective = null) {
    const normalized = normalizeSource(source);
    const snapshot = sourceSnapshot(normalized);
    const issues = [];
    for (const type of CRITICAL_SOURCES) {
      const value = type === "follow_up" ? normalized.followUp : normalized[type];
      if (!value) issues.push(issue(`missing_${type}`, "critical", type));
    }
    for (const type of OPTIONAL_SOURCES) {
      const present = type === "monitoring" ? Boolean(normalized.monitoring) : array(normalized[`${type}s`] || normalized[type]).length > 0;
      if (!present) issues.push(issue(`missing_${type}`, "advisory", type));
    }
    const records = [normalized.result, normalized.runtime, normalized.monitoring, ...normalized.interventions, ...normalized.actions, ...normalized.evidence, ...normalized.verifications, ...normalized.decisions, normalized.followUp].filter(Boolean);
    for (const value of records) {
      const type = normalizeText(value.kind || value.type).toLowerCase() || "record";
      const id = recordId(value, type);
      const valueProjectId = normalizeText(value.projectId || value.project_id);
      if (valueProjectId && normalized.projectId && valueProjectId !== normalized.projectId) issues.push(issue("project_mismatch", "critical", type, id));
      if (value.corrupted === true || recordStatus(value) === "corrupted") issues.push(issue("corrupted_source", "critical", type, id));
      if (recordStatus(value) === "stale" || value.stale === true || array(value.staleReasons).length) issues.push(issue("stale_source", "critical", type, id));
    }
    if (normalized.result && recordStatus(normalized.result) !== "ready") issues.push(issue("result_not_ready", "critical", "result", recordId(normalized.result, "result")));
    if (normalized.runtime && normalized.result) {
      const resultId = recordId(normalized.result, "result");
      const resultIdentity = recordIdentity(normalized.result);
      if (normalizeText(normalized.runtime.sourceResultId) && normalized.runtime.sourceResultId !== resultId) issues.push(issue("source_identity_mismatch", "critical", "runtime", recordId(normalized.runtime, "runtime")));
      if (normalizeText(normalized.runtime.sourceResultFingerprint) && resultIdentity && normalized.runtime.sourceResultFingerprint !== resultIdentity) issues.push(issue("source_identity_mismatch", "critical", "runtime", recordId(normalized.runtime, "runtime")));
    }
    if (normalized.followUp && recordStatus(normalized.followUp) !== "completed") issues.push(issue("follow_up_not_completed", "critical", "follow_up", recordId(normalized.followUp, "follow_up")));
    const newerFollowUp = latest(normalized.followUps);
    if (newerFollowUp && normalized.followUp && recordId(newerFollowUp, "follow_up") !== recordId(normalized.followUp, "follow_up")) issues.push(issue("older_follow_up_selected", "critical", "follow_up", recordId(normalized.followUp, "follow_up")));
    if (normalized.declaredSourceIdentity && normalized.followUpSourceIdentity && normalized.declaredSourceIdentity !== normalized.followUpSourceIdentity) issues.push(issue("source_identity_mismatch", "critical", "follow_up", recordId(normalized.followUp, "follow_up")));
    const optionalIds = new Set([normalized.monitoring, ...normalized.interventions, ...normalized.actions, ...normalized.evidence, ...normalized.verifications, ...normalized.decisions].filter(Boolean).flatMap((entry) => [recordId(entry, "record"), ...array(entry.evidenceItems).map((item) => recordId(item, "record"))]).filter(Boolean));
    const followUp = normalized.followUp || {};
    for (const reference of [followUp.verificationReference, ...array(followUp.actionReferences), ...array(followUp.evidenceReferences)].filter(Boolean)) {
      if (reference.id && !optionalIds.has(reference.id)) issues.push(issue("missing_referenced_source", "advisory", normalizeText(reference.kind || "reference"), reference.id));
    }
    const currentFingerprint = fingerprint(snapshot);
    if (retrospective?.sourceSnapshotFingerprint && retrospective.sourceSnapshotFingerprint !== currentFingerprint) issues.push(issue("source_snapshot_changed", "critical", "retrospective", retrospective.id));
    const unique = new Map(issues.map((entry) => [canonicalize(entry), entry]));
    const sorted = [...unique.values()].sort((left, right) => compare(left.severity, right.severity) || compare(left.code, right.code) || compare(left.sourceType, right.sourceType) || compare(left.sourceId, right.sourceId));
    return freeze({
      valid: !sorted.some((entry) => entry.severity === "critical"),
      criticalIssues: sorted.filter((entry) => entry.severity === "critical"),
      advisoryIssues: sorted.filter((entry) => entry.severity === "advisory"),
      issues: sorted,
      sourceChainComplete: !sorted.some((entry) => entry.code.startsWith("missing_")),
      criticalChainComplete: !sorted.some((entry) => entry.severity === "critical" && entry.code.startsWith("missing_")),
      sourceSnapshotFingerprint: currentFingerprint,
    });
  }

  function normalizeFact(value, ordinal = 1) {
    const item = value && typeof value === "object" ? value : { text: value };
    const textValue = normalizeText(item.text);
    const refs = stableReferences(item.sourceRefs || (item.sourceId ? [{ sourceType: item.sourceType, sourceId: item.sourceId }] : []));
    const evidenceLevel = normalizeText(item.evidenceLevel || "direct").toLowerCase();
    const id = normalizeText(item.id) || `fact:${fingerprint({ text: textValue, refs, evidenceLevel }).slice(8)}`;
    return {
      id, text: textValue, sourceType: normalizeText(item.sourceType || refs[0]?.sourceType || "user").toLowerCase(),
      sourceId: normalizeText(item.sourceId || refs[0]?.sourceId) || null, sourceRefs: refs,
      evidenceLevel, tags: stableStrings(item.tags), order: positiveInteger(item.order) || ordinal,
      origin: item.origin === "automatic" ? "automatic" : "user",
    };
  }

  function normalizeConclusion(value, ordinal = 1) {
    const item = value && typeof value === "object" ? value : { text: value };
    const textValue = normalizeText(item.text);
    const factIds = stableStrings(item.factIds || item.relatedFactIds);
    return {
      id: normalizeText(item.id) || `conclusion:${fingerprint({ text: textValue, factIds }).slice(8)}`,
      text: textValue, factIds, status: normalizeText(item.status || "proposed").toLowerCase(),
      order: positiveInteger(item.order) || ordinal, origin: item.origin === "automatic" ? "automatic" : "user",
    };
  }

  function normalizeQuestion(value, ordinal = 1) {
    const item = value && typeof value === "object" ? value : { text: value };
    const textValue = normalizeText(item.text);
    const refs = stableReferences(item.sourceRefs);
    const reason = normalizeText(item.reason);
    return {
      id: normalizeText(item.id) || `question:${fingerprint({ text: textValue, refs, reason }).slice(8)}`,
      text: textValue, sourceRefs: refs, reason, nextCheck: normalizeText(item.nextCheck) || null,
      order: positiveInteger(item.order) || ordinal, origin: item.origin === "automatic" ? "automatic" : "user",
    };
  }

  function normalizeConsideration(value, ordinal = 1) {
    const item = value && typeof value === "object" ? value : { text: value };
    const textValue = normalizeText(item.text);
    const rationale = normalizeText(item.rationale);
    const relatedFactIds = stableStrings(item.relatedFactIds);
    const relatedConclusionIds = stableStrings(item.relatedConclusionIds);
    return {
      id: normalizeText(item.id) || `consideration:${fingerprint({ text: textValue, rationale, relatedFactIds, relatedConclusionIds }).slice(8)}`,
      text: textValue, rationale, relatedFactIds, relatedConclusionIds,
      scope: normalizeText(item.scope || "this_project").toLowerCase(), order: positiveInteger(item.order) || ordinal,
      origin: item.origin === "automatic" ? "automatic" : "user",
    };
  }

  function stableItems(values, normalizer) {
    const unique = new Map();
    array(values).forEach((value, index) => {
      const item = normalizer(value, index + 1);
      unique.set(item.id, item);
    });
    return [...unique.values()].sort((left, right) => left.order - right.order || compare(left.id, right.id));
  }

  function automaticFacts(source = {}) {
    const snapshot = sourceSnapshot(source);
    const entries = [snapshot.result, snapshot.runtime, snapshot.monitoring, ...snapshot.interventions, ...snapshot.actions, ...snapshot.evidence, ...snapshot.verifications, ...snapshot.decisions, snapshot.followUp].filter(Boolean);
    return entries.map((entry, index) => normalizeFact({
      text: `${entry.sourceType} ${entry.sourceId || "without id"} recorded with status ${entry.status || "unspecified"}.`,
      sourceType: entry.sourceType, sourceId: entry.sourceId, sourceRefs: [entry], evidenceLevel: "direct",
      tags: ["source_chain"], order: index + 1, origin: "automatic",
    }, index + 1));
  }

  function machineSummary(record, integrity = record.integrity) {
    return freeze({
      factCount: array(record.facts).length,
      confirmedConclusionCount: array(record.conclusions).filter((entry) => entry.status === "confirmed").length,
      unresolvedQuestionCount: array(record.unresolvedQuestions).length,
      futureConsiderationCount: array(record.futureConsiderations).length,
      completionState: record.status,
      sourceChainComplete: Boolean(integrity?.sourceChainComplete),
      criticalChainComplete: Boolean(integrity?.criticalChainComplete),
      hasIntegrityProblems: Boolean(integrity?.issues?.length),
      stale: record.status === "stale" || array(integrity?.issues).some((entry) => entry.code === "source_snapshot_changed" || entry.code === "stale_source"),
    });
  }

  function identityPayload(record) {
    return {
      projectId: record.projectId, sourceIdentity: record.sourceIdentity, sourceFollowUpIdentity: record.sourceFollowUpIdentity,
      epoch: record.epoch, status: record.status, facts: record.facts, conclusions: record.conclusions,
      unresolvedQuestions: record.unresolvedQuestions, futureConsiderations: record.futureConsiderations,
      userSummary: record.summary.userText, sourceSnapshotFingerprint: record.sourceSnapshotFingerprint,
    };
  }

  function finalize(record) {
    record.facts = stableItems(record.facts, normalizeFact);
    record.conclusions = stableItems(record.conclusions, normalizeConclusion);
    record.unresolvedQuestions = stableItems(record.unresolvedQuestions, normalizeQuestion);
    record.futureConsiderations = stableItems(record.futureConsiderations, normalizeConsideration);
    record.summary = { machine: machineSummary(record, record.integrity), userText: normalizeText(record.summary?.userText) || null };
    record.identity = fingerprint(identityPayload(record));
    return freeze(record);
  }

  function createPatternExecutionRetrospective(source = {}, input = {}) {
    const normalizedSource = normalizeSource(source);
    const integrity = calculateIntegrity(normalizedSource);
    const snapshot = sourceSnapshot(normalizedSource);
    const epoch = positiveInteger(input.epoch) || 1;
    const timestamp = deterministicTimestamp(input.now, normalizedSource.followUp?.updatedAt, normalizedSource.runtime?.updatedAt, normalizedSource.result?.updatedAt);
    const sourceIdentity = fingerprint(snapshot);
    const sourceFollowUpIdentity = recordIdentity(normalizedSource.followUp);
    const id = normalizeText(input.id) || `retrospective:${fingerprint({ projectId: normalizedSource.projectId, sourceIdentity, sourceFollowUpIdentity, epoch }).slice(8)}`;
    const record = {
      id, kind: PROGRESS_KIND, type: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      projectId: normalizedSource.projectId, calculationId: normalizedSource.calculationId,
      sourceResultId: recordId(normalizedSource.result, "result"), sourceRuntimeId: recordId(normalizedSource.runtime, "runtime"),
      sourceMonitoringId: recordId(normalizedSource.monitoring, "monitoring"), sourceFollowUpId: recordId(normalizedSource.followUp, "follow_up"),
      sourceIdentity, sourceFollowUpIdentity, sourceSnapshot: snapshot, sourceSnapshotFingerprint: fingerprint(snapshot),
      identity: null, epoch, revision: 1, createdAt: timestamp, updatedAt: timestamp, completedAt: null,
      status: "draft", facts: input.includeAutomaticFacts === false ? [] : automaticFacts(normalizedSource),
      conclusions: [], unresolvedQuestions: [], futureConsiderations: [],
      summary: { machine: null, userText: normalizeText(input.userSummary) || null }, integrity,
      audit: [{ event: "created", at: timestamp, revision: 1 }], importedDiagnostic: null,
    };
    for (const item of array(input.facts)) record.facts.push({ ...clone(item), origin: item?.origin || "user" });
    record.conclusions = clone(array(input.conclusions));
    record.unresolvedQuestions = clone(array(input.unresolvedQuestions));
    record.futureConsiderations = clone(array(input.futureConsiderations));
    const next = finalize(record);
    requireRecord(next);
    return next;
  }

  function edit(record, event, command, updater) {
    requireRecord(record);
    if (record.status === "completed") throw retrospectiveError("terminal_retrospective", "Completed retrospective is immutable; create a new retrospective.");
    if (record.status !== "draft") throw retrospectiveError("draft_required", "Return the retrospective to draft before editing.");
    checkConcurrency(record, command);
    const next = clone(record);
    updater(next);
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(command?.now, record.updatedAt);
    next.audit.push({ event, at: next.updatedAt, revision: next.revision });
    const finished = finalize(next);
    requireRecord(finished);
    return finished;
  }

  function addFact(record, value, command = {}) {
    return edit(record, "fact_added", command, (next) => { next.facts.push({ ...clone(value), origin: value?.origin || "user" }); });
  }

  function addConclusion(record, value, command = {}) {
    const factIds = new Set(record.facts.map((entry) => entry.id));
    const normalized = normalizeConclusion(value);
    if (!normalized.factIds.length || normalized.factIds.some((id) => !factIds.has(id))) throw retrospectiveError("missing_fact_reference", "Conclusion must reference existing facts.");
    return edit(record, "conclusion_added", command, (next) => { next.conclusions.push(normalized); });
  }

  function addUnresolvedQuestion(record, value, command = {}) {
    return edit(record, "question_added", command, (next) => { next.unresolvedQuestions.push({ ...clone(value), origin: value?.origin || "user" }); });
  }

  function addFutureConsideration(record, value, command = {}) {
    return edit(record, "consideration_added", command, (next) => { next.futureConsiderations.push({ ...clone(value), origin: value?.origin || "user" }); });
  }

  function removeItem(record, collection, itemId, command = {}) {
    const allowed = ["facts", "conclusions", "unresolvedQuestions", "futureConsiderations"];
    if (!allowed.includes(collection)) throw retrospectiveError("invalid_collection", "Unknown retrospective category.");
    const current = array(record[collection]).find((entry) => entry.id === itemId);
    if (!current || current.origin === "automatic") throw retrospectiveError("item_not_removable", "Only unfinished user items can be removed.");
    if (collection === "facts" && record.conclusions.some((entry) => entry.factIds.includes(itemId))) throw retrospectiveError("fact_in_use", "Fact is referenced by a conclusion.");
    return edit(record, "item_removed", command, (next) => { next[collection] = next[collection].filter((entry) => entry.id !== itemId); });
  }

  function transition(record, nextStatus, source = null, command = {}) {
    requireRecord(record);
    checkConcurrency(record, command);
    if (record.status === "completed") throw retrospectiveError("terminal_retrospective", "Completed retrospective is immutable; create a new retrospective.");
    const allowed = { draft: ["reviewing"], reviewing: ["draft", "completed"] };
    if (!array(allowed[record.status]).includes(nextStatus)) throw retrospectiveError("invalid_transition", `Cannot transition ${record.status} to ${nextStatus}.`);
    const integrity = source ? calculateIntegrity(source, record) : record.integrity;
    if (nextStatus === "completed" && !integrity.valid) throw retrospectiveError("critical_integrity", "Critical source-chain problems must be resolved before completion.", { issues: integrity.criticalIssues });
    const next = clone(record);
    next.status = nextStatus;
    next.integrity = clone(integrity);
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(command.now, record.updatedAt);
    next.completedAt = nextStatus === "completed" ? next.updatedAt : null;
    next.audit.push({ event: `status_${nextStatus}`, at: next.updatedAt, revision: next.revision });
    return finalize(next);
  }

  function startReview(record, source = null, command = {}) { return transition(record, "reviewing", source, command); }
  function returnToDraft(record, source = null, command = {}) { return transition(record, "draft", source, command); }
  function completeRetrospective(record, source = null, command = {}) { return transition(record, "completed", source, command); }

  function validatePatternExecutionRetrospective(record) {
    const errors = [];
    const invalid = (code, field = null) => errors.push({ code, field });
    try { canonicalize(record); } catch { invalid("corrupted_input"); return finishValidation(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.schemaVersion !== SCHEMA_VERSION || record.version !== VERSION) invalid("kind_invalid");
    for (const field of ["id", "projectId", "calculationId", "sourceIdentity", "sourceSnapshotFingerprint", "identity", "createdAt", "updatedAt"]) if (!normalizeText(record?.[field])) invalid("required_field_missing", field);
    if (!STATUSES.includes(record?.status) || !positiveInteger(record?.epoch) || !positiveInteger(record?.revision)) invalid("lifecycle_invalid");
    for (const field of ["facts", "conclusions", "unresolvedQuestions", "futureConsiderations", "audit"]) if (!Array.isArray(record?.[field])) invalid("collection_invalid", field);
    const facts = stableItems(record?.facts, normalizeFact);
    const conclusions = stableItems(record?.conclusions, normalizeConclusion);
    const questions = stableItems(record?.unresolvedQuestions, normalizeQuestion);
    const considerations = stableItems(record?.futureConsiderations, normalizeConsideration);
    if (canonicalize(array(record?.facts)) !== canonicalize(facts)) invalid("collection_not_normalized", "facts");
    if (canonicalize(array(record?.conclusions)) !== canonicalize(conclusions)) invalid("collection_not_normalized", "conclusions");
    if (canonicalize(array(record?.unresolvedQuestions)) !== canonicalize(questions)) invalid("collection_not_normalized", "unresolvedQuestions");
    if (canonicalize(array(record?.futureConsiderations)) !== canonicalize(considerations)) invalid("collection_not_normalized", "futureConsiderations");
    const factIds = new Set(facts.map((entry) => entry.id));
    const conclusionIds = new Set(conclusions.map((entry) => entry.id));
    for (const fact of facts) {
      if (!fact.text || !EVIDENCE_LEVELS.includes(fact.evidenceLevel) || !fact.sourceRefs.length || fact.evidenceLevel === "derived" && fact.sourceRefs.length < 2) invalid("fact_invalid", fact.id);
    }
    for (const conclusion of conclusions) if (!conclusion.text || !CONCLUSION_STATUSES.includes(conclusion.status) || !conclusion.factIds.length || conclusion.factIds.some((id) => !factIds.has(id))) invalid("conclusion_invalid", conclusion.id);
    for (const question of questions) if (!question.text || !question.reason || !question.sourceRefs.length) invalid("question_invalid", question.id);
    for (const consideration of considerations) if (!consideration.text || !consideration.rationale || !CONSIDERATION_SCOPES.includes(consideration.scope) || consideration.relatedFactIds.some((id) => !factIds.has(id)) || consideration.relatedConclusionIds.some((id) => !conclusionIds.has(id))) invalid("consideration_invalid", consideration.id);
    if (record?.status === "completed" && !isTimestamp(record.completedAt)) invalid("completion_timestamp_missing");
    if (!isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("timestamp_invalid");
    if (record?.identity && record.identity !== fingerprint(identityPayload(record))) invalid("identity_mismatch");
    if (record?.summary?.machine && canonicalize(record.summary.machine) !== canonicalize(machineSummary(record, record.integrity))) invalid("summary_mismatch");
    return finishValidation(errors);
  }

  function safeNormalizePatternExecutionRetrospective(value) {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : clone(value);
      const report = validatePatternExecutionRetrospective(parsed);
      if (report.valid) return freeze({ record: freeze(parsed), corrupted: false, errors: [] });
      return freeze({ record: null, corrupted: true, errors: report.errors });
    } catch {
      return freeze({ record: null, corrupted: true, errors: [{ code: "corrupted_input", field: null }] });
    }
  }

  function projectPatternExecutionRetrospective(record, source = {}) {
    const safe = safeNormalizePatternExecutionRetrospective(record);
    if (safe.corrupted) return freeze({ effectiveStatus: "corrupted", stale: false, corrupted: true, integrity: null, reasonCode: "corrupted_input" });
    const integrity = calculateIntegrity(source, record);
    const stale = integrity.issues.some((entry) => entry.code === "source_snapshot_changed" || entry.code === "stale_source");
    return freeze({ effectiveStatus: stale ? "stale" : record.status, stale, corrupted: false, integrity, reasonCode: stale ? "source_snapshot_changed" : null });
  }

  function isPatternExecutionRetrospectiveStale(record, source = {}) { return projectPatternExecutionRetrospective(record, source).stale; }
  function serializePatternExecutionRetrospective(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternExecutionRetrospective(value) {
    const safe = safeNormalizePatternExecutionRetrospective(value);
    if (safe.corrupted) throw retrospectiveError("corrupted_input", "Retrospective data is corrupted.");
    return safe.record;
  }

  function remapPatternExecutionRetrospective(record, referenceMap) {
    requireRecord(record);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(clone(record), map);
    next.sourceSnapshotFingerprint = fingerprint(next.sourceSnapshot);
    next.sourceIdentity = fingerprint(next.sourceSnapshot);
    next.sourceFollowUpIdentity = next.sourceSnapshot?.followUp?.identity || next.sourceFollowUpIdentity;
    next.id = `retrospective:${fingerprint({ projectId: next.projectId, sourceIdentity: next.sourceIdentity, sourceFollowUpIdentity: next.sourceFollowUpIdentity, epoch: next.epoch }).slice(8)}`;
    next.integrity = { ...clone(next.integrity), sourceSnapshotFingerprint: next.sourceSnapshotFingerprint };
    return finalize(next);
  }

  function makeImportedPatternExecutionRetrospectiveStale(record, options = {}) {
    requireRecord(record);
    const next = clone(record);
    next.importedDiagnostic = { reason: normalizeText(options.reason) || "import_identity_unproven", collision: Boolean(options.collision), preservedStatus: record.status };
    next.status = "stale";
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(options.now, record.updatedAt);
    next.audit.push({ event: "imported_stale", at: next.updatedAt, revision: next.revision });
    return finalize(next);
  }

  function importPatternExecutionRetrospective(existing, serialized, options = {}) {
    const record = deserializePatternExecutionRetrospective(serialized);
    const duplicate = array(existing).find((entry) => entry.identity === record.identity);
    if (duplicate) return freeze({ status: "duplicate", record: duplicate, changed: false });
    const imported = options.referenceMap ? remapPatternExecutionRetrospective(record, options.referenceMap) : record;
    return freeze({ status: "imported", record: imported, changed: true });
  }

  async function loadSource(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const project = aggregate.project || aggregate;
    const calculationId = project.active_calculation_id;
    if (!calculationId) return { project, projectId, calculationId: null };
    const [resultRecord, runtimeRecord, monitoringRecord, interventionRecord, actionRecord, evidenceRecords, verificationRecords, decisionRecords, followUpRecords] = await Promise.all([
      repository.getPatternExecutionResult(projectId, calculationId), repository.getPatternExecutionRuntime(projectId, calculationId),
      repository.getPatternExecutionMonitoring(projectId, calculationId), repository.getPatternExecutionIntervention(projectId, calculationId),
      repository.getPatternExecutionAction(projectId, calculationId), repository.listPatternExecutionEvidence(projectId, calculationId),
      repository.listPatternExecutionVerification(projectId, calculationId), repository.listPatternExecutionDecisions(projectId, calculationId),
      repository.listPatternExecutionFollowUps(projectId, calculationId),
    ]);
    return {
      project, projectId, calculationId, result: resultRecord?.state || null, runtime: runtimeRecord?.state || null,
      monitoring: monitoringRecord?.state || null, interventions: interventionRecord?.state ? [interventionRecord.state] : [],
      actions: actionRecord?.state ? [actionRecord.state] : [], evidence: evidenceRecords.map((entry) => entry.state),
      verifications: verificationRecords.map((entry) => entry.state), decisions: decisionRecords.map((entry) => entry.state),
      followUps: followUpRecords.map((entry) => entry.state), followUp: latest(followUpRecords.map((entry) => entry.state)),
    };
  }

  async function readForProject(repository, projectId, retrospectiveId = null) {
    let source;
    try { source = await loadSource(repository, projectId); }
    catch (error) { return freeze({ projectId, effectiveStatus: "corrupted", reasonCode: normalizeText(error?.code) || "source_load_failed", corrupted: true, stale: false, rawRetrospective: null, availableCommands: [] }); }
    let record;
    try { record = await repository.getPatternExecutionRetrospective(projectId, retrospectiveId, source.calculationId); }
    catch (error) { return freeze({ ...source, effectiveStatus: "corrupted", reasonCode: normalizeText(error?.code) || "retrospective_load_failed", corrupted: true, stale: false, rawRetrospective: null, availableCommands: [] }); }
    if (!record) {
      const integrity = calculateIntegrity(source);
      return freeze({ ...source, rawRetrospective: null, retrospectiveRecord: null, integrity, effectiveStatus: integrity.valid ? "draft" : "blocked", stale: false, corrupted: false, reasonCode: integrity.valid ? null : "critical_integrity", availableCommands: integrity.valid ? ["create"] : [] });
    }
    const projected = projectPatternExecutionRetrospective(record.state, source);
    const availableCommands = projected.effectiveStatus === "draft" ? ["save", "review"] : projected.effectiveStatus === "reviewing" ? ["draft", "complete"] : [];
    return freeze({ ...source, rawRetrospective: record.state, retrospectiveRecord: record, ...projected, availableCommands });
  }

  async function createForProject(repository, projectId, input = {}) {
    const source = await loadSource(repository, projectId);
    const existing = await repository.listPatternExecutionRetrospectives(projectId, source.calculationId);
    const record = createPatternExecutionRetrospective(source, { ...clone(input), epoch: existing.reduce((maximum, entry) => Math.max(maximum, entry.state?.epoch || 0), 0) + 1 });
    await repository.savePatternExecutionRetrospective(projectId, record, { timestamp: record.updatedAt, operationKind: "PATTERN_EXECUTION_RETROSPECTIVE_CREATED" });
    return readForProject(repository, projectId, record.id);
  }

  async function saveForProject(repository, projectId, retrospectiveId, next, expectedRevision, expectedIdentity) {
    const inspected = await readForProject(repository, projectId, retrospectiveId);
    if (!inspected.rawRetrospective) throw retrospectiveError("missing_retrospective", "Retrospective was not found.");
    await repository.savePatternExecutionRetrospective(projectId, next, { recordId: inspected.retrospectiveRecord.progress_id, expectedRevision, expectedIdentity, timestamp: next.updatedAt });
    return readForProject(repository, projectId, next.id);
  }

  function requireRecord(record) {
    const report = validatePatternExecutionRetrospective(record);
    if (!report.valid) throw retrospectiveError("corrupted_input", "Retrospective snapshot is corrupted.", { errors: report.errors });
  }
  function checkConcurrency(record, command = {}) {
    if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw retrospectiveError("revision_conflict", "Retrospective revision changed.");
    if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw retrospectiveError("identity_conflict", "Retrospective identity changed.");
  }
  function finishValidation(errors) { const sorted = errors.sort((left, right) => compare(left.code, right.code) || compare(left.field, right.field)); return freeze({ valid: sorted.length === 0, errors: sorted }); }
  function deterministicTimestamp(...values) { return values.find(isTimestamp) || DEFAULT_TIMESTAMP; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function remapExact(value, map) { if (typeof value === "string") return map.get(value) || value; if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map)); if (value && typeof value === "object") for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); return value; }
  function normalize(value) { if (value === undefined) return null; if (Array.isArray(value)) return value.map(normalize); if (value && typeof value === "object") { const next = {}; for (const key of Object.keys(value).sort(compare)) next[key] = normalize(value[key]); return next; } return value; }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function retrospectiveError(code, message, details) { return new PatternExecutionRetrospectiveError(code, message, details); }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, STATUSES, EVIDENCE_LEVELS, CONCLUSION_STATUSES,
    CONSIDERATION_SCOPES, CRITICAL_SOURCES, OPTIONAL_SOURCES, DEFAULT_TIMESTAMP,
    PatternExecutionRetrospectiveError, canonicalize, fingerprint, normalizeText, stableReferences,
    normalizeSource, sourceSnapshot, calculateIntegrity, automaticFacts, machineSummary,
    createPatternExecutionRetrospective, addFact, addConclusion, addUnresolvedQuestion,
    addFutureConsideration, removeItem, startReview, returnToDraft, completeRetrospective,
    validatePatternExecutionRetrospective, safeNormalizePatternExecutionRetrospective,
    projectPatternExecutionRetrospective, isPatternExecutionRetrospectiveStale,
    serializePatternExecutionRetrospective, deserializePatternExecutionRetrospective,
    remapPatternExecutionRetrospective, makeImportedPatternExecutionRetrospectiveStale,
    importPatternExecutionRetrospective, loadSource, readForProject, createForProject, saveForProject,
  });
  globalObject.YarnAIPatternExecutionRetrospective = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
