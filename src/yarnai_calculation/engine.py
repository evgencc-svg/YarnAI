from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from .candidates import (
    height_allowed_pattern,
    make_candidate,
    neighbor_values,
    width_allowed_pattern,
    with_tolerance,
)
from .diagnostics import diagnostic
from .gauge import assess_gauge
from .invariants import build_trace
from .models import (
    Axis,
    AxisResult,
    CalculationRequest,
    CalculationResult,
    Candidate,
    CenterType,
    Diagnostic,
    DiagnosticClass,
    Direction,
    EndPhase,
    FunctionalCategory,
    GaugeAssessment,
    InvariantState,
    Parity,
    Part,
    ResultStatus,
    SizeKind,
    ToleranceMode,
    TriState,
    Unit,
)
from .numeric import decimal_or_none, enum_value, to_cm
from .validation import validate_request, validate_scope

CANON_VERSION = "1.0"
SPECIFICATION_VERSION = "1.0"


def calculate(request: CalculationRequest) -> CalculationResult:
    """Calculate stitch and/or row counts for a validated YarnAI request.

    The function is the package's official computation entry point.  It does
    not raise for domain validation failures: input, scope, feasibility, and
    confirmation outcomes are represented by ``CalculationResult.status`` and
    the result's diagnostic collections.

    Args:
        request: Complete calculation request, including the requested axes,
            gauge data, fabric context, and structural constraints.

    Returns:
        An immutable calculation result containing normalized inputs, gauge
        assessments, per-axis candidates, diagnostics, explanations, and the
        invariant trace.
    """
    errors = validate_request(request)
    if errors:
        return _finish(
            request=request,
            status=ResultStatus.INPUT_ERROR,
            final=False,
            normalized={},
            gauges={},
            axes={},
            messages=errors,
            explanations=("Вычисление остановлено до применения формул: входной контракт не выполнен.",),
        )
    scope = validate_scope(request)
    if scope:
        return _finish(
            request=request,
            status=ResultStatus.OUT_OF_SCOPE,
            final=False,
            normalized={},
            gauges={},
            axes={},
            messages=scope,
            explanations=("Линейный расчёт не выполнялся: запрос находится вне области первой версии.",),
        )

    requested_axes = tuple(sorted((Axis(value) for value in request.axes), key=lambda item: item.value))
    normalized: dict = {
        "axes": tuple(axis.value for axis in requested_axes),
        "functional_category": str(request.functional_category),
        "original_units_preserved": True,
        "original_request": request,
        "normative_profile": {
            "canon_version": CANON_VERSION,
            "specification_version": SPECIFICATION_VERSION,
        },
    }
    gauges: dict[Axis, GaugeAssessment] = {}
    axis_results: dict[Axis, AxisResult] = {}
    messages: list[Diagnostic] = []
    confirmation_required = False

    for axis in requested_axes:
        axis_request = request.width if axis is Axis.WIDTH else request.height
        assert axis_request is not None and axis_request.gauge is not None
        assessment, gauge_warnings, gauge_requires_confirmation = assess_gauge(
            axis_request.gauge, axis, request.fabric_context
        )
        gauges[axis] = assessment
        messages.extend(gauge_warnings)
        confirmation_required |= gauge_requires_confirmation
        if axis is Axis.WIDTH:
            target, measurement, ease = _width_target(request)
            normalized["width"] = {
                "original_value": decimal_or_none(request.width.value),
                "original_unit": str(request.width.unit),
                "size_kind": str(request.width.size_kind),
                "measurement_cm": measurement,
                "ease_cm": ease,
                "target_cm": target,
                "direction": str(request.width.direction),
            }
            outcome, outcome_messages, decision = _calculate_width(request, assessment, target, measurement, ease)
        else:
            target = to_cm(request.height.value, request.height.unit)
            normalized["height"] = {
                "original_value": decimal_or_none(request.height.value),
                "original_unit": str(request.height.unit),
                "target_cm": target,
                "direction": str(request.height.direction),
                "start_point": request.height.start_point,
                "end_point": request.height.end_point,
            }
            outcome, outcome_messages, decision = _calculate_height(request, assessment, target)
        messages.extend(outcome_messages)
        confirmation_required |= decision
        if outcome is not None:
            axis_results[axis] = outcome

    _add_functional_warnings(request, messages)
    category = enum_value(FunctionalCategory, request.functional_category)
    if category in {
        FunctionalCategory.CRITICAL_OPENING,
        FunctionalCategory.MEDICAL_OR_ORTHOPEDIC,
        FunctionalCategory.PROTECTIVE,
        FunctionalCategory.CHILD_SENSITIVE,
        FunctionalCategory.ANIMAL_CLOTHING,
        FunctionalCategory.EXACT_COVER,
        FunctionalCategory.UNKNOWN,
    }:
        confirmation_required = True
    if request.explicit_source_rule and request.source_rule_matches_canon is not True:
        messages.append(diagnostic("ПР-22", field="explicit_source_rule", stage=14))
        confirmation_required = True

    messages = _deduplicate(messages)
    impossible = [item for item in messages if item.kind is DiagnosticClass.IMPOSSIBLE]
    if impossible:
        status = ResultStatus.IMPOSSIBLE
        final = False
    elif confirmation_required:
        status = ResultStatus.CONFIRMATION_REQUIRED
        final = False
        axis_results = {axis: _make_provisional(result) for axis, result in axis_results.items()}
    elif any(item.kind is DiagnosticClass.WARNING for item in messages):
        status = ResultStatus.READY_WITH_WARNINGS
        final = all(assessment.canonical for assessment in gauges.values())
    else:
        status = ResultStatus.READY
        final = all(assessment.canonical for assessment in gauges.values())

    explanations = _explain(normalized, gauges, axis_results, messages)
    return _finish(
        request=request,
        status=status,
        final=final,
        normalized=normalized,
        gauges=gauges,
        axes=axis_results,
        messages=messages,
        explanations=explanations,
    )


def _width_target(request: CalculationRequest) -> tuple[Decimal, Decimal | None, Decimal | None]:
    width = request.width
    assert width is not None
    value = to_cm(width.value, width.unit)
    if enum_value(SizeKind, width.size_kind) is SizeKind.MEASUREMENT:
        ease = to_cm(width.ease, width.unit)
        return value + ease, value, ease
    return value, None, None


def _calculate_width(
    request: CalculationRequest,
    gauge: GaugeAssessment,
    target: Decimal,
    measurement: Decimal | None,
    ease: Decimal | None,
) -> tuple[AxisResult | None, list[Diagnostic], bool]:
    width = request.width
    assert width is not None
    messages: list[Diagnostic] = []
    density = gauge.density_per_cm
    ideal = target * density
    fixed_working = sum(int(decimal_or_none(item.on_needle)) for item in width.fixed_components)
    fixed_visible = sum((decimal_or_none(item.visible) for item in width.fixed_components), Decimal(0))
    ideal_variable = ideal - fixed_visible
    if ideal_variable < 0:
        messages.append(diagnostic("НЕВ-01", axis=Axis.WIDTH, stage=11))
        return None, messages, False
    repeat = int(decimal_or_none(width.repeat)) if width.repeat is not None else None
    minimum_repeats = int(decimal_or_none(width.minimum_repeats) or 0)
    residues, period = width_allowed_pattern(repeat, minimum_repeats, fixed_working, width.constraints)
    if not residues:
        parity = enum_value(Parity, width.constraints.parity)
        code = "НЕВ-03" if parity is not Parity.ANY and width.constraints.center == CenterType.NONE and width.constraints.sectors in (None, 1) else "НЕВ-04"
        messages.append(diagnostic(code, axis=Axis.WIDTH, stage=12))
        return None, messages, False
    lower_value, upper_value = neighbor_values(ideal_variable, residues, period)
    direction = enum_value(Direction, width.direction)
    original_unit = enum_value(Unit, width.unit)
    assert direction is not None
    assert original_unit is not None
    lower = (
        make_candidate(Axis.WIDTH, lower_value, fixed_working, fixed_visible, repeat, target, density, ideal_variable, direction, original_unit)
        if lower_value is not None else None
    )
    upper = (
        make_candidate(Axis.WIDTH, upper_value, fixed_working, fixed_visible, repeat, target, density, ideal_variable, direction, original_unit)
        if upper_value is not None else None
    )
    candidates = _unique_candidates(lower, upper)
    selected, reason, rounding, tie = _select(
        lower, upper, direction, _has_width_structure(width), ease, hard_minimum=direction is Direction.NOT_LESS
    )
    if selected is None and not tie:
        messages.append(diagnostic("НЕВ-05", axis=Axis.WIDTH, stage=14))
        return None, messages, False
    if repeat and ideal_variable % repeat:
        messages.append(diagnostic("ПР-14", axis=Axis.WIDTH, stage=14, parameters={"ideal": ideal, "repeat": repeat}))
    ordinary = int(ideal.to_integral_value(rounding=ROUND_HALF_UP))
    if selected is not None and selected.working_count != ordinary and _has_width_structure(width):
        messages.append(diagnostic("ПР-15", axis=Axis.WIDTH, stage=14))
    if tie:
        messages.append(diagnostic("ПР-20", axis=Axis.WIDTH, stage=14))
    result, tolerance_messages, tolerance_decision = _control(
        axis=Axis.WIDTH,
        target=target,
        density=density,
        lower=lower,
        upper=upper,
        candidates=candidates,
        selected=selected,
        reason=reason,
        rounding=rounding,
        tolerance=width.tolerance,
        fixed_working=fixed_working,
        fixed_visible=fixed_visible,
        ideal=ideal,
        ideal_variable=ideal_variable,
        repeat=repeat,
        requested_ease=ease,
        measurement=measurement,
        force_decision=tie,
    )
    messages.extend(tolerance_messages)
    return result, messages, tolerance_decision or tie


def _calculate_height(
    request: CalculationRequest,
    gauge: GaugeAssessment,
    target: Decimal,
) -> tuple[AxisResult | None, list[Diagnostic], bool]:
    height = request.height
    assert height is not None
    messages: list[Diagnostic] = []
    density = gauge.density_per_cm
    ideal = target * density
    fixed = int(decimal_or_none(height.fixed_start_rows) or 0) + int(decimal_or_none(height.fixed_end_rows) or 0)
    ideal_variable = ideal - Decimal(fixed)
    if ideal_variable < 0:
        messages.append(diagnostic("НЕВ-02", axis=Axis.HEIGHT, stage=11))
        return None, messages, False
    repeat = int(decimal_or_none(height.repeat)) if height.repeat is not None else None
    phase = enum_value(EndPhase, height.end_phase) or EndPhase.ANY
    pattern_phase = phase if phase is not EndPhase.SOURCE else EndPhase.ANY
    residues, period = height_allowed_pattern(repeat, fixed, pattern_phase)
    if not residues:
        messages.append(diagnostic("НЕВ-04", axis=Axis.HEIGHT, stage=12))
        return None, messages, False
    lower_value, upper_value = neighbor_values(ideal_variable, residues, period)
    direction = enum_value(Direction, height.direction)
    original_unit = enum_value(Unit, height.unit)
    assert direction is not None
    assert original_unit is not None
    lower = make_candidate(Axis.HEIGHT, lower_value, fixed, Decimal(fixed), repeat, target, density, ideal_variable, direction, original_unit) if lower_value is not None else None
    upper = make_candidate(Axis.HEIGHT, upper_value, fixed, Decimal(fixed), repeat, target, density, ideal_variable, direction, original_unit) if upper_value is not None else None
    candidates = _unique_candidates(lower, upper)
    structural = repeat is not None or phase is not EndPhase.ANY
    selected, reason, rounding, tie = _select(lower, upper, direction, structural, None, direction is Direction.NOT_LESS)
    if selected is None and not tie:
        messages.append(diagnostic("НЕВ-05", axis=Axis.HEIGHT, stage=14))
        return None, messages, False
    if repeat and ideal_variable % repeat:
        messages.append(diagnostic("ПР-14", axis=Axis.HEIGHT, stage=14))
    if tie:
        messages.append(diagnostic("ПР-20", axis=Axis.HEIGHT, stage=14))
    result, tolerance_messages, tolerance_decision = _control(
        axis=Axis.HEIGHT,
        target=target,
        density=density,
        lower=lower,
        upper=upper,
        candidates=candidates,
        selected=selected,
        reason=reason,
        rounding=rounding,
        tolerance=height.tolerance,
        fixed_working=fixed,
        fixed_visible=Decimal(fixed),
        ideal=ideal,
        ideal_variable=ideal_variable,
        repeat=repeat,
        force_decision=tie or phase is EndPhase.SOURCE,
    )
    messages.extend(tolerance_messages)
    if phase is EndPhase.SOURCE:
        messages.append(diagnostic("ПР-22", axis=Axis.HEIGHT, field="height.source_phase_rule", stage=14))
    return result, messages, tolerance_decision or tie or phase is EndPhase.SOURCE


def _select(
    lower: Candidate | None,
    upper: Candidate | None,
    direction: Direction,
    structural: bool,
    ease: Decimal | None,
    hard_minimum: bool,
) -> tuple[Candidate | None, str | None, str | None, bool]:
    if lower is not None and lower.position == "exact":
        return lower, "Точное допустимое количество", "exact", False
    if upper is not None and upper.position == "exact":
        return upper, "Точное допустимое количество", "exact", False
    if direction is Direction.NOT_LESS:
        return (upper, "Жёсткое ограничение «не меньше»", "up", False) if upper else (None, None, None, False)
    if direction is Direction.NOT_MORE:
        return (lower, "Жёсткое ограничение «не больше»", "down", False) if lower else (None, None, None, False)
    if lower is None:
        return upper, "Ближайший допустимый размер", "up", False
    if upper is None:
        return lower, "Ближайший допустимый размер", "down", False
    if lower.absolute_error_cm < upper.absolute_error_cm:
        return lower, "Минимальное абсолютное отклонение", "down", False
    if upper.absolute_error_cm < lower.absolute_error_cm:
        return upper, "Минимальное абсолютное отклонение", "up", False
    if structural:
        return None, "Равноудалённые структурные варианты", None, True
    if ease is not None and ease < 0:
        return lower, "Точная половина при отрицательной прибавке", "down", False
    return upper, "Точная половина: округление вверх", "up", False


def _control(
    *,
    axis: Axis,
    target: Decimal,
    density: Decimal,
    lower: Candidate | None,
    upper: Candidate | None,
    candidates: tuple[Candidate, ...],
    selected: Candidate | None,
    reason: str | None,
    rounding: str | None,
    tolerance,
    fixed_working: int,
    fixed_visible: Decimal,
    ideal: Decimal,
    ideal_variable: Decimal,
    repeat: int | None,
    requested_ease: Decimal | None = None,
    measurement: Decimal | None = None,
    force_decision: bool = False,
) -> tuple[AxisResult, list[Diagnostic], bool]:
    messages: list[Diagnostic] = []
    mode = enum_value(ToleranceMode, tolerance.mode) or ToleranceMode.YARNAI
    first: Decimal | None = None
    second: Decimal | None = None
    if mode is ToleranceMode.YARNAI:
        first = max(Decimal(1) / density, Decimal("0.01") * target)
        second = max(Decimal(2) / density, Decimal("0.02") * target)
    elif mode is ToleranceMode.ABSOLUTE:
        first = to_cm(tolerance.absolute, tolerance.absolute_unit)
    else:
        first = decimal_or_none(tolerance.relative_percent)

    controlled: list[Candidate] = []
    decision = force_decision
    for candidate in candidates:
        if mode is ToleranceMode.YARNAI:
            zone = "normal" if candidate.absolute_error_cm <= first else (
                "warning" if candidate.absolute_error_cm <= second else "decision"
            )
        elif mode is ToleranceMode.ABSOLUTE:
            zone = "within" if candidate.absolute_error_cm <= first else "exceeded"
        else:
            zone = "within" if abs(candidate.relative_error_percent) <= first else "exceeded"
        controlled.append(with_tolerance(candidate, zone))
    by_count = {item.working_count: item for item in controlled}
    lower = by_count.get(lower.working_count) if lower else None
    upper = by_count.get(upper.working_count) if upper else None
    selected = by_count.get(selected.working_count) if selected else None
    if selected is not None:
        if mode is ToleranceMode.YARNAI and selected.tolerance_zone == "warning":
            messages.append(diagnostic("ПР-16", axis=axis, stage=16))
        elif mode is ToleranceMode.YARNAI and selected.tolerance_zone == "decision":
            messages.append(diagnostic("ПР-17", axis=axis, stage=16))
            decision = True
        elif mode is not ToleranceMode.YARNAI and selected.tolerance_zone == "exceeded":
            messages.append(diagnostic("ПР-18", axis=axis, stage=16))
            decision = True
    if selected is None and controlled and mode is not ToleranceMode.YARNAI:
        if all(item.tolerance_zone == "exceeded" for item in controlled):
            messages.append(diagnostic("ПР-18", axis=axis, stage=16))
            decision = True
    step_cm = Decimal(repeat) / density if repeat else None
    if step_cm is not None and mode is ToleranceMode.YARNAI and step_cm > first:
        messages.append(diagnostic("ПР-21", axis=axis, stage=16))
    actual_ease = selected.actual_size_cm - measurement if selected is not None and measurement is not None else None
    ease_change = actual_ease - requested_ease if actual_ease is not None and requested_ease is not None else None
    if ease_change is not None and ease_change != 0:
        messages.append(diagnostic("ПР-19", axis=axis, stage=17))
    result = AxisResult(
        axis=axis,
        target_size_cm=target,
        ideal_count=ideal,
        ideal_variable_count=ideal_variable,
        fixed_working_count=fixed_working,
        fixed_visible_count=fixed_visible,
        lower_candidate=lower,
        upper_candidate=upper,
        candidates=tuple(controlled),
        selected_candidate=selected,
        provisional_candidate=None,
        selection_reason=reason,
        rounding_direction=rounding,
        tolerance_first=first,
        tolerance_second=second,
        tolerance_mode=mode,
        requested_ease_cm=requested_ease,
        actual_ease_cm=actual_ease,
        ease_change_cm=ease_change,
        repeat_step_cm=step_cm,
    )
    return result, messages, decision


def _has_width_structure(width) -> bool:
    constraints = width.constraints
    return (
        width.repeat is not None
        or enum_value(Parity, constraints.parity) not in (None, Parity.ANY)
        or enum_value(CenterType, constraints.center) not in (None, CenterType.NONE)
        or (decimal_or_none(constraints.sectors) or 1) > 1
    )


def _unique_candidates(*items: Candidate | None) -> tuple[Candidate, ...]:
    result: list[Candidate] = []
    seen: set[int] = set()
    for item in items:
        if item is not None and item.working_count not in seen:
            seen.add(item.working_count)
            result.append(item)
    return tuple(result)


def _make_provisional(result: AxisResult) -> AxisResult:
    if result.selected_candidate is None:
        return result
    return AxisResult(
        **{
            field: getattr(result, field)
            for field in result.__dataclass_fields__
            if field not in {"selected_candidate", "provisional_candidate"}
        },
        selected_candidate=None,
        provisional_candidate=result.selected_candidate,
    )


def _add_functional_warnings(request: CalculationRequest, messages: list[Diagnostic]) -> None:
    category = enum_value(FunctionalCategory, request.functional_category)
    if request.width and enum_value(SizeKind, request.width.size_kind) is SizeKind.MEASUREMENT:
        ease = decimal_or_none(request.width.ease)
        if ease is not None and ease < 0:
            messages.append(diagnostic("ПР-23", axis=Axis.WIDTH, field="width.ease", stage=18))
    if category is FunctionalCategory.CRITICAL_OPENING:
        messages.append(diagnostic("ПР-24", field="functional_category", stage=18))
    if category in {
        FunctionalCategory.MEDICAL_OR_ORTHOPEDIC,
        FunctionalCategory.PROTECTIVE,
        FunctionalCategory.CHILD_SENSITIVE,
        FunctionalCategory.ANIMAL_CLOTHING,
        FunctionalCategory.EXACT_COVER,
    }:
        messages.append(diagnostic("ПР-25", field="functional_category", stage=18))
    if category is FunctionalCategory.UNKNOWN:
        messages.append(diagnostic("ПР-26", field="functional_category", stage=18))


def _explain(normalized, gauges, axes, messages) -> tuple[str, ...]:
    lines = ["Нормативные версии зафиксированы: канон 1.0, спецификация расчёта 1.0."]
    for axis in sorted(axes, key=lambda item: item.value):
        result = axes[axis]
        gauge = gauges[axis]
        lines.append(
            f"{axis.value}: целевой размер {result.target_size_cm} см; "
            f"плотность {gauge.density_per_cm} на см; идеальное количество {result.ideal_count}."
        )
        chosen = result.selected_candidate or result.provisional_candidate
        if chosen is not None:
            lines.append(
                f"{axis.value}: {result.selection_reason}; рабочее количество {chosen.working_count}; "
                f"фактический размер {chosen.actual_size_cm} см; отклонение {chosen.signed_error_cm} см."
            )
        else:
            lines.append(f"{axis.value}: окончательный кандидат отсутствует; показаны допустимые варианты.")
    if messages:
        lines.append("Ограничения применимости: " + ", ".join(item.code for item in messages) + ".")
    lines.append("Источники: KNITTING_MATH_CANON.md §§1–7; CALCULATION_ENGINE_SPEC.md §§1–6.")
    return tuple(lines)


def _finish(
    *,
    request: CalculationRequest,
    status: ResultStatus,
    final: bool,
    normalized: dict,
    gauges: dict,
    axes: dict,
    messages: list[Diagnostic],
    explanations: tuple[str, ...],
) -> CalculationResult:
    messages = _deduplicate(messages)
    errors = tuple(item for item in messages if item.kind in {
        DiagnosticClass.INPUT_ERROR, DiagnosticClass.OUT_OF_SCOPE, DiagnosticClass.IMPOSSIBLE
    })
    warnings = tuple(item for item in messages if item.kind is DiagnosticClass.WARNING)
    clarifications = tuple(item for item in messages if item.kind is DiagnosticClass.CLARIFICATION)
    trace = build_trace(request, status, messages, bool(axes), status is ResultStatus.CONFIRMATION_REQUIRED)
    return CalculationResult(
        status=status,
        final=final,
        canon_version=CANON_VERSION,
        specification_version=SPECIFICATION_VERSION,
        normalized_inputs=normalized,
        gauges=gauges,
        axes=axes,
        errors=errors,
        warnings=warnings,
        clarifications=clarifications,
        explanation=explanations,
        invariant_trace=trace,
    )


def _deduplicate(messages: list[Diagnostic]) -> list[Diagnostic]:
    seen: set[tuple] = set()
    result: list[Diagnostic] = []
    for message in messages:
        key = (message.code, message.axis, message.field)
        if key not in seen:
            seen.add(key)
            result.append(message)
    return result
