# Stage 86 architecture finding: raglan interface planning

Scope: architecture finding only. This document does not create or modify Stage 86
production code, domain/application/workspace/assistant code, HTML, CSS, routes,
fixtures, tests, package scripts, IndexedDB schema, or any Stage 77-85 contract or
result. It does not move or join stitches, place physical markers, work a setup round,
or perform raglan shaping. The pre-existing dirty worktree is left untouched.

## 1. Finding and exact Stage 86 identity

The next minimal boundary after a current completed Stage 85 is:

```text
domain identity:   PROJECT_RAGLAN_INTERFACE_PLANNING
contract identity: RAGLAN_INTERFACE_PLANNING_CONTRACT_V1
result identity:   RAGLAN_INTERFACE_PLAN_V1
contract version:  1
output boundary:   raglan_interface_plan_completed
```

The proposed name and scope are supported by both the implemented architecture and
the knitting semantics. Stage 84 already fixes four interfaces and their cyclic order,
but deliberately stores only `raglanBoundarySemantics: interface_locations_only` and
`raglanLineStitchOwnership: unresolved_later_boundary`. Stage 85 consumes that exact
layout, physically allocates all four underarm groups, and explicitly forbids raglan
ownership, setup-round, join, and combined-yoke fields. Its completed projection names
`raglan_interface_planning_not_implemented` as the next unavailable successor.

Stage 86 must therefore close exactly one remaining design/topology question: how the
four raglan interfaces are represented in the future joined working round. It plans
the line width, existing-stitch ownership, marker anchors, and count conservation. It
does not perform the join that would make that planned cyclic sequence physical.

The lifecycle sequence is:

```text
Stage 85 physical allocation confirmation
  -> Stage 86 raglan interface planning
  -> Stage 87 body/sleeves join execution and explicit confirmation
  -> later raglan shaping planning
  -> later yoke execution
```

This is the established YarnAI ordering `planning -> physical action -> explicit
physical confirmation`. Joining before Stage 86 would force the physical executor to
invent line width, ownership, and marker meaning. Combining Stage 86 with joining would
mix a genuine user design decision with a physical action and make safe review/rework
unnecessarily difficult.

## 2. Authoritative evidence from production Stages 77-85

The implemented chain, rather than earlier speculative stage names, establishes the
following:

| Stage | Authority relevant to Stage 86 | What it does not establish |
|---|---|---|
| 77 `PROJECT_CONSTRUCTION_STRATEGY_PLANNING` | User-confirmed `construction-strategy:body-sleeves-joined-raglan:v1` with topology `body_and_sleeves_joined_at_underarm_for_raglan_yoke` | Raglan-line width, marker topology, line ownership, or decrease placement |
| 78 `PROJECT_SHAPING_POLICY_PLANNING` V2 | User-confirmed `raglan_synchronized` or `raglan_differentiated`; the policy describes whether body/sleeve sections shape together or use separately calculated cadence | Exact decrease rounds, cadence, line width, ownership, or marker positions |
| 79 `PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING` | Bottom-up, in-round sleeve construction and BOR-flanking sleeve shaping method | Joined-yoke interface semantics |
| 80 `PROJECT_SLEEVE_PHYSICAL_EXECUTION` | Separate immutable physical Sleeve 1 and Sleeve 2 results and actual full-tube counts | Underarm allocation, join, or raglan topology |
| 81 `PROJECT_SLEEVE_PAIR_VALIDATION` | Acceptance of the exact current sleeve pair while preserving any unequal actual values | Averages, topology, or line design |
| 82 `PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION` | Actual body count at the pre-allocation underarm boundary | Body/sleeve join or line design |
| 83 `PROJECT_UNDERARM_ALLOCATION_PLANNING` | Equal live allocation policy and selected `H` | Exact line ownership or joined count |
| 84 `PROJECT_JOIN_LAYOUT_PLANNING` | Exact component ranges, future order, four interface locations, and future BOR | Intentionally leaves line stitch ownership unresolved |
| 85 `PROJECT_UNDERARM_ALLOCATION_EXECUTION` | Physical confirmation of four held live groups, active counts, forward traversal, and no join | Explicitly forbids line ownership, setup round, join, and actual joined-yoke count |

Stage 78's two policies do not answer the Stage 86 question. Their distributions say
which section families decrease on shaping rounds; they do not say whether a marker is
a zero-width boundary or whether one or more persistent stitches sit between the
paired decreases. Its `blockingPrerequisites` include
`combined_yoke_section_balance`, which Stage 86 helps supply, but Stage 78 never
supplies that balance itself.

Production Stage 84 is decisive. Its future order is:

```text
front -> right_sleeve_active -> back -> left_sleeve_active
```

and its four interfaces are:

```text
front -> right sleeve
right sleeve -> back
back -> left sleeve
left sleeve -> front
```

The last interface is the future beginning of round. Stage 85 validates these values
byte-for-byte, requires `forward_in_component_coordinates`, and completes with
`physicalJoinApplied: false` and `underarmsClosed: false`.

No Stage 77-85 input, contract, test, canon section, pattern field, or fixture defines
a raglan-line stitch count, width, decorative motif, marker-only rule, or ownership
rule. A repository-wide search finds only the explicit unresolved/forbidden references
above. The missing value is therefore a real user/design decision, not a derivation
that YarnAI may fill by convention.

## 3. Immediate predecessor and transitive bindings

The minimal immediate predecessor is the current immutable completed Stage 85 result:

```text
UNDERARM_ALLOCATION_EXECUTION_RESULT_V1
outputBoundary = underarm_allocation_physically_confirmed
```

It is the physical gate because it proves all four reserved groups were processed
exactly, remain live, match the Stage 84 intervals/orientations, and were not bound off,
closed, joined, dropped, or duplicated.

Following the fail-closed Stage 84-85 pattern, a future Stage 86 application must still
reconstruct and bind the exact current Stage 77-85 chain, not trust the shallow Stage
85 presentation projection. The binding set is:

1. `PROJECT_CONSTRUCTION_STRATEGY_PLANNING`;
2. `PROJECT_SHAPING_POLICY_PLANNING`;
3. `PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING`;
4. `PROJECT_SLEEVE_PHYSICAL_EXECUTION`;
5. `PROJECT_SLEEVE_PAIR_VALIDATION`;
6. `PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION`;
7. `PROJECT_UNDERARM_ALLOCATION_PLANNING`;
8. `PROJECT_JOIN_LAYOUT_PLANNING`;
9. `PROJECT_UNDERARM_ALLOCATION_EXECUTION`.

Each binding needs the established progress ID, repository revision, state identity,
and state fingerprint. Stage 86 additionally binds the Stage 85 result identity and
fingerprint and the Stage 84 plan/layout fingerprints. This is deliberate independent
currentness validation, not a second reconstruction of geometry.

The result should copy only the normalized values necessary to define its own
topology: the four Stage 84 active-section ranges and interface offsets, Stage 85
active counts/conservation, selected interface model, exact derived partitions, BOR,
and marker anchors. It should not duplicate the complete raw Stage 79-85 payloads.

## 4. Known facts at the Stage 86 entry boundary

For a current completed Stage 85, the following are authoritative:

- all four underarm groups are live on temporary carriers;
- no underarm group was bound off or closed;
- the body and both sleeves are not physically joined;
- traversal is forward in each component's coordinates;
- body active count, Sleeve 1 active count, and Sleeve 2 active count are physically
  supported separately;
- total physical live count includes both held and active stitches;
- temporarily held live count is separate from the yoke-eligible working count;
- the raw pre-join eligible count is physically supported but not joined;
- Sleeve 1/Sleeve 2 side mapping and orientation are fixed;
- front, right sleeve, back, and left sleeve active ranges are exact zero-based,
  half-open cyclic intervals;
- future order is front, right sleeve, back, left sleeve;
- the four macro interface locations are exact;
- the future BOR is the macro boundary left sleeve to front;
- the selected Stage 78 shaping distribution is current context;
- no physical marker has been placed and no setup/decrease round has been worked.

For the Stage 85 happy-path fixture only, the values are:

```text
body active                    = 80
Sleeve 1 active                = 50
Sleeve 2 active                = 50
temporarily held live          = 40
total physical live            = 220
pre-join eligible working E    = 180
```

These numbers are evidence for the fixture, not production constants. Production must
always derive the values from the current Stage 85 result.

## 5. What is genuinely missing

The first missing authority is the visual/structural treatment shared by the four
raglan lines:

- whether the interface has zero dedicated stitches and is only a boundary marker;
- whether one persistent stitch forms each line;
- whether two persistent stitches form each line;
- whether a wider/decorative line is intended;
- if stitches are dedicated, which exact existing physical stitches are reclassified
  from component sections into interface groups;
- exactly where each marker sits relative to a non-zero-width line;
- the refined BOR position relative to interface 4;
- whether setup creates or consumes stitches.

The repository proves none of these. The Stage 86 V1 decision must be uniform across
all four interfaces. Per-interface widths, asymmetric line designs, cables, lace,
colourwork, or another decorative motif introduce additional design and repeat/phase
questions and are outside the minimal V1 contract.

## 6. External knitting evidence and its limit

External sources confirm that the missing choice is real and that several constructions
are legitimate:

- Tin Can Knits describes raglan markers as landmarks between sections and works
  shaping on both sides of the marker; it also shows that the visual result changes
  with decrease choice and distance from the marker:
  https://blog.tincanknits.com/2021/05/06/how-to-use-stitch-markers/
  and https://blog.tincanknits.com/2024/07/25/decrease-lines/
- Its bottom-up construction tutorial confirms that the remaining body and sleeve
  stitches are joined into the yoke after live underarm groups are held:
  https://blog.tincanknits.com/2017/03/28/lets-knit-a-bottom-up-sweater/
- Knitty's Cammac pattern explicitly uses four-stitch raglan lines, proving that a
  raglan line need not be zero or one stitch wide:
  https://knitty.com/ISSUEdf20/PATTcammac/PATTcammac.php
- A published Interweave pattern places one stitch between a marker pair, proving a
  one-dedicated-stitch construction:
  https://www.interweave.com/wp-content/uploads/Knitting-Daily-TV-Series-400-All-Patterns-v4.pdf

Some examples are top-down. They are used only to establish the direction-independent
fact that raglan interface width and marker treatment vary. They do not select a
bottom-up YarnAI policy. Existing project authority remains primary, and the absent
design decision must still be made explicitly by the user.

## 7. Admissible interface models

### A. Zero dedicated raglan stitches

This model is admissible:

```text
interfaceModel = marker_boundary_only
lineStitchCountPerInterface = 0
dedicatedRaglanStitches = 0
```

Each interface is a gap between adjacent active groups. One marker identifies that
gap. Future decreases work relative to the marker. No physical stitch changes role,
and the planned joined working count is the Stage 85 pre-join eligible count.

### B. One dedicated raglan stitch per interface

This model is admissible under the deterministic existing-stitch ownership policy in
section 9:

```text
interfaceModel = existing_stitch_raglan_lane
lineStitchCountPerInterface = 1
dedicatedRaglanStitches = 4
```

The stitch is selected from the existing active section immediately before the
interface in forward traversal. It becomes part of a dedicated interface group, no
longer part of that section's core group, while retaining its immutable physical
component provenance. No stitch is cast on, consumed, duplicated, or removed from the
joined working total.

### C. Multiple dedicated raglan stitches

Exactly two stitches per interface are admissible in V1 under the same ownership and
conservation policy:

```text
interfaceModel = existing_stitch_raglan_lane
lineStitchCountPerInterface = 2
dedicatedRaglanStitches = 8
```

Stage 77 and Stage 78 do not prohibit wider lines, and their future shaping semantics
can operate around a stable two-stitch lane. Stage 86 must nevertheless validate that
each contributing source section retains at least one core stitch after the split.

Three or more stitches, cables, lace, colourwork, or any other decorative lane are
structurally possible in knitting but not generically safe in Stage 86 V1. They need a
separate versioned decorative-line design with exact width, motif, repeat/phase,
minimum-section, and shaping interaction. V1 must not accept an arbitrary integer or
free-text motif and pretend it is executable.

### D. New, picked-up, shared, or consumed stitches

No existing YarnAI source establishes a policy that casts on new raglan stitches,
picks them up, consumes boundary stitches, or shares one physical stitch between two
groups. These models are rejected in V1.

In particular, a stitch cannot be counted simultaneously in a body/sleeve core and a
raglan line. A conceptual boundary may be shared; a physical stitch identity may not.

## 8. First genuinely missing UX question

The first user-facing question should be:

> Как должна выглядеть линия реглана между корпусом и рукавами?

The V1 answer cards should be visual and human-readable:

1. **Только аккуратная граница** — отдельной петли в линии нет; убавки будут идти по
   обе стороны от маркера.
2. **Тонкая линия из одной лицевой петли** — между убавками остаётся одна постоянная
   петля.
3. **Двойная лицевая линия** — между убавками остаются две постоянные петли.

Each card should show a small swatch/diagram of the resulting line. The user should not
see enums, interface IDs, zero-based offsets, ownership provenance, or fingerprint
data. The card itself determines width `0`, `1`, or `2`; YarnAI must not ask the user
to calculate a stitch count.

If none of the three appearances is intended, the UI should explain that a wider or
decorative raglan line requires a separately supported design flow. It must not store
"other" free text as a completed executable V1 plan.

This question is a design choice, not a physical-action confirmation. Opening the page
or showing a default preview must not persist a selection. Completion requires explicit
review and confirmation.

## 9. Deterministic ownership model

Let the Stage 84/85 active sections in future traversal be:

```text
Q0 = front
Q1 = right sleeve active
Q2 = back
Q3 = left sleeve active
```

and let `w` be the selected uniform line width in `{0, 1, 2}`. Interface `Ii` is after
`Qi` and before `Q(i+1 mod 4)`.

For `w = 0`, `Ii` owns no physical stitch and `Qi.core = Qi`.

For `w > 0`, Stage 86 V1 uses:

```text
ownershipPolicy = preceding-section-forward-suffix:v1
Ii.line = the last w stitches of Qi in Stage 84 forward traversal
Qi.core = Qi without that non-overlapping suffix
```

For a Stage 84 cyclic active range `R(start, count, total)`:

```text
coreRange = cyclicRange(start, count - w, total)
lineRange = cyclicRange((start + count - w) mod total, w, total)
```

Stage 86 must require `count - w >= 1` for every section. For `w = 0`, no zero-length
range object is stored; the interface has `sourceInterval = null` and the original
range remains the core.

The per-interface source ownership is therefore:

| Interface | Adjacency | Source of dedicated stitches when `w > 0` |
|---|---|---|
| 1 | front -> right sleeve | suffix of the Stage 84 front active range |
| 2 | right sleeve -> back | suffix of the physical right sleeve's active range |
| 3 | back -> left sleeve | suffix of the Stage 84 back active range |
| 4 | left sleeve -> front | suffix of the physical left sleeve's active range |

This is an internal deterministic partition policy, not an additional visual design
choice. Selecting the preceding suffix preserves Stage 84 forward traversal and lets
its interface offsets remain unchanged. It also refines the Stage 84 BOR without
moving it to another macro component boundary.

Every dedicated line stitch:

- retains its source component and exact component-coordinate identity;
- remains live and eligible for the future joined round;
- is removed from the source section's **core** count;
- is counted once in exactly one raglan interface group;
- is never counted simultaneously in the source core and the interface;
- does not change total physical live stitches or planned joined active stitches.

This distinction between physical provenance and topology role prevents hidden
body/sleeve/raglan overlap.

## 10. Immutable cyclic topology representation

Stage 86 should project one immutable cyclic sequence starting at the refined BOR.

For marker-only interfaces:

```text
front core
  -> marker 1
  -> right sleeve core
  -> marker 2
  -> back core
  -> marker 3
  -> left sleeve core
  -> marker 4 / BOR
```

For dedicated interfaces:

```text
front core
  -> interface 1 stitches
  -> marker 1
  -> right sleeve core
  -> interface 2 stitches
  -> marker 2
  -> back core
  -> interface 3 stitches
  -> marker 3
  -> left sleeve core
  -> interface 4 stitches
  -> marker 4 / BOR
```

The internal model remains:

- zero-based;
- half-open for all non-empty intervals;
- cyclic;
- forward in component coordinates;
- ordered from BOR;
- explicit about source component and source interval;
- explicit about planned joined-round offsets;
- free of duplicate stitch identity.

Markers are zero-width topology anchors, not stitches. Exactly four physical raglan
markers are planned. A marker sits at the trailing edge of its interface group and
before the following core section. With `w = 0`, that is simply the section boundary.
With `w > 0`, future shaping can work one decrease before the known line group and one
after its marker without requiring eight physical markers.

The UI converts component ranges to one-based inclusive labels and renders section
names such as "перед", "правый рукав", "спинка", and "левый рукав". Canonical storage
never uses those display labels as stitch coordinates.

## 11. BOR semantics

Stage 84 defines BOR at the macro boundary `left_sleeve_to_front`. That remains correct
for every V1 model.

- With `w = 0`, marker 4 is the zero-width interface and the BOR marker.
- With `w > 0`, interface 4 is the suffix of the left sleeve active range; the BOR is
  its trailing boundary, **after interface 4 and before the front core**. Marker 4
  carries both `raglan_interface` and `beginning_of_round` roles and should be visually
  distinct in the future physical workflow.

Thus Stage 86 refines, rather than contradicts, the Stage 84 macro boundary. It does
not silently put BOR before the dedicated lane, inside it, or after the first front
stitch.

If a future contract allows newly created interface stitches, it must explicitly
revisit this refinement. That is outside V1.

## 12. Stitch conservation and count terminology

Let:

```text
Bact = Stage 85 body active count
Ract = active count of the physical right sleeve
Lact = active count of the physical left sleeve
E    = Bact + Ract + Lact
w    = selected line width per interface, 0 | 1 | 2
D    = 4w dedicated raglan stitches
C    = E - D total section-core stitches
T    = Stage 85 total physical live stitches, including held underarms
Hld  = Stage 85 temporarily held live stitches
```

Required V1 identities are:

```text
T is unchanged by Stage 86 planning
E = T - Hld
D = 4w
C = sum(frontCore, rightSleeveCore, backCore, leftSleeveCore)
C + D = E
```

For each source section `Qi`:

```text
Qi.coreCount + Ii.lineCount = Qi.Stage85ActiveCount
Ii.lineCount = w
```

No physical stitch is created, consumed, shared, or duplicated. Dedicated line
stitches are a partition of the existing `E`, not an addition to it.

Count classifications after Stage 86 planning are:

| Value | Status |
|---|---|
| `T`, total physical live stitches | Authoritative physical Stage 85 fact; includes held underarms |
| `Hld`, temporarily held live stitches | Authoritative physical Stage 85 fact |
| `E`, pre-join eligible working stitches | Authoritative physically supported Stage 85 fact across three unjoined components |
| `D = 4w`, dedicated raglan stitches | Authoritative **planned topology partition** after Stage 86 completion |
| `C = E - D`, section-core stitches | Authoritative **planned topology partition** after Stage 86 completion |
| Expected joined active working count | Authoritative as a Stage 86 plan and equal to `E` under V1 no-create/no-consume semantics |
| Actual joined active working count | Absent until Stage 87 physical join confirmation |
| Future shaping count after decreases | Unknown; belongs to later shaping planning/execution |

Once Stage 86 closes the semantics, the contract may use the precise field
`expectedJoinedActiveWorkingStitchCount`. It must not use the ambiguous generic term
`combinedYokeCount`. It must never label `E` as an actual joined count before the join.

Fixture illustration only:

| Model | `E` | Dedicated `D` | Core `C` | Expected joined active |
|---|---:|---:|---:|---:|
| marker-only (`w=0`) | 180 | 0 | 180 | 180 |
| one stitch (`w=1`) | 180 | 4 | 176 | 180 |
| two stitches (`w=2`) | 180 | 8 | 172 | 180 |

The fixture total physical live count remains 220 and held live remains 40 in every
row. These values must not become production constants.

## 13. Marker planning versus physical marker placement

Stage 86 owns marker **topology**:

- four marker identities in canonical interface order;
- each marker's adjacent sections;
- its planned joined-round offset;
- its position after the interface lane and before the following section;
- marker 4's additional BOR role;
- human-readable placement instructions for the successor.

Stage 86 does not own marker **placement**. All four `physicalMarkerPlaced` values are
false/absent in the completed plan. The next physical join stage places markers while
traversing the exact planned boundaries and confirms their resulting positions.

Marker placement and component joining should not be separated into independent
physical stages. A marker is placed precisely when the join traversal crosses an
interface; its correctness is meaningful only relative to the components just worked.
They are dependent steps in one continuous physical workflow and one join result.

## 14. Ordering decision: plan, then join, then shape

The selected lifecycle ordering is Option 1, specialized as follows:

```text
raglan interface planning (Stage 86)
  -> body/sleeves join + marker placement execution (Stage 87)
  -> explicit join result confirmation inside Stage 87
  -> raglan shaping planning (later)
```

Option 2, joining first, is unsafe because the executor would not know whether the
line owns zero, one, or two stitches or where its marker sits. Option 3, combining
interface planning with join execution, mixes an independently reviewable design
decision with an irreversible physical transition.

A separate post-execution `JOIN_CONFIRMATION` stage is not required if Stage 87 follows
the established Stage 85 pattern: instruction and observations in `in_progress`, an
explicit `reviewing_result`, then immutable `completed`. The confirmation boundary is
still explicit; it simply belongs to the physical executor that owns the observations.

## 15. Exact prerequisites for physical joining

Stage 87 may start only when all of the following are current and validated:

1. a completed current Stage 85 result at
   `underarm_allocation_physically_confirmed`;
2. all four processed counts match `H` and all held groups remain live;
3. Stage 85 active body/Sleeve 1/Sleeve 2 counts and conservation are valid;
4. the exact current Stage 84 ranges, side/orientation mapping, forward traversal,
   section order, interface offsets, and macro BOR are unchanged;
5. a completed current Stage 86 plan with width `0`, `1`, or `2`;
6. exact non-overlapping source/core/interface partitions for all four sections;
7. four marker anchors and the refined BOR are defined;
8. no interface stitch is created, consumed, shared, or duplicated in V1;
9. every source core retains at least one stitch;
10. no physical join, conflicting recovery, or incompatible downstream execution has
    already started.

Operational readiness may additionally confirm that the user has an appropriate
circular needle, working yarn, and four markers, with the BOR marker distinguishable.
Those tool checks need not become immutable geometry unless a future action policy
proves they change the physical result.

What is still absent after Stage 86 is an actual joined round/count, actual marker
placement, physical no-twist/order confirmation, and any raglan decrease schedule.

## 16. Relationship to Stage 78 shaping policy

Stage 78 is necessary but insufficient for future shaping arithmetic.

- `raglan_synchronized` says body and sleeve sections decrease together on shaping
  rounds.
- `raglan_differentiated` permits separately calculated body/sleeve cadence.
- Neither policy defines the exact first joined count, core section counts, persistent
  line stitches, decrease anchors, exact rows, neckline interaction, or final depth.

Stage 86 should provide the later shaping planner with:

- the current Stage 78 policy identity/value;
- the four ordered core section identities and counts;
- the four ordered interface identities and their uniform width;
- exact interface source ranges and marker offsets;
- explicit left/right adjacency for each interface;
- refined BOR;
- `expectedJoinedActiveWorkingStitchCount = E`;
- `dedicatedRaglanStitchCount = 4w`;
- the invariant that dedicated line stitches persist unless a later versioned shaping
  policy explicitly consumes them;
- the no-create/no-consume setup policy.

That is enough to make a future shaping calculation well-defined at its entry boundary.
It is not enough to calculate decrease rows, cadence, yoke depth, neckline, or final
stitch count now. Those remain strict Stage 86 exclusions.

## 17. Minimal Stage 86 lifecycle

`ready` is a read-only application projection. Persisted lifecycle is:

```text
collecting_interface_design
  -> reviewing_interface_plan
  -> completed
```

- `collecting_interface_design` begins only after an explicit start operation and holds
  the user's selected human-readable V1 appearance.
- Once the choice uniquely derives every partition, marker, BOR, and conservation
  value, the state moves directly to `reviewing_interface_plan`.
- `reviewing_interface_plan` shows the four lines, exact consequences, and expected
  count without asking for derivable numbers.
- `completed` freezes `RAGLAN_INTERFACE_PLAN_V1` after explicit confirmation.
- Correction after completion creates a new contiguous Stage 86 epoch.
- `blocked` and `stale` are derived projections, not stored completed lifecycles.

There is no `in_progress`, `paused`, or component execution lifecycle because Stage 86
performs no physical work. There is no need for a separate `collecting_width` state:
the appearance card supplies the supported width deterministically.

## 18. Minimal immutable result contract

The future `RAGLAN_INTERFACE_PLAN_V1` should contain:

- schema/contract version and output boundary;
- project ID, calculation ID, Stage 86 identity, epoch, predecessor identity, and
  superseded-plan identity;
- exact Stage 77-85 binding set and aggregate source fingerprint;
- direct Stage 85 state/result identities and fingerprints;
- Stage 84 plan/layout identities and fingerprints;
- current Stage 78 shaping-policy identity/value as context;
- copied Stage 85 active-count proof (`body`, `sleeve1`, `sleeve2`, `E`) and total-live/
  held-live references needed for conservation;
- `interfaceCount: 4`;
- one uniform `interfaceModel` and width `w`;
- line treatment (`none` for `w=0`, plain persistent knit lane for `w=1|2`);
- ownership policy (`none` or `preceding-section-forward-suffix:v1`);
- ordered per-interface records containing adjacency, source component, exact source
  interval or null, line count, planned joined interval, marker offset, and roles;
- ordered per-section records containing exact source range, core range/count, and
  conservation proof;
- immutable cyclic topology projection from refined BOR;
- marker topology with four planned markers and marker 4's BOR role;
- `expectedJoinedActiveWorkingStitchCount = E`, classified as planned/not physical;
- dedicated count `4w`, core count `E - 4w`, and no-overlap/conservation proofs;
- `createsStitches: false`, `consumesStitches: false`, `duplicatesStitches: false`;
- `physicalJoinApplied: false`, `physicalMarkersPlaced: false`,
  `setupRoundWorked: false`, and `raglanShapingApplied: false`;
- explicit review confirmation, operation UUID, timestamps, and canonical fingerprint.

The exact interval partitions and topology are necessary Stage 86 output; copying the
entire Stage 84 layout or all Stage 85 observations is not. Source identities and
fingerprints retain provenance without raw duplication.

The allowlist must reject:

- arbitrary width or decorative free text;
- per-interface asymmetric widths;
- a stitch identity owned by two active groups;
- new, picked-up, shared, or consumed line stitches;
- an actual joined-yoke count;
- physical marker-placement or join receipts;
- setup-round execution;
- any decrease row/cadence;
- yoke depth, neckline, collar, polo, placket, underarm closure, or project completion.

## 19. Staleness, rework, replay, and concurrency

Stage 86 currentness is reconstructed; completed bytes never acquire a mutable stale
flag.

| Replacement/change | Stage 86 effect | Historical result |
|---|---|---|
| Stage 77 joined-raglan topology replaced | Stale | Preserved unchanged |
| Stage 78 shaping policy replaced | Stale | Preserved unchanged |
| Stage 79 sleeve plan/BOR/gauge binding replaced | Stale | Preserved unchanged |
| Either Stage 80 sleeve physical result replaced | Stale | Preserved unchanged |
| Stage 81 acceptance replaced or no longer current | Stale | Preserved unchanged |
| Stage 82 body result replaced | Stale | Preserved unchanged |
| Stage 83 allocation plan replaced | Stale | Preserved unchanged |
| Stage 84 layout/order/range plan replaced | Stale | Preserved unchanged |
| Stage 85 physical result replaced/reworked | Stale | Preserved unchanged |
| Active calculation replaced | Non-current in old calculation | Preserved unchanged |
| Appearance choice corrected before physical join | New Stage 86 epoch | Prior plan preserved |
| Physical join already started | Normal Stage 86 rework blocked | Recovery domain required |
| Unrelated project revision | Optimistic conflict until reload, not semantic staleness | Preserved/current after reconstruction |

Required rules follow Stages 83-85:

- positive contiguous epochs per project/calculation/kind;
- epoch 1 has no predecessor; each later epoch names the prior Stage 86 identity;
- explicit rework names the superseded immutable plan;
- completed plan bytes and fingerprints never change;
- exact UUID replay returns the exact historical/current result without a new write;
- reuse of a UUID with different canonical semantics is rejected across all Stage 86
  epochs;
- project, repository, domain, source, and review revisions/fingerprints fence writes;
- current source bindings are re-read inside the atomic transaction;
- a stale Stage 86 plan cannot authorize Stage 87.

If Stage 87 has started, changing line width or ownership is no longer a planning-only
correction: physical stitches/markers may already be arranged. The system must not
pretend the components are still at the Stage 85 boundary; it requires an explicit
physical recovery workflow.

## 20. Storage reuse

No new store, index, or migration is justified. Reuse IndexedDB V4:

- `progress` for Stage 86 epochs;
- `operations` for idempotent commands and audit receipts;
- `checkpoints` for recovery;
- existing `projects` and `meta` records;
- existing unique `progress.by_scope_epoch =
  [project_id, calculation_id, kind, epoch]`;
- one atomic `projects` / `progress` / `operations` / `checkpoints` / `meta`
  transaction.

The future implementation adds only the supported progress kind and scoped repository
methods. It must not add `raglan_interfaces`, `markers`, or `yoke` stores, because all
Stage 86 data belongs to one immutable project/calculation planning aggregate.

## 21. Next physical boundary

The next physical stage should be:

```text
domain identity:   PROJECT_BODY_SLEEVES_JOIN_EXECUTION
result concept:    BODY_SLEEVES_JOIN_EXECUTION_RESULT_V1
output boundary:   body_sleeves_join_physically_confirmed
```

The exact contract/result names remain for Stage 87 architecture to finalize, but the
domain identity is precise: it joins body and sleeves, not the held underarms, and it
does not perform raglan shaping.

Its single continuous workflow should:

1. confirm the body, physical right sleeve, back, and physical left sleeve are oriented
   exactly as Stage 84/85 require;
2. start at the refined BOR after interface 4 and before the front core;
3. work the front core and any interface 1 lane stitches;
4. place marker 1, then work the right sleeve core and interface 2;
5. place marker 2, then work the back core and interface 3;
6. place marker 3, then work the left sleeve core and interface 4;
7. place the distinct marker 4/BOR;
8. complete/review the first continuous joined traversal without decreases;
9. explicitly confirm order, no twist/reversal, all four markers, actual active count,
   and no created/consumed/dropped/duplicated stitch;
10. freeze an immutable physical join result.

The actual joined active working count becomes authoritative only in that confirmed
result. For V1 it must equal the Stage 86 expected count `E`. Held underarm groups stay
live and unclosed. Marker placement belongs in this join stage because it occurs at the
exact transition between components; it does not need a separate execution domain.

Stage 87 must not perform a raglan decrease. Raglan shaping planning consumes the
confirmed physical join result and the Stage 86 topology afterward.

## 22. Future implementation test plan

### Source and boundary tests

- require the exact domain/contract/result identities and version;
- reconstruct and bind the exact current Stage 77-85 chain;
- require a current completed Stage 85 result and exact Stage 84 layout;
- reject missing, stale, imported-unproven, quarantined, conflicting, cross-project,
  or cross-calculation predecessors;
- reject malformed Stage 85 active/held/total conservation;
- reject changed forward traversal, section order, interface offsets, or BOR;
- prove `ready` is read-only and opening the route persists nothing;
- reject all physical action fields and side effects.

### Interface-model and UX tests

- complete marker-only (`w=0`) through the human-readable choice;
- complete one-stitch (`w=1`) and two-stitch (`w=2`) plans;
- reject arbitrary `w`, negative width, width greater than 2, non-integer width, and
  per-interface width differences;
- reject decorative/cable/lace/free-text completion in V1;
- ask the first missing appearance question and no derivable numeric question;
- require explicit user selection and final review confirmation;
- show visual, human-readable options and hide enums, zero-based ranges, UUIDs,
  fingerprints, revisions, epochs, and receipts;
- ensure a default preview cannot persist a decision.

### Ownership and topology tests

- marker-only interfaces own no stitch and have null source intervals;
- dedicated lines select the exact forward suffix of each preceding section;
- cover non-wrapped and wrapped cyclic source ranges;
- validate exact source component identity after Sleeve 1/2 side mapping;
- partition every source active range into core plus one interface suffix;
- prove no source stitch appears in two nodes;
- prove no active stitch disappears from the topology;
- reject duplicate, shared, overlapping, newly created, picked-up, or consumed stitches;
- reject a source section that would retain fewer than one core stitch;
- traverse exactly front, interface 1, right sleeve, interface 2, back, interface 3,
  left sleeve, interface 4;
- prove joined offsets are contiguous, half-open, zero-based, cyclic, and cover `E`
  exactly once;
- prove Stage 84 interface offsets remain unchanged by suffix reclassification.

### BOR and marker tests

- marker-only marker 4 is both interface and BOR;
- dedicated interface 4 ends immediately before BOR/front core;
- marker positions are after each interface lane and before the following core;
- exactly four marker plans exist for all widths;
- marker 4 carries both roles and presentation recommends a distinct appearance;
- reject BOR before interface 4, inside interface 4, or after the first front stitch;
- ensure Stage 86 stores no physical marker-placement confirmation.

### Conservation and count tests

- prove `E = bodyActive + sleeve1Active + sleeve2Active` from current source values;
- prove `D = 4w`, `C = E - D`, and `C + D = E`;
- prove per-section `core + line = source active`;
- prove total physical live and held live remain unchanged;
- classify `E` as physically supported pre-join and expected planned joined count, not
  as an actual joined count;
- reject any additive `E + 4w` calculation;
- reject `combinedYokeCount` and `actualJoinedActiveWorkingStitchCount` fields;
- cover unequal sleeve counts without averaging;
- cover the Stage 85 fixture for 0/1/2 widths while never hard-coding 80/50/50/180/220.

### Lifecycle, history, and storage tests

- `collecting_interface_design -> reviewing_interface_plan -> completed` only;
- malformed transitions fail closed;
- completed results are immutable;
- rework appends an exact contiguous epoch and preserves prior bytes;
- replacement/rework of each Stage 77-85 predecessor makes the current projection
  stale without mutating history;
- exact UUID replay is idempotent within and across epochs;
- conflicting UUID reuse is rejected;
- stale project, repository, domain, source, and review fences are rejected;
- two-tab races cannot overwrite a choice/review/completion;
- a join that has started blocks normal Stage 86 rework;
- IndexedDB remains V4, no store/index/migration is added, and the established atomic
  transaction leaves no partial write on failure.

### Successor and absence-of-side-effects tests

- a completed current Stage 86 plan exposes Stage 87 readiness only;
- Stage 87 projection receives exact topology, marker anchors, BOR, and expected count;
- no Stage 86 command joins components, places markers, works a round, decreases,
  closes underarms, or changes total physical live stitches;
- no route or production implementation for Stage 87+ is added in Stage 86 scope;
- no decrease rows, cadence, yoke depth, neckline, collar, polo, placket, or project
  completion fields exist.

## 23. Strict Stage 86 exclusions

Stage 86 must not:

- physically join body and sleeves;
- transfer, cast on, pick up, consume, duplicate, bind off, close, or drop stitches;
- repeat Stage 85 underarm allocation;
- place physical markers;
- work a setup or joining round;
- perform a raglan decrease;
- calculate decrease rows or cadence;
- calculate yoke depth or a final shaping count;
- form neckline, collar, polo, or placket;
- close held underarms or finish the garment;
- call an expected count an actual joined count;
- mutate Stage 65 or any Stage 77-85 plan/result;
- add a Stage 87+ production route, store, index, migration, or package script;
- treat fixture values as production constants;
- commit, push, stage, reset, clean, checkout, or stash.

## 24. Validation performed for this finding

The implemented predecessor chain was run without changing production files:

| Command | Result |
|---|---|
| `npm run test:stage77` | PASS: 7 tests |
| `npm run test:stage78` | PASS: 8 tests |
| `npm run test:stage79` | PASS: 28 tests |
| `npm run test:stage80` | PASS: 12 tests |
| `npm run test:stage81` | PASS: 10 tests |
| `npm run test:stage82` | PASS: 7 tests |
| `npm run test:stage83` | PASS: 7 tests |
| `npm run test:stage84` | PASS: 7 tests |
| `npm run test:stage85` | PASS: 10 tests |

Total: 96 focused predecessor tests passed. They confirm the source chain, deliberate
unresolved ownership, physical Stage 85 conservation, forward traversal, immutable
history, replay/conflict behavior, staleness, and IndexedDB V4 reuse on which this
finding relies.

## 25. Conclusion

Stage 85 has made the underarm allocation physically authoritative, but the body and
sleeves are still separate. Stage 84 already supplies the four interface locations,
section order, and macro BOR while explicitly deferring raglan-line stitch ownership.
Stage 77 and Stage 78 do not close that gap. The next minimal boundary is therefore
`PROJECT_RAGLAN_INTERFACE_PLANNING`.

The first missing decision is how the four lines should look. Stage 86 V1 supports a
marker-only boundary, one persistent stitch, or two persistent stitches per line. For
non-zero width it deterministically reclassifies the forward suffix of each preceding
active section into a non-overlapping interface group. The stitches keep their physical
provenance, remain live, and stay inside the same expected joined working count.

Stage 86 plans exactly four markers and refines BOR to the trailing edge of interface 4,
after the left-sleeve line and before the front core. It creates no physical fact. The
next stage is `PROJECT_BODY_SLEEVES_JOIN_EXECUTION`, which joins the components, places
those markers in the same continuous workflow, and explicitly confirms the actual
joined count before any raglan shaping is planned.

STAGE 86 ARCHITECTURE FOUND
