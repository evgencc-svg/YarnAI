# Stage 90 architecture finding: physical raglan shaping execution

Date: 2026-08-09
Scope: architecture finding only. No Stage 90 production domain, repository method,
route, UI, fixture, test, database migration, commit, staging, or push is created by
this task.

## 1. Finding

The correct Stage 90 identity is:

`PROJECT_RAGLAN_SHAPING_EXECUTION`

This is not merely the name proposed by Stage 89. It is the first missing production
responsibility after the current immutable
`PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING` result:

```text
Stage 89 owns which global yoke rounds exist and what must happen on each round.
Stage 90 owns the user's physical traversal and confirmation of those exact rounds.
```

The exact proposed identities are:

```text
domain identity:     PROJECT_RAGLAN_SHAPING_EXECUTION
contract schema:     RAGLAN_SHAPING_EXECUTION_CONTRACT_V1
contract version:    1
result schema:       RAGLAN_SHAPING_EXECUTION_RESULT_V1
result version:      1
completion boundary: raglan_shaping_physically_completed
direct successor:    PROJECT_NECKLINE_OPENING_PLANNING
```

Stage 90 is an execution stage, not a second raglan planner and not a broad yoke stage.
It consumes one current completed Stage 89 schedule byte-for-byte, presents the next
scheduled round, durably records physical confirmations, supports pause/reload/recovery,
and freezes an immutable result only after the complete schedule has physically reached
the Stage 88 target.

The narrower identity is necessary. Names such as `PROJECT_YOKE_EXECUTION` would be
unsafe because they could silently absorb front-neck shaping, a polo opening, a placket,
a collar, underarm closure, or finishing. All of those remain outside Stage 90.

## 2. Production reuse audit: Stages 77-89

The implementation must reuse the current production chain rather than introduce a
parallel framework.

| Stage | Current authority relevant to Stage 90 | Stage 90 treatment |
|---|---|---|
| 77 `PROJECT_CONSTRUCTION_STRATEGY_PLANNING` | Bottom-up body/sleeves joined-raglan construction | Revalidate transitively; never reopen construction choice |
| 78 `PROJECT_SHAPING_POLICY_PLANNING` | Synchronized or differentiated raglan policy | Presentation context only; Stage 89 has already converted it into concrete events |
| 79 `PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING` | Main-pattern identity/repeat/phase and gauge provenance | Revalidate through Stage 89; never reuse the sleeve increase cursor |
| 80 `PROJECT_SLEEVE_PHYSICAL_EXECUTION` | Per-component physical histories, operation replay, pause/resume, immutable attempts | Reuse operation, lifecycle, and epoch principles, not its component-event schema |
| 81 `PROJECT_SLEEVE_PAIR_VALIDATION` | Accepted current sleeve pair | Provenance only; no averaging or correction |
| 82 `PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION` | Pause/resume and immutable physical boundary confirmation | Reuse separation of work, result review, and immutable completion |
| 83 `PROJECT_UNDERARM_ALLOCATION_PLANNING` | Exact held allocation | Must remain unchanged |
| 84 `PROJECT_JOIN_LAYOUT_PLANNING` | Cyclic section order and layout; reload-as-resume for short planning work | Preserve topology |
| 85 `PROJECT_UNDERARM_ALLOCATION_EXECUTION` | One physical observation at a time, exact-count discrepancy, append-only epoch history | Reuse physical confirmation and fail-closed correction patterns |
| 86 `PROJECT_RAGLAN_INTERFACE_PLANNING` | Four interface identities, marker identities, width `0/1/2`, ownership, persistent line treatment, BOR | These are fixed action anchors; Stage 90 cannot choose interfaces |
| 87 `PROJECT_BODY_SLEEVES_JOIN_EXECUTION` | Physical join, four markers, BOR at marker 4, yoke round 1 worked exactly once, zero raglan decreases | Establishes the physical origin and authoritative last-confirmed round before Stage 90 |
| 88 `PROJECT_YOKE_TARGET_GEOMETRY_PLANNING` | Start geometry, target geometry, reductions, target height, closed post-raglan boundary | Immutable endpoint; Stage 90 cannot alter it |
| 89 `PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING` | Ordered `scheduleRows` for rounds `2..T`, per-round event vectors, active interfaces, expected after-round totals, cumulative reductions, final geometry, topology and conservation proofs | Direct and complete execution instruction authority |

Concrete production evidence:

- Stage 89 already declares `NEXT_BOUNDARY = "PROJECT_RAGLAN_SHAPING_EXECUTION"`
  (`src/yarnai/static/project-raglan-shaping-schedule-planning.js:12`).
- Its source requires the exact Stage 77-88 chain and fixes the joining origin as
  `alreadyWorkedRounds = 1`, `firstFutureYokeRound = 2`
  (`project-raglan-shaping-schedule-planning.js:57-85`).
- Each completed schedule row already contains `yokeRound`, `designation`, event vector,
  all four active interfaces when shaping, section effects, cumulative reductions,
  expected after-round section/active/all-live counts, remaining reductions, and the
  terminal marker (`project-raglan-shaping-schedule-planning.js:123-131`).
- Stage 89 recomputes and freezes that complete result and rejects in-place mutation
  (`project-raglan-shaping-schedule-planning.js:150-154`).
- Stage 87's physical result proves one complete setup round, exact BOR, four physical
  markers, no consumed/created stitches, and zero raglan decreases
  (`src/yarnai/static/project-body-sleeves-join-execution.js:122-136`).
- Stages 71/74 already implement explicit `start`, `pause`, `resume`, operation replay,
  optimistic revision/fingerprint fencing, and reloadable durable state. Stage 80 adds
  independent immutable physical attempts and globally unique operation receipts.
- The Stage 89 repository writes progress, project projection, operation, checkpoint,
  and metadata allocation atomically in one IndexedDB transaction
  (`src/yarnai/static/project-system.js:6263-6294`).
- IndexedDB is already V4 with `progress`, `operations`, `checkpoints`, and `meta`
  (`project-system.js:5`, `:107-152`, `:1993-1998`).
- Saved-project navigation currently stops after Stage 89 with blocker
  `PROJECT_RAGLAN_SHAPING_EXECUTION`
  (`src/yarnai/static/user-workspace-entry.js:793-800`).

No missing generic lifecycle, receipt, epoch, storage, or navigation mechanism justifies
a new framework.

## 3. Exact responsibility boundary

### Stage 89 owns

- total yoke round count `T`;
- every global round number from `2` through `T`;
- plain versus shaping designation;
- body/sleeve event vector for each shaping round;
- all four active interface identities;
- expected per-section and aggregate stitch totals after every round;
- cumulative and remaining reductions;
- synchronized/differentiated scheduling consequences;
- target geometry and terminal boundary;
- fixed topology, markers, raglan width/ownership, held groups, and BOR.

### Stage 90 owns

- start of one physical execution attempt against one immutable Stage 89 result;
- durable start/unfinished/completed state for the current scheduled round;
- physical confirmation of each complete round in strict schedule order;
- explicit confirmation of the four Stage 89 actions on a shaping round;
- exact stitch-count observations at the verification points defined below;
- pause/resume and exact reload reconstruction;
- append-only discrepancies and their explicit resolution/recovery references;
- terminal physical review and immutable execution result.

### Stage 90 is forbidden to

- move, add, delete, or reorder a shaping event;
- recalculate the synchronized/differentiated policy;
- change an event from body to sleeve or vice versa;
- choose active interfaces independently of `scheduleRows`;
- change interface ownership, marker order, BOR, line width, or line treatment;
- consume persistent raglan-line stitches;
- change Stage 88 start/target geometry, height, or target circumference;
- clamp or tolerate a wrong stitch count;
- silently insert a catch-up decrease or plain round;
- edit or supersede a Stage 89 schedule after physical work without the explicit
  recovery boundary in section 12;
- open the front, shape a neckline, form a placket, work a collar, close held underarms,
  or perform general finishing.

If the schedule or any predecessor is invalid, Stage 90 fails closed and routes to the
owning upstream boundary. It never repairs the schedule while executing it.

## 4. Authoritative execution unit

The minimum authoritative unit is **one complete global yoke round**.

Alternatives are rejected as follows:

| Candidate | Decision | Reason |
|---|---|---|
| Whole round | **Selected** | It is the unit numbered by Stage 89, begins and ends at the physical BOR, has one expected after-round ledger, supports plain and shaping work, and can be resumed without inventing fractional schedule progress. |
| Shaping event | Rejected as the universal unit | Plain rounds still require physical progress, while differentiated rounds may contain two event streams on the same traversal. |
| Individual interface | Rejected as durable progress | A partially confirmed shaping round creates ambiguity after reload and can cause one or more decreases to be repeated. |
| Action group inside a round | Presentation only | Read-only substeps may help the knitter, but they cannot advance authoritative physical progress. |

### Atomic shaping-round rule

A shaping round may be displayed as four ordered marker actions, but it has exactly one
durable completion command. `complete_round(N)` succeeds only after the user confirms:

1. the full traversal began at Stage 87's BOR marker 4;
2. every interface listed by Stage 89 was encountered exactly once;
3. the prescribed body/sleeve side action was performed at every interface;
4. the persistent raglan lane was worked unchanged;
5. no other decrease, increase, bind-off, pickup, or opening action was performed;
6. the user returned to the same BOR;
7. the required exact after-round count was verified.

No intermediate marker confirmation updates `lastConfirmedYokeRound`. Thus a browser
close after marker 2 cannot make the database claim half a shaping round is complete.

Read-only interface checkboxes may exist as local UI assistance, but they are not stored
as authoritative completion and must not be used to skip actions after reload.

## 5. Round indexing and durable cursor

Global yoke round numbering is inherited without translation:

```text
round 1 = immutable Stage 87 joining/setup round
round 2 = Stage 89 scheduleRows[0] and first Stage 90 physical round
round T = last Stage 89 schedule row and last Stage 90 physical round
```

Definitions:

- `lastPhysicallyConfirmedRound` is the greatest round with an immutable ordered round
  confirmation. At first Stage 90 start it is exactly `1`.
- `nextScheduledRound` is `lastPhysicallyConfirmedRound + 1` while that value is at most
  `T`; after round `T` it is `null` and terminal review is next.
- `currentRound` is the unconfirmed `nextScheduledRound`, not the last completed round.
- `roundWorkStatus` is `not_started`, `in_progress`, or `awaiting_reconciliation` for
  that current round. It never changes the numeric cursor.

The first Stage 90 card therefore says, in human language:

```text
Круг кокетки 2 из T.
Круг 1 уже провязан при соединении корпуса и рукавов.
Сейчас: <exact Stage 89 instruction for round 2>.
```

After `complete_round(N)`, the persisted cursor becomes `N`; reload derives only
`N + 1`. It never increments a cached display number, so there is no off-by-one path.

## 6. Physical round semantics

### Plain round

The UI says to knit one complete round from BOR to BOR without decreases. Completion
requires explicit confirmation of:

- returned to BOR;
- no body or sleeve decrease;
- raglan lanes/markers remained unchanged;
- no unsupported operation occurred.

A numeric recount is not mandatory on every plain round. The expected counts remain
visible and unchanged from the prior checkpoint.

### Shaping round

The UI reads the Stage 89 event vector and active-interface list verbatim. It states for
each of the four marker identities whether to decrease:

- body and sleeve sides (`1,1`);
- body side only (`1,0`); or
- sleeve side only (`0,1`).

It explicitly says the unselected side is unchanged. Stage 90 never derives this mapping
from Stage 78 or from totals; it validates and presents the stored Stage 89 row.

The round remains one atomic physical unit even when it contains both body and sleeve
events. There is no durable “body half complete” or “two interfaces complete” state.

### Started but unconfirmed round

`start_round(N)` is a lightweight durable operation. It records that the knitter may have
begun the physical round but does not advance any count or reduction. This extra receipt
is necessary for truthful recovery from a device/browser interruption.

If the application reloads with `roundWorkStatus = in_progress`, it must not simply show
“do round N” as if nothing may have happened. It changes the status to the derived
`awaiting_reconciliation` projection and asks the user to choose one safe path:

- continue the same unfinished round and then confirm it;
- the full round was already completed: perform the normal exact confirmation now;
- the physical position is uncertain: record a discrepancy and stop advancement.

No choice automatically applies decreases or advances progress.

## 7. Stitch-count verification strategy

V1 uses exact equality and introduces no tolerance.

The selected strategy is:

1. **Start baseline:** before round 2, confirm the Stage 87/Stage 89 starting per-section
   counts, active total, four markers, BOR, and unchanged held-underarm total.
2. **Every shaping round:** enter the actual count for front, back, right sleeve, and left
   sleeve after returning to BOR. The aggregate is derived and must equal Stage 89's
   exact `expectedStitchTotalsAfterRound` for every section and in total.
3. **Plain rounds:** no mandatory recount unless the user requests verification or a
   discrepancy is suspected; the no-change confirmation is still required.
4. **Terminal review:** independently enter the four section counts and confirm active
   total, held total, all-live total, markers/BOR, and geometry boundary.

Why this balance is selected:

- Recounting every plain round adds substantial friction without a planned count change.
- Waiting until the end permits a missed decrease to be many rounds old and makes safe
  physical recovery much harder.
- Checking only an aggregate after shaping can miss an equal-and-opposite distribution
  error, for example a body decrease worked instead of a sleeve decrease.
- Exact per-section counts after shaping are recoverable checkpoints and correspond
  directly to authoritative Stage 89 fields already present. Stage 90 does not invent a
  numeric cadence or tolerance.

An optional “Проверить петли сейчас” action may create an additional checkpoint on any
round. Optional observations never weaken mandatory shaping/terminal checks.

## 8. Lifecycle and state model

The lifecycle is:

```text
read-only ready
  -> active
  <-> paused
  -> terminal_review
  -> completed

derived blockers: awaiting_reconciliation | discrepancy_blocked | stale_recovery_required
```

- `ready`: current completed Stage 89 is fully reconstructed; opening the page writes
  nothing.
- `active`: an execution attempt exists; the projection shows exactly one current round.
- `paused`: explicit pause; cursor and round-work status are unchanged.
- `terminal_review`: all rounds `2..T` have atomic confirmations; final physical counts
  and geometry are not yet frozen.
- `completed`: immutable physical result exists.
- blocker names are projections over durable evidence, not alternate editable sources.

Conceptual state:

```text
state
  kind, contractSchemaId, contractVersion
  projectId, calculationId, identity, epoch
  predecessorIdentity, supersedesAttemptIdentity
  lifecycle, revision
  source
    bindings[Stage77..Stage89]
    stage89 progress/result identities, revisions, fingerprints, versions
    stage88 target identity/fingerprint
    stage87 physical-origin identity/fingerprint
    scheduleFingerprint
  scheduleCursor
    firstRound = 2
    finalRound = T
    lastPhysicallyConfirmedRound
    currentRoundNumber
    roundWorkStatus
    roundStartReceipt
  baselineConfirmation
  roundConfirmations[]
  verificationCheckpoints[]
  discrepancies[]
  recovery
  terminalReview
  completedResult
  operationReceipts[]
  timestamps
  fingerprint
```

`roundConfirmations` is append-only and contiguous. Entry `i` must cite Stage 89 row
`i`, so its expected round is `i + 2`. A completed state cannot be changed in place.

## 9. Pause, resume, reload, and device interruption

### Start

`start_execution` creates the next contiguous Stage 90 epoch, binds the exact current
Stage 89 result and full predecessor chain, sets last confirmed round to `1`, and requires
the exact physical baseline confirmation before round 2 can start.

### Pause

Pause is allowed between rounds or during a started round:

- between rounds: resume returns to `nextScheduledRound` with `not_started`;
- during a round: resume/reload returns to the same round with reconciliation required.

Pause never completes a round and never clears a discrepancy.

### Resume

Resume is an explicit operation against current revision/source fences. It changes only
the lifecycle. It does not increment a round, recreate confirmations, or assume an
in-progress round was completed.

### Reload/browser/device interruption

The controller reloads the current progress record, validates its full epoch history,
reconstructs current Stage 89 independently, compares source fingerprints, and projects:

- exact last confirmed round;
- exact current round and Stage 89 instruction;
- whether the round may have been started;
- latest exact checkpoint;
- unresolved discrepancy/recovery blocker;
- only safe actions.

An `active` state is not automatically persisted as paused merely because the browser
closed; that would require a write that may never happen. Instead, a persisted
`start_round` without matching completion deterministically yields reconciliation on the
next load.

## 10. Operation replay and optimistic concurrency

Every mutation has a UUIDv7 receipt and a semantic payload fingerprint. Required
commands are:

```text
start_execution
confirm_start_baseline
start_round
complete_round
create_verification_checkpoint
record_discrepancy
resolve_current_round_discrepancy
pause_execution
resume_execution
open_terminal_review
complete_execution
start_recovery_epoch
```

Replay rules are identical to recent production stages:

- same UUID + same command and semantic payload returns the already-produced state and
  does not increment repository/project/domain revision;
- same UUID + different payload, command, round, or epoch fails
  `OPERATION_ID_CONFLICT`;
- `complete_round(N)` includes schedule result identity/fingerprint, attempt identity,
  epoch, round number, expected row fingerprint, actual observations, and current source
  fingerprint in its semantic payload;
- replay of `complete_round(N)` cannot append a second confirmation or advance to `N+1`
  twice.

Every write is fenced by:

- expected project revision;
- expected progress-record revision;
- expected Stage 90 domain revision and state fingerprint;
- expected Stage 90 source fingerprint;
- expected Stage 89 result/schedule fingerprint;
- expected current-round number and row fingerprint;
- expected terminal-review/checkpoint fingerprint where applicable.

Two tabs, a stale page, double-click, and a slow save therefore either replay the same
semantic operation or fail closed with `REVISION_CONFLICT`, `SOURCE_STALE`,
`ROUND_CURSOR_CONFLICT`, or `REVIEW_STALE`.

## 11. Discrepancy and correction model

Discrepancies are append-only observations. Recording one never mutates Stage 89 and
never deletes or rewrites a round confirmation.

Examples include:

- wrong per-section or total stitch count;
- missed or extra decrease;
- extra plain round;
- uncertain current round;
- lost/moved marker or BOR;
- closed application during a shaping round;
- dropped/duplicated/bound-off stitch;
- persistent raglan lane altered;
- held-underarm group changed.

Allowed paths:

1. **Retry verification.** A suspected counting error may be recounted. The new
   observation is appended and cites the prior one; it does not overwrite it.
2. **Correct the current unconfirmed round.** The user physically repairs the work,
   performs the exact recount, and resolves the discrepancy by citing the correction and
   verification operations. Only then can the same round be atomically confirmed.
3. **Recover to a verified checkpoint.** If an error is discovered after one or more
   rounds were already confirmed, the current attempt is abandoned but preserved. The
   user physically returns to an exact named checkpoint (or to Stage 87 round 1 when no
   safe checkpoint can be proven), confirms its complete geometry, and a new contiguous
   Stage 90 epoch cites the prior attempt and recovery evidence.
4. **Upstream rework.** If the schedule/geometry itself is wrong, use section 12; physical
   restoration is required before planning changes.

There is no V1 “accept deviation” action. A wrong exact count remains unresolved. A note
alone does not make it correct. Completion is blocked while any discrepancy lacks an
explicit resolution reference.

An extra physically knitted plain round cannot be silently relabelled or inserted into
the schedule. The user must return to a known schedule boundary or perform upstream
rework under an approved recovery flow.

## 12. Upstream staleness and the partial-physical-work case

The authoritative Stage 90 source fingerprint includes:

- every Stage 77-89 progress binding: kind, progress ID, repository revision, state
  identity, and state fingerprint;
- Stage 89 contract/result versions, epoch, state/result identities and fingerprints,
  output boundary, and complete schedule fingerprint;
- Stage 88 target result identity/fingerprint;
- Stage 87 physical join result identity/fingerprint;
- first/final round, topology, BOR, marker/interface ownership, held groups, and target
  geometry.

### Stage 89 changes before Stage 90 starts

No Stage 90 physical history exists. The old Stage 89 result remains historical, and the
new current completed Stage 89 result may open the read-only Stage 90 ready view normally.

### Stage 89 changes after a Stage 90 epoch exists but before round 2 starts

The incomplete Stage 90 epoch becomes stale and is retained. A new Stage 90 epoch may
bind the new schedule only after explicit abandonment/reconciliation proves that the
physical fabric is still exactly at Stage 87's round-1, zero-decrease boundary.

### Stage 89 changes after partial physical execution

This is the hard case and must fail closed:

1. freeze routing on the old Stage 90 attempt as `stale_recovery_required`;
2. preserve every old schedule binding, confirmed round, checkpoint, discrepancy, and
   operation receipt byte-for-byte;
3. do not compare prefixes and automatically “adopt” already-knitted work into the new
   schedule; no current production policy authorizes that equivalence;
4. require explicit physical restoration to the Stage 87 joined boundary: round 1,
   original Stage 88 start counts, four original markers/BOR, zero raglan decreases;
5. append recovery evidence; never delete the old execution or planning history;
6. only after restoration may Stage 89 create/supply a current replacement schedule and
   Stage 90 create a new contiguous execution epoch.

This follows the production Stage 89 rule that schedule rework is blocked once physical
shaping exists until restoration to the Stage 87 boundary. If restoration cannot be
proved, the project remains blocked for explicit expert/manual recovery. The system must
not erase physical facts merely to make routing current again.

## 13. Completion boundary and immutable result

Stage 90 may complete only when all of the following are true:

1. the exact current completed Stage 89 result is still authoritative;
2. baseline round-1 geometry was explicitly confirmed before work;
3. every Stage 89 row from `2` through `T` has exactly one ordered atomic physical
   confirmation and no other round is present;
4. every plain round confirms no stitch-changing action;
5. every shaping round confirms the exact Stage 89 interfaces/event vector and exact
   after-round per-section totals;
6. every checkpoint equals its Stage 89 expected geometry exactly;
7. last physically confirmed round is `T` and the user is back at the original BOR;
8. independent terminal front/back/right-sleeve/left-sleeve counts equal Stage 88/89
   terminal section totals;
9. terminal active total, held total, and all-live total conserve exactly;
10. persistent raglan lines, four markers, ownership, and held-underarm groups remain in
    their specified states;
11. no unresolved discrepancy or recovery requirement exists;
12. final explicit physical confirmation cites the current terminal review fingerprint.

Conceptual immutable result:

```text
result
  schemaId = RAGLAN_SHAPING_EXECUTION_RESULT_V1
  resultVersion = 1
  contractVersion = 1
  kind = PROJECT_RAGLAN_SHAPING_EXECUTION
  identity, attemptIdentity, epoch
  predecessorIdentity, supersedesAttemptIdentity
  sourceFingerprint, sourceBindings
  stage89ResultIdentity, stage89ResultFingerprint
  stage88ResultIdentity, stage88ResultFingerprint
  stage87ResultIdentity, stage87ResultFingerprint
  outputBoundary = raglan_shaping_physically_completed
  roundRange = { inheritedJoiningRound: 1, executedFirst: 2, executedLast: T }
  roundConfirmationReferences[]
  checkpointReferences[]
  discrepancyReferences[]
  finalSectionCounts
  finalActiveTotal, heldTotal, finalTotalPhysicalLive
  expectedTargetGeometry
  conservationProof
  topologyProof
  raglanShapingPhysicallyApplied = true
  allScheduledRoundsPhysicallyConfirmed = true
  openingOrNecklineWorkApplied = false
  placketOrCollarWorkApplied = false
  heldUnderarmsClosed = false
  explicitFinalConfirmation = true
  completionOperationId, timestamps, fingerprint
```

This result is authoritative physical fact for its successor: the exact closed
post-raglan upper-yoke geometry now exists in the fabric. It is not authority that a
neckline, polo opening, placket, collar, or underarm closure exists.

## 14. Direct successor discovery

The yoke does not need another generic “completion” stage after Stage 90. Stage 88 defined
the full target yoke height and terminal geometry, Stage 89 scheduled every round to that
boundary, and Stage 90 physically confirms all of them. Adding
`PROJECT_YOKE_COMPLETION` would duplicate the terminal review.

The first genuinely missing authority is:

`PROJECT_NECKLINE_OPENING_PLANNING`

This planning boundary must decide and freeze, at minimum:

- whether the project has no front opening or has the current polo/front opening;
- exact post-raglan transition from the closed circular yoke;
- whether the opening is formed without cutting, by an explicitly supported steek/cut,
  or by another versioned method;
- front-neck depth/width and exact stitch/row geometry;
- circular-to-flat/turning semantics and edge ownership where applicable;
- interaction of front-neck shaping with the terminal Stage 90 sections/markers;
- the placket interface: opening length, overlap, pickup/band ownership, and fixed edge
  stitches, without yet physically making it;
- collar dependency and pickup boundary;
- exact preservation or retirement of the four raglan markers/lanes;
- fail-closed behavior when the earlier “opening after raglan” choice cannot produce the
  desired physical polo.

The existing `necklineDepth` is only a vertical reference, not an opening length,
neckline width, placket count, collar count, or execution rule. Production Stage 88
explicitly carries it forward and freezes `poloWorkDeferred = true`; Stage 89 explicitly
forbids all opening/neckline/placket actions. Therefore the boundary is immediate after
Stage 90, not after another yoke stage.

Collar execution is not the direct successor. A collar depends on the realized neckline
and placket edges. Likewise a physical polo-opening executor is too early because no
authoritative method or geometry exists yet.

The recommended later sequence, subject to its own findings, is:

```text
Stage 90 raglan shaping physical result
  -> neckline/opening planning
  -> neckline/opening execution
  -> polo placket/collar finishing planning
  -> polo placket/collar finishing execution
  -> remaining garment finishing (including held-underarm closure)
```

## 15. Polo separation and timing

Stage 90 contains no polo logic. It only consumes the already-authoritative facts:

```text
closedForEntireSchedule = true
openingAndNecklineWorkDeferred = true
```

For the production-supported Stage 88/89 path, the opening starts **after** all raglan
shaping in Stage 90. If the intended polo requires an opening that begins during the
raglan, the current Stage 88/89 result is not applicable and Stage 90 must not start. The
project must fail closed at `POLO_OPENING_BOUNDARY_REQUIRED`; it cannot postpone a
physically incompatible opening and later pretend it was planned.

The current architecture still has a product-context weakness: Stage 88 derives an
`explicitPoloFeature` heuristic from garment type text, while the shared happy-path
fixture is a sweater. The successor must bind an explicit, versioned product-feature
decision rather than rely on string matching. Stage 90 neither fixes nor deepens that
coupling.

## 16. Persistence finding

Stage 90 fits IndexedDB V4 without a new store, index, database version, or migration.

Reuse:

- `progress`: Stage 90 epoch state and immutable completed result;
- `operations`: durable project-level mutation audit and UUID metadata;
- `checkpoints`: checksum-bound project checkpoints for every committed mutation;
- `meta`: existing operation/device sequencing and manifest data.

Round confirmations, verification checkpoints, discrepancy records, and receipts are
closed arrays inside the Stage 90 progress state, as recent stage contracts already do.
The existing project-system transaction pattern atomically writes progress, project,
operation, checkpoint, and metadata. A dedicated `rounds`, `raglan`, or `discrepancies`
store is not justified.

A future implementation must prove the normal history remains within existing record
size/operation constraints, but expected yoke schedules are finite and Stage 89 already
stores every row. That is not evidence for a V5 migration.

## 17. UI architecture

The main screen is a knitter-facing current-round workspace.

### Primary card

- `Круг X из T` using global yoke numbering;
- small context: `Круг 1 уже выполнен при соединении`;
- large “Что делать сейчас” instruction;
- prominent `Обычный круг` or `Круг с убавлениями` badge;
- for shaping: four named marker lines with body/sleeve/both action in traversal order;
- persistent raglan-lane instruction for width `1/2`, or marker-boundary instruction for
  width `0`;
- expected stitch counts where verification is mandatory;
- `Начать круг`, then one `Круг полностью выполнен и проверен` action;
- pause and `Есть расхождение / не уверен(а)` actions.

### Progress and history

- compact completed/total count and last exact checkpoint;
- no raw JSON, UUID, epoch, revision, or fingerprint;
- prior rounds are read-only human summaries, not editable rows;
- terminal card appears only after round `T` is confirmed;
- after reload, an unfinished-round banner explains exactly what is and is not known.

### Safety details

- disable completion while save is pending, but still rely on UUID replay and revision
  fences for correctness;
- never optimistically advance the displayed round before durable save returns;
- keep an error on the same round;
- a discrepancy button is always visible during active/paused/reconciliation states;
- stale-source UI hides ordinary continuation and gives only recovery/upstream routes.

## 18. Natalia / real-user readiness

After production Stage 90 is implemented, Natalia can safely use the existing production
chain to knit the body, both sleeves, allocate underarms, physically join the components,
and follow the complete closed raglan-yoke schedule through its terminal geometry. That
is a substantial real physical test of the product.

However, she cannot complete the current polo without encountering a missing production
stage. The exact stop is:

```text
Stage 90 completed at the closed post-raglan upper-yoke boundary;
front neckline/opening, placket, collar, and held-underarm finishing are still absent.
```

Two readiness answers must therefore be kept separate:

- **Safe test of Stage 90 and the long body/sleeve/yoke chain:** yes, after Stage 90
  production and its tests exist, provided the user truthfully selected “opening after
  raglan”.
- **Uninterrupted end-to-end test of the current polo:** no.

The minimum non-inflated next set for an uninterrupted polo path is expected to be:

1. `PROJECT_NECKLINE_OPENING_PLANNING`;
2. a separate physical neckline/opening execution stage;
3. one combined polo-finish planning stage for the interdependent placket/collar edges;
4. one combined polo-finish execution stage;
5. one remaining garment-finishing boundary that includes authoritative closure of the
   four still-live underarm groups and final verification.

The exact names/contracts after the direct successor require their own findings. Splitting
planning from physical execution is not artificial inflation; it is the established
production rule. Conversely, separate micro-stages for every pickup row, buttonhole, or
weaving action are not justified by current evidence.

## 19. Future production test plan

No Stage 90 tests are created in this architecture task. A production implementation
must include at least the following.

### 19.1 Identity, source, and planning/execution separation

1. Exact domain/contract/result/output/successor identities and versions.
2. Ready requires current completed Stage 89 with
   `raglan_shaping_schedule_completed`.
3. Missing/incomplete/corrupt/stale Stage 89 fails closed.
4. Full Stage 77-89 binding chain is reconstructed, not trusted from a presentation.
5. Stage 89 result is recomputable from its state/source before execution.
6. Stage 90 contains no schedule generation or mutation function.
7. Attempts to change event placement, policy, target geometry, topology, or interfaces
   are rejected.
8. Ready projection is read-only and creates no progress/operation/checkpoint.

### 19.2 Start and indexing

9. Start creates epoch 1 with last physically confirmed round exactly `1`.
10. First action is global yoke round `2`, never round `1` or local round `1`.
11. Round `1` cannot be started/completed again.
12. `nextScheduledRound = lastConfirmed + 1` across start, save, reload, and terminal.
13. No gaps, duplicates, decreasing round numbers, or confirmations beyond `T`.
14. Baseline exact section/active/held counts and BOR/markers are mandatory.

### 19.3 Plain and shaping semantics

15. Plain round confirms BOR-to-BOR work and zero count change without mandatory numeric
    recount.
16. Synchronized shaping round presents body+sleeve at all four interfaces.
17. Differentiated body-only round leaves sleeve sides unchanged.
18. Differentiated sleeve-only round leaves body sides unchanged.
19. Combined differentiated round performs both event streams once.
20. Width `0`, `1`, and `2` preserve markers/lanes exactly.
21. Active-interface identities and traversal order equal Stage 89 exactly.
22. One-round atomicity: no individual interface action can advance durable progress.
23. Completion is rejected before return to BOR or before all confirmations/counts.
24. Same physical event cannot be applied/recorded twice.

### 19.4 Stitch verification and discrepancy

25. Every shaping round requires exact front/back/right/left actual counts.
26. Correct aggregate with wrong per-section distribution is rejected.
27. Wrong aggregate is rejected.
28. No tolerance, clamp, averaging, or automatic catch-up event exists.
29. Optional plain-round checkpoint persists exact observation without changing cursor.
30. Retry recount appends evidence and preserves the prior observation.
31. Missed decrease in current unconfirmed round blocks progress until corrected.
32. Extra decrease, extra round, marker loss, and uncertain round each create an
    append-only discrepancy.
33. Unresolved discrepancy blocks round completion where relevant and always blocks
    terminal completion.
34. Already-confirmed historical error requires recovery epoch/checkpoint, not history
    mutation.

### 19.5 Replay and concurrency

35. Exact UUIDv7 replay of start, round start/completion, checkpoint, discrepancy,
    pause, resume, recovery, terminal review, and completion is idempotent.
36. Same UUID with different command/payload/round/epoch conflicts.
37. Double-click `complete_round(N)` advances once.
38. Two tabs completing the same round produce replay or revision conflict, never two
    confirmations.
39. Stale page, stale project revision, stale repository revision, stale domain
    revision, stale source, stale row, and stale terminal review fail closed.
40. Slow save does not optimistically display or persist the next round.

### 19.6 Pause, reload, and recovery

41. Pause/resume between rounds preserves exact cursor.
42. Pause during started round preserves round `N` and requires reconciliation.
43. Reload active-between-rounds shows the exact next instruction.
44. Reload after `start_round` without completion never assumes completion.
45. Browser/device interruption during shaping presents continue/confirm/discrepancy
    choices without applying an action.
46. Recovery to an exact checkpoint appends a new epoch and preserves abandoned bytes.
47. Recovery without exact physical checkpoint evidence is rejected.

### 19.7 Staleness and immutable history

48. Stage 89 rework before Stage 90 start opens the new current source normally.
49. Stage 89 rework after a Stage 90 epoch but before physical round 2 requires explicit
    Stage 87-boundary attestation and appends an epoch.
50. Stage 89 rework after partial physical execution freezes continuation and requires
    full Stage 87 restoration.
51. No automatic prefix adoption into a changed schedule.
52. Completed/historical Stage 90 bytes remain immutable across rework and recovery.
53. Epochs are positive, contiguous, predecessor-linked, and operation UUIDs remain
    semantically unique across history.

### 19.8 Completion, persistence, routing, and presentation

54. Exact round `T` moves to terminal review, not directly to completed.
55. Terminal section, active, held, and total-live counts equal Stage 88/89 exactly.
56. Conservation, marker/BOR, raglan-lane, and held-underarm proofs are mandatory.
57. Any unresolved discrepancy blocks completion.
58. Completed result recomputes exactly and is immutable.
59. Result explicitly says no opening/neckline/placket/collar work and underarms remain
    unclosed.
60. IndexedDB remains V4 with no new store/index/migration.
61. Every mutation atomically persists progress, project projection, operation,
    checkpoint, and meta sequence.
62. Reload reconstructs from IndexedDB and saved-project navigation resumes current
    Stage 90.
63. Completed Stage 90 routes to `PROJECT_NECKLINE_OPENING_PLANNING`, not a generic yoke
    completion or collar executor.
64. Polo logic is absent from schedule execution; opening-during-raglan source fails
    closed.
65. UI shows `round X of Y`, exact action, interfaces, counts, pause, discrepancy, and
    safe reload without JSON/fingerprint/revision/UUID leakage.
66. Existing Stage 77-89 route, presentation, and saved-project regressions remain green.

## 20. Verification required for this finding task

After creating this document, run without changing production code:

- existing `npm run --silent test:stage77` through `test:stage89`;
- matching Stage 77-89 Python/UI tests;
- `git diff --check`;
- scoped `git status --short -- STAGE_90_ARCHITECTURE_FINDING.md` plus confirmation that
  no Stage 90 production file exists.

## 21. Conclusion

Stage 90 is unambiguously the physical executor for the immutable Stage 89 schedule. Its
authoritative unit is one complete global yoke round; a shaping round is atomically
confirmed only after return to BOR and exact per-section verification. Progress resumes
from `lastPhysicallyConfirmedRound + 1`, with an explicit unresolved-round state after
interruption. Discrepancies and recovery are append-only, upstream changes after physical
work require restoration to the Stage 87 boundary, and completion freezes exact terminal
physical geometry.

The immediate successor is neckline/opening planning. Polo, placket, collar, and
underarm finishing remain separate from Stage 90.

STAGE 90 ARCHITECTURE FOUND
