# Realized finishable edge evidence V1 architecture

## Verdict

The Stage 93 finding is confirmed: `NECKLINE_OPENING_PLAN_V3` plus
`NECKLINE_OPENING_EXECUTION_RESULT_V1` proves the executed action/state chain and terminal
live-stitch topology, but cannot prove a finishing-grade physical edge graph. In
particular, Stage 92 does not prove a non-overlapping neckline/polo zone partition,
ordered row-end/stitch units, corner ownership, or complete pickup coverage.

Automatic derivation therefore remains prohibited. Historical Stage 91/92 bytes remain
unchanged and readable. A historical current completed Stage 92 V1 becomes finishable only
after an explicit persisted physical-inventory completion.

## Chosen boundary

```text
kind:              PROJECT_REALIZED_FINISHABLE_EDGE_EVIDENCE
contract:          REALIZED_FINISHABLE_EDGE_EVIDENCE_CONTRACT_V1
result:            REALIZED_FINISHABLE_EDGE_EVIDENCE_V1
topology:          FINISHABLE_EDGE_TOPOLOGY_V1
output:            realized_finishable_edge_evidence_completed
successor:         PROJECT_NECKLINE_EDGE_FINISHING_PLANNING
```

This is a compatibility evidence boundary over one current completed Stage 92 V1 result,
not a Stage 91/92 migration and not Stage 93 planning. Native evidence for future new work
may still justify a Stage 91 V4 edge-creation ledger and Stage 92 V2 result, but it is not
required to preserve and explicitly inventory an already completed Stage 92 V1 garment.

## Evidence contract

The input is one versioned `physical_discrete_unit_inventory_v1` observation with:

- exactly one neckline opening and, when Stage 91 proves an opening feature, exactly one
  separate polo-opening graph;
- explicitly ordered segments and stable semantic keys;
- physical edge type, orientation, side, RS/WS relation, stitch state, stabilization
  policy, and pickup/reactivation capability per segment;
- two physically confirmed endpoint/corner anchors per segment;
- typed corners joining exactly two adjacent segments with one exclusive owner;
- ordered source units of type live stitch, held stitch, bound-off stitch, row end, or
  decrease transition;
- an immutable Stage 92 execution-step reference and discrete ordinal per source unit;
- one disposition per unit: pickup, reactivate, integrated/no-pickup, or intentionally
  excluded;
- explicit confirmation that all finishing-relevant units were inventoried and none were
  omitted.

Source-unit coordinates `(execution step, unit kind, source ordinal)` and semantic unit
keys are both globally unique. Different labels cannot conceal the same physical source
location. No tolerance or interval overlap is accepted.

## Normalized topology

`FINISHABLE_EDGE_TOPOLOGY_V1` is deterministically rebuilt from the validated inventory.
It retains declared physical order; it never sorts for presentation. It contains ordered
opening and segment identities, segment adjacency, anchors, corners, ordered owned source
units, discrete realized lengths, capability flags, exact ownership proof, and complete
coverage counts.

Corners are separate typed entities. A corner may connect two segments, but exactly one
incident segment owns its future pickup reservation. Source units are never shared in V1.

Geometry is discrete only. V1 does not infer centimetres from body/yoke gauge. It records
that finishing gauge is required by the successor, is not supplied here, and body-gauge
reuse is not authorized. A future Stage 93 strategy that needs measured path length must
require separate versioned measurement evidence; it cannot reconstruct it from Stage 92.

## Lifecycle and persistence

The lifecycle is minimal because historical garments need explicit observation:

```text
ready (derived, no write)
  -> collecting_edge_evidence
  -> reviewing_edge_evidence
  -> completed
```

Completion is immutable and recomputable. Writes reuse IndexedDB V4 and the existing
project/progress/operation/checkpoint transaction. They require UUIDv7 operations,
semantic replay fingerprints, optimistic project/repository/domain revisions, and an
exact current Stage 92 result/state binding. Conflicting UUID reuse and stale predecessor
bindings fail closed. No replacement epoch exists without a future explicit physical
reconciliation contract.

The presentation projection exposes counts, types, ordering, capabilities, coverage, and
corner presence. It does not expose repository revisions or execution-source coordinates.

## Stage 93 gate

The exported gate accepts only a state that is completed, current, authoritative,
fingerprint-valid, bound to the expected current Stage 92 result, and compatible with
result/topology version 1. Stage 93 production is intentionally absent and may not rebuild
physical edges from Stage 91/92.
