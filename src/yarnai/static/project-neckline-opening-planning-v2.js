"use strict";

(function initializeProjectNecklineOpeningPlanningV2Reader(globalObject) {
  const legacy = globalObject.YarnAIProjectNecklineOpeningPlanningV1 || (typeof require === "function" ? require("./project-neckline-opening-planning-v1.js") : null);
  if (!legacy) throw new Error("The Stage 91 V1 reader must be loaded before Stage 91 V2.");

  const DOMAIN_IDENTITY = "PROJECT_NECKLINE_OPENING_PLANNING";
  const KIND = DOMAIN_IDENTITY;
  const PROGRESS_KIND = KIND;
  const CONTRACT_SCHEMA_ID = "NECKLINE_OPENING_PLANNING_CONTRACT_V2";
  const CONTRACT_VERSION = 2;
  const RESULT_SCHEMA_ID = "NECKLINE_OPENING_PLAN_V2";
  const RESULT_VERSION = 2;
  const INSTRUCTION_SCHEMA_ID = "NECKLINE_OPENING_EXECUTION_INSTRUCTION_V1";
  const TOPOLOGY_SCHEMA_ID = "FABRIC_TOPOLOGY_STATE_V1";
  const YARN_STATE_SCHEMA_ID = "YARN_STATE_V1";
  const EXECUTION_CAPABILITY_ID = "reversible_structural_execution_v1";
  const OUTPUT_BOUNDARY = "neckline_opening_plan_completed";
  const NEXT_BOUNDARY = "PROJECT_NECKLINE_OPENING_EXECUTION";
  const SUCCESSOR_AFTER_EXECUTION = "PROJECT_NECKLINE_EDGE_FINISHING_PLANNING";
  const ROUTE_PATH = "/project-neckline-opening-planning";
  const SECTION_ORDER = legacy.SECTION_ORDER;
  const INTERFACE_ORDER = legacy.INTERFACE_ORDER;
  const SOURCE_KINDS = legacy.SOURCE_KINDS;
  const LIFECYCLES = Object.freeze(["collecting_opening_choices", "reviewing_neckline_opening_plan", "completed"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;

  class NecklineOpeningPlanningError extends Error {
    constructor(code, message, details = {}) { super(message); this.name = "NecklineOpeningPlanningError"; this.code = code; this.userMessage = message; this.details = Object.freeze(clone(details)); }
  }
  function fail(code, message, details) { throw new NecklineOpeningPlanningError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  const canonicalize = legacy.canonicalize;
  const fingerprint = legacy.fingerprint;
  function withFingerprint(value) { const next = clone(value); delete next.fingerprint; next.fingerprint = fingerprint(next); return next; }
  function exactKeys(value, keys, code = "STATE_INVALID") { if (!record(value) || Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(code, "Stage 91 V2 contains missing or forbidden fields."); }
  function requireUuid(value, code = "OPERATION_ID_INVALID") { if (!UUID_V7.test(value || "")) fail(code, "A UUIDv7 is required."); return value; }
  function requireTimestamp(value) { if (!TIMESTAMP.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "An ISO UTC timestamp with milliseconds is required."); return value; }
  function requireFingerprint(value, code = "FINGERPRINT_INVALID") { if (!FINGERPRINT.test(value || "")) fail(code, "A canonical fingerprint is required."); return value; }
  function positiveInteger(value, code = "INTEGER_INVALID") { if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) fail(code, "A positive safe integer is required."); return value; }
  function nonNegativeInteger(value, code = "INTEGER_INVALID") { if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) fail(code, "A non-negative safe integer is required."); return value; }
  function opposite(face) { return face === "RS" ? "WS" : "RS"; }
  function sumObject(value) { return Object.values(value).reduce((total, item) => total + item, 0); }
  function containsCut(value) { return /fabric[_ -]?cut|steek/i.test(canonicalize(value)); }

  function validateSource(input) {
    try { const source = legacy.validateSource(input); if (source.terminal.heldGroups.some((item) => !Number.isSafeInteger(item.count) || item.count < 0) || source.terminal.heldGroups.reduce((total, item) => total + item.count, 0) !== source.terminal.heldUnderarmTotal) fail("HELD_GROUP_COUNTS_REQUIRED", "Stage 91 V2 requires exact counts for all four held underarm groups."); return source; }
    catch (error) { fail(error.code || "SOURCE_INVALID", error.userMessage || error.message); }
  }
  function validateChoices(source, input) {
    let choices;
    try { choices = clone(legacy.validateChoices(source, input)); }
    catch (error) { fail(error.code || "CHOICES_INVALID", error.userMessage || error.message); }
    if (["reserved_steek_cut", "authorized_reinforced_cut"].includes(choices.openingMethod)) fail("UNSUPPORTED_FABRIC_CUT", "Stage 91 V2 does not support fabric or steek cutting.");
    return choices;
  }
  const choicesRequired = legacy.choicesRequired;

  function range(identity, count, orientation = "forward") { return { rangeIdentity: identity, orientation, exactCount: count }; }
  function interfaceDisposition(source) { return INTERFACE_ORDER.map((identity) => ({ interfaceIdentity: identity, state: "active_crossed", ownerPolicy: source.terminal.ownershipPolicy, preservedStitches: source.terminal.lineWidth })); }
  function heldGroups(source, necklineHeld = 0) {
    const groups = source.terminal.heldGroups.map((item) => ({ identity: item.identity, ownerSegmentIdentity: "underarm_held", sourceSectionIdentity: item.identity, exactCount: item.count, remainsLive: true }));
    if (necklineHeld) groups.push({ identity: "center_neck_held", ownerSegmentIdentity: "neckline_held", sourceSectionIdentity: "center_front", exactCount: necklineHeld, remainsLive: true });
    return groups;
  }
  function topologySnapshot(source, planningIdentity, ordinal, mode, sectionCounts, necklineHeld, nextLegalExecutionOrdinal) {
    const linear = mode === "linear";
    const ordered = linear
      ? [range("right_front", sectionCounts.right_front), range("right_sleeve_active", sectionCounts.right_sleeve_active), range("back", sectionCounts.back), range("left_sleeve_active", sectionCounts.left_sleeve_active), range("left_front", sectionCounts.left_front)]
      : SECTION_ORDER.map((identity) => range(identity, sectionCounts[identity]));
    const boundaries = linear
      ? [
          { boundaryIdentity: "right_front_edge", kind: "opening_edge", anatomicalRole: "wearer_right_front_opening", adjacentSegmentIdentity: "neckline_live", activeForTraversal: true, historical: false },
          { boundaryIdentity: "left_front_edge", kind: "opening_edge", anatomicalRole: "wearer_left_front_opening", adjacentSegmentIdentity: "neckline_live", activeForTraversal: true, historical: false },
          { boundaryIdentity: "raglan_marker_4", kind: "bor", anatomicalRole: "historical_beginning_of_round", adjacentSegmentIdentity: "neckline_live", activeForTraversal: false, historical: true },
        ]
      : [{ boundaryIdentity: "raglan_marker_4", kind: "bor", anatomicalRole: "beginning_of_round_before_front", adjacentSegmentIdentity: "yoke_live", activeForTraversal: true, historical: false }];
    return withFingerprint({ schemaId: TOPOLOGY_SCHEMA_ID, identity: `${planningIdentity}:topology:${ordinal}:${linear ? "linear" : "cyclic"}`, version: 1, liveTopology: linear ? "linear" : "cyclic", traversalMode: linear ? "flat" : "circular", activeSegmentIdentity: linear ? "neckline_live" : "yoke_live", segments: [{ segmentIdentity: linear ? "neckline_live" : "yoke_live", state: "active", orderedSectionRanges: ordered, startBoundaryIdentity: linear ? "right_front_edge" : null, endBoundaryIdentity: linear ? "left_front_edge" : null }], heldGroups: heldGroups(source, necklineHeld), boundaries, activeBorIdentity: linear ? null : "raglan_marker_4", historicalBorIdentities: linear ? ["raglan_marker_4"] : [], openingEdgeIdentities: linear ? ["right_front_edge", "left_front_edge"] : [], markerAndInterfaceDisposition: interfaceDisposition(source), nextLegalExecutionOrdinal, workingStartBoundaryIdentity: linear ? "right_front_edge" : "raglan_marker_4", workingEndBoundaryIdentity: linear ? "left_front_edge" : "raglan_marker_4", availableRangeIdentities: ordered.map((item) => item.rangeIdentity) });
  }
  function yarnState(planningIdentity, step, activeSourceIdentity, location, primaryState = "exhausted") {
    const sources = [];
    if (step === 0) sources.push({ yarnSourceIdentity: "stage90_primary_yarn", materialBindingIdentity: "stage90_material", state: "attached", active: true, attachedSegmentIdentity: "yoke_live", attachmentBoundaryIdentity: "raglan_marker_4", attachmentAnchor: "before_front", continuity: "continuous", freeTailIdentity: null });
    else {
      sources.push({ yarnSourceIdentity: "stage90_primary_yarn", materialBindingIdentity: "stage90_material", state: primaryState, active: false, attachedSegmentIdentity: null, attachmentBoundaryIdentity: null, attachmentAnchor: "raglan_marker_4", continuity: "broken_with_tail", freeTailIdentity: "stage90_primary_tail" });
      sources.push({ yarnSourceIdentity: "neckline_execution_yarn", materialBindingIdentity: "stage90_material", state: "attached", active: true, attachedSegmentIdentity: "neckline_live", attachmentBoundaryIdentity: location, attachmentAnchor: `${location}:live_edge`, continuity: "newly_joined", freeTailIdentity: null });
    }
    return withFingerprint({ schemaId: YARN_STATE_SCHEMA_ID, identity: `${planningIdentity}:yarn:${step}:${location}`, version: 1, activeSourceIdentity, sources, rejoinRequirement: { required: false, sourceIdentity: null, boundaryIdentity: null, anchor: null, requiresNewSource: false }, workingLocation: { segmentIdentity: step === 0 ? "yoke_live" : "neckline_live", boundaryIdentity: location, interfaceIdentity: null } });
  }
  function stitchLedger(source, sectionCounts, necklineHeld, boundOff, decreased) {
    const workingActive = sumObject(sectionCounts);
    return { sectionCounts: clone(sectionCounts), workingActive, necklineHeld, underarmHeld: source.terminal.heldUnderarmTotal, boundOff, decreased, castOn: 0, pickedUp: 0, reactivatedHeld: 0, totalLive: workingActive + necklineHeld + source.terminal.heldUnderarmTotal };
  }
  function orderedPath(sectionCounts, from) {
    const forward = ["right_front", "right_sleeve_active", "back", "left_sleeve_active", "left_front"];
    const order = from === "right_front_edge" ? forward : [...forward].reverse();
    return order.map((identity) => range(identity, sectionCounts[identity], from === "right_front_edge" ? "forward" : "reverse"));
  }
  function yarnActionsForTransition() {
    return [
      { actionIndex: 1, actionKind: "break_active_source_at_anchor", yarnSourceIdentity: "stage90_primary_yarn", fromAnchor: "raglan_marker_4:before_front", toAnchor: "stage90_primary_tail", requiresNewSource: false, resultingContinuity: "broken_with_tail" },
      { actionIndex: 2, actionKind: "deactivate_source", yarnSourceIdentity: "stage90_primary_yarn", fromAnchor: "stage90_primary_tail", toAnchor: "stage90_primary_tail", requiresNewSource: false, resultingContinuity: "broken_with_tail" },
      { actionIndex: 3, actionKind: "join_new_source_at_boundary", yarnSourceIdentity: "neckline_execution_yarn", fromAnchor: null, toAnchor: "right_front_edge:live_edge", requiresNewSource: true, resultingContinuity: "newly_joined" },
      { actionIndex: 4, actionKind: "activate_source", yarnSourceIdentity: "neckline_execution_yarn", fromAnchor: "right_front_edge:live_edge", toAnchor: "right_front_edge:live_edge", requiresNewSource: false, resultingContinuity: "newly_joined" },
    ];
  }
  function action(actionIndex, actionKind, affectedRangeIdentity, exactCount, side, anchorBefore, anchorAfter, reversibilityClass = "reversible_knitted_structure") {
    return { actionIndex, actionKind, anchorBefore, anchorAfter, affectedRangeIdentity, exactCount, side, setupStitchPolicy: actionKind === "bind_off" ? "first_stitch_is_existing_live_stitch_no_extra_setup" : null, reversibilityClass };
  }

  function buildExecutionInstructions(source, choices, candidate, geometrySchedule, planningIdentity) {
    if (!geometrySchedule?.rows?.length) fail("EMPTY_INSTRUCTION_SEQUENCE", "At least one execution instruction is required.");
    const instructions = [];
    let previousFingerprint = null;
    let beforeTopology = topologySnapshot(source, planningIdentity, 0, "cyclic", source.terminal.sectionCounts, 0, 1);
    let beforeYarn = yarnState(planningIdentity, 0, "stage90_primary_yarn", "raglan_marker_4");
    for (let index = 0; index < geometrySchedule.rows.length; index += 1) {
      const row = geometrySchedule.rows[index];
      const ordinal = index + 1;
      const transition = ordinal === 1;
      const faceWorked = ordinal % 2 === 1 ? "RS" : "WS";
      const fromBoundary = faceWorked === "RS" ? "right_front_edge" : "left_front_edge";
      const toBoundary = faceWorked === "RS" ? "left_front_edge" : "right_front_edge";
      const terminal = ordinal === geometrySchedule.rows.length;
      const sectionCountsAfter = clone(row.sectionCountsAfter);
      const ledgerBefore = transition
        ? stitchLedger(source, source.terminal.sectionCounts, 0, 0, 0)
        : clone(instructions.at(-1).stitchLedgerAfter);
      const ledgerAfter = stitchLedger(source, sectionCountsAfter, row.necklineHeldAfter, row.boundOffAfter, row.decreasedAfter);
      const afterTopology = topologySnapshot(source, planningIdentity, ordinal, "linear", sectionCountsAfter, row.necklineHeldAfter, terminal ? null : ordinal + 1);
      const afterYarn = yarnState(planningIdentity, ordinal, "neckline_execution_yarn", toBoundary);
      const orderedActions = [];
      let actionIndex = 1;
      if (transition) {
        orderedActions.push(action(actionIndex++, "retire_active_bor", "raglan_marker_4", 0, "not_applicable", "raglan_marker_4", "raglan_marker_4:historical"));
        if (row.newlyHeldBySection.center_front) orderedActions.push(action(actionIndex++, "hold", "center_front", row.newlyHeldBySection.center_front, "center", "center_front:first", "center_front:last"));
        if (row.bindOffBySection.center_front) orderedActions.push(action(actionIndex++, "bind_off", "center_front", row.bindOffBySection.center_front, "center", "center_front:first", "center_front:last"));
        orderedActions.push(action(actionIndex++, "create_opening_boundaries", "center_front", 2, "both", "center_front", "right_front_edge,left_front_edge"));
      }
      if (row.decreasesBySection.right_front) {
        const firstRange = fromBoundary === "right_front_edge" ? "right_front" : "left_front";
        const secondRange = firstRange === "right_front" ? "left_front" : "right_front";
        orderedActions.push(action(actionIndex++, "decrease", firstRange, 1, firstRange === "right_front" ? "wearer_right" : "wearer_left", fromBoundary, `${firstRange}:neck_edge`));
        orderedActions.push(action(actionIndex++, "work", "neckline_live", Math.max(0, ledgerAfter.workingActive - 2), "across", `${firstRange}:neck_edge`, `${secondRange}:neck_edge`));
        orderedActions.push(action(actionIndex++, "decrease", secondRange, 1, secondRange === "right_front" ? "wearer_right" : "wearer_left", `${secondRange}:neck_edge`, toBoundary));
      } else orderedActions.push(action(actionIndex++, "work", "neckline_live", ledgerAfter.workingActive, "across", fromBoundary, toBoundary));
      const direction = { directionId: `${fromBoundary}_to_${toBoundary}`, fromBoundaryIdentity: fromBoundary, toBoundaryIdentity: toBoundary, orderedSegmentIdentities: ["neckline_live"], traversalRanges: orderedPath(sectionCountsAfter, fromBoundary) };
      const turnInstruction = terminal
        ? { kind: "stop", atBoundaryIdentity: toBoundary, topologyStateAtTurn: afterTopology.fingerprint, faceAfter: faceWorked, nextDirectionId: null, nextStartBoundaryIdentity: null, unworkedRangeIdentities: [] }
        : { kind: "turn", atBoundaryIdentity: toBoundary, topologyStateAtTurn: afterTopology.fingerprint, faceAfter: opposite(faceWorked), nextDirectionId: `${toBoundary}_to_${fromBoundary}`, nextStartBoundaryIdentity: toBoundary, unworkedRangeIdentities: [] };
      const item = {
        schemaId: INSTRUCTION_SCHEMA_ID,
        instructionIdentity: `${planningIdentity}:instruction:${ordinal}`,
        executionOrdinal: ordinal,
        fabricRowOrRoundOrdinal: ordinal,
        instructionKind: transition ? "transition_pass" : "flat_pass",
        workMode: transition ? "circular_to_flat_transition" : "flat",
        faceBefore: faceWorked,
        faceWorked,
        direction,
        startingBoundary: { boundaryIdentity: transition ? "raglan_marker_4" : fromBoundary, role: transition ? "historical_bor_stop" : "active_row_start" },
        endingBoundary: { boundaryIdentity: toBoundary, role: terminal ? "terminal_stop" : "turn_edge" },
        activeSections: orderedPath(sectionCountsAfter, fromBoundary).map((item) => item.rangeIdentity),
        workedRanges: orderedPath(sectionCountsAfter, fromBoundary),
        skippedRanges: row.necklineHeldAfter ? [range("center_neck_held", row.necklineHeldAfter)] : [],
        heldRanges: [...source.terminal.heldGroups.map((item) => range(item.identity, item.count)), ...(row.necklineHeldAfter ? [range("center_neck_held", row.necklineHeldAfter)] : [])],
        orderedActions,
        turnInstruction,
        yarnStateBefore: clone(beforeYarn),
        yarnActions: transition ? yarnActionsForTransition() : [{ actionIndex: 1, actionKind: terminal ? "stop_with_source_at_boundary" : "turn_with_source_attached", yarnSourceIdentity: "neckline_execution_yarn", fromAnchor: fromBoundary, toAnchor: toBoundary, requiresNewSource: false, resultingContinuity: "newly_joined" }],
        yarnStateAfter: clone(afterYarn),
        joinRejoinSemantics: transition ? { applicable: true, kind: "break_primary_and_join_new_source", sourceIdentity: "neckline_execution_yarn", boundaryIdentity: "right_front_edge", requiresNewSource: true } : { applicable: false, kind: "not_applicable", sourceIdentity: null, boundaryIdentity: null, requiresNewSource: false },
        topologyBefore: clone(beforeTopology),
        topologyAfter: clone(afterTopology),
        stitchLedgerBefore: ledgerBefore,
        stitchLedgerAfter: ledgerAfter,
        boundaryInterfaceStitches: { expectedAtStart: transition ? source.terminal.sectionCounts.front : sectionCountsAfter[fromBoundary === "right_front_edge" ? "right_front" : "left_front"], expectedAtEnd: sectionCountsAfter[toBoundary === "right_front_edge" ? "right_front" : "left_front"], raglanInterfaceCount: INTERFACE_ORDER.length, openingEdgeCount: 2 },
        openingEdgesAffected: transition ? ["right_front_edge", "left_front_edge"] : [fromBoundary, toBoundary],
        markerAndInterfaceDisposition: interfaceDisposition(source),
        irreversibleAction: transition ? { present: true, class: "yarn_continuity_break", requiredAuthorizationKind: "explicit_plan_confirmation", requiredReceiptKind: "yarn_break_and_rejoin_confirmed" } : { present: false, class: "none", requiredAuthorizationKind: "not_applicable", requiredReceiptKind: "instruction_completion" },
        expectedConservationResult: { equationHolds: ledgerBefore.totalLive === ledgerAfter.totalLive + (ledgerAfter.boundOff - ledgerBefore.boundOff) + (ledgerAfter.decreased - ledgerBefore.decreased), underarmHeldUnchanged: ledgerBefore.underarmHeld === ledgerAfter.underarmHeld, castOn: 0, pickedUp: 0, tolerance: 0 },
        completionObservationsRequired: ["face", "direction", "active_stitch_count", "held_stitch_count", "working_yarn_location", "topology_fingerprint"],
        nextExpectedInstruction: terminal ? { executionOrdinal: null, faceWorked: null, directionId: null, startBoundaryIdentity: null } : { executionOrdinal: ordinal + 1, faceWorked: opposite(faceWorked), directionId: `${toBoundary}_to_${fromBoundary}`, startBoundaryIdentity: toBoundary },
        previousInstructionIdentity: instructions.at(-1)?.instructionIdentity || null,
        nextInstructionIdentity: terminal ? null : `${planningIdentity}:instruction:${ordinal + 1}`,
        previousInstructionFingerprint: previousFingerprint,
        terminalState: terminal ? "terminal" : "non_terminal",
        fingerprint: "",
      };
      if (!item.expectedConservationResult.equationHolds || !item.expectedConservationResult.underarmHeldUnchanged) fail("STITCH_CONSERVATION_INVALID", "An execution instruction does not conserve stitches.");
      const frozen = withFingerprint(item); instructions.push(frozen); previousFingerprint = frozen.fingerprint; beforeTopology = afterTopology; beforeYarn = afterYarn;
    }
    return instructions;
  }

  function deriveReview(sourceInput, choicesInput, planningIdentity = "stage91-v2-preview") {
    const source = validateSource(sourceInput); const choices = validateChoices(source, choicesInput);
    let geometry;
    try { geometry = legacy.deriveReview(source, choices); }
    catch (error) { fail(error.code || "REVIEW_INVALID", error.userMessage || error.message); }
    const executionInstructions = geometry.selectedCandidate && geometry.schedule ? buildExecutionInstructions(source, choices, geometry.selectedCandidate, geometry.schedule, planningIdentity) : null;
    const base = { sourceFingerprint: source.fingerprint, choicesFingerprint: fingerprint(choices), candidates: clone(geometry.candidates), selectedCandidate: clone(geometry.selectedCandidate), geometrySchedule: clone(geometry.schedule), executionInstructions, requiresCandidateSelection: geometry.requiresCandidateSelection };
    return { ...base, reviewFingerprint: fingerprint(base) };
  }

  function buildEntryPrecondition(state, instructions) {
    const first = instructions[0];
    return withFingerprint({ sourceStage90ResultIdentity: state.source.stage90.resultIdentity, sourceStage90ResultFingerprint: state.source.stage90.resultFingerprint, topologyState: clone(first.topologyBefore), requiredPhysicalFacing: first.faceBefore, requiredNeedleOrientation: "stage90_bor_before_front_ready_to_stop", requiredYarnState: clone(first.yarnStateBefore), requiredActiveBor: "raglan_marker_4", noOpeningEdgesExist: true, noNecklineActionApplied: true, requiresStage92BaselineConfirmation: true });
  }
  function buildClosureProof(state, instructions, finalExecutionState) {
    const chainFingerprint = fingerprint(instructions.map((item) => item.fingerprint));
    return withFingerprint({ complete: instructions.length > 0, instructionCount: instructions.length, firstInstructionIdentity: instructions[0]?.instructionIdentity || null, terminalInstructionIdentity: instructions.at(-1)?.instructionIdentity || null, contiguousOrdinals: instructions.every((item, index) => item.executionOrdinal === index + 1), uniqueInstructionIdentities: new Set(instructions.map((item) => item.instructionIdentity)).size === instructions.length, previousNextLinksClosed: instructions.every((item, index) => item.previousInstructionIdentity === (instructions[index - 1]?.instructionIdentity || null) && item.nextInstructionIdentity === (instructions[index + 1]?.instructionIdentity || null)), topologyChainClosed: instructions.every((item, index) => !index || canonicalize(instructions[index - 1].topologyAfter) === canonicalize(item.topologyBefore)), yarnChainClosed: instructions.every((item, index) => !index || canonicalize(instructions[index - 1].yarnStateAfter) === canonicalize(item.yarnStateBefore)), faceDirectionTurnChainClosed: instructions.every((item, index) => !index || instructions[index - 1].nextExpectedInstruction.faceWorked === item.faceWorked && instructions[index - 1].nextExpectedInstruction.directionId === item.direction.directionId && instructions[index - 1].turnInstruction.faceAfter === item.faceBefore), stitchConservationProven: instructions.every((item) => item.expectedConservationResult.equationHolds && item.expectedConservationResult.tolerance === 0), underarmsUnchanged: instructions.every((item) => item.expectedConservationResult.underarmHeldUnchanged), terminalStateMatches: canonicalize(finalExecutionState) === canonicalize({ topology: instructions.at(-1).topologyAfter, stitchLedger: instructions.at(-1).stitchLedgerAfter, yarnState: instructions.at(-1).yarnStateAfter, face: instructions.at(-1).turnInstruction.faceAfter, direction: instructions.at(-1).direction, terminalInstructionIdentity: instructions.at(-1).instructionIdentity }), unresolvedAmbiguities: [], unsupportedActions: [], chainFingerprint });
  }

  function buildCompletedPlan(state, metadata) {
    const review = deriveReview(state.source, state.choices, state.identity); if (!review.selectedCandidate || !review.executionInstructions?.length) fail("CURRENT_REVIEW_REQUIRED", "Select and review one complete V2 instruction chain first.");
    const candidate = review.selectedCandidate; const instructions = review.executionInstructions; const last = instructions.at(-1);
    const finalExecutionState = { topology: clone(last.topologyAfter), stitchLedger: clone(last.stitchLedgerAfter), yarnState: clone(last.yarnStateAfter), face: last.turnInstruction.faceAfter, direction: clone(last.direction), terminalInstructionIdentity: last.instructionIdentity };
    const closure = buildClosureProof(state, instructions, finalExecutionState);
    if (Object.entries(closure).some(([key, value]) => ["complete", "contiguousOrdinals", "uniqueInstructionIdentities", "previousNextLinksClosed", "topologyChainClosed", "yarnChainClosed", "faceDirectionTurnChainClosed", "stitchConservationProven", "underarmsUnchanged", "terminalStateMatches"].includes(key) && value !== true)) fail("EXECUTION_CHAIN_INVALID", "The V2 execution chain is not closed.");
    const base = {
      schemaId: RESULT_SCHEMA_ID, resultVersion: RESULT_VERSION, contractVersion: CONTRACT_VERSION, kind: KIND,
      identity: `${state.identity}:plan:${metadata.operationId}`, planningIdentity: state.identity, epoch: state.epoch, predecessorIdentity: state.predecessorIdentity, supersedesPlanIdentity: state.supersedesPlanIdentity,
      sourceFingerprint: state.source.fingerprint, sourceBindings: clone(state.source.bindings), stage90ResultIdentity: state.source.stage90.resultIdentity, stage90ResultFingerprint: state.source.stage90.resultFingerprint, outputBoundary: OUTPUT_BOUNDARY,
      featureDecision: { necklineMode: state.choices.necklineMode, openingFeature: state.choices.openingFeature, productFeatureProvenance: state.source.featureAuthority.provenance }, referenceGeometry: clone(state.source.references),
      targetGeometry: { requested: { depthCm: state.choices.targetDepthCm, widthCm: state.choices.targetWidthCm }, discreteAchieved: { depthRows: candidate.depthRows, depthCm: candidate.achievedDepthCm, centerStitches: candidate.centerStitches, widthCm: candidate.achievedWidthCm }, centerAxis: candidate.centerStitches % 2 ? "center_stitch" : "between_center_pair", parity: "exact", symmetry: "symmetric" },
      openingStrategy: { method: state.choices.openingMethod, transitionKind: "live_center_front_split", centerDisposition: state.choices.necklineMode === "v_neck" ? "held" : "bound_off", fabricCutRequired: false, openingEdgeIdentities: ["right_front_edge", "left_front_edge"], overlapIntent: state.choices.overlapIntent },
      executionCapability: { capabilityId: EXECUTION_CAPABILITY_ID, instructionSchemaId: INSTRUCTION_SCHEMA_ID, fabricCut: "unsupported_requires_dedicated_contract", yarnBreak: "supported_only_when_explicitly_planned", multipleYarnSources: "supported_only_when_explicitly_planned" },
      executionEntryPrecondition: buildEntryPrecondition(state, instructions), executionInstructions: clone(instructions), finalExecutionState, executionClosureProof: closure,
      futurePlacketBoundary: { edgeIdentities: state.choices.openingFeature ? ["right_front_edge", "left_front_edge"] : [], finishingNotApplied: true, successorAfterPhysicalExecution: SUCCESSOR_AFTER_EXECUTION },
      futureCollarPickupBoundary: { orderedEdgeAndHeldGroups: ["right_front_neck_edge", "center_neck_boundary", "left_front_neck_edge"], finalPickupCountDeferred: true },
      conservationProof: { stage90FinalActive: state.source.terminal.activeTotal, finalWorkingActive: last.stitchLedgerAfter.workingActive, finalNecklineHeld: last.stitchLedgerAfter.necklineHeld, totalBoundOff: last.stitchLedgerAfter.boundOff, totalDecreased: last.stitchLedgerAfter.decreased, underarmHeldBefore: state.source.terminal.heldUnderarmTotal, underarmHeldAfter: last.stitchLedgerAfter.underarmHeld, exactNoTolerance: true, finalEquationHolds: state.source.terminal.activeTotal === last.stitchLedgerAfter.workingActive + last.stitchLedgerAfter.necklineHeld + last.stitchLedgerAfter.boundOff + last.stitchLedgerAfter.decreased },
      symmetryProof: { rightFrontEqualsLeftFront: last.stitchLedgerAfter.sectionCounts.right_front === last.stitchLedgerAfter.sectionCounts.left_front, cumulativeSideRemovalEqual: true }, parityProof: { centerCompatibleWithFront: (state.source.terminal.sectionCounts.front - candidate.centerStitches) % 2 === 0 }, feasibilityProof: { geometryFeasible: true, transitionLegal: true, scheduleComplete: true, noUnresolvedAmbiguity: true, fabricCutUnsupportedAndAbsent: true },
      openingOrNecklineWorkApplied: false, placketOrCollarFinishingApplied: false, fabricCutApplied: false, heldUnderarmsClosed: false, explicitFinalConfirmation: true, completionOperationId: metadata.operationId, timestamps: { createdAt: state.timestamps.createdAt, completedAt: metadata.at }, fingerprint: "",
    };
    if (!base.conservationProof.finalEquationHolds || containsCut(base.executionInstructions)) fail("EXECUTION_CHAIN_INVALID", "The completed V2 contract contains invalid conservation or a forbidden cut.");
    return withFingerprint(base);
  }

  function validateTopology(input) {
    const value = clone(input); if (!record(value) || value.schemaId !== TOPOLOGY_SCHEMA_ID || value.version !== 1 || !["cyclic", "linear"].includes(value.liveTopology) || !["circular", "flat"].includes(value.traversalMode)) fail("TOPOLOGY_INVALID", "A topology snapshot is invalid.");
    if (!Array.isArray(value.segments) || value.segments.filter((item) => item.state === "active").length !== 1 || !Array.isArray(value.boundaries) || !Array.isArray(value.heldGroups)) fail("TOPOLOGY_INVALID", "Topology must contain exactly one active segment and explicit boundaries.");
    if (value.liveTopology === "cyclic" && (value.traversalMode !== "circular" || !value.activeBorIdentity || value.openingEdgeIdentities.length) || value.liveTopology === "linear" && (value.traversalMode !== "flat" || value.activeBorIdentity !== null || value.openingEdgeIdentities.length !== 2 || value.segments[0].startBoundaryIdentity === value.segments[0].endBoundaryIdentity)) fail("TOPOLOGY_INVALID", "Topology mode and boundary semantics conflict.");
    const ranges = value.segments.flatMap((item) => item.orderedSectionRanges); if (new Set(ranges.map((item) => item.rangeIdentity)).size !== ranges.length || ranges.some((item) => !Number.isSafeInteger(item.exactCount) || item.exactCount < 0)) fail("TOPOLOGY_INVALID", "Topology ranges overlap or have invalid counts.");
    requireFingerprint(value.fingerprint, "TOPOLOGY_FINGERPRINT_INVALID"); const comparable = clone(value); delete comparable.fingerprint; if (fingerprint(comparable) !== value.fingerprint) fail("TOPOLOGY_FINGERPRINT_INVALID", "The topology fingerprint is invalid."); return deepFreeze(value);
  }
  function validateYarnState(input) {
    const value = clone(input); if (!record(value) || value.schemaId !== YARN_STATE_SCHEMA_ID || value.version !== 1 || !Array.isArray(value.sources) || !record(value.rejoinRequirement) || !record(value.workingLocation)) fail("YARN_STATE_INVALID", "A yarn state is invalid.");
    const active = value.sources.filter((item) => item.active); if (value.activeSourceIdentity === null ? active.length !== 0 : active.length !== 1 || active[0]?.yarnSourceIdentity !== value.activeSourceIdentity || value.sources.some((item) => !["attached", "detached", "exhausted"].includes(item.state))) fail("YARN_STATE_INVALID", "Yarn attachment and active-source semantics conflict.");
    requireFingerprint(value.fingerprint, "YARN_FINGERPRINT_INVALID"); const comparable = clone(value); delete comparable.fingerprint; if (fingerprint(comparable) !== value.fingerprint) fail("YARN_FINGERPRINT_INVALID", "The yarn-state fingerprint is invalid."); return deepFreeze(value);
  }
  function validateInstruction(input) {
    const item = clone(input); if (!record(item) || item.schemaId !== INSTRUCTION_SCHEMA_ID || !Number.isSafeInteger(item.executionOrdinal) || item.executionOrdinal < 1 || !["RS", "WS"].includes(item.faceBefore) || item.faceWorked !== item.faceBefore || !["circular_to_flat_transition", "flat"].includes(item.workMode)) fail("INSTRUCTION_INVALID", "An execution instruction is incomplete.");
    if (containsCut({ actions: item.orderedActions, yarn: item.yarnActions, irreversible: item.irreversibleAction })) fail("UNSUPPORTED_FABRIC_CUT", "A Stage 91 V2 instruction cannot contain fabric or steek cutting.");
    validateTopology(item.topologyBefore); validateTopology(item.topologyAfter); validateYarnState(item.yarnStateBefore); validateYarnState(item.yarnStateAfter);
    if (item.topologyBefore.identity === item.topologyAfter.identity || item.topologyBefore.fingerprint === item.topologyAfter.fingerprint) fail("DUPLICATE_TOPOLOGY_SNAPSHOT", "An instruction must declare distinct before and after topology snapshots.");
    if (!record(item.direction) || item.direction.fromBoundaryIdentity === item.direction.toBoundaryIdentity || !Array.isArray(item.direction.traversalRanges) || !item.direction.traversalRanges.length || !record(item.turnInstruction) || !["turn", "no_turn", "stop"].includes(item.turnInstruction.kind)) fail("DIRECTION_OR_TURN_INVALID", "Direction and turn semantics must be explicit.");
    if (item.turnInstruction.kind === "turn" && item.turnInstruction.faceAfter !== opposite(item.faceWorked) || item.turnInstruction.kind === "stop" && item.terminalState !== "terminal" || item.turnInstruction.kind !== "stop" && item.terminalState !== "non_terminal") fail("DIRECTION_OR_TURN_INVALID", "Turn, face, and terminal semantics conflict.");
    if (!Array.isArray(item.orderedActions) || item.orderedActions.some((action, index) => action.actionIndex !== index + 1 || !Number.isSafeInteger(action.exactCount) || action.exactCount < 0) || !Array.isArray(item.yarnActions) || item.yarnActions.some((action, index) => action.actionIndex !== index + 1)) fail("ACTION_SEQUENCE_INVALID", "Instruction actions must be complete, ordered, and exactly counted.");
    const beforeSectionTotal = sumObject(item.stitchLedgerBefore.sectionCounts); const afterSectionTotal = sumObject(item.stitchLedgerAfter.sectionCounts); if (beforeSectionTotal !== item.stitchLedgerBefore.workingActive || afterSectionTotal !== item.stitchLedgerAfter.workingActive || item.stitchLedgerBefore.totalLive !== item.stitchLedgerBefore.workingActive + item.stitchLedgerBefore.necklineHeld + item.stitchLedgerBefore.underarmHeld || item.stitchLedgerAfter.totalLive !== item.stitchLedgerAfter.workingActive + item.stitchLedgerAfter.necklineHeld + item.stitchLedgerAfter.underarmHeld) fail("STITCH_LEDGER_INVALID", "Instruction section and total-live ledgers conflict.");
    const boundDelta = item.stitchLedgerAfter.boundOff - item.stitchLedgerBefore.boundOff; const heldDelta = item.stitchLedgerAfter.necklineHeld - item.stitchLedgerBefore.necklineHeld; const decreaseDelta = item.stitchLedgerAfter.decreased - item.stitchLedgerBefore.decreased; const actionCount = (kind) => item.orderedActions.filter((action) => action.actionKind === kind).reduce((total, action) => total + action.exactCount, 0); if (boundDelta !== actionCount("bind_off") || heldDelta !== actionCount("hold") || decreaseDelta !== actionCount("decrease")) fail("ACTION_LEDGER_MISMATCH", "Ordered actions do not equal the stitch-ledger deltas.");
    const beforeRanges = Object.fromEntries(item.topologyBefore.segments[0].orderedSectionRanges.map((entry) => [entry.rangeIdentity, entry.exactCount])); const afterRanges = Object.fromEntries(item.topologyAfter.segments[0].orderedSectionRanges.map((entry) => [entry.rangeIdentity, entry.exactCount])); if (item.workMode === "circular_to_flat_transition") { if (item.topologyBefore.liveTopology !== "cyclic" || item.topologyAfter.liveTopology !== "linear" || item.startingBoundary.boundaryIdentity !== "raglan_marker_4" || item.yarnStateBefore.workingLocation.boundaryIdentity !== "raglan_marker_4" || item.joinRejoinSemantics?.kind !== "break_primary_and_join_new_source" || canonicalize(item.yarnActions.map((action) => action.actionKind)) !== canonicalize(["break_active_source_at_anchor", "deactivate_source", "join_new_source_at_boundary", "activate_source"])) fail("CIRCULAR_TO_FLAT_TRANSITION_INVALID", "The transition action, topology, and yarn variant must be explicit and consistent."); if (beforeRanges.front !== afterRanges.right_front + afterRanges.left_front + boundDelta + heldDelta) fail("ACTION_LEDGER_MISMATCH", "The center-front disposition does not balance."); } else { if (item.topologyBefore.liveTopology !== "linear" || item.topologyAfter.liveTopology !== "linear") fail("CIRCULAR_TO_FLAT_TRANSITION_INVALID", "Only the explicit transition instruction may consume circular topology."); if (item.yarnStateBefore.workingLocation.boundaryIdentity !== item.direction.fromBoundaryIdentity || item.yarnStateAfter.workingLocation.boundaryIdentity !== item.direction.toBoundaryIdentity || item.yarnStateBefore.activeSourceIdentity !== item.yarnStateAfter.activeSourceIdentity || item.joinRejoinSemantics?.applicable !== false) fail("YARN_OR_TOPOLOGY_TRANSITION_INVALID", "A flat pass has inconsistent yarn or topology continuity."); }
    const expectedRanges = Object.entries(afterRanges); if (item.direction.traversalRanges.length !== expectedRanges.length || item.direction.traversalRanges.some((entry) => afterRanges[entry.rangeIdentity] !== entry.exactCount) || item.workedRanges.some((entry) => afterRanges[entry.rangeIdentity] !== entry.exactCount)) fail("TRAVERSAL_RANGE_INVALID", "Direction ranges must exactly cover the active topology.");
    if (!item.expectedConservationResult?.equationHolds || item.expectedConservationResult.tolerance !== 0 || item.stitchLedgerBefore.totalLive !== item.stitchLedgerAfter.totalLive + (item.stitchLedgerAfter.boundOff - item.stitchLedgerBefore.boundOff) + (item.stitchLedgerAfter.decreased - item.stitchLedgerBefore.decreased)) fail("STITCH_CONSERVATION_INVALID", "Instruction stitch conservation failed.");
    requireFingerprint(item.fingerprint, "INSTRUCTION_FINGERPRINT_INVALID"); const comparable = clone(item); delete comparable.fingerprint; if (fingerprint(comparable) !== item.fingerprint) fail("INSTRUCTION_FINGERPRINT_INVALID", "The instruction fingerprint is invalid."); return deepFreeze(item);
  }
  function validateInstructionChain(instructions, finalExecutionState = null) {
    if (!Array.isArray(instructions) || !instructions.length) fail("EMPTY_INSTRUCTION_SEQUENCE", "At least one execution instruction is required.");
    const checked = instructions.map(validateInstruction); if (checked[0].workMode !== "circular_to_flat_transition" || checked[0].topologyBefore.liveTopology !== "cyclic" || checked[0].topologyAfter.liveTopology !== "linear") fail("CIRCULAR_TO_FLAT_TRANSITION_INVALID", "The first instruction must explicitly open circular work into flat work.");
    if (new Set(checked.map((item) => item.instructionIdentity)).size !== checked.length) fail("DUPLICATE_INSTRUCTION_ID", "Execution instruction identities must be unique."); const ids = new Set();
    checked.forEach((item, index) => {
      if (item.executionOrdinal !== index + 1) fail("ORDINAL_CHAIN_INVALID", "Execution ordinals must be contiguous.");
      if (ids.has(item.instructionIdentity)) fail("DUPLICATE_INSTRUCTION_ID", "Execution instruction identities must be unique."); ids.add(item.instructionIdentity);
      const previous = checked[index - 1]; const next = checked[index + 1];
      if (item.previousInstructionIdentity !== (previous?.instructionIdentity || null) || item.nextInstructionIdentity !== (next?.instructionIdentity || null) || item.previousInstructionFingerprint !== (previous?.fingerprint || null)) fail("INSTRUCTION_LINK_INVALID", "Previous/next instruction links are broken.");
      if (previous && (canonicalize(previous.topologyAfter) !== canonicalize(item.topologyBefore) || canonicalize(previous.yarnStateAfter) !== canonicalize(item.yarnStateBefore))) fail("TOPOLOGY_CHAIN_INVALID", "Adjacent topology or yarn snapshots differ.");
      if (previous && (previous.nextExpectedInstruction.executionOrdinal !== item.executionOrdinal || previous.nextExpectedInstruction.faceWorked !== item.faceWorked || previous.nextExpectedInstruction.directionId !== item.direction.directionId || previous.nextExpectedInstruction.startBoundaryIdentity !== item.direction.fromBoundaryIdentity || previous.turnInstruction.faceAfter !== item.faceBefore)) fail("FACE_DIRECTION_CHAIN_INVALID", "Face, direction, or turn continuity is broken.");
    });
    const last = checked.at(-1); if (last.terminalState !== "terminal" || last.nextExpectedInstruction.executionOrdinal !== null || finalExecutionState && canonicalize(finalExecutionState) !== canonicalize({ topology: last.topologyAfter, stitchLedger: last.stitchLedgerAfter, yarnState: last.yarnStateAfter, face: last.turnInstruction.faceAfter, direction: last.direction, terminalInstructionIdentity: last.instructionIdentity })) fail("TERMINAL_TOPOLOGY_INVALID", "The final instruction does not match the declared terminal state.");
    return deepFreeze(checked);
  }

  function commandPayload(command, state, payload) { return { command, planningIdentity: state.identity, epoch: state.epoch, sourceFingerprint: state.source.fingerprint, payload: clone(payload) }; }
  function metadataRequired(metadata) { requireUuid(metadata.operationId); requireTimestamp(metadata.at); }
  function validateReceipt(item) { if (!record(item) || !UUID_V7.test(item.operationId || "") || !item.command || !FINGERPRINT.test(item.payloadFingerprint || "") || !Number.isSafeInteger(item.resultingRevision) || item.resultingRevision < 1 || !TIMESTAMP.test(item.at || "")) fail("RECEIPT_INVALID", "A durable operation receipt is invalid."); }
  function appendReceipt(state, command, payload, metadata) { state.operationReceipts.push({ operationId: metadata.operationId, command, payloadFingerprint: fingerprint(commandPayload(command, state, payload)), resultingRevision: state.revision, at: metadata.at }); }
  function priorReceipt(state, operationId, command, payload) { const expected = fingerprint(commandPayload(command, state, payload)); const prior = state.operationReceipts.find((item) => item.operationId === operationId); if (!prior) return null; if (prior.command !== command || prior.payloadFingerprint !== expected) fail("OPERATION_ID_CONFLICT", "This operation id was already used with different semantics."); return state; }
  function assertFence(state, metadata, review = false) { if (metadata.expectedRevision !== undefined && metadata.expectedRevision !== state.revision || metadata.expectedFingerprint !== undefined && metadata.expectedFingerprint !== state.fingerprint) fail("REVISION_CONFLICT", "Stage 91 changed. Reload the page."); if (metadata.expectedSourceFingerprint !== undefined && metadata.expectedSourceFingerprint !== state.source.fingerprint) fail("SOURCE_STALE", "The authoritative Stage 77-90 source changed."); if (review && metadata.expectedReviewFingerprint !== undefined && metadata.expectedReviewFingerprint !== state.review?.reviewFingerprint) fail("REVIEW_STALE", "The reviewed plan changed."); }
  function finalize(next, command, payload, metadata) { next.revision += 1; next.timestamps.updatedAt = metadata.at; appendReceipt(next, command, payload, metadata); return withFingerprint(next); }
  function emptyChoices(source) { const value = legacy.readyView(source).choices; return clone(value); }
  function createState(input, metadata) {
    const source = validateSource(input.source); requireUuid(input.projectId, "PROJECT_ID_INVALID"); requireUuid(input.calculationId, "CALCULATION_ID_INVALID"); positiveInteger(input.epoch, "EPOCH_INVALID"); if (input.projectId !== source.projectId || input.calculationId !== source.calculationId) fail("SOURCE_BINDING_INVALID", "The source belongs to another project or calculation."); if (input.epoch === 1 ? input.predecessorIdentity !== null : !input.predecessorIdentity) fail("HISTORY_CONFLICT", "Stage 91 epoch lineage is invalid.");
    const identity = `${input.projectId}:${input.calculationId}:neckline-opening-plan-v2:${input.epoch}:${source.fingerprint}`;
    return { kind: KIND, contractSchemaId: CONTRACT_SCHEMA_ID, contractVersion: CONTRACT_VERSION, projectId: input.projectId, calculationId: input.calculationId, identity, epoch: input.epoch, predecessorIdentity: input.predecessorIdentity, supersedesPlanIdentity: input.supersedesPlanIdentity || null, lifecycle: "collecting_opening_choices", revision: 1, source: clone(source), choices: emptyChoices(source), review: null, completedPlan: null, operationReceipts: [], timestamps: { createdAt: metadata.at, updatedAt: metadata.at, completedAt: null }, fingerprint: "" };
  }
  function startPlanning(input = {}, metadata = {}) { metadataRequired(metadata); const state = createState(input, metadata); appendReceipt(state, "start_neckline_opening_planning_v2", {}, metadata); return withFingerprint(state); }
  function resolveChoice(stateInput, input = {}, metadata = {}) {
    const state = validateV2State(stateInput); metadataRequired(metadata); exactKeys(input, ["choiceId", "value"], "CHOICE_INVALID"); const payload = clone(input); const replay = priorReceipt(state, metadata.operationId, "resolve_required_choice", payload); if (replay) return replay; assertFence(state, metadata); if (state.lifecycle === "completed") fail("COMPLETED_PLAN_IMMUTABLE", "Completed Stage 91 V2 is immutable.");
    const setters = { neckline_shape: (draft, value) => { draft.necklineMode = value; }, opening_feature: (draft, value) => { draft.openingFeature = value; draft.openingMethod = value === false ? "none" : draft.openingMethod === "none" ? null : draft.openingMethod; }, neckline_depth: (draft, value) => { draft.targetDepthCm = String(value); }, neckline_width: (draft, value) => { draft.targetWidthCm = String(value); }, opening_method: (draft, value) => { draft.openingMethod = value; }, opening_length: (draft, value) => { draft.openingLengthCm = String(value); }, integrated_edge_stitches: (draft, value) => { draft.integratedEdgeStitches = value; }, overlap_intent: (draft, value) => { draft.overlapIntent = value; } };
    if (!setters[input.choiceId]) fail("CHOICE_INVALID", "This Stage 91 choice is not supported."); const next = clone(state); setters[input.choiceId](next.choices, input.value); next.choices.selectedCandidateKey = null; validateChoices(next.source, next.choices); next.review = null; next.lifecycle = "collecting_opening_choices"; return finalize(next, "resolve_required_choice", payload, metadata);
  }
  function reviewPlan(stateInput, input = {}, metadata = {}) { exactKeys(input, []); const state = validateV2State(stateInput); metadataRequired(metadata); const replay = priorReceipt(state, metadata.operationId, "review_neckline_opening_plan_v2", {}); if (replay) return replay; assertFence(state, metadata); if (state.lifecycle === "completed") fail("COMPLETED_PLAN_IMMUTABLE", "Completed Stage 91 V2 is immutable."); const next = clone(state); next.review = clone(deriveReview(state.source, state.choices, state.identity)); next.lifecycle = "reviewing_neckline_opening_plan"; return finalize(next, "review_neckline_opening_plan_v2", {}, metadata); }
  function selectCandidate(stateInput, input = {}, metadata = {}) { exactKeys(input, ["candidateKey", "explicitConfirmation"]); const state = validateV2State(stateInput); metadataRequired(metadata); const payload = { candidateKey: input.candidateKey, explicitConfirmation: input.explicitConfirmation === true }; const replay = priorReceipt(state, metadata.operationId, "select_discrete_geometry", payload); if (replay) return replay; assertFence(state, metadata); if (!payload.explicitConfirmation) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Confirm the exact discrete geometry."); const next = clone(state); next.choices.selectedCandidateKey = payload.candidateKey; next.review = clone(deriveReview(next.source, next.choices, next.identity)); if (!next.review.executionInstructions?.length) fail("CANDIDATE_INVALID", "The selected geometry cannot produce instructions."); next.lifecycle = "reviewing_neckline_opening_plan"; return finalize(next, "select_discrete_geometry", payload, metadata); }
  function completePlan(stateInput, input = {}, metadata = {}) { exactKeys(input, ["explicitFinalConfirmation", "reviewFingerprint"]); const state = validateV2State(stateInput); metadataRequired(metadata); const payload = { explicitFinalConfirmation: input.explicitFinalConfirmation === true, reviewFingerprint: input.reviewFingerprint }; const replay = priorReceipt(state, metadata.operationId, "complete_neckline_opening_plan_v2", payload); if (replay) return replay; assertFence(state, metadata, true); if (state.lifecycle === "completed") fail("COMPLETED_PLAN_IMMUTABLE", "Completed Stage 91 V2 is immutable."); if (state.lifecycle !== "reviewing_neckline_opening_plan" || !state.review?.executionInstructions?.length) fail("CURRENT_REVIEW_REQUIRED", "Review one exact V2 instruction chain first."); if (!payload.explicitFinalConfirmation) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Confirm the exact V2 plan explicitly."); if (payload.reviewFingerprint !== state.review.reviewFingerprint) fail("REVIEW_STALE", "The reviewed V2 plan changed."); const next = clone(state); next.completedPlan = buildCompletedPlan(state, metadata); next.lifecycle = "completed"; next.timestamps.completedAt = metadata.at; return finalize(next, "complete_neckline_opening_plan_v2", payload, metadata); }
  function startReworkEpoch(stateInput, input = {}, metadata = {}) { const state = validateState(stateInput); metadataRequired(metadata); exactKeys(input, ["source", "reason", "downstreamExecutionStarted"]); const reason = String(input.reason || "").trim(); const payload = { sourceFingerprint: input.source?.fingerprint, reason }; if (state.contractSchemaId === CONTRACT_SCHEMA_ID) { const replay = priorReceipt(state, metadata.operationId, "start_plan_rework_epoch_v2", payload); if (replay) return replay; } if (!reason) fail("REWORK_REASON_REQUIRED", "Give an explicit reason for plan rework."); if (input.downstreamExecutionStarted === true) fail("PHYSICAL_RESTORATION_REQUIRED", "A durable Stage 92 start requires physical reconciliation before replanning."); if (state.lifecycle !== "completed") fail("COMPLETED_PLAN_REQUIRED", "Only a completed plan can start rework."); const next = createState({ projectId: state.projectId, calculationId: state.calculationId, source: input.source, epoch: state.epoch + 1, predecessorIdentity: state.identity, supersedesPlanIdentity: state.completedPlan.identity }, metadata); appendReceipt(next, "start_plan_rework_epoch_v2", payload, metadata); return withFingerprint(next); }

  function validateCompleted(plan, state) {
    if (!record(plan) || plan.schemaId !== RESULT_SCHEMA_ID || plan.resultVersion !== RESULT_VERSION || plan.contractVersion !== CONTRACT_VERSION || plan.kind !== KIND || plan.planningIdentity !== state.identity || plan.sourceFingerprint !== state.source.fingerprint || plan.outputBoundary !== OUTPUT_BOUNDARY || plan.executionCapability?.capabilityId !== EXECUTION_CAPABILITY_ID || plan.executionCapability?.instructionSchemaId !== INSTRUCTION_SCHEMA_ID || plan.executionCapability?.fabricCut !== "unsupported_requires_dedicated_contract" || plan.fabricCutApplied !== false || plan.explicitFinalConfirmation !== true || containsCut(plan.executionInstructions)) fail("COMPLETED_PLAN_INVALID", "The immutable Stage 91 V2 result is invalid.");
    validateInstructionChain(plan.executionInstructions, plan.finalExecutionState); requireUuid(plan.completionOperationId); requireFingerprint(plan.fingerprint); const expected = buildCompletedPlan({ ...state, completedPlan: null }, { operationId: plan.completionOperationId, at: plan.timestamps.completedAt }); if (canonicalize(plan) !== canonicalize(expected)) fail("COMPLETED_PLAN_INVALID", "The immutable Stage 91 V2 result is not recomputable."); return deepFreeze(plan);
  }
  function validateV2State(input) {
    const state = clone(input); exactKeys(state, ["kind", "contractSchemaId", "contractVersion", "projectId", "calculationId", "identity", "epoch", "predecessorIdentity", "supersedesPlanIdentity", "lifecycle", "revision", "source", "choices", "review", "completedPlan", "operationReceipts", "timestamps", "fingerprint"]); if (state.kind !== KIND || state.contractSchemaId !== CONTRACT_SCHEMA_ID || state.contractVersion !== CONTRACT_VERSION || !LIFECYCLES.includes(state.lifecycle)) fail("STATE_INVALID", "The Stage 91 V2 identity, contract, or lifecycle is invalid."); requireUuid(state.projectId, "PROJECT_ID_INVALID"); requireUuid(state.calculationId, "CALCULATION_ID_INVALID"); positiveInteger(state.epoch, "EPOCH_INVALID"); positiveInteger(state.revision, "REVISION_INVALID"); const source = validateSource(state.source); if (source.projectId !== state.projectId || source.calculationId !== state.calculationId) fail("STATE_INVALID", "State scope differs from source scope."); validateChoices(source, state.choices); if (state.review !== null) { const expected = deriveReview(source, state.choices, state.identity); if (canonicalize(state.review) !== canonicalize(expected)) fail("REVIEW_INVALID", "The Stage 91 V2 review is stale or corrupted."); } if (!Array.isArray(state.operationReceipts) || !state.operationReceipts.length) fail("RECEIPT_INVALID", "Stage 91 V2 requires durable operation receipts."); state.operationReceipts.forEach(validateReceipt); exactKeys(state.timestamps, ["createdAt", "updatedAt", "completedAt"]); requireTimestamp(state.timestamps.createdAt); requireTimestamp(state.timestamps.updatedAt); if (state.timestamps.completedAt !== null) requireTimestamp(state.timestamps.completedAt); if (state.lifecycle === "collecting_opening_choices" && (state.review !== null || state.completedPlan !== null || state.timestamps.completedAt !== null) || state.lifecycle === "reviewing_neckline_opening_plan" && (!state.review || state.completedPlan !== null || state.timestamps.completedAt !== null) || state.lifecycle === "completed" && (!state.review || !state.completedPlan || !state.timestamps.completedAt)) fail("STATE_INVALID", "Stage 91 V2 lifecycle data is inconsistent."); if (state.completedPlan) validateCompleted(state.completedPlan, state); requireFingerprint(state.fingerprint); const comparable = clone(state); delete comparable.fingerprint; if (state.fingerprint !== fingerprint(comparable)) fail("STATE_FINGERPRINT_INVALID", "The Stage 91 V2 state fingerprint is invalid."); return deepFreeze(state);
  }
  function validateState(input) {
    if (input?.contractSchemaId === legacy.CONTRACT_SCHEMA_ID && input?.contractVersion === legacy.CONTRACT_VERSION) {
      try { return legacy.validateState(input); } catch (error) { fail(error.code || "V1_STATE_INVALID", error.userMessage || error.message); }
    }
    return validateV2State(input);
  }
  function stage92Eligibility(input, options = {}) {
    let state; try { state = validateState(input); } catch (error) { return deepFreeze({ eligible: false, code: error.code || "STAGE91_V2_INVALID", message: error.userMessage || error.message, successor: null }); }
    if (state.contractSchemaId !== CONTRACT_SCHEMA_ID || state.contractVersion !== 2) return deepFreeze({ eligible: false, code: "STAGE91_EXECUTION_CONTRACT_V2_REQUIRED", message: "Stage 92 requires a newly reviewed Stage 91 V2 execution contract.", successor: null });
    if (state.lifecycle !== "completed") return deepFreeze({ eligible: false, code: "STAGE91_V2_COMPLETION_REQUIRED", message: "Complete and validate Stage 91 V2 before physical execution.", successor: null });
    if (state.completedPlan?.schemaId !== RESULT_SCHEMA_ID || state.completedPlan?.resultVersion !== 2) return deepFreeze({ eligible: false, code: "STAGE91_V2_INVALID", message: "The completed Stage 91 V2 result is invalid.", successor: null });
    if (options.authoritativeSourceFingerprint !== undefined && options.authoritativeSourceFingerprint !== state.source.fingerprint || options.currentEpoch !== undefined && options.currentEpoch !== state.epoch || options.stale === true) return deepFreeze({ eligible: false, code: "STAGE91_V2_STALE", message: "The completed Stage 91 V2 contract is stale.", successor: null });
    return deepFreeze({ eligible: true, code: "STAGE91_V2_EXECUTABLE", planIdentity: state.completedPlan.identity, planFingerprint: state.completedPlan.fingerprint, instructionCount: state.completedPlan.executionInstructions.length, executionCapabilityId: EXECUTION_CAPABILITY_ID, directExecutor: NEXT_BOUNDARY, successorAfterExecution: SUCCESSOR_AFTER_EXECUTION });
  }

  function safeContext(source) { return { terminalSectionCounts: clone(source.terminal.sectionCounts), activeTotal: source.terminal.activeTotal, heldUnderarmTotal: source.terminal.heldUnderarmTotal, totalPhysicalLive: source.terminal.totalPhysicalLive, lineWidth: source.terminal.lineWidth, necklineDepthReferenceCm: source.references.necklineDepthReferenceCm, bodyNeckReferenceCm: source.references.bodyNeckReferenceCm, stitchesPerCm: source.references.stitchesPerCmExact, rowsPerCm: source.references.rowsPerCmExact, openingFeatureAuthoritative: source.featureAuthority.explicitOpeningFeature, eligibleMethods: ["split_from_current_live_edge", "integrated_live_placket"], fabricCutSupport: "unsupported_requires_dedicated_contract", contractVersion: 2 }; }
  function safeReview(review) { if (!review) return null; return { requiresCandidateSelection: review.requiresCandidateSelection, candidates: review.candidates.map((item) => ({ candidateKey: item.key, centerStitches: item.centerStitches, depthRows: item.depthRows, openingLengthRows: item.openingLengthRows, achievedWidthCm: item.achievedWidthCm, achievedDepthCm: item.achievedDepthCm, openingAchievedCm: item.openingAchievedCm, finalLeftFront: item.sideFinal, finalRightFront: item.sideFinal, selected: review.selectedCandidate?.key === item.key })), selected: review.selectedCandidate ? { centerStitches: review.selectedCandidate.centerStitches, depthRows: review.selectedCandidate.depthRows, openingLengthRows: review.selectedCandidate.openingLengthRows, executionInstructions: review.executionInstructions.map((item) => ({ ordinal: item.executionOrdinal, face: item.faceWorked, mode: item.workMode, direction: { from: item.direction.fromBoundaryIdentity, to: item.direction.toBoundaryIdentity }, turn: item.turnInstruction.kind, yarnActions: item.yarnActions.map((action) => action.actionKind), actions: item.orderedActions.map((action) => ({ kind: action.actionKind, count: action.exactCount, side: action.side })), topologyChange: `${item.topologyBefore.liveTopology} → ${item.topologyAfter.liveTopology}`, activeBefore: item.stitchLedgerBefore.workingActive, activeAfter: item.stitchLedgerAfter.workingActive, heldAfter: item.stitchLedgerAfter.necklineHeld })), scheduleRows: review.executionInstructions.map((item) => ({ row: item.fabricRowOrRoundOrdinal, orientation: item.faceWorked, topology: item.topologyAfter.liveTopology, start: item.direction.fromBoundaryIdentity, end: item.direction.toBoundaryIdentity, bindOff: item.orderedActions.filter((action) => action.actionKind === "bind_off").reduce((sum, action) => sum + action.exactCount, 0), held: item.orderedActions.filter((action) => action.actionKind === "hold").reduce((sum, action) => sum + action.exactCount, 0), decreases: item.orderedActions.filter((action) => action.actionKind === "decrease").reduce((sum, action) => sum + action.exactCount, 0), leftFront: item.stitchLedgerAfter.sectionCounts.left_front, rightFront: item.stitchLedgerAfter.sectionCounts.right_front, active: item.stitchLedgerAfter.workingActive, totalLive: item.stitchLedgerAfter.totalLive })) } : null };
  }
  function readyView(sourceInput, history = {}) { const source = validateSource(sourceInput); const choices = emptyChoices(source); return deepFreeze({ available: true, blocked: false, lifecycle: "ready", contractVersion: 2, context: safeContext(source), choices, missingChoices: choicesRequired(source, choices), review: null, completed: null, allowedActions: ["startPlanning"], history: { count: history.historicalCount || 0, staleCount: history.staleCount || 0 }, successor: { available: false, nextBoundary: NEXT_BOUNDARY, routePath: null } }); }
  function projectView(stateInput, history = {}) {
    const state = validateState(stateInput);
    if (state.contractSchemaId === legacy.CONTRACT_SCHEMA_ID) { const old = legacy.projectView(state, history); return deepFreeze({ ...clone(old), lifecycle: "v1_execution_ineligible", contractVersion: 1, executionEligibility: stage92Eligibility(state), allowedActions: ["startV2Replan"], successor: { available: false, nextBoundary: NEXT_BOUNDARY, routePath: null }, diagnostic: { code: "STAGE91_EXECUTION_CONTRACT_V2_REQUIRED", message: "Исторический план V1 доступен только для чтения. Для физического выполнения создайте и подтвердите V2." } }); }
    const eligibility = stage92Eligibility(state);
    return deepFreeze({ available: true, blocked: false, lifecycle: state.lifecycle, contractVersion: 2, context: safeContext(state.source), choices: clone(state.choices), missingChoices: choicesRequired(state.source, state.choices), review: safeReview(state.review), completed: state.completedPlan ? { schemaId: state.completedPlan.schemaId, targetGeometry: clone(state.completedPlan.targetGeometry), openingStrategy: clone(state.completedPlan.openingStrategy), executionInstructions: safeReview(state.review).selected.executionInstructions, finalTopology: clone(state.completedPlan.finalExecutionState.topology), finalExecutionState: clone(state.completedPlan.finalExecutionState), futurePlacketBoundary: clone(state.completedPlan.futurePlacketBoundary), futureCollarPickupBoundary: clone(state.completedPlan.futureCollarPickupBoundary), conservationProof: clone(state.completedPlan.conservationProof), executionClosureProof: clone(state.completedPlan.executionClosureProof), outputBoundary: state.completedPlan.outputBoundary } : null, executionEligibility: eligibility, allowedActions: state.lifecycle === "completed" ? ["startPlanRework"] : state.review?.selectedCandidate ? ["completePlan", "resolveChoice"] : state.review?.requiresCandidateSelection ? ["selectCandidate", "resolveChoice"] : choicesRequired(state.source, state.choices).length ? ["resolveChoice"] : ["reviewPlan", "resolveChoice"], history: { count: history.historicalCount || 1, staleCount: history.staleCount || 0 }, successor: { available: false, contractEligible: eligibility.eligible, presentationAvailable: false, nextBoundary: NEXT_BOUNDARY, routePath: null, afterExecution: SUCCESSOR_AFTER_EXECUTION } });
  }

  const api = Object.freeze({ DOMAIN_IDENTITY, KIND, PROGRESS_KIND, CONTRACT_SCHEMA_ID, CONTRACT_VERSION, RESULT_SCHEMA_ID, RESULT_VERSION, INSTRUCTION_SCHEMA_ID, TOPOLOGY_SCHEMA_ID, YARN_STATE_SCHEMA_ID, EXECUTION_CAPABILITY_ID, OUTPUT_BOUNDARY, NEXT_BOUNDARY, SUCCESSOR_AFTER_EXECUTION, ROUTE_PATH, SECTION_ORDER, INTERFACE_ORDER, SOURCE_KINDS, LIFECYCLES, V1: legacy, NecklineOpeningPlanningError, canonicalize, fingerprint, validateSource, validateChoices, choicesRequired, deriveReview, buildExecutionInstructions, buildCompletedPlan, validateTopology, validateYarnState, validateInstruction, validateInstructionChain, startPlanning, resolveChoice, reviewPlan, selectCandidate, completePlan, startReworkEpoch, validateV2State, validateState, validateAnyState: validateState, validateCompleted, stage92Eligibility, readyView, projectView });
  globalObject.YarnAIProjectNecklineOpeningPlanningV2 = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
