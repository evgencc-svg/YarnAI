# Primary fabric execution (Stage 74)

## Architecture finding

The authoritative work item is sequence 3 of the completed Stage 65 plan: the
`PRIMARY_FABRIC` step and its immutable identity, dependency, plan fingerprint,
and revision. The completed Stage 73 record supplies the previously missing
user-provided `main_pattern`, `pattern_repeat`, and `section_height`, while
preserving the 100-stitch context, working method, tool, and the Stage 72
`TARGET_REACHED` predecessor.

No additional clarification is required for the accepted plan. Its bounded
`direction = unknown` value is not a required input of the step and does not
prevent execution of the independently source-bound round-knitting method and
user-provided repeat instruction. The value remains preserved rather than
being replaced with an invented default.

## Entry invariant

Entry fails closed unless one active project/calculation has a live-valid
Stage 60–72 source chain, terminal Stage 72 `TARGET_REACHED`, and exactly one
completed immutable Stage 73 preparation. Project, calculation, plan/step,
predecessor, revision, identity, fingerprint, and source bindings must agree.
Missing, incomplete, imported-unproven, quarantined, conflicting, corrupted,
cross-scope, or stale Stage 73 data blocks execution.

## Persisted lifecycle

```text
ready -> active <-> paused
```

Start, pause, and resume are explicit user commands. Every accepted command
increments the domain revision once, appends a UUID-v7 operation receipt, and
is guarded by project, progress-storage, and domain revisions. Exact replay is
idempotent; operation-ID reuse and stale-tab writes fail closed.

`physicalResult` is always `null`. No lifecycle transition, timestamp, or
elapsed time establishes that the 30 cm target has been reached. A future
physical-measurement boundary is required after a pause; this contract neither
implements nor links to that future stage.

## Production surface

Route:

`/project-primary-fabric-execution?project=<uuid-v7>`

The screen presents only source-bound values: 100 stitches, round knitting,
stockinette, the user-provided repeat instruction, target height 30 cm, and the
user's circular needles. User-facing copy does not expose stage numbers or
provenance/debug payloads.

Local test/dev fixture:

`/static/stage74-happy-path-fixture.html`

The fixture builds the chain through production domain/repository APIs,
completes Stage 73 with the accepted values, verifies Stage 74 is absent, and
opens the production execution route.
