# Stage 82 architecture finding: physical body-underarm confirmation

Research scope: architecture only. No Stage 82 production code, route, persistence
adapter, migration, test, join arithmetic, or successor implementation is created here.
The inspected worktree was already dirty; all pre-existing changes are left untouched.

## 1. Architecture finding

The first genuinely missing authoritative boundary after a successful Stage 81 is **not
join preparation**. It is the independent physical body-underarm boundary:

- domain identity: `PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION`;
- contract: `BODY_UNDERARM_PHYSICAL_CONFIRMATION_CONTRACT_V1`;
- physical-result schema: `BODY_UNDERARM_PHYSICAL_RESULT_V1`;
- output: one immutable, current-source-bound fact that the body has physically reached
  the real underarm boundary, together with the manually counted full-tube body stitch
  count **before** any underarm stitches are held, removed, or joined.

Completed Stage 81 proves that two current immutable sleeve results were compared and
explicitly accepted. It does not prove anything about the body's physical position or
count. Stage 74 cannot supply that proof because its allowlist requires
`physicalResult: null`; Stage 75 confirms only the user-defined primary-fabric section
height. In the current fixture that section is 30 cm. The later 41 cm value is retained
as `informationalOnly` and the UI expressly says that it is neither an instruction nor
an execution boundary. Therefore neither the planned body count nor the 41 cm
derivation may be promoted to an actual body-underarm result.

The minimum Stage 82 completion fact is consequently:

> This exact body is physically at the underarm boundary; its complete live tube has
> `actualBodyFullTubeStitchCount` stitches at that boundary; no underarm stitches have
> yet been held, removed, or joined.

Stage 82 must fail closed if any part of that statement is absent. It must not allocate
underarm stitches, calculate a combined yoke, assign join positions, or execute a join.

## 2. Evidence from existing code and contracts

1. Stage 61 separates body and garment measurements. `upperArm` and `armholeDepth` are
   body fields; `garmentLength` and `sleeveLength` are garment fields
   (`src/yarnai/static/project-initialization.js:12-14`, `:207`). None is a physical
   body-underarm observation.
2. The generic calculation core models width/height requests and discrete constraints,
   but has no body-underarm allocation, raglan section balance, or combined-yoke model
   (`src/yarnai_calculation/models.py:356-468`). Repository search finds underarm/yoke
   semantics only in the specialized Stage 79 sleeve domain.
3. Stage 65's cast-on result is scoped to `garment_detail_width`; the body execution
   chain later carries 100 stitches, but this remains a planned count, not a manual
   count at the join boundary (`src/yarnai/static/project-execution-plan.js:189`,
   `src/yarnai/static/primary-fabric-preparation.js:114-115`).
4. Stage 74 stores an execution cursor with `physicalResult: null`, and validation
   rejects every non-null physical result. It has only `ready`, `active`, and `paused`
   lifecycles (`src/yarnai/static/primary-fabric-execution.js:7-18`, `:83-99`, `:120`).
5. Stage 75's authority is narrowly
   `measurementPolicy.scope = current_primary_fabric_height`. Its completed snapshot
   contains measured height, target height, and `TARGET_REACHED`/`BELOW_TARGET`, but no
   body stitch count and no underarm-boundary confirmation
   (`src/yarnai/static/primary-fabric-measurement.js:16-18`, `:86-104`, `:115-124`).
6. The happy-path Stage 75 measurement is 30 cm
   (`src/yarnai/static/stage76-happy-path-fixture.js:15-19`). Stage 76 derives
   `garmentLengthCm - armholeDepthCm`, but labels the result conditional; Stage 78
   persists it with `informationalOnly: true`
   (`src/yarnai/static/project-next-section-planning.js:145-169`,
   `src/yarnai/static/project-shaping-policy-planning.js:108-112`, `:130-131`). The
   Stage 76/78 workspaces explicitly say it is not an instruction or execution boundary
   (`src/yarnai/static/project-next-section-planning-workspace.js:30`,
   `src/yarnai/static/project-shaping-policy-planning-workspace.js:29`).
7. Stage 77 fixes `construction-strategy:body-sleeves-joined-raglan:v1`; Stage 78 fixes
   post-join raglan shaping but keeps body/sleeve underarm allocation and combined-yoke
   balance in the blocking prerequisites
   (`src/yarnai/static/project-shaping-policy-planning.js:10`, `:41-47`, `:107-138`).
8. Stage 79 reconstructs the exact 61/63/65/70/73/75/76/77/78 chain, produces only a
   sleeve plan, and its stop condition explicitly says no underarm stitches are held or
   removed and physical confirmation is later
   (`src/yarnai/static/project-sleeve-target-geometry-planning-application.js:4-13`,
   `:56-112`; `src/yarnai/static/project-sleeve-target-geometry-planning.js:322-361`).
9. Stage 80 turns each planned sleeve count into a separately entered actual count. Its
   immutable result fixes the endpoint as
   `full_sleeve_tube_at_underarm_before_allocation` and
   `underarmStitchesHeldOrRemoved: false`
   (`src/yarnai/static/project-sleeve-physical-execution.js:4-12`, `:70-115`,
   `:250-273`). The actual count is never copied from the plan
   (`tests-js/project-sleeve-physical-execution.test.cjs:113-120`).
10. Stage 81 binds the two current Stage 80 results, compares exact actuals, records the
    explicit accept/rework decision, and always projects `joinPreparation.available:
    false` (`src/yarnai/static/project-sleeve-pair-validation.js:76-117`, `:124-162`,
    `:203-209`). Its production test forbids body count, allocation, and combined-yoke
    fields (`tests-js/project-sleeve-pair-validation.test.cjs:93-96`).
11. Persistence is already generic: IndexedDB V4 has `progress`, `operations`, and
    `checkpoints`; `progress.by_scope_epoch` is unique on
    `[project_id, calculation_id, kind, epoch]`
    (`src/yarnai/static/project-system.js:4-6`, `:98-145`, `:1982-2011`). Stage 79-81
    already reuse these stores and perform project/progress/source revision fencing in
    one transaction (`src/yarnai/static/project-system.js:5650-5888`).

No hidden authoritative body-underarm physical record, allocation policy, held-count
record, section-balance contract, or combined-yoke calculator was found.

## 3. Authoritative-input table after Stage 81

`Immutable` means immutable in its owning completed record. `May stale` means it may
remain historical while ceasing to be the current source.

| Data | Exact source | Classification after Stage 81 | Immutable | May stale | Safe for Stage 82 / later join work |
|---|---|---|---:|---:|---|
| Project identity | `projects.project_id` | Authoritative scope | Yes | No | Yes |
| Active calculation identity | `projects.active_calculation_id` + calculation record | Authoritative current scope | Yes per calculation | Yes | Yes only while active and source-bound |
| Project/calculation revision | project and progress records | Concurrency metadata, not physical truth | No | Yes | Write fence only; never a body measurement |
| Construction direction | Stage 76 `bottom_up` | User-confirmed authoritative | Yes | Yes | Yes while exact Stage 76+ chain is current |
| Body/sleeve topology | Stage 77 joined raglan identity | User-confirmed authoritative | Yes | Yes | Yes as topology, not as allocation |
| Raglan shaping policy | Stage 78 policy identity | User-confirmed authoritative | Yes | Yes | Yes only for later post-join planning |
| Body execution state | Stage 74 `ready/active/paused` | Authoritative cursor | No until superseded by writes | Yes | Shows work history only; not completion |
| Body actual physical result | No record | **Missing** | — | — | No |
| Stage 75 primary-fabric height | Stage 75 completed snapshot | User-confirmed physical measurement of one section | Yes | Yes | Yes as its exact scoped observation only |
| Planned body stitch count | Stage 65/73/74 chain, fixture value 100 | Derived/planned | Yes in source snapshots | Yes | Comparison context only; not actual count |
| Informational armhole start | Stage 76-78, fixture 41 cm | Derived, expressly informational | Yes | Yes | No as an execution stop or physical proof |
| Stage 79 sleeve plan | latest completed Stage 79 epoch | User-confirmed + derived plan | Yes | Yes | Yes for its bound sleeve execution only |
| Stage 80 shared sleeve preparation | latest current preparation epoch | Derived authoritative instruction snapshot | Yes per epoch | Yes | Yes for bound sleeve attempts |
| Sleeve 1 actual result | latest non-superseded completed Stage 80 attempt | User-confirmed physical authoritative | Yes | Yes | Yes; keep its own value |
| Sleeve 2 actual result | latest non-superseded completed Stage 80 attempt | User-confirmed physical authoritative | Yes | Yes | Yes; keep its own value |
| Sleeve 1 actual full-tube underarm count | Stage 80 result | User-confirmed physical authoritative, pre-allocation | Yes | Yes | Yes; never replace with plan or sleeve 2 |
| Sleeve 2 actual full-tube underarm count | Stage 80 result | User-confirmed physical authoritative, pre-allocation | Yes | Yes | Yes; never average with sleeve 1 |
| Pair validation decision | latest current completed Stage 81 epoch | User-confirmed authoritative decision | Yes | Yes | Yes as pair acceptance only |
| Body at true underarm boundary | No record | **Missing** | — | — | No |
| Actual body full-tube stitch count at underarm | No record | **Missing** | — | — | No |
| Sleeve stitches already held/removed | Stage 80 explicitly says `false` | Authoritative negative fact | Yes | Yes | Yes: allocation has not happened |
| Body stitches already held/removed | No record | **Missing** | — | — | No |
| Body/sleeve underarm allocation | No policy/result | **Missing** | — | — | No |
| Front/back/sleeve section balance | No policy/result | **Missing** | — | — | No |
| Raglan-line stitch ownership | No policy/result | **Missing** | — | — | No |
| Combined-yoke working count | No record or canonical formula | **Missing** | — | — | No |
| Components ready for join | No aggregate readiness decision | Derived only after later boundaries | — | — | No |

## 4. Missing-input table and ordering

| Missing fact/policy | Kind | Needed at Stage 82? | Why it cannot be inferred |
|---|---|---:|---|
| Explicit physical confirmation that the body is at the real underarm boundary | Physical confirmation | **Yes, first** | Stage 74 has no result; Stage 75 has a narrower measurement scope; 41 cm is informational |
| Actual full-tube body stitch count before allocation | Physical count | **Yes, after the first confirmation** | Planned 100 stitches is not an observation and physical work may differ |
| Actual body height at the confirmed boundary, with an explicit measurement path | Physical measurement | Yes, supporting evidence | Existing section-height and garment-height paths are not proved interchangeable |
| Confirmation that no body underarm stitches have yet been held/removed | Physical confirmation | Yes | Sleeve results prove this only for sleeves |
| Accepted body/sleeve allocation policy | Versioned domain policy | No; later boundary B | No policy exists in code or calculation-domain objects |
| Actual held/removed counts per body and sleeve side/section | Physical confirmation/result | No; later boundary B/D | They do not exist until an allocation is selected and physically applied |
| Component readiness decision | Derived validation | No; later boundary C | It must consume current Stage 81, Stage 82, and allocation prerequisites |
| Join stitch positions and first combined-round topology | Derived plan | No; later boundary D | Actual counts, allocation, balance, and raglan-line ownership are incomplete |
| Physical join result | Physical result | No; later boundary E | No join may occur before D is complete |
| Combined yoke/raglan execution state | Physical execution | No; later boundary F | It follows the physical join and a validated yoke plan |

There is no new design-choice input needed before Stage 82 opens. The first genuinely
missing user fact is a physical confirmation, not a calculation and not an enum.

## 5. Selected next boundary

### A. `PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION`

This is Stage 82 because it is the earliest unsatisfied physical prerequisite and is
logically prior to allocation or join arithmetic. It should be capable of handling both
real states:

1. the body is not yet at the boundary: continue/pause/resume the existing body work,
   without manufacturing a join plan;
2. the body is already physically at the boundary: open result review directly and
   capture the actual evidence without forcing duplicate knitting.

Completion must contain at least:

- exact project/calculation and body-source bindings;
- entry-gate binding to the current accepted Stage 81 result when Stage 82 is reached
  through the staged UI;
- `completionBoundary: full_body_tube_at_underarm_before_allocation`;
- `physicalBoundaryConfirmation.explicit: true`;
- `actualBodyFullTubeStitchCount`, manually counted;
- `actualBodyHeightAtUnderarmCm` and
  `heightMeasurementPath: lower_body_edge_to_underarm_boundary`;
- `underarmStitchesHeldOrRemoved: false`;
- the planned/contextual comparison values copied separately, never substituted for
  actuals;
- immutable result, source, operation, and completion fingerprints.

Binding the staged entry gate to Stage 81 does not make sleeve validation a physical
cause of the body result. The physical result remains its own immutable artifact. A new
Stage 81 epoch may make the Stage 82 aggregate non-current, but it must never rewrite or
erase the body observation.

## 6. Why the alternative boundaries are premature or separate

| Candidate | Independent stage? | Finding |
|---|---:|---|
| A. Body-underarm physical confirmation | **Yes: Stage 82** | First missing physical authority; required before any safe allocation |
| B. Sleeve/body underarm allocation confirmation | Yes, later | Requires Stage 82 actual body count plus an approved allocation policy; cannot be bundled into physical body confirmation |
| C. Component readiness validation | Yes, later | A pure validation over current Stage 81, Stage 82, and allocation state; it must not collect missing physical evidence silently |
| D. Join preparation | Yes, later | May calculate/assign held counts and section topology only after A-C and a versioned policy |
| E. Join execution | Yes, later | Irreversible physical action; must consume one immutable current D plan |
| F. Combined yoke/raglan execution | Yes, later | Starts only after E and must not absorb join or polo/neck/placket planning |

B cannot be merged with A because observing an actual body count does not select how
many stitches to hold. C cannot be merged with D because readiness validation should be
repeatable and side-effect free, while D creates a new plan. D, E, and F cross planning
and physical-mutation boundaries and must remain separate.

## 7. Proposed domain identity and version

```text
kind: PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION
contractSchemaId: BODY_UNDERARM_PHYSICAL_CONFIRMATION_CONTRACT_V1
contractVersion: 1
resultSchemaId: BODY_UNDERARM_PHYSICAL_RESULT_V1
completionBoundary: full_body_tube_at_underarm_before_allocation
measurementPolicy: body-underarm-measurement-path:v1
comparisonPolicy: report-planned-versus-actual-without-replacement:v1
```

Conceptual identity:

```text
${projectId}:${calculationId}:body-underarm-confirmation:
${epoch}:${bodySourceBindingFingerprint}:${stage81EntryBindingFingerprint}
```

The physical-result fingerprint must exclude repository transport metadata but include
the exact body preparation/source identity, actual values, measurement path, explicit
confirmations, and timestamps. The aggregate state fingerprint includes the current
Stage 81 entry binding as well.

## 8. Proposed lifecycle

| Lifecycle | Meaning | Allowed operations |
|---|---|---|
| `ready` | Sources current; no body-underarm claim yet | `confirm_already_at_boundary`, `start_or_continue_body_work` |
| `in_progress` | Body continuation is physically underway | `pause`, `declare_boundary_reached` |
| `paused` | Safe resumable cursor | `resume` |
| `reviewing_result` | Draft actual height/count and confirmations are visible | `edit_result_draft`, `return_to_work`, `complete_confirmation` |
| `completed` | Immutable physical result exists | exact replay; `start_body_rework` creates a new epoch |

`blocked` and `stale` should normally be derived projections, not mutations of a
completed physical record. A source failure never changes historical evidence.

An observed planned-versus-actual difference is not automatically a tolerance failure:
Stage 82 V1 has no numeric tolerance policy. It must display the difference, require an
explanation/explicit confirmation, and preserve both values. If the user says the body
has not reached the real boundary, completion is unavailable and the flow returns to
physical work. Stage 82 does not decide whether a dimensional deviation is joinable;
that belongs to later readiness/allocation policy.

## 9. Persistence, history, and epoch model

Reuse the existing `progress` store and the existing atomic
`projects + progress + operations + checkpoints + meta` write pattern.

- Add only the future supported progress kind; do not add an IndexedDB store, index, or
  DB version bump. V4 and `by_scope_epoch` already represent the required history.
- One progress record represents one Stage 82 physical-attempt epoch.
- Epochs are positive and contiguous per project/calculation/kind.
- Epoch 1 has `predecessorIdentity: null`; every later epoch names the prior Stage 82
  identity and, for rework, the superseded completed result identity.
- A live epoch may change under optimistic revision/fingerprint fences.
- A completed epoch is byte-for-byte immutable. No later source change mutates it.
- Currentness is derived by reconstructing all authoritative sources and selecting the
  highest valid non-superseded epoch bound to them.
- Operations and checkpoints provide audit/recovery; progress state owns domain truth.

No migration/store is justified.

## 10. Staleness, concurrency, and idempotency

| Upstream change | Effect on current Stage 82 aggregate | Historical physical result |
|---|---|---|
| New/superseding Stage 79 epoch | Stale indirectly because current Stage 80/81 chain changes | Preserved |
| New Stage 80 sleeve attempt/result | Stale because its Stage 81 entry binding is no longer current | Preserved |
| New Stage 81 validation epoch | Stale; a new Stage 82 epoch/re-attestation must bind the current accepted pair | Preserved; no recount if body sources/result are still current |
| New body physical-result attempt | Previous Stage 82 is superseded and non-current | Preserved |
| Stage 70/73/body preparation change | Stale if the exact bound body instruction/measurement semantics change | Preserved |
| Underarm confirmation/count correction | Requires a new Stage 82 epoch | Preserved |
| Active calculation replacement | Immediately non-current | Preserved under old calculation |
| Project revision containing a bound semantic-source change | Stale | Preserved |
| Unrelated project metadata revision | Write conflict until reload, but not semantic staleness by itself | Preserved/current after reconstruction |

Every command requires expected project revision, repository revision, domain revision,
state fingerprint, body-source fingerprint, and (where used) Stage 81 entry fingerprint.
The repository must re-read all of them inside the write transaction.

An operation UUID is idempotent only for the same command and canonical payload. Exact
replay returns the already stored state without a new revision; reuse with different
semantics fails `OPERATION_ID_CONFLICT`. A completed epoch rejects in-place mutation.

## 11. Rework model

Rework is append-only:

1. keep the completed body result and its fingerprint unchanged;
2. create `epoch + 1` with both `predecessorIdentity` and
   `supersedesResultIdentity`;
3. bind the new attempt to the current body preparation and current staged entry gate;
4. collect a new physical confirmation/count;
5. make all downstream readiness/allocation/join plans bound to the old result stale;
6. never mutate Stage 79, Stage 80, or Stage 81 from Stage 82.

If only Stage 81 changes while the body itself and its source binding do not, production
may create a new Stage 82 epoch that re-attests the existing immutable body result
without asking the user to knit, measure, or count again. That operation must explicitly
reference the reused result and cannot clone it as new physical evidence.

## 12. UX contract and first user input

The screen may show presentation-safe facts:

- the body work already confirmed (foundation and primary-fabric measurements shown
  separately, without pretending they are one cumulative height);
- the intended underarm context and the 41 cm derivation clearly labelled as an
  orientation, not as an already reached physical result;
- the accepted sleeve-pair status and two actual sleeve counts as read-only summaries;
- a clear warning that no underarm stitches should yet be held or joined.

The **first and only new question at entry** is:

> Корпус сейчас физически довязан до линии подрезов, при этом петли подрезов ещё не
> сняты и детали не соединены?

The user performs no calculation. If the answer is “no”, the allowed action is to
continue/pause/resume the body work. If “yes”, the next in-stage evidence form asks the
user to measure the body height by the shown path and manually count all live body
stitches; YarnAI compares those values with stored plans itself.

Success ends at `body_underarm_physical_confirmation_completed`. It does **not** open a
join action. Rework creates a new Stage 82 epoch. Internal identities, UUIDs,
fingerprints, repository revisions, epochs, operation receipts, and raw source-binding
objects must never be shown.

## 13. Join-blocking prerequisites

Until all of the following coexist and are current, join preparation and execution stay
blocked:

1. one current accepted Stage 81 pair bound to current Stage 80 results;
2. separate actual pre-allocation counts for sleeve 1 and sleeve 2;
3. one current completed Stage 82 body result at the exact pre-allocation boundary;
4. actual full-tube body stitch count and explicit `heldOrRemoved: false`;
5. an approved versioned underarm-allocation policy;
6. authoritative actual held/removed counts per body and sleeve section after that
   allocation is confirmed;
7. validated front/back/sleeve section balance and raglan-line ownership;
8. a deterministic combined-yoke formula/contract bound to those exact actuals.

Before these exist, the system must not create a combined-yoke count, assign stitch
positions, physically join components, execute raglan shaping, or start polo, neck,
collar, or placket logic.

## 14. Future production file plan

Production work, in a later task, should be limited to:

- `src/yarnai/static/project-body-underarm-physical-confirmation.js` — pure domain;
- `src/yarnai/static/project-body-underarm-physical-confirmation-application.js` —
  authoritative reconstruction/currentness;
- `src/yarnai/static/project-body-underarm-physical-confirmation-workspace.js` and
  `-assistant.js` — presentation-safe controller/bootstrap;
- matching HTML/CSS and a test/dev fixture;
- scoped `project-system.js` get/history/save methods reusing `progress`, operations,
  checkpoints, and revision fences;
- scoped saved-project navigation/HTTP asset registration;
- JS domain/repository/workspace tests and static UI tests.

The general Python calculation core must not be extended unless a separately verified
body-underarm measurement/allocation policy is first specified. No allocation, join,
yoke, polo, neck, or placket file belongs in Stage 82.

## 15. Future test matrix

| Case | Required assertion |
|---|---|
| Happy path | Current sources -> explicit body boundary -> actual height/count -> immutable completed result; join still blocked |
| Missing prerequisite | Missing/unaccepted Stage 81 entry gate or incomplete body source fails closed |
| Stale predecessor | New Stage 79/80/81 source makes current Stage 82 projection stale without mutating history |
| Conflicting revision | Project/progress/domain/source fence rejects stale write |
| Duplicate operation | Exact replay is no-op; conflicting UUID reuse fails |
| Immutable completed history | Any in-place field/result change is rejected |
| Rework/new epoch | Contiguous successor preserves prior bytes and names predecessor/superseded result |
| Reload/resume | `ready`, `in_progress`, `paused`, `reviewing_result`, and `completed` reconstruct identically |
| Exact physical confirmation | Exact planned/actual values remain separately visible and completion succeeds |
| Mismatch physical confirmation | Difference is preserved; explanation/explicit confirmation required; no hidden tolerance |
| Upstream result replacement | New body attempt or preparation invalidates currentness; history remains readable |
| Planned-count substitution | Planned 100 cannot populate `actualBodyFullTubeStitchCount` |
| Measurement-path safety | 30 cm primary fabric, actual foundation height, and 41 cm orientation are not silently added/equated |
| Join safety | No allocation, combined count, join position, join execution, yoke, or polo field/action exists |
| Presentation safety | No fingerprint, epoch, internal identity, repository revision, or receipt reaches the UI projection |
| Storage reuse | DB remains V4 with the same stores/indexes; only the supported kind and repository methods change |

No Stage 82 production tests are written in this architecture task.

## 16. Regression-test results

No production code was changed for these tests.

| Command/scope | Result |
|---|---|
| `npm run test:stage79` | PASS: 17 domain/application/repository + 11 workspace tests |
| `npm run test:stage80` | PASS: 12 tests |
| `npm run test:stage81` | PASS: 10 tests |
| Python sleeve math/planning + Stage 79/80/81 static UI suites | PASS: 146 tests; one pre-existing Starlette `httpx` deprecation warning |

The local `.venv` Python launcher was blocked by Windows Application Control. The same
installed test packages were therefore loaded through the bundled Codex Python runtime;
the test selection and repository sources were unchanged.

## 17. Git status

The worktree was already substantially dirty before this research, including the
uncommitted Stage 79-81 implementation and unrelated files. The only file created by
this task is `STAGE_82_ARCHITECTURE_FINDING.md`. No commit, push, reset, checkout, clean,
delete, or staging operation is performed.

Final validation: `git diff --check` passed (line-ending conversion warnings only, no
whitespace errors). Scoped status is `?? STAGE_82_ARCHITECTURE_FINDING.md`; every other
listed modification/untracked path pre-dated this architecture task and remains
untouched.

## 18. Conclusion

The existing contracts establish sleeve planning, two immutable sleeve physical
results, and an immutable pair decision. They do not establish the body's physical
underarm result. The first safe successor is therefore the independent body-underarm
physical confirmation boundary. Allocation, readiness validation, join preparation,
join execution, and combined-yoke/raglan execution remain separate later boundaries.

STAGE 82 ARCHITECTURE FOUND
