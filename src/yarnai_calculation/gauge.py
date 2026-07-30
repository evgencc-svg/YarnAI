from __future__ import annotations

from decimal import Decimal

from .diagnostics import diagnostic
from .models import (
    Axis,
    Diagnostic,
    FabricContext,
    GaugeAssessment,
    GaugeInput,
    GaugeMethod,
    GaugeSource,
    MeasurementState,
    ProcessingState,
    SwatchMode,
    TriState,
)
from .numeric import decimal_or_none, enum_value, median, to_cm


def assess_gauge(
    gauge: GaugeInput,
    axis: Axis,
    planned: FabricContext,
) -> tuple[GaugeAssessment, list[Diagnostic], bool]:
    warnings: list[Diagnostic] = []
    method = enum_value(GaugeMethod, gauge.method)
    source = enum_value(GaugeSource, gauge.source)
    assert method is not None and source is not None
    if method is GaugeMethod.MEASUREMENTS:
        normalized_measurements = tuple(
            (decimal_or_none(item.count), to_cm(decimal_or_none(item.length), item.unit))
            for item in gauge.measurements
        )
        densities = tuple(count / length for count, length in normalized_measurements)
        density = median(list(densities))
        minimum = min(densities)
        maximum = max(densities)
        spread = Decimal(100) * (maximum - minimum) / density
        count = len(densities)
        ready_count = None
        base_length_cm = None
        for item in gauge.measurements:
            if to_cm(item.length, item.unit) < Decimal(10):
                warnings.append(diagnostic("ПР-01", axis=axis, field="gauge.measurements", stage=9))
                break
        if enum_value(TriState, gauge.margins_outside_zone) is not TriState.YES:
            warnings.append(diagnostic("ПР-02", axis=axis, field="gauge.margins_outside_zone", stage=9))
    else:
        ready_count = decimal_or_none(gauge.ready_count)
        base_length_cm = to_cm(decimal_or_none(gauge.base_length), gauge.base_unit)
        density = ready_count / base_length_cm
        normalized_measurements = ()
        densities = (density,)
        minimum = maximum = density
        spread = Decimal(0)
        count = gauge.source_measurement_count

    context = gauge.context
    assert context is not None and context.fabric is not None
    if enum_value(TriState, context.off_needles) is not TriState.YES:
        warnings.append(diagnostic("ПР-03", axis=axis, field="gauge.context.off_needles", stage=9))
    if enum_value(ProcessingState, context.processing_state) is not ProcessingState.AFTER:
        warnings.append(diagnostic("ПР-04", axis=axis, field="gauge.context.processing_state", stage=9))
    if enum_value(TriState, context.fully_dry) is not TriState.YES:
        warnings.append(diagnostic("ПР-05", axis=axis, field="gauge.context.fully_dry", stage=9))
    rest = decimal_or_none(context.rest_hours)
    if rest is None or rest < 12:
        warnings.append(diagnostic("ПР-06", axis=axis, field="gauge.context.rest_hours", stage=9))
    if enum_value(MeasurementState, context.measurement_state) is not MeasurementState.RELAXED:
        warnings.append(diagnostic("ПР-07", axis=axis, field="gauge.context.measurement_state", stage=9))
    if source is not GaugeSource.PERSONAL_SWATCH:
        warnings.append(diagnostic("ПР-08", axis=axis, field="gauge.source", stage=9))
        warnings.append(diagnostic("ПР-09", axis=axis, field="gauge.source", stage=9))
    ready_unverified = method is GaugeMethod.READY_VALUE and (count is None or count < 3)
    if ready_unverified and not any(item.code == "ПР-09" for item in warnings):
        warnings.append(diagnostic("ПР-09", axis=axis, field="gauge.source_measurement_count", stage=9))
    unstable = spread > Decimal(2)
    if unstable:
        warnings.append(
            diagnostic("ПР-10", axis=axis, field="gauge.measurements", stage=9, parameters={"spread_percent": spread})
        )

    swatch_mode = enum_value(SwatchMode, context.mode)
    mode_match = (
        (planned.mode == "flat" and swatch_mode is SwatchMode.FLAT)
        or (planned.mode == "round" and swatch_mode in (SwatchMode.ROUND, SwatchMode.SIMULATED_ROUND))
    )
    if not mode_match:
        warnings.append(diagnostic("ПР-11", axis=axis, field="gauge.context.mode", stage=9))
    swatch_fabric = context.fabric
    comparable = (
        ("yarn", swatch_fabric.yarn, planned.yarn),
        ("strands", swatch_fabric.strands, planned.strands),
        ("strands_description", swatch_fabric.strands_description, planned.strands_description),
        ("needle_mm", decimal_or_none(swatch_fabric.needle_mm), decimal_or_none(planned.needle_mm)),
        ("needle_type", swatch_fabric.needle_type, planned.needle_type),
        ("pattern", swatch_fabric.pattern, planned.pattern),
        ("processing", swatch_fabric.processing, planned.processing),
    )
    differences = [name for name, actual, expected in comparable if actual != expected]
    context_matches = mode_match and not differences
    if differences:
        warnings.append(
            diagnostic("ПР-12", axis=axis, field="gauge.context.fabric", stage=9, parameters={"differences": differences})
        )
    if enum_value(TriState, context.heavy_or_large) is not TriState.NO:
        warnings.append(diagnostic("ПР-13", axis=axis, field="gauge.context.heavy_or_large", stage=9))

    canonical = (
        source is GaugeSource.PERSONAL_SWATCH
        and not unstable
        and not ready_unverified
        and not any(item.code in {f"ПР-{n:02d}" for n in range(1, 14)} for item in warnings)
    )
    quality = "unstable" if unstable else ("preliminary" if not canonical else "canonical")
    assessment = GaugeAssessment(
        method=method,
        source=source,
        original_measurements=gauge.measurements,
        normalized_measurements=normalized_measurements,
        ready_count=ready_count,
        base_length_cm=base_length_cm,
        densities=densities,
        density_per_cm=density,
        minimum=minimum,
        maximum=maximum,
        relative_spread_percent=spread,
        measurement_count=count,
        quality=quality,
        context_matches=context_matches,
        context_differences=tuple(differences + ([] if mode_match else ["mode"])),
        swatch_context=context,
        canonical=canonical,
    )
    return assessment, _deduplicate(warnings), unstable


def _deduplicate(messages: list[Diagnostic]) -> list[Diagnostic]:
    seen: set[tuple[str, Axis | None]] = set()
    result: list[Diagnostic] = []
    for message in messages:
        key = (message.code, message.axis)
        if key not in seen:
            seen.add(key)
            result.append(message)
    return result
