from __future__ import annotations

import ast
import json
from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai
import yarnai.http as http_api
from yarnai import CalculationCoreError


ROOT = Path(__file__).parents[2]
EXAMPLE = ROOT / "examples" / "first_function_width.json"


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


def _example_payload() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def test_health(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"status": "ok"}


def test_canonical_calculation_is_ready_with_100_working_stitches(
    client: TestClient,
) -> None:
    response = client.post("/api/v1/calculate", json=_example_payload())

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    result = response.json()
    assert result["status"] == "READY"
    assert result["final"] is True
    assert result["axes"]["width"]["selected_candidate"]["working_count"] == 100
    assert result["errors"] == []
    assert result["warnings"] == []


def test_invalid_json_returns_400_without_traceback(client: TestClient) -> None:
    response = client.post(
        "/api/v1/calculate",
        content=b'{"axes": ["width"]',
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 400
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {
        "error": {
            "code": "invalid_json",
            "message": "Request body must contain valid JSON.",
        }
    }
    assert "traceback" not in response.text.lower()


def test_invalid_application_contract_returns_422(client: TestClient) -> None:
    response = client.post(
        "/api/v1/calculate",
        json={"axes": "width"},
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "invalid_first_function_input"
    assert error["details"]["path"] == "$.axes"
    assert "JSON array of strings" in error["message"]


def test_domain_input_error_remains_a_200_result_with_diagnostics(
    client: TestClient,
) -> None:
    payload = _example_payload()
    payload["width"]["value"] = 0

    response = client.post("/api/v1/calculate", json=payload)

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "INPUT_ERROR"
    assert result["final"] is False
    assert result["errors"]
    assert "warnings" in result


def test_domain_impossible_remains_a_200_result(client: TestClient) -> None:
    payload = _example_payload()
    payload["width"]["value"] = 5
    payload["width"]["fixed_components"] = [
        {
            "role": "fixed",
            "on_needle": 12,
            "visible": 12,
            "same_gauge": "yes",
        }
    ]

    response = client.post("/api/v1/calculate", json=payload)

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "IMPOSSIBLE"
    assert result["errors"]
    assert result["warnings"] == []


def test_domain_warnings_are_preserved(client: TestClient) -> None:
    payload = _example_payload()
    payload["functional_category"] = "negative_ease"
    payload["width"]["size_kind"] = "measurement"
    payload["width"]["value"] = 56
    payload["width"]["ease"] = -6
    payload["width"]["gauge"]["ready_count"] = 21

    response = client.post("/api/v1/calculate", json=payload)

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "READY_WITH_WARNINGS"
    assert result["errors"] == []
    assert result["warnings"]


def test_technical_exception_returns_safe_500_without_traceback(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sensitive_detail = r"C:\private\source\engine.py"

    def failing_run(_request):
        raise CalculationCoreError(
            RuntimeError(f"database password at {sensitive_detail}")
        )

    monkeypatch.setattr(http_api, "run_first_function", failing_run)

    response = client.post("/api/v1/calculate", json=_example_payload())

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {
        "error": {
            "code": "calculation_core_error",
            "message": http_api.TECHNICAL_ERROR_MESSAGE,
        }
    }
    public_body = response.text.lower()
    assert "traceback" not in public_body
    assert "password" not in public_body
    assert "engine.py" not in public_body
    assert "runtimeerror" not in public_body


def test_serialization_exception_returns_safe_500(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def failing_serialization(_output):
        raise TypeError("cannot serialize C:\\private\\result")

    monkeypatch.setattr(
        http_api,
        "first_function_output_to_mapping",
        failing_serialization,
    )

    response = client.post("/api/v1/calculate", json=_example_payload())

    assert response.status_code == 500
    assert response.json()["error"] == {
        "code": "unexpected_technical_error",
        "message": http_api.TECHNICAL_ERROR_MESSAGE,
    }
    assert "private" not in response.text.lower()
    assert "traceback" not in response.text.lower()


def test_http_layer_uses_only_the_public_yarnai_integration_api() -> None:
    source_path = Path(http_api.__file__)
    tree = ast.parse(source_path.read_text(encoding="utf-8"), source_path.name)
    imported_from_yarnai: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            assert all(
                not alias.name.startswith("yarnai_calculation")
                for alias in node.names
            )
        elif isinstance(node, ast.ImportFrom) and node.module:
            assert not node.module.startswith("yarnai_calculation")
            if node.module == "yarnai":
                imported_from_yarnai.update(alias.name for alias in node.names)

    assert imported_from_yarnai
    assert imported_from_yarnai <= set(yarnai.__all__)
