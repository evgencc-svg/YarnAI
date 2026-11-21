# Stage 92 production architecture finding

## Verdict

**STAGE 92 PRODUCTION COMPLETE.**

`PROJECT_NECKLINE_OPENING_EXECUTION` is the fail-closed physical executor for one
authoritative, current, completed `NECKLINE_OPENING_PLAN_V3`. It consumes the canonical
global `executionSteps[]` stream literally. It does not plan, reorder, merge, infer,
clamp, tolerate, or repair knitting instructions.

The former Stage 92 blocker is closed by Stage 91 V3. V1 and V2 remain immutable
historical readers and are rejected as executor inputs.

## Identity and boundary

```text
kind:                 PROJECT_NECKLINE_OPENING_EXECUTION
contract:             NECKLINE_OPENING_EXECUTION_CONTRACT_V1
contract version:     1
result:               NECKLINE_OPENING_EXECUTION_RESULT_V1
result version:       1
output boundary:      neckline_opening_execution_completed
route:                /project-neckline-opening-execution
required input:       NECKLINE_OPENING_PLAN_V3
required capability:  globally_ordered_structural_execution_v1
successor boundary:   PROJECT_NECKLINE_EDGE_FINISHING_PLANNING
```

The successor is declared and linked only as a boundary. No production successor stage
was implemented.

## Architecture reuse and resolved contradiction

Stage 90 supplies the execution philosophy: source reconstruction, immutable physical
evidence, optimistic revision, operation replay, discrepancy freezing, pause/reload,
explicit recovery, terminal verification, and immutable completion. IndexedDB V4 and
the existing opaque progress-record repository are reused without migration.

The old Stage 92 finding correctly rejected V2 because its yarn and fabric arrays had no
total order. That finding's instruction-level atom is superseded by the production V3
contract: V3 deliberately exposes safe full before/after state for every globally ordered
`executionStep`. Therefore one V3 `executionStep`, not one whole instruction, is the
durable physical atom. Instruction receipts remain mandatory aggregate boundaries.

## Input gating

Application reconstruction validates the complete authoritative predecessor chain and
the current contiguous Stage 91 history. Stage 92 then requires:

- Stage 91 contract/result version 3;
- completed, current, authoritative Stage 91 state;
- recomputable Stage 91 result and valid fingerprints;
- `globally_ordered_structural_execution_v1` with intermediate state after every step;
- identical flattened and instruction-contained step streams;
- unique, gap-free step and instruction ordinals and links;
- exact state continuity and terminal closure proof;
- no stale, unsafe, imported-unproven, quarantined, cut, steek, or opaque action.

V1, V2, malformed V3, non-authoritative V3, stale V3, invalid fingerprints, and any
cut-equivalent action fail closed. There is no automatic migration.

## Planned truth and physical truth

The complete Stage 91 plan is embedded as an immutable, fingerprint-bound source
snapshot. Stage 92 never mutates it. Its separate durable physical truth contains:

- Stage 91 record, state, plan identity, epoch, repository revision, and fingerprints;
- Stage 92 epoch, revision, lifecycle, and exact cursor;
- entry verification receipt;
- append-only step and instruction receipts;
- append-only discrepancies, resolutions, and recovery receipts;
- pause/resume history;
- terminal verification;
- immutable completion result and operation receipts.

## Lifecycle

```text
route view: ready (read-only projection; no record)
start:      verifying_entry
verified:   executing <-> paused
mismatch:   discrepancy -> explicit physical recovery -> executing/verifying_entry
all steps:  terminal_verification
verified:   completed
```

Every transition is explicit. Execution before entry verification, future/duplicate
steps, completion with a gap, and ordinary reopening of completion are rejected.

## Entry verification

Before step 1 the user confirms the observable projection of the exact V3 initial state:
face, direction, current boundary, yarn activity/source/location, cyclic or linear
topology, BOR/opening edges, active ranges, held groups, and all physically countable
ledger values.

The entry receipt keeps three categories separate:

- exact machine-validated planned state fingerprint;
- user-confirmed observable physical state;
- derived full execution-state fingerprint after the observations match.

The UI presents human facts and never asks the user to confirm fingerprints, UUIDs,
serialization, or repository fields.

## Atomic loop and receipts

For the exact next V3 step Stage 92:

1. checks the durable cursor and source/plan fences;
2. displays the plan's physical semantics verbatim;
3. accepts an explicit observable after-state confirmation;
4. compares with zero tolerance to `step.afterState`'s observable projection;
5. creates one immutable step receipt;
6. moves the cursor exactly one ordinal;
7. creates an instruction receipt only when all of that instruction's active step
   receipts exist in exact order and its final step closes to `instruction.afterState`.

The executor never adds yarn actions or turns, changes direction/topology/counts, or
applies tolerance.

## Action-specific physical confirmation

The UI gives distinct confirmation guidance for yarn break/deactivate/join/activate,
traverse, decrease, bind-off, hold, turn, no-turn, and stop. Bind-off consumes the exact
V3 count, starting boundary, ending edge, yarn location, topology transition, and stitch
ledger. It performs no calculation of its own.

## Circular to flat

The first structural transition is consumed in the exact V3 order. The production test
fixture proves yarn break, yarn join, yarn activation, and bind-off/hold before later
traversal/turn/stop steps. The typed opening action retires BOR to history, creates the
opening edges, establishes linear topology, and preserves the exact ledger. Stage 92 has
no hard-coded alternative sequence.

## Discrepancy and recovery

Any mismatch appends a fingerprinted discrepancy containing plan fingerprint,
instruction/step identity, expected observable projection, observed confirmation,
operation UUID, timestamp, and open status. Execution freezes. There is no tolerance,
clamp, automatic correction, or continue-anyway path.

Before confirmation, physical correction returns to the step's exact before-state and
creates no phantom step receipt. After confirmation, recovery never deletes history. A
recovery receipt proves the physical rewind, identifies invalidated step/instruction
receipt identities, and resets the active cursor. Historical receipts stay byte-present;
only the explicit recovery lineage removes them from the active proof set.

## Pause, reload, and resume

Reload reconstructs the last confirmed step, completed instructions, exact next step,
unresolved discrepancy, and lifecycle. A step physically performed but not confirmed is
not completed. Resume can record whether the user believes the action was performed, but
the same ordinary observable confirmation is still mandatory.

## Persistence, replay, and revision

Stage 92 uses IndexedDB V4 `progress`, `operations`, `projects`, and `checkpoints` records.
Writes re-read and fence the project, current Stage 92 record, and exact Stage 91 source
inside the transaction. Supported semantics are:

- UUIDv7 operation identity;
- same UUID plus same payload: idempotent replay;
- same UUID plus different payload: conflict;
- stale project/repository/domain revision: reject;
- stale source or plan fingerprint: reject;
- future/skipped/previous-completed step with a new UUID: reject;
- completed result: immutable.

No database migration was required.

## Stage 91 rework locking

Opening the route is read-only. Starting Stage 92 creates the first durable physical
operation with `source_stage91_plan_identity`. The pre-existing Stage 91 application and
serialized repository hook both detect Stage 92 progress/operations and reject ordinary
plan rework with `PHYSICAL_RESTORATION_REQUIRED`. Silent rework beneath physical progress
is impossible.

## Completion invariants

Completion requires an entry receipt, one active gap-free receipt for every V3 step, one
active receipt for every instruction, exact instruction receipt references, no unresolved
discrepancy, a matching authoritative Stage 91 source, exact terminal physical
observation, terminal yarn/face/direction/boundary/topology/ledger equality, and the V3
conservation proof embodied by the terminal state. Completion creates one fingerprinted,
immutable `NECKLINE_OPENING_EXECUTION_RESULT_V1` and exposes the successor boundary.

## Product surfaces

Production includes domain, application/source reconstruction, IndexedDB repository,
route, HTML/CSS workspace, saved-workspace routing, Stage 91 completion CTA, and assistant
guidance. The assistant may restate only the current exact step; it cannot invent or
reorder knitting work. Raw JSON, fingerprints, internal IDs, and storage internals are not
shown in the UI.

All counts, ranges, geometry, topology changes, and yarn/turn semantics come from the
authoritative V3 plan. Test numbers are fixture data only. Stage 92 is a generic executor
for every supported non-cut neckline opening V3 plan.

## Production files

- `src/yarnai/static/project-neckline-opening-execution.js`
- `src/yarnai/static/project-neckline-opening-execution-application.js`
- `src/yarnai/static/project-neckline-opening-execution-workspace.js`
- `src/yarnai/static/project-neckline-opening-execution-assistant.js`
- `src/yarnai/static/project-neckline-opening-execution.html`
- `src/yarnai/static/project-neckline-opening-execution.css`
- Stage 92 repository additions in `src/yarnai/static/project-system.js`
- route registration in `src/yarnai/http.py`
- Stage 91 CTA and saved-workspace routing updates
- domain, IndexedDB integration, and Python/UI tests

## Verification status

The Stage 92 domain suite covers identity, V1/V2/V3 gating, fingerprints, cut/steek,
entry observations, strict ordering, all supported action kinds, state mismatches,
circular-to-flat, bind-off, instruction receipts, append-only discrepancy/recovery,
pause/reload, replay/revision, terminal mismatch, immutable completion, and successor
availability. The integration suite covers IndexedDB V4, read-only ready projection,
atomic durable start, idempotent replay, Stage 91 rework lock, reload, one-step durable
progress, and saved-workspace routing. Python tests cover route, assets, human UI,
action-specific guidance, navigation, DB version, and successor non-implementation.

Final command counts and regression results are recorded in the implementation handoff.
