# Stage 83 architecture finding: underarm allocation planning

Research scope: architecture only. No Stage 83 production module, route, persistence
adapter, migration, fixture, test, physical stitch hold, component-readiness decision,
join instruction, join execution, combined-yoke arithmetic, or successor implementation
is created here. The inspected worktree was already substantially dirty; all existing
changes are left untouched.

## 1. Architecture finding

The first genuinely missing authoritative boundary after a successful production Stage
82 is **underarm allocation planning**, not component readiness and not join preparation:

- domain identity: `PROJECT_UNDERARM_ALLOCATION_PLANNING`;
- contract: `UNDERARM_ALLOCATION_PLANNING_CONTRACT_V1`;
- immutable output: `UNDERARM_ALLOCATION_PLAN_V1`;
- V1 topology policy: `equal-live-underarm-graft-allocation:v1`;
- V1 candidate policy: `joint-underarm-span-count-selection:v1`;
- output boundary: `underarm_allocation_plan_completed`.

Stages 80–82 now establish three physical components at the same semantic boundary:

1. sleeve 1 has an actual full-tube live count before allocation;
2. sleeve 2 has its own actual full-tube live count before allocation;
3. the body has an actual full-tube live count before allocation.

Stage 81 additionally records that the exact current sleeve pair was accepted. None of
those results says how many stitches form each underarm closure. Stage 77 fixes only the
joined-raglan topology, and Stage 78 fixes only the post-join shaping policy. The general
calculation engine and the specialized sleeve engine contain no underarm allocation
model.

The minimum safe Stage 83 output is therefore one immutable, source-bound **plan** that
selects a common live-stitch count for the two body underarm spans and the two sleeve
underarm spans. It must preserve the fact that no stitch has yet been held or removed.
It must not assign exact positions on the circular work, split the body into front/back
sections, assign raglan-line ownership, calculate the first combined-yoke count, or tell
the user to perform the join.

## 2. Why this is the next boundary

Production Stage 82 ends with:

- `completionBoundary: full_body_tube_at_underarm_before_allocation`;
- `actualBodyFullTubeStitchCount` from a manual count;
- an explicit physical boundary confirmation;
- `underarmStitchesHeldOrRemoved: false`;
- a current Stage 81 entry binding and the two actual sleeve counts as read-only context;
- `successorReadiness.available: false` and `joinPreparation.available: false`.

The Stage 82 architecture finding already ordered the remaining independent boundaries:

1. body physical confirmation — now Stage 82;
2. sleeve/body underarm allocation confirmation — next;
3. component readiness validation;
4. join preparation;
5. join execution;
6. combined-yoke/raglan execution.

That order remains correct after inspecting the production code. Readiness cannot
validate an allocation that does not exist. Join preparation cannot safely choose the
allocation as a hidden side effect because allocation is a design decision with visible
fit and construction consequences. Physical join execution cannot be used to discover
the plan after stitches have already been moved.

## 3. Evidence from existing repository contracts

1. Stage 77 selects
   `construction-strategy:body-sleeves-joined-raglan:v1` and the topology
   `body_and_sleeves_joined_at_underarm_for_raglan_yoke`. It does not contain counts,
   section locations, or a joining operation
   (`src/yarnai/static/project-construction-strategy-planning.js:46-54`).
2. Stage 78 V2 records either synchronized or differentiated **post-join** raglan
   shaping. Its blocker list expressly includes
   `body_and_sleeve_underarm_stitch_allocation` and
   `combined_yoke_section_balance`
   (`src/yarnai/static/project-shaping-policy-planning.js:25-48`, `:80-89`).
3. Stage 79's specialized sleeve plan stops at a full sleeve tube before allocation.
   Its calculation source list still names body/sleeve allocation and combined-yoke
   balance as unresolved prerequisites
   (`src/yarnai_calculation/sleeve_planning.py:47-61`).
4. Stage 80 stores two independent actual sleeve counts and guarantees
   `underarmStitchesHeldOrRemoved: false`
   (`src/yarnai/static/project-sleeve-physical-execution.js:250-273`).
5. Stage 81 binds and accepts the exact current pair but always projects
   `joinPreparation.available: false`. It retains the two actual values separately and
   invents no tolerance or allocation
   (`src/yarnai/static/project-sleeve-pair-validation.js:203-209`).
6. Stage 82 stores the independently measured body count and again requires
   `underarmStitchesHeldOrRemoved: false`. Its production allowlist rejects allocation,
   combined-yoke, and join-position fields
   (`src/yarnai/static/project-body-underarm-physical-confirmation.js:143-181`;
   `tests-js/project-body-underarm-physical-confirmation.test.cjs:74-77`).
7. Stage 64/65 retains the confirmed body stitch gauge and the body working-count
   derivation (`src/yarnai/static/project-calculation-entry.js:220-245`,
   `src/yarnai/static/project-execution-plan.js:140-157`). Stage 79 retains an
   independently applicable main-sleeve gauge binding
   (`src/yarnai/static/project-sleeve-target-geometry-planning.js:204-249`). These are
   valid inputs to a later allocation model only while their exact source bindings are
   current.
8. `KNITTING_MATH_CANON.md` requires exact integer balances, visible rounding,
   structural admissibility before closeness, and no hidden compromise. Its specialized
   sleeve canon expressly excludes physical state and underarm allocation. The general
   engine also excludes complex raglan/yoke geometry without a complete specialized
   model (`KNITTING_MATH_CANON.md:1270-1303`;
   `CALCULATION_ENGINE_SPEC.md:1000-1020`).
9. IndexedDB V4 already represents append-only epochs in `progress` and revision-fenced
   operations. Stage 79–82 reuse the same stores; no new store or index is necessary
   (`src/yarnai/static/project-system.js:4-38`, `:5892-5956`).

No hidden underarm span target, underarm allocation policy, exact planned held count,
body-side placement, sleeve-side placement, raglan-line ownership, or combined-yoke
calculator was found.

## 4. External topology evidence and its limit

The external technique evidence supports only the construction topology:

- Tin Can Knits shows a bottom-up pullover as three tubes, with underarm stitches from
  body and sleeves held off the yoke needle and later grafted:
  https://blog.tincanknits.com/2017/03/28/lets-knit-a-bottom-up-sweater/
- Its underarm-closing tutorial describes two live held sets joined by Kitchener stitch
  and advises matching counts for the ordinary one-to-one case:
  https://blog.tincanknits.com/2017/03/28/that-pesky-underarm/
- Knitty likewise describes bottom-up body and sleeves made separately, some stitches
  from both left on holders, remaining live stitches arranged for the raglan yoke, and
  held stitches closed later:
  https://knitty.com/ISSUEfall04/FEATfall04TBP.html

These sources do **not** define a universal number or percentage of stitches to hold.
They also show that patterns can vary in beginning-of-round location and execution
details. Consequently YarnAI may define a deliberately narrow V1 policy, but it must
not present that policy as a universal knitting law.

## 5. Authoritative-input table after Stage 82

`Immutable` means immutable in the completed owning record. `May stale` means the
historical record can remain while no longer being current for this project state.

| Data | Exact source | Classification | Immutable | May stale | Safe for Stage 83 |
|---|---|---|---:|---:|---|
| Project/calculation identity | current project + active calculation | Authoritative scope | Yes per calculation | Yes | Yes, with exact binding |
| Joined-raglan topology | current Stage 77 | User-confirmed policy | Yes | Yes | Yes |
| Raglan shaping policy | current Stage 78 V2 | User-confirmed post-join policy | Yes | Yes | Context only; it does not choose allocation |
| Sleeve construction/gauges | current completed Stage 79 | Confirmed plan and applicability evidence | Yes per epoch | Yes | Yes, source-bound |
| Sleeve 1 actual full-tube count | current Stage 80 result | Physical fact | Yes | Yes | Yes, separately |
| Sleeve 2 actual full-tube count | current Stage 80 result | Physical fact | Yes | Yes | Yes, separately |
| Current pair acceptance | current successful Stage 81 | User-confirmed decision | Yes | Yes | Required entry gate |
| Body actual full-tube count | current Stage 82 result | Physical fact | Yes | Yes | Yes |
| Body actual height at underarm | current Stage 82 result | Physical fact | Yes | Yes | Context, not an allocation formula |
| Body gauge | current Stage 63/64/65 chain retained by the plan | Confirmed calculation input | Yes per source | Yes | Yes only with applicability proof |
| Sleeve main gauge | current Stage 79 main-zone binding | Confirmed/applicability-attested input | Yes per epoch | Yes | Yes |
| Underarm target span | No source | **Missing design input** | — | — | Required first |
| Allocation model/version | No current contract | **Missing domain policy** | — | — | Required |
| Planned count per underarm interface | No source | **Missing derived decision** | — | — | Stage 83 output |
| Exact body/sleeve hold positions | No source | **Missing join-preparation data** | — | — | No |
| Actual physically held counts | All Stage 80/82 facts say `false` | **Not yet produced** | — | — | No; join execution fact |
| Front/back/sleeve section balance | No source | **Missing** | — | — | No |
| Raglan-line stitch ownership | No source | **Missing** | — | — | No |
| First combined-yoke count | No valid formula/result | **Missing** | — | — | No |

## 6. First genuinely missing user input

The first new user input should be the intended finished span of one underarm closure,
in centimetres:

> Какой длины должен быть один подрез после закрытия — от края корпуса до края корпуса
> под рукой?

This is a design/fit target. It is not the vertical `armholeDepth`, not the upper-arm
circumference, not the Stage 82 body height, and not a percentage that YarnAI may infer.
The screen may explain and illustrate the measurement path, but it must not prefill a
confirmed value from those unrelated measurements.

The user must not be asked to calculate the stitch count. Once the span and the
applicable body/sleeve gauges are current, YarnAI can construct integer candidates and
show the physical consequence of each. If the user is following an external pattern
that specifies an exact held count, support for that provenance is a separate future
policy mode; V1 must not silently treat a typed count as a calculated span.

## 7. Selected V1 allocation policy

Stage 83 should support one intentionally narrow policy:

```text
equal-live-underarm-graft-allocation:v1
```

Its meaning is:

- the right and left body underarm spans use the same planned count `H`;
- sleeve 1 and sleeve 2 each use the same planned count `H`;
- all four groups remain live and are intended for a later one-to-one closure;
- no decrease-during-graft, unequal-count easing, bind-off substitution, picked-up
  bridge, provisional cast-on, or seam allowance is supported in V1;
- choosing the plan does not physically move any stitch.

If equal live counts are not suitable, Stage 83 must block with an unsupported-policy
diagnostic. It must not approximate an unequal construction. This is a product scope
limit, not a claim that unequal techniques never exist.

## 8. Candidate mathematics

Let:

```text
B  = actual full body-tube count from Stage 82
S1 = actual full sleeve-1 count from Stage 80
S2 = actual full sleeve-2 count from Stage 80
D  = user-confirmed target span for one underarm closure, cm
gb = applicable body stitches per cm
gs = applicable sleeve-main stitches per cm
H  = one common positive integer planned for each of the four underarm groups
```

A candidate `H` is structurally admissible only if:

```text
H >= 1
B - 2H >= 2
S1 - H >= 1
S2 - H >= 1
```

These are only pre-allocation conservation/positivity guards. They do not prove
front/back balance, raglan ownership, pattern phase, marker positions, or yoke
constructibility.

For each admissible `H`, show both physical consequences:

```text
bodySpanCm(H)   = H / gb
sleeveSpanCm(H) = H / gs
bodyErrorCm(H)  = bodySpanCm(H) - D
sleeveErrorCm(H)= sleeveSpanCm(H) - D
score(H)        = (max(abs(bodyErrorCm), abs(sleeveErrorCm)),
                   abs(bodyErrorCm) + abs(sleeveErrorCm))
```

`joint-underarm-span-count-selection:v1` must use exact decimal arithmetic until final
display formatting. It first filters structural invalidity, then ranks candidates
lexicographically by `score`. It must expose at least the closest candidate below and
above each raw target where those candidates exist, deduplicate them, and show every
retained candidate's body and sleeve spans/errors.

There is no hidden tolerance in V1:

- one uniquely best candidate may be recommended but still requires explicit review;
- a score tie requires explicit candidate selection;
- a large visible consequence is not auto-accepted as “close enough”;
- the user may revise `D` or stop; YarnAI must not silently widen the underarm;
- the chosen integer is planned authority, not a physical held-count result.

The completed plan may retain the following arithmetic consequences separately:

```text
plannedPerInterfaceCount = H
plannedBodyUnderarmTotal = 2H
plannedSleeve1UnderarmCount = H
plannedSleeve2UnderarmCount = H
bodyCountRemainingBeforeSectionPlacement = B - 2H
sleeve1CountRemainingBeforeSectionPlacement = S1 - H
sleeve2CountRemainingBeforeSectionPlacement = S2 - H
```

It must not add those remaining counts into a `combinedYokeStitchCount`. That sum becomes
authoritative only after later section placement, raglan-line ownership, and readiness
validation are complete.

## 9. Pattern and section constraints deliberately deferred

Stage 73 stores the main pattern/repeat as user-facing text. Stage 79 normalizes its
inherited main pattern to a structural repeat of one for the sleeve-planning scope.
That normalization is not proof that every possible body cut position preserves a
motif or that a later joined round starts in the correct phase.

Therefore Stage 83 must not claim any of the following:

- the body can already be split into equal front/back sections;
- the selected `H` preserves a non-trivial body or sleeve motif at all four edges;
- the beginning of round is located at a safe join boundary;
- four raglan lines own zero, one, two, or another number of stitches;
- unequal accepted sleeve counts produce a balanced yoke;
- the Stage 78 shaping cadence is executable from the remaining counts.

Those are inputs to component readiness and join preparation. If a future implementation
needs structured pattern-edge constraints earlier, it must add an explicitly confirmed
source contract rather than reinterpret the Stage 73 free text.

## 10. Conceptual contract

```text
kind: PROJECT_UNDERARM_ALLOCATION_PLANNING
contractSchemaId: UNDERARM_ALLOCATION_PLANNING_CONTRACT_V1
contractVersion: 1
planSchemaId: UNDERARM_ALLOCATION_PLAN_V1
outputBoundary: underarm_allocation_plan_completed
allocationPolicy: equal-live-underarm-graft-allocation:v1
candidatePolicy: joint-underarm-span-count-selection:v1
```

Conceptual identity:

```text
${projectId}:${calculationId}:underarm-allocation-planning:
${epoch}:${stage81BindingFingerprint}:${stage82ResultFingerprint}
```

The immutable plan must include at least:

- exact project/calculation scope;
- exact current Stage 79 plan, Stage 80 pair, successful Stage 81 decision, and completed
  Stage 82 result bindings;
- exact body and sleeve gauge identities, revisions, applicability evidence, and
  fingerprints used by the candidate calculation;
- actual `B`, `S1`, and `S2` copied as source facts without replacement or averaging;
- target span `D`, measurement-path identity, origin, and explicit confirmation;
- policy identities/versions;
- deterministic candidate set, ranking, selected `H`, displayed physical consequences,
  and review fingerprint;
- `physicalAllocationApplied: false` and
  `underarmStitchesHeldOrRemoved: false` for body and both sleeves;
- immutable source, plan, operation, and completion fingerprints;
- predecessor/supersession lineage and timestamps.

The plan schema must reject join positions, actual held counts, combined-yoke count,
raglan execution, neckline, polo, collar, and placket fields.

## 11. Lifecycle

| Lifecycle | Meaning | Allowed operations |
|---|---|---|
| `ready` | Read-only projection; current Stage 81/82 and gauges are reconstructible | `start_allocation_planning` |
| `collecting_target` | No allocation exists; waiting for the underarm span | `set_target_underarm_span` |
| `reviewing_candidates` | Deterministic integer candidates and consequences are visible | `select_candidate`, `revise_target`, `complete_plan` |
| `completed` | Immutable allocation plan exists; no stitch moved | exact replay; `start_allocation_rework` creates a new epoch |

`blocked` and `stale` remain derived projections. Merely opening the workspace must not
persist a plan. `complete_plan` requires explicit confirmation of the exact review
fingerprint and the statement that no underarm stitch has yet been held or removed.

## 12. Source reconstruction and currentness

Stage 83 must reconstruct, not trust a shallow projection:

1. the active project/calculation;
2. the current completed Stage 79 plan and exact gauge bindings;
3. the current Stage 80 preparation and both current immutable component results;
4. the highest current Stage 81 decision bound to those exact results, with outcome
   `matched` or `accepted_with_deviation`;
5. the highest current completed Stage 82 result bound to the current body source and
   current successful Stage 81 entry gate;
6. the still-current body gauge/calculation source used for `gb`;
7. the still-current sleeve-main applicability evidence used for `gs`.

Stage 82's transitive entry binding is useful but not sufficient by itself. Stage 83
must verify the current Stage 80/81 identities and fingerprints independently so a
historical Stage 82 payload cannot authorize new work after a sleeve replacement.

## 13. Staleness, history, and rework

| Change | Current Stage 83 effect | Historical plan |
|---|---|---|
| New/superseding Stage 79 plan or gauge binding | Stale | Preserved |
| New Stage 80 sleeve result | Stale | Preserved |
| New Stage 81 pair decision | Stale | Preserved |
| New/superseding Stage 82 result | Stale | Preserved |
| Body gauge/calculation semantic change | Stale | Preserved |
| Target span or candidate correction | New Stage 83 epoch | Preserved |
| Active calculation replacement | Non-current under old calculation | Preserved |
| Unrelated metadata revision | Write conflict until reload, not semantic staleness | Preserved/current after reconstruction |

History is append-only:

- epochs are positive and contiguous per project/calculation/kind;
- epoch 1 has no predecessor;
- later epochs name the previous Stage 83 identity;
- explicit allocation rework also names the superseded plan identity;
- a live epoch changes only under project/repository/domain/source/review fences;
- completed plan bytes never change;
- downstream validation/preparation bound to a superseded plan becomes stale but is not
  erased.

An operation UUID is idempotent only for the same command and canonical payload. Exact
replay returns the already stored state; semantic reuse fails
`OPERATION_ID_CONFLICT`.

## 14. Persistence

Reuse the existing IndexedDB V4 `progress`, `operations`, `checkpoints`, `projects`, and
`meta` transaction pattern.

- Add the future supported progress kind only.
- Store one Stage 83 planning epoch per progress record.
- Reuse the unique `[project_id, calculation_id, kind, epoch]` index.
- Keep domain truth in the progress state and audit/recovery data in operations and
  checkpoints.
- Re-read all authoritative bindings and optimistic fences in the write transaction.
- Do not add a store, index, migration, or DB version bump.

## 15. Why later boundaries remain separate

| Candidate | Stage | Reason for separation |
|---|---:|---|
| Underarm allocation planning | **83** | Selects a reviewable design plan; no physical mutation |
| Component readiness validation | 84 | Purely validates current components, plan, structural constraints, and missing evidence |
| Join preparation | 85 | Assigns exact body/sleeve positions, section order, BOR, raglan ownership, and executable instructions |
| Join execution | 86 | Records actual stitches held/removed and the irreversible physical join |
| Combined-yoke/raglan planning/execution | Later | Consumes the physical join result and a complete specialized yoke contract |

Stage 84 must not collect the target span or choose `H`; otherwise validation would
silently create the plan it is meant to validate. Stage 85 must not physically move
stitches. Stage 86 must not discover different counts during an irreversible action and
silently rewrite Stage 83.

## 16. Join-blocking prerequisites after Stage 83

Even a completed Stage 83 does not make join preparation or execution available. The
following still have to become authoritative and current:

1. current successful Stage 81 pair and current completed Stage 82 body result;
2. current immutable Stage 83 allocation plan;
3. structured compatibility of the selected allocation with body/sleeve section edges;
4. exact front/back section counts and left/right body positions;
5. exact sleeve underarm positions/orientation for both pieces;
6. raglan-line stitch ownership and marker topology;
7. beginning-of-round placement;
8. deterministic conservation equations and the first combined-round balance;
9. an immutable Stage 84 readiness result;
10. an immutable Stage 85 executable join preparation;
11. later, actual physical held/removed counts matching that preparation.

Before these coexist, the system must not render a join action, calculate a combined
yoke, execute raglan shaping, or start neckline/collar/placket logic.

## 17. UX contract

The Stage 83 screen may show:

- actual body, sleeve 1, and sleeve 2 full-tube counts as separate read-only facts;
- current accepted-pair status and body physical-confirmation status;
- a diagram of the single underarm closure span to measure/choose;
- current body and sleeve gauge contexts with applicability labels;
- candidate counts and their body/sleeve centimetre consequences;
- a prominent statement that the numbers are a plan and no stitch should be moved yet.

It must not show internal UUIDs, fingerprints, revisions, epochs, source objects, or
operation receipts. It must not display the sum of remaining stitches as a combined-yoke
count. Success ends at `underarm_allocation_plan_completed` with a next-stage label such
as “Проверить готовность деталей”, not “Соединить детали”.

## 18. Future production file plan

A later production task should be limited to:

- `src/yarnai/static/project-underarm-allocation-planning.js` — pure domain and exact
  candidate math;
- `src/yarnai/static/project-underarm-allocation-planning-application.js` — complete
  authoritative reconstruction/currentness;
- matching workspace, assistant, HTML, CSS, and test/dev fixture;
- scoped `project-system.js` history/get/save methods using existing stores;
- scoped Stage 82 navigation and HTTP asset registration;
- JS domain/repository/workspace tests and Python static UI tests;
- a separately reviewable addition to the knitting math canon for the two V1 policy
  identities before production arithmetic is treated as normative.

The generic Python calculation engine must not be widened into a yoke engine. No Stage
84–86 production file belongs in the Stage 83 implementation task.

## 19. Future test matrix

| Case | Required assertion |
|---|---|
| Happy path | Current 79–82 chain + target span -> deterministic candidates -> immutable completed plan; no stitch moved |
| Missing Stage 81/82 | Fail closed; no Stage 83 record |
| Separate actuals | `B`, `S1`, and `S2` retained separately; no averaging or planned-count substitution |
| Exact integer candidate | Correct spans/errors and explicit confirmation |
| Candidate tie | No hidden selection; exact candidate choice required |
| Impossible candidate | Positivity/conservation failure blocks without clamping |
| Gauge mismatch | Both body and sleeve consequences visible; no single-gauge substitution |
| Stale gauge/source | Write and current projection fail closed; history unchanged |
| Upstream sleeve/body replacement | Existing plan becomes historical without mutation |
| Rework | Contiguous new epoch names predecessor and superseded plan |
| Duplicate operation | Exact replay no-op; conflicting UUID reuse fails |
| Optimistic concurrency | Project/repository/domain/source/review conflict rejected |
| Completed immutability | In-place source, target, candidate, or plan mutation rejected |
| Planning-only safety | All body/sleeve `heldOrRemoved` facts remain false |
| Boundary safety | No positions, section balance, BOR, raglan ownership, combined count, join action, or yoke execution |
| Presentation safety | No UUID/fingerprint/revision/epoch/receipt leaks |
| Storage reuse | DB remains V4 with the existing stores/indexes |

## 20. Regression baseline for this finding

Before creating this document, the current production baseline was verified:

| Command/scope | Result |
|---|---|
| `npm run test:stage81` | PASS: 10 tests |
| `npm run test:stage82` | PASS: 7 tests |
| Stage 79–82 Python static UI suites | PASS: 16 tests |
| `git diff --check` | No whitespace errors; line-ending warnings only |

The local `.venv` launcher is blocked by Windows Application Control. The Python UI
tests were therefore run with the installed system Python 3.14; pytest's only warning
was inability to create its cache path in the existing workspace state.

## 21. Conclusion

Production Stage 82 supplies the last missing pre-allocation physical component fact.
It does not supply the allocation itself. The next safe independent boundary is
`PROJECT_UNDERARM_ALLOCATION_PLANNING`: a source-bound, immutable, planning-only choice
of one common live-stitch allocation derived from an explicit underarm span under a
versioned narrow V1 policy.

Component readiness, exact positions, section balance, raglan-line ownership, combined
yoke arithmetic, physical stitch holds, join execution, and yoke execution remain
separate later stages.

STAGE 83 ARCHITECTURE FOUND
