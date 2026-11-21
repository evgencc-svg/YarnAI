# Foundation section execution — production contract

## Purpose

`FOUNDATION_SECTION_EXECUTION` records that the user has physically started working the immutable ribbing plan confirmed by `FOUNDATION_SECTION_EXECUTION_PREPARATION`. It does not measure the fabric and cannot establish that the 5 cm target has been reached.

## Source authority

Creation and every mutation fail closed unless all of the following are live-valid for the same project and active calculation:

- the authoritative Stage 60–69 chain accepted by the Stage 70 domain;
- a conflict-free Stage 70 epoch lineage whose current record is `completed`;
- the Stage 70 immutable completed snapshot and its explicit confirmation;
- cast-on target and observed result of 100 stitches with an explicit match;
- ribbing target `{ kind: "height", value: 5, unit: "cm" }`;
- exact Stage 70 state/snapshot identities, fingerprints, progress revision, and inherited source revisions;
- the confirmed rib pattern, working method, stitch allocation, tool, user instruction, measurement policy, and absent row estimate.

Presentation data is never an authority. Imported-unproven, quarantined, conflicting, cross-project, cross-calculation, malformed, stale, or fingerprint-incompatible records are rejected.

## Persisted lifecycle

```text
ready -> active <-> paused
```

- `ready`: the immutable execution plan is persisted, but physical work has not been declared started.
- `active`: the user explicitly declared that physical knitting has started or resumed.
- `paused`: the user explicitly paused the work.

There is no `completed`, `checking`, or `height-achieved` state in this contract. Height measurement and acceptance belong to the next stage.

Every successful transition increments the domain revision once, stores a canonical ISO timestamp, and appends an operation receipt. Operation IDs are UUID-v7 values; exact replay is idempotent and reuse for a different command is rejected. Repository writes additionally fence project revision, progress storage revision, and domain revision inside the existing project serializer.

## Physical-truth boundary

The persisted `physicalResult` is always `null`. Domain validation rejects every non-null value, including an apparent `{ achieved: true, heightCm: 5 }` result. Start, elapsed time, pause, resume, or an inferred row count are never evidence of physical height.

The copied measurement policy remains:

- physical measurement is authoritative;
- target is at least 5 cm;
- measure on needles;
- keep the ribbing naturally unstretched;
- measure from the physical beginning of the ribbing to its current upper edge;
- use no guessed row estimate or tolerance.

## Navigation

The project-scoped route is:

`/project-foundation-section-execution?project=<uuid-v7>`

`/saved-projects` routes a completed preparation with no execution record to the ready execution route. Existing `ready`, `active`, and `paused` records return to the same route. An invalid execution projection does not replace the completed preparation as the last valid authoritative point.

The localhost-only manual fixture is:

`/static/stage71-happy-path-fixture.html`

It creates the Stage 60–70 chain through normal production repository operations, verifies that Stage 71 is absent, then redirects to the real production route.
