from __future__ import annotations

from decimal import Decimal
from typing import Any

from .diagnostics import diagnostic
from .models import (
    Axis,
    CalculationRequest,
    CenterType,
    Diagnostic,
    Direction,
    EndPhase,
    FunctionalCategory,
    GaugeInput,
    GaugeMethod,
    GaugeSource,
    KnittingMode,
    MeasurementState,
    Parity,
    Part,
    PatternClass,
    ProcessingState,
    SizeKind,
    SwatchMode,
    ToleranceMode,
    TriState,
    Unit,
)
from .numeric import decimal_or_none, enum_value, is_integer, to_cm


def _missing(errors: list[Diagnostic], value: Any, field: str, axis: Axis | None = None) -> bool:
    if value is None or (isinstance(value, str) and not value.strip()):
        errors.append(diagnostic("ОШ-01", axis=axis, field=field, stage=3))
        return True
    return False


def _number(
    errors: list[Diagnostic],
    value: Any,
    field: str,
    axis: Axis,
    *,
    positive: bool = False,
    nonnegative: bool = False,
    integer: bool = False,
    size: bool = False,
) -> Decimal | None:
    number = decimal_or_none(value)
    if number is None:
        errors.append(diagnostic("ОШ-03", axis=axis, field=field, stage=3))
        return None
    if positive and number <= 0:
        errors.append(diagnostic("ОШ-04" if size else "ОШ-10", axis=axis, field=field, stage=3))
    if nonnegative and number < 0:
        errors.append(diagnostic("ОШ-18", axis=axis, field=field, stage=3))
    if integer and number != number.to_integral_value():
        errors.append(diagnostic("ОШ-16", axis=axis, field=field, stage=3))
    return number


def _unit(errors: list[Diagnostic], value: Any, field: str, axis: Axis) -> bool:
    if enum_value(Unit, value) is None:
        errors.append(diagnostic("ОШ-08", axis=axis, field=field, stage=3, parameters={"unit": value}))
        return False
    return True


def _enum(
    errors: list[Diagnostic],
    enum_type: type,
    value: Any,
    field: str,
    axis: Axis | None = None,
) -> bool:
    if enum_value(enum_type, value) is None:
        errors.append(diagnostic("ОШ-01", axis=axis, field=field, stage=3))
        return False
    return True


def _validate_gauge(gauge: GaugeInput | None, axis: Axis, errors: list[Diagnostic]) -> None:
    if gauge is None:
        errors.append(diagnostic("ОШ-09", axis=axis, field="gauge", stage=3))
        return
    method = enum_value(GaugeMethod, gauge.method)
    if method is None:
        errors.append(diagnostic("ОШ-01", axis=axis, field="gauge.method", stage=3))
        return
    has_measurements = bool(gauge.measurements)
    has_ready = gauge.ready_count is not None or gauge.base_length is not None
    if has_measurements and has_ready:
        errors.append(diagnostic("ОШ-14", axis=axis, field="gauge", stage=3))
    if method is GaugeMethod.MEASUREMENTS:
        if len(gauge.measurements) < 3:
            errors.append(diagnostic("ОШ-12", axis=axis, field="gauge.measurements", stage=3))
        for index, measurement in enumerate(gauge.measurements):
            if measurement.count is None or measurement.length is None:
                errors.append(
                    diagnostic("ОШ-11", axis=axis, field=f"gauge.measurements[{index}]", stage=3)
                )
                continue
            _number(errors, measurement.count, f"gauge.measurements[{index}].count", axis, positive=True)
            _number(errors, measurement.length, f"gauge.measurements[{index}].length", axis, positive=True)
            _unit(errors, measurement.unit, f"gauge.measurements[{index}].unit", axis)
        if gauge.total_swatch_size is None:
            errors.append(diagnostic("ОШ-01", axis=axis, field="gauge.total_swatch_size", stage=3))
        else:
            total = _number(errors, gauge.total_swatch_size, "gauge.total_swatch_size", axis, positive=True)
            total_unit_ok = _unit(errors, gauge.total_swatch_unit, "gauge.total_swatch_unit", axis)
            if total is not None and total_unit_ok:
                total_cm = to_cm(total, gauge.total_swatch_unit)
                for index, measurement in enumerate(gauge.measurements):
                    length = decimal_or_none(measurement.length)
                    if length is not None and enum_value(Unit, measurement.unit) is not None:
                        if to_cm(length, measurement.unit) > total_cm:
                            errors.append(
                                diagnostic("ОШ-13", axis=axis, field=f"gauge.measurements[{index}]", stage=3)
                            )
                            break
        _missing(errors, gauge.margins_outside_zone, "gauge.margins_outside_zone", axis)
    else:
        if gauge.ready_count is None or gauge.base_length is None:
            errors.append(diagnostic("ОШ-09", axis=axis, field="gauge.ready_value", stage=3))
        else:
            _number(errors, gauge.ready_count, "gauge.ready_count", axis, positive=True)
            _number(errors, gauge.base_length, "gauge.base_length", axis, positive=True)
            _unit(errors, gauge.base_unit, "gauge.base_unit", axis)
        if gauge.source_measurement_count is not None:
            _number(
                errors,
                gauge.source_measurement_count,
                "gauge.source_measurement_count",
                axis,
                nonnegative=True,
                integer=True,
            )
    _enum(errors, GaugeSource, gauge.source, "gauge.source", axis)
    if gauge.context is None or gauge.context.fabric is None:
        errors.append(diagnostic("ОШ-15", axis=axis, field="gauge.context", stage=3))
        return
    context = gauge.context
    required_context = {
        "off_needles": context.off_needles,
        "processing_state": context.processing_state,
        "fully_dry": context.fully_dry,
        "measurement_state": context.measurement_state,
        "mode": context.mode,
        "heavy_or_large": context.heavy_or_large,
        "fabric.yarn": context.fabric.yarn,
        "fabric.strands": context.fabric.strands,
        "fabric.strands_description": context.fabric.strands_description,
        "fabric.needle_mm": context.fabric.needle_mm,
        "fabric.needle_type": context.fabric.needle_type,
        "fabric.pattern": context.fabric.pattern,
        "fabric.processing": context.fabric.processing,
    }
    for name, value in required_context.items():
        if value is None or (isinstance(value, str) and not value.strip()):
            errors.append(diagnostic("ОШ-15", axis=axis, field=f"gauge.context.{name}", stage=3))
    _enum(errors, TriState, context.off_needles, "gauge.context.off_needles", axis)
    _enum(errors, ProcessingState, context.processing_state, "gauge.context.processing_state", axis)
    _enum(errors, TriState, context.fully_dry, "gauge.context.fully_dry", axis)
    _enum(errors, MeasurementState, context.measurement_state, "gauge.context.measurement_state", axis)
    _enum(errors, SwatchMode, context.mode, "gauge.context.mode", axis)
    _enum(errors, TriState, context.heavy_or_large, "gauge.context.heavy_or_large", axis)
    if context.rest_hours is not None:
        rest = decimal_or_none(context.rest_hours)
        if rest is None or rest < 0:
            errors.append(diagnostic("ОШ-03", axis=axis, field="gauge.context.rest_hours", stage=3))
    _number(errors, context.fabric.strands, "gauge.context.fabric.strands", axis, positive=True, integer=True)
    _number(errors, context.fabric.needle_mm, "gauge.context.fabric.needle_mm", axis, positive=True)


def _validate_tolerance(tolerance, axis: Axis, errors: list[Diagnostic]) -> None:
    mode = enum_value(ToleranceMode, tolerance.mode)
    if mode is None:
        errors.append(diagnostic("ОШ-01", axis=axis, field="tolerance.mode", stage=3))
        return
    if tolerance.absolute is not None and tolerance.relative_percent is not None:
        errors.append(diagnostic("ОШ-24", axis=axis, field="tolerance", stage=3))
    if mode is ToleranceMode.ABSOLUTE:
        number = decimal_or_none(tolerance.absolute)
        if number is None:
            errors.append(diagnostic("ОШ-03", axis=axis, field="tolerance.absolute", stage=3))
        elif number < 0:
            errors.append(diagnostic("ОШ-23", axis=axis, field="tolerance.absolute", stage=3))
        _unit(errors, tolerance.absolute_unit, "tolerance.absolute_unit", axis)
        if not tolerance.source:
            errors.append(diagnostic("ОШ-28", axis=axis, field="tolerance.source", stage=3))
    elif mode is ToleranceMode.RELATIVE:
        number = decimal_or_none(tolerance.relative_percent)
        if number is None:
            errors.append(diagnostic("ОШ-03", axis=axis, field="tolerance.relative_percent", stage=3))
        elif number < 0:
            errors.append(diagnostic("ОШ-23", axis=axis, field="tolerance.relative_percent", stage=3))
        if not tolerance.source:
            errors.append(diagnostic("ОШ-28", axis=axis, field="tolerance.source", stage=3))


def validate_request(request: CalculationRequest) -> list[Diagnostic]:
    errors: list[Diagnostic] = []
    axes = {enum_value(Axis, axis) for axis in request.axes}
    axes.discard(None)
    if not axes:
        errors.append(diagnostic("ОШ-02", field="axes", stage=2))
    if len(axes) != len(request.axes):
        errors.append(diagnostic("ОШ-02", field="axes", stage=2))
    for field, value in {
        "functional_category": request.functional_category,
        "knitting_mode": request.knitting_mode,
        "zone_pattern": request.zone_pattern,
        "pattern_class": request.pattern_class,
        "zone_homogeneous": request.zone_homogeneous,
        "fabric_context": request.fabric_context,
    }.items():
        _missing(errors, value, field)
    _enum(errors, FunctionalCategory, request.functional_category, "functional_category")
    _enum(errors, KnittingMode, request.knitting_mode, "knitting_mode")
    _enum(errors, PatternClass, request.pattern_class, "pattern_class")
    _enum(errors, TriState, request.zone_homogeneous, "zone_homogeneous")
    if request.fabric_context is not None:
        fabric = request.fabric_context
        for field, value in {
            "fabric_context.yarn": fabric.yarn,
            "fabric_context.strands": fabric.strands,
            "fabric_context.strands_description": fabric.strands_description,
            "fabric_context.needle_mm": fabric.needle_mm,
            "fabric_context.needle_type": fabric.needle_type,
            "fabric_context.pattern": fabric.pattern,
            "fabric_context.mode": fabric.mode,
            "fabric_context.processing": fabric.processing,
        }.items():
            _missing(errors, value, field)
        _enum(errors, KnittingMode, fabric.mode, "fabric_context.mode")
        strands = decimal_or_none(fabric.strands)
        if strands is None or strands < 1 or strands != strands.to_integral_value():
            errors.append(diagnostic("ОШ-03", field="fabric_context.strands", stage=3))
        needle = decimal_or_none(fabric.needle_mm)
        if needle is None or needle <= 0:
            errors.append(diagnostic("ОШ-03", field="fabric_context.needle_mm", stage=3))
    if request.explicit_source_rule and not request.source_rule_source:
        errors.append(diagnostic("ОШ-28", field="source_rule_source", stage=3))

    if Axis.WIDTH in axes:
        width = request.width
        if width is None:
            errors.append(diagnostic("ОШ-01", axis=Axis.WIDTH, field="width", stage=3))
        else:
            kind = enum_value(SizeKind, width.size_kind)
            if kind is None:
                errors.append(diagnostic("ОШ-01", axis=Axis.WIDTH, field="width.size_kind", stage=3))
            value = _number(errors, width.value, "width.value", Axis.WIDTH, positive=True, size=True)
            unit_ok = _unit(errors, width.unit, "width.unit", Axis.WIDTH)
            if enum_value(Direction, width.direction) is None:
                errors.append(diagnostic("ОШ-01", axis=Axis.WIDTH, field="width.direction", stage=3))
            if kind is SizeKind.MEASUREMENT:
                if width.ease is None:
                    errors.append(diagnostic("ОШ-06", axis=Axis.WIDTH, field="width.ease", stage=3))
                else:
                    ease = _number(errors, width.ease, "width.ease", Axis.WIDTH)
                    if value is not None and ease is not None and unit_ok:
                        target = to_cm(value, width.unit) + to_cm(ease, width.unit)
                        if target <= 0:
                            errors.append(
                                diagnostic("ОШ-05", axis=Axis.WIDTH, field="width.ease", stage=6, parameters={"value": target})
                            )
                        if width.explicit_finished_size is not None:
                            explicit = decimal_or_none(width.explicit_finished_size)
                            explicit_unit = width.explicit_finished_unit or width.unit
                            if explicit is not None and enum_value(Unit, explicit_unit) is not None:
                                if to_cm(explicit, explicit_unit) != target:
                                    errors.append(diagnostic("ОШ-25", axis=Axis.WIDTH, field="width.explicit_finished_size", stage=6))
            elif kind is SizeKind.FINISHED and decimal_or_none(width.ease) not in (None, Decimal(0)):
                errors.append(diagnostic("ОШ-07", axis=Axis.WIDTH, field="width.ease", stage=3))
            _validate_gauge(width.gauge, Axis.WIDTH, errors)
            if width.repeat is not None:
                repeat = decimal_or_none(width.repeat)
                if repeat is None or repeat != repeat.to_integral_value():
                    errors.append(diagnostic("ОШ-16", axis=Axis.WIDTH, field="width.repeat", stage=3))
                elif repeat < 1:
                    errors.append(diagnostic("ОШ-17", axis=Axis.WIDTH, field="width.repeat", stage=3))
                _enum(errors, TriState, width.partial_repeat, "width.partial_repeat", Axis.WIDTH)
            if width.minimum_repeats is not None:
                _number(errors, width.minimum_repeats, "width.minimum_repeats", Axis.WIDTH, nonnegative=True, integer=True)
            fixed_working = Decimal(0)
            fixed_visible = Decimal(0)
            for index, component in enumerate(width.fixed_components):
                _missing(errors, component.role, f"width.fixed_components[{index}].role", Axis.WIDTH)
                _missing(errors, component.on_needle, f"width.fixed_components[{index}].on_needle", Axis.WIDTH)
                _missing(errors, component.visible, f"width.fixed_components[{index}].visible", Axis.WIDTH)
                _enum(errors, TriState, component.same_gauge, f"width.fixed_components[{index}].same_gauge", Axis.WIDTH)
                on_needle = _number(
                    errors, component.on_needle, f"width.fixed_components[{index}].on_needle",
                    Axis.WIDTH, nonnegative=True, integer=True,
                )
                visible = decimal_or_none(component.visible)
                if visible is None:
                    errors.append(diagnostic("ОШ-03", axis=Axis.WIDTH, field=f"width.fixed_components[{index}].visible", stage=3))
                elif on_needle is not None and (visible < 0 or visible > on_needle):
                    errors.append(diagnostic("ОШ-19", axis=Axis.WIDTH, field=f"width.fixed_components[{index}].visible", stage=3))
                if on_needle is not None:
                    fixed_working += on_needle
                if visible is not None:
                    fixed_visible += visible
            if width.declared_fixed_on_needle is not None and decimal_or_none(width.declared_fixed_on_needle) != fixed_working:
                errors.append(diagnostic("ОШ-20", axis=Axis.WIDTH, field="width.declared_fixed_on_needle", stage=3))
            if width.declared_fixed_visible is not None and decimal_or_none(width.declared_fixed_visible) != fixed_visible:
                errors.append(diagnostic("ОШ-20", axis=Axis.WIDTH, field="width.declared_fixed_visible", stage=3))
            constraints = width.constraints
            parity = enum_value(Parity, constraints.parity)
            center = enum_value(CenterType, constraints.center)
            centered_part = enum_value(Part, constraints.centered_part)
            _enum(errors, Parity, constraints.parity, "width.constraints.parity", Axis.WIDTH)
            _enum(errors, CenterType, constraints.center, "width.constraints.center", Axis.WIDTH)
            if center is not CenterType.NONE and centered_part is None:
                errors.append(diagnostic("ОШ-01", axis=Axis.WIDTH, field="width.constraints.centered_part", stage=3))
            if centered_part is Part.ALL and (
                (center is CenterType.STITCH and parity is Parity.EVEN)
                or (center is CenterType.GAP and parity is Parity.ODD)
            ):
                errors.append(diagnostic("ОШ-21", axis=Axis.WIDTH, field="width.constraints", stage=3))
            if constraints.sectors is not None:
                sectors = decimal_or_none(constraints.sectors)
                if sectors is None or sectors != sectors.to_integral_value():
                    errors.append(diagnostic("ОШ-16", axis=Axis.WIDTH, field="width.constraints.sectors", stage=3))
                elif sectors < 1:
                    errors.append(diagnostic("ОШ-22", axis=Axis.WIDTH, field="width.constraints.sectors", stage=3))
                elif sectors > 1 and enum_value(Part, constraints.sector_part) is None:
                    errors.append(diagnostic("ОШ-01", axis=Axis.WIDTH, field="width.constraints.sector_part", stage=3))
            _validate_tolerance(width.tolerance, Axis.WIDTH, errors)

    if Axis.HEIGHT in axes:
        height = request.height
        if height is None:
            errors.append(diagnostic("ОШ-01", axis=Axis.HEIGHT, field="height", stage=3))
        else:
            _number(errors, height.value, "height.value", Axis.HEIGHT, positive=True, size=True)
            _unit(errors, height.unit, "height.unit", Axis.HEIGHT)
            if enum_value(Direction, height.direction) is None:
                errors.append(diagnostic("ОШ-01", axis=Axis.HEIGHT, field="height.direction", stage=3))
            _validate_gauge(height.gauge, Axis.HEIGHT, errors)
            if not height.start_point or not height.end_point:
                errors.append(diagnostic("ОШ-26", axis=Axis.HEIGHT, field="height.measurement_points", stage=3))
            if not height.row_counting_rule:
                errors.append(diagnostic("ОШ-27", axis=Axis.HEIGHT, field="height.row_counting_rule", stage=3))
            for field, value in {
                "height.fixed_start_rows": height.fixed_start_rows,
                "height.fixed_end_rows": height.fixed_end_rows,
            }.items():
                if value is not None:
                    _number(errors, value, field, Axis.HEIGHT, nonnegative=True, integer=True)
            if height.repeat is not None:
                repeat = decimal_or_none(height.repeat)
                if repeat is None or repeat != repeat.to_integral_value():
                    errors.append(diagnostic("ОШ-16", axis=Axis.HEIGHT, field="height.repeat", stage=3))
                elif repeat < 1:
                    errors.append(diagnostic("ОШ-17", axis=Axis.HEIGHT, field="height.repeat", stage=3))
                _enum(errors, TriState, height.partial_repeat, "height.partial_repeat", Axis.HEIGHT)
            if enum_value(EndPhase, height.end_phase) is EndPhase.SOURCE and not height.source_phase_rule:
                errors.append(diagnostic("ОШ-28", axis=Axis.HEIGHT, field="height.source_phase_rule", stage=3))
            _enum(errors, EndPhase, height.end_phase, "height.end_phase", Axis.HEIGHT)
            _validate_tolerance(height.tolerance, Axis.HEIGHT, errors)
    return _deduplicate(errors)


FEATURE_CODES = {
    "shaping": "ОБЛ-04",
    "short_rows": "ОБЛ-05",
    "modular_geometry": "ОБЛ-05",
    "bias_geometry": "ОБЛ-05",
    "three_dimensional_geometry": "ОБЛ-05",
    "joining_parts": "ОБЛ-06",
    "flat_to_round_conversion": "ОБЛ-07",
    "stretch_or_safety": "ОБЛ-08",
}


def validate_scope(request: CalculationRequest) -> list[Diagnostic]:
    messages: list[Diagnostic] = []
    pattern_class = enum_value(PatternClass, request.pattern_class)
    if pattern_class is PatternClass.VARIABLE_OR_UNKNOWN:
        messages.append(diagnostic("ОБЛ-01", field="pattern_class", stage=4))
    elif pattern_class is PatternClass.COMPOSITE_ROW:
        messages.append(diagnostic("ОБЛ-02", field="pattern_class", stage=4))
    elif pattern_class is PatternClass.MULTIPLE_GAUGES:
        messages.append(diagnostic("ОБЛ-03", field="pattern_class", stage=4))
    if enum_value(TriState, request.zone_homogeneous) is not TriState.YES:
        messages.append(diagnostic("ОБЛ-03", field="zone_homogeneous", stage=4))
    for feature in sorted(request.out_of_scope_features):
        code = FEATURE_CODES.get(feature, "ОБЛ-05")
        messages.append(diagnostic(code, field=f"out_of_scope_features.{feature}", stage=4))
    if request.width is not None:
        if request.width.repeat is not None and enum_value(TriState, request.width.partial_repeat) is not TriState.NO:
            messages.append(diagnostic("ОБЛ-09", axis=Axis.WIDTH, field="width.partial_repeat", stage=4))
        for index, component in enumerate(request.width.fixed_components):
            if enum_value(TriState, component.same_gauge) is not TriState.YES:
                messages.append(
                    diagnostic("ОБЛ-10", axis=Axis.WIDTH, field=f"width.fixed_components[{index}].same_gauge", stage=4)
                )
    if request.height is not None and request.height.repeat is not None:
        if enum_value(TriState, request.height.partial_repeat) is not TriState.NO:
            messages.append(diagnostic("ОБЛ-09", axis=Axis.HEIGHT, field="height.partial_repeat", stage=4))
    if request.height is not None and request.height.row_counting_rule != "full_ordinary_rows":
        messages.append(diagnostic("ОБЛ-02", axis=Axis.HEIGHT, field="height.row_counting_rule", stage=4))
    return _deduplicate(messages)


def _deduplicate(messages: list[Diagnostic]) -> list[Diagnostic]:
    seen: set[tuple] = set()
    result: list[Diagnostic] = []
    for message in messages:
        key = (message.code, message.axis, message.field)
        if key not in seen:
            seen.add(key)
            result.append(message)
    return result
