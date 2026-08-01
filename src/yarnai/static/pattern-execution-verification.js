"use strict";

(function exposePatternExecutionVerification(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const PROGRESS_KIND = "PATTERN_EXECUTION_VERIFICATION";
  const STATUSES = Object.freeze([
    "waiting", "ready", "verifying", "needs_evidence", "contradicted",
    "verified", "rejected", "blocked", "stale",
  ]);
  const TERMINAL_STATUSES = Object.freeze(["verified", "rejected"]);
  const OUTCOMES = Object.freeze(["confirmed", "disproved", "insufficient", "conflicting"]);

  class PatternExecutionVerificationError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionVerificationError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function canonicalize(value, seen = new Set()) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw verificationError("invalid_number", "Verification содержит недопустимое число.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) {
      throw verificationError("unsupported_value", "Verification содержит неподдерживаемое значение.");
    }
    if (seen.has(value)) throw verificationError("cyclic_value", "Verification не поддерживает циклические данные.");
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = `[${value.map((entry) => canonicalize(entry, seen)).join(",")}]`;
    else if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      result = `{${Object.keys(value).sort(lexical).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    } else {
      seen.delete(value);
      throw verificationError("unstable_object", "Verification принимает только canonical JSON objects.");
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

  function deriveExpectedCriteria(action) {
    if (!action || typeof action !== "object") return [];
    return Object.freeze([
      criterion("ACTION_EXECUTED", "Действие фактически выполнено", true, ["ADAPTER_INVOCATION"], { path: "observedValue.runtimeActionExecuted", operator: "equals", expected: true }),
      criterion("EXPECTED_RESULT", "Ожидаемый результат достигнут", true, ["VERIFICATION_RESULT"], { path: "observedValue.status", operator: "equals", expected: "verified" }),
      criterion("TARGET_MATCHED", "Изменён ожидаемый объект", true, ["TARGET_IDENTITY"], { operator: "present" }),
      criterion("NO_UNEXPECTED_SIDE_EFFECTS", "Нет неожиданных побочных изменений", true, ["SIDE_EFFECT_BOUNDARY"], { path: "observedValue.unexpectedSideEffects", operator: "empty" }),
    ]);
  }

  function criterion(id, label, required, evidenceTypes, rule) {
    return Object.freeze({ id, criterionId: id, label, required, evidenceTypes: Object.freeze([...evidenceTypes]), rule: Object.freeze({ ...rule }) });
  }

  function evaluatePatternExecutionVerification(action, evidence, expectedCriteria, options = {}) {
    const diagnostics = [];
    const contradictions = [];
    let criteria;
    try {
      criteria = normalizeCriteria(expectedCriteria);
    } catch (error) {
      return evaluation("blocked", [], [contradiction("criteria_invalid", null, [], "critical")], diagnostics.concat(diagnostic(error.code || "criteria_invalid")));
    }
    if (!action || typeof action !== "object") {
      return evaluation("waiting", criteria.map(insufficientResult), contradictions, diagnostics.concat(diagnostic("action_missing")));
    }
    if (!text(action.id) || !text(action.projectId) || !positiveInteger(action.revision)) {
      return evaluation("blocked", criteria.map(insufficientResult), [contradiction("action_invalid", null, [], "critical")], diagnostics.concat(diagnostic("action_invalid")));
    }
    if (!criteria.length) {
      return evaluation("blocked", [], [contradiction("expected_criteria_missing", null, [], "critical")], diagnostics.concat(diagnostic("expected_criteria_missing")));
    }

    let flattened;
    try {
      flattened = flattenEvidence(evidence);
    } catch (error) {
      return evaluation("blocked", criteria.map(insufficientResult), [contradiction("evidence_invalid", null, [], "critical")], diagnostics.concat(diagnostic(error.code || "evidence_invalid")));
    }
    if (!flattened.length) {
      return evaluation("needs_evidence", criteria.map(insufficientResult), contradictions, diagnostics.concat(diagnostic("evidence_missing")));
    }

    const usable = [];
    for (const item of flattened) {
      const evidenceId = item.id;
      if (item.projectId && item.projectId !== action.projectId) {
        contradictions.push(contradiction("cross_project_evidence", null, [evidenceId], "critical"));
        diagnostics.push(diagnostic("cross_project_evidence", { evidenceId }));
        continue;
      }
      if (item.actionId && item.actionId !== action.id) {
        contradictions.push(contradiction("evidence_action_mismatch", null, [evidenceId], "critical"));
        diagnostics.push(diagnostic("evidence_action_mismatch", { evidenceId }));
        continue;
      }
      const expectedRevision = item.actionRevision ?? item.sourceIdentity?.actionRevision;
      const expectedFingerprint = item.actionFingerprint;
      if ((positiveInteger(expectedRevision) && expectedRevision !== action.revision) || (expectedFingerprint && action.fingerprint && expectedFingerprint !== action.fingerprint)) {
        contradictions.push(contradiction("evidence_action_revision_mismatch", null, [evidenceId], "critical"));
        diagnostics.push(diagnostic("evidence_action_revision_mismatch", { evidenceId }));
        continue;
      }
      const itemTime = item.observedAt || item.collectedAt || item.createdAt;
      const actionTime = action.executedAt || action.completedAt || action.currentAttempt?.executedAt || action.updatedAt;
      if (isTimestamp(itemTime) && isTimestamp(actionTime) && Date.parse(itemTime) < Date.parse(actionTime)) {
        contradictions.push(contradiction("evidence_before_action", null, [evidenceId], "critical"));
        diagnostics.push(diagnostic("evidence_before_action", { evidenceId }));
        continue;
      }
      if (["invalid", "stale", "superseded"].includes(item.validity) || ["stale", "superseded", "cancelled"].includes(item.lifecycle)) {
        contradictions.push(contradiction("evidence_not_current", null, [evidenceId], "critical"));
        diagnostics.push(diagnostic("evidence_not_current", { evidenceId }));
        continue;
      }
      usable.push(item);
    }

    const deduplicated = deduplicateEvidence(usable, diagnostics);
    const criterionResults = criteria.map((expected) => evaluateCriterion(expected, deduplicated, contradictions, diagnostics));
    const required = criterionResults.filter((result) => result.required);
    let status;
    if (required.some((result) => result.outcome === "conflicting")) status = "contradicted";
    else if (required.some((result) => result.outcome === "disproved")) status = "rejected";
    else if (required.some((result) => result.outcome === "insufficient")) status = "needs_evidence";
    else if (required.length && required.every((result) => result.outcome === "confirmed")) status = "verified";
    else status = "blocked";
    if (contradictions.some((entry) => entry.severity === "critical") && status !== "rejected") status = "contradicted";
    return evaluation(status, criterionResults, contradictions, diagnostics, options);
  }

  function evaluateCriterion(expected, evidence, contradictions, diagnostics) {
    const candidates = evidence.filter((item) => evidenceMatches(expected, item));
    const assessed = candidates.map((item) => ({ item, outcome: assessEvidence(expected, item, contradictions, diagnostics) }));
    const confirmed = assessed.filter((entry) => entry.outcome === "confirmed").map((entry) => entry.item.id).sort(lexical);
    const disproved = assessed.filter((entry) => entry.outcome === "disproved").map((entry) => entry.item.id).sort(lexical);
    const explicitlyConflicting = assessed.filter((entry) => entry.outcome === "conflicting").map((entry) => entry.item.id).sort(lexical);
    let outcome = "insufficient";
    if (explicitlyConflicting.length || confirmed.length && disproved.length) {
      outcome = "conflicting";
      contradictions.push(contradiction("opposite_evidence", expected.id, [...confirmed, ...disproved, ...explicitlyConflicting], "critical"));
    } else if (disproved.length) outcome = "disproved";
    else if (confirmed.length) outcome = "confirmed";
    const explanation = ({
      confirmed: "Критерий подтверждён структурированными evidence.",
      disproved: "Структурированные evidence доказывают невыполнение критерия.",
      insufficient: "Пригодных evidence для критерия недостаточно.",
      conflicting: "Для критерия найдены несовместимые evidence.",
    })[outcome];
    return Object.freeze({
      criterionId: expected.id, required: expected.required, outcome,
      supportingEvidenceIds: Object.freeze(confirmed),
      conflictingEvidenceIds: Object.freeze([...new Set([...disproved, ...explicitlyConflicting])].sort(lexical)),
      explanation,
    });
  }

  function assessEvidence(expected, item, contradictions, diagnostics) {
    if (OUTCOMES.includes(item.outcome)) return item.outcome;
    if (item.status === "contradictory") return "conflicting";
    if (item.status === "missing" || item.status === "unknown") return "insufficient";
    if (item.status === "invalid") return "insufficient";
    const rule = expected.rule || {};
    const actual = readPath(item, rule.path);
    let passed;
    if (!rule.operator || rule.operator === "present") passed = item.status === "present" || actual !== undefined;
    else if (rule.operator === "equals") passed = canonicalSafe(actual) === canonicalSafe(rule.expected);
    else if (rule.operator === "not_equals") passed = canonicalSafe(actual) !== canonicalSafe(rule.expected);
    else if (rule.operator === "range") passed = typeof actual === "number" && (!Number.isFinite(rule.min) || actual >= rule.min) && (!Number.isFinite(rule.max) || actual <= rule.max);
    else if (rule.operator === "empty") passed = Array.isArray(actual) ? actual.length === 0 : actual === null || actual === undefined || actual === "";
    else passed = false;
    if ((item.success === true || item.status === "present") && !passed && ["range", "equals", "empty"].includes(rule.operator)) {
      contradictions.push(contradiction("success_measurement_violation", expected.id, [item.id], "critical"));
      diagnostics.push(diagnostic("success_measurement_violation", { criterionId: expected.id, evidenceId: item.id }));
    }
    return passed ? "confirmed" : "disproved";
  }

  function buildPatternExecutionVerification(source = {}, options = {}) {
    const action = source.action || null;
    const evidence = array(source.evidence);
    const expectedCriteria = normalizeCriteria(source.expectedCriteria || deriveExpectedCriteria(action));
    const now = options.now || timestampNow();
    const epoch = positiveInteger(options.epoch) || 1;
    const id = text(options.id) || `execution-verification:${fingerprint({ projectId: source.projectId, actionId: action?.id, epoch }).slice(8)}`;
    const initialStatus = !action || !expectedCriteria.length ? "waiting" : evidence.length ? "ready" : "needs_evidence";
    const snapshot = {
      schemaVersion: SCHEMA_VERSION, version: VERSION, kind: PROGRESS_KIND, type: PROGRESS_KIND,
      id, projectId: source.projectId || action?.projectId || null, calculationId: source.calculationId || action?.calculationId || null,
      actionId: action?.id || null, actionRevision: action?.revision || null, actionFingerprint: action?.fingerprint || null,
      evidenceIds: stableEvidenceBundleIds(evidence), status: initialStatus,
      expectedCriteria, criterionResults: [], contradictions: [], diagnostics: [],
      summary: summaryFor(initialStatus, [], [], []), inputFingerprint: inputFingerprint(action, evidence, expectedCriteria),
      verifiedAt: null, epoch, revision: 1, createdAt: options.createdAt || now, updatedAt: now,
      previousVerification: clone(options.previousVerification || null), importedDiagnostic: null, fingerprint: null,
    };
    snapshot.fingerprint = fingerprintPatternExecutionVerification(snapshot);
    return freeze(snapshot);
  }

  function startPatternExecutionVerification(snapshot, options = {}) {
    requireSnapshot(snapshot); checkConcurrency(snapshot, options);
    if (TERMINAL_STATUSES.includes(snapshot.status)) return commandResult(false, snapshot);
    if (!["ready", "needs_evidence", "waiting", "blocked", "contradicted"].includes(snapshot.status)) return commandResult(false, snapshot);
    const next = clone(snapshot);
    next.status = "verifying"; next.revision += 1; next.updatedAt = options.now || timestampNow();
    next.fingerprint = fingerprintPatternExecutionVerification(next);
    return commandResult(true, freeze(next));
  }

  function completePatternExecutionVerification(snapshot, source = {}, options = {}) {
    requireSnapshot(snapshot); checkConcurrency(snapshot, options);
    const action = source.action || null;
    const evidence = array(source.evidence);
    const expectedCriteria = normalizeCriteria(source.expectedCriteria || snapshot.expectedCriteria || deriveExpectedCriteria(action));
    const currentInput = inputFingerprint(action, evidence, expectedCriteria);
    if (TERMINAL_STATUSES.includes(snapshot.status)) {
      return { ...commandResult(false, snapshot), stale: currentInput !== snapshot.inputFingerprint, effectiveStatus: currentInput === snapshot.inputFingerprint ? snapshot.status : "stale" };
    }
    if (snapshot.status !== "verifying") throw verificationError("verification_not_started", "Сначала начните deterministic verification.");
    const result = evaluatePatternExecutionVerification(action, evidence, expectedCriteria, options);
    const now = options.now || timestampNow();
    const next = clone(snapshot);
    next.actionId = action?.id || snapshot.actionId; next.actionRevision = action?.revision || snapshot.actionRevision;
    next.actionFingerprint = action?.fingerprint || null; next.evidenceIds = stableEvidenceBundleIds(evidence);
    next.expectedCriteria = expectedCriteria; next.status = result.status; next.criterionResults = clone(result.criterionResults);
    next.contradictions = clone(result.contradictions); next.diagnostics = clone(result.diagnostics); next.summary = clone(result.summary);
    next.inputFingerprint = currentInput; next.verifiedAt = TERMINAL_STATUSES.includes(result.status) ? now : null;
    next.revision += 1; next.updatedAt = now; next.fingerprint = fingerprintPatternExecutionVerification(next);
    return { ...commandResult(true, freeze(next)), evaluation: result, effectiveStatus: next.status, stale: false };
  }

  function rebuildPatternExecutionVerification(snapshot, source = {}, options = {}) {
    requireSnapshot(snapshot); checkConcurrency(snapshot, options);
    const now = options.now || timestampNow();
    const rebuilt = buildPatternExecutionVerification(source, {
      ...options, epoch: snapshot.epoch + 1, now, createdAt: now,
      previousVerification: { id: snapshot.id, revision: snapshot.revision, epoch: snapshot.epoch, fingerprint: snapshot.fingerprint, status: snapshot.status },
    });
    return { ...commandResult(true, rebuilt), previousVerification: snapshot };
  }

  function isPatternExecutionVerificationStale(snapshot, action, evidence, expectedCriteria) {
    try { requireSnapshot(snapshot); return snapshot.inputFingerprint !== inputFingerprint(action, evidence, expectedCriteria || snapshot.expectedCriteria); }
    catch { return true; }
  }

  function fingerprintPatternExecutionVerification(snapshot) {
    return fingerprint({
      schemaVersion: snapshot.schemaVersion, version: snapshot.version, kind: snapshot.kind, type: snapshot.type,
      id: snapshot.id, projectId: snapshot.projectId, calculationId: snapshot.calculationId,
      actionId: snapshot.actionId, actionRevision: snapshot.actionRevision, actionFingerprint: snapshot.actionFingerprint,
      evidenceIds: [...array(snapshot.evidenceIds)].sort(lexical), status: snapshot.status,
      expectedCriteria: stableCriteria(snapshot.expectedCriteria), criterionResults: stableResults(snapshot.criterionResults),
      contradictions: stableDiagnostics(snapshot.contradictions), diagnostics: stableDiagnostics(snapshot.diagnostics),
      summary: normalize(snapshot.summary), inputFingerprint: snapshot.inputFingerprint, verifiedAt: snapshot.verifiedAt,
      epoch: snapshot.epoch, revision: snapshot.revision, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt,
      previousVerification: normalize(snapshot.previousVerification), importedDiagnostic: normalize(snapshot.importedDiagnostic),
    });
  }

  function validatePatternExecutionVerification(snapshot) {
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, details));
    try { canonicalize(snapshot); } catch (error) { invalid(error.code || "json_invalid"); return finish(errors); }
    if (!snapshot || snapshot.kind !== PROGRESS_KIND || snapshot.type !== PROGRESS_KIND || snapshot.schemaVersion !== 1 || snapshot.version !== 1) invalid("verification_kind_invalid");
    for (const field of ["id", "projectId", "calculationId", "inputFingerprint", "fingerprint"]) if (!text(snapshot?.[field])) invalid("required_field_missing", { field });
    if (snapshot?.actionId !== null && !text(snapshot.actionId)) invalid("action_id_invalid");
    if (snapshot?.actionRevision !== null && !positiveInteger(snapshot.actionRevision)) invalid("action_revision_invalid");
    if (!STATUSES.includes(snapshot?.status) || !positiveInteger(snapshot?.epoch) || !positiveInteger(snapshot?.revision)) invalid("lifecycle_invalid");
    if (!Array.isArray(snapshot?.evidenceIds) || new Set(snapshot.evidenceIds).size !== snapshot.evidenceIds.length) invalid("evidence_ids_invalid");
    if (!Array.isArray(snapshot?.expectedCriteria) || !Array.isArray(snapshot?.criterionResults) || !Array.isArray(snapshot?.contradictions) || !Array.isArray(snapshot?.diagnostics)) invalid("collections_invalid");
    const criteria = new Map(array(snapshot?.expectedCriteria).map((entry) => [entry.id || entry.criterionId, entry]));
    if (criteria.size !== array(snapshot?.expectedCriteria).length) invalid("criterion_id_duplicate");
    for (const result of array(snapshot?.criterionResults)) {
      if (!criteria.has(result.criterionId) || !OUTCOMES.includes(result.outcome) || !Array.isArray(result.supportingEvidenceIds) || !Array.isArray(result.conflictingEvidenceIds) || typeof result.required !== "boolean" || !text(result.explanation)) invalid("criterion_result_invalid", { criterionId: result.criterionId });
    }
    if (TERMINAL_STATUSES.includes(snapshot?.status)) {
      const requiredResults = snapshot.criterionResults.filter((result) => result.required);
      const terminalInvalid = !isTimestamp(snapshot.verifiedAt) ||
        snapshot.status === "verified" && (!requiredResults.length || requiredResults.some((result) => result.outcome !== "confirmed")) ||
        snapshot.status === "rejected" && (!requiredResults.some((result) => result.outcome === "disproved") || requiredResults.some((result) => result.outcome === "conflicting"));
      if (terminalInvalid) invalid("terminal_verification_invalid");
    }
    if (!isTimestamp(snapshot?.createdAt) || !isTimestamp(snapshot?.updatedAt) || snapshot?.verifiedAt !== null && !isTimestamp(snapshot.verifiedAt)) invalid("timestamp_invalid");
    if (text(snapshot?.fingerprint) && snapshot.fingerprint !== fingerprintPatternExecutionVerification(snapshot)) invalid("verification_fingerprint_mismatch");
    return finish(errors);
  }

  function serializePatternExecutionVerification(snapshot) { requireSnapshot(snapshot); return canonicalize(snapshot); }
  function deserializePatternExecutionVerification(value) {
    let snapshot;
    try { snapshot = typeof value === "string" ? JSON.parse(value) : clone(value); } catch { throw verificationError("invalid_json", "Verification JSON повреждён."); }
    requireSnapshot(snapshot); return freeze(snapshot);
  }

  function remapPatternExecutionVerification(snapshot, referenceMap) {
    requireSnapshot(snapshot);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(clone(snapshot), map);
    next.expectedCriteria = stableCriteria(next.expectedCriteria); next.criterionResults = stableResults(next.criterionResults);
    next.contradictions = stableDiagnostics(next.contradictions); next.diagnostics = stableDiagnostics(next.diagnostics);
    next.inputFingerprint = fingerprint({ remapped: true, actionId: next.actionId, actionRevision: next.actionRevision, actionFingerprint: next.actionFingerprint, evidenceIds: next.evidenceIds, criteria: next.expectedCriteria });
    next.fingerprint = fingerprintPatternExecutionVerification(next);
    return freeze(next);
  }

  function makeImportedPatternExecutionVerificationStale(snapshot, options = {}) {
    requireSnapshot(snapshot);
    const next = clone(snapshot); const now = options.now || timestampNow();
    next.status = "stale"; next.revision += 1; next.updatedAt = now; next.verifiedAt = null;
    next.importedDiagnostic = { reason: options.reason || "import_identity_unproven", collision: Boolean(options.collision) };
    next.fingerprint = fingerprintPatternExecutionVerification(next);
    return freeze(next);
  }

  async function loadSource(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const project = aggregate.project || aggregate;
    const calculationId = project.active_calculation_id;
    const actionRecord = calculationId ? await repository.getPatternExecutionAction(projectId, calculationId) : null;
    const evidenceRecords = calculationId ? await repository.listPatternExecutionEvidence(projectId, calculationId) : [];
    const action = actionRecord?.state || null;
    const evidence = evidenceRecords.map((entry) => entry.state);
    return { project, projectId, calculationId, action, evidence, expectedCriteria: deriveExpectedCriteria(action) };
  }

  async function createForProject(repository, projectId, options = {}) {
    const source = await loadSource(repository, projectId);
    const previous = await repository.getPatternExecutionVerification(projectId, null, source.calculationId);
    const snapshot = buildPatternExecutionVerification(source, { ...options, epoch: (previous?.state?.epoch || 0) + 1 });
    await repository.savePatternExecutionVerification(projectId, source.calculationId, snapshot, { operationKind: "PATTERN_EXECUTION_VERIFICATION_CREATED" });
    return readForProject(repository, projectId);
  }

  async function readForProject(repository, projectId) {
    const source = await loadSource(repository, projectId);
    let record = null;
    try { record = await repository.getPatternExecutionVerification(projectId, null, source.calculationId); }
    catch (error) { return { ...source, rawVerification: null, verificationRecord: null, effectiveStatus: "blocked", stale: false, blockedReason: error.code || "verification_record_invalid", availableCommands: [] }; }
    const snapshot = record?.state || null;
    const brokenReferences = Boolean(snapshot && (snapshot.actionId !== source.action?.id || snapshot.evidenceIds.some((id) => !source.evidence.some((entry) => entry.id === id))));
    const stale = Boolean(snapshot && !brokenReferences && isPatternExecutionVerificationStale(snapshot, source.action, source.evidence, snapshot.expectedCriteria));
    const effectiveStatus = brokenReferences ? "blocked" : stale ? "stale" : snapshot?.status || (!source.action ? "waiting" : source.evidence.length ? "ready" : "needs_evidence");
    const availableCommands = brokenReferences ? [] : snapshot ? effectiveStatus === "stale" ? ["rebuild"] : TERMINAL_STATUSES.includes(snapshot.status) ? ["rebuild"] : ["verify", "rebuild"] : ["create"];
    return { ...source, rawVerification: snapshot, verificationRecord: record, effectiveStatus, stale, brokenReferences, availableCommands };
  }

  async function executeForProject(repository, projectId, command, options = {}) {
    let inspected = await readForProject(repository, projectId);
    if (command === "create" || !inspected.rawVerification) return createForProject(repository, projectId, options);
    const current = inspected.rawVerification;
    const source = inspected;
    if (command === "rebuild") {
      const rebuilt = rebuildPatternExecutionVerification(current, source, { ...options, id: options.id || globalObject.YarnAIProjectSystem?.uuidv7?.() });
      await repository.savePatternExecutionVerification(projectId, source.calculationId, rebuilt.verification, { operationKind: "PATTERN_EXECUTION_VERIFICATION_REBUILT" });
      return readForProject(repository, projectId);
    }
    if (command !== "verify") throw verificationError("command_invalid", "Неизвестная команда verification.");
    if (TERMINAL_STATUSES.includes(current.status)) return inspected;
    let working = current;
    if (working.status !== "verifying") {
      const started = startPatternExecutionVerification(working, options);
      await repository.savePatternExecutionVerification(projectId, source.calculationId, started.verification, { recordId: inspected.verificationRecord.progress_id, expectedRevision: working.revision, expectedFingerprint: working.fingerprint, operationKind: "PATTERN_EXECUTION_VERIFICATION_STARTED" });
      working = started.verification;
    }
    const completed = completePatternExecutionVerification(working, source, { ...options, expectedRevision: working.revision, expectedFingerprint: working.fingerprint });
    await repository.savePatternExecutionVerification(projectId, source.calculationId, completed.verification, { recordId: inspected.verificationRecord.progress_id, expectedRevision: working.revision, expectedFingerprint: working.fingerprint, operationKind: `PATTERN_EXECUTION_VERIFICATION_${completed.verification.status.toUpperCase()}` });
    return readForProject(repository, projectId);
  }

  function flattenEvidence(values) {
    const flattened = [];
    for (const bundle of array(values)) {
      if (!bundle || typeof bundle !== "object") throw verificationError("evidence_invalid", "Evidence должно быть объектом.");
      if (Array.isArray(bundle.evidenceItems)) {
        for (const item of bundle.evidenceItems) flattened.push(normalizeEvidenceItem(item, bundle));
      } else flattened.push(normalizeEvidenceItem(bundle, null));
    }
    return flattened.sort((left, right) => lexical(left.id, right.id));
  }

  function normalizeEvidenceItem(item, bundle) {
    if (!item || typeof item !== "object" || !text(item.id)) throw verificationError("evidence_identity_invalid", "Evidence identity повреждён.");
    canonicalize(item);
    return {
      ...clone(item), bundleId: bundle?.id || item.bundleId || item.id,
      projectId: item.projectId || bundle?.projectId || null,
      actionId: item.actionId || bundle?.actionId || null,
      actionRevision: item.actionRevision || bundle?.actionRevision || null,
      actionFingerprint: item.actionFingerprint || bundle?.actionFingerprint || null,
      lifecycle: item.lifecycle || bundle?.lifecycle || null,
      createdAt: item.createdAt || bundle?.createdAt || null,
      semanticIdentity: item.semanticIdentity || fingerprint({
        type: item.type || null, source: item.source || null, criterionId: item.criterionId || null,
        criterionIds: normalize(item.criterionIds || null), observedValue: normalize(item.observedValue ?? null),
        expectedValue: normalize(item.expectedValue ?? null), status: item.status || null, outcome: item.outcome || null,
        actionId: item.actionId || bundle?.actionId || null,
      }),
    };
  }

  function deduplicateEvidence(values, diagnostics) {
    const grouped = new Map();
    for (const item of values) {
      const key = item.semanticIdentity;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }
    const result = [];
    for (const [identity, group] of [...grouped.entries()].sort(([left], [right]) => lexical(left, right))) {
      const ordered = group.sort((left, right) => lexical(left.id, right.id));
      const byMeaning = new Map();
      for (const item of ordered) {
        const meaning = canonicalSafe({ outcome: item.outcome || null, status: item.status || null, success: item.success ?? null, observedValue: item.observedValue ?? null, expectedValue: item.expectedValue ?? null });
        if (!byMeaning.has(meaning)) byMeaning.set(meaning, item);
      }
      const representatives = [...byMeaning.values()].sort((left, right) => lexical(left.id, right.id));
      result.push(...representatives);
      if (ordered.length > representatives.length) diagnostics.push(diagnostic("duplicate_evidence_ignored", { semanticIdentity: identity, keptEvidenceIds: representatives.map((entry) => entry.id), ignoredEvidenceIds: ordered.filter((entry) => !representatives.includes(entry)).map((entry) => entry.id) }));
      if (representatives.length > 1) diagnostics.push(diagnostic("semantic_identity_conflict_retained", { semanticIdentity: identity, evidenceIds: representatives.map((entry) => entry.id) }));
    }
    return result;
  }

  function evidenceMatches(expected, item) {
    if (item.criterionId === expected.id || array(item.criterionIds).includes(expected.id)) return true;
    return array(expected.evidenceTypes).includes(item.type) || array(expected.evidenceTypes).includes(item.assertionType);
  }

  function normalizeCriteria(values) {
    const result = array(values).map((entry, index) => {
      if (!entry || typeof entry !== "object") throw verificationError("criterion_invalid", "Критерий должен быть объектом.");
      const id = text(entry.id) || text(entry.criterionId);
      if (!id) throw verificationError("criterion_identity_invalid", "У критерия отсутствует identity.");
      return { id, criterionId: id, label: text(entry.label) || id, required: entry.required !== false, evidenceTypes: [...new Set(array(entry.evidenceTypes).filter(text))].sort(lexical), rule: normalize(entry.rule || {}), order: Number.isInteger(entry.order) ? entry.order : index };
    });
    if (new Set(result.map((entry) => entry.id)).size !== result.length) throw verificationError("criterion_duplicate", "Criterion identity дублируется.");
    return stableCriteria(result);
  }

  function inputFingerprint(action, evidence, criteria) {
    return fingerprint({
      action: action ? { id: action.id, revision: action.revision, fingerprint: action.fingerprint || null, updatedAt: action.updatedAt || null } : null,
      evidence: array(evidence).map((entry) => ({ id: entry?.id || null, revision: entry?.revision || null, fingerprint: entry?.fingerprint || null, lifecycle: entry?.lifecycle || null, updatedAt: entry?.updatedAt || null })).sort((left, right) => lexical(left.id, right.id)),
      criteria: stableCriteria(criteria),
    });
  }

  function stableEvidenceBundleIds(evidence) { return [...new Set(array(evidence).map((entry) => entry?.id).filter(text))].sort(lexical); }
  function stableCriteria(values) { return array(values).map(normalize).sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || lexical(left.id || left.criterionId, right.id || right.criterionId)); }
  function stableResults(values) { return array(values).map((entry) => ({ ...normalize(entry), supportingEvidenceIds: [...new Set(array(entry.supportingEvidenceIds))].sort(lexical), conflictingEvidenceIds: [...new Set(array(entry.conflictingEvidenceIds))].sort(lexical) })).sort((left, right) => lexical(left.criterionId, right.criterionId)); }
  function stableDiagnostics(values) { return array(values).map(normalize).sort((left, right) => lexical(left.code, right.code) || lexical(canonicalSafe(left), canonicalSafe(right))); }
  function evaluation(status, criterionResults, contradictions, diagnostics) {
    const stableContradictions = stableDiagnostics(contradictions);
    const stableDiagnosticValues = stableDiagnostics(diagnostics);
    const results = stableResults(criterionResults);
    return freeze({ status, criterionResults: results, contradictions: stableContradictions, diagnostics: stableDiagnosticValues, summary: summaryFor(status, results, stableContradictions, stableDiagnosticValues) });
  }
  function summaryFor(status, results, contradictions, diagnostics) { return { status, requiredConfirmed: results.filter((entry) => entry.required && entry.outcome === "confirmed").length, requiredTotal: results.filter((entry) => entry.required).length, contradictionCount: contradictions.length, diagnosticCount: diagnostics.length }; }
  function insufficientResult(entry) { return Object.freeze({ criterionId: entry.id, required: entry.required, outcome: "insufficient", supportingEvidenceIds: Object.freeze([]), conflictingEvidenceIds: Object.freeze([]), explanation: "Пригодных evidence для критерия недостаточно." }); }
  function contradiction(code, criterionId, evidenceIds, severity) { return { code, criterionId, evidenceIds: [...new Set(evidenceIds.filter(text))].sort(lexical), severity }; }
  function diagnostic(code, details = {}) { return { code, details: normalize(details) }; }
  function finish(errors) { const stable = stableDiagnostics(errors); return freeze({ valid: stable.length === 0, errors: stable }); }
  function commandResult(changed, verification) { return { changed, verification }; }
  function requireSnapshot(snapshot) { const report = validatePatternExecutionVerification(snapshot); if (!report.valid) throw verificationError("corrupted_verification_snapshot", "Verification snapshot повреждён.", { errors: report.errors }); }
  function checkConcurrency(snapshot, options) { if (options.expectedRevision !== undefined && options.expectedRevision !== snapshot.revision) throw verificationError("verification_revision_conflict", "Verification изменён другой операцией."); if (options.expectedFingerprint !== undefined && options.expectedFingerprint !== snapshot.fingerprint) throw verificationError("verification_fingerprint_conflict", "Verification fingerprint изменился."); }
  function readPath(value, path) { if (!text(path)) return undefined; return path.split(".").reduce((current, key) => current === null || current === undefined ? undefined : current[key], value); }
  function canonicalSafe(value) { try { return canonicalize(value); } catch { return "<invalid>"; } }
  function normalize(value) { if (Array.isArray(value)) return value.map(normalize); if (value && typeof value === "object") { const next = {}; for (const key of Object.keys(value).sort(lexical)) next[key] = normalize(value[key]); return next; } return value; }
  function remapExact(value, map) { if (typeof value === "string") return map.get(value) || value; if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map)); if (value && typeof value === "object") for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); return value; }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return typeof value === "string" && value.trim() ? value.trim() : ""; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function isTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
  function timestampNow() { return DEFAULT_TIMESTAMP; }
  function lexical(left, right) { return String(left ?? "").localeCompare(String(right ?? "")); }
  function verificationError(code, message, details) { return new PatternExecutionVerificationError(code, message, details); }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, STATUSES, TERMINAL_STATUSES, OUTCOMES,
    PatternExecutionVerificationError, canonicalize, fingerprint, deriveExpectedCriteria,
    evaluatePatternExecutionVerification, buildPatternExecutionVerification,
    startPatternExecutionVerification, completePatternExecutionVerification,
    rebuildPatternExecutionVerification, isPatternExecutionVerificationStale,
    fingerprintPatternExecutionVerification, validatePatternExecutionVerification,
    serializePatternExecutionVerification, deserializePatternExecutionVerification,
    remapPatternExecutionVerification, makeImportedPatternExecutionVerificationStale,
    createForProject, readForProject, executeForProject, inputFingerprint,
  });
  globalObject.YarnAIPatternExecutionVerification = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
