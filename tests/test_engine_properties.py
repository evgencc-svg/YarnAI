from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

import pytest

from yarnai_calculation import (
    Axis,
    CenterType,
    Direction,
    FixedComponent,
    FunctionalCategory,
    Parity,
    Part,
    ResultStatus,
    SizeKind,
    StructuralConstraints,
    TriState,
    calculate,
)
from yarnai_calculation.candidates import neighbor_values, width_allowed_pattern


@pytest.mark.parametrize("repeat", [None, 1, 2, 3, 5, 7])
@pytest.mark.parametrize("fixed", [0, 1, 2, 3])
@pytest.mark.parametrize("parity", list(Parity))
@pytest.mark.parametrize(
    ("center", "centered_part"),
    [
        (CenterType.NONE, None),
        (CenterType.STITCH, Part.ALL),
        (CenterType.GAP, Part.VARIABLE),
    ],
)
@pytest.mark.parametrize("sectors", [1, 2, 4])
def test_allowed_pattern_matches_direct_structural_predicate(
    repeat, fixed, parity, center, centered_part, sectors
):
    constraints = StructuralConstraints(
        parity=parity,
        center=center,
        centered_part=centered_part,
        sectors=sectors,
        sector_part=Part.VARIABLE if sectors > 1 else None,
    )
    residues, period = width_allowed_pattern(
        repeat=repeat,
        minimum_repeats=0,
        fixed_working=fixed,
        constraints=constraints,
    )
    generated = {
        base + multiple * period
        for base in residues
        for multiple in range(0, 101)
        if base + multiple * period <= 100
    }
    direct = set()
    step = repeat or 1
    for variable in range(0, 101):
        total = fixed + variable
        if variable % step:
            continue
        if parity is Parity.EVEN and total % 2:
            continue
        if parity is Parity.ODD and total % 2 == 0:
            continue
        centered = total if centered_part is Part.ALL else variable
        if center is CenterType.STITCH and centered % 2 == 0:
            continue
        if center is CenterType.GAP and centered % 2:
            continue
        if sectors > 1 and variable % sectors:
            continue
        direct.add(variable)
    assert generated == direct


def test_neighbor_search_never_rounds_intermediate_value():
    lower, upper = neighbor_values(Decimal("100.0000000000000000001"), (0,), 3)
    assert lower == 99
    assert upper == 102


@pytest.mark.parametrize(
    ("ease", "expected"),
    [
        ("0.25", 101),
        ("0", 101),
        ("-0.25", 100),
    ],
)
def test_exact_half_policy_for_positive_zero_and_negative_ease(
    request_factory, width_request, ease, expected
):
    measurement = Decimal("50.25") - Decimal(ease)
    request = request_factory(
        width=width_request(
            value=measurement,
            size_kind=SizeKind.MEASUREMENT,
            ease=ease,
        ),
        functional_category=(
            FunctionalCategory.NEGATIVE_EASE
            if Decimal(ease) < 0
            else FunctionalCategory.ORDINARY
        ),
    )
    result = calculate(request)
    assert result.axes[Axis.WIDTH].ideal_count == Decimal("100.50")
    assert result.axes[Axis.WIDTH].selected_candidate.working_count == expected


def test_repeat_tie_returns_both_without_hidden_selection(
    request_factory, width_request
):
    request = request_factory(
        width=width_request(repeat=8, partial_repeat=TriState.NO)
    )
    result = calculate(request)
    axis = result.axes[Axis.WIDTH]
    assert result.status is ResultStatus.CONFIRMATION_REQUIRED
    assert axis.selected_candidate is None
    assert axis.provisional_candidate is None
    assert {item.working_count for item in axis.candidates} == {96, 104}


def test_width_and_height_fail_or_succeed_independently(
    request_factory, width_request, height_request
):
    request = request_factory(
        axes=(Axis.WIDTH, Axis.HEIGHT),
        width=width_request(),
        height=height_request(value=1, fixed_start_rows=2, fixed_end_rows=2),
    )
    result = calculate(request)
    assert result.status is ResultStatus.IMPOSSIBLE
    assert Axis.WIDTH in result.axes
    assert Axis.HEIGHT not in result.axes
    assert result.axes[Axis.WIDTH].selected_candidate.working_count == 100


def test_reproducibility_for_success_error_impossible_and_scope(
    request_factory, width_request
):
    requests = (
        request_factory(width=width_request()),
        request_factory(width=replace(width_request(), value=0)),
        request_factory(
            width=width_request(
                value=5,
                fixed_components=(FixedComponent("fixed", 12, 12),),
            )
        ),
        request_factory(
            width=width_request(),
            out_of_scope_features=frozenset({"shaping"}),
        ),
    )
    for request in requests:
        assert calculate(request) == calculate(request)


def test_functional_result_never_claims_safety(request_factory, width_request):
    result = calculate(
        request_factory(
            width=width_request(),
            functional_category=FunctionalCategory.MEDICAL_OR_ORTHOPEDIC,
        )
    )
    text = " ".join(result.explanation).lower()
    assert result.status is ResultStatus.CONFIRMATION_REQUIRED
    assert "безопас" not in text
    assert "пригод" not in text
