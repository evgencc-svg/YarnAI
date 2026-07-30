from __future__ import annotations

import ast
from dataclasses import replace
from pathlib import Path

import pytest

import yarnai.first_function as integration
from yarnai import (
    CalculationCoreError,
    FirstFunctionOutput,
    InvalidCalculationRequestError,
    run_first_function,
)
from yarnai_calculation import CalculationRequest, ResultStatus, calculate


def test_passes_the_public_request_to_calculate_unchanged(
    request_factory, width_request, monkeypatch
) -> None:
    request = request_factory(width=width_request())
    core_result = calculate(request)
    received: list[CalculationRequest] = []

    def calculate_spy(value: CalculationRequest):
        received.append(value)
        return core_result

    monkeypatch.setattr(integration, "calculate", calculate_spy)

    output = run_first_function(request)

    assert received == [request]
    assert received[0] is request
    assert isinstance(output, FirstFunctionOutput)
    assert output.status is core_result.status
    assert output.final is core_result.final
    assert output.canon_version == core_result.canon_version
    assert output.specification_version == core_result.specification_version
    assert dict(output.normalized_inputs) == core_result.normalized_inputs
    assert dict(output.gauges) == core_result.gauges
    assert dict(output.axes) == core_result.axes
    assert output.errors == core_result.errors
    assert output.warnings == core_result.warnings
    assert output.clarifications == core_result.clarifications
    assert output.explanation == core_result.explanation
    assert output.invariant_trace == core_result.invariant_trace


def test_core_domain_error_is_preserved_as_an_application_result(
    request_factory, width_request
) -> None:
    request = request_factory(width=replace(width_request(), value=0))

    output = run_first_function(request)
    core_result = calculate(request)

    assert output.status is ResultStatus.INPUT_ERROR
    assert output.errors == core_result.errors
    assert output.axes == core_result.axes


def test_rejects_a_non_contract_value_before_calling_core(monkeypatch) -> None:
    called = False

    def calculate_spy(_request):
        nonlocal called
        called = True

    monkeypatch.setattr(integration, "calculate", calculate_spy)

    with pytest.raises(InvalidCalculationRequestError) as captured:
        run_first_function({"axes": ["width"]})  # type: ignore[arg-type]

    assert called is False
    assert captured.value.code == "invalid_calculation_request"
    assert captured.value.details == {
        "expected_type": "yarnai_calculation.CalculationRequest",
        "received_type": "builtins.dict",
    }


def test_translates_core_exception_without_losing_information(
    request_factory, width_request, monkeypatch
) -> None:
    request = request_factory(width=width_request())
    original = ValueError("core failure", {"stage": 7})

    def failing_calculate(_request):
        raise original

    monkeypatch.setattr(integration, "calculate", failing_calculate)

    with pytest.raises(CalculationCoreError) as captured:
        run_first_function(request)

    error = captured.value
    assert error.code == "calculation_core_error"
    assert error.original_exception is original
    assert error.__cause__ is original
    assert error.exception_module == "builtins"
    assert error.exception_type == "ValueError"
    assert error.exception_args == original.args
    assert error.exception_repr == repr(original)


def test_integration_layer_imports_core_only_from_package_root() -> None:
    package_dir = Path(integration.__file__).parent
    imported_names: set[str] = set()

    for source_path in package_dir.glob("*.py"):
        tree = ast.parse(source_path.read_text(encoding="utf-8"), source_path.name)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert all(
                    not alias.name.startswith("yarnai_calculation")
                    for alias in node.names
                )
            elif isinstance(node, ast.ImportFrom) and node.module:
                assert not node.module.startswith("yarnai_calculation.")
                if node.module == "yarnai_calculation":
                    imported_names.update(alias.name for alias in node.names)

    assert imported_names
    assert imported_names <= {
        "Axis",
        "AxisResult",
        "CalculationRequest",
        "CalculationResult",
        "Diagnostic",
        "GaugeAssessment",
        "InvariantTrace",
        "ResultStatus",
        "calculate",
    }
