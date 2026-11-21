# Finishing gauge evidence V1 architecture finding

Date: 2026-08-11

## 1. Verdict and production stop

**STAGE 93 PRODUCTION REMAINS BLOCKED.**

The realized-edge blocker identified by `STAGE_93_ARCHITECTURE_FINDING.md` is now closed
by the production `PROJECT_REALIZED_FINISHABLE_EDGE_EVIDENCE` boundary. Its completed V1
result supplies the literal, ordered `FINISHABLE_EDGE_TOPOLOGY_V1` required by Stage 93.

A second independent blocker remains. There is no production boundary that can supply a
current, authoritative, version-compatible finishing gauge for the exact finishing yarn,
tool, fabric pattern, working method, and finishing state selected for an edge operation.
Stage 93 is therefore not allowed to enter review or completion for any operation that
requires gauge. It may not substitute body gauge, sleeve gauge, a free-text value, a
centimetre rule, an applicability attestation without technical identities, or a value
derived from Stages 77-92.

This finding defines the minimum missing boundary. It creates no production domain,
application, repository method, route, workspace, assistant, navigation, fixture, Stage
93 code, or migration.

## 2. Baseline inspected

The following production architecture was checked before this finding:

- Stages 89-92 use closed versioned contracts, current-source reconstruction, canonical
  fingerprints, immutable results, UUIDv7 operation replay, optimistic revision fences,
  IndexedDB V4 progress/operations/checkpoints, and separate safe presentation
  projections.
- Stage 91 V3 and Stage 92 V1 remain immutable and do not supply finishing gauge.
- `REALIZED_FINISHABLE_EDGE_EVIDENCE_V1` explicitly records
  `finishingGaugeBinding.requiredBySuccessor = true`,
  `suppliedByThisBoundary = false`, and `bodyGaugeReuseAuthorized = false`.
- `swatch-gauge.js` V1 is a legacy general swatch confirmation. It has measured stitch
  and row values, but its source uses display strings and does not prove the complete
  versioned finishing tuple, working method, finishing state, exact tool contract, or
  successor-scoped current authority required here.
- Stage 79 gauge bindings are embedded, zone-scoped evidence for sleeve cuff/main fabric.
  They are not a reusable standalone finishing-gauge result and cannot be promoted to
  neckline or polo finishing authority.
- No production kind, contract, result, projection, history, application gate, route, or
  saved-workspace action named for finishing-gauge evidence exists.

Consequently, neither an old swatch record nor a Stage 79 binding is an eligible Stage 93
predecessor. Exact tuple equality may allow a future boundary to use a legacy record as
measurement provenance, but only after explicit validation and completion of the new
boundary; it is never a silent migration.

## 3. Canonical identities

The minimal reusable boundary is:

```text
kind:                  PROJECT_FINISHING_GAUGE_EVIDENCE
contract:              FINISHING_GAUGE_EVIDENCE_CONTRACT_V1
contract version:      1
requirement:           FINISHING_GAUGE_REQUIREMENT_V1
requirement version:   1
result:                FINISHING_GAUGE_EVIDENCE_RESULT_V1
result version:        1
projection:            FINISHING_GAUGE_EVIDENCE_PROJECTION_V1
projection version:    1
output boundary:       finishing_gauge_evidence_completed
consumer/successor:    PROJECT_NECKLINE_EDGE_FINISHING_PLANNING
```

`PROJECT_NECKLINE_EDGE_FINISHING_PLANNING`,
`NECKLINE_EDGE_FINISHING_PLANNING_CONTRACT_V1`, and
`NECKLINE_EDGE_FINISHING_PLAN_V1` remain the canonical Stage 93 identities from the
existing finding. The immediate successor of a completed Stage 93 remains
`PROJECT_NECKLINE_EDGE_FINISHING_EXECUTION`; this gauge boundary does not execute pickup,
reactivation, stabilization, neckband, placket, collar, or any other physical action.

## 4. Boundary purpose and ownership

The gauge boundary owns only:

- the exact technical finishing context for which gauge is requested;
- explicit physical swatch measurement evidence for that context;
- exact rational stitch gauge and, when measured, exact rational row gauge;
- measurement and processing conditions;
- applicability proof binding the result to the complete technical tuple;
- current-authority selection, lifecycle, fingerprints, provenance, and completion.

Stage 93 continues to own:

- selection of a supported edge-interface strategy;
- the decision that an operation needs stitch gauge, row gauge, or no gauge;
- target pickup count candidate generation and explicit candidate selection;
- literal use of `FINISHABLE_EDGE_TOPOLOGY_V1` source-unit order;
- integer pickup allocation, zone ownership already proved by the predecessor, global
  operation order, before/after stitch states, and the execution-grade immutable plan.

The realized-edge boundary continues to own physical edge topology, segment/source-unit
order, capabilities, provenance, coverage, overlap proof, adjacency, and corner ownership.
The gauge boundary may not copy, repair, sort, or reinterpret that topology.

The workspace owns data entry only. The assistant may explain measurement and context
requirements, but it cannot provide a gauge, mark evidence authoritative, infer a missing
context identity, choose a Stage 93 candidate, or change an operation order.

## 5. Requirement and predecessor model

Finishing gauge is conditional, so this boundary is a reusable evidence branch rather
than a replacement for realized-edge evidence. Stage 93 has a conjunctive gate:

```text
current completed authoritative REALIZED_FINISHABLE_EDGE_EVIDENCE_V1
+ current completed authoritative FINISHING_GAUGE_EVIDENCE_RESULT_V1
  for every distinct gauge-required technical tuple
-> PROJECT_NECKLINE_EDGE_FINISHING_PLANNING review/completion
```

Before a gauge-required Stage 93 operation can be reviewed, its collecting state emits or
recomputes one immutable `FINISHING_GAUGE_REQUIREMENT_V1`. A previously completed gauge
result may satisfy the requirement only by exact context fingerprint equality and current
authority validation. Otherwise the user enters the reusable gauge-evidence boundary and
returns to the same Stage 93 epoch after completion.

The requirement contains only consumer-owned demand:

```text
schemaId/version
projectId/calculationId
consumerKind/consumerContractVersion/consumerEpoch
consumerStateIdentity/consumerStateFingerprint
edgeEvidenceResultIdentity/edgeEvidenceResultFingerprint
requiredAxes = stitch | stitch_and_row
technicalContext
requirementIdentity/requirementFingerprint
```

The authoritative predecessor facts for a new gauge-evidence record are the current
project/calculation, the current requirement, and stable technical identities referenced
by its tuple. The Stage 92 or realized-edge topology is not re-read to calculate gauge;
its identity/fingerprint is only a consumer-scope fence carried by the requirement.

If the same finishing tuple is deliberately chosen before a Stage 93 epoch exists, a
standalone result may be created against a versioned `preselected_finishing_context_v1`
request. Stage 93 may later bind it only through exact tuple equality. This does not
authorize matching by labels, garment type, same-yarn assumption, or numeric similarity.

## 6. Exact finishing context

`technicalContext` is a closed, fingerprinted object containing at least:

```text
finishingYarnIdentity
finishingYarnSpecificationFingerprint
toolIdentity
toolSpecificationFingerprint
toolSizeExact
fabricPatternIdentity
fabricPatternContractVersion
fabricPatternFingerprint
horizontalRepeat
verticalRepeat
workingMethod = flat | in_round
finishingStateIdentity
finishingStateVersion
finishingStateFingerprint
measurementConditionIdentity
measurementConditionVersion
```

Tool size uses one canonical exact unit and representation defined by its tool contract;
free text is presentation only. Pattern repeat values are positive integers. The
finishing-state contract explicitly describes washing, drying, relaxation, stretching,
blocking, and measurement state. Unknown values fail closed; there is no default
`in_round`, default needle, inherited body yarn, inherited body pattern, or inherited
body finishing state.

Applicability is exact identity equality over the whole tuple. A gauge for one working
method, tool, pattern version, finishing state, or measurement condition cannot satisfy a
different tuple. Same yarn alone proves nothing.

## 7. Measurement and rational gauge semantics

New V1 evidence records physical integer counts and exact measured lengths in one
canonical small unit, provisionally millimetres:

```text
measurement {
  stitchCount: positive integer
  measuredWidthMillimetres: positive integer
  rowCount: positive integer | null
  measuredHeightMillimetres: positive integer | null
  requiredAxes
}
```

Row count and height are both present or both null. They are mandatory when
`requiredAxes = stitch_and_row`. The result stores reduced rational values, never binary
floating point:

```text
stitchesPerMillimetre = stitchCount / measuredWidthMillimetres
rowsPerMillimetre = rowCount / measuredHeightMillimetres | null
```

Numerator and denominator are positive safe integers reduced by exact greatest common
divisor. Display conversions to stitches or rows per 10 cm are projections only and have
no canonical authority. No tolerance, epsilon, clamping, nearest rounding, regression,
or approximation is permitted.

This use of an exact measured swatch length does not authorize centimetre-based pickup
distribution. Stage 93 distributes an already selected integer pickup target `P` across
the topology's ordered discrete source units `U` only by:

```text
floor((j + 1) * P / U) - floor(j * P / U), j = 0..U-1
```

Any rational gauge-to-target conversion in Stage 93 must enumerate finite legal integer
candidates and require explicit selection where the contract does not prove a unique
candidate. It may not round or clamp silently.

## 8. Contract state and immutable result

The mutable V1 state is a closed schema containing:

```text
kind/contractSchemaId/contractVersion
projectId/calculationId
identity/epoch/predecessorIdentity
lifecycle/revision
requirementSnapshot/technicalContext
measurementDraft
review
completedEvidence
operationReceipts
timestamps
fingerprint
```

The immutable `FINISHING_GAUGE_EVIDENCE_RESULT_V1` contains:

```text
schemaId/resultVersion/contractVersion/kind
identity/evidenceIdentity/epoch
projectId/calculationId
requirementIdentity/requirementFingerprint
consumerBinding or preselectedContextBinding
technicalContext/technicalContextFingerprint
measurement/measurementFingerprint
exactGauge { stitchRational, rowRational }
applicabilityProof
provenance
authoritativeCompletion
outputBoundary/successorBoundary
completionOperationId/timestamps
fingerprint
```

`applicabilityProof` recomputes exact tuple equality and required-axis coverage. The
result must contain no Stage 93 operation, pickup target, topology fragment, segment
selection, source-unit allocation, UI ordering, ease choice, or physical-finishing
receipt.

Completion is immutable and byte-recomputable from the validated state. The state and
result fingerprints cover every semantic field. A later different measurement or tuple
creates a successor epoch; it never rewrites a completed result.

## 9. Safe projection

`FINISHING_GAUGE_EVIDENCE_PROJECTION_V1` is derived afresh from a validated state/result.
It may expose:

- lifecycle and whether stitch/row axes are present;
- human-readable yarn, tool, pattern, method, and finishing-state labels resolved from
  separately validated catalogs;
- the measured integer counts and lengths;
- exact gauge rendered for display;
- warnings that evidence is stale, missing, or inapplicable;
- allowed user actions and the return destination.

It must not expose repository/domain revisions, operation UUIDs, canonical fingerprints,
raw consumer bindings, hidden technical identifiers, mutable references to state/result,
or any value that the application later accepts as authority. Mutating a projection can
never change or satisfy the canonical record.

## 10. Lifecycle, replay, and persistence

The canonical lifecycle is:

```text
ready (derived, read-only, no record)
  -> collecting_finishing_gauge_context
  -> collecting_finishing_gauge_measurement
  -> reviewing_finishing_gauge_evidence
  -> completed
```

When a requirement already provides a complete exact context, the first durable command
may enter `collecting_finishing_gauge_measurement` directly. Missing or changed context
returns to context collection and invalidates the measurement review. Changing a
measurement invalidates review. `stale`, `blocked`, `incompatible`, and
`awaiting_finishing_gauge_evidence` are derived routing states, not mutable completion
states.

Persistence reuses IndexedDB V4 and the existing opaque `progress`, `operations`,
`projects`, `checkpoints`, and `meta` transaction. No object store or database version is
added. Every write must atomically re-read and fence:

- project identity and expected project revision;
- active calculation identity;
- current requirement/context identity and fingerprint;
- current repository and domain revision;
- current review fingerprint when completing;
- current authority of all referenced technical identities.

Every operation uses UUIDv7 and a semantic payload fingerprint. Same UUID plus identical
semantics is an idempotent replay without a revision increment. Same UUID plus different
semantics is `OPERATION_ID_CONFLICT`. Stale optimistic fences fail. Reload reconstructs
the exact unfinished lifecycle and review. Completed result mutation fails with
`COMPLETED_FINISHING_GAUGE_EVIDENCE_IMMUTABLE`.

## 11. Current, authoritative, and compatible gate

Stage 93 may accept a gauge result only when the application boundary proves all of the
following independently of UI input:

1. kind, contract, result, and version are exactly the supported V1 identities;
2. the persisted state is `completed` and its result recomputes exactly;
3. state, result, requirement, context, measurement, and applicability fingerprints are
   valid;
4. project and active calculation match the Stage 93 authoritative aggregate;
5. the record is the current history head for that tuple and has no superseding epoch;
6. progress and source records are not deleted, conflicted, quarantined,
   imported-unproven, stale, or non-authoritative;
7. requirement and consumer fences still match the current collecting Stage 93 epoch, or
   a preselected result's exact context matches the current requirement;
8. yarn, tool, tool size, pattern/version/repeats, working method, finishing state, and
   measurement condition all match exactly;
9. every required axis exists and is a positive reduced rational;
10. no body/sleeve gauge substitution or label-based applicability was used.

Failure is explicit and fail-closed. Missing evidence yields
`FINISHING_GAUGE_EVIDENCE_REQUIRED`; tuple mismatch yields
`FINISHING_GAUGE_CONTEXT_MISMATCH`; stale/non-authoritative evidence yields
`FINISHING_GAUGE_EVIDENCE_STALE_OR_NON_AUTHORITATIVE`; unsupported versions yield
`FINISHING_GAUGE_EVIDENCE_VERSION_UNSUPPORTED`; fingerprint mismatch yields
`FINISHING_GAUGE_EVIDENCE_FINGERPRINT_INVALID`.

The application receives one complete authoritative result from repository
reconstruction. It must never accept gauge fragments, rational values, technical labels,
or an applicability boolean from the UI.

## 12. Staleness and successor behavior

Changing any technical tuple member, requirement, active calculation, authoritative
catalog record, finishing-state contract, or measurement evidence makes the previous
binding stale. It remains historical and readable. It cannot be rebound, patched, or
copied into the new context.

If a completed Stage 93 result is bound to gauge evidence and that evidence later loses
current authority before Stage 94 starts, Stage 93 gating becomes stale and a new Stage 93
epoch is required. After a durable Stage 94 start receipt, changing gauge or Stage 93
requires physical restoration to the exact pre-Stage-94 boundary; neither result is
rewritten.

The immediate physical successor after Stage 93 is still
`PROJECT_NECKLINE_EDGE_FINISHING_EXECUTION`. It consumes the completed Stage 93 global
operation stream literally and performs no gauge calculation or allocation. The later
polo placket/collar chain remains separate as defined by the Stage 93 finding.

## 13. Migration and backward compatibility

- Stage 91 V3 bytes and identities are unchanged.
- Stage 92 V1 bytes and identities are unchanged.
- `REALIZED_FINISHABLE_EDGE_EVIDENCE_V1` and `FINISHABLE_EDGE_TOPOLOGY_V1` bytes and
  identities are unchanged.
- Existing `yarnai-confirmed-swatch-gauge` V1 records and Stage 79 completed records remain
  readable and unmodified.
- No legacy record automatically becomes `FINISHING_GAUGE_EVIDENCE_RESULT_V1`.
- A legacy swatch may be cited only as provenance after the new boundary verifies every
  required technical identity and captures any missing exact evidence. The new completed
  result is an explicit new record, not a migrated old record.
- Historical Stage 92 projects without explicit realized-edge evidence remain Stage
  93-ineligible even if a finishing gauge exists.
- Historical realized-edge evidence without explicit finishing-gauge evidence remains
  ineligible for any gauge-required Stage 93 operation.
- Import never grants authority. Imported evidence remains unproven until a future
  explicit revalidation contract creates a new local authoritative result.

## 14. Required production order

The blocker must be closed in this order:

1. implement the generic finishing-gauge evidence domain and validators;
2. implement authoritative reconstruction, IndexedDB V4 persistence, replay/revision
   fences, immutable completion, and safe projection;
3. implement its workspace, assistant, route, saved routing, and exhaustive tests;
4. verify legacy records remain readable and never auto-migrate;
5. only then implement Stage 93 against both authoritative predecessor gates;
6. implement `PROJECT_NECKLINE_EDGE_FINISHING_EXECUTION` only after Stage 93 production is
   complete and execution-grade.

No temporary Stage 93 input field, hard-coded gauge, body-gauge reuse, or partial Stage 93
production surface is permitted while steps 1-4 are absent.

## 15. Test invariants

### Gauge boundary contract

1. Accept a current completed authoritative V1 result for the exact requirement tuple.
2. Reject collecting and reviewing records.
3. Reject stale, superseded, non-authoritative, imported-unproven, quarantined, deleted,
   conflicted, wrong-project, and wrong-calculation records.
4. Reject contract/result/projection/requirement version mismatches.
5. Reject state, result, requirement, context, measurement, applicability, and aggregate
   fingerprint mismatches.
6. Reject missing yarn, tool, exact tool size, pattern/version/repeat, working method,
   finishing state, or measurement condition.
7. Reject tuple matching by display label, garment type, same-yarn assertion, or numeric
   similarity.
8. Reject zero, negative, non-integer, unsafe-integer, floating canonical measurement,
   unpaired row-axis values, and non-reduced rational results.
9. Recompute stitch and row rationals exactly; prove no epsilon, tolerance, clamp, or
   floating-point authority.
10. Require row evidence only when the requirement requests it; never manufacture it.

### Legacy and substitution safety

11. Prove body gauge cannot substitute finishing gauge.
12. Prove sleeve cuff/main gauge cannot substitute finishing gauge by zone resemblance.
13. Prove legacy `swatch-gauge.js` confirmation alone is ineligible.
14. Prove an explicitly wrapped legacy measurement still fails if any technical tuple
    identity is absent or different.
15. Prove no silent migration writes or mutates old records.

### Lifecycle and persistence

16. Ready view performs no write.
17. Context collection, measurement collection, review, and completion transitions are
    exact; semantic changes invalidate review.
18. Pause-by-navigation/reload reconstructs the unfinished record and current review.
19. Same UUIDv7 and same semantics replays without revision change.
20. Same UUIDv7 and different semantics conflicts.
21. Stale project, repository, domain, requirement, source, or review revision conflicts.
22. Completion is immutable and byte-recomputable.
23. Rework creates a contiguous successor epoch without changing predecessor bytes.
24. IndexedDB remains V4 and no new object store or silent migration exists.
25. Safe projection contains no mutable canonical authority or repository internals.

### Stage 93 conjunctive gate

26. Valid realized edge evidence plus valid exact finishing gauge is accepted.
27. Either predecessor missing, incomplete, stale, non-authoritative, incompatible, or
    fingerprint-invalid blocks Stage 93.
28. Historical Stage 92 without explicit realized evidence remains rejected.
29. A no-gauge operation is allowed only when its finite Stage 93 capability explicitly
    declares `gaugeRequirement = none`; this cannot waive gauge for pickup count planning.
30. Distinct zones/operations with different tuples require distinct applicable evidence.
31. Neckline and polo zones remain distinct and are never joined by gauge matching.
32. Topology/source mutation invalidates Stage 93 independently of gauge validity;
    gauge/context mutation invalidates it independently of topology validity.
33. Stage 93 consumes the complete evidence results, never UI-derived fragments.
34. Pickup distribution remains integer-only over immutable ordered source units and is
    unaffected by display units or presentation rounding.
35. A Stage 94 start receipt locks ordinary Stage 93/gauge rework and requires explicit
    physical restoration for changed physical plans.

### UI and assistant

36. UI cannot edit technical authority through labels or projection objects.
37. UI cannot reorder edge segments/source units or create Stage 93 operations.
38. Assistant cannot calculate missing gauge, infer applicability, choose candidates,
    alter operation order, or authorize evidence.
39. Missing evidence routes to the gauge boundary and returns to the same Stage 93 epoch.
40. Completed evidence displays human context and exact measured facts without exposing
    UUIDs, fingerprints, revisions, or raw stored JSON.

## 16. Final architecture decision

The canonical Stage 93 architecture remains valid, including its exact pickup allocation
formula, literal topology consumption, immutable planning result, and immediate execution
successor. Production cannot be implemented safely yet because the required finishing
gauge is not represented by any standalone current/versioned/authoritative evidence
boundary.

The minimum blocker-closing artifact is
`PROJECT_FINISHING_GAUGE_EVIDENCE` with
`FINISHING_GAUGE_EVIDENCE_CONTRACT_V1`,
`FINISHING_GAUGE_EVIDENCE_RESULT_V1`, and
`FINISHING_GAUGE_EVIDENCE_PROJECTION_V1`. Until that boundary exists in production and is
completed for every gauge-required tuple, Stage 93 must remain unavailable.

**STAGE 93 PRODUCTION BLOCKED ON FINISHING_GAUGE_EVIDENCE_V1**
