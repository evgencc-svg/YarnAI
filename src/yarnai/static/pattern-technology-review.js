"use strict";

(function exposePatternTechnologyReview(globalObject) {
  const VERSION = 1;
  const REVIEW_ALGORITHM_VERSION = 1;
  const EXECUTABLE_INPUT_SCHEMA_ID = "EXECUTABLE_TECHNOLOGY_PLAN_INPUT_V1";
  const EXECUTABLE_INPUT_VERSION = 1;
  const EXECUTABLE_INPUT_ALGORITHM_ID = "stage20-v2-executable-input-projection:v1";
  const LEGACY_EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID = "stage20-v2-branch-resolved-adapted-execution:v5";
  const EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID = "stage20-v2-branch-resolved-adapted-execution:v6";
  const NUMBER_PROVENANCE = Object.freeze(["SOURCE_EXPLICIT", "SOURCE_SIZE_SELECTED", "USER_CONFIRMED", "ADAPTATION_CALCULATED", "DERIVED_BY_DECLARED_FORMULA", "UNRESOLVED"]);
  const ROUNDING_POLICIES = Object.freeze(["NONE", "NEAREST_INTEGER_HALF_UP", "FLOOR", "CEIL", "CONSTRAINT_SOLVER_SELECTION"]);
  const CAUSAL_DISPOSITIONS = Object.freeze(["USED", "UNCHANGED", "NOT_APPLICABLE", "UNSUPPORTED", "MISSING_EVIDENCE", "CONFLICT"]);
  const CAUSAL_TRACE_SCHEMA_ID = "AUTHORITATIVE_CAUSAL_TRACE_V1";
  const CAUSAL_TRACE_ALGORITHM_ID = "stage21-authoritative-causal-trace:v1";
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

  function stage20Binding(sourceDraft, progressId = null) {
    const result = sourceDraft?.draftResult || {};
    return {
      projectId: sourceDraft?.projectId ?? null,
      stage19AuthoritativeReviewId: sourceDraft?.sourceReviewId ?? null,
      stage19AuthoritativeReviewRevision: integer(sourceDraft?.sourceReviewRevision),
      stage20ProgressId: progressId ?? null,
      stage20DraftId: sourceDraft?.id ?? null,
      stage20Revision: integer(sourceDraft?.revision),
      stage20ResultIdentity: result.resultIdentity ?? null,
      stage20SourceProjectionFingerprint: sourceDraft?.sourceProjectionFingerprint ?? null,
      stage20InputContractVersion: integer(sourceDraft?.inputContractVersion),
      stage20ResultSchemaVersion: integer(result.schemaVersion),
      stage20AlgorithmVersion: integer(result.algorithmVersion ?? sourceDraft?.algorithmVersion),
      stage20DraftFingerprint: sourceDraft?.draftFingerprint ?? null,
      sourcePatternEvidenceFingerprint: result.sourcePatternEvidence?.fingerprint ?? null,
      userAdaptationProfileFingerprint: result.userAdaptationProfile?.fingerprint ?? null,
    };
  }

  function buildExecutableTechnologyPlanInput(sourceDraft, progressId = null, sourceInstructionEvidence = null) {
    const sourceValidation = validateSourceDraft(sourceDraft, sourceDraft?.projectId);
    if (!sourceValidation.isValid) throw reviewError(sourceValidation.critical[0].code, "Executable input требует валидный Stage 20.");
    const draft = sourceDraft.draftResult;
    const binding = { ...stage20Binding(sourceDraft, progressId), ...instructionEvidenceBinding(sourceInstructionEvidence) };
    if (binding.stage20InputContractVersion !== 2 || binding.stage20ResultSchemaVersion !== 2 || binding.stage20AlgorithmVersion !== 2 || !text(binding.stage20ResultIdentity) || !validFingerprint(binding.stage20SourceProjectionFingerprint)) {
      throw reviewError("EXECUTABLE_INPUT_SOURCE_INCOMPATIBLE", "Executable input v1 требует Stage 20 v2 с проверяемой identity.");
    }
    let components = array(draft.components).map((entry, index) => ({
      identity: entry.id, type: text(entry.type ?? entry.name ?? entry.value?.type ?? entry.value?.name) || "source_component",
      order: integer(entry.order) ?? index + 1, dependencies: stableStrings(entry.dependencies),
      sourceProvenanceRefs: stableStrings(entry.provenanceRefs), appliedUserAdaptationFingerprint: binding.userAdaptationProfileFingerprint,
      completeness: componentCompleteness(entry, draft), source: copy(entry),
    }));
    let operations = array(draft.operations).map((entry, index) => ({
      identity: entry.id, type: entry.type, order: integer(entry.order) ?? index + 1, componentIdentity: entry.componentId ?? null,
      prerequisiteOperationIdentities: stableStrings(entry.prerequisiteOperationIds), sourceProvenanceRefs: stableStrings(entry.provenanceRefs),
      numericProvenance: numericProvenanceForEntity(entry, `operations.${index}`, "SOURCE_EXPLICIT", binding), source: copy(entry),
    }));
    let rowInstructions = array(draft.rowInstructions).map((entry, index) => ({
      identity: entry.id, componentIdentity: entry.componentId ?? null, prerequisiteOperationIdentity: entry.operationId ?? null,
      rowOrRound: rowIdentity(entry), direction: entry.direction ?? null, face: entry.face ?? entry.side ?? null,
      inputStitchCount: integer(entry.stitchCountBefore), actions: copy(array(entry.actions).length ? entry.actions : [entry.instructionText ?? entry.value].filter(Boolean)),
      repeats: copy(entry.repeat ?? null), outputStitchCount: integer(entry.stitchCountAfter), expectedState: copy(entry.expectedState ?? null),
      sourceProvenanceRefs: stableStrings(entry.provenanceRefs), numericProvenance: numericProvenanceForEntity(entry, `rowInstructions.${index}`, "SOURCE_EXPLICIT", binding), source: copy(entry),
    }));
    let finishing = array(draft.finishing).map((entry, index) => ({
      identity: entry.id, type: entry.type ?? "finishing", order: integer(entry.order) ?? index + 1,
      prerequisiteOperationIdentities: stableStrings(entry.prerequisiteOperationIds ?? [entry.operationId].filter(Boolean)),
      sourceProvenanceRefs: stableStrings(entry.provenanceRefs), numericProvenance: numericProvenanceForEntity(entry, `finishing.${index}`, "SOURCE_EXPLICIT", binding), source: copy(entry),
    }));
    let numericProvenance = [
      ...sourceEvidenceNumbers(draft.sourcePatternEvidence, binding),
      ...adaptationNumbers(draft.userAdaptationProfile, binding),
      ...operations.flatMap((entry) => entry.numericProvenance),
      ...rowInstructions.flatMap((entry) => entry.numericProvenance),
      ...finishing.flatMap((entry) => entry.numericProvenance),
      ...derivedStitchNumbers(draft, binding),
    ];
    const instructionValidation = validateInstructionEvidence(sourceInstructionEvidence, binding);
    let coverage = coverageAccounting(draft, components, operations, rowInstructions, finishing);
    let unresolvedBlockers = executableBlockers(draft, components, operations, rowInstructions, finishing, coverage, binding);
    let sourceInstructionSnapshot = null;
    let branchResolution = null;
    let adaptedExecution = null;
    if (instructionValidation.isValid) {
      sourceInstructionSnapshot = sourceInstructionEvidence.confirmedSnapshot;
      const sourceProjection = executableProjectionFromInstructions(sourceInstructionSnapshot, binding);
      try { branchResolution = resolveSelectedInstructionBranches(sourceInstructionSnapshot); }
      catch (error) {
        unresolvedBlockers.push({ code: error?.code || "BRANCH_SELECTION_CONTRACT_INVALID", message: error?.userMessage || "Typed branch resolution failed.", missingAuthoritativeFields: [], numericProvenance: [] });
      }
      const merged = branchResolution ? filterProjectionByBranches(sourceProjection, branchResolution) : sourceProjection;
      components = merged.components; operations = merged.operations; rowInstructions = merged.rowInstructions; finishing = merged.finishing;
      numericProvenance = [...numericProvenance, ...merged.numericProvenance];
      coverage = copy(sourceInstructionSnapshot.coverage);
      const resolved = new Set(array(sourceInstructionSnapshot.blockerResolutionMap).filter((entry) => entry.resolutionStatus === "resolved" && array(entry.supportingEvidenceIdentities).length).map((entry) => entry.blocker));
      unresolvedBlockers = executableBlockers(draft, components, operations, rowInstructions, finishing, coverage, binding).filter((entry) => !resolved.has(entry.code));
      if (!branchResolution) unresolvedBlockers.push({ code: "BRANCH_SELECTION_CONTRACT_INVALID", message: "Confirmed evidence lacks a typed branch-selection contract.", missingAuthoritativeFields: ["selectedOptions.question.options[].evidenceUnitIdentities"], numericProvenance: [] });
      if (branchResolution) {
        try {
          adaptedExecution = materializeAdaptedExecution(merged, draft, binding, branchResolution);
          numericProvenance.push(...array(adaptedExecution.solver?.numericProvenance));
          unresolvedBlockers.push(...array(adaptedExecution.blockers).map((entry) => ({ ...copy(entry), numericProvenance: [] })));
        } catch (error) {
          unresolvedBlockers.push({ code: error?.code || "ADAPTED_EXECUTION_BUILD_FAILED", message: error?.userMessage || "Adapted execution build failed.", missingAuthoritativeFields: [], numericProvenance: [] });
        }
      }
    }
    numericProvenance.push(...unresolvedBlockers.flatMap((entry) => array(entry.numericProvenance)));
    const counts = { components: components.length, operations: operations.length, rowInstructions: rowInstructions.length, finishing: finishing.length };
    const readiness = {
      sourceCoverageComplete: Boolean(coverage.complete),
      branchSelectionResolved: Boolean(branchResolution),
      adaptationCalculated: adaptedExecution?.solver?.status === "calculated",
      sequentialValidationComplete: adaptedExecution?.validation?.isValid === true,
      executableReady: counts.components > 0 && counts.operations > 0 && counts.rowInstructions > 0 && counts.finishing > 0 && coverage.complete && unresolvedBlockers.length === 0 && adaptedExecution?.status === "ready",
      requiredSectionsCovered: coverage.coveredCount, requiredSectionsTotal: coverage.requiredCount,
      unresolvedBlockerCount: unresolvedBlockers.length,
    };
    readiness.causalTraceComplete = adaptedExecution?.causalTrace?.coverage?.complete === true;
    readiness.adaptationFullySupported = readiness.causalTraceComplete && array(adaptedExecution?.causalTrace?.productBlockers).length === 0;
    readiness.ready = readiness.executableReady;
    const base = {
      schemaId: EXECUTABLE_INPUT_SCHEMA_ID, contractVersion: EXECUTABLE_INPUT_VERSION, algorithmId: sourceInstructionSnapshot ? EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID : EXECUTABLE_INPUT_ALGORITHM_ID,
      identity: "", fingerprint: "", binding, evidence: {
        sourcePatternEvidence: copy(draft.sourcePatternEvidence), userAdaptationProfile: copy(draft.userAdaptationProfile),
        sourceInstructionEvidence: sourceInstructionSnapshot ? copy(sourceInstructionSnapshot) : null,
      }, branchSelection: branchResolution ? { selectedOptions: copy(branchResolution.selectedOptions), fingerprint: branchResolution.fingerprint, rejectedAlternatives: copy(branchResolution.rejectedAlternatives) } : null,
      adaptedExecution: adaptedExecution ? copy(adaptedExecution) : null,
      components, operations, rowInstructions, finishing, numericProvenance: stableNumericProvenance(numericProvenance),
      coverage, unresolvedBlockers, firstUnresolvedBlocker: unresolvedBlockers[0]?.code ?? null, counts, readiness,
    };
    base.identity = stableId("executable-technology-plan-input", { schemaId: base.schemaId, contractVersion: base.contractVersion, algorithmId: base.algorithmId, binding, evidence: base.evidence, selectedOptions: branchResolution?.selectedOptions ?? null, branchFingerprint: branchResolution?.fingerprint ?? null, solverResultFingerprint: adaptedExecution?.solverFingerprint ?? null });
    base.fingerprint = executableInputFingerprint(base);
    return deepFreeze(base);
  }

  function executableInputFingerprint(input) { const payload = copy(input); delete payload.fingerprint; return fingerprint(payload); }

  function validateExecutableTechnologyPlanInput(input, sourceDraft = null, progressId = null, sourceInstructionEvidence = null) {
    const errors = [];
    const add = (code, path = null) => errors.push({ code, path, level: "critical" });
    const embeddedInstruction = input?.evidence?.sourceInstructionEvidence;
    const effectiveInstructionEvidence = sourceInstructionEvidence || (embeddedInstruction ? {
      id: embeddedInstruction.evidenceIdentity,
      revision: embeddedInstruction.evidenceRevision,
      status: "confirmed",
      confirmedSnapshot: embeddedInstruction,
      confirmedSnapshotFingerprint: embeddedInstruction.fingerprint,
    } : null);
    if (!input || input.schemaId !== EXECUTABLE_INPUT_SCHEMA_ID || input.contractVersion !== EXECUTABLE_INPUT_VERSION || ![EXECUTABLE_INPUT_ALGORITHM_ID, LEGACY_EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID, EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID].includes(input.algorithmId)) add("EXECUTABLE_INPUT_SCHEMA_INVALID");
    if (input && executableInputFingerprint(input) !== input.fingerprint) add("EXECUTABLE_INPUT_FINGERPRINT_INVALID");
    if (input && !text(input.identity)) add("EXECUTABLE_INPUT_IDENTITY_INVALID");
    for (const key of ["components", "operations", "rowInstructions", "finishing", "numericProvenance", "unresolvedBlockers"]) if (!Array.isArray(input?.[key])) add("EXECUTABLE_INPUT_SCHEMA_INVALID", key);
    for (const entry of array(input?.numericProvenance)) {
      if (!NUMBER_PROVENANCE.includes(entry.provenance) || !text(entry.path)) add("NUMBER_PROVENANCE_INVALID", entry?.path ?? null);
      if (["ADAPTATION_CALCULATED", "DERIVED_BY_DECLARED_FORMULA"].includes(entry.provenance) && (!Array.isArray(entry.inputs) || !entry.inputs.length || !text(entry.algorithmId) || !ROUNDING_POLICIES.includes(entry.roundingPolicy) || entry.result === null || entry.result === undefined || !entry.evidenceBinding)) add("NUMBER_FORMULA_PROVENANCE_INVALID", entry.path);
    }
    if ([LEGACY_EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID, EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID].includes(input?.algorithmId)) {
      if (!input.branchSelection?.fingerprint || !Array.isArray(input.branchSelection?.selectedOptions)) add("BRANCH_SELECTION_CONTRACT_INVALID");
      if (!input.adaptedExecution || !Array.isArray(input.adaptedExecution.operations)) add("ADAPTED_EXECUTION_MISSING");
      if (input.adaptedExecution?.operations?.length && !validateSequentialExecution(input.adaptedExecution, { binding: input.binding, branchResolution: { fingerprint: input.branchSelection?.fingerprint }, solverIdentity: input.adaptedExecution.solverIdentity, solverFingerprint: input.adaptedExecution.solverFingerprint }).isValid) add("SEQUENTIAL_VALIDATION_FAILED");
      if (input.algorithmId === EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID && !input.adaptedExecution?.causalTrace) add("CAUSAL_TRACE_MISSING");
      if (input.algorithmId === EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID) {
        const authority = input.adaptedExecution?.causalAuthority;
        if (!authority || canonicalizeSafe(authority.sourcePatternFacts) !== canonicalizeSafe(input.evidence?.sourcePatternEvidence?.facts) || canonicalizeSafe(authority.userAdaptationProfile) !== canonicalizeSafe(input.evidence?.userAdaptationProfile) || canonicalizeSafe(authority.binding) !== canonicalizeSafe(input.binding) || canonicalizeSafe(authority.branchResolution?.selectedOptions) !== canonicalizeSafe(input.branchSelection?.selectedOptions) || authority.branchResolution?.fingerprint !== input.branchSelection?.fingerprint) add("CAUSAL_AUTHORITY_BINDING_INVALID");
      }
      if (input.adaptedExecution?.causalTrace && !validateAuthoritativeCausalTrace(input.adaptedExecution.causalTrace, input.adaptedExecution.operations, input.adaptedExecution).isValid) add("CAUSAL_TRACE_INVALID");
    }
    if (input?.readiness?.ready && (input.unresolvedBlockers.length || !input.coverage?.complete || Object.values(input.counts || {}).some((value) => !positiveInteger(value)) || !input.readiness.branchSelectionResolved || !input.readiness.adaptationCalculated || !input.readiness.sequentialValidationComplete)) add("EXECUTABLE_INPUT_READY_INVALID");
    if (sourceDraft) {
      const expectedBinding = { ...stage20Binding(sourceDraft, progressId ?? input?.binding?.stage20ProgressId ?? null), ...([LEGACY_EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID, EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID].includes(input?.algorithmId) ? instructionEvidenceBinding(effectiveInstructionEvidence) : {}) };
      if (canonicalizeSafe(input?.binding) !== canonicalizeSafe(expectedBinding)) add("EXECUTABLE_INPUT_SOURCE_STALE");
      else {
        try { if (input?.algorithmId === EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID) { const expected = buildExecutableTechnologyPlanInput(sourceDraft, expectedBinding.stage20ProgressId, effectiveInstructionEvidence); if (canonicalizeSafe(expected) !== canonicalizeSafe(input)) add("EXECUTABLE_INPUT_NOT_CANONICAL"); } }
        catch (error) { add(error?.code || "EXECUTABLE_INPUT_SOURCE_INCOMPATIBLE"); }
      }
    }
    return { isValid: errors.length === 0, errors: stableIssues(errors.map((entry) => ({ code: entry.code, entityId: entry.path, level: entry.level }))) };
  }

  function instructionEvidenceBinding(state) {
    const snapshot = state?.confirmedSnapshot;
    if (!snapshot) return {};
    return {
      sourceInstructionEvidenceIdentity: state.id ?? snapshot.evidenceIdentity ?? null,
      sourceInstructionEvidenceRevision: integer(state.revision ?? snapshot.evidenceRevision),
      sourceInstructionEvidenceFingerprint: state.confirmedSnapshotFingerprint ?? snapshot.fingerprint ?? null,
      sourceInstructionResultIdentity: snapshot.resultIdentity ?? null,
      sourceDocumentIdentity: snapshot.binding?.sourceDocumentIdentity ?? null,
      sourceDocumentFingerprint: snapshot.binding?.sourceDocumentFingerprint ?? null,
    };
  }

  function validateInstructionEvidence(state, expectedBinding = null) {
    const errors = [];
    const snapshot = state?.confirmedSnapshot;
    if (!state || state.status !== "confirmed" || !snapshot) errors.push("SOURCE_INSTRUCTION_EVIDENCE_NOT_CONFIRMED");
    if (snapshot) {
      const payload = copy(snapshot); delete payload.fingerprint;
      if (fingerprint(payload) !== snapshot.fingerprint || snapshot.fingerprint !== state.confirmedSnapshotFingerprint) errors.push("SOURCE_INSTRUCTION_EVIDENCE_FINGERPRINT_INVALID");
      if (!snapshot.coverage?.complete || array(snapshot.blockerResolutionMap).some((entry) => entry.resolutionStatus !== "resolved")) errors.push("SOURCE_INSTRUCTION_EVIDENCE_INCOMPLETE");
      if (expectedBinding && (snapshot.binding?.projectId !== expectedBinding.projectId || snapshot.binding?.stage19ReviewIdentity !== expectedBinding.stage19AuthoritativeReviewId || snapshot.binding?.stage19AuthoritativeReviewRevision !== expectedBinding.stage19AuthoritativeReviewRevision)) errors.push("SOURCE_INSTRUCTION_EVIDENCE_STALE");
    }
    return { isValid: errors.length === 0, errors: [...new Set(errors)] };
  }

  function executableProjectionFromInstructions(snapshot, binding) {
    const components = array(snapshot?.projection?.components).map((entry) => ({
      identity: entry.identity, type: entry.type, order: entry.order, dependencies: [], sourceProvenanceRefs: stableStrings(entry.sourceEvidenceIdentities), appliedUserAdaptationFingerprint: binding.userAdaptationProfileFingerprint, completeness: { complete: true, missing: [] }, source: copy(entry),
    }));
    const operations = array(snapshot?.projection?.operations).map((entry) => ({
      identity: entry.identity, type: entry.type, order: entry.order, componentIdentity: entry.componentIdentity, prerequisiteOperationIdentities: [], sourceProvenanceRefs: stableStrings(entry.sourceEvidenceIdentities), numericProvenance: instructionNumericProvenance(entry, `operations.${entry.order - 1}`, binding), source: copy(entry),
    }));
    const projectRow = (entry, index) => ({
      identity: `row:${entry.identity}`, componentIdentity: entry.componentIdentity, prerequisiteOperationIdentity: entry.identity,
      rowOrRound: { mode: entry.instructionKind === "single_row" ? "row" : "round", start: null, end: null }, direction: null, face: null,
      inputStitchCount: integer(entry.inputStitchCount), actions: copy(entry.actions), repeats: copy(entry.repeat), outputStitchCount: integer(entry.outputStitchCount), expectedState: copy(entry.measurementCondition),
      sourceProvenanceRefs: stableStrings(entry.sourceEvidenceIdentities), numericProvenance: instructionNumericProvenance(entry, `rowInstructions.${index}`, binding), source: copy(entry),
    });
    const rowInstructions = array(snapshot?.projection?.rowInstructions).map(projectRow);
    const finishing = array(snapshot?.projection?.finishing).map((entry, index) => ({
      identity: `finishing:${entry.identity}`, type: entry.type, order: index + 1, prerequisiteOperationIdentities: [], sourceProvenanceRefs: stableStrings(entry.sourceEvidenceIdentities), numericProvenance: instructionNumericProvenance(entry, `finishing.${index}`, binding), source: copy(entry),
    }));
    return { components, operations, rowInstructions, finishing, numericProvenance: [...operations, ...rowInstructions, ...finishing].flatMap((entry) => array(entry.numericProvenance)) };
  }

  function resolveSelectedInstructionBranches(snapshot) {
    const units = array(snapshot?.evidenceUnits);
    const unitById = new Map(units.map((unit) => [unit.identity, unit]));
    const groups = array(snapshot?.selectedOptions).map((selected) => {
      const question = object(selected.question);
      const groupId = text(question?.kind);
      const options = array(question?.options);
      const optionIds = options.map((option) => text(option.id)).filter(Boolean);
      const selectedOptionId = text(selected.selectedOptionId);
      if (!groupId || question?.exclusive !== true || optionIds.length < 2) throw reviewError("BRANCH_SELECTION_CONTRACT_INVALID", "Choice group не имеет typed exclusive contract.", { groupId });
      if (!selectedOptionId || !optionIds.includes(selectedOptionId)) throw reviewError("BRANCH_SELECTION_UNKNOWN", "Выбран неизвестный typed option.", { groupId, selectedOptionId });
      const membership = options.flatMap((option) => array(option.evidenceUnitIdentities).map((identity) => ({ optionId: option.id, identity })));
      for (const entry of membership) if (!unitById.has(entry.identity)) throw reviewError("BRANCH_SELECTION_CONTRACT_INVALID", "Choice group ссылается на неизвестный evidence unit.", { groupId, identity: entry.identity });
      return { groupId, selectedOptionId, optionIds: [...optionIds].sort(lexical), membership: membership.sort((a, b) => lexical(a.identity, b.identity) || lexical(a.optionId, b.optionId)) };
    });
    const byGroup = new Map();
    for (const group of groups) {
      if (byGroup.has(group.groupId)) throw reviewError("BRANCH_SELECTION_MULTIPLE", "Exclusive choice group указан несколько раз.", { groupId: group.groupId });
      byGroup.set(group.groupId, group);
    }
    for (const requiredGroupId of ["neckline_method", "short_rows", "body_length", "sleeve_length"]) if (!byGroup.has(requiredGroupId)) throw reviewError("BRANCH_SELECTION_MISSING", "Mandatory choice group отсутствует.", { groupId: requiredGroupId });
    for (const unit of units) for (const membership of array(unit.choiceMembership)) {
      const group = byGroup.get(membership.groupId);
      if (!group || !group.optionIds.includes(membership.optionId)) throw reviewError("BRANCH_SELECTION_CONTRACT_INVALID", "Evidence unit имеет неизвестную typed branch membership.", { identity: unit.identity, membership });
    }
    const selectedOptions = [...byGroup.values()].map(({ groupId, selectedOptionId }) => ({ groupId, selectedOptionId })).sort((a, b) => lexical(a.groupId, b.groupId));
    const executableUnitIds = new Set(units.filter((unit) => array(unit.choiceMembership).every((membership) => byGroup.get(membership.groupId)?.selectedOptionId === membership.optionId)).map((unit) => unit.identity));
    const rejectedAlternatives = units.filter((unit) => !executableUnitIds.has(unit.identity)).map((unit) => ({ identity: unit.identity, executionRole: unit.executionRole, choiceMembership: copy(unit.choiceMembership), sourceLocator: copy(unit.sourceLocator), executable: false })).sort((a, b) => lexical(a.identity, b.identity));
    return { selectedOptions, executableUnitIds, rejectedAlternatives, fingerprint: fingerprint({ selectedOptions, executableUnitIds: [...executableUnitIds].sort(lexical) }) };
  }

  function filterProjectionByBranches(projection, resolution) {
    const keep = (entry) => array(entry.sourceProvenanceRefs).every((identity) => resolution.executableUnitIds.has(identity));
    const operations = array(projection.operations).filter(keep).sort((a, b) => a.order - b.order || lexical(a.identity, b.identity));
    const keptOperations = new Set(operations.map((entry) => entry.identity));
    return {
      components: array(projection.components).sort((a, b) => a.order - b.order || lexical(a.identity, b.identity)),
      operations,
      rowInstructions: array(projection.rowInstructions).filter((entry) => resolution.executableUnitIds.has(entry.sourceProvenanceRefs?.[0])).sort((a, b) => lexical(a.identity, b.identity)),
      finishing: array(projection.finishing).filter(keep).sort((a, b) => a.order - b.order || lexical(a.identity, b.identity)),
      numericProvenance: [...operations, ...array(projection.rowInstructions).filter((entry) => resolution.executableUnitIds.has(entry.sourceProvenanceRefs?.[0])), ...array(projection.finishing).filter(keep)].flatMap((entry) => array(entry.numericProvenance)),
      keptOperations,
    };
  }

  function expandPhysicalShortRows(input) {
    const pair = array(input?.repeatedPair);
    const pairExecutionsTotal = positiveInteger(input?.pairExecutionsTotal);
    const stitchCount = positiveInteger(input?.stitchCount);
    if (!text(input?.firstInstructionIdentity) || !text(input?.secondInstructionIdentity) || pair.length !== 2 || pair.some((identity) => !text(identity)) || !pairExecutionsTotal || !stitchCount) throw reviewError("SHORT_ROW_EXPANSION_INVALID", "Physical short-row expansion неполна.");
    const identities = [input.firstInstructionIdentity, input.secondInstructionIdentity];
    for (let repeat = 1; repeat <= pairExecutionsTotal; repeat += 1) identities.push(...pair);
    return identities.map((sourceInstructionIdentity, index) => ({
      physicalRowOrdinal: index + 1, sourceInstructionIdentity,
      repeatOrdinal: index < 2 ? 1 : Math.floor((index - 2) / 2) + 1,
      direction: index % 2 === 0 ? "RS" : "WS", turn: true,
      inputStitchCount: stitchCount, outputStitchCount: stitchCount,
    }));
  }

  function selectedNumeric(unit, role) {
    const values = array(unit?.source?.numericValues ?? unit?.numericValues).filter((entry) => entry.selectionStatus === "selected" && Number.isFinite(Number(entry.normalizedValue)));
    const match = values.find((entry) => entry.role === role);
    return match ? Number(match.normalizedValue) : null;
  }

  function selectedMeasurements(unit) {
    return array(unit?.source?.numericValues ?? unit?.numericValues)
      .filter((entry) => entry.selectionStatus === "selected" && Number.isFinite(Number(entry.normalizedValue)) && (entry.role === "measurement" || ["in", "inch", "inches"].includes(text(entry.unit).toLowerCase())))
      .map((entry) => Number(entry.normalizedValue));
  }

  function executionUnitByRole(operations, role) { return array(operations).find((entry) => entry.source?.executionRole === role) || null; }

  function firstGauge(source, rowField) { return array(source?.facts?.gauge).find((entry) => positiveNumber(entry?.stitches) && positiveNumber(entry?.[rowField]) && positiveNumber(entry?.per) && text(entry?.unit)) || null; }
  function adaptationGauge(profile) { return array(profile?.gauge).find((entry) => positiveNumber(entry?.stitches) && positiveNumber(entry?.rows ?? entry?.rounds) && positiveNumber(entry?.per) && text(entry?.unit)) || null; }

  function materializeAdaptedExecution(projection, draft, binding, branchResolution) {
    const role = (name) => executionUnitByRole(projection.operations, name);
    const sourceGauge = firstGauge(draft.sourcePatternEvidence, "rounds") || firstGauge(draft.sourcePatternEvidence, "rows");
    const targetGauge = adaptationGauge(draft.userAdaptationProfile);
    const raglan = role("raglan_repeat_block"); const separation = role("separation"); const sleeveSetup = role("sleeve_setup"); const sleeveDecrease = role("sleeve_long_decrease");
    const castOnSource = selectedNumeric(role("cast_on"), "cast_on");
    const necklineIncreaseSource = selectedNumeric(role("neckline_increase"), "increase_delta");
    const frontSource = selectedNumeric(raglan, "front_back_stitches") ?? selectedNumeric(separation, "front_stitches");
    const sleeveHeldSource = selectedNumeric(raglan, "sleeve_stitches") ?? selectedNumeric(separation, "held_stitches");
    const bodySource = selectedNumeric(separation, "body_stitches") ?? selectedNumeric(separation, "output_stitches");
    const sleeveStartSource = selectedNumeric(sleeveSetup, "output_stitches");
    const underarmSource = selectedNumeric(separation, "underarm_cast_on") ?? (bodySource && frontSource ? (bodySource - 2 * frontSource) / 2 : null) ?? (sleeveStartSource && sleeveHeldSource ? sleeveStartSource - sleeveHeldSource : null);
    const sourceDecreaseRepeats = selectedNumeric(sleeveDecrease, "repeat_count");
    const sourceCounts = {
      castOn: castOnSource,
      yokeStart: selectedNumeric(role("neckline_increase"), "output_stitches") ?? (castOnSource && necklineIncreaseSource ? castOnSource + necklineIncreaseSource : null),
      yokeFinal: selectedNumeric(raglan, "output_stitches") ?? (frontSource && sleeveHeldSource ? 2 * frontSource + 2 * sleeveHeldSource : null),
      front: frontSource,
      sleeveHeld: sleeveHeldSource,
      underarm: underarmSource,
      body: bodySource ?? (frontSource && underarmSource ? 2 * frontSource + 2 * underarmSource : null),
      sleeveStart: sleeveStartSource ?? (sleeveHeldSource && underarmSource ? sleeveHeldSource + underarmSource : null),
      cuff: selectedNumeric(sleeveDecrease, "output_stitches") ?? (sleeveHeldSource && underarmSource && sourceDecreaseRepeats ? sleeveHeldSource + underarmSource - 2 * sourceDecreaseRepeats : null),
      yokeRepeats: selectedNumeric(raglan, "repeat_count"),
    };
    const raglanDelta = Math.abs(Number(role("raglan_increase_round")?.source?.countChange?.delta || 0));
    const solver = calculateConstraintAwareTopDownCounts({ sourceCounts, sourceGauge, adaptationGauge: targetGauge, raglanDeltaPerRepeat: raglanDelta }, binding);
    const adaptationProfile = { identity: draft.userAdaptationProfile?.identity || stableId("user-adaptation-profile", { fingerprint: binding.userAdaptationProfileFingerprint }), revision: integer(draft.userAdaptationProfile?.revision) ?? binding.stage20Revision, fingerprint: binding.userAdaptationProfileFingerprint };
    const solverIdentity = solver.status === "calculated" ? stableId("constraint-solver-result", { algorithmId: solver.algorithmId, binding, chosenCandidate: solver.chosenCandidate }) : null;
    const solverFingerprint = solver.status === "calculated" ? fingerprint({ identity: solverIdentity, ...copy(solver) }) : null;
    const blockers = [];
    if (solver.status !== "calculated") blockers.push({ code: "ADAPTATION_SOLVER_UNRESOLVED", missingAuthoritativeFields: copy(solver.missingFields), message: "Constraint solver не получил полный authoritative input." });
    const requiredRoles = ["cast_on", "neckline_deferred_setup", "neckline_increase", "raglan_increase_round", "raglan_repeat_block", "yoke_depth_and_short_row_intro", "short_row_1", "short_row_2", "short_row_3", "short_row_4", "short_row_recovery_round", "short_row_shift_bor", "separation", "body_regular_measure", "body_lower_ribbing", "sleeve_setup", "sleeve_long_start", "sleeve_long_decrease", "deferred_neckline_ribbing", "finishing"];
    const missingRoles = requiredRoles.filter((name) => !role(name));
    if (missingRoles.length) blockers.push({ code: "SELECTED_EXECUTION_ROLE_MISSING", missingAuthoritativeFields: missingRoles, message: "Selected source branch не содержит обязательные typed operations." });
    if (blockers.length) return { status: "blocked", operations: [], sourceCounts, solver, solverIdentity, solverFingerprint, adaptationProfile, blockers, shortRows: [] };
    const c = solver.chosenCandidate;
    const shortPairExecutions = selectedNumeric(role("short_row_4"), "repeat_count");
    const shortRowDeclaredBlockRows = selectedNumeric(role("short_row_4"), "row_count");
    if (shortPairExecutions !== 5 || shortRowDeclaredBlockRows !== 10) blockers.push({ code: "SHORT_ROW_SOURCE_SEMANTICS_UNRESOLVED", missingAuthoritativeFields: ["shortRowPairExecutions", "shortRowBlockRows"], message: "Source short-row repeat contract не соответствует proven ML wording." });
    const shortRows = blockers.length ? [] : expandPhysicalShortRows({ firstInstructionIdentity: role("short_row_1").sourceProvenanceRefs[0], secondInstructionIdentity: role("short_row_2").sourceProvenanceRefs[0], repeatedPair: [role("short_row_3").sourceProvenanceRefs[0], role("short_row_4").sourceProvenanceRefs[0]], pairExecutionsTotal: shortPairExecutions, stitchCount: c.yokeFinal });
    if (blockers.length) return { status: "blocked", operations: [], sourceCounts, solver, solverIdentity, solverFingerprint, adaptationProfile, blockers, shortRows };

    const selectedBranches = Object.fromEntries(branchResolution.selectedOptions.map((entry) => [entry.groupId, entry.selectedOptionId]));
    const baseState = { totalStitches: 0, allocation: { yoke: 0, body: 0, rightSleeve: 0, leftSleeve: 0, neckline: 0 }, held: { rightSleeve: 0, leftSleeve: 0 }, createdUnderarm: { right: 0, left: 0 }, direction: "round", rowMode: "round", beginningOfRound: "cast_on", turnState: "none", activeBranch: selectedBranches, needleState: "smaller", availableEdges: { necklineCastOn: 0 } };
    const operations = []; let state = copy(baseState);
    const append = (identity, kind, sourceOperation, outputState, change, details = {}) => {
      const inputState = copy(state); const output = copy(outputState);
      operations.push({ identity, order: operations.length + 1, kind, sourceEvidenceUnitIdentity: sourceOperation?.sourceProvenanceRefs?.[0] ?? null, sourceLocator: copy(sourceOperation?.source?.sourceLocator ?? null), inputState, outputState: output, change: copy(change), ...copy(details) });
      state = output;
    };
    const preserve = (identity, kind, sourceOperation, patch = {}, details = {}) => { const output = { ...copy(state), ...copy(patch) }; append(identity, kind, sourceOperation, output, { input: state.totalStitches, delta: 0, repeatCount: 1, output: state.totalStitches }, details); };
    const changed = (identity, kind, sourceOperation, nextTotal, delta, patch = {}, details = {}) => { const output = { ...copy(state), ...copy(patch), totalStitches: nextTotal }; append(identity, kind, sourceOperation, output, { input: state.totalStitches, delta, repeatCount: 1, output: nextTotal }, details); };
    changed("execution:cast-on", "cast_on", role("cast_on"), c.castOn, c.castOn, { allocation: { ...state.allocation, yoke: c.castOn }, availableEdges: { necklineCastOn: c.castOn } }, { executableValue: provenanceValue(sourceCounts.castOn, c.castOn, "stitches", role("cast_on"), solverIdentity, solverFingerprint, adaptationProfile, binding) });
    preserve("execution:join-bor", "join_round", role("cast_on"), { beginningOfRound: "cast_on", rowMode: "round" });
    preserve("execution:deferred-neckline-initial-round", "deferred_neckline_setup", role("neckline_deferred_setup"), { needleState: "larger" });
    changed("execution:neckline-increase", "increase", role("neckline_increase"), c.yokeStart, c.yokeStart - c.castOn, { allocation: { ...state.allocation, yoke: c.yokeStart } }, { executableValue: provenanceValue(sourceCounts.yokeStart, c.yokeStart, "stitches", role("neckline_increase"), solverIdentity, solverFingerprint, adaptationProfile, binding) });
    preserve("execution:yoke-marker-setup", "marker_setup", role("yoke_marker_setup"), {}, { allocationTarget: { front: 50, back: 50, rightSleeve: 20, leftSleeve: 20 } });
    const raglanChain = [c.yokeStart];
    for (let repeat = 1; repeat <= c.yokeRepeats; repeat += 1) {
      const next = state.totalStitches + raglanDelta; raglanChain.push(next);
      changed(`execution:raglan-increase:${repeat}`, "raglan_increase", role("raglan_increase_round"), next, raglanDelta, { allocation: { ...state.allocation, yoke: next } }, { repeatOrdinal: repeat });
      preserve(`execution:raglan-plain:${repeat}`, "raglan_plain_round", raglan, {}, { repeatOrdinal: repeat });
    }
    const yokeDepthOperation = role("yoke_depth_and_short_row_intro");
    const yokeMeasure = selectedMeasurements(yokeDepthOperation)[0];
    if (!positiveNumber(yokeMeasure)) throw reviewError("YOKE_DEPTH_MISSING", "Source yoke depth measurement отсутствует.");
    preserve("execution:yoke-depth", "measure_until", yokeDepthOperation, {}, { physicalCondition: { sourceValue: yokeMeasure, adaptedValue: yokeMeasure, unit: "in", measurementAuthoritative: true } });
    preserve("execution:short-row-marker", "short_row_marker_setup", role("short_row_marker_setup"), { rowMode: "row", beginningOfRound: "centre_back", turnState: "ready_rs" });
    for (const row of shortRows) preserve(`execution:short-row:${row.physicalRowOrdinal}`, "short_row", role(row.sourceInstructionIdentity === role("short_row_1").sourceProvenanceRefs[0] ? "short_row_1" : row.sourceInstructionIdentity === role("short_row_2").sourceProvenanceRefs[0] ? "short_row_2" : row.sourceInstructionIdentity === role("short_row_3").sourceProvenanceRefs[0] ? "short_row_3" : "short_row_4"), { direction: row.direction === "RS" ? "WS" : "RS", turnState: "turned" }, row);
    preserve("execution:short-row-recovery", "short_row_recovery_round", role("short_row_recovery_round"), { direction: "round", rowMode: "round", turnState: "none" });
    preserve("execution:shift-bor", "shift_bor", role("short_row_shift_bor"), { beginningOfRound: "first_raglan_marker" });
    const separatedAllocation = { yoke: 0, body: c.body, rightSleeve: 0, leftSleeve: 0, neckline: 0 };
    changed("execution:separation", "separation", separation, c.yokeFinal + 2 * c.underarm, 2 * c.underarm, { allocation: separatedAllocation, held: { rightSleeve: c.sleeveHeld, leftSleeve: c.sleeveHeld }, createdUnderarm: { right: c.underarm, left: c.underarm }, beginningOfRound: "body_underarm" }, { subtransitions: [{ action: "hold_right_sleeve", count: c.sleeveHeld }, { action: "create_right_underarm", count: c.underarm }, { action: "work_front", count: c.front }, { action: "hold_left_sleeve", count: c.sleeveHeld }, { action: "create_left_underarm", count: c.underarm }, { action: "work_back", count: c.back }], conservation: { yoke: c.yokeFinal, allocation: c.front + c.back + 2 * c.sleeveHeld, body: c.body } });
    const bodyLength = selectedMeasurements(role("body_regular_measure"))[0]; const bodyRib = selectedMeasurements(role("body_lower_ribbing"))[0];
    preserve("execution:body-measure", "measure_until", role("body_regular_measure"), {}, { physicalCondition: { sourceValue: bodyLength, adaptedValue: bodyLength, unit: "in", measurementAuthoritative: true } });
    preserve("execution:body-ribbing", "ribbing", role("body_lower_ribbing"), { needleState: "smaller" }, { physicalCondition: { sourceValue: bodyRib, adaptedValue: bodyRib, unit: "in", measurementAuthoritative: true } });
    changed("execution:body-bind-off", "bind_off", role("body_lower_ribbing"), state.totalStitches - c.body, -c.body, { allocation: { ...state.allocation, body: 0 }, needleState: "larger" });
    const sleeveStartLength = selectedMeasurements(role("sleeve_long_start"))[0]; const sleeveMeasurements = selectedMeasurements(sleeveDecrease); const sleeveTargetLength = sleeveMeasurements[0];
    const cuffLengthValues = sleeveMeasurements;
    const cuffLength = cuffLengthValues[cuffLengthValues.length - 1] || 2;
    const decreaseRepeats = (c.sleeveStart - c.cuff) / 2;
    const startRowsExact = sleeveStartLength * 2.54 * (targetGauge.rows ?? targetGauge.rounds) / targetGauge.per;
    const targetRowsExact = sleeveTargetLength * 2.54 * (targetGauge.rows ?? targetGauge.rounds) / targetGauge.per;
    const sourceCycle = selectedNumeric(sleeveDecrease, "decrease_cycle_rounds") ?? (selectedNumeric(sleeveDecrease, "even_rounds") + 1);
    const scaledCycleCalculation = calculateAdaptedRowCount(sourceCycle, { rows: sourceGauge.rounds ?? sourceGauge.rows, per: sourceGauge.per, unit: sourceGauge.unit }, { rows: targetGauge.rows ?? targetGauge.rounds, per: targetGauge.per, unit: targetGauge.unit }, "NEAREST_INTEGER_HALF_UP", binding);
    const scaledCycle = scaledCycleCalculation.value;
    const fitCycle = Math.floor((targetRowsExact - startRowsExact) / Math.max(1, decreaseRepeats - 1));
    const decreaseCycleRounds = Math.max(1, Math.min(scaledCycle, fitCycle));
    const remainingStraightRoundsEstimate = Math.max(0, Math.round(targetRowsExact - (Math.round(startRowsExact) + Math.max(0, decreaseRepeats - 1) * decreaseCycleRounds)));
    const sleeveChain = [];
    for (const side of ["right", "left"]) {
      const other = side === "right" ? "left" : "right";
      const allocationKey = `${side}Sleeve`; const heldKey = `${side}Sleeve`;
      changed(`execution:${side}-sleeve-setup`, "sleeve_setup", sleeveSetup, state.totalStitches + c.underarm, c.underarm, { allocation: { ...state.allocation, [allocationKey]: c.sleeveStart }, held: { ...state.held, [heldKey]: 0 }, beginningOfRound: `${side}_underarm`, needleState: "larger" }, { conservation: `${c.sleeveHeld} + ${c.underarm} = ${c.sleeveStart}` });
      preserve(`execution:${side}-sleeve-initial-length`, "measure_until", role("sleeve_long_start"), {}, { physicalCondition: { sourceValue: sleeveStartLength, adaptedValue: sleeveStartLength, unit: "in", measurementAuthoritative: true } });
      const chain = [c.sleeveStart];
      for (let repeat = 1; repeat <= decreaseRepeats; repeat += 1) {
        const current = state.allocation[allocationKey]; const nextCount = current - 2; chain.push(nextCount);
        changed(`execution:${side}-sleeve-decrease:${repeat}`, "sleeve_decrease", sleeveDecrease, state.totalStitches - 2, -2, { allocation: { ...state.allocation, [allocationKey]: nextCount } }, { repeatOrdinal: repeat, intervalRounds: repeat === decreaseRepeats ? 0 : decreaseCycleRounds, scheduleAlgorithmId: "measure-bounded-decrease-schedule:v1" });
        if (repeat < decreaseRepeats) preserve(`execution:${side}-sleeve-even:${repeat}`, "work_even", sleeveDecrease, {}, { rounds: decreaseCycleRounds - 1 });
      }
      sleeveChain.push({ side, counts: chain });
      preserve(`execution:${side}-sleeve-to-target`, "measure_until", sleeveDecrease, {}, { physicalCondition: { sourceValue: sleeveTargetLength, adaptedValue: sleeveTargetLength, unit: "in", measurementAuthoritative: true, estimatedRemainingRounds: remainingStraightRoundsEstimate } });
      preserve(`execution:${side}-cuff`, "ribbing", sleeveDecrease, { needleState: "smaller" }, { physicalCondition: { sourceValue: cuffLength, adaptedValue: cuffLength, unit: "in", measurementAuthoritative: true } });
      changed(`execution:${side}-cuff-bind-off`, "bind_off", sleeveDecrease, state.totalStitches - c.cuff, -c.cuff, { allocation: { ...state.allocation, [allocationKey]: 0 }, beginningOfRound: other === "left" ? "left_underarm" : "right_underarm", needleState: "larger" });
    }
    changed("execution:neckline-pickup", "pick_up_stitches", role("deferred_neckline_ribbing"), state.totalStitches + c.castOn, c.castOn, { allocation: { ...state.allocation, neckline: c.castOn }, availableEdges: { necklineCastOn: 0 }, beginningOfRound: "neckline", needleState: "smaller" }, { pickupRule: "one stitch in each cast-on stitch" });
    const necklineLength = selectedMeasurements(role("deferred_neckline_ribbing"))[0];
    preserve("execution:neckline-ribbing", "ribbing", role("deferred_neckline_ribbing"), {}, { physicalCondition: { sourceValue: necklineLength, adaptedValue: necklineLength, unit: "in", measurementAuthoritative: true } });
    changed("execution:neckline-bind-off", "bind_off", role("deferred_neckline_ribbing"), 0, -c.castOn, { allocation: { ...state.allocation, neckline: 0 } });
    preserve("execution:finish-underarms", "finish_underarms", role("finishing"));
    preserve("execution:weave-ends", "weave_ends", role("finishing"));
    preserve("execution:block", "block", role("finishing"));
    const sleeveSchedule = { sourceCycleRounds: sourceCycle, scaledCycleExact: scaledCycleCalculation.provenance.exactResult, scaledCycleRounds: scaledCycle, measurementCapCycleRounds: fitCycle, decreaseCycleRounds, decreaseRepeats, startMeasurementInches: sleeveStartLength, targetMeasurementInches: sleeveTargetLength, startRowsExact, targetRowsExact, remainingStraightRoundsEstimate, algorithmId: "measure-bounded-decrease-schedule:v1", rowGaugeInputs: { source: { rows: sourceGauge.rounds ?? sourceGauge.rows, per: sourceGauge.per, unit: sourceGauge.unit }, adaptation: { rows: targetGauge.rows ?? targetGauge.rounds, per: targetGauge.per, unit: targetGauge.unit } } };
    const increaseDistribution = buildEvenIncreaseDistribution(c.castOn, c.yokeStart - c.castOn);
    const necklineIncreaseOperation = operations.find((entry) => entry.identity === "execution:neckline-increase");
    if (necklineIncreaseOperation) necklineIncreaseOperation.increaseDistribution = copy(increaseDistribution);
    const causalAuthority = { schemaId: "CAUSAL_AUTHORITY_INPUT_V1", sourcePatternFacts: copy(draft.sourcePatternEvidence?.facts ?? {}), userAdaptationProfile: copy(draft.userAdaptationProfile ?? {}), binding: copy(binding), branchResolution: copy(branchResolution), fingerprint: null };
    causalAuthority.fingerprint = fingerprint({ schemaId: causalAuthority.schemaId, sourcePatternFacts: causalAuthority.sourcePatternFacts, userAdaptationProfile: causalAuthority.userAdaptationProfile, binding: causalAuthority.binding, branchResolution: causalAuthority.branchResolution });
    const causalContext = { draft, binding, branchResolution, sourceCounts, solver, solverIdentity, solverFingerprint, operations, sleeveSchedule, increaseDistribution };
    const causalTrace = buildAuthoritativeCausalTrace(causalContext);
    const validation = validateSequentialExecution({ operations, solverIdentity, solverFingerprint, evidenceFingerprint: binding.sourceInstructionEvidenceFingerprint, branchFingerprint: branchResolution.fingerprint, shortRows, raglanChain, sleeveChain }, { binding, branchResolution, solverIdentity, solverFingerprint });
    const causalValidation = validateAuthoritativeCausalTrace(causalTrace, operations, causalContext);
    if (!causalValidation.isValid) validation.errors.push(...causalValidation.errors);
    for (const conflict of causalTrace.productBlockers.filter((entry) => entry.status === "CONFLICT")) validation.errors.push({ code: "CAUSAL_CONFLICT_BLOCKS_CONFIRMATION", semanticParameterId: conflict.semanticParameterId, message: "Authoritative adaptation inputs conflict." });
    validation.isValid = validation.errors.length === 0;
    return { status: validation.isValid ? "ready" : "blocked", operations, sourceCounts, solver, solverIdentity, solverFingerprint, adaptationProfile, evidenceFingerprint: binding.sourceInstructionEvidenceFingerprint, branchFingerprint: branchResolution.fingerprint, blockers: validation.errors.map((entry) => ({ code: entry.code, missingAuthoritativeFields: [entry.operationIdentity ?? entry.semanticParameterId].filter(Boolean), message: entry.message })), shortRows, raglanChain, separation: { yoke: c.yokeFinal, front: c.front, back: c.back, sleeves: [c.sleeveHeld, c.sleeveHeld], underarms: [c.underarm, c.underarm], body: c.body }, sleeveChain, sleeveSchedule, increaseDistribution, causalAuthority: deepFreeze(causalAuthority), causalTrace, validation };
  }

  function provenanceValue(sourceValue, adaptedValue, unit, sourceOperation, solverIdentity, solverFingerprint, adaptationProfile, binding) {
    return { sourceValue, sourceUnit: unit, sourceEvidenceUnitIdentity: sourceOperation?.sourceProvenanceRefs?.[0] ?? null, sourceLocator: copy(sourceOperation?.source?.sourceLocator ?? null), adaptedValue, adaptedUnit: unit, derivationIdentity: "constraint-aware-top-down-counts:v1", roundingPolicy: "NEAREST_INTEGER_HALF_UP", solverResultIdentity: solverIdentity, solverResultFingerprint: solverFingerprint, adaptationProfile: copy(adaptationProfile), validationStatus: "validated", evidenceBinding: numberEvidenceBinding(binding) };
  }

  function buildEvenIncreaseDistribution(inputStitches, increaseCount) {
    const input = positiveInteger(inputStitches); const increases = positiveInteger(increaseCount);
    if (!input || !increases || increases > input) throw reviewError("INCREASE_DISTRIBUTION_INVALID", "Нельзя доказуемо распределить прибавки по исходным петлям.");
    const shortInterval = Math.floor(input / increases); const longInterval = shortInterval + 1;
    const longIntervalCount = input % increases; const shortIntervalCount = increases - longIntervalCount;
    const intervals = [];
    if (shortIntervalCount === 0) {
      for (let index = 0; index < increases; index += 1) intervals.push(longInterval);
    } else {
      const longPerShort = Math.floor(longIntervalCount / shortIntervalCount);
      const trailingLongIntervals = longIntervalCount % shortIntervalCount;
      for (let group = 0; group < shortIntervalCount; group += 1) {
        for (let index = 0; index < longPerShort; index += 1) intervals.push(longInterval);
        intervals.push(shortInterval);
      }
      for (let index = 0; index < trailingLongIntervals; index += 1) intervals.push(longInterval);
    }
    const outputStitches = input + increases;
    const repeatedGroup = shortIntervalCount ? { repeatCount: shortIntervalCount, intervals: [...Array(Math.floor(longIntervalCount / shortIntervalCount)).fill(longInterval), shortInterval] } : null;
    const trailingIntervals = shortIntervalCount ? Array(longIntervalCount % shortIntervalCount).fill(longInterval) : [];
    return deepFreeze({
      algorithmId: "quotient-remainder-even-increase-distribution:v1", inputStitches: input, increaseEventCount: increases,
      stitchesAddedPerEvent: 1, outputStitches, intervals, intervalCounts: [{ stitchesBeforeIncrease: shortInterval, count: shortIntervalCount }, { stitchesBeforeIncrease: longInterval, count: longIntervalCount }].filter((entry) => entry.count > 0),
      repeatedGroup, trailingIntervals, checks: { intervalCount: intervals.length, consumedInputStitches: intervals.reduce((sum, value) => sum + value, 0), addedStitches: increases, outputStitches, maxIntervalDifference: Math.max(...intervals) - Math.min(...intervals) },
    });
  }

  function buildAuthoritativeCausalTrace(context) {
    const draft = object(context?.draft) || {}; const binding = object(context?.binding) || {};
    const profile = object(draft.userAdaptationProfile) || {}; const source = object(draft.sourcePatternEvidence?.facts) || {};
    const solver = object(context?.solver) || {}; const chosen = object(solver.chosenCandidate) || {}; const sourceCounts = object(context?.sourceCounts) || {};
    const operations = array(context?.operations); const operationIds = new Set(operations.map((entry) => entry.identity));
    const parameterDecisions = []; const valueDecisions = []; const productBlockers = [];
    const provenance = { sourcePatternEvidenceFingerprint: binding.sourcePatternEvidenceFingerprint ?? null, userAdaptationProfileFingerprint: binding.userAdaptationProfileFingerprint ?? null, sourceInstructionEvidenceFingerprint: binding.sourceInstructionEvidenceFingerprint ?? null, stage20ResultIdentity: binding.stage20ResultIdentity ?? null, solverResultIdentity: context?.solverIdentity ?? null, solverResultFingerprint: context?.solverFingerprint ?? null };
    const addParameter = (entry) => {
      const decision = { semanticParameterId: entry.semanticParameterId, status: entry.status, acceptedValue: copy(entry.acceptedValue ?? null), sourceValue: copy(entry.sourceValue ?? null), productPromise: entry.productPromise || "required_when_accepted", constructionInfluence: entry.constructionInfluence || "none", applicabilityRule: entry.applicabilityRule ?? null, appliedRule: entry.appliedRule ?? null, calculation: copy(entry.calculation ?? null), checkedBy: copy(entry.checkedBy ?? []), affectedOperationIdentities: stableStrings(entry.affectedOperationIdentities), affectedTargetPaths: stableStrings(entry.affectedTargetPaths), missingAuthoritativeFields: stableStrings(entry.missingAuthoritativeFields), conflictValues: copy(entry.conflictValues ?? []), provenance: copy(provenance), explanationKey: entry.explanationKey };
      parameterDecisions.push(decision);
      if (["UNSUPPORTED", "MISSING_EVIDENCE", "CONFLICT"].includes(decision.status) && decision.productPromise !== "optional") productBlockers.push({ semanticParameterId: decision.semanticParameterId, status: decision.status, missingAuthoritativeFields: decision.missingAuthoritativeFields, explanationKey: decision.explanationKey });
    };
    const measurementMap = new Map(array(profile.measurements).map((entry) => [text(entry?.kind).toLowerCase(), entry]));
    const sourceGauge = firstGauge({ facts: source }, "rounds") || firstGauge({ facts: source }, "rows"); const targetGauge = adaptationGauge(profile);
    const countOperationMap = {
      castOn: ["execution:cast-on", "execution:neckline-pickup", "execution:neckline-bind-off"], yokeStart: ["execution:neckline-increase"], yokeFinal: [...operations.filter((entry) => entry.kind === "raglan_increase").map((entry) => entry.identity), "execution:separation"],
      front: ["execution:separation"], back: ["execution:separation", "execution:short-row-marker"], sleeveHeld: ["execution:separation", "execution:right-sleeve-setup", "execution:left-sleeve-setup"], underarm: ["execution:separation", "execution:right-sleeve-setup", "execution:left-sleeve-setup"], body: ["execution:separation", "execution:body-bind-off"],
      sleeveStart: ["execution:right-sleeve-setup", "execution:left-sleeve-setup"], cuff: ["execution:right-cuff-bind-off", "execution:left-cuff-bind-off"], yokeRepeats: operations.filter((entry) => entry.kind === "raglan_increase").map((entry) => entry.identity),
    };
    const solverProvenance = new Map(array(solver.numericProvenance).map((entry) => [text(entry.path).split(".").at(-1), entry]));
    for (const field of ["castOn", "yokeStart", "yokeFinal", "front", "back", "sleeveHeld", "underarm", "body", "sleeveStart", "cuff", "yokeRepeats"]) {
      const sourceField = field === "back" ? "front" : field; const before = Number(sourceCounts[sourceField]); const after = Number(chosen[field]); const numeric = solverProvenance.get(field);
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      valueDecisions.push({ semanticValueId: `solver.${field}`, field, status: before === after ? "UNCHANGED" : "USED", sourceValue: before, sourceUnit: field === "yokeRepeats" ? "repeats" : "stitches", acceptedConstraint: copy(profile.gauge ?? null), appliedRule: numeric?.algorithmId || solver.algorithmId, intermediateCalculation: { inputs: copy(numeric?.inputs ?? []), formula: numeric?.formula ?? null, exactResult: numeric?.exactResult ?? null, gaugeScaledTarget: numeric?.gaugeScaledTarget ?? null, selectionConstraints: copy(numeric?.selectionConstraints ?? []), selectionScore: numeric?.selectionScore ?? null }, roundingPolicy: numeric?.roundingPolicy ?? null, result: after, resultUnit: field === "yokeRepeats" ? "repeats" : "stitches", affectedOperationIdentities: stableStrings(array(countOperationMap[field]).filter((identity) => operationIds.has(identity))), provenance: copy(provenance) });
    }
    const derivedValues = [
      ["necklineIncreases", sourceCounts.yokeStart - sourceCounts.castOn, chosen.yokeStart - chosen.castOn, "yokeStart - castOn", ["execution:neckline-increase"]],
      ["backCentre", sourceCounts.front / 2, chosen.back / 2, "back / 2", ["execution:short-row-marker"]],
      ["necklinePickup", sourceCounts.castOn, chosen.castOn, "one pickup per cast-on stitch", ["execution:neckline-pickup"]],
      ["sleeveDecreaseRepeats", (sourceCounts.sleeveStart - sourceCounts.cuff) / 2, context.sleeveSchedule?.decreaseRepeats, "(sleeveStart - cuff) / 2", operations.filter((entry) => entry.kind === "sleeve_decrease").map((entry) => entry.identity)],
      ["sleeveCycleRounds", context.sleeveSchedule?.sourceCycleRounds, context.sleeveSchedule?.decreaseCycleRounds, "min(row-gauge-scaled cycle, measurement-bounded cycle)", operations.filter((entry) => entry.kind === "work_even").map((entry) => entry.identity)],
    ];
    for (const [field, before, after, formula, affected] of derivedValues) if (Number.isFinite(Number(before)) && Number.isFinite(Number(after))) {
      const cycle = field === "sleeveCycleRounds";
      valueDecisions.push({ semanticValueId: `derived.${field}`, field, status: Number(before) === Number(after) ? "UNCHANGED" : "USED", sourceValue: Number(before), sourceUnit: cycle ? "rounds" : field === "sleeveDecreaseRepeats" ? "repeats" : "stitches", acceptedConstraint: cycle ? copy(context.sleeveSchedule?.rowGaugeInputs) : copy(profile.gauge ?? null), appliedRule: cycle ? context.sleeveSchedule?.algorithmId : "declared-conservation-formula:v1", intermediateCalculation: cycle ? { inputs: [{ name: "sourceCycleRounds", value: context.sleeveSchedule?.sourceCycleRounds }, { name: "sourceRowGauge", value: context.sleeveSchedule?.rowGaugeInputs?.source }, { name: "adaptationRowGauge", value: context.sleeveSchedule?.rowGaugeInputs?.adaptation }, { name: "startMeasurementInches", value: context.sleeveSchedule?.startMeasurementInches }, { name: "targetMeasurementInches", value: context.sleeveSchedule?.targetMeasurementInches }, { name: "decreaseRepeats", value: context.sleeveSchedule?.decreaseRepeats }], formula, exactResult: { rowGaugeScaledExact: context.sleeveSchedule?.scaledCycleExact, rowGaugeRounded: context.sleeveSchedule?.scaledCycleRounds, measurementCap: context.sleeveSchedule?.measurementCapCycleRounds, selected: Number(after) } } : { inputs: [], formula, exactResult: Number(after) }, roundingPolicy: cycle ? "CONSTRAINT_SOLVER_SELECTION" : "NONE", result: Number(after), resultUnit: cycle ? "rounds" : field === "sleeveDecreaseRepeats" ? "repeats" : "stitches", affectedOperationIdentities: stableStrings(array(affected).filter((identity) => operationIds.has(identity))), provenance: copy(provenance) });
    }
    if (Number.isFinite(Number(context.sleeveSchedule?.remainingStraightRoundsEstimate))) valueDecisions.push({ semanticValueId: "derived.sleeveRemainingStraightRounds", field: "sleeveRemainingStraightRounds", status: "USED", sourceValue: null, sourceUnit: "rounds", acceptedConstraint: copy(context.sleeveSchedule?.rowGaugeInputs), appliedRule: context.sleeveSchedule.algorithmId, intermediateCalculation: { inputs: [{ name: "targetRowsExact", value: context.sleeveSchedule.targetRowsExact }, { name: "startRowsExact", value: context.sleeveSchedule.startRowsExact }, { name: "decreaseRepeats", value: context.sleeveSchedule.decreaseRepeats }, { name: "decreaseCycleRounds", value: context.sleeveSchedule.decreaseCycleRounds }], formula: "round(target rows - (round(start rows) + (decrease repeats - 1) × selected cycle))", exactResult: context.sleeveSchedule.targetRowsExact - (Math.round(context.sleeveSchedule.startRowsExact) + Math.max(0, context.sleeveSchedule.decreaseRepeats - 1) * context.sleeveSchedule.decreaseCycleRounds) }, roundingPolicy: "NEAREST_INTEGER_HALF_UP", result: Number(context.sleeveSchedule.remainingStraightRoundsEstimate), resultUnit: "rounds", affectedOperationIdentities: stableStrings(operations.filter((entry) => entry.kind === "measure_until" && entry.physicalCondition?.estimatedRemainingRounds !== undefined).map((entry) => entry.identity)), provenance: copy(provenance) });
    for (const operation of operations.filter((entry) => entry?.physicalCondition && Number.isFinite(Number(entry.physicalCondition.sourceValue)) && Number.isFinite(Number(entry.physicalCondition.adaptedValue)))) valueDecisions.push({ semanticValueId: `physical.${operation.identity}`, field: "physicalMeasurement", status: Number(operation.physicalCondition.sourceValue) === Number(operation.physicalCondition.adaptedValue) ? "UNCHANGED" : "USED", sourceValue: Number(operation.physicalCondition.sourceValue), sourceUnit: operation.physicalCondition.unit, acceptedConstraint: copy(operation.physicalCondition), appliedRule: Number(operation.physicalCondition.sourceValue) === Number(operation.physicalCondition.adaptedValue) ? "confirmed-source-measurement-preservation:v1" : "confirmed-vertical-adaptation:v1", intermediateCalculation: { inputs: copy(context.sleeveSchedule?.rowGaugeInputs ?? []), formula: null, exactResult: Number(operation.physicalCondition.adaptedValue) }, roundingPolicy: "NONE", result: Number(operation.physicalCondition.adaptedValue), resultUnit: operation.physicalCondition.unit, affectedOperationIdentities: [operation.identity], provenance: copy(provenance) });
    const distribution = context.increaseDistribution;
    if (distribution) valueDecisions.push({ semanticValueId: "derived.necklineIncreaseDistribution", field: "necklineIncreaseDistribution", status: "USED", sourceValue: sourceCounts.yokeStart - sourceCounts.castOn, sourceUnit: "increase_events", acceptedConstraint: { inputStitches: chosen.castOn, increaseEventCount: chosen.yokeStart - chosen.castOn }, appliedRule: distribution.algorithmId, intermediateCalculation: { inputs: [{ name: "inputStitches", value: distribution.inputStitches }, { name: "increaseEventCount", value: distribution.increaseEventCount }], formula: "partition input stitches into integer intervals whose lengths differ by at most one", exactResult: copy(distribution.intervals) }, roundingPolicy: "QUOTIENT_REMAINDER", result: distribution.increaseEventCount, resultUnit: "increase_events", executableDistribution: copy(distribution), affectedOperationIdentities: ["execution:neckline-increase"], provenance: copy(provenance) });

    const allCountOps = stableStrings(valueDecisions.flatMap((entry) => entry.affectedOperationIdentities));
    addParameter({ semanticParameterId: "gauge", status: sourceGauge && targetGauge && solver.status === "calculated" ? "USED" : "MISSING_EVIDENCE", acceptedValue: targetGauge, sourceValue: sourceGauge, constructionInfluence: "stitch_and_row_counts", appliedRule: solver.status === "calculated" ? solver.algorithmId : null, calculation: { inputs: [sourceGauge, targetGauge], formula: "adaptation gauge / source gauge", exactResult: solver.gaugeRatio, roundingPolicy: "NEAREST_INTEGER_HALF_UP" }, affectedOperationIdentities: allCountOps, missingAuthoritativeFields: sourceGauge && targetGauge ? [] : [!sourceGauge ? "sourceGauge" : null, !targetGauge ? "adaptationGauge" : null].filter(Boolean), explanationKey: "gauge" });
    const needles = array(profile.needles);
    if (needles.length) addParameter({ semanticParameterId: "needles", status: "USED", acceptedValue: needles, sourceValue: source.needles, constructionInfluence: "tool_selection", appliedRule: "user-confirmed-needle-substitution:v1", affectedTargetPaths: ["stage22.needleMap"], explanationKey: "needles" });
    const yarn = object(profile.yarn);
    if (yarn && Object.keys(yarn).length) addParameter({ semanticParameterId: "yarn", status: "USED", acceptedValue: yarn, sourceValue: { yarnWeight: source.yarnWeight, yarnSamples: source.yarnSamples }, constructionInfluence: "material_selection", appliedRule: "user-confirmed-material-selection:v1", affectedTargetPaths: ["stage22.summary.yarn", "stage22.prerequisites.materials"], explanationKey: "yarn" });
    const sourceSize = text(source.selectedSize || source.finishedMeasurement?.sizeLabel); const targetSize = text(profile.selectedSize?.value ?? profile.selectedSize);
    if (targetSize) addParameter({ semanticParameterId: "selected_size", status: sourceSize && sourceSize === targetSize ? "UNCHANGED" : sourceSize && sourceSize !== targetSize ? "CONFLICT" : "MISSING_EVIDENCE", acceptedValue: targetSize, sourceValue: sourceSize || null, constructionInfluence: "source_size_branch", applicabilityRule: "selected-source-size-must-match-confirmed-adaptation-size:v1", checkedBy: ["source selected size equality"], conflictValues: sourceSize && sourceSize !== targetSize ? [sourceSize, targetSize] : [], missingAuthoritativeFields: sourceSize ? [] : ["source.selectedSize"], explanationKey: "selected_size" });
    const chest = measurementMap.get("chest"); const ease = measurementMap.get("ease"); const finished = positiveNumber(source.finishedMeasurement?.cm);
    const chestTarget = positiveNumber(chest?.value); const easeTarget = positiveNumber(ease?.value); const fitMatches = chestTarget && easeTarget && finished && Math.abs(chestTarget + easeTarget - finished) < 0.01;
    for (const [id, measurement] of [["chest", chest], ["ease", ease]]) if (measurement) addParameter({ semanticParameterId: `measurement.${id}`, status: fitMatches ? "UNCHANGED" : chestTarget && easeTarget && finished ? "CONFLICT" : "MISSING_EVIDENCE", acceptedValue: measurement, sourceValue: finished, constructionInfluence: "finished_circumference_check", applicabilityRule: "chest-plus-ease-equals-selected-finished-circumference:v1", calculation: { inputs: [{ name: "chest", value: chestTarget }, { name: "ease", value: easeTarget }], formula: "chest + ease", exactResult: chestTarget && easeTarget ? chestTarget + easeTarget : null, result: finished }, checkedBy: fitMatches ? ["selected finished circumference equality"] : [], conflictValues: chestTarget && easeTarget && finished && !fitMatches ? [chestTarget + easeTarget, finished] : [], missingAuthoritativeFields: chestTarget && easeTarget && finished ? [] : [!chestTarget ? "measurement.chest" : null, !easeTarget ? "measurement.ease" : null, !finished ? "source.finishedMeasurement.cm" : null].filter(Boolean), explanationKey: id });
    for (const [kind, key] of [["waist", "waist"], ["hips", "hips"]]) { const measurement = measurementMap.get(kind); if (measurement) addParameter({ semanticParameterId: `measurement.${kind}`, status: "UNSUPPORTED", acceptedValue: measurement, constructionInfluence: "body_shaping", applicabilityRule: "top-down-body-shaping-requires-explicit-waist-hip-schedule:v1", missingAuthoritativeFields: ["solver.bodyShapingSchedule"], explanationKey: key }); }
    const totalLength = measurementMap.get("total_length");
    if (totalLength) addParameter({ semanticParameterId: "measurement.total_length", status: "MISSING_EVIDENCE", acceptedValue: totalLength, sourceValue: null, constructionInfluence: "vertical_section_lengths", applicabilityRule: "total-length-requires-authoritative-yoke-body-ribbing-decomposition:v1", calculation: { inputs: [{ name: "sourceRowGauge", value: sourceGauge ? { rows: sourceGauge.rows ?? sourceGauge.rounds, per: sourceGauge.per, unit: sourceGauge.unit } : null }, { name: "adaptationRowGauge", value: targetGauge ? { rows: targetGauge.rows ?? targetGauge.rounds, per: targetGauge.per, unit: targetGauge.unit } : null }], formula: null, exactResult: null }, missingAuthoritativeFields: ["source.totalGarmentLength", "source.yokeToUnderarmVerticalLength", "source.lengthSectionDecomposition"], explanationKey: "total_length" });
    if (yarn) {
      const quantity = positiveNumber(yarn.quantity ?? yarn.skeins);
      addParameter({ semanticParameterId: "yarn.quantity", status: quantity ? "UNSUPPORTED" : "MISSING_EVIDENCE", acceptedValue: quantity, sourceValue: null, constructionInfluence: "material_quantity", applicabilityRule: "skein-calculation-requires-source-consumption-and-meterage-contract:v1", missingAuthoritativeFields: quantity ? ["solver.adaptedYarnConsumption"] : ["profile.yarn.quantity", "source.sizeSpecificConsumption", "source.skeinMeterage", "solver.adaptedYarnConsumption"], explanationKey: "yarn_quantity" });
    }
    for (const selection of array(context?.branchResolution?.selectedOptions)) addParameter({ semanticParameterId: `branch.${selection.groupId}`, status: "USED", acceptedValue: selection.selectedOptionId, constructionInfluence: "execution_branch", appliedRule: "confirmed-exclusive-branch-selection:v1", affectedOperationIdentities: operations.filter((entry) => array(entry?.source?.choiceMembership).some((membership) => membership.groupId === selection.groupId && membership.optionId === selection.selectedOptionId)).map((entry) => entry.identity), affectedTargetPaths: [`branchSelection.${selection.groupId}`], explanationKey: `branch.${selection.groupId}` });
    for (const entry of array(profile.notApplicableParameters)) addParameter({ semanticParameterId: text(entry?.semanticParameterId), status: "NOT_APPLICABLE", acceptedValue: entry?.value ?? null, productPromise: entry?.productPromise ?? "optional", constructionInfluence: "none", applicabilityRule: text(entry?.applicabilityRule), checkedBy: ["explicit construction applicability rule"], explanationKey: entry?.explanationKey ?? "not_applicable" });
    for (const measurement of array(profile.measurements)) {
      const id = `measurement.${text(measurement?.kind).toLowerCase()}`;
      if (!parameterDecisions.some((entry) => entry.semanticParameterId === id)) addParameter({ semanticParameterId: id, status: measurement?.status === "conflict" ? "CONFLICT" : "UNSUPPORTED", acceptedValue: measurement, constructionInfluence: "unknown", applicabilityRule: "unmapped-accepted-measurement-is-not-silently-ignored:v1", conflictValues: copy(measurement?.conflictValues ?? []), explanationKey: "unknown_measurement" });
    }
    parameterDecisions.sort((left, right) => lexical(left.semanticParameterId, right.semanticParameterId)); valueDecisions.sort((left, right) => lexical(left.semanticValueId, right.semanticValueId));
    const changed = valueDecisions.filter((entry) => Number.isFinite(Number(entry.sourceValue)) && Number.isFinite(Number(entry.result)) && Number(entry.sourceValue) !== Number(entry.result));
    const uncoveredChangedValues = changed.filter((entry) => !text(entry.appliedRule) || !array(entry.affectedOperationIdentities).length).map((entry) => entry.semanticValueId);
    const trace = { schemaId: CAUSAL_TRACE_SCHEMA_ID, version: 1, algorithmId: CAUSAL_TRACE_ALGORITHM_ID, parameterDecisions, valueDecisions, productBlockers, coverage: { requiredParameterIds: stableStrings(parameterDecisions.map((entry) => entry.semanticParameterId)), requiredValueIds: stableStrings(valueDecisions.map((entry) => entry.semanticValueId)), acceptedParameterCount: parameterDecisions.length, uniquelyDisposedParameterCount: new Set(parameterDecisions.map((entry) => entry.semanticParameterId)).size, executableValueCount: valueDecisions.length, changedExecutableValueCount: changed.length, coveredChangedExecutableValueCount: changed.length - uncoveredChangedValues.length, uncoveredChangedValues, complete: parameterDecisions.length > 0 && valueDecisions.length > 0 && uncoveredChangedValues.length === 0 }, provenance: copy(provenance), fingerprint: null };
    trace.fingerprint = causalTraceFingerprint(trace); return deepFreeze(trace);
  }

  function causalTraceFingerprint(trace) { const payload = copy(trace); delete payload.fingerprint; return fingerprint(payload); }

  function causalBuildContext(authorityContext, operations) {
    if (object(authorityContext?.draft)) return { ...authorityContext, operations: array(operations).length ? operations : array(authorityContext.operations) };
    const authority = object(authorityContext?.causalAuthority);
    if (!authority || authority.schemaId !== "CAUSAL_AUTHORITY_INPUT_V1") return null;
    const payload = { schemaId: authority.schemaId, sourcePatternFacts: authority.sourcePatternFacts, userAdaptationProfile: authority.userAdaptationProfile, binding: authority.binding, branchResolution: authority.branchResolution };
    if (authority.fingerprint !== fingerprint(payload)) return null;
    return { draft: { userAdaptationProfile: copy(authority.userAdaptationProfile ?? {}), sourcePatternEvidence: { facts: copy(authority.sourcePatternFacts ?? {}) } }, binding: copy(authority.binding ?? {}), branchResolution: copy(authority.branchResolution ?? {}), sourceCounts: copy(authorityContext.sourceCounts ?? {}), solver: copy(authorityContext.solver ?? {}), solverIdentity: authorityContext.solverIdentity ?? null, solverFingerprint: authorityContext.solverFingerprint ?? null, operations: array(operations).length ? operations : array(authorityContext.operations), sleeveSchedule: copy(authorityContext.sleeveSchedule ?? {}), increaseDistribution: copy(authorityContext.increaseDistribution ?? null) };
  }

  function validateAuthoritativeCausalTrace(trace, operations = [], authorityContext = null) {
    const errors = []; const add = (code, details = {}) => errors.push({ code, message: code, ...details }); const operationIds = new Set(array(operations).map((entry) => entry.identity));
    if (!trace || trace.schemaId !== CAUSAL_TRACE_SCHEMA_ID || trace.version !== 1 || trace.algorithmId !== CAUSAL_TRACE_ALGORITHM_ID || trace.fingerprint !== causalTraceFingerprint(trace)) add("CAUSAL_TRACE_INVALID");
    const ids = new Set();
    for (const decision of array(trace?.parameterDecisions)) {
      if (!text(decision.semanticParameterId) || ids.has(decision.semanticParameterId) || !CAUSAL_DISPOSITIONS.includes(decision.status)) add("CAUSAL_PARAMETER_DISPOSITION_INVALID", { semanticParameterId: decision.semanticParameterId });
      ids.add(decision.semanticParameterId);
      if (decision.status === "USED" && (!text(decision.appliedRule) || !(array(decision.affectedOperationIdentities).length || array(decision.affectedTargetPaths).length))) add("CAUSAL_USED_DEPENDENCY_MISSING", { semanticParameterId: decision.semanticParameterId });
      if (decision.status === "UNCHANGED" && (!text(decision.applicabilityRule) || !array(decision.checkedBy).length)) add("CAUSAL_UNCHANGED_CHECK_MISSING", { semanticParameterId: decision.semanticParameterId });
      if (decision.status === "NOT_APPLICABLE" && !text(decision.applicabilityRule)) add("CAUSAL_APPLICABILITY_RULE_MISSING", { semanticParameterId: decision.semanticParameterId });
      if (decision.status === "MISSING_EVIDENCE" && !array(decision.missingAuthoritativeFields).length) add("CAUSAL_MISSING_EVIDENCE_UNSPECIFIED", { semanticParameterId: decision.semanticParameterId });
      if (decision.status === "CONFLICT" && array(decision.conflictValues).length < 2) add("CAUSAL_CONFLICT_UNSPECIFIED", { semanticParameterId: decision.semanticParameterId });
    }
    for (const value of array(trace?.valueDecisions)) {
      if (!text(value.semanticValueId) || !text(value.appliedRule)) add("CAUSAL_VALUE_INVALID");
      for (const identity of array(value.affectedOperationIdentities)) if (!operationIds.has(identity)) add("CAUSAL_OPERATION_REFERENCE_INVALID", { operationIdentity: identity });
      if (value.field === "necklineIncreaseDistribution") {
        const distribution = value.executableDistribution;
        if (!distribution || distribution.checks?.intervalCount !== distribution.increaseEventCount || distribution.checks?.consumedInputStitches !== distribution.inputStitches || distribution.outputStitches !== distribution.inputStitches + distribution.increaseEventCount || distribution.checks?.maxIntervalDifference > 1) add("INCREASE_DISTRIBUTION_INVALID");
      }
    }
    const valueIds = new Set(array(trace?.valueDecisions).map((entry) => entry.semanticValueId));
    if (!ids.size || !valueIds.size || trace?.coverage?.acceptedParameterCount !== ids.size || trace?.coverage?.executableValueCount !== valueIds.size || canonicalizeSafe(stableStrings(trace?.coverage?.requiredParameterIds)) !== canonicalizeSafe(stableStrings([...ids])) || canonicalizeSafe(stableStrings(trace?.coverage?.requiredValueIds)) !== canonicalizeSafe(stableStrings([...valueIds])) || trace?.coverage?.uncoveredChangedValues?.length || trace?.coverage?.complete !== true) add("CAUSAL_COVERAGE_INCOMPLETE");
    const buildContext = causalBuildContext(authorityContext, operations);
    if (!buildContext) add("CAUSAL_AUTHORITY_CONTEXT_MISSING");
    else {
      const expected = buildAuthoritativeCausalTrace(buildContext);
      if (canonicalizeSafe(expected) !== canonicalizeSafe(trace)) add("CAUSAL_TRACE_NOT_AUTHORITATIVE_PROJECTION");
    }
    return { isValid: errors.length === 0, errors };
  }

  const USER_OPERATION_LABELS = Object.freeze({
    cast_on: "набор петель", join_round: "соединение вязания в круг", deferred_neckline_setup: "отложенная обработка горловины",
    increase: "прибавки горловины", marker_setup: "расстановка маркеров", raglan_increase: "прибавки реглана",
    raglan_plain_round: "ровные круги реглана", measure_until: "вязание до контрольной длины", short_row_marker_setup: "подготовка укороченных рядов",
    short_row: "укороченные ряды", short_row_recovery_round: "возврат к вязанию по кругу", shift_bor: "перенос начала круга",
    separation: "разделение корпуса и рукавов", ribbing: "резинка", bind_off: "закрытие петель", sleeve_setup: "подготовка рукава",
    sleeve_decrease: "убавки рукава", work_even: "вязание рукава без убавок", pick_up_stitches: "подъём петель горловины",
    finish_underarms: "закрытие отверстий подрезов", weave_ends: "заправка концов нити", block: "влажно-тепловая обработка",
  });
  const BRANCH_LABELS = Object.freeze({
    neckline_method: { label: "обработка горловины", options: { ribbing_last: "связать резинку горловины в конце" } },
    short_rows: { label: "укороченные ряды", options: { include: "выполнить укороченные ряды" } },
    body_length: { label: "длина корпуса", options: { regular: "обычная длина корпуса" } },
    sleeve_length: { label: "длина рукавов", options: { long: "длинные рукава" } },
  });

  function userOperationLabel(kind) { return USER_OPERATION_LABELS[kind] || "действие плана без подтверждённого русского названия"; }

  function buildAdaptationExplanation(input) {
    const trace = input?.adaptedExecution?.causalTrace;
    if (!trace || validateAuthoritativeCausalTrace(trace, input?.adaptedExecution?.operations, input?.adaptedExecution).isValid !== true) return deepFreeze({
      status: "partial", heading: "Что изменилось в вашей инструкции",
      intro: "Этот сохранённый проект создан до появления полной причинной цепочки. Числа плана доступны, но Yarn AI не будет восстанавливать причины задним числом по совпадению значений.",
      sourceVariant: "Для этого проекта нужен новый authoritative causal trace из сохранённого расчёта.", changes: [], unchanged: [],
      gaps: [{ area: "Причинная цепочка", message: "В сохранённом Stage 21 нет структурированного причинного следа. Проект читается совместимо, но полное объяснение недоказуемо." }],
      operationCoverage: { total: 0, explained: 0, unchanged: 0, gaps: 1, complete: false },
    });
    return buildAdaptationExplanationFromTrace(trace);
  }

  function buildAdaptationExplanationFromTrace(trace) {
    const changes = []; const unchanged = []; const gaps = [];
    const parameters = new Map(array(trace.parameterDecisions).map((entry) => [entry.semanticParameterId, entry]));
    const values = new Map(array(trace.valueDecisions).map((entry) => [entry.field, entry]));
    const addGap = (area, message) => gaps.push({ area, message });
    const parameterValue = (decision) => decision?.acceptedValue?.value ?? decision?.acceptedValue;
    const measurementText = (decision) => decision?.acceptedValue && `${formatNumberRu(decision.acceptedValue.value)} ${unitLabel(decision.acceptedValue.unit)}`;
    const gauge = parameters.get("gauge");
    if (gauge?.status === "USED") changes.push({ title: "Плотность вязания", before: formatGauge(gauge.sourceValue), after: formatGauge(gauge.acceptedValue), why: `Сохранённый расчёт применил правило пересчёта по плотности ${formatGauge(gauge.sourceValue)} → ${formatGauge(gauge.acceptedValue)} ко всем перечисленным ниже количествам петель.`, practical: "Плотность действительно входит в расчёт, а не только показана на экране.", affectedActions: ["набор петель", "прибавки кокетки", "разделение корпуса и рукавов", "формирование рукавов"], basis: ["структурированный причинный след расчёта"] });
    else if (gauge) addGap("Плотность", "Расчёт не содержит обеих подтверждённых плотностей; пересчёт не считается доказанным.");
    const needles = parameters.get("needles");
    if (needles?.status === "USED") changes.push({ title: "Спицы", before: formatNumberList(array(needles.sourceValue).map(Number).filter(Number.isFinite), "мм"), after: formatNumberList(array(needles.acceptedValue).map((entry) => Number(entry?.canonicalValue ?? entry?.value)).filter(Number.isFinite), "мм"), why: "Подтверждённые спицы пользователя сохранены как вход выбора инструментов и напрямую связаны с картой спиц исполнимого плана.", practical: "В шагах используются именно подтверждённые меньшие и большие спицы.", affectedActions: ["набор петель", "основное полотно", "резинка"], basis: ["структурированный причинный след расчёта"] });
    const yarn = parameters.get("yarn");
    if (yarn?.status === "USED") changes.push({ title: "Пряжа", before: formatSourceYarn({ yarnWeight: yarn.sourceValue?.yarnWeight, yarnSamples: yarn.sourceValue?.yarnSamples }), after: formatProfileYarn(yarn.acceptedValue), why: "Выбранная пряжа сохранена как материал исполнимого плана и связана с обязательной подготовкой материалов.", practical: "Исходная пряжа остаётся справкой; вязать план нужно из подтверждённой пользовательской пряжи.", affectedActions: ["подготовка материалов"], basis: ["структурированный причинный след расчёта"] });
    const size = parameters.get("selected_size"); const chest = parameters.get("measurement.chest"); const ease = parameters.get("measurement.ease");
    let sourceVariant = size ? `Исходный и пользовательский размер проверены: ${parameterValue(size)}.` : "Размерный вариант сохранён в исходной ветке инструкции.";
    if (chest?.calculation?.exactResult && chest?.sourceValue) sourceVariant += ` Мерка груди ${formatNumberRu(chest.calculation.inputs?.[0]?.value)} см плюс свобода облегания ${formatNumberRu(chest.calculation.inputs?.[1]?.value)} см дают ${formatNumberRu(chest.calculation.exactResult)} см; готовая окружность выбранного размера — ${formatNumberRu(chest.sourceValue)} см.`;
    for (const decision of array(trace.parameterDecisions)) {
      if (decision.status === "UNCHANGED") {
        if (decision.semanticParameterId === "selected_size") unchanged.push(`Размер ${parameterValue(decision)} оставлен без изменения после проверки исходной и пользовательской ветки.`);
        if (decision.semanticParameterId === "measurement.chest") unchanged.push(`Обхват груди ${measurementText(decision)} вместе со свободой облегания проверен по готовой окружности выбранного размера.`);
        if (decision.semanticParameterId === "measurement.ease") unchanged.push(`Свобода облегания ${measurementText(decision)} учтена при проверке выбранного размера; отдельное изменение не потребовалось.`);
      }
      if (decision.status === "NOT_APPLICABLE") unchanged.push(`Параметр «${humanParameterLabel(decision.explanationKey)}» доказуемо неприменим к этой конструкции.`);
      if (decision.status === "UNSUPPORTED") addGap(humanParameterLabel(decision.explanationKey), `${measurementText(decision) || "Параметр принят"}, но текущий solver не поддерживает ${unsupportedFeatureLabel(decision.explanationKey)}. Это продуктовая блокирующая проблема, а не успешная адаптация.`);
      if (decision.status === "MISSING_EVIDENCE") addGap(humanParameterLabel(decision.explanationKey), missingEvidenceMessage(decision));
      if (decision.status === "CONFLICT") addGap(humanParameterLabel(decision.explanationKey), "Подтверждённые данные противоречат друг другу; успешная адаптация заблокирована.");
    }
    const countGroups = [
      { title: "Набор и начало кокетки", fields: [["castOn", "набор"], ["necklineIncreases", "прибавки горловины"], ["yokeStart", "после прибавок горловины"], ["yokeRepeats", "повторы реглана"], ["necklinePickup", "подъём петель отложенной горловины"]], actions: ["набор петель", "прибавки горловины", "прибавки реглана", "подъём петель отложенной горловины"], practical: "Эти числа задают набор, прибавки горловины, повторы реглана и обработку горловины." },
      { title: "Кокетка и разделение", fields: [["yokeFinal", "кокетка перед разделением"], ["front", "перед"], ["back", "спинка"], ["backCentre", "центр спинки"], ["sleeveHeld", "петли каждого рукава на удержании"], ["underarm", "петли каждого подреза"], ["body", "корпус"]], actions: ["прибавки реглана", "разметка центра спинки", "укороченные ряды", "разделение корпуса и рукавов"], practical: "Числа связаны формулами симметрии и сохранения петель с фактическим разделением кокетки." },
      { title: "Рукава и манжеты", fields: [["sleeveStart", "рукав после подъёма петель подреза"], ["sleeveDecreaseRepeats", "повторы убавок на каждом рукаве"], ["sleeveCycleRounds", "цикл между убавками"], ["cuff", "манжета"]], actions: ["подготовка рукава", "убавки рукава", "вязание без убавок", "манжета"], practical: "Числа задают старт рукава, количество и ритм убавок и манжету." },
    ];
    for (const group of countGroups) {
      const entries = group.fields.map(([field, label]) => [values.get(field), label]).filter(([entry]) => entry);
      const changed = entries.filter(([entry]) => Number(entry.sourceValue) !== Number(entry.result)); const same = entries.filter(([entry]) => Number(entry.sourceValue) === Number(entry.result));
      if (changed.length) changes.push({ title: group.title, before: changed.map(([entry, label]) => `${label}: ${formatNumberRu(entry.sourceValue)} ${entry.sourceUnit === "repeats" ? "повторов" : entry.sourceUnit === "rounds" ? "кругов" : "п."}`).join("; "), after: changed.map(([entry, label]) => `${label}: ${formatNumberRu(entry.result)} ${entry.resultUnit === "repeats" ? "повторов" : entry.resultUnit === "rounds" ? "кругов" : "п."}`).join("; "), why: gauge?.status === "USED" ? `Петли пересчитаны с ${formatGauge(gauge.sourceValue)} на ${formatGauge(gauge.acceptedValue)}. Затем сохранённые правила обеспечили симметрию переда и спинки, целые повторы реглана и сохранение петель между кокеткой, корпусом и рукавами.` : "Каждое значение сохранено вместе с применённым правилом, входами, результатом до округления и ссылками на исполнимые действия.", practical: group.practical, affectedActions: group.actions, basis: ["authoritative causal trace из solver/materialization"] });
      if (same.length) unchanged.push(`${group.title}: ${same.map(([entry, label]) => `${label}: ${formatNumberRu(entry.result)} ${entry.resultUnit === "repeats" ? "повторов" : entry.resultUnit === "rounds" ? "кругов" : "п."}`).join("; ")} проверено и оставлено без изменения.`);
    }
    const distribution = values.get("necklineIncreaseDistribution")?.executableDistribution;
    if (distribution) changes.push({ title: "Распределение прибавок горловины", before: `${distribution.inputStitches} исходные петли и ${distribution.increaseEventCount} прибавочных событий`, after: formatIncreaseDistribution(distribution), why: "Stage 21 сохранил quotient/remainder-распределение: число провязанных петель между соседними прибавками отличается не более чем на одну; каждая прибавка добавляет ровно одну петлю.", practical: `${distribution.inputStitches} + ${distribution.increaseEventCount} = ${distribution.outputStitches}; это одно исполнимое действие Stage 22, а не ${distribution.increaseEventCount} рядов.`, affectedActions: ["прибавки горловины"], basis: ["структурированное распределение Stage 21"] });
    for (const entry of array(trace.valueDecisions).filter((item) => item.field === "physicalMeasurement" && item.status === "UNCHANGED")) unchanged.push(`${measurementOperationLabel(entry.affectedOperationIdentities[0])} — ${formatNumberRu(entry.result)} ${unitLabel(entry.resultUnit)} проверено и оставлено без изменения.`);
    const branches = array(trace.parameterDecisions).filter((entry) => entry.semanticParameterId.startsWith("branch.") && entry.status === "USED").map((entry) => { const group = entry.semanticParameterId.slice(7); const known = BRANCH_LABELS[group]; return known?.options?.[entry.acceptedValue] ? `${known.label} — ${known.options[entry.acceptedValue]}` : null; }).filter(Boolean);
    if (branches.length) changes.push({ title: "Выбранные варианты инструкции", before: "В исходной инструкции предусмотрены взаимоисключающие варианты выполнения.", after: branches.join("; "), why: "Исполнимый граф материализован только из подтверждённых вариантов.", practical: "Повторный выбор внутри шагов не требуется.", affectedActions: branches, basis: ["структурированный причинный след выбранных веток"] });
    const changedValues = array(trace.valueDecisions).filter((entry) => Number.isFinite(Number(entry.sourceValue)) && Number.isFinite(Number(entry.result)) && Number(entry.sourceValue) !== Number(entry.result));
    const unchangedValues = array(trace.valueDecisions).filter((entry) => entry.status === "UNCHANGED");
    return deepFreeze({ status: trace.productBlockers.length || gaps.length ? "partial" : "complete", heading: "Что изменилось в вашей инструкции", intro: "Каждое объяснение ниже построено только из сохранённого причинного следа solver/materialization; экран не выводит причины из совпадения чисел.", sourceVariant, changes, unchanged: [...new Set(unchanged)], gaps, operationCoverage: { total: trace.valueDecisions.length, explained: changedValues.length, unchanged: unchangedValues.length, gaps: trace.coverage.uncoveredChangedValues.length, complete: trace.coverage.complete } });
  }

  function humanParameterLabel(key) { return ({ waist: "Мерка «обхват талии»", hips: "Мерка «обхват бёдер»", total_length: "Мерка «желаемая общая длина»", yarn_quantity: "Количество пряжи", selected_size: "Размер", chest: "Обхват груди", ease: "Свобода облегания", unknown_measurement: "Неизвестная мерка" })[key] || "Параметр адаптации"; }
  function unsupportedFeatureLabel(key) { return ({ waist: "формирование талии", hips: "формирование нижней части изделия по бёдрам", yarn_quantity: "надёжный расчёт расхода пряжи" })[key] || "эту адаптацию"; }
  function missingEvidenceMessage(decision) {
    if (decision.explanationKey === "total_length") return `${measurementTextForDecision(decision)} сохранено, и плотность рядов известна, но нет авторитетного разложения общей длины на кокетку, корпус и резинку. Ряды не выдумываются.`;
    if (decision.explanationKey === "yarn_quantity") return "Известны характеристики пряжи, но нет подтверждённых исходного расхода выбранного размера, метража одного мотка и алгоритма адаптированного расхода. Линейная пропорция по петлям не применяется.";
    return "Для решения не хватает точно перечисленных авторитетных данных; догадка не подставляется.";
  }
  function measurementTextForDecision(decision) { return decision?.acceptedValue?.value ? `Значение ${formatNumberRu(decision.acceptedValue.value)} ${unitLabel(decision.acceptedValue.unit)}` : "Значение"; }
  function formatIncreaseDistribution(distribution) {
    const group = distribution.repeatedGroup; const formatIntervals = (items) => array(items).map((value) => `${value} лиц., M1`).join(", ");
    const repeated = group?.repeatCount ? `повторить ${group.repeatCount} раз [${formatIntervals(group.intervals)}]` : "";
    const tail = array(distribution.trailingIntervals).length ? `${repeated ? ", затем " : ""}[${formatIntervals(distribution.trailingIntervals)}]` : "";
    return `${repeated}${tail}; использованы все ${distribution.inputStitches} петель, выполнено ${distribution.increaseEventCount} прибавок, итог ${distribution.outputStitches} петель`;
  }

  function buildPostHocAdaptationExplanation(input) {
    const gaps = []; const changes = []; const unchanged = [];
    const source = object(input?.evidence?.sourcePatternEvidence?.facts) || {};
    const profile = object(input?.evidence?.userAdaptationProfile) || {};
    const execution = object(input?.adaptedExecution) || {};
    const solver = object(execution?.solver) || {}; const chosen = object(solver?.chosenCandidate) || {}; const sourceCounts = object(execution?.sourceCounts) || {};
    const sourceGauge = firstGauge({ facts: source }, "rounds") || firstGauge({ facts: source }, "rows");
    const targetGauge = adaptationGauge(profile);
    const addGap = (area, message) => { if (!gaps.some((entry) => entry.area === area && entry.message === message)) gaps.push({ area, message }); };
    const addChange = (entry) => {
      if (canonicalizeSafe(entry.before) === canonicalizeSafe(entry.after)) return;
      changes.push({ title: entry.title, before: entry.before, after: entry.after, why: entry.why, practical: entry.practical, affectedActions: stableStrings(entry.affectedActions), basis: stableStrings(entry.basis) });
    };

    if (!input) addGap("Объяснение", "Сохранённый вход технологического плана отсутствует, поэтому сравнение построить нельзя.");
    if (!Object.keys(source).length) addGap("Исходная инструкция", "Не найдены подтверждённые исходные данные инструкции.");
    if (!Object.keys(profile).length) addGap("Параметры пользователя", "Не найден подтверждённый профиль адаптации пользователя.");
    if (!execution || solver?.status !== "calculated" || !Object.keys(chosen).length) addGap("Расчёт петель", "Нет сохранённого завершённого расчёта, поэтому нельзя доказать новые количества петель.");

    const sourceSize = text(source.selectedSize || source.finishedMeasurement?.sizeLabel);
    const targetSize = text(profile.selectedSize?.value ?? profile.selectedSize);
    const sourceMeasurement = formatMeasurement(source.finishedMeasurement);
    const measurements = new Map(array(profile.measurements).map((entry) => [text(entry?.kind).toLowerCase(), entry]));
    const chest = positiveNumber(measurements.get("chest")?.value); const ease = positiveNumber(measurements.get("ease")?.value);
    const finishedChestCm = positiveNumber(source.finishedMeasurement?.cm);
    const sizeRelation = chest && ease && finishedChestCm
      ? ` Подтверждённая мерка груди ${formatNumberRu(chest)} см плюс свобода облегания ${formatNumberRu(ease)} см дают ${formatNumberRu(chest + ease)} см${Math.abs(chest + ease - finishedChestCm) < 0.01 ? " — ровно готовую окружность этого размера" : `; это не совпадает с готовой окружностью ${formatNumberRu(finishedChestCm)} см`}.`
      : "";
    const sourceVariant = sourceSize ? `В исходной инструкции выбран размер ${sourceSize}${sourceMeasurement ? ` (${sourceMeasurement})` : ""}.${sizeRelation}` : "Исходный размер не доказан.";
    if (!sourceSize) addGap("Исходный размер", "В подтверждённых данных не указан выбранный размер исходной инструкции.");
    if (!targetSize) addGap("Размер пользователя", "В профиле адаптации не указан подтверждённый размер пользователя.");
    if (sourceSize && targetSize && sourceSize === targetSize) unchanged.push(`Размер ${sourceSize} оставлен без изменения.${sizeRelation}`);
    else if (sourceSize && targetSize) addChange({
      title: "Размерный вариант", before: `размер ${sourceSize}`, after: `размер ${targetSize}`,
      why: "В профиле пользователя подтверждён другой размерный вариант, поэтому план использует его вместо исходно выбранного.",
      practical: "Все размерные числа в исполнимых шагах берутся из подтверждённой ветки нового размера.",
      affectedActions: ["выбор размерной ветки инструкции"], basis: ["подтверждённая исходная инструкция", "подтверждённый профиль пользователя"],
    });

    if (sourceGauge && targetGauge) addChange({
      title: "Плотность вязания", before: formatGauge(sourceGauge), after: formatGauge(targetGauge),
      why: `Расчёт использует подтверждённую плотность пользователя ${formatGauge(targetGauge)} вместо исходной ${formatGauge(sourceGauge)}`,
      practical: "Количество петель пересчитано так, чтобы сохранить приблизительную ширину соответствующих участков исходного размера при другой плотности. Мерки, которые расчёт не использовал, перечислены ниже как разрывы.",
      affectedActions: ["набор петель", "прибавки кокетки", "разделение корпуса и рукавов", "формирование рукавов"],
      basis: ["плотность из исходной инструкции", "подтверждённая плотность пользователя", "сохранённый расчёт"],
    });
    else addGap("Плотность", "Нужны обе подтверждённые плотности — исходная и пользовательская; без них причина пересчёта не доказана.");

    const sourceNeedles = array(source.needles).filter((value) => Number.isFinite(Number(value))).map(Number);
    const targetNeedles = array(profile.needles).map((entry) => Number(entry?.canonicalValue)).filter(Number.isFinite);
    if (sourceNeedles.length && targetNeedles.length) addChange({
      title: "Спицы", before: formatNumberList(sourceNeedles, "мм"), after: formatNumberList(targetNeedles, "мм"),
      why: "В профиле пользователя подтверждён другой набор спиц; он заменяет размеры спиц из исходной инструкции.",
      practical: "В шагах плана явно указаны меньшие и большие спицы из пользовательского набора.",
      affectedActions: ["набор петель", "основное полотно", "резинка"], basis: ["спицы из исходной инструкции", "подтверждённые спицы пользователя"],
    });
    else addGap("Спицы", "Не найдена доказанная пара: спицы из исходной инструкции и подтверждённые спицы пользователя.");

    const sourceYarn = formatSourceYarn(source); const targetYarn = formatProfileYarn(profile.yarn);
    if (sourceYarn && targetYarn) addChange({
      title: "Пряжа", before: sourceYarn, after: targetYarn,
      why: "Подтверждённая пряжа пользователя заменяет примеры и характеристики пряжи из исходной инструкции.",
      practical: "Подготовить нужно именно пользовательскую пряжу; исходные марки остаются справочной частью инструкции.",
      affectedActions: ["подготовка материалов"], basis: ["пряжа из исходной инструкции", "подтверждённая пряжа пользователя"],
    });
    else addGap("Пряжа", "Не найдена доказанная пара исходной и пользовательской пряжи.");
    if (targetYarn && !positiveNumber(profile.yarn?.quantity ?? profile.yarn?.skeins)) addGap("Количество пряжи", "В структурированном профиле Stage 21 нет подтверждённого количества мотков. Его нельзя извлекать повторно из сырого текста или подставлять по умолчанию.");

    for (const [kind, label] of [["waist", "обхват талии"], ["hips", "обхват бёдер"], ["total_length", "желаемая общая длина"]]) {
      const measurement = measurements.get(kind);
      if (positiveNumber(measurement?.value)) addGap(`Мерка «${label}»`, `Подтверждённое значение ${formatNumberRu(measurement.value)} ${unitLabel(measurement.unit)} сохранено в профиле, но Stage 21 не содержит формулы или шага, связывающего эту мерку с адаптированным планом.`);
    }

    const gaugeCause = sourceGauge && targetGauge
      ? `Петли пересчитаны с ${formatGauge(sourceGauge)} на ${formatGauge(targetGauge)}. Затем расчёт сохранил симметрию переда и спинки, целые повторы реглана, баланс корпуса и рукавов и чётные рабочие количества.`
      : "Причина изменения петель не доказана: отсутствует пара исходной и пользовательской плотности.";
    const sourceComparison = { ...sourceCounts }; const adaptedComparison = { ...chosen };
    const sleeveSchedule = object(execution?.sleeveSchedule) || {};
    if (positiveInteger(sourceCounts.yokeStart) && positiveInteger(sourceCounts.castOn)) sourceComparison.necklineIncreases = sourceCounts.yokeStart - sourceCounts.castOn;
    if (positiveInteger(chosen.yokeStart) && positiveInteger(chosen.castOn)) adaptedComparison.necklineIncreases = chosen.yokeStart - chosen.castOn;
    if (positiveInteger(sourceCounts.front)) { sourceComparison.back = sourceCounts.front; sourceComparison.backCentre = sourceCounts.front / 2; }
    if (positiveInteger(chosen.back)) { adaptedComparison.back = chosen.back; adaptedComparison.backCentre = chosen.back / 2; }
    if (positiveInteger(sourceCounts.castOn)) sourceComparison.necklinePickup = sourceCounts.castOn;
    if (positiveInteger(chosen.castOn)) adaptedComparison.necklinePickup = chosen.castOn;
    if (positiveInteger(sourceCounts.sleeveStart) && positiveInteger(sourceCounts.cuff) && (sourceCounts.sleeveStart - sourceCounts.cuff) % 2 === 0) sourceComparison.sleeveDecreaseRepeats = (sourceCounts.sleeveStart - sourceCounts.cuff) / 2;
    if (positiveInteger(sleeveSchedule.decreaseRepeats)) adaptedComparison.sleeveDecreaseRepeats = sleeveSchedule.decreaseRepeats;
    if (positiveInteger(sleeveSchedule.sourceCycleRounds)) sourceComparison.sleeveCycleRounds = sleeveSchedule.sourceCycleRounds;
    if (positiveInteger(sleeveSchedule.decreaseCycleRounds)) adaptedComparison.sleeveCycleRounds = sleeveSchedule.decreaseCycleRounds;
    const coveredCountFields = new Set();
    const countGroups = [
      { title: "Набор и начало кокетки", fields: [["castOn", "набор"], ["necklineIncreases", "прибавки горловины"], ["yokeStart", "после прибавок горловины"], ["yokeRepeats", "повторы реглана"], ["necklinePickup", "подъём петель отложенной горловины"]], actions: ["набор петель", "прибавки горловины", "прибавки реглана", "подъём петель отложенной горловины"], practical: "Эти числа задают набор, общее число прибавок горловины, количество повторов реглана и повторное использование наборного края при обработке горловины." },
      { title: "Кокетка и разделение", fields: [["yokeFinal", "кокетка перед разделением"], ["front", "перед"], ["back", "спинка"], ["backCentre", "центр спинки"], ["sleeveHeld", "петли каждого рукава на удержании"], ["underarm", "петли каждого подреза"], ["body", "корпус"]], actions: ["прибавки реглана", "разметка центра спинки", "укороченные ряды", "разделение корпуса и рукавов"], practical: "По этим числам проверяются симметрия переда и спинки, точный центр спинки для укороченных рядов, разделение петель и итоговое количество петель корпуса." },
      { title: "Рукава и манжеты", fields: [["sleeveStart", "рукав после подъёма петель подреза"], ["sleeveDecreaseRepeats", "повторы убавок на каждом рукаве"], ["sleeveCycleRounds", "цикл между убавками"], ["cuff", "манжета"]], actions: ["подготовка рукава", "убавки рукава", "вязание без убавок", "резинка", "закрытие петель"], practical: "Эти числа задают старт рукава, число и ритм убавок и количество петель перед манжетой." },
    ];
    if (execution && solver?.status === "calculated") for (const group of countGroups) {
      const missing = group.fields.filter(([field]) => !positiveInteger(sourceComparison[field]) || !positiveInteger(adaptedComparison[field]));
      if (missing.length) { addGap(group.title, `Не хватает исходного или адаптированного значения для: ${missing.map(([, label]) => label).join(", ")}.`); continue; }
      group.fields.forEach(([field]) => coveredCountFields.add(field));
      const changedFields = group.fields.filter(([field]) => sourceComparison[field] !== adaptedComparison[field]);
      const sameFields = group.fields.filter(([field]) => sourceComparison[field] === adaptedComparison[field]);
      if (changedFields.length) addChange({
        title: group.title,
        before: formatCountFields(changedFields, sourceComparison), after: formatCountFields(changedFields, adaptedComparison), why: gaugeCause,
        practical: group.practical, affectedActions: group.actions, basis: ["выбранные числа исходной инструкции", "подтверждённая плотность пользователя", "сохранённый расчёт с вязальными ограничениями"],
      });
      if (sameFields.length) unchanged.push(`${group.title}: ${formatCountFields(sameFields, adaptedComparison)} оставлено без изменения.`);
    }
    if (sourceComparison.necklineIncreases !== adaptedComparison.necklineIncreases) addGap("Распределение прибавок горловины", `Stage 21 доказывает изменение общего числа прибавок с ${formatNumberRu(sourceComparison.necklineIncreases)} до ${formatNumberRu(adaptedComparison.necklineIncreases)}, но не хранит исполнимое распределение этих прибавок по исходным петлям.`);

    const branches = array(input?.branchSelection?.selectedOptions).map((entry) => {
      const known = BRANCH_LABELS[entry?.groupId];
      return known && known.options[entry?.selectedOptionId] ? `${known.label} — ${known.options[entry.selectedOptionId]}` : null;
    }).filter(Boolean);
    const unknownBranchCount = array(input?.branchSelection?.selectedOptions).length - branches.length;
    if (branches.length) changes.push({
      title: "Выбранные варианты инструкции", before: "В исходной инструкции предусмотрены взаимоисключающие варианты выполнения.", after: branches.join("; "),
      why: "Для плана использованы только варианты, явно подтверждённые в сохранённых данных; остальные варианты не исполняются.",
      practical: "Вязальщице не нужно выбирать вариант внутри шагов: порядок уже соответствует подтверждённым решениям.",
      affectedActions: ["обработка горловины", "укороченные ряды", "длина корпуса", "длина рукавов"], basis: ["подтверждённый выбор веток исходной инструкции"],
    });
    if (unknownBranchCount > 0) addGap("Выбранные варианты", `Для ${unknownBranchCount} подтверждённых вариантов нет понятного русского названия; они не скрыты под общим успешным статусом.`);

    const operationCoverage = { total: 0, explained: 0, unchanged: 0, gaps: 0, complete: true };
    const executableFieldByIdentity = { "execution:cast-on": "castOn", "execution:neckline-increase": "yokeStart" };
    for (const operation of array(execution?.operations)) {
      const executableValue = object(operation?.executableValue);
      if (Number.isFinite(Number(executableValue?.sourceValue)) && Number.isFinite(Number(executableValue?.adaptedValue))) {
        operationCoverage.total += 1;
        const field = executableFieldByIdentity[operation.identity];
        if (Number(executableValue.sourceValue) === Number(executableValue.adaptedValue)) operationCoverage.unchanged += 1;
        else if (field && coveredCountFields.has(field)) operationCoverage.explained += 1;
        else if (text(executableValue.derivationIdentity) && sourceGauge && targetGauge) {
          addChange({
            title: `Изменение шага: ${userOperationLabel(operation.kind)}`, before: `${formatNumberRu(executableValue.sourceValue)} ${unitLabel(executableValue.sourceUnit)}`, after: `${formatNumberRu(executableValue.adaptedValue)} ${unitLabel(executableValue.adaptedUnit)}`,
            why: gaugeCause, practical: `Новое значение используется в действии «${userOperationLabel(operation.kind)}».`, affectedActions: [userOperationLabel(operation.kind)], basis: ["подтверждённое исходное значение", "подтверждённая плотность пользователя", "сохранённый расчёт"],
          });
          operationCoverage.explained += 1;
        } else {
          addGap(`Действие «${userOperationLabel(operation.kind)}»`, `Было ${formatNumberRu(executableValue.sourceValue)}, стало ${formatNumberRu(executableValue.adaptedValue)}, но сохранённой причины изменения недостаточно.`);
          operationCoverage.gaps += 1;
        }
      }
      const physical = object(operation?.physicalCondition);
      if (Number.isFinite(Number(physical?.sourceValue)) && Number.isFinite(Number(physical?.adaptedValue))) {
        operationCoverage.total += 1;
        if (Number(physical.sourceValue) === Number(physical.adaptedValue)) operationCoverage.unchanged += 1;
        else {
          addGap(measurementOperationLabel(operation.identity), `Было ${formatNumberRu(physical.sourceValue)} ${unitLabel(physical.unit)}, стало ${formatNumberRu(physical.adaptedValue)} ${unitLabel(physical.unit)}, но в сохранённых данных нет доказанной причины изменения.`);
          operationCoverage.gaps += 1;
        }
      }
    }
    operationCoverage.complete = operationCoverage.total === operationCoverage.explained + operationCoverage.unchanged + operationCoverage.gaps;
    const preservedMeasurements = array(execution?.operations).filter((entry) => entry?.physicalCondition && Number(entry.physicalCondition.sourceValue) === Number(entry.physicalCondition.adaptedValue)).map((entry) => `${measurementOperationLabel(entry.identity)} — ${formatNumberRu(entry.physicalCondition.adaptedValue)} ${unitLabel(entry.physicalCondition.unit)}`);
    for (const value of [...new Set(preservedMeasurements)]) unchanged.push(`${value} оставлено без изменения.`);

    if (!changes.length) addGap("Изменения", "Не найдено ни одного доказанного изменения между исходными и адаптированными значениями.");
    return deepFreeze({
      status: gaps.length ? "partial" : "complete",
      heading: "Что изменилось в вашей инструкции",
      intro: "Здесь показаны только изменения, которые можно доказать по сохранённой инструкции, подтверждённым параметрам и расчёту.",
      sourceVariant, changes, unchanged: [...new Set(unchanged)], gaps, operationCoverage,
    });
  }

  function formatGauge(gauge) {
    const rowValue = positiveNumber(gauge?.rows ?? gauge?.rounds); const rowLabel = gauge?.rows ? "р." : "круг.";
    if (!positiveNumber(gauge?.stitches) || !positiveNumber(gauge?.per) || !text(gauge?.unit)) return "не доказано";
    return `${formatNumberRu(gauge.stitches)} п. × ${rowValue ? `${formatNumberRu(rowValue)} ${rowLabel} ` : ""}на ${formatNumberRu(gauge.per)} ${unitLabel(gauge.unit)}`;
  }
  function formatMeasurement(value) { const cm = positiveNumber(value?.cm); const inches = positiveNumber(value?.in); return cm ? `${formatNumberRu(cm)} см${inches ? ` / ${formatNumberRu(inches)} дюйм.` : ""}` : inches ? `${formatNumberRu(inches)} дюйм.` : ""; }
  function formatNumberRu(value) { return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 }); }
  function formatNumberList(values, unit) { return values.map((value) => `${formatNumberRu(value)} ${unit}`).join(" и "); }
  function unitLabel(unit) { const normalized = text(unit).toLowerCase(); return ["in", "inch", "inches"].includes(normalized) ? "дюйм." : normalized === "cm" ? "см" : normalized === "mm" ? "мм" : normalized === "m" ? "м" : normalized === "g" ? "г" : text(unit); }
  function formatCountFields(fields, values) { return fields.map(([field, label]) => `${label}: ${formatNumberRu(values[field])}${field.toLowerCase().includes("repeats") ? " повторов" : field.toLowerCase().includes("rounds") ? " кругов" : " п."}`).join("; "); }
  function formatSourceYarn(source) {
    const parts = [...array(source?.yarnWeight).map(String), ...array(source?.yarnSamples).map(String)].filter(Boolean);
    return [...new Set(parts)].join("; ");
  }
  function formatProfileYarn(yarn) {
    const parts = [
      ...array(yarn?.names).map((entry) => text(entry?.value ?? entry)),
      ...array(yarn?.fibre ?? yarn?.fiberContent).map((entry) => text(entry?.value ?? entry)),
      ...array(yarn?.weight ?? yarn?.weights).map((entry) => text(entry?.value ?? entry)),
      ...array(yarn?.lengthOrWeight ?? yarn?.amounts).map((entry) => Number.isFinite(Number(entry?.value)) ? `${formatNumberRu(entry.value)} ${unitLabel(entry.unit)}` : ""),
    ].filter(Boolean);
    if (positiveNumber(yarn?.quantity)) parts.push(`${formatNumberRu(yarn.quantity)} мотков`);
    return [...new Set(parts)].join("; ");
  }
  function measurementOperationLabel(identity) {
    const labels = {
      "execution:yoke-depth": "глубина кокетки", "execution:body-measure": "длина корпуса", "execution:body-ribbing": "резинка корпуса",
      "execution:right-sleeve-initial-length": "начало убавок правого рукава", "execution:left-sleeve-initial-length": "начало убавок левого рукава",
      "execution:right-sleeve-to-target": "длина правого рукава", "execution:left-sleeve-to-target": "длина левого рукава",
      "execution:right-cuff": "манжета правого рукава", "execution:left-cuff": "манжета левого рукава", "execution:neckline-ribbing": "резинка горловины",
    };
    return labels[identity] || "контрольная длина";
  }

  function validateSequentialExecution(execution, expected = {}) {
    const errors = []; const operations = array(execution?.operations);
    const add = (code, operationIdentity = null, message = code) => errors.push({ code, operationIdentity, message });
    if (!operations.length) add("EXECUTION_OPERATIONS_MISSING");
    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index]; const change = operation.change;
      if (!object(operation.inputState) || !object(operation.outputState)) add("EXECUTION_STATE_MISSING", operation.identity);
      if (![change?.input, change?.delta, change?.repeatCount, change?.output].every((value) => Number.isInteger(value))) add("EXECUTION_COUNT_MISSING", operation.identity);
      else if (change.input + change.delta * change.repeatCount !== change.output || operation.inputState?.totalStitches !== change.input || operation.outputState?.totalStitches !== change.output) add("EXECUTION_COUNT_TRANSITION_INVALID", operation.identity);
      if (index > 0 && canonicalize(operations[index - 1].outputState) !== canonicalize(operation.inputState)) add("EXECUTION_SEQUENTIAL_STATE_MISMATCH", operation.identity);
    }
    if (execution.evidenceFingerprint !== expected.binding?.sourceInstructionEvidenceFingerprint) add("EXECUTION_EVIDENCE_STALE");
    if (execution.solverIdentity !== expected.solverIdentity || execution.solverFingerprint !== expected.solverFingerprint) add("EXECUTION_SOLVER_STALE");
    if (execution.branchFingerprint !== expected.branchResolution?.fingerprint) add("EXECUTION_BRANCH_STALE");
    if (array(execution.shortRows).length !== 12) add("SHORT_ROW_EXPANSION_INCOMPLETE");
    return { isValid: errors.length === 0, errors };
  }

  function instructionNumericProvenance(entry, path, binding) {
    return array(entry?.numericValues).filter((value) => value.selectionStatus === "selected" && Number.isFinite(Number(value.normalizedValue))).map((value, index) => ({
      path: `${path}.numericValues.${index}`, provenance: "SOURCE_SIZE_SELECTED", value: Number(value.normalizedValue), unit: value.unit ?? null,
      rawSizeVector: value.rawSizeVector, canonicalSizeOrder: copy(value.canonicalSizeOrder), selectedSizeLabel: value.selectedSizeLabel, selectedSizeIndex: value.selectedSizeIndex,
      sourceProvenanceRefs: stableStrings(entry.sourceEvidenceIdentities), evidenceBinding: numberEvidenceBinding(binding),
    }));
  }

  function calculateAdaptedCount(sourceCount, sourceGauge, adaptationGauge, roundingPolicy = "NEAREST_INTEGER_HALF_UP", evidenceBinding = null) {
    const sourcePerCm = gaugePerCm(sourceGauge); const adaptationPerCm = gaugePerCm(adaptationGauge);
    if (!positiveInteger(sourceCount) || !sourcePerCm || !adaptationPerCm || !evidenceBinding) return { value: null, provenance: unresolvedNumber("adaptedCount", "AUTHORITATIVE_COUNT_OR_GAUGE_MISSING", evidenceBinding) };
    const exact = sourceCount * adaptationPerCm / sourcePerCm;
    const result = roundNumber(exact, roundingPolicy);
    return { value: result, provenance: { path: "adaptedCount", provenance: "ADAPTATION_CALCULATED", inputs: [{ name: "sourceCount", value: sourceCount, unit: "stitches" }, { name: "sourceGauge", value: sourceGauge.stitches, unit: `stitches/${sourceGauge.per} ${sourceGauge.unit}` }, { name: "adaptationGauge", value: adaptationGauge.stitches, unit: `stitches/${adaptationGauge.per} ${adaptationGauge.unit}` }], formula: "sourceCount × adaptationStitchesPerCm ÷ sourceStitchesPerCm", algorithmId: "gauge-ratio-stitch-adaptation:v1", roundingPolicy, exactResult: exact, result, unit: "stitches", evidenceBinding: copy(evidenceBinding) } };
  }

  function calculateAdaptedRowCount(sourceRowCount, sourceRowGauge, adaptationRowGauge, roundingPolicy = "NEAREST_INTEGER_HALF_UP", evidenceBinding = null) {
    const sourcePerCm = rowGaugePerCm(sourceRowGauge); const adaptationPerCm = rowGaugePerCm(adaptationRowGauge);
    if (!positiveInteger(sourceRowCount) || !sourcePerCm || !adaptationPerCm || !evidenceBinding) return { value: null, provenance: unresolvedNumber("adaptedRowCount", "AUTHORITATIVE_ROW_COUNT_OR_GAUGE_MISSING", evidenceBinding) };
    const exact = sourceRowCount * adaptationPerCm / sourcePerCm;
    const result = roundNumber(exact, roundingPolicy);
    return { value: result, provenance: { path: "adaptedRowCount", provenance: "ADAPTATION_CALCULATED", inputs: [{ name: "sourceRowCount", value: sourceRowCount, unit: "rows" }, { name: "sourceRowGauge", value: sourceRowGauge.rows, unit: `rows/${sourceRowGauge.per} ${sourceRowGauge.unit}` }, { name: "adaptationRowGauge", value: adaptationRowGauge.rows, unit: `rows/${adaptationRowGauge.per} ${adaptationRowGauge.unit}` }], formula: "sourceRowCount × adaptationRowsPerCm ÷ sourceRowsPerCm", algorithmId: "gauge-ratio-row-adaptation:v1", roundingPolicy, exactResult: exact, result, unit: "rows", evidenceBinding: copy(evidenceBinding) } };
  }

  function rowGaugePerCm(gauge) {
    const rows = positiveNumber(gauge?.rows); const per = positiveNumber(gauge?.per); const unit = text(gauge?.unit).toLowerCase();
    if (!rows || !per) return null;
    if (unit === "cm") return rows / per;
    if (unit === "in" || unit === "inch" || unit === "inches") return rows / (per * 2.54);
    return null;
  }

  function planTwoPhaseBodyTaper(replay, gauge, input) {
    if (!replay?.valid || gauge?.unit !== "cm" || !(gauge.stitches > 0 && gauge.rows > 0 && gauge.per > 0)) return null;
    const fields = ["chest", "belt", "hips", "finishedChest", "minHem", "maxHem"];
    if (fields.some((field) => !Number.isFinite(input?.[field]) || input[field] <= 0 || input[field] > 400)) return null;
    const f = replay.facts;
    const perCm = gauge.stitches / gauge.per;
    const chestCm = f.bodyStart / perCm;
    if (input.minHem > input.maxHem || Math.abs(chestCm - input.finishedChest) > 1 / perCm) return null;
    const bodyRounds = Math.round((f.hemStartCm - f.yokeCm) * gauge.rows / gauge.per);
    const first = Math.max(1, Math.round(f.firstDecreaseCm * gauge.rows / gauge.per));
    const last = bodyRounds - 1;
    const options = [];
    for (let n = 1; n <= Math.floor((f.bodyStart - 1) / f.bodyLoss); n++) {
      const plain = f.bodyStart - f.bodyLoss * n;
      const width = plain / perCm;
      if (width < input.minHem || width > input.maxHem || first > last) continue;
      if (n > 1 && (last - first) / (n - 1) < 2) continue;
      const rounds = Array.from({ length: n }, (_, i) => n === 1 ? first : first + Math.round((last - first) * i / (n - 1)));
      const rib = 2 * Math.round(plain * f.hem / f.preHem / 2);
      if (rib < plain || rib - plain > plain) continue;
      options.push({ plain, width, rounds, rib, gain: rib - plain, totalRemoved: f.bodyStart - plain, extraRemoved: f.preHem - plain });
    }
    return { chestCm, ease: input.finishedChest - input.chest, bodyRounds, options };
  }

  function calculateConstraintAwareTopDownCounts(input, evidenceBinding = null) {
    const source = object(input?.sourceCounts) || {};
    const required = ["castOn", "yokeStart", "yokeFinal", "front", "sleeveHeld", "underarm", "body", "sleeveStart", "cuff", "yokeRepeats"];
    const missingFields = required.filter((field) => !positiveInteger(source[field]));
    const sourcePerCm = gaugePerCm(input?.sourceGauge); const adaptationPerCm = gaugePerCm(input?.adaptationGauge);
    if (!sourcePerCm) missingFields.push("sourceGauge");
    if (!adaptationPerCm) missingFields.push("adaptationGauge");
    if (!positiveInteger(input?.raglanDeltaPerRepeat)) missingFields.push("raglanDeltaPerRepeat");
    if (!evidenceBinding) missingFields.push("evidenceBinding");
    if (missingFields.length) return { status: "unresolved", algorithmId: "constraint-aware-top-down-counts:v1", missingFields: [...new Set(missingFields)], candidatesEvaluated: 0, chosenCandidate: null, numericProvenance: [] };
    const ratio = adaptationPerCm / sourcePerCm;
    const raglanDeltaPerRepeat = positiveInteger(input.raglanDeltaPerRepeat);
    const evenCandidates = (value, radius = 8) => {
      const center = Math.max(2, Math.round(value * ratio)); const values = [];
      for (let candidate = Math.max(2, center - radius); candidate <= center + radius; candidate += 1) if (candidate % 2 === 0) values.push(candidate);
      return values;
    };
    const scoreField = (candidate, field) => { const sourceValue = field === "back" ? source.front : source[field]; return Math.pow((candidate - sourceValue * ratio) / Math.max(1, sourceValue * ratio), 2); };
    const candidates = [];
    for (const front of evenCandidates(source.front)) for (const sleeveHeld of evenCandidates(source.sleeveHeld)) for (const underarm of evenCandidates(source.underarm, 6)) {
      const yokeFinal = 2 * front + 2 * sleeveHeld;
      const body = 2 * front + 2 * underarm;
      const sleeveStart = sleeveHeld + underarm;
      for (const castOn of evenCandidates(source.castOn, 6)) for (const cuff of evenCandidates(source.cuff, 6)) {
        const idealStart = Math.round(source.yokeStart * ratio);
        const possibleStarts = [];
        for (let yokeStart = Math.max(castOn, idealStart - raglanDeltaPerRepeat * 2); yokeStart <= Math.min(yokeFinal - raglanDeltaPerRepeat, idealStart + raglanDeltaPerRepeat * 2); yokeStart += 1) {
          if ((yokeFinal - yokeStart) % raglanDeltaPerRepeat === 0) possibleStarts.push(yokeStart);
        }
        for (const yokeStart of possibleStarts) {
          const yokeRepeats = (yokeFinal - yokeStart) / raglanDeltaPerRepeat;
          if (!positiveInteger(yokeRepeats)) continue;
          const candidate = { castOn, yokeStart, yokeFinal, front, back: front, sleeveHeld, underarm, body, sleeveStart, cuff, yokeRepeats };
          candidate.score = ["castOn", "yokeStart", "yokeFinal", "front", "sleeveHeld", "underarm", "body", "sleeveStart", "cuff", "yokeRepeats"].reduce((total, field) => total + scoreField(candidate[field], field), 0);
          candidates.push(candidate);
        }
      }
    }
    candidates.sort((left, right) => left.score - right.score || canonicalize(left).localeCompare(canonicalize(right)));
    const chosen = candidates[0] || null;
    if (!chosen) return { status: "unresolved", algorithmId: "constraint-aware-top-down-counts:v1", missingFields: ["constraintSolution"], candidatesEvaluated: 0, chosenCandidate: null, numericProvenance: [] };
    const constraints = [
      { id: "front_back_symmetry", formula: "front = back", satisfied: chosen.front === chosen.back },
      { id: "yoke_conservation", formula: "yokeFinal = front + back + 2 × sleeveHeld", satisfied: chosen.yokeFinal === chosen.front + chosen.back + 2 * chosen.sleeveHeld },
      { id: "body_conservation", formula: "body = front + back + 2 × underarm", satisfied: chosen.body === chosen.front + chosen.back + 2 * chosen.underarm },
      { id: "sleeve_pickup_conservation", formula: "sleeveStart = sleeveHeld + underarm", satisfied: chosen.sleeveStart === chosen.sleeveHeld + chosen.underarm },
      { id: "raglan_repeat_conservation", formula: "yokeFinal = yokeStart + raglanDeltaPerRepeat × yokeRepeats", satisfied: chosen.yokeFinal === chosen.yokeStart + raglanDeltaPerRepeat * chosen.yokeRepeats },
      { id: "even_working_counts", formula: "castOn, body, sleeves and cuff are even", satisfied: [chosen.castOn, chosen.body, chosen.sleeveStart, chosen.cuff].every((value) => value % 2 === 0) },
    ];
    const numericProvenance = Object.entries(chosen).filter(([field]) => field !== "score").map(([field, result]) => {
      const sourceField = field === "back" ? "front" : field;
      const sourceValue = source[sourceField] ?? null;
      const gaugeScaledTarget = Number.isFinite(Number(sourceValue)) ? Number(sourceValue) * ratio : null;
      return {
        path: `adaptationConstraintSolution.${field}`, provenance: "ADAPTATION_CALCULATED", inputs: [{ name: `sourceCounts.${sourceField}`, value: sourceValue, unit: field === "yokeRepeats" ? "repeats" : "stitches" }, { name: "sourceGauge", value: input.sourceGauge.stitches, unit: `stitches/${input.sourceGauge.per} ${input.sourceGauge.unit}` }, { name: "adaptationGauge", value: input.adaptationGauge.stitches, unit: `stitches/${input.adaptationGauge.per} ${input.adaptationGauge.unit}` }],
        formula: field === "yokeFinal" ? "front + back + 2 × sleeveHeld" : field === "back" ? "back = front" : field === "body" ? "front + back + 2 × underarm" : field === "sleeveStart" ? "sleeveHeld + underarm" : field === "yokeRepeats" ? "(yokeFinal - yokeStart) ÷ raglanDeltaPerRepeat" : "select the globally lowest-error integer candidate satisfying every declared construction constraint",
        algorithmId: "constraint-aware-top-down-counts:v1", roundingPolicy: "CONSTRAINT_SOLVER_SELECTION", exactResult: gaugeScaledTarget, gaugeScaledTarget, selectionConstraints: constraints.map((entry) => entry.id), selectionScore: chosen.score, result, unit: field === "yokeRepeats" ? "repeats" : "stitches", evidenceBinding: copy(evidenceBinding),
      };
    });
    return { status: "calculated", algorithmId: "constraint-aware-top-down-counts:v1", gaugeRatio: ratio, raglanDeltaPerRepeat, candidatesEvaluated: candidates.length, chosenCandidate: chosen, constraints, numericProvenance };
  }

  function componentCompleteness(component, draft) {
    const operations = array(draft.operations).filter((entry) => entry.componentId === component.id);
    const rows = array(draft.rowInstructions).filter((entry) => entry.componentId === component.id || operations.some((operation) => operation.id === entry.operationId));
    const missing = [];
    if (!operations.length) missing.push("operations");
    if (!rows.length) missing.push("rowInstructions");
    return { complete: missing.length === 0, missing };
  }

  function rowIdentity(entry) {
    const start = integer(entry.rowStart ?? entry.roundStart ?? entry.rowNumber ?? entry.roundNumber);
    const end = integer(entry.rowEnd ?? entry.roundEnd ?? entry.rowNumber ?? entry.roundNumber);
    const mode = entry.roundStart !== undefined || entry.roundNumber !== undefined ? "round" : "row";
    return { mode, start, end };
  }

  function numericProvenanceForEntity(entity, path, provenance, binding) {
    const fields = ["order", "rowStart", "rowEnd", "roundStart", "roundEnd", "rowNumber", "roundNumber", "stitchCountBefore", "stitchCountAfter", "countDelta"];
    const result = [];
    for (const field of fields) if (Number.isFinite(Number(entity?.[field])) && entity[field] !== null && entity[field] !== "") result.push(explicitNumber(`${path}.${field}`, Number(entity[field]), numberUnit(field), provenance, binding, entity.provenanceRefs));
    return result;
  }

  function sourceEvidenceNumbers(source, binding) {
    const facts = source?.facts || {};
    const result = [];
    for (const [index, gauge] of array(facts.gauge).entries()) {
      for (const field of ["stitches", "rows", "rounds", "per"]) if (Number.isFinite(Number(gauge?.[field]))) result.push(explicitNumber(`evidence.sourcePatternEvidence.facts.gauge.${index}.${field}`, Number(gauge[field]), field === "stitches" ? "stitches" : field === "per" ? gauge.unit : field, "SOURCE_EXPLICIT", binding));
    }
    for (const [index, value] of array(facts.needles).entries()) if (Number.isFinite(Number(value))) result.push(explicitNumber(`evidence.sourcePatternEvidence.facts.needles.${index}`, Number(value), "mm", "SOURCE_EXPLICIT", binding));
    for (const field of ["in", "cm"]) if (Number.isFinite(Number(facts.finishedMeasurement?.[field]))) result.push(explicitNumber(`evidence.sourcePatternEvidence.facts.finishedMeasurement.${field}`, Number(facts.finishedMeasurement[field]), field, "SOURCE_EXPLICIT", binding));
    return result;
  }

  function adaptationNumbers(profile, binding) {
    const result = [];
    for (const [index, gauge] of array(profile?.gauge).entries()) {
      for (const field of ["stitches", "rows", "rounds", "per"]) if (Number.isFinite(Number(gauge?.[field]))) result.push(explicitNumber(`evidence.userAdaptationProfile.gauge.${index}.${field}`, Number(gauge[field]), field === "stitches" ? "stitches" : field === "per" ? gauge.unit : field, "USER_CONFIRMED", binding));
    }
    for (const [index, value] of array(profile?.needles).entries()) if (Number.isFinite(Number(value?.canonicalValue))) result.push(explicitNumber(`evidence.userAdaptationProfile.needles.${index}.canonicalValue`, Number(value.canonicalValue), value.unit || "mm", "USER_CONFIRMED", binding));
    for (const [index, value] of array(profile?.yarn?.lengthOrWeight).entries()) if (Number.isFinite(Number(value?.value))) result.push(explicitNumber(`evidence.userAdaptationProfile.yarn.lengthOrWeight.${index}.value`, Number(value.value), value.unit ?? null, "USER_CONFIRMED", binding));
    return result;
  }

  function derivedStitchNumbers(draft, binding) {
    const result = [];
    for (const [index, change] of array(draft.stitchCountChanges).entries()) {
      const before = integer(change.stitchCountBefore ?? change.confirmedStitchCountBefore);
      const delta = integer(change.countDelta ?? change.provenance?.formulaInputs?.delta);
      const repeatCount = integer(change.provenance?.formulaInputs?.repeatCount) ?? 1;
      const after = integer(change.calculatedStitchCountAfter);
      if (before === null || delta === null || after === null || before + delta * repeatCount !== after) continue;
      result.push({ path: `stitchCountChanges.${index}.calculatedStitchCountAfter`, provenance: "DERIVED_BY_DECLARED_FORMULA", inputs: [{ name: "stitchCountBefore", value: before, unit: "stitches" }, { name: "countDelta", value: delta, unit: "stitches" }, { name: "repeatCount", value: repeatCount, unit: "repeats" }], formula: "stitchCountBefore + countDelta × repeatCount", algorithmId: "stitch-conservation-addition:v1", roundingPolicy: "NONE", exactResult: after, result: after, unit: "stitches", evidenceBinding: numberEvidenceBinding(binding), sourceProvenanceRefs: stableStrings(change.provenanceRefs) });
    }
    return result;
  }

  function coverageAccounting(draft, components, operations, rowInstructions, finishing) {
    const sourceSequence = array(draft.sourcePatternEvidence?.facts?.construction?.sequence).map((entry) => text(entry)).filter(Boolean);
    const sequence = sourceSequence.length ? sourceSequence : ["construction_sequence_unresolved"];
    const searchable = (items) => items.map((entry) => canonicalizeSafe(entry.source ?? entry)).join(" ").toLowerCase();
    const componentText = searchable(components); const operationText = searchable(operations); const rowText = searchable(rowInstructions); const finishingText = searchable(finishing);
    const aliases = {
      neckline: ["neckline", "neck", "горлов"], yoke: ["yoke", "кокет"], sleeve_body_separation: ["separation", "separate", "hold_stitches", "раздел", "отлож"],
      body: ["body", "тело", "корпус"], sleeves: ["sleeve", "рукав"], finishing: ["finish", "finishing", "отдел", "заверш"],
    };
    const items = sequence.map((section, index) => {
      const words = aliases[section] || [section.toLowerCase()];
      const componentEvidence = words.some((word) => componentText.includes(word));
      const operationEvidence = words.some((word) => operationText.includes(word));
      const rowEvidence = words.some((word) => rowText.includes(word));
      const finishingEvidence = section === "finishing" ? words.some((word) => finishingText.includes(word)) : true;
      const covered = componentEvidence && operationEvidence && rowEvidence && finishingEvidence;
      const missing = [];
      if (!componentEvidence) missing.push("component"); if (!operationEvidence) missing.push("operations"); if (!rowEvidence) missing.push("rowInstructions"); if (!finishingEvidence) missing.push("finishing");
      return { section, order: index + 1, sourceSequenceExplicit: sourceSequence.length > 0, covered, missing, evidenceIdentities: [] };
    });
    const coveredCount = items.filter((entry) => entry.covered).length;
    return { sourceConstructionSequence: sourceSequence, requiredCount: items.length, coveredCount, uncoveredCount: items.length - coveredCount, complete: items.length > 0 && coveredCount === items.length, items };
  }

  function executableBlockers(draft, components, operations, rowInstructions, finishing, coverage, binding) {
    const blockers = [];
    const add = (code, message, missingFields, coverageSections = [], numericPaths = []) => blockers.push({
      id: stableId("executable-blocker", { code, missingFields, coverageSections, binding }), code, severity: "critical", message,
      missingAuthoritativeFields: missingFields, coverageSections, sourceBinding: numberEvidenceBinding(binding),
      numericProvenance: numericPaths.map((path) => unresolvedNumber(path, code, binding)),
    });
    if (!operations.some((entry) => entry.type === "cast_on")) add("SOURCE_CAST_ON_INSTRUCTION_MISSING", "Источник не содержит подтверждённый набор петель для начала neckline.", ["castOn.count", "castOn.method", "castOn.component", "castOn.firstRowOrRound"], [coverage.sourceConstructionSequence[0] || "neckline"], ["operations.castOn.count"]);
    if (!components.length) add("SOURCE_COMPONENT_INSTRUCTIONS_MISSING", "Источник не содержит подтверждённые исполнимые компоненты.", ["components.identity", "components.type", "components.order", "components.sourceInstructions"], coverage.sourceConstructionSequence);
    if (!array(draft.sizes).some((entry) => /length|width|circumference|dimension/i.test(text(entry.type ?? entry.property ?? entry.value?.semanticType)))) add("SOURCE_COMPONENT_DIMENSIONS_MISSING", "Источник не содержит размеров деталей, достаточных для адаптации.", ["componentDimensions.neckline", "componentDimensions.yoke", "componentDimensions.body", "componentDimensions.sleeves"], coverage.sourceConstructionSequence, ["componentDimensions"]);
    if (!operations.some((entry) => ["increase", "decrease"].includes(entry.type))) add("SOURCE_SHAPING_INSTRUCTIONS_MISSING", "Источник не содержит подтверждённые числовые прибавления или убавления.", ["shaping.startCounts", "shaping.changeCounts", "shaping.frequency", "shaping.endCounts"], ["yoke", "sleeves"], ["shaping.changeCounts"]);
    if (!operations.some((entry) => ["hold_stitches", "join"].includes(entry.type))) add("SOURCE_SEPARATION_INSTRUCTIONS_MISSING", "Источник не содержит подтверждённое разделение кокетки на корпус и рукава.", ["separation.bodyCount", "separation.sleeveCounts", "separation.underarmCounts", "separation.order"], ["sleeve_body_separation"], ["separation.bodyCount", "separation.sleeveCounts", "separation.underarmCounts"]);
    if (!rowInstructions.length) add("SOURCE_ROW_INSTRUCTIONS_MISSING", "Источник не содержит конкретные ряды, круги или ограниченные диапазоны.", ["rowOrRound.identity", "rowOrRound.actions", "rowOrRound.inputStitchCount", "rowOrRound.outputStitchCount", "rowOrRound.expectedState"], coverage.sourceConstructionSequence, ["rowInstructions.inputStitchCount", "rowInstructions.outputStitchCount"]);
    if (!finishing.length) add("SOURCE_FINISHING_INSTRUCTIONS_MISSING", "Источник не содержит подтверждённые завершающие операции.", ["finishing.operations", "finishing.order", "finishing.prerequisites"], ["finishing"]);
    if (!coverage.complete) add("SOURCE_CONSTRUCTION_COVERAGE_INCOMPLETE", "Не вся подтверждённая source construction sequence покрыта исполнимыми инструкциями.", coverage.items.filter((entry) => !entry.covered).flatMap((entry) => entry.missing.map((field) => `${entry.section}.${field}`)), coverage.items.filter((entry) => !entry.covered).map((entry) => entry.section));
    return blockers;
  }

  function explicitNumber(path, value, unit, provenance, binding, sourceProvenanceRefs = []) { return { path, provenance, value, unit: unit ?? null, sourceProvenanceRefs: stableStrings(sourceProvenanceRefs), evidenceBinding: numberEvidenceBinding(binding) }; }
  function unresolvedNumber(path, reasonCode, binding) { return { path, provenance: "UNRESOLVED", value: null, unit: null, reasonCode, sourceProvenanceRefs: [], evidenceBinding: numberEvidenceBinding(binding) }; }
  function numberEvidenceBinding(binding) { return { projectId: binding?.projectId ?? null, stage19AuthoritativeReviewRevision: binding?.stage19AuthoritativeReviewRevision ?? null, stage20Revision: binding?.stage20Revision ?? null, stage20ResultIdentity: binding?.stage20ResultIdentity ?? null, stage20SourceProjectionFingerprint: binding?.stage20SourceProjectionFingerprint ?? null, sourcePatternEvidenceFingerprint: binding?.sourcePatternEvidenceFingerprint ?? null, userAdaptationProfileFingerprint: binding?.userAdaptationProfileFingerprint ?? null }; }
  function stableNumericProvenance(entries) { const map = new Map(); for (const entry of entries) map.set(canonicalize({ path: entry.path, provenance: entry.provenance }), copy(entry)); return [...map.values()].sort((left, right) => lexical(left.path, right.path) || lexical(left.provenance, right.provenance)); }
  function numberUnit(field) { if (/row/i.test(field)) return "rows"; if (/round/i.test(field)) return "rounds"; if (/stitch|countDelta/i.test(field)) return "stitches"; return "ordinal"; }
  function gaugePerCm(gauge) { const stitches = Number(gauge?.stitches); const per = Number(gauge?.per); const unit = text(gauge?.unit).toLowerCase(); if (!(stitches > 0) || !(per > 0)) return null; const cm = unit === "cm" ? per : ["in", "inch", "inches"].includes(unit) ? per * 2.54 : null; return cm ? stitches / cm : null; }
  function roundNumber(value, policy) { if (policy === "NONE") return value; if (policy === "FLOOR") return Math.floor(value); if (policy === "CEIL") return Math.ceil(value); if (policy === "NEAREST_INTEGER_HALF_UP") return Math.floor(value + 0.5); throw reviewError("ROUNDING_POLICY_INVALID", "Неизвестная политика округления."); }
  function stableStrings(values) { return [...new Set(array(values).map((entry) => text(entry)).filter(Boolean))].sort(lexical); }

  function createInitialState(projectId, sourceDraft, source = {}, now = timestampNow()) {
    const sourceValidation = validateSourceDraft(sourceDraft, projectId);
    if (!sourceValidation.isValid) throw reviewError(sourceValidation.critical[0].code, "Stage 21 можно создать только из валидного черновика Stage 20.");
    if (!isTimestamp(now)) throw reviewError("SOURCE_REFERENCE_INVALID", "Дата создания review повреждена.");
    const sourceIssues = collectSourceIssues(sourceDraft.draftResult);
    const executableInput = buildExecutableTechnologyPlanInput(sourceDraft, source.progressId ?? null, source.instructionEvidence ?? null);
    const immutableSourceSnapshot = deepFreeze({
      schemaVersion: 2,
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
      executableTechnologyPlanInput: copy(executableInput),
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
      executableInputSchemaId: EXECUTABLE_INPUT_SCHEMA_ID,
      executableInputVersion: EXECUTABLE_INPUT_VERSION,
      executableInputIdentity: executableInput.identity,
      executableInputFingerprint: executableInput.fingerprint,
      stage20ResultIdentity: executableInput.binding.stage20ResultIdentity,
      sourceProjectionFingerprint: executableInput.binding.stage20SourceProjectionFingerprint,
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
    const executable = snapshot.executableTechnologyPlanInput;
    if (executable?.algorithmId === EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID && executable?.readiness?.executableReady) {
      return [{
        id: stableId("executable-plan-review", { identity: executable.identity, fingerprint: executable.fingerprint }),
        category: "operations", targetKind: "value", required: true, blocking: true,
        code: "EXECUTABLE_TECHNOLOGY_PLAN", unit: null,
        originalValue: {
          identity: executable.identity, fingerprint: executable.fingerprint,
          selectedBranches: copy(executable.branchSelection.selectedOptions),
          adaptedOperationCount: executable.adaptedExecution.operations.length,
          solverResultIdentity: executable.adaptedExecution.solverIdentity,
          solverResultFingerprint: executable.adaptedExecution.solverFingerprint,
          readiness: copy(executable.readiness),
        },
        provenanceRefs: stableStrings([executable.binding.sourceInstructionEvidenceFingerprint, executable.adaptedExecution.solverFingerprint, executable.branchSelection.fingerprint]),
        allowedCorrections: ["user_comment"],
      }];
    }
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
    const selectedValue = options.selectedValue === undefined ? null : copy(options.selectedValue);
    const comment = boundedNote(options.comment || current.comment);
    if (current.decision === decision && canonicalize(current.selectedValue) === canonicalize(selectedValue) && current.comment === comment) return copy(state);
    const next = mutable(state);
    next.revision += 1; next.status = "reviewing"; next.updatedAt = now; next.confirmedAt = null;
    const entry = next.decisions.find((item) => item.decisionId === current.decisionId);
    entry.decision = decision;
    entry.selectedValue = selectedValue;
    entry.comment = comment;
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
    if (snapshot?.schemaVersion === 2) {
      const executable = snapshot.executableTechnologyPlanInput;
      const executableValidation = validateExecutableTechnologyPlanInput(executable, sourceDraft, state.sourceDraftProgressId);
      for (const entry of executableValidation.errors) add(critical, entry.code, entry.entityId);
      if (state.executableInputSchemaId !== EXECUTABLE_INPUT_SCHEMA_ID || state.executableInputVersion !== EXECUTABLE_INPUT_VERSION || state.executableInputIdentity !== executable?.identity || state.executableInputFingerprint !== executable?.fingerprint || state.stage20ResultIdentity !== executable?.binding?.stage20ResultIdentity || state.sourceProjectionFingerprint !== executable?.binding?.stage20SourceProjectionFingerprint) add(critical, "EXECUTABLE_INPUT_IDENTITY_INVALID");
      if (executable?.algorithmId === EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID && !executable?.readiness?.executableReady) add(critical, "EXECUTABLE_NOT_READY");
    }
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

  function buildConfirmationGuidance(state, validation = state?.validation) {
    const critical = array(validation?.critical);
    const pending = critical.find((entry) => entry.code === "REQUIRED_DECISION_PENDING");
    if (pending) {
      const target = array(state?.reviewState?.targets).find((entry) => entry.id === pending.targetId);
      const label = target?.code === "EXECUTABLE_TECHNOLOGY_PLAN" ? "исполнимый технологический план" : "обязательный пункт проверки";
      return {
        canConfirm: false,
        code: pending.code,
        targetId: pending.targetId ?? null,
        message: `Подтверждение пока недоступно: пункт «${label}» ещё не имеет вашего решения. В разделе «Операции» выберите «Принять», «Исправить» или «Отклонить». Yarn AI не примет решение за вас.`,
      };
    }
    if (critical.length) {
      return {
        canConfirm: false,
        code: critical[0].code,
        targetId: critical[0].targetId ?? null,
        message: `Подтверждение пока недоступно: техническая проверка обнаружила критическую проблему ${critical[0].code}. Исправьте указанный пункт и снова проверьте данные.`,
      };
    }
    const statusAllowsConfirmation = !["waiting", "stale", "failed", "confirmed"].includes(state?.status);
    return {
      canConfirm: statusAllowsConfirmation,
      code: statusAllowsConfirmation ? null : `STATUS_${String(state?.status || "UNKNOWN").toUpperCase()}`,
      targetId: null,
      message: statusAllowsConfirmation
        ? "Все обязательные решения приняты. Результат будет подтверждён только после вашего нажатия кнопки «Подтвердить результат»."
        : "Подтверждение недоступно в текущем состоянии проверки.",
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
    if (state.immutableSourceSnapshot?.schemaVersion === 2) {
      if (draft?.draftResult?.resultIdentity !== state.stage20ResultIdentity) critical.push(issue("EXECUTABLE_INPUT_SOURCE_STALE"));
      if (draft?.sourceProjectionFingerprint !== state.sourceProjectionFingerprint) critical.push(issue("SOURCE_PROJECTION_FINGERPRINT_MISMATCH"));
    }
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
    if (validation.critical.length) { const blocking = validation.critical.find((entry) => entry.code === "REQUIRED_DECISION_PENDING") || validation.critical[0]; throw reviewError(blocking.code, "Подтверждение заблокировано критическими проблемами."); }
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
      executableTechnologyPlanInput: copy(state.immutableSourceSnapshot.executableTechnologyPlanInput ?? null),
      reviewRevision: state.revision, confirmedSnapshotFingerprint: null,
    };
    snapshot.confirmedSnapshotFingerprint = confirmedFingerprint(snapshot);
    return deepFreeze(snapshot);
  }

  function confirmedFingerprint(snapshot) {
    const payload = copy(snapshot); delete payload.confirmedSnapshotFingerprint; return fingerprint(payload);
  }

  function authoritativeExecutionProjection(input) {
    const adapted = input?.adaptedExecution || null;
    return {
      schemaId: input?.schemaId ?? null,
      contractVersion: input?.contractVersion ?? null,
      binding: copy(input?.binding ?? null),
      evidence: copy(input?.evidence ?? null),
      branchSelection: copy(input?.branchSelection ?? null),
      components: copy(array(input?.components)),
      operations: copy(array(input?.operations)),
      rowInstructions: copy(array(input?.rowInstructions)),
      finishing: copy(array(input?.finishing)),
      coverage: copy(input?.coverage ?? null),
      unresolvedBlockers: copy(array(input?.unresolvedBlockers)),
      counts: copy(input?.counts ?? null),
      adaptedExecution: adapted ? {
        status: adapted.status ?? null,
        operations: copy(array(adapted.operations)),
        sourceCounts: copy(adapted.sourceCounts ?? null),
        solver: copy(adapted.solver ?? null),
        solverIdentity: adapted.solverIdentity ?? null,
        solverFingerprint: adapted.solverFingerprint ?? null,
        adaptationProfile: copy(adapted.adaptationProfile ?? null),
        evidenceFingerprint: adapted.evidenceFingerprint ?? null,
        branchFingerprint: adapted.branchFingerprint ?? null,
        blockers: copy(array(adapted.blockers)),
        shortRows: copy(adapted.shortRows ?? null),
        raglanChain: copy(adapted.raglanChain ?? null),
        separation: copy(adapted.separation ?? null),
        sleeveChain: copy(adapted.sleeveChain ?? null),
        sleeveSchedule: copy(adapted.sleeveSchedule ?? null),
        increaseDistribution: copy(adapted.increaseDistribution ?? null),
        validation: {
          isValid: adapted.validation?.isValid === true,
          errors: copy(array(adapted.validation?.errors)),
        },
      } : null,
    };
  }

  function canonicalDifferencePaths(left, right, path = "$", result = []) {
    if (result.length >= 24 || canonicalize(left) === canonicalize(right)) return result;
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) result.push(`${path}.length`);
      for (let index = 0; index < Math.min(left.length, right.length) && result.length < 24; index += 1) canonicalDifferencePaths(left[index], right[index], `${path}[${index}]`, result);
      return result;
    }
    if (object(left) && object(right)) {
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(lexical)) {
        if (result.length >= 24) break;
        if (!Object.prototype.hasOwnProperty.call(left, key) || !Object.prototype.hasOwnProperty.call(right, key)) result.push(`${path}.${key}`);
        else canonicalDifferencePaths(left[key], right[key], `${path}.${key}`, result);
      }
      return result;
    }
    result.push(path);
    return result;
  }

  function assessConfirmedCausalTraceRevalidation(state, sourceDraft, source = {}) {
    requireState(state);
    const previousInput = state.confirmedSnapshot?.executableTechnologyPlanInput ?? null;
    const blocked = (reasonCode) => ({ isValid: false, reasonCode, previousInput, upgradedInput: null });
    if (state.status !== "stale") return blocked("STATE_NOT_STALE");
    if (!["EXECUTABLE_INPUT_UPGRADE_REQUIRED", "CONFIRMED_SNAPSHOT_INVALID"].includes(state.lastError?.code)) return blocked("LAST_ERROR_NOT_SUPPORTED");
    if (previousInput?.algorithmId !== LEGACY_EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID) return blocked("LEGACY_INPUT_REQUIRED");
    if (!state.confirmedSnapshot) return blocked("CONFIRMED_SNAPSHOT_MISSING");
    if (!state.confirmedSnapshotFingerprint) return blocked("CONFIRMED_SNAPSHOT_FINGERPRINT_MISSING");
    if (confirmedFingerprint(state.confirmedSnapshot) !== state.confirmedSnapshotFingerprint) return blocked("CONFIRMED_SNAPSHOT_FINGERPRINT_MISMATCH");
    if (!validConfirmedSnapshot(state.confirmedSnapshot, state)) return blocked("CONFIRMED_SNAPSHOT_BINDING_INVALID");
    if (!validateLiveSource(state, sourceDraft).isValid) return blocked("LIVE_SOURCE_CHANGED");
    const upgradedInput = buildExecutableTechnologyPlanInput(
      sourceDraft,
      source.progressId ?? state.sourceDraftProgressId ?? null,
      source.instructionEvidence ?? null,
    );
    const upgradedValidation = validateExecutableTechnologyPlanInput(
      upgradedInput,
      sourceDraft,
      source.progressId ?? state.sourceDraftProgressId ?? null,
      source.instructionEvidence ?? null,
    );
    if (upgradedInput.algorithmId !== EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID) return blocked("UPGRADED_ALGORITHM_INVALID");
    if (!upgradedValidation.isValid) return blocked("UPGRADED_INPUT_INVALID");
    if (validateAuthoritativeCausalTrace(upgradedInput.adaptedExecution?.causalTrace, upgradedInput.adaptedExecution?.operations, upgradedInput.adaptedExecution).isValid !== true) return blocked("CAUSAL_TRACE_INVALID");
    const previousProjection = authoritativeExecutionProjection(previousInput);
    const upgradedProjection = authoritativeExecutionProjection(upgradedInput);
    if (canonicalize(previousProjection) !== canonicalize(upgradedProjection)) return {
      ...blocked("AUTHORITATIVE_EXECUTION_CHANGED"),
      differencePaths: canonicalDifferencePaths(previousProjection, upgradedProjection),
    };
    return { isValid: true, reasonCode: null, previousInput, upgradedInput };
  }

  function revalidateConfirmedCausalTrace(state, sourceDraft, source = {}, now = timestampNow()) {
    const assessment = assessConfirmedCausalTraceRevalidation(state, sourceDraft, source);
    if (!assessment.isValid) return null;
    const { previousInput, upgradedInput } = assessment;

    const next = mutable(state);
    const previousConfirmedSnapshotFingerprint = next.confirmedSnapshotFingerprint;
    const previousExecutableInputFingerprint = previousInput.fingerprint;
    const previousErrorCode = next.lastError?.code ?? null;
    next.revision += 1;
    next.status = "confirmed";
    next.updatedAt = now;
    next.lastError = null;
    next.reviewState.operation = null;
    next.immutableSourceSnapshot.executableTechnologyPlanInput = copy(upgradedInput);
    next.immutableSourceSnapshotFingerprint = fingerprint(next.immutableSourceSnapshot);
    next.executableInputIdentity = upgradedInput.identity;
    next.executableInputFingerprint = upgradedInput.fingerprint;
    next.stage20ResultIdentity = upgradedInput.binding.stage20ResultIdentity;
    next.sourceProjectionFingerprint = upgradedInput.binding.stage20SourceProjectionFingerprint;
    const rebindExecutableValue = (value) => {
      if (!value || value.identity !== previousInput.identity) return value;
      value.identity = upgradedInput.identity;
      value.fingerprint = upgradedInput.fingerprint;
      if (Object.prototype.hasOwnProperty.call(value, "algorithmId")) value.algorithmId = upgradedInput.algorithmId;
      return value;
    };
    for (const target of array(next.reviewState?.targets)) rebindExecutableValue(target?.originalValue);
    const confirmedSnapshot = copy(next.confirmedSnapshot);
    confirmedSnapshot.reviewIdentity.revision = next.revision;
    confirmedSnapshot.reviewRevision = next.revision;
    for (const entry of array(confirmedSnapshot.confirmedValues)) {
      rebindExecutableValue(entry?.originalValue);
      rebindExecutableValue(entry?.value);
    }
    for (const entry of array(confirmedSnapshot.originalValues)) rebindExecutableValue(entry?.value);
    confirmedSnapshot.executableTechnologyPlanInput = copy(upgradedInput);
    confirmedSnapshot.confirmedSnapshotFingerprint = null;
    confirmedSnapshot.confirmedSnapshotFingerprint = confirmedFingerprint(confirmedSnapshot);
    next.confirmedSnapshot = confirmedSnapshot;
    next.confirmedSnapshotFingerprint = confirmedSnapshot.confirmedSnapshotFingerprint;
    next.validation = validateReviewState(next, sourceDraft, now);
    if (next.validation.critical.length) return null;
    appendAudit(next, auditEntry("causal_trace_revalidated", next, now, {
      previousConfirmedSnapshotFingerprint,
      previousExecutableInputFingerprint,
      previousErrorCode,
      executableInputFingerprint: upgradedInput.fingerprint,
      authoritativeExecutionFingerprint: fingerprint(authoritativeExecutionProjection(upgradedInput)),
      userConfirmationPreserved: true,
    }));
    return deepFreeze(next);
  }

  function validConfirmedSnapshot(snapshot, state) {
    return Boolean(snapshot && snapshot.schemaVersion === 1 && snapshot.reviewIdentity?.id === state.id && snapshot.reviewIdentity?.projectId === state.projectId && snapshot.sourceDraftIdentity?.id === state.sourceDraftId && snapshot.sourceFingerprints?.draft === state.sourceDraftFingerprint && snapshot.sourceFingerprints?.validation === state.sourceValidationFingerprint && snapshot.sourceFingerprints?.criticalIssues === state.sourceCriticalIssuesFingerprint && Array.isArray(snapshot.confirmedValues) && object(snapshot.finalDraft) && (state.immutableSourceSnapshot?.schemaVersion !== 2 || snapshot.executableTechnologyPlanInput?.identity === state.executableInputIdentity && snapshot.executableTechnologyPlanInput?.fingerprint === state.executableInputFingerprint));
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
    const previousImmutableResult = state.confirmedSnapshot ? { identity: state.confirmedSnapshotFingerprint, reviewRevision: state.revision, confirmedAt: state.confirmedAt, snapshot: copy(state.confirmedSnapshot) } : null;
    fresh.id = state.id; fresh.revision = state.revision + 1;
    fresh.decisions.forEach((entry) => { entry.decisionId = stableId("decision", { reviewId: fresh.id, targetId: entry.targetId }); entry.revision = fresh.revision; });
    fresh.audit = [...array(state.audit), auditEntry("created", fresh, now, { previousSourceDraftFingerprint: state.sourceDraftFingerprint })].slice(-AUDIT_LIMIT);
    fresh.supersededConfirmedSnapshots = [...array(state.supersededConfirmedSnapshots), ...[previousImmutableResult].filter(Boolean)];
    fresh.validation = validateReviewState(fresh, sourceDraft, now);
    return deepFreeze(fresh);
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project || null;
    const calculation = array(aggregate?.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null;
    if (!project || !calculation) return { state: "missing_project", project, calculation, draft: null, review: null };
    const progress = array(aggregate.progress).filter((entry) => entry.calculation_id === calculation.calculation_id && entry.epoch === 1);
    const draftProgress = progress.find((entry) => entry.kind === "PATTERN_TECHNOLOGY_DRAFT") || null;
    const instructionEvidenceProgress = progress.find((entry) => entry.kind === "SOURCE_PATTERN_INSTRUCTION_EVIDENCE") || null;
    const instructionEvidence = instructionEvidenceProgress?.state?.status === "confirmed" ? instructionEvidenceProgress.state : null;
    const reviewProgress = progress.find((entry) => entry.kind === PROGRESS_KIND) || null;
    if (!draftProgress) return reviewProgress
      ? { state: "stale", reasonCode: "SOURCE_DRAFT_MISSING", project, calculation, draft: null, draftProgress: null, review: reviewProgress.state, reviewProgress }
      : { state: "draft_missing", project, calculation, draft: null, review: null };
    const draft = draftProgress.state;
    const sourceValidation = validateSourceDraft(draft, aggregate.project.project_id);
    if (!sourceValidation.isValid) return reviewProgress
      ? { state: "stale", reasonCode: sourceValidation.critical[0].code, project, calculation, draft, draftProgress, review: reviewProgress.state, reviewProgress }
      : { state: draft?.status === "stale" ? "draft_stale" : "source_invalid", reasonCode: sourceValidation.critical[0].code, project, calculation, draft, draftProgress, review: null };
    if (!reviewProgress) return { state: "creatable", project, calculation, draft, draftProgress, instructionEvidence, instructionEvidenceProgress, review: null };
    const review = reviewProgress.state;
    if (review.immutableSourceSnapshot?.schemaVersion !== 2 || review.executableInputSchemaId !== EXECUTABLE_INPUT_SCHEMA_ID) return { state: "stale", reasonCode: "EXECUTABLE_INPUT_UPGRADE_REQUIRED", project, calculation, draft, draftProgress, review, reviewProgress };
    const embeddedExecutable = review.immutableSourceSnapshot?.executableTechnologyPlanInput;
    if (embeddedExecutable?.binding?.sourceInstructionEvidenceFingerprint && ![LEGACY_EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID, EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID].includes(embeddedExecutable.algorithmId)) return { state: "stale", reasonCode: "EXECUTABLE_INPUT_UPGRADE_REQUIRED", project, calculation, draft, draftProgress, instructionEvidence, instructionEvidenceProgress, review, reviewProgress };
    const embeddedInstructionFingerprint = review.immutableSourceSnapshot?.executableTechnologyPlanInput?.binding?.sourceInstructionEvidenceFingerprint ?? null;
    const liveInstructionFingerprint = instructionEvidence?.confirmedSnapshotFingerprint ?? null;
    if (liveInstructionFingerprint && embeddedInstructionFingerprint !== liveInstructionFingerprint) return { state: "stale", reasonCode: "SOURCE_INSTRUCTION_EVIDENCE_UPGRADE_REQUIRED", project, calculation, draft, draftProgress, instructionEvidence, instructionEvidenceProgress, review, reviewProgress };
    if (embeddedInstructionFingerprint && liveInstructionFingerprint !== embeddedInstructionFingerprint) return { state: "stale", reasonCode: "SOURCE_INSTRUCTION_EVIDENCE_STALE", project, calculation, draft, draftProgress, instructionEvidence, instructionEvidenceProgress, review, reviewProgress };
    const validation = validateReviewState(review, draft);
    if (validation.critical.some((entry) => ["SOURCE_SNAPSHOT_MUTATED", "OWNERSHIP_MISMATCH", "SOURCE_REFERENCE_INVALID"].includes(entry.code))) return { state: "corrupted", reasonCode: validation.critical[0].code, project, calculation, draft, draftProgress, review, reviewProgress };
    const live = validateLiveSource(review, draft);
    return { state: live.isValid ? "ready" : "stale", reasonCode: live.critical[0]?.code ?? null, project, calculation, draft, draftProgress, instructionEvidence, instructionEvidenceProgress, review, reviewProgress };
  }

  async function inspectForProject(repository, projectId) {
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function ensureForProject(repository, projectId) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (["missing_project", "draft_missing", "source_invalid", "draft_stale", "corrupted"].includes(inspected.state)) return inspected;
    if (!inspected.review) {
      const initial = createInitialState(projectId, inspected.draft, { progressId: inspected.draftProgress.progress_id, instructionEvidence: inspected.instructionEvidence });
      await repository.ensurePatternTechnologyReview(projectId, inspected.calculation.calculation_id, initial, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_CREATED", projectStage: "pattern_technology_review_waiting" });
      return inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.review.reviewState?.operation?.status === "in_progress") {
      const recovered = recoverInterruptedState(inspected.review);
      await repository.updatePatternTechnologyReview(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_RECOVERED", projectStage: `pattern_technology_review_${recovered.status}` });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.review?.status === "stale") {
      const repairSource = {
        progressId: inspected.draftProgress?.progress_id ?? null,
        instructionEvidence: inspected.instructionEvidence ?? null,
      };
      const assessment = assessConfirmedCausalTraceRevalidation(inspected.review, inspected.draft, repairSource);
      const revalidated = assessment.isValid ? revalidateConfirmedCausalTrace(inspected.review, inspected.draft, repairSource) : null;
      if (revalidated) {
        await repository.updatePatternTechnologyReview(projectId, inspected.calculation.calculation_id, revalidated, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_CAUSAL_TRACE_REVALIDATED", projectStage: "pattern_technology_review_confirmed" });
        inspected = inspectAggregate(await repository.getProject(projectId));
      } else inspected = { ...inspected, revalidationReasonCode: assessment.reasonCode, revalidationDifferencePaths: assessment.differencePaths || [] };
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
      const next = newReviewFromDraft(inspected.review, inspected.draft, { progressId: inspected.draftProgress.progress_id, instructionEvidence: inspected.instructionEvidence });
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
  function validFingerprint(value) { return /^fnv1a32:[0-9a-f]{8}$/.test(String(value || "")); }
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
    planTwoPhaseBodyTaper,
    VERSION, REVIEW_ALGORITHM_VERSION, EXECUTABLE_INPUT_SCHEMA_ID, EXECUTABLE_INPUT_VERSION, EXECUTABLE_INPUT_ALGORITHM_ID, LEGACY_EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID, EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID, NUMBER_PROVENANCE, ROUNDING_POLICIES, CAUSAL_DISPOSITIONS, CAUSAL_TRACE_SCHEMA_ID, CAUSAL_TRACE_ALGORITHM_ID, PROGRESS_KIND, STATUSES, DECISIONS, CORRECTION_TYPES, OPERATION_TYPES, VALID_UNITS, ERROR_CODES, AUDIT_LIMIT,
    PatternTechnologyReviewError, canonicalize, fingerprint, collectCriticalIssues, validateSourceDraft, createInitialState,
    stage20Binding, instructionEvidenceBinding, validateInstructionEvidence, executableProjectionFromInstructions, resolveSelectedInstructionBranches, filterProjectionByBranches, expandPhysicalShortRows, materializeAdaptedExecution, validateSequentialExecution, buildExecutableTechnologyPlanInput, validateExecutableTechnologyPlanInput, executableInputFingerprint, calculateAdaptedCount, calculateAdaptedRowCount, calculateConstraintAwareTopDownCounts, buildEvenIncreaseDistribution, buildAuthoritativeCausalTrace, validateAuthoritativeCausalTrace, causalTraceFingerprint, buildAdaptationExplanation, userOperationLabel,
    buildReviewTargets, startReview, setDecision, addCorrection, removeCorrection, addUserNote, validateReviewState, buildConfirmationGuidance,
    validateLiveSource, validateAndApply, beginConfirmation, completeConfirmation, confirmReview, buildConfirmedSnapshot,
    confirmedFingerprint, authoritativeExecutionProjection, assessConfirmedCausalTraceRevalidation, revalidateConfirmedCausalTrace, reopenReview, recoverInterruptedState, retryReview, markFailed, markStale, newReviewFromDraft, inspectAggregate, inspectForProject,
    ensureForProject, startForProject, decideForProject, correctForProject, removeCorrectionForProject,
    validateForProject, confirmForProject, reopenForProject, retryForProject, newReviewForProject, applyCorrections,
  };
  globalObject.YarnAIPatternTechnologyReview = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
