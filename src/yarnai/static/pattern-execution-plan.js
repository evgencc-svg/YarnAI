"use strict";

(function exposePatternExecutionPlan(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PLANNING_ALGORITHM_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_PLAN";
  const STATUSES = Object.freeze(["waiting", "planning", "ready", "blocked", "stale", "failed"]);
  const PHASE_TYPES = Object.freeze([
    "preparation", "swatch", "cast_on", "foundation", "main_fabric", "shaping",
    "division", "component_work", "joining", "edge_finishing", "closure", "blocking", "final_inspection",
  ]);
  const PHASE_STATUSES = Object.freeze(["ready", "blocked", "conditional", "unresolved"]);
  const PREREQUISITE_STATUSES = Object.freeze(["satisfied", "required", "unresolved", "not_applicable"]);
  const COMPONENT_STATUSES = Object.freeze(["planned", "blocked", "unresolved"]);
  const AUDIT_LIMIT = 24;
  const PLANNING_PHASES = Object.freeze([
    "validate_source", "normalize_snapshot", "derive_components", "derive_phases",
    "build_dependencies", "derive_checkpoints", "determine_first_action", "validate_plan", "persist_plan",
  ]);
  const CRITICAL_SOURCE_CODES = new Set([
    "SOURCE_REVIEW_MISSING", "SOURCE_REVIEW_NOT_CONFIRMED", "SOURCE_REVIEW_STALE",
    "SOURCE_SNAPSHOT_MISSING", "SOURCE_SNAPSHOT_FINGERPRINT_INVALID", "SOURCE_IDENTITY_MISMATCH",
    "SOURCE_IMPORT_REVISION_MISMATCH", "IMPORT_SOURCE_IDENTITY_UNPROVEN",
  ]);
  const activeOperations = new Set();

  class PatternExecutionPlanError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionPlanError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort(lexical).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    }
    if (typeof value === "number" && !Number.isFinite(value)) throw planError("STRUCTURAL_VALIDATION_FAILED", "План содержит недопустимое числовое значение.");
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

  function confirmedSnapshotFingerprint(snapshot) {
    if (!object(snapshot)) return null;
    const payload = copy(snapshot);
    delete payload.confirmedSnapshotFingerprint;
    return fingerprintSafe(payload);
  }

  function technologyReviewFingerprint(review) {
    if (!review) return null;
    return fingerprintSafe({
      id: review.id, projectId: review.projectId, revision: review.revision, status: review.status,
      confirmedSnapshotFingerprint: review.confirmedSnapshotFingerprint,
      sourceDraftId: review.sourceDraftId, sourceDraftRevision: review.sourceDraftRevision,
      sourceDraftFingerprint: review.sourceDraftFingerprint,
    });
  }

  function sourceIdentity(review) {
    const snapshot = review?.confirmedSnapshot;
    const draft = snapshot?.sourceDraftIdentity || {};
    const analysisReview = snapshot?.sourceReviewIdentity || {};
    const semantic = snapshot?.sourceSemanticIdentity || {};
    return {
      sourceTechnologyReviewId: review?.id ?? null,
      sourceTechnologyReviewRevision: integer(review?.revision),
      sourceTechnologyReviewFingerprint: technologyReviewFingerprint(review),
      sourceConfirmedSnapshotFingerprint: review?.confirmedSnapshotFingerprint ?? snapshot?.confirmedSnapshotFingerprint ?? null,
      sourceTechnologyDraftId: draft.id ?? null,
      sourceTechnologyDraftRevision: integer(draft.revision),
      sourceTechnologyDraftFingerprint: snapshot?.sourceFingerprints?.draft ?? review?.sourceDraftFingerprint ?? null,
      sourceAnalysisReviewId: analysisReview.id ?? null,
      sourceAnalysisReviewRevision: integer(analysisReview.revision),
      sourceAnalysisReviewFingerprint: analysisReview.id && analysisReview.revision ? fingerprint({ id: analysisReview.id, revision: analysisReview.revision, projectId: analysisReview.projectId ?? review?.projectId ?? null }) : null,
      sourceSemanticAnalysisId: semantic.id ?? null,
      sourceSemanticAnalysisRevision: integer(semantic.revision),
      sourceSemanticAnalysisFingerprint: semantic.id && semantic.revision ? fingerprint({ id: semantic.id, revision: semantic.revision, projectId: semantic.projectId ?? review?.projectId ?? null, sourceImportRevision: integer(snapshot?.sourceImportRevision) }) : null,
      sourceImportRevision: integer(snapshot?.sourceImportRevision),
      sourceAlgorithmVersion: integer(draft.algorithmVersion),
    };
  }

  function validateSourceReview(review, projectId, context = {}) {
    const diagnostics = [];
    const add = (code, details = {}) => diagnostics.push(diagnostic(code, "critical", sourceMessage(code), details));
    if (!review) add("SOURCE_REVIEW_MISSING");
    if (review && review.kind !== "PATTERN_TECHNOLOGY_REVIEW") add("SOURCE_IDENTITY_MISMATCH", { field: "kind" });
    if (review && (review.projectId !== projectId || review.confirmedSnapshot?.reviewIdentity?.projectId !== projectId)) add("SOURCE_IDENTITY_MISMATCH", { field: "projectId" });
    if (review && review.status !== "confirmed") add(review.status === "stale" ? "SOURCE_REVIEW_STALE" : "SOURCE_REVIEW_NOT_CONFIRMED", { status: review.status });
    const snapshot = review?.confirmedSnapshot;
    if (review && !snapshot) add("SOURCE_SNAPSHOT_MISSING");
    const calculatedSnapshotFingerprint = confirmedSnapshotFingerprint(snapshot);
    if (snapshot && (
      calculatedSnapshotFingerprint !== review.confirmedSnapshotFingerprint ||
      snapshot.confirmedSnapshotFingerprint !== review.confirmedSnapshotFingerprint
    )) add("SOURCE_SNAPSHOT_FINGERPRINT_INVALID", { expected: review.confirmedSnapshotFingerprint, actual: calculatedSnapshotFingerprint });
    const identity = sourceIdentity(review);
    if (snapshot) {
      if (snapshot.reviewIdentity?.id !== review.id || snapshot.reviewIdentity?.revision !== review.revision || snapshot.reviewRevision !== review.revision) add("SOURCE_IDENTITY_MISMATCH", { field: "reviewIdentity" });
      if (!text(identity.sourceTechnologyDraftId) || !positiveInteger(identity.sourceTechnologyDraftRevision) || !validFingerprint(identity.sourceTechnologyDraftFingerprint) || !positiveInteger(identity.sourceAlgorithmVersion)) add("SOURCE_IDENTITY_MISMATCH", { stage: 20 });
      if (!text(identity.sourceAnalysisReviewId) || !positiveInteger(identity.sourceAnalysisReviewRevision) || !validFingerprint(identity.sourceAnalysisReviewFingerprint)) add("SOURCE_IDENTITY_MISMATCH", { stage: 19 });
      if (!text(identity.sourceSemanticAnalysisId) || !positiveInteger(identity.sourceSemanticAnalysisRevision) || !validFingerprint(identity.sourceSemanticAnalysisFingerprint)) add("SOURCE_IDENTITY_MISMATCH", { stage: 18 });
      for (const nested of [snapshot.reviewIdentity, snapshot.sourceDraftIdentity, snapshot.sourceReviewIdentity, snapshot.sourceSemanticIdentity]) {
        if (nested?.projectId !== projectId) add("SOURCE_IDENTITY_MISMATCH", { field: "nestedProjectId", value: nested?.projectId });
      }
      if (snapshot.sourceDraftIdentity?.id !== review.sourceDraftId || snapshot.sourceDraftIdentity?.revision !== review.sourceDraftRevision || snapshot.sourceDraftIdentity?.algorithmVersion !== review.sourceDraftAlgorithmVersion) add("SOURCE_IDENTITY_MISMATCH", { stage: 20, field: "reviewSourceIdentity" });
      if (snapshot.sourceReviewIdentity?.id !== review.sourceReviewId || snapshot.sourceReviewIdentity?.revision !== review.sourceReviewRevision) add("SOURCE_IDENTITY_MISMATCH", { stage: 19, field: "reviewSourceIdentity" });
      if (snapshot.sourceSemanticIdentity?.id !== review.sourceSemanticAnalysisId || snapshot.sourceSemanticIdentity?.revision !== review.sourceSemanticAnalysisRevision) add("SOURCE_IDENTITY_MISMATCH", { stage: 18, field: "reviewSourceIdentity" });
      if (snapshot.sourceImportRevision !== review.sourceImportRevision) add("SOURCE_IMPORT_REVISION_MISMATCH");
      if (snapshot.sourceFingerprints?.draft !== review.sourceDraftFingerprint) add("SOURCE_IDENTITY_MISMATCH", { stage: 20, field: "draftFingerprint" });
      if (!object(snapshot.finalDraft) || snapshot.finalDraft.projectSummary?.projectId !== projectId) add("SOURCE_IDENTITY_MISMATCH", { field: "finalDraft" });
    }
    validateCurrentIdentity(identity, projectId, context, add);
    const stable = stableDiagnostics(diagnostics);
    return { isValid: stable.length === 0, diagnostics: stable, identity, calculatedSnapshotFingerprint };
  }

  function validateCurrentIdentity(identity, projectId, context, add) {
    const draft = context.technologyDraft || null;
    const analysisReview = context.analysisReview || null;
    const semantic = context.semanticAnalysis || null;
    if (draft) {
      if (draft.projectId !== projectId || draft.sourceProjectId !== projectId || draft.id !== identity.sourceTechnologyDraftId || draft.revision !== identity.sourceTechnologyDraftRevision || draft.draftFingerprint !== identity.sourceTechnologyDraftFingerprint || draft.algorithmVersion !== identity.sourceAlgorithmVersion) add("SOURCE_IDENTITY_MISMATCH", { stage: 20 });
      if (draft.sourceImportRevision !== identity.sourceImportRevision) add("SOURCE_IMPORT_REVISION_MISMATCH", { stage: 20 });
    }
    if (analysisReview) {
      if (analysisReview.projectId !== projectId || analysisReview.id !== identity.sourceAnalysisReviewId || analysisReview.revision !== identity.sourceAnalysisReviewRevision) add("SOURCE_IDENTITY_MISMATCH", { stage: 19 });
      if (analysisReview.sourceImportRevision !== identity.sourceImportRevision) add("SOURCE_IMPORT_REVISION_MISMATCH", { stage: 19 });
    }
    if (semantic) {
      if (semantic.projectId !== projectId || semantic.id !== identity.sourceSemanticAnalysisId || semantic.revision !== identity.sourceSemanticAnalysisRevision) add("SOURCE_IDENTITY_MISMATCH", { stage: 18 });
      if (semantic.sourceImportRevision !== identity.sourceImportRevision) add("SOURCE_IMPORT_REVISION_MISMATCH", { stage: 18 });
    }
    if (context.requireCurrentIdentity && (!draft || !analysisReview || !semantic)) add("SOURCE_IDENTITY_MISMATCH", { field: "currentReferences" });
  }

  function createInitialState(projectId, review = null, now = timestampNow()) {
    if (!text(projectId) || !isTimestamp(now)) throw planError("STRUCTURAL_VALIDATION_FAILED", "Нельзя создать запись Stage 22 с повреждённой identity.");
    const identity = review ? sourceIdentity(review) : sourceIdentity(null);
    const state = {
      id: makeId(), projectId, kind: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      revision: 1, status: "waiting", createdAt: now, updatedAt: now,
      ...identity,
      planningAlgorithmVersion: PLANNING_ALGORITHM_VERSION,
      planningInputFingerprint: review?.confirmedSnapshot ? planningInputFingerprint(review) : null,
      planFingerprint: null, plan: null,
      validation: emptyValidation(now, 1), blockers: [], warnings: [], audit: [],
      error: null, interruptedOperation: null, lastSuccessfulPhase: null,
    };
    appendAudit(state, auditEntry("PLAN_CREATED", state, now));
    return deepFreeze(state);
  }

  function planningInputFingerprint(review, algorithmVersion = PLANNING_ALGORITHM_VERSION) {
    const identity = sourceIdentity(review);
    return fingerprint({
      planningAlgorithmVersion: algorithmVersion,
      sourceConfirmedSnapshotFingerprint: identity.sourceConfirmedSnapshotFingerprint,
      sourceTechnologyReviewId: identity.sourceTechnologyReviewId,
      sourceTechnologyReviewRevision: identity.sourceTechnologyReviewRevision,
      sourceTechnologyReviewFingerprint: identity.sourceTechnologyReviewFingerprint,
      sourceTechnologyDraftId: identity.sourceTechnologyDraftId,
      sourceTechnologyDraftRevision: identity.sourceTechnologyDraftRevision,
      sourceTechnologyDraftFingerprint: identity.sourceTechnologyDraftFingerprint,
      sourceAnalysisReviewId: identity.sourceAnalysisReviewId,
      sourceAnalysisReviewRevision: identity.sourceAnalysisReviewRevision,
      sourceAnalysisReviewFingerprint: identity.sourceAnalysisReviewFingerprint,
      sourceSemanticAnalysisId: identity.sourceSemanticAnalysisId,
      sourceSemanticAnalysisRevision: identity.sourceSemanticAnalysisRevision,
      sourceSemanticAnalysisFingerprint: identity.sourceSemanticAnalysisFingerprint,
      sourceImportRevision: identity.sourceImportRevision,
      sourceAlgorithmVersion: identity.sourceAlgorithmVersion,
    });
  }

  function beginPlanning(state, review, context = {}, now = timestampNow(), operationType = "build") {
    requireState(state);
    const validation = validateSourceReview(review, state.projectId, context);
    if (!validation.isValid) throw planError(validation.diagnostics[0].code, validation.diagnostics[0].message, validation.diagnostics[0].details);
    const inputFingerprint = planningInputFingerprint(review, state.planningAlgorithmVersion);
    if (["ready", "blocked"].includes(state.status) && state.planningInputFingerprint === inputFingerprint && state.plan && state.planFingerprint === calculatePlanFingerprint(state)) return copy(state);
    const next = mutable(state);
    next.revision += 1;
    next.status = "planning";
    next.updatedAt = now;
    Object.assign(next, validation.identity);
    next.sourceTechnologyReviewFingerprint = technologyReviewFingerprint(review);
    next.planningInputFingerprint = inputFingerprint;
    next.error = null;
    next.interruptedOperation = {
      operationId: stableId("planning-operation", { id: state.id, inputFingerprint, operationType }),
      type: operationType, status: "in_progress", startedAt: now, baseRevision: state.revision,
      phase: "validate_source",
    };
    next.lastSuccessfulPhase = "validate_source";
    appendAudit(next, auditEntry(operationType === "retry" ? "PLANNING_RETRIED" : "PLANNING_STARTED", next, now, { operationType }));
    appendPhaseAudit(next, "validate_source", now);
    return deepFreeze(next);
  }

  function completePlanning(state, review, context = {}, now = timestampNow(), operationType = null) {
    requireState(state);
    if (state.status !== "planning" || state.interruptedOperation?.status !== "in_progress") throw planError("PLANNING_OPERATION_INVALID", "Построение плана не было начато.");
    const sourceValidation = validateSourceReview(review, state.projectId, context);
    if (!sourceValidation.isValid) throw planError(sourceValidation.diagnostics[0].code, sourceValidation.diagnostics[0].message, sourceValidation.diagnostics[0].details);
    if (state.planningInputFingerprint !== planningInputFingerprint(review, state.planningAlgorithmVersion)) throw planError("SOURCE_IDENTITY_MISMATCH", "Источник изменился во время построения плана.");
    const next = mutable(state);
    const derived = derivePlan(review.confirmedSnapshot);
    for (const phaseName of PLANNING_PHASES.slice(1, -1)) {
      next.lastSuccessfulPhase = phaseName;
      next.interruptedOperation.phase = phaseName;
      appendPhaseAudit(next, phaseName, now);
    }
    next.plan = derived.plan;
    next.blockers = derived.blockers;
    next.warnings = derived.warnings;
    next.revision += 1;
    next.updatedAt = now;
    next.interruptedOperation.phase = "persist_plan";
    next.lastSuccessfulPhase = "persist_plan";
    const validation = validatePlanState(next, review, context, now);
    next.validation = validation;
    if (validation.structural.some(isCritical) || validation.semantic.some((entry) => isCritical(entry) && !["FIRST_ACTION_BLOCKED"].includes(entry.code)) || validation.source.some(isCritical)) {
      next.status = "failed";
      next.error = { code: validation.diagnostics[0]?.code || "VALIDATION_FAILED", message: validation.diagnostics[0]?.message || "План не прошёл проверку." };
      appendAudit(next, auditEntry("VALIDATION_FAILED", next, now, { codes: validation.diagnostics.map((entry) => entry.code) }));
    } else {
      const blocked = next.blockers.some(isCritical) || !next.plan.firstAction?.ready;
      next.status = blocked ? "blocked" : "ready";
      next.error = null;
    }
    next.planFingerprint = calculatePlanFingerprint(next);
    next.plan.planFingerprint = next.planFingerprint;
    const recheck = validatePlanState(next, review, context, now);
    if (next.planFingerprint !== calculatePlanFingerprint(next) || recheck.source.some(isCritical) || recheck.structural.some(isCritical)) throw planError("PLAN_FINGERPRINT_MISMATCH", "Сохранённый план не прошёл повторную проверку fingerprint.");
    next.validation = recheck;
    next.interruptedOperation = null;
    appendPhaseAudit(next, "persist_plan", now);
    appendAudit(next, auditEntry(next.status === "ready" ? "PLAN_READY" : next.status === "blocked" ? "PLAN_BLOCKED" : "VALIDATION_FAILED", next, now, { planFingerprint: next.planFingerprint }));
    if ((operationType || state.interruptedOperation.type) === "rebuild") appendAudit(next, auditEntry("PLAN_REBUILT", next, now, { planFingerprint: next.planFingerprint }));
    return deepFreeze(next);
  }

  function buildState(state, review, context = {}, now = timestampNow(), operationType = "build") {
    const input = planningInputFingerprint(review, state?.planningAlgorithmVersion ?? PLANNING_ALGORITHM_VERSION);
    if (["ready", "blocked"].includes(state?.status) && state.planningInputFingerprint === input && state.plan && state.planFingerprint === calculatePlanFingerprint(state)) return copy(state);
    return completePlanning(beginPlanning(state, review, context, now, operationType), review, context, now, operationType);
  }

  function derivePlan(snapshot) {
    const draft = copy(snapshot.finalDraft);
    const provenanceIndex = new Map(array(draft.provenance).map((entry) => [entry.id, entry]));
    const sourceRefs = (entity) => stableStrings([entity?.id, ...array(entity?.provenanceRefs)].filter(Boolean));
    const components = deriveComponents(draft, sourceRefs);
    const prerequisitesResult = derivePrerequisites(draft, sourceRefs);
    const phases = derivePhases(draft, components, sourceRefs);
    wireDependencies(phases, components);
    const dependencyGraph = buildDependencyGraph(phases, components);
    const checkpoints = deriveCheckpoints(draft, components, phases, sourceRefs);
    for (const phase of phases) phase.checkpoints = checkpoints.filter((entry) => entry.phaseId === phase.id).map((entry) => entry.id);
    const blockers = deriveBlockers(draft, prerequisitesResult.prerequisites, components, phases, sourceRefs);
    const graphDiagnostics = validateGraph(phases, dependencyGraph);
    graphDiagnostics.filter(isCritical).forEach((entry) => blockers.push(blocker(entry.code, entry.message, { relatedPhaseIds: entry.relatedPhaseIds, details: entry.details })));
    const stableBlockers = stableBlockersList(blockers);
    applyBlockingState(prerequisitesResult.prerequisites, components, phases, stableBlockers);
    const firstAction = determineFirstAction(phases, stableBlockers);
    if (!firstAction.ready && !stableBlockers.some((entry) => entry.code === "FIRST_ACTION_BLOCKED")) stableBlockers.push(blocker("FIRST_ACTION_BLOCKED", "Первое действие недоступно, пока не устранены обязательные блокировки.", { relatedPhaseIds: firstAction.phaseId ? [firstAction.phaseId] : [] }));
    firstAction.blockedBy = stableBlockers.filter(isCritical).map((entry) => entry.id).sort(lexical);
    firstAction.ready = firstAction.ready && firstAction.blockedBy.length === 0;
    const unresolved = stableUnresolved([
      ...array(snapshot.unresolvedNonBlockingItems).map((entry) => ({ id: stableId("unresolved", entry), code: entry.code || "CONFIRMED_UNRESOLVED_ITEM", message: text(entry.comment) || "В подтверждённой технологии осталось некритическое уточнение.", sourceTargetIds: stableStrings([entry.targetId].filter(Boolean)), blocking: false })),
      ...array(draft.missingInformation).filter((entry) => !isCriticalLevel(entry)).map((entry) => ({ id: stableId("unresolved", entry), code: entry.code || "MISSING_INFORMATION", message: text(entry.message) || "В подтверждённой технологии отсутствует некритическое значение.", sourceTargetIds: sourceRefs(entry), blocking: false })),
    ]);
    const warnings = stableWarnings([
      ...prerequisitesResult.warnings,
      ...array(snapshot.warnings).map((entry) => warning(entry.code || "SOURCE_WARNING", text(entry.message) || "Предупреждение подтверждённой технологии.", sourceRefs(entry))),
      ...array(draft.warnings).filter((entry) => !isCriticalLevel(entry)).map((entry) => warning(entry.code || "SOURCE_WARNING", text(entry.message) || "Предупреждение подтверждённой технологии.", sourceRefs(entry))),
    ]);
    const plan = {
      schemaVersion: SCHEMA_VERSION,
      summary: deriveSummary(draft, components, phases, stableBlockers),
      prerequisites: prerequisitesResult.prerequisites,
      materials: array(draft.materials).map((entry) => planResource(entry, sourceRefs)),
      tools: array(draft.tools).map((entry) => planResource(entry, sourceRefs)),
      measurements: deriveMeasurements(draft, sourceRefs),
      gauge: array(draft.gauge).map((entry) => ({ id: stableId("plan-gauge", { sourceId: entry.id }), value: copy(entry.normalized ?? entry.value), unit: entry.unit ?? entry.normalized?.unit ?? null, sourceTargetIds: sourceRefs(entry) })),
      components, phases, dependencyGraph, checkpoints, firstAction,
      unresolved,
      completionCriteria: deriveCompletionCriteria(components, phases),
      planFingerprint: null,
    };
    return { plan, blockers: stableBlockersList(stableBlockers), warnings };
  }

  function deriveComponents(draft, sourceRefs) {
    const result = [];
    const sourceComponents = array(draft.components).slice().sort(compareEntity);
    for (const source of sourceComponents) {
      const rawQuantity = positiveInteger(source.quantity ?? source.value?.quantity) || 1;
      const baseType = slug(text(source.type ?? source.role ?? source.name ?? source.value?.name) || "component");
      for (let index = 1; index <= rawQuantity; index += 1) {
        const id = stableId("component", { sourceId: source.id, instance: index });
        result.push({
          id, type: baseType, label: componentLabel(source, index, rawQuantity), quantity: 1,
          constructionRole: text(source.constructionRole ?? source.role) || "component",
          parentComponentId: null, sourceTargetIds: sourceRefs(source), dependencies: [],
          completionCriteria: [{ type: "source_component_complete", sourceTargetIds: sourceRefs(source) }],
          status: "planned", sourceComponentId: source.id, instance: index,
        });
      }
    }
    return result.sort((left, right) => compareEntity(left, right));
  }

  function derivePrerequisites(draft, sourceRefs) {
    const prerequisites = [];
    const warnings = [];
    const add = (type, label, entries, requiredWhen) => {
      const present = entries.length > 0;
      prerequisites.push({
        id: stableId("prerequisite", { type }), type, label,
        status: present ? "satisfied" : requiredWhen ? "required" : "not_applicable",
        evidence: present ? entries.flatMap(sourceRefs).sort(lexical) : [],
        relatedTargetIds: present ? entries.flatMap(sourceRefs).sort(lexical) : [],
      });
    };
    const operations = array(draft.operations);
    const needsCraftResources = operations.length > 0 && text(draft.craft?.type ?? draft.craft?.value).toLowerCase().includes("knit");
    add("source_instruction_confirmed", "Подтверждённая технология", draft.product ? [draft.product] : draft.craft ? [draft.craft] : [], true);
    add("yarn_available", "Материалы подготовлены", [...array(draft.materials), ...array(draft.yarn)], needsCraftResources);
    add("tools_available", "Инструменты подготовлены", array(draft.tools), needsCraftResources);
    add("gauge_confirmed", "Плотность подтверждена", array(draft.gauge), operations.some(operationNeedsGauge));
    add("size_confirmed", "Размер подтверждён", array(draft.sizes), operations.some(operationNeedsSize));
    add("measurements_confirmed", "Контрольные размеры подтверждены", deriveMeasurementEntities(draft), operations.some(operationNeedsMeasurement));
    add("construction_confirmed", "Конструкция подтверждена", array(draft.construction), array(draft.components).length > 1);
    for (const prerequisite of prerequisites) if (prerequisite.status === "not_applicable") warnings.push(warning("PREREQUISITE_NOT_APPLICABLE", `${prerequisite.label}: не требуется подтверждённой технологией.`, prerequisite.relatedTargetIds));
    return { prerequisites, warnings };
  }

  function derivePhases(draft, components, sourceRefs) {
    const operations = array(draft.operations).slice().sort((left, right) => numericOrder(left.order) - numericOrder(right.order) || compareEntity(left, right));
    const componentInstances = new Map();
    for (const component of components) {
      if (!componentInstances.has(component.sourceComponentId)) componentInstances.set(component.sourceComponentId, []);
      componentInstances.get(component.sourceComponentId).push(component);
    }
    const groups = [];
    for (const operation of operations) {
      const instances = componentInstances.get(operation.componentId) || [null];
      for (const component of instances) {
        const type = operationPhaseType(operation);
        const key = `${component?.id || "global"}|${type}`;
        const previous = groups.at(-1);
        if (previous && previous.key === key) previous.operations.push(operation);
        else groups.push({ key, type, component, operations: [operation] });
      }
    }
    const phases = groups.map((group, index) => {
      const sourceTargetIds = stableStrings(group.operations.flatMap(sourceRefs));
      const phaseId = stableId("phase", { type: group.type, componentId: group.component?.id ?? null, sourceIds: group.operations.map((entry) => entry.id) });
      const actions = group.operations.map((operation, actionIndex) => ({
        id: stableId("action", { phaseId, sourceOperationId: operation.id, actionIndex }),
        order: actionIndex + 1, type: operation.type,
        title: actionTitle(operation), description: actionDescription(operation),
        sourceTargetIds: sourceRefs(operation),
      }));
      return {
        id: phaseId, order: index + 1, type: group.type, title: phaseTitle(group.type, group.component?.label),
        componentIds: group.component ? [group.component.id] : [], dependsOnPhaseIds: [], canRunInParallelWith: [],
        sourceTargetIds, entryCriteria: [], actions,
        exitCriteria: [{ type: "confirmed_operations_complete", actionIds: actions.map((entry) => entry.id), sourceTargetIds }],
        checkpoints: [], unresolved: [], status: "ready",
      };
    });
    return phases;
  }

  function wireDependencies(phases, components) {
    const lastByComponent = new Map();
    for (const phase of phases) {
      if (["joining", "edge_finishing", "closure", "blocking", "final_inspection"].includes(phase.type)) {
        phase.dependsOnPhaseIds = stableStrings([...lastByComponent.values()]);
      } else if (phase.componentIds.length) {
        const previous = lastByComponent.get(phase.componentIds[0]);
        if (previous) phase.dependsOnPhaseIds = [previous];
      } else {
        const previous = phases.filter((entry) => entry.order < phase.order).at(-1);
        if (previous) phase.dependsOnPhaseIds = [previous.id];
      }
      phase.entryCriteria = phase.dependsOnPhaseIds.map((phaseId) => ({ type: "phase_complete", phaseId }));
      for (const componentId of phase.componentIds) lastByComponent.set(componentId, phase.id);
      if (!phase.componentIds.length && !["joining", "edge_finishing", "closure", "blocking", "final_inspection"].includes(phase.type)) lastByComponent.set("global", phase.id);
    }
    const sourceGroups = new Map();
    for (const component of components) {
      if (!sourceGroups.has(component.sourceComponentId)) sourceGroups.set(component.sourceComponentId, []);
      sourceGroups.get(component.sourceComponentId).push(component.id);
    }
    for (const ids of sourceGroups.values()) {
      if (ids.length < 2) continue;
      const byInstance = ids.map((id) => phases.filter((phase) => phase.componentIds.includes(id) && !["joining", "edge_finishing", "closure"].includes(phase.type)));
      for (let left = 0; left < byInstance.length; left += 1) for (let right = left + 1; right < byInstance.length; right += 1) {
        for (const phase of byInstance[left]) phase.canRunInParallelWith.push(...byInstance[right].filter((candidate) => candidate.type === phase.type).map((candidate) => candidate.id));
        for (const phase of byInstance[right]) phase.canRunInParallelWith.push(...byInstance[left].filter((candidate) => candidate.type === phase.type).map((candidate) => candidate.id));
      }
    }
    phases.forEach((phase, index) => { phase.order = index + 1; phase.dependsOnPhaseIds = stableStrings(phase.dependsOnPhaseIds); phase.canRunInParallelWith = stableStrings(phase.canRunInParallelWith); });
  }

  function buildDependencyGraph(phases, components) {
    return {
      nodes: phases.map((phase) => ({ id: phase.id, type: "phase", order: phase.order, required: true })),
      edges: phases.flatMap((phase) => phase.dependsOnPhaseIds.map((dependencyId) => ({ id: stableId("edge", { from: dependencyId, to: phase.id }), from: dependencyId, to: phase.id, type: "depends_on" }))),
      componentNodes: components.map((component) => ({ id: component.id, type: "component" })),
    };
  }

  function deriveCheckpoints(draft, components, phases, sourceRefs) {
    const result = [];
    const firstPhase = phases[0] || null;
    for (const gauge of array(draft.gauge)) if (firstPhase) result.push(checkpoint("gauge_check", firstPhase.id, [], copy(gauge.normalized ?? gauge.value), gauge.unit ?? gauge.normalized?.unit ?? null, sourceRefs(gauge)));
    const phaseBySource = new Map();
    for (const phase of phases) for (const sourceId of phase.sourceTargetIds) if (!phaseBySource.has(sourceId)) phaseBySource.set(sourceId, phase);
    for (const operation of array(draft.operations)) {
      const phase = phaseBySource.get(operation.id);
      const expected = integer(operation.stitchCountAfter ?? operation.parameters?.confirmedCount);
      if (phase && expected !== null) result.push(checkpoint("stitch_count_check", phase.id, phase.componentIds, expected, "stitches", sourceRefs(operation)));
    }
    for (const component of components) {
      const phase = phases.filter((entry) => entry.componentIds.includes(component.id)).at(-1);
      if (phase) result.push(checkpoint("component_completion_check", phase.id, [component.id], "completed", null, component.sourceTargetIds));
    }
    for (const phase of phases.filter((entry) => entry.type === "joining")) result.push(checkpoint("join_check", phase.id, phase.componentIds, "completed", null, phase.sourceTargetIds));
    for (const phase of phases.filter((entry) => ["edge_finishing", "closure", "blocking", "final_inspection"].includes(entry.type))) result.push(checkpoint("finishing_check", phase.id, phase.componentIds, "completed", null, phase.sourceTargetIds));
    const unique = new Map();
    for (const entry of result) unique.set(entry.id, entry);
    return [...unique.values()].sort((left, right) => phaseOrder(phases, left.phaseId) - phaseOrder(phases, right.phaseId) || lexical(left.id, right.id));
  }

  function checkpoint(type, phaseId, componentIds, expectedValue, unit, sourceTargetIds) {
    return {
      id: stableId("checkpoint", { type, phaseId, componentIds, expectedValue, unit, sourceTargetIds }), type, phaseId,
      componentIds: stableStrings(componentIds), expectedValue: copy(expectedValue), unit: unit ?? null,
      sourceTargetIds: stableStrings(sourceTargetIds), required: true, blockingOnFailure: true,
    };
  }

  function deriveBlockers(draft, prerequisites, components, phases, sourceRefs) {
    const result = [];
    for (const prerequisite of prerequisites.filter((entry) => ["required", "unresolved"].includes(entry.status))) {
      const codes = { yarn_available: "REQUIRED_MATERIAL_MISSING", tools_available: "REQUIRED_TOOL_MISSING", gauge_confirmed: "REQUIRED_GAUGE_MISSING", size_confirmed: "REQUIRED_SIZE_MISSING", measurements_confirmed: "REQUIRED_MEASUREMENT_MISSING", construction_confirmed: "COMPONENT_STRUCTURE_UNRESOLVED", source_instruction_confirmed: "EXECUTION_ORDER_UNRESOLVED" };
      result.push(blocker(codes[prerequisite.type] || "FIRST_ACTION_BLOCKED", `${prerequisite.label}: нет подтверждённых данных.`, { sourceTargetIds: prerequisite.relatedTargetIds, details: { prerequisiteId: prerequisite.id } }));
    }
    for (const issue of [...array(draft.missingInformation), ...array(draft.conflicts)]) {
      if (!isCriticalLevel(issue) || issue.resolved) continue;
      result.push(blocker(mapSourceIssueCode(issue.code), text(issue.message) || "Подтверждённая технология содержит обязательное неразрешённое значение.", { sourceTargetIds: sourceRefs(issue), details: { sourceCode: issue.code || null } }));
    }
    if (!phases.length) result.push(blocker("EXECUTION_ORDER_UNRESOLVED", "В подтверждённой технологии нет операций, из которых можно определить порядок выполнения."));
    for (const component of components.filter((entry) => !phases.some((phase) => phase.componentIds.includes(entry.id)))) result.push(blocker("EXECUTION_ORDER_UNRESOLVED", `Для компонента «${component.label}» не подтверждён порядок выполнения.`, { relatedComponentIds: [component.id], sourceTargetIds: component.sourceTargetIds }));
    for (const phase of phases) for (const action of phase.actions) {
      if (action.type === "cast_on") {
        const source = array(draft.operations).find((entry) => entry.id === action.sourceTargetIds[0] || action.sourceTargetIds.includes(entry.id));
        if (source && integer(source.parameters?.confirmedCount ?? source.stitchCountAfter) === null) result.push(blocker("REQUIRED_STITCH_COUNT_MISSING", "Для подтверждённого набора петель отсутствует количество.", { relatedPhaseIds: [phase.id], relatedComponentIds: phase.componentIds, sourceTargetIds: action.sourceTargetIds }));
      }
      if (["increase", "decrease"].includes(action.type)) {
        const source = array(draft.operations).find((entry) => action.sourceTargetIds.includes(entry.id));
        if (source && integer(source.countDelta) === null && !text(source.instructionSource)) result.push(blocker("SHAPING_INSTRUCTION_UNRESOLVED", "Для формирования отсутствует подтверждённая инструкция.", { relatedPhaseIds: [phase.id], relatedComponentIds: phase.componentIds, sourceTargetIds: action.sourceTargetIds }));
      }
      if (["join", "seam"].includes(action.type)) {
        const source = array(draft.operations).find((entry) => action.sourceTargetIds.includes(entry.id));
        if (source && !text(source.instructionSource)) result.push(blocker("JOIN_METHOD_UNRESOLVED", "Способ соединения деталей не подтверждён.", { relatedPhaseIds: [phase.id], relatedComponentIds: phase.componentIds, sourceTargetIds: action.sourceTargetIds }));
      }
    }
    return result;
  }

  function determineFirstAction(phases, blockers) {
    const phase = phases.find((entry) => entry.dependsOnPhaseIds.length === 0 && entry.actions.length > 0) || null;
    const action = phase?.actions[0] || null;
    const blockedIds = blockers.filter(isCritical).map((entry) => entry.id).sort(lexical);
    return {
      phaseId: phase?.id ?? null, actionId: action?.id ?? null,
      title: action?.title ?? "Начало недоступно",
      description: action ? action.description : "Начать выполнение пока нельзя: сначала уточните обязательные данные подтверждённой технологии.",
      prerequisites: [], sourceTargetIds: action?.sourceTargetIds ?? [], ready: Boolean(action) && blockedIds.length === 0, blockedBy: blockedIds,
    };
  }

  function validateStructural(stateOrPlan) {
    const state = stateOrPlan?.kind === PROGRESS_KIND ? stateOrPlan : { plan: stateOrPlan, blockers: [], warnings: [], planFingerprint: stateOrPlan?.planFingerprint };
    const diagnostics = [];
    const add = (code, details = {}) => diagnostics.push(diagnostic(code, "critical", structuralMessage(code), details));
    const plan = state.plan;
    if (!object(plan) || plan.schemaVersion !== SCHEMA_VERSION) add("PLAN_SCHEMA_INVALID");
    for (const key of ["prerequisites", "materials", "tools", "measurements", "gauge", "components", "phases", "checkpoints", "unresolved", "completionCriteria"]) if (!Array.isArray(plan?.[key])) add("PLAN_SCHEMA_INVALID", { field: key });
    if (!object(plan?.dependencyGraph) || !Array.isArray(plan?.dependencyGraph?.nodes) || !Array.isArray(plan?.dependencyGraph?.edges)) add("PLAN_SCHEMA_INVALID", { field: "dependencyGraph" });
    if (!object(plan?.summary) || !object(plan?.firstAction)) add("PLAN_SCHEMA_INVALID");
    const collections = [array(plan?.prerequisites), array(plan?.components), array(plan?.phases), array(plan?.checkpoints)];
    const allIds = new Set();
    for (const collection of collections) for (const entry of collection) {
      if (!text(entry?.id) || allIds.has(entry.id)) add("DUPLICATE_PLAN_ID", { id: entry?.id ?? null });
      allIds.add(entry?.id);
    }
    for (const phase of array(plan?.phases)) {
      if (!PHASE_TYPES.includes(phase.type) || !PHASE_STATUSES.includes(phase.status) || !positiveInteger(phase.order) || !Array.isArray(phase.actions) || !Array.isArray(phase.sourceTargetIds)) add("PLAN_SCHEMA_INVALID", { phaseId: phase.id });
      const actionIds = new Set(); for (const action of array(phase.actions)) { if (!text(action.id) || actionIds.has(action.id) || !Array.isArray(action.sourceTargetIds)) add("DUPLICATE_PLAN_ID", { id: action.id }); actionIds.add(action.id); }
    }
    for (const prerequisite of array(plan?.prerequisites)) if (!PREREQUISITE_STATUSES.includes(prerequisite.status)) add("PLAN_SCHEMA_INVALID", { prerequisiteId: prerequisite.id });
    for (const component of array(plan?.components)) if (!COMPONENT_STATUSES.includes(component.status)) add("PLAN_SCHEMA_INVALID", { componentId: component.id });
    for (const blockerEntry of array(state.blockers)) if (!text(blockerEntry.id) || !text(blockerEntry.code) || !Array.isArray(blockerEntry.sourceTargetIds)) add("PLAN_SCHEMA_INVALID", { field: "blockers" });
    return stableDiagnostics(diagnostics);
  }

  function validateSemantic(stateOrPlan) {
    const state = stateOrPlan?.kind === PROGRESS_KIND ? stateOrPlan : { plan: stateOrPlan, blockers: [] };
    const plan = state.plan;
    const diagnostics = [];
    if (!plan) return [diagnostic("PLAN_SCHEMA_INVALID", "critical", "План отсутствует.")];
    const phaseIds = new Set(array(plan.phases).map((entry) => entry.id));
    const componentIds = new Set(array(plan.components).map((entry) => entry.id));
    const actionIds = new Set(array(plan.phases).flatMap((entry) => array(entry.actions).map((action) => action.id)));
    const checkpointIds = new Set(array(plan.checkpoints).map((entry) => entry.id));
    for (const phase of array(plan.phases)) {
      for (const ref of [...array(phase.dependsOnPhaseIds), ...array(phase.canRunInParallelWith)]) if (!phaseIds.has(ref)) diagnostics.push(diagnostic("DEPENDENCY_REFERENCE_INVALID", "critical", "Фаза ссылается на отсутствующую фазу.", { phaseId: phase.id, referenceId: ref }, [phase.id]));
      for (const ref of array(phase.componentIds)) if (!componentIds.has(ref)) diagnostics.push(diagnostic("DEPENDENCY_REFERENCE_INVALID", "critical", "Фаза ссылается на отсутствующий компонент.", { phaseId: phase.id, referenceId: ref }, [phase.id], [ref]));
      for (const ref of array(phase.checkpoints)) if (!checkpointIds.has(ref)) diagnostics.push(diagnostic("DEPENDENCY_REFERENCE_INVALID", "critical", "Фаза ссылается на отсутствующую контрольную точку.", { phaseId: phase.id, referenceId: ref }, [phase.id]));
      for (const dependencyId of array(phase.dependsOnPhaseIds)) if (phaseOrder(plan.phases, dependencyId) >= phase.order) diagnostics.push(diagnostic("EXECUTION_ORDER_UNRESOLVED", "critical", "Порядок фаз противоречит зависимости.", { phaseId: phase.id, dependencyId }, [phase.id, dependencyId]));
      for (const parallelId of array(phase.canRunInParallelWith)) if (dependsTransitively(plan.phases, phase.id, parallelId) || dependsTransitively(plan.phases, parallelId, phase.id)) diagnostics.push(diagnostic("EXECUTION_ORDER_UNRESOLVED", "critical", "Параллельные фазы зависят друг от друга.", { phaseId: phase.id, parallelId }, [phase.id, parallelId]));
    }
    diagnostics.push(...validateGraph(plan.phases, plan.dependencyGraph));
    for (const checkpointEntry of array(plan.checkpoints)) if (!phaseIds.has(checkpointEntry.phaseId) || array(checkpointEntry.componentIds).some((id) => !componentIds.has(id))) diagnostics.push(diagnostic("DEPENDENCY_REFERENCE_INVALID", "critical", "Контрольная точка содержит недействительную ссылку.", { checkpointId: checkpointEntry.id }));
    const provenanceTargets = [
      ...array(plan.components), ...array(plan.phases), ...array(plan.phases).flatMap((entry) => array(entry.actions)),
      ...array(plan.checkpoints), ...array(plan.materials), ...array(plan.tools), ...array(plan.measurements), ...array(plan.gauge),
    ];
    for (const entry of provenanceTargets) if (!Array.isArray(entry.sourceTargetIds) || !entry.sourceTargetIds.length) diagnostics.push(diagnostic("PLAN_PROVENANCE_MISSING", "critical", "Элемент плана не имеет provenance в confirmedSnapshot.", { id: entry.id ?? null }));
    for (const prerequisite of array(plan.prerequisites).filter((entry) => entry.status === "satisfied")) if (!Array.isArray(prerequisite.evidence) || !prerequisite.evidence.length) diagnostics.push(diagnostic("PLAN_PROVENANCE_MISSING", "critical", "Удовлетворённый prerequisite не имеет доказательства.", { id: prerequisite.id }));
    if (plan.firstAction.phaseId && !phaseIds.has(plan.firstAction.phaseId) || plan.firstAction.actionId && !actionIds.has(plan.firstAction.actionId)) diagnostics.push(diagnostic("FIRST_ACTION_INVALID", "critical", "Первое действие не принадлежит плану."));
    if (plan.firstAction.ready && array(plan.firstAction.blockedBy).length) diagnostics.push(diagnostic("FIRST_ACTION_BLOCKED", "critical", "Готовое первое действие содержит блокировки."));
    if (state.status === "blocked" && !array(state.blockers).some(isCritical)) diagnostics.push(diagnostic("BLOCKED_WITHOUT_BLOCKER", "critical", "Заблокированный план не содержит критической причины."));
    if (state.status === "ready" && (!plan.firstAction.ready || array(state.blockers).some(isCritical))) diagnostics.push(diagnostic("READY_PLAN_BLOCKED", "critical", "План помечен готовым при недоступном первом действии."));
    for (const phase of array(plan.phases).filter((entry) => entry.type === "joining")) {
      const preceding = array(plan.phases).filter((entry) => entry.order < phase.order && entry.type !== "joining");
      if (array(plan.components).length > 1 && preceding.length === 0) diagnostics.push(diagnostic("EXECUTION_ORDER_UNRESOLVED", "critical", "Соединение расположено до выполнения деталей.", {}, [phase.id]));
    }
    return stableDiagnostics(diagnostics);
  }

  function validateSourceIdentity(state, review, context = {}) {
    const result = validateSourceReview(review, state?.projectId, context);
    const diagnostics = [...result.diagnostics];
    if (state) {
      const expected = result.identity;
      for (const key of Object.keys(expected)) if ((state[key] ?? null) !== (expected[key] ?? null)) diagnostics.push(diagnostic(key === "sourceImportRevision" ? "SOURCE_IMPORT_REVISION_MISMATCH" : "SOURCE_IDENTITY_MISMATCH", "critical", "Identity плана не совпадает с подтверждённым snapshot.", { field: key }));
      if (review?.confirmedSnapshot && state.planningInputFingerprint !== planningInputFingerprint(review, state.planningAlgorithmVersion)) diagnostics.push(diagnostic("PLANNING_INPUT_FINGERPRINT_MISMATCH", "critical", "Fingerprint входа планирования не совпадает с источником."));
    }
    return stableDiagnostics(diagnostics);
  }

  function validatePlanState(state, review = null, context = {}, now = timestampNow()) {
    const structural = validateStructural(state);
    const semantic = validateSemantic(state);
    const source = review ? validateSourceIdentity(state, review, context) : [];
    const diagnostics = stableDiagnostics([...structural, ...semantic, ...source]);
    return { isValid: diagnostics.filter(isCritical).length === 0, structural, semantic, source, diagnostics, validatedAt: now, validatedRevision: state?.revision ?? null };
  }

  function validateGraph(phases, graph) {
    const diagnostics = [];
    const ids = new Set(array(phases).map((entry) => entry.id));
    for (const edge of array(graph?.edges)) if (!ids.has(edge.from) || !ids.has(edge.to)) diagnostics.push(diagnostic("DEPENDENCY_REFERENCE_INVALID", "critical", "Граф содержит ссылку на отсутствующую фазу.", { edgeId: edge.id }, [edge.from, edge.to].filter(Boolean)));
    const colors = new Map();
    const visit = (id, trail) => {
      if (colors.get(id) === 1) { diagnostics.push(diagnostic("DEPENDENCY_CYCLE", "critical", "В графе фаз обнаружен цикл.", { cycle: [...trail, id] }, [...trail, id])); return; }
      if (colors.get(id) === 2) return;
      colors.set(id, 1);
      const phase = array(phases).find((entry) => entry.id === id);
      for (const dependency of array(phase?.dependsOnPhaseIds)) visit(dependency, [...trail, id]);
      colors.set(id, 2);
    };
    for (const id of ids) visit(id, []);
    return stableDiagnostics(diagnostics);
  }

  function calculatePlanFingerprint(state) {
    if (!state?.plan) return null;
    const plan = copy(state.plan);
    delete plan.planFingerprint;
    return fingerprint({
      planningInputFingerprint: state.planningInputFingerprint,
      planningAlgorithmVersion: state.planningAlgorithmVersion,
      plan,
      blockers: stableBlockersList(state.blockers), warnings: stableWarnings(state.warnings),
    });
  }

  function recoverInterruptedState(state, now = timestampNow()) {
    requireState(state);
    if (state.status !== "planning" || state.interruptedOperation?.status !== "in_progress") return copy(state);
    const next = mutable(state);
    next.revision += 1; next.status = next.plan ? (next.blockers.some(isCritical) ? "blocked" : "ready") : "waiting"; next.updatedAt = now;
    next.error = { code: "PLANNING_INTERRUPTED", message: "Незавершённое построение было безопасно остановлено; можно повторить операцию." };
    next.interruptedOperation = { ...next.interruptedOperation, status: "interrupted", interruptedAt: now };
    appendAudit(next, auditEntry("PLANNING_INTERRUPTED", next, now, { lastSuccessfulPhase: next.lastSuccessfulPhase }));
    appendAudit(next, auditEntry("PLANNING_RECOVERED", next, now, { restoredStatus: next.status }));
    return deepFreeze(next);
  }

  function markStale(state, code = "SOURCE_REVIEW_STALE", now = timestampNow()) {
    requireState(state);
    if (state.status === "stale" && state.error?.code === code) return copy(state);
    const next = mutable(state); next.revision += 1; next.status = "stale"; next.updatedAt = now;
    next.error = { code, message: sourceMessage(code) }; next.interruptedOperation = null;
    if (next.plan?.firstAction) { next.plan.firstAction.ready = false; next.plan.firstAction.blockedBy = stableStrings([...array(next.plan.firstAction.blockedBy), stableId("blocker", { code, source: next.sourceConfirmedSnapshotFingerprint })]); }
    appendAudit(next, auditEntry(code === "IMPORT_SOURCE_IDENTITY_UNPROVEN" ? "IMPORT_IDENTITY_UNPROVEN" : "PLAN_MARKED_STALE", next, now, { code, previousPlanFingerprint: state.planFingerprint }));
    return deepFreeze(next);
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project || null;
    const calculation = array(aggregate?.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null;
    if (!project || !calculation) return { state: "missing_project", project, calculation, review: null, executionPlan: null };
    const progress = array(aggregate.progress).filter((entry) => entry.calculation_id === calculation.calculation_id && entry.epoch === 1);
    const find = (kind) => progress.find((entry) => entry.kind === kind) || null;
    const reviewProgress = find("PATTERN_TECHNOLOGY_REVIEW");
    const executionProgress = find(PROGRESS_KIND);
    const context = {
      technologyDraft: find("PATTERN_TECHNOLOGY_DRAFT")?.state || null,
      analysisReview: find("PATTERN_ANALYSIS_REVIEW")?.state || null,
      semanticAnalysis: find("PATTERN_SEMANTIC_ANALYSIS")?.state || null,
      requireCurrentIdentity: true,
    };
    const review = reviewProgress?.state || null;
    const executionPlan = executionProgress?.state || null;
    const validation = validateSourceReview(review, project.project_id, context);
    if (!reviewProgress) return { state: executionPlan ? "stale" : "review_missing", reasonCode: "SOURCE_REVIEW_MISSING", project, calculation, review: null, executionPlan, executionProgress, context };
    if (!validation.isValid) return { state: executionPlan ? "stale" : "source_invalid", reasonCode: validation.diagnostics[0].code, project, calculation, review, reviewProgress, executionPlan, executionProgress, context, sourceValidation: validation };
    if (!executionPlan) return { state: "creatable", project, calculation, review, reviewProgress, executionPlan: null, context, sourceValidation: validation };
    const identityDiagnostics = validateSourceIdentity(executionPlan, review, context);
    if (identityDiagnostics.length || executionPlan.planningAlgorithmVersion !== PLANNING_ALGORITHM_VERSION) return { state: "stale", reasonCode: identityDiagnostics[0]?.code || "PLANNING_ALGORITHM_VERSION_MISMATCH", project, calculation, review, reviewProgress, executionPlan, executionProgress, context, sourceValidation: validation };
    return { state: executionPlan.status, reasonCode: executionPlan.error?.code ?? null, project, calculation, review, reviewProgress, executionPlan, executionProgress, context, sourceValidation: validation };
  }

  async function ensureForProject(repository, projectId) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.project || !inspected.calculation) return inspected;
    if (!inspected.executionPlan) {
      const initial = createInitialState(projectId, inspected.sourceValidation?.isValid ? inspected.review : null);
      await repository.ensurePatternExecutionPlan(projectId, inspected.calculation.calculation_id, initial, { operationKind: "PATTERN_EXECUTION_PLAN_CREATED", projectStage: "pattern_execution_plan_waiting" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.executionPlan?.status === "planning" && inspected.executionPlan.interruptedOperation?.status === "in_progress") {
      const recovered = recoverInterruptedState(inspected.executionPlan);
      await repository.updatePatternExecutionPlan(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_EXECUTION_PLAN_RECOVERED", projectStage: `pattern_execution_plan_${recovered.status}` });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    return inspected;
  }

  async function buildForProject(repository, projectId, operationType = "build") {
    if (activeOperations.has(projectId)) return ensureForProject(repository, projectId);
    activeOperations.add(projectId);
    try {
      let inspected = await ensureForProject(repository, projectId);
      if (!inspected.review || !inspected.sourceValidation?.isValid) throw planError(inspected.reasonCode || "SOURCE_REVIEW_MISSING", sourceMessage(inspected.reasonCode || "SOURCE_REVIEW_MISSING"));
      if (inspected.state === "stale" && operationType !== "rebuild") return inspected;
      const current = inspected.executionPlan;
      const input = planningInputFingerprint(inspected.review, current.planningAlgorithmVersion);
      if (["ready", "blocked"].includes(current.status) && current.planningInputFingerprint === input && current.plan && current.planFingerprint === calculatePlanFingerprint(current)) return inspected;
      const started = beginPlanning(current, inspected.review, inspected.context, timestampNow(), operationType);
      await repository.updatePatternExecutionPlan(projectId, inspected.calculation.calculation_id, started, { operationKind: "PATTERN_EXECUTION_PLAN_STARTED", projectStage: "pattern_execution_plan_planning" });
      inspected = inspectAggregate(await repository.getProject(projectId));
      const next = completePlanning(inspected.executionPlan, inspected.review, inspected.context, timestampNow(), operationType);
      await repository.updatePatternExecutionPlan(projectId, inspected.calculation.calculation_id, next, { operationKind: `PATTERN_EXECUTION_PLAN_${next.status.toUpperCase()}`, projectStage: `pattern_execution_plan_${next.status}` });
      return inspectAggregate(await repository.getProject(projectId));
    } finally { activeOperations.delete(projectId); }
  }

  async function rebuildForProject(repository, projectId) {
    let inspected = await ensureForProject(repository, projectId);
    if (!inspected.review || !inspected.sourceValidation?.isValid) return inspected;
    if (inspected.executionPlan.status !== "stale" && inspected.state === "stale") {
      const stale = markStale(inspected.executionPlan, inspected.reasonCode);
      await repository.updatePatternExecutionPlan(projectId, inspected.calculation.calculation_id, stale, { operationKind: "PATTERN_EXECUTION_PLAN_STALE", projectStage: "pattern_execution_plan_stale" });
    }
    return buildForProject(repository, projectId, "rebuild");
  }

  async function retryForProject(repository, projectId) { return buildForProject(repository, projectId, "retry"); }

  function applyBlockingState(prerequisites, components, phases, blockers) {
    const critical = blockers.filter(isCritical);
    for (const phase of phases) {
      const related = critical.filter((entry) => !entry.relatedPhaseIds.length || entry.relatedPhaseIds.includes(phase.id));
      if (related.length) phase.status = "blocked";
    }
    for (const component of components) if (critical.some((entry) => entry.relatedComponentIds.includes(component.id))) component.status = "blocked";
    for (const prerequisite of prerequisites) if (prerequisite.status === "required") prerequisite.status = "unresolved";
  }

  function deriveSummary(draft, components, phases, blockers) {
    return {
      craft: scalar(draft.craft?.type ?? draft.craft?.value), product: scalar(draft.product?.type ?? draft.product?.value),
      construction: array(draft.construction).map((entry) => scalar(entry.value)).filter((entry) => entry !== null),
      executionMethod: stableStrings(array(draft.construction).map((entry) => scalar(entry.value)).filter(Boolean)).join(", ") || null,
      componentCount: components.length,
      generalOrder: phases.map((entry) => ({ phaseId: entry.id, order: entry.order, title: entry.title })),
      blocked: blockers.some(isCritical),
    };
  }

  function deriveCompletionCriteria(components, phases) {
    return [
      ...components.map((entry) => ({ type: "component_complete", componentId: entry.id })),
      ...phases.filter((entry) => ["joining", "edge_finishing", "closure", "blocking", "final_inspection"].includes(entry.type)).map((entry) => ({ type: "phase_complete", phaseId: entry.id })),
    ];
  }

  function deriveMeasurements(draft, sourceRefs) { return deriveMeasurementEntities(draft).map((entry) => ({ id: stableId("measurement", { sourceId: entry.id }), value: copy(entry.value), unit: entry.unit ?? entry.value?.unit ?? null, sourceTargetIds: sourceRefs(entry) })); }
  function deriveMeasurementEntities(draft) { return [...array(draft.sizes).filter((entry) => /measurement|length|width|circumference|dimension/i.test(text(entry.type ?? entry.property))), ...array(draft.construction).filter((entry) => /measurement|length|width|circumference|dimension/i.test(text(entry.property)))]; }
  function planResource(entry, sourceRefs) { return { id: stableId("resource", { sourceId: entry.id }), type: text(entry.type ?? entry.materialType) || "resource", label: scalar(entry.value) ?? text(entry.name) ?? "Подтверждённый ресурс", value: copy(entry.value), unit: entry.unit ?? entry.value?.unit ?? null, sourceTargetIds: sourceRefs(entry) }; }

  function operationPhaseType(operation) {
    return ({ cast_on: "cast_on", knit: "main_fabric", purl: "main_fabric", work_pattern: "main_fabric", repeat: "main_fabric", increase: "shaping", decrease: "shaping", hold_stitches: "division", pick_up_stitches: "edge_finishing", join: "joining", seam: "joining", bind_off: "closure", finish: "edge_finishing" })[operation.type] || "component_work";
  }
  function phaseTitle(type, componentLabelValue) { const labels = { cast_on: "Набор петель", main_fabric: "Основная работа", shaping: "Формирование", division: "Разделение работы", component_work: "Работа над компонентом", joining: "Соединение деталей", edge_finishing: "Обработка и завершение", closure: "Закрытие петель", preparation: "Подготовка", swatch: "Образец", blocking: "Блокировка изделия", final_inspection: "Финальная проверка", foundation: "Основа" }; return `${labels[type] || type}${componentLabelValue ? ` — ${componentLabelValue}` : ""}`; }
  function actionTitle(operation) { return ({ cast_on: "Набрать подтверждённое количество петель", knit: "Выполнить подтверждённый участок", purl: "Выполнить подтверждённый участок", work_pattern: "Выполнить подтверждённый узор", repeat: "Выполнить подтверждённый повтор", increase: "Выполнить подтверждённое формирование", decrease: "Выполнить подтверждённое формирование", bind_off: "Закрыть петли подтверждённым способом", hold_stitches: "Отложить петли", pick_up_stitches: "Поднять петли подтверждённым способом", join: "Соединить детали подтверждённым способом", seam: "Выполнить подтверждённый шов", finish: "Выполнить подтверждённое завершение" })[operation.type] || "Выполнить подтверждённую операцию"; }
  function actionDescription(operation) { const count = integer(operation.parameters?.confirmedCount ?? (operation.type === "cast_on" ? operation.stitchCountAfter : null)); return count !== null ? `${actionTitle(operation)}: ${count} ${operation.parameters?.countKind === "castOn" ? "петель" : operation.parameters?.countKind || ""}.`.trim() : `${actionTitle(operation)} по подтверждённой технологии.`; }
  function componentLabel(source, index, quantity) { const base = text(source.name ?? source.label ?? source.value?.name ?? source.value) || "Компонент"; return quantity > 1 ? `${base} ${index}` : base; }
  function operationNeedsGauge(operation) { return operation.repeat?.untilLength !== null && operation.repeat?.untilLength !== undefined || operation.parameters?.length !== undefined; }
  function operationNeedsSize(operation) { return Boolean(operation.parameters?.sizeDependent); }
  function operationNeedsMeasurement(operation) { return operation.repeat?.untilLength !== null && operation.repeat?.untilLength !== undefined; }
  function mapSourceIssueCode(code) { const value = text(code); if (/GAUGE/i.test(value)) return "REQUIRED_GAUGE_MISSING"; if (/SIZE/i.test(value)) return "REQUIRED_SIZE_MISSING"; if (/MEASURE|LENGTH|DIMENSION/i.test(value)) return "REQUIRED_MEASUREMENT_MISSING"; if (/STITCH|CAST/i.test(value)) return "REQUIRED_STITCH_COUNT_MISSING"; if (/TOOL|NEEDLE/i.test(value)) return "REQUIRED_TOOL_MISSING"; if (/YARN|MATERIAL/i.test(value)) return "REQUIRED_MATERIAL_MISSING"; if (/JOIN|SEAM/i.test(value)) return "JOIN_METHOD_UNRESOLVED"; if (/SHAP|INCREASE|DECREASE/i.test(value)) return "SHAPING_INSTRUCTION_UNRESOLVED"; if (/COMPONENT/i.test(value)) return "COMPONENT_STRUCTURE_UNRESOLVED"; return "EXECUTION_ORDER_UNRESOLVED"; }

  function blocker(code, message, options = {}) { const base = { code, severity: "critical", message, relatedPhaseIds: stableStrings(options.relatedPhaseIds), relatedComponentIds: stableStrings(options.relatedComponentIds), sourceTargetIds: stableStrings(options.sourceTargetIds), details: copy(options.details || {}) }; return { id: stableId("blocker", base), ...base }; }
  function warning(code, message, sourceTargetIds = []) { const base = { code, severity: "warning", message, sourceTargetIds: stableStrings(sourceTargetIds) }; return { id: stableId("warning", base), ...base }; }
  function diagnostic(code, severity, message, details = {}, relatedPhaseIds = [], relatedComponentIds = []) { return { code, severity, message, relatedPhaseIds: stableStrings(relatedPhaseIds), relatedComponentIds: stableStrings(relatedComponentIds), details: copy(details) }; }
  function sourceMessage(code) { return ({ SOURCE_REVIEW_MISSING: "Подтверждённая технология Stage 21 не найдена.", SOURCE_REVIEW_NOT_CONFIRMED: "Stage 21 ещё не подтверждён.", SOURCE_REVIEW_STALE: "Подтверждённая технология Stage 21 устарела.", SOURCE_SNAPSHOT_MISSING: "В Stage 21 отсутствует confirmedSnapshot.", SOURCE_SNAPSHOT_FINGERPRINT_INVALID: "Fingerprint confirmedSnapshot Stage 21 не прошёл проверку.", SOURCE_IDENTITY_MISMATCH: "Identity Stage 21/20/19/18 не доказуема.", SOURCE_IMPORT_REVISION_MISMATCH: "Import revision источника не совпадает.", IMPORT_SOURCE_IDENTITY_UNPROVEN: "После импорта identity источника не может считаться доказанной.", PLANNING_ALGORITHM_VERSION_MISMATCH: "Версия алгоритма планирования изменилась." })[code] || "Источник плана недоступен или изменился."; }
  function structuralMessage(code) { return ({ PLAN_SCHEMA_INVALID: "Структура плана повреждена.", DUPLICATE_PLAN_ID: "План содержит повторяющийся ID." })[code] || "Структурная проверка плана не пройдена."; }

  function stableDiagnostics(entries) { const map = new Map(); for (const entry of entries) map.set(canonicalize({ code: entry.code, severity: entry.severity, relatedPhaseIds: stableStrings(entry.relatedPhaseIds), relatedComponentIds: stableStrings(entry.relatedComponentIds), details: entry.details || {} }), entry); return [...map.values()].sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left.details || {}), canonicalize(right.details || {}))); }
  function stableBlockersList(entries) { const map = new Map(); for (const entry of array(entries)) map.set(entry.id || stableId("blocker", entry), entry); return [...map.values()].map((entry) => ({ ...copy(entry), relatedPhaseIds: stableStrings(entry.relatedPhaseIds), relatedComponentIds: stableStrings(entry.relatedComponentIds), sourceTargetIds: stableStrings(entry.sourceTargetIds) })).sort((left, right) => lexical(left.code, right.code) || lexical(left.id, right.id)); }
  function stableWarnings(entries) { const map = new Map(); for (const entry of array(entries)) map.set(entry.id || stableId("warning", entry), entry); return [...map.values()].sort((left, right) => lexical(left.code, right.code) || lexical(left.id, right.id)); }
  function stableUnresolved(entries) { const map = new Map(); for (const entry of entries) map.set(entry.id, entry); return [...map.values()].sort((left, right) => lexical(left.code, right.code) || lexical(left.id, right.id)); }
  function isCritical(entry) { return entry?.severity === "critical" || entry?.level === "critical"; }
  function isCriticalLevel(entry) { return entry?.level === "critical" || entry?.severity === "critical"; }
  function emptyValidation(now, revision) { return { isValid: false, structural: [], semantic: [], source: [], diagnostics: [], validatedAt: now, validatedRevision: revision }; }
  function auditEntry(type, state, now, details = {}) { const semantic = { type, revision: state.revision, planningInputFingerprint: state.planningInputFingerprint, planFingerprint: state.planFingerprint, details }; return { auditId: stableId("audit", semantic), type, at: now, revision: state.revision, ...copy(details) }; }
  function appendAudit(state, entry) { if (!array(state.audit).some((item) => item.auditId === entry.auditId)) state.audit = [...array(state.audit), copy(entry)].slice(-AUDIT_LIMIT); }
  function appendPhaseAudit(state, phase, now) { appendAudit(state, auditEntry("PLANNING_PHASE_COMPLETED", state, now, { phase })); }
  function phaseOrder(phases, phaseId) { return array(phases).find((entry) => entry.id === phaseId)?.order ?? Number.MAX_SAFE_INTEGER; }
  function dependsTransitively(phases, phaseId, candidateDependency) { const seen = new Set(); const visit = (id) => { if (id === candidateDependency) return true; if (seen.has(id)) return false; seen.add(id); const phase = array(phases).find((entry) => entry.id === id); return array(phase?.dependsOnPhaseIds).some(visit); }; const phase = array(phases).find((entry) => entry.id === phaseId); return array(phase?.dependsOnPhaseIds).some(visit); }
  function compareEntity(left, right) { return numericOrder(left.order) - numericOrder(right.order) || lexical(text(left.id), text(right.id)); }
  function numericOrder(value) { return Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER; }
  function stableStrings(values = []) { return [...new Set(array(values).filter((value) => typeof value === "string" && value.length))].sort(lexical); }
  function slug(value) { const normalized = String(value || "component").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "_").replace(/^_+|_+$/g, ""); return normalized || "component"; }
  function scalar(value) { if (["string", "number", "boolean"].includes(typeof value)) return value; if (object(value)) return value.name ?? value.title ?? value.type ?? value.value ?? null; return null; }
  function requireState(state) { if (!state || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION || !STATUSES.includes(state.status) || !positiveInteger(state.revision)) throw planError("STRUCTURAL_VALIDATION_FAILED", "Запись Stage 22 повреждена."); }
  function validFingerprint(value) { return /^fnv1a32:[0-9a-f]{8}$/.test(String(value || "")); }
  function fingerprintSafe(value) { try { return fingerprint(value); } catch { return null; } }
  function timestampNow() { return new Date().toISOString(); }
  function isTimestamp(value) { return typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)); }
  function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
  function integer(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isInteger(number) ? number : null; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function stableId(prefix, value) { return `${prefix}:${fingerprint(value).slice(8)}`; }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || stableId("execution-plan", { created: timestampNow() }); }
  function planError(code, message, details = {}) { return new PatternExecutionPlanError(code, message, details); }

  const api = {
    VERSION, SCHEMA_VERSION, PLANNING_ALGORITHM_VERSION, PROGRESS_KIND, STATUSES, PHASE_TYPES, PHASE_STATUSES,
    PREREQUISITE_STATUSES, COMPONENT_STATUSES, AUDIT_LIMIT, PLANNING_PHASES, PatternExecutionPlanError,
    canonicalize, fingerprint, confirmedSnapshotFingerprint, technologyReviewFingerprint, sourceIdentity,
    validateSourceReview, createInitialState, planningInputFingerprint, beginPlanning, completePlanning,
    buildState, derivePlan, validateStructural, validateSemantic, validateSourceIdentity, validatePlanState,
    validateGraph, calculatePlanFingerprint, recoverInterruptedState, markStale, inspectAggregate,
    ensureForProject, buildForProject, rebuildForProject, retryForProject,
  };
  globalObject.YarnAIPatternExecutionPlan = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
