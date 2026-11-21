# Stage 89 architecture finding: raglan shaping schedule planning

Date: 2026-08-09  
Scope: architecture finding only; no Stage 89 production code, route, UI, fixture, storage migration, commit, or push.

## 1. Architecture result

The correct Stage 89 identity is:

`PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING`

The boundary is both necessary and minimal. Production Stage 88 freezes the physically
joined start geometry, the exact target geometry, required reductions, target yoke
height, row gauge binding, raglan-line ownership, and the decision to keep the base yoke
closed. It deliberately returns `scheduleFeasibility = not_evaluated_by_geometry_stage`.
Stage 89 must now prove that those immutable reductions can be placed on concrete,
admissible yoke rounds and produce a deterministic, reviewable schedule.

Stage 89 owns only the schedule. It must not:

- perform or confirm physical knitting;
- count decreases worked by the user;
- change any Stage 88 start count, target count, reduction, height, or boundary decision;
- choose another Stage 78 shaping policy;
- consume or move Stage 86 raglan-line stitches or markers;
- close held underarm groups;
- plan or execute neckline, collar, placket, steek, cut, pickup, or front opening work;
- hide infeasibility behind a tolerance, clamp, rounded event count, or changed target.

The proposed immutable identities are:

```text
domain identity:     PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING
contract schema:     RAGLAN_SHAPING_SCHEDULE_PLANNING_CONTRACT_V1
contract version:    1
result schema:       RAGLAN_SHAPING_SCHEDULE_PLAN_V1
result version:      1
completion boundary: raglan_shaping_schedule_completed
successor boundary:  PROJECT_RAGLAN_SHAPING_EXECUTION
```

`PROJECT_RAGLAN_YOKE_EXECUTION` is rejected as the direct successor name. It is broader
than the result being consumed and could silently absorb neckline, polo, collar, short-row,
or other yoke responsibilities. Existing Stage 88 recovery code already recognizes
`PROJECT_RAGLAN_SHAPING_EXECUTION` as a future physical boundary, which confirms the
narrower identity.

The architecture is found, but production implementation must remain fail-closed until
the yoke fabric has authoritative shaping-row eligibility evidence. Stage 88 supplies an
exact row gauge, but row gauge alone does not prove on which pattern phases a decrease is
allowed.

## 2. Existing production contracts reused

| Stage | Authoritative production fact consumed by Stage 89 | Stage 89 treatment |
|---|---|---|
| 77 `PROJECT_CONSTRUCTION_STRATEGY_PLANNING` V1 | Bottom-up, in-round joined-raglan topology | Revalidate; never reopen construction choice |
| 78 `PROJECT_SHAPING_POLICY_PLANNING` V2 | `raglan_synchronized` or `raglan_differentiated` | Exact scheduling policy authority |
| 79 `PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING` V1 | Current main-pattern identity, numeric repeat/phase metadata, main gauge evidence | Revalidate through the chain; do not reuse the sleeve increase schedule |
| 80 `PROJECT_SLEEVE_PHYSICAL_EXECUTION` V1 | Actual completed sleeve histories and counts | Provenance only through current chain |
| 81 `PROJECT_SLEEVE_PAIR_VALIDATION` V1 | Accepted sleeve-pair symmetry/deviation decision | Preserve; no averaging or correction |
| 82 `PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION` V1 | Actual body tube at underarm | Provenance only through current chain |
| 83 `PROJECT_UNDERARM_ALLOCATION_PLANNING` V1 | Exact held count and no-clamp candidate semantics | Preserve held allocation |
| 84 `PROJECT_JOIN_LAYOUT_PLANNING` V1 | Four-section cyclic layout | Preserve section identities and order |
| 85 `PROJECT_UNDERARM_ALLOCATION_EXECUTION` V1 | Four physically held live groups | Keep outside the yoke schedule |
| 86 `PROJECT_RAGLAN_INTERFACE_PLANNING` V1 | Four interfaces, width `0/1/2`, ownership, persistent lane behavior, BOR/markers | Exact event placement topology |
| 87 `PROJECT_BODY_SLEEVES_JOIN_EXECUTION` V1 | Joined round, physical markers/BOR, one joining round worked, zero decreases | Establishes schedule origin and already-worked round |
| 88 `PROJECT_YOKE_TARGET_GEOMETRY_PLANNING` V1 | Immutable start/target counts, reductions, yoke height, row gauge, closed upper boundary | Direct predecessor and primary schedule source |

The operational pattern from Stages 79 and 83–88 is also reused unchanged:

1. `ready` is a read-only projection and performs no persistence write.
2. The first command opens a contiguous epoch.
3. State and result objects are closed allowlisted schemas with canonical fingerprints.
4. Every write is fenced by project, repository, domain, source, and review revisions or
   fingerprints as applicable.
5. UUIDv7 operation receipts make identical replay a no-op and conflicting UUID reuse an
   `OPERATION_ID_CONFLICT`.
6. Completion freezes an immutable result.
7. Rework and stale-source replacement append epochs; no completed bytes are rewritten.
8. The current predecessor chain is reconstructed from IndexedDB rather than trusted from
   a cached view.

## 3. Contradictions and architecture gaps found

### 3.1 Row gauge is present but not sufficient

Stage 88 production binds positive canonical `rowsPerCmExact` together with gauge record,
confirmation, context, and applicability fingerprints. A schedule cannot be produced
without this binding: height in centimetres alone cannot determine a finite row span.

However, Stage 88's result does not carry the main pattern's `vertical_repeat`,
`end_phase`, or decrease-eligible phases. Stage 79 has the first two fields, but neither
Stage 79 nor Stage 88 defines which phases permit a raglan decrease or which adjacent
stitches a supported decrease may consume. The Stage 79 applicability evidence was also
created for the main sleeve zone and is promoted by Stage 88 to yoke use without a
separate yoke-zone applicability proof.

Therefore Stage 89 V1 requires a source-bound `yokeShapingEligibility` object:

```text
patternIdentity
patternSourceIdentity / patternSourceFingerprint
workingMethod = in_round
verticalRepeat
admissibleEndPhases
decreaseEligiblePhases or explicit eligible-round rule
excludedRoundRule
adjacentCoreConsumptionProof
gaugeApplicabilityToYokeEvidenceFingerprint
policyIdentity / policyVersion
fingerprint
```

It may be reconstructed automatically only from a versioned supported-pattern policy.
Display text such as “stockinette” is not proof. If this object cannot be built, Stage 89
returns `YOKE_SHAPING_ELIGIBILITY_REQUIRED`; it must not assume every round is eligible.

### 3.2 The already-worked joining round must count toward height

Stage 87 physically works exactly one complete joining/setup round with zero decreases.
Stage 88 defines yoke height from the underarm boundary but leaves row conversion to
Stage 89. Consequently total planned yoke rounds include that physical joining round.

Stage 89 must bind:

```text
alreadyWorkedRounds = 1
alreadyWorkedRoundKind = stage87_joining_round
alreadyWorkedDecreaseCount = 0
firstFutureYokeRound = 2
```

Ignoring this fact would overbuild the target height by one row. Counting it as an
available decrease round would contradict Stage 87's immutable zero-decrease result.

### 3.3 Current generic raglan architecture is more polo-specific than necessary

Production Stage 88 uses `closed_base_yoke_before_polo`, `poloWorkDeferred`, and a
product-context heuristic based on whether garment type text contains “polo”. These names
couple otherwise generic yoke geometry to one garment feature. The mathematical schedule
does not need garment type, recipient, polo depth, or neckline depth.

Stage 89 must consume only the semantic fact “the entire scheduled span remains a closed
round and opening/neckline work is deferred”. A future backward-compatible contract
should rename that fact generically, for example
`closed_base_yoke_before_opening_or_neckline_work`, without rewriting Stage 88 history.

### 3.4 Opening during raglan is not supported by the current chain

Stage 88 production can complete only with its closed mode. If a polo, cardigan, or front
neck opening begins during raglan, the work may change from circular to back-and-forth,
the front is no longer a closed cyclic section, and a unified per-row balance must include
front-edge/neck shaping. That is not a small Stage 89 option.

Such a project must stop before Stage 89 with `POLO_OPENING_BOUNDARY_REQUIRED` and enter a
separate future neckline/opening architecture decision. Stage 89 cannot insert a semantic
“stop before opening” because Stage 88's completed geometry already says the whole base
yoke remains closed.

## 4. Proposed Stage 89 contract

### 4.1 Entry prerequisites

Stage 89 may become ready only when all of the following hold:

- the active calculation has a current completed Stage 88 state and immutable result;
- Stage 88 schema/result versions and `yoke_target_geometry_completed` match exactly;
- the Stage 88 result recomputes byte-for-byte from its state and current source;
- all twelve progress bindings from Stages 77 through 88 are current, safe, scoped to the
  same project/calculation, and fingerprint-valid;
- Stage 87 still proves one joining round, physical markers/BOR, live separate held
  underarms, and zero raglan decreases;
- Stage 86 still proves four interfaces and width `0`, `1`, or `2` with the same ownership;
- Stage 88 start totals, target totals, reductions, conservation, symmetry, and parity all
  pass again without correction;
- the exact positive row gauge is current and applicable to the yoke fabric/method;
- a versioned `yokeShapingEligibility` can produce an ordered finite eligible-round set;
- Stage 88 top boundary is closed and all polo/neckline/opening work is deferred;
- no physical Stage 90 raglan shaping attempt already owns a conflicting schedule.

### 4.2 Authoritative Stage 88 data

Stage 89 treats the following Stage 88 values as immutable authority:

- start active total and total physical live count;
- start counts and core counts for front, back, right sleeve, and left sleeve;
- target active total and target section/core counts;
- exact by-section, body, sleeve, and total reductions;
- target yoke height in centimetres and its no-row-rounding provenance;
- line width `w` in `{0,1,2}`, four-line total, ownership, and persistent treatment;
- four interface identities, cyclic order, BOR at marker 4 before front;
- held-underarm total and four live/outside-yoke group facts;
- synchronized/differentiated Stage 78 policy identity and value;
- symmetry, parity, divisibility, topology, and conservation proofs;
- exact row/stitch gauge bindings;
- closed top-boundary mode and deferred polo/neckline work.

Stage 89 derives a schedule from these values; it never writes a corrected copy back to
Stage 88.

### 4.3 Conceptual source schema

```text
source
  projectId, calculationId
  bindings[Stage77..Stage88]
  stage88
    progressId, repositoryRevision
    stateIdentity, stateFingerprint, epoch
    resultIdentity, resultFingerprint
    contractSchemaId/version, resultSchemaId/version
    outputBoundary
  stage87PhysicalOrigin
    resultIdentity, resultFingerprint
    joiningRoundWorkedExactlyOnce = true
    raglanDecreasesWorked = 0
    alreadyWorkedRounds = 1
  policy
    stage78Identity
    value = raglan_synchronized | raglan_differentiated
  topology
    sectionOrder, sections, interfaces
    beginningOfRound
    lineWidth, ownershipPolicy, lineTreatment
    heldGroups
  immutableGeometry
    targetYokeHeight
    startGeometry
    targetGeometry
    reductions
    conservation, symmetry, parity
  rowGauge
    rowsPerCmExact
    gaugeRecordIdentity, confirmationKey, recordFingerprint
    sourceContextFingerprint, applicabilityEvidence
  yokeShapingEligibility
    pattern and policy fields from section 3.1
  topBoundary
    closedForEntireSchedule = true
    openingAndNecklineWorkDeferred = true
  fingerprint
```

### 4.4 Mutable state and immutable result

```text
state
  kind, contractSchemaId, contractVersion
  projectId, calculationId, identity, epoch
  predecessorIdentity, supersedesScheduleIdentity
  lifecycle, revision
  source
  rowCandidateReview
  selectedRowCandidateKey
  scheduleReview
  completedSchedule
  operationReceipts[]
  timestamps
  fingerprint

completedSchedule
  schemaId, resultVersion, contractVersion, kind
  identity, planningIdentity, epoch
  predecessorIdentity, supersedesScheduleIdentity
  sourceFingerprint, sourceBindings
  stage88ResultIdentity, stage88ResultFingerprint
  outputBoundary = raglan_shaping_schedule_completed
  heightPlan
  eligibilityPlan
  eventRequirements
  scheduleRows[]
  intervalProofs
  startGeometry, targetGeometry
  finalGeometryProof
  topologyProof, symmetryProof, conservationProof, capacityProof
  topBoundaryExclusions
  explicitFinalConfirmation
  completionOperationId
  timestamps
  fingerprint
```

The result contains planned actions and exact arithmetic only. It contains no observed
round cursor, actual decrease count, physical confirmation, placket action, collar action,
or neckline execution field.

## 5. Mathematical schedule model

### 5.1 Round and event semantics

The current construction is in the round. A yoke round is one complete traversal from
the Stage 87 BOR at marker 4 back to the same BOR. Global yoke round `1` is the immutable
Stage 87 joining round. A Stage 89 shaping round is a future global yoke round `r >= 2`
whose event vector is not empty.

For every scheduled round define:

```text
e_r = (B_r, S_r), where B_r,S_r are in {0,1}
```

- `B_r = 1`: perform the body-side decrease at each of the four interfaces;
- `S_r = 1`: perform the sleeve-side decrease at each of the four interfaces;
- `(0,0)`: plain round, no shaping event;
- `(1,1)`: combined body-and-sleeve shaping round.

At one interface:

| Event vector | Body core removed | Sleeve core removed | Total removed at interface |
|---|---:|---:|---:|
| `(1,0)` | 1 | 0 | 1 |
| `(0,1)` | 0 | 1 | 1 |
| `(1,1)` | 1 | 1 | 2 |

Across all four interfaces, a body event removes 4 stitches total, a sleeve event removes
4 stitches total, and a combined event removes 8 stitches total. Because each section
touches two interfaces, a body event removes 2 from front and 2 from back; a sleeve event
removes 2 from each sleeve. Raglan-line stitches are never removed.

Interface-side mapping is fixed:

```text
front_to_right_sleeve: body=front, sleeve=right_sleeve_active
right_sleeve_to_back:  body=back,  sleeve=right_sleeve_active
back_to_left_sleeve:   body=back,  sleeve=left_sleeve_active
left_sleeve_to_front:  body=front, sleeve=left_sleeve_active
```

The schedule specifies semantic core consumption adjacent to each persistent interface.
It does not invent a left/right-leaning decrease technique. A versioned supported
technique or later execution preparation must supply that visual operation without
changing the event counts or rounds.

### 5.2 Required event counts

Let Stage 88 reductions be `Dbody`, `Dsleeves`, and `Dtotal`.

For synchronized policy:

```text
k = Dtotal / 8
Dbody = 4k
Dsleeves = 4k
sum B_r = sum S_r = k
B_r = S_r for every r
```

All divisions must be exact. Any mismatch is `STAGE88_POLICY_CONTRADICTION`; Stage 89 does
not round `k` or alter endpoints.

For differentiated policy:

```text
b = Dbody / 4
s = Dsleeves / 4
sum B_r = b
sum S_r = s
```

Again, both divisions must be exact. Body-only, sleeve-only, and combined rounds are all
admissible when the pattern eligibility contract allows the round. Different body and
sleeve event counts are therefore valid; the capacity condition is not `b+s <= n` because
one round may carry both events. It is `b <= n` and `s <= n`.

### 5.3 Height and total round candidates

Let:

```text
H  = Stage 88 target yoke height in cm
gr = exact applicable rows per cm
y  = H * gr, retained as an exact rational
J  = 1 already-worked Stage 87 joining round
```

Stage 89 cannot exist without `gr`. It builds structurally admissible total-round values,
not `Math.round(y)`. A total `T` is admissible only if:

- `T` is a positive safe integer and `T >= J`;
- it satisfies the bound vertical repeat and end-phase rules;
- its future span `2..T` can be evaluated by the shaping-eligibility policy;
- its exact physical height `T/gr` and signed deviation from `H` are recorded.

The row-candidate review contains the nearest admissible lower and upper neighbors of
`y`; when `y` itself is admissible it is the sole zero-error candidate. Candidates that
cannot hold the required events are marked infeasible, not clamped. The nearest feasible
candidate is selected automatically. An exact equal-distance tie requires explicit
structured candidate confirmation. If no reviewed candidate is feasible, return
`INSUFFICIENT_YOKE_HEIGHT`.

Stage 89 must not search arbitrarily farther from the target solely to make an impossible
schedule fit. That would silently modify Stage 88 height. The user must rework an
authoritative predecessor instead.

For the current fixture, `21 cm * 2.8 rows/cm = 58.8` raw total rounds. The concrete
candidate still depends on the bound vertical phase. Once `T` is selected, only rounds
`2..T` are future rounds because round `1` already exists physically.

### 5.4 Eligible rounds

For selected total `T`, let `A` be the strictly increasing list of future global yoke
rounds that satisfy the bound decrease-eligibility policy:

```text
A = [r | 2 <= r <= T and yokeShapingEligibility.allows(r)]
n = |A|
```

Round `1` is always excluded. No final plain-round guard is invented by Stage 89; round
`T` is eligible only when the bound pattern/operation policy says so. Any additional
transition, pattern-phase, or simultaneous-operation exclusions must be explicit members
of the source policy.

### 5.5 Deterministic even distribution

For a stream of `M` events over ordered eligible set `A` of length `n`, require `M <= n`.
For ordinal `i = 1..M`, choose zero-based eligible index:

```text
j_i = floor(((2*i - 1) * n) / (2*M))
eventRound_i = A[j_i]
```

This places an event at the center of each of `M` equal cells. It is integer-only,
deterministic, and equivalent to distributing the remainder through neighboring interval
lengths. A half-cell tie selects the later eligible position and records
`cellCenterTieDirection = later`. Each `j_i` is computed directly from `i`, so no
cumulative rounded-cadence drift is possible.

For `M = 0`, the stream is empty. Exact uniform spacing is not required to exist:
alternating neighboring intervals are the correct result. The domain stores the explicit
round list and interval proof; a human summary such as “every second round” is emitted
only when it is exactly equivalent to that list.

Synchronized scheduling applies the formula once with `M=k` and assigns `(1,1)` to every
selected round.

Differentiated scheduling applies the same formula independently with `M=b` and `M=s`
over the same canonical `A`, then merges the two sets:

- in body set only: `(1,0)`;
- in sleeve set only: `(0,1)`;
- in both sets: `(1,1)`.

This preserves maximal evenness for each authoritative rhythm. Independent deterministic
streams also avoid an invented preference for or against combined rounds.

### 5.6 Exact count ledger

Starting with Stage 88 section cores, process rounds in ascending order. After each round:

```text
frontCore(r)      = frontCore(r-1)      - 2*B_r
backCore(r)       = backCore(r-1)       - 2*B_r
rightSleeveCore(r)= rightSleeveCore(r-1)- 2*S_r
leftSleeveCore(r) = leftSleeveCore(r-1) - 2*S_r
```

Each section's owned line count `w` is then added unchanged to its displayed total. Every
intermediate core must remain positive. The final ledger must equal every Stage 88 target
section exactly, not merely the total.

### 5.7 Feasibility invariants

Completion requires all of the following:

1. Start geometry matches Stage 88 byte-for-byte.
2. Every reduction is a non-negative safe integer.
3. Synchronized totals are divisible by 8; differentiated body/sleeve totals by 4.
4. Derived event counts are exact integers.
5. Every event round is unique, ordered, inside `A`, and after the Stage 87 joining round.
6. `k <= n`, or both `b <= n` and `s <= n`.
7. Every interface is visited exactly once per event round.
8. A selected side loses exactly one core stitch per interface event.
9. Front/back event symmetry and sleeve-pair event symmetry hold on every shaping round.
10. Width `0/1/2`, marker identities, BOR, ownership, and line totals are preserved.
11. No intermediate section core is negative or below the Stage 88 terminal minimum.
12. Final front, back, sleeve, active-total, and total-live values exactly equal Stage 88.
13. Held-underarm counts and statuses do not change.
14. Sum of schedule deltas equals Stage 88 `Dtotal` exactly.
15. The closed-round top boundary and deferred opening facts remain unchanged.
16. No collar, placket, neckline, opening, physical cursor, or observed count exists in
    state or result.

Failure is explicit: `ROW_GAUGE_REQUIRED`, `ROW_GAUGE_STALE`,
`YOKE_GAUGE_APPLICABILITY_REQUIRED`, `YOKE_SHAPING_ELIGIBILITY_REQUIRED`,
`STAGE88_POLICY_CONTRADICTION`, `REDUCTION_DIVISIBILITY_VIOLATION`,
`INSUFFICIENT_YOKE_HEIGHT`, `SCHEDULE_CAPACITY_EXCEEDED`, `TARGET_COUNT_MISMATCH`,
`RAGLAN_TOPOLOGY_MISMATCH`, or `POLO_OPENING_BOUNDARY_REQUIRED`. No failure changes an
input or produces a partial completed result.

## 6. User-facing schedule and minimal questions

The internal result remains exact, while the presentation groups consecutive plain rounds
and translates event vectors into concrete actions. A schedule item should read like:

```text
Круги 2–5: вяжите без убавок.
Круг 6: у каждого из четырёх маркеров убавьте по 1 петле со стороны корпуса
и по 1 петле со стороны рукава. Петли линии реглана провяжите без изменений.
После круга: перед 38, спинка 38, каждый рукав 48 петель (including owned lines).
```

For body-only or sleeve-only events the other side is explicitly said to remain
unchanged. Width `0` says “marker boundary”; widths `1/2` say to work the persistent one-
or two-stitch lane unchanged. The final card shows exact section totals and a stop at the
Stage 88 closed upper-yoke boundary.

The normal user should answer no new design question. Stage 78 already chose the policy
and Stage 88 already chose the geometry. The only conditional input is an explicit choice
between two structured total-round candidates when exact height deviations tie. The UI
shows actual centimetres and consequences, not enum values.

If pattern/gauge applicability or shaping eligibility is missing, this is a prerequisite
gap, not a generic “which rhythm do you want?” question. The system explains what evidence
is missing and routes to the responsible pattern/gauge boundary.

The final review asks only whether the concrete human-readable plan is correct. It never
shows schema names, policies, fingerprints, epochs, UUIDs, revisions, or intermediate
rational structures.

## 7. Polo interaction

Stage 89 does not ask whether the garment is a polo and does not branch on garment type.
It validates only the already-authoritative Stage 88 facts:

```text
closedForEntireSchedule = true
openingAndNecklineWorkDeferred = true
```

It does not use `necklineDepth`, insert an opening stop, open the work, or produce placket
instructions. A separate future architecture boundary is required for polo/placket or
front-neck execution after the raglan shaping execution has reached its closed base-yoke
boundary. The exact identity of that later feature stage is intentionally not invented in
this finding.

If opening must begin during raglan, the current Stage 88 result is inapplicable and Stage
89 must not start. That path needs a combined open-front/neckline/raglan geometry and
per-row balance contract before any schedule can be safely created.

## 8. Generic reuse assessment

The scheduling kernel is garment-neutral. It depends on topology and arithmetic, not on
the word “polo”. It is reusable for a polo, pullover, sweater, cardigan, or another
bottom-up raglan only when all V1 prerequisites match:

- bottom-up joined construction;
- one closed in-round span for the entire schedule;
- exactly four alternating body/sleeve interfaces;
- two body and two sleeve sections with the Stage 86 ownership model;
- persistent width `0/1/2` interfaces;
- symmetric front/back event semantics and a symmetric sleeve pair;
- a current exact yoke row gauge and pattern eligibility contract;
- a closed Stage 88 target boundary with opening/neckline work deferred.

| Garment case | V1 reuse |
|---|---|
| Closed pullover/sweater raglan | Yes |
| Polo whose opening is a later separate boundary | Yes |
| Polo opening during raglan | No |
| Cardigan worked closed in the round for later steek/opening | Only with a separate authoritative later-opening contract |
| Cardigan worked flat/open from the start | No |
| Raglan with more/fewer than four interfaces or asymmetric shaping | No V1 |

The current architecture therefore has a reusable mathematical core but a polo-specific
Stage 88 vocabulary and a closed-round V1 topology. It must not be advertised as generic
support for every bottom-up raglan garment.

## 9. Lifecycle and routing

The exact lifecycle should be:

```text
read-only ready
  -> collecting_schedule_constraints
  -> reviewing_schedule
  -> completed
```

- `ready`: completed current Stage 88 and all prerequisites validate; no write.
- `collecting_schedule_constraints`: epoch exists; row candidates and eligibility have
  been derived; only a structured tied candidate may need explicit confirmation.
- `reviewing_schedule`: one complete feasible schedule and review fingerprint exist.
- `completed`: immutable schedule result exists.

Changing a row-candidate choice clears the schedule review and returns to collecting.
There is no `in_progress` physical cursor in Stage 89.

Routing is exact:

```text
completed current Stage 88, no Stage 89 epoch -> Stage 89 ready
incomplete Stage 89 bound to current source    -> resume Stage 89
completed Stage 89 bound to current source     -> PROJECT_RAGLAN_SHAPING_EXECUTION
stale Stage 89                                 -> never resume as current
```

Before production Stage 89 exists, saved-project routing remains on Stage 88 with the
blocked reason `PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING`, matching current production
tests.

## 10. Persistence, replay, rework, and stale semantics

Stage 89 uses IndexedDB V4 exactly as it exists. State goes into `progress`; durable audit
operations and project checkpoints use `operations`, `checkpoints`, and `meta`. No new
store, index, database version, or migration is justified.

Every mutation atomically writes:

- the Stage 89 progress state/revision;
- the incremented project revision/current-stage projection;
- the UUID-bound operation payload with source/review fingerprints;
- a checksum-bound project checkpoint.

The source fingerprint includes the direct Stage 88 record/result and the exact current
Stage 77–88 binding chain. Each binding includes progress identity, repository revision,
state identity, and state fingerprint. The aggregate also binds the Stage 88 result
fingerprint, row-gauge evidence, pattern eligibility, topology, and already-worked Stage
87 round.

When a predecessor changes:

- an incomplete Stage 89 epoch is retained as stale history and cannot resume; a new
  contiguous epoch starts against the new source with the prior state as predecessor;
- a completed Stage 89 result remains byte-for-byte immutable and becomes stale for
  routing; a new schedule epoch may supersede it only before physical shaping begins;
- if physical shaping has begun, planning rework is blocked until the future execution
  contract records explicit physical restoration to the Stage 87 joined, zero-decrease
  boundary;
- no stale record is deleted, mutated, or silently rebound.

User-requested schedule rework against the same current Stage 88 source also appends a new
epoch and names `supersedesScheduleIdentity`. Epochs are positive and contiguous;
predecessor identities form an append-only chain.

Operation semantics match recent stages:

- same UUID + same command/semantic payload -> return the already-produced state without
  incrementing project or repository revision;
- same UUID + different semantics, including reuse in another epoch ->
  `OPERATION_ID_CONFLICT`;
- stale project/repository/domain/source/review fence -> `REVISION_CONFLICT`,
  `SOURCE_STALE`, or `REVIEW_STALE` as appropriate;
- completed same-epoch mutation -> `COMPLETED_SCHEDULE_IMMUTABLE`.

## 11. Test plan

### 11.1 Mathematics and topology

1. Synchronized schedule with exact uniform spacing.
2. Synchronized schedule with non-divisible spacing and distributed neighboring
   intervals.
3. Differentiated body/sleeve counts with body-only, sleeve-only, and merged rounds.
4. `b > s`, `s > b`, `b = s`, and one zero stream.
5. Raglan widths `0`, `1`, and `2`; line stitches unchanged at every event.
6. Exact final front/back/sleeve/active/all-live totals equal Stage 88.
7. Stage 87 joining round counted in height and never selected for a decrease.
8. Raw height exactly integral; lower/upper candidates; structural tie requiring explicit
   confirmation; vertical repeat and end-phase filtering.
9. Alternating intervals and half-cell `later` tie are deterministic.
10. Same semantic source produces byte-identical schedule/fingerprint.

### 11.2 Feasibility failures

11. Missing/stale/zero row gauge.
12. Missing yoke-zone gauge applicability evidence.
13. Missing or incompatible decrease-eligible pattern phases.
14. Impossible height: neither adjacent structural row candidate has capacity.
15. Too many synchronized events for eligible rounds.
16. Too many body or sleeve events independently for differentiated scheduling.
17. Stage 88 parity/divisibility or total-conservation corruption.
18. Negative/intermediate-underflow count.
19. Changed BOR, marker, interface ownership, width, or held group.
20. Final per-section target mismatch even when total happens to match.
21. Opening-during-raglan/polo boundary supplied to the closed-round contract.

### 11.3 Lifecycle, storage, and routing

22. Stage 88 completion opens a read-only Stage 89 ready view without a write.
23. Incomplete collecting/reviewing state reloads and resumes exactly.
24. Completion freezes immutable result bytes.
25. Exact replay is idempotent and does not increment project revision.
26. Conflicting operation UUID is rejected across current and historical epochs.
27. Project/repository/domain/source/review optimistic conflicts fail closed.
28. Incomplete stale source appends a replacement epoch and preserves history.
29. Completed stale source appends a superseding epoch only before physical execution.
30. Begun physical execution blocks rework until explicit restoration.
31. IndexedDB remains V4 with the same stores and indexes.
32. Routing covers ready, resume, completed-successor, and stale cases.

### 11.4 Presentation and reuse

33. User sees grouped plain rounds, exact shaping actions, after-round counts, and final
   stop condition, with no internal enum/fingerprint/epoch/schema exposure.
34. Synchronized exact “every second round” wording is emitted only when the explicit
   schedule proves it.
35. Differentiated presentation clearly identifies body-only/sleeve-only/combined rounds.
36. Polo decision never creates a placket/collar/opening action.
37. Generic non-polo pullover fixture completes with identical math.
38. Open-front cardigan fixture fails the V1 prerequisites rather than being coerced into
   a closed polo model.

## 12. Checks performed

Architecture inspection covered:

- production domain/application/repository/workspace code for Stages 77–88;
- Stage 79 sleeve contract and the row/remainder/decrease sections of
  `KNITTING_MATH_CANON.md`;
- Stage 79–88 architecture findings;
- saved-project routing, Stage 88 source reconstruction, Stage 88 immutable result, Stage
  88 recovery guards, and IndexedDB V4 repository methods;
- relevant JS/domain/repository/presentation test definitions.

The existing production stage commands were executed without changing code:

```text
npm run --silent test:stage77  EXIT=0
npm run --silent test:stage78  EXIT=0
npm run --silent test:stage79  EXIT=0
npm run --silent test:stage80  EXIT=0
npm run --silent test:stage81  EXIT=0
npm run --silent test:stage82  EXIT=0
npm run --silent test:stage83  EXIT=0
npm run --silent test:stage84  EXIT=0
npm run --silent test:stage85  EXIT=0
npm run --silent test:stage86  EXIT=0
npm run --silent test:stage87  EXIT=0
npm run --silent test:stage88  EXIT=0
```

The matching Python route/presentation regression was also executed:

```text
python -m pytest -q <Stage 77-88 UI test files>
54 passed, 1 pre-existing StarletteDeprecationWarning
```

## 13. Scoped git status

The worktree was already extensively dirty before this investigation. Those modified and
untracked files were not cleaned, overwritten, staged, committed, or pushed. The only
file created by this task is:

- `STAGE_89_ARCHITECTURE_FINDING.md`

No Stage 89 production code was created.

STAGE 89 ARCHITECTURE FOUND
