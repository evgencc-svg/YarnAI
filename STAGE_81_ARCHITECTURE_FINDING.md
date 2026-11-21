# Stage 81 architecture finding: physical sleeve-pair validation

Date: 2026-08-09  
Status: **ARCHITECTURE FOUND; PRODUCTION STAGE 81 NOT IMPLEMENTED**

## 1. Finding and next boundary identity

The next safe boundary after production Stage 80 reaches
`awaiting_pair_validation` is a separate, source-bound validation of the two current
physical sleeve results:

- domain identity: `PROJECT_SLEEVE_PAIR_VALIDATION`;
- contract identity: `SLEEVE_PAIR_VALIDATION_CONTRACT_V1`;
- contract version: `1`;
- successful output boundary: `pair_validation_completed`.

Stage 81 compares and records a decision about an already completed physical pair. It
does not extend Stage 80 execution, alter either sleeve result, calculate a join, or
claim that the body has reached its underarm boundary.

This is a separate boundary even though the pre-implementation Stage 80 finding
anticipated pair validation inside a larger conceptual Stage 80 aggregate. The shipped
Stage 80 V1 contract is narrower and authoritative for the successor: its exact
allowlists contain no pair-validation history or pair-validation operations, and its
projection intentionally stops at `awaiting_pair_validation`. Adding pair state to that
contract now would mutate the established Stage 80 schema and make validation and
physical execution share an ownership boundary. Stage 81 should instead cite Stage 80
immutably.

No production Stage 81 domain, repository method, route, UI, navigation branch, or
fixture is created by this finding.

## 2. Authoritative input chain

Stage 81 must reconstruct the source rather than trust a presentation projection or a
caller-supplied pair.

The authoritative reconstruction order is:

1. Load the active project and active calculation.
2. Reconstruct the current completed Stage 79 history and its live source chain using
   the same validation rules Stage 80 already uses.
3. Load the complete Stage 80 progress history for that calculation, ordered by
   preparation epoch, and reject gaps, unsafe/imported records, bad predecessor links,
   invalid revisions, invalid fingerprints, or project/calculation mismatches.
4. Select the latest Stage 80 preparation epoch only. It must still bind the current
   completed Stage 79 source; a superseded Stage 79 plan makes that Stage 80 preparation
   stale.
5. For each exact slot, `sleeve_1` and `sleeve_2`, select `attempts.at(-1)` as the current
   attempt. Each current attempt must be `completed` and contain a valid immutable
   `SLEEVE_PHYSICAL_RESULT_V1` snapshot.
6. Validate that both current results bind the selected Stage 80 preparation identity
   and fingerprint and the same completed Stage 79 snapshot fingerprint.
7. Copy only the exact source identities, revisions, epochs, and fingerprints into the
   Stage 81 source binding. Copy the actual result payloads into the immutable review
   snapshot; never read the Stage 79 planned values as actuals.

The Stage 80 completed results are the source of truth for:

- actual cuff-to-underarm length;
- actual cuff circumference;
- actual upper-sleeve circumference;
- actual cuff stitch count;
- actual full-tube underarm stitch count before allocation;
- actual increase-event count;
- optional observed round count;
- completion boundary and physical confirmations;
- per-result deviation notes and planned-comparison snapshots.

Stage 79 remains planned comparison context only. Its target values, counts, schedule,
and rounding deviations may be displayed beside each result, but they cannot replace,
repair, average, or pre-accept either Stage 80 actual value.

## 3. Storage reuse decision

Reuse the existing IndexedDB `progress` store and the existing project, operation, and
checkpoint transaction pattern.

The repository already provides:

- IndexedDB version `4`;
- the generic `progress` store;
- the unique `by_scope_epoch` index on
  `[project_id, calculation_id, kind, epoch]`;
- project revision fencing;
- operation and checkpoint records;
- immutable-history patterns used by Stages 79 and 80.

Therefore production Stage 81 needs a new supported progress **kind** and domain-level
repository validation, but it does not need a new object store, a new index, or an
IndexedDB version bump. One progress record represents one Stage 81 validation epoch.
Review edits revise that record; a new source pair or an immutable-decision correction
uses a new contiguous epoch.

Reusing the Stage 80 progress record is not safe. Stage 81 is forbidden to mutate Stage
80, Stage 80's exact field allowlists reject pair fields, and a successor must be able to
cite an immutable pair-validation artifact independently of an execution aggregate.

## 4. Proposed pair-validation schema

The following is a versioned conceptual schema, not production code:

```text
Stage81PairValidationStateV1 {
  kind: "PROJECT_SLEEVE_PAIR_VALIDATION"
  schemaId: "SLEEVE_PAIR_VALIDATION_CONTRACT_V1"
  contractVersion: 1
  projectId, calculationId
  identity, validationEpoch, predecessorIdentity?
  lifecycle: "reviewing" | "completed"
  revision

  source: Stage81SourceBindingV1
  review: ImmutablePairReviewSnapshotV1
  decision: ImmutablePairDecisionSnapshotV1 | null

  operationReceipts[]
  timestamps: { createdAt, updatedAt, completedAt? }
  fingerprint
}

Stage81SourceBindingV1 {
  stage80ProgressId
  stage80RepositoryRevision
  stage80StateIdentity
  stage80PreparationEpoch
  stage80AggregateRevision
  stage80StateFingerprint
  stage80PreparationIdentity
  stage80PreparationFingerprint
  stage79CompletedSnapshotFingerprint
  sleeve_1: {
    componentIdentity
    attemptIdentity
    componentEpoch
    resultIdentity
    resultFingerprint
    resultSourceFingerprint
  }
  sleeve_2: { same fields }
  fingerprint
}

ImmutablePairReviewSnapshotV1 {
  identity
  sourceFingerprint
  tolerancePolicy: null
  structuralChecks[]
  comparisons[]
  detectedDifferences[]
  comparisonOutcome: "exact_match" | "differences_detected"
  fingerprint
}

PairComparisonV1 {
  field
  comparisonPolicy: "exact_v1"
  sleeve1Value
  sleeve2Value
  observationStatus: "observed_both" | "not_observed_both" |
                     "observed_one_only"
  outcome: "equal" | "different" | "not_compared"
}

ImmutablePairDecisionSnapshotV1 {
  identity
  reviewFingerprint
  decision: "accept_pair" | "rework"
  outcome: "matched" | "accepted_with_deviation" | "rework_required"
  acceptanceNote: string | null
  reworkComponents: [] | ["sleeve_1"] | ["sleeve_2"] |
                    ["sleeve_1", "sleeve_2"]
  explicitConfirmation: true
  operationId, decidedAt
  outputBoundary: "pair_validation_completed" | "pair_rework_required"
  fingerprint
}
```

Every object requires an exact field allowlist. Canonical decimal strings, integers,
enums, identities, source revisions, and fingerprints are validated before comparison.
The state fingerprint covers all semantic fields except its own fingerprint field.

## 5. Exact comparisons

V1 has no authoritative numeric tolerance policy. It must persist
`tolerancePolicy: null` and perform only deterministic comparisons.

The following physical fields are compared between the two current Stage 80 result
snapshots:

| Field | V1 comparison |
|---|---|
| `actualCuffToUnderarmLengthCm` | Exact equality of validated canonical decimal values |
| `actualCuffCircumferenceCm` | Exact equality of validated canonical decimal values |
| `actualUpperSleeveCircumferenceCm` | Exact equality of validated canonical decimal values |
| `actualCuffStitchCount` | Exact integer equality |
| `actualUnderarmFullTubeStitchCount` | Exact integer equality |
| `actualIncreaseEventCount` | Exact integer equality |
| `observedRoundCount` | Exact integer equality when both are present; see optional evidence below |

Canonical Stage 80 decimal normalization means string equality and decimal-value
equality should agree. Production validation should nevertheless parse and validate the
canonical representation before comparing, rather than compare unvalidated UI text.

Optional observed rounds have three deterministic states:

- both values present: compare exactly;
- both values absent: record `not_observed_both` and `not_compared`; this is not a
  difference because Stage 80 makes the field optional;
- one present and one absent: record `observed_one_only` as a detected evidence
  difference requiring a user decision.

Stage 79 planned-versus-actual comparisons and per-sleeve deviation notes are copied as
review context. They are not pair-equality fields: equal prose does not prove equal
sleeves, and different explanations do not by themselves prove a physical mismatch.

No Stage 81 V1 rule may introduce `±1 cm`, `±2 stitches`, percentage deviation,
industry norms, display rounding, measurement-error allowances, or an inferred
"small difference" category. Adding any such behavior requires a separately approved,
versioned authoritative tolerance policy and a later contract version.

## 6. Structural checks and non-waivable blockers

Before physical values can be compared, Stage 81 must pass exact structural checks.
These are integrity and boundary requirements, not tolerances, and a user note cannot
waive them:

- active project and calculation match every source record;
- Stage 79 and Stage 80 histories are live, contiguous, non-conflicting, and valid;
- the latest Stage 80 preparation is selected;
- there are exactly two distinct slots, `sleeve_1` and `sleeve_2`;
- each selected attempt is the last attempt of its component and is `completed`;
- each result identity, result fingerprint, attempt identity, and `componentEpoch`
  validates against its branch;
- both results bind the exact selected Stage 80 preparation identity/fingerprint and
  completed Stage 79 snapshot fingerprint;
- result schema and contract versions are recognized;
- both completion boundaries equal
  `full_sleeve_tube_at_underarm_before_allocation`;
- both results state `underarmStitchesHeldOrRemoved: false`;
- both target-reached confirmations and both physical-completion confirmations exist and
  are explicitly true;
- all actual fields required by Stage 80 validate independently.

Confirmation operation IDs and timestamps do not have to equal each other. The check is
that each sleeve has its own valid explicit evidence, not that two physical actions
happened simultaneously.

A failure here yields `blocked_source_invalid` or `blocked_source_stale`, not
`differences_detected`. It cannot be converted to `accepted_with_deviation`; the source
must be repaired or the appropriate Stage 80 rework/supersession flow must complete.

## 7. Detected-difference representation

Comparison never overwrites source values. Each comparison stores both exact values,
the exact comparison policy, observation status, and outcome. `detectedDifferences` is a
deterministically ordered projection of comparison entries whose outcome is `different`
or whose optional-evidence status is `observed_one_only`.

Each difference should contain:

- stable field identity and user-facing label key;
- sleeve 1 value and sleeve 2 value with unit/type metadata;
- `reason: "exact_values_differ"` or `"observation_presence_differs"`;
- no severity, percentage, tolerance band, or automatic rework recommendation;
- references to both source result fingerprints.

`comparisonOutcome` is `exact_match` only when all mandatory fields are equal and no
optional-evidence asymmetry exists. Otherwise it is `differences_detected`.

The review fingerprint covers the source binding, structural-check output, comparisons,
difference list, ordering policy, and `tolerancePolicy: null`. A decision must cite that
exact review fingerprint so a stale or changed comparison cannot be accepted.

## 8. Explicit user decision semantics

The architecturally safe behavior is option **C**: show every deterministic difference
and require an explicit accept/rework decision.

- Option A, fail closed and force rework for every difference, invents an unapproved
  product rule that every non-equality makes a physical pair unusable.
- Option B, automatically accept "small" differences, is impossible without an
  authoritative definition of small and would create a hidden tolerance.
- Option C preserves physical truth, avoids invented tolerances, and leaves the
  workmanship decision with the user who can inspect the real pair.

For an exact comparison, the user still confirms that the displayed pair review is the
pair being accepted. The completed outcome is `matched`.

For detected differences, Stage 81 must show the values side by side and require one of
two explicit actions:

1. `accept_pair`: preserve every unequal value, require a non-empty acceptance note,
   and complete with `accepted_with_deviation`;
2. `rework`: select at least one exact component slot and complete the decision record
   with `rework_required` and output boundary `pair_rework_required`.

Acceptance never relabels unequal values as equal and never edits a Stage 80 result.
Future join preparation must continue to consume sleeve 1 and sleeve 2 actual counts
separately. A pair accepted at Stage 81 is a workmanship/readiness decision, not proof
that later allocation arithmetic is constructible.

The non-empty note for `accepted_with_deviation` is audit context, not a numeric
tolerance. It records why the user accepted visible differences without manufacturing a
system judgment.

## 9. Minimal lifecycle

The minimal persisted lifecycle is:

```text
ready assessment (not persisted)
  -> reviewing
  -> completed
```

- `ready` is a read-only assessment returned only when both current Stage 80 component
  results are completed and all structural prerequisites can be reconstructed. Opening
  the workspace does not write a record.
- `start_pair_review` creates the next Stage 81 epoch, freezes the exact source binding
  and deterministic review snapshot, and enters `reviewing`.
- `complete_pair_decision` requires the current review fingerprint and an explicit user
  decision, then freezes the decision and enters `completed`.

`completed` is a storage lifecycle, not always a successful successor boundary:

- `matched` and `accepted_with_deviation` expose `pair_validation_completed`;
- `rework_required` exposes `pair_rework_required` and does not satisfy join
  prerequisites.

A reviewing record whose Stage 80 source changes is not mutated into a new source. It
becomes historical/stale by current-selection rules, and a new epoch can begin only when
two current completed Stage 80 results exist again. A completed record is immutable.

This lifecycle does not need separate `comparing`, `decision_pending`, `accepted`, or
`stale` persisted states. Comparison is deterministic work performed while creating the
review; decision availability and staleness are projections.

## 10. Immutable history

Stage 81 history is append-only across validation epochs:

- validation epochs are positive and contiguous for one project/calculation/kind;
- every epoch after the first names the previous epoch identity as predecessor;
- a reviewing epoch may advance by revision-fenced writes only;
- once `completed`, its source, review, decision, receipts, timestamps, and fingerprint
  are byte-for-byte immutable;
- exact replay of the same UUID-v7 operation and canonical payload is idempotent;
- conflicting reuse of an operation ID is rejected;
- old accepted and rework decisions remain readable after Stage 80 changes;
- deletion, imported-unproven data, conflicts, quarantine, or broken epoch lineage fail
  closed during reconstruction.

A corrected terminal decision is not patched in place. If correction is allowed before
any downstream physical mutation, it must be an explicitly superseding Stage 81 epoch
that preserves the old decision. Production V1 may safely omit that convenience and
direct an accepted pair that is now unwanted into the normal Stage 80 rework flow.

## 11. Fingerprint and staleness rules

The Stage 81 source fingerprint must cover at least:

- project and calculation identity;
- Stage 80 progress ID and repository revision;
- Stage 80 state identity, preparation epoch, aggregate revision, and state fingerprint;
- Stage 80 preparation identity and fingerprint;
- completed Stage 79 snapshot fingerprint retained by Stage 80;
- for each slot: component identity, current attempt identity, `componentEpoch`, result
  identity, result fingerprint, and result source fingerprint.

The Stage 80 state and preparation fingerprints are both required. The state fingerprint
detects any append/rework change to the aggregate; the preparation fingerprint proves
both results share the same execution source. Exact result fingerprints are the
non-negotiable pair identity.

A Stage 81 record is current only if a fresh authoritative reconstruction produces the
same source binding and:

1. the cited Stage 80 preparation is still the latest preparation epoch;
2. each cited attempt is still `attempts.at(-1)` for its component;
3. both cited attempts are still completed;
4. both current result identities and fingerprints match exactly;
5. the Stage 80 preparation still binds the current completed Stage 79 source;
6. the Stage 81 record is the highest valid epoch for that exact current source binding.

Any mismatch makes the record historical/stale. Staleness is derived; it does not
rewrite the old record. FNV-1a fingerprints follow the current repository convention,
but production authorization must also check identities, revisions, exact schemas, and
canonical payloads rather than rely on the 32-bit hash alone.

## 12. Rework interaction with Stage 80

Stage 81 never calls a domain transition that edits a Stage 80 result and never inserts
an attempt into a Stage 80 state.

If the user chooses to rework `sleeve_1`:

1. Stage 81 records the immutable `rework_required` decision and selected slot.
2. The UI hands off to the existing Stage 80 rework capability for `sleeve_1`.
3. Stage 80, under its own repository/source/revision fences and a separate operation,
   appends a new `componentEpoch`; it preserves the previous completed result and leaves
   sleeve 2 unchanged.
4. While the new sleeve 1 current attempt is not completed, no current pair is available
   for Stage 81.
5. When the new sleeve 1 result completes, its new attempt/result fingerprint makes the
   previous Stage 81 validation stale by source mismatch.
6. A new Stage 81 validation epoch is required for the new current pair.

The same rules apply to `sleeve_2`. Reworking both sleeves selects both slots but still
uses independent Stage 80 rework operations and histories.

If a new completed Stage 79 plan creates a superseding Stage 80 preparation epoch, all
Stage 81 records bound to the old preparation remain historical and none is current.

## 13. Current-validation selection semantics

The repository/application projection must distinguish history from current authority.

For the freshly reconstructed current Stage 80 pair:

1. validate the complete Stage 81 epoch lineage;
2. filter to records whose entire source binding equals the reconstructed current source
   binding;
3. select the highest valid epoch only;
4. treat it as a current completed pair validation only when it is immutable,
   `lifecycle: completed`, its decision cites the exact review fingerprint, and its
   outcome is `matched` or `accepted_with_deviation`;
5. if the highest bound decision is `rework_required`, expose no current accepted pair;
6. if no record matches, return `ready` when both current results are eligible, otherwise
   return the appropriate Stage 80/rework prerequisite blocker.

Do not select an older accepted record merely because it still exists in history. Do not
select by timestamp alone. Do not treat equal result payload values as the same pair when
their current attempt identities, component epochs, or result fingerprints changed.

Production should prevent redundant completed epochs for the same exact source and
decision through idempotent operation replay. A genuinely new epoch requires a new
source binding or an explicitly supported immutable-decision supersession.

## 14. Join blocking and output authority

Stage 81 may authoritatively confirm only:

- which exact current Stage 80 sleeve result pair was reviewed;
- that all non-waivable structural checks passed;
- the deterministic field-by-field equality/difference facts;
- that no numeric tolerance policy was applied;
- the user's explicit acceptance or rework decision;
- `pair_validation_completed` for `matched` or
  `accepted_with_deviation` outcomes bound to those exact results.

Stage 81 must not confirm or calculate:

- physical body completion at the underarm;
- body underarm stitch count;
- held/removed stitch counts or underarm allocation;
- section-balance or combined-yoke arithmetic;
- join preparation or join execution;
- yoke planning/execution;
- polo placket, polo collar, or any other upper-body finishing plan.

Join preparation remains blocked until all of these are simultaneously current:

1. the current completed Stage 80 preparation and current completed result for each
   sleeve;
2. a current completed Stage 81 pair validation bound to those exact two result
   fingerprints, with `matched` or `accepted_with_deviation` outcome;
3. authoritative physical body-underarm completion and actual body count;
4. an approved, versioned underarm-allocation and section-balance policy.

Stage 81 closes exactly prerequisite 2. Its schema is component- and measurement-based,
not sweater-neckline-based, so it remains constructively neutral toward a later
polo-specific upper-body chain.

## 15. Risks and concurrency controls

1. **Stage 80 changes during review.** Starting or completing Stage 81 must re-read the
   exact Stage 80 progress ID, repository revision, state fingerprint, preparation
   fingerprint, current attempt identities, epochs, and result fingerprints. Any change
   rejects the write and requires reload.
2. **Project/calculation switch.** Both the read assessment and atomic write must fence
   the active calculation and expected project revision.
3. **Two tabs.** Stage 81 writes require expected Stage 81 repository revision and state
   fingerprint. The transaction rechecks project, source Stage 80 record, and target
   Stage 81 record before putting progress and operation/checkpoint records.
4. **TOCTOU at rework handoff.** Recording `rework_required` does not itself mutate Stage
   80. The later Stage 80 rework command performs its own current-source and component
   fences; a competing rework or new preparation makes the stale command fail.
5. **Accepted unequal underarm counts.** Acceptance is not an allocation policy. Join
   remains blocked until a later versioned policy proves how the actual separate counts
   can be used.
6. **Optional observed rounds.** Missing values cannot be manufactured. One-sided
   presence remains visible evidence asymmetry; two-sided absence stays explicitly
   unobserved.
7. **Physical facts outside the schema.** Exact recorded values do not prove visually
   identical workmanship, damage, orientation, or comfort. The user-facing pair check
   and explicit acceptance remain necessary.
8. **Fingerprint strength.** Existing FNV-1a fingerprints are integrity aids, not
   collision-resistant signatures. Exact identities, revisions, lineage, schemas, and
   canonical payload validation remain mandatory.
9. **History growth.** Validation records and operation receipts should use the existing
   bounded-history conventions without deleting immutable completed snapshots.
10. **Future tolerance policy.** Adding one later must create an explicitly versioned
    contract/policy and a new review fingerprint; it cannot retroactively reinterpret
    V1 decisions made with `tolerancePolicy: null`.

## 16. First real user action

After two current Stage 80 sleeve results are completed, no actual measurement or count
should be requested again. The first genuinely necessary user action is:

> **Проверить два готовых рукава**

This action starts the source-bound review, displays the already confirmed Stage 80
actual values side by side, and creates the immutable comparison snapshot. It does not
prefill new confirmations, alter either result, or imply acceptance.

If all compared values are exact, the next action is to confirm the pair. If differences
exist, the next action is the explicit accept-with-note or component-rework decision.

## 17. Production implementation recommendation

When production Stage 81 is authorized, implement the smallest vertical slice:

1. a pure `PROJECT_SLEEVE_PAIR_VALIDATION` V1 domain with exact allowlists,
   canonical comparison, fingerprints, lifecycle, decision rules, and current-source
   validation;
2. repository history/get/save methods using the existing `progress`, `operations`, and
   `checkpoints` stores with no database-version change;
3. an application source reconstructor that validates current Stage 79/80 history and
   constructs the exact source binding;
4. a workspace that initially offers “Проверить два готовых рукава”, then shows
   side-by-side actuals, exact differences, and explicit accept/rework actions without
   requesting duplicate measurements;
5. navigation that exposes Stage 81 only at Stage 80
   `awaiting_pair_validation`, routes rework decisions back to the selected Stage 80
   branch, and exposes `pair_validation_completed` only for current accepted outcomes;
6. tests for exact match, every individual difference field, optional observed rows,
   structural blockers, explicit deviation acceptance, each rework slot, stale result
   after rework/new preparation, immutable history, current selection, operation replay,
   cross-tab revision conflicts, reload, and join blocking;
7. assertions that IndexedDB remains V4, no new store exists, Stage 80 results are
   unchanged, and Stage 81 contains no body/allocation/join/yoke/polo logic.

The production implementation must preserve the Stage 80 actual results byte-for-byte
and must not add a tolerance until an authoritative versioned policy exists.

## 18. Repository safety and validation performed

Only this architecture finding is added. No production Stage 81 file, Stage 80 file,
database schema, route, fixture, commit, or push is created or changed.

The existing Stage 80 implementation and its focused test file were inspected to verify
the source fields, immutable result behavior, independent rework epochs,
`awaiting_pair_validation` projection, and existing-store constraint. A focused test run
is reported separately in the completion handoff because the sandbox's Node test-runner
worker spawning may require a single-process invocation.

## 19. Conclusion

Stage 81 is architecturally safe as a separate immutable pair-validation boundary. It
uses exact comparisons only, treats any observed difference as a user decision rather
than an automatic failure or tolerance acceptance, preserves every Stage 80 result and
historical validation, and closes only the pair-validation prerequisite for a future
join chain.

**STAGE 81 ARCHITECTURE FOUND**
