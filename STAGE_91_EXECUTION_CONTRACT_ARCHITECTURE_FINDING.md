# Stage 91 execution-contract architecture finding

This document is an architecture finding only. It does not change the production
Stage 91 contract, implement Stage 92, add a route or persistence store, rewrite a
test, or authorize physical work. Existing Stage 91 V1 records and the dirty worktree
remain untouched.

## 1. Verdict

**STAGE 92 REMAINS BLOCKED UNTIL A STAGE 91 V2 EXECUTION CONTRACT EXISTS.**

The minimum safe repair is a V2 contract/result for the existing
`PROJECT_NECKLINE_OPENING_PLANNING` stage. A new planning stage between Stages 91 and
92 is not justified: Stage 91 already owns the geometry, method, topology change and
schedule, so moving execution semantics to another planner would split one intent
authority across two stages.

The selected boundary is:

```text
Stage 90 immutable physical terminal result
  -> Stage 91 V2 immutable, execution-complete neckline/opening plan
  -> Stage 92 physical execution of accepted reversible instructions
  -> PROJECT_NECKLINE_EDGE_FINISHING_PLANNING
```

For the first safe V2, fabric cutting is explicitly unsupported. A steek/fabric-cut
path requires a separate irreversible execution contract and stage. A generic
`complete row` command can never perform or imply a cut.

Existing V1 plans remain readable historical planning results, but are not legal Stage
92 inputs and cannot be upgraded by best effort. They must be replanned into a new V2
epoch after confirming that no physical Stage 92 work has begun.

## 2. The gap found in production

The implemented Stage 91 V1 result is recomputable and immutable, but its
`scheduleRows[]` is a geometry/count ledger rather than a complete physical instruction
stream. In production `buildSchedule`:

- entry 1 has `orientation = "transition"`, not an immutable RS/WS face;
- `workingYarnAction = "reach_center_and_create_structural_boundary"` does not say
  where the yarn is attached, whether it is broken, which source is active, where it is
  rejoined, or which stitches are traversed before and after the center action;
- later entries say `turn_and_traverse_opposite_direction` but do not store an exact
  direction, facing before/after the turn, next start edge, or terminal yarn location;
- a single entry subtracts mirrored left and right decreases together even though a
  physical flat pass encounters those edges in a strict order;
- `raglanInterfaceStates` is always `active_crossed`, with no per-pass preservation
  count, ownership range or legal retirement proof;
- cut methods keep every emitted row cyclic and have no reinforcement, readiness,
  authorization, cut-line or post-cut instruction;
- completed state contains a caller-controlled `downstreamExecutionStarted` boolean,
  although only durable Stage 92 start receipts can prove that physical execution may
  have begun.

Those facts are not safely recoverable from geometry. In particular, a Stage 92
executor cannot decide whether to break the yarn at the old BOR, join a new source at a
center edge, work from edge A to edge B, turn, or leave another segment held. Each choice
changes the physical state and the legal next instruction.

The architecture rule is therefore:

> Execution may validate and record a planned instruction; it may not reconstruct
> planning intent from geometry, parity, row number, screen position or knitting
> convention.

## 3. Selected architecture

### 3.1 Why Stage 91 V2 is selected

The same planner must jointly own:

- the center disposition and opening method;
- the circular-to-flat transition;
- the anatomical opening-edge identities;
- RS/WS, direction, turn, yarn break/rejoin and active-segment sequence;
- exact per-instruction conservation;
- the final topology against which Stage 92 completes.

All of these are consequences of the selected neckline/opening intent. A separate
intermediate planner would either duplicate the Stage 91 schedule or be allowed to
change it. Both create two authorities for the same physical action.

### 3.2 Version identities

The proposed V2 identity is:

```text
kind:                         PROJECT_NECKLINE_OPENING_PLANNING
contract schema:              NECKLINE_OPENING_PLANNING_CONTRACT_V2
contract version:             2
result schema:                NECKLINE_OPENING_PLAN_V2
result version:               2
execution instruction schema: NECKLINE_OPENING_EXECUTION_INSTRUCTION_V1
execution capability:         reversible_structural_execution_v1
output boundary:              neckline_opening_plan_completed
direct executor:              PROJECT_NECKLINE_OPENING_EXECUTION
```

The kind, route and broad output boundary remain stable. Eligibility for Stage 92 is
not inferred from that boundary alone; it requires the exact V2 result schema,
contract/result versions, instruction schema, method capability and closure proof.

### 3.3 Initial method capability

```text
supported:
  - live_center_split
  - held_center_split
  - bound_center_split
  - integrated_live_edge preparation when its exact stitches are in the ledger

unsupported in V2:
  - reserved_steek_cut
  - authorized_reinforced_cut
  - any instruction whose irreversible material action is fabric_cut
```

This is a deliberate safety boundary, not a claim that steeking is invalid. It allows
Stage 92 to be implemented for the current non-cut scope without pretending that a
cut-safe contract exists.

## 4. Ownership matrix

| Fact | Authoritative owner | Stage 92 use |
|---|---|---|
| Stage 90 terminal counts, four held underarm groups, markers and historical BOR | Stage 90 physical result | Confirm the starting physical baseline; never rewrite it. |
| Required execution-start face and yarn baseline | Stage 91 V2 precondition; actual match confirmed by Stage 92 | Block start if the observable baseline does not match. |
| RS/WS for every instruction | Stage 91 V2 | Display, validate and confirm; never derive from ordinal. |
| Working direction and ordered traversal | Stage 91 V2 | Execute the embedded path and anchors exactly. |
| Turn/no-turn/stop | Stage 91 V2 | Confirm terminal state and next instruction. |
| Yarn source identity and required attachment state | Stage 91 V2 plan | Compare to physical observation. |
| Yarn break, join/rejoin, location and new-source requirement | Stage 91 V2 | Execute only the named action; record the receipt. |
| Actual yarn action and resulting terminal location | Stage 92 | Append physical evidence; cannot change expected intent. |
| Active fabric segment and held/inactive segments | Stage 91 V2 topology snapshots | Confirm the before/after transition. |
| Circular/flat mode and active/historical BOR | Stage 91 V2 | Retire active BOR only on the planned confirmed transition. |
| Working-boundary creation, deletion or split | Stage 91 V2 | Materialize exactly once and record realized identities. |
| Anatomical opening-edge identities | Stage 91 V2; realized-edge observations by Stage 92 | Preserve stable identity independent of screen position. |
| Steek bridge identity and planned bridge geometry | Future cut-safety planner | Not accepted by initial V2/Stage 92. |
| Cut eligibility | Future versioned cut-safety plan based on evidence | Never infer from yarn name, garment label or geometry. |
| Reinforcement/readiness observation | Future cut execution stage | Append proof before authorization. |
| Irreversible fabric-cut authorization and execution | Separate cut execution contract/stage | Generic Stage 92 row commands have no such capability. |
| Realized opening edges/corners/counts | Stage 92 immutable physical result | Input to edge-finishing planning. |
| Pickup rate, bands, placket finish and collar | Edge-finishing planning/execution | Not owned by Stages 91 or 92. |

## 5. Exact proposed Stage 91 V2 result

The conceptual immutable result is:

```text
NECKLINE_OPENING_PLAN_V2 {
  schemaId, resultVersion = 2, contractVersion = 2
  kind = PROJECT_NECKLINE_OPENING_PLANNING
  identity, planningIdentity, epoch
  predecessorIdentity, supersedesPlanIdentity
  sourceFingerprint, sourceBindings[Stage77..Stage90]
  stage90ResultIdentity, stage90ResultFingerprint
  outputBoundary = neckline_opening_plan_completed

  featureDecision
  referenceGeometry
  targetGeometry
  openingStrategy

  executionCapability {
    capabilityId = reversible_structural_execution_v1
    instructionSchemaId = NECKLINE_OPENING_EXECUTION_INSTRUCTION_V1
    fabricCut = unsupported_requires_dedicated_contract
    yarnBreak = supported_only_when_explicitly_planned
    multipleYarnSources = supported_only_when_explicitly_planned
  }

  executionEntryPrecondition
  executionInstructions[]
  finalExecutionState
  executionClosureProof

  futurePlacketBoundary
  futureCollarPickupBoundary
  conservationProof, symmetryProof, parityProof, feasibilityProof

  openingOrNecklineWorkApplied = false
  placketOrCollarFinishingApplied = false
  fabricCutApplied = false
  heldUnderarmsClosed = false
  explicitFinalConfirmation = true
  completionOperationId, timestamps, fingerprint
}
```

`scheduleRows[]` from V1 does not remain the Stage 92 authority. V2 may retain a
derived presentation ledger internally, but the only executable result field is
`executionInstructions[]`. This avoids two stored schedules with competing truth.

### 5.1 Execution-entry precondition

Stage 90 V1 did not record a full yarn/facing terminal state. Stage 91 V2 therefore
records a conditional, versioned precondition rather than claiming an unobserved fact:

```text
executionEntryPrecondition {
  sourceStage90ResultIdentity
  topologyState
  requiredPhysicalFacing
  requiredNeedleOrientation
  requiredYarnState
  requiredActiveBor = raglan_marker_4
  noOpeningEdgesExist = true
  noNecklineActionApplied = true
  requiresStage92BaselineConfirmation = true
  fingerprint
}
```

Planning owns the required condition; Stage 92 owns the physical confirmation. A
mismatch creates a discrepancy/recovery route and never causes the planner or executor
to silently normalize the fabric.

## 6. Execution-instruction contract

Every item is versioned, immutable and self-describing. References to shared source
identities are allowed, but Stage 92 must not fetch missing semantics from geometry or a
neighboring instruction.

```text
NECKLINE_OPENING_EXECUTION_INSTRUCTION_V1 {
  schemaId
  instructionIdentity
  executionOrdinal                  // contiguous, 1-based
  fabricRowOrRoundOrdinal           // exact integer or null for setup-only action
  instructionKind                   // setup | transition_pass | flat_pass | stop
  workMode                          // circular | circular_to_flat_transition | flat

  faceBefore                        // RS | WS
  faceWorked                        // RS | WS
  direction {
    directionId
    fromBoundaryIdentity
    toBoundaryIdentity
    orderedSegmentIdentities[]
    traversalRanges[]
  }

  startingBoundary
  endingBoundary
  workedRanges[]                    // stable range/section identities and exact counts
  skippedRanges[]                   // exact held/inactive ranges, normally unchanged
  heldRanges[]

  orderedActions[] {
    actionIndex
    actionKind                      // work | hold | bind_off | decrease | turn ...
    anchorBefore, anchorAfter
    affectedRangeIdentity
    exactCount
    side
    setupStitchPolicy?              // required for physically exact bind-off semantics
    reversibilityClass
  }

  turnInstruction {
    kind                            // turn | no_turn | stop
    atBoundaryIdentity
    faceAfter
    nextDirectionId
  }

  yarnStateBefore
  yarnActions[]
  yarnStateAfter

  topologyBefore
  topologyAfter
  stitchLedgerBefore
  stitchLedgerAfter
  openingEdgesAffected[]
  markerAndInterfaceDisposition[]

  irreversibleAction {
    present
    class                           // none | yarn_continuity_break; never fabric_cut in V2
    requiredAuthorizationKind
    requiredReceiptKind
  }

  completionObservationsRequired[]
  nextExpectedInstruction {
    executionOrdinal | null
    faceWorked | null
    directionId | null
    startBoundaryIdentity | null
  }

  previousInstructionFingerprint | null
  fingerprint
}
```

### 6.1 Why each field exists

- Ordinals bind durable cursor/replay to one plan entry; they do not supply face or
  direction semantics.
- `workMode`, topology snapshots and boundary identities prevent a first flat pass from
  being mistaken for a circular round.
- `faceBefore`, `faceWorked`, direction and turn state prevent RS/WS reconstruction by
  parity.
- Worked/skipped/held ranges make active and inactive fabric explicit and validate an
  optional exact partial cursor.
- Ordered actions distinguish beginning-of-pass and ending-edge actions and make two
  symmetric removals physically ordered.
- Yarn before/actions/after eliminate the assumption that the working yarn “obviously
  stays here.”
- Embedded before/after topology and stitch ledgers make the item executable without a
  hidden Stage 92 planner.
- The irreversible descriptor makes yarn severing explicit and structurally prevents
  fabric cutting in this version.
- The predecessor fingerprint and next expectation close the instruction chain and
  detect reordering, omission and stale replay.

## 7. Fabric-topology model

The topology is a versioned graph-like snapshot, not a `cyclic` boolean:

```text
FABRIC_TOPOLOGY_STATE_V1 {
  identity, version = 1
  liveTopology                     // cyclic | linear | segmented
  traversalMode                    // circular | flat
  activeSegmentIdentity

  segments[] {
    segmentIdentity
    state                          // active | held | inactive | completed
    orderedSectionRanges[]         // identities, orientation and exact stitch counts
    startBoundaryIdentity | null
    endBoundaryIdentity | null
  }

  heldGroups[] {
    identity
    ownerSegmentIdentity
    sourceSectionIdentity
    exactCount
    remainsLive
  }

  boundaries[] {
    boundaryIdentity
    kind                           // bor | opening_edge | row_edge | held_boundary
    anatomicalRole
    adjacentSegmentIdentity
    activeForTraversal
    historical
  }

  activeBorIdentity | null
  historicalBorIdentities[]
  openingEdgeIdentities[]
  markerAndInterfaceDisposition[]
  nextLegalExecutionOrdinal
  fingerprint
}
```

For the current live-split scope:

```text
before transition:
  one active cyclic segment
  active BOR = raglan_marker_4
  no opening edges
  four unchanged held underarm groups

after transition:
  one active linear segment from one center-front edge to the other
  active BOR = null
  old BOR retained as historical anchor only
  two stable anatomical opening edges
  center range either held or removed exactly as planned
  four unchanged held underarm groups
```

A left/right label is derived and frozen by Stage 91 from the authoritative wearer
orientation. It is never inferred from DOM position. If wearer orientation is not
provable, neutral `opening_edge_a/b` identities are used until a versioned orientation
decision exists.

### 7.1 Topology invariants

1. Exactly one active segment exists in the selected V2 method.
2. Every live stitch belongs to exactly one active or held range.
3. No range overlaps another range.
4. A cyclic segment has an active BOR and no active row endpoints.
5. A linear segment has two distinct active endpoints and no active BOR.
6. The old BOR may survive only as historical provenance after the transition.
7. Opening-edge identities are created once, remain stable and are never swapped on a
   turn.
8. Underarm groups remain live, held, separate and unclosed in every snapshot.
9. The `topologyAfter` fingerprint of instruction N equals `topologyBefore` of N+1.
10. `nextLegalExecutionOrdinal` is contiguous and agrees with the instruction chain.

## 8. Yarn-state model

One source is enough for ordinary flat passes after setup. The model nevertheless
supports an explicit secondary source because a safe transition may choose to preserve
the yarn attached at the old BOR and join another source at the new edge. Multiple
sources never appear implicitly.

```text
YARN_STATE_V1 {
  activeSourceIdentity | null
  sources[] {
    yarnSourceIdentity
    materialBindingIdentity
    state                         // attached | detached | exhausted
    active
    attachedSegmentIdentity | null
    attachmentBoundaryIdentity | null
    attachmentAnchor | null
    continuity                   // continuous | broken_with_tail | newly_joined
    freeTailIdentity | null
  }
  rejoinRequirement {
    required
    sourceIdentity | null
    boundaryIdentity | null
    anchor | null
    requiresNewSource
  }
  fingerprint
}
```

Allowed V2 yarn actions are versioned values such as:

```text
keep_active_source
break_active_source_at_anchor
detach_without_break_when_physically_supported
join_existing_source_at_boundary
join_new_source_at_boundary
activate_source
deactivate_source
turn_with_source_attached
stop_with_source_at_boundary
```

Every action states the source, from/to anchors, expected tail/continuity result and
whether a new source is required. An illegal rejoin includes rejoining an attached
active source at another boundary without an intervening supported action, attaching
to a held/inactive segment, or using an unknown source identity.

Breaking yarn is materially non-restorable even though the knitted fabric may still be
recoverable. It is marked `yarn_continuity_break`, gets an explicit action receipt and
tightens rework rules. It is not conflated with the much higher-risk `fabric_cut`.

## 9. RS/WS and direction semantics

Stage 91 V2 computes and freezes all face/direction facts.

- `faceBefore` is the physical face presented immediately before the instruction.
- `faceWorked` is the face from which the stitches in this instruction are worked.
- `turnInstruction.faceAfter` is the face presented after the planned terminal turn or
  stop.
- Direction is an identity over stable boundaries and an ordered segment/range path;
  it is not merely `left` or `right` on screen.
- A turn changes the face and swaps which anatomical edge is the next start; it never
  renames the edges.
- `no_turn` preserves the current face unless another explicit action changes physical
  orientation.
- A circular round normally works from the RS, but Stage 92 still consumes the stored
  value; it does not recreate that rule.

The validator rejects:

- a flat instruction whose start/end boundaries are the same;
- two consecutive flat passes with identical direction when a turn was required;
- a `turn` whose `faceAfter` equals `faceWorked`;
- a direction whose ordered ranges do not form a continuous path in
  `topologyBefore`;
- an RS/WS label inconsistent with the planned start boundary, segment orientation and
  previous terminal state;
- any instruction whose next expectation differs from the next instruction's stored
  face, direction or starting boundary.

## 10. Explicit circular-to-flat transition

The transition is a planned instruction, not a side effect of row 1 and not a boolean
on the final topology.

### 10.1 Preconditions

- the current immutable Stage 90 V1 result and exact counts still match;
- one cyclic active segment exists at historical marker 4 BOR;
- four held underarm groups are unchanged;
- no neckline/opening action or physical Stage 92 receipt exists;
- the Stage 92 baseline confirmation matches the V2 entry precondition, including
  observable face, needle arrangement and yarn attachment;
- the center range and two future edge anchors are exact and non-overlapping;
- the selected yarn transition variant is explicit.

### 10.2 Physical action

The planner must select and encode one exact ordered variant. For example, a
break-and-rejoin variant contains distinct actions to:

1. stop at the old BOR without working an extra round;
2. break/deactivate the old attachment at the exact anchor;
3. attach the named source at the planned center-front setup anchor;
4. hold or bind the exact center range using an explicit setup-stitch policy;
5. create the two named opening boundaries;
6. work the exact surviving linear range from the named start edge, through the ordered
   front/sleeve/back/sleeve/front sections, to the named end edge;
7. stop or turn at that edge with the expected face and yarn terminal location.

A preserve-primary variant instead leaves the existing source attached/inactive and
joins a specifically identified second source. The two variants are not interchangeable
and do not share a fingerprint.

### 10.3 After-state and confirmation

The confirmed after-state must prove:

```text
liveTopology = linear
activeBorIdentity = null
historicalBorIdentities contains raglan_marker_4
two planned opening edges exist with stable anatomical identities
active segment starts/ends at those edges
center range disposition and all counts equal the instruction ledger
active yarn is at the planned ending edge/anchor
faceAfter and next direction equal instruction 2
```

Only full transition confirmation changes Stage 92 authoritative topology. A start
receipt or partial cursor means the transition may have begun and blocks replan/replay;
it does not declare the BOR retired or the new edges complete.

## 11. Conservation and closure invariants

For every instruction:

```text
workingActiveBefore + castOn + pickedUp + reactivatedHeld
  = workingActiveAfter + newlyHeld + boundOff + decreased

necklineHeldAfter
  = necklineHeldBefore + newlyHeld - reactivatedHeld

totalLiveBefore + castOn + pickedUp
  = totalLiveAfter + boundOff + decreased

totalLiveAfter
  = workingActiveAfter + necklineHeldAfter + underarmHeldAfter

underarmHeldAfter = underarmHeldBefore
```

For initial V2, `castOn`, `pickedUp` and `reactivatedHeld` are zero unless a supported
method-specific instruction explicitly carries them. An integrated structural edge is
already represented by exact working ranges; it is not a hidden finishing pickup.

Additional closure invariants:

1. Instruction ordinals are contiguous and unique.
2. Every instruction fingerprint is recomputable and predecessor-linked.
3. All topology, stitch and yarn after-states byte-match the next before-states.
4. Ordered worked ranges exactly cover the planned active traversal once.
5. Skipped/held ranges are not present in worked ranges.
6. Every action count equals the delta in the corresponding section/range ledger.
7. Marker/interface owned stitches remain with their upstream owner until an explicit
   disposition action.
8. Final state equals the result's `finalExecutionState` exactly.
9. Aggregate conservation from Stage 90 to the final state holds with no tolerance,
   clamp or redistribution.
10. `fabricCutApplied`, finishing/pickup and held-underarm closure remain false.

## 12. Steek and fabric-cut safety architecture

Fabric cutting is not a row action and is not made safe merely by adding an
`irreversible = true` field. The initial Stage 91 V2 advertises
`fabricCut = unsupported_requires_dedicated_contract`; Stage 92 rejects any cut method
before creating an execution epoch.

A future cut path requires this sequence:

```text
versioned cut-safety planning
  -> reversible bridge/preparation execution
  -> reinforcement physical receipt
  -> immutable readiness inspection/receipt
  -> explicit single-use irreversible authorization
  -> PROJECT_STEEK_CUT_EXECUTION
  -> post-cut topology/edge verification
  -> PROJECT_NECKLINE_EDGE_FINISHING_PLANNING
```

At minimum, the future cut execution contract must bind:

- cut plan/result identity and exact prepared bridge identity;
- yarn/fabric/method eligibility evidence and fingerprints;
- bridge columns, protected neighboring ranges and exact cut line;
- reinforcement method, both reinforcement paths and physical verification receipt;
- confirmation that another garment layer is isolated from the scissors;
- cut direction, start/stop anchors and stable stopping condition;
- readiness review fingerprint and a fresh, explicit, single-use authorization receipt;
- a material-edge before/after ledger separate from live-stitch arithmetic;
- post-cut edge identities, stabilization state, damage check and final topology;
- replay protection that returns the existing receipt and never offers a second cut.

The cut stage lifecycle must distinguish prepared, reinforced, readiness-verified,
authorized, cut-started, post-cut-review and completed. Once `cut-started` exists there
is no ordinary rollback or replan. Recovery becomes a dedicated damage/repair flow.

This confirms that a separate cut execution boundary/stage is required. It should
consume a dedicated immutable cut-safety plan; it must not reuse Stage 92's generic
`complete_execution_instruction` command.

## 13. Lifecycle, replay and rework

Stage 91 V2 keeps the existing planning lifecycle and append-only epochs:

```text
read-only ready
  -> collecting_opening_choices
  -> reviewing_neckline_opening_plan
  -> completed

derived: stale | rework_required | v1_execution_ineligible
```

Every write keeps the current UUID replay, semantic payload fingerprint, expected
revision/state/source/review fences and immutable completion rules. Stage 92 eligibility
is a derived read, never a mutation of the completed plan.

Rework boundaries are:

| Physical progress | Allowed response |
|---|---|
| Before any Stage 92 start receipt | Append a new Stage 91 V2 epoch; V1/V2 history remains immutable. |
| Started but no instruction confirmed | Reconcile whether physical work occurred. Replan only after proof of the exact entry baseline. |
| Reversible flat knitting confirmed | Undo to an exact confirmed topology/count/yarn checkpoint, record recovery, then append execution/planning epoch as applicable. |
| Circular-to-flat transition confirmed | Ordinary replan is blocked until the center disposition, edges, BOR topology, counts and yarn state are physically restored and verified. |
| Yarn break/rejoin occurred | The original yarn continuity cannot be claimed. Recovery must preserve the new tail/source facts and branch from a versioned recovery baseline. |
| Fabric cut started/completed | Ordinary Stage 91/92 replan is forbidden. Only a dedicated post-cut recovery/repair flow may proceed. |

The authoritative evidence that execution may have started is the existence of a
durable Stage 92 start receipt in repository history. The Stage 91 V1
`downstreamExecutionStarted` state/caller parameter is removed from the V2 decision
path; callers cannot assert it false to bypass physical recovery.

## 14. Persistence and concurrency

No persistence framework or IndexedDB migration is needed. V2 reuses IndexedDB V4:

- `progress` for Stage 91 epochs and future Stage 92/cut execution epochs;
- `operations` for global UUID/idempotency receipts;
- `checkpoints` for checksum-bound recovery evidence;
- `projects` for materialized routing state;
- `meta` for atomic sequence allocation.

The existing serialized repository transaction over
`projects + progress + operations + checkpoints + meta` is sufficient. V2 arrays and
snapshots live inside the rigorously validated progress state. A new `rows`, `yarn`,
`topology` or `cuts` store would introduce cross-store atomicity risk without adding
authority.

Required rules remain:

- positive contiguous epochs and unique project/calculation/kind/epoch scope;
- immutable historical completed bytes;
- global operation UUID conflict detection across all epochs;
- identical UUID plus identical semantics returns the committed result without a new
  revision;
- stale project/repository/domain/source/plan/instruction fences reject writes;
- current source and downstream-start history are reread inside the serialized write;
- project, progress, operation, checkpoint and meta changes commit atomically;
- reload recomputes source, result, instruction chain and current cursor before routing.

## 15. Compatibility and migration policy

### 15.1 V1 remains readable

V1 records continue to validate under the existing V1 validator and remain visible as
historical geometry/planning results. Export/import must preserve them byte-for-byte.
They are not relabelled V2 and their fingerprint is never rewritten.

### 15.2 V1 cannot continue into Stage 92

Stage 92 accepts only:

```text
NECKLINE_OPENING_PLANNING_CONTRACT_V2
NECKLINE_OPENING_PLAN_V2
reversible_structural_execution_v1
NECKLINE_OPENING_EXECUTION_INSTRUCTION_V1
fabricCut = unsupported_requires_dedicated_contract
complete executionClosureProof
```

A V1 source returns `STAGE91_EXECUTION_CONTRACT_V2_REQUIRED` (or a semantically
equivalent stable diagnostic) and offers V2 replan, not physical instructions.

### 15.3 No automatic V1 -> V2 migration

The following V2 facts are absent or ambiguous in V1 and cannot be manufactured safely:

- physical face and exact direction for the transition;
- initial and terminal yarn attachment/source state;
- break/rejoin/new-source choice and anchors;
- ordered traversal and action anchors;
- physically ordered left/right edge actions;
- exact topology segment/boundary snapshots;
- next face/direction/yarn terminal closure;
- supported/unsupported irreversible capability;
- authoritative downstream-start evidence.

V1 user choices and target geometry may be shown as non-authoritative prefill in a new
V2 epoch, but V2 must recompute the plan and require explicit review/confirmation. It
must also confirm through repository history that no Stage 92 start exists. If physical
work happened outside YarnAI, the user must report it and enter recovery; the app must
not equate “no receipt” with proof that no physical work occurred when the user says
otherwise.

## 16. Stage 92 prerequisites and unblock condition

Stage 92 becomes safe to implement only when all of these are production facts:

1. the current Stage 77-90 chain independently reconstructs and matches the Stage 91
   V2 source fingerprint;
2. Stage 91 V2 state/result/instruction validators recompute every byte from source and
   recorded choices;
3. the result carries an accepted execution capability and no fabric-cut instruction;
4. every instruction is self-describing under section 6 and passes all chain/closure
   invariants;
5. the explicit transition has complete face/direction/yarn/topology semantics;
6. Stage 92 can confirm the entry baseline without inferring missing Stage 90 facts;
7. Stage 92 binds its cursor to plan and instruction fingerprints and only advances on
   an exact complete-instruction confirmation;
8. durable Stage 92 start receipts become the authoritative rework fence;
9. V1 and unsupported methods fail before an execution epoch or physical CTA is
   created;
10. the V2 tests in section 18 pass together with the existing regression chain.

The V2 contract, not the presence of another stage, is what unblocks Stage 92.

## 17. Successor recommendation

For the accepted non-cut V2 scope, Stage 92 physically completes the structural
neckline/opening, freezes realized edges/corners/counts/yarn terminal state, and applies
no pickup, band, placket finish or collar. Its correct direct successor remains:

```text
PROJECT_NECKLINE_EDGE_FINISHING_PLANNING
```

That planner consumes realized rather than merely planned edge facts and decides exact
pickup paths/counts, bands, placket finish and collar dependencies.

The recommendation is conditional by method. A future cut plan must route from its
reversible preparation result to the dedicated cut-safety/cut-execution boundary and
only then to edge finishing. Therefore `PROJECT_NECKLINE_EDGE_FINISHING_PLANNING` is the
correct successor of a physically opened no-cut Stage 92 result, but it is not a bypass
around an unexecuted steek cut.

## 18. Future production test plan

### 18.1 V2 identity, validation and compatibility

1. Exact V2 contract/result/instruction/capability constants.
2. V1 remains readable and byte-stable.
3. V1 Stage 92 attempt returns `STAGE91_EXECUTION_CONTRACT_V2_REQUIRED` and creates no
   execution state.
4. V1 choice prefill cannot become V2 completion without recompute/review/confirmation.
5. Missing, reordered, stale or conflicting Stage 77-90 binding blocks V2.
6. Corrupted result, instruction, topology or yarn fingerprint blocks reload.
7. Noncontiguous, omitted, duplicated or reordered instruction blocks completion.
8. Outer matching fingerprint with non-recomputable nested semantics is rejected.

### 18.2 Deterministic face, direction and turn

9. Transition has exact RS/WS rather than `transition` as a face substitute.
10. Every flat pass has deterministic start/end boundaries and ordered direction.
11. Required turns alternate face and direction exactly.
12. `no_turn` and `stop` preserve their declared terminal states.
13. Impossible RS/WS/segment/start-edge combinations are rejected.
14. Edge identities remain stable while their start/end roles alternate.
15. Next expectation exactly matches the next instruction.

### 18.3 Yarn semantics

16. Attached active source at the planned boundary passes the entry baseline.
17. Detached/mislocated/unknown source blocks start.
18. Break-and-rejoin produces exact tail, continuity and new attachment state.
19. Preserve-primary plus new-source path records both sources and exactly one active
    source.
20. Illegal double attachment, rejoin to held segment, missing new source and wrong
    rejoin anchor are rejected.
21. Reload/resume preserves all yarn source and terminal-location identities.

### 18.4 Topology and transition

22. Circular baseline has one active cyclic segment, active BOR and no opening edges.
23. Transition creates one active linear segment and two edges exactly once.
24. Active BOR becomes null while the old BOR remains historical.
25. Duplicate/replayed transition cannot create or retire boundaries twice.
26. Wrong center disposition/count, edge identity, marker fate or segment path blocks.
27. An execution attempt for flat instruction 2 without confirmed transition 1 blocks.
28. Held/inactive ranges cannot be traversed.
29. Four underarm groups remain unchanged in all snapshots.

### 18.5 Conservation and execution replay

30. Exact before/after counts for hold, bind-off, decrease and no-change instructions.
31. Beginning-edge and ending-edge actions are ordered and side-specific.
32. Per-instruction and aggregate topology/count closure pass for a valid schedule.
33. Equal aggregate with wrong section/range allocation fails.
34. No implicit cast-on, pickup, reactivation, tolerance, clamp or redistribution.
35. Identical operation UUID/semantics is idempotent across reload.
36. Same UUID with another plan/instruction/payload conflicts globally.
37. Stale predecessor, source, revision, review, cursor or instruction fingerprint
    rejects mutation.
38. Two tabs cannot start or confirm the same instruction twice.

### 18.6 Interruption, persistence and rework

39. Started-but-unconfirmed instruction reloads as reconciliation, never not-started.
40. Exact partial cursor validates only against stored traversal ranges/actions.
41. Unknown crash position never causes guessed resume or count advancement.
42. Project/progress/operation/checkpoint/meta commit atomically in IndexedDB V4.
43. No Stage 91/92-specific store or DB version is added.
44. New V2 plan before Stage 92 start appends a contiguous epoch.
45. Rework after reversible progress requires exact checkpoint restoration.
46. Rework after transition requires cyclic topology and boundary restoration proof.
47. Yarn break recovery cannot claim original continuity.
48. Repository Stage 92 start receipt blocks caller-forced Stage 91 replan.

### 18.7 Irreversible cut safety

49. Initial V2 rejects every cut method and renders no cut CTA.
50. A fabric-cut action cannot validate under the V1 instruction schema.
51. Future cut without eligibility, bridge identity, reinforcement verification,
    readiness receipt or explicit authorization is rejected.
52. Future duplicate cut UUID/retry returns the single prior receipt and never a new
    action.
53. Cut-started/completed history blocks ordinary rework and routes to recovery.
54. Material-edge conservation is separate from live-stitch counts.

### 18.8 Completion and successor

55. Premature Stage 92 completion is impossible.
56. Wrong final topology, counts, face, direction, yarn or unresolved discrepancy
    blocks completion.
57. Completed physical result freezes realized edges and excludes finishing/pickup.
58. Non-cut result routes to `PROJECT_NECKLINE_EDGE_FINISHING_PLANNING`.
59. Unsupported cut plan cannot route directly to edge finishing.
60. Real production chain reloads from Stage 77 through V2 planning and every Stage 92
    instruction without hidden reconstruction.

## 19. External technical validation

External sources are used only to validate physical knitting technique; YarnAI
ownership, versioning and persistence decisions follow its own invariants.

- DROPS explains that flat work alternates RS and WS while work in the round is worked
  from the RS. This supports storing face and direction per instruction rather than
  inferring them from a generic row counter:
  [How to read knitting diagrams](https://www.garnstudio.com/lesson.php?cid=19&id=68&page=15).
- Knitty's Chicory instructions bind off the left and right front neck at the beginning
  of specifically identified WS and RS rows and later return held sections to the
  needle. This validates ordered, side-specific actions and explicit active/held
  segments:
  [Chicory Cardigan](https://knitty.com/ISSUEss22/PATTchicory.php).
- Knitty's Mahakam instructions explicitly join a new ball while binding center-front
  stitches, demonstrating that yarn source/join semantics are real execution facts,
  not derivable decoration:
  [Mahakam](https://knitty.com/ISSUEff20/PATTmahakam/TEMPLATEpatternFF18.html).
- Another Knitty pattern explicitly says to rejoin yarn with the wrong side facing at a
  named neck edge, validating the need to bind rejoin boundary and face together:
  [Zico](https://knitty.com/ISSUEdf25/PATTzico.php).
- Brooklyn Tweed describes a steek as a deliberately worked bridge, reinforces both
  sides before cutting through the center, and only afterwards picks up a band. This
  supports separate bridge, reinforcement, cut and finishing boundaries:
  [How To: Steeking](https://brooklyntweed.com/pages/steeking).
- Interweave likewise marks an exact cut line, reinforces before cutting, recommends
  isolating the other fabric layer, and picks up the border after the cut. This supports
  a protected cut line, readiness receipt, explicit irreversible execution and post-cut
  edge result:
  [Beginner's Guide to Steeking](https://www.interweave.com/article/knitting/beginners-guide-to-steeking/).
- Knitty's Amelia performs neckline shaping first and calculates/picks up the neck edge
  later. This supports keeping collar/band pickup planning downstream of realized
  structural edges:
  [Amelia](https://knitty.com/ISSUEwinter08/PATTamelia.php).

These sources do not prove that one transition sequence fits every pattern. They prove
the opposite: face, edge, held work, yarn joins, reinforcement and pickup order are
method-specific physical facts and must be explicit in a versioned YarnAI plan.

## 20. Validation performed for this finding

Validation was run on 2026-08-10 after this document was created:

| Check | Result |
|---|---|
| `npm run test:stage77` through `npm run test:stage91` | Passed: 183 tests, zero failed/cancelled/skipped. All stage-scoped syntax prerequisites also passed. |
| Stage 77-91 Python/UI scope via `.venv\\Scripts\\python.exe -m pytest -q ...` | Passed: 68 tests. One pre-existing `StarletteDeprecationWarning` about the `httpx` test-client integration was reported. |
| `npm run build` | Passed, including prebuild/build/postbuild syntax checks and all production Stage 87-91 files. |
| `git diff --check` | Passed. Git reported only pre-existing LF-to-CRLF working-copy warnings on unrelated tracked files. |
| Direct trailing-whitespace scan of this untracked finding | Passed. |

No test or production file was edited to obtain these results.

## 21. Production files required after approval

No file in this list is changed by this finding. After approval, the minimum Stage 91
V2 repair is expected to touch:

```text
src/yarnai/static/project-neckline-opening-planning.js
src/yarnai/static/project-neckline-opening-planning-application.js
src/yarnai/static/project-neckline-opening-planning-workspace.js
src/yarnai/static/project-neckline-opening-planning-assistant.js
src/yarnai/static/project-neckline-opening-planning.html
src/yarnai/static/stage91-happy-path-fixture.js
src/yarnai/static/project-system.js
src/yarnai/static/user-workspace-entry.js
tests-js/project-neckline-opening-planning.test.cjs
tests-js/project-neckline-opening-planning-integration.test.cjs
tests/test_project_neckline_opening_planning_ui.py
package.json
```

The application/repository changes are needed to reconstruct V1 and V2 separately,
save V2 epochs, query authoritative downstream start receipts and derive Stage 92
eligibility. The workspace/assistant/UI changes are limited to V2 review, explicit yarn
transition choices when genuinely required, and a clear V1-replan/unsupported-cut
blocker. No IndexedDB migration is expected.

Only after the V2 contract and regression suite pass should the separate Stage 92
domain/application/repository/workspace/fixture/tests and route be added. A future cut
path will additionally require dedicated cut-safety planning and cut-execution files;
those are not part of the Stage 91 V2 repair or Stage 92 reversible executor.

## 22. Final decision record

1. The gap is an incomplete execution contract, not missing geometry.
2. Stage 91 remains the sole planning owner and needs V2.
3. No intermediate planning stage is needed.
4. V1 remains readable but is never executable and is not auto-migrated.
5. V2 supplies self-describing instruction, topology, yarn, face/direction, transition
   and closure contracts.
6. Stage 92 executes and observes V2; it never reconstructs intent.
7. Fabric cutting is unsupported in initial V2/Stage 92 and requires a separate
   irreversible execution boundary/stage.
8. For completed non-cut Stage 92 work, the successor remains
   `PROJECT_NECKLINE_EDGE_FINISHING_PLANNING`.
9. Existing IndexedDB V4, immutable epochs, fingerprints, receipts, replay protection
   and optimistic concurrency are reused unchanged.
10. Production implementation remains prohibited until this finding is approved.
