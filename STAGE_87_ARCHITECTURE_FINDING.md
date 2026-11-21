# Stage 87 architecture finding: physical body/sleeves join

Scope: architecture research only. This document does not create or change production
domain/application/repository/workspace/assistant code, UI, routes, fixtures, tests,
IndexedDB schema, project data, or Git history.

## 1. Executive conclusion

The next **conceptual** minimal boundary after a current completed Stage 86 plan is:

```text
domain identity:   PROJECT_BODY_SLEEVES_JOIN_EXECUTION
contract identity: BODY_SLEEVES_JOIN_EXECUTION_CONTRACT_V1
result schema:     BODY_SLEEVES_JOIN_EXECUTION_RESULT_V1
contract version:  1
output boundary:   body_sleeves_join_physically_confirmed
```

The proposed identity is correct. It names the physical operation precisely: join the
active body stitches and the two active sleeve stitch sets into one continuous yoke
round. It does **not** join or close the four held underarm groups and does not perform
raglan shaping.

There is no justification for a separate persisted confirmation or preparation stage
before it. Needle loading, laying out the three tubes, locating the working yarn,
positioning at the planned join entry, and checking four markers are operational
readiness steps of the same physical workflow. They introduce no independently useful
design authority. Stage 87 itself must nevertheless make readiness an explicit,
durable first checkpoint rather than silently assuming it.

The completion choice is **B, one complete joining/setup round worked without any
decrease**. Merely putting all loops on one cable (choice A) does not connect three
separate fabrics with the working yarn and is not a truthful physical join. Any raglan
decrease, short row, neckline action, or other yoke shaping is outside Stage 87.

There is one repository-state qualification: `STAGE_86_ARCHITECTURE_FINDING.md` is
present, but no Stage 86 production domain, result, route, fixture, repository method,
or test exists. Therefore Stage 87 is the correct boundary to design, but a future
Stage 87 implementation must fail closed until a production-valid, current, completed
`RAGLAN_INTERFACE_PLAN_V1` exists. The architecture finding itself is not an
authoritative runtime prerequisite.

## 2. Why this is the correct next boundary

The implemented chain separates decisions, physical actions, and immutable physical
truth:

| Stage | Implemented authority relevant to the join | Explicit exclusion or remaining gap |
|---|---|---|
| 77 `PROJECT_CONSTRUCTION_STRATEGY_PLANNING` | bottom-up, body/sleeves joined raglan topology | no join layout or execution |
| 78 `PROJECT_SHAPING_POLICY_PLANNING` | synchronized or differentiated raglan shaping policy | blocked on later geometry; no cadence or row plan |
| 79 `PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING` | two cuff-up, in-round sleeve plans and sleeve BOR method | no physical result or yoke topology |
| 80 `PROJECT_SLEEVE_PHYSICAL_EXECUTION` | immutable actual Sleeve 1 and Sleeve 2 full-tube results | no allocation or join |
| 81 `PROJECT_SLEEVE_PAIR_VALIDATION` | exact current pair acceptance; unequal actuals remain visible | no averaging, body, or join authority |
| 82 `PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION` | actual body full-tube count at the underarm boundary | explicitly before underarm removal/allocation |
| 83 `PROJECT_UNDERARM_ALLOCATION_PLANNING` | selected equal live allocation `H` | no physical allocation or join |
| 84 `PROJECT_JOIN_LAYOUT_PLANNING` | exact cyclic ranges, sleeve side mapping, orientation, future order, interfaces, macro BOR | raglan stitch ownership unresolved; no physical action |
| 85 `PROJECT_UNDERARM_ALLOCATION_EXECUTION` | four actual held live groups, three actual active counts, conservation, forward traversal | `physicalJoinApplied: false`; no marker placement, setup round, or yoke |
| 86 `PROJECT_RAGLAN_INTERFACE_PLANNING` (architecture only today) | intended width, existing-stitch ownership, refined cyclic topology, marker anchors, BOR, expected count | must not claim physical marker placement or join |

After a real completed Stage 86, every decision needed to join is known. What remains
is physical and observable: arrange the three tubes, work the existing active stitches
in the planned cyclic order, place the planned markers, return to BOR, recount, and
confirm the result. A new planning boundary would duplicate Stage 84/86. A separate
confirmation boundary would duplicate the review/completion portion of established
physical Stages 80, 82, and 85.

The minimal sequence is therefore:

```text
current completed Stage 85 physical result
  -> current completed Stage 86 interface plan (not implemented yet)
  -> Stage 87 readiness + physical joining/setup round + explicit review
  -> immutable Stage 87 result
```

## 3. Runtime prerequisite gap

Stage 87 must not treat an architecture document as data. Its application-level start
gate must reconstruct a real Stage 86 progress record and verify all of the following:

- kind `PROJECT_RAGLAN_INTERFACE_PLANNING`;
- completed lifecycle and output boundary `raglan_interface_plan_completed`;
- contract/result version supported by Stage 87;
- exact Stage 85 state/result binding;
- exact Stage 84 layout binding;
- contiguous Stage 86 epoch history and immutable completed result;
- current source fingerprints, ownership partitions, marker topology, and BOR;
- `physicalJoinApplied: false`, `physicalMarkersPlaced: false`,
  `setupRoundWorked: false`, and `raglanShapingApplied: false`;
- width in the closed V1 set `0 | 1 | 2` and no-create/no-consume/no-duplicate
  semantics.

Until that runtime contract exists, route readiness must be `blocked` with a Stage 86
implementation/current-completion destination. It must not reconstruct a Stage 86 plan
from counts or copy values from this finding.

## 4. Authoritative dependency table

| Data | Source stage | Authoritative? | Required? | Stage 87 validation |
|---|---|---:|---:|---|
| Active project and calculation IDs | project aggregate | Yes | Yes | Exact scope; active calculation still current |
| Construction direction `bottom_up` | 76/77, bound by later stages | Yes | Yes | Must equal the Stage 77 current source; no UI override |
| Joined-raglan topology identity | 77 | Yes | Yes | Exact `construction-strategy:body-sleeves-joined-raglan:v1` |
| Shaping policy identity/value | 78 | Yes, context only | Yes for chain currentness | Current binding must match Stage 86; Stage 87 does not execute it |
| Sleeve plans, gauge/BOR method | 79 | Yes | Transitively yes | Current binding; no recomputation |
| Sleeve 1 actual full-tube count/result | 80 | Yes, physical | Yes | Exact current result identity/fingerprint; safe integer |
| Sleeve 2 actual full-tube count/result | 80 | Yes, physical | Yes | Exact current result identity/fingerprint; safe integer |
| Accepted exact sleeve pair | 81 | Yes | Yes | Must accept the exact two current Stage 80 results |
| Body actual full-tube count | 82 | Yes, physical | Yes | Exact result/fingerprint; before-allocation boundary |
| Planned underarm count `H` per interface | 83 | Yes, planned | Yes | Exact current plan; no Stage 87 edit |
| Body/sleeve source ranges and physical side mapping | 84 | Yes, planned | Yes | Byte-for-byte source of Stage 85/86; ranges valid, disjoint, cyclic |
| Sleeve 1 side (`left` or `right`) | 84 | Yes | Yes | Opposite side belongs to Sleeve 2; never infer from display order |
| Component orientation | 84 and confirmed by 85 | Yes | Yes | `cuff_to_underarm_bor_centered_beneath_arm`; forward traversal only |
| Body active actual count | 85 | Yes, physical | Yes | Exact completed result; equals valid body partition after held groups |
| Sleeve 1 active actual count | 85 | Yes, physical | Yes | Exact completed result and Stage 80/83 conservation |
| Sleeve 2 active actual count | 85 | Yes, physical | Yes | Exact completed result and Stage 80/83 conservation |
| Body left/right held groups | 85 | Yes, physical | Yes | Both count `H`, remain live, exact Stage 84 intervals |
| Sleeve 1/Sleeve 2 held groups | 85 | Yes, physical | Yes | Each count `H`, live, exact interval/orientation |
| Total/held/eligible conservation proof | 85 | Yes, physical | Yes | Revalidate exact equations; do not trust presentation projection |
| Width `w`, `0 | 1 | 2` | 86 | Yes, planned | Yes | Closed enum and uniform across four interfaces |
| Existing-stitch interface ownership | 86 | Yes, planned | Yes | Exact non-overlapping source/core/interface partitions |
| Cyclic topology and traversal order | 86 (refines 84) | Yes, planned | Yes | Exact sequence, four interfaces, closed cycle, no duplicate identity |
| Four marker anchors and roles | 86 | Yes, planned | Yes | Marker 4 also BOR; all initially physically unplaced |
| Refined BOR | 86 (preserves 84 macro boundary) | Yes, planned | Yes | After interface 4 and before front core; no recalculation |
| Expected joined active count `E` | 86, based on 85 | Yes, planned | Yes | Must equal Stage 85 eligible count under V1 |
| Stage 77–86 progress/state/result fingerprints | respective stages | Yes, provenance | Yes | Exact scoped current bindings, re-read inside write transaction |
| One-based stitch labels and component names | Stage 87 projection | No, presentation only | No | Derive from canonical ranges; never persist as coordinates |
| Needle/cable and four-marker availability | Stage 87 readiness | User-confirmed operational fact | Yes to start work | Presentation/attempt evidence, not geometry authority |
| Working yarn at planned join entry | Stage 87 readiness | User-confirmed physical fact | Yes | Existing body yarn at entry or explicit no-stitch-created reattachment |
| No twist and correct tube orientation | Stage 87 execution | User-confirmed physical fact | Yes | Confirm before first cross-component stitch and again at review |
| Actual joined active count | Stage 87 result | Not known before execution | Yes to complete | Manual recount must equal `E` in V1 |
| Actual marker placement/topology | Stage 87 result | Not known before execution | Yes to complete | Four markers at exact Stage 86 anchors; distinct BOR marker |

### Classification

**Authoritative facts** are immutable current results/plans and their scoped bindings.
Stage 87 copies or references them; it does not ask the user to re-enter them.

**Derived values** are safe projections such as `total_live_before_join`, the physical
right/left sleeve mapping, one-based labels, next step, and progress percentage. A
derived value never replaces its source proof.

**Presentation-only values** include Russian labels, diagrams, human stitch ranges,
marker colours, and explanatory count breakdowns.

**Missing confirmations** are physical readiness, the actual completion of each join
leg, marker placement, orientation/no-twist, the final active count, preservation of
held groups, and the final aggregate review.

## 5. Physical knitting semantics and external evidence

The technical sources agree on the general mechanics while allowing different cyclic
rotations/BOR positions:

- [Tin Can Knits, Bottom-up Sweater Construction](https://blog.tincanknits.com/2017/03/28/lets-knit-a-bottom-up-sweater/)
  describes three tubes, places sleeve underarm stitches on waste yarn, works body and
  sleeve stitches in sequence, sets a new BOR marker, and leaves the held underarm sets
  for later grafting.
- [Purl Soho, Joining Sleeves To Body](https://www.purlsoho.com/create/joining-sleeves-to-body/)
  explicitly states that the join happens in one round: orient the pieces, use the body
  needle and working yarn, knit across each sleeve/body section, and complete a single
  joining round.
- [Ysolda, Joining the Sleeves and Body](https://ysolda.com/blogs/journal/joining-the-sleeves-and-body-on-a-seamless-bottom-up-sweater)
  shows the physical layout, held underarm pairs, working sleeve stitches onto the body
  needle, placing markers at transitions, and counting before proceeding.
- [Tin Can Knits, Underarm Joining Tips](https://blog.tincanknits.com/2017/03/28/that-pesky-underarm/)
  confirms that held body/sleeve underarm stitches remain separate for later grafting.

These are technique sources, not YarnAI topology authority. Their differing BOR
rotations prove that BOR is pattern-specific. YarnAI must therefore use Stage 84/86,
not a generic tutorial, for the exact order and marker position.

The physical method compatible with the existing contracts is:

1. Keep the four Stage 85 underarm groups live and separate on their carriers.
2. Put every active sleeve stitch on a workable auxiliary needle without reversing its
   component-coordinate order.
3. Lay the body right-side out and place the physical right and left sleeves according
   to Stage 84; align corresponding held underarm groups face to face.
4. Establish the working yarn at the Stage 86 join entry/BOR. If the existing body yarn
   is not there, Stage 87 must give one explicit, versioned no-count-change positioning
   instruction; it must not silently knit a partial shaping round.
5. With the body working needle/yarn, work the Stage 86 cyclic sequence exactly once,
   transferring each worked active stitch to the common circular needle.
6. Place each marker at its planned transition. Work no decrease, short row, pickup,
   cast-on, bind-off, or underarm closure.
7. Return to the planned BOR, recount all joined active stitches, and review topology.

The first readiness checkpoint must confirm the actual working-yarn location because
Stage 84 records the body marker role but does not store a Stage 87 physical join-entry
receipt. This missing fact belongs inside Stage 87; it does not justify a separate
domain.

## 6. Definition of “join completed”

The only accepted definition is:

> Body, Sleeve 1, and Sleeve 2 have been connected by one complete continuous
> joining/setup round, all eligible active stitches have been worked exactly once onto
> the common circular needle in the Stage 86 cyclic order, all four planned markers are
> physically present, the user has returned to the refined BOR, the actual active count
> equals the Stage 86 expectation, and all four underarm groups remain live and held.

This is choice **B** from the prompt, with a strict qualification: the round is a
joining/setup round only.

Choice A is rejected because a carrier can hold three unrelated fabrics in sequence
without a shared strand joining the transitions. It is a useful preparation state, not
the completion fact. Choice C is rejected because even one decrease or neckline action
begins later shaping. Any definition that includes underarm grafting is rejected
because the current contracts intentionally preserve those groups for later finishing.

The completion receipt must assert:

```text
joiningRoundWorked = true
joiningRoundWorkedExactlyOnce = true
raglanDecreasesWorked = 0
setupStitchesCreated = 0
stitchesConsumed = 0
heldUnderarmsClosed = false
physicalMarkersPlaced = 4
endedAtPlannedBor = true
bodySleevesJoinPhysicallyConfirmed = true
```

## 7. Stitch conservation model

Let:

```text
B  = Stage 82 actual body full-tube live count
S1 = Stage 80 actual Sleeve 1 full-tube live count
S2 = Stage 80 actual Sleeve 2 full-tube live count
H  = Stage 83/85 live held count per one of four underarm groups

Bact  = Stage 85 body active count       = B - 2H
S1act = Stage 85 Sleeve 1 active count   = S1 - H
S2act = Stage 85 Sleeve 2 active count   = S2 - H

total_live_before_join    T   = B + S1 + S2
held_underarm_total       Hld = 4H
active_joined_yoke_total  E   = Bact + S1act + S2act
```

Required invariants are:

```text
T = Hld + E
E = B + S1 + S2 - 4H

total_live_after_join = T
held_underarm_after_join = Hld
actual_joined_active_working_stitches = E

lost = 0
duplicated = 0
created = 0
consumed = 0
bound_off = 0
```

Stage 86 partitions, but does not change, `E`:

```text
w = interface width per interface, w in {0, 1, 2}
D = 4w                          dedicated interface stitches
C = E - D                       section-core stitches
C + D = E
```

For every ordered source section `Qi` and its following interface `Ii`:

```text
Qi.coreCount + Ii.lineCount = Qi.Stage85ActiveCount
Ii.lineCount = w
intersection(Qi.core, Ii.line) = empty
```

### Verified fixture

The current Stage 85 tests, not the prompt, establish this fixture:

```text
body active       = 80
Sleeve 1 active   = 50
Sleeve 2 active   = 50
held total        = 40
total physical    = 220
eligible/joined E = 180
```

Thus `220 = 40 + 180`. Width changes only the internal partition:

| `w` | Dedicated `D` | Core `C` | Expected/actual joined active after success |
|---:|---:|---:|---:|
| 0 | 0 | 180 | 180 |
| 1 | 4 | 176 | 180 |
| 2 | 8 | 172 | 180 |

These numbers are test-fixture evidence only and must never appear as production
defaults.

## 8. Interface width 0/1/2 semantics

Stage 87 consumes the Stage 86 ownership result byte-for-byte.

| Width | Physical source | Existing before Stage 87? | Separate transfer? | Count effect | User-visible instruction |
|---:|---|---:|---:|---:|---|
| 0 | No stitch; zero-width boundary | N/A | No | none | Finish the section and place the planned marker before the next component |
| 1 | Last existing active stitch of the preceding section in forward traversal | Yes | No ownership transfer; work it as the line stitch | none | Work the final 1 stitch as the raglan line, then place the marker |
| 2 | Last 2 existing active stitches of the preceding section | Yes | No ownership transfer; work them as the line lane | none | Work the final 2 stitches as the raglan line, then place the marker |

For non-zero width, “belongs to the interface” is a topology role while physical
provenance remains body or sleeve. The stitch is removed from the section's **core**
partition but stays in the same live component sequence. Stage 87 does not cast on,
pick up, share, copy, or consume it. Loading a sleeve onto an auxiliary needle is a
carrier operation, not creation of a new stitch or change of ownership.

Instructions must show the line stitch count and marker placement graphically or in
plain language. They must not expose `ownershipPolicy`, source interval IDs, offsets,
or formulas.

## 9. Exact cyclic topology

From the refined Stage 86 BOR, after interface 4 and before the front core, the physical
round is:

```text
front core
  -> interface 1: front -> physical right sleeve
  -> right sleeve core
  -> interface 2: right sleeve -> back
  -> back core
  -> interface 3: back -> physical left sleeve
  -> left sleeve core
  -> interface 4: left sleeve -> front
  -> BOR / front core
```

With marker anchors included:

```text
BOR
  -> front core -> I1 stitches -> M1
  -> right sleeve core -> I2 stitches -> M2
  -> back core -> I3 stitches -> M3
  -> left sleeve core -> I4 stitches -> M4/BOR
```

`right sleeve` and `left sleeve` are resolved from Stage 84, not from a hard-coded
component number:

```text
rightSleeve = Sleeve 1 if sleeve1.side == right else Sleeve 2
leftSleeve  = Sleeve 1 if sleeve1.side == left  else Sleeve 2
```

In the current happy-path helper the default answer maps Sleeve 1 to the left and
Sleeve 2 to the right, but this is fixture behavior, not a production constant.

Closure proof:

- there are exactly four core sections and four interfaces;
- each interface's `afterSection` is the previous core and `beforeSection` is the next
  core modulo four;
- all active source stitch identities occur once in either a core or interface group;
- every component uses `forward_in_component_coordinates`;
- each body underarm group is paired spatially with the held group of the adjacent
  sleeve, but none enters the active sequence;
- interface 4 closes the cycle and its trailing marker is the single BOR.

## 10. Beginning of round

Stage 87 does not calculate BOR. It consumes the Stage 86 refinement of the Stage 84
macro boundary `left_sleeve_to_front`:

- for `w = 0`, marker 4 is the boundary/BOR after the left sleeve core and before the
  front core;
- for `w = 1 | 2`, marker 4 is after the left-sleeve-owned interface 4 lane and before
  the front core;
- marker 4 has both `raglan_interface` and `beginning_of_round` roles and must be
  visibly distinguishable.

Marker placement is part of Stage 87 because it becomes meaningful while crossing the
actual interfaces. It needs explicit per-marker progress and final confirmation.

Stage 84's body-round marker may not already be at the refined future BOR. Stage 87
must display both facts without conflating them. The readiness action must establish
the join yarn at the planned entry (using a contract-defined no-count-change method)
and the final action must leave the needle tips at M4/BOR. A marker must never be moved
silently or inferred from the currently convenient needle tip.

## 11. Physical UX sequence

The UI should expose seven meaningful physical checkpoints, not internal state names:

1. **Prepare and orient.** Lay out the body with right side outward; put Sleeve 1 on
   its Stage 84 side and Sleeve 2 on the other side; align each pair of held underarm
   groups; load all active sleeve stitches in forward order; verify working yarn and
   the distinctive BOR marker.
2. **Front to right sleeve.** From planned BOR, work the front core and interface 1
   lane if present, place marker 1, then begin/work the physical right sleeve in its
   forward direction.
3. **Right sleeve to back.** Work interface 2 as planned, place marker 2, and continue
   onto the back without touching held underarm stitches.
4. **Back to left sleeve.** Work the back core and interface 3, place marker 3, and
   begin/work the physical left sleeve in forward order.
5. **Close the joining round.** Work interface 4, place the distinctive marker 4/BOR,
   and finish exactly one continuous setup round without decreases.
6. **Topology and count review.** Confirm no twist/reversal; four marker locations;
   front/right sleeve/back/left sleeve order; active count; four held live groups; and
   no created, consumed, dropped, duplicated, or bound-off stitch.
7. **Final confirmation.** Freeze the result only after the review fingerprint still
   matches and the user explicitly confirms the physical state.

Each step shows physical names, side, one-based ranges/counts, a small orientation
diagram, “where your yarn is now,” and one next safe action. It does not show enums,
fingerprints, UUIDs, repository revisions, zero-based offsets, or ownership IDs.

Seven confirmations are appropriate: one readiness confirmation, four join-leg/marker
confirmations, one measured review, and one final aggregate confirmation. Counts and
orientation observations can be collected inside the relevant confirmation rather
than as extra meaningless checkboxes.

## 12. Lifecycle and atomic progress

`ready` and `blocked/stale` are read-only projections. Persisted lifecycle:

```text
preparing_join
  -> joining_round_in_progress
  -> reviewing_join_result
  -> completed
```

The attempt owns an ordered action ledger:

```text
prepare_and_orient
front_to_right_sleeve
right_sleeve_to_back
back_to_left_sleeve
left_sleeve_to_bor
review_topology_and_count
complete_join
```

Each action is atomic at repository level and has:

- stable action identity and ordinal;
- expected current cursor/previous receipt;
- exact source and state revision/fingerprint fences;
- user observation payload and optional discrepancy reference;
- operation UUID and timestamp;
- resulting physical cursor (`at_bor`, `after_m1`, `after_m2`, `after_m3`,
  `at_m4_bor`);
- derived next safe action.

The persisted state must never claim a later physical cursor because a page rendered
an instruction. Only an explicit completed action moves the cursor.

After reload, the user sees the last confirmed physical location, completed components
and markers, the expected next component, the yarn/needle position, and the first safe
next action. Reloading or submitting an identical operation UUID cannot repeat a
physical claim or create another history entry.

## 13. Atomic persistence and resume

Reuse the established atomic transaction over:

```text
projects + progress + operations + checkpoints + meta
```

For every mutation:

1. validate the complete candidate state and allowed transition;
2. reconstruct the current Stage 77–86 source chain;
3. re-read all direct bound records inside the write transaction;
4. enforce project, repository, Stage 87 state, source, action-cursor, and review
   revision/fingerprint fences;
5. detect exact UUID replay across all Stage 87 epochs;
6. atomically append operation evidence, update the live progress epoch, project
   materialization, checkpoint, and metadata;
7. never overwrite a completed epoch.

A browser crash between a physical act and its confirmation is inherently ambiguous.
On reload the UI must say “YarnAI last confirmed X; inspect the work before continuing”
and offer either confirm-after-inspection or record a discrepancy. It must not infer
that the shown instruction happened.

## 14. Discrepancy and correction handling

An observation record is append-only:

```text
observationId
attemptIdentity / epoch
actionIdentity / cursor
component and side
expected value or topology fingerprint
observed value/status
discrepancy code
note/evidence reference
observedAt / operationId
resolution reference (nullable)
```

No mismatch is rounded, averaged, or written back to an upstream result.

| Discrepancy | Immediate behavior | Suspect/rework destination |
|---|---|---|
| Body active count mismatch | Preserve observation; block crossing next interface/completion | Inspect Stage 85 body allocation; if source count itself wrong, Stage 82 then new 83–86 chain |
| Sleeve 1 active mismatch | Preserve; do not substitute Sleeve 2/average | Stage 85 Sleeve 1 allocation; if full-tube truth wrong, Stage 80 then new 81–86 chain |
| Sleeve 2 active mismatch | Same, component-specific | Stage 85 Sleeve 2 allocation; if needed Stage 80/81 onward |
| Any held-underarm count/status mismatch | Block; never move the held group into yoke | Stage 85; Stage 83/84 if `H` or interval is wrong |
| Wrong side/orientation | Do not work the component; preserve evidence | Stage 84 side/orientation plan or Stage 85 confirmation |
| Reversed sleeve traversal | Block before/at first sleeve stitch | Restore sleeve to forward order; Stage 84/85 suspect if plan differs |
| Wrong interface lane/marker | Stop at last confirmed cursor; unwork only the affected reversible segment | Stage 86 plan if expected topology is wrong; Stage 87 correction if execution differs |
| Wrong BOR/marker 4 | Block final review and all successor work | Stage 86 BOR if plan wrong; otherwise reposition/unwork within Stage 87 recovery |
| Actual joined total `M != E` | Preserve both values; block completion | Recount each core/interface and held group; route to the earliest suspect above |
| Twist discovered | Block immediately | Explicit physical join recovery; never mark complete |

Before the first cross-component stitch, readiness can be corrected in the same live
attempt. After joining starts, a source-changing rework cannot pretend the work is
still at Stage 85. The user must follow an explicit physical recovery flow that unwinds
to a verified pre-join state; only then may a new Stage 87 epoch bind new/current
sources. A completed result is never edited. A later correction creates a new epoch
and references the superseded result and recovery evidence.

## 15. Immutable result contract

`BODY_SLEEVES_JOIN_EXECUTION_RESULT_V1` minimally contains:

- schema/contract version, project/calculation/kind, attempt identity, epoch,
  predecessor and superseded-result identities;
- exact Stage 77–86 binding set and aggregate scoped source fingerprint;
- direct Stage 85 result identity/fingerprint and Stage 86 plan identity/fingerprint;
- copied authoritative active counts for body, Sleeve 1, Sleeve 2 and expected `E`;
- four held-group references with component, side, count, interval fingerprint, and
  `remainsLive: true`, `closed: false`, `joinedIntoYoke: false`;
- actual physical right/left sleeve mapping and confirmed forward orientations;
- actual ordered topology with core/interface groups and source identity references;
- width, interface counts, four actual marker placements, and marker 4/BOR role;
- joining action policy and working-yarn entry policy/version;
- actual joined active count and full conservation proof;
- `joiningRoundWorked: true`, `joiningRoundWorkedExactlyOnce: true`;
- `physicalJoinApplied: true`, `physicalMarkersPlaced: true`,
  `bodySleevesJoinPhysicallyConfirmed: true`;
- `raglanDecreasesWorked: 0`, `raglanShapingApplied: false`,
  `heldUnderarmsClosed: false`;
- per-action confirmation receipt references and final review fingerprint;
- discrepancy/observation history references, including resolved observations;
- explicit final confirmation, operation UUID, `startedAt`, `joinedAt`, `completedAt`,
  and canonical result fingerprint.

Allowlist validation must reject raw UI labels as coordinates, mutated upstream facts,
an unplanned stitch identity, a duplicate ownership, count fabrication/consumption,
underarm closure, a raglan decrease, decrease cadence, target yoke/neck count, neckline,
placket, collar, project completion, or mutable stale flag.

Completed bytes and fingerprint are immutable. Currentness is reconstructed; it is not
written back into old results.

## 16. Staleness and rework contract

| Change | Effect on completed/in-progress Stage 87 | Historical evidence |
|---|---|---|
| Stage 85 allocation result replaced | Stale; in-progress continuation blocked | Preserved unchanged |
| Stage 86 interface plan replaced | Stale; in-progress continuation blocked | Preserved unchanged |
| Either Stage 80 sleeve actual result replaced | Stale through scoped chain validation | Preserved unchanged |
| Stage 81 acceptance replaced | Stale | Preserved unchanged |
| Stage 82 body actual result replaced | Stale | Preserved unchanged |
| Stage 83 `H` plan replaced | Stale | Preserved unchanged |
| Stage 84 ranges, side, orientation, order, or BOR replaced | Stale | Preserved unchanged |
| Stage 77 direction/topology or Stage 78 policy replaced | Stale | Preserved unchanged |
| Active calculation changed | Old result non-current in old calculation | Preserved unchanged |
| Join correction after physical start | Recovery plus new Stage 87 epoch | Prior observations/result preserved |
| Exact idempotent command replay | Return existing state/result; no new write | Unchanged |
| Same UUID, different canonical payload | `OPERATION_ID_CONFLICT` | Unchanged |
| Unrelated project name/note/UI locale/theme change | Optimistic reload may be needed; no semantic staleness | Remains current after reconstruction |
| Future collar/placket presentation choice not bound to join | No Stage 87 staleness | Unchanged |
| Underarm finishing performed later under an authorized successor | Stage 87 remains historical truth; current project is downstream | Unchanged |

Fingerprints must be scoped to the exact progress/results and normalized fields above,
not the whole project blob. A physical result becoming stale means “unsafe as current
input,” not “the physical event did not happen.”

## 17. Storage and repository reuse

No new IndexedDB store, index, or schema version is justified. Production currently
uses `DB_VERSION = 4`; Stage 85 already proves that physical attempts, component
observations, epochs, receipts, checkpoints, and immutable results fit the existing
model.

Reuse:

- `progress` with kind `PROJECT_BODY_SLEEVES_JOIN_EXECUTION` and existing unique
  `[project_id, calculation_id, kind, epoch]` scope index;
- `operations` for idempotent append-only action/observation receipts;
- `checkpoints` for crash recovery;
- `projects` and `meta` in the same atomic transaction.

Expected repository surface follows established naming:

```text
getProjectBodySleevesJoinExecution
getProjectBodySleevesJoinExecutionHistory
ensureProjectBodySleevesJoinExecution
updateProjectBodySleevesJoinExecution
```

History requirements: positive contiguous epochs; epoch 1 has no predecessor; later
epochs name the previous attempt; rework names the superseded immutable result;
completed progress is never updated; historical exact replay is read-only; unsafe or
forked lineage fails closed.

## 18. Polo-specific implications

Stage 87 is topology- and count-sensitive but garment-style-neutral. A polo does not
change how three bottom-up tubes are joined at the underarms in this V1 contract.

The repository does not yet contain an authoritative polo-yoke/placket contract. The
tested Stage 76–85 happy-path fixture actually carries `garmentType: "свитер"` and a
neckline-depth value; those fixture facts must not be promoted to this user's male polo
production truth. Existing generic project data can record neckline depth, but there
is no authoritative target neckline stitch count, polo opening width/length, placket
construction, collar pickup, neck shaping schedule, or round-to-flat transition.

Stage 87 must preserve future freedom by:

- retaining a stable front core identity and orientation;
- retaining a deterministic BOR outside the front opening;
- not introducing front-centre decreases, a steek, opening, pickup, or short rows;
- not assuming all later yoke rows remain circular through the neckline;
- not consuming persistent raglan-line stitches;
- not closing underarm groups;
- preserving exact actual counts and component provenance for later geometry.

Polo shaping begins only when a later plan explicitly defines the front opening and
neckline transition. It has no Stage 87 action.

## 19. Exact next-stage recommendation

After Stage 87, the next minimal boundary should be:

```text
PROJECT_YOKE_TARGET_GEOMETRY_PLANNING
```

It should precede `PROJECT_RAGLAN_SHAPING_PLANNING` and any yoke execution. The first
missing authority is not another physical confirmation; it is the **target geometry
and endpoint constraints** needed to compute shaping safely.

After the join, the chain knows actual start count/topology and the high-level Stage 78
distribution policy, but it still lacks an executable authority for:

- target yoke depth/row count from the joined underarm boundary;
- target neck circumference or final live stitch count;
- exact body-versus-sleeve endpoint counts;
- raglan decrease event count and per-section feasibility;
- decrease rate/cadence and which rounds are plain;
- neckline start, neck shaping, short rows, and bind-off/holding behavior;
- male polo opening/placket width, length, start round, and round-to-flat transition;
- collar implications and front-centre stitch ownership.

`armholeDepthCm` and a generic `necklineDepthCm` exist upstream, but the current
contracts mark some construction dimensions informational and do not turn them into a
yoke endpoint or row schedule. Therefore neither `PROJECT_YOKE_EXECUTION_PREPARATION`
nor `PROJECT_YOKE_INITIAL_ROUND_EXECUTION` is safe next: preparation would have no
executable plan, and Stage 87 already owns the only safe initial no-decrease joining
round.

A likely later sequence is:

```text
Stage 87 physical join
  -> PROJECT_YOKE_TARGET_GEOMETRY_PLANNING
  -> PROJECT_RAGLAN_SHAPING_PLANNING
  -> yoke execution preparation
  -> yoke execution
```

Whether target geometry and shaping cadence can be one planning contract should be
decided by the next architecture task; Stage 87 must not invent either.

## 20. Detailed production implementation plan

When implementation is separately authorized:

1. **Implement Stage 86 first.** Add its closed V1 domain/result, application source
   reconstruction, repository methods, progress kind, route, workspace, fixture, and
   tests without changing IndexedDB V4.
2. **Pure Stage 87 domain.** Add constants, strict allowlists, canonicalization and
   fingerprints, Stage 77–86 source validation, topology/conservation validation,
   lifecycle transitions, action receipts, discrepancy records, review, completion,
   rework lineage, and presentation-safe projections.
3. **Application controller.** Reconstruct current Stage 77–86 records independently;
   validate histories; map physical right/left sleeves; derive human instructions from
   exact Stage 86 topology; block absent/stale prerequisites; fence every mutation.
4. **Repository integration.** Reuse `progress`/`operations`/`checkpoints`; implement
   ensure/update/history methods with exact replay, conflicts, optimistic concurrency,
   immutable completion, and atomic source re-read.
5. **Physical workspace.** Render readiness, one action at a time, durable resume,
   diagrams for sides/markers/BOR, component-specific counts, discrepancy flow, review,
   and final completion. Keep internal metadata out of the DOM/presentation projection.
6. **Assistant projection.** Explain only the current safe physical action and why a
   mismatch blocks; never claim the action happened or suggest count correction.
7. **Route/navigation.** Register Stage 87 only after Stage 86 completion is a real
   available successor; completed Stage 87 must route to target-geometry planning only
   when that future route exists, otherwise show a truthful unavailable boundary.
8. **Fixture.** Extend the production-valid Stage 85/86 chain via public controllers;
   never forge progress records. Cover width 0/1/2 and both Sleeve 1 side mappings.
9. **Recovery.** Provide an explicit physical unwind/restore path before allowing
   source-changing rework after the joining round begins.
10. **No migration.** Assert `DB_VERSION === 4`, unchanged store list, and absence of a
    join-specific store/index.

## 21. Detailed future test plan

### Prerequisites and source integrity

1. Valid start from exact current completed Stages 85 and 86.
2. Missing Stage 85, missing Stage 86, architecture-file-only Stage 86, non-completed
   predecessor, and unsupported contract version are blocked.
3. Every Stage 77–86 binding is current; cross-project/calculation/result substitution
   fails closed.
4. Malformed, forked, non-contiguous, or mutable predecessor history is rejected.
5. No Stage 87 progress is created by a read-only route load.

### Topology, orientation, and placement

6. Deterministic topology exactly matches the Stage 86 cyclic sequence.
7. Cycle closes at marker 4/BOR and every adjacency is correct.
8. Forward component orientation is required; reversal is rejected.
9. Sleeve 1 on left maps Sleeve 2 right and generates the correct instruction order.
10. Sleeve 1 on right maps Sleeve 2 left and generates the correct instruction order.
11. Physical right sleeve is joined after front; physical left sleeve after back.
12. Body front/back ranges and sleeve ranges are consumed byte-for-byte, not rebuilt.
13. All four underarm gaps pair with the correct body/sleeve held groups.
14. Wrong side, wrong orientation, wrong interface, topology mismatch, and twist each
    preserve an observation and block advancement/completion.

### BOR and interface width

15. BOR is Stage 86 marker 4 after interface 4/before front; never recomputed.
16. Body marker and future BOR are shown distinctly when they differ.
17. Working-yarn location requires explicit readiness confirmation.
18. Width 0 places zero-width markers and owns no stitch.
19. Width 1 uses exactly four existing preceding-section suffix stitches.
20. Width 2 uses exactly eight existing suffix stitches.
21. Non-zero line stitches are absent from source cores and occur once in interfaces.
22. No width requires separate cast-on/pickup or changes joined count.
23. Marker placements at all four anchors and distinctive BOR marker are required.

### Conservation and physical completion

24. General equation `T = Hld + E` holds for unequal sleeve actual counts.
25. Fixture proves `220 = 40 + 180` and joined active result is 180 for widths 0/1/2.
26. No duplicated stitch identity.
27. No lost stitch identity.
28. No fabricated, picked-up, shared, consumed, or automatically bound-off stitch.
29. Held-underarm count/status is identical before and after Stage 87.
30. Transfer-only/common-cable state cannot complete Stage 87.
31. Exactly one joining round is required.
32. Zero raglan decreases, no partial first shaping row, and no underarm closure.
33. Actual count mismatch stores expected and observed values and blocks completion.

### Lifecycle, resume, concurrency, and history

34. Reload after every atomic action restores exact cursor and next safe instruction.
35. Crash after physical action but before confirmation reports ambiguity, not success.
36. Identical operation UUID replay is idempotent with no revision increase.
37. Conflicting operation UUID reuse fails.
38. Stale project/repository/state/source/action/review fences fail.
39. Final completion requires current review fingerprint and explicit confirmation.
40. Completed result is byte/fingerprint immutable.
41. Rework creates a contiguous epoch and preserves prior attempts/results.
42. Source-changing rework after join start requires explicit physical recovery.
43. Append-only discrepancy and resolution history survives reload.

### Staleness and boundaries

44. Stage 85 replacement makes Stage 87 stale without mutating history.
45. Stage 86 replacement makes Stage 87 stale without mutating history.
46. Sleeve actual, pair acceptance, body actual, allocation plan, layout orientation,
    construction direction/topology, or active calculation replacement makes it stale.
47. Unrelated project metadata/theme/locale does not create semantic staleness.
48. Correct successor is target-yoke-geometry planning, not execution.
49. Stage 87 does not calculate yoke depth, neck count, decrease rate/cadence, polo
    opening, placket, collar, short rows, or shaping rounds.

### Route, presentation, storage, and regression

50. Route/application projection fails closed without production Stage 86.
51. Presentation contains no fingerprints, UUIDs, repository revisions, internal IDs,
    zero-based coordinates, or formulas.
52. UI exposes all meaningful confirmations without a giant single checkbox or
    meaningless microsteps.
53. Existing `progress` store and scope-epoch index are used; DB remains V4 with no new
    store/index/migration.
54. Repository transaction writes project/progress/operation/checkpoint/meta atomically.
55. Regression suites for Stages 77–86, sleeve/body/underarm, navigation, route, and
    calculation continue to pass. Until Stage 86 is implemented, its absence is an
    explicit blocked-start test, not a fabricated passing suite.

## 22. Regression results

Executed against the pre-existing worktree on 2026-08-09:

### JavaScript/domain/application/navigation

Command: one `node --test --test-concurrency=1` run over the relevant Stage 77–85
domain/workspace suites plus `project-navigation-dom.test.cjs`.

```text
tests:     104
passed:    104
failed:    0
cancelled: 0
skipped:   0
todo:      0
exit code: 0
```

This includes production domain/application/repository paths for construction,
shaping policy, sleeve geometry/execution/pair validation, body confirmation,
underarm planning/execution, join-layout planning, and navigation. The Stage 85 test
explicitly proves the 220/40/180 fixture and that no Stage 86/join side effect exists.

### Python/UI/calculation

Command: targeted `python -m pytest` over the Stage 77–85 UI suites and
`tests/test_sleeve_planning.py`.

```text
tests:  154
passed: 154
failed: 0
exit code: 0
```

Pytest emitted one non-test-failure cache warning because `.pytest_cache` could not be
created at an already-existing path. A preliminary attempt using
`.venv\Scripts\python.exe` was blocked by Windows Application Control before pytest
started; the available system Python run above completed successfully.

### Stage 86 qualification

There are no production Stage 86 files or tests to execute. The only Stage 86 artifact
is `STAGE_86_ARCHITECTURE_FINDING.md`. Reported regression totals therefore do not
mislabel architecture prose as a runtime test. Combined executed result: **258 passed,
0 failed**.

## 23. Git state confirmation

Before this document was created:

- `git status --short` contained 361 pre-existing entries;
- `STAGE_87_ARCHITECTURE_FINDING.md` did not exist and had no status entry;
- no `STAGE_*_ARCHITECTURE_FINDING.md` file was tracked by the current Git index;
- `git diff --check` and `git diff --cached --check` reported no whitespace error
  (only pre-existing LF-to-CRLF warnings for unrelated tracked files).

This task creates only `STAGE_87_ARCHITECTURE_FINDING.md`. The existing dirty worktree
is preserved. No production/test/fixture/UI/schema file was modified; no file was
staged; no commit, push, reset, checkout, clean, or stash was performed.

STAGE 87 ARCHITECTURE FOUND
