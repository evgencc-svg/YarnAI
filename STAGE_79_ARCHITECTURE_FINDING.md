# Stage 79 architecture finding: sleeve planning and execution boundary

Date: 2026-08-08  
Status: **STAGE 79 NOT READY**

## 1. Architecture finding

The genuine successor after completed Stage 78 is not yoke joining and not physical
sleeve execution. The next boundary has to establish an immutable, source-bound sleeve
construction and target-geometry contract. The repository proves that this boundary is
needed, but does not yet define it completely enough to create a production Stage 79.

The blocking distinction is:

1. Stage 76 selected `bottom_up`.
2. Stage 77 selected `construction-strategy:body-sleeves-joined-raglan:v1`: the body and
   two sleeves are made separately to the underarms and then form one raglan yoke.
3. Stage 78 selected the yoke shaping policy and correctly stops with
   `blocked_on_prerequisites` under planning contract v2.
4. None of those snapshots defines how a sleeve is started, its finished cuff and
   upper-arm geometry, its pre-join taper, its sleeve-specific working method/pattern,
   or the underarm allocation.

Therefore YarnAI cannot yet issue a cast-on count, row/round schedule, increase schedule,
or physical instruction for either sleeve. It also cannot calculate a join from the body
alone. A production screen that merely confirms “make two sleeves” would hide missing
fit and construction decisions.

No Stage 79 domain, service, repository method, route, UI, navigation branch, or fixture
was created.

## 2. Authoritative chain inspected

The finding was traced through the earliest surviving source and every relevant
successor, rather than treating the latest projection as a complete source:

| Boundary | What it proves | What it does not prove |
|---|---|---|
| Stage 60 details closure | User-confirmed project measurements and their provenance | Sleeve construction or executable sleeve targets |
| Stage 61 initialization | Immutable normalized measurements, including `upperArm` and `sleeveLength` | Wrist/elbow measurements, finished sleeve circumferences, cuff |
| Stage 63 gauge | Confirmed measured gauge: stitches and rows per 10 cm | Applicability to a particular sleeve method/cuff/pattern tuple |
| Stage 64 calculation | 100 stitches for a 50 cm `garment_detail_width` | A sleeve stitch calculation; its semantic role is explicitly not a sleeve |
| Stage 65 execution plan | `CAST_ON -> FOUNDATION_SECTION -> PRIMARY_FABRIC`; source-bound sizing and gauge context | Sleeve steps: `SHAPING`, `REPEAT_PART`, and `JOINING` are omitted |
| Stages 66–75 | Physical execution and measurement of the body foundation and primary fabric; Stage 75 reaches 30 cm | Body at the underarm, any sleeve, or any sleeve measurement |
| Stage 76 | `bottom_up`, body method `in_round`, sleeve length 57 cm, gauge 20/28, and informational armhole-start value 41 cm | Sleeve working method, target circumference, taper, cuff, or physical readiness at 41 cm |
| Stage 77 | Body and sleeves join at the underarm for a raglan yoke | Sleeve plan, underarm counts, or method of making each sleeve |
| Stage 78 v2 | User-confirmed raglan shaping policy; deterministic prerequisite blocking | Any new execution plan or executable sleeve geometry |

The production-valid Stage 78 fixture was also materialized through the real repository
and validators. Its relevant values match the contracts described below. Fixture values
demonstrate the chain; they are not defaults for other projects.

## 3. Full authoritative sleeve data inventory

`Confirmed by user` means the fact is carried from an explicit confirmation in the
validated chain. `Authoritative` is scoped: a body measurement can be authoritative as a
body measurement without becoming an authoritative finished-sleeve target.

| DATA | SOURCE | AUTHORITATIVE? | CONFIRMED BY USER? | DERIVED? | MISSING? |
|---|---|---:|---:|---:|---:|
| Garment type: sweater | Stage 60/61; copied into Stage 65–78 | Yes | Yes | No | No |
| Sleeve length: 57 cm | Stage 60/61 garment measurement; copied into Stage 65 and Stage 76 | Yes, as desired shoulder-point-to-edge length | Yes | No | No |
| Upper-arm body circumference: 30 cm | Stage 60/61 body measurement; copied into Stage 65 sizing context | Yes, as a body measurement | Yes | No | No |
| Finished sleeve circumference at upper arm | No field or snapshot | No | No | No | **Yes** |
| Wrist body circumference | No field in the details/closure/initialization allowlists | No | No | No | **Yes** |
| Desired finished cuff/wrist circumference | No field or snapshot | No | No | No | **Yes** |
| Elbow body or finished-sleeve circumference | No field or snapshot | No | No | No | **Yes** |
| Armhole depth: 21 cm | Stage 60/61; copied through Stage 78 | Yes, as a vertical body measurement | Yes | No | No |
| Body armhole circumference/width | No field or snapshot | No | No | No | **Yes** |
| Stitch gauge: 20 sts / 10 cm | Stage 63; copied into Stage 64/65/76 | Yes, for the confirmed swatch | Yes | No | No |
| Row gauge: 28 rows / 10 cm | Stage 63; copied into Stage 64/65/76 | Yes, for the confirmed swatch | Yes | No | No |
| Gauge applicability to sleeve fabric and sleeve working method | Stage 63 has no sleeve-specific support binding; current fixture source strings do not prove it | No | No | No | **Yes** |
| Overall construction direction: bottom-up | Stage 76 clarification; Stage 77/78 binding | Yes | Yes | No | No |
| Body/foundation working method: in the round | Stage 70 preparation; copied into Stage 76–78 | Yes, for the executed body chain | Yes | No | No |
| Sleeve-specific working method | No scoped sleeve contract; current `workingMethod` is not proved global to future components | No | No | No | **Yes** |
| Raglan join topology | Stage 77 strategy identity/topology | Yes | Yes | No | No |
| Yoke shaping policy | Stage 78 policy identity | Yes | Yes | No | No |
| Sleeve pre-join taper/shaping policy | Stage 78 concerns yoke decreases after joining, not cuff-to-underarm sleeve increases | No | No | No | **Yes** |
| Sleeve main pattern/repeat | Stage 73 confirms body primary fabric only | No | No | No | **Yes** |
| Sleeve cuff/foundation pattern and height | Body ribbing/5 cm is scoped to the body foundation and cannot be reused silently | No | No | No | **Yes** |
| Sleeve cast-on/target cuff stitch count | No sleeve calculation exists; Stage 64's 100 is `garment_detail_width` | No | No | No | **Yes** |
| Sleeve target stitch count at underarm | No calculation or snapshot | No | No | No | **Yes** |
| Executable sleeve row/length geometry | 57 cm and row gauge exist, but cuff height, endpoint definition, shaping zones, and gauge applicability do not | No | No | Partially possible only after missing inputs | **Yes** |
| First sleeve physically completed | No execution/result record | No | No | No | **Yes** |
| First sleeve measured length and observed underarm stitches | No measurement record | No | No | No | **Yes** |
| Second sleeve physically completed | No execution/result record | No | No | No | **Yes** |
| Second sleeve measured length and observed underarm stitches | No measurement record | No | No | No | **Yes** |
| Body physically completed to the true underarm boundary | Stage 75 confirms only 30 cm; 41 cm is informational in Stage 76–78 | No | No | 41 cm is a conditional derivation, not execution evidence | **Yes** |
| Body underarm stitch allocation | No policy, calculation, or snapshot | No | No | No | **Yes** |
| Sleeve underarm stitch allocation | No policy, calculation, or snapshot | No | No | No | **Yes** |
| Stitches removed from the first combined working round | No validated allocation | No | No | No | **Yes** |
| Front/back/left-sleeve/right-sleeve yoke section balance | No validated distribution | No | No | No | **Yes** |
| Combined yoke stitch count | No authoritative component counts/allocation and no canonical join formula | No | No | No | **Yes** |

### Facts that must not be promoted to sleeve authority

- `upperArm = 30 cm` is a body circumference, not a finished sleeve circumference. The
  current `fit = regular` value has no versioned numeric sleeve-ease policy.
- `sleeveLength = 57 cm` is a desired finished length, but by itself does not define the
  cuff height, cuff-to-underarm distance, or executable rows.
- `20 sts / 10 cm` and `28 rows / 10 cm` are authoritative swatch measurements, but the
  source contract does not prove the swatch applies to the future sleeve pattern and
  flat/in-round method.
- `workingMethod = in_round` is authoritative for the body chain that produced Stage 75.
  No existing contract states that it automatically applies to every future component.
- `foundationType = ribbing`, height 5 cm, and `mainPattern = Лицевая гладь` describe the
  completed body sections. They are not sleeve cuff/pattern selections.
- `stitchCount = 100` belongs to a 50 cm `garment_detail_width`; using it for a sleeve
  would violate the calculation's semantic role.
- `armholeStartCm = 41` and `additionalHeightToArmholeCm = 11` are expressly
  informational. They neither prove body completion nor define underarm allocation.

## 4. First genuinely missing user input

The first missing fit fact in a minimal cuff-up target-geometry sequence is:

> Какой должна быть готовая окружность рукава у края манжеты, в сантиметрах?

This is one fact: the desired **finished cuff circumference**, not a request for the user
to calculate stitches. Asking it directly is safer than silently converting an absent
body-wrist measurement through a nonexistent ease policy. It also matches the existing
architecture's distinction between body measurements and finished-garment measurements.

This finding does **not** authorize a production question yet. A Stage 79 schema would
also have to define the later, separately collected finished upper-arm target (or adopt a
versioned sleeve-ease policy), elbow requirement, sleeve-specific working method,
cuff/pattern contract, and gauge applicability. Their ordering and validation are not
currently normative.

The following are not valid replacements for the first question:

- “How many stitches?” — YarnAI must derive this after target geometry, applicable gauge,
  repeat, and rounding rules are known.
- “Which shaping cadence?” — once both endpoint targets and constraints are authoritative,
  event count and even distribution are mathematical work under canon sections 6 and 8,
  not a user calculation.
- `joining_strategy` — Stage 77 already selected the yoke topology.
- `finishing_strategy` — this belongs later and must not be surfaced now.

## 5. Sleeve construction alternatives and what Stage 77 fixes

### Already fixed

- The garment is bottom-up.
- Sleeves exist as two separately made components before the yoke join.
- The sleeves meet the body at the underarms with live working stitches for a raglan
  yoke; there is no separately shaped set-in sleeve cap in this selected topology.
- Raglan shaping begins after the body/sleeve join and follows the Stage 78 policy.
- Held underarm stitches are outside the combined yoke working path.

The standard technique description is consistent with this topology: bottom-up sweater
construction makes a body tube and two sleeve tubes, holds corresponding underarm
stitches, and works the remaining stitches together for the yoke. Underarm grafting is a
later closure operation, not an alternative yoke join:

- https://blog.tincanknits.com/2017/03/28/lets-knit-a-bottom-up-sweater/
- https://blog.tincanknits.com/2017/03/28/that-pesky-underarm/
- https://knitty.com/ISSUEfall04/FEATfall04TBP.html

### Not safely fixed by the current contracts

The repository does not define the scope of `workingMethod = in_round` beyond the body
execution chain. It therefore does not prove whether a future sleeve must be worked
seamlessly in the round or may be worked flat and made into a tube before the live-stitch
join. These alternatives change edge stitches, gauge applicability, pattern notation,
seam consumption, and stitch counts. YarnAI must not infer the answer and must not offer
both until a sleeve-construction policy defines which are compatible with the selected
production topology.

`cuff_up` follows from the selected bottom-up body-and-sleeves strategy and is not a new
user choice at this boundary. `top_down` would contradict Stage 76/77. A separate sleeve
cap choice also does not belong here: a set-in cap would contradict the selected joined
raglan topology.

## 6. Separate planning stage is required

Yes, a sleeve construction and target-geometry planning boundary is required before any
physical execution preparation. It must remain separate from execution because its
output is an intended, reviewable geometry, while execution records what the user
actually made.

The future planning contract must, at minimum:

1. bind the project, active calculation, Stage 60/61/63/65 and Stage 75–78 identities,
   revisions, fingerprints, and accepted Stage 78 version/outcome;
2. retain the known sleeve length and upper-arm body measurement with provenance;
3. collect missing finished target geometry one fact at a time;
4. resolve sleeve method, cuff/foundation, main pattern/repeat, tools, and gauge
   applicability without hidden defaults;
5. derive stitch/row and taper geometry only under a versioned canon/policy;
6. expose every input, formula, structural constraint, rounding result, and resulting
   physical size for review;
7. finish as an immutable preparation source and perform no physical action.

The current canon supports generic stitch conversion, row conversion, event-count
balance, and even distribution. It does not provide the missing sleeve-ease model,
sleeve endpoint schema, sleeve-method applicability rule, or underarm allocation model.
Those gaps prevent a complete production contract today.

## 7. Recommended sleeve lifecycle

The lifecycle should reuse the established YarnAI composition
`planning/preparation -> execution -> physical target confirmation`:

1. **Sleeve target-geometry planning** — collect and confirm construction and finished
   targets; derive a reviewable plan only after all required inputs and policies exist.
2. **Shared sleeve-pair execution preparation** — immutable snapshot of the common
   target, method, cuff, pattern, gauge binding, instructions, and tolerances for a
   quantity of two. This is preparation, not an execution result.
3. **Sleeve 1 execution** — independent resumable physical record bound to the shared
   preparation and stable piece ordinal.
4. **Sleeve 1 physical confirmation** — immutable result containing actual length,
   actual stitch count at underarm, relevant control measurements, deviations, and
   rework outcome.
5. **Sleeve 2 execution** — a separate resumable record bound to the same preparation.
6. **Sleeve 2 physical confirmation** — a separate immutable result with its own actual
   values and deviations.
7. **Sleeve-pair validation** — compare the two authoritative terminal results; do not
   erase an earlier attempt or silently average differences.
8. **Body-to-underarm completion and measurement** — complete the body to the actual join
   boundary and confirm its current stitch count. The 41 cm orientation is not evidence.
9. **Underarm/yoke join preparation** — only after both sleeves and the body are current,
   calculate or collect the versioned allocation and validate the combined section
   balance.
10. **Join execution** — a later physical stage; never part of sleeve planning.

If sleeve 1 shows that the shared target must change, the preparation is superseded by a
new immutable revision. Existing sleeve execution/results retain their original source
binding. YarnAI must then explicitly determine whether sleeve 1 is reworked under the new
preparation; it cannot silently let sleeve 2 follow a different target and still call the
pair identical.

## 8. Immutable representation of two sleeves

Choose **variant C: one common preparation snapshot plus two independent physical
execution/result histories**.

### Why not variant A: one execution with `quantity = 2`

A single mutable cursor cannot safely represent one sleeve complete while the other is
active. It makes pause/resume, idempotent operation IDs, correction, observed length,
observed stitch count, rework, and source binding ambiguous. Different physical outcomes
would have to be collapsed into arrays inside one record or overwrite each other.

### Why variant B alone is insufficient

Two entirely separate execution contracts preserve outcomes but duplicate the intended
geometry and allow the two plans to drift. Comparing the sleeves then requires proving
that duplicated source payloads are semantically identical.

### Variant C contract shape

- one immutable pair-preparation identity/fingerprint;
- two stable piece identities/ordinals (`1` and `2`; handedness remains null unless an
  explicitly confirmed asymmetric design requires it);
- one independent execution history per piece, each with its own revision, lifecycle,
  operation receipts, resume state, and source binding;
- one independent measurement/result attempt history per piece;
- append-only supersession for rework, never mutation of a completed result;
- a derived pair status only when both authoritative current results bind the same
  preparation and pass symmetry/tolerance checks.

This is not a new lifecycle model. It composes the recent Stage 70–75 separation of
preparation, execution, and measurement with the repository's epoch/predecessor history
pattern. The older `second-identical-piece` tests additionally prove that independent
piece histories and non-mutation of the first piece are established YarnAI invariants;
its legacy domain is evidence, not a production contract to copy wholesale.

## 9. Execution prerequisites versus user inputs

### Genuine user inputs or explicit confirmations

- desired finished cuff circumference;
- later finished upper-arm target, unless a separately approved versioned ease policy can
  derive it from the confirmed 30 cm body measurement;
- elbow target only if the chosen geometry requires it and no accepted deterministic
  model supplies it;
- sleeve-specific flat/in-round method if the future construction policy proves both
  compatible and neither has been selected authoritatively;
- cuff/foundation and sleeve pattern where more than one meaningful design remains;
- confirmation that the measured gauge applies to the selected sleeve fabric/method, or
  a new confirmed sleeve-specific swatch.

### Physical execution prerequisites, not choice enums

- body actually completed and measured at the underarm boundary;
- first sleeve actually completed, measured, and counted at underarm;
- second sleeve actually completed, measured, and counted at underarm;
- any required rework completed and represented by superseding immutable attempts;
- both current sleeve results bound to the same current preparation;
- an accepted underarm allocation model and validated section balance.

These states must be produced by execution/result records. Asking “are both sleeves
done?” in a planning enum or deriving completion from elapsed rows would not create
authoritative physical evidence.

## 10. When underarm geometry becomes available

Different counts become available at different boundaries and must not be conflated:

| Value | Earliest safe availability |
|---|---|
| Planned sleeve count at underarm | After completed sleeve target-geometry planning, applicable stitch gauge, repeat/rounding constraints, and a versioned sleeve model |
| Authoritative actual sleeve 1 count at underarm | After sleeve 1 execution and explicit physical count confirmation |
| Authoritative actual sleeve 2 count at underarm | After sleeve 2 execution and explicit physical count confirmation |
| Authoritative current body count at underarm | After body execution reaches the real join boundary and an explicit physical count is confirmed |
| Body and sleeve underarm allocations | During a later join-preparation contract, after an accepted allocation policy/model and current component counts exist |
| Stitches removed from the working round | Only after those allocations are validated against the actual component counts |
| Combined yoke stitch count and front/back/sleeve balance | Only after both sleeves, body, allocations, raglan-line ownership, and section distribution are authoritative |

The external technique references show the topology — held body and sleeve stitches are
excluded while remaining stitches enter the yoke — but they do not authorize YarnAI to
invent a product-wide allocation formula. `KNITTING_MATH_CANON.md` requires compatible
joined parts and exact balances, and section 10 forbids automatic calculation of complex
raglan/armhole geometry without a complete model. It does not define:

- how many underarm stitches this product should hold;
- whether that number is derived from width, a proportion, a fixed count, pattern repeat,
  or another policy;
- how raglan-line stitches are owned in the first combined round;
- how front/back section counts and beginning-of-round placement are normalized.

This is an architecture gap. No numeric underarm or yoke formula is introduced here.

## 11. Can the execution plan be safely extended?

No. The current Stage 65 plan is an immutable completed partial plan whose last physical
scope is the body `PRIMARY_FABRIC` step. Stage 78 v2 correctly returns:

```json
{
  "status": "blocked_on_prerequisites",
  "newPlan": null,
  "reason": "EXECUTION_GEOMETRY_PREREQUISITES_REQUIRED_BEFORE_SAFE_PLAN_EXTENSION",
  "nextMissingInput": null,
  "remainingInputs": [],
  "blockingPrerequisites": [
    "sleeve_construction_and_target_geometry",
    "two_completed_measured_sleeves",
    "sleeve_stitch_counts_at_underarm",
    "body_and_sleeve_underarm_stitch_allocation",
    "combined_yoke_section_balance"
  ]
}
```

This contract remains unchanged. Accepted Stage 65–78 snapshots remain immutable. A
future sleeve plan must be a new source-bound successor, not a mutation of Stage 65 or
Stage 78.

## 12. Why Stage 79 was not created

The successor class is clear, but its production contract is not complete. The following
normative decisions or canon additions are still absent:

1. canonical sleeve target schema: direct finished measurements versus body measurements
   plus a versioned ease policy;
2. exact required endpoint/control measurements and their order;
3. scope and admissibility of sleeve flat/in-round construction under the selected
   Stage 77 topology;
4. sleeve cuff/main-pattern and gauge-applicability contract;
5. sleeve taper model, structural constraints, tolerances, and result checkpoints;
6. underarm allocation and combined-yoke balance model.

Creating a Stage 79 now would require inventing those product decisions in code. That
would violate fail-closed operation and the instruction not to derive values from product
assumptions.

## 13. Minimal next architecture task

Close one specification named **Sleeve Target Geometry and Construction Contract v1**.
It should define the exact target-measurement schema and provenance, resolve the scope of
the sleeve working method, bind gauge applicability, define cuff/pattern requirements,
and state the verified sleeve taper calculations and tolerances. Underarm/yoke math
should remain a separate later specification unless the sleeve contract must reserve
specific fields for it.

Only after that specification is complete should the team decide whether it is production
Stage 79 and implement its domain/repository/workspace/UI surface.

## 14. Files changed

- `STAGE_79_ARCHITECTURE_FINDING.md` — replaced the earlier narrow joining-strategy
  finding with the full authoritative sleeve successor analysis.

No production code, route, UI, fixture, or test file was changed by this investigation.
No commit or push was made.

STAGE 79 NOT READY: SLEEVE TARGET GEOMETRY, SLEEVE-METHOD SCOPE, GAUGE APPLICABILITY, AND UNDERARM/YOKE MATH ARE NOT YET DEFINED BY A VERSIONED CONTRACT
