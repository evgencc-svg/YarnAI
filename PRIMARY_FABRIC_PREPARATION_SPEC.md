# Primary fabric preparation (Stage 73)

## Architecture finding

The authoritative successor of the completed foundation rib is sequence 3 of the immutable Stage 65 execution plan:

- type: `PRIMARY_FABRIC`;
- status: `conditional`;
- dependency: the sequence-2 `FOUNDATION_SECTION` identity;
- required inputs: exactly `main_pattern`, `pattern_repeat`, and `section_height`;
- current expected output: `{ pattern: null, repeat: null }`.

The existing plan does not establish those three values. It does establish the project/calculation scope, plan and step identities, 100 stitches, and the bounded direction value (`unknown` in the accepted fixture). The Stage 70–72 chain additionally establishes the working method, tool, and physical `TARGET_REACHED` result for the rib.

Consequently Stage 73 is a minimal clarification/preparation boundary. It does not begin physical knitting and it does not invent a pattern, repeat grammar, direction, technique, or height. It is separate from Stage 71/72 because those stages remain the immutable execution and physical-truth history of the rib.

## Entry invariant

Entry is allowed only when all of the following are live-valid for one active project/calculation:

1. the authoritative Stage 60–71 chain accepted by Stage 72;
2. one valid Stage 72 epoch history with no corrupted or conflicting tail;
3. the latest authoritative completed snapshot has `result = TARGET_REACHED`;
4. the Stage 72 state and completed snapshot pass fingerprint, source, revision, and current-upstream binding checks;
5. the Stage 65 completed plan is unique and valid;
6. its sequence-3 step is `PRIMARY_FABRIC`, depends on the exact foundation-step identity, remains conditional, has the exact three required inputs, and has no pre-existing pattern/repeat value.

`BELOW_TARGET`, a merely paused/started Stage 71, an incomplete measurement, imported-unproven data, cross-scope data, duplicate records, or a corrupted late measurement fail closed.

## Missing information and input semantics

Stage 73 asks only for:

- `mainPattern`: normalized, non-empty user text describing the main fabric pattern;
- `patternRepeat`: normalized, non-empty user text describing the repeat as the user will execute it;
- `sectionHeightCm`: a strict finite positive decimal in centimetres.

The repeat remains inert user-provided text because the authoritative plan does not define a safe numeric repeat schema or dimensional grammar. Stage 73 must not infer stitch/row counts from it. Each answer is persisted with `origin = user_provided`.

Known context is projected without reconfirmation:

- 100 stitches;
- source-bound working method;
- source-bound tool label;
- the exact bounded direction value from Stage 65, including `unknown` when that is what the plan contains.

An `unknown` direction is not turned into a new question because direction is not one of the authoritative step's required inputs.

## Lifecycle and UX

Persisted lifecycle:

```text
ready -> completed
```

`blocked` is a read projection, not a persisted lifecycle. One form presents the three missing values and one meaningful action, “Сохранить подготовку”. A successful submit creates the completed immutable record immediately. There is no reviewing screen and no redundant confirmation of already authoritative facts.

Completed Stage 73 does not start the main fabric. That future physical boundary is outside Stage 73.

## Persistence and concurrency

Kind: `PRIMARY_FABRIC_PREPARATION`.

The completed record is project- and calculation-scoped and contains:

- deterministic identity;
- direct Stage 72 predecessor identity;
- Stage 65 plan/progress and step identities, fingerprints, and revisions;
- Stage 72 progress/state/snapshot identities, fingerprints, revisions, and the complete Stage 72 source binding;
- the three user-provided answers with provenance;
- known practical context;
- optimistic domain revision `1`;
- one operation receipt with UUID-v7 ID and payload fingerprint;
- canonical timestamps and record fingerprint.

The record is immutable. Exact replay is idempotent. Reusing an operation ID with different input, writing a different completed record, or submitting from a stale project revision fails closed. Repository writes use the existing per-project serializer and calculation-progress storage architecture.

## Route and navigation

Production route:

`/project-primary-fabric-preparation?project=<uuid-v7>`

After valid Stage 72 `TARGET_REACHED`, `/saved-projects` and the user workspace resolve to this route. Once Stage 73 exists, they continue to resolve to the same record. They must not route back to ordinary Stage 71/72 work. Invalid Stage 73 or a corrupted Stage 72 tail produces a blocked projection.

Local manual fixture:

`/static/stage73-happy-path-fixture.html`

The fixture creates Stage 60–71 through the existing fixture chain, creates/completes Stage 72 through production domain/repository APIs with `5.1 cm`, verifies `TARGET_REACHED`, verifies Stage 73 is absent, and opens the production Stage 73 route.
