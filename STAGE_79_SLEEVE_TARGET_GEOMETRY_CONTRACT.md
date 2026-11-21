# Sleeve Target Geometry and Construction Contract v1

Date: 2026-08-08
Status: **SPECIFICATION READY; PRODUCTION STAGE 79 NOT CREATED**

This document closes the architecture specification requested by
`STAGE_79_ARCHITECTURE_FINDING.md`. It defines the future immutable planning contract,
not a route, screen, repository method, fixture, execution plan extension, or physical
sleeve execution record.

Normative key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, and **MAY** are used
literally. A production implementation is forbidden from weakening a MUST into a default
or an assumption.

## 1. Contract purpose and boundary

`SLEEVE_TARGET_GEOMETRY_AND_CONSTRUCTION_CONTRACT_V1` owns the intended geometry and
construction of the two matching sleeves immediately before sleeve execution
preparation. It binds current authoritative sources, collects only missing finished
targets, resolves construction policy, binds each fabric zone to applicable gauge,
derives a reviewable discrete taper schedule, and freezes the result after explicit user
confirmation.

It has five strictly separated partitions.

### A. User-confirmed target data

- finished relaxed cuff-edge circumference after the intended finishing state;
- finished upper-sleeve circumference at the underarm joining boundary, before any
  underarm stitches are removed or held;
- finished cuff-edge-to-underarm length measured along the underarm line;
- an override only when the user rejects an inherited construction value;
- explicit confirmation of the complete review snapshot.

### B. Derived target data

- admissible cuff and upper working counts, achieved circumferences, and deviations;
- target cuff height and usable main-sleeve shaping length;
- planned main-sleeve rounds;
- total stitch change, paired-event count, eligible rounds, and exact event schedule;
- the resulting stop condition for sleeve execution preparation;
- observed upper-sleeve ease, calculated only as a report from the direct finished target
  minus the existing body measurement, never as a policy applied in reverse.

### C. Construction policy

- bottom-up, cuff-first, two matching sleeves for the selected joined-raglan topology;
- inherited-versus-overridden cuff and main pattern rules;
- the supported sleeve working method;
- transition and paired-increase placement policies;
- gauge applicability and joint rounding policy identities.

### D. Execution prerequisites

- current, non-conflicting Stage 61/63/65/70/73/75/76/77/78 sources;
- a current active calculation belonging to the same project;
- applicable gauge bindings for every geometrically controlled fabric zone;
- numeric repeat/phase constraints for patterns used in count or row selection;
- a unique or explicitly selected admissible rounding result;
- a completed immutable contract.

### E. Data that exists only after physical work

The following MUST NOT appear in this planning snapshot:

- whether either sleeve has been knitted;
- actual cast-on count, actual current/underarm count, or actual row count;
- actual cuff height, actual cuff-to-underarm length, or actual circumference;
- operation cursor, pause/resume position, rework result, or yarn consumption;
- stitches actually held at the underarm;
- body-to-sleeve joining result, combined-yoke count, or section balance.

The words `target`, `planned`, and `derived` are mandatory in semantics where confusion
with a physical result is possible. Completion means “geometry confirmed”, never “sleeve
completed”.

## 2. Repository evidence and authoritative semantics

The current chain establishes the following facts.

- `upperArm` is catalogued in the `body` group and described as the circumference of the
  widest upper arm measured without tape tension
  (`src/yarnai/static/project-details-experience.js:28-33`).
- `sleeveLength` is catalogued in the `garment` group and described as the desired length
  from shoulder point to sleeve edge
  (`src/yarnai/static/project-details-experience.js:38-41`).
- The saved Stage 60 fixture supplies `fit: regular`, `upperArm: 30`,
  `armholeDepth: 21`, and `sleeveLength: 57` as explicit project-detail inputs, then
  completes closure and initialization
  (`tests-js/stage60-to-65-saved-chain.cjs:21-27,59-70`).
- Stage 61 preserves body and garment measurements in separate maps and binds them to
  the completed Stage 60 identity/fingerprints
  (`src/yarnai/static/project-initialization.js:183-209,231-272`).
- Stage 63 records the confirmed 20 stitches and 28 rows over 10 cm fixture measurement
  and user attestations such as same yarn/tools/pattern
  (`tests-js/stage60-to-65-saved-chain.cjs:72-83`). The record has identity,
  confirmation key, fingerprint, source initialization, and exact computed gauge
  (`src/yarnai/static/swatch-gauge.js:15-20,144-155,225-264`).
- The fixture's Stage 63 source does not supply immutable yarn, tool, technique, pattern,
  or knitting-mode identities. `samePattern` is an attestation to the then-current
  project, not proof that the swatch represents both future stockinette and future ribbing
  (`tests-js/stage60-to-65-saved-chain.cjs:72-82` and
  `src/yarnai/static/swatch-gauge.js:175-188`).
- Stage 64 defines a nearest-whole-stitch half-up primitive, but its result is a
  `garment_detail_width`, not a sleeve count
  (`src/yarnai/static/project-calculation-entry.js:8-13,18-22,220-250`).
- Stage 65 intentionally contains only `CAST_ON`, `FOUNDATION_SECTION`, and
  `PRIMARY_FABRIC` for the body when construction is unknown. Sleeves, shaping, and
  joining are omitted
  (`src/yarnai/static/project-execution-plan.js:189-197,222-252`).
- Stage 70's working method, rib pattern, height, and tool belong to the executed body
  foundation. The current fixture confirms `rib_1x1`, `in_round`, and a 5 cm body
  foundation (`src/yarnai/static/stage70-happy-path-fixture.js:240-260` and
  `src/yarnai/static/stage71-happy-path-fixture.js:21`).
- Stage 73 stores the body primary-fabric pattern/repeat as user-provided, source-bound
  values. The current fixture uses stockinette in the round
  (`src/yarnai/static/primary-fabric-preparation.js:9-21,129-140` and
  `src/yarnai/static/stage74-happy-path-fixture.js:16`).
- Stage 76 carries sleeve length and gauge as known context, but its body
  `workingMethod` comes from Stage 70 and its 41 cm armhole start is explicitly
  conditional information (`src/yarnai/static/project-next-section-planning.js:136-169`).
- Stage 77 fixes the topology: body and sleeves are made separately, then joined at the
  underarm for a raglan yoke
  (`src/yarnai/static/project-construction-strategy-planning.js:33-62,120-142`). It does
  not say that the body method automatically scopes to sleeves.
- Stage 78 v2 fixes post-join raglan shaping and stops with
  `blocked_on_prerequisites`, `newPlan = null`
  (`src/yarnai/static/project-shaping-policy-planning.js:10-48,79-88,118-140`). It does
  not define cuff-to-underarm sleeve increases.

### 2.1. Meaning of the existing 30 cm

`30 cm` is an authoritative, user-confirmed **body measurement** at the widest upper
arm. It is not a finished sleeve target. `fit = regular` is only a categorical garment
intent. No versioned numeric rule maps that category to sleeve ease, and repository search
finds no sleeve-ease policy.

Therefore the contract MUST retain:

```text
referenceMeasurements.upperArmBodyCircumferenceCm = 30
referenceMeasurements.upperArmSemanticRole = "body_measurement"
```

It MUST NOT calculate a finished upper-sleeve circumference from 30 cm. After the user
directly confirms the finished upper target, the contract MAY report
`observedUpperSleeveEaseCm = upperTarget - 30`; that report does not create a reusable
ease policy.

### 2.2. Meaning and insufficiency of the existing 57 cm

`57 cm` is an authoritative finished-garment target from shoulder point to cuff edge. A
bottom-up sleeve tube stops at the underarm joining boundary. Shoulder-to-cuff length,
underarm-to-cuff length, and vertical armhole depth are different measurement paths.

The contract MUST NOT derive `cuffToUnderarmLengthCm` as `57 - 21`, or by any other
unversioned geometric shortcut. It retains both 57 cm and 21 cm as reference measurements
but collects cuff-edge-to-underarm length directly until a separate verified body-to-
sleeve geometry model exists.

## 3. Minimum genuinely missing user data

For the current authoritative project and V1's nondecreasing, evenly distributed sleeve
profile, exactly three numeric finished targets are genuinely missing:

1. `cuffTargetCircumferenceCm` — relaxed finished circumference at the cuff edge;
2. `upperSleeveTargetCircumferenceCm` — relaxed finished circumference immediately
   before the underarm joining boundary;
3. `cuffToUnderarmLengthCm` — finished distance from cuff edge to that boundary along the
   underarm line.

They are collected in that order. The first question remains the cuff question established
by the architecture finding.

The following are not mandatory V1 inputs:

| Potential input | V1 decision |
|---|---|
| Wrist body circumference | Do not ask. Direct cuff finished target is sufficient and no wrist-ease policy exists. |
| Elbow circumference/target | Do not ask for the V1 single-zone evenly tapered profile. It becomes required only for a future multi-zone/elbow-shaped profile. |
| Sleeve ease | Do not ask in addition to a direct upper finished target. No existing sleeve-ease policy is invented. |
| Cuff height | Inherit the confirmed 5 cm body-foundation height as a transparent default; collect only on override. |
| Cuff pattern | Inherit the confirmed `rib_1x1` body-foundation pattern as a transparent default; collect only on override. |
| Main sleeve pattern | Inherit Stage 73's confirmed body primary pattern/repeat; collect only on override. |
| Sleeve working method | V1 construction policy resolves it to `in_round`; it is not a singleton question. Flat construction is outside V1. |
| Increase placement/style | V1 policy resolves a mirrored +2 pair flanking beginning of round; collect only for a future supported override. |

Two non-numeric user acts may still be required:

- gauge applicability attestation for a legacy source whose technical identities do not
  deterministically prove applicability, or completion of a new zone-specific swatch;
- explicit confirmation of the final review fingerprint (and of a rounding candidate if
  the canon returns an unresolved tie).

These are confirmations, not additional body or garment measurements.

## 4. Construction policy V1

### 4.1. Pattern inheritance and override

V1 establishes `sleeve-pattern-inheritance-policy:v1`:

1. The proposed main sleeve pattern and repeat are copied from the current completed
   Stage 73 snapshot.
2. The proposal is labelled `inherited_from_confirmed_body_primary_fabric`, displayed in
   review, and covered by the final explicit confirmation.
3. No separate question is shown when the user accepts the proposal.
4. A user-requested override MUST name a supported immutable pattern identity, horizontal
   and vertical repeat/phase rules, and applicable main-zone gauge. Free text without
   those technical semantics cannot complete the contract.
5. An override creates source-bound user data; it never mutates Stage 73.

For the current chain this resolves to stockinette in the round with the exact Stage 73
text retained for provenance. A production implementation MUST use a numeric repeat
contract rather than parse arithmetic from the display text.

### 4.2. Cuff contract

V1 establishes `sleeve-cuff-inheritance-policy:v1`:

- proposed cuff pattern: Stage 70's confirmed `rib_1x1`;
- proposed cuff height: the confirmed 5 cm body-foundation target;
- target location: relaxed finished circumference at the outer cuff edge after the same
  finishing state represented by the cuff gauge;
- construction: cast on the derived cuff count, join in the round without a seam/edge
  allowance, work the confirmed rib pattern to the physical 5 cm target, then change to
  the main pattern without changing the stitch count;
- override: allowed before review, but requires a supported pattern/repeat, height greater
  than zero, transition rule, and applicable gauge.

The inherited body cuff values are not silently promoted as historical sleeve facts. They
become sleeve policy only through this versioned inheritance rule and the Stage 79 review
confirmation.

Ribbing and stockinette are distinct fabric zones. Unless their pattern identities and
measured contexts are identical, one gauge record MUST NOT be used for both zone bindings.
V1 has no ribbing contraction or elasticity coefficient and MUST NOT invent one.

### 4.3. Working method

V1 establishes `sleeve-working-method-policy:joined-raglan-in-round:v1`:

- value: `in_round`;
- rationale: it is compatible with the selected cuff-up joined-raglan topology, retains
  live tube stitches for the later join, and avoids uncontracted seam/edge allowances;
- provenance: construction policy, supported by Stage 76 bottom-up direction, Stage 77
  topology, and the current in-round project technique;
- UI: disclosed in review, not presented as a one-option selector;
- override: `flat_then_seamed` is not supported by V1. Supporting it requires a separate
  versioned method with seam consumption, edge stitches, pattern conversion, tool/gauge
  context, and live-stitch join semantics.

This is a new explicit V1 construction policy, not a claim that Stage 70 already selected
the sleeve method.

### 4.4. Shaping profile and increase style

V1 supports these profiles, derived from direct finished endpoint targets:

- `nondecreasing_even_taper` when upper target is greater than cuff target;
- `straight_endpoint_profile` when the two direct targets are equal and a structurally
  valid count pair exists;
- a target with upper circumference below cuff circumference is a valid possible design
  in knitting, but is `UNSUPPORTED_REVERSE_TAPER_V1`, not “invalid knitting”. It requires
  another profile contract.

For positive stitch change V1 uses
`paired-mirrored-increase-flanking-bor:v1` with technique identity
`increase-technique:mirrored-lifted-pair:v1`: one event changes the total by exactly +2,
with one lifted increase leaning in each direction on opposite sides of the
beginning-of-round lane. These are construction-policy identities, not Stage 78 yoke
operations. The future preparation maps these exact identities to verified instruction
text; it may not choose a different technique.

## 5. Gauge applicability contract

### 5.1. Required zone bindings

`gaugeBindings` contains separate `cuff` and `main` bindings. Each binding references a
confirmed gauge record by record identity, confirmation key, record fingerprint, source
context fingerprint, exact stitch/row values, and finishing state.

The main binding controls upper count and main-sleeve rows. The cuff binding controls cuff
count. Cuff row gauge is required only when a numeric cuff-row orientation or vertical
phase is emitted; the authoritative cuff stop remains its physical height.

### 5.2. Deterministic reuse

An existing gauge is reusable without a new user question only when all of the following
immutable identities match the selected zone:

- project and current initialization;
- yarn and, when available, batch;
- tool type and size;
- pattern identity and repeat version;
- `in_round` working mode;
- finishing/measurement state;
- gauge record identity, confirmation key, and fingerprint.

The match yields `applicability.mode = deterministic_identity_match` and stores the
fingerprint of the compared context tuple.

### 5.3. Legacy explicit attestation

The current fixture's Stage 63 record lacks enough technical identities for deterministic
reuse. V1 MAY accept `explicit_legacy_context_attestation` for one zone when the user
explicitly confirms that the exact bound record was made with the same project yarn,
tool/size, selected pattern, in-round mode, and finishing state. The attestation is bound
to the full proposed zone-context fingerprint and becomes stale if any member changes.

An attestation cannot make one physical swatch represent two different patterns. With the
inherited rib cuff and stockinette main fabric, two pattern-specific bindings are required.
If only one is available, the contract stays collecting/blocked until the other confirmed
zone gauge exists or the user selects a supported same-pattern cuff override.

If yarn, tool, pattern, mode, or processing differs and no zone-specific confirmed swatch
exists, the result is `GAUGE_NOT_APPLICABLE`; Stage 79 cannot complete.

## 6. Sleeve taper mathematics

### 6.1. Existing canon that is reused

The following is already normative:

- preserve full precision and round only after forming the admissible set:
  `KNITTING_MATH_CANON.md:607-620`;
- select by semantic direction and structural constraints:
  `KNITTING_MATH_CANON.md:622-675`;
- convert height independently and respect vertical repeat/phase:
  `KNITTING_MATH_CANON.md:677-687`;
- distribute remainder with neighboring integer intervals:
  `KNITTING_MATH_CANON.md:689-710`;
- expose physical deviations and diagnostic tolerance:
  `KNITTING_MATH_CANON.md:712-724`;
- preserve exact stitch balance and integral event count:
  `KNITTING_MATH_CANON.md:883-912`;
- distribute events through eligible rows, not blindly through all rows:
  `KNITTING_MATH_CANON.md:928-941`;
- retain visual-operation identity and pattern integration:
  `KNITTING_MATH_CANON.md:961-970`.

The current general calculation engine is not the sleeve taper engine. Its V1 scope
explicitly excludes increases, intervals, sleeves, joined parts, and construction
instructions (`CALCULATION_ENGINE_SPEC.md:1003-1028`). Production code MUST NOT call it
as though it returned this complete contract.

### 6.2. Variables

```text
Cc  = direct finished cuff-edge target, cm
Cu  = direct finished upper-sleeve target at underarm, cm
Lu  = direct cuff-edge-to-underarm target length, cm
Hc  = cuff target height, cm
gsc = applicable cuff stitch gauge, stitches/cm
gsm = applicable main stitch gauge, stitches/cm
grm = applicable main row gauge, rounds/cm
Pc  = cuff horizontal repeat constraint
Pm  = main horizontal repeat constraint
Qm  = main vertical repeat/ending-phase constraint
Nc  = selected planned cuff/cast-on count
Nu  = selected planned full sleeve count at underarm before allocation
T   = selected planned main-sleeve rounds after cuff and before underarm stop
M   = paired increase-event count
```

All densities use the exact confirmed per-centimeter values. Display values such as
20/10 and 28/10 are not repeatedly rounded intermediates.

### 6.3. Endpoint count candidates

Raw values:

```text
xc = Cc * gsc
xu = Cu * gsm
```

Build positive integer candidate sets `Ac` and `Au` from the nearest lower and upper
counts that satisfy their zone's repeat/phase/fixed-stitch rules. For V1 in-round sleeves
there are no seam or edge stitches. `rib_1x1` requires an even cuff count. Stockinette in
the round has horizontal repeat 1.

Build joint candidates:

```text
P = {(c,u) | c in Ac, u in Au, u >= c, (u - c) mod 2 = 0}
```

`u >= c` is a V1 profile limitation, not a universal knitting invariant. The parity rule
follows from the selected +2 event identity.

For each pair calculate:

```text
plannedCuffCm  = c / gsc
plannedUpperCm = u / gsm
ec = abs(plannedCuffCm  - Cc)
eu = abs(plannedUpperCm - Cu)
score = (max(ec, eu), ec + eu)
```

Reject candidates that violate an explicit project tolerance. Otherwise rank
lexicographically by `score`. A unique minimum is selected. If multiple structurally
different pairs have the identical minimum score, retain all and require explicit user
selection; no hidden tie-breaker is allowed. Always store raw values, candidate list,
selected pair, planned sizes, signed errors, and the policy identity
`joint-sleeve-endpoint-rounding:v1`.

If `P` is empty, or every pair is outside the accepted decision boundary, the result is
`TARGET_IMPOSSIBLE_UNDER_CURRENT_CONSTRAINTS`; do not round an event count.

### 6.4. Shaping length and rows

```text
shapingLengthCm = Lu - Hc
y = shapingLengthCm * grm
```

`Lu > Hc` is required. Select `T` from the nearest admissible integer rounds satisfying
`Qm` and the required stop-side/phase. Use the canon's neutral-length direction, return
both candidates on an unresolved structural tie, and store:

- raw `y`;
- chosen `T`;
- `plannedShapingLengthCm = T / grm`;
- signed/absolute deviation from `shapingLengthCm`.

The physical execution stop remains the measured cuff-edge-to-underarm target plus the
planned count checkpoint. `T` is the planned schedule axis, not proof of achieved length.

### 6.5. Event count and eligible rounds

```text
totalIncreaseStitches = Nu - Nc
M = totalIncreaseStitches / 2
```

Both values MUST be nonnegative integers. For `M = 0`, the event schedule is empty.

For `M > 0`, build an ordered list `A` of pattern-eligible main rounds. V1 excludes:

- round 1, reserved for the cuff-to-main transition without shaping;
- round `T`, reserved as the underarm stop/joining-boundary guard;
- any round forbidden by the main pattern phase or another explicitly bound operation.

For current stockinette in the round, `A = [2, 3, ..., T - 1]`. Require `M <= |A|`.
This ensures that the last increase cannot fall on the later underarm joining boundary.

### 6.6. Exact distribution proposal

The generic canon defines even distribution but does not define a versioned sleeve
endpoint algorithm. The following is the exact proposed canon addition
`bottom-up-sleeve-taper-distribution:v1`:

For event ordinal `i` in `1..M`, select zero-based eligible index

```text
j_i = floor(((2 * i - 1) * |A|) / (2 * M))
eventRound_i = A[j_i]
```

This places one event nearest the center of each of `M` equal cells over the eligible
round list. Because `M <= |A|`, indices are strictly increasing. A half-cell tie selects
the later eligible round and records `cellCenterTieDirection = later`; this is product
policy and MUST be disclosed. The stored schedule contains event ordinal, round from main
start, +2 delta, placement/technique identity, and preceding/following interval lengths.

Required proofs:

```text
Nc + sum(event.deltaStitches) = Nu
sum(event.deltaStitches) = 2 * M
1 < every eventRound < T
event rounds are unique, ordered, and members of A
max neighboring eligible-index interval - min interval <= 1 where mathematically possible
```

This algorithm, the joint endpoint selection rule, and the transition/boundary guards are
the precise canon gap. They MUST be promoted to `KNITTING_MATH_CANON.md` (or an equally
authoritative versioned specialized canon) before production Stage 79 implements them.
The specification is complete; the current general engine is not silently extended here.

## 7. Formal rounding policy

The contract stores these identities and full traces:

| Conversion | Policy |
|---|---|
| cm to cuff stitches | Exact `Cc * gsc`; build cuff-repeat candidates; no intermediate rounding. |
| cm to upper stitches | Exact `Cu * gsm`; build main-repeat candidates; no intermediate rounding. |
| Endpoint parity | Select a joint pair whose difference is divisible by +2; never round `M`. |
| Cuff repeat | `rib_1x1` count is divisible by 2; overrides supply their own numeric constraint. |
| Main repeat | Count satisfies the bound horizontal repeat/fixed stitches. |
| cm to main rounds | Exact `(Lu - Hc) * grm`; select an integer satisfying vertical phase. |
| Structural tie | Return candidates and require explicit confirmation. |
| Back conversion | Store count/gauge or rows/gauge physical size and signed deviation. |
| Event intervals | Use `bottom-up-sleeve-taper-distribution:v1`; never use a single rounded average cadence. |

`Math.round` without one of these semantic identities is forbidden. The Stage 64
`nearest-whole-stitch-half-up-v1` primitive may generate an unconstrained neighboring
candidate, but it cannot replace joint repeat/parity selection.

## 8. Versioned schema

The normative logical shape is below. `DecimalString` is a canonical non-exponential
base-10 string; it avoids JSON binary-float ambiguity in fingerprints. `Fingerprint` is
the repository's canonical fingerprint form. Exact field allowlists are required at every
object level.

```ts
type SleeveTargetGeometryAndConstructionContractV1 = {
  schemaId: "SLEEVE_TARGET_GEOMETRY_AND_CONSTRUCTION_CONTRACT_V1";
  contractVersion: 1;
  kind: "SLEEVE_TARGET_GEOMETRY_PLANNING";
  identity: string;
  projectId: UuidV7;
  calculationId: UuidV7;
  epoch: PositiveInteger;
  lifecycle: "completed";

  sourceBindings: {
    stage61: ImmutableSourceBinding;
    stage63GaugeHistory: ImmutableSourceBinding;
    stage65: ImmutableSourceBinding;
    stage70: ImmutableSourceBinding;
    stage73: ImmutableSourceBinding;
    stage75: ImmutableSourceBinding;
    stage76: ImmutableSourceBinding & { snapshotVersion: 1 };
    stage77: ImmutableSourceBinding & { snapshotVersion: 1 };
    stage78: ImmutableSourceBinding & { snapshotVersion: 2 };
    sourceBindingFingerprint: Fingerprint;
  };

  referenceMeasurements: {
    upperArmBodyCircumferenceCm: DecimalString;
    upperArmSemanticRole: "body_measurement";
    shoulderPointToCuffLengthCm: DecimalString;
    shoulderPointToCuffSemanticRole: "finished_garment_reference";
    armholeDepthCm: DecimalString;
    armholeDepthSemanticRole: "body_vertical_measurement";
  };

  confirmedTargets: {
    cuffTargetCircumferenceCm: ConfirmedDecimal;
    cuffTargetLocation: "relaxed_finished_outer_cuff_edge";
    upperSleeveTargetCircumferenceCm: ConfirmedDecimal;
    upperTargetLocation: "full_sleeve_tube_at_underarm_before_allocation";
    cuffToUnderarmLengthCm: ConfirmedDecimal;
    lengthMeasurementPath: "outer_cuff_edge_to_underarm_boundary_along_underarm_line";
  };

  construction: {
    direction: PolicyValue<"bottom_up">;
    componentDirection: PolicyValue<"cuff_up">;
    topologyIdentity: "construction-strategy:body-sleeves-joined-raglan:v1";
    quantity: 2;
    pairSymmetry: "identical_unless_future_explicit_asymmetry_contract";
    workingMethod: PolicyValue<"in_round">;
    mainPattern: PatternBinding;
    cuff: {
      pattern: PatternBinding;
      targetHeightCm: DecimalString;
      heightOrigin: "inherited_stage70" | "user_override";
    };
    transition: {
      identity: "cuff-to-main-same-count-pattern-change:v1";
      shapingAllowed: false;
      mainRound: 1;
    };
    profile: "nondecreasing_even_taper" | "straight_endpoint_profile";
    increasePolicy: {
      identity: "paired-mirrored-increase-flanking-bor:v1";
      deltaPerEvent: 2;
      placementLane: "both_sides_of_beginning_of_round";
      techniqueIdentity: "increase-technique:mirrored-lifted-pair:v1";
    };
  };

  gaugeBindings: {
    cuff: ZoneGaugeBinding;
    main: ZoneGaugeBinding;
  };

  derivedGeometry: {
    endpointSelectionPolicy: "joint-sleeve-endpoint-rounding:v1";
    rawCuffStitches: DecimalString;
    rawUpperStitches: DecimalString;
    candidatePairs: readonly EndpointCandidatePair[];
    selectedCandidateKey: string;
    cuffTargetStitches: PositiveInteger;
    upperSleeveTargetStitches: PositiveInteger;
    plannedCuffCircumferenceCm: DecimalString;
    plannedUpperCircumferenceCm: DecimalString;
    cuffDeviationCm: DecimalString;
    upperDeviationCm: DecimalString;
    observedUpperSleeveEaseCm: DecimalString;
    shapingLengthCm: DecimalString;
    rawShapingRows: DecimalString;
    shapingRows: PositiveInteger;
    plannedShapingLengthCm: DecimalString;
    shapingLengthDeviationCm: DecimalString;
    totalIncreaseStitches: NonNegativeInteger;
    increaseEventCount: NonNegativeInteger;
    eligibleIncreaseRounds: readonly PositiveInteger[];
    increaseDistribution: {
      policyIdentity: "bottom-up-sleeve-taper-distribution:v1";
      cellCenterTieDirection: "later";
      events: readonly IncreaseEvent[];
    };
    stopCondition: {
      targetLengthCm: DecimalString;
      plannedFullTubeStitches: PositiveInteger;
      holdOrRemoveUnderarmStitches: false;
      physicalConfirmationRequiredLater: true;
    };
  };

  provenance: {
    fieldSources: Readonly<Record<string, FieldProvenance>>;
    policyVersions: readonly string[];
    mathCanonVersion: string;
    mathCanonFingerprint: Fingerprint;
  };

  confirmations: {
    inheritedConstructionReviewed: true;
    gaugeApplicabilityEvidence: readonly GaugeApplicabilityEvidence[];
    roundingCandidateConfirmation: null | ExplicitConfirmation;
    finalReview: ExplicitConfirmation & { reviewFingerprint: Fingerprint };
  };

  supersession: {
    supersedesIdentity: null | string;
    reason: null | string;
  };
  timestamps: { createdAt: IsoUtc; completedAt: IsoUtc };
  audit: { event: "SLEEVE_TARGET_GEOMETRY_CONFIRMED"; operationId: UuidV7 };
  fingerprint: Fingerprint;
};
```

Supporting types:

```ts
type ImmutableSourceBinding = {
  repositoryRecordId: string;
  repositoryRevision: PositiveInteger;
  domainIdentity: string;
  domainFingerprint: Fingerprint;
  snapshotFingerprint: Fingerprint;
};

type ConfirmedDecimal = {
  value: DecimalString;
  unit: "cm";
  semanticRole: "finished_garment_target";
  provenance: "user_entered_at_stage_79";
  confirmedAt: IsoUtc;
};

type PolicyValue<T extends string> = {
  value: T;
  policyIdentity: string;
  origin: "construction_policy" | "inherited_confirmed_source" | "user_override";
};

type PatternBinding = {
  identity: string;
  sourceIdentity: string;
  sourceFingerprint: Fingerprint;
  displayValue: string;
  horizontalRepeat: PositiveInteger;
  fixedWorkingStitches: NonNegativeInteger;
  verticalRepeat: PositiveInteger;
  endPhase: string;
  origin: "inherited_stage70" | "inherited_stage73" | "user_override";
};

type ZoneGaugeBinding = {
  zone: "cuff" | "main";
  gaugeRecordIdentity: string;
  gaugeConfirmationKey: Fingerprint;
  gaugeRecordFingerprint: Fingerprint;
  gaugeSourceContextFingerprint: Fingerprint;
  stitchesPerCmExact: DecimalString;
  rowsPerCmExact: DecimalString;
  finishingState: string;
  boundFabricContext: {
    yarnIdentity: string;
    toolIdentity: string;
    patternIdentity: string;
    workingMethod: "in_round";
  };
  applicability: {
    mode: "deterministic_identity_match" | "explicit_legacy_context_attestation";
    evidenceFingerprint: Fingerprint;
  };
};

type EndpointCandidatePair = {
  key: string;
  cuffStitches: PositiveInteger;
  upperStitches: PositiveInteger;
  totalIncreaseStitches: NonNegativeInteger;
  plannedCuffCm: DecimalString;
  plannedUpperCm: DecimalString;
  cuffSignedErrorCm: DecimalString;
  upperSignedErrorCm: DecimalString;
  structurallyValid: boolean;
  toleranceZone: "normal" | "warning" | "decision" | "rejected";
};

type IncreaseEvent = {
  ordinal: PositiveInteger;
  mainRound: PositiveInteger;
  deltaStitches: 2;
  resultingStitchCount: PositiveInteger;
  techniqueIdentity: "increase-technique:mirrored-lifted-pair:v1";
  placementPolicyIdentity: "paired-mirrored-increase-flanking-bor:v1";
};

type GaugeApplicabilityEvidence = {
  zone: "cuff" | "main";
  mode: "deterministic_identity_match" | "explicit_legacy_context_attestation";
  comparedContextFingerprint: Fingerprint;
  gaugeRecordFingerprint: Fingerprint;
  explicitConfirmation: boolean;
  confirmedAt: null | IsoUtc;
};

type ExplicitConfirmation = {
  operationId: UuidV7;
  confirmedAt: IsoUtc;
  explicit: true;
  payloadFingerprint: Fingerprint;
};

type FieldProvenance = {
  classification: "user_confirmed" | "inherited_confirmed_source" | "derived" | "construction_policy";
  sourceStage: string;
  sourceIdentity: string;
  sourceFingerprint: Fingerprint;
  formulaOrPolicyIdentity: null | string;
};
```

### 8.1. Deliberately excluded or renamed fields

- Ambiguous `sleeveLengthCm` is excluded. The schema uses
  `shoulderPointToCuffLengthCm` for the known 57 cm reference and
  `cuffToUnderarmLengthCm` for the executable tube length.
- `shapingPolicy` is not a scalar. Stage 78's yoke decrease policy is a source binding;
  pre-join sleeve shaping uses the separate V1 `increasePolicy` and distribution identity.
- `underarmAllocation`, held counts, combined-yoke count, and actual values are excluded.
- `cuffHeightRows` is not authoritative in V1. The cuff stop is physical height; a future
  orientation estimate may be derived only with cuff row gauge and must be labelled
  planned/estimated.

## 9. Field source bindings and validation

| Schema field/group | Authoritative source | Classification | Required validation |
|---|---|---|---|
| `projectId` | Repository project record | Bound identity | UUID v7; equals every Stage 61/63/65/70/73/75/76/77/78 project identity. |
| `calculationId` | Current repository `active_calculation_id` | Bound identity | UUID v7; equals every calculation-scoped predecessor. |
| Stage source bindings | Current repository progress/history records | Bound immutable evidence | Single authoritative non-deleted, non-quarantined, non-conflicting record; revision and fingerprints validate. |
| Upper arm 30 cm | Stage 61 initialized body measurement, transitively Stage 60 | User-confirmed reference | Positive; semantic path is `measurements.body.upperArm`; Stage 61 and closure fingerprints match. |
| Shoulder-to-cuff 57 cm | Stage 61 initialized garment measurement | User-confirmed reference | Positive; semantic path is `measurements.garment.sleeveLength`; never used as `Lu`. |
| Armhole depth 21 cm | Stage 61 initialized body measurement | User-confirmed reference | Positive; semantic path is `measurements.body.armholeDepth`; never subtracted from 57 without a model. |
| Three confirmed targets | Future Stage 79 collection | User-confirmed target | Canonical decimal cm, finite, positive, semantic locations exact, provenance and timestamps present. |
| Direction/topology | Stage 76 + Stage 77 | User-confirmed predecessor policy | `bottom_up`; exact joined-raglan identity; predecessor binding current. |
| Stage 78 yoke policy | Stage 78 v2 | User-confirmed predecessor policy | Completed v2; valid selected policy; exact corrected blocked outcome and source binding. |
| Working method | V1 policy plus Stage 76/77 context | Construction policy | Exact policy identity and `in_round`; no flat edge/seam data. |
| Main pattern | Stage 73 or supported override | Inherited/user override | Source state identity/fingerprint; numeric repeat/phase contract; selected gauge pattern matches. |
| Cuff pattern/height | Stage 70 or supported override | Inherited/user override | Completed state identity/fingerprint; positive height; numeric repeat; selected cuff gauge matches. |
| Gauge bindings | Current Stage 63 history or new confirmed zone records | User-confirmed technical evidence / deterministic match | Record validation, current initialization, exact technical-context evidence, applicable zone, positive exact axes. |
| Counts/deviations | Section 6 endpoint algorithm | Derived | Recompute from exact targets/gauges/constraints; selected candidate exists and fingerprint matches. |
| Rows/length deviation | Section 6.4 | Derived | Recompute; integer `T > 0`; main row gauge and phase current. |
| Event count/schedule | Sections 6.5-6.6 | Derived | Exact balance, integral +2 events, unique eligible rounds, no boundary event. |
| Provenance/policy versions | All inputs and this specification | Derived metadata | Complete field-source coverage; recognized version identities; canon fingerprint current. |
| Confirmations | Future Stage 79 audit | User confirmation | Confirmation targets exact review fingerprint; operation id/timestamp valid. |
| Contract fingerprint | Canonical semantic payload | Derived integrity | Recomputed after excluding only the fingerprint field; exact match. |

### 9.1. Fail-closed assessment

Before draft creation, resume, review, and completion, a future implementation MUST:

1. materialize the current authoritative chain through real validators;
2. require exactly one current Stage 76, 77, and 78 record for the active calculation;
3. call each predecessor's `validateProgressState` and `validateBinding` against a fresh
   assessment;
4. require Stage 78 version 2 and its unchanged `blocked_on_prerequisites` outcome;
5. validate Stage 61 measurement identity/fingerprint and current Stage 63 gauge history;
6. validate Stage 65 plan and Stage 70/73/75 source bindings;
7. compare project id, active calculation id, repository revisions, domain identities,
   snapshot/source fingerprints, technical gauge context, and math-canon fingerprint;
8. block on any mismatch before returning target questions or derived values.

Changed measurements produce a new/stale initialization/calculation binding; changed
gauge produces a new/stale gauge binding. Neither may be patched into a completed
contract. A superseding epoch is required.

Stage 78 legacy v1 MAY be parsed only to produce `LEGACY_STAGE78_REQUIRES_V2`; it cannot
complete this V1 sleeve contract because it lacks the corrected prerequisite boundary.
No immutable legacy snapshot is rewritten.

## 10. Lifecycle and idempotency

Assessment lifecycle and persisted lifecycle are distinct.

```text
assessment blocked
  OR
ready_to_collect
  -> collecting (only while a genuine target/evidence is missing)
  -> reviewing (all inputs/evidence resolved; immutable reviewFingerprint built)
  -> completed (explicit confirmation of that exact reviewFingerprint)
```

Rules:

- If no persisted state exists and the source is valid, assessment returns the first
  missing item; it does not create a record merely by opening the future stage.
- Target order is cuff circumference, upper finished circumference,
  cuff-to-underarm length, then unresolved gauge evidence.
- Editing any target, override, gauge evidence, or candidate selection invalidates the
  review fingerprint and returns to `collecting`.
- `reviewing` is allowed only when all formulas can be recomputed and all invariants pass.
- `completed` is immutable. Corrections use a new epoch with `supersedesIdentity`; prior
  records and future executions bound to them remain intact.
- Repeating the same operation id with the same payload returns the same result.
- Reusing an operation id with a different payload is `OPERATION_ID_CONFLICT`.
- Repeating completion with the same source/input/review fingerprint is idempotent;
  attempting a conflicting second completed record for the same epoch is blocked.
- Reload/resume revalidates live sources before showing stored targets. A stale draft is
  not silently rebound.
- Completion does not create, extend, or replace the Stage 65/78 execution plan and does
  not navigate automatically into physical execution.

## 11. UX contract for the future stage

No UI is implemented by this task. The future UX contract is:

1. Ask in centimetres, not stitches:

   > Какой должна быть окружность рукава у манжеты?

   Help text defines it as the relaxed finished circumference at the outer cuff edge.

2. Then ask:

   > Какой должна быть готовая окружность рукава сверху, у линии подмышки?

   Show the existing 30 cm upper-arm body measurement as reference and explicitly say it
   is not the finished target.

3. Then ask:

   > Какой должна быть длина рукава от края манжеты до линии подмышки?

   Show 57 cm shoulder-to-edge length only as a differently measured reference; do not
   prefill or propose `57 - 21`.

4. Resolve gauge applicability. Ask for an attestation only when immutable technical
   identities cannot prove the match. If a pattern-specific gauge is missing, explain the
   exact zone mismatch and route conceptually back to swatch confirmation; do not offer a
   guessed coefficient.

5. Review only fields actually resolved by the contract:

   - the three direct targets and the 30/57/21 cm reference semantics;
   - cuff pattern and height, main pattern, and their inherited/override origins;
   - in-round cuff-up method and joined-raglan topology;
   - each zone gauge source and applicability evidence;
   - selected cuff/upper counts, achieved circumferences, and deviations;
   - shaping length/rounds, total +2 events, and the exact round schedule;
   - transition and stop condition;
   - warnings, unresolved tie selection, policy/canon versions, and source timestamp.

The confirmation action text should mean “Подтвердить план рукавов”, not “Рукава готовы”.
No single-option method selector is rendered.

## 12. Invariants V1

1. All project/calculation/source identities and fingerprints are current and mutually
   scoped.
2. `cuffTargetCircumferenceCm`, `upperSleeveTargetCircumferenceCm`, and
   `cuffToUnderarmLengthCm` are finite and greater than zero.
3. The 30 cm body measurement is never relabelled as a finished target.
4. The 57 cm shoulder-point length and 21 cm vertical armhole depth are never silently
   combined into cuff-to-underarm length.
5. For `nondecreasing_even_taper`, direct upper target is greater than direct cuff target.
   Equality selects the straight profile; a smaller upper target is unsupported by V1,
   not universally invalid.
6. `cuffToUnderarmLengthCm > cuff.targetHeightCm`; shaping length is positive.
7. Every geometrically used gauge is positive, current, zone-applicable, and bound to the
   selected yarn/tool/pattern/mode/finishing context.
8. A gauge record cannot represent two different pattern identities.
9. Counts and rounds are positive integers; raw/intermediate quantities remain exact
   decimals.
10. Cuff and upper counts satisfy their repeats/fixed stitches; in-round V1 adds no seam
    or edge stitches.
11. `upperCount >= cuffCount` and `(upperCount - cuffCount) mod 2 = 0` for the selected +2
    event policy.
12. `totalIncreaseStitches = upperCount - cuffCount = 2 * increaseEventCount`.
13. Each event is unique, in increasing order, changes +2, and occurs only on an eligible
    main round.
14. No event occurs on transition round 1 or underarm boundary guard round `T`.
15. `cuffCount + sum(event deltas) = upperCount` exactly.
16. Every planned count and row total is back-converted to physical size; deviations and
    tolerance zones are stored and reviewed.
17. A structured rounding tie is not selected without explicit candidate confirmation.
18. Pattern overrides cannot reuse stale/inapplicable gauge or omit repeat/phase rules.
19. Quantity is two and the planned pair is identical unless a future explicit asymmetry
    contract exists.
20. Stage 78's yoke policy is retained as source context but is not applied to pre-join
    sleeve increases.
21. No underarm allocation or combined-yoke count appears in V1.
22. No actual physical result or execution cursor appears in the planning snapshot.
23. Completed snapshots are immutable and append-only supersession preserves history.
24. The contract fingerprint covers every semantic field, source binding, policy version,
    candidate selection, and confirmation.

## 13. Output to sleeve execution preparation

A completed V1 contract gives the next preparation stage, without a new product
assumption:

- shared sleeve-pair contract identity/fingerprint and quantity two;
- cast-on count (`cuffTargetStitches`);
- cuff pattern identity, repeat, target height, working method, and physical stop;
- transition rule and main pattern identity/repeat;
- main/cuff gauge bindings and exact contexts;
- full pre-underarm target count (`upperSleeveTargetStitches`);
- total +2 events and exact increase rounds/placement/technique identity;
- cuff-edge-to-underarm target length, planned main rounds, and deviations;
- stop with the full tube count live; do not allocate/hold underarm stitches yet;
- all provenance, warnings, policy/canon versions, and review confirmation.

The next stage can therefore prepare sleeve 1 execution. It MUST NOT infer underarm held
stitches or joining instructions. Those remain a later join-preparation contract after
both sleeves and the body have authoritative physical results.

## 14. Future Stage 79 test specification

All numeric values in future tests are synthetic fixtures and MUST NOT become product
defaults or be presented as this user's choices.

| Area | Required cases and assertions |
|---|---|
| Happy path | Three explicit targets; inherited cuff/main/method; two applicable zone gauges; unique joint candidate; completed immutable snapshot; Stage 65/78 unchanged. |
| First question | With all current sources and no Stage 79 record, first missing item is cuff circumference; no record is created on open. |
| Invalid circumference | Empty, whitespace, zero, negative, non-finite, exponent/locale ambiguity outside canonical parser, over-limit value; no derived snapshot. |
| Invalid length | Zero/negative; cuff-to-underarm less than or equal to cuff height; no `57 - 21` fallback. |
| Unsupported profile | Upper target below cuff target returns `UNSUPPORTED_REVERSE_TAPER_V1`, not a fabricated decrease schedule. |
| Target impossible | No joint repeat/parity pair, all candidates outside decision tolerance, or more events than eligible rounds; block with candidate consequences. |
| Gauge mismatch | Wrong project/init, changed fingerprint, yarn/tool/pattern/mode/finishing mismatch, one gauge reused for rib and stockinette, missing row gauge for main shaping. |
| Legacy gauge | Complete technical identities derive applicability without a question; incomplete current legacy record requires exact attestation; changed bound tuple invalidates it. |
| Stale predecessor | Fresh Stage 76/77/78 assessment differs from stored binding; draft/review/completion all block. |
| Corrupted source | Unknown/missing keys, bad fingerprint, invalid revision, conflict/quarantine/imported-unproven flag, altered immutable snapshot. |
| Project mismatch | Any source/contract project differs from route/repository project. |
| Calculation mismatch | Active calculation changes or any predecessor/gauge belongs to another calculation. |
| Stage 78 compatibility | V2 corrected blocked outcome accepted; legacy V1 is read-only diagnosed and cannot complete; no predecessor mutation. |
| Endpoint exact | Raw counts integral and repeat-compatible; selected without deviation. |
| Half/count edge | Exact .5 with no structure follows declared primitive; structured equidistant pair returns both and requires explicit confirmation. |
| Pair parity | Independently nearest endpoints have odd delta; joint candidates choose/ask among same-parity alternatives; event count is never rounded. |
| Repeat edge | Rib evenness, main repeat, fixed stitches, and pair parity intersect; empty intersection blocks. |
| Row rounding | Exact row, lower/upper neighbor, vertical phase, structural tie, and back-converted deviation. |
| Distribution | M=0; M=1; M=|A|; nondivisible spacing; half-cell later tie; every event unique/eligible; first and last guards respected; exact final balance. |
| Idempotent repeat | Same operation id + same payload and same deterministic identity return same record/no extra epoch. |
| Conflicting repeat | Same operation id + different payload, or different completed content for one epoch, is rejected. |
| Immutable completed | Edit/update/delete-in-place rejected; correction appends a superseding epoch and preserves old fingerprint. |
| Review invalidation | Change target, pattern override, gauge evidence, source, or candidate after review clears review fingerprint and returns to collecting. |
| Reload/resume | Draft targets resume only after live source validation; stale draft stays blocked and is not rebound. |
| Planning/execution boundary | Schema rejects actual counts/lengths, completion flags, execution cursor, underarm allocation, joining result, and plan-extension fields. |
| Pair contract | Both sleeve preparations bind one shared completed contract; independent later physical histories do not mutate it. |

No route/UI/fixture/browser-acceptance tests are part of this specification pass. The
future production task should first implement pure domain and repository tests from this
matrix, then add presentation tests only when production Stage 79 is separately
authorized.

## 15. Closure decision

This specification resolves:

- the planning/execution boundary;
- the minimum direct targets and why 30/57/21 cm are insufficient for other semantics;
- pattern/cuff inheritance with explicit review and supported override gates;
- V1 in-round method without singleton UI;
- separate zone gauge applicability and legacy evidence;
- endpoint count, parity, row, event, and distribution rules;
- immutable schema, source binding, lifecycle, UX, invariants, output, and tests.

It deliberately does not create production Stage 79, extend the execution plan, allocate
underarm stitches, or implement physical sleeve work. The specialized taper algorithm is
specified exactly but remains a proposed canon addition; production is gated on promoting
and testing that normative addition.

Next concrete architecture step: add
`bottom-up-sleeve-taper-distribution:v1` and
`joint-sleeve-endpoint-rounding:v1` to `KNITTING_MATH_CANON.md` with pure calculation
tests, without creating production Stage 79.

SLEEVE TARGET GEOMETRY CONTRACT READY
