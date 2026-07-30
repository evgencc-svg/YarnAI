from __future__ import annotations

import ast
import io
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import yarnai
import yarnai.__main__ as cli
from yarnai import CalculationCoreError


ROOT = Path(__file__).parents[2]
EXAMPLE = ROOT / "examples" / "first_function_width.json"


def _example_payload() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def _run_cli(*arguments: str, stdin: str | None = None) -> subprocess.CompletedProcess:
    environment = os.environ.copy()
    source_path = str(ROOT / "src")
    existing_path = environment.get("PYTHONPATH")
    environment["PYTHONPATH"] = (
        source_path + os.pathsep + existing_path
        if existing_path
        else source_path
    )
    return subprocess.run(
        [sys.executable, "-m", "yarnai", *arguments],
        cwd=ROOT,
        env=environment,
        input=stdin,
        text=True,
        capture_output=True,
        check=False,
    )


def test_successful_calculation_returns_valid_json() -> None:
    completed = _run_cli("--input", str(EXAMPLE))

    assert completed.returncode == cli.EXIT_SUCCESS
    assert completed.stderr == ""
    response = json.loads(completed.stdout)
    assert response["final"] is True
    assert isinstance(response["invariant_trace"], list)


def test_canonical_example_is_ready_with_100_stitches() -> None:
    completed = _run_cli("--input", str(EXAMPLE))

    response = json.loads(completed.stdout)
    assert response["status"] == "READY"
    assert response["axes"]["width"]["selected_candidate"]["working_count"] == 100


def test_reads_json_from_file(tmp_path: Path) -> None:
    input_file = tmp_path / "input.json"
    input_file.write_text(json.dumps(_example_payload()), encoding="utf-8")

    completed = _run_cli("--input", str(input_file))

    assert completed.returncode == cli.EXIT_SUCCESS
    assert json.loads(completed.stdout)["status"] == "READY"


def test_reads_json_from_stdin() -> None:
    completed = _run_cli(stdin=EXAMPLE.read_text(encoding="utf-8"))

    assert completed.returncode == cli.EXIT_SUCCESS
    assert json.loads(completed.stdout)["status"] == "READY"


def test_invalid_json_is_a_clear_input_error_without_traceback() -> None:
    completed = _run_cli(stdin='{"axes": ["width"]')

    assert completed.returncode == cli.EXIT_INPUT_ERROR
    assert completed.stdout == ""
    error = json.loads(completed.stderr)["error"]
    assert error["category"] == "input"
    assert error["code"] == "invalid_json"
    assert "line 1" in error["message"]
    assert "Traceback" not in completed.stderr


def test_invalid_application_contract_is_an_input_error() -> None:
    completed = _run_cli(stdin=json.dumps({"axes": "width"}))

    assert completed.returncode == cli.EXIT_INPUT_ERROR
    error = json.loads(completed.stderr)["error"]
    assert error["code"] == "invalid_first_function_input"
    assert error["details"]["path"] == "$.axes"
    assert "JSON array of strings" in error["message"]
    assert "Traceback" not in completed.stderr


def test_domain_input_error_remains_a_structured_result() -> None:
    payload = _example_payload()
    payload["width"]["value"] = 0

    completed = _run_cli(stdin=json.dumps(payload))

    assert completed.returncode == cli.EXIT_SUCCESS
    assert completed.stderr == ""
    response = json.loads(completed.stdout)
    assert response["status"] == "INPUT_ERROR"
    assert response["final"] is False
    assert response["errors"]


def test_technical_exception_has_stable_exit_code(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    original = RuntimeError("core unavailable")

    def failing_run(_request):
        raise CalculationCoreError(original)

    monkeypatch.setattr(cli, "run_first_function", failing_run)
    monkeypatch.setattr(
        sys,
        "stdin",
        io.StringIO(EXAMPLE.read_text(encoding="utf-8")),
    )

    exit_code = cli.main([])

    captured = capsys.readouterr()
    assert exit_code == cli.EXIT_TECHNICAL_ERROR
    assert captured.out == ""
    error = json.loads(captured.err)["error"]
    assert error["category"] == "technical"
    assert error["code"] == "calculation_core_error"
    assert "RuntimeError" in error["message"]


def test_cli_uses_only_the_public_yarnai_integration_api() -> None:
    source_path = Path(cli.__file__)
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


def test_exit_codes_are_distinct_and_stable() -> None:
    assert cli.EXIT_SUCCESS == 0
    assert cli.EXIT_INPUT_ERROR == 2
    assert cli.EXIT_TECHNICAL_ERROR == 3
    assert len(
        {
            cli.EXIT_SUCCESS,
            cli.EXIT_INPUT_ERROR,
            cli.EXIT_TECHNICAL_ERROR,
        }
    ) == 3
