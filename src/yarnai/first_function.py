"""Application integration boundary for YarnAI's first function.

The calculation package is deliberately accessed only through its stable
package-root API. Domain validation remains the responsibility of the core;
this module validates the application boundary and translates the core result
and technical failures into application contracts.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any

from yarnai_calculation import (
    Axis,
    AxisResult,
    CalculationRequest,
    CalculationResult,
    Diagnostic,
    GaugeAssessment,
    InvariantTrace,
    ResultStatus,
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
