# Stage 85 architecture finding: physical underarm allocation execution

Scope: architecture finding only. This document does not create or modify Stage 85
production code, application/workspace/assistant code, HTML, CSS, routes, fixtures,
tests, package scripts, IndexedDB schema, or any Stage 79-84 contract/result. It does
not perform or claim any physical knitting action. The pre-existing dirty worktree is
left untouched.

## 1. Finding and exact Stage 85 identity

The next minimal boundary after a current completed Stage 84 is:

```text
domain identity:   PROJECT_UNDERARM_ALLOCATION_EXECUTION
contract identity: UNDERARM_ALLOCATION_EXECUTION_CONTRACT_V1
result identity:   UNDERARM_ALLOCATION_EXECUTION_RESULT_V1
contract version:  1
output boundary:   underarm_allocation_physically_confirmed
```

Stage 85 is a **physical execution aggregate with explicit result confirmation**. The
software will eventually guide the user through moving the four exact Stage 84
underarm groups out of yoke-active work while keeping every stitch live, then record
what the user actually did. Stage 85 does not join the body and sleeves, close an
underarm, work a yoke round, assign raglan decreases, or make any combined-yoke count
authoritative.

The main candidate `PROJECT_JOIN_ALLOCATION_PLANNING` is rejected. Production Stage 84
has already completed that logical planning work. Its immutable `JOIN_LAYOUT_PLAN_V1`
contains:

- exact left and right body underarm ranges;
- exact front and back active ranges;
- an exact underarm and active range for each sleeve;
- sleeve-to-side identity mapping and orientation;
- the future order `front -> right sleeve -> back -> left sleeve`;
- the future beginning of round at `left sleeve -> front`;
- the four future interface offsets;
- explicit negative physical facts: no allocation, hold, removal, or join has occurred.

Creating another immutable planning epoch from those same values would add no decision,
measurement, or physical truth. It would duplicate Stage 84 under a new name and make
staleness/rework harder without closing a real prerequisite.

The established sequence is therefore:

```text
Stage 83: how many stitches per underarm interface (H)
  -> Stage 84: which exact stitches and future component order
  -> Stage 85: user performs and confirms live-stitch allocation
  -> Stage 86: raglan interface planning
  -> later join preparation and physical join
```

`PROJECT_UNDERARM_ALLOCATION_EXECUTION` is preferred over
`PROJECT_JOIN_ALLOCATION_EXECUTION` because Stage 85 does not join anything. The noun
names the physical fact it owns and avoids implying that the combined yoke already
exists.

## 2. Evidence from production Stages 79-84

This finding follows the implemented chain rather than the earlier speculative stage
names.

| Stage | Production authority relevant to Stage 85 |
|---|---|
| 79 `PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING` | Current immutable sleeve construction/geometry, in-round bottom-up method, gauge applicability, and BOR shaping method. It remains planned rather than physical. |
| 80 `PROJECT_SLEEVE_PHYSICAL_EXECUTION` | Separate immutable actual results for Sleeve 1 and Sleeve 2 at `full_sleeve_tube_at_underarm_before_allocation`; each has its own `actualUnderarmFullTubeStitchCount` and `underarmStitchesHeldOrRemoved: false`. |
| 81 `PROJECT_SLEEVE_PAIR_VALIDATION` | Acceptance of the exact current pair as `matched` or `accepted_with_deviation`; unequal actual values remain unequal. |
| 82 `PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION` | Immutable actual body full-tube count and height at `full_body_tube_at_underarm_before_allocation`, with `underarmStitchesHeldOrRemoved: false`. |
| 83 `PROJECT_UNDERARM_ALLOCATION_PLANNING` | Immutable `H` under `equal-live-underarm-graft-allocation:v1`, arithmetic consequences, and `physicalAllocationApplied: false`. |
| 84 `PROJECT_JOIN_LAYOUT_PLANNING` | Immutable zero-based half-open cyclic ranges, body partition, sleeve side/orientation mapping, future order/BOR/interfaces, and unresolved raglan-line ownership. |

The decisive production evidence is in
`src/yarnai/static/project-join-layout-planning.js`:

- lines 11-14 define the coordinate, partition, sleeve-interval, and future-order
  policies;
- lines 65-67 define and validate cyclic half-open ranges;
- lines 72-78 derive the body/sleeve ranges, future order, BOR, and interfaces;
- line 78 explicitly retains `raglanLineStitchOwnership:
  "unresolved_later_boundary"` and all physical flags as false;
- lines 97-104 freeze and validate the immutable completed plan;
- the Stage 84 tests verify exact even/odd wrapped intervals, conservation, order,
  immutable history, staleness, and the absence of premature physical fields.

The Stage 84 application independently reconstructs the exact Stage 77-83 chain and
copies `B`, `S1`, `S2`, and `H`; it does not trust a caller-provided projection. Its
completed UI projection reports `physical_allocation_not_implemented`. The repository
already has the intended append-only and atomic patterns for this successor.

## 3. Why execution is the next minimal boundary

After Stage 84, the program can already identify all four groups unambiguously:

1. `layout.body.sections.left_underarm`;
2. `layout.body.sections.right_underarm`;
3. `layout.sleeves.sleeve1.underarm`;
4. `layout.sleeves.sleeve2.underarm`.

It can also identify every stitch that remains eligible for future yoke work:

1. `layout.body.sections.front`;
2. `layout.body.sections.back`;
3. `layout.sleeves.sleeve1.active`;
4. `layout.sleeves.sleeve2.active`.

No additional number, range, side assignment, odd-parity decision, or order decision is
missing. The missing authority is physical:

- whether each planned group was actually moved out of active work;
- whether exactly the planned count was processed;
- whether every processed stitch remains live;
- whether no stitch was bound off, dropped, duplicated, or accidentally retained in
  the active group;
- whether the physical piece still matches the planned side/orientation;
- whether the resulting active counts agree with conservation.

A read-only derived projection may show these consequences before execution, but it is
not a new stage and must not be persisted as a second plan.

## 4. Authoritative predecessors and direct inputs

Stage 85 must reconstruct currentness from the repository. Its direct immutable source
binding should cover the exact current Stage 77-84 records, with Stage 84 as the direct
plan predecessor and the earlier records retained for independent physical/source
validation.

Minimum direct inputs are:

- project ID, active calculation ID, and expected project revision;
- current Stage 77 joined-raglan topology;
- current Stage 78 raglan shaping-policy identity (context only; no shaping in Stage
  85);
- current completed Stage 79 snapshot and sleeve BOR method;
- current Stage 80 Sleeve 1 and Sleeve 2 result identities/fingerprints and separate
  actual counts `S1` and `S2`;
- current accepted Stage 81 decision and exact pair-source fingerprint;
- current Stage 82 result identity/fingerprint and actual body count `B`;
- current completed Stage 83 plan identity/fingerprint, allocation policy, and `H`;
- current completed Stage 84 plan identity/fingerprint, exact ranges, side/orientation
  mapping, order, BOR, and interface locations;
- proof that Stage 80, 82, 83, and 84 still describe the pre-allocation physical state;
- proof that there is no current successful Stage 85 result and no physical join or
  incompatible downstream execution.

Stage 85 must reject planned counts substituted for `B`, `S1`, or `S2`, an average of
the sleeve counts, a non-current accepted pair, and any layout reconstructed from UI
labels instead of the canonical Stage 84 ranges.

## 5. Fully derivable values versus missing values

### Fully derivable before Stage 85 starts

From the current Stage 84 plan and its bound source, Stage 85 may derive without asking
the user:

- the four reserved ranges and their cardinality `H`;
- front and back ranges/counts;
- both sleeve active ranges/counts;
- `bodyActive = B - 2H`;
- `sleeve1Active = S1 - H`;
- `sleeve2Active = S2 - H`;
- the raw pre-join working-count candidate;
- left/right physical sleeve identity;
- one-based human-readable labels for every range;
- the future active-section order and future BOR;
- the expected four interface offsets;
- that no sleeve reversal is required under the current coordinate/orientation policy.

These are plan-derived expectations, not proof that the physical work happened.

### Genuinely missing until user-performed execution

- actual processed count at body left underarm;
- actual processed count at body right underarm;
- actual processed count for Sleeve 1;
- actual processed count for Sleeve 2;
- explicit confirmation that each processed group remains live on a temporary carrier;
- explicit confirmation that no group was bound off, closed, joined, dropped, or
  duplicated;
- actual interval/orientation match for each piece;
- optional independently recounted yoke-eligible working count for each piece, if the
  UX requests a physical recount;
- final aggregate confirmation that all four component actions coexist physically.

### Still missing after successful Stage 85

- ownership of stitches immediately associated with each raglan line;
- whether join setup creates, consumes, or duplicates any boundary/setup stitch;
- an actual combined-yoke stitch count;
- physical join status;
- raglan decrease positions/cadence, row-by-row shaping, neckline, collar, polo, or
  placket behavior.

## 6. User decision and first UX question

No new design decision is required before Stage 85. The authoritative V1 policy is
already `equal-live-underarm-graft-allocation:v1`: equal groups remain live for later
one-to-one closure. Stage 84 already fixes their positions.

The exact carrier is not a domain-level design choice. A stitch holder and smooth,
strong waste/scrap yarn are equivalent temporary live-stitch carriers for this
contract. The UI may let the user choose whichever tool is available, but that choice
does not create a new planning epoch. Binding off is not equivalent and must fail
closed. Provisional cast-on/handling and an unspecified "other method" are not inferred
as V1 alternatives.

The first genuinely necessary user-facing prompt is an execution-readiness question,
not a request for a number:

> Готовы сейчас перевести точно показанные петли подрезов на держатели или гладкую
> вспомогательную нить, оставив все петли живыми и ничего не закрывая?

For each group, completion then asks:

> Переведены ли точно показанные `H` петель, все ли они остались живыми и ни одна ли
> петля не была закрыта, потеряна или оставлена в рабочей группе?

If the answer is yes, the program records `actualProcessedCount = H` with provenance
`explicit_exact_count_confirmation`; it does not ask the user to re-enter a number the
program already knows. If the answer is no, the UX asks only for the observed physical
count and blocks successful completion until the discrepancy is safely corrected or
sent to explicit rework.

Knitting technique evidence supports the semantic distinction. Tin Can Knits describes
three tubes, live underarm stitches on waste yarn, and later Kitchener closure; Ysolda
describes smooth scrap yarn, says placing stitches on hold before or during the joining
round has the same result, and distinguishes graft/three-needle closure from patterns
that bind off; Purl Soho likewise says patterns vary but physically orients held
underarm groups opposite one another before working the sleeve stitches:

- https://blog.tincanknits.com/2017/03/28/lets-knit-a-bottom-up-sweater/
- https://blog.tincanknits.com/2017/03/28/that-pesky-underarm/
- https://ysolda.com/blogs/journal/joining-the-sleeves-and-body-on-a-seamless-bottom-up-sweater
- https://www.purlsoho.com/create/joining-sleeves-to-body/

Those sources show that multiple methods exist generally. YarnAI V1 does not select
among all knitting traditions: its existing graft-allocation policy narrows Stage 85 to
live temporary holding.

## 7. Exact allocation interval model

Stage 85 must consume Stage 84 ranges byte-for-byte. It must not recalculate them from
counts or reinterpret the body marker.

### Body

```text
reserved.leftUnderarm  = Stage84.layout.body.sections.left_underarm
active.front           = Stage84.layout.body.sections.front
reserved.rightUnderarm = Stage84.layout.body.sections.right_underarm
active.back            = Stage84.layout.body.sections.back
```

The canonical conceptual partition is left underarm, front, right underarm, back, but
the stored traversal is rotated to the confirmed Stage 84 body anchor. Each range is
zero-based, half-open, and cyclic. Front and back are two independently identified
active segments; Stage 85 must not pretend that the body active stitches form one
contiguous component range.

### Sleeve 1 and Sleeve 2

```text
reserved.underarm = Stage84.layout.sleeves.sleeveN.underarm
active.sleeve     = Stage84.layout.sleeves.sleeveN.active
side              = Stage84.layout.sleeves.sleeveN.side
orientation       = Stage84.layout.sleeves.sleeveN.orientation
```

For odd `H`, Stage 84 already freezes `floor(H/2)` before BOR and the remaining stitches
after BOR, with the extra stitch after BOR. Stage 85 may not choose a different parity
rule.

For UI only, canonical `[start, end)` maps to one-based inclusive labels:

- non-wrapped: stitches `start + 1` through `end`;
- wrapped: stitches `start + 1` through component total, then `1` through `end`.

Human labels are never persisted as canonical coordinates.

## 8. Orientation, traversal, and future assembly order

The ordered active segments remain:

1. front;
2. right sleeve active stitches;
3. back;
4. left sleeve active stitches.

The future BOR remains the boundary `left sleeve -> front`.

No sleeve interval reversal is required. Stage 84 derives both sleeve active ranges in
the positive/native cyclic direction from immediately after the BOR-centred reserved
range and maps Sleeve 1 to left or right without reversing its coordinate sequence.
Both sleeves are authoritative cuff-to-underarm, right-side, in-round tubes using the
same BOR method. Standard join technique works each oriented sleeve from its first live
active stitch to its last in that native direction; the second sleeve is joined in the
same manner, not by knitting its stored sequence backwards.

Stage 85 should make this derivation explicit in its execution projection as
`traversal: forward_in_component_coordinates`, while treating it as a copy/normalization
of Stage 84 semantics rather than a new user decision. It must fail closed if a future
Stage 84 policy introduces mirrored/reversed coordinates or if actual orientation does
not match the plan.

Stage 85 may expose the ordered list for placement review, but it must not concatenate
the pieces into a new physical sequence or claim that the yoke round exists.

## 9. Conservation invariants

Let:

```text
B  = actual body full-tube count from Stage 82
S1 = actual Sleeve 1 full-tube count from Stage 80
S2 = actual Sleeve 2 full-tube count from Stage 80
H  = Stage 83 planned count per interface, positioned by Stage 84
F  = Stage 84 front count
K  = Stage 84 back count
```

Required plan invariants are:

```text
F + K + 2H = B
bodyActive = F + K = B - 2H

sleeve1Active + H = S1
sleeve1Active = S1 - H

sleeve2Active + H = S2
sleeve2Active = S2 - H
```

The raw pre-join working-count candidate is:

```text
preJoinWorkingCountCandidate
  = bodyActive + sleeve1Active + sleeve2Active
  = B + S1 + S2 - 4H
```

Under the live-holder action, physical total-live conservation is different:

```text
totalLiveBefore = B + S1 + S2
totalLiveAfterAllocation = B + S1 + S2
temporarilyHeldLive = 4H
yokeEligibleButNotJoined = totalLiveAfterAllocation - temporarilyHeldLive
```

Successful Stage 85 completion requires actual processed counts equal to the four
planned cardinalities and the corresponding actual active counts equal to the formulas
above. There is no V1 tolerance and no automatic acceptance of a discrepancy.

`preJoinWorkingCountCandidate` is safe only as a source-bound raw conservation value.
Before Stage 85 it is planned; after successful Stage 85 it is physically supported as
the expected count of stitches eligible for the future joining round. It is **not** an
authoritative `combinedYokeStitchCount`, because the components remain unjoined and
raglan/setup ownership is unresolved.

## 10. Raglan-line ownership

Stage 85 must not decide raglan-line stitch ownership. Allocation is complete when the
four Stage 84 reserved groups have been correctly placed on temporary live carriers;
that action does not require choosing whether an adjacent stitch belongs to a front,
back, sleeve, dedicated raglan line, or a future setup operation.

Combining ownership with physical allocation would merge two different boundaries:

- Stage 85 records an observable physical transition on existing stitches;
- raglan-interface planning defines future yoke structure and possible setup-count
  effects.

The next planning boundary should therefore be:

```text
PROJECT_RAGLAN_INTERFACE_PLANNING
RAGLAN_INTERFACE_PLANNING_CONTRACT_V1
RAGLAN_INTERFACE_PLAN_V1
```

That stage must resolve the four interface ownership rules and explicitly state whether
join setup creates, consumes, shares, or duplicates stitches before any expected
combined-yoke count is promoted. It must remain separate even if the V1 answer later
turns out to be “interfaces own zero dedicated stitches.”

## 11. Stage 85 lifecycle

The minimum lifecycle is:

```text
ready (read-only projection)
  -> in_progress
  -> reviewing_result
  -> completed
```

The persisted aggregate contains three independently resumable component executions:

```text
BODY
SLEEVE_1
SLEEVE_2
```

`BODY` has two required group receipts (left and right); each sleeve has one. A
component may be `pending`, `in_progress`, `reviewing`, `completed`, or
`needs_correction`. The aggregate remains `in_progress` until all three component
drafts are complete. Reload resumes the current component state; a separate global
`paused` lifecycle is not needed in V1.

`reviewing_result` is available only after all four actual group observations exist.
`completed` requires all non-waivable conservation, liveness, interval, orientation,
and no-join checks. A completed aggregate is immutable.

The UI must never pre-mark a group as processed because an instruction was displayed.
Instruction, observation, and immutable confirmation are separate events.

## 12. Immutable result contract

The minimum `UNDERARM_ALLOCATION_EXECUTION_RESULT_V1` contains:

- project/calculation identity and Stage 85 epoch/attempt identity;
- exact Stage 77-84 binding set and aggregate source fingerprint;
- Stage 83 plan identity/fingerprint and allocation-policy identity;
- Stage 84 plan identity/fingerprint and exact interval/order policy identities;
- copied `B`, `S1`, `S2`, and `H` with no averaging/substitution;
- action policy `place_live_stitches_on_temporary_carrier:v1`;
- body result:
  - left/right Stage 84 range fingerprints;
  - actual processed count for each side;
  - confirmation each group remains live;
  - confirmation neither group was bound off, closed, joined, dropped, or duplicated;
  - derived actual yoke-eligible body count;
  - optional separately proven manual recount;
- Sleeve 1 and Sleeve 2 results, each with:
  - exact range, side, orientation, and traversal fingerprints;
  - actual processed count;
  - live/not-bound/not-joined confirmations;
  - derived actual yoke-eligible count;
  - optional separately proven manual recount;
- physical conservation proof for total live, held live, and yoke-eligible counts;
- `physicalAllocationApplied: true` only at aggregate completion;
- `allReservedStitchesRemainLive: true`;
- `physicalJoinApplied: false`;
- `underarmsClosed: false`;
- raw `preJoinWorkingCountCandidate` with classification
  `physically_supported_not_joined`;
- explicit final review confirmation, operation ID, timestamps, and canonical
  fingerprint;
- predecessor/superseded attempt/result identities.

The schema must not use `actualRemainingLiveStitches` because held stitches are still
live. It must distinguish `totalLiveStitches`, `temporarilyHeldLiveStitches`, and
`yokeEligibleWorkingStitches`.

The immutable result must reject an actual combined-yoke count, physical join receipt,
underarm closure, raglan ownership/decrease schedule, setup stitches not supplied by an
authoritative later contract, row-by-row shaping, neckline, collar, polo, placket, or
project completion fields.

## 13. Is a separate physical confirmation stage required?

No separate `PROJECT_JOIN_ALLOCATION_CONFIRMATION` is required for V1. Stage 85 itself
must separate instruction/execution from `reviewing_result`, then freeze explicit
physical confirmations in its completed result. This follows the existing Stage 80 and
Stage 82 pattern: physical work or boundary declaration becomes authoritative only
through a validated completed result.

A separate stage would repeat the same four counts and confirmations without an
independent observer, measurement system, or new policy. It would add lifecycle and
staleness surface but no new authority.

The later physical join must nevertheless fail closed unless the current Stage 85
result proves:

- all four actual processed counts equal `H`;
- body and both sleeves have their expected active counts;
- all reserved stitches remain live;
- layout/orientation matches Stage 84;
- no lost or extra stitch is reported;
- no incompatible rework or join has occurred.

## 14. Discrepancy and correction semantics

If a user reports an actual processed count different from `H`, Stage 85 must:

1. preserve the observation in the live draft/operation history;
2. block component and aggregate completion;
3. never rewrite the observation to `H`;
4. never call the Stage 83/84 plans satisfied;
5. allow safe correction in the same live attempt only while the component is not
   completed and the exact planned interval can be restored;
6. require explicit rework if the component cannot be returned to a plan-conforming
   state;
7. require new Stage 83 and Stage 84 epochs if `H` or any interval must change;
8. block upstream rework once a physical join has begun and hand off to a later recovery
   domain.

Completed results are never edited. A correction after completion creates a new Stage
85 epoch/result and retains the superseded physical record. A new epoch must not claim
the pre-allocation state unless the user has physically restored and explicitly
confirmed that state.

## 15. Staleness and immutable history

Stage 85 currentness is a derived repository projection, not a mutable flag written
into a completed result.

| Replacement/change | Effect on Stage 85 | Historical result |
|---|---|---|
| Stage 79 plan/BOR/gauge binding replaced | Stale | Preserved unchanged |
| Either Stage 80 physical sleeve result replaced | Stale | Preserved unchanged |
| Stage 81 acceptance replaced or no longer current | Stale | Preserved unchanged |
| Stage 82 body result replaced | Stale | Preserved unchanged |
| Stage 83 `H` plan replaced | Stale | Preserved unchanged |
| Stage 84 range/orientation/order plan replaced | Stale | Preserved unchanged |
| Stage 77 topology or Stage 78 policy replaced | Stale | Preserved unchanged |
| Active calculation replaced | Non-current in the old calculation | Preserved unchanged |
| Unrelated project revision | Optimistic conflict until reload, not semantic staleness | Preserved/current after reconstruction |
| A component physical correction | New Stage 85 epoch/result | Prior result preserved |
| Physical join started | Normal Stage 85 rework blocked | Preserved as historical evidence |

Required history rules:

- epochs are positive and contiguous per project/calculation/kind;
- epoch 1 has no predecessor; every later epoch names the prior Stage 85 identity;
- explicit rework names the superseded result identity;
- completed result bytes and fingerprints never change;
- UUID replay is idempotent only for the same canonical command/payload;
- conflicting UUID reuse is rejected across the full Stage 85 history;
- project, repository, aggregate, component, source, and review revisions/fingerprints
  fence every write;
- a historical command may replay its exact historical result but may never mutate the
  current epoch.

Because Stage 85 records physical truth, source replacement does not mean the physical
action “did not happen.” It only means the result is unsafe as the current successor
for the new source. The historical observation remains authoritative for what happened
under its old binding.

## 16. Storage and repository reuse

No new IndexedDB store, index, or migration is justified. Reuse IndexedDB V4:

- `progress` for Stage 85 aggregate epochs and component state;
- `operations` for idempotent domain/audit receipts;
- `checkpoints` for recovery;
- `projects` and `meta` in the same atomic transaction;
- the existing unique `progress.by_scope_epoch =
  [project_id, calculation_id, kind, epoch]` index.

The repository method should follow Stage 83-84 patterns:

1. validate the candidate domain state;
2. reconstruct the complete authoritative Stage 77-84 source;
3. validate contiguous Stage 85 history;
4. detect exact UUID replay or conflict;
5. enforce expected project/repository/domain/component/source/review fences;
6. re-read every bound progress record inside the write transaction;
7. atomically write project, progress, operation, checkpoint, and metadata;
8. never overwrite a completed progress epoch.

The current `DB_VERSION = 4`, `STORE_NAMES`, `progress.by_scope_epoch`, and Stage 84
repository transaction already provide all required primitives.

## 17. Strict Stage 85 exclusions

Stage 85 must not:

- invent or recalculate the Stage 84 ranges;
- ask the user for `B`, `S1`, `S2`, `H`, active counts, or the raw total;
- pre-claim that a displayed instruction was physically completed;
- silently choose bind-off, provisional, picked-up, decrease-during-graft, or other
  handling;
- bind off or close underarm stitches under the live-holder V1 policy;
- physically join body and sleeves;
- work any yoke stitch or raglan decrease;
- assign raglan-line stitch ownership;
- create or promote an actual/authoritative combined-yoke count;
- calculate row-by-row shaping;
- create neckline, collar, polo, or placket logic;
- mark the project complete;
- mutate the Stage 65 execution plan or any Stage 79-84 history;
- add a Stage 86+ production route during Stage 85 architecture/implementation scope;
- introduce a database store/index/migration without new evidence;
- commit, push, reset, clean, checkout, or stash as part of this architecture task.

The future Stage 85 software cannot move yarn by itself. It may issue one explicit
instruction at a time and record a physical fact only after the user confirms the
observed result.

## 18. Boundary after Stage 85

After a successful Stage 85, the next minimal planning boundary is
`PROJECT_RAGLAN_INTERFACE_PLANNING`, because it is the first remaining missing authority
that can affect setup and count semantics. It should determine:

- ownership policy at each of the four Stage 84 interfaces;
- whether dedicated raglan-line stitches exist;
- whether interface/setup work creates, consumes, shares, or duplicates stitches;
- marker topology and the exact pre-join expected-count formula;
- whether the Stage 78 synchronized/differentiated shaping policy has enough inputs for
  a later specialized yoke plan.

Only after that should YarnAI design join preparation and physical join execution. An
actual combined-yoke count belongs to the physical join result/confirmation, not Stage
85 or the raglan-interface plan.

## 19. Required production tests when implementation is authorized

### Pure domain and interval tests

- accept only the exact domain/contract/result identities and allowlisted fields;
- reject missing, stale, imported-unproven, quarantined, or cross-calculation Stage
  77-84 bindings;
- copy all Stage 84 ranges byte-for-byte;
- validate cardinality for non-wrapped and wrapped ranges;
- cover even and odd `H`, including the Stage 84 extra-after-BOR rule;
- prove body and both sleeve conservation separately for unequal `S1`/`S2`;
- prove one-based labels without storing them as coordinates;
- prove Sleeve 1 left/right mapping and no-reversal forward traversal;
- reject any attempt to reverse or reinterpret a sleeve range;
- derive the future section order and BOR exactly as Stage 84 supplied them;
- classify the raw total as pre-join/not-joined and reject combined-yoke fields.

### Physical execution/result tests

- happy path for four exact processed groups and three completed components;
- independent component progress and reload/resume;
- body left/right completion in either UI order without changing canonical layout;
- exact count confirmation stores `H` without asking for numeric re-entry;
- observed mismatch is preserved and blocks completion;
- dropped, duplicated, bound-off, closed, joined, or non-live confirmation blocks;
- optional manual active recount has separate provenance and must match derivation;
- total-live conservation remains `B + S1 + S2` while held live becomes `4H`;
- `physicalAllocationApplied` becomes true only on final aggregate completion;
- no instruction display can create a physical result automatically;
- a completed result is immutable and rework appends a new contiguous epoch;
- rework after a physical join is blocked.

### Replay, concurrency, repository, and staleness tests

- exact UUID replay returns the same state/repository revision;
- conflicting UUID reuse is rejected within and across epochs;
- stale project, repository, domain, component, source, or review fences are rejected;
- two-tab races cannot overwrite component or aggregate state;
- every Stage 77-84 binding is rechecked inside the atomic transaction;
- replacement/rework at each Stage 79-84 source makes the current projection stale
  without changing historical bytes;
- Stage 85 history is contiguous and predecessor/supersession identities are exact;
- IndexedDB remains V4 and no new store/index is created;
- project/progress/operation/checkpoint/meta commit is atomic;
- transaction failure leaves no partial component or project write.

### Application, UI, fixture, and boundary tests

- `ready` is read-only and opening the route persists nothing;
- UI shows one component/group and exact one-based ranges at a time;
- UI asks no derivable numeric question;
- holder versus smooth scrap yarn remains an operational tool choice;
- bind-off and unsupported methods are not offered as equivalent V1 actions;
- orientation review clearly shows body, left sleeve, and right sleeve;
- internal IDs, UUIDs, fingerprints, epochs, repository revisions, and receipts remain
  hidden from presentation projections;
- fixture seeds through production Stage 79-84 controllers and reaches Stage 85 only
  from a current completed Stage 84;
- fixture covers partial progress, mismatch, correction, immutable completion, replay,
  race, staleness, and rework;
- production text contains no join, raglan shaping, neckline/collar/polo/placket, actual
  combined-yoke, Stage 65 mutation, or premature Stage 86 route behavior;
- Python route/static tests cover safe exact-one-project query parsing when the Stage 85
  route is eventually authorized.

### Validation performed for this finding

The implemented predecessor chain was executed without changing production files:

| Command | Result |
|---|---|
| `npm run test:stage79` | PASS: 28 tests (17 domain/application/repository + 11 workspace) |
| `npm run test:stage80` | PASS: 12 tests |
| `npm run test:stage81` | PASS: 10 tests |
| `npm run test:stage82` | PASS: 7 tests |
| `npm run test:stage83` | PASS: 7 tests |
| `npm run test:stage84` | PASS: 7 tests |

Total: 71 focused predecessor tests passed. The run confirms the contracts, physical
pre-allocation facts, exact interval/parity model, immutable epoch/replay behavior,
staleness handling, and IndexedDB V4 reuse on which this finding relies.

## 20. Conclusion

Production Stage 84 has already made the logical allocation exact. It identifies every
reserved and active stitch interval, both sleeve identities/orientations, future order,
future BOR, and interface locations. Therefore
`PROJECT_JOIN_ALLOCATION_PLANNING` is not a legitimate new authority boundary.

The first missing fact is whether the planned live groups were physically removed from
yoke-active work exactly as specified and remain live without any loss, closure, or
join. The next minimal boundary is consequently
`PROJECT_UNDERARM_ALLOCATION_EXECUTION`, with component-wise execution and an immutable
confirmed aggregate result. Its raw active-count sum is safe as a pre-join conservation
candidate, never as an actual combined-yoke count. Raglan-line ownership remains a
separate Stage 86 planning concern.

STAGE 85 ARCHITECTURE FOUND
