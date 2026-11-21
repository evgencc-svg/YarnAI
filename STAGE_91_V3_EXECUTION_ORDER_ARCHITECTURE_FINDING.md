# Stage 91 V3 execution-order architecture finding

## Verdict

**STAGE 91 V3 CLOSES THE STAGE 92 PREDECESSOR-CONTRACT BLOCKER.**

Stage 92 may now consume a completed current authoritative Stage 91 plan literally as
`instruction -> executionSteps[0..N]`. It does not need to merge fabric and yarn arrays,
choose an interleaving, infer a turn, reconstruct an intermediate yarn location, or invent
a topology transition. This finding does not implement Stage 92 production code.

## Why V2 was insufficient

`NECKLINE_OPENING_PLAN_V2` remains internally valid and immutable, but each instruction
contains two independently indexed physical sequences: `orderedActions[]` and
`yarnActions[]`. Neither array defines whether a yarn operation occurs before or after a
fabric operation. The first circular-to-flat instruction therefore admits multiple
physical interpretations even though its instruction-level before/after snapshots are
closed. An executor would have to become a hidden planner.

V1 and V2 records remain byte-stable readers. Neither version is rewritten or migrated.
Both are Stage 92-ineligible and offer an explicit V3 replan.

## V3 identity

- contract: `NECKLINE_OPENING_PLANNING_CONTRACT_V3`, version `3`;
- result: `NECKLINE_OPENING_PLAN_V3`, version `3`;
- instruction: `NECKLINE_OPENING_EXECUTION_INSTRUCTION_V2`;
- step: `NECKLINE_OPENING_EXECUTION_STEP_V1`;
- state: `NECKLINE_OPENING_EXECUTION_STATE_V1`;
- capability: `globally_ordered_structural_execution_v1`.

The only new Stage 91 write path is V3. The IndexedDB schema remains V4; no storage
migration is necessary because progress records already persist versioned opaque domain
states.

## Unified stream and intermediate state

Every physical operation appears exactly once in the canonical global `executionSteps[]`
order. Instructions retain the useful row/pass hierarchy and contain their contiguous
slice of that same stream. Step ordinals and IDs are unique and gap-free across instruction
boundaries, and previous/next links close globally.

Each step stores an immutable full before state and after state. The state includes:

- yarn source identity, joined/active status, continuity and exact boundary;
- cyclic/linear fabric topology, active ranges, held groups, opening edges and historical
  BOR;
- exact section/live/held/bound-off/decreased ledgers;
- current boundary, RS/WS face, direction, turn status and next accessible path.

Adjacent state equality has zero tolerance. Instruction boundaries equal their first and
last step boundaries, and adjacent instructions share exactly one state. Fingerprints cover
every state, step contribution, step, instruction, closure proof and completed result.

## Circular-to-flat and yarn order

The first instruction uses one explicit physical order:

1. break the Stage 90 primary yarn at the historical BOR;
2. join the identified neckline execution yarn at the exact existing
   `center_front_bind_off_start` boundary;
3. activate that joined source at the same boundary;
4. bind off or hold the exact center-front count;
5. create the two stable opening edges as the declared effect of that typed center action,
   retire the old BOR to history and establish linear topology;
6. traverse/decrease in the declared direction;
7. explicitly turn or stop.

The join anchor exists before the opening edges, so Stage 92 never has to join to a boundary
that has not yet been created. Every prefix of the sequence has a valid intermediate state.

## Bind-off solution

Center bind-off is a safe atomic typed step in the supported method. Its contract fixes the
existing start boundary, direction, exact consumed count, resulting right opening edge,
working-yarn location, remaining active ranges, stitch ledger, face and linear topology.
Step-level conservation requires:

`before.totalLive + before.boundOff + before.decreased`

to equal:

`after.totalLive + after.boundOff + after.decreased`.

Changing the count, location, topology, successor state or ledger fails validation. Center
hold is the corresponding live-stitch-preserving typed transition for the supported V-neck
case.

## Fail-closed boundary

The action-kind allow-list has no generic or opaque escape hatch. Unknown actions, implicit
yarn changes, implicit turns, invalid joins, concealed bind-off, fabric cut, steek and any
cut-equivalent text are rejected. Cut/steek remains unsupported and requires a future
dedicated contract.

## Compatibility, lifecycle and Stage 92 eligibility

The existing collecting, reviewing, completed, replay, optimistic revision, immutable
completion and append-only rework semantics are reused. Mixed V1/V2/V3 histories validate
without mutating old bytes. A durable Stage 92 start receipt still blocks ordinary Stage 91
rework.

`stage92Eligibility()` rejects V1, rejects V2 with
`STAGE91_V2_GLOBAL_EXECUTION_ORDER_REQUIRED`, and accepts V3 only when the state/result are
completed, current, authoritative, recomputable and globally closed. A malformed, stale or
non-authoritative V3 remains ineligible.

## Consequence

For the supported non-cut scope, Stage 92 architecture is now safe to design as a physical
execution engine. Its input algorithm is iteration, not planning:

`for instruction in plan: for step in instruction.executionSteps: execute(step)`.

No Stage 92 production implementation was created by this change.
