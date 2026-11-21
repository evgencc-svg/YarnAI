# Stage 93 architecture finding: neckline edge-finishing planning

## 1. Verdict

**STAGE 93 ARCHITECTURE NOT YET SAFE.**

The intended Stage 93 boundary is valid, and its planning/execution contract can be
defined, but the current production predecessor does not expose enough immutable physical
edge truth to implement it safely. The missing predecessor fact is one authoritative
`REALIZED_FINISHABLE_EDGE_EVIDENCE_V1` snapshot which identifies and orders every
finishable edge segment and its physical source units, separates neckline and opening
zones, identifies corners and adjacency, and records the actual measurable path of shaped
edges under a declared measurement condition.

Current Stage 91 V3 and Stage 92 V1 prove live-stitch topology and execution history. They
do **not** prove the finishing topology. A Stage 93 implementation would otherwise have to
guess which rows belong to a placket edge versus a shaped neckline, infer a curved edge
length, invent corner ownership, or ask the user to hide the missing contract behind an
“evenly” instruction. That is prohibited.

This finding creates no Stage 93 production domain, application, repository, route, HTML,
CSS, workspace, assistant, or navigation code.

## 2. Production baseline inspected

The real production identities are:

| Boundary | Production identity |
|---|---|
| Stage 91 kind | `PROJECT_NECKLINE_OPENING_PLANNING` |
| Stage 91 contract/result | `NECKLINE_OPENING_PLANNING_CONTRACT_V3` / `NECKLINE_OPENING_PLAN_V3` |
| Stage 91 instruction/step/state | `NECKLINE_OPENING_EXECUTION_INSTRUCTION_V2` / `NECKLINE_OPENING_EXECUTION_STEP_V1` / `NECKLINE_OPENING_EXECUTION_STATE_V1` |
| Stage 91 capability | `globally_ordered_structural_execution_v1` |
| Stage 92 kind | `PROJECT_NECKLINE_OPENING_EXECUTION` |
| Stage 92 contract/result | `NECKLINE_OPENING_EXECUTION_CONTRACT_V1` / `NECKLINE_OPENING_EXECUTION_RESULT_V1` |
| Stage 92 output | `neckline_opening_execution_completed` |
| Declared successor | `PROJECT_NECKLINE_EDGE_FINISHING_PLANNING` |
| Persistence | IndexedDB V4 `progress`, `operations`, `projects`, `checkpoints`, `meta` |

Stage 91 V3 has one globally ordered `executionSteps[]` stream with full before/after
states. Stage 92 executes one immutable step at a time, records exact receipts, preserves
append-only discrepancy/recovery history, verifies the terminal state, and creates an
immutable result. Stage 91 rework is locked after a durable Stage 92 operation.

The relevant upstream truth includes current project measurements, body neck and neckline
depth references, main-fabric stitch and row gauge, yarn/tool context elsewhere in the
chain, the Stage 77 joined-raglan construction, Stage 86 interfaces/BOR, Stage 88 geometry,
Stage 89 schedule, and Stage 90 terminal section counts. None of those facts is silently
promoted to finishing-fabric gauge or realized edge length.

Saved-workspace routing recognizes Stage 92, but deliberately reports that the next
production finishing stage does not exist. The Stage 92 CTA names the future route only.

## 3. Exact predecessor gap

### 3.1 What Stage 92 proves

The terminal observable projection proves:

- face, direction, and current boundary;
- active yarn source and its boundary;
- cyclic/linear topology, historical BOR, and two opening-edge identities;
- ordered active ranges, held groups, section counts, and the exact terminal stitch
  ledger;
- exact completion of every Stage 91 V3 step and terminal conservation.

The Stage 92 state also retains its fingerprint-bound Stage 91 plan, so historical actions
are not lost.

### 3.2 What it does not prove

Neither `NECKLINE_OPENING_EXECUTION_RESULT_V1.finalObservableState` nor
`FABRIC_TOPOLOGY_STATE_V2` contains:

- stable separate zones for curved neckline, right opening, left opening, and the bottom
  transition/corners;
- an ordered list of physical edge source units;
- whether a unit is a stitch column, row end, decrease-shaped unit, held/live stitch,
  bound-off stitch, or reinforced/cut unit;
- segment length in source stitches/rows and actual path length in centimetres;
- corner identities, reservations, adjacency, pickup face, or pickup path;
- a mapping from a source unit to the Stage 91 step which created it;
- proof that two future zones do not overlap the same source locations.

Stage 91 V3 makes the gap explicit in another way. Its completed plan carries
`futureCollarPickupBoundary.orderedEdgeAndHeldGroups`, but the identities
`right_front_neck_edge`, `center_neck_boundary`, and `left_front_neck_edge` are not
materialized as segments in the terminal topology. `finalPickupCountDeferred` is true.
Its `futurePlacketBoundary` names `right_front_edge` and `left_front_edge`, but V3 no
longer carries the V1 conceptual `structuralEdgeCounts`, pickup path, or a partition of
opening rows from neckline-shaping rows.

The original Stage 91 architecture expected Stage 92 to report realized edges/counts.
Production Stage 92 V1 reports the two topological boundary names and final live counts,
not a finishing-grade edge ledger. Therefore the promised hand-off is incomplete.

### 3.3 Why execution history is not enough by itself

Stage 91 records exact passes, turns, decreases, bind-off/hold counts, and boundary names.
It can support a future edge-evidence compiler, but it does not define the compiler's
semantic mapping. In particular, an opening can have a requested length distinct from the
neckline depth, while V3 does not preserve a non-overlapping per-unit zone partition.
Counting all flat passes as both a placket edge and a neckline edge would create overlapping
pickup ownership. Treating some prefix as one zone is a new planning rule, not replay.

A shaped neckline path also cannot be safely reduced to the requested garment depth.
Actual knitted edge length depends on the executed structural path and fabric state. The
post-Stage-92 path has never been measured or confirmed as an edge path.

## 4. Required predecessor remediation

The owner of realized edge truth is the stage which plans and physically creates the edge,
not Stage 93.

For new work:

1. a future Stage 91 contract version must plan an immutable edge-creation ledger and
   stable zone/corner identities in the same global execution stream;
2. a future Stage 92 result version must confirm the realized ledger and terminal edge
   observations and emit `REALIZED_FINISHABLE_EDGE_EVIDENCE_V1`;
3. old V1/V2/V3 and Stage 92 V1 bytes remain immutable.

For an already completed Stage 92 V1 garment, ordinary Stage 91 rework is inappropriate
unless the fabric is physically restored to the exact Stage 90 boundary. The compatible
path is a dedicated prerequisite boundary, provisionally
`PROJECT_NECKLINE_EDGE_TOPOLOGY_CONFIRMATION`, which inventories the existing physical
edges, counts source units, places stable physical markers at all zone/corner boundaries,
measures shaped paths under a declared condition, and binds every observation to the
current immutable Stage 92 result. It must fail closed when a zone boundary cannot be
proved. It is not a heuristic migration and does not rewrite Stage 91/92 history.

Stage 93 must require either the future native Stage 92 evidence or that compatibility
evidence. Until one exists, its route must remain unavailable.

## 5. Why a finishing-specific edge type is necessary

`FABRIC_TOPOLOGY_STATE_V2` answers traversal questions about live ranges. It should not be
mutated into a catch-all geometry model. A separate immutable
`FINISHABLE_EDGE_TOPOLOGY_V1` projection is justified because finishing needs a different
graph:

```text
identity, version, sourceStage92ResultIdentity/Fingerprint
measurementCondition, observedAt, evidenceFingerprint
zones[] {
  zoneIdentity, anatomicalRole, intendedOwner, status
  orderedSegmentIdentities[], startCornerIdentity, endCornerIdentity
}
segments[] {
  segmentIdentity, zoneIdentity, edgeClass
  startBoundaryIdentity, endBoundaryIdentity, orientation, adjacentFabricRange
  orderedSourceUnits[] {
    sourceUnitIdentity, kind, ordinal, createdByExecutionStepId,
    rowOrStitchOrdinal, pickupAnchors[]
  }
  sourceUnitCount, sourceUnitKind, measuredPathLengthCm?
  measurementEvidence?, sourceGaugeBinding?
}
corners[] {
  cornerIdentity, incidentSegmentIdentities[], physicalMarkerEvidence,
  pickupReservationCapability
}
interfaces[], overlapProof, coverageFingerprint, fingerprint
```

Supported edge classes must distinguish at least `horizontal_live`,
`horizontal_bound_off`, `vertical_row`, `diagonal_shaped`, and
`integrated_live_structural_edge`. A shaped segment may contain row-origin units and
decrease/corner events, but the contract may not flatten those events into an unproved
horizontal or vertical length.

## 6. Physical knitting evidence

The technical evidence supports the contract distinction:

- TECHknitting distinguishes vertical selvedge pickup from horizontal pickup and explains
  that the vertical rate is governed by stitch-to-row gauge, not a universal 1:1 rule:
  [vertical selvedge pickup](https://techknitting.blogspot.com/2015/11/pick-up-stitches-along-selvage.html).
- Its bound-off-edge treatment describes horizontal pickup as one new stitch per existing
  stitch column: [bound-off horizontal pickup](https://techknitting.blogspot.com/2015/12/picking-up-stitches-on-bound-off-edge.html).
- The Knitting Guild Association shows that 3:4 or 4:5 are only approximations; the band
  stitch pattern, its gauge, and needle size can change the correct rate:
  [TKGA vertical-edge guidance](https://tkga.org/wp-content/uploads/issue_archives/2024/Spring/BS_SB_Picking%20up%20Stitches%20on%20a%20Vertical%20Edge_Final_upload.pdf).
- Tin Can Knits explicitly separates right front, right neckline, back neck, left neckline,
  and left front into marked pickup sections and uses different pickup treatment by
  section: [button band and collar example](https://blog.tincanknits.com/2012/04/04/sweater-techniques-series-gramps-baby-cardigan-5-6-shawl-collar-and-button-band/).
- A construction may complete button bands first and later combine their live top stitches
  with picked-up neckline stitches, proving that placket and collar ownership/order is a
  strategy decision: [band-then-neckline construction](https://blog.tincanknits.com/2022/11/03/button-band-knit-and-sewn-on-method/).
- Vogue Knitting advises measuring the actual neckline edge, matching collar and neckline,
  and swatching when collar fabric differs; it also shows that pickup face can vary by
  neckline section: [neckline and collar details](https://www.vogueknitting.com/articles/vogue-knitting-technique-neckline-details/).

These are technique constraints, not a copied pattern. They establish why zone identity,
source-unit type, actual path, face, finishing gauge, and construction order must be data.

## 7. Stage 93 physical and domain boundary

`PROJECT_NECKLINE_EDGE_FINISHING_PLANNING` plans the conversion of one or more currently
raw, independently identified edge zones into a stable interface for the next named
construction stage. V1 should support only finite, capability-checked interface strategies:

- reactivate an already-held/live horizontal foundation;
- pick up an exact live foundation along horizontal, vertical, or shaped segments;
- apply an exact supported stabilization operation before pickup;
- preserve and expose a proved integrated live structural edge;
- defer a zone unchanged to a named successor when that zone depends on a not-yet-realized
  placket or band edge.

The plan owns exact pickup/stabilization semantics and the terminal live/held foundation.
It does not own fabric grown outward from that foundation.

V1 therefore excludes:

- neckband/ribbing rows and their final bind-off;
- folded neckbands, facings, bindings, or sewn-on treatments;
- front placket/button-band fabric;
- buttonholes and buttons;
- collar shape, collar rows, short rows, points, and final collar bind-off;
- underarm closure, end weaving, blocking, and final garment validation;
- cut/steek or an opaque “custom finish”.

Those operations require their own finite planners/executors. A future version may add a
complete simple-band strategy, but it must add its physical operations and capabilities
explicitly rather than broadening V1 with prose.

## 8. Strategy and user-input model

No authoritative predecessor selects a neckband, collar, placket construction, finishing
yarn, finishing tool, band width, or finished edge ease. Stage 91 selects structural
opening method and overlap intent only. Stage 93 may collect genuine design decisions,
but only after edge evidence exists.

Minimum conditional inputs are:

- one supported interface strategy per currently owned zone;
- downstream intention (`simple_neckband`, `placket_then_collar`, `direct_collar`, or
  another explicitly supported capability), used only to decide zone ownership/order;
- desired finished interface length/circumference or an explicit versioned ease policy;
- finishing fabric pattern/repeat only insofar as it constrains foundation count;
- authoritative finishing yarn identity;
- authoritative needle/tool identity and size;
- a finishing-gauge binding for that exact yarn/tool/pattern/working-method/finishing-state
  tuple;
- an explicit selection among legal discrete candidates when more than one remains.

Body gauge is source-fabric evidence. It is not finishing gauge. If the existing swatch
record is not explicitly applicable to the finishing tuple, Stage 93 enters a derived
`awaiting_finishing_gauge_evidence` state and routes to a reusable, versioned finishing
swatch confirmation boundary. A free-text gauge or needle label cannot unblock completion.
Tool identity is required when it participates in the gauge binding; ergonomics-only tool
details may remain advisory.

## 9. Pickup count and exact distribution

For each segment, source geometry and target fabric are kept separate:

- horizontal stitch/bound-off edge: source length may use exact stitch units and applicable
  source stitch gauge;
- vertical row edge: source length uses exact row units and applicable source row gauge;
- diagonal/shaped edge: use the observed path length and ordered structural units; never
  infer it from neckline depth alone;
- target count uses finishing stitch gauge, target finished length/ease, and stitch-repeat
  constraints.

All arithmetic is canonical rational arithmetic. When a rational target is not an integer,
the planner enumerates the finite legal floor/ceiling/repeat-compatible candidates and
requires selection unless one candidate is uniquely admissible. There is no hidden round,
clamp, or tolerance.

After corner reservations, let an ordered segment have `U` eligible source units and `P`
required pickups. For the ordinary `P <= U` capability, unit `j` receives:

```text
floor((j + 1) * P / U) - floor(j * P / U)
```

This produces the complete deterministic zero/one pickup schedule. Anchored direction and
stable unit order define remainder placement. A symmetric pair uses mirrored unit order
and mirrored remainder placement. Segment allocation uses exact rational quotas, legal
repeat constraints, reserved corners, and deterministic stable-identity tie breaking.

`P > U` is unsupported by default. It is legal only when the edge evidence exposes
multiple distinct pickup anchors inside a source unit and the selected strategy declares
that capability. Reusing the same physical location without such evidence is rejected.

The result stores the expanded schedule, not merely `3/4`, a total, or “evenly”.

## 10. Pickup and topology invariants

Completion must prove with zero tolerance:

1. every scheduled source unit belongs to exactly one selected segment and zone;
2. no source location is duplicated unless a named multi-anchor capability proves distinct
   anchors;
3. no two active zone schedules overlap;
4. every required zone is fully covered or explicitly deferred to one named owner;
5. corner reservations are consumed exactly once;
6. per-segment pickup count equals the expanded event sum;
7. total pickups equal the sum of segment and reserved-corner pickups;
8. every created stitch has a stable identity and source-location reference;
9. source edge units remain present as provenance; pickup does not “consume” them;
10. before live count plus created pickups plus reactivated held stitches minus explicit
    bind-off/decrease equals after live count;
11. the terminal topology exposes exact ordered live/held foundation ranges;
12. the global before/after state chain is contiguous and fingerprint-closed.

## 11. Execution-grade Stage 93 result

The proposed identities follow production conventions:

```text
kind:                 PROJECT_NECKLINE_EDGE_FINISHING_PLANNING
contract:             NECKLINE_EDGE_FINISHING_PLANNING_CONTRACT_V1
contract version:     1
result:               NECKLINE_EDGE_FINISHING_PLAN_V1
result version:       1
instruction:          NECKLINE_EDGE_FINISHING_EXECUTION_INSTRUCTION_V1
step:                 NECKLINE_EDGE_FINISHING_EXECUTION_STEP_V1
state:                NECKLINE_EDGE_FINISHING_EXECUTION_STATE_V1
required edge input:  REALIZED_FINISHABLE_EDGE_EVIDENCE_V1
capability:            globally_ordered_edge_finishing_execution_v1
output boundary:      neckline_edge_finishing_plan_completed
successor:             PROJECT_NECKLINE_EDGE_FINISHING_EXECUTION
```

The immutable result must bind the current Stage 92 result and edge evidence, strategy
choices, source and finishing gauges, yarn/tool identities, target geometry, exact zone
ownership, and one unified global `executionSteps[]` stream. Instructions may group a
human-sized pickup run, but each run embeds its complete ordered source-unit-to-created-
stitch map.

Supported atomic step kinds should be finite, for example `yarn_break`, `yarn_join`,
`yarn_activate`, `stabilize_edge_run`, `pickup_run`, `reactivate_held_run`, `traverse`,
`turn`, `hold`, and `stop`. Every step carries exact face, direction, boundaries, yarn and
tool state, source edge positions, created stitch identities, and full before/after state.
Unknown, opaque, implicit yarn, implicit turn, or convenience-location actions fail closed.

The future Stage 94 algorithm is literal iteration over this one stream. It performs no
ratio calculation, segment allocation, location selection, yarn-location choice, or zone
ordering.

## 12. Lifecycle, persistence, and rework

Proposed lifecycle:

```text
ready (read-only; no record)
  -> collecting_finishing_choices
  -> awaiting_finishing_gauge_evidence (derived durable checkpoint)
  -> reviewing_edge_finishing_plan
  -> completed
```

`blocked_missing_edge_evidence`, `stale`, and `physical_restoration_required` are derived
routing states, not mutable completion states.

Reuse IndexedDB V4 and opaque progress records. Every write uses UUIDv7 operation identity,
semantic payload fingerprint, expected project/repository/domain revision, expected Stage
92/edge-evidence fingerprints, atomic project/progress/operation/checkpoint transaction,
and idempotent replay semantics. Completion is immutable and recomputable.

Before Stage 94 starts, rework appends a contiguous Stage 93 epoch with predecessor and
superseded-plan identities. A durable Stage 94 start receipt locks ordinary Stage 93
rework. Changing pickup distribution after any physical pickup requires restoration to the
exact Stage 92 edge-evidence boundary; receipts are never deleted. Any replacement or
recovery of Stage 92 or the edge evidence makes the old Stage 93 epoch historical/stale.

## 13. Polo decomposition and successor ownership

The polo is a fixture, not the domain model. Its zones must be separate:

- right opening/placket edge;
- left opening/placket edge;
- bottom transition and its two corners;
- right shaped neckline edge;
- center held/live/bound-off neckline boundary;
- left shaped neckline edge.

The chosen construction decides the dependency graph. In the supported band-first polo
path, Stage 93/94 creates the two placket foundations and stabilizes the bottom transition;
the neckline zones remain explicitly deferred. Placket execution then creates the final
top endpoints/live band stitches. Only then can collar pickup planning bind the complete
neckline path. A direct-collar-first construction would require a different explicit
strategy capability and order.

Recommended near-term upper-finishing chain for the test polo is:

```text
edge evidence prerequisite
-> PROJECT_NECKLINE_EDGE_FINISHING_PLANNING
-> PROJECT_NECKLINE_EDGE_FINISHING_EXECUTION
-> PROJECT_POLO_PLACKET_PLANNING
-> PROJECT_POLO_PLACKET_EXECUTION        (owns band fabric and buttonholes)
-> PROJECT_COLLAR_PLANNING               (owns final pickup path and collar geometry)
-> PROJECT_COLLAR_EXECUTION
-> PROJECT_BUTTON_ATTACHMENT_AND_UPPER_FINISHING
```

Buttonholes belong to placket planning/execution because they change band rows and stitch
structure. Sewing buttons belongs to the later attachment/final-finishing boundary.
Collar pickup belongs with collar planning when its path depends on completed placket top
stitches; it is not precomputed by Stage 93.

A simple non-polo neckline may instead route after Stage 94 to a finite
`PROJECT_NECKBAND_PLANNING/EXECUTION` pair. Folded bands, facings, binding, and sewn collars
remain separate versioned strategy families.

## 14. Completion conditions

Stage 93 V1 may complete only when:

- current authoritative immutable Stage 92 completion and valid terminal verification
  reconstruct exactly;
- no unresolved Stage 92 discrepancy exists;
- current `REALIZED_FINISHABLE_EDGE_EVIDENCE_V1` is valid and non-overlapping;
- every currently owned zone and deferred zone has one stable owner;
- strategy capabilities and all required target geometry are explicit;
- source and finishing gauges are current and applicable;
- yarn join/break/reuse state and exact tool requirements are explicit;
- pickup totals and expanded distribution schedules are exact;
- corner, symmetry, coverage, and pickup conservation proofs close;
- one global step stream has unique gap-free ordinals and exact state continuity;
- terminal live/held foundation topology is exact;
- no unsupported finishing operation is present;
- the user explicitly confirms the current review fingerprint.

## 15. Future UI

The UI should draw human-readable, visually distinct zones and corners. For each owned
zone it shows the treatment, start face/direction, source length, exact pickup count,
plain-language rhythm derived from the expanded schedule, yarn, needle, and terminal
foundation. Deferred zones name the later owner and reason.

The UI never exposes raw fingerprints/UUIDs/topology IDs and never asks the user to invent
an edge length. Missing edge evidence routes to physical edge confirmation; missing
finishing gauge routes to swatch confirmation. Review shows the exact consequences of each
discrete candidate.

## 16. Generic constraints

No production rule may depend on Natalia, “men's polo”, 100 stitches, a fixture width or
depth, one gauge, one collar, one band width, or a garment-type substring. Kernels consume
versioned topology, segment/source-unit evidence, rational gauges, explicit target geometry,
and finite strategy capabilities. At least one non-polo fixture is mandatory.

## 17. User-test milestone

The user may begin the existing production project now and work through Stage 92, then
stop at its immutable raw-edge terminal boundary. This does not authorize manual edge
finishing outside YarnAI, and the current software cannot yet take the garment past that
boundary.

Completing collar execution is the minimum milestone for a fully knitted **upper** polo
finish. It is not yet the full-garment milestone: current Stage 92 truth still preserves
four held underarm groups and says nothing about buttons, end finishing, or final blocking.
The test polo becomes completable without a manual YarnAI bypass only after both the upper
chain above and a versioned underarm-closure branch converge in a final garment-finishing
and validation execution boundary. Numeric stage labels should be assigned only after the
edge-evidence remediation is scheduled.

## 18. Production implementation plan

1. Implement and test the predecessor edge-evidence contract. Native future Stage 91/92
   versions emit it; a compatibility confirmation boundary covers completed Stage 92 V1.
2. Add generic Stage 93 domain constants, exact source/edge/gauge validators, strategy
   capability registry, rational candidate generation, distribution expansion, state
   transition validation, closure proofs, lifecycle, and presentation projection.
3. Add application reconstruction of the full current Stage 77-92 lineage plus current
   edge and finishing-gauge evidence. Reject unsafe/imported/stale/non-authoritative data.
4. Reuse `project-system.js` V4 progress/operations/checkpoints transaction patterns and
   add Stage 94 start-lock detection; do not add an object store.
5. Add workspace/assistant/HTML/CSS only after the domain is complete. Render zone diagrams
   and human instructions, not storage internals.
6. Add route, saved-workspace routing, Stage 92/edge-evidence CTA, and Stage 94 boundary
   only when each preceding production surface is real.
7. Do not implement the placket, collar, button, underarm, or final-finishing stages as
   side effects of Stage 93.

## 19. Detailed production test plan

### Gating and source integrity

1. Accept current authoritative completed Stage 92 plus native edge evidence.
2. Accept valid compatibility edge evidence for immutable Stage 92 V1.
3. Reject missing/incomplete/stale/non-authoritative/imported-unproven Stage 92.
4. Reject unresolved discrepancy, terminal mismatch, invalid result/state/evidence
   fingerprint, and non-contiguous epochs.
5. Preserve old bytes and mark Stage 93 stale when Stage 92/evidence changes.

### Edge topology

6. Validate horizontal live, horizontal bound-off, vertical row, diagonal shaped, and
   integrated live edges.
7. Validate ordered mixed segments, adjacency, measured path, and source-step provenance.
8. Reject missing source units, duplicated identities, zone overlap, unmarked corners,
   inconsistent length, and a collar placeholder not materialized as a segment.
9. Prove right/left anatomical identity independently of screen position.

### Pickup mathematics

10. Cover 1:1, `P < U`, rational quotas, exact remainder placement, reserved corners,
    mirrored symmetry, and multi-segment totals.
11. Reject default `P > U`; accept only distinct proved subanchors.
12. Reject impossible repeat/parity/corner constraints and any hidden round/clamp/tolerance.
13. Recompute the expanded schedule and every source-unit mapping.

### Gauge, yarn, and tool

14. Validate distinct source stitch/row gauge and finishing stitch/row gauge.
15. Reject missing row gauge where row-edge geometry needs it, stale gauge, wrong zone,
    wrong yarn/tool/pattern tuple, and unproved finishing state.
16. Validate same-yarn reuse, new yarn, exact break/join/activate boundary, and reject a
    convenient/implicit join location.
17. Require the tool identity used by finishing gauge; keep advisory-only details separate.

### Strategies and polo

18. Test every supported V1 interface strategy and capability requirement.
19. Reject unsupported neckband/folded/facing/binding/collar/custom actions in V1.
20. Test polo right/left opening zones, bottom transition/corners, shaped neckline and
    center boundary as distinct non-overlapping zones.
21. Test band-first ownership/deferment and a generic non-polo neckline fixture.
22. Prove placket, buttonhole, collar, and button ownership is absent from Stage 93 result.

### Global order and conservation

23. Validate exact instructions/steps, unique IDs, gap-free ordinals, previous/next links,
    state continuity, instruction slices, and terminal closure.
24. Reject a hidden yarn action, hidden turn, opaque operation, duplicate pickup source,
    uncovered owned segment, count mismatch, and broken created-stitch lineage.
25. Prove exact before/after live/held/created ledgers and edge coverage.

### Lifecycle, persistence, and UI

26. Test read-only ready, collecting, awaiting evidence, review invalidation, completion,
    reload, replay, UUID conflict, optimistic revision conflict, and immutable completion.
27. Test pre-Stage-94 rework epoch and post-Stage-94 physical restoration lock.
28. Prove IndexedDB remains V4 with 16 stores and one production store-creation site.
29. Test saved routing, human zone presentation, inaccessible raw internals, and no
    production Stage 94 route before it exists.

## 20. Regression results

The architecture pass was verified without changing production Stage 93 surfaces:

- `npm run test:stage77` through `npm run test:stage92`: **254/254 passed**, zero
  failures. This includes **55 Stage 91** tests (V1/V2, V3, and integration) and **32
  Stage 92** tests (domain and integration).
- `.\\.venv\\Scripts\\python.exe -m pytest -q
  tests/test_project_neckline_opening_planning_ui.py
  tests/test_project_neckline_opening_execution_ui.py
  tests/test_user_workspace_entry_ui.py`: **23/23 passed**. The only diagnostic was a
  non-failing Starlette `TestClient`/`httpx` deprecation warning.
- `npm run build`: passed (`prebuild`, `build`, and `postbuild`).
- `git diff --check`: passed. Existing LF-to-CRLF working-copy warnings were reported;
  they are not whitespace errors and no affected file was rewritten.
- Finding trailing-whitespace scan: **0** matches.
- Finding unresolved-work marker scan: **0** matches.
- Existing production/test Stage 93 surface scan: **0** matches.
- Scoped status: `?? STAGE_93_ARCHITECTURE_FINDING.md`.

No production code, tests, route, UI, persistence schema, or shared contract was added or
modified for Stage 93. The pre-existing dirty worktree was preserved; nothing was staged,
committed, or pushed.

## 21. Final conclusion

The Stage 93 planning/execution split and proposed identities are correct. The immediate
successor should be `PROJECT_NECKLINE_EDGE_FINISHING_EXECUTION`. Its plan must be a single
execution-grade stream with expanded pickup locations and exact intermediate state.

Production implementation is nevertheless blocked on one predecessor boundary:
`REALIZED_FINISHABLE_EDGE_EVIDENCE_V1`. The current Stage 92 terminal result is exact for
live-stitch execution but insufficient for edge finishing. Guessing a zone partition,
curved length, pickup ratio, corner policy, or yarn join would make Stage 94 a hidden
planner.

**STAGE 93 ARCHITECTURE NOT YET SAFE**
