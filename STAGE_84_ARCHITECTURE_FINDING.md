# Stage 84 architecture finding: join layout planning

Scope: architecture finding only. This document does not create or modify Stage 84
production code, application/workspace/assistant code, HTML, CSS, routes, fixtures,
tests, package scripts, IndexedDB schema, or any Stage 79-83 contract/result. The
pre-existing dirty worktree is left untouched.

## 1. Finding

The next minimal immutable boundary after a current completed Stage 83 is:

```text
domain identity:   PROJECT_JOIN_LAYOUT_PLANNING
contract identity: JOIN_LAYOUT_PLANNING_CONTRACT_V1
result identity:   JOIN_LAYOUT_PLAN_V1
contract version:  1
output boundary:   join_layout_plan_completed
```

It is a **planning-only** boundary. It assigns exact locations and identities to the
four Stage 83 underarm groups and fixes the future circular order of body and sleeve
sections. It does not move a stitch, place a stitch on waste yarn, join components, or
start raglan shaping.

Stage 84 is not `PROJECT_UNDERARM_ALLOCATION_EXECUTION`, because the completed Stage 83
plan does not yet identify an executable set of stitches on every component. It is not
`PROJECT_JOIN_PREPARATION`, because executable needle/yarn/marker instructions and the
physical join remain later concerns. It is not `PROJECT_JOIN_EXECUTION`, because all
three component results still expressly describe the pre-allocation physical state.

The exact sequence is therefore:

```text
Stage 83 planned allocation (how many: H)
  -> Stage 84 join layout plan (which exact component intervals and future order)
  -> likely Stage 85 physical underarm allocation (actual held groups)
  -> later join preparation
  -> later physical join
```

This corrects the earlier speculative Stage 83 finding that named a generic component
readiness validation as Stage 84. Production Stage 83 does expose the projection string
`requires_component_readiness_validation`, but no immutable readiness contract or
result exists. The concrete missing authority found in the production chain is the
component coordinate/layout decision described below. A separate pass/fail validation
would either be unable to close that gap or would silently create the layout it claims
only to validate.

## 2. Why this is the minimal next boundary

Stage 83 answers **how many** stitches belong to each underarm interface:

```text
body left underarm  = H
body right underarm = H
sleeve 1 underarm   = H
sleeve 2 underarm   = H
```

It deliberately does not answer **which stitches** those are. Its production domain
rejects `joinPosition`, `raglanLine`, `beginningOfRound`, `actualHeld`, and
`actualRemoved` fields. Its stored consequence is named
`bodyCountRemainingBeforeSectionPlacement`. This is an explicit boundary, not an
omission that an executor may fill by convention
(`src/yarnai/static/project-underarm-allocation-planning.js:19`, `:115-127`).

The current chain also does not establish:

- a body beginning-of-round anchor identified as a left/right underarm or as a
  front/back boundary;
- exact left and right body underarm intervals in the circular stitch sequence;
- front and back section sizes after removing the two planned `H` intervals;
- a rule for an odd `H` around a sleeve beginning-of-round marker;
- which physical sleeve is left/right and its orientation relative to the body;
- the future section order around the yoke and its new beginning of round;
- the four exact body/sleeve interfaces that will become raglan boundaries;
- structured body pattern-edge/phase constraints that prove a proposed cut preserves
  the fabric pattern.

Stage 79 does supply a meaningful sleeve anchor: increases flank the sleeve
beginning-of-round (`paired-mirrored-increase-flanking-bor:v1`). It does not supply the
underarm interval partition for every possible `H`. The body chain supplies only
`in_round`; the body pattern repeat is user text, not a numeric edge/phase contract
(`src/yarnai/static/project-sleeve-target-geometry-planning.js:141-151`;
`src/yarnai/static/primary-fabric-preparation.js:9-20`, `:129-149`).

Therefore Stage 83 cannot yet unambiguously tell a user:

> Put these exact `H` stitches of the left body underarm, these exact `H` stitches of
> the right body underarm, and these exact `H` stitches of each identified sleeve on
> hold.

The missing coordinate/layout decision must be immutable before physical work begins.
The layout is the smallest boundary that supplies it without mixing planned state with
physical state.

## 3. Candidate comparison

| Candidate | Decision | Reason |
|---|---|---|
| `PROJECT_UNDERARM_ALLOCATION_EXECUTION` | **Too early for Stage 84** | `H` is known, but exact body intervals, sleeve interval partition/orientation, and component layout are not. The executor would have to invent them or collect an unversioned hidden plan. |
| `PROJECT_JOIN_LAYOUT_PLANNING` | **Selected** | Produces the first missing immutable authority: exact planned component positions and order, while preserving the pre-allocation physical state. |
| `PROJECT_JOIN_PREPARATION` | Too broad | Would mix durable geometry/layout decisions with tools, marker placement, working-yarn choice, and executable steps. |
| `PROJECT_JOIN_EXECUTION` | Unsafe | No physical allocation result exists, so the future working sections have not been physically established. |
| Generic component readiness validation | Insufficient | It can report missing layout, but cannot make an executable layout true without becoming layout planning itself. |

## 4. Authoritative state after Stage 83

### Body

| Fact | Authority after Stage 83 | Meaning |
|---|---|---|
| Actual total live stitch count `B` | Current immutable Stage 82 `actualBodyFullTubeStitchCount`, transitively bound by Stage 83 | Manually counted complete live body tube at the real underarm boundary. |
| Actual underarm-boundary height | Current immutable Stage 82 `actualBodyHeightAtUnderarmCm` on `lower_body_edge_to_underarm_boundary` | Physical vertical measurement. Stage 83 binds the Stage 82 result fingerprint but does not copy this value into its shallow source. |
| Planned `H` per body side | Current completed Stage 83 `plannedPerInterfaceCount` | Design plan, not a physical count. `plannedBodyUnderarmTotal = 2H`. |
| Physical allocation status | `physicalAllocationApplied = false`; `underarmStitchesHeldOrRemoved = false` | No Stage 83 command may change it. |
| Physically live stitches | All `B` stitches remain live | Holding stitches later will still leave them live; “live” and “active for the yoke” must not be used as synonyms. |
| Physically active/on current body needle | The complete pre-allocation tube is still the current physical component | The planned `B - 2H` is not yet an actual yoke-working count. |
| Actually closed/bound off/held/transferred stitches | None are established by Stages 82-83 | There may be no authoritative claim that a particular body interval was acted on. |

Stage 82 itself freezes `completionBoundary = full_body_tube_at_underarm_before_allocation`,
the manually confirmed body count and height, and
`underarmStitchesHeldOrRemoved = false`
(`src/yarnai/static/project-body-underarm-physical-confirmation.js:143-163`).

### Sleeve 1 and sleeve 2

For each sleeve separately:

| Fact | Authority after Stage 83 |
|---|---|
| Actual final full-tube count `S1` / `S2` | Current immutable Stage 80 component result `actualUnderarmFullTubeStitchCount` |
| Physical endpoint | `full_sleeve_tube_at_underarm_before_allocation` |
| Planned underarm count | Current completed Stage 83: `H` |
| Physical allocation | Not applied |
| Actual held/removed status | `underarmStitchesHeldOrRemoved = false` |
| Actual working/yoke-eligible count after allocation | Not yet a physical fact; `S1 - H` / `S2 - H` are plan consequences only |

Stage 80 retains separate immutable component results and never averages them. Stage 83
reconstructs and copies the two actual full-tube counts separately
(`src/yarnai/static/project-underarm-allocation-planning-application.js:25-30`,
`:43-48`).

### Pair

The current accepted Stage 81 decision is authoritative only when it is bound to the
exact current Stage 80 sleeve-result fingerprints and has outcome `matched` or
`accepted_with_deviation`. `accepted_with_deviation` preserves the differences; it is
not a numeric tolerance and does not make `S1` equal to `S2`
(`src/yarnai/static/project-sleeve-pair-validation.js:152-185`, `:203-209`).

### Construction and constraints

The current source chain establishes:

- overall direction `bottom_up`;
- body working method `in_round`;
- topology `construction-strategy:body-sleeves-joined-raglan:v1` /
  `body_and_sleeves_joined_at_underarm_for_raglan_yoke`;
- two cuff-up, in-round sleeves;
- current Stage 78 shaping policy, either `raglan_synchronized` or
  `raglan_differentiated`; it describes post-join distribution, not exact decrease
  rows, section sizes, or raglan-stitch ownership;
- current body gauge through the Stage 63/65 binding and current sleeve-main gauge
  through Stage 79 applicability evidence;
- Stage 79 cuff/main pattern bindings and numeric sleeve repeat constraints;
- body main-pattern/repeat user text, but no generally safe numeric body edge/phase
  model;
- Stage 83 V1 allocation policy
  `equal-live-underarm-graft-allocation:v1` and candidate policy
  `joint-underarm-span-count-selection:v1`.

The Stage 83 application revalidates current Stage 79-82 records, current body gauge,
the Stage 65 gauge binding, and the sleeve-main applicability evidence rather than
trusting a caller projection
(`src/yarnai/static/project-underarm-allocation-planning-application.js:15-54`).

## 5. What remains only planned

The following Stage 83 values are immutable **plan authority**, not physical facts:

- `H`, `2H`, and each component's planned allocation;
- `B - 2H`, `S1 - H`, and `S2 - H` as pre-section-placement consequences;
- body/sleeve centimetre spans and visible candidate errors;
- the intent to retain equal live groups for a later one-to-one closure;
- `physicalAllocationApplied = false` and all component held/removed flags `false`.

There are no authoritative exact stitch intervals, front/back sizes, left/right sleeve
mapping, yoke order, marker topology, raglan ownership, combined-yoke count, physical
hold, bind-off, transfer, join, or underarm closure.

## 6. Is `physicalAllocationApplied = false` a blocker?

It is **not** a blocker for theoretical or immutable layout planning. A layout plan may
be computed and explicitly confirmed against the current pre-allocation facts. It is
authoritative as a plan, in the same sense that Stage 83 `H` is authoritative as a plan.
It must continue to say that no stitch has moved.

It **is** a hard blocker for:

- claiming that planned intervals are actual held intervals;
- treating `B - 2H`, `S1 - H`, or `S2 - H` as physically verified working counts;
- physical join preparation that assumes the pieces are already arranged on needles;
- physical join execution;
- starting raglan-yoke execution;
- recording a combined yoke as an actual physical count.

Thus:

| Question | Answer |
|---|---|
| May YarnAI plan a layout before applying `H` physically? | Yes, provided it remains a source-bound plan and exposes unresolved constraints. |
| May YarnAI calculate a future theoretical layout? | Yes. The exact inputs/policies and every unverified consequence must be visible. |
| May that plan be authoritative before physical execution? | Yes, **as planned layout only**; never as actual physical state. |
| Is physical confirmation required before join execution? | Yes, fail closed. |

## 7. Four separate concepts

| Boundary | Includes | Excludes | Prerequisite | Immutable result |
|---|---|---|---|---|
| **Planned allocation** (Stage 83) | `D`, gauges, candidates, selected `H`, planned per-component counts and arithmetic consequences | Exact positions, action, actual held counts, join order, physical join | Current 79-82 chain and user-confirmed target span | `UNDERARM_ALLOCATION_PLAN_V1` |
| **Join layout** (Stage 84) | Component coordinate frames, exact planned underarm intervals, front/back section assignment, sleeve identity/orientation, future section order, interface markers, visible unresolved pattern/raglan constraints | Moving/holding/closing stitches, needle choreography, actual join, raglan execution | Current completed Stage 83 plus current construction/pattern sources | `JOIN_LAYOUT_PLAN_V1` |
| **Physical allocation** (likely Stage 85) | Actual placement of the four exact live groups on holders/scrap yarn; per-component actual processed counts and verified physical status | Knitting components together, closing the underarm, raglan shaping | Current executable Stage 84 layout and current pre-allocation physical components | Immutable component physical results plus aggregate completion |
| **Physical join** (later) | Working the remaining body/sleeve sections into one yoke round according to an executable preparation | Discovering `H`, selecting layout, silently correcting discrepancies, closing the held underarms unless explicitly a later operation | Current successful physical allocation and join preparation | Immutable actual join result |

These boundaries must not share a field whose name hides whether the value is planned,
derived, explicitly confirmed, or physically measured.

## 8. Real bottom-up raglan technique

External technique evidence agrees on the topology but shows why YarnAI needs a
versioned policy and exact layout:

- Tin Can Knits describes three tubes, underarm stitches on waste yarn, and the
  remaining body/sleeve stitches worked into the yoke. It explicitly says joining order
  varies with the beginning-of-round location:
  https://blog.tincanknits.com/2017/03/28/lets-knit-a-bottom-up-sweater/
- Its finishing tutorial closes two held live sets with Kitchener stitch:
  https://blog.tincanknits.com/2017/03/28/that-pesky-underarm/
- Ysolda shows that patterns may put stitches on hold before or during the joining
  round, uses separate scrap yarn per group, and says held groups may later be grafted,
  three-needle-bound-off, or otherwise seamed:
  https://ysolda.com/blogs/journal/joining-the-sleeves-and-body-on-a-seamless-bottom-up-sweater
- Purl Soho likewise notes that underarm groups can be held, put on scrap yarn, or
  bound off depending on the pattern and that the beginning of round can differ:
  https://www.purlsoho.com/create/joining-sleeves-to-body/
- Stroff demonstrates a sleeve group centred around its round start, matching body
  groups between markers, followed by joining the remaining stitches:
  https://stroff-knitting.de/en/blogs/techniken/einen-raglan-von-unten-rvu-stricken

For the established YarnAI V1, the action **type does not require a new user choice**.
The Stage 83 policy identity is specifically `equal-live-underarm-graft-allocation:v1`:
the semantic action is to keep each group live and place it on a holder or smooth scrap
yarn for later one-to-one closure. A stitch holder versus scrap yarn is a tool choice,
not a different domain result. Binding off is incompatible with this V1 plan and must
fail closed rather than be offered as an equivalent action.

The first genuinely missing decision is therefore not “hold or bind off.” It is the
**layout anchor and placement**: where the body's circular sequence begins relative to
front/back and left/right underarms, followed by the exact section split. The first
user-facing question should establish or confirm that physical marker/anchor. If no
current marker is trustworthy, the user must identify it on the real body tube; YarnAI
must not invent it. Once the anchor is known, YarnAI may derive any unique layout that
satisfies count, symmetry, repeat, and phase constraints. A tie or unsupported body
pattern requires an explicit choice/structured input.

## 9. Proposed Stage 84 contract

Conceptual identity:

```text
${projectId}:${calculationId}:join-layout-planning:
${epoch}:${stage83PlanFingerprint}:${constructionBindingFingerprint}
```

Minimum immutable `JOIN_LAYOUT_PLAN_V1` fields:

- project/calculation identity and epoch lineage;
- exact current Stage 83 progress/plan identity and fingerprint;
- exact current Stage 79-82 bindings reconstructed independently;
- exact current Stage 77 topology and Stage 78 shaping-policy bindings;
- `B`, `S1`, `S2`, `H` copied without averaging or substitution;
- `physicalAllocationApplied: false` and per-component
  `underarmStitchesHeldOrRemoved: false`;
- coordinate policy identity/version;
- body circular anchor provenance and explicit confirmation;
- exact planned left/right body underarm intervals, each of cardinality `H`;
- planned front/back section identities, counts, circular ranges, and conservation
  proof `front + back + 2H = B`;
- sleeve 1 and sleeve 2 physical identity/orientation mapping;
- for each sleeve, exact planned underarm interval relative to its Stage 79 BOR and
  conservation proof `workingSection + H = Sx`;
- explicit parity handling for odd `H`; no implicit “half on either side” rounding;
- future yoke section order and proposed new BOR;
- four body/sleeve interface boundaries, while keeping raglan-line stitch ownership
  explicitly unresolved unless a separate authoritative policy supplies it;
- structured constraint checks and every unresolved/unsupported pattern-edge issue;
- deterministic review fingerprint, explicit confirmation, timestamps and result
  fingerprint;
- predecessor/superseded plan identities.

The V1 result must reject actual held/removed counts, execution receipts for physical
actions, needle/tool instructions, a physical join flag, an actual combined-yoke count,
raglan decrease schedule, neckline, collar, polo, and placket fields.

### Stage 84 lifecycle

```text
ready
  -> collecting_layout_anchor
  -> reviewing_layout
  -> completed
```

- `ready` is a read-only projection; opening the page does not persist anything.
- `collecting_layout_anchor` holds no completed layout and collects only genuinely
  missing anchor/orientation data.
- `reviewing_layout` exposes exact ranges, section counts, order, consequences, and
  blockers.
- `completed` freezes the plan; correction creates a new epoch.
- `blocked` and `stale` are derived projections.

There is no `in_progress` or `paused` lifecycle in Stage 84 because no physical task is
performed. Pause/resume would add state without a semantic boundary.

## 10. Likely Stage 85 physical allocation model

The likely next boundary after Stage 84 is
`PROJECT_UNDERARM_ALLOCATION_EXECUTION`, not join execution. It should use one shared
aggregate bound to the exact Stage 83 plan and Stage 84 layout, with three independently
completable component sub-results:

```text
BODY
SLEEVE_1
SLEEVE_2
```

This model is preferable to one indivisible result because the user may prepare the
three physical pieces at different times. It is preferable to three unrelated progress
records because all components must share one plan/layout and one aggregate completion
invariant.

Suggested aggregate lifecycle:

```text
ready -> in_progress -> reviewing_result -> completed
```

The aggregate remains `in_progress` while any component is pending or being corrected.
Reload is resume; a separate global `paused` state is unnecessary for this short,
component-wise action. If product research later proves an explicit pause action useful,
it can be added only with clear per-component semantics. `reviewing_result` begins only
when all three component drafts exist; `completed` requires all non-waivable V1
invariants.

Each component needs its own status, operation receipts, result fingerprint and
supersession lineage so partial completion and rework do not rewrite another component.

## 11. Exact future physical result fields

The physical executor should record the following minimum facts. “Processed” means
transferred live to a holder/scrap yarn, not bound off.

### Body result

- bound Stage 83 planned `H` and Stage 84 left/right interval fingerprints;
- `actionType: place_live_stitches_on_holder`;
- actual count processed at left underarm;
- actual count processed at right underarm;
- actual confirmation that both groups remain live;
- actual confirmation that neither group was bound off/closed/joined;
- source total live count `B`;
- total live count after action: still `B` under this hold policy;
- derived yoke-eligible working count `B - actualLeft - actualRight`;
- optional manually verified working count, with separate provenance, only if the UX
  requires a real recount;
- exact layout-interval match confirmations and component completion confirmation.

### Sleeve 1 / sleeve 2 result

- bound planned `H` and Stage 84 interval/orientation fingerprint;
- the same action type;
- actual processed count;
- confirmation that the group remains live and was not bound off/closed/joined;
- source total live count `Sx`;
- total live count after action: still `Sx`;
- derived yoke-eligible working count `Sx - actualProcessed`;
- optional independently measured working count with provenance;
- exact interval/orientation match and completion confirmation.

The schema should avoid the ambiguous field `actualRemainingLiveStitches`: held
stitches are still live. Use separate names for total live stitches and stitches
eligible for the next yoke-working round.

The humane flow is:

1. show the physical piece, exact highlighted interval, and `H` already known;
2. tell the user to move those live stitches to a holder/scrap yarn;
3. ask “Were exactly `H` stitches moved and left live?”;
4. when yes, store `actualProcessed = H` with provenance
   `explicit_exact_count_confirmation`; when no, ask for the observed actual count;
5. show the derived working count without asking the user to recalculate it;
6. review and confirm the component result.

## 12. Discrepancy and rework policy

V1 has no tolerance. If Stage 83 plans `H = 8` and the user reports 7:

- preserve the observation in the live execution draft/receipt;
- block successful component and aggregate completion;
- do not rewrite 7 to 8;
- do not call the Stage 83 plan satisfied;
- do not allow join preparation/execution;
- allow correction within the same live attempt if the user can safely transfer the
  missing stitch and the exact Stage 84 interval remains intact;
- if the physical component cannot conform to the layout, restore the safe
  pre-allocation state where possible and start explicit upstream rework;
- a changed `H` requires a new Stage 83 planning epoch, a new Stage 84 layout epoch, and
  a new physical-execution epoch;
- an explicit deviation is not available until a separately designed/versioned policy
  defines its conservation, layout, graft and downstream effects.

For the current narrow policy, successful completion therefore has a non-waivable
invariant `actualProcessed = planned H` for each of the four groups. This is an explicit
fail-closed product rule, not an assumption that the user's physical count must always
match the plan.

Completed results are immutable. Rework appends a new result/epoch and preserves the
predecessor/superseded history. If a physical join has already started, Stage 83-85
rework must not pretend the work returned to a pre-join state; a later recovery domain
is required.

## 13. What becomes derivable after physical allocation

Assuming a current Stage 84 layout and a successful future physical allocation:

| Value | Classification | Reason |
|---|---|---|
| Total body live count | **AUTHORITATIVE** | Holding does not kill stitches; it remains the Stage 82 `B`, confirmed again by action semantics. |
| Body yoke-eligible working count | **DERIVABLE** | `B - actualLeft - actualRight`; physical authority resides in the confirmed processed counts. |
| Total sleeve 1 / sleeve 2 live count | **AUTHORITATIVE** | Each remains `S1` / `S2` under live holding. |
| Sleeve 1 / sleeve 2 yoke-eligible count | **DERIVABLE** | `Sx - actualProcessed`. |
| Front/back section sizes | **AUTHORITATIVE AS PLAN; DERIVABLE AS APPLIED** | Stage 84 fixes them; matching physical interval results make the applied sizes derivable. |
| Sleeve insertion positions | **AUTHORITATIVE AS PLAN** | Stage 84 result; not physically joined yet. |
| Raglan boundary positions | **AUTHORITATIVE AS PLANNED INTERFACES** | Stage 84 can fix the four interfaces; physical boundaries do not exist until join. |
| Raw sum of yoke-eligible component stitches | **DERIVABLE** | Sum of the three physical working counts. It must be labelled a raw conservation sum. |
| Expected combined-yoke count | **UNKNOWN / UNSAFE** until raglan-line ownership and any join-created/consumed stitches are authoritative | Do not relabel the raw sum as a combined-yoke count. |
| Actual combined-yoke count | **PHYSICAL_ACTION_REQUIRED** | It exists only after the join and a physical count/confirmation. |

Without a completed Stage 84 layout, front/back sizes, insertion positions, raglan
boundaries, and combined-yoke semantics remain `UNKNOWN / UNSAFE` even if somebody has
physically put some stitches on holders.

## 14. Staleness model

Stage 84 currentness must be reconstructed, not trusted from its own stored source
projection.

| Replacement/change | Stage 84 effect | Historical result |
|---|---|---|
| Stage 79 plan, sleeve pattern/BOR method, or gauge binding replaced | Stale | Preserved unchanged |
| Either Stage 80 component result replaced | Stale | Preserved unchanged |
| Stage 81 decision replaced or no longer accepted | Stale | Preserved unchanged |
| Stage 82 body result replaced | Stale | Preserved unchanged |
| Stage 83 plan replaced/reworked | Stale | Preserved unchanged |
| Stage 77 topology or Stage 78 shaping policy replaced | Stale | Preserved unchanged |
| Body pattern/working-method/anchor source changes | Stale | Preserved unchanged |
| Layout anchor, orientation or layout choice corrected | New Stage 84 epoch | Prior epoch preserved |
| Active calculation replaced | Non-current under old calculation | Preserved unchanged |
| Unrelated project metadata revision | Optimistic write conflict until reload, not semantic staleness | Remains current after successful reconstruction |

A stale completed plan is never mutated to add a stale flag. Staleness is a derived
projection. Downstream physical results bound to a superseded layout also become stale
without mutation.

## 15. Immutability, rework and concurrency

- Completed `JOIN_LAYOUT_PLAN_V1` bytes are immutable.
- Epochs are positive and contiguous per project/calculation/kind.
- Epoch 1 has no predecessor; later epochs name the previous Stage 84 identity.
- Explicit correction names the superseded layout-plan identity.
- A completed plan can be replayed exactly but cannot be edited in place.
- An operation UUID is idempotent only for the same canonical command/payload.
- Repository, project, domain, source and review fingerprints fence every write.
- Rework creates a new result; predecessor and superseded history remain inspectable.

## 16. Storage reuse

No new store, index or migration is justified. Reuse IndexedDB V4:

- `progress` for Stage 84 epochs;
- `operations` for idempotent audit receipts;
- `checkpoints` for recovery;
- `projects` and `meta` in the same atomic write transaction;
- unique `progress.by_scope_epoch = [project_id, calculation_id, kind, epoch]`.

The established database version is 4, and Stage 83 already commits project, progress,
operation, checkpoint and metadata atomically
(`src/yarnai/static/project-system.js:4-39`, `:118-149`, `:1966-2013`,
`:5963-6005`). A future implementation only needs to add the supported progress kind
and scoped repository methods.

## 17. Future UI boundary

The Stage 84 UX should:

- show body and both sleeves as separate physical components;
- show `B`, `S1`, `S2`, and `H` as read-only authoritative context;
- explain that all stitches are still live and nothing should be moved yet;
- visually establish the body circular anchor and sleeve identities/orientation;
- display exact proposed underarm intervals and front/back consequences;
- display future section order and interface markers in human terms;
- ask only for a missing anchor/orientation or a genuine tied/unsupported layout
  decision;
- require explicit review of the exact layout fingerprint;
- finish with “layout planned; no stitches moved,” not “components ready to join.”

It must not expose UUIDs, fingerprints, repository revisions, epochs or receipts. It
must not tell the user to bind off, hold, transfer or join stitches while still inside
Stage 84.

## 18. Likely Stage 85

The likely Stage 85 type is `PROJECT_UNDERARM_ALLOCATION_EXECUTION`, with the independent
BODY / SLEEVE_1 / SLEEVE_2 sub-results described above. Its prerequisites are:

1. current completed Stage 83 allocation plan;
2. current completed Stage 84 layout plan;
3. the exact current Stage 80/81/82 physical components still at pre-allocation state;
4. no existing physical join or conflicting downstream execution;
5. supported V1 live-holder action and resolvable exact intervals.

Stage 85 is not fully designed here. Join preparation and join execution remain later
boundaries.

## 19. Validation results

| Command/scope | Result |
|---|---|
| `npm run test:stage79` | PASS: 28 tests (17 domain/application/repository + 11 workspace) |
| `npm run test:stage80` | PASS: 12 tests |
| `npm run test:stage81` | PASS: 10 tests |
| `npm run test:stage82` | PASS: 7 tests |
| `npm run test:stage83` | PASS: 7 tests |
| Stage 79-83 Python UI/routes suites | PASS: 21 tests |
| `git diff --check` | PASS (exit 0); only pre-existing LF-to-CRLF warnings |
| Trailing-whitespace scan of this finding | PASS |
| Scoped status | `?? STAGE_84_ARCHITECTURE_FINDING.md` |
| HEAD | `1461cd87e7a4c291324635c482a33ea9cc0579bd` |

Pytest emitted one non-test warning because the existing `.pytest_cache` path could not
be created; all 21 selected tests passed. No unrelated dirty-worktree change was
modified.

## 20. Conclusion

After Stage 83, the body and both sleeves are physically complete at their underarm
boundaries, all stitches remain live, the exact current sleeve pair is accepted, and
`H` is an immutable allocation plan. Nothing has been physically allocated.

`physicalAllocationApplied = false` blocks physical join authority but does not block
an immutable theoretical layout. The immediate missing authority is exact placement:
which body and sleeve intervals `H` refers to, how front/back and sleeve identities are
arranged, and what the future circular section order is. Therefore the minimal Stage 84
boundary is `PROJECT_JOIN_LAYOUT_PLANNING`. Physical allocation is the likely Stage 85.

STAGE 84 ARCHITECTURE FOUND
