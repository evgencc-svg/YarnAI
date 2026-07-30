from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

import pytest
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

import yarnai.http as http_api
from yarnai.config import RuntimeSettings


ROOT = Path(__file__).parents[1]
EXAMPLE = ROOT / "examples" / "first_function_width.json"


def _payload(value: int = 50) -> dict:
    payload = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    payload["width"]["value"] = value
    return payload


def test_runtime_settings_have_safe_defaults_and_validate_environment() -> None:
    assert RuntimeSettings.from_environment({}) == RuntimeSettings(
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )
    assert RuntimeSettings.from_environment(
        {
            "YARNAI_HOST": "0.0.0.0",
            "PORT": "9123",
            "YARNAI_LOG_LEVEL": "WARNING",
        }
    ) == RuntimeSettings(host="0.0.0.0", port=9123, log_level="warning")

    for invalid_port in ("zero", "0", "65536"):
        with pytest.raises(ValueError, match="PORT"):
            RuntimeSettings.from_environment({"PORT": invalid_port})
    with pytest.raises(ValueError, match="YARNAI_LOG_LEVEL"):
        RuntimeSettings.from_environment({"YARNAI_LOG_LEVEL": "verbose"})
    with pytest.raises(ValueError, match="ALLOWED_ORIGINS"):
        RuntimeSettings.from_environment({"ALLOWED_ORIGINS": "*"})
    with pytest.raises(ValueError, match="configured together"):
        RuntimeSettings.from_environment(
            {
                "DATABASE_URL": "postgresql://localhost/yarnai",
                "JWT_ACCESS_SECRET": "a" * 32,
            }
        )


def test_production_command_disables_reload_and_forwarded_header_trust(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setenv("PORT", "8123")
    monkeypatch.setenv("YARNAI_HOST", "0.0.0.0")
    monkeypatch.setenv("YARNAI_LOG_LEVEL", "error")
    monkeypatch.setattr(
        http_api.uvicorn,
        "run",
        lambda application, **options: captured.update(
            application=application,
            **options,
        ),
    )

    http_api.main()

    assert http_api.app.debug is False
    assert captured["host"] == "0.0.0.0"
    assert captured["port"] == 8123
    assert captured["reload"] is False
    assert captured["proxy_headers"] is False
    assert "forwarded_allow_ips" not in captured
    assert captured["access_log"] is False
    assert captured["workers"] == 1


def test_routes_health_mime_cache_and_404_contracts() -> None:
    with TestClient(http_api.create_app()) as client:
        for route in (
            "/",
            "/test",
            "/smart-start",
            "/step-assistant",
            "/feedback",
        ):
            response = client.get(route)
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/html")
            assert response.headers["cache-control"] == "no-cache"

        css = client.get("/static/styles.css")
        javascript = client.get("/static/app.js")
        calculation = client.post(
            "/api/v1/calculate",
            json=_payload(),
        )
        health = client.get("/health")
        missing = client.get("/route-that-does-not-exist")

    assert css.status_code == 200
    assert css.headers["content-type"].startswith("text/css")
    assert css.headers["cache-control"] == http_api.STATIC_CACHE_CONTROL
    assert javascript.status_code == 200
    assert "javascript" in javascript.headers["content-type"]
    assert calculation.status_code == 200
    assert calculation.headers["cache-control"] == "no-store"
    assert missing.status_code == 404
    assert "traceback" not in missing.text.lower()
    assert health.status_code == 200
    assert health.headers["content-type"] == "application/json"
    assert health.content == b'{"status":"ok"}'
    assert health.headers["cache-control"] == "no-store"


def test_unhandled_exception_is_contained_without_public_traceback() -> None:
    async def fail(_request: Request) -> JSONResponse:
        raise RuntimeError("private value must not reach the response")

    application = http_api.create_app()
    application.router.routes.insert(
        0,
        Route("/_controlled-test-failure", fail, methods=["GET"]),
    )
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.get("/_controlled-test-failure")
        health = client.get("/health")

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "unexpected_technical_error",
            "message": http_api.TECHNICAL_ERROR_MESSAGE,
        }
    }
    assert "traceback" not in response.text.lower()
    assert "private value" not in response.text.lower()
    assert health.content == b'{"status":"ok"}'


def test_parallel_calculations_remain_independent() -> None:
    payload_a = _payload(50)
    payload_b = _payload(40)

    def calculate(index: int) -> tuple[int, int]:
        payload = deepcopy(payload_a if index % 2 == 0 else payload_b)
        expected = 100 if index % 2 == 0 else 80
        with TestClient(http_api.create_app()) as client:
            response = client.post("/api/v1/calculate", json=payload)
        result = response.json()
        return (
            expected,
            result["axes"]["width"]["selected_candidate"]["working_count"],
        )

    with ThreadPoolExecutor(max_workers=20) as executor:
        results = list(executor.map(calculate, range(100)))

    assert all(actual == expected for expected, actual in results)


def test_http_module_has_no_global_mutable_user_container() -> None:
    public_mutable_containers = {
        name
        for name, value in vars(http_api).items()
        if not name.startswith("_") and isinstance(value, (dict, list, set))
    }

    assert public_mutable_containers == set()
    assert vars(http_api.app.state) == {"_state": {"database_engine": None}}


def test_render_blueprint_is_minimal_and_matches_production_command() -> None:
    blueprint = (ROOT / "render.yaml").read_text(encoding="utf-8")
    python_version = (ROOT / ".python-version").read_text(
        encoding="utf-8"
    )

    for required in (
        "type: web",
        "runtime: python",
        "plan: free",
        "buildCommand: pip install -e .",
        "preDeployCommand: alembic upgrade head",
        "startCommand: python -m yarnai.http",
        "healthCheckPath: /health",
        "key: YARNAI_HOST",
        "value: 0.0.0.0",
        "key: DATABASE_URL",
        "fromDatabase:",
        "key: JWT_ACCESS_SECRET",
        "key: REFRESH_TOKEN_SECRET",
        "key: COOKIE_SECURE",
        "databases:",
    ):
        assert required in blueprint
    assert "disk:" not in blueprint
    assert python_version.strip() == "3.12"


def test_load_script_runs_in_short_smoke_mode() -> None:
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]

    environment = os.environ.copy()
    environment.update(
        {
            "PORT": str(port),
            "YARNAI_HOST": "127.0.0.1",
            "YARNAI_LOG_LEVEL": "warning",
        }
    )
    server = subprocess.Popen(
        [
            sys.executable,
            "-c",
            "from yarnai.http import main; main()",
        ],
        cwd=ROOT,
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + 15
        while True:
            try:
                with urlopen(
                    f"http://127.0.0.1:{port}/health",
                    timeout=1,
                ) as response:
                    if response.read() == b'{"status":"ok"}':
                        break
            except OSError:
                if time.monotonic() >= deadline:
                    raise AssertionError("production server did not start")
                time.sleep(0.1)

        completed = subprocess.run(
            [
                sys.executable,
                "tools/load_test.py",
                "--base-url",
                f"http://127.0.0.1:{port}",
                "--profile",
                "smoke",
                "--pid",
                str(server.pid),
                "--timeout",
                "5",
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        result = json.loads(completed.stdout)
    finally:
        server.terminate()
        server.wait(timeout=10)

    assert completed.returncode == 0, completed.stderr
    assert result["profiles"]["smoke"]["errors"] == 0
    assert result["isolation"]["independent"] is True
    assert result["post_test_health"]["exact_contract"] is True
