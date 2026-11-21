# Stage 91 architecture finding: neckline and structural opening planning

This document is the Stage 91 architecture finding only. It does not create production
code, a route, UI, fixture, migration, or Stage 91 test. The conclusions below are based
on the production Stage 77-90 chain and its tests, not on the successor name alone.

## 1. Executive verdict

The direct successor of the immutable Stage 90 physical result remains:

```text
kind/domain:       PROJECT_NECKLINE_OPENING_PLANNING
contract schema:   NECKLINE_OPENING_PLANNING_CONTRACT_V1
contract version:  1
result schema:     NECKLINE_OPENING_PLAN_V1
result version:    1
output boundary:   neckline_opening_plan_completed
route:             /project-neckline-opening-planning
direct successor:  PROJECT_NECKLINE_OPENING_EXECUTION
```

The name is correct if **opening** means the structural opening boundary, not a finished
polo placket. Stage 91 must jointly freeze the neckline geometry, optional front-opening
method and timing, the cyclic-to-linear transition, and one exact executable stitch/row
schedule. Those facts are coupled: choosing the center-front stitches or a cut line
changes the two fronts, row edges, symmetry, live/held/bound-off accounting, and the
neckline schedule.

Stage 91 must not design or work the finished placket bands or collar. It records the
edge contract needed by later finishing (edge identities, overlap intent, reserved edge
stitches, and pickup boundary). Exact band/collar pickup counts, buttonholes, ribbing,
collar shape, and their physical work belong after the neckline/opening has actually
been realized.

This is a refined Variant D:

```text
Stage 90 physical closed post-raglan boundary
  -> Stage 91 structural neckline/opening planning
  -> PROJECT_NECKLINE_OPENING_EXECUTION
  -> PROJECT_NECKLINE_EDGE_FINISHING_PLANNING
       generic edge/collar core + optional polo-placket extension
  -> PROJECT_NECKLINE_EDGE_FINISHING_EXECUTION
  -> remaining finishing, including held-underarm closure
```

It combines the interdependent part of Variant A and applies Variant B to the later
placket/collar finish. Splitting the structural opening from neckline planning (Variant
C) would let two planners own the same center-front rows and cannot conserve topology.
Combining collar and finished bands into Stage 91 would plan against edges which do not
yet physically exist.

## 2. What production Stages 77-90 already own

The existing chain is internally consistent and leaves a narrow new boundary.

| Stage | Authoritative fact Stage 91 must preserve |
|---|---|
| 77 `PROJECT_CONSTRUCTION_STRATEGY_PLANNING` | Bottom-up joined-raglan construction and its immutable design/source provenance. |
| 78 `PROJECT_SHAPING_POLICY_PLANNING` | Synchronized or differentiated raglan policy. Stage 91 may reference it but cannot reinterpret it. |
| 79-82 | Applicable main gauge provenance; physical sleeve results/pair decision; physically confirmed body boundary. |
| 83-85 | Exact underarm allocation and four live held groups. They remain live, separate, and outside the working yoke. |
| 84-86 | Cyclic layout, section identities, four interfaces/markers, widths `0/1/2`, ownership, and BOR at marker 4 before `front`. |
| 87 | Physical join, round 1 exactly once, no raglan decreases, and the realized markers/BOR. |
| 88 | Closed base-yoke endpoint, exact target section counts, gauge binding, `necklineDepthReferenceCm`, and `poloWorkDeferred = true`. |
| 89 | Every closed BOR-to-BOR raglan round `2..T`; no opening, neckline, placket, collar, bind-off, or pickup action. |
| 90 | Immutable proof that all Stage 89 rounds are physically complete and the exact closed terminal topology/counts exist. |

Production confirms the following exact terminal facts:

- section order is `front -> right_sleeve_active -> back -> left_sleeve_active`;
- BOR is marker 4, after `left_sleeve_to_front` and before `front`;
- the four raglan interface markers and width/ownership remain as Stage 86 defined them;
- terminal counts are exact per section, active total, held total, and total physical live;
- the four underarm groups are still live and held;
- the work is still a closed cyclic round;
- no neckline, opening, placket, collar, or underarm closure has occurred;
- the completed Stage 90 result is immutable.

Stage 88 stores the existing neckline depth only as
`topBoundary.necklineDepthReferenceCm`; its production source comes from the Stage 61
`necklineDepth` garment field. It is a vertical design reference, not a neckline width,
opening length, center count, collar circumference, pickup ratio, or schedule. Body neck
circumference is likewise a reference and not an implicit finished neckline target.

Stage 88's only production timing mode is `closed_base_yoke_before_polo`. Stage 89 turns
that into `closedForEntireSchedule = true` and
`openingAndNecklineWorkDeferred = true`; Stage 90 rejects a source that says otherwise
with `POLO_OPENING_BOUNDARY_REQUIRED`. There is therefore already an authoritative
timing decision for this physical history: opening/neckline work did not begin during
raglan. Stage 91 must not ask that question again or pretend the earlier rows are still
unworked.

There is no authoritative center-front marker, polo method, opening width/depth,
neckline width, finished placket construction, or collar plan. The Stage 88
`explicitPoloFeature` string heuristic is not a versioned product-feature decision and
must not be treated as one.

## 3. Physical knitting semantics

### 3.1 Neckline timing

In bottom-up raglan construction, front-neck shaping may begin before raglan shaping is
complete. Published patterns explicitly work neck and raglan shaping at the same time,
often after binding/holding center-front stitches and then working back and forth. See
the [Mahakam instructions](https://knitty.com/ISSUEff20/PATTmahakam/TEMPLATEpatternFF18.html),
the [Chicory instructions](https://knitty.com/ISSUEss22/PATTchicory/TEMPLATEpattern.html),
and the [DROPS Little Pernille bottom-up raglan](https://www.garnstudio.com/pattern.php?cid=13&id=361&page=2).
Working a bottom-up raglan wholly in the round naturally gives front and back necks the
same depth unless a later shaping method, such as short rows, changes that relationship;
Knitty's [raglan construction article](https://knitty.com/ISSUEfall04/FEATfall04TBP.html)
describes that limitation.

Consequently:

- neckline shaping does not inherently wait for raglan completion;
- it commonly creates a flat/turning-row interval and can coexist with remaining raglan
  decreases;
- it does not inherently require permanent linear topology: a level closed neck can end
  in the round, and short rows can temporarily turn while the underlying live boundary
  remains cyclic; only a center-front removal/split (or realized cut) permanently creates
  two front edges;
- but in this YarnAI history it **must** start only after Stage 90, because Stages 88-90
  have immutably planned and physically worked the entire earlier span as closed rounds;
- if the requested neckline/opening needs to start in any Stage 89 round, Stage 91 must
  return `UPSTREAM_NECKLINE_TIMING_REWORK_REQUIRED`, not synthesize a post-raglan plan.

A completed Stage 90 does not prove that every desired post-raglan neckline is possible.
Stage 91 must prove that the current terminal boundary is a valid start for the selected
method and final geometry. A deeper no-cut opening cannot be inserted retrospectively
below the current live edge.

### 3.2 Structural opening methods

“Polo opening” is not one physical operation. At least these method families exist:

1. `none`: no vertical front opening; only a neckline boundary is shaped.
2. `split_from_current_live_edge`: the current live round is divided at center front and
   subsequent fabric is worked flat. No already-worked fabric below the split is opened.
3. `reserved_steek_cut`: a deliberately planned bridge is reinforced and cut; bands may
   then be picked up from the realized edges.
4. `authorized_reinforced_cut`: an existing fabric/pattern contract explicitly approves
   reinforcement and cutting without a previously reserved bridge.
5. `integrated_live_placket`: dedicated band/overlap stitches are worked as part of the
   flat structural schedule.

These are architecture choices, not hidden implementation assumptions. A steek is a
worked bridge which is reinforced before cutting; Brooklyn Tweed's
[steeking tutorial](https://brooklyntweed.com/pages/steeking) demonstrates the bridge,
reinforcement, cut, and later band pickup. The Stage 77-90 source contains no reserved
center-front steek contract. Stage 91 therefore must reject `reserved_steek_cut` unless a
validated upstream/source-pattern result proves that bridge; it must reject an ordinary
cut unless a versioned cut-eligibility contract proves yarn/fabric/method suitability.
It may never infer cut safety from “polo” or from stitch pattern text.

The current production path can use `split_from_current_live_edge` only when the desired
opening begins exactly at the Stage 90 boundary and all required fabric lies after it.
Otherwise it needs an explicitly authorized cut method or upstream physical recovery.

### 3.3 Placket and collar boundary

Placket bands can be worked later by picking up along already-realized edges. Published
examples do exactly that: Knitty's [His Mark cardigan](https://knitty.com/ISSUEw14/PATThismark/PATThismark.php)
cuts steeks and then picks up front-band stitches, while its
[button-band technique article](https://knitty.com/ISSUEwinter04/FEATwin04TT.html) treats
pickup rate and band work as an edge-finishing operation. DROPS likewise demonstrates
[neck stitches picked up after the garment edge exists](https://www.garnstudio.com/video.php?id=1787&lang=en).

Therefore Stage 91 records a future pickup boundary but does not calculate a final
pickup count against a merely planned physical edge. An integrated live placket is the
exception: its structural edge/overlap stitches affect every Stage 91 row and must be
inside the Stage 91 schedule. The later finishing stage may still add buttons, buttonholes,
facings, or a collar, but cannot change those already-worked structural counts.

Collar planning is downstream of actual neckline/opening execution. It depends on the
realized edge lengths, held stitches, corner behavior, placket overlap, and any execution
discrepancy. Stage 91 provides only `futureCollarPickupBoundary` and required preserved
stitch/edge identities.

## 4. Exact Stage 91 responsibility

Stage 91 owns, as one immutable structural plan:

- explicit feature mode: neckline only, neckline plus front opening, or no shaping when
  an already-valid terminal edge is intended;
- neckline shape family and finished target geometry;
- explicit use or replacement of the upstream neckline-depth and body-neck references;
- exact center-front axis and even/odd center treatment;
- optional opening method, width/length/depth, timing, cut eligibility, and overlap intent;
- validity of the selected method against the already-closed Stage 90 fabric;
- first opening/neckline event and exact cyclic-to-linear transition, if any;
- identities and wearer orientation of `right_front` and `left_front`;
- working-yarn/rejoin/turn semantics required to create deterministic row edges;
- center stitches held, bound off, kept active, reserved for an integrated placket, or
  assigned to a supported cut bridge;
- fixed structural edge stitches and ownership;
- all front-neck bind-off groups/decreases and any permitted non-front disposition;
- exact post-Stage-90 row schedule with RS/WS, start/end action, and before/after ledger;
- interaction with the four terminal raglan interfaces, markers, and persistent lanes;
- final live/held/bound-off counts and symmetry/conservation proofs;
- the future placket/band and collar pickup boundary without executing or finishing it.

Stage 91 does **not**:

- alter or execute Stage 89 raglan rounds;
- silently undo or reclassify Stage 90 physical facts;
- physically bind off, hold, decrease, turn, cut, reinforce, pick up, or knit anything;
- close underarms or consume their held groups;
- choose final band ribbing, pickup ratio, button/buttonhole placement, collar style, or
  collar schedule unless an integrated structural placket makes a small fixed edge part
  of the opening schedule;
- accept a free-form “other” method without a versioned validator/executor;
- use tolerances, silent clamps, guessed ease, or guessed yarn cut suitability.

This boundary is reusable because its core is feature- and topology-driven. Polo is an
optional extension that supplies a front-opening strategy; the same core supports a
closed pullover neckline, slit neck, cardigan-like opening from the current boundary, or
another garment with a validated neckline/opening boundary.

## 5. Authoritative prerequisites

Stage 91 opens read-only as `ready` only after rebuilding the current source. Every
missing, unsafe, stale, or conflicting prerequisite fails closed.

| Input | Source / version | Purpose and mutability | Fingerprint and failure behavior |
|---|---|---|---|
| Complete chain bindings | Current Stage 77-90 progress records; exact kind order, identities, repository revisions, state fingerprints | Proves one project/calculation lineage; immutable per historical epoch | All bindings enter source fingerprint. Missing/order/scope/history conflict blocks. |
| Construction/design | Stage 77 completed snapshot plus Stage 61 design provenance | Bottom-up joined raglan and project design facts; immutable source references | Fingerprinted. Changed design makes Stage 91 stale; never copy text labels as a feature decision. |
| Gauge | Current Stage 63 evidence as rebound through Stage 79/88; stitches/cm and rows/cm | Count and row conversion; immutable binding for this plan | Identity, record/source/applicability fingerprints included. Missing or inapplicable gauge blocks. |
| Underarm and joined topology | Stage 83-87 V1 results | Held groups, cyclic section order, markers/interfaces, widths `0/1/2`, ownership and BOR | Carried through exact bindings. Any mismatch routes to the owning stage/recovery. |
| Yoke target | `YOKE_TARGET_GEOMETRY_PLAN_V1` / Stage 88 result V1 | Target counts, closed top boundary, depth/body-neck references | Identity/fingerprint and recomputed result included. Conflict blocks; no local repair. |
| Raglan schedule | `RAGLAN_SHAPING_SCHEDULE_PLAN_V1` / Stage 89 result V1 | Proves all earlier rows were closed and identifies terminal row/counts | Identity/fingerprint and schedule fingerprint included. Changed schedule after physical work requires recovery. |
| Physical terminal result | `RAGLAN_SHAPING_EXECUTION_RESULT_V1` / Stage 90 result V1, `raglan_shaping_physically_completed` | Direct physical origin: exact counts/topology/BOR/held groups, no prior neckline work | Entire result identity/fingerprint and current record fence included. Missing receipt/count mismatch/stale result blocks. |
| Neckline references | Stage 61 values carried by Stage 88: `necklineDepthReferenceCm`, `bodyNeckReferenceCm` | References only; immutable upstream values | Included. Null depth is allowed only if Stage 91 explicitly collects a target; conflict with current Stage 61 blocks. |
| Product feature | Versioned explicit project choice if it exists; otherwise a Stage 91 explicit choice | Determines `none` versus front opening; mutable only before Stage 91 completion | Choice and provenance enter state/result fingerprints. The existing garment-type substring heuristic is insufficient. |
| Opening-method eligibility | Versioned pattern/technology/fabric evidence, required for cutting or pattern-specific methods | Safety authority; not a UI guess | Evidence identity/fingerprint included. Missing/conflicting evidence disables that method or blocks if selected. |

The aggregate Stage 91 source fingerprint includes every row above plus the exact Stage
90 terminal count/topology projection. It does not include presentation labels. Source
validation recomputes nested contracts; checking only stored hashes is insufficient.

### 5.1 Production contract inventory

The source is reconstructed through the production identities below. “Embedded” means
the stage has no separate result-version constant: its immutable snapshot/plan/decision
is validated as part of that stage's stated contract/version and fingerprint. Stage 91
must not manufacture a result version for it.

| Stage | Production kind and contract | Immutable result/boundary relevant to Stage 91 |
|---|---|---|
| 77 | `PROJECT_CONSTRUCTION_STRATEGY_PLANNING`; format `yarnai-project-construction-strategy-planning` V1 | Completed embedded snapshot selecting bottom-up joined raglan. |
| 78 | `PROJECT_SHAPING_POLICY_PLANNING`; format `yarnai-project-shaping-policy-planning` V2 | Completed embedded clarification/decision for shaping policy. |
| 79 | `PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING`; `SLEEVE_TARGET_GEOMETRY_AND_CONSTRUCTION_CONTRACT_V1` V1 | Completed embedded geometry snapshot with gauge/source chain. |
| 80 | `PROJECT_SLEEVE_PHYSICAL_EXECUTION`; `SLEEVE_PAIR_PHYSICAL_EXECUTION_CONTRACT_V1` V1 | `SLEEVE_PHYSICAL_RESULT_V1` per component; full sleeve tube at underarm before allocation. |
| 81 | `PROJECT_SLEEVE_PAIR_VALIDATION`; `SLEEVE_PAIR_VALIDATION_CONTRACT_V1` V1 | Fingerprinted immutable decision; `pair_validation_completed` for accepted pair. |
| 82 | `PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION`; `BODY_UNDERARM_PHYSICAL_CONFIRMATION_CONTRACT_V1` V1 | `BODY_UNDERARM_PHYSICAL_RESULT_V1`; `body_underarm_physical_confirmation_completed`. |
| 83 | `PROJECT_UNDERARM_ALLOCATION_PLANNING`; `UNDERARM_ALLOCATION_PLANNING_CONTRACT_V1` V1 | `UNDERARM_ALLOCATION_PLAN_V1`; `underarm_allocation_plan_completed`. |
| 84 | `PROJECT_JOIN_LAYOUT_PLANNING`; `JOIN_LAYOUT_PLANNING_CONTRACT_V1` V1 | `JOIN_LAYOUT_PLAN_V1`; `join_layout_plan_completed`. |
| 85 | `PROJECT_UNDERARM_ALLOCATION_EXECUTION`; `UNDERARM_ALLOCATION_EXECUTION_CONTRACT_V1` V1 | `UNDERARM_ALLOCATION_EXECUTION_RESULT_V1`; `underarm_allocation_physically_confirmed`. |
| 86 | `PROJECT_RAGLAN_INTERFACE_PLANNING`; `RAGLAN_INTERFACE_PLANNING_CONTRACT_V1` V1 | `RAGLAN_INTERFACE_PLAN_V1` V1; `raglan_interface_plan_completed`. |
| 87 | `PROJECT_BODY_SLEEVES_JOIN_EXECUTION`; `BODY_SLEEVES_JOIN_EXECUTION_CONTRACT_V1` V1 | `BODY_SLEEVES_JOIN_EXECUTION_RESULT_V1` V1; `body_sleeves_join_physically_confirmed`. |
| 88 | `PROJECT_YOKE_TARGET_GEOMETRY_PLANNING`; `YOKE_TARGET_GEOMETRY_PLANNING_CONTRACT_V1` V1 | `YOKE_TARGET_GEOMETRY_PLAN_V1` V1; `yoke_target_geometry_completed`. |
| 89 | `PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING`; `RAGLAN_SHAPING_SCHEDULE_PLANNING_CONTRACT_V1` V1 | `RAGLAN_SHAPING_SCHEDULE_PLAN_V1` V1; `raglan_shaping_schedule_completed`. |
| 90 | `PROJECT_RAGLAN_SHAPING_EXECUTION`; `RAGLAN_SHAPING_EXECUTION_CONTRACT_V1` V1 | `RAGLAN_SHAPING_EXECUTION_RESULT_V1` V1; `raglan_shaping_physically_completed`. |

Each historical record is immutable for Stage 91. “Current” is a routing/reconstruction
property, not permission to mutate it. Every binding participates in the aggregate
fingerprint. A stale/missing/conflicting direct or transitive input blocks; correction is
owned by its source stage and creates new append-only history.

## 6. Topology model

### 6.1 Before the first structural event

```text
topology = cyclic
traversal = BOR(marker_4)
  -> front
  -> marker_1/front_to_right_sleeve
  -> right_sleeve_active
  -> marker_2/right_sleeve_to_back
  -> back
  -> marker_3/back_to_left_sleeve
  -> left_sleeve_active
  -> marker_4/left_sleeve_to_front/BOR
```

Stage 91 derives a center axis inside the exact terminal `front` interval. It must not
insert a marker by assuming half of an arbitrary total. The derivation uses the front
interval, its adjacent interfaces, Stage 86 ownership suffix, and wearer orientation.

- odd front core: one center stitch exists; the plan explicitly holds/binds/reserves it
  or assigns it to a validated bridge;
- even front core: the axis is between two stitches unless the selected method explicitly
  allocates a paired center group;
- a one-stitch imbalance is never silently assigned to a side; deterministic candidates
  are presented and the chosen semantic is recorded.

`right_front` is the front segment adjacent to `front_to_right_sleeve` and `left_front`
is adjacent to `left_sleeve_to_front`; wearer-side labels must be verified from the
joined orientation contract. Storage may use neutral `front_edge_a/b` until that proof is
available. A left/right label may not be inferred from screen position.

### 6.2 Transition event

For a live split/neck opening, the transition is one separately fingerprinted schedule
row/action, not a boolean on the next row. Starting with working yarn at Stage 90 BOR, it
records the exact traversal/rejoin needed to reach center front, the center action, all
stitches worked before and after it, and the final yarn position. The event completes
only when both new edge identities and the first legal row-start position exist.

At that instant:

```text
cyclic BOR is retired for active traversal
rowStartEdge and rowEndEdge replace BOR
active path becomes linear
RS/WS orientation becomes explicit
right_front and left_front become distinct owned sections
```

Historical `beginningOfRound` remains in source/result provenance; it is not renamed as
a row edge. No active `BOR` exists after a true split. A method that keeps knitting a
closed tube for a later cut retains cyclic topology until its execution-stage cut event;
the Stage 91 plan records that future transition rather than claiming it already happened.
Likewise, a no-opening closed neckline may keep BOR until its final circular bind-off;
short-row turns have temporary row endpoints but do not by themselves split the cyclic
live-set graph. The schedule therefore records `traversalMode` independently from
`liveTopology`.

After a live split, one RS traversal and the following WS traversal visit the same active
stitches in reverse order. `rowStartEdge` and `rowEndEdge` swap physical working-yarn
roles after each turn while their anatomical identities remain stable. Bind-off at the
beginning of a row is not interchangeable with bind-off at its end; the schedule records
the side and row orientation explicitly.

### 6.3 Marker and section ownership

All four Stage 86 interface and marker identities survive as named historical anchors.
For every planned row Stage 91 marks each as:

- `active_crossed` if both adjacent sections are still worked;
- `edge_anchor` if a neighboring section has been removed and the lane/marker defines an
  edge;
- `held_with_section` if its owned stitches are held under the Stage 86 suffix rule;
- `retired_after_action` only after an exact action disposes of all adjacent live work.

Persistent width-`1/2` raglan stitches stay owned by the preceding section until an
explicit Stage 91 row holds or binds them. Width `0` owns no stitch. Stage 91 cannot move
the lane to make neckline arithmetic fit. Sleeve/back/front identities remain distinct
until their exact disposition; held underarms never join the neckline traversal.

### 6.4 Live-stitch conservation

For every schedule row `r`:

```text
W_before(r) + castOn(r) + pickedUp(r)
  = W_after(r) + newlyHeld(r) + boundOff(r) + decreased(r)

L_before(r) + castOn(r) + pickedUp(r)
  = L_after(r) + boundOff(r) + decreased(r)

L = workingActive + necklineHeld + underarmHeld
underarmHeld_after = underarmHeld_before
```

Splitting without removing stitches changes topology but not `L`. Moving a stitch to a
holder changes working/held classification but not `L`. Bind-off and decreases remove
live stitches and must appear explicitly. A cut is tracked in a separate material-edge
ledger; it cannot be disguised as a live-stitch decrease. No tolerance or correction
entry is allowed.

The completed plan proves both the row-by-row equations and:

```text
stage90FinalActive + allStage91CastOnOrPickup
  = finalWorkingActive + finalNecklineHeld
    + totalBoundOff + totalDecreased

finalTotalLive = finalWorkingActive + finalNecklineHeld + unchangedUnderarmHeld
```

## 7. Geometry and deterministic schedule

Stage 91 must build the exact schedule. A geometry-only result would leave the execution
stage to invent the first split row, alternating side bind-offs, RS/WS parity, and count
ledger—the highest-risk facts in this boundary.

### 7.1 Target model

The result distinguishes design targets from achieved discrete geometry:

- target neckline type and vertical depth;
- target finished width/circumference and any explicit ease source;
- target opening length/depth and structural width;
- center-axis policy and placket overlap intent;
- final live/held/bound-off disposition by section;
- future collar/placket edge identities.

Conversions use canonical rational arithmetic with the bound stitch and row gauges.
Raw centimetre targets are retained. The planner enumerates legal integer candidates; it
does not call unconstrained `round`, apply a hidden tolerance, or clamp impossible input.

### 7.2 Schedule row

Each planned entry contains at least:

```text
postStage90RowNumber
orientation = transition | RS | WS | cut_preparation | cut
topologyBefore, topologyAfter
rowStartEdge, rowEndEdge
workingYarnAction / turn / rejoin
beginningActions[] and endingActions[]
centerAction { keep | hold | bind_off | reserve | validated_bridge }
bindOffBySection, newlyHeldBySection, decreasesBySection
raglanInterfaceStates[4]
sectionCountsBefore, sectionCountsAfter
workingActiveBefore/After
necklineHeldBefore/After, underarmHeld
symmetryCheckpoint
rowFingerprint
```

The planning kernel must account for an action at the beginning of one side's row and
the mirrored action at the beginning of the opposite-orientation row. Symmetry is proved
at declared paired-row checkpoints, not falsely required after every half-pair.

### 7.3 Parity, rounding, and feasibility

- Even and odd center axes are distinct candidates with explicit stitch ownership.
- A symmetric neckline preserves mirrored cumulative removals at each completed pair;
  any requested asymmetry requires a versioned asymmetry choice and exact side targets.
- Bind-off group totals, decrease pairs, fixed edge stitches, and persistent raglan lanes
  must fit each section without going below method-specific minima.
- Row depth must have enough eligible RS/WS starts for every ordered bind-off/decrease;
  the plan cannot move a beginning-of-row bind-off to the end to gain capacity.
- Integrated overlap width and edge parity are method constraints, not decorative
  rounding.
- A cut method requires an eligible cut column/bridge and reinforcement envelope which
  does not intersect protected raglan lanes, underarm holds, or another section.
- Geometry is impossible when the desired depth begins below Stage 90 for a no-cut method,
  when counts are insufficient, when row capacity is insufficient, when a bridge is
  absent, or when symmetry/parity cannot be satisfied.

Before completion the review may expose a finite Pareto set—for example, closest actual
width versus closest actual depth, or two legal center treatments. It must not invent a
weight between them. Auto-selection is allowed only for one unique non-dominated result.
The completed result contains exactly one explicitly confirmed authoritative schedule.

## 8. Polo boundary and the architecture fork

| Variant | Determinism and physical correctness | Resume/rework and reuse | Verdict |
|---|---|---|---|
| A: plan neckline, opening, transition together | Correct for the coupled structural operations, provided “polo” excludes final band/collar finishing | One source fingerprint and one exact schedule; generic core remains reusable | Selected structural half |
| B: plan only topology, plan placket separately | Correct only if “placket” means later picked-up finish; insufficient if it omits opening geometry or integrated edge stitches | Good separation after physical edge exists | Selected finishing half |
| C: decide timing, execute opening, then plan neckline | Executor would invent center/count/rows; neckline and opening schedules can conflict | Unsafe replay/recovery boundary | Rejected |
| One stage including collar and finished bands | Plans pickup against unrealized edges and expands choices unnecessarily | Rework of collar would rewrite structural opening | Rejected |

The minimum correct split is therefore:

1. Stage 91 plans neckline plus the **structural** optional opening and transition.
2. Stage 92 executes exactly that plan and reports realized edges/counts.
3. A downstream finishing planner designs picked-up/applied polo bands and collar from
   those realized facts.

Stage 91 may carry a garment-specific `poloOpening` extension, but the generic contract
uses `openingFeature`, `openingMethod`, `structuralEdges`, and
`futureFinishingBoundary`. A non-polo neckline sets the opening extension to `none` and
uses the same center/geometry/schedule/conservation engine.

## 9. Lifecycle, persistence, replay, and rework

The production lifecycle should be:

```text
read-only ready
  -> collecting_opening_choices
  -> reviewing_neckline_opening_plan
  -> completed
```

`stale` and `rework_required` are derived routing states, not mutable escape hatches in a
completed epoch.

- `ready`: the current Stage 77-90 source reconstructs; opening the page does not write.
- `collecting_opening_choices`: an epoch exists; only genuinely missing design/method
  choices are collected. Every change invalidates candidate review.
- `reviewing_neckline_opening_plan`: one complete schedule or a user-selected candidate
  has a review fingerprint.
- `completed`: explicit final confirmation freezes a recomputable immutable result.
- `stale`: the epoch remains byte-for-byte historical and is not resumable against a new
  source.
- `rework_required`: physical downstream progress prevents ordinary replanning until an
  exact recovery boundary is attested.

Every mutation uses a globally unique UUID operation id, semantic payload fingerprint,
expected project/repository/domain revision, expected state/source fingerprint, and
review fingerprint where applicable.

- same UUID + same command/payload/source/epoch returns the prior state with no revision;
- same UUID + different semantics returns `OPERATION_ID_CONFLICT`;
- stale fences return `REVISION_CONFLICT`, `SOURCE_STALE`, or `REVIEW_STALE`;
- mutation of a completed epoch returns `COMPLETED_PLAN_IMMUTABLE`.

State and operation/checkpoint writes are atomic in the existing progress/operations/
checkpoints/meta storage model. No new database version is justified merely for Stage
91. Reload reconstructs the current source independently and then projects the matching
epoch; it never trusts cached presentation data.

A user-requested Stage 91 replan before Stage 92 physical work appends a contiguous epoch
with `predecessorIdentity` and `supersedesPlanIdentity`. Once Stage 92 begins, replanning
requires proof of physical restoration to the exact Stage 90 closed terminal boundary.
Completed Stage 91 and Stage 90 bytes remain immutable.

If Stage 88/89/90 changes, the old Stage 91 epoch becomes stale. Because Stage 90 is a
physical completion, a replacement upstream geometry/schedule never silently rebinds
Stage 91: it requires the existing explicit physical recovery/rework chain and a new
Stage 90 result before a new Stage 91 epoch can become current.

## 10. Proposed result contract

Conceptual immutable result:

```text
schemaId = NECKLINE_OPENING_PLAN_V1
resultVersion = 1
contractVersion = 1
kind = PROJECT_NECKLINE_OPENING_PLANNING
identity, planningIdentity, epoch
predecessorIdentity, supersedesPlanIdentity
sourceFingerprint, sourceBindings[Stage77..Stage90]
stage90ResultIdentity, stage90ResultFingerprint
stage89ResultIdentity, stage89ResultFingerprint
stage88ResultIdentity, stage88ResultFingerprint
outputBoundary = neckline_opening_plan_completed

featureDecision { necklineMode, openingFeature, productFeatureProvenance }
referenceGeometry { necklineDepthCm?, bodyNeckCircumferenceCm?, gaugeBinding }
targetGeometry { requested, discreteAchieved, centerAxis, parity, symmetry }
openingStrategy {
  method, startsAtStage90Boundary, cuttingRequired,
  eligibilityEvidence?, structuralWidth, lengthRows,
  integratedEdgeStitches?, overlapIntent
}
startTopology {
  cyclic = true, sectionOrder, interfaces, markerStates,
  beginningOfRound, terminalSectionCounts, heldGroups
}
transitionPlan {
  transitionKind, transitionRowIdentity, centerAction,
  rowStartEdge, rowEndEdge, rightFrontIdentity, leftFrontIdentity,
  workingYarnAndTurnSemantics, borRetirement
}
scheduleRows[]
finalTopology {
  cyclicOrLinear, sectionDispositions, interfaceStates,
  workingActive, necklineHeld, underarmHeld, totalLive
}
futurePlacketBoundary {
  edgeIdentities, structuralEdgeCounts, overlapIntent,
  pickupDeferred, finishingNotApplied
}
futureCollarPickupBoundary {
  orderedEdgeAndHeldGroups, countsKnownAtPlan,
  finalPickupCountDeferred
}
conservationProof, symmetryProof, parityProof, feasibilityProof
openingOrNecklineWorkApplied = false
placketOrCollarFinishingApplied = false
heldUnderarmsClosed = false
explicitFinalConfirmation = true
completionOperationId, timestamps, fingerprint
```

The validator recomputes candidates, the selected schedule, every row ledger, topology
transition, and final result from source plus recorded inputs. A matching outer
fingerprint alone does not validate the plan.

## 11. Recovery and discrepancy behavior

| Condition | Required behavior |
|---|---|
| Stage 90 current/completed and all terminal counts valid | Stage 91 may project `ready`. |
| Stage 90 stale or not completed | Block Stage 91; preserve prior Stage 91 history and route to Stage 90 recovery. |
| Terminal count differs from Stage 90 result | `PHYSICAL_TERMINAL_MISMATCH`; no planning or numeric correction. Record/resolve at physical recovery boundary. |
| Missing round confirmation/checkpoint/receipt in Stage 90 | Treat Stage 90 as invalid/incomplete; Stage 91 cannot reconstruct physical truth. |
| Stage 89 schedule changes | Old Stage 90/91 source is stale; require physical recovery and new immutable execution result. |
| Stage 88 geometry changes | Same rule; never remap old physical stitches to new target sections. |
| Upstream polo/feature choice changes before Stage 92 | Append Stage 91 rework epoch if Stage 90 source is unchanged. |
| Feature/method changes after Stage 92 starts | Freeze continuation; prove restoration to Stage 90 boundary or enter method-specific physical recovery. |
| Requested opening must start during Stage 89 rounds | `UPSTREAM_NECKLINE_TIMING_REWORK_REQUIRED`; current completed physical path is incompatible. |
| Cut selected without validated eligibility/bridge | `OPENING_METHOD_UNSUPPORTED` or `CUT_ELIGIBILITY_REQUIRED`; do not offer execution. |

Planning never hides a physical discrepancy with a schedule correction. Any unraveling,
reconstruction, marker relocation, or cut recovery after physical progress is a separate
explicit recovery action with immutable evidence.

## 12. Minimal UI and assistant architecture

The page shows human project facts: current closed yoke, terminal front/back/sleeve
counts, depth/body-neck references, and that underarm stitches remain held. It never
shows UUIDs, fingerprints, revisions, raw enums, or source JSON.

Ask only choices not already authoritative:

1. intended neckline shape/finished geometry, offering explicit reuse of the existing
   depth reference rather than asking the user to re-enter it;
2. no front opening versus a structural front opening when no explicit versioned feature
   choice exists;
3. opening method from the finite methods actually eligible for this fabric/history;
4. opening length/width and integrated versus later-picked-up structural edge intent;
5. a center/parity or discrete geometry candidate only when more than one legal result
   remains;
6. final review confirmation.

Do not ask for BOR, raglan width, section counts, held stitches, gauge, construction
direction, or the earlier “after raglan” timing; these are source facts. Do not offer a
cut choice when eligibility is absent.

Assistant copy describes actions in ordinary Russian, for example: “После этого ряда
круг больше не продолжается: поверните работу, и дальше каждый ряд идёт от одного края
разреза до другого.” It explains why a requested deeper no-cut opening may require
returning to the earlier raglan plan. It does not translate internal error codes into the
primary user message.

## 13. Generalization

No rule may depend on Natalia, “men's polo”, fixture counts, a fixed gauge/size, one
raglan-line width, or a product-name substring. Configuration is expressed through:

- ordered section/interface topology and ownership;
- a generic optional-opening strategy interface;
- canonical gauge and requested dimensions;
- explicit method capabilities and safety evidence;
- finite center/parity/symmetry policies;
- a garment-specific extension object only when needed.

The same planner works for widths `0/1/2`, arbitrary safe integer section counts,
different gauges and depths, polo enabled/disabled, and generic non-polo necklines. New
methods are added as versioned strategy validators/schedule builders, not branches on
garment labels.

## 14. Detailed future production test plan

### 14.1 Source and contract

1. Exact kind/contract/result/output/route/successor identities and versions.
2. Exact ordered Stage 77-90 binding chain; wrong project/calculation/order fails.
3. Missing, incomplete, unsafe, stale, or corrupt Stage 90 fails closed.
4. Stage 90 result recomputes; terminal section/active/held/all-live counts must match.
5. Stage 88 depth/body-neck references and Stage 63/79 gauge applicability are current.
6. Product-name heuristic alone is not accepted as an explicit polo feature.
7. Cutting method is absent without versioned eligibility evidence.

### 14.2 Topology and conservation

8. Happy path starts from exact cyclic topology and BOR marker 4 before front.
9. Circular-to-flat transition retires active BOR and creates two stable edge identities.
10. First transition row accounts for working-yarn position and every visited stitch.
11. RS/WS alternation reverses traversal without swapping anatomical edge identity.
12. `right_front`/`left_front` adjacency is correct and never derived from display order.
13. Width `0`, `1`, and `2` raglan interfaces preserve Stage 86 ownership.
14. Zero-, one-, and two-stitch terminal interface/core edge cases fail or plan exactly.
15. Marker/lane retirement requires an explicit section-disposition action.
16. Split-only transition preserves live count; hold/bind/decrease equations balance.
17. Underarm held groups/counts remain unchanged in every row and final result.
18. Injected one-stitch conservation error fails with no tolerance or repair.

### 14.3 Geometry and schedule

19. Even center creates an inter-stitch or explicit paired-center plan.
20. Odd center requires explicit center-stitch disposition.
21. Symmetric neckline reaches equal cumulative side removals at paired checkpoints.
22. Unsupported asymmetry and impossible asymmetric geometry fail closed.
23. Different neckline depths generate deterministic row candidates.
24. Null upstream depth triggers one explicit target choice, not a default.
25. Insufficient front/core/interface stitches fail.
26. Impossible bind-off group or wrong beginning-of-row side fails.
27. Insufficient row capacity and impossible parity fail.
28. No silent rounding/clamp; raw and achieved dimensions remain visible.
29. Multiple Pareto candidates require explicit selection; one candidate may auto-select.
30. Completed plan contains one ordered schedule with stable row fingerprints.

### 14.4 Opening and finishing boundaries

31. Polo/front opening enabled and disabled both use the generic core.
32. `split_from_current_live_edge` cannot claim depth below Stage 90.
33. Opening-during-raglan request returns upstream timing rework required.
34. Reserved-steek method fails when Stage 77-90 has no bridge evidence.
35. Authorized cut method requires exact eligibility and protected cut path.
36. Cut does not masquerade as live-stitch decrease.
37. Integrated structural placket stitches participate in every row ledger.
38. Later-picked-up placket records edges but no guessed pickup count.
39. Collar work is absent; only an ordered future pickup boundary exists.

### 14.5 Lifecycle, replay, and rework

40. Read-only ready writes nothing; collection/review/completion transitions are exact.
41. Same UUID/same semantic payload replays without revision change.
42. Same UUID/different payload or epoch conflicts.
43. Stale project/repository/domain/source/review fences fail.
44. Reload reconstructs every incomplete lifecycle and the same candidate/schedule.
45. Completed state/result is recomputable and immutable.
46. Same-source rework before execution appends a contiguous superseding epoch.
47. Upstream Stage 88/89/90 replacement makes the old plan stale without mutation.
48. Upstream rework after Stage 90 physical completion cannot silently alter Stage 91.
49. Stage 92 progress blocks ordinary replan until exact Stage 90 restoration evidence.
50. History and operation receipts remain append-only across reload/rework.

### 14.6 UI and regression

51. UI hides internal ids/revisions/fingerprints/enums and asks only missing choices.
52. Existing depth is offered as an explicit reuse action, not requested again.
53. Ineligible cut choices never render.
54. Russian assistant instructions explain turn, edge, hold, and bind-off actions plainly.
55. Generic non-polo neckline happy path completes with opening extension `none`.
56. Different size/gauge/count/line-width fixtures contain no hard-coded polo values.
57. Stage 77-90 domain, application, navigation, persistence, and UI regressions remain
    green; Stage 90 completed routing advances only to Stage 91.

## 15. Verification of the existing system

The architecture was checked against the production findings and code for Stages 87-90,
and against the ownership/gauge/geometry chain back through Stage 77 where it affects
Stage 91. Relevant production constants, source validators, result builders, application
reconstruction, saved-project routing, and Stage 77-90 tests were inspected.

The Stage 77-90 test commands are the repository's scoped `npm run test:stageNN` scripts.
All fourteen scripts passed on 2026-08-09:

| Command | Result |
|---|---|
| `npm run test:stage77` | passed: 6 domain/application tests + 1 workspace test |
| `npm run test:stage78` | passed: 7 domain/application tests + 1 workspace test |
| `npm run test:stage79` | passed: 17 domain/application tests + 11 workspace tests |
| `npm run test:stage80` | passed: 12 tests |
| `npm run test:stage81` | passed: 10 tests |
| `npm run test:stage82` | passed: 7 tests |
| `npm run test:stage83` | passed: 7 tests |
| `npm run test:stage84` | passed: 7 tests |
| `npm run test:stage85` | passed: 10 tests |
| `npm run test:stage86` | passed: 10 tests |
| `npm run test:stage87` | passed: 14 tests |
| `npm run test:stage88` | passed: 10 tests |
| `npm run test:stage89` | passed: 12 tests |
| `npm run test:stage90` | passed: 25 tests |

Total: 167 tests passed, zero failed/cancelled/skipped. The commands also completed all
stage-scoped `node --check` prerequisites. Stage 90 specifically proved exact terminal
per-section counts, immutable completion, recovery epochs, fail-closed
opening-during-raglan, V4 persistence reuse, and routing to
`PROJECT_NECKLINE_OPENING_PLANNING`.

After the final document edit, `git diff --check` passed. Scoped status reported only:

```text
?? STAGE_91_ARCHITECTURE_FINDING.md
```

The pre-existing dirty worktree was not cleaned, reset, checked out, or reformatted.

## 16. Conclusion

Stage 91 is not a polo-specific band calculator. It is the reusable planner for the first
structural neckline/opening boundary after one exact physical topology. It must combine
neckline geometry with optional opening method and the cyclic-to-linear schedule because
those operations share stitches, edges, rows, symmetry, and conservation. It must leave
the actual knitting/cutting to the direct execution successor and leave final placket/
collar design until the edges physically exist.

The architecture is deterministically implementable and preserves every Stage 77-90
contract. It also exposes a necessary physical truth: the current post-raglan path cannot
produce an earlier no-cut neckline/opening. Such a concrete project is blocked for
recovery or an explicitly validated cut method; the planner never conceals that conflict.

**STAGE 91 ARCHITECTURE FOUND**
