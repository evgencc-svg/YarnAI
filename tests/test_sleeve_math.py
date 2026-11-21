from __future__ import annotations

from decimal import Decimal

import pytest

from yarnai_calculation import Parity
from yarnai_calculation.sleeve_math import (
    BOTTOM_UP_SLEEVE_TAPER_DISTRIBUTION_V1,
    JOINT_SLEEVE_ENDPOINT_ROUNDING_V1,
    EndpointConstraintV1,
    SleeveMathError,
    centered_eligible_indices_v1,
    distribute_bottom_up_sleeve_taper_v1,
    select_joint_sleeve_endpoint_pair_v1,
    solve_joint_sleeve_endpoints_v1,
)


def taper(start: int, target: int, eligible_count: int):
    span = eligible_count + 2
    return distribute_bottom_up_sleeve_taper_v1(
        start_stitch_count=start,
        target_stitch_count=target,
        available_shaping_round_span=span,
        eligible_increase_rounds=range(2, span),
        excluded_rounds=(1, span),
    )


def test_bottom_up_taper_happy_path_has_exact_schedule_and_balance():
    result = taper(40, 48, 10)
    assert result.policy_identity == BOTTOM_UP_SLEEVE_TAPER_DISTRIBUTION_V1
    assert result.stitch_delta == 8
    assert result.increase_event_count == 4
    assert result.selected_eligible_indices == (1, 3, 6, 8)
    assert tuple(event.main_round for event in result.events) == (3, 5, 8, 10)
    assert tuple(event.resulting_stitch_count for event in result.events) == (42, 44, 46, 48)
    assert result.final_stitch_count == 48


def test_bottom_up_taper_zero_event_case_is_exactly_empty():
    result = taper(40, 40, 0)
    assert result.increase_event_count == 0
    assert result.events == ()
    assert result.selected_eligible_indices == ()
    assert result.final_stitch_count == 40


def test_bottom_up_taper_rejects_odd_delta_without_rounding_event_count():
    with pytest.raises(SleeveMathError, match="not divisible") as raised:
        taper(40, 45, 10)
    assert raised.value.code == "NONINTEGRAL_EVENT_COUNT"


def test_bottom_up_taper_rejects_insufficient_eligible_rounds():
    with pytest.raises(SleeveMathError) as raised:
        taper(40, 48, 3)
    assert raised.value.code == "INSUFFICIENT_ELIGIBLE_ROUNDS"


def test_bottom_up_taper_boundary_cases_one_event_and_every_position():
    one = taper(40, 42, 7)
    assert one.selected_eligible_indices == (3,)
    assert tuple(event.main_round for event in one.events) == (5,)

    every = taper(40, 50, 5)
    assert every.selected_eligible_indices == (0, 1, 2, 3, 4)
    assert tuple(event.main_round for event in every.events) == (2, 3, 4, 5, 6)


def test_bottom_up_taper_exact_half_cell_tie_selects_later_eligible_round():
    result = taper(40, 42, 2)
    assert result.cell_center_tie_direction == "later"
    assert result.selected_eligible_indices == (1,)
    assert tuple(event.main_round for event in result.events) == (3,)


def test_bottom_up_taper_long_span_is_deterministic_and_has_no_drift():
    first = taper(100, 2100, 10_000)
    second = taper(100, 2100, 10_000)
    assert first == second
    assert len(first.events) == 1_000
    assert first.events[0].main_round == 7
    assert first.events[-1].main_round == 9_997
    assert first.final_stitch_count == 2_100
    assert max(first.eligible_index_spacings) - min(first.eligible_index_spacings) <= 1


def test_bottom_up_taper_respects_nonconsecutive_eligible_rounds_and_boundaries():
    result = distribute_bottom_up_sleeve_taper_v1(
        start_stitch_count=30,
        target_stitch_count=36,
        available_shaping_round_span=20,
        eligible_increase_rounds=(2, 4, 8, 10, 14, 18),
        excluded_rounds=(1, 3, 5, 6, 7, 9, 11, 12, 13, 15, 16, 17, 19, 20),
    )
    assert tuple(event.main_round for event in result.events) == (4, 10, 18)
    assert all(event.main_round in result.eligible_increase_rounds for event in result.events)
    assert all(event.main_round not in result.excluded_rounds for event in result.events)


@pytest.mark.parametrize(
    ("kwargs", "code"),
    [
        ({"target_stitch_count": 38}, "TARGET_BELOW_START"),
        ({"direction": "top_down"}, "INVALID_DIRECTION"),
        ({"increase_event_size": 1}, "INVALID_EVENT_SIZE"),
        ({"excluded_rounds": (1,)}, "MISSING_BOUNDARY_EXCLUSION"),
        ({"eligible_increase_rounds": (1, 2, 3, 4)}, "ELIGIBLE_EXCLUSION_CONFLICT"),
    ],
)
def test_bottom_up_taper_fails_closed_on_contract_violations(kwargs, code):
    inputs = {
        "start_stitch_count": 40,
        "target_stitch_count": 42,
        "available_shaping_round_span": 5,
        "eligible_increase_rounds": (2, 3, 4),
        "excluded_rounds": (1, 5),
    }
    inputs.update(kwargs)
    with pytest.raises(SleeveMathError) as raised:
        distribute_bottom_up_sleeve_taper_v1(**inputs)
    assert raised.value.code == code


def test_centered_distribution_exhaustive_125250_combination_sweep():
    combinations = 0
    for eligible_count in range(1, 501):
        for event_count in range(1, eligible_count + 1):
            indices = centered_eligible_indices_v1(eligible_count, event_count)
            expected = tuple(
                ((2 * ordinal - 1) * eligible_count) // (2 * event_count)
                for ordinal in range(1, event_count + 1)
            )
            assert indices == expected
            assert len(indices) == event_count
            assert len(set(indices)) == event_count
            assert tuple(sorted(indices)) == indices
            assert indices[0] >= 0 and indices[-1] < eligible_count
            spacings = tuple(right - left for left, right in zip(indices, indices[1:]))
            assert not spacings or max(spacings) - min(spacings) <= 1
            cell_widths = tuple(
                (ordinal * eligible_count) // event_count
                - ((ordinal - 1) * eligible_count) // event_count
                for ordinal in range(1, event_count + 1)
            )
            assert sum(cell_widths) == eligible_count
            assert max(cell_widths) - min(cell_widths) <= 1
            combinations += 1
    assert combinations == 125_250


def endpoint_result(**overrides):
    inputs = {
        "raw_cuff_stitches": "40",
        "raw_upper_stitches": "60",
        "cuff_stitches_per_cm": "2",
        "upper_stitches_per_cm": "2",
        "cuff_constraint": EndpointConstraintV1(repeat=2, parity=Parity.EVEN),
        "upper_constraint": EndpointConstraintV1(repeat=1),
    }
    inputs.update(overrides)
    return solve_joint_sleeve_endpoints_v1(**inputs)


def test_joint_endpoints_select_already_valid_raw_counts():
    result = endpoint_result()
    assert result.policy_identity == JOINT_SLEEVE_ENDPOINT_ROUNDING_V1
    assert result.status == "selected"
    assert (result.selected_pair.cuff_stitches, result.selected_pair.upper_stitches) == (40, 60)
    assert result.selected_pair.score == (Decimal(0), Decimal(0))
    assert result.selected_pair.increase_event_count == 10


def test_joint_endpoints_round_both_with_repeat_and_parity_constraints():
    result = endpoint_result(
        raw_cuff_stitches="39.2",
        raw_upper_stitches="59.2",
        cuff_constraint=EndpointConstraintV1(repeat=4, parity=Parity.EVEN),
        upper_constraint=EndpointConstraintV1(repeat=2, parity=Parity.EVEN),
    )
    assert result.cuff_candidates == (36, 40)
    assert result.upper_candidates == (58, 60)
    assert result.status == "selected"
    assert (result.selected_pair.cuff_stitches, result.selected_pair.upper_stitches) == (40, 60)


def test_joint_solver_rejects_independent_odd_delta_and_selects_compatible_pair():
    result = endpoint_result(
        raw_cuff_stitches="40.1",
        raw_upper_stitches="45.1",
        cuff_stitches_per_cm="1",
        upper_stitches_per_cm="1",
        cuff_constraint=EndpointConstraintV1(repeat=2),
        upper_constraint=EndpointConstraintV1(repeat=1),
    )
    assert result.cuff_candidates == (40, 42)
    assert result.upper_candidates == (45, 46)
    assert result.status == "selected"
    assert (result.selected_pair.cuff_stitches, result.selected_pair.upper_stitches) == (40, 46)
    assert result.selected_pair.increase_event_count == 3


def test_joint_solver_returns_exact_structured_tie_without_hidden_choice():
    result = endpoint_result(
        raw_cuff_stitches="40.5",
        raw_upper_stitches="44.5",
        cuff_stitches_per_cm="1",
        upper_stitches_per_cm="1",
        cuff_constraint=EndpointConstraintV1(repeat=1),
        upper_constraint=EndpointConstraintV1(repeat=1),
    )
    assert result.status == "tie"
    assert result.selected_pair is None
    assert {
        (pair.cuff_stitches, pair.upper_stitches) for pair in result.tied_pairs
    } == {(40, 44), (41, 45)}


def test_joint_solver_returns_no_valid_candidate_for_empty_pair_intersection():
    result = endpoint_result(
        raw_cuff_stitches="100",
        raw_upper_stitches="10",
        cuff_stitches_per_cm="1",
        upper_stitches_per_cm="1",
        cuff_constraint=EndpointConstraintV1(repeat=2),
        upper_constraint=EndpointConstraintV1(repeat=2),
    )
    assert result.status == "no_valid_candidate"
    assert result.selected_pair is None
    assert result.tied_pairs == ()


def test_joint_solver_tolerance_can_reject_every_structural_pair():
    result = endpoint_result(
        raw_cuff_stitches="40.4",
        raw_upper_stitches="60.4",
        cuff_tolerance_cm="0.01",
        upper_tolerance_cm="0.01",
    )
    assert result.status == "no_valid_candidate"


def test_joint_pair_selection_is_independent_of_candidate_order():
    inputs = {
        "raw_cuff_stitches": "40.1",
        "raw_upper_stitches": "45.1",
        "cuff_stitches_per_cm": "1",
        "upper_stitches_per_cm": "1",
    }
    forward = select_joint_sleeve_endpoint_pair_v1(
        **inputs, cuff_candidates=(40, 42), upper_candidates=(45, 46)
    )
    reverse = select_joint_sleeve_endpoint_pair_v1(
        **inputs, cuff_candidates=(42, 40), upper_candidates=(46, 45)
    )
    assert forward == reverse


def test_joint_solver_preserves_very_close_decimal_values_and_is_deterministic():
    inputs = {
        "raw_cuff_stitches": Decimal("40.0000000000000000001"),
        "raw_upper_stitches": Decimal("44.0000000000000000001"),
        "cuff_stitches_per_cm": Decimal("2.0000000000000000001"),
        "upper_stitches_per_cm": Decimal("2.0000000000000000001"),
        "cuff_constraint": EndpointConstraintV1(repeat=1),
        "upper_constraint": EndpointConstraintV1(repeat=1),
    }
    first = solve_joint_sleeve_endpoints_v1(**inputs)
    second = solve_joint_sleeve_endpoints_v1(**inputs)
    assert first == second
    assert first.status == "selected"
    assert (first.selected_pair.cuff_stitches, first.selected_pair.upper_stitches) == (40, 44)
    assert first.selected_pair.increase_event_count == 2


def test_every_selected_endpoint_pair_has_an_integral_plus_two_event_count():
    for cuff_tenths in range(300, 501, 7):
        for upper_tenths in range(cuff_tenths, 701, 11):
            result = endpoint_result(
                raw_cuff_stitches=Decimal(cuff_tenths) / 10,
                raw_upper_stitches=Decimal(upper_tenths) / 10,
                cuff_stitches_per_cm="1.7",
                upper_stitches_per_cm="2.3",
                cuff_constraint=EndpointConstraintV1(repeat=2),
                upper_constraint=EndpointConstraintV1(repeat=3),
            )
            if result.selected_pair is not None:
                delta = result.selected_pair.upper_stitches - result.selected_pair.cuff_stitches
                assert delta >= 0
                assert delta % 2 == 0
                assert result.selected_pair.increase_event_count == delta // 2
