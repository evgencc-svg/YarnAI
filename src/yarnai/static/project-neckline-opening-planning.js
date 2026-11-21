"use strict";

(function initializeProjectNecklineOpeningPlanningV3(globalObject) {
  const v2 = globalObject.YarnAIProjectNecklineOpeningPlanningV2 || (typeof require === "function" ? require("./project-neckline-opening-planning-v2.js") : null);
  if (!v2) throw new Error("The Stage 91 V2 reader must be loaded before Stage 91 V3.");

  const V1 = v2.V1;
  const V2 = v2;
  const DOMAIN_IDENTITY = "PROJECT_NECKLINE_OPENING_PLANNING";
  const KIND = DOMAIN_IDENTITY;
  const PROGRESS_KIND = KIND;
  const CONTRACT_SCHEMA_ID = "NECKLINE_OPENING_PLANNING_CONTRACT_V3";
  const CONTRACT_VERSION = 3;
  const RESULT_SCHEMA_ID = "NECKLINE_OPENING_PLAN_V3";
  const RESULT_VERSION = 3;
  const INSTRUCTION_SCHEMA_ID = "NECKLINE_OPENING_EXECUTION_INSTRUCTION_V2";
  const EXECUTION_STEP_SCHEMA_ID = "NECKLINE_OPENING_EXECUTION_STEP_V1";
  const EXECUTION_STATE_SCHEMA_ID = "NECKLINE_OPENING_EXECUTION_STATE_V1";
  const TOPOLOGY_SCHEMA_ID = "FABRIC_TOPOLOGY_STATE_V2";
  const YARN_STATE_SCHEMA_ID = "YARN_STATE_V2";
  const EXECUTION_CAPABILITY_ID = "globally_ordered_structural_execution_v1";
  const OUTPUT_BOUNDARY = v2.OUTPUT_BOUNDARY;
  const NEXT_BOUNDARY = v2.NEXT_BOUNDARY;
  const SUCCESSOR_AFTER_EXECUTION = v2.SUCCESSOR_AFTER_EXECUTION;
  const ROUTE_PATH = v2.ROUTE_PATH;
  const SECTION_ORDER = v2.SECTION_ORDER;
  const INTERFACE_ORDER = v2.INTERFACE_ORDER;
  const SOURCE_KINDS = v2.SOURCE_KINDS;
  const LIFECYCLES = v2.LIFECYCLES;
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const STEP_KINDS = Object.freeze(["traverse", "decrease", "bind_off", "hold", "release", "turn", "no_turn", "stop", "yarn_break", "yarn_deactivate", "yarn_join", "yarn_activate"]);

  class NecklineOpeningPlanningError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "NecklineOpeningPlanningError";
      this.code = code;
      this.userMessage = message;
      this.details = Object.freeze(clone(details));
    }
  }

  function fail(code, message, details) { throw new NecklineOpeningPlanningError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  const canonicalize = v2.canonicalize;
  const fingerprint = v2.fingerprint;
  function withFingerprint(value) { const next = clone(value); delete next.fingerprint; next.fingerprint = fingerprint(next); return next; }
  function exactKeys(value, keys, code = "STATE_INVALID") { if (!record(value) || Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(code, "Stage 91 V3 contains missing or forbidden fields."); }
  function requireUuid(value, code = "OPERATION_ID_INVALID") { if (!UUID_V7.test(value || "")) fail(code, "A UUIDv7 is required."); return value; }
  function requireTimestamp(value) { if (!TIMESTAMP.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "An ISO UTC timestamp with milliseconds is required."); return value; }
  function requireFingerprint(value, code = "FINGERPRINT_INVALID") { if (!FINGERPRINT.test(value || "")) fail(code, "A canonical fingerprint is required."); return value; }
  function positiveInteger(value, code = "INTEGER_INVALID") { if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) fail(code, "A positive safe integer is required."); return value; }
  function containsCut(value) { return /fabric[_ -]?cut|steek|concealed[_ -]?cut/i.test(canonicalize(value)); }
  function opposite(face) { return face === "RS" ? "WS" : "RS"; }
  function sumObject(value) { return Object.values(value).reduce((total, item) => total + item, 0); }
  function stateEqual(left, right) { return canonicalize(left) === canonicalize(right); }
  function statePayloadEqual(left, right) { const a = clone(left); const b = clone(right); delete a.identity; delete a.fingerprint; delete b.identity; delete b.fingerprint; return canonicalize(a) === canonicalize(b); }

  function validateSource(input) {
    try { return v2.validateSource(input); }
    catch (error) { fail(error.code || "SOURCE_INVALID", error.userMessage || error.message); }
  }
  function validateChoices(source, input) {
    try { return v2.validateChoices(source, input); }
    catch (error) { fail(error.code || "CHOICES_INVALID", error.userMessage || error.message); }
  }
  const choicesRequired = v2.choicesRequired;

  function ledger(source, sectionCounts, necklineHeld = 0, boundOff = 0, decreased = 0) {
    const workingActive = sumObject(sectionCounts);
    return { sectionCounts: clone(sectionCounts), workingActive, necklineHeld, underarmHeld: source.terminal.heldUnderarmTotal, boundOff, decreased, castOn: 0, pickedUp: 0, reactivatedHeld: 0, totalLive: workingActive + necklineHeld + source.terminal.heldUnderarmTotal };
  }

  function topology(source, planningIdentity, stateOrdinal, mode, sectionCounts, necklineHeld) {
    const linear = mode === "linear";
    const order = linear ? ["right_front", "right_sleeve_active", "back", "left_sleeve_active", "left_front"] : SECTION_ORDER;
    const boundaries = linear ? [
      { boundaryIdentity: "right_front_edge", kind: "opening_edge", activeForTraversal: true, historical: false },
      { boundaryIdentity: "left_front_edge", kind: "opening_edge", activeForTraversal: true, historical: false },
      { boundaryIdentity: "raglan_marker_4", kind: "bor", activeForTraversal: false, historical: true },
    ] : [{ boundaryIdentity: "raglan_marker_4", kind: "bor", activeForTraversal: true, historical: false }];
    const heldGroups = source.terminal.heldGroups.map((item) => ({ identity: item.identity, sourceSectionIdentity: item.identity, exactCount: item.count, remainsLive: true }));
    if (necklineHeld) heldGroups.push({ identity: "center_neck_held", sourceSectionIdentity: "center_front", exactCount: necklineHeld, remainsLive: true });
    return withFingerprint({
      schemaId: TOPOLOGY_SCHEMA_ID,
      identity: `${planningIdentity}:topology-state:${stateOrdinal}`,
      version: 2,
      liveTopology: linear ? "linear" : "cyclic",
      traversalMode: linear ? "flat" : "circular",
      activeRangeIdentity: linear ? "neckline_live" : "yoke_live",
      orderedSectionRanges: order.map((identity) => ({ rangeIdentity: identity, exactCount: sectionCounts[identity], orientation: "forward" })),
      heldGroups,
      boundaries,
      activeBorIdentity: linear ? null : "raglan_marker_4",
      historicalBorIdentities: linear ? ["raglan_marker_4"] : [],
      openingEdgeIdentities: linear ? ["right_front_edge", "left_front_edge"] : [],
      availableTraversalRanges: order.filter((identity) => sectionCounts[identity] > 0),
    });
  }

  function yarn(planningIdentity, stateOrdinal, mode, boundaryIdentity, phase = "primary_active") {
    const segmentIdentity = mode === "linear" ? "neckline_live" : "yoke_live";
    const primaryActive = phase === "primary_active";
    const necklineJoined = phase === "neckline_joined_inactive" || phase === "neckline_active";
    const necklineActive = phase === "neckline_active";
    const activeSourceIdentity = primaryActive ? "stage90_primary_yarn" : necklineActive ? "neckline_execution_yarn" : null;
    return withFingerprint({
      schemaId: YARN_STATE_SCHEMA_ID,
      identity: `${planningIdentity}:yarn-state:${stateOrdinal}`,
      version: 2,
      activeSourceIdentity,
      sources: [
        { yarnSourceIdentity: "stage90_primary_yarn", materialBindingIdentity: "stage90_material", state: primaryActive ? "attached" : "detached", active: primaryActive, joined: true, continuity: primaryActive ? "continuous" : "broken_with_tail", attachmentBoundaryIdentity: primaryActive ? boundaryIdentity : "raglan_marker_4", attachedRangeIdentity: primaryActive ? segmentIdentity : null },
        { yarnSourceIdentity: "neckline_execution_yarn", materialBindingIdentity: "stage90_material", state: necklineJoined ? "attached" : "detached", active: necklineActive, joined: necklineJoined, continuity: necklineJoined ? "newly_joined" : "not_joined", attachmentBoundaryIdentity: necklineJoined ? boundaryIdentity : null, attachedRangeIdentity: necklineJoined ? segmentIdentity : null },
      ],
      workingLocation: { rangeIdentity: activeSourceIdentity ? segmentIdentity : null, boundaryIdentity, anchorIdentity: `${boundaryIdentity}:live_edge` },
      rejoinRequirement: { required: false, sourceIdentity: null, boundaryIdentity: null, requiresNewSource: false },
    });
  }

  function executionState(source, planningIdentity, stateOrdinal, input) {
    const direction = input.direction || null;
    return withFingerprint({
      schemaId: EXECUTION_STATE_SCHEMA_ID,
      identity: `${planningIdentity}:execution-state:${stateOrdinal}`,
      version: 1,
      stateOrdinal,
      yarn: yarn(planningIdentity, stateOrdinal, input.mode, input.boundary, input.yarnPhase || "primary_active"),
      fabric: topology(source, planningIdentity, stateOrdinal, input.mode, input.sectionCounts, input.necklineHeld),
      stitchLedger: ledger(source, input.sectionCounts, input.necklineHeld, input.boundOff, input.decreased),
      traversal: {
        currentBoundaryIdentity: input.boundary,
        face: input.face,
        directionId: direction,
        turnOccurred: input.turnOccurred === true,
        status: input.status || "ready",
        nextAccessiblePath: input.nextPath ? clone(input.nextPath) : [],
      },
    });
  }

  function stateSeed(value) {
    return {
      mode: value.fabric.liveTopology,
      sectionCounts: clone(value.stitchLedger.sectionCounts),
      necklineHeld: value.stitchLedger.necklineHeld,
      boundOff: value.stitchLedger.boundOff,
      decreased: value.stitchLedger.decreased,
      boundary: value.traversal.currentBoundaryIdentity,
      face: value.traversal.face,
      direction: value.traversal.directionId,
      turnOccurred: value.traversal.turnOccurred,
      status: value.traversal.status,
      nextPath: clone(value.traversal.nextAccessiblePath),
      yarnPhase: value.yarn.activeSourceIdentity === "stage90_primary_yarn" ? "primary_active" : value.yarn.activeSourceIdentity === "neckline_execution_yarn" ? "neckline_active" : value.yarn.sources.find((item) => item.yarnSourceIdentity === "neckline_execution_yarn")?.joined ? "neckline_joined_inactive" : "primary_broken",
    };
  }

  function orderedPath(sectionCounts, fromBoundary) {
    const forward = ["right_front", "right_sleeve_active", "back", "left_sleeve_active", "left_front"];
    const values = fromBoundary === "right_front_edge" ? forward : [...forward].reverse();
    return values.filter((identity) => sectionCounts[identity] > 0).map((identity) => ({ rangeIdentity: identity, exactCount: sectionCounts[identity], orientation: fromBoundary === "right_front_edge" ? "forward" : "reverse" }));
  }

  function actionSemantics(kind, input) {
    const labels = {
      bind_off: `Bind off exactly ${input.count} center-front live stitches from ${input.startBoundary} toward ${input.endBoundary}; the working yarn finishes at ${input.endBoundary}.`,
      hold: `Move exactly ${input.count} center-front live stitches to the named holder and leave the working yarn at ${input.endBoundary}.`,
      decrease: `Work the named decrease over exactly ${input.count} live stitch at ${input.rangeIdentity}.`,
      traverse: `Work exactly ${input.count} live stitches along the declared ordered traversal path.`,
      turn: `Turn the physical work at ${input.startBoundary}; change from ${input.face} to ${opposite(input.face)} and reverse direction.`,
      no_turn: `Continue without turning at ${input.startBoundary}.`,
      stop: `Stop at ${input.startBoundary} with the working yarn attached at that boundary.`,
      release: `Release exactly ${input.count} held stitches into the active path.`,
      yarn_break: `Break the named working yarn at ${input.startBoundary}.`,
      yarn_deactivate: `Deactivate the named yarn source at ${input.startBoundary}.`,
      yarn_join: `Join the named yarn source at ${input.endBoundary}.`,
      yarn_activate: `Activate the named yarn source at ${input.endBoundary}.`,
    };
    return labels[kind];
  }

  function buildExecutionInstructions(sourceInput, choicesInput, candidate, geometrySchedule, planningIdentity) {
    const source = validateSource(sourceInput);
    const choices = validateChoices(source, choicesInput);
    if (!geometrySchedule?.rows?.length) fail("EMPTY_INSTRUCTION_SEQUENCE", "At least one execution instruction is required.");
    if (containsCut(choices)) fail("UNSUPPORTED_FABRIC_CUT", "Stage 91 V3 does not support fabric or steek cutting.");

    let stateOrdinal = 0;
    let globalOrdinal = 0;
    let current = executionState(source, planningIdentity, stateOrdinal, {
      mode: "cyclic", sectionCounts: source.terminal.sectionCounts, necklineHeld: 0, boundOff: 0, decreased: 0,
      boundary: "raglan_marker_4", face: "RS", direction: "raglan_marker_4_to_center_front", turnOccurred: false,
      nextPath: [{ rangeIdentity: "front", exactCount: source.terminal.sectionCounts.front, orientation: "forward" }],
    });
    const instructions = [];

    function addStep(container, kind, details, patchState) {
      if (!STEP_KINDS.includes(kind)) fail("OPAQUE_PHYSICAL_ACTION", "Every physical action must use a supported typed execution step.");
      const beforeState = clone(current);
      const seed = { ...stateSeed(current), ...clone(patchState) };
      stateOrdinal += 1;
      const afterState = executionState(source, planningIdentity, stateOrdinal, seed);
      globalOrdinal += 1;
      const physicalSemantics = actionSemantics(kind, details);
      if (!physicalSemantics) fail("OPAQUE_PHYSICAL_ACTION", "An execution step lacks exact physical semantics.");
      container.push({
        schemaId: EXECUTION_STEP_SCHEMA_ID,
        stepId: `${planningIdentity}:step:${globalOrdinal}`,
        ordinal: globalOrdinal,
        instructionIdentity: details.instructionIdentity,
        actionKind: kind,
        physicalSemantics,
        startBoundary: { boundaryIdentity: details.startBoundary },
        endBoundary: { boundaryIdentity: details.endBoundary },
        expectedFace: details.face,
        direction: details.direction || null,
        exactCount: details.count || 0,
        affectedRangeIdentity: details.rangeIdentity || null,
        yarnEffect: details.yarnEffect || "preserve_attached_source_and_exact_location",
        fabricEffect: details.fabricEffect || "preserve_topology_and_stitch_ledger",
        stitchEffect: details.stitchEffect || { workingActiveDelta: 0, heldDelta: 0, boundOffDelta: 0, decreasedDelta: 0 },
        beforeState,
        afterState,
        previousStepId: null,
        nextStepId: null,
        fingerprintContribution: "",
        fingerprint: "",
      });
      current = afterState;
    }

    for (let index = 0; index < geometrySchedule.rows.length; index += 1) {
      const row = geometrySchedule.rows[index];
      const instructionOrdinal = index + 1;
      const instructionIdentity = `${planningIdentity}:instruction:${instructionOrdinal}`;
      const terminal = instructionOrdinal === geometrySchedule.rows.length;
      const face = instructionOrdinal % 2 === 1 ? "RS" : "WS";
      const fromBoundary = face === "RS" ? "right_front_edge" : "left_front_edge";
      const toBoundary = face === "RS" ? "left_front_edge" : "right_front_edge";
      const direction = `${fromBoundary}_to_${toBoundary}`;
      const steps = [];
      const instructionBefore = clone(current);
      const rightDecrease = row.decreasesBySection.right_front || 0;
      const leftDecrease = row.decreasesBySection.left_front || 0;

      if (instructionOrdinal === 1) {
        addStep(steps, "yarn_break", {
          instructionIdentity, count: 0, rangeIdentity: null, startBoundary: "raglan_marker_4", endBoundary: "raglan_marker_4", face,
          direction: "not_applicable", yarnEffect: "break_stage90_primary_yarn_and_leave_identified_tail_at_historical_bor",
          fabricEffect: "preserve_cyclic_topology_and_stitch_ledger",
        }, { yarnPhase: "primary_broken", boundary: "raglan_marker_4", direction: "raglan_marker_4_to_center_front" });
        addStep(steps, "yarn_join", {
          instructionIdentity, count: 0, rangeIdentity: "center_front", startBoundary: "raglan_marker_4", endBoundary: "center_front_bind_off_start", face,
          direction: "not_applicable", yarnEffect: "join_neckline_execution_yarn_at_exact_center_front_bind_off_start_without_activation",
          fabricEffect: "preserve_cyclic_topology_and_stitch_ledger",
        }, { yarnPhase: "neckline_joined_inactive", boundary: "center_front_bind_off_start", direction: "center_front_toward_right_front_edge" });
        addStep(steps, "yarn_activate", {
          instructionIdentity, count: 0, rangeIdentity: "center_front", startBoundary: "center_front_bind_off_start", endBoundary: "center_front_bind_off_start", face,
          direction: "not_applicable", yarnEffect: "activate_neckline_execution_yarn_at_exact_join_boundary",
          fabricEffect: "preserve_cyclic_topology_and_stitch_ledger",
        }, { yarnPhase: "neckline_active", boundary: "center_front_bind_off_start", direction: "center_front_toward_right_front_edge" });
        const firstCounts = clone(row.sectionCountsAfter);
        firstCounts.right_front += rightDecrease;
        firstCounts.left_front += leftDecrease;
        const centerCount = row.bindOffBySection.center_front || row.newlyHeldBySection.center_front;
        const openingKind = row.bindOffBySection.center_front ? "bind_off" : "hold";
        const heldAfter = openingKind === "hold" ? centerCount : 0;
        const boundAfter = openingKind === "bind_off" ? centerCount : 0;
        addStep(steps, openingKind, {
          instructionIdentity, count: centerCount, rangeIdentity: "center_front", startBoundary: "center_front_bind_off_start", endBoundary: "right_front_edge", face,
          direction: "center_front_toward_right_front_edge", yarnEffect: "working_source_remains_attached_and_moves_to_right_front_edge",
          fabricEffect: "split_cyclic_front_at_center_retire_bor_create_two_stable_opening_edges",
          stitchEffect: { workingActiveDelta: -centerCount, heldDelta: heldAfter, boundOffDelta: boundAfter, decreasedDelta: 0 },
        }, {
          mode: "linear", sectionCounts: firstCounts, necklineHeld: heldAfter, boundOff: boundAfter, boundary: "right_front_edge", face,
          direction, turnOccurred: false, status: "ready", nextPath: orderedPath(firstCounts, fromBoundary), yarnPhase: "neckline_active",
        });
      }

      const firstRange = fromBoundary === "right_front_edge" ? "right_front" : "left_front";
      const secondRange = firstRange === "right_front" ? "left_front" : "right_front";
      const decreases = { right_front: rightDecrease, left_front: leftDecrease };
      if (decreases[firstRange]) {
        const counts = clone(current.stitchLedger.sectionCounts); counts[firstRange] -= decreases[firstRange];
        addStep(steps, "decrease", {
          instructionIdentity, count: decreases[firstRange], rangeIdentity: firstRange, startBoundary: fromBoundary, endBoundary: `${firstRange}:neck_edge`, face, direction,
          fabricEffect: `remove_exactly_${decreases[firstRange]}_live_stitch_from_${firstRange}`,
          stitchEffect: { workingActiveDelta: -decreases[firstRange], heldDelta: 0, boundOffDelta: 0, decreasedDelta: decreases[firstRange] },
        }, { sectionCounts: counts, decreased: current.stitchLedger.decreased + decreases[firstRange], boundary: `${firstRange}:neck_edge`, direction, nextPath: orderedPath(counts, fromBoundary) });
      }

      const traverseCounts = clone(current.stitchLedger.sectionCounts);
      const traverseStart = current.traversal.currentBoundaryIdentity;
      const traverseEnd = decreases[secondRange] ? `${secondRange}:neck_edge` : toBoundary;
      addStep(steps, "traverse", {
        instructionIdentity, count: sumObject(traverseCounts), rangeIdentity: "neckline_live", startBoundary: traverseStart, endBoundary: traverseEnd, face, direction,
        yarnEffect: `move_attached_working_yarn_from_${traverseStart}_to_${traverseEnd}`,
        fabricEffect: "work_declared_active_ranges_without_topology_change",
      }, { boundary: traverseEnd, face, direction, turnOccurred: false, status: "ready", nextPath: orderedPath(traverseCounts, fromBoundary) });

      if (decreases[secondRange]) {
        const counts = clone(current.stitchLedger.sectionCounts); counts[secondRange] -= decreases[secondRange];
        addStep(steps, "decrease", {
          instructionIdentity, count: decreases[secondRange], rangeIdentity: secondRange, startBoundary: `${secondRange}:neck_edge`, endBoundary: toBoundary, face, direction,
          fabricEffect: `remove_exactly_${decreases[secondRange]}_live_stitch_from_${secondRange}`,
          stitchEffect: { workingActiveDelta: -decreases[secondRange], heldDelta: 0, boundOffDelta: 0, decreasedDelta: decreases[secondRange] },
        }, { sectionCounts: counts, decreased: current.stitchLedger.decreased + decreases[secondRange], boundary: toBoundary, direction, nextPath: orderedPath(counts, fromBoundary) });
      }

      if (canonicalize(current.stitchLedger.sectionCounts) !== canonicalize(row.sectionCountsAfter) || current.stitchLedger.necklineHeld !== row.necklineHeldAfter || current.stitchLedger.boundOff !== row.boundOffAfter || current.stitchLedger.decreased !== row.decreasedAfter) fail("INSTRUCTION_LEDGER_MISMATCH", "The generated row does not reach the exact geometry ledger.");

      if (terminal) {
        addStep(steps, "stop", { instructionIdentity, count: 0, startBoundary: toBoundary, endBoundary: toBoundary, face, direction, yarnEffect: "preserve_attached_source_at_terminal_boundary" }, { boundary: toBoundary, face, direction, turnOccurred: false, status: "stopped", nextPath: [] });
      } else {
        const nextDirection = `${toBoundary}_to_${fromBoundary}`;
        addStep(steps, "turn", { instructionIdentity, count: 0, startBoundary: toBoundary, endBoundary: toBoundary, face, direction, yarnEffect: "preserve_attached_source_at_turn_boundary" }, { boundary: toBoundary, face: opposite(face), direction: nextDirection, turnOccurred: true, status: "ready", nextPath: orderedPath(current.stitchLedger.sectionCounts, toBoundary) });
      }

      instructions.push({
        schemaId: INSTRUCTION_SCHEMA_ID,
        instructionIdentity,
        instructionOrdinal,
        fabricRowOrRoundOrdinal: instructionOrdinal,
        instructionKind: instructionOrdinal === 1 ? "circular_to_flat_pass" : "flat_pass",
        beforeState: instructionBefore,
        executionSteps: steps,
        afterState: clone(current),
        previousInstructionIdentity: null,
        nextInstructionIdentity: null,
        previousInstructionFingerprint: null,
        terminalSemantics: terminal ? "terminal_stop" : "explicit_turn_to_next_instruction",
        fingerprint: "",
      });
    }

    const allSteps = instructions.flatMap((item) => item.executionSteps);
    for (let index = 0; index < allSteps.length; index += 1) {
      allSteps[index].previousStepId = allSteps[index - 1]?.stepId || null;
      allSteps[index].nextStepId = allSteps[index + 1]?.stepId || null;
      const contribution = clone(allSteps[index]); delete contribution.fingerprintContribution; delete contribution.fingerprint;
      allSteps[index].fingerprintContribution = fingerprint(contribution);
      allSteps[index] = withFingerprint(allSteps[index]);
    }
    let cursor = 0;
    let previousInstructionFingerprint = null;
    for (let index = 0; index < instructions.length; index += 1) {
      const item = instructions[index];
      item.executionSteps = allSteps.slice(cursor, cursor + item.executionSteps.length); cursor += item.executionSteps.length;
      item.previousInstructionIdentity = instructions[index - 1]?.instructionIdentity || null;
      item.nextInstructionIdentity = instructions[index + 1]?.instructionIdentity || null;
      item.previousInstructionFingerprint = previousInstructionFingerprint;
      instructions[index] = withFingerprint(item);
      previousInstructionFingerprint = instructions[index].fingerprint;
    }
    return instructions;
  }

  function deriveReview(sourceInput, choicesInput, planningIdentity = "stage91-v3-preview") {
    const source = validateSource(sourceInput);
    const choices = validateChoices(source, choicesInput);
    let geometry;
    try { geometry = V1.deriveReview(source, choices); }
    catch (error) { fail(error.code || "REVIEW_INVALID", error.userMessage || error.message); }
    const executionInstructions = geometry.selectedCandidate && geometry.schedule ? buildExecutionInstructions(source, choices, geometry.selectedCandidate, geometry.schedule, planningIdentity) : null;
    const executionSteps = executionInstructions ? executionInstructions.flatMap((item) => item.executionSteps) : null;
    const base = { sourceFingerprint: source.fingerprint, choicesFingerprint: fingerprint(choices), candidates: clone(geometry.candidates), selectedCandidate: clone(geometry.selectedCandidate), geometrySchedule: clone(geometry.schedule), executionInstructions, executionSteps, requiresCandidateSelection: geometry.requiresCandidateSelection };
    return { ...base, reviewFingerprint: fingerprint(base) };
  }

  function validateTopology(input) {
    const value = clone(input);
    if (!record(value) || value.schemaId !== TOPOLOGY_SCHEMA_ID || value.version !== 2 || !["cyclic", "linear"].includes(value.liveTopology) || !["circular", "flat"].includes(value.traversalMode) || !Array.isArray(value.orderedSectionRanges) || !Array.isArray(value.heldGroups) || !Array.isArray(value.boundaries)) fail("TOPOLOGY_INVALID", "A V3 topology state is invalid.");
    if (value.liveTopology === "cyclic" && (value.activeBorIdentity !== "raglan_marker_4" || value.openingEdgeIdentities.length !== 0) || value.liveTopology === "linear" && (value.activeBorIdentity !== null || canonicalize(value.openingEdgeIdentities) !== canonicalize(["right_front_edge", "left_front_edge"]) || !value.historicalBorIdentities.includes("raglan_marker_4"))) fail("TOPOLOGY_INVALID", "Topology and boundary semantics conflict.");
    if (new Set(value.orderedSectionRanges.map((item) => item.rangeIdentity)).size !== value.orderedSectionRanges.length || value.orderedSectionRanges.some((item) => !Number.isSafeInteger(item.exactCount) || item.exactCount < 0)) fail("TOPOLOGY_INVALID", "Topology ranges are not exact and unique.");
    requireFingerprint(value.fingerprint, "TOPOLOGY_FINGERPRINT_INVALID"); const comparable = clone(value); delete comparable.fingerprint; if (fingerprint(comparable) !== value.fingerprint) fail("TOPOLOGY_FINGERPRINT_INVALID", "The topology fingerprint is invalid.");
    return deepFreeze(value);
  }

  function validateYarnState(input) {
    const value = clone(input);
    if (!record(value) || value.schemaId !== YARN_STATE_SCHEMA_ID || value.version !== 2 || !Array.isArray(value.sources) || value.sources.length < 1 || new Set(value.sources.map((item) => item.yarnSourceIdentity)).size !== value.sources.length || !record(value.workingLocation) || !record(value.rejoinRequirement)) fail("YARN_STATE_INVALID", "A V3 yarn state is invalid.");
    const active = value.sources.filter((item) => item.active);
    if (value.activeSourceIdentity === null ? active.length !== 0 : active.length !== 1 || active[0]?.yarnSourceIdentity !== value.activeSourceIdentity || value.sources.some((item) => !["attached", "detached", "exhausted"].includes(item.state) || typeof item.joined !== "boolean")) fail("YARN_STATE_INVALID", "Yarn activity, identity, join, and continuity conflict.");
    requireFingerprint(value.fingerprint, "YARN_FINGERPRINT_INVALID"); const comparable = clone(value); delete comparable.fingerprint; if (fingerprint(comparable) !== value.fingerprint) fail("YARN_FINGERPRINT_INVALID", "The yarn fingerprint is invalid.");
    return deepFreeze(value);
  }

  function validateExecutionState(input) {
    const value = clone(input);
    if (!record(value) || value.schemaId !== EXECUTION_STATE_SCHEMA_ID || value.version !== 1 || !Number.isSafeInteger(value.stateOrdinal) || value.stateOrdinal < 0 || !record(value.traversal) || !record(value.stitchLedger)) fail("EXECUTION_STATE_INVALID", "A V3 execution state is invalid.");
    validateTopology(value.fabric); validateYarnState(value.yarn);
    if (!["RS", "WS"].includes(value.traversal.face) || !["ready", "stopped"].includes(value.traversal.status) || typeof value.traversal.turnOccurred !== "boolean" || !Array.isArray(value.traversal.nextAccessiblePath)) fail("TRAVERSAL_STATE_INVALID", "Traversal face, status, or next path is invalid.");
    const rangeTotal = value.fabric.orderedSectionRanges.reduce((sum, item) => sum + item.exactCount, 0);
    const heldNeck = value.fabric.heldGroups.filter((item) => item.identity === "center_neck_held").reduce((sum, item) => sum + item.exactCount, 0);
    const ledgerValue = value.stitchLedger;
    if (rangeTotal !== ledgerValue.workingActive || sumObject(ledgerValue.sectionCounts) !== ledgerValue.workingActive || heldNeck !== ledgerValue.necklineHeld || ledgerValue.totalLive !== ledgerValue.workingActive + ledgerValue.necklineHeld + ledgerValue.underarmHeld) fail("STITCH_LEDGER_INVALID", "The execution state's topology and stitch ledger conflict.");
    for (const item of value.fabric.orderedSectionRanges) if (ledgerValue.sectionCounts[item.rangeIdentity] !== item.exactCount) fail("STITCH_LEDGER_INVALID", "Topology range counts differ from the stitch ledger.");
    if (value.yarn.workingLocation.boundaryIdentity !== value.traversal.currentBoundaryIdentity) fail("YARN_LOCATION_INVALID", "The working yarn and traversal boundary differ.");
    requireFingerprint(value.fingerprint, "EXECUTION_STATE_FINGERPRINT_INVALID"); const comparable = clone(value); delete comparable.fingerprint; if (fingerprint(comparable) !== value.fingerprint) fail("EXECUTION_STATE_FINGERPRINT_INVALID", "The execution-state fingerprint is invalid.");
    return deepFreeze(value);
  }

  function ledgerDelta(before, after) {
    return {
      workingActiveDelta: after.workingActive - before.workingActive,
      heldDelta: after.necklineHeld - before.necklineHeld,
      boundOffDelta: after.boundOff - before.boundOff,
      decreasedDelta: after.decreased - before.decreased,
    };
  }

  function validateExecutionStep(input) {
    const step = clone(input);
    if (!record(step) || step.schemaId !== EXECUTION_STEP_SCHEMA_ID || !STEP_KINDS.includes(step.actionKind) || !Number.isSafeInteger(step.ordinal) || step.ordinal < 1 || !step.stepId || !step.instructionIdentity || typeof step.physicalSemantics !== "string" || !step.physicalSemantics.trim() || !record(step.startBoundary) || !record(step.endBoundary) || !["RS", "WS"].includes(step.expectedFace) || !Number.isSafeInteger(step.exactCount) || step.exactCount < 0 || !record(step.stitchEffect)) fail("EXECUTION_STEP_INVALID", "An execution step is incomplete or opaque.");
    if (containsCut(step) || /generic|opaque|structural_transition/i.test(step.actionKind)) fail("OPAQUE_PHYSICAL_ACTION", "Fabric cut, steek, and opaque physical actions are forbidden.");
    const before = validateExecutionState(step.beforeState); const after = validateExecutionState(step.afterState);
    if (after.stateOrdinal !== before.stateOrdinal + 1 || before.traversal.face !== step.expectedFace || before.traversal.currentBoundaryIdentity !== step.startBoundary.boundaryIdentity || after.traversal.currentBoundaryIdentity !== step.endBoundary.boundaryIdentity) fail("STEP_STATE_BOUNDARY_INVALID", "The step boundary or state ordinal is discontinuous.");
    const delta = ledgerDelta(before.stitchLedger, after.stitchLedger);
    if (canonicalize(delta) !== canonicalize(step.stitchEffect)) fail("STEP_STITCH_EFFECT_INVALID", "The declared stitch effect differs from the exact before/after states.");
    const topologyChanged = !statePayloadEqual(before.fabric, after.fabric);
    const yarnChanged = !statePayloadEqual(before.yarn, after.yarn);
    const ledgerChanged = canonicalize(before.stitchLedger) !== canonicalize(after.stitchLedger);
    const sameFabricState = !topologyChanged && !ledgerChanged;
    if (step.actionKind === "traverse" && (!sameFabricState || before.traversal.face !== after.traversal.face || before.traversal.directionId !== after.traversal.directionId || step.exactCount < 1)) fail("TRAVERSE_TRANSITION_INVALID", "Traverse must only move along the declared path and preserve fabric state.");
    if (step.actionKind === "decrease" && (delta.decreasedDelta !== step.exactCount || delta.workingActiveDelta !== -step.exactCount || delta.heldDelta || delta.boundOffDelta || before.fabric.liveTopology !== after.fabric.liveTopology)) fail("DECREASE_TRANSITION_INVALID", "A decrease must remove exactly its declared live stitches.");
    if (step.actionKind === "bind_off" && (delta.boundOffDelta !== step.exactCount || delta.workingActiveDelta !== -step.exactCount || delta.heldDelta || delta.decreasedDelta || before.fabric.liveTopology !== "cyclic" || after.fabric.liveTopology !== "linear" || after.yarn.workingLocation.boundaryIdentity !== step.endBoundary.boundaryIdentity)) fail("BIND_OFF_TRANSITION_INVALID", "Center bind-off semantics are not physically closed.");
    if (step.actionKind === "hold" && (delta.heldDelta !== step.exactCount || delta.workingActiveDelta !== -step.exactCount || delta.boundOffDelta || delta.decreasedDelta || before.fabric.liveTopology !== "cyclic" || after.fabric.liveTopology !== "linear")) fail("HOLD_TRANSITION_INVALID", "Center hold semantics are not physically closed.");
    if (step.actionKind === "turn" && (!sameFabricState || before.traversal.currentBoundaryIdentity !== after.traversal.currentBoundaryIdentity || after.traversal.face !== opposite(before.traversal.face) || after.traversal.turnOccurred !== true || before.traversal.directionId === after.traversal.directionId)) fail("TURN_TRANSITION_INVALID", "A turn must explicitly reverse face and direction at one boundary.");
    if (step.actionKind === "no_turn" && (!sameFabricState || before.traversal.face !== after.traversal.face || after.traversal.turnOccurred)) fail("TURN_TRANSITION_INVALID", "No-turn must explicitly preserve face and fabric.");
    if (step.actionKind === "stop" && (!sameFabricState || after.traversal.status !== "stopped" || after.traversal.nextAccessiblePath.length)) fail("STOP_TRANSITION_INVALID", "Stop must produce the explicit terminal traversal state.");
    if (["traverse", "decrease", "bind_off", "hold", "turn", "no_turn", "stop"].includes(step.actionKind) && before.yarn.activeSourceIdentity !== after.yarn.activeSourceIdentity) fail("HIDDEN_YARN_ACTION", "A non-yarn step cannot implicitly change the active yarn source.");
    if (["yarn_break", "yarn_deactivate", "yarn_join", "yarn_activate"].includes(step.actionKind) && (!yarnChanged || !sameFabricState)) fail("YARN_TRANSITION_INVALID", "A yarn action must explicitly change only yarn/traversal state.");
    if (step.actionKind === "yarn_break" && (before.yarn.activeSourceIdentity !== "stage90_primary_yarn" || after.yarn.activeSourceIdentity !== null || after.yarn.sources.find((item) => item.yarnSourceIdentity === "stage90_primary_yarn")?.continuity !== "broken_with_tail")) fail("YARN_BREAK_TRANSITION_INVALID", "Yarn break ordering and continuity are invalid.");
    if (step.actionKind === "yarn_join" && (before.yarn.activeSourceIdentity !== null || after.yarn.activeSourceIdentity !== null || after.yarn.sources.find((item) => item.yarnSourceIdentity === "neckline_execution_yarn")?.joined !== true || after.yarn.sources.find((item) => item.yarnSourceIdentity === "neckline_execution_yarn")?.active !== false)) fail("YARN_JOIN_TRANSITION_INVALID", "Yarn join must precede activation at the exact boundary.");
    if (step.actionKind === "yarn_activate" && (before.yarn.activeSourceIdentity !== null || after.yarn.activeSourceIdentity !== "neckline_execution_yarn" || before.traversal.currentBoundaryIdentity !== after.traversal.currentBoundaryIdentity)) fail("YARN_ACTIVATION_TRANSITION_INVALID", "Yarn activation must follow an explicit join at the same boundary.");
    const accountedBefore = before.stitchLedger.totalLive + before.stitchLedger.boundOff + before.stitchLedger.decreased;
    const accountedAfter = after.stitchLedger.totalLive + after.stitchLedger.boundOff + after.stitchLedger.decreased;
    if (accountedBefore !== accountedAfter) fail("STEP_STITCH_CONSERVATION_INVALID", "Step-level stitch conservation failed.");
    requireFingerprint(step.fingerprintContribution, "STEP_FINGERPRINT_CONTRIBUTION_INVALID"); const contribution = clone(step); delete contribution.fingerprintContribution; delete contribution.fingerprint; if (fingerprint(contribution) !== step.fingerprintContribution) fail("STEP_FINGERPRINT_CONTRIBUTION_INVALID", "The step fingerprint contribution is invalid.");
    requireFingerprint(step.fingerprint, "EXECUTION_STEP_FINGERPRINT_INVALID"); const comparable = clone(step); delete comparable.fingerprint; if (fingerprint(comparable) !== step.fingerprint) fail("EXECUTION_STEP_FINGERPRINT_INVALID", "The execution-step fingerprint is invalid.");
    return deepFreeze(step);
  }

  function validateInstruction(input) {
    const item = clone(input);
    if (!record(item) || item.schemaId !== INSTRUCTION_SCHEMA_ID || !Number.isSafeInteger(item.instructionOrdinal) || item.instructionOrdinal < 1 || !Array.isArray(item.executionSteps) || !item.executionSteps.length || !["circular_to_flat_pass", "flat_pass"].includes(item.instructionKind) || !["terminal_stop", "explicit_turn_to_next_instruction"].includes(item.terminalSemantics)) fail("INSTRUCTION_INVALID", "A V3 instruction is incomplete.");
    const steps = item.executionSteps.map(validateExecutionStep);
    if (!stateEqual(item.beforeState, steps[0].beforeState) || !stateEqual(item.afterState, steps.at(-1).afterState)) fail("INSTRUCTION_STATE_MISMATCH", "Instruction state must equal its first and last step states exactly.");
    for (let index = 1; index < steps.length; index += 1) if (!stateEqual(steps[index - 1].afterState, steps[index].beforeState)) fail("STEP_STATE_CHAIN_INVALID", "Adjacent execution-step states differ.");
    const openingStepIndex = steps.findIndex((step) => ["bind_off", "hold"].includes(step.actionKind));
    if (item.instructionKind === "circular_to_flat_pass" && (item.beforeState.fabric.liveTopology !== "cyclic" || item.afterState.fabric.liveTopology !== "linear" || openingStepIndex < 0 || steps.slice(0, openingStepIndex).some((step) => step.beforeState.fabric.liveTopology !== "cyclic" || step.afterState.fabric.liveTopology !== "cyclic") || steps.slice(openingStepIndex + 1).some((step) => step.beforeState.fabric.liveTopology !== "linear" || step.afterState.fabric.liveTopology !== "linear")) || item.instructionKind === "flat_pass" && steps.some((step) => step.beforeState.fabric.liveTopology !== "linear" || step.afterState.fabric.liveTopology !== "linear")) fail("CIRCULAR_TO_FLAT_TRANSITION_INVALID", "Only the typed center action may transition circular work to flat work after explicit yarn preparation.");
    if (item.terminalSemantics === "terminal_stop" ? steps.at(-1).actionKind !== "stop" : steps.at(-1).actionKind !== "turn") fail("INSTRUCTION_TERMINAL_INVALID", "Instruction terminal semantics are not explicit.");
    requireFingerprint(item.fingerprint, "INSTRUCTION_FINGERPRINT_INVALID"); const comparable = clone(item); delete comparable.fingerprint; if (fingerprint(comparable) !== item.fingerprint) fail("INSTRUCTION_FINGERPRINT_INVALID", "The instruction fingerprint is invalid.");
    return deepFreeze(item);
  }

  function validateInstructionChain(instructions, finalExecutionState = null) {
    if (!Array.isArray(instructions) || !instructions.length) fail("EMPTY_INSTRUCTION_SEQUENCE", "At least one execution instruction is required.");
    const checked = instructions.map(validateInstruction);
    const allSteps = checked.flatMap((item) => item.executionSteps);
    if (new Set(checked.map((item) => item.instructionIdentity)).size !== checked.length) fail("DUPLICATE_INSTRUCTION_ID", "Instruction identities must be unique.");
    if (new Set(allSteps.map((item) => item.stepId)).size !== allSteps.length) fail("DUPLICATE_STEP_ID", "Execution-step identities must be globally unique.");
    for (let index = 0; index < checked.length; index += 1) {
      const item = checked[index]; const previous = checked[index - 1]; const next = checked[index + 1];
      if (item.instructionOrdinal !== index + 1) fail("INSTRUCTION_ORDINAL_INVALID", "Instruction ordinals must be contiguous.");
      if (item.previousInstructionIdentity !== (previous?.instructionIdentity || null) || item.nextInstructionIdentity !== (next?.instructionIdentity || null) || item.previousInstructionFingerprint !== (previous?.fingerprint || null)) fail("INSTRUCTION_LINK_INVALID", "Instruction links are broken.");
      if (previous && !stateEqual(previous.afterState, item.beforeState)) fail("CROSS_INSTRUCTION_STATE_MISMATCH", "Adjacent instruction states differ.");
    }
    for (let index = 0; index < allSteps.length; index += 1) {
      const step = allSteps[index];
      if (step.ordinal !== index + 1) fail("STEP_ORDINAL_INVALID", "Global execution-step ordinals must be contiguous without gaps.");
      if (step.previousStepId !== (allSteps[index - 1]?.stepId || null) || step.nextStepId !== (allSteps[index + 1]?.stepId || null)) fail("STEP_LINK_INVALID", "Global execution-step links are broken.");
      if (index && !stateEqual(allSteps[index - 1].afterState, step.beforeState)) fail("STEP_STATE_CHAIN_INVALID", "The global execution stream has a state gap.");
    }
    if (checked[0].instructionKind !== "circular_to_flat_pass" || allSteps.at(-1).actionKind !== "stop" || allSteps.at(-1).afterState.traversal.status !== "stopped") fail("TERMINAL_STATE_INVALID", "The execution stream does not have the required start and terminal states.");
    if (finalExecutionState && !stateEqual(finalExecutionState, allSteps.at(-1).afterState)) fail("TERMINAL_STATE_INVALID", "The declared final state differs from the final execution step.");
    return deepFreeze(checked);
  }

  function buildClosureProof(instructions, finalExecutionState) {
    const steps = instructions.flatMap((item) => item.executionSteps);
    return withFingerprint({
      complete: instructions.length > 0 && steps.length > 0,
      instructionCount: instructions.length,
      stepCount: steps.length,
      firstStepId: steps[0]?.stepId || null,
      terminalStepId: steps.at(-1)?.stepId || null,
      contiguousInstructionOrdinals: instructions.every((item, index) => item.instructionOrdinal === index + 1),
      contiguousGlobalStepOrdinals: steps.every((item, index) => item.ordinal === index + 1),
      uniqueInstructionIdentities: new Set(instructions.map((item) => item.instructionIdentity)).size === instructions.length,
      uniqueStepIdentities: new Set(steps.map((item) => item.stepId)).size === steps.length,
      instructionLinksClosed: instructions.every((item, index) => item.previousInstructionIdentity === (instructions[index - 1]?.instructionIdentity || null) && item.nextInstructionIdentity === (instructions[index + 1]?.instructionIdentity || null)),
      stepLinksClosed: steps.every((item, index) => item.previousStepId === (steps[index - 1]?.stepId || null) && item.nextStepId === (steps[index + 1]?.stepId || null)),
      stateContinuityClosed: steps.every((item, index) => !index || stateEqual(steps[index - 1].afterState, item.beforeState)),
      instructionStateContinuityClosed: instructions.every((item, index) => !index || stateEqual(instructions[index - 1].afterState, item.beforeState)),
      terminalStateMatches: stateEqual(finalExecutionState, steps.at(-1)?.afterState),
      noHiddenPhysicalActions: true,
      fabricCutAbsent: !containsCut(steps),
      chainFingerprint: fingerprint(steps.map((item) => item.fingerprintContribution)),
    });
  }

  function buildCompletedPlan(state, metadata) {
    const review = deriveReview(state.source, state.choices, state.identity);
    if (!review.selectedCandidate || !review.executionInstructions?.length) fail("CURRENT_REVIEW_REQUIRED", "Select and review one complete V3 execution stream first.");
    validateInstructionChain(review.executionInstructions);
    const steps = review.executionInstructions.flatMap((item) => item.executionSteps);
    const finalExecutionState = clone(steps.at(-1).afterState);
    const closure = buildClosureProof(review.executionInstructions, finalExecutionState);
    if (Object.entries(closure).some(([key, value]) => /Closed$|complete|Matches$|noHidden|Absent$|contiguous|unique/.test(key) && value !== true)) fail("EXECUTION_STREAM_INVALID", "The global V3 execution stream is not closed.");
    const candidate = review.selectedCandidate;
    const base = {
      schemaId: RESULT_SCHEMA_ID, resultVersion: RESULT_VERSION, contractVersion: CONTRACT_VERSION, kind: KIND,
      identity: `${state.identity}:plan:${metadata.operationId}`, planningIdentity: state.identity, epoch: state.epoch, predecessorIdentity: state.predecessorIdentity, supersedesPlanIdentity: state.supersedesPlanIdentity,
      sourceFingerprint: state.source.fingerprint, sourceBindings: clone(state.source.bindings), stage90ResultIdentity: state.source.stage90.resultIdentity, stage90ResultFingerprint: state.source.stage90.resultFingerprint, outputBoundary: OUTPUT_BOUNDARY,
      featureDecision: { necklineMode: state.choices.necklineMode, openingFeature: state.choices.openingFeature, productFeatureProvenance: state.source.featureAuthority.provenance }, referenceGeometry: clone(state.source.references),
      targetGeometry: { requested: { depthCm: state.choices.targetDepthCm, widthCm: state.choices.targetWidthCm }, discreteAchieved: { depthRows: candidate.depthRows, depthCm: candidate.achievedDepthCm, centerStitches: candidate.centerStitches, widthCm: candidate.achievedWidthCm }, centerAxis: candidate.centerStitches % 2 ? "center_stitch" : "between_center_pair", parity: "exact", symmetry: "symmetric" },
      openingStrategy: { method: state.choices.openingMethod, transitionKind: "typed_center_action_opens_linear_topology", centerDisposition: state.choices.necklineMode === "v_neck" ? "held" : "bound_off", fabricCutRequired: false, openingEdgeIdentities: ["right_front_edge", "left_front_edge"], overlapIntent: state.choices.overlapIntent },
      executionCapability: { capabilityId: EXECUTION_CAPABILITY_ID, instructionSchemaId: INSTRUCTION_SCHEMA_ID, stepSchemaId: EXECUTION_STEP_SCHEMA_ID, stateSchemaId: EXECUTION_STATE_SCHEMA_ID, globallyOrdered: true, intermediateStateAfterEveryStep: true, fabricCut: "unsupported_requires_dedicated_contract" },
      executionEntryPrecondition: withFingerprint({ sourceStage90ResultIdentity: state.source.stage90.resultIdentity, sourceStage90ResultFingerprint: state.source.stage90.resultFingerprint, executionState: clone(steps[0].beforeState), requiresStage92BaselineConfirmation: true }),
      executionInstructions: clone(review.executionInstructions), executionSteps: clone(steps), finalExecutionState, executionClosureProof: closure,
      futurePlacketBoundary: { edgeIdentities: state.choices.openingFeature ? ["right_front_edge", "left_front_edge"] : [], finishingNotApplied: true, successorAfterPhysicalExecution: SUCCESSOR_AFTER_EXECUTION },
      futureCollarPickupBoundary: { orderedEdgeAndHeldGroups: ["right_front_neck_edge", "center_neck_boundary", "left_front_neck_edge"], finalPickupCountDeferred: true },
      conservationProof: { stage90FinalActive: state.source.terminal.activeTotal, finalWorkingActive: finalExecutionState.stitchLedger.workingActive, finalNecklineHeld: finalExecutionState.stitchLedger.necklineHeld, totalBoundOff: finalExecutionState.stitchLedger.boundOff, totalDecreased: finalExecutionState.stitchLedger.decreased, underarmHeldBefore: state.source.terminal.heldUnderarmTotal, underarmHeldAfter: finalExecutionState.stitchLedger.underarmHeld, exactNoTolerance: true, finalEquationHolds: state.source.terminal.activeTotal === finalExecutionState.stitchLedger.workingActive + finalExecutionState.stitchLedger.necklineHeld + finalExecutionState.stitchLedger.boundOff + finalExecutionState.stitchLedger.decreased },
      openingOrNecklineWorkApplied: false, placketOrCollarFinishingApplied: false, fabricCutApplied: false, heldUnderarmsClosed: false, explicitFinalConfirmation: true, completionOperationId: metadata.operationId,
      timestamps: { createdAt: state.timestamps.createdAt, completedAt: metadata.at }, fingerprint: "",
    };
    if (!base.conservationProof.finalEquationHolds || containsCut(base.executionSteps)) fail("EXECUTION_STREAM_INVALID", "The completed V3 result is unsafe.");
    return withFingerprint(base);
  }

  function commandPayload(command, state, payload) { return { command, planningIdentity: state.identity, epoch: state.epoch, sourceFingerprint: state.source.fingerprint, payload: clone(payload) }; }
  function metadataRequired(metadata) { requireUuid(metadata.operationId); requireTimestamp(metadata.at); }
  function validateReceipt(item) { if (!record(item) || !UUID_V7.test(item.operationId || "") || !item.command || !FINGERPRINT.test(item.payloadFingerprint || "") || !Number.isSafeInteger(item.resultingRevision) || item.resultingRevision < 1 || !TIMESTAMP.test(item.at || "")) fail("RECEIPT_INVALID", "A durable operation receipt is invalid."); }
  function appendReceipt(state, command, payload, metadata) { state.operationReceipts.push({ operationId: metadata.operationId, command, payloadFingerprint: fingerprint(commandPayload(command, state, payload)), resultingRevision: state.revision, at: metadata.at }); }
  function priorReceipt(state, operationId, command, payload) { const expected = fingerprint(commandPayload(command, state, payload)); const prior = state.operationReceipts.find((item) => item.operationId === operationId); if (!prior) return null; if (prior.command !== command || prior.payloadFingerprint !== expected) fail("OPERATION_ID_CONFLICT", "This operation id was already used with different semantics."); return state; }
  function assertFence(state, metadata, review = false) { if (metadata.expectedRevision !== undefined && metadata.expectedRevision !== state.revision || metadata.expectedFingerprint !== undefined && metadata.expectedFingerprint !== state.fingerprint) fail("REVISION_CONFLICT", "Stage 91 changed. Reload the page."); if (metadata.expectedSourceFingerprint !== undefined && metadata.expectedSourceFingerprint !== state.source.fingerprint) fail("SOURCE_STALE", "The authoritative Stage 77-90 source changed."); if (review && metadata.expectedReviewFingerprint !== undefined && metadata.expectedReviewFingerprint !== state.review?.reviewFingerprint) fail("REVIEW_STALE", "The reviewed plan changed."); }
  function finalize(next, command, payload, metadata) { next.revision += 1; next.timestamps.updatedAt = metadata.at; appendReceipt(next, command, payload, metadata); return withFingerprint(next); }
  function emptyChoices(source) { return clone(V1.readyView(source).choices); }
  function createState(input, metadata) {
    const source = validateSource(input.source); requireUuid(input.projectId, "PROJECT_ID_INVALID"); requireUuid(input.calculationId, "CALCULATION_ID_INVALID"); positiveInteger(input.epoch, "EPOCH_INVALID");
    if (input.projectId !== source.projectId || input.calculationId !== source.calculationId) fail("SOURCE_BINDING_INVALID", "The source belongs to another project or calculation.");
    if (input.epoch === 1 ? input.predecessorIdentity !== null : !input.predecessorIdentity) fail("HISTORY_CONFLICT", "Stage 91 epoch lineage is invalid.");
    const identity = `${input.projectId}:${input.calculationId}:neckline-opening-plan-v3:${input.epoch}:${source.fingerprint}`;
    return { kind: KIND, contractSchemaId: CONTRACT_SCHEMA_ID, contractVersion: CONTRACT_VERSION, projectId: input.projectId, calculationId: input.calculationId, identity, epoch: input.epoch, predecessorIdentity: input.predecessorIdentity, supersedesPlanIdentity: input.supersedesPlanIdentity || null, lifecycle: "collecting_opening_choices", revision: 1, source: clone(source), choices: emptyChoices(source), review: null, completedPlan: null, operationReceipts: [], timestamps: { createdAt: metadata.at, updatedAt: metadata.at, completedAt: null }, fingerprint: "" };
  }
  function startPlanning(input = {}, metadata = {}) { metadataRequired(metadata); const state = createState(input, metadata); appendReceipt(state, "start_neckline_opening_planning_v3", {}, metadata); return withFingerprint(state); }
  function resolveChoice(stateInput, input = {}, metadata = {}) {
    const state = validateV3State(stateInput); metadataRequired(metadata); exactKeys(input, ["choiceId", "value"], "CHOICE_INVALID"); const payload = clone(input); const replay = priorReceipt(state, metadata.operationId, "resolve_required_choice", payload); if (replay) return replay; assertFence(state, metadata); if (state.lifecycle === "completed") fail("COMPLETED_PLAN_IMMUTABLE", "Completed Stage 91 V3 is immutable.");
    const setters = { neckline_shape: (draft, value) => { draft.necklineMode = value; }, opening_feature: (draft, value) => { draft.openingFeature = value; draft.openingMethod = value === false ? "none" : draft.openingMethod === "none" ? null : draft.openingMethod; }, neckline_depth: (draft, value) => { draft.targetDepthCm = String(value); }, neckline_width: (draft, value) => { draft.targetWidthCm = String(value); }, opening_method: (draft, value) => { draft.openingMethod = value; }, opening_length: (draft, value) => { draft.openingLengthCm = String(value); }, integrated_edge_stitches: (draft, value) => { draft.integratedEdgeStitches = value; }, overlap_intent: (draft, value) => { draft.overlapIntent = value; } };
    if (!setters[input.choiceId]) fail("CHOICE_INVALID", "This Stage 91 choice is not supported."); const next = clone(state); setters[input.choiceId](next.choices, input.value); next.choices.selectedCandidateKey = null; validateChoices(next.source, next.choices); next.review = null; next.lifecycle = "collecting_opening_choices"; return finalize(next, "resolve_required_choice", payload, metadata);
  }
  function reviewPlan(stateInput, input = {}, metadata = {}) { exactKeys(input, []); const state = validateV3State(stateInput); metadataRequired(metadata); const replay = priorReceipt(state, metadata.operationId, "review_neckline_opening_plan_v3", {}); if (replay) return replay; assertFence(state, metadata); if (state.lifecycle === "completed") fail("COMPLETED_PLAN_IMMUTABLE", "Completed Stage 91 V3 is immutable."); const next = clone(state); next.review = clone(deriveReview(state.source, state.choices, state.identity)); next.lifecycle = "reviewing_neckline_opening_plan"; return finalize(next, "review_neckline_opening_plan_v3", {}, metadata); }
  function selectCandidate(stateInput, input = {}, metadata = {}) { exactKeys(input, ["candidateKey", "explicitConfirmation"]); const state = validateV3State(stateInput); metadataRequired(metadata); const payload = { candidateKey: input.candidateKey, explicitConfirmation: input.explicitConfirmation === true }; const replay = priorReceipt(state, metadata.operationId, "select_discrete_geometry", payload); if (replay) return replay; assertFence(state, metadata); if (!payload.explicitConfirmation) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Confirm the exact discrete geometry."); const next = clone(state); next.choices.selectedCandidateKey = payload.candidateKey; next.review = clone(deriveReview(next.source, next.choices, next.identity)); if (!next.review.executionSteps?.length) fail("CANDIDATE_INVALID", "The selected geometry cannot produce a closed execution stream."); next.lifecycle = "reviewing_neckline_opening_plan"; return finalize(next, "select_discrete_geometry", payload, metadata); }
  function completePlan(stateInput, input = {}, metadata = {}) { exactKeys(input, ["explicitFinalConfirmation", "reviewFingerprint"]); const state = validateV3State(stateInput); metadataRequired(metadata); const payload = { explicitFinalConfirmation: input.explicitFinalConfirmation === true, reviewFingerprint: input.reviewFingerprint }; const replay = priorReceipt(state, metadata.operationId, "complete_neckline_opening_plan_v3", payload); if (replay) return replay; assertFence(state, metadata, true); if (state.lifecycle === "completed") fail("COMPLETED_PLAN_IMMUTABLE", "Completed Stage 91 V3 is immutable."); if (state.lifecycle !== "reviewing_neckline_opening_plan" || !state.review?.executionSteps?.length) fail("CURRENT_REVIEW_REQUIRED", "Review one exact V3 execution stream first."); if (!payload.explicitFinalConfirmation) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Confirm the exact V3 plan explicitly."); if (payload.reviewFingerprint !== state.review.reviewFingerprint) fail("REVIEW_STALE", "The reviewed V3 plan changed."); const next = clone(state); next.completedPlan = buildCompletedPlan(state, metadata); next.lifecycle = "completed"; next.timestamps.completedAt = metadata.at; return finalize(next, "complete_neckline_opening_plan_v3", payload, metadata); }
  function startReworkEpoch(stateInput, input = {}, metadata = {}) { const state = validateState(stateInput); metadataRequired(metadata); exactKeys(input, ["source", "reason", "downstreamExecutionStarted"]); const reason = String(input.reason || "").trim(); const payload = { sourceFingerprint: input.source?.fingerprint, reason }; if (state.contractSchemaId === CONTRACT_SCHEMA_ID) { const replay = priorReceipt(state, metadata.operationId, "start_plan_rework_epoch_v3", payload); if (replay) return replay; } if (!reason) fail("REWORK_REASON_REQUIRED", "Give an explicit reason for plan rework."); if (input.downstreamExecutionStarted === true) fail("PHYSICAL_RESTORATION_REQUIRED", "A durable Stage 92 start requires physical reconciliation before replanning."); if (state.lifecycle !== "completed") fail("COMPLETED_PLAN_REQUIRED", "Only a completed plan can start rework."); const next = createState({ projectId: state.projectId, calculationId: state.calculationId, source: input.source, epoch: state.epoch + 1, predecessorIdentity: state.identity, supersedesPlanIdentity: state.completedPlan.identity }, metadata); appendReceipt(next, "start_plan_rework_epoch_v3", payload, metadata); return withFingerprint(next); }

  function validateCompleted(plan, state) {
    if (!record(plan) || plan.schemaId !== RESULT_SCHEMA_ID || plan.resultVersion !== RESULT_VERSION || plan.contractVersion !== CONTRACT_VERSION || plan.kind !== KIND || plan.planningIdentity !== state.identity || plan.sourceFingerprint !== state.source.fingerprint || plan.outputBoundary !== OUTPUT_BOUNDARY || plan.executionCapability?.capabilityId !== EXECUTION_CAPABILITY_ID || plan.executionCapability?.globallyOrdered !== true || plan.executionCapability?.intermediateStateAfterEveryStep !== true || plan.fabricCutApplied !== false || plan.explicitFinalConfirmation !== true || containsCut(plan.executionSteps)) fail("COMPLETED_PLAN_INVALID", "The immutable Stage 91 V3 result is invalid.");
    validateInstructionChain(plan.executionInstructions, plan.finalExecutionState);
    if (canonicalize(plan.executionSteps) !== canonicalize(plan.executionInstructions.flatMap((item) => item.executionSteps))) fail("COMPLETED_PLAN_INVALID", "The canonical executionSteps stream differs from instruction steps.");
    requireUuid(plan.completionOperationId); requireFingerprint(plan.fingerprint); const expected = buildCompletedPlan({ ...state, completedPlan: null }, { operationId: plan.completionOperationId, at: plan.timestamps.completedAt }); if (canonicalize(plan) !== canonicalize(expected)) fail("COMPLETED_PLAN_INVALID", "The immutable Stage 91 V3 result is not recomputable."); return deepFreeze(plan);
  }
  function validateV3State(input) {
    const state = clone(input); exactKeys(state, ["kind", "contractSchemaId", "contractVersion", "projectId", "calculationId", "identity", "epoch", "predecessorIdentity", "supersedesPlanIdentity", "lifecycle", "revision", "source", "choices", "review", "completedPlan", "operationReceipts", "timestamps", "fingerprint"]);
    if (state.kind !== KIND || state.contractSchemaId !== CONTRACT_SCHEMA_ID || state.contractVersion !== CONTRACT_VERSION || !LIFECYCLES.includes(state.lifecycle)) fail("STATE_INVALID", "The Stage 91 V3 identity, contract, or lifecycle is invalid.");
    requireUuid(state.projectId, "PROJECT_ID_INVALID"); requireUuid(state.calculationId, "CALCULATION_ID_INVALID"); positiveInteger(state.epoch, "EPOCH_INVALID"); positiveInteger(state.revision, "REVISION_INVALID"); const source = validateSource(state.source); if (source.projectId !== state.projectId || source.calculationId !== state.calculationId) fail("STATE_INVALID", "State scope differs from source scope."); validateChoices(source, state.choices);
    if (state.review !== null) { const expected = deriveReview(source, state.choices, state.identity); if (canonicalize(state.review) !== canonicalize(expected)) fail("REVIEW_INVALID", "The Stage 91 V3 review is stale or corrupted."); }
    if (!Array.isArray(state.operationReceipts) || !state.operationReceipts.length) fail("RECEIPT_INVALID", "Stage 91 V3 requires durable operation receipts."); state.operationReceipts.forEach(validateReceipt); exactKeys(state.timestamps, ["createdAt", "updatedAt", "completedAt"]); requireTimestamp(state.timestamps.createdAt); requireTimestamp(state.timestamps.updatedAt); if (state.timestamps.completedAt !== null) requireTimestamp(state.timestamps.completedAt);
    if (state.lifecycle === "collecting_opening_choices" && (state.review !== null || state.completedPlan !== null || state.timestamps.completedAt !== null) || state.lifecycle === "reviewing_neckline_opening_plan" && (!state.review || state.completedPlan !== null || state.timestamps.completedAt !== null) || state.lifecycle === "completed" && (!state.review || !state.completedPlan || !state.timestamps.completedAt)) fail("STATE_INVALID", "Stage 91 V3 lifecycle data is inconsistent.");
    if (state.completedPlan) validateCompleted(state.completedPlan, state); requireFingerprint(state.fingerprint); const comparable = clone(state); delete comparable.fingerprint; if (state.fingerprint !== fingerprint(comparable)) fail("STATE_FINGERPRINT_INVALID", "The Stage 91 V3 state fingerprint is invalid."); return deepFreeze(state);
  }
  function validateState(input) {
    if (input?.contractSchemaId === V1.CONTRACT_SCHEMA_ID && input?.contractVersion === V1.CONTRACT_VERSION) { try { return V1.validateState(input); } catch (error) { fail(error.code || "V1_STATE_INVALID", error.userMessage || error.message); } }
    if (input?.contractSchemaId === V2.CONTRACT_SCHEMA_ID && input?.contractVersion === V2.CONTRACT_VERSION) { try { return V2.validateV2State(input); } catch (error) { fail(error.code || "V2_STATE_INVALID", error.userMessage || error.message); } }
    return validateV3State(input);
  }

  function stage92Eligibility(input, options = {}) {
    let state; try { state = validateState(input); } catch (error) { return deepFreeze({ eligible: false, code: error.code || "STAGE91_V3_INVALID", message: error.userMessage || error.message, successor: null }); }
    if (state.contractSchemaId === V1.CONTRACT_SCHEMA_ID) return deepFreeze({ eligible: false, code: "STAGE91_EXECUTION_CONTRACT_V3_REQUIRED", message: "Stage 91 V1 is historical and has no executable physical action stream.", successor: null });
    if (state.contractSchemaId === V2.CONTRACT_SCHEMA_ID) return deepFreeze({ eligible: false, code: "STAGE91_V2_GLOBAL_EXECUTION_ORDER_REQUIRED", message: "Stage 91 V2 is historical and lacks one unified physical action order. Create and explicitly confirm V3.", successor: null });
    if (state.lifecycle !== "completed") return deepFreeze({ eligible: false, code: "STAGE91_V3_COMPLETION_REQUIRED", message: "Complete and validate Stage 91 V3 before physical execution.", successor: null });
    if (options.authoritativeSourceFingerprint !== undefined && options.authoritativeSourceFingerprint !== state.source.fingerprint || options.currentEpoch !== undefined && options.currentEpoch !== state.epoch || options.stale === true || options.authoritative === false || options.current === false) return deepFreeze({ eligible: false, code: "STAGE91_V3_STALE_OR_NON_AUTHORITATIVE", message: "The completed Stage 91 V3 plan is stale or non-authoritative.", successor: null });
    try { validateCompleted(state.completedPlan, state); } catch (error) { return deepFreeze({ eligible: false, code: error.code || "STAGE91_V3_INVALID", message: error.userMessage || error.message, successor: null }); }
    const closure = state.completedPlan.executionClosureProof;
    if (!closure.complete || !closure.contiguousGlobalStepOrdinals || !closure.stateContinuityClosed || !closure.noHiddenPhysicalActions || !closure.terminalStateMatches) return deepFreeze({ eligible: false, code: "STAGE91_V3_EXECUTION_STREAM_NOT_CLOSED", message: "The Stage 91 V3 global execution stream is not fully closed.", successor: null });
    return deepFreeze({ eligible: true, code: "STAGE91_V3_EXECUTABLE", planIdentity: state.completedPlan.identity, planFingerprint: state.completedPlan.fingerprint, instructionCount: state.completedPlan.executionInstructions.length, stepCount: state.completedPlan.executionSteps.length, executionCapabilityId: EXECUTION_CAPABILITY_ID, directExecutor: NEXT_BOUNDARY, successorAfterExecution: SUCCESSOR_AFTER_EXECUTION });
  }

  function safeContext(source) { return { terminalSectionCounts: clone(source.terminal.sectionCounts), activeTotal: source.terminal.activeTotal, heldUnderarmTotal: source.terminal.heldUnderarmTotal, totalPhysicalLive: source.terminal.totalPhysicalLive, lineWidth: source.terminal.lineWidth, necklineDepthReferenceCm: source.references.necklineDepthReferenceCm, bodyNeckReferenceCm: source.references.bodyNeckReferenceCm, stitchesPerCm: source.references.stitchesPerCmExact, rowsPerCm: source.references.rowsPerCmExact, openingFeatureAuthoritative: source.featureAuthority.explicitOpeningFeature, eligibleMethods: ["split_from_current_live_edge", "integrated_live_placket"], fabricCutSupport: "unsupported_requires_dedicated_contract", contractVersion: 3 };
  }
  function safeStep(step) { return { ordinal: step.ordinal, kind: step.actionKind, instruction: step.physicalSemantics, from: step.startBoundary.boundaryIdentity, to: step.endBoundary.boundaryIdentity, face: step.expectedFace, direction: step.direction, count: step.exactCount, yarnAfter: { active: step.afterState.yarn.activeSourceIdentity !== null, source: step.afterState.yarn.activeSourceIdentity, location: step.afterState.yarn.workingLocation.boundaryIdentity, continuity: step.afterState.yarn.sources[0]?.continuity }, topologyAfter: step.afterState.fabric.liveTopology, turn: step.actionKind === "turn", activeAfter: step.afterState.stitchLedger.workingActive, heldAfter: step.afterState.stitchLedger.necklineHeld }; }
  function safeReview(review) { if (!review) return null; return { requiresCandidateSelection: review.requiresCandidateSelection, candidates: review.candidates.map((item) => ({ candidateKey: item.key, centerStitches: item.centerStitches, depthRows: item.depthRows, openingLengthRows: item.openingLengthRows, achievedWidthCm: item.achievedWidthCm, achievedDepthCm: item.achievedDepthCm, openingAchievedCm: item.openingAchievedCm, finalLeftFront: item.sideFinal, finalRightFront: item.sideFinal, selected: review.selectedCandidate?.key === item.key })), selected: review.selectedCandidate ? { centerStitches: review.selectedCandidate.centerStitches, depthRows: review.selectedCandidate.depthRows, openingLengthRows: review.selectedCandidate.openingLengthRows, executionSteps: review.executionSteps.map(safeStep), executionInstructions: review.executionInstructions.map((item) => ({ ordinal: item.instructionOrdinal, steps: item.executionSteps.map(safeStep), topologyChange: `${item.beforeState.fabric.liveTopology} -> ${item.afterState.fabric.liveTopology}`, terminal: item.terminalSemantics })), scheduleRows: review.executionInstructions.map((item) => ({ row: item.fabricRowOrRoundOrdinal, orientation: item.beforeState.traversal.face, topology: item.afterState.fabric.liveTopology, start: item.beforeState.traversal.currentBoundaryIdentity, end: item.afterState.traversal.currentBoundaryIdentity, bindOff: item.executionSteps.filter((step) => step.actionKind === "bind_off").reduce((sum, step) => sum + step.exactCount, 0), held: item.afterState.stitchLedger.necklineHeld, decreases: item.executionSteps.filter((step) => step.actionKind === "decrease").reduce((sum, step) => sum + step.exactCount, 0), leftFront: item.afterState.stitchLedger.sectionCounts.left_front, rightFront: item.afterState.stitchLedger.sectionCounts.right_front, active: item.afterState.stitchLedger.workingActive, totalLive: item.afterState.stitchLedger.totalLive })) } : null };
  }
  function legacyProjection(state, history) {
    const version = state.contractVersion; const eligibility = stage92Eligibility(state); const old = version === 1 ? V1.projectView(state, history) : V2.projectView(state, history);
    return deepFreeze({ ...clone(old), lifecycle: `v${version}_execution_ineligible`, contractVersion: version, executionEligibility: eligibility, allowedActions: ["startV3Replan"], successor: { available: false, nextBoundary: NEXT_BOUNDARY, routePath: null }, diagnostic: { code: eligibility.code, message: version === 2 ? "Исторический план V2 доступен только для чтения: в нём нет единого физического порядка действий. Создайте и подтвердите V3." : "Исторический план V1 доступен только для чтения. Создайте и подтвердите V3." } });
  }
  function readyView(sourceInput, history = {}) { const source = validateSource(sourceInput); const choices = emptyChoices(source); return deepFreeze({ available: true, blocked: false, lifecycle: "ready", contractVersion: 3, context: safeContext(source), choices, missingChoices: choicesRequired(source, choices), review: null, completed: null, allowedActions: ["startPlanning"], history: { count: history.historicalCount || 0, staleCount: history.staleCount || 0 }, successor: { available: false, nextBoundary: NEXT_BOUNDARY, routePath: null } }); }
  function projectView(stateInput, history = {}) {
    const state = validateState(stateInput); if (state.contractSchemaId !== CONTRACT_SCHEMA_ID) return legacyProjection(state, history);
    const eligibility = stage92Eligibility(state); const review = safeReview(state.review);
    return deepFreeze({ available: true, blocked: false, lifecycle: state.lifecycle, contractVersion: 3, context: safeContext(state.source), choices: clone(state.choices), missingChoices: choicesRequired(state.source, state.choices), review, completed: state.completedPlan ? { schemaId: state.completedPlan.schemaId, targetGeometry: clone(state.completedPlan.targetGeometry), openingStrategy: clone(state.completedPlan.openingStrategy), executionSteps: review.selected.executionSteps, executionInstructions: review.selected.executionInstructions, finalTopology: clone(state.completedPlan.finalExecutionState.fabric), finalExecutionState: clone(state.completedPlan.finalExecutionState), futurePlacketBoundary: clone(state.completedPlan.futurePlacketBoundary), futureCollarPickupBoundary: clone(state.completedPlan.futureCollarPickupBoundary), conservationProof: clone(state.completedPlan.conservationProof), executionClosureProof: clone(state.completedPlan.executionClosureProof), outputBoundary: state.completedPlan.outputBoundary } : null, executionEligibility: eligibility, allowedActions: state.lifecycle === "completed" ? ["startPlanRework"] : state.review?.selectedCandidate ? ["completePlan", "resolveChoice"] : state.review?.requiresCandidateSelection ? ["selectCandidate", "resolveChoice"] : choicesRequired(state.source, state.choices).length ? ["resolveChoice"] : ["reviewPlan", "resolveChoice"], history: { count: history.historicalCount || 1, staleCount: history.staleCount || 0 }, successor: { available: eligibility.eligible, contractEligible: eligibility.eligible, presentationAvailable: true, nextBoundary: NEXT_BOUNDARY, routePath: eligibility.eligible ? "/project-neckline-opening-execution" : null, afterExecution: SUCCESSOR_AFTER_EXECUTION } });
  }

  const api = Object.freeze({ DOMAIN_IDENTITY, KIND, PROGRESS_KIND, CONTRACT_SCHEMA_ID, CONTRACT_VERSION, RESULT_SCHEMA_ID, RESULT_VERSION, INSTRUCTION_SCHEMA_ID, EXECUTION_STEP_SCHEMA_ID, EXECUTION_STATE_SCHEMA_ID, TOPOLOGY_SCHEMA_ID, YARN_STATE_SCHEMA_ID, EXECUTION_CAPABILITY_ID, OUTPUT_BOUNDARY, NEXT_BOUNDARY, SUCCESSOR_AFTER_EXECUTION, ROUTE_PATH, SECTION_ORDER, INTERFACE_ORDER, SOURCE_KINDS, LIFECYCLES, STEP_KINDS, V1, V2, NecklineOpeningPlanningError, canonicalize, fingerprint, validateSource, validateChoices, choicesRequired, deriveReview, buildExecutionInstructions, buildCompletedPlan, validateTopology, validateYarnState, validateExecutionState, validateExecutionStep, validateInstruction, validateInstructionChain, startPlanning, resolveChoice, reviewPlan, selectCandidate, completePlan, startReworkEpoch, validateV3State, validateV2State: V2.validateV2State, validateState, validateAnyState: validateState, validateCompleted, stage92Eligibility, readyView, projectView });
  globalObject.YarnAIProjectNecklineOpeningPlanning = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
