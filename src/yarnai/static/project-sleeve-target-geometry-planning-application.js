"use strict";

(function initializeProjectSleeveTargetGeometryPlanningApplication(globalObject) {
  const ROUTE_METADATA = Object.freeze({ kind: "PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING", stage: 79, routePath: "/project-sleeve-geometry-planning", presentationAvailable: true });
  const REQUIRED_PROGRESS = Object.freeze({
    65: "PROJECT_EXECUTION_PLAN_PREPARATION",
    70: "FOUNDATION_SECTION_EXECUTION_PREPARATION",
    73: "PRIMARY_FABRIC_PREPARATION",
    75: "PRIMARY_FABRIC_MEASUREMENT",
    76: "PROJECT_NEXT_SECTION_PLANNING",
    77: "PROJECT_CONSTRUCTION_STRATEGY_PLANNING",
    78: "PROJECT_SHAPING_POLICY_PLANNING",
  });
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function fail(domain, code, message, details = {}) { throw new domain.SleevePlanningError(code, message, details); }
  function unsafe(entry) { return !record(entry) || Boolean(entry.deleted_at || entry.conflict_id || entry.quarantined || entry.imported_unproven || entry.importedUnproven || entry.stale || entry.validation_status === "IMPORTED_UNPROVEN" || entry.validation_status === "QUARANTINED"); }
  function dependenciesFromGlobal(target = globalObject) {
    return {
      stage61Domain: target.YarnAIProjectInitialization,
      stage63Domain: target.YarnAISwatchGauge,
      stage65Domain: target.YarnAIProjectExecutionPlan,
      stage66Domain: target.YarnAIProjectExecutionStart,
      stage67Domain: target.YarnAIProjectExecutionFirstStep,
      stage68Domain: target.YarnAIProjectExecutionNextStep,
      stage69Domain: target.YarnAIProjectExecutionNextStepClarification,
      stage70Domain: target.YarnAIFoundationSectionExecutionPreparation,
      stage71Domain: target.YarnAIFoundationSectionExecution,
      stage72Domain: target.YarnAIFoundationSectionMeasurement,
      stage73Domain: target.YarnAIPrimaryFabricPreparation,
      stage74Domain: target.YarnAIPrimaryFabricExecution,
      stage75Domain: target.YarnAIPrimaryFabricMeasurement,
      stage76Domain: target.YarnAIProjectNextSectionPlanning,
      stage77Domain: target.YarnAIProjectConstructionStrategyPlanning,
      stage78Domain: target.YarnAIProjectShapingPolicyPlanning,
    };
  }
  function requiredProgress(aggregate, domain, stage) {
    const kind = REQUIRED_PROGRESS[stage]; const calculationId = aggregate.project.active_calculation_id;
    const matches = (aggregate.progress || []).filter((entry) => entry.kind === kind && entry.calculation_id === calculationId && !entry.deleted_at);
    if (matches.length !== 1) fail(domain, `STAGE${stage}_${matches.length ? "CONFLICT" : "REQUIRED"}`, `Exactly one authoritative Stage ${stage} record is required.`);
    if (unsafe(matches[0])) fail(domain, `STAGE${stage}_UNSAFE`, `Stage ${stage} is conflicted, quarantined, imported-unproven, deleted, or stale.`);
    return matches[0];
  }
  function sourceBinding(stage, recordId, repositoryRevision, domainIdentity, contractVersion, domainFingerprint, snapshotFingerprint, projectId, calculationId) {
    return { stage, repository_record_id: recordId, repository_revision: repositoryRevision, domain_identity: domainIdentity, contract_version: contractVersion, domain_fingerprint: domainFingerprint, snapshot_fingerprint: snapshotFingerprint, project_id: projectId, calculation_id: calculationId, lifecycle: "completed", current_repository_revision: repositoryRevision, current_domain_fingerprint: domainFingerprint, current_snapshot_fingerprint: snapshotFingerprint, conflict: false, quarantined: false, imported_unproven: false, deleted: false };
  }
  function patternBinding({ identity, sourceIdentity, sourceFingerprint, displayValue, horizontalRepeat = 1, fixedWorkingStitches = 0, verticalRepeat = 1, endPhase = "any", origin }) {
    return { identity, source_identity: sourceIdentity, source_fingerprint: sourceFingerprint, display_value: displayValue, horizontal_repeat: horizontalRepeat, fixed_working_stitches: fixedWorkingStitches, vertical_repeat: verticalRepeat, end_phase: endPhase, origin };
  }
  function validateStateForStage(stage, entry, dependencies, projectId, calculationId) {
    const api = dependencies[`stage${stage}Domain`];
    if (!api?.validateProgressState) throw new Error(`Stage ${stage} validator is unavailable.`);
    return api.validateProgressState(entry.state, { projectIdentity: projectId, calculationId });
  }
  function reconstructAuthoritativeSources(input = {}) {
    const aggregate = input.aggregate; const domain = input.domain || globalObject.YarnAIProjectSleeveTargetGeometryPlanning; const dependencies = input.dependencies || dependenciesFromGlobal();
    if (!domain || !record(aggregate?.project)) fail(domain || { SleevePlanningError: Error }, "PROJECT_NOT_FOUND", "The project is unavailable.");
    const projectId = aggregate.project.project_id; const calculationId = aggregate.project.active_calculation_id;
    if (!dependencies.stage61Domain || !dependencies.stage63Domain || Object.keys(REQUIRED_PROGRESS).some((stage) => !dependencies[`stage${stage}Domain`])) fail(domain, "SOURCE_DEPENDENCY_MISSING", "An authoritative source validator is unavailable.");
    if (!calculationId || !(aggregate.calculations || []).some((item) => item.calculation_id === calculationId && item.project_id === projectId)) fail(domain, "CALCULATION_ID_INVALID", "The active calculation is unavailable.");

    let initializationHistory; let gaugeHistory;
    try {
      initializationHistory = dependencies.stage61Domain.normalizeHistory(aggregate.project.draft_input?.[dependencies.stage61Domain.HISTORY_KEY]);
      gaugeHistory = dependencies.stage63Domain.normalizeHistory(aggregate.project.draft_input?.[dependencies.stage63Domain.HISTORY_KEY], { projectIdentity: projectId });
    } catch (error) { fail(domain, "AUTHORITATIVE_SOURCE_CHAIN_INVALID", error?.userMessage || error?.message || "Stage 61/63 history is invalid."); }
    const initialization = initializationHistory.records?.at(-1); const gauge = gaugeHistory.records?.at(-1);
    if (!initialization || initialization.lifecycle !== "initialized" || initialization.project_identity !== projectId || initialization.integrity?.quarantined || initialization.integrity?.collision || initialization.integrity?.importedUnproven) fail(domain, "STAGE61_REQUIRED", "A current initialized Stage 61 record is required.");
    if (!gauge || gauge.lifecycle !== "confirmed" || gauge.readiness !== "ready" || gauge.projectIdentity !== projectId || gauge.sourceInitializationIdentity !== initialization.identity || gauge.sourceInitializationFingerprint !== initialization.integrity.recordFingerprint) fail(domain, "STAGE63_REQUIRED", "A current confirmed Stage 63 gauge is required.");

    const records = Object.fromEntries(Object.keys(REQUIRED_PROGRESS).map((stage) => [stage, requiredProgress(aggregate, domain, Number(stage))]));
    let state65; let state70; let state73; let state75; let state76; let state77; let state78; let assessment78;
    try {
      state65 = validateStateForStage(65, records[65], dependencies, projectId, calculationId);
      state70 = validateStateForStage(70, records[70], dependencies, projectId, calculationId);
      state73 = validateStateForStage(73, records[73], dependencies, projectId, calculationId);
      state75 = validateStateForStage(75, records[75], dependencies, projectId, calculationId);
      state76 = validateStateForStage(76, records[76], dependencies, projectId, calculationId);
      state77 = validateStateForStage(77, records[77], dependencies, projectId, calculationId);
      const stage78Dependencies = {};
      [63, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77].forEach((stage) => { stage78Dependencies[`stage${stage}Domain`] = dependencies[`stage${stage}Domain`]; });
      assessment78 = dependencies.stage78Domain.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, ...stage78Dependencies, validatedAt: input.validatedAt });
      if (assessment78.lifecycle !== "ready") fail(domain, assessment78.diagnostic?.code || "STAGE78_SOURCE_STALE", assessment78.diagnostic?.message || "Stage 78 source chain is stale.");
      state78 = dependencies.stage78Domain.validateProgressState(records[78].state, { projectIdentity: projectId, calculationId });
      dependencies.stage78Domain.validateBinding(state78.snapshot, assessment78);
    } catch (error) { if (error instanceof domain.SleevePlanningError) throw error; fail(domain, error?.code || "AUTHORITATIVE_SOURCE_CHAIN_INVALID", error?.userMessage || error?.message || "The authoritative source chain is invalid."); }
    const snapshot65 = state65.history?.at(-1); const snapshot70 = state70.completedSnapshot; const snapshot73 = state73; const snapshot75 = state75.completedSnapshot; const snapshot76 = state76.snapshot; const snapshot77 = state77.snapshot; const snapshot78 = state78.snapshot;
    if (!snapshot65 || snapshot65.lifecycle !== "completed" || state70.lifecycle !== "completed" || !snapshot70 || state73.lifecycle !== "completed" || state75.lifecycle !== "completed" || !snapshot75 || snapshot76.lifecycle !== "completed" || snapshot77.lifecycle !== "completed" || snapshot78.lifecycle !== "completed") fail(domain, "SOURCE_STATUS_INVALID", "Every Stage 65/70/73/75/76/77/78 source must be completed.");
    const outcome78 = dependencies.stage78Domain.resolvePlanOutcome(snapshot78);
    if (outcome78.status !== "blocked_on_prerequisites" || outcome78.reason !== domain.REQUIRED_STAGE78_REASON) fail(domain, "STAGE78_CONTRACT_MISMATCH", "Stage 78 is not the corrected V2 prerequisite boundary.");
    const measurement = initialization.snapshot?.measurements; const upperArm = measurement?.body?.upperArm?.value; const sleeveLength = measurement?.garment?.sleeveLength?.value; const armholeDepth = measurement?.body?.armholeDepth?.value;
    if ([upperArm, sleeveLength, armholeDepth].some((value) => value === undefined || value === null)) fail(domain, "REFERENCE_MEASUREMENT_INVALID", "Stage 61 sleeve reference measurements are incomplete.");
    const mainValue = state73.preparation?.mainPattern?.value; const repeatValue = state73.preparation?.patternRepeat?.value;
    const cuffFingerprint = snapshot70.fingerprint; const mainFingerprint = state73.fingerprint;
    const cuffPattern = patternBinding({ identity: "rib_1x1", sourceIdentity: snapshot70.identity, sourceFingerprint: cuffFingerprint, displayValue: "1x1 rib", horizontalRepeat: 2, verticalRepeat: 1, origin: "inherited_stage70" });
    const mainPattern = patternBinding({ identity: `stage73-main-pattern:${domain.fingerprint({ value: mainValue, repeat: repeatValue })}`, sourceIdentity: state73.identity, sourceFingerprint: mainFingerprint, displayValue: mainValue, horizontalRepeat: 1, verticalRepeat: 1, origin: "inherited_stage73" });
    const yarnIdentity = gauge.snapshot?.source?.yarn?.identity || gauge.snapshot?.source?.yarn || `legacy-gauge-yarn:${gauge.identity}`;
    const toolLabel = snapshot70.executionParameters?.toolConfirmation?.label || state73.preparation?.knownContext?.toolLabel || "legacy-confirmed-tool";
    const toolIdentity = gauge.snapshot?.source?.tool?.identity || gauge.snapshot?.source?.tool || `confirmed-tool:${domain.fingerprint({ gauge: gauge.identity, label: toolLabel })}`;
    const bindings = [
      sourceBinding(61, initialization.identity, initializationHistory.records.length, "PROJECT_INITIALIZATION_FROM_CONFIRMED_DETAILS", 1, initialization.integrity.recordFingerprint, initialization.snapshot_fingerprint, projectId, calculationId),
      sourceBinding(63, gauge.identity, gaugeHistory.records.length, "SWATCH_GAUGE_HISTORY", 1, gauge.fingerprint, dependencies.stage63Domain.fingerprint(gauge.snapshot), projectId, calculationId),
      sourceBinding(65, records[65].progress_id, records[65].revision, "PROJECT_EXECUTION_PLAN_PREPARATION", 1, dependencies.stage65Domain.fingerprint(state65), snapshot65.fingerprint, projectId, calculationId),
      sourceBinding(70, records[70].progress_id, records[70].revision, "FOUNDATION_SECTION_EXECUTION_PREPARATION", 1, state70.fingerprint, snapshot70.fingerprint, projectId, calculationId),
      sourceBinding(73, records[73].progress_id, records[73].revision, "PRIMARY_FABRIC_PREPARATION", 1, state73.fingerprint, state73.fingerprint, projectId, calculationId),
      sourceBinding(75, records[75].progress_id, records[75].revision, "PRIMARY_FABRIC_MEASUREMENT", 1, state75.fingerprint, snapshot75.fingerprint, projectId, calculationId),
      sourceBinding(76, records[76].progress_id, records[76].revision, "PROJECT_NEXT_SECTION_PLANNING", 1, domain.fingerprint(state76), snapshot76.fingerprint, projectId, calculationId),
      sourceBinding(77, records[77].progress_id, records[77].revision, "PROJECT_CONSTRUCTION_STRATEGY_PLANNING", 1, domain.fingerprint(state77), snapshot77.fingerprint, projectId, calculationId),
      sourceBinding(78, records[78].progress_id, records[78].revision, "PROJECT_SHAPING_POLICY_PLANNING", 2, domain.fingerprint(state78), snapshot78.fingerprint, projectId, calculationId),
    ];
    return domain.validateAuthoritativeSources({ project_id: projectId, calculation_id: calculationId, bindings, upper_arm_body_circumference_cm: String(upperArm), shoulder_point_to_cuff_length_cm: String(sleeveLength), armhole_depth_cm: String(armholeDepth), direction: snapshot76.clarification.value, topology_identity: snapshot77.clarification.strategyIdentity, stage78_outcome_status: outcome78.status, stage78_outcome_reason: outcome78.reason, stage78_blocking_prerequisites: clone(outcome78.blockingPrerequisites), inherited_cuff_pattern: cuffPattern, inherited_cuff_height_cm: String(snapshot70.confirmedContext.target.value), inherited_main_pattern: mainPattern, yarn_identity: String(yarnIdentity), tool_identity: String(toolIdentity), math_canon_version: domain.MATH_CANON_VERSION, math_canon_fingerprint: domain.MATH_CANON_FINGERPRINT });
  }

  function buildGaugeBinding(input = {}) {
    const domain = input.domain || globalObject.YarnAIProjectSleeveTargetGeometryPlanning; const sources = input.sources; const aggregate = input.aggregate; const dependencies = input.dependencies || dependenciesFromGlobal(); const zone = input.zone;
    if (!["cuff", "main"].includes(zone)) fail(domain, "GAUGE_NOT_APPLICABLE", "Gauge zone is invalid.");
    const history = dependencies.stage63Domain.normalizeHistory(aggregate.project.draft_input?.[dependencies.stage63Domain.HISTORY_KEY], { projectIdentity: sources.project_id }); const gauge = history.records.at(-1);
    if (!gauge || gauge.lifecycle !== "confirmed" || gauge.readiness !== "ready") fail(domain, "STAGE63_REQUIRED", "The current confirmed gauge is unavailable.");
    const pattern = zone === "cuff" ? input.state.construction.cuff.pattern : input.state.construction.mainPattern;
    const context = { projectId: sources.project_id, calculationId: sources.calculation_id, yarnIdentity: sources.yarn_identity, toolIdentity: sources.tool_identity, patternIdentity: pattern.identity, workingMethod: "in_round" };
    const contextFingerprint = domain.fingerprint(context); const sourceContextFingerprint = dependencies.stage63Domain.fingerprint(gauge.snapshot.source);
    const sourceHasFullIdentity = gauge.snapshot.source?.yarn && gauge.snapshot.source?.tool && gauge.snapshot.source?.pattern;
    const mode = sourceHasFullIdentity ? "deterministic_identity_match" : "explicit_legacy_context_attestation";
    if (mode === "explicit_legacy_context_attestation" && input.explicitConfirmation !== true) fail(domain, "GAUGE_ATTESTATION_REQUIRED", `The legacy Stage 63 gauge requires explicit ${zone} applicability confirmation.`);
    const evidenceFingerprint = domain.fingerprint({ zone, mode, comparedContextFingerprint: contextFingerprint, gaugeRecordFingerprint: gauge.fingerprint });
    const prepared = gauge.snapshot.preparation || {}; const finishingState = prepared.washed && prepared.dry && prepared.unstretched ? "washed_dry_unstretched" : "confirmed_swatch";
    return { zone, projectId: sources.project_id, calculationId: sources.calculation_id, gaugeRecordIdentity: gauge.identity, gaugeConfirmationKey: gauge.confirmationKey, gaugeRecordFingerprint: gauge.fingerprint, gaugeSourceContextFingerprint: sourceContextFingerprint, stitchesPerCmExact: String(gauge.snapshot.computed.stitchesPerCm), rowsPerCmExact: String(gauge.snapshot.computed.rowsPerCm), finishingState, yarnIdentity: sources.yarn_identity, toolIdentity: sources.tool_identity, patternIdentity: pattern.identity, workingMethod: "in_round", applicabilityMode: mode, comparedContextFingerprint: contextFingerprint, evidenceFingerprint, explicitConfirmation: mode === "explicit_legacy_context_attestation", confirmedAt: mode === "explicit_legacy_context_attestation" ? input.confirmedAt : null, currentRecordFingerprint: gauge.fingerprint, currentContextFingerprint: sourceContextFingerprint, stale: false };
  }

  function blockedProjection(error, context = {}) {
    const code = error?.code || "STAGE79_APPLICATION_BLOCKED";
    const projection = context.state
      ? { ...context.domain.projectView(context.state), available: true, blocked: true }
      : { available: false, blocked: true, lifecycle: "blocked" };
    if (code === "TARGET_IMPOSSIBLE_UNDER_CURRENT_CONSTRAINTS") {
      projection.endpointState = Object.freeze({ status: "no_valid_candidate", selectedCandidate: null, tiedCandidates: Object.freeze([]) });
    }
    const gaugeStatus = code === "GAUGE_STALE" ? "stale" : ["GAUGE_NOT_APPLICABLE", "GAUGE_PATTERN_MISMATCH", "CROSS_ZONE_GAUGE_REUSE_FORBIDDEN"].includes(code) ? "incompatible" : null;
    if (gaugeStatus && ["cuff", "main"].includes(context.zone)) {
      projection.gaugeStatus = Object.freeze({ ...projection.gaugeStatus, [context.zone]: Object.freeze({ status: gaugeStatus }) });
    }
    projection.diagnostic = Object.freeze({ code, message: error?.userMessage || error?.message || "Stage 79 is unavailable." });
    return Object.freeze(projection);
  }
  function createController(options = {}) {
    const domain = options.domain || globalObject.YarnAIProjectSleeveTargetGeometryPlanning; const system = options.system || globalObject.YarnAIProjectSystem; const dependencies = options.dependencies || dependenciesFromGlobal(options.globalObject || globalObject);
    const repository = options.repository || (system ? new system.ProjectRepository() : null); const now = options.now || (() => new Date().toISOString()); const operationId = options.operationId || (() => system.uuidv7()); let projectId = options.projectId || null;
    if (!domain || !repository) throw new Error("Stage 79 domain and repository are required.");
    async function context() {
      const aggregate = await repository.getProject(projectId); const at = now(); const sources = reconstructAuthoritativeSources({ aggregate, domain, dependencies, validatedAt: at });
      const history = await repository.getProjectSleeveTargetGeometryPlanningHistory(projectId, aggregate.project.active_calculation_id); const current = history.at(-1) || null;
      if (current) { const state = domain.validateState(current.state); if (state.source.sourceBindingFingerprint !== domain.fingerprint(sources)) fail(domain, "SOURCE_STALE", "The current Stage 79 epoch is bound to a stale source chain."); }
      return { aggregate, sources, history, current, at };
    }
    async function save(next, ctx, metadata) {
      const record = await repository.saveProjectSleeveTargetGeometryPlanning(projectId, ctx.aggregate.project.active_calculation_id, next, { expectedProjectRevision: ctx.aggregate.project.revision, expectedRepositoryRevision: ctx.current?.revision || 0, timestamp: metadata.at, operationId: metadata.operationId });
      return domain.projectView(record.state);
    }
    async function loadOrStart(id = projectId, settings = {}) {
      projectId = id;
      try {
        await repository.initialize?.(); const ctx = await context();
        if (ctx.current) return domain.projectView(ctx.current.state);
        if (settings.startIfMissing === false) return Object.freeze({ available: true, blocked: false, lifecycle: "absent", nextMissingInput: "cuffTargetCircumferenceCm" });
        const state = domain.startEpoch(ctx.sources, { epoch: 1, createdAt: ctx.at });
        return save(state, ctx, { at: ctx.at, operationId: operationId() });
      } catch (error) { return blockedProjection(error, { domain }); }
    }
    async function apply(command, input = {}, metadata = {}) {
      let ctx = null;
      try {
        ctx = await context(); if (!ctx.current) fail(domain, "STAGE79_REQUIRED", "Start Stage 79 before applying an operation.");
        const at = metadata.at || ctx.at; const id = metadata.operationId || operationId(); let next;
        if (command === "collect") next = domain.collectTarget(ctx.current.state, ctx.sources, input, { operationId: id, at });
        else if (command === "bind_gauge") next = domain.bindGauge(ctx.current.state, ctx.sources, buildGaugeBinding({ aggregate: ctx.aggregate, sources: ctx.sources, state: ctx.current.state, dependencies, domain, zone: input.zone, explicitConfirmation: input.explicitConfirmation, confirmedAt: at }), { operationId: id, at });
        else if (command === "override_main") next = domain.overrideMainPattern(ctx.current.state, ctx.sources, input.pattern, { operationId: id, at });
        else if (command === "override_cuff") next = domain.overrideCuff(ctx.current.state, ctx.sources, input, { operationId: id, at });
        else if (command === "align_cuff_with_main") {
          const inherited = ctx.current.state.construction.mainPattern;
          const pattern = { ...clone(inherited), source_identity: `stage79:${ctx.current.state.identity}:cuff-aligned-to-main`, source_fingerprint: domain.fingerprint({ action: command, epoch: ctx.current.state.epoch, patternIdentity: inherited.identity }), origin: "user_override" };
          next = domain.overrideCuff(ctx.current.state, ctx.sources, { pattern, targetHeightCm: ctx.current.state.construction.cuff.targetHeightCm, transitionIdentity: "cuff-to-main-same-count-pattern-change:v1" }, { operationId: id, at });
        }
        else if (command === "align_main_with_cuff") {
          const inherited = ctx.current.state.construction.cuff.pattern;
          const pattern = { ...clone(inherited), source_identity: `stage79:${ctx.current.state.identity}:main-aligned-to-cuff`, source_fingerprint: domain.fingerprint({ action: command, epoch: ctx.current.state.epoch, patternIdentity: inherited.identity }), origin: "user_override" };
          next = domain.overrideMainPattern(ctx.current.state, ctx.sources, pattern, { operationId: id, at });
        }
        else if (command === "review") next = domain.enterReview(ctx.current.state, ctx.sources, input, { operationId: id, at });
        else if (command === "tie") next = domain.confirmRoundingCandidate(ctx.current.state, ctx.sources, input, { operationId: id, at });
        else if (command === "complete") next = domain.complete(ctx.current.state, ctx.sources, input, { operationId: id, at });
        else fail(domain, "APPLICATION_COMMAND_INVALID", "Stage 79 command is invalid.");
        return save(next, ctx, { at, operationId: id });
      } catch (error) { if (options.throwErrors) throw error; return blockedProjection(error, { domain, state: ctx?.current?.state, zone: input.zone }); }
    }
    async function startNewEpoch(metadata = {}) {
      try { const ctx = await context(); if (!ctx.current || domain.validateState(ctx.current.state).lifecycle !== "completed") fail(domain, "COMPLETED_EPOCH_REQUIRED", "Only a completed epoch can be superseded."); const at = metadata.at || ctx.at; const state = domain.startEpoch(ctx.sources, { epoch: ctx.current.epoch + 1, createdAt: at, supersedesIdentity: ctx.current.state.identity }); return save(state, ctx, { at, operationId: metadata.operationId || operationId() }); } catch (error) { if (options.throwErrors) throw error; return blockedProjection(error, { domain }); }
    }
    return Object.freeze({
      loadOrStart, loadCurrent: (id = projectId) => loadOrStart(id, { startIfMissing: false }), reconstructAfterReload: (id = projectId) => loadOrStart(id, { startIfMissing: false }), startNewEpoch,
      collectCuffCircumference: (value, metadata) => apply("collect", { field: "cuffTargetCircumferenceCm", value }, metadata),
      collectUpperCircumference: (value, metadata) => apply("collect", { field: "upperSleeveTargetCircumferenceCm", value }, metadata),
      collectCuffToUnderarmLength: (value, metadata) => apply("collect", { field: "cuffToUnderarmLengthCm", value }, metadata),
      bindCuffGauge: (input = {}, metadata) => apply("bind_gauge", { zone: "cuff", ...input }, metadata), bindMainGauge: (input = {}, metadata) => apply("bind_gauge", { zone: "main", ...input }, metadata),
      overrideMainPattern: (pattern, metadata) => apply("override_main", { pattern }, metadata), overrideCuff: (input, metadata) => apply("override_cuff", input, metadata),
      alignCuffPatternWithMain: (metadata) => apply("align_cuff_with_main", {}, metadata), alignMainPatternWithCuff: (metadata) => apply("align_main_with_cuff", {}, metadata),
      enterReview: (input = {}, metadata) => apply("review", { inheritedConstructionReviewed: true, ...input }, metadata), confirmStructuredEndpointTie: (candidateKey, metadata) => apply("tie", { candidateKey }, metadata),
      confirmReview: (reviewFingerprint, metadata) => apply("complete", { reviewFingerprint }, metadata), complete: (reviewFingerprint, metadata) => apply("complete", { reviewFingerprint }, metadata),
      close: () => repository.close?.(), getProjectId: () => projectId,
    });
  }

  const api = Object.freeze({ ROUTE_METADATA, REQUIRED_PROGRESS, dependenciesFromGlobal, reconstructAuthoritativeSources, buildGaugeBinding, blockedProjection, createController });
  globalObject.YarnAIProjectSleeveTargetGeometryPlanningApplication = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
