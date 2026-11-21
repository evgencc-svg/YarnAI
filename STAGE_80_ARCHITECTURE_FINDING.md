# Stage 80 architecture finding: physical sleeve-pair execution

Date: 2026-08-09

Status: **FOUND**

Proposed domain identity: `PROJECT_SLEEVE_PHYSICAL_EXECUTION`

Proposed contract: `SLEEVE_PAIR_PHYSICAL_EXECUTION_CONTRACT_V1`

Contract version: `1`

This document is an architecture finding only. It does not authorize or contain a
production Stage 80 implementation.

## 1. Current authoritative boundary after Stage 79

The current production boundary is the completed immutable Stage 79 snapshot
`PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING`, contract v1. Stage 79 binds the exact
Stage 61/63/65/70/73/75/76/77/78 chain and establishes an identical planned pair of
bottom-up, in-round sleeves for the selected joined-raglan topology.

For the accepted fixture, Stage 79 can authoritatively plan, among other values:

- a 20 cm finished cuff target;
- a 30 cm finished full sleeve-tube target at the underarm boundary;
- a 40 cm cuff-edge-to-underarm target length;
- 40 planned cuff/cast-on stitches;
- 60 planned full-tube stitches before underarm allocation;
- 10 planned `+2` increase events;
- an ordered main-round schedule;
- a stop condition that explicitly keeps the full tube live and does not hold or
  remove underarm stitches.

Those fixture values are evidence, not product defaults.

Stage 79 is planning authority only. Its code and tests explicitly exclude physical
sleeve results, execution cursors, underarm allocation, combined-yoke arithmetic, and
join execution. Its completed projection reports `physicalSleeveCompleted: false`, and
its stop condition reports both `holdOrRemoveUnderarmStitches: false` and
`physicalConfirmationRequiredLater: true`.

The authoritative chain has the following exact meaning:

| Stage | Contract/status | Authoritative contribution | Still planning/context only | Physical result |
|---|---|---|---|---|
| 61 | initialized project foundation | Normalized confirmed body/garment measurements, including upper arm, sleeve length, and armhole depth, with closure/source fingerprints | Desired garment measurements are not a made sleeve | None |
| 63 | confirmed gauge | User-measured stitches and rows per 10 cm plus preparation/source evidence | Gauge is usable for sleeves only through Stage 79's zone applicability bindings | A swatch measurement, not a sleeve result |
| 65 | completed immutable execution plan | The exact `CAST_ON -> FOUNDATION_SECTION -> PRIMARY_FABRIC` predecessor plan and identities | It remains a partial body plan and must not be extended or reinterpreted as a sleeve plan | None for sleeves |
| 70 | completed preparation epoch | Body foundation method, cuff/rib context, tool, instruction and measurement policy | Its method/pattern facts become sleeve inputs only through Stage 79's explicit inheritance and review | Preparation, not physical completion |
| 73 | completed preparation | Body primary-fabric pattern/repeat/height and known execution context | It is not directly a sleeve plan; Stage 79 owns any accepted sleeve inheritance | Preparation, not physical completion |
| 75 | terminal `TARGET_REACHED` measurement history | Actual measured 30 cm body primary-fabric checkpoint, bound to Stage 74 | It does not prove the body has reached its true underarm boundary | Physical body checkpoint only |
| 76 v1 | completed immutable planning snapshot | `bottom_up`, known garment context, and informational armhole-start derivation | `41 cm`/additional height remain informational and are not execution evidence | None |
| 77 v1 | completed immutable planning snapshot | `construction-strategy:body-sleeves-joined-raglan:v1`; body and two sleeve components join later | No sleeve execution, measurement, or underarm allocation | None |
| 78 v2 | completed immutable planning snapshot | Confirmed raglan shaping policy and exact fail-closed prerequisite list | `blocked_on_prerequisites` is not a new execution plan | None |
| 79 v1 | completed immutable planning epoch | Sleeve targets, applicable gauge contexts, construction, counts, `+2` schedule, stop condition, provenance, policies and source fingerprints | Every count/length is planned; no stitch is claimed to have been physically worked | None |

Fields that Stage 80 must not reinterpret:

- Stage 79 `upperSleeveTargetStitches`/`plannedFullTubeStitches` is a planned endpoint,
  not an actual underarm count.
- Stage 79 planned cuff stitches are not an actual cast-on/cuff count.
- Planned rounds and schedule cursor are not a measured length.
- Stage 76 armhole-start arithmetic is not body-underarm completion.
- Stage 78 raglan policy concerns the later combined yoke, not cuff-to-underarm
  increases or underarm allocation.
- Stage 70 and 73 facts are authoritative in their original body scopes; their sleeve
  meaning exists only through the completed Stage 79 snapshot that reviewed and bound
  them.

No contradiction was found between the completed Stage 79 architecture assumptions and
the current Stage 79 production code. The implementation enforces the intended
planning/physical boundary.

## 2. Relevant existing execution patterns

The repository already establishes the following patterns; Stage 80 should compose
them instead of inventing a new persistence model.

### 2.1. Preparation, execution, physical truth are separate

- Stage 70 freezes an immutable preparation snapshot.
- Stage 71 executes it with `ready -> active <-> paused`; `physicalResult` must remain
  null.
- Stage 72 creates linked measurement epochs and only an explicit physical measurement
  can produce `BELOW_TARGET` or `TARGET_REACHED`.
- Stage 73 freezes the next preparation.
- Stage 74 again uses `ready -> active <-> paused` and forbids a physical result.
- Stage 75 again makes an explicit measurement the physical authority.

Stage 67 additionally demonstrates a `ready -> active -> checking -> completed`
boundary in which a user-entered observed stitch count is compared with the target.
Time, lifecycle, or a click alone does not create the observed count.

### 2.2. Reload, replay and optimistic concurrency

Current execution domains persist the full state required to reconstruct every
lifecycle after reload. Successful commands append operation receipts containing a
UUID-v7 operation id, command, payload fingerprint, resulting revision and timestamp.
An exact repeat is a no-op; reuse of an operation id with different semantics fails.

Repository writes are serialized per project and fenced by the project revision,
progress-storage revision and domain/state revision or fingerprint. Stage 79 adds a
contiguous epoch history and checks the live source chain again before its atomic write.

Stage 80 must preserve all four fences:

1. expected project revision;
2. expected Stage 80 progress repository revision;
3. expected Stage 80 aggregate revision/fingerprint;
4. expected component-attempt revision/fingerprint, or exact current result
   identities/fingerprints for pair validation.

### 2.3. Epoch and immutable-history patterns

- Stage 70 preparation can be rebuilt into a linked successor epoch.
- Stages 72 and 75 keep contiguous measurement attempts linked by
  `predecessorIdentity`; a new below-target attempt requires a newer execution revision.
- Stage 79 completed epochs are immutable; a correction creates a contiguous successor
  and preserves the predecessor snapshot.
- Stage 65 keeps immutable completed plan history separately from the current mutable
  draft.
- The older `SECOND_IDENTICAL_PIECE` domain proves the product already recognizes a
  separately identified second-piece lifecycle and preserves the first physical source
  rather than treating quantity two as one cursor. It is supporting evidence, not a
  schema to copy.

Stage 80 needs two nested component attempt lineages under one immutable shared
preparation. Completed component result snapshots and pair-validation snapshots are
append-only. The containing aggregate may receive later revisions that append a rework
attempt; those revisions must never mutate the earlier completed snapshots.

## 3. Planned versus actual

Stage 79 remains the sole authority for planned sleeve geometry. Stage 80 records what
was physically done or measured. It must retain both values and never overwrite the
planned value with the actual value.

### 3.1. Required and optional actual fields

| Proposed actual field | Why it exists | Entered/confirmed by | Authoritative when | Needed by joining/yoke? | Can be derived from plan? |
|---|---|---|---|---|---|
| `actualCuffStitchCount` | Proves the physical starting/cuff count and supports count-balance audit | User manually counts and confirms after the cuff/cast-on checkpoint | The component completed-result snapshot freezes the confirmed value; an earlier progress receipt is evidence but not terminal authority | Not directly, but needed to explain shaping arithmetic | **No**; planned cuff count may only be shown as comparison |
| `actualUnderarmFullTubeStitchCount` | Supplies the live full-tube count at the exact pre-allocation boundary | User manually counts and confirms | The component completed-result snapshot, at `full_sleeve_tube_at_underarm_before_allocation` | **Yes, mandatory** | **No**; Stage 79 endpoint is not physical proof |
| `actualCuffToUnderarmLengthCm` | Proves achieved sleeve length on the Stage 79 measurement path | User physically measures | Completed-result snapshot after explicit review | Required for sleeve readiness/pair validation; not itself join arithmetic | **No**; planned rounds or length are not actual |
| `actualCuffCircumferenceCm` | Checks the made cuff against fit intent and between sleeves | User physically measures relaxed finished cuff | Completed-result snapshot | No direct arithmetic dependency; useful for pair/fit acceptance | **No** |
| `actualUpperSleeveCircumferenceCm` | Checks the made full tube at the underarm boundary | User physically measures on the declared Stage 79 path/state | Completed-result snapshot | Not a stitch-arithmetic input, but a required fit/pair fact | **No** |
| `actualIncreaseEventCount` | Records how many `+2` events were physically executed and validates count history | User actions may advance event receipts; user confirms final total | Completed-result snapshot | Not directly if the final count is known, but required for auditable rework and pair comparison | **No**; `(final-start)/2` proves a count delta, not the physical actions |
| `completionBoundary` | Prevents a count elsewhere on the sleeve from masquerading as underarm authority | User explicitly confirms the fixed enum `full_sleeve_tube_at_underarm_before_allocation` | Completed-result snapshot | **Yes** | Cannot be inferred from a schedule cursor |
| `targetReachedConfirmation` | Separates “I reached the planned stop” from merely being in progress | User explicit action | A `TARGET_REACHED_DECLARED` receipt; it is a prerequisite, not final result authority | No by itself | **No** |
| `physicalCompletionConfirmation` | Records that this physical sleeve attempt is accepted as finished | User explicit final confirmation | Completed-result snapshot | **Yes** as part of terminal provenance | **No** |
| `deviationNote` | Explains an accepted difference or why rework is required | User | Immutable with the completed result when non-null | Propagated to pair/join review | Never derived; optional when no difference, required when accepting a flagged difference |
| `observedRoundCount` | Optional diagnostic only if the user actually counted rounds | User | Only as explicitly confirmed observational data | No | Must not be synthesized from row gauge or schedule |

V1 should require the first nine fields except `deviationNote` when there is no flagged
deviation and except `observedRoundCount`, which should remain absent or optional. It
should not ask for yarn consumption or elapsed time because no current successor needs
them.

The following values remain side-by-side in every result review:

| Planned (Stage 79) | Actual (Stage 80) |
|---|---|
| cuff target circumference | measured cuff circumference |
| upper-sleeve target circumference | measured upper-sleeve circumference |
| cuff-to-underarm target length | measured cuff-to-underarm length |
| cuff/cast-on target stitches | confirmed actual cuff stitches |
| full-tube underarm target stitches | confirmed actual full-tube underarm stitches |
| planned `+2` event count and schedule | confirmed actual event count plus execution receipts |
| planned stop condition | explicitly confirmed physical boundary |
| applicable gauge/pattern/tool/policies | immutable source binding; never an automatically observed result |

## 4. Storage/domain reuse finding

### Decision

Reuse the existing IndexedDB `progress` store, operation/checkpoint stores, project
serializer, project serialization queue and optimistic revision mechanics. Do not add a
new store and do not raise `DB_VERSION` for Stage 80.

The current `progress` store already has a unique
`[project_id, calculation_id, kind, epoch]` index and stores domain-specific JSON state.
Project export/import already serializes progress generically. A future implementation
will need to add the new progress kind to the supported-kind allowlist and add explicit
Stage 80 domain/repository validation, but that is application code, not an IndexedDB
schema migration.

### Consequence of the current index

Do not attempt to store `sleeve_1` and `sleeve_2` as two records with the same Stage 80
kind and epoch: the existing unique index has no component dimension. Do not change the
index merely for this stage.

Instead, one Stage 80 progress record represents one shared-preparation epoch and holds
two exact component branches. Each branch owns its own `componentEpoch`, revision,
receipt lineage and immutable completed-result history. A change to shared preparation
creates a new top-level Stage 80 progress epoch; rework under the same preparation adds
an epoch only to the selected component branch.

### Required persistence invariants

- exact project/calculation scope and current active calculation;
- one contiguous top-level preparation epoch lineage;
- exact component keys `sleeve_1` and `sleeve_2` and no unknown third branch in v1;
- contiguous attempt epochs independently inside each component;
- immutable shared preparation and immutable completed component/pair snapshots;
- operation-id uniqueness across both component branches and pair-validation commands;
- exact replay returns the same state without a repository revision increment;
- stale component or pair commands fail the aggregate revision fence;
- repository progress revision and state aggregate revision remain explicitly distinct;
- import-unproven, conflict, quarantine, deletion, non-contiguous histories, unknown
  fields and fingerprint mismatches fail closed;
- project serialization captures the Stage 80 progress and immutable history; no
  special side store is allowed.

## 5. Comparison of architecture variants

| Criterion | A: one linear screen/lifecycle for preparation + sleeve 1 + sleeve 2 + pair | B: Stage 80 preparation only; sleeves are successor stages | C: one Stage 80 contract with shared preparation and two independent histories |
|---|---|---|---|
| Immutability | Weak unless the state is internally split; a single cursor encourages mutation | Strong per separate stage | Strong: preparation and every completed attempt are immutable sub-snapshots |
| Reload/resume | Simple UI, ambiguous when sleeves are in different states | Strong but navigation spans several stage kinds/routes | Strong; projection reconstructs each branch independently |
| Independent rework | Poor; often rewinds the whole linear stage | Strong, but requires multiple successor contracts and cross-stage orchestration | Strong; append one attempt only to the selected component |
| Idempotency | Ambiguous without component-scoped receipts | Straightforward per stage | Straightforward when receipt payload includes component/attempt identity and IDs are aggregate-unique |
| Optimistic concurrency | One cursor hides which sleeve conflicted | Independent records reduce conflicts | Aggregate write serializes safely; component fences provide precise diagnostics |
| Operation receipts | Risk of mixing sleeve operations | Naturally separate | Separate per attempt and pair validation, with global uniqueness validation |
| User simplicity | One screen, but state becomes misleading | More screens and handoffs than the physical task warrants | One workspace can show two cards and one pair summary without merging histories |
| Future joining prerequisites | Easy to accidentally expose one combined result | Requires an extra aggregator to prove both results | Pair snapshot already binds the exact two current results |
| Different actual results | Awkward arrays or overwrite risk | Supported | First-class and explicit |
| Hidden sleeve dependency | Linear flow tends to require sleeve 1 before sleeve 2 | None if successor stages are carefully modeled | None: both branches depend only on the shared preparation |
| Current storage fit | Poor unless redesigned into C internally | Fits progress kinds but expands stage surface | Fits one progress kind and current unique index without migration |
| Contract scope | Too broad if modeled as one lifecycle | Too narrow for the requested physical Stage 80 | Exact: one physical pair aggregate, internally separated |

### Recommendation

Choose **variant C**.

Variant C is not “one big mutable screen.” It is one versioned aggregate because the
two pieces must prove a common Stage 79 source, while its internal component histories
remain independent. It preserves separate actual outcomes, supports rework of one
sleeve, and provides a natural pair-validation boundary without making sleeve 2 depend
on sleeve 1.

Variant B remains a defensible fallback if product navigation later requires a distinct
route per physical piece. Even then, the same shared preparation and pair aggregator
would still be required, so it creates more contracts without removing the core model.

## 6. Recommended Stage 80 architecture

Stage 80 is one source-bound sleeve-pair physical execution aggregate:

1. Reconstruct and validate the current completed Stage 79 epoch and its complete live
   Stage 61/63/65/70/73/75/76/77/78 binding.
2. Deterministically project an execution preparation from Stage 79 and freeze it on
   the first Stage 80 write. Do not ask the user to repeat already confirmed choices.
3. Create two stable component identities under that preparation.
4. Permit either component to start independently.
5. Persist start/pause/resume/progress/target-reached receipts per component attempt.
6. Collect physical actuals into a non-authoritative review draft.
7. On explicit final confirmation, freeze an immutable completed-result snapshot for
   that component attempt.
8. When both components have current completed results, create a separate immutable
   pair-validation snapshot bound to their exact identities and fingerprints.
9. Expose only the physical sleeve facts to successors. Do not allocate underarm
   stitches and do not calculate a combined yoke.

The aggregate may be shown on one workspace, but UI layout is not part of this finding.

## 7. Domain identity and version proposal

### Stable identities

- Domain/progress kind: `PROJECT_SLEEVE_PHYSICAL_EXECUTION`
- Contract/schema id: `SLEEVE_PAIR_PHYSICAL_EXECUTION_CONTRACT_V1`
- Contract version: `1`
- Shared preparation identity:
  `projectId:calculationId:sleeve-execution-preparation:preparationEpoch:<stage79SnapshotFingerprint>`
- Component type: `sleeve`
- Component slots: exact enum `sleeve_1 | sleeve_2`
- Component identity:
  `projectId:calculationId:sleeve:<componentSlot>`
- Attempt identity:
  `<componentIdentity>:attempt:<componentEpoch>:<preparationFingerprint>`
- Pair-validation identity:
  `<preparationIdentity>:pair-validation:<pairEpoch>:<result1Fingerprint>:<result2Fingerprint>`

The component identity is intentionally a typed general component identity with stable
sleeve slots, rather than an unvalidated array index. `sleeve_1` and `sleeve_2` are not
left/right handedness. V1 stores `handedness: null`; a future asymmetric design requires
an explicit versioned contract.

### Preventing cross-component writes

Every component operation must contain and validate all of:

- `componentIdentity`;
- `componentSlot`;
- `componentAttemptIdentity`;
- `componentEpoch`;
- expected component revision/fingerprint;
- source preparation identity/fingerprint.

The operation identity payload includes those values. A receipt from `sleeve_1` cannot
replay against `sleeve_2`, and an operation id is unique across the complete aggregate.
An API accepting only an array index is unsafe.

## 8. Lifecycle

The shared preparation has no user-visible mutable lifecycle. It is either absent,
valid and immutable, or blocked/stale as a read projection. Because Stage 79 already
contains all construction and target inputs, a separate persisted `prepared` click
would add no truth. The preparation is frozen atomically with the first Stage 80
physical start command.

Each component attempt uses:

```text
ready -> in_progress <-> paused -> target_reached -> reviewing_result -> completed
                                  ^                   |
                                  |---- resume/rework-|
```

`blocked` and `stale` are projections, not successful physical states.

| State | Authoritative inputs | Allowed operations | Persisted/replayable | Immutable portion | What blocks the next transition |
|---|---|---|---|---|---|
| `ready` | Immutable shared preparation and component identity | `start_component` | Initial state and start receipt | Preparation/source binding | Invalid/stale Stage 79, wrong component, stale revisions |
| `in_progress` | Start timestamp and receipts; confirmed cuff count/event receipts are provisional execution evidence | `confirm_cuff_count`, `record_shaping_event`, `pause_component`, `declare_target_reached` | Full cursor and receipts | Source/preparation identity and earlier receipts | Target declaration requires start, cuff count, valid event cursor and no unresolved correction |
| `paused` | Same evidence as in progress plus pause receipt | `resume_component` | Yes | Same | No result capture while merely paused; resume is explicit |
| `target_reached` | Explicit claim that the planned stop was reached | `open_result_review`, `resume_for_correction` | Yes | Target-reached receipt | This is not measured truth; all required physical actuals are still missing |
| `reviewing_result` | Draft physical measurements/counts, comparison diagnostics | `edit_result_draft`, `return_to_work`, `complete_component` | Yes; reload restores the draft | Source, receipts and target-reached event | Missing/invalid physical fields, wrong endpoint, failed count invariants, or missing explicit confirmation |
| `completed` | Immutable physical result snapshot | Exact replay; `start_component_rework` creates a successor attempt | Entire history is replayable | **Entire completed result snapshot** | No mutation is allowed; rework is append-only |

The four critical user meanings are therefore distinct:

- “started knitting” = `in_progress` after `start_component`;
- “reached the planned point” = `target_reached`, still not a measured result;
- “physically measured/counted result” = a draft in `reviewing_result`;
- “accepted as completed” = immutable `completed` snapshot after explicit confirmation.

## 9. Sleeve 1 / sleeve 2 history model

Both sleeves reference exactly one shared preparation identity and fingerprint. Neither
references the other sleeve as a prerequisite.

Consequences:

- sleeve 2 may start while sleeve 1 is `ready`, `in_progress`, `paused`,
  `target_reached`, `reviewing_result`, or `completed`;
- sleeve 2 never copies actual values from sleeve 1;
- sleeve 1 completion never mutates sleeve 2's state;
- component histories can contain different measured lengths, circumferences, counts,
  event totals, notes and timestamps;
- completed attempts remain readable after rework;
- “current result” means the latest valid unsuperseded completed attempt for that
  component, not the last array element without lineage validation;
- pair validation always binds the exact two current result fingerprints;
- each result retains the shared Stage 79 plan/preparation fingerprint so future code
  can prove both were intended to implement the same plan.

The single aggregate revision means concurrent tabs may conflict even when operating on
different sleeves. That is acceptable and safe in v1: reload and retry preserves both
branches. Silently merging two independently mutated JSON aggregates would weaken
operation ordering and source validation. A future proven need for offline concurrent
piece editing could justify a component dimension in storage, but current architecture
does not.

## 10. Rework and superseding model

### Rework one sleeve after both are completed

For the scenario “sleeve 1 completed; sleeve 2 completed; sleeve 1 must be redone”:

1. Append `componentEpoch + 1` only under `sleeve_1`.
2. Set both `predecessorAttemptIdentity` and `supersedesAttemptIdentity` to sleeve 1's
   prior current attempt identity.
3. Preserve the old sleeve 1 completed result byte-for-byte and fingerprint-for-
   fingerprint.
4. Keep sleeve 2's attempt and completed result current and unchanged.
5. Preserve the old pair-validation snapshot, but mark it non-current by lineage: its
   bound sleeve 1 result is superseded.
6. Block any successor that cites the old pair validation.
7. After the new sleeve 1 result completes, require a new pair-validation epoch bound
   to new sleeve 1 plus unchanged sleeve 2.

This is append-only supersession, not mutation or deletion.

### Rework before sleeve 2 completes

The same component-only rule applies. Sleeve 2 remains independent and may continue.
Pair validation simply remains unavailable until both current component results are
complete.

### Rework shared preparation

A shared preparation can change only after a new completed superseding Stage 79 epoch.
That creates a new top-level Stage 80 preparation epoch. Old Stage 80 history remains
immutable.

Fail closed in v1: a result bound to the old preparation does not become a result under
the new preparation merely because some values look equal. Both component results must
be recreated/reconfirmed under the new preparation unless a later version introduces an
explicit, reviewed compatibility/carry-forward policy.

### Rework after pair validation or after a successor exists

- Pair validation becomes non-current but remains immutable.
- A not-yet-started join preparation becomes stale and must be rebuilt.
- A started physical join cannot be silently rewound by Stage 80. That future domain
  must define its own intervention/rework boundary; Stage 80 only exposes that its bound
  prerequisites were superseded.

## 11. Pair validation model

A separate pair-validation boundary is required inside Stage 80. “Both components have
a completed snapshot” is necessary but does not prove they share a plan or that their
differences were reviewed.

### Strict structural matches

These must match exactly and cannot be waived by a note:

- project and active calculation;
- shared preparation identity/fingerprint and completed Stage 79 fingerprint;
- component type, distinct exact slots and one current result per slot;
- construction direction/topology, working method, cuff/main pattern identities and
  measurement policy/path;
- endpoint `full_sleeve_tube_at_underarm_before_allocation`;
- units and schema/policy versions;
- complete, valid, non-superseded result lineage;
- confirmation that no underarm stitches were held or removed in Stage 80.

### Compared physical values

- actual cuff-to-underarm length;
- actual cuff and upper-sleeve circumferences;
- actual cuff stitch count;
- actual full-tube underarm stitch count;
- actual number of shaping events;
- planned-versus-actual deltas for each sleeve;
- deviation notes.

### Tolerance decision

No current domain rule supplies numeric pair tolerances. Stage 79 rounding error and
gauge applicability policies are planning policies, not physical pair tolerances.
Therefore v1 must persist `tolerancePolicy: null` and must not invent millimetre,
centimetre, percentage or stitch allowances.

Exact equality may produce `matched`. Any physical difference produces
`deviation_requires_decision`, not automatic failure and not automatic acceptance. The
user may either:

- start rework for one component; or
- explicitly accept the recorded divergence with a non-empty note, producing immutable
  `accepted_with_deviation` pair validation.

Acceptance does not rewrite the values and does not label them equal. Future joining
must consume the two actual counts separately. A structural mismatch listed above is
`blocked` and cannot be accepted as a tolerance deviation.

## 12. Underarm authority boundary

The phrase “underarm stitch count” is ambiguous unless the boundary is explicit.
Stage 80 should define only:

`actualUnderarmFullTubeStitchCount` = the manually counted live stitches of one complete
sleeve tube at the underarm endpoint, **before** any stitch is held, removed, allocated
or joined.

It becomes authoritative only in the immutable completed result for that component,
after:

1. the component was physically started;
2. the user declared the Stage 79 stop reached;
3. the user selected/confirmed the exact completion boundary;
4. the user manually entered a positive integer count;
5. the result review showed planned and actual separately;
6. the user explicitly accepted the complete physical snapshot.

Stage 79's planned full-tube count may be used only as a comparison. It cannot populate
the actual field, even when equal in the fixture.

The future joining/body boundary must also obtain, independently:

- actual current body stitch count at the true body-underarm boundary;
- physical confirmation that the body reached that boundary, not merely the Stage 76
  informational height;
- actual full-tube counts for `sleeve_1` and `sleeve_2` from current Stage 80 results;
- an accepted versioned underarm-allocation policy;
- the actual held/removed counts per body and sleeve section;
- later, a validated combined section balance and raglan-line ownership.

Combined yoke arithmetic is forbidden until all those facts coexist. Stage 80 must not
contain `underarmAllocation`, `heldUnderarmStitches`, `combinedYokeStitchCount`, or a
join instruction.

## 13. First genuine user action/input

Completed Stage 79 already knows the cast-on target, cuff/main patterns, applicable
gauges, method, tool context, length target, increase schedule and stop condition. There
is no genuinely missing pre-execution data to ask again.

The Stage 80 workspace can open directly with the source-bound instructions. Its first
genuine user action is:

> **Начать рукав 1 по сохранённому плану**

That action freezes the shared execution-preparation snapshot and records physical
start of `sleeve_1`; it does not claim any stitch count or completion. The domain must
also permit the equivalent action for `sleeve_2` because there is no physical dependency
between the two branches. Presenting sleeve 1 first is guided ordering, not a domain
prerequisite.

The first genuine value requested after physical action is the manually counted actual
cuff/cast-on stitch count. It must not be prefilled as confirmed from Stage 79, although
the planned count may be displayed beside an empty input.

## 14. Exact data Stage 80 should make authoritative

Stage 80 should end with the following authoritative artifacts and no joining
arithmetic:

### Shared immutable preparation

- exact project/calculation and Stage 79 progress/state/completed-snapshot bindings;
- Stage 79 identity, epoch, revision and fingerprints;
- planned targets, selected counts, planned `+2` event count/schedule and stop condition;
- cuff/main pattern, method, direction/topology, tool and applicable gauge references;
- instruction-rendering policy version;
- actual-result schema and measurement-path policy;
- `tolerancePolicy: null` in v1;
- exact component set `{sleeve_1, sleeve_2}`.

### Per current component result

- component identity/slot and component attempt epoch/lineage;
- shared-preparation identity/fingerprint;
- start, target-reached, measured and completion timestamps;
- actual cuff stitch count;
- actual full-tube underarm stitch count before allocation;
- actual cuff-to-underarm length;
- actual cuff and upper-sleeve circumferences;
- actual increase-event count;
- exact completion-boundary enum;
- explicit physical completion confirmation;
- planned-versus-actual comparison without value replacement;
- nullable deviation note under the rules above;
- immutable result fingerprint and operation receipts.

### Current pair result

- exact current sleeve 1 and sleeve 2 result identities/fingerprints;
- strict structural-validation outcome;
- field-by-field actual comparison;
- `matched` or explicitly `accepted_with_deviation` outcome;
- null tolerance policy and any required user acceptance note;
- immutable pair-validation fingerprint, epoch and receipt.

## 15. Exact prerequisites for future successors

### Body-underarm confirmation successor

This work is logically independent of sleeve 1/2 execution and may open as soon as its
own current Stage 75–79 source chain is valid. It need not wait for sleeve 2. It must
produce physical body-underarm completion, current body stitch count and the exact body
boundary. Stage 80 must not produce those facts.

### Join-preparation successor

Do not open safe join arithmetic until all of the following are simultaneously current:

1. current active project/calculation and live-valid Stage 61/63/65/70/73/75/76 v1/77
   v1/78 v2/79 v1 bindings;
2. one current immutable Stage 80 shared preparation bound to the current completed
   Stage 79 epoch;
3. one current non-superseded completed result for `sleeve_1`;
4. one current non-superseded completed result for `sleeve_2`;
5. actual full-tube underarm stitch count for each sleeve at the exact pre-allocation
   endpoint;
6. one current immutable pair-validation snapshot bound to those exact two result
   fingerprints, with outcome `matched` or explicit `accepted_with_deviation`;
7. actual body completion at the true underarm boundary;
8. actual current body stitch count at that boundary;
9. current Stage 77 joined-raglan topology and Stage 78 shaping policy;
10. an approved versioned underarm-allocation and section-balance contract.

Only then may a future join preparation derive or collect held counts and validate:

```text
body live count
+ sleeve_1 live full-tube count
+ sleeve_2 live full-tube count
- exact body/sleeve held allocations
= first combined-yoke working count
```

The formula shape above is a boundary illustration, not a Stage 81 plan and not an
allocation policy. Raglan-line ownership and front/back/sleeve section balance remain
undefined until that later contract.

## 16. Versioned conceptual schema and operations

The following pseudostructure is conceptual and deliberately not production code:

```text
Stage80AggregateV1 {
  kind: "PROJECT_SLEEVE_PHYSICAL_EXECUTION"
  contractSchemaId: "SLEEVE_PAIR_PHYSICAL_EXECUTION_CONTRACT_V1"
  contractVersion: 1
  projectId, calculationId
  preparationEpoch
  aggregateRevision
  predecessorPreparationIdentity?
  source: {
    stage79ProgressId, stage79RepositoryRevision
    stage79StateIdentity, stage79Epoch, stage79StateRevision
    stage79StateFingerprint, stage79CompletedSnapshotFingerprint
    authoritativeChainFingerprint
  }
  preparation: ImmutableSleeveExecutionPreparationSnapshot
  components: {
    sleeve_1: ComponentHistoryV1
    sleeve_2: ComponentHistoryV1
  }
  pairValidations: ImmutablePairValidationSnapshot[]
  timestamps
  fingerprint
}

ComponentHistoryV1 {
  componentType: "sleeve"
  componentSlot: "sleeve_1" | "sleeve_2"
  componentIdentity
  handedness: null
  attempts: ComponentAttemptV1[]
}

ComponentAttemptV1 {
  attemptIdentity, componentEpoch
  predecessorAttemptIdentity?, supersedesAttemptIdentity?
  preparationIdentity, preparationFingerprint
  lifecycle
  revision
  executionProgress: {
    cuffCountConfirmation?
    plannedScheduleCursor
    shapingEventReceipts[]
    targetReachedReceipt?
  }
  resultDraft?
  completedResultSnapshot?
  operationReceipts[]
  timestamps
  fingerprint
}

ImmutableSleeveResultV1 {
  componentIdentity, componentSlot, attemptIdentity, componentEpoch
  preparationIdentity, preparationFingerprint, stage79CompletedSnapshotFingerprint
  plannedComparisonSnapshot
  actualCuffStitchCount
  actualUnderarmFullTubeStitchCount
  actualCuffToUnderarmLengthCm
  actualCuffCircumferenceCm
  actualUpperSleeveCircumferenceCm
  actualIncreaseEventCount
  completionBoundary: "full_sleeve_tube_at_underarm_before_allocation"
  underarmStitchesHeldOrRemoved: false
  targetReachedConfirmation
  physicalCompletionConfirmation
  deviationNote?
  timestamps, sourceFingerprint, fingerprint
}

ImmutablePairValidationV1 {
  pairEpoch, identity
  preparationIdentity, preparationFingerprint
  sleeve1ResultIdentity, sleeve1ResultFingerprint
  sleeve2ResultIdentity, sleeve2ResultFingerprint
  structuralChecks
  physicalComparisons
  tolerancePolicy: null
  outcome: "matched" | "accepted_with_deviation"
  acceptanceNote?
  operationReceipt
  completedAt, fingerprint
}
```

Conceptual operations:

- `start_component`
- `confirm_cuff_count`
- `record_shaping_event`
- `pause_component`
- `resume_component`
- `declare_target_reached`
- `open_result_review`
- `edit_result_draft`
- `return_to_work`
- `complete_component`
- `start_component_rework`
- `validate_pair`
- `accept_pair_deviation`

Every mutating operation has a UUID-v7 id, canonical payload fingerprint, exact source
and expected-revision fences, component/attempt scope where applicable, resulting
revision and canonical timestamp. Identical replay returns the same result; conflicting
reuse fails.

## 17. Risks and open questions

The Stage 80 contract is architecturally closed, but production implementation must
resolve the following bounded details without changing this boundary:

1. **Measurement instructions.** The UI copy must define how cuff and upper-sleeve
   circumference are measured (relaxed state, on/off needles, laid flat versus full
   circumference) consistently with Stage 79. If current Stage 79 wording is
   insufficient, that is a contract clarification before coding, not permission to
   invent a numeric tolerance.
2. **Event receipt granularity.** The UI may record each `+2` event or grouped progress,
   but the final actual count must be explicitly confirmed. Grouping cannot manufacture
   physical truth.
3. **Large aggregate size.** V1 schedules are bounded and two branches are small, but
   implementation should cap operation receipts/history as existing domains do.
4. **Cross-tab UX.** Aggregate-level optimistic concurrency intentionally rejects stale
   writes even across different sleeve cards; the recovery path must reload without
   losing the user's unsent form values.
5. **Accepted count divergence.** Stage 80 may preserve and explicitly accept differing
   actual counts, but no joining calculation may assume they are equal. The later
   underarm contract must decide whether a specific difference is constructible.
6. **Shared-preparation supersession.** V1 fails closed and requires new component
   results under a changed Stage 79 preparation. A future carry-forward policy would
   need semantic-diff proof and explicit confirmation.
7. **Body scheduling.** Body-to-underarm execution may run before, during or after the
   sleeves. Navigation should not encode a hidden sleeve-first dependency.
8. **No tolerance policy exists.** Until a versioned rule is approved, differences are
   visible decisions, never automatically accepted.

None of these questions prevents defining a safe Stage 80 v1 contract. They constrain
its implementation and later successor contracts.

## 18. Files created or changed

- `STAGE_80_ARCHITECTURE_FINDING.md` — created as this architecture finding.

No existing production file was intentionally changed by this task.

## 19. Confirmation of no production implementation

No Stage 80 Python module, browser domain, application/controller, repository API,
route, HTML, CSS, fixture, production test, Stage 81 module, underarm implementation,
joining implementation or yoke implementation was created or changed.

No IndexedDB version was raised. No commit or push was performed.

## 20. Repository state at completion

Current HEAD at the start of and throughout this finding:

```text
1461cd87e7a4c291324635c482a33ea9cc0579bd
```

Final `git status --short` summary:

```text
295 entries total
19 modified tracked files
276 untracked entries
?? STAGE_80_ARCHITECTURE_FINDING.md
```

The large dirty/untracked working tree existed before this finding. The exact full
`git status --short` is reported by the repository on demand; this task adds only the
Stage 80 document and does not claim ownership of the other 294 entries.

STAGE 80 ARCHITECTURE FOUND
