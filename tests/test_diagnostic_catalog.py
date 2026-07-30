from __future__ import annotations

from dataclasses import replace

import pytest

from yarnai_calculation import (
    Axis,
    CenterType,
    Direction,
    EndPhase,
    FixedComponent,
    FunctionalCategory,
    GaugeInput,
    GaugeMeasurement,
    GaugeMethod,
    GaugeSource,
    MeasurementState,
    Parity,
    Part,
    PatternClass,
    ProcessingState,
    ResultStatus,
    SizeKind,
    StructuralConstraints,
    SwatchMode,
    ToleranceMode,
    ToleranceRule,
    TriState,
    calculate,
)


def all_codes(result):
    return {item.code for item in (*result.errors, *result.warnings, *result.clarifications)}


def assert_code(request, code, status=None):
    result = calculate(request)
    assert code in all_codes(result)
    if status is not None:
        assert result.status is status
    return result


def measurement_gauge(context, *, counts=(20, 20, 20), lengths=(10, 10, 10), total=14, margins=TriState.YES):
    return GaugeInput(
        method=GaugeMethod.MEASUREMENTS,
        source=GaugeSource.PERSONAL_SWATCH,
        measurements=tuple(GaugeMeasurement(count, length) for count, length in zip(counts, lengths)),
        total_swatch_size=total,
        margins_outside_zone=margins,
        context=context,
    )


def test_each_input_error_has_an_executable_case(
    request_factory, width_request, height_request, ready_gauge, swatch_context
):
    base_width = width_request()
    base_request = request_factory(width=base_width)
    cases = {
        "ОШ-01": replace(base_request, zone_pattern=None),
        "ОШ-02": replace(base_request, axes=frozenset()),
        "ОШ-03": replace(base_request, width=replace(base_width, value="NaN")),
        "ОШ-04": replace(base_request, width=replace(base_width, value=0)),
        "ОШ-05": replace(base_request, width=replace(base_width, size_kind=SizeKind.MEASUREMENT, value=5, ease=-6)),
        "ОШ-06": replace(base_request, width=replace(base_width, size_kind=SizeKind.MEASUREMENT, ease=None)),
        "ОШ-07": replace(base_request, width=replace(base_width, ease=1)),
        "ОШ-08": replace(base_request, width=replace(base_width, unit="yard")),
        "ОШ-09": replace(base_request, width=replace(base_width, gauge=None)),
        "ОШ-10": replace(base_request, width=replace(base_width, gauge=ready_gauge(0))),
        "ОШ-11": replace(
            base_request,
            width=replace(
                base_width,
                gauge=measurement_gauge(swatch_context, counts=(None, 20, 20)),
            ),
        ),
        "ОШ-12": replace(
            base_request,
            width=replace(
                base_width,
                gauge=measurement_gauge(swatch_context, counts=(20, 20), lengths=(10, 10)),
            ),
        ),
        "ОШ-13": replace(
            base_request,
            width=replace(base_width, gauge=measurement_gauge(swatch_context, total=8)),
        ),
        "ОШ-14": replace(
            base_request,
            width=replace(
                base_width,
                gauge=replace(
                    measurement_gauge(swatch_context),
                    ready_count=20,
                    base_length=10,
                ),
            ),
        ),
        "ОШ-15": replace(
            base_request,
            width=replace(base_width, gauge=replace(ready_gauge(20), context=None)),
        ),
        "ОШ-16": replace(
            base_request,
            width=replace(base_width, fixed_components=(FixedComponent("edge", "1.5", 1),)),
        ),
        "ОШ-17": replace(base_request, width=replace(base_width, repeat=0)),
        "ОШ-18": replace(
            base_request,
            width=replace(base_width, fixed_components=(FixedComponent("edge", -1, 0),)),
        ),
        "ОШ-19": replace(
            base_request,
            width=replace(base_width, fixed_components=(FixedComponent("edge", 1, 2),)),
        ),
        "ОШ-20": replace(base_request, width=replace(base_width, declared_fixed_on_needle=2)),
        "ОШ-21": replace(
            base_request,
            width=replace(
                base_width,
                constraints=StructuralConstraints(
                    parity=Parity.EVEN,
                    center=CenterType.STITCH,
                    centered_part=Part.ALL,
                ),
            ),
        ),
        "ОШ-22": replace(
            base_request,
            width=replace(base_width, constraints=StructuralConstraints(sectors=0)),
        ),
        "ОШ-23": replace(
            base_request,
            width=replace(
                base_width,
                tolerance=ToleranceRule(
                    mode=ToleranceMode.ABSOLUTE,
                    absolute=-1,
                    source="project",
                ),
            ),
        ),
        "ОШ-24": replace(
            base_request,
            width=replace(
                base_width,
                tolerance=ToleranceRule(
                    mode=ToleranceMode.ABSOLUTE,
                    absolute=1,
                    relative_percent=2,
                    source="project",
                ),
            ),
        ),
        "ОШ-25": replace(
            base_request,
            width=replace(
                base_width,
                size_kind=SizeKind.MEASUREMENT,
                value=50,
                ease=2,
                explicit_finished_size=53,
            ),
        ),
        "ОШ-26": request_factory(
            axes=(Axis.HEIGHT,),
            height=replace(height_request(), start_point=None),
        ),
        "ОШ-27": request_factory(
            axes=(Axis.HEIGHT,),
            height=replace(height_request(), row_counting_rule=""),
        ),
        "ОШ-28": replace(
            base_request,
            width=replace(
                base_width,
                tolerance=ToleranceRule(mode=ToleranceMode.ABSOLUTE, absolute=1),
            ),
        ),
    }
    assert set(cases) == {f"ОШ-{number:02d}" for number in range(1, 29)}
    for code, request in cases.items():
        result = assert_code(request, code, ResultStatus.INPUT_ERROR)
        assert not result.axes


def test_each_scope_code_has_an_executable_case(request_factory, width_request):
    base_width = width_request()
    component = FixedComponent("edge", 1, 1, same_gauge=TriState.NO)
    cases = {
        "ОБЛ-01": request_factory(width=base_width, pattern_class=PatternClass.VARIABLE_OR_UNKNOWN),
        "ОБЛ-02": request_factory(width=base_width, pattern_class=PatternClass.COMPOSITE_ROW),
        "ОБЛ-03": request_factory(width=base_width, zone_homogeneous=TriState.NO),
        "ОБЛ-04": request_factory(width=base_width, out_of_scope_features=frozenset({"shaping"})),
        "ОБЛ-05": request_factory(width=base_width, out_of_scope_features=frozenset({"short_rows"})),
        "ОБЛ-06": request_factory(width=base_width, out_of_scope_features=frozenset({"joining_parts"})),
        "ОБЛ-07": request_factory(width=base_width, out_of_scope_features=frozenset({"flat_to_round_conversion"})),
        "ОБЛ-08": request_factory(width=base_width, out_of_scope_features=frozenset({"stretch_or_safety"})),
        "ОБЛ-09": request_factory(width=replace(base_width, repeat=4, partial_repeat=TriState.YES)),
        "ОБЛ-10": request_factory(width=replace(base_width, fixed_components=(component,))),
    }
    for code, request in cases.items():
        result = assert_code(request, code, ResultStatus.OUT_OF_SCOPE)
        assert not result.axes


def test_each_impossible_code_has_an_executable_case(
    request_factory, width_request, height_request
):
    cases = {
        "НЕВ-01": request_factory(
            width=width_request(
                value=5,
                fixed_components=(FixedComponent("fixed", 12, 12),),
            )
        ),
        "НЕВ-02": request_factory(
            axes=(Axis.HEIGHT,),
            height=height_request(value=1, fixed_start_rows=2, fixed_end_rows=2),
        ),
        "НЕВ-03": request_factory(
            width=width_request(
                repeat=2,
                partial_repeat=TriState.NO,
                fixed_components=(FixedComponent("fixed", 1, 1),),
                constraints=StructuralConstraints(parity=Parity.EVEN),
            )
        ),
        "НЕВ-04": request_factory(
            width=width_request(
                repeat=2,
                partial_repeat=TriState.NO,
                constraints=StructuralConstraints(
                    center=CenterType.STITCH,
                    centered_part=Part.VARIABLE,
                ),
            )
        ),
        "НЕВ-05": request_factory(
            width=width_request(
                value=5,
                direction=Direction.NOT_MORE,
                repeat=10,
                minimum_repeats=10,
                partial_repeat=TriState.NO,
            )
        ),
    }
    for code, request in cases.items():
        result = assert_code(request, code, ResultStatus.IMPOSSIBLE)
        assert not result.final


def test_each_warning_has_an_executable_case(
    request_factory, width_request, ready_gauge, swatch_context
):
    base_width = width_request()
    base_context = swatch_context

    def context_case(**changes):
        context = replace(base_context, **changes)
        return request_factory(width=replace(base_width, gauge=replace(ready_gauge(20), context=context)))

    different_fabric = replace(base_context.fabric, yarn="different yarn")
    cases = {
        "ПР-01": request_factory(
            width=replace(base_width, gauge=measurement_gauge(base_context, lengths=(8, 8, 8), total=12))
        ),
        "ПР-02": request_factory(
            width=replace(base_width, gauge=measurement_gauge(base_context, margins=TriState.NO))
        ),
        "ПР-03": context_case(off_needles=TriState.NO),
        "ПР-04": context_case(processing_state=ProcessingState.BEFORE),
        "ПР-05": context_case(fully_dry=TriState.NO),
        "ПР-06": context_case(rest_hours=0),
        "ПР-07": context_case(measurement_state=MeasurementState.EXPLICIT_STRETCH),
        "ПР-08": request_factory(
            width=replace(base_width, gauge=replace(ready_gauge(20), source=GaugeSource.LABEL))
        ),
        "ПР-09": request_factory(
            width=replace(
                base_width,
                gauge=replace(ready_gauge(20), source=GaugeSource.LABEL, source_measurement_count=None),
            )
        ),
        "ПР-10": request_factory(
            width=replace(
                base_width,
                gauge=measurement_gauge(base_context, counts=(20, 21, "20.5")),
            )
        ),
        "ПР-11": context_case(mode=SwatchMode.ROUND),
        "ПР-12": context_case(fabric=different_fabric),
        "ПР-13": context_case(heavy_or_large=TriState.YES),
        "ПР-14": request_factory(
            width=replace(base_width, repeat=6, partial_repeat=TriState.NO)
        ),
        "ПР-15": request_factory(
            width=replace(base_width, repeat=6, partial_repeat=TriState.NO)
        ),
        "ПР-16": request_factory(
            width=width_request(
                gauge_count="20.4",
                repeat=6,
                partial_repeat=TriState.NO,
                fixed_components=(FixedComponent("fixed", 2, 2),),
            )
        ),
        "ПР-17": request_factory(
            width=replace(base_width, repeat=12, partial_repeat=TriState.NO)
        ),
        "ПР-18": request_factory(
            width=replace(
                base_width,
                repeat=12,
                partial_repeat=TriState.NO,
                tolerance=ToleranceRule(
                    mode=ToleranceMode.ABSOLUTE,
                    absolute="0.5",
                    source="project",
                ),
            )
        ),
        "ПР-19": request_factory(
            width=replace(
                base_width,
                size_kind=SizeKind.MEASUREMENT,
                ease="0.2",
            )
        ),
        "ПР-20": request_factory(
            width=replace(base_width, repeat=8, partial_repeat=TriState.NO)
        ),
        "ПР-21": request_factory(
            width=replace(base_width, repeat=6, partial_repeat=TriState.NO)
        ),
        "ПР-22": request_factory(
            width=base_width,
            explicit_source_rule="round all repeats down",
            source_rule_matches_canon=False,
            source_rule_source="pattern",
        ),
        "ПР-23": request_factory(
            width=replace(base_width, size_kind=SizeKind.MEASUREMENT, value=56, ease=-6),
            functional_category=FunctionalCategory.NEGATIVE_EASE,
        ),
        "ПР-24": request_factory(width=base_width, functional_category=FunctionalCategory.CRITICAL_OPENING),
        "ПР-25": request_factory(width=base_width, functional_category=FunctionalCategory.MEDICAL_OR_ORTHOPEDIC),
        "ПР-26": request_factory(width=base_width, functional_category=FunctionalCategory.UNKNOWN),
    }
    assert set(cases) == {f"ПР-{number:02d}" for number in range(1, 27)}
    for code, request in cases.items():
        result = assert_code(request, code)
        assert result.status in {
            ResultStatus.READY_WITH_WARNINGS,
            ResultStatus.CONFIRMATION_REQUIRED,
        }


def test_all_six_statuses_are_reachable(
    request_factory, width_request
):
    ready = calculate(request_factory(width=width_request()))
    warning = calculate(
        request_factory(
            width=replace(
                width_request(),
                size_kind=SizeKind.MEASUREMENT,
                value=56,
                ease=-6,
            ),
            functional_category=FunctionalCategory.NEGATIVE_EASE,
        )
    )
    confirmation = calculate(
        request_factory(
            width=replace(width_request(), repeat=8, partial_repeat=TriState.NO)
        )
    )
    input_error = calculate(request_factory(width=replace(width_request(), value=0)))
    impossible = calculate(
        request_factory(
            width=width_request(
                value=5,
                fixed_components=(FixedComponent("fixed", 12, 12),),
            )
        )
    )
    out_of_scope = calculate(
        request_factory(width=width_request(), out_of_scope_features=frozenset({"shaping"}))
    )
    assert {
        ready.status,
        warning.status,
        confirmation.status,
        input_error.status,
        impossible.status,
        out_of_scope.status,
    } == set(ResultStatus)


@pytest.mark.parametrize(
    ("field", "request_change"),
    [
        ("functional_category", {"functional_category": "not-a-category"}),
        ("knitting_mode", {"knitting_mode": "diagonal"}),
        ("pattern_class", {"pattern_class": "mystery"}),
        ("zone_homogeneous", {"zone_homogeneous": "maybe"}),
    ],
)
def test_unknown_enumerated_request_values_are_input_errors(
    request_factory, width_request, field, request_change
):
    result = calculate(request_factory(width=width_request(), **request_change))
    assert result.status is ResultStatus.INPUT_ERROR
    assert any(item.field == field for item in result.errors)


def test_explicit_nonordinary_row_unit_is_out_of_scope(
    request_factory, height_request
):
    result = calculate(
        request_factory(
            axes=(Axis.HEIGHT,),
            height=replace(height_request(), row_counting_rule="garter ridges"),
        )
    )
    assert result.status is ResultStatus.OUT_OF_SCOPE
    assert "ОБЛ-02" in all_codes(result)
