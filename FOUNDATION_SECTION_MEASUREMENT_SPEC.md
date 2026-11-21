# Foundation section physical measurement (Stage 72)

## Boundary

This stage records one physical measurement of the already-started foundation
ribbing. It never derives height from time, rows, gauge, or a button click. The
only completion authority is a user-entered physical measurement submitted by
the explicit `Save measurement` action.

The production route is
`/project-foundation-section-measurement?project=<uuid-v7>`. User-facing copy
does not expose stage numbers.

## Entry and Stage 71 integration

Measurement is allowed only when the authoritative Stage 71 execution is
`paused` and has a non-null `startedAt`. An `active` execution must first be
paused by an explicit Stage 71 action; a `ready` execution is rejected. Stage
72 never changes the Stage 71 lifecycle implicitly.

After a completed `BELOW_TARGET` result the user returns to Stage 71, which is
still paused. They explicitly resume knitting. A later measurement attempt is
allowed after the execution record has a newer domain revision and is paused
again. A completed `TARGET_REACHED` result is terminal for this foundation
section and resolves to the physical-result boundary rather than back to
ordinary ribbing work.

## Attempts and lifecycle

Each physical check is a separate progress epoch of kind
`FOUNDATION_SECTION_MEASUREMENT`:

The normal user path is one atomic transition:

`collecting -> completed`

The `reviewing` lifecycle remains valid only for backward compatibility with
an already persisted unconfirmed state. It has no separate user-facing screen;
the same `Save measurement` action can complete it. The legacy domain commands
remain readable and valid so existing history is not reinterpreted.

Epochs are ordered and linked by `predecessorIdentity`. At most one epoch may
be non-terminal. A new epoch may follow only a completed `BELOW_TARGET` epoch
and a newer Stage 71 execution revision. Completed snapshots are immutable.

## Canonical physical fact

The presentation parser accepts a strict positive decimal using `.` or `,`.
The persisted value is a finite positive JavaScript number in centimetres.
Empty values, signs, exponent notation, mixed separators, zero, negatives,
`NaN`, and infinities are rejected. No rounding is used for comparison.

The target is source-bound canonical `{kind: "height", value: 5, unit: "cm"}`.
`measuredHeightCm < 5` yields `BELOW_TARGET`; `>= 5` yields
`TARGET_REACHED`. A completed snapshot stores the measured value, target,
result, measured and confirmed timestamps, full source binding and its own
fingerprint.

## Source and concurrency invariants

Creation and every mutation revalidate the project, active calculation, Stage
60-70 chain, immutable Stage 70 completion, and the source-bound Stage 71
execution. The attempt binds the Stage 71 progress identity/storage revision,
state identity/domain revision/fingerprint, execution source chain, execution
plan fingerprint, and measurement-policy fingerprint.

Repository writes are project-scoped, calculation-scoped, serialized,
optimistic-revision checked, and operation-receipt idempotent. Operation IDs
are UUID-v7 and timestamps are canonical ISO UTC. A stale tab cannot complete
or overwrite a newer epoch. Conflict, quarantine, imported-unproven,
cross-project, cross-calculation, malformed lineage, and fingerprint failures
fail closed.
