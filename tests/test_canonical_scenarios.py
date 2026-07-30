from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

import pytest

from yarnai_calculation import (
    Axis,
    Direction,
    FixedComponent,
    FunctionalCategory,
    GaugeInput,
    GaugeMeasurement,
    GaugeMethod,
    GaugeSource,
    Parity,
    CenterType,
    Part,
    ResultStatus,
    SizeKind,
    StructuralConstraints,
    ToleranceMode,
    ToleranceRule,
    TriState,
    Unit,
    calculate,
)


def codes(result):
    return {item.code for item in (*result.errors, *result.warnings, *result.clarifications)}


def test_scenario_01_exact_stitches(request_factory, width_request):
    result = calculate(request_factory(width=width_request()))
    selected = result.axes[Axis.WIDTH].selected_candidate
    assert result.status is ResultStatus.READY
    assert selected.working_count == 100
    assert selected.actual_size_cm == 50
    assert selected.signed_error_cm == 0


def test_scenario_02_measurement_positive_ease(request_factory, width_request):
    width = width_request(
        value=96,
        gauge_count=22,
        size_kind=SizeKind.MEASUREMENT,
        ease=4,
    )
    result = calculate(request_factory(width=width))
    axis = result.axes[Axis.WIDTH]
    assert axis.target_size_cm == 100
    assert axis.selected_candidate.working_count == 220
    assert axis.actual_ease_cm == 4
    assert result.status is ResultStatus.READY


def test_scenario_03_negative_ease(request_factory, width_request):
    width = width_request(
        value=56,
        gauge_count=21,
        size_kind=SizeKind.MEASUREMENT,
        ease=-6,
    )
    result = calculate(
        request_factory(
            width=width,
            functional_category=FunctionalCategory.NEGATIVE_EASE,
        )
    )
    assert result.axes[Axis.WIDTH].selected_candidate.working_count == 105
    assert "ПР-23" in codes(result)
    assert result.status is ResultStatus.READY_WITH_WARNINGS


def test_scenario_04_exact_rows(request_factory, height_request):
    result = calculate(
        request_factory(axes=(Axis.HEIGHT,), height=height_request())
    )
    selected = result.axes[Axis.HEIGHT].selected_candidate
    assert selected.working_count == 168
    assert selected.actual_size_cm == 60


def test_scenario_05_both_axes(request_factory, width_request, height_request):
    result = calculate(
        request_factory(
            axes=(Axis.WIDTH, Axis.HEIGHT),
            width=width_request(value=40, gauge_count="22.5"),
            height=height_request(value=55, gauge_count=30),
        )
    )
    assert result.axes[Axis.WIDTH].selected_candidate.working_count == 90
    assert result.axes[Axis.HEIGHT].selected_candidate.working_count == 165
    assert result.gauges[Axis.WIDTH].density_per_cm == Decimal("2.25")
    assert result.gauges[Axis.HEIGHT].density_per_cm == Decimal("3")


def test_scenario_06_nearest_integer(request_factory, width_request):
    result = calculate(
        request_factory(width=width_request(value=48, gauge_count="21.5"))
    )
    selected = result.axes[Axis.WIDTH].selected_candidate
    assert selected.working_count == 103
    assert selected.actual_size_cm == Decimal(103) / Decimal("2.15")
    assert selected.signed_error_cm == selected.actual_size_cm - Decimal(48)
    assert selected.tolerance_zone == "normal"


def test_scenario_07_hard_minimum(request_factory, width_request):
    result = calculate(
        request_factory(
            width=width_request(
                value=50,
                gauge_count="20.01",
                direction=Direction.NOT_LESS,
            )
        )
    )
    selected = result.axes[Axis.WIDTH].selected_candidate
    assert selected.working_count == 101
    assert selected.actual_size_cm == Decimal(101) / Decimal("2.001")
    assert "не меньше" in result.axes[Axis.WIDTH].selection_reason


def test_us_08_hard_maximum(request_factory, width_request):
    result = calculate(
        request_factory(
            width=width_request(
                value=50,
                gauge_count="20.01",
                direction=Direction.NOT_MORE,
            )
        )
    )
    axis = result.axes[Axis.WIDTH]
    assert axis.ideal_count == Decimal("100.050")
    assert axis.selected_candidate.working_count == 100
    assert axis.selected_candidate.actual_size_cm == Decimal(100) / Decimal("2.001")
    assert "не больше" in axis.selection_reason


def test_scenario_08_edges_absorbed_by_seam(request_factory, width_request):
    component = FixedComponent(
        role="edge",
        on_needle=2,
        visible=0,
        same_gauge=TriState.YES,
    )
    result = calculate(
        request_factory(
            width=width_request(fixed_components=(component,))
        )
    )
    axis = result.axes[Axis.WIDTH]
    assert axis.selected_candidate.working_count == 102
    assert axis.selected_candidate.visible_count == 100
    assert axis.selected_candidate.actual_size_cm == 50


def test_scenario_09_inches(request_factory, width_request):
    result = calculate(
        request_factory(
            width=width_request(value=20, unit=Unit.INCH)
        )
    )
    axis = result.axes[Axis.WIDTH]
    assert axis.target_size_cm == Decimal("50.80")
    assert axis.selected_candidate.working_count == 102
    assert axis.selected_candidate.actual_size_cm == 51


def test_scenario_10_exact_half_zero_ease(request_factory, width_request):
    result = calculate(
        request_factory(
            width=width_request(
                value=50,
                gauge_count="20.1",
                size_kind=SizeKind.MEASUREMENT,
                ease=0,
            )
        )
    )
    assert result.axes[Axis.WIDTH].ideal_count == Decimal("100.50")
    assert result.axes[Axis.WIDTH].selected_candidate.working_count == 101


def test_scenario_11_horizontal_repeat(request_factory, width_request):
    component = FixedComponent(
        role="fixed motif",
        on_needle=2,
        visible=2,
        same_gauge=TriState.YES,
    )
    result = calculate(
        request_factory(
            width=width_request(
                gauge_count="20.4",
                repeat=6,
                minimum_repeats=0,
                partial_repeat=TriState.NO,
                fixed_components=(component,),
            )
        )
    )
    axis = result.axes[Axis.WIDTH]
    assert axis.lower_candidate.working_count == 98
    assert axis.upper_candidate.working_count == 104
    assert axis.selected_candidate.working_count == 104
    assert axis.selected_candidate.repeats == 17
    assert {"ПР-14", "ПР-15", "ПР-16"} <= codes(result)


def test_scenario_12_vertical_repeat(request_factory, height_request):
    result = calculate(
        request_factory(
            axes=(Axis.HEIGHT,),
            height=height_request(
                value="20.2",
                gauge_count=30,
                repeat=4,
                fixed_start_rows=1,
                fixed_end_rows=1,
                partial_repeat=TriState.NO,
            ),
        )
    )
    axis = result.axes[Axis.HEIGHT]
    assert axis.lower_candidate.working_count == 58
    assert axis.upper_candidate.working_count == 62
    assert axis.selected_candidate.working_count == 62
    assert axis.selected_candidate.repeats == 15
    assert "ПР-16" in codes(result)


def test_scenario_13_small_measurement_zone(
    request_factory, width_request, swatch_context
):
    gauge = GaugeInput(
        method=GaugeMethod.MEASUREMENTS,
        source=GaugeSource.PERSONAL_SWATCH,
        measurements=tuple(GaugeMeasurement(20, 8) for _ in range(3)),
        total_swatch_size=12,
        margins_outside_zone=TriState.YES,
        context=swatch_context,
    )
    result = calculate(
        request_factory(width=width_request(value=40, gauge=gauge))
    )
    assert result.gauges[Axis.WIDTH].density_per_cm == Decimal("2.5")
    assert result.axes[Axis.WIDTH].selected_candidate.working_count == 100
    assert result.status is ResultStatus.READY_WITH_WARNINGS
    assert "ПР-01" in codes(result)


def test_us_15_stable_median_at_two_percent(
    request_factory, width_request, swatch_context
):
    gauge = GaugeInput(
        method=GaugeMethod.MEASUREMENTS,
        source=GaugeSource.PERSONAL_SWATCH,
        measurements=(
            GaugeMeasurement("19.8", 10),
            GaugeMeasurement(20, 10),
            GaugeMeasurement("20.2", 10),
        ),
        total_swatch_size=14,
        margins_outside_zone=TriState.YES,
        context=swatch_context,
    )
    result = calculate(request_factory(width=width_request(gauge=gauge)))
    assessment = result.gauges[Axis.WIDTH]
    assert assessment.density_per_cm == Decimal("2")
    assert assessment.minimum == Decimal("1.98")
    assert assessment.maximum == Decimal("2.02")
    assert assessment.relative_spread_percent == Decimal("2")
    assert "ПР-10" not in codes(result)
    assert result.axes[Axis.WIDTH].selected_candidate.working_count == 100


def test_us_16_ready_label_gauge_is_preliminary(
    request_factory, width_request, swatch_context
):
    gauge = GaugeInput(
        method=GaugeMethod.READY_VALUE,
        source=GaugeSource.LABEL,
        ready_count=20,
        base_length=10,
        context=swatch_context,
    )
    result = calculate(request_factory(width=width_request(gauge=gauge)))
    assert result.status is ResultStatus.READY_WITH_WARNINGS
    assert result.final is False
    assert {"ПР-08", "ПР-09"} <= codes(result)
    assert result.axes[Axis.WIDTH].selected_candidate.working_count == 100


def test_us_17_compatible_constraints(request_factory, width_request):
    component = FixedComponent("central stitch", 1, 1, TriState.YES)
    constraints = StructuralConstraints(
        parity=Parity.ODD,
        center=CenterType.STITCH,
        centered_part=Part.ALL,
        sectors=4,
        sector_part=Part.VARIABLE,
    )
    result = calculate(
        request_factory(
            width=width_request(
                value="50.5",
                repeat=4,
                minimum_repeats=0,
                partial_repeat=TriState.NO,
                fixed_components=(component,),
                constraints=constraints,
            )
        )
    )
    selected = result.axes[Axis.WIDTH].selected_candidate
    assert selected.working_count == 101
    assert selected.visible_count == 101
    assert selected.repeats == 25
    assert selected.actual_size_cm == Decimal("50.5")


def test_us_18_ease_change_after_rounding(request_factory, width_request):
    result = calculate(
        request_factory(
            width=width_request(
                value=50,
                size_kind=SizeKind.MEASUREMENT,
                ease="0.2",
            )
        )
    )
    axis = result.axes[Axis.WIDTH]
    assert axis.target_size_cm == Decimal("50.2")
    assert axis.ideal_count == Decimal("100.4")
    assert axis.selected_candidate.working_count == 100
    assert axis.actual_ease_cm == 0
    assert axis.ease_change_cm == Decimal("-0.2")
    assert "ПР-19" in codes(result)


def test_scenario_14_missing_row_gauge(request_factory, height_request):
    height = replace(height_request(), gauge=None)
    result = calculate(
        request_factory(
            axes=(Axis.HEIGHT,),
            height=height,
        )
    )
    assert result.status is ResultStatus.INPUT_ERROR
    assert "ОШ-09" in codes(result)
    assert not result.axes


def test_scenario_15_nonpositive_size(request_factory, width_request):
    result = calculate(request_factory(width=width_request(value=0)))
    assert result.status is ResultStatus.INPUT_ERROR
    assert "ОШ-04" in codes(result)
    assert not result.axes


def test_scenario_16_fractional_fixed_working(request_factory, width_request):
    component = FixedComponent("edge", "1.5", 1, TriState.YES)
    result = calculate(
        request_factory(width=width_request(fixed_components=(component,)))
    )
    assert result.status is ResultStatus.INPUT_ERROR
    assert "ОШ-16" in codes(result)


def test_scenario_17_unstable_gauge(
    request_factory, width_request, swatch_context
):
    gauge = GaugeInput(
        method=GaugeMethod.MEASUREMENTS,
        source=GaugeSource.PERSONAL_SWATCH,
        measurements=(
            GaugeMeasurement(20, 10),
            GaugeMeasurement(21, 10),
            GaugeMeasurement("20.5", 10),
        ),
        total_swatch_size=14,
        margins_outside_zone=TriState.YES,
        context=swatch_context,
    )
    result = calculate(
        request_factory(
            width=width_request(
                value=50,
                size_kind=SizeKind.MEASUREMENT,
                ease=0,
                gauge=gauge,
            )
        )
    )
    axis = result.axes[Axis.WIDTH]
    assert result.status is ResultStatus.CONFIRMATION_REQUIRED
    assert "ПР-10" in codes(result)
    assert axis.selected_candidate is None
    assert axis.provisional_candidate.working_count == 103


def test_scenario_18_repeat_and_parity_impossible(request_factory, width_request):
    component = FixedComponent("fixed", 1, 1, TriState.YES)
    result = calculate(
        request_factory(
            width=width_request(
                repeat=2,
                minimum_repeats=0,
                partial_repeat=TriState.NO,
                fixed_components=(component,),
                constraints=StructuralConstraints(parity=Parity.EVEN),
            )
        )
    )
    assert result.status is ResultStatus.IMPOSSIBLE
    assert "НЕВ-03" in codes(result)
    assert not result.axes


def test_scenario_19_fixed_visible_exceeds_target(request_factory, width_request):
    component = FixedComponent("fixed", 12, 12, TriState.YES)
    result = calculate(
        request_factory(
            width=width_request(
                value=5,
                fixed_components=(component,),
            )
        )
    )
    assert result.status is ResultStatus.IMPOSSIBLE
    assert "НЕВ-01" in codes(result)
    assert not result.axes


def test_scenario_20_repeat_misses_explicit_tolerance(
    request_factory, width_request
):
    result = calculate(
        request_factory(
            width=width_request(
                repeat=12,
                minimum_repeats=0,
                partial_repeat=TriState.NO,
                tolerance=ToleranceRule(
                    mode=ToleranceMode.ABSOLUTE,
                    absolute="0.5",
                    source="project requirement",
                ),
            )
        )
    )
    axis = result.axes[Axis.WIDTH]
    assert result.status is ResultStatus.CONFIRMATION_REQUIRED
    assert axis.lower_candidate.working_count == 96
    assert axis.upper_candidate.working_count == 108
    assert axis.selected_candidate is None
    assert axis.provisional_candidate.working_count == 96
    assert "ПР-18" in codes(result)


def test_every_result_contains_all_invariants(request_factory, width_request):
    result = calculate(request_factory(width=width_request()))
    assert [item.number for item in result.invariant_trace] == list(range(1, 26))
    assert all(item.state for item in result.invariant_trace)


def test_deterministic_result(request_factory, width_request):
    request = request_factory(width=width_request(value=48, gauge_count="21.5"))
    assert calculate(request) == calculate(request)
