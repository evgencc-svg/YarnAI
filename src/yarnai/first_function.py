"""Application integration boundary for YarnAI's first function.

The calculation package is deliberately accessed only through its stable
package-root API. Domain validation remains the responsibility of the core;
this module validates the application boundary and translates the core result
and technical failures into application contracts.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, fields, is_dataclass
from decimal import Decimal
from enum import Enum
from types import MappingProxyType
from typing import Any

from yarnai_calculation import (
    Axis,
    AxisResult,
    CalculationRequest,
    CalculationResult,
    Diagnostic,
    FabricContext,
    FixedComponent,
    GaugeAssessment,
    GaugeInput,
    GaugeMeasurement,
    HeightRequest,
    InvariantTrace,
    ResultStatus,
    StructuralConstraints,
    SwatchContext,
    ToleranceRule,
    WidthRequest,
    calculate,
)


class CalculationApplicationError(Exception):
    """Base class for technical errors at the application boundary."""

    code = "calculation_application_error"


class InvalidCalculationRequestError(CalculationApplicationError):
    """The caller did not supply the public first-function input contract."""

    code = "invalid_calculation_request"

    def __init__(self, received: object) -> None:
        received_type = f"{type(received).__module__}.{type(received).__qualname__}"
        self.details: Mapping[str, str] = MappingProxyType(
            {
                "expected_type": "yarnai_calculation.CalculationRequest",
                "received_type": received_type,
            }
        )
        super().__init__(
            "The first function requires a yarnai_calculation.CalculationRequest; "
            f"received {received_type}."
        )


class InvalidFirstFunctionInputError(CalculationApplicationError):
    """The JSON-compatible application input does not match its contract."""

    code = "invalid_first_function_input"

    def __init__(
        self,
        message: str,
        *,
        path: str,
        expected: str,
        received: object,
    ) -> None:
        received_type = f"{type(received).__module__}.{type(received).__qualname__}"
        self.details: Mapping[str, str] = MappingProxyType(
            {
                "path": path,
                "expected": expected,
                "received_type": received_type,
            }
        )
        super().__init__(message)


class CalculationCoreError(CalculationApplicationError):
    """A technical exception escaped from the calculation core."""

    code = "calculation_core_error"

    def __init__(self, original_exception: Exception) -> None:
        self.original_exception = original_exception
        self.exception_module = type(original_exception).__module__
        self.exception_type = type(original_exception).__qualname__
        self.exception_args = original_exception.args
        self.exception_repr = repr(original_exception)
        super().__init__(
            "The calculation core raised "
            f"{self.exception_module}.{self.exception_type}: {original_exception}"
        )


@dataclass(frozen=True, slots=True)
class FirstFunctionOutput:
    """Application representation of a complete calculation attempt."""

    status: ResultStatus
    final: bool
    canon_version: str
    specification_version: str
    normalized_inputs: Mapping[str, Any]
    gauges: Mapping[Axis, GaugeAssessment]
    axes: Mapping[Axis, AxisResult]
    errors: tuple[Diagnostic, ...]
    warnings: tuple[Diagnostic, ...]
    clarifications: tuple[Diagnostic, ...]
    explanation: tuple[str, ...]
    invariant_trace: tuple[InvariantTrace, ...]


def run_first_function(request: CalculationRequest) -> FirstFunctionOutput:
    """Run the first YarnAI function through the public calculation API.

    Core domain outcomes, including invalid input and out-of-scope requests,
    are returned as :class:`FirstFunctionOutput`. Only a wrong application
    contract or an unexpected technical exception is raised as an application
    error.
    """

    if not isinstance(request, CalculationRequest):
        raise InvalidCalculationRequestError(request)

    try:
        result = calculate(request)
    except Exception as error:
        raise CalculationCoreError(error) from error

    return _to_application_output(result)


def first_function_request_from_mapping(payload: object) -> CalculationRequest:
    """Build the public calculation request from a JSON-compatible mapping.

    This validates only the application-level shape of the payload. Domain
    values are intentionally passed through to the calculation core so its
    statuses, diagnostics, warnings, and clarifications retain their existing
    semantics.
    """

    data = _mapping(payload, "$")
    _known_fields(
        data,
        "$",
        {
            "axes",
            "functional_category",
            "knitting_mode",
            "zone_pattern",
            "pattern_class",
            "zone_homogeneous",
            "fabric_context",
            "width",
            "height",
            "explicit_source_rule",
            "source_rule_matches_canon",
            "source_rule_source",
            "out_of_scope_features",
        },
    )
    axes = _string_array(data.get("axes", []), "$.axes")
    out_of_scope = _string_array(
        data.get("out_of_scope_features", []),
        "$.out_of_scope_features",
    )
    source_rule_matches_canon = data.get("source_rule_matches_canon")
    if source_rule_matches_canon is not None and not isinstance(
        source_rule_matches_canon, bool
    ):
        _invalid(
            "$.source_rule_matches_canon",
            "a boolean or null",
            source_rule_matches_canon,
        )

    return CalculationRequest(
        axes=frozenset(axes),
        functional_category=data.get("functional_category"),
        knitting_mode=data.get("knitting_mode"),
        zone_pattern=data.get("zone_pattern"),
        pattern_class=data.get("pattern_class"),
        zone_homogeneous=data.get("zone_homogeneous"),
        fabric_context=_optional_mapping(
            data.get("fabric_context"),
            "$.fabric_context",
            _fabric_context,
        ),
        width=_optional_mapping(data.get("width"), "$.width", _width_request),
        height=_optional_mapping(data.get("height"), "$.height", _height_request),
        explicit_source_rule=data.get("explicit_source_rule"),
        source_rule_matches_canon=source_rule_matches_canon,
        source_rule_source=data.get("source_rule_source"),
        out_of_scope_features=frozenset(out_of_scope),
    )


def first_function_output_to_mapping(output: FirstFunctionOutput) -> dict[str, Any]:
    """Convert a first-function result to a JSON-compatible mapping."""

    if not isinstance(output, FirstFunctionOutput):
        raise TypeError("output must be a yarnai.FirstFunctionOutput")

    converted = _json_value(output)
    assert isinstance(converted, dict)
    return converted


def _to_application_output(result: CalculationResult) -> FirstFunctionOutput:
    return FirstFunctionOutput(
        status=result.status,
        final=result.final,
        canon_version=result.canon_version,
        specification_version=result.specification_version,
        normalized_inputs=MappingProxyType(dict(result.normalized_inputs)),
        gauges=MappingProxyType(dict(result.gauges)),
        axes=MappingProxyType(dict(result.axes)),
        errors=result.errors,
        warnings=result.warnings,
        clarifications=result.clarifications,
        explanation=result.explanation,
        invariant_trace=result.invariant_trace,
    )


def _fabric_context(data: Mapping[str, Any], path: str) -> FabricContext:
    _known_fields(
        data,
        path,
        {
            "yarn",
            "yarn_batch",
            "strands",
            "strands_description",
            "needle_mm",
            "needle_type",
            "pattern",
            "mode",
            "processing",
        },
    )
    return FabricContext(
        yarn=data.get("yarn"),
        yarn_batch=data.get("yarn_batch"),
        strands=data.get("strands"),
        strands_description=data.get("strands_description"),
        needle_mm=data.get("needle_mm"),
        needle_type=data.get("needle_type"),
        pattern=data.get("pattern"),
        mode=data.get("mode"),
        processing=data.get("processing"),
    )


def _swatch_context(data: Mapping[str, Any], path: str) -> SwatchContext:
    _known_fields(
        data,
        path,
        {
            "off_needles",
            "processing_state",
            "fully_dry",
            "rest_hours",
            "measurement_state",
            "fabric",
            "mode",
            "heavy_or_large",
        },
    )
    return SwatchContext(
        off_needles=data.get("off_needles"),
        processing_state=data.get("processing_state"),
        fully_dry=data.get("fully_dry"),
        rest_hours=data.get("rest_hours"),
        measurement_state=data.get("measurement_state"),
        fabric=_optional_mapping(
            data.get("fabric"),
            f"{path}.fabric",
            _fabric_context,
        ),
        mode=data.get("mode"),
        heavy_or_large=data.get("heavy_or_large"),
    )


def _gauge_measurement(data: Mapping[str, Any], path: str) -> GaugeMeasurement:
    _known_fields(data, path, {"count", "length", "unit", "position"})
    return GaugeMeasurement(
        count=data.get("count"),
        length=data.get("length"),
        unit=data.get("unit", "cm"),
        position=data.get("position"),
    )


def _gauge_input(data: Mapping[str, Any], path: str) -> GaugeInput:
    _known_fields(
        data,
        path,
        {
            "method",
            "source",
            "measurements",
            "ready_count",
            "base_length",
            "base_unit",
            "source_measurement_count",
            "total_swatch_size",
            "total_swatch_unit",
            "margins_outside_zone",
            "context",
        },
    )
    measurements = _mapping_array(
        data.get("measurements", []),
        f"{path}.measurements",
        _gauge_measurement,
    )
    return GaugeInput(
        method=data.get("method"),
        source=data.get("source"),
        measurements=tuple(measurements),
        ready_count=data.get("ready_count"),
        base_length=data.get("base_length"),
        base_unit=data.get("base_unit", "cm"),
        source_measurement_count=data.get("source_measurement_count"),
        total_swatch_size=data.get("total_swatch_size"),
        total_swatch_unit=data.get("total_swatch_unit", "cm"),
        margins_outside_zone=data.get("margins_outside_zone"),
        context=_optional_mapping(
            data.get("context"),
            f"{path}.context",
            _swatch_context,
        ),
    )


def _fixed_component(data: Mapping[str, Any], path: str) -> FixedComponent:
    _known_fields(
        data,
        path,
        {
            "role",
            "on_needle",
            "visible",
            "same_gauge",
            "source",
            "absorption_note",
        },
    )
    return FixedComponent(
        role=data.get("role"),
        on_needle=data.get("on_needle"),
        visible=data.get("visible"),
        same_gauge=data.get("same_gauge", "yes"),
        source=data.get("source"),
        absorption_note=data.get("absorption_note"),
    )


def _structural_constraints(
    data: Mapping[str, Any], path: str
) -> StructuralConstraints:
    _known_fields(
        data,
        path,
        {
            "parity",
            "center",
            "centered_part",
            "sectors",
            "sector_part",
            "explicit_asymmetry",
        },
    )
    return StructuralConstraints(
        parity=data.get("parity", "any"),
        center=data.get("center", "none"),
        centered_part=data.get("centered_part"),
        sectors=data.get("sectors"),
        sector_part=data.get("sector_part"),
        explicit_asymmetry=data.get("explicit_asymmetry"),
    )


def _tolerance_rule(data: Mapping[str, Any], path: str) -> ToleranceRule:
    _known_fields(
        data,
        path,
        {
            "mode",
            "absolute",
            "absolute_unit",
            "relative_percent",
            "source",
        },
    )
    return ToleranceRule(
        mode=data.get("mode", "yarnai"),
        absolute=data.get("absolute"),
        absolute_unit=data.get("absolute_unit", "cm"),
        relative_percent=data.get("relative_percent"),
        source=data.get("source"),
    )


def _width_request(data: Mapping[str, Any], path: str) -> WidthRequest:
    _known_fields(
        data,
        path,
        {
            "size_kind",
            "value",
            "unit",
            "direction",
            "gauge",
            "ease",
            "explicit_finished_size",
            "explicit_finished_unit",
            "repeat",
            "minimum_repeats",
            "partial_repeat",
            "fixed_components",
            "declared_fixed_on_needle",
            "declared_fixed_visible",
            "constraints",
            "tolerance",
        },
    )
    components = _mapping_array(
        data.get("fixed_components", []),
        f"{path}.fixed_components",
        _fixed_component,
    )
    constraints = data.get("constraints", {})
    tolerance = data.get("tolerance", {})
    return WidthRequest(
        size_kind=data.get("size_kind"),
        value=data.get("value"),
        unit=data.get("unit"),
        direction=data.get("direction"),
        gauge=_optional_mapping(
            data.get("gauge"),
            f"{path}.gauge",
            _gauge_input,
        ),
        ease=data.get("ease"),
        explicit_finished_size=data.get("explicit_finished_size"),
        explicit_finished_unit=data.get("explicit_finished_unit"),
        repeat=data.get("repeat"),
        minimum_repeats=data.get("minimum_repeats"),
        partial_repeat=data.get("partial_repeat"),
        fixed_components=tuple(components),
        declared_fixed_on_needle=data.get("declared_fixed_on_needle"),
        declared_fixed_visible=data.get("declared_fixed_visible"),
        constraints=_required_mapping(
            constraints,
            f"{path}.constraints",
            _structural_constraints,
        ),
        tolerance=_required_mapping(
            tolerance,
            f"{path}.tolerance",
            _tolerance_rule,
        ),
    )


def _height_request(data: Mapping[str, Any], path: str) -> HeightRequest:
    _known_fields(
        data,
        path,
        {
            "value",
            "unit",
            "direction",
            "gauge",
            "start_point",
            "end_point",
            "row_counting_rule",
            "repeat",
            "fixed_start_rows",
            "fixed_end_rows",
            "end_phase",
            "source_phase_rule",
            "partial_repeat",
            "tolerance",
        },
    )
    tolerance = data.get("tolerance", {})
    return HeightRequest(
        value=data.get("value"),
        unit=data.get("unit"),
        direction=data.get("direction"),
        gauge=_optional_mapping(
            data.get("gauge"),
            f"{path}.gauge",
            _gauge_input,
        ),
        start_point=data.get("start_point"),
        end_point=data.get("end_point"),
        row_counting_rule=data.get("row_counting_rule", "full_ordinary_rows"),
        repeat=data.get("repeat"),
        fixed_start_rows=data.get("fixed_start_rows", 0),
        fixed_end_rows=data.get("fixed_end_rows", 0),
        end_phase=data.get("end_phase", "any"),
        source_phase_rule=data.get("source_phase_rule"),
        partial_repeat=data.get("partial_repeat"),
        tolerance=_required_mapping(
            tolerance,
            f"{path}.tolerance",
            _tolerance_rule,
        ),
    )


def _mapping(value: object, path: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        _invalid(path, "a JSON object", value)
    for key in value:
        if not isinstance(key, str):
            _invalid(path, "a JSON object with string field names", key)
    return value


def _required_mapping(value, path, builder):
    return builder(_mapping(value, path), path)


def _optional_mapping(value, path, builder):
    if value is None:
        return None
    return _required_mapping(value, path, builder)


def _mapping_array(value, path, builder) -> list[Any]:
    if not isinstance(value, list):
        _invalid(path, "a JSON array", value)
    return [
        builder(_mapping(item, f"{path}[{index}]"), f"{path}[{index}]")
        for index, item in enumerate(value)
    ]


def _string_array(value: object, path: str) -> list[str]:
    if not isinstance(value, list):
        _invalid(path, "a JSON array of strings", value)
    for index, item in enumerate(value):
        if not isinstance(item, str):
            _invalid(f"{path}[{index}]", "a string", item)
    return value


def _known_fields(data: Mapping[str, Any], path: str, allowed: set[str]) -> None:
    unknown = sorted(set(data) - allowed)
    if unknown:
        field = unknown[0]
        raise InvalidFirstFunctionInputError(
            f"Unknown field {path}.{field}.",
            path=f"{path}.{field}",
            expected="a documented application contract field",
            received=data[field],
        )


def _invalid(path: str, expected: str, received: object):
    raise InvalidFirstFunctionInputError(
        f"{path} must be {expected}.",
        path=path,
        expected=expected,
        received=received,
    )


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, ResultStatus):
        return value.name
    if isinstance(value, Enum):
        return value.value
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if is_dataclass(value) and not isinstance(value, type):
        return {
            item.name: _json_value(getattr(value, item.name))
            for item in fields(value)
        }
    if isinstance(value, Mapping):
        return {
            _json_key(key): _json_value(item)
            for key, item in value.items()
        }
    if isinstance(value, (tuple, list, set, frozenset)):
        return [_json_value(item) for item in value]
    raise TypeError(f"Unsupported result value: {type(value).__qualname__}")


def _json_key(value: Any) -> str:
    if isinstance(value, Enum):
        return str(value.value)
    if isinstance(value, str):
        return value
    raise TypeError(f"Unsupported result mapping key: {type(value).__qualname__}")
