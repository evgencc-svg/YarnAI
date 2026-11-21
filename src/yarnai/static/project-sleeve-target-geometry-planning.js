"use strict";

(function initializeProjectSleeveTargetGeometryPlanning(globalObject) {
  const DOMAIN_IDENTITY = "PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING";
  const KIND = DOMAIN_IDENTITY;
  const PROGRESS_KIND = KIND;
  const CONTRACT_SCHEMA_ID = "SLEEVE_TARGET_GEOMETRY_AND_CONSTRUCTION_CONTRACT_V1";
  const CONTRACT_VERSION = 1;
  const MATH_CANON_VERSION = "1.1";
  const JOINT_ENDPOINT_POLICY = "joint-sleeve-endpoint-rounding:v1";
  const TAPER_POLICY = "bottom-up-sleeve-taper-distribution:v1";
  const REQUIRED_TOPOLOGY = "construction-strategy:body-sleeves-joined-raglan:v1";
  const REQUIRED_STAGE78_REASON = "EXECUTION_GEOMETRY_PREREQUISITES_REQUIRED_BEFORE_SAFE_PLAN_EXTENSION";
  const REQUIRED_STAGE78_PREREQUISITES = Object.freeze([
    "sleeve_construction_and_target_geometry",
    "two_completed_measured_sleeves",
    "sleeve_stitch_counts_at_underarm",
    "body_and_sleeve_underarm_stitch_allocation",
    "combined_yoke_section_balance",
  ]);
  const SOURCE_STAGES = Object.freeze([61, 63, 65, 70, 73, 75, 76, 77, 78]);
  const EXPECTED_SOURCE_CONTRACTS = Object.freeze({
    61: ["PROJECT_INITIALIZATION_FROM_CONFIRMED_DETAILS", 1],
    63: ["SWATCH_GAUGE_HISTORY", 1],
    65: ["PROJECT_EXECUTION_PLAN_PREPARATION", 1],
    70: ["FOUNDATION_SECTION_EXECUTION_PREPARATION", 1],
    73: ["PRIMARY_FABRIC_PREPARATION", 1],
    75: ["PRIMARY_FABRIC_MEASUREMENT", 1],
    76: ["PROJECT_NEXT_SECTION_PLANNING", 1],
    77: ["PROJECT_CONSTRUCTION_STRATEGY_PLANNING", 1],
    78: ["PROJECT_SHAPING_POLICY_PLANNING", 2],
  });
  const TARGET_ORDER = Object.freeze([
    "cuffTargetCircumferenceCm",
    "upperSleeveTargetCircumferenceCm",
    "cuffToUnderarmLengthCm",
  ]);
  const POLICY_VERSIONS = Object.freeze([
    "sleeve-pattern-inheritance-policy:v1",
    "sleeve-cuff-inheritance-policy:v1",
    "sleeve-working-method-policy:joined-raglan-in-round:v1",
    "cuff-to-main-same-count-pattern-change:v1",
    "paired-mirrored-increase-flanking-bor:v1",
    "increase-technique:mirrored-lifted-pair:v1",
    JOINT_ENDPOINT_POLICY,
    TAPER_POLICY,
  ]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  const STATE_KEYS = Object.freeze([
    "kind", "version", "projectId", "calculationId", "identity", "epoch",
    "predecessorIdentity", "lifecycle", "revision", "source", "referenceMeasurements",
    "targets", "construction", "gaugeBindings", "derivedReview", "confirmations",
    "operations", "timestamps", "completedSnapshot", "fingerprint",
  ]);

  class SleevePlanningError extends Error {
    constructor(code, message, details = {}) {
      super(message); this.name = "SleevePlanningError"; this.code = code;
      this.userMessage = message; this.details = clone(details);
    }
  }
  function fail(code, message, details) { throw new SleevePlanningError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  function exactKeys(value, keys, code = "PROGRESS_STATE_INVALID") {
    if (!record(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || Object.keys(value).some((key) => !keys.includes(key))) fail(code, "Stage 79 data contains missing or unallowlisted fields.");
  }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("VALUE_INVALID", "A finite number is required."); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("VALUE_INVALID", "The value is not JSON-compatible.");
  }
  function utf8Bytes(value) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(value);
    return unescape(encodeURIComponent(value)).split("").map((item) => item.charCodeAt(0));
  }
  function fingerprint(value) {
    let hash = 0x811c9dc5;
    for (const byte of utf8Bytes(canonicalize(value))) { hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }
  const MATH_CANON_FINGERPRINT = fingerprint({ version: MATH_CANON_VERSION, policies: [JOINT_ENDPOINT_POLICY, TAPER_POLICY] });
  function requireUuid(value, code) { if (!UUID_V7.test(value || "")) fail(code, "A UUIDv7 identity is required."); return value; }
  function requireTimestamp(value) { if (!TIMESTAMP.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "An ISO UTC timestamp with milliseconds is required."); return value; }
  function requireFingerprint(value, code = "FINGERPRINT_INVALID") { if (!FINGERPRINT.test(value || "")) fail(code, "A canonical fingerprint is required."); return value; }
  function canonicalDecimal(value, code = "TARGET_INVALID") {
    const text = String(value);
    if (!DECIMAL.test(text)) fail(code, "The value must be a canonical non-exponential decimal.");
    const number = Number(text);
    if (!Number.isFinite(number) || number <= 0 || number > 1000) fail(code, "The value must be finite, positive, and within bounds.");
    return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
  }
  function decimal(value) { const result = Number(value); if (Object.is(result, -0) || Math.abs(result) < 1e-12) return "0"; return String(Number(result.toFixed(12))); }
  function semanticState(value) { const result = clone(value); delete result.fingerprint; return result; }
  function stateWithFingerprint(value) { const result = clone(value); delete result.fingerprint; result.fingerprint = fingerprint(result); return validateState(result); }
  function nextMissingInput(state) { const checked = validateState(state); return TARGET_ORDER.find((name) => !Object.prototype.hasOwnProperty.call(checked.targets, name)) || null; }

  function validatePattern(pattern, expectedOrigin = null) {
    const keys = ["identity", "source_identity", "source_fingerprint", "display_value", "horizontal_repeat", "fixed_working_stitches", "vertical_repeat", "end_phase", "origin"];
    exactKeys(pattern, keys, "PATTERN_BINDING_INVALID");
    if (!pattern.identity || !pattern.source_identity || !pattern.display_value) fail("PATTERN_BINDING_INVALID", "Pattern identities and display provenance are required.");
    requireFingerprint(pattern.source_fingerprint);
    if (!Number.isSafeInteger(pattern.horizontal_repeat) || pattern.horizontal_repeat < 1 || !Number.isSafeInteger(pattern.fixed_working_stitches) || pattern.fixed_working_stitches < 0 || !Number.isSafeInteger(pattern.vertical_repeat) || pattern.vertical_repeat < 1) fail("PATTERN_CONSTRAINT_INVALID", "Numeric repeat constraints are required.");
    if (!["any", "even", "odd"].includes(pattern.end_phase)) fail("PATTERN_PHASE_INVALID", "Pattern end phase is invalid.");
    if (expectedOrigin && pattern.origin !== expectedOrigin) fail("PATTERN_PROVENANCE_INVALID", "Inherited pattern provenance is incorrect.");
    return clone(pattern);
  }

  function validateAuthoritativeSources(source) {
    const sources = clone(source);
    requireUuid(sources?.project_id, "PROJECT_ID_INVALID"); requireUuid(sources?.calculation_id, "CALCULATION_ID_INVALID");
    if (!Array.isArray(sources.bindings) || sources.bindings.length !== SOURCE_STAGES.length || canonicalize(sources.bindings.map((item) => item.stage).sort((a, b) => a - b)) !== canonicalize(SOURCE_STAGES)) fail("AUTHORITATIVE_SOURCE_CHAIN_INVALID", "The exact Stage 61/63/65/70/73/75/76/77/78 chain is required.");
    for (const binding of sources.bindings) {
      const expected = EXPECTED_SOURCE_CONTRACTS[binding.stage];
      if (!expected || binding.domain_identity !== expected[0] || binding.contract_version !== expected[1]) fail("SOURCE_CONTRACT_MISMATCH", `Stage ${binding.stage} contract is not authoritative.`);
      if (binding.project_id !== sources.project_id || binding.calculation_id !== sources.calculation_id) fail("SOURCE_SCOPE_MISMATCH", `Stage ${binding.stage} belongs to another scope.`);
      if (binding.lifecycle !== "completed" || !Number.isSafeInteger(binding.repository_revision) || binding.repository_revision < 1) fail("SOURCE_STATUS_INVALID", `Stage ${binding.stage} is not completed.`);
      if (binding.conflict || binding.quarantined || binding.imported_unproven || binding.deleted) fail("SOURCE_UNSAFE", `Stage ${binding.stage} is unsafe.`);
      requireFingerprint(binding.domain_fingerprint); requireFingerprint(binding.snapshot_fingerprint);
      if (binding.current_repository_revision !== binding.repository_revision || binding.current_domain_fingerprint !== binding.domain_fingerprint || binding.current_snapshot_fingerprint !== binding.snapshot_fingerprint) fail("SOURCE_STALE", `Stage ${binding.stage} source binding is stale.`);
    }
    if (sources.direction !== "bottom_up" || sources.topology_identity !== REQUIRED_TOPOLOGY) fail("CONSTRUCTION_CONTRADICTION", "Stage 76/77 construction is incompatible with Stage 79 V1.");
    if (sources.stage78_outcome_status !== "blocked_on_prerequisites" || sources.stage78_outcome_reason !== REQUIRED_STAGE78_REASON || canonicalize(sources.stage78_blocking_prerequisites) !== canonicalize(REQUIRED_STAGE78_PREREQUISITES)) fail("STAGE78_CONTRACT_MISMATCH", "Stage 78 must be the corrected completed V2 prerequisite boundary.");
    [sources.upper_arm_body_circumference_cm, sources.shoulder_point_to_cuff_length_cm, sources.armhole_depth_cm, sources.inherited_cuff_height_cm].forEach((item) => canonicalDecimal(item, "REFERENCE_MEASUREMENT_INVALID"));
    validatePattern(sources.inherited_cuff_pattern, "inherited_stage70"); validatePattern(sources.inherited_main_pattern, "inherited_stage73");
    if (sources.inherited_cuff_pattern.identity !== "rib_1x1" || Number(sources.inherited_cuff_height_cm) !== 5) fail("CUFF_INHERITANCE_MISMATCH", "V1 requires the reviewed Stage 70 rib_1x1 / 5 cm candidate.");
    const byStage = Object.fromEntries(sources.bindings.map((item) => [item.stage, item]));
    if (sources.inherited_cuff_pattern.source_fingerprint !== byStage[70].snapshot_fingerprint) fail("CUFF_SOURCE_STALE", "The cuff proposal is stale.");
    if (sources.inherited_main_pattern.source_fingerprint !== byStage[73].snapshot_fingerprint) fail("MAIN_PATTERN_SOURCE_STALE", "The main pattern is stale.");
    if (!sources.yarn_identity || !sources.tool_identity) fail("FABRIC_CONTEXT_MISSING", "Yarn and tool context identities are required.");
    if (sources.math_canon_version !== MATH_CANON_VERSION || sources.math_canon_fingerprint !== MATH_CANON_FINGERPRINT) fail("MATH_CANON_STALE", "The bound sleeve math canon is stale.");
    return deepFreeze(sources);
  }

  function constructionFromSources(sources) {
    return {
      direction: { value: "bottom_up", policyIdentity: "stage76-confirmed-direction:v1", origin: "inherited_confirmed_source" },
      componentDirection: { value: "cuff_up", policyIdentity: "sleeve-cuff-up-from-bottom-up:v1", origin: "construction_policy" },
      topologyIdentity: REQUIRED_TOPOLOGY, quantity: 2, pairSymmetry: "identical_unless_future_explicit_asymmetry_contract",
      workingMethod: { value: "in_round", policyIdentity: "sleeve-working-method-policy:joined-raglan-in-round:v1", origin: "construction_policy" },
      mainPattern: clone(sources.inherited_main_pattern),
      cuff: { pattern: clone(sources.inherited_cuff_pattern), targetHeightCm: canonicalDecimal(sources.inherited_cuff_height_cm), heightOrigin: "inherited_stage70" },
      transition: { identity: "cuff-to-main-same-count-pattern-change:v1", shapingAllowed: false, mainRound: 1 }, profile: null,
      increasePolicy: { identity: "paired-mirrored-increase-flanking-bor:v1", deltaPerEvent: 2, placementLane: "both_sides_of_beginning_of_round", techniqueIdentity: "increase-technique:mirrored-lifted-pair:v1" },
    };
  }

  function startEpoch(source, options = {}) {
    const sources = validateAuthoritativeSources(source); const epoch = options.epoch;
    if (!Number.isSafeInteger(epoch) || epoch < 1) fail("EPOCH_INVALID", "Epoch must be a positive integer.");
    const createdAt = requireTimestamp(options.createdAt); const sourceBindingFingerprint = fingerprint(sources);
    return stateWithFingerprint({
      kind: KIND, version: CONTRACT_VERSION, projectId: sources.project_id, calculationId: sources.calculation_id,
      identity: `${sources.project_id}:sleeve-target-geometry:${epoch}:${sourceBindingFingerprint}`, epoch,
      predecessorIdentity: options.supersedesIdentity || null, lifecycle: "ready_to_collect", revision: 1,
      source: { chain: clone(sources), sourceBindingFingerprint },
      referenceMeasurements: {
        upperArmBodyCircumferenceCm: canonicalDecimal(sources.upper_arm_body_circumference_cm), upperArmSemanticRole: "body_measurement",
        shoulderPointToCuffLengthCm: canonicalDecimal(sources.shoulder_point_to_cuff_length_cm), shoulderPointToCuffSemanticRole: "finished_garment_reference",
        armholeDepthCm: canonicalDecimal(sources.armhole_depth_cm), armholeDepthSemanticRole: "body_vertical_measurement",
      },
      targets: {}, construction: constructionFromSources(sources), gaugeBindings: {}, derivedReview: null,
      confirmations: { inheritedConstructionReviewed: false, roundingCandidateConfirmation: null, finalReview: null },
      operations: [], timestamps: { createdAt, completedAt: null }, completedSnapshot: null,
    });
  }

  function applyOperation(state, sourcesInput, command, payload, metadata, mutate, allowCompletedReplay = false) {
    const current = validateState(state); const sources = validateAuthoritativeSources(sourcesInput);
    const operationId = requireUuid(metadata.operationId, "OPERATION_ID_INVALID"); const at = requireTimestamp(metadata.at); const payloadFingerprint = fingerprint(payload);
    const receipt = current.operations.find((item) => item.operationId === operationId);
    if (receipt) { if (receipt.command !== command || receipt.payloadFingerprint !== payloadFingerprint) fail("OPERATION_ID_CONFLICT", "The operation id was already used with different semantics."); return current; }
    if (current.lifecycle === "completed") fail(allowCompletedReplay ? "DUPLICATE_COMPLETION_CONFLICT" : "COMPLETED_EPOCH_IMMUTABLE", "A completed Stage 79 epoch is immutable.");
    if (current.projectId !== sources.project_id || current.calculationId !== sources.calculation_id) fail("PROJECT_OR_CALCULATION_MISMATCH", "The operation belongs to another scope.");
    if (current.source.sourceBindingFingerprint !== fingerprint(sources)) fail("SOURCE_STALE", "The Stage 79 epoch is bound to another source chain.");
    const draft = clone(current); mutate(draft); draft.revision = current.revision + 1;
    draft.operations.push({ operationId, command, payloadFingerprint, resultingRevision: draft.revision, at });
    return stateWithFingerprint(draft);
  }

  function collectTarget(state, sources, input = {}, metadata = {}) {
    const field = input.field; const value = canonicalDecimal(input.value);
    return applyOperation(state, sources, "collect_target", { field, value }, metadata, (draft) => {
      if (!TARGET_ORDER.includes(field)) fail("TARGET_FIELD_INVALID", "Stage 79 accepts exactly three target fields.");
      const missing = TARGET_ORDER.find((name) => !Object.prototype.hasOwnProperty.call(draft.targets, name));
      if (!Object.prototype.hasOwnProperty.call(draft.targets, field) && field !== missing) fail("TARGET_ORDER_INVALID", "Targets must be collected in contract order.");
      draft.targets[field] = { value, unit: "cm", semanticRole: "finished_garment_target", provenance: "user_entered_at_stage_79", confirmedAt: metadata.at };
      if (field === "upperSleeveTargetCircumferenceCm" && Number(value) < Number(draft.targets.cuffTargetCircumferenceCm.value)) fail("UNSUPPORTED_REVERSE_TAPER_V1", "V1 does not support a reverse taper.");
      if (field === "cuffToUnderarmLengthCm" && Number(value) <= Number(draft.construction.cuff.targetHeightCm)) fail("SHAPING_LENGTH_NOT_POSITIVE", "Cuff-to-underarm length must exceed cuff height.");
      resetReview(draft);
    });
  }
  function resetReview(draft) { draft.lifecycle = "collecting"; draft.derivedReview = null; draft.confirmations.inheritedConstructionReviewed = false; draft.confirmations.roundingCandidateConfirmation = null; draft.confirmations.finalReview = null; }

  function normalizeGauge(binding) {
    return {
      zone: binding.zone, project_id: binding.project_id ?? binding.projectId, calculation_id: binding.calculation_id ?? binding.calculationId,
      gauge_record_identity: binding.gauge_record_identity ?? binding.gaugeRecordIdentity,
      gauge_confirmation_key: binding.gauge_confirmation_key ?? binding.gaugeConfirmationKey,
      gauge_record_fingerprint: binding.gauge_record_fingerprint ?? binding.gaugeRecordFingerprint,
      gauge_source_context_fingerprint: binding.gauge_source_context_fingerprint ?? binding.gaugeSourceContextFingerprint,
      stitches_per_cm_exact: String(binding.stitches_per_cm_exact ?? binding.stitchesPerCmExact), rows_per_cm_exact: String(binding.rows_per_cm_exact ?? binding.rowsPerCmExact),
      finishing_state: binding.finishing_state ?? binding.finishingState, yarn_identity: binding.yarn_identity ?? binding.yarnIdentity,
      tool_identity: binding.tool_identity ?? binding.toolIdentity, pattern_identity: binding.pattern_identity ?? binding.patternIdentity,
      working_method: binding.working_method ?? binding.workingMethod, applicability_mode: binding.applicability_mode ?? binding.applicabilityMode,
      compared_context_fingerprint: binding.compared_context_fingerprint ?? binding.comparedContextFingerprint,
      evidence_fingerprint: binding.evidence_fingerprint ?? binding.evidenceFingerprint,
      explicit_confirmation: binding.explicit_confirmation ?? binding.explicitConfirmation,
      confirmed_at: binding.confirmed_at ?? binding.confirmedAt ?? null,
      current_record_fingerprint: binding.current_record_fingerprint ?? binding.currentRecordFingerprint,
      current_context_fingerprint: binding.current_context_fingerprint ?? binding.currentContextFingerprint,
      stale: Boolean(binding.stale),
    };
  }
  function validateGauge(bindingInput, sources, expectedPatternIdentity) {
    const binding = normalizeGauge(bindingInput);
    if (binding.project_id !== sources.project_id || binding.calculation_id !== sources.calculation_id) fail("GAUGE_SCOPE_MISMATCH", "Gauge belongs to another scope.");
    if (!["cuff", "main"].includes(binding.zone) || binding.working_method !== "in_round") fail("GAUGE_NOT_APPLICABLE", "Gauge zone or working method is incompatible.");
    if (binding.pattern_identity !== expectedPatternIdentity) fail("GAUGE_PATTERN_MISMATCH", "Gauge pattern does not match its selected zone.");
    if (binding.yarn_identity !== sources.yarn_identity || binding.tool_identity !== sources.tool_identity) fail("GAUGE_NOT_APPLICABLE", "Gauge fabric context is incompatible.");
    [binding.gauge_confirmation_key, binding.gauge_record_fingerprint, binding.gauge_source_context_fingerprint, binding.compared_context_fingerprint, binding.evidence_fingerprint].forEach((item) => requireFingerprint(item, "GAUGE_FINGERPRINT_INVALID"));
    const expectedEvidence = fingerprint({ zone: binding.zone, mode: binding.applicability_mode, comparedContextFingerprint: binding.compared_context_fingerprint, gaugeRecordFingerprint: binding.gauge_record_fingerprint });
    if (binding.evidence_fingerprint !== expectedEvidence) fail("GAUGE_EVIDENCE_FINGERPRINT_MISMATCH", "Gauge applicability evidence is corrupted.");
    canonicalDecimal(binding.stitches_per_cm_exact, "GAUGE_INVALID"); canonicalDecimal(binding.rows_per_cm_exact, "GAUGE_INVALID");
    if (binding.stale || binding.current_record_fingerprint !== binding.gauge_record_fingerprint || binding.current_context_fingerprint !== binding.gauge_source_context_fingerprint) fail("GAUGE_STALE", "Gauge binding is stale.");
    if (binding.applicability_mode === "explicit_legacy_context_attestation") { if (!binding.explicit_confirmation || !binding.confirmed_at) fail("GAUGE_ATTESTATION_REQUIRED", "Legacy gauge applicability requires explicit zone attestation."); requireTimestamp(binding.confirmed_at); }
    else if (binding.applicability_mode === "deterministic_identity_match") { if (binding.explicit_confirmation || binding.confirmed_at !== null) fail("GAUGE_EVIDENCE_INVALID", "Deterministic evidence cannot masquerade as an attestation."); }
    else fail("GAUGE_EVIDENCE_INVALID", "Gauge applicability mode is invalid.");
    return binding;
  }
  function bindGauge(state, sourcesInput, bindingInput, metadata = {}) {
    const current = validateState(state); const sources = validateAuthoritativeSources(sourcesInput); const normalized = normalizeGauge(bindingInput);
    const expectedPattern = normalized.zone === "cuff" ? current.construction.cuff.pattern.identity : current.construction.mainPattern.identity;
    const binding = validateGauge(normalized, sources, expectedPattern);
    return applyOperation(current, sources, "bind_zone_gauge", binding, metadata, (draft) => {
      const other = draft.gaugeBindings[binding.zone === "cuff" ? "main" : "cuff"];
      if (other && other.gaugeRecordIdentity === binding.gauge_record_identity && other.patternIdentity !== binding.pattern_identity) fail("CROSS_ZONE_GAUGE_REUSE_FORBIDDEN", "One gauge record cannot represent different zone patterns.");
      draft.gaugeBindings[binding.zone] = {
        zone: binding.zone, gaugeRecordIdentity: binding.gauge_record_identity, gaugeConfirmationKey: binding.gauge_confirmation_key,
        gaugeRecordFingerprint: binding.gauge_record_fingerprint, gaugeSourceContextFingerprint: binding.gauge_source_context_fingerprint,
        stitchesPerCmExact: canonicalDecimal(binding.stitches_per_cm_exact), rowsPerCmExact: canonicalDecimal(binding.rows_per_cm_exact), finishingState: binding.finishing_state,
        boundFabricContext: { yarnIdentity: binding.yarn_identity, toolIdentity: binding.tool_identity, patternIdentity: binding.pattern_identity, workingMethod: "in_round" }, patternIdentity: binding.pattern_identity,
        applicability: { mode: binding.applicability_mode, evidenceFingerprint: binding.evidence_fingerprint, comparedContextFingerprint: binding.compared_context_fingerprint, explicitConfirmation: binding.explicit_confirmation, confirmedAt: binding.confirmed_at },
      };
      resetReview(draft);
    });
  }

  function normalizePattern(pattern) { return { identity: pattern.identity, source_identity: pattern.source_identity ?? pattern.sourceIdentity, source_fingerprint: pattern.source_fingerprint ?? pattern.sourceFingerprint, display_value: pattern.display_value ?? pattern.displayValue, horizontal_repeat: pattern.horizontal_repeat ?? pattern.horizontalRepeat, fixed_working_stitches: pattern.fixed_working_stitches ?? pattern.fixedWorkingStitches, vertical_repeat: pattern.vertical_repeat ?? pattern.verticalRepeat, end_phase: pattern.end_phase ?? pattern.endPhase, origin: pattern.origin }; }
  function overrideMainPattern(state, sources, patternInput, metadata = {}) {
    const pattern = normalizePattern(patternInput); validatePattern(pattern); if (pattern.origin !== "user_override") fail("PATTERN_OVERRIDE_INVALID", "An override must have Stage 79 user provenance.");
    return applyOperation(state, sources, "override_main_pattern", pattern, metadata, (draft) => { draft.construction.mainPattern = clone(pattern); delete draft.gaugeBindings.main; resetReview(draft); });
  }
  function overrideCuff(state, sources, input = {}, metadata = {}) {
    const pattern = normalizePattern(input.pattern || {}); validatePattern(pattern); if (pattern.origin !== "user_override") fail("PATTERN_OVERRIDE_INVALID", "An override must have Stage 79 user provenance.");
    const height = canonicalDecimal(input.targetHeightCm, "CUFF_OVERRIDE_INVALID"); if (input.transitionIdentity !== "cuff-to-main-same-count-pattern-change:v1") fail("CUFF_OVERRIDE_INVALID", "V1 supports only the same-count transition.");
    const payload = { pattern, targetHeightCm: height, transitionIdentity: input.transitionIdentity };
    return applyOperation(state, sources, "override_cuff", payload, metadata, (draft) => { draft.construction.cuff = { pattern: clone(pattern), targetHeightCm: height, heightOrigin: "user_override" }; delete draft.gaugeBindings.cuff; resetReview(draft); });
  }

  function admissible(count, pattern, parity = "any") { const variable = count - pattern.fixed_working_stitches; return count > 0 && variable >= 0 && variable % pattern.horizontal_repeat === 0 && (parity === "any" || (parity === "even") === (count % 2 === 0)); }
  function endpointCandidates(raw, pattern, parity) {
    let lower = null; let upper = null; const center = Math.floor(raw);
    for (let distance = 0; distance <= 10000 && (lower === null || upper === null); distance += 1) {
      const down = center - distance; const up = Math.ceil(raw) + distance;
      if (lower === null && down > 0 && down <= raw && admissible(down, pattern, parity)) lower = down;
      if (upper === null && up >= raw && admissible(up, pattern, parity)) upper = up;
    }
    return [...new Set([lower, upper].filter((value) => value !== null))].sort((a, b) => a - b);
  }
  function solveEndpoints(draft) {
    const cuffTarget = Number(draft.targets.cuffTargetCircumferenceCm.value); const upperTarget = Number(draft.targets.upperSleeveTargetCircumferenceCm.value);
    const cuffGauge = Number(draft.gaugeBindings.cuff.stitchesPerCmExact); const mainGauge = Number(draft.gaugeBindings.main.stitchesPerCmExact);
    const rawCuff = cuffTarget * cuffGauge; const rawUpper = upperTarget * mainGauge;
    const cuffPattern = draft.construction.cuff.pattern; const mainPattern = draft.construction.mainPattern;
    const cuffCandidates = endpointCandidates(rawCuff, cuffPattern, cuffPattern.identity === "rib_1x1" ? "even" : "any");
    const upperCandidates = endpointCandidates(rawUpper, mainPattern, "any"); const valid = [];
    for (const cuff of cuffCandidates) for (const upper of upperCandidates) {
      if (upper < cuff || (upper - cuff) % 2 !== 0) continue;
      const cuffSigned = (cuff - rawCuff) / cuffGauge; const upperSigned = (upper - rawUpper) / mainGauge;
      valid.push({ cuff, upper, cuffSigned, upperSigned, score: [Math.max(Math.abs(cuffSigned), Math.abs(upperSigned)), Math.abs(cuffSigned) + Math.abs(upperSigned)] });
    }
    valid.sort((a, b) => a.cuff - b.cuff || a.upper - b.upper);
    if (!valid.length) return { status: "no_valid_candidate", rawCuff, rawUpper, cuffCandidates, upperCandidates, valid, selected: null, tied: [] };
    valid.sort((a, b) => a.score[0] - b.score[0] || a.score[1] - b.score[1] || a.cuff - b.cuff || a.upper - b.upper);
    const best = valid[0].score; const tied = valid.filter((item) => Math.abs(item.score[0] - best[0]) < 1e-12 && Math.abs(item.score[1] - best[1]) < 1e-12);
    valid.sort((a, b) => a.cuff - b.cuff || a.upper - b.upper);
    return { status: tied.length === 1 ? "selected" : "tie", rawCuff, rawUpper, cuffCandidates, upperCandidates, valid, selected: tied.length === 1 ? tied[0] : null, tied: tied.length === 1 ? [] : tied };
  }
  function toleranceZone(pair, cuffTarget, upperTarget, cuffGauge, mainGauge) {
    const normalCuff = Math.max(1 / cuffGauge, cuffTarget * 0.01); const normalUpper = Math.max(1 / mainGauge, upperTarget * 0.01);
    const warningCuff = Math.max(2 / cuffGauge, cuffTarget * 0.02); const warningUpper = Math.max(2 / mainGauge, upperTarget * 0.02);
    if (Math.abs(pair.cuffSigned) <= normalCuff && Math.abs(pair.upperSigned) <= normalUpper) return "normal";
    if (Math.abs(pair.cuffSigned) <= warningCuff && Math.abs(pair.upperSigned) <= warningUpper) return "warning";
    return "decision";
  }
  function candidateProjection(pair, draft) {
    const cuffTarget = Number(draft.targets.cuffTargetCircumferenceCm.value); const upperTarget = Number(draft.targets.upperSleeveTargetCircumferenceCm.value);
    const cuffGauge = Number(draft.gaugeBindings.cuff.stitchesPerCmExact); const mainGauge = Number(draft.gaugeBindings.main.stitchesPerCmExact);
    return { key: `cuff:${pair.cuff}|upper:${pair.upper}`, cuffStitches: pair.cuff, upperStitches: pair.upper, totalIncreaseStitches: pair.upper - pair.cuff, plannedCuffCm: decimal(pair.cuff / cuffGauge), plannedUpperCm: decimal(pair.upper / mainGauge), cuffSignedErrorCm: decimal(pair.cuffSigned), upperSignedErrorCm: decimal(pair.upperSigned), structurallyValid: true, toleranceZone: toleranceZone(pair, cuffTarget, upperTarget, cuffGauge, mainGauge) };
  }
  function allowedRow(row, pattern) { return row > 0 && row % pattern.vertical_repeat === 0 && (pattern.end_phase === "any" || (pattern.end_phase === "even") === (row % 2 === 0)); }
  function rowCandidates(raw, pattern) { let lower = null; let upper = null; for (let distance = 0; distance <= 100000 && (lower === null || upper === null); distance += 1) { const down = Math.floor(raw) - distance; const up = Math.ceil(raw) + distance; if (lower === null && down <= raw && allowedRow(down, pattern)) lower = down; if (upper === null && up >= raw && allowedRow(up, pattern)) upper = up; } return [...new Set([lower, upper].filter((item) => item !== null))].sort((a, b) => a - b); }
  function deriveTaper(draft, cuffCount, upperCount, rowCandidate) {
    const rowsPerCm = Number(draft.gaugeBindings.main.rowsPerCmExact); const targetLength = Number(draft.targets.cuffToUnderarmLengthCm.value); const cuffHeight = Number(draft.construction.cuff.targetHeightCm);
    const shapingLength = targetLength - cuffHeight; const rawRows = shapingLength * rowsPerCm; const candidates = rowCandidates(rawRows, draft.construction.mainPattern);
    if (!candidates.length) fail("NO_VALID_ROW_CANDIDATE", "No positive row count satisfies the main pattern phase.");
    const bestError = Math.min(...candidates.map((item) => Math.abs(item - rawRows))); const best = candidates.filter((item) => Math.abs(Math.abs(item - rawRows) - bestError) < 1e-12);
    let shapingRows;
    if (best.length > 1) { if (!best.includes(rowCandidate)) fail("ROW_ROUNDING_TIE_REQUIRES_CONFIRMATION", "A row-count tie requires an explicit candidate.", { candidates: best }); shapingRows = rowCandidate; }
    else { shapingRows = best[0]; if (rowCandidate !== undefined && rowCandidate !== null && rowCandidate !== shapingRows) fail("ROW_CANDIDATE_INVALID", "The row candidate is not canonical."); }
    const delta = upperCount - cuffCount; if (delta < 0) fail("TARGET_BELOW_START", "V1 requires upper count >= cuff count."); if (delta % 2) fail("NONINTEGRAL_EVENT_COUNT", "The stitch delta is not divisible by two.");
    const eligible = Array.from({ length: Math.max(0, shapingRows - 2) }, (_, index) => index + 2); const eventCount = delta / 2;
    if (eventCount > eligible.length) fail("INSUFFICIENT_ELIGIBLE_ROUNDS", "There are not enough eligible increase rounds.");
    const indices = Array.from({ length: eventCount }, (_, index) => Math.floor(((2 * (index + 1) - 1) * eligible.length) / (2 * eventCount)));
    const events = indices.map((index, ordinal) => ({ ordinal: ordinal + 1, mainRound: eligible[index], deltaStitches: 2, resultingStitchCount: cuffCount + (ordinal + 1) * 2, techniqueIdentity: "increase-technique:mirrored-lifted-pair:v1", placementPolicyIdentity: "paired-mirrored-increase-flanking-bor:v1" }));
    return { shapingLengthCm: decimal(shapingLength), rawShapingRows: decimal(rawRows), shapingRows, plannedShapingLengthCm: decimal(shapingRows / rowsPerCm), shapingLengthDeviationCm: decimal(shapingRows / rowsPerCm - shapingLength), totalIncreaseStitches: delta, increaseEventCount: eventCount, eligibleIncreaseRounds: eligible, increaseDistribution: { policyIdentity: TAPER_POLICY, cellCenterTieDirection: "later", events }, finalTargetCount: upperCount, stopCondition: { targetLengthCm: draft.targets.cuffToUnderarmLengthCm.value, plannedFullTubeStitches: upperCount, holdOrRemoveUnderarmStitches: false, physicalConfirmationRequiredLater: true } };
  }
  function reviewFromResult(draft, result, rowCandidate, selectedKey = null) {
    let selected = result.selected; let status = result.status;
    if (selectedKey !== null) { selected = result.tied.find((item) => `cuff:${item.cuff}|upper:${item.upper}` === selectedKey) || null; if (!selected) fail("ROUNDING_CANDIDATE_INVALID", "The candidate is not one of the tied minima."); status = "selected"; }
    if (status === "no_valid_candidate") fail("TARGET_IMPOSSIBLE_UNDER_CURRENT_CONSTRAINTS", "No endpoint pair satisfies repeat/parity/+2 constraints.");
    const review = { endpointSelectionPolicy: JOINT_ENDPOINT_POLICY, endpointStatus: result.status, rawCuffStitches: decimal(result.rawCuff), rawUpperStitches: decimal(result.rawUpper), cuffCandidates: result.cuffCandidates, upperCandidates: result.upperCandidates, candidatePairs: result.valid.map((item) => candidateProjection(item, draft)), tiedCandidateKeys: result.tied.map((item) => `cuff:${item.cuff}|upper:${item.upper}`), selectedCandidateKey: selected ? `cuff:${selected.cuff}|upper:${selected.upper}` : null, selectedCandidate: selected ? candidateProjection(selected, draft) : null, taper: null, reviewFingerprint: null };
    if (selected) review.taper = deriveTaper(draft, selected.cuff, selected.upper, rowCandidate);
    return review;
  }
  function reviewFingerprint(draft) { const review = clone(draft.derivedReview); delete review.reviewFingerprint; return fingerprint({ source: draft.source, referenceMeasurements: draft.referenceMeasurements, targets: draft.targets, construction: draft.construction, gaugeBindings: draft.gaugeBindings, derivedReview: review, confirmations: { inheritedConstructionReviewed: draft.confirmations.inheritedConstructionReviewed, roundingCandidateConfirmation: draft.confirmations.roundingCandidateConfirmation } }); }
  function enterReview(state, sources, input = {}, metadata = {}) {
    if (input.inheritedConstructionReviewed !== true) fail("CONSTRUCTION_REVIEW_REQUIRED", "Inherited construction must be explicitly reviewed.");
    const payload = { inheritedConstructionReviewed: true, rowCandidate: input.rowCandidate ?? null };
    return applyOperation(state, sources, "review_plan", payload, metadata, (draft) => {
      if (TARGET_ORDER.some((name) => !Object.prototype.hasOwnProperty.call(draft.targets, name))) fail("GEOMETRY_INCOMPLETE", "All three geometry targets are required.");
      if (!draft.gaugeBindings.cuff) fail("CUFF_GAUGE_REQUIRED", "An applicable cuff gauge is required."); if (!draft.gaugeBindings.main) fail("MAIN_GAUGE_REQUIRED", "An applicable main gauge is required.");
      draft.derivedReview = reviewFromResult(draft, solveEndpoints(draft), input.rowCandidate ?? null);
      draft.construction.profile = draft.derivedReview.selectedCandidate && draft.derivedReview.selectedCandidate.cuffStitches === draft.derivedReview.selectedCandidate.upperStitches ? "straight_endpoint_profile" : "nondecreasing_even_taper";
      draft.confirmations.inheritedConstructionReviewed = true; draft.lifecycle = "reviewing"; draft.derivedReview.reviewFingerprint = reviewFingerprint(draft);
    });
  }
  function confirmRoundingCandidate(state, sources, input = {}, metadata = {}) {
    return applyOperation(state, sources, "confirm_rounding_candidate", { candidateKey: input.candidateKey }, metadata, (draft) => {
      if (draft.lifecycle !== "reviewing" || draft.derivedReview?.endpointStatus !== "tie") fail("ROUNDING_TIE_NOT_PENDING", "There is no unresolved endpoint tie.");
      draft.derivedReview = reviewFromResult(draft, solveEndpoints(draft), null, input.candidateKey);
      draft.confirmations.roundingCandidateConfirmation = { operationId: metadata.operationId, confirmedAt: metadata.at, explicit: true, payloadFingerprint: fingerprint({ candidateKey: input.candidateKey }), candidateKey: input.candidateKey };
      draft.derivedReview.reviewFingerprint = reviewFingerprint(draft);
    });
  }
  function completedSourceBindings(sources) { const result = {}; for (const binding of sources.bindings) { const key = binding.stage === 63 ? "stage63GaugeHistory" : `stage${binding.stage}`; result[key] = { repositoryRecordId: binding.repository_record_id, repositoryRevision: binding.repository_revision, domainIdentity: binding.domain_identity, contractVersion: binding.contract_version, domainFingerprint: binding.domain_fingerprint, snapshotFingerprint: binding.snapshot_fingerprint }; } result.sourceBindingFingerprint = fingerprint(result); return result; }
  function complete(state, sourcesInput, input = {}, metadata = {}) {
    return applyOperation(state, sourcesInput, "complete_plan", { reviewFingerprint: input.reviewFingerprint }, metadata, (draft) => {
      const review = draft.derivedReview; if (draft.lifecycle !== "reviewing" || !review) fail("REVIEW_REQUIRED", "The plan must be reviewing before completion.");
      if (!review.selectedCandidate || !review.taper) fail("ROUNDING_CONFIRMATION_REQUIRED", "A selected endpoint pair is required."); if (review.reviewFingerprint !== input.reviewFingerprint) fail("REVIEW_FINGERPRINT_STALE", "Completion targets a stale review.");
      const finalReview = { operationId: metadata.operationId, confirmedAt: metadata.at, explicit: true, payloadFingerprint: fingerprint({ reviewFingerprint: input.reviewFingerprint }), reviewFingerprint: input.reviewFingerprint }; draft.confirmations.finalReview = finalReview;
      const candidate = review.selectedCandidate; const sources = validateAuthoritativeSources(sourcesInput);
      const derivedGeometry = { endpointSelectionPolicy: review.endpointSelectionPolicy, rawCuffStitches: review.rawCuffStitches, rawUpperStitches: review.rawUpperStitches, candidatePairs: review.candidatePairs, selectedCandidateKey: review.selectedCandidateKey, cuffTargetStitches: candidate.cuffStitches, upperSleeveTargetStitches: candidate.upperStitches, plannedCuffCircumferenceCm: candidate.plannedCuffCm, plannedUpperCircumferenceCm: candidate.plannedUpperCm, cuffDeviationCm: candidate.cuffSignedErrorCm, upperDeviationCm: candidate.upperSignedErrorCm, observedUpperSleeveEaseCm: decimal(Number(draft.targets.upperSleeveTargetCircumferenceCm.value) - Number(draft.referenceMeasurements.upperArmBodyCircumferenceCm)), ...clone(review.taper) };
      const snapshot = { schemaId: CONTRACT_SCHEMA_ID, contractVersion: CONTRACT_VERSION, kind: "SLEEVE_TARGET_GEOMETRY_PLANNING", stageIdentity: DOMAIN_IDENTITY, identity: draft.identity, projectId: draft.projectId, calculationId: draft.calculationId, epoch: draft.epoch, lifecycle: "completed", revision: draft.revision + 1, sourceBindings: completedSourceBindings(sources), referenceMeasurements: clone(draft.referenceMeasurements), confirmedTargets: { cuffTargetCircumferenceCm: clone(draft.targets.cuffTargetCircumferenceCm), cuffTargetLocation: "relaxed_finished_outer_cuff_edge", upperSleeveTargetCircumferenceCm: clone(draft.targets.upperSleeveTargetCircumferenceCm), upperTargetLocation: "full_sleeve_tube_at_underarm_before_allocation", cuffToUnderarmLengthCm: clone(draft.targets.cuffToUnderarmLengthCm), lengthMeasurementPath: "outer_cuff_edge_to_underarm_boundary_along_underarm_line" }, construction: clone(draft.construction), gaugeBindings: clone(draft.gaugeBindings), derivedGeometry, provenance: { fieldSources: { referenceMeasurements: { classification: "inherited_confirmed_source", sourceStage: "stage61" }, confirmedTargets: { classification: "user_confirmed", sourceStage: "stage79" }, "construction.cuff": { classification: draft.construction.cuff.pattern.origin === "user_override" ? "user_confirmed" : "inherited_confirmed_source", sourceStage: draft.construction.cuff.pattern.origin === "user_override" ? "stage79" : "stage70" }, "construction.mainPattern": { classification: draft.construction.mainPattern.origin === "user_override" ? "user_confirmed" : "inherited_confirmed_source", sourceStage: draft.construction.mainPattern.origin === "user_override" ? "stage79" : "stage73" }, derivedGeometry: { classification: "derived", sourceStage: "stage79", formulaOrPolicyIdentity: JOINT_ENDPOINT_POLICY } }, policyVersions: clone(POLICY_VERSIONS), mathCanonVersion: MATH_CANON_VERSION, mathCanonFingerprint: MATH_CANON_FINGERPRINT }, confirmations: { inheritedConstructionReviewed: true, gaugeApplicabilityEvidence: Object.keys(draft.gaugeBindings).sort().map((zone) => ({ zone, mode: draft.gaugeBindings[zone].applicability.mode, comparedContextFingerprint: draft.gaugeBindings[zone].applicability.comparedContextFingerprint, gaugeRecordFingerprint: draft.gaugeBindings[zone].gaugeRecordFingerprint, explicitConfirmation: draft.gaugeBindings[zone].applicability.explicitConfirmation, confirmedAt: draft.gaugeBindings[zone].applicability.confirmedAt })), roundingCandidateConfirmation: clone(draft.confirmations.roundingCandidateConfirmation), finalReview }, supersession: { supersedesIdentity: draft.predecessorIdentity, reason: draft.predecessorIdentity ? "user_requested_correction" : null }, timestamps: { createdAt: draft.timestamps.createdAt, completedAt: metadata.at }, audit: { event: "SLEEVE_TARGET_GEOMETRY_CONFIRMED", operationId: metadata.operationId }, fingerprint: "" };
      snapshot.fingerprint = fingerprint(semanticState(snapshot)); draft.completedSnapshot = snapshot; draft.timestamps.completedAt = metadata.at; draft.lifecycle = "completed";
    }, true);
  }

  function validateState(source) {
    const value = clone(source); exactKeys(value, STATE_KEYS);
    if (value.kind !== KIND || value.version !== CONTRACT_VERSION || !["ready_to_collect", "collecting", "reviewing", "completed"].includes(value.lifecycle)) fail("PROGRESS_STATE_INVALID", "Stage 79 state identity or lifecycle is invalid.");
    requireUuid(value.projectId, "PROJECT_ID_INVALID"); requireUuid(value.calculationId, "CALCULATION_ID_INVALID");
    if (!Number.isSafeInteger(value.epoch) || value.epoch < 1 || !Number.isSafeInteger(value.revision) || value.revision < 1) fail("PROGRESS_STATE_INVALID", "Stage 79 epoch/revision is invalid.");
    if (value.fingerprint !== fingerprint(semanticState(value))) fail("FINGERPRINT_MISMATCH", "Stage 79 state fingerprint does not match its content.");
    if (!record(value.source) || !record(value.source.chain) || value.source.sourceBindingFingerprint !== fingerprint(value.source.chain)) fail("PROGRESS_STATE_INVALID", "Stage 79 source binding is invalid.");
    validateAuthoritativeSources(value.source.chain);
    if (!record(value.targets) || Object.keys(value.targets).some((key) => !TARGET_ORDER.includes(key))) fail("PROGRESS_STATE_INVALID", "Stage 79 targets are invalid.");
    for (const target of Object.values(value.targets)) { exactKeys(target, ["value", "unit", "semanticRole", "provenance", "confirmedAt"]); canonicalDecimal(target.value); requireTimestamp(target.confirmedAt); }
    if (!record(value.construction) || value.construction.direction?.value !== "bottom_up" || value.construction.componentDirection?.value !== "cuff_up" || value.construction.workingMethod?.value !== "in_round" || value.construction.topologyIdentity !== REQUIRED_TOPOLOGY || value.construction.quantity !== 2) fail("PROGRESS_STATE_INVALID", "Stage 79 construction is invalid.");
    validatePattern(value.construction.cuff?.pattern); validatePattern(value.construction.mainPattern);
    if (!record(value.gaugeBindings) || Object.keys(value.gaugeBindings).some((key) => !["cuff", "main"].includes(key))) fail("PROGRESS_STATE_INVALID", "Stage 79 gauge bindings are invalid.");
    if (!record(value.confirmations) || !Array.isArray(value.operations) || !record(value.timestamps)) fail("PROGRESS_STATE_INVALID", "Stage 79 operation history is invalid.");
    const operationIds = new Set(); for (const receipt of value.operations) { exactKeys(receipt, ["operationId", "command", "payloadFingerprint", "resultingRevision", "at"]); requireUuid(receipt.operationId, "OPERATION_ID_INVALID"); requireFingerprint(receipt.payloadFingerprint); requireTimestamp(receipt.at); if (operationIds.has(receipt.operationId)) fail("PROGRESS_STATE_INVALID", "Duplicate operation receipt."); operationIds.add(receipt.operationId); }
    requireTimestamp(value.timestamps.createdAt); if (value.timestamps.completedAt !== null) requireTimestamp(value.timestamps.completedAt);
    if (value.lifecycle === "completed") { if (!record(value.completedSnapshot) || value.completedSnapshot.lifecycle !== "completed" || value.completedSnapshot.projectId !== value.projectId || value.completedSnapshot.calculationId !== value.calculationId || value.completedSnapshot.epoch !== value.epoch || value.completedSnapshot.fingerprint !== fingerprint(semanticState(value.completedSnapshot))) fail("COMPLETED_SNAPSHOT_INVALID", "Completed Stage 79 snapshot is invalid."); }
    else if (value.completedSnapshot !== null) fail("PROGRESS_STATE_INVALID", "A live epoch cannot contain a completed snapshot.");
    return deepFreeze(value);
  }

  function projectView(stateInput) {
    try {
      const state = validateState(stateInput); const missing = nextMissingInput(state);
      const gauges = {};
      for (const zone of ["cuff", "main"]) gauges[zone] = state.gaugeBindings[zone] ? { status: "valid", applicabilityMode: state.gaugeBindings[zone].applicability.mode, patternIdentity: state.gaugeBindings[zone].patternIdentity } : { status: "missing", applicabilityMode: null, patternIdentity: zone === "cuff" ? state.construction.cuff.pattern.identity : state.construction.mainPattern.identity };
      const endpoint = state.derivedReview ? { status: state.derivedReview.selectedCandidate ? "selected" : state.derivedReview.endpointStatus, selectedCandidateKey: state.derivedReview.selectedCandidateKey, tiedCandidates: clone(state.derivedReview.tiedCandidateKeys), candidatePairs: clone(state.derivedReview.candidatePairs) } : { status: "unresolved", selectedCandidateKey: null, tiedCandidates: [], candidatePairs: [] };
      const review = state.derivedReview ? {
        targets: {
          cuffCircumferenceCm: state.targets.cuffTargetCircumferenceCm?.value ?? null,
          upperSleeveCircumferenceCm: state.targets.upperSleeveTargetCircumferenceCm?.value ?? null,
          cuffToUnderarmLengthCm: state.targets.cuffToUnderarmLengthCm?.value ?? null,
        },
        castOnTarget: state.derivedReview.selectedCandidate?.cuffStitches ?? null,
        upperTarget: state.derivedReview.selectedCandidate?.upperStitches ?? null,
        increaseEventCount: state.derivedReview.taper?.increaseEventCount ?? null,
        scheduleSummary: state.derivedReview.taper ? { shapingRows: state.derivedReview.taper.shapingRows, events: clone(state.derivedReview.taper.increaseDistribution.events) } : null,
        targetLengthCm: state.targets.cuffToUnderarmLengthCm?.value ?? null,
        stopCondition: clone(state.derivedReview.taper?.stopCondition ?? null),
        appliedContexts: {
          method: "in_round",
          direction: "bottom_up",
          cuff: {
            pattern: state.construction.cuff.pattern.display_value,
            gaugeStatus: gauges.cuff.status,
            stitchesPerCm: state.gaugeBindings.cuff?.stitchesPerCmExact ?? null,
            rowsPerCm: state.gaugeBindings.cuff?.rowsPerCmExact ?? null,
            finishingState: state.gaugeBindings.cuff?.finishingState ?? null,
          },
          main: {
            pattern: state.construction.mainPattern.display_value,
            gaugeStatus: gauges.main.status,
            stitchesPerCm: state.gaugeBindings.main?.stitchesPerCmExact ?? null,
            rowsPerCm: state.gaugeBindings.main?.rowsPerCmExact ?? null,
            finishingState: state.gaugeBindings.main?.finishingState ?? null,
          },
        },
        reviewFingerprint: state.derivedReview.reviewFingerprint,
      } : null;
      return deepFreeze({ available: true, blocked: false, lifecycle: state.lifecycle, epoch: state.epoch, revision: state.revision, confirmedGeometryTargets: Object.fromEntries(TARGET_ORDER.map((key) => [key, Object.prototype.hasOwnProperty.call(state.targets, key)])), nextMissingInput: missing, inheritedPolicy: { cuffCandidate: state.construction.cuff.pattern.display_value, mainPattern: state.construction.mainPattern.display_value, mainPatternProvenance: state.construction.mainPattern.origin, method: "in_round", direction: "bottom_up" }, gaugeStatus: gauges, endpointState: endpoint, review, completed: state.lifecycle === "completed" ? { immutableSummary: clone(state.completedSnapshot), physicalSleeveCompleted: false } : null });
    } catch (error) { return deepFreeze({ available: false, blocked: true, lifecycle: "blocked", diagnostic: { code: error?.code || "PROGRESS_STATE_INVALID", message: error?.userMessage || error?.message || "Stage 79 state is unavailable." } }); }
  }

  const api = Object.freeze({ DOMAIN_IDENTITY, KIND, PROGRESS_KIND, CONTRACT_SCHEMA_ID, CONTRACT_VERSION, MATH_CANON_VERSION, MATH_CANON_FINGERPRINT, JOINT_ENDPOINT_POLICY, TAPER_POLICY, REQUIRED_TOPOLOGY, REQUIRED_STAGE78_REASON, REQUIRED_STAGE78_PREREQUISITES, SOURCE_STAGES, EXPECTED_SOURCE_CONTRACTS, TARGET_ORDER, POLICY_VERSIONS, SleevePlanningError, canonicalize, fingerprint, canonicalDecimal, validatePattern, validateAuthoritativeSources, validateState, startEpoch, collectTarget, bindGauge, overrideMainPattern, overrideCuff, enterReview, confirmRoundingCandidate, complete, nextMissingInput, projectView });
  globalObject.YarnAIProjectSleeveTargetGeometryPlanning = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
