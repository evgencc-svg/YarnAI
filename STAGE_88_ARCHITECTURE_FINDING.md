# Stage 88 architecture finding: yoke target geometry planning

Date: 2026-08-09  
Scope: architecture finding only; no Stage 88 production code, route, UI, storage migration, commit, or push.

## 1. Executive conclusion

The declared identity is the correct next minimal boundary:

`PROJECT_YOKE_TARGET_GEOMETRY_PLANNING`

Stage 87 ends at the production-enforced physical fact `body_sleeves_join_physically_confirmed`: the body and two sleeves form one untwisted working round, four markers and the BOR are physically realized, the four underarm groups remain live and separate, and no raglan decrease has been worked. The next safe responsibility is therefore to freeze **where the yoke must end**, before deciding **on which rows the decreases occur** and before knitting any of them.

The proposed Stage 88 output boundary is:

`yoke_target_geometry_completed`

Stage 88 must determine or explicitly collect:

- target yoke height in centimetres;
- the semantic meaning and finished circumference of the top boundary;
- target remaining stitch counts for front, back, Sleeve 1, Sleeve 2, and the four persistent raglan lanes;
- reductions required from each section and in total;
- exact symmetry, parity, ownership, conservation, and arithmetic feasibility proofs.

It must not assign decrease rows, cadences, intervals, techniques, or physical actions. Stage 78 remains the authority for the high-level choice between synchronized and differentiated shaping.

The architecture is not blocked, but the current data are insufficient for an automatic completion. `necklineDepth = 10 cm` is a vertical depth from the base of the neck, not a finished neckline circumference. The project contracts contain a body neck circumference, but no finished top-edge ease and no authoritative polo-opening/collar construction. A differentiated Stage 78 policy also does not determine how the final reduction is divided between body and sleeves. Stage 88 must collect these missing facts explicitly and fail closed when they are absent; it must not guess them.

The exact successor proposed by the existing naming and responsibility pattern is `PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING`. It consumes the immutable geometry and maps the already-selected Stage 78 policy to concrete shaping rows. Physical raglan execution remains a later boundary.

## 2. Existing architecture reuse

No new persistence or concurrency infrastructure is needed.

| Stage | Production authority relevant to Stage 88 | Reuse decision |
|---|---|---|
| 77 `PROJECT_CONSTRUCTION_STRATEGY_PLANNING` | Immutable V1 snapshot selects `body_sleeves_joined_raglan`, topology identity `construction-strategy:body-sleeves-joined-raglan:v1`, and `bottom_up`/`in_round`; carries garment length and armhole-depth derivation | Revalidate the current binding; do not reopen construction selection |
| 78 `PROJECT_SHAPING_POLICY_PLANNING` | Immutable V2 snapshot selects `raglan_synchronized` or `raglan_differentiated`; explicitly says exact rhythms are later | Bind policy identity/value byte-for-byte; Stage 88 may check geometry compatibility but may not replace the policy |
| 79 `PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING` | Epoch-based target planning, independent gauge evidence, structured rounding candidates, immutable completion, UUID receipts, source binding fingerprint | Reuse its state/result validation and its main-pattern gauge evidence; reuse candidate-review principles, not its sleeve schedule |
| 80 `PROJECT_SLEEVE_PHYSICAL_EXECUTION` | Independent physical sleeve histories, actual upper stitch counts, pause/reload/rework | Use only through the current validated successor chain |
| 81 `PROJECT_SLEEVE_PAIR_VALIDATION` | Exact pair comparison and explicit acceptance/rework; no silent tolerance | Preserve the accepted physical facts; do not silently force unequal sleeves equal |
| 82 `PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION` | Actual full body tube count and immutable confirmation | Use through the current chain |
| 83 `PROJECT_UNDERARM_ALLOCATION_PLANNING` | Exact underarm count `H`, rational candidate selection, arithmetic feasibility | Reuse its fail-closed/no-clamp convention |
| 84 `PROJECT_JOIN_LAYOUT_PLANNING` | Exact front/back partition, sleeve active intervals, cyclic order | Use its section counts and half-open coordinate topology; do not repartition the body |
| 85 `PROJECT_UNDERARM_ALLOCATION_EXECUTION` | Physical active counts and four live held groups; no join yet | Preserve held groups as live, outside shaping |
| 86 `PROJECT_RAGLAN_INTERFACE_PLANNING` | Width `0/1/2`, preceding-section suffix ownership, four interface identities, persistent plain lanes, marker/BOR plan | Make this topology immutable input to Stage 88 |
| 87 `PROJECT_BODY_SLEEVES_JOIN_EXECUTION` | Immutable physical join result, realized markers/BOR, joined topology, active counts, held groups, zero decreases | Direct predecessor and primary source of physical truth |

The reusable operational pattern from Stages 79 and 83–87 is:

1. a read-only `ready` projection performs no write;
2. the first command starts a contiguous epoch;
3. every state has an allowlisted schema, domain revision, canonical fingerprint, source fingerprint, and UUIDv7 operation receipts;
4. every mutation is fenced by project, repository, domain, source, and where applicable review revisions/fingerprints;
5. identical UUID plus identical semantic payload returns the already-produced state; the same UUID with another payload is `OPERATION_ID_CONFLICT`;
6. completion freezes an immutable result inside the epoch;
7. rework appends an epoch and never mutates completed history;
8. a current authoritative source is reconstructed and compared, rather than trusted from a cached UI projection.

Stage 88 should follow that pattern exactly.

## 3. Stage 88 responsibility

### Entry boundary

Stage 88 may open only from a current, production-valid Stage 87 completed result with all of these facts:

- `outputBoundary = body_sleeves_join_physically_confirmed`;
- `physicalJoinApplied = true`;
- `bodySleevesJoinPhysicallyConfirmed = true`;
- `physicalMarkersPlaced = true`;
- `joiningRoundWorkedExactlyOnce = true`;
- `heldUnderarmsClosed = false`;
- `raglanDecreasesWorked = 0`;
- `raglanShapingApplied = false`.

### Owned responsibility

Stage 88 owns the immutable target geometry for the still-unshaped joined round:

- height from the underarm join boundary to the target upper-yoke boundary;
- semantic kind of that upper boundary;
- target circumference/count at that boundary;
- remaining counts and reductions by section;
- preservation of raglan lines and held underarms;
- discrete feasibility under Stage 78 policy and Stage 86 width/ownership.

### Explicit exclusions

Stage 88 must reject fields or commands that represent:

- a row number, decrease interval, cadence, event list, or schedule;
- a decrease technique or stitch-level instruction;
- a physical decrease, marker move, underarm closure, bind-off, pickup, steek, cut, or collar/placket operation;
- a new raglan-width or ownership choice;
- a rewrite of Stage 78 policy;
- final polo collar, placket, or front-neck shaping geometry.

This makes Stage 88 both minimal and sufficient: it removes the geometric ambiguity that blocks scheduling, while leaving row allocation and physical execution to their own auditable boundaries.

## 4. Authoritative prerequisites

### 4.1 Direct predecessor binding

Stage 88 must bind the current Stage 87 progress record and immutable result by:

- progress id, repository revision, state identity, state fingerprint;
- contract schema/version and result schema/version;
- epoch and completed-result identity/fingerprint;
- output boundary;
- Stage 85 result identity/fingerprint and Stage 86 plan identity/fingerprint already carried by Stage 87;
- Stage 87 aggregate source fingerprint.

It must also retain and revalidate the exact current Stage 77–86 progress bindings carried by Stage 87. The proposed Stage 88 `bindings` therefore contains the eleven progress kinds Stage 77 through Stage 87, not an independently assembled partial chain.

### 4.2 Joined-construction facts

The direct source must expose, without recomputation from UI text:

- active joined total `N0`;
- body active total;
- front and back source-section counts from the validated joined topology;
- Sleeve 1 and Sleeve 2 active counts and their left/right placement;
- four held-group identities, components, sides, counts, range fingerprints, `remainsLive = true`, `closed = false`, `joinedIntoYoke = false`;
- held total `H`;
- four interfaces, marker realization, cyclic section order, and BOR at marker 4 before `front`;
- `w`, the uniform Stage 86 line width in `{0,1,2}`;
- `preceding-section-forward-suffix:v1` ownership for `w > 0`;
- the exact joined intervals and line/source intervals.

The repository fixture currently proves the concrete example:

- physical live total: `220`;
- held total: `40` (`10` at each of four component-side groups);
- joined active total: `180`;
- front `40`, back `40`, Sleeve 1 active `50`, Sleeve 2 active `50`;
- body active `80`, Sleeve 1 active `50`, Sleeve 2 active `50`.

These are test-fixture facts, not defaults for arbitrary projects.

### 4.3 Measurements and calculation data

Stage 88 must validate the current Stage 61 initialization and current Stage 63 gauge histories and bind them back to the Stage 79 completed source bindings. Reusing a stale or merely similarly-valued measurement/gauge is forbidden.

Available project fields are:

| Field | Existing semantic role | Stage 88 use |
|---|---|---|
| `garmentLength` | finished length from highest shoulder to lower edge | Combined with Stage 77 armhole-start derivation |
| `armholeDepth` | body vertical measurement from shoulder to underarm | Existing construction reference for target yoke height |
| `neck` | body circumference at base of neck | Reference only; not automatically the finished top edge |
| `necklineDepth` | desired vertical depth from base of neck, optional | Polo/front-neck planning reference; not circumference |
| `bust`, `garmentWidth` | body/finished chest geometry | Provenance and cross-check only; the physically joined count is now authoritative |
| `shoulderWidth` | body shoulder width | Reference only; no repository rule maps it to four top-yoke sections |
| `upperArm` | body upper-arm circumference | Reference; actual Sleeve 1/2 active counts are authoritative after Stage 80 |
| Stage 79 upper sleeve target/actuals | full sleeve tube at underarm before allocation | Provenance for the current physical sleeve result |
| main gauge | current stitches/cm and rows/cm for the bound main pattern, yarn, tool, method, and finishing state | Converts a finished target circumference to candidates; row gauge is handed to Stage 89 |

In the shared happy-path fixture, `garmentLength = 62 cm`, `armholeDepth = 21 cm`, `neck = 36 cm`, `necklineDepth = 10 cm`, `shoulderWidth = 39 cm`, and the confirmed gauge is `20 stitches / 28 rows per 10 cm`. The fixture describes a woman’s sweater, not a polo. Consequently, neither fixture labels nor the task’s prose may masquerade as an authoritative runtime polo feature; the real project snapshot or an explicit Stage 88 decision must supply that fact.

### 4.4 Exact missing information

The current contracts do not authoritatively contain:

1. whether the polo opening/front-neck shaping starts during raglan shaping or only after a closed base-yoke boundary is reached;
2. the finished circumference of that base upper boundary, including the intended ease relative to the body neck circumference;
3. for `raglan_differentiated`, the desired remaining contribution of each sleeve at the upper boundary, or an equivalent explicit body-versus-sleeve target split;
4. any approved asymmetry contract if the accepted physical sleeve pair is unequal.

Stage 88 must collect these facts locally or stop. It must not reinterpret `necklineDepth`, shoulder width, or body neck circumference as any of them.

## 5. Input data model

The future domain should accept one closed source object and a small separate set of user-confirmed targets.

### 5.1 Source object

Conceptual shape:

```text
source
  projectId, calculationId
  bindings[Stage77..Stage87]
  stage87 { progressId, repositoryRevision, stateIdentity, stateFingerprint,
            resultIdentity, resultFingerprint, schema/version, epoch, outputBoundary }
  construction { direction, strategyIdentity, shapingPolicyIdentity, shapingPolicyValue }
  joinedGeometry
    sectionOrder
    sections[] { identity, component, sourceCount, coreCount, ownedLineCount,
                 joinedInterval, sourceInterval }
    interfaces[], markerRealization[], beginningOfRound
    activeJoinedTotal, heldTotal, totalPhysicalLive
    heldGroups[]
    lineWidth, ownershipPolicy, lineTreatment
  measurements
    garmentLengthCm, armholeDepthCm, bodyNeckCircumferenceCm,
    necklineDepthCm?, bustCm?, garmentWidthCm?, shoulderWidthCm?, upperArmCm?
  gauge
    mainPatternIdentity, stitchesPerCmExact, rowsPerCmExact,
    gaugeRecordIdentity, confirmationKey, recordFingerprint,
    sourceContextFingerprint, applicabilityEvidence
  productContext { garmentType, recipient, explicitPoloFeature? }
  fingerprint
```

All numbers used in conservation are safe integers. Measurement and gauge decimals use the existing canonical non-exponential decimal convention. Every nested object is allowlisted; presentation projections omit fingerprints, revisions, UUIDs, and internal contract identities.

### 5.2 Stage 88 target inputs

- `topBoundaryMode`: whether the target is a still-closed base-yoke round before later polo/neckline work;
- `finishedBaseUpperCircumferenceCm`: an explicit finished measurement, not body neck circumference by implication;
- `differentiatedSleeveContributionCmPerSleeve`: required only when Stage 78 selected differentiated shaping and no authoritative section split exists;
- a structured candidate confirmation only when exact discrete conversion leaves more than one non-dominated candidate;
- final review confirmation bound to the review fingerprint.

The first two inputs are genuine design facts. The third is needed only because the differentiated policy permits independent body/sleeve reductions and therefore cannot derive their endpoint split from a total alone.

## 6. Yoke target geometry mathematical model

### 6.1 Notation and start geometry

Let the cyclic sections be `F` (front), `RS` (right sleeve), `B` (back), and `LS` (left sleeve). For section `i`:

- `S_i` = Stage 87 source-section count, including any line stitches owned by its trailing interface;
- `w` = Stage 86 line width, the same at each of four interfaces;
- `L_i = w` = persistent line stitches owned by section `i` when `w > 0`, otherwise zero;
- `C_i = S_i - w` = reducible section core;
- `N0 = Σ S_i = Σ C_i + 4w` = active joined start total;
- `H` = held-underarm live total, outside the joined working round;
- `T0 = N0 + H` = total physical live stitches.

Stage 86 already guarantees `C_i >= 1` and exact, non-overlapping ownership.

### 6.2 Target yoke height

Authoritative derivation:

```text
armholeStartCm = garmentLengthCm - armholeDepthCm
targetYokeHeightCm = garmentLengthCm - armholeStartCm
                   = armholeDepthCm
```

This reuses the Stage 77 construction derivation. The value remains a centimetre target in Stage 88. There is no row rounding here. Stage 89 converts the height to an admissible number of rows using the current row gauge, pattern phase, and decrease schedule constraints.

Invariant: all three terms are positive canonical decimals, `armholeStartCm >= 0`, and the current physically confirmed body boundary corresponds to that armhole start. If the physical body height or its source no longer matches, Stage 88 is stale and must not compensate locally.

### 6.3 Target upper circumference and count

Let:

- `X` = explicit finished base-upper-yoke circumference in cm;
- `g` = current applicable main-pattern stitches per cm;
- `R = X * g` = raw target stitch count.

Stage 88 must not apply an unconstrained `round(R)`. It enumerates only geometrically feasible integer endpoint candidates and compares their actual circumference `N1 / g` with `X`. No tolerance is used and no invalid value is clamped.

For a chosen candidate:

- `C'_i` = target remaining reducible core;
- `E_i = C'_i + w` = target section total including its owned persistent line;
- `N1 = Σ E_i = Σ C'_i + 4w` = target active total;
- `D_i = C_i - C'_i = S_i - E_i` = reduction required in section `i`;
- `Dtotal = Σ D_i = N0 - N1`.

The immutable result records raw values, all feasible reviewed candidates, signed centimetre errors, selected candidate, and the exact selection/confirmation evidence.

### 6.4 Synchronized policy

For `raglan_synchronized`, one shaping event decreases two stitches from each section, so for an integer event count `k >= 0`:

```text
C'_F  = C_F  - 2k
C'_B  = C_B  - 2k
C'_RS = C_RS - 2k
C'_LS = C_LS - 2k
N1    = N0 - 8k
```

Candidate bounds require every `C'_i >= 1`. The unique nearest feasible circumference candidate is automatic; an exact equal-distance tie requires explicit candidate confirmation. Consequences:

- all four section reductions are equal and even;
- `Dtotal` is divisible by `8`;
- any pre-existing one-stitch front/back difference is preserved;
- persistent line stitches are never part of `Dtotal`.

If the requested circumference has no feasible `k`, return `impossible_geometry`; do not switch to differentiated shaping silently.

### 6.5 Differentiated policy

For `raglan_differentiated`, body and sleeve event counts may differ. With integers `b,s >= 0`:

```text
C'_F  = C_F  - 2b
C'_B  = C_B  - 2b
C'_RS = C_RS - 2s
C'_LS = C_LS - 2s
N1    = N0 - 4b - 4s
Dbody = 4b
Dsleeves = 4s
```

The total target circumference constrains `b + s`, not `b` and `s` separately. Therefore Stage 88 also needs an explicit per-sleeve upper-boundary contribution target (or an already-authoritative equivalent). Let `Q` be that target in cm; each feasible pair `(b,s)` has sleeve contribution `(C'_sleeve + w) / g`.

Candidate selection must avoid an invented weighting between total and sleeve errors:

1. enumerate every `(b,s)` satisfying all integer/minimum constraints;
2. compute exact absolute total-circumference error and exact absolute sleeve-contribution error;
3. discard dominated candidates (another candidate is no worse on both axes and better on at least one);
4. auto-select only if one non-dominated candidate remains;
5. otherwise show the finite non-dominated choices for explicit confirmation.

This is deterministic, exposes the trade-off, and introduces no tolerance.

### 6.6 Remaining sections, symmetry, parity, and minima

The output must record both core counts `C'_i` and user-facing section totals `E_i` so line ownership is never counted twice.

Required constraints:

- front and back receive equal numbers of paired decrease events; their initial `0/1` split difference is preserved;
- Sleeve 1 and Sleeve 2 receive equal numbers of paired decrease events;
- if the accepted sleeve pair starts unequal and no explicit asymmetry contract exists, Stage 88 fails with `ASYMMETRY_CONTRACT_REQUIRED` or routes to sleeve rework; it does not erase the physical difference;
- every `D_i` is non-negative and even;
- each final core has the topology minimum `C'_i >= 1`;
- each final owned total has `E_i >= 1 + w`;
- line total is exactly `4w` for widths `1/2` and zero for width `0`.

`1` is only the existing Stage 86 topology minimum. It is not claimed to be a fit or neckline-design minimum. If the polo/neckline construction needs a larger residual, that requirement must come from its own authoritative contract, not an invented Stage 88 tolerance.

### 6.7 What Stage 88 can and cannot call feasible

Stage 88 proves **arithmetic/topology feasibility**: exact ownership, non-negative paired reductions, policy congruence, minima, and conservation. It does not prove that the decreases can be placed within the available rows. That requires target rows, pattern phase, cadence, and event spacing and therefore belongs to Stage 89. The Stage 88 result should say `scheduleFeasibility = not_evaluated_by_geometry_stage`, not claim full execution feasibility.

## 7. Neckline and polo-specific analysis

The current measurement called “горловина 10 см” is `necklineDepth`. Its production hint defines it as the desired vertical depth from the base of the neck when important. It does not mean:

- neck circumference;
- collar circumference;
- width of the neckline;
- length of the polo placket;
- number of stitches at the end of raglan shaping.

The data model separately contains `neck`, a body circumference at the base of the neck. That also is not automatically a finished garment circumference: no neck ease, collar pickup ratio, placket overlap, opening method, or finishing allowance is authoritative.

Stages 82–87 deliberately forbid or exclude `neckline`, `collar`, `placket`, yoke depth, and decrease schedule fields. Stage 87 preserves a closed cyclic round and a physical BOR. There is currently no production contract saying when that circle is opened for a polo.

The safe V1 boundary is therefore:

- Stage 88 may calculate a **closed base upper-yoke circumference** only after the user explicitly confirms that the polo opening/front-neck shaping is later;
- `neck = 36 cm` (or the runtime project value) may be shown as a reference and may be copied only by an explicit “use this as the finished target” confirmation;
- `necklineDepth = 10 cm` is carried forward for a later neckline/polo construction stage, not used in Stage 88 count math;
- collar, placket, pickup counts, front-neck lowering, and opening depth stay outside Stage 88.

If the opening must start during the raglan, the current closed-round/BOR scheduling model is insufficient: the work may transition from in-round to back-and-forth and front-section reduction semantics change. Stage 88 must return `POLO_OPENING_BOUNDARY_REQUIRED` and route to an explicit neckline/polo construction decision before a raglan schedule is produced. Guessing “ordinary round sweater neck” is forbidden.

## 8. Raglan-line ownership semantics

Stage 86 is authoritative:

- `w = 0`: an interface is a marker boundary only; it owns no stitch;
- `w = 1`: the last existing stitch of each preceding section is a one-stitch persistent raglan lane;
- `w = 2`: the last two existing stitches of each preceding section are a two-stitch persistent raglan lane;
- ownership policy is `preceding-section-forward-suffix:v1`;
- line treatment is `plain_persistent_knit_lane` for `w > 0`;
- all four line widths are uniform and total line ownership is `4w`;
- marker 4 after `left_sleeve_to_front` remains BOR before `front`.

Stage 88 must preserve the exact source intervals and joined intervals. It may display each `E_i` as “section core plus its following line”, but mathematical reduction applies only to `C_i`. A raglan-lane stitch is not decreased in Stage 88 geometry and is required to survive planned shaping. Changing that rule is Stage 86 rework, not a Stage 88 option.

No target may reorder sections, move BOR, reassign a suffix, merge an interface, or include held-underarm stitches. Width changes after Stage 87 physical work require the existing recovery sequence.

## 9. Conservation and feasibility invariants

Both active-only and all-live equations must hold exactly:

```text
N0 = N1 + Dtotal
T0 = T1 + Dtotal
T0 = N0 + H
T1 = N1 + H
H_before = H_after
```

In the wording requested for the stage:

```text
start_total_live = end_total_live + total_decreased
```

is valid when both totals include the unchanged held groups. The same equation independently holds for the active joined round.

Additional invariants:

1. `N0 = Σ S_i = Σ C_i + 4w`.
2. `N1 = Σ E_i = Σ C'_i + 4w`.
3. `D_i = C_i - C'_i >= 0`; negative reduction is never treated as an increase.
4. `Dtotal = Σ D_i` and equals `N0 - N1`.
5. `H` stitches remain live, closed `false`, joined into yoke `false`, and decreased `false`.
6. Raglan lanes/markers survive; line count is unchanged.
7. Front/back and sleeve-pair event symmetry follows Section 6.
8. Synchronized totals obey modulo `8`; differentiated body and sleeve totals each obey modulo `4`.
9. Every source and target section occurs exactly once in the cyclic topology.
10. No source count, target count, reduction, or identity is silently normalized or clamped.

`impossible_geometry` applies when any of these is true:

- target circumference is absent, non-positive, non-canonical, or implies no feasible candidate;
- target active total is greater than `N0`;
- any final core would be below `1`;
- any required reduction is negative or violates paired-event parity;
- synchronized geometry requires unequal body/sleeve event counts;
- differentiated geometry lacks a body/sleeve split or has no non-dominated feasible candidate;
- an uncontracted sleeve asymmetry exists;
- line width/ownership/topology does not match Stage 87;
- a held group is closed, joined, missing, duplicated, or included in a reduction;
- the requested polo-opening mode is incompatible with the closed-round geometry model.

The error must retain raw target and candidate diagnostics for review while returning no completed geometry.

## 10. Lifecycle

`ready` should remain a read-only application projection, not a durable state. The minimal durable lifecycle is:

```text
collecting_target_geometry
    -> reviewing_target_geometry
    -> completed
```

There is no separate durable “deriving” state: derivation is deterministic within the command that supplies the final missing input or enters review.

Durable operations are proposed as:

- `start_yoke_target_geometry_planning`;
- `set_top_boundary_mode`;
- `set_finished_base_upper_circumference`;
- `set_differentiated_sleeve_contribution` when required;
- `review_yoke_target_geometry`;
- `confirm_structured_geometry_candidate` when required;
- `complete_yoke_target_geometry`.

Every successful command persists the entire validated state and one operation receipt atomically. Reload resumes from the first missing input, unresolved candidate, or review. Changing an input inside an uncompleted epoch clears derived review and returns to collecting; it does not overwrite completed history.

The snapshot becomes immutable only when the final command presents the current review fingerprint and explicit confirmation. An identical completion UUID/payload replays the same completed bytes; all other post-completion mutation is `COMPLETED_EPOCH_IMMUTABLE`.

Optimistic fences must cover:

- project revision and active calculation;
- progress repository revision;
- Stage 88 domain revision/fingerprint;
- aggregate source fingerprint;
- review fingerprint for completion;
- every predecessor repository revision/state fingerprint during the write transaction.

## 11. Immutable contract/result proposal

Proposed identities:

- kind/domain: `PROJECT_YOKE_TARGET_GEOMETRY_PLANNING`;
- contract: `YOKE_TARGET_GEOMETRY_PLANNING_CONTRACT_V1`;
- result: `YOKE_TARGET_GEOMETRY_PLAN_V1`;
- output: `yoke_target_geometry_completed`.

The completed result should contain at least:

```text
schemaId, resultVersion, contractVersion, kind
identity, planningIdentity, epoch
predecessorIdentity, supersedesPlanIdentity
sourceFingerprint, sourceBindings
stage87ResultIdentity, stage87ResultFingerprint
stage86PlanIdentity, stage86PlanFingerprint
stage78ShapingPolicyIdentity, stage78ShapingPolicyValue
topBoundary { mode, finishedCircumferenceCm, bodyNeckReferenceCm,
              necklineDepthReferenceCm, poloWorkDeferred }
targetYokeHeight { valueCm, derivation, sourceReferences }
gaugeBinding
startGeometry
  activeTotal, totalPhysicalLive, heldTotal
  sections { sourceCount, coreCount, ownedLineCount }
targetGeometry
  activeTotal, totalPhysicalLive, heldTotal
  sections { remainingCoreCount, ownedLineCount, remainingTotal }
  persistentRaglanTotal
reductions
  bySection, bodyTotal, sleevesTotal, total
  synchronizedEventCount? / bodyEventCount? / sleeveEventCount?
candidateReview { rawTargets, feasibleCandidates, selectedCandidate,
                  signedErrors, confirmationReference? }
conservation, symmetry, parity, topologyFeasibility
scheduleFeasibility = not_evaluated_by_geometry_stage
explicitFinalConfirmation, completionOperationId
timestamps, fingerprint
```

The immutable result must be fully recomputable from the source plus recorded target inputs and selected candidate. Validators compare the recomputed canonical object, not just its stored fingerprint. `completedPlan` history remains append-only across epochs.

## 12. Persistence and checkpoints

The actual repository uses `DB_VERSION = 4` and sixteen stores. Stage 83–87 writes use the existing atomic subset:

- `projects`;
- `progress`;
- `operations`;
- `checkpoints`;
- `meta`.

Stage 88 fits the same model:

- add its kind to `SUPPORTED_CALCULATION_PROGRESS_KINDS`;
- store each epoch as a normal `progress` record indexed by project/calculation/kind/epoch;
- store operation evidence in the existing `operations` store;
- create the normal project checkpoint in the same transaction;
- update project materialization/revision and `meta` operation allocation atomically.

No new object store, index, migration record, or DB version is justified. `DB_VERSION` remains `4`, all sixteen store names remain unchanged, and production still has one schema-creation site.

A checkpoint after every successful Stage 88 write is the durable resume point. Restoration/import must pass the normal checksum, allowlist, source-currentness, history-lineage, and fingerprint validators before the state is presented.

## 13. Stale and rework model

Source equality is semantic canonical equality plus authoritative revision/fingerprint checks. A stale record is retained but never mutated or selected as current.

| Change | Uncompleted Stage 88 | Completed Stage 88 | Required action |
|---|---|---|---|
| Stage 86 interface-plan rework | old source becomes stale | completed plan remains immutable/stale | Because physical join has started/completed, first record Stage 87 physical recovery; rework Stage 86; complete a new Stage 87 result; then start a new Stage 88 epoch |
| Stage 87 discrepancy/recovery/rework | old epoch is not current | old completion remains historical | New current Stage 87 result fingerprint requires a new Stage 88 epoch |
| Sleeve target/physical geometry changes (79–81) | invalidates source chain | stale history | Recover Stage 87 and every physically dependent downstream stage before rebuilding the chain; never patch counts in Stage 88 |
| Body physical count or underarm allocation changes (82–85) | invalidates source chain | stale history | Same physical recovery/replanning chain, followed by new Stage 86 and Stage 87 completions |
| Stage 77 strategy or Stage 78 policy changes | incompatible/currentness failure | stale history | Rebuild downstream planning and physical chain; a policy change is not a Stage 88 edit |
| Project measurement or gauge record changes | current source binding fails | stale history | Current architecture fingerprints the whole initialization/gauge source; rebuild the authoritative chain or record the new Stage 88-local target without rewriting upstream facts |
| Stage 88 target correction before completion | same epoch may reset review | n/a | Append a command receipt, clear review, continue collecting |
| Stage 88 correction after completion | forbidden mutation | immutable | New contiguous Stage 88 epoch with predecessor/superseded plan identity |

Changing only the future neck/top target should normally be represented as Stage 88-local rework. Editing Stage 61 after physical sleeves/body exist invalidates the broad transitive chain under the current fingerprint model, even if a human believes the field is unrelated; Stage 88 must honor that strict current architecture.

Future Stage 89 records bind the Stage 88 result fingerprint. A new Stage 88 epoch makes all previous schedules stale. Once physical yoke shaping has begun, Stage 88 rework must be blocked until the future execution stage records physical restoration to the Stage 87 joined boundary. Completed history in every stage remains append-only.

## 14. UX decisions

The page must use project language, not enum identities.

### Question 1: polo/opening boundary

Prompt:

> Когда должен начаться разрез поло относительно реглана?

Human choices:

- **После реглана.** “Сначала довяжем закрытую кокетку до верхнего края, затем отдельно спланируем переднюю горловину, разрез и воротник.” This selects the Stage 88 closed-base-yoke model.
- **Во время реглана.** “Разрез или передняя горловина должны начаться до окончания регланных убавок.” This does not produce guessed geometry; it returns the user to the required neckline/polo construction decision.
- **Пока не уверен.** Show why the closed-round and opened-front schedules differ and keep completion blocked.

The system cannot infer this choice because no current result contains polo-opening timing and Stage 87 only proves a closed round.

### Question 2: finished upper circumference

Prompt:

> Какой должна быть готовая окружность верхнего края кокетки до планки и воротника?

Choices/actions:

- enter a finished circumference in centimetres;
- explicitly use the displayed body-neck reference (for example, `36 cm`) as the finished target;
- return to project details if the body-neck reference itself is wrong.

The UI must state that “глубина горловины 10 см” is a vertical reference and does not answer this question. It must not preselect the body neck value or add an ease percentage.

### Question 3: differentiated endpoint only

Prompt:

> Какую часть верхнего края должен занимать каждый рукав?

The user enters the finished per-sleeve contribution in centimetres. The UI explains that the selected “раздельный ритм корпуса и рукавов” permits multiple body/sleeve endpoint splits with the same total circumference. When discrete constraints leave several non-dominated candidates, cards show human-readable outcomes: remaining front/back/sleeve stitches, actual centimetres, and signed deviations. The user confirms one; internal candidate keys stay hidden.

For synchronized policy this question is omitted because one event count determines all four section reductions.

### Review

The review shows:

- “Кокетка: 21 см from join to upper edge” (runtime value, not a hard-coded example);
- requested and achievable upper circumference;
- remaining stitches for front, back, each sleeve, and each raglan line;
- total/body/sleeve reductions;
- explicit notice that four underarm groups remain untouched;
- “Rows and cadence will be planned next; no decreases have been worked yet.”

Fingerprint, revision, epoch, source-binding, operation UUID, and internal enum values are never shown as user content.

## 15. Successor boundary

The separate successor is proposed as:

`PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING`

This identity follows existing project-stage naming: subject (`RAGLAN_SHAPING_SCHEDULE`) plus responsibility (`PLANNING`). Its likely output boundary is `raglan_shaping_schedule_completed`; that name is a proposal to be validated in the next architecture/production task, not an existing contract.

Stage 89 must know:

- current immutable Stage 88 result and fingerprint;
- current Stage 78 policy identity/value;
- target yoke height and applicable row gauge/pattern phase;
- exact start/target core and line counts;
- body and sleeve event counts implied by the geometry;
- four interface/marker identities, persistent line width, section order, and BOR;
- polo/opening boundary mode;
- that underarm groups stay out of the working round.

Stage 89 determines concrete row count, shaping rows, body-versus-sleeve event distribution, cadence, spacing, and any required structured tie. It still does not perform the knitting.

Stage 88 intentionally does not perform those tasks because a geometric endpoint can be valid while no row schedule fits the available height/pattern phase. Mixing the two would make a target correction rewrite an execution schedule, blur Stage 78 authority, and make rework/physical recovery less auditable.

## 16. Test plan for future production Stage 88

### 16.1 Happy path

- current completed Stage 87 opens a read-only `ready` projection without a write;
- start creates epoch 1 bound to the exact Stage 87 result/source;
- derived yoke height equals the Stage 77/61 construction derivation;
- closed-base polo mode, finished circumference, and conditional differentiated input are collected in order;
- review contains exact candidate math and no schedule fields;
- explicit final confirmation freezes `YOKE_TARGET_GEOMETRY_PLAN_V1`;
- reload returns byte-equivalent immutable completion;
- successor readiness becomes available only after completion.

### 16.2 Mathematics

- `N0 = N1 + Dtotal` and `T0 = T1 + Dtotal` for every case;
- held total is unchanged and excluded from each `D_i`;
- body and sleeve reduction subtotals sum to total;
- front/back event symmetry and sleeve-pair event symmetry;
- width `0`: no owned line stitches, four marker boundaries preserved;
- width `1`: four persistent stitches preserved, preceding-section ownership retained;
- width `2`: eight persistent stitches preserved, preceding-section ownership retained;
- synchronized candidates obey `N1 = N0 - 8k` and equal even section reductions;
- differentiated candidates obey `N1 = N0 - 4b - 4s` and separate even body/sleeve reductions;
- odd front/back partition preserves its one-stitch difference;
- exact raw integer, lower/upper nearest, equal-distance tie, and no-candidate cases;
- differentiated Pareto dominance and multi-candidate explicit confirmation;
- minimum core `1` and line-inclusive minimum `1 + w`;
- canonical decimals, no exponential notation, no floating silent tolerance.

### 16.3 Failure

- missing/incomplete/unsafe Stage 87 prerequisite;
- stale Stage 77–87 binding, state fingerprint, result fingerprint, or repository revision;
- incompatible contract/result version or output boundary;
- Stage 87 contains any raglan decrease, closed underarm, or changed topology;
- missing current initialization or main gauge binding;
- invalid/non-positive circumference or height;
- target larger than starting geometry/negative reduction;
- insufficient front/back core stitches;
- insufficient Sleeve 1 or Sleeve 2 core stitches;
- unequal sleeves without an asymmetry contract;
- policy parity/divisibility failure;
- impossible target geometry for width `0`, `1`, and `2`;
- `necklineDepth` offered as circumference;
- body neck circumference copied without explicit confirmation;
- polo/opening timing ambiguous or starts during raglan;
- forbidden schedule or physical fields rejected by allowlist.

### 16.4 Persistence and concurrency

- reload after each collected input, unresolved candidate, review, and completion;
- checkpoint restore reproduces canonical state and operation receipts;
- identical UUID/payload returns the same state and repository record without revision growth;
- same UUID/different payload returns `OPERATION_ID_CONFLICT`;
- stale project, repository, domain, source, and review revisions return `REVISION_CONFLICT`/`SOURCE_STALE`;
- two-tab write race commits at most one mutation;
- atomic transaction failure leaves project/progress/operation/checkpoint/meta unchanged;
- export/import round trip retains schema and history;
- IndexedDB remains V4 with the same sixteen stores and one schema-creation site.

### 16.5 Rework

- Stage 86 change before any Stage 87 physical work makes Stage 87/88 unavailable until a new join result exists;
- Stage 86 change after Stage 87 completion is blocked until explicit Stage 87 recovery;
- Stage 87 recovery/rework makes uncompleted/completed Stage 88 stale without mutation;
- Stage 79 sleeve geometry, Stage 82 body count, or Stage 83–85 allocation replacement invalidates the chain;
- project initialization/gauge replacement invalidates its bound geometry;
- completed Stage 88 rejects mutation;
- Stage 88 rework appends a contiguous epoch with predecessor/superseded identities;
- previous completed result bytes and fingerprint remain unchanged;
- future physical shaping blocks Stage 88 rework until physical recovery exists.

### 16.6 Integration and presentation

- Stage 87 completion routes to Stage 88 only after the route exists;
- saved-project routing resumes each Stage 88 lifecycle;
- Stage 89 route remains unavailable before Stage 88 completion;
- completed Stage 88 advertises planning, not physical execution;
- project view contains no fingerprint/revision/UUID/internal enum leakage;
- HTML uses human polo/geometry wording and contains no contract identity;
- no Stage 88 production files or route exist before the authorized implementation task;
- existing Stage 77–87 and navigation regressions remain green.

## 17. Verification results

Architecture inspection covered production domain/application/repository code and tests for Stages 77–87, Stage 61 measurements, Stage 63 gauge, Stage 79 math/gauge bindings, Stage 86 ownership, Stage 87 physical result, saved-project routing, and IndexedDB V4.

Executed against the existing dirty worktree on 2026-08-09:

| Check | Result |
|---|---|
| `npm run test:stage86 --silent` | 10 passed, 0 failed |
| `npm run test:stage87 --silent` | 14 passed, 0 failed |
| Stage 77–85 JS domain/application regression set via `node --test ...` | 83 passed, 0 failed |
| Stage 77–85 Python/UI regression set via `pytest ... -q` | 42 passed, 0 failed |
| Stage 87 Python/UI via `pytest tests/test_project_body_sleeves_join_execution_ui.py -q` | 4 passed, 0 failed; one existing Starlette/httpx deprecation warning |

The tests specifically confirmed the 180-active/40-held fixture conservation, width `0/1/2`, preceding-section ownership, immutable completion, UUID replay, optimistic conflicts, stale-source behavior, recovery requirement, saved routing, and absence of a fabricated Stage 88 route.

`git diff --check` exited `0`. It emitted only pre-existing Windows LF→CRLF conversion warnings for dirty tracked files and reported no whitespace error. Final scoped status is exactly:

```text
?? STAGE_88_ARCHITECTURE_FINDING.md
```

The tracked diff-name set remains the pre-existing dirty set (`package.json`, `src/yarnai/http.py`, existing static/calculation files, and existing integration tests); Stage 88 added no tracked production diff. No existing dirty file was repaired, removed, staged, committed, or pushed.

## 18. Exact production implementation plan for the next task

When production Stage 88 is explicitly authorized, implement in this order:

1. Create `project-yoke-target-geometry-planning.js` with strict schemas, source/result validators, math candidate enumeration, lifecycle commands, receipts, fingerprints, projections, and forbidden-boundary checks.
2. Create `project-yoke-target-geometry-planning-application.js`; reconstruct Stage 87 as the direct predecessor, validate its complete history/currentness, resolve Stage 78/79/86 transitive authorities, and bind current Stage 61/63 measurement/gauge records.
3. Add repository history/get/save/ensure/update methods to `project-system.js` by cloning the Stage 86 planning transaction pattern: existing five-store atomic transaction, contiguous epoch lineage, replay, optimistic fences, source recheck, operation, and checkpoint. Add only the new progress kind; keep DB V4 and all stores unchanged.
4. Add pure JS tests first for source reconstruction, synchronized/differentiated math, widths `0/1/2`, conservation, neckline ambiguity, candidate ties/Pareto review, failures, replay, concurrency, staleness, immutability, and rework.
5. Create the workspace/controller projection and human-language HTML/CSS/assistant files. Render one missing decision at a time and never expose internal identities.
6. Add the Stage 88 route and HTTP/UI tests; update script loading only where the new page/fixture needs it.
7. Add a localhost-only Stage 88 fixture that reuses production-valid Stage 87 completion and supports collecting/review/completed scenarios.
8. Update saved-project navigation so completed Stage 87 routes to Stage 88 and Stage 88 completion reports the Stage 89 planning boundary without inventing a Stage 89 production route.
9. Run the full Stage 77–88 JS chain, relevant Python/UI suites, serialization/security checks, V4/no-migration assertions, `git diff --check`, and scoped status review.
10. Stop at immutable Stage 88 completion. Do not implement a decrease schedule or physical shaping in that task.

## Verdict

`STAGE 88 ARCHITECTURE FOUND`
