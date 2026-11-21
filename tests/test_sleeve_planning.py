from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from contextlib import contextmanager
from typing import Sequence

import pytest

from yarnai_calculation.sleeve_planning import (
    AuthoritativeSleeveSources,
    EXPECTED_SOURCE_CONTRACTS,
    MATH_CANON_FINGERPRINT,
    PROGRESS_KIND,
    REQUIRED_STAGE78_PREREQUISITES,
    REQUIRED_STAGE78_REASON,
    REQUIRED_TOPOLOGY,
    SOURCE_STAGES,
    PatternBinding,
    SleevePlanningError,
    SleevePlanningHistoryRepository,
    SleevePlanningProgressRecord,
    SleevePlanningState,
    SleeveTargetGeometryPlanningService,
    SourceBinding,
    ZoneGaugeBinding,
    fingerprint,
    validate_authoritative_sources,
)


PROJECT = "018f2f38-5b47-7d86-8f51-8f1f859457e1"
CALCULATION = "018f2f38-5b47-7d86-8f51-8f1f859457e2"
NOW = "2026-08-08T12:00:00.000Z"
TIMES = [f"2026-08-08T12:{minute:02d}:00.000Z" for minute in range(1, 40)]
OP_IDS = [f"018f2f38-5b47-7d86-8f51-8f1f8594{index:04x}" for index in range(1, 80)]


def fp(label: str) -> str:
    return fingerprint({"fixture": label})


def sources(
    *,
    bindings: tuple[SourceBinding, ...] | None = None,
    main_pattern: PatternBinding | None = None,
) -> AuthoritativeSleeveSources:
    made = []
    for stage in SOURCE_STAGES:
        identity, version = EXPECTED_SOURCE_CONTRACTS[stage]
        binding = SourceBinding(
            stage=stage,
            repository_record_id=f"stage-{stage}-record",
            repository_revision=1,
            domain_identity=identity,
            contract_version=version,
            domain_fingerprint=fp(f"stage-{stage}-domain"),
            snapshot_fingerprint=fp(f"stage-{stage}-snapshot"),
            project_id=PROJECT,
            calculation_id=CALCULATION,
        ).current()
        made.append(binding)
    by_stage = {item.stage: item for item in made}
    cuff = PatternBinding(
        identity="rib_1x1",
        source_identity="stage70-cuff",
        source_fingerprint=by_stage[70].snapshot_fingerprint,
        display_value="Резинка 1×1",
        horizontal_repeat=2,
        fixed_working_stitches=0,
        vertical_repeat=2,
        end_phase="any",
        origin="inherited_stage70",
    )
    main = main_pattern or PatternBinding(
        identity="stockinette_in_round",
        source_identity="stage73-main-pattern",
        source_fingerprint=by_stage[73].snapshot_fingerprint,
        display_value="Лицевая гладь",
        horizontal_repeat=1,
        fixed_working_stitches=0,
        vertical_repeat=1,
        end_phase="any",
        origin="inherited_stage73",
    )
    if main_pattern is not None:
        main = replace(main, source_fingerprint=by_stage[73].snapshot_fingerprint)
    return AuthoritativeSleeveSources(
        project_id=PROJECT,
        calculation_id=CALCULATION,
        bindings=bindings or tuple(made),
        upper_arm_body_circumference_cm="30",
        shoulder_point_to_cuff_length_cm="57",
        armhole_depth_cm="21",
        direction="bottom_up",
        topology_identity=REQUIRED_TOPOLOGY,
        stage78_outcome_status="blocked_on_prerequisites",
        stage78_outcome_reason=REQUIRED_STAGE78_REASON,
        stage78_blocking_prerequisites=REQUIRED_STAGE78_PREREQUISITES,
        inherited_cuff_pattern=cuff,
        inherited_cuff_height_cm="5",
        inherited_main_pattern=main,
        yarn_identity="yarn:fixture:v1",
        tool_identity="needle:4mm:v1",
    ).with_canon_fingerprint()


def gauge(
    zone: str,
    *,
    pattern: str | None = None,
    record: str | None = None,
    stitches: str = "2",
    rows: str = "2.8",
    mode: str = "deterministic_identity_match",
) -> ZoneGaugeBinding:
    record = record or f"gauge:{zone}:v1"
    pattern = pattern or ("rib_1x1" if zone == "cuff" else "stockinette_in_round")
    context = fp(f"{zone}-context")
    record_fp = fp(f"{zone}-record")
    evidence_fp = fingerprint({
        "zone": zone,
        "mode": mode,
        "comparedContextFingerprint": context,
        "gaugeRecordFingerprint": record_fp,
    })
    return ZoneGaugeBinding(
        zone=zone,
        project_id=PROJECT,
        calculation_id=CALCULATION,
        gauge_record_identity=record,
        gauge_confirmation_key=fp(f"{zone}-confirmation"),
        gauge_record_fingerprint=record_fp,
        gauge_source_context_fingerprint=context,
        stitches_per_cm_exact=stitches,
        rows_per_cm_exact=rows,
        finishing_state="washed_blocked_rested",
        yarn_identity="yarn:fixture:v1",
        tool_identity="needle:4mm:v1",
        pattern_identity=pattern,
        working_method="in_round",
        applicability_mode=mode,
        compared_context_fingerprint=context,
        evidence_fingerprint=evidence_fp,
        explicit_confirmation=mode == "explicit_legacy_context_attestation",
        confirmed_at=TIMES[0] if mode == "explicit_legacy_context_attestation" else None,
    ).current()


def collect(service: SleeveTargetGeometryPlanningService, state: SleevePlanningState, source=None, *, cuff="20", upper="30", length="40"):
    source = source or sources()
    for index, (field, value) in enumerate(
        (
            ("cuffTargetCircumferenceCm", cuff),
            ("upperSleeveTargetCircumferenceCm", upper),
            ("cuffToUnderarmLengthCm", length),
        )
    ):
        state = service.collect_target(
            state, source, field=field, value=value, operation_id=OP_IDS[index], at=TIMES[index]
        )
    return state


def reviewing(
    service: SleeveTargetGeometryPlanningService | None = None,
    source: AuthoritativeSleeveSources | None = None,
    *,
    cuff="20",
    upper="30",
    length="40",
    cuff_gauge: ZoneGaugeBinding | None = None,
    main_gauge: ZoneGaugeBinding | None = None,
):
    service = service or SleeveTargetGeometryPlanningService()
    source = source or sources()
    state = service.start_epoch(source, epoch=1, created_at=NOW)
    state = collect(service, state, source, cuff=cuff, upper=upper, length=length)
    state = service.bind_gauge(state, source, cuff_gauge or gauge("cuff"), operation_id=OP_IDS[3], at=TIMES[3])
    state = service.bind_gauge(state, source, main_gauge or gauge("main"), operation_id=OP_IDS[4], at=TIMES[4])
    state = service.review(state, source, operation_id=OP_IDS[5], at=TIMES[5], inherited_construction_reviewed=True)
    return service, source, state


def completed():
    service, source, state = reviewing()
    review_fp = state.to_dict()["derivedReview"]["reviewFingerprint"]
    state = service.complete(state, source, review_fingerprint=review_fp, operation_id=OP_IDS[6], at=TIMES[6])
    return service, source, state


@contextmanager
def assert_code(code: str):
    with pytest.raises(SleevePlanningError) as caught:
        yield
    assert caught.value.code == code


def test_happy_path_builds_exact_immutable_planning_snapshot_without_execution_scope():
    service, source, state = completed()
    value = state.to_dict()
    snapshot = value["completedSnapshot"]
    assert value["lifecycle"] == "completed"
    assert snapshot["stageIdentity"] == "PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING"
    assert snapshot["contractVersion"] == 1
    assert snapshot["sourceBindings"].keys() >= {"stage61", "stage63GaugeHistory", "stage78", "sourceBindingFingerprint"}
    assert snapshot["confirmedTargets"]["cuffTargetCircumferenceCm"]["value"] == "20"
    assert snapshot["construction"]["direction"]["value"] == "bottom_up"
    assert snapshot["construction"]["workingMethod"]["value"] == "in_round"
    assert snapshot["gaugeBindings"]["cuff"]["gaugeRecordIdentity"] != snapshot["gaugeBindings"]["main"]["gaugeRecordIdentity"]
    derived = snapshot["derivedGeometry"]
    assert derived["cuffTargetStitches"] == 40
    assert derived["upperSleeveTargetStitches"] == 60
    assert derived["totalIncreaseStitches"] == 20
    assert derived["increaseEventCount"] == 10
    assert derived["increaseDistribution"]["events"][-1]["resultingStitchCount"] == 60
    assert derived["stopCondition"]["holdOrRemoveUnderarmStitches"] is False
    encoded = state.to_json()
    for forbidden in ("underarmAllocation", "combinedYoke", "physicalSleeve", "actualStitchCount", "executionCursor"):
        assert forbidden not in encoded
    restored = SleevePlanningState.from_json(encoded)
    assert restored == state
    assert restored.fingerprint == state.fingerprint
    mutated = restored.to_dict()
    mutated["lifecycle"] = "collecting"
    assert restored.lifecycle == "completed"


def test_lifecycle_is_ready_collecting_reviewing_completed_and_does_not_collapse_review():
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = service.start_epoch(source, epoch=1, created_at=NOW)
    assert state.lifecycle == "ready_to_collect"
    state = service.collect_target(state, source, field="cuffTargetCircumferenceCm", value="20", operation_id=OP_IDS[0], at=TIMES[0])
    assert state.lifecycle == "collecting"
    state = service.collect_target(state, source, field="upperSleeveTargetCircumferenceCm", value="30", operation_id=OP_IDS[1], at=TIMES[1])
    state = service.collect_target(state, source, field="cuffToUnderarmLengthCm", value="40", operation_id=OP_IDS[2], at=TIMES[2])
    assert state.lifecycle == "collecting"
    state = service.bind_gauge(state, source, gauge("cuff"), operation_id=OP_IDS[3], at=TIMES[3])
    state = service.bind_gauge(state, source, gauge("main"), operation_id=OP_IDS[4], at=TIMES[4])
    state = service.review(state, source, operation_id=OP_IDS[5], at=TIMES[5], inherited_construction_reviewed=True)
    assert state.lifecycle == "reviewing"
    assert state.to_dict()["completedSnapshot"] is None


@pytest.mark.parametrize("missing", ["cuffTargetCircumferenceCm", "upperSleeveTargetCircumferenceCm", "cuffToUnderarmLengthCm"])
def test_each_missing_geometry_input_blocks_review(missing):
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = service.start_epoch(source, epoch=1, created_at=NOW)
    values = {"cuffTargetCircumferenceCm": "20", "upperSleeveTargetCircumferenceCm": "30", "cuffToUnderarmLengthCm": "40"}
    for index, field in enumerate(service.target_order):
        if field == missing:
            break
        state = service.collect_target(state, source, field=field, value=values[field], operation_id=OP_IDS[index], at=TIMES[index])
    state = service.bind_gauge(state, source, gauge("cuff"), operation_id=OP_IDS[10], at=TIMES[10])
    state = service.bind_gauge(state, source, gauge("main"), operation_id=OP_IDS[11], at=TIMES[11])
    with assert_code("GEOMETRY_INCOMPLETE"):
        service.review(state, source, operation_id=OP_IDS[12], at=TIMES[12], inherited_construction_reviewed=True)


def test_body_upper_arm_and_shoulder_minus_armhole_are_references_not_implicit_targets():
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = service.start_epoch(source, epoch=1, created_at=NOW).to_dict()
    assert state["targets"] == {}
    assert state["referenceMeasurements"]["upperArmBodyCircumferenceCm"] == "30"
    assert state["referenceMeasurements"]["upperArmSemanticRole"] == "body_measurement"
    assert state["referenceMeasurements"]["shoulderPointToCuffLengthCm"] == "57"
    assert state["referenceMeasurements"]["armholeDepthCm"] == "21"
    assert "36" not in state["targets"].values()


@pytest.mark.parametrize("value", ["", " ", "0", "-1", "NaN", "Infinity", "1e2", "1,5", "1001"])
def test_invalid_target_decimals_fail_closed(value):
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = service.start_epoch(source, epoch=1, created_at=NOW)
    with assert_code("TARGET_INVALID"):
        service.collect_target(state, source, field="cuffTargetCircumferenceCm", value=value, operation_id=OP_IDS[0], at=TIMES[0])


def test_reverse_taper_and_nonpositive_shaping_length_are_explicitly_blocked():
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = service.start_epoch(source, epoch=1, created_at=NOW)
    state = service.collect_target(state, source, field="cuffTargetCircumferenceCm", value="30", operation_id=OP_IDS[0], at=TIMES[0])
    with assert_code("UNSUPPORTED_REVERSE_TAPER_V1"):
        service.collect_target(state, source, field="upperSleeveTargetCircumferenceCm", value="20", operation_id=OP_IDS[1], at=TIMES[1])
    state = service.start_epoch(source, epoch=1, created_at=NOW)
    state = service.collect_target(state, source, field="cuffTargetCircumferenceCm", value="20", operation_id=OP_IDS[0], at=TIMES[0])
    state = service.collect_target(state, source, field="upperSleeveTargetCircumferenceCm", value="30", operation_id=OP_IDS[1], at=TIMES[1])
    with assert_code("SHAPING_LENGTH_NOT_POSITIVE"):
        service.collect_target(state, source, field="cuffToUnderarmLengthCm", value="5", operation_id=OP_IDS[2], at=TIMES[2])


def test_missing_or_inapplicable_zone_gauge_never_reuses_the_other_zone():
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = collect(service, service.start_epoch(source, epoch=1, created_at=NOW), source)
    state = service.bind_gauge(state, source, gauge("main"), operation_id=OP_IDS[3], at=TIMES[3])
    with assert_code("CUFF_GAUGE_REQUIRED"):
        service.review(state, source, operation_id=OP_IDS[4], at=TIMES[4], inherited_construction_reviewed=True)
    with assert_code("GAUGE_PATTERN_MISMATCH"):
        service.bind_gauge(state, source, gauge("cuff", pattern="stockinette_in_round"), operation_id=OP_IDS[5], at=TIMES[5])
    stale = replace(gauge("cuff"), current_record_fingerprint=fp("changed"))
    with assert_code("GAUGE_STALE"):
        service.bind_gauge(state, source, stale, operation_id=OP_IDS[6], at=TIMES[6])
    corrupted_evidence = replace(gauge("cuff"), evidence_fingerprint=fp("changed-evidence"))
    with assert_code("GAUGE_EVIDENCE_FINGERPRINT_MISMATCH"):
        service.bind_gauge(state, source, corrupted_evidence, operation_id=OP_IDS[7], at=TIMES[7])


def test_same_physical_gauge_record_cannot_cover_different_pattern_zones():
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = collect(service, service.start_epoch(source, epoch=1, created_at=NOW), source)
    state = service.bind_gauge(state, source, gauge("cuff", record="one-swatch"), operation_id=OP_IDS[3], at=TIMES[3])
    with assert_code("CROSS_ZONE_GAUGE_REUSE_FORBIDDEN"):
        service.bind_gauge(state, source, gauge("main", record="one-swatch"), operation_id=OP_IDS[4], at=TIMES[4])


def test_pattern_provenance_is_inherited_and_uncontracted_override_is_rejected():
    source = sources()
    validate_authoritative_sources(source)
    bad_main = replace(source.inherited_main_pattern, origin="user_override")
    with assert_code("PATTERN_PROVENANCE_INVALID"):
        validate_authoritative_sources(replace(source, inherited_main_pattern=bad_main))


def test_full_stage79_pattern_override_requires_numeric_contract_and_fresh_zone_gauge():
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = service.start_epoch(source, epoch=1, created_at=NOW)
    override = PatternBinding(
        identity="main_repeat_4_override",
        source_identity="stage79-user-pattern-override",
        source_fingerprint=fp("stage79-main-override"),
        display_value="Supported repeat 4",
        horizontal_repeat=4,
        fixed_working_stitches=0,
        vertical_repeat=2,
        end_phase="even",
        origin="user_override",
    )
    state = service.override_main_pattern(state, source, override, operation_id=OP_IDS[20], at=TIMES[20])
    state = collect(service, state, source)
    state = service.bind_gauge(state, source, gauge("cuff"), operation_id=OP_IDS[21], at=TIMES[21])
    with assert_code("GAUGE_PATTERN_MISMATCH"):
        service.bind_gauge(state, source, gauge("main"), operation_id=OP_IDS[22], at=TIMES[22])
    state = service.bind_gauge(state, source, gauge("main", pattern=override.identity), operation_id=OP_IDS[23], at=TIMES[23])
    state = service.review(state, source, operation_id=OP_IDS[24], at=TIMES[24], inherited_construction_reviewed=True)
    assert state.to_dict()["construction"]["mainPattern"]["origin"] == "user_override"
    assert state.to_dict()["derivedReview"]["selectedCandidate"]["upperStitches"] % 4 == 0
    invalid = replace(override, horizontal_repeat=0)
    with assert_code("PATTERN_CONSTRAINT_INVALID"):
        service.override_main_pattern(state, source, invalid, operation_id=OP_IDS[25], at=TIMES[25])


def test_cuff_override_requires_supported_transition_and_rebinds_only_cuff_gauge():
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = service.start_epoch(source, epoch=1, created_at=NOW)
    override = PatternBinding(
        identity="seed_stitch_cuff",
        source_identity="stage79-user-cuff-override",
        source_fingerprint=fp("stage79-cuff-override"),
        display_value="Seed stitch cuff",
        horizontal_repeat=2,
        fixed_working_stitches=0,
        vertical_repeat=2,
        end_phase="even",
        origin="user_override",
    )
    with assert_code("CUFF_OVERRIDE_INVALID"):
        service.override_cuff(state, source, override, target_height_cm="6", transition_identity="unknown", operation_id=OP_IDS[26], at=TIMES[26])
    state = service.override_cuff(state, source, override, target_height_cm="6", transition_identity="cuff-to-main-same-count-pattern-change:v1", operation_id=OP_IDS[27], at=TIMES[27])
    assert state.to_dict()["construction"]["cuff"]["heightOrigin"] == "user_override"
    with assert_code("GAUGE_PATTERN_MISMATCH"):
        service.bind_gauge(state, source, gauge("cuff"), operation_id=OP_IDS[28], at=TIMES[28])


def test_joint_endpoint_solver_honors_parity_repeat_and_can_override_independent_nearest_counts():
    main = PatternBinding(
        identity="main_repeat_4", source_identity="stage73-main", source_fingerprint=fp("replaced"),
        display_value="Repeat 4", horizontal_repeat=4, fixed_working_stitches=0,
        vertical_repeat=1, end_phase="any", origin="inherited_stage73",
    )
    source = sources(main_pattern=main)
    service, _, state = reviewing(source=source, cuff="10.25", upper="15.25", main_gauge=gauge("main", pattern="main_repeat_4"))
    review = state.to_dict()["derivedReview"]
    selected = review["selectedCandidate"]
    assert selected["cuffStitches"] % 2 == 0
    assert selected["upperStitches"] % 4 == 0
    assert (selected["upperStitches"] - selected["cuffStitches"]) % 2 == 0


def test_structured_tie_stays_unresolved_until_explicit_valid_confirmation():
    service, source, state = reviewing(cuff="1.5", upper="1.55")
    review = state.to_dict()["derivedReview"]
    assert review["endpointStatus"] == "tie"
    assert review["selectedCandidate"] is None
    with assert_code("ROUNDING_CONFIRMATION_REQUIRED"):
        service.complete(state, source, review_fingerprint=review["reviewFingerprint"], operation_id=OP_IDS[6], at=TIMES[6])
    selected_key = review["tiedCandidateKeys"][0]
    state = service.confirm_rounding_candidate(state, source, candidate_key=selected_key, operation_id=OP_IDS[7], at=TIMES[7])
    review = state.to_dict()["derivedReview"]
    assert review["selectedCandidateKey"] == selected_key
    state = service.complete(state, source, review_fingerprint=review["reviewFingerprint"], operation_id=OP_IDS[8], at=TIMES[8])
    assert state.lifecycle == "completed"


def test_no_valid_joint_candidate_fails_closed():
    main = PatternBinding(
        identity="odd_main", source_identity="stage73-main", source_fingerprint=fp("replaced"),
        display_value="Odd counts", horizontal_repeat=2, fixed_working_stitches=1,
        vertical_repeat=1, end_phase="any", origin="inherited_stage73",
    )
    source = sources(main_pattern=main)
    service = SleeveTargetGeometryPlanningService()
    state = collect(service, service.start_epoch(source, epoch=1, created_at=NOW), source)
    state = service.bind_gauge(state, source, gauge("cuff"), operation_id=OP_IDS[3], at=TIMES[3])
    odd_gauge = gauge("main", pattern="odd_main")
    state = service.bind_gauge(state, source, odd_gauge, operation_id=OP_IDS[4], at=TIMES[4])
    with assert_code("TARGET_IMPOSSIBLE_UNDER_CURRENT_CONSTRAINTS"):
        service.review(state, source, operation_id=OP_IDS[5], at=TIMES[5], inherited_construction_reviewed=True)


def test_taper_has_exact_plus_two_balance_boundaries_and_deterministic_schedule():
    _, _, left = reviewing()
    _, _, right = reviewing()
    first = left.to_dict()["derivedReview"]["taper"]
    second = right.to_dict()["derivedReview"]["taper"]
    assert first == second
    events = first["increaseDistribution"]["events"]
    rounds = [event["mainRound"] for event in events]
    assert rounds == sorted(set(rounds))
    assert all(round_ in first["eligibleIncreaseRounds"] for round_ in rounds)
    assert min(rounds) > 1
    assert max(rounds) < first["shapingRows"]
    assert sum(event["deltaStitches"] for event in events) == first["totalIncreaseStitches"]
    assert first["finalTargetCount"] == 60


def test_insufficient_eligible_rounds_is_blocked_by_canon_math():
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = collect(service, service.start_epoch(source, epoch=1, created_at=NOW), source, length="6")
    state = service.bind_gauge(state, source, gauge("cuff"), operation_id=OP_IDS[3], at=TIMES[3])
    state = service.bind_gauge(state, source, gauge("main"), operation_id=OP_IDS[4], at=TIMES[4])
    with assert_code("INSUFFICIENT_ELIGIBLE_ROUNDS"):
        service.review(state, source, operation_id=OP_IDS[5], at=TIMES[5], inherited_construction_reviewed=True)


@pytest.mark.parametrize("stage", SOURCE_STAGES)
def test_each_required_source_missing_fails_closed(stage):
    source = sources()
    changed = replace(source, bindings=tuple(item for item in source.bindings if item.stage != stage))
    with assert_code("AUTHORITATIVE_SOURCE_CHAIN_INVALID"):
        validate_authoritative_sources(changed)


@pytest.mark.parametrize("stage", SOURCE_STAGES)
@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        (lambda item: replace(item, project_id="018f2f38-5b47-7d86-8f51-8f1f859457ff"), "SOURCE_SCOPE_MISMATCH"),
        (lambda item: replace(item, calculation_id="018f2f38-5b47-7d86-8f51-8f1f859457ff"), "SOURCE_SCOPE_MISMATCH"),
        (lambda item: replace(item, repository_revision=2), "SOURCE_STALE"),
        (lambda item: replace(item, current_domain_fingerprint=fp("changed")), "SOURCE_STALE"),
        (lambda item: replace(item, current_snapshot_fingerprint=fp("changed")), "SOURCE_STALE"),
        (lambda item: replace(item, lifecycle="collecting"), "SOURCE_STATUS_INVALID"),
        (lambda item: replace(item, contract_version=99), "SOURCE_CONTRACT_MISMATCH"),
        (lambda item: replace(item, conflict=True), "SOURCE_UNSAFE"),
    ],
)
def test_every_source_scope_revision_fingerprint_status_version_and_conflict_are_checked(stage, mutation, code):
    source = sources()
    changed_bindings = tuple(mutation(item) if item.stage == stage else item for item in source.bindings)
    with assert_code(code):
        validate_authoritative_sources(replace(source, bindings=changed_bindings))


def test_stale_source_operation_does_not_mutate_epoch():
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    state = service.start_epoch(source, epoch=1, created_at=NOW)
    bindings = tuple(replace(item, current_snapshot_fingerprint=fp("changed")) if item.stage == 78 else item for item in source.bindings)
    with assert_code("SOURCE_STALE"):
        service.collect_target(state, replace(source, bindings=bindings), field="cuffTargetCircumferenceCm", value="20", operation_id=OP_IDS[0], at=TIMES[0])
    assert state.lifecycle == "ready_to_collect"
    assert state.revision == 1


def test_idempotent_replay_conflict_duplicate_completion_and_completed_immutability():
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    start = service.start_epoch(source, epoch=1, created_at=NOW)
    first = service.collect_target(start, source, field="cuffTargetCircumferenceCm", value="20", operation_id=OP_IDS[0], at=TIMES[0])
    assert service.collect_target(first, source, field="cuffTargetCircumferenceCm", value="20", operation_id=OP_IDS[0], at=TIMES[0]) == first
    with assert_code("OPERATION_ID_CONFLICT"):
        service.collect_target(first, source, field="cuffTargetCircumferenceCm", value="21", operation_id=OP_IDS[0], at=TIMES[0])
    service, source, done = completed()
    review_fp = done.to_dict()["completedSnapshot"]["confirmations"]["finalReview"]["reviewFingerprint"]
    assert service.complete(done, source, review_fingerprint=review_fp, operation_id=OP_IDS[6], at=TIMES[6]) == done
    with assert_code("DUPLICATE_COMPLETION_CONFLICT"):
        service.complete(done, source, review_fingerprint=review_fp, operation_id=OP_IDS[20], at=TIMES[20])
    with assert_code("COMPLETED_EPOCH_IMMUTABLE"):
        service.collect_target(done, source, field="cuffTargetCircumferenceCm", value="21", operation_id=OP_IDS[21], at=TIMES[21])


class MemoryBackend:
    def __init__(self):
        self.records: list[SleevePlanningProgressRecord] = []

    def list(self, project_id: str, calculation_id: str, kind: str) -> Sequence[SleevePlanningProgressRecord]:
        return [item for item in self.records if item.project_id == project_id and item.calculation_id == calculation_id and item.kind == kind]

    def insert(self, record: SleevePlanningProgressRecord) -> None:
        self.records.append(record)

    def replace(self, record: SleevePlanningProgressRecord, expected_revision: int) -> None:
        index = next(index for index, item in enumerate(self.records) if item.progress_id == record.progress_id)
        if self.records[index].revision != expected_revision:
            raise SleevePlanningError("REVISION_CONFLICT", "backend conflict")
        self.records[index] = record


def ids():
    values = iter(OP_IDS[40:])
    return lambda: next(values)


def test_repository_reuses_progress_history_shape_with_optimistic_revision_and_reload():
    backend = MemoryBackend()
    repository = SleevePlanningHistoryRepository(backend, ids())
    service = SleeveTargetGeometryPlanningService()
    source = sources()
    initial = service.start_epoch(source, epoch=1, created_at=NOW)
    saved = repository.save(initial)
    assert saved.kind == PROGRESS_KIND
    assert saved.revision == 1
    assert set(saved.to_progress_dict()) == {"progress_id", "project_id", "calculation_id", "kind", "epoch", "revision", "state"}
    collecting = service.collect_target(initial, source, field="cuffTargetCircumferenceCm", value="20", operation_id=OP_IDS[0], at=TIMES[0])
    with assert_code("REVISION_CONFLICT"):
        repository.save(collecting, expected_repository_revision=0)
    saved = repository.save(collecting, expected_repository_revision=1)
    assert saved.revision == 2
    assert repository.save(collecting, expected_repository_revision=2) == saved
    reopened = SleevePlanningHistoryRepository(backend, ids())
    assert reopened.history(PROJECT, CALCULATION)[0].state == collecting


def test_new_epoch_preserves_completed_history_and_rejects_stale_old_epoch_updates():
    service, source, done = completed()
    backend = MemoryBackend()
    repository = SleevePlanningHistoryRepository(backend, ids())
    repository.save(done)
    second = service.start_epoch(source, epoch=2, created_at=TIMES[10], supersedes_identity=done.to_dict()["identity"])
    repository.save(second)
    history = repository.history(PROJECT, CALCULATION)
    assert len(history) == 2
    assert history[0].state == done
    second_collecting = service.collect_target(second, source, field="cuffTargetCircumferenceCm", value="21", operation_id=OP_IDS[11], at=TIMES[11])
    repository.save(second_collecting, expected_repository_revision=1)
    assert repository.history(PROJECT, CALCULATION)[0].state == done
    assert repository.save(done).state == done


def test_snapshot_scope_guard_has_no_route_ui_or_physical_joining_fields():
    _, _, state = completed()
    snapshot = state.to_dict()["completedSnapshot"]
    assert snapshot["kind"] == "SLEEVE_TARGET_GEOMETRY_PLANNING"
    assert snapshot["construction"]["quantity"] == 2
    assert snapshot["derivedGeometry"]["stopCondition"]["physicalConfirmationRequiredLater"] is True
    forbidden = {"route", "workspace", "html", "underarmAllocation", "combinedYokeCount", "physicalSleeveResult", "castOnCompleted"}
    assert forbidden.isdisjoint(snapshot)
