from __future__ import annotations

import ctypes
import json
import socket

import pytest
from starlette.testclient import TestClient

_import_credential_attempts = []
_original_win_dll = ctypes.WinDLL


def _forbid_win_dll_during_import(*args, **kwargs):
    _import_credential_attempts.append((args, kwargs))
    raise AssertionError("Windows Credential API is forbidden during test module import")


ctypes.WinDLL = _forbid_win_dll_during_import
try:
    import yarnai.openai_pilot_runtime as runtime
finally:
    ctypes.WinDLL = _original_win_dll

from yarnai.openai_pilot_runtime import (
    EXACT_CREDENTIAL_TARGET,
    create_owner_approved_pilot_app,
    create_secure_pilot_app,
    issue_exact_owner_authorization,
    read_yarnai_pilot_credential,
    replace_blocked_owner_authorization,
    safe_audit_summary,
)
from test_garment_reference_gateway import request_payload
import yarnai.garment_reference as garment


assert _import_credential_attempts == []


@pytest.fixture(autouse=True)
def fail_closed_against_real_credential_and_network(monkeypatch):
    credential_attempts = []
    network_attempts = []

    def forbid_credential(*args, **kwargs):
        credential_attempts.append((args, kwargs))
        raise AssertionError("real Windows Credential access is forbidden in this test file")

    def forbid_network(*args, **kwargs):
        network_attempts.append((args, kwargs))
        raise AssertionError("external network is forbidden in this test file")

    monkeypatch.setattr(runtime, "_read_windows_generic_credential", forbid_credential)
    monkeypatch.setattr(runtime.ctypes, "WinDLL", forbid_credential)
    monkeypatch.setattr(runtime.UrllibJsonTransport, "post_json", forbid_network)
    monkeypatch.setattr(socket, "create_connection", forbid_network)
    monkeypatch.setattr(runtime.uvicorn, "run", forbid_network)

    yield

    assert credential_attempts == []
    assert network_attempts == []


class TransportTripwire:
    def __init__(self) -> None:
        self.calls = []

    def post_json(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        raise AssertionError("provider transport must remain unreachable before owner approval")


def test_reader_refuses_every_target_except_exact_owner_authorized_target() -> None:
    calls = []

    def fake_native(target: str) -> str:
        calls.append(target)
        return "fake-memory-only-credential"

    assert read_yarnai_pilot_credential(EXACT_CREDENTIAL_TARGET, native_reader=fake_native) == "fake-memory-only-credential"
    assert calls == [EXACT_CREDENTIAL_TARGET]
    with pytest.raises(RuntimeError, match="not authorized"):
        read_yarnai_pilot_credential("any-other-target", native_reader=fake_native)
    assert calls == [EXACT_CREDENTIAL_TARGET]


def test_fake_credential_is_injected_in_memory_but_owner_gate_blocks_transport(monkeypatch, caplog) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    calls = []
    tripwire = TransportTripwire()

    def fake_reader(target: str) -> str:
        calls.append(target)
        return "fake-memory-only-credential"

    app = create_secure_pilot_app(credential_reader=fake_reader, transport=tripwire)
    with TestClient(app) as client:
        configuration = client.get("/api/v1/garment-reference-analyses/configuration")
        html = client.get("/garment-reference-analysis")
        analysis = client.post("/api/v1/garment-reference-analyses", json=request_payload())
    assert calls == [EXACT_CREDENTIAL_TARGET]
    assert configuration.status_code == 200
    assert configuration.json()["enabled"] is True
    assert configuration.json()["pilot_ready"] is False
    assert configuration.json()["usage_charged"] is False
    assert analysis.status_code == 409
    assert analysis.json()["error"]["code"] == "exact_owner_approval_missing"
    assert tripwire.calls == []
    surfaces = "\n".join((configuration.text, html.text, analysis.text, caplog.text, json.dumps(dict(configuration.headers))))
    assert "fake-memory-only-credential" not in surfaces


def test_secure_runtime_refuses_secret_environment_variable(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-be-read")
    calls = []
    with pytest.raises(RuntimeError, match="refuses credential environment variables"):
        create_secure_pilot_app(credential_reader=lambda target: calls.append(target) or "unused")
    assert calls == []


def test_exact_owner_authorization_is_durable_complete_and_cannot_be_issued_twice(tmp_path) -> None:
    database = tmp_path / "pilot.sqlite3"
    issued = issue_exact_owner_authorization(database)
    assert issued["authorization_count"] == 1
    assert issued["provider"] == "openai" and issued["model"] == "gpt-5.6-terra"
    assert issued["endpoint"] == "/v1/responses" and issued["retries"] == 0
    assert issued["store"] is False and issued["background"] is False and issued["stream"] is False
    assert issued["web_search"] is False and issued["tools"] == [] and issued["cost_cap_usd"] == "0.05"
    summary = safe_audit_summary(database)
    assert summary["authorization_count"] == 1
    assert summary["authorizations"][0]["status"] == "approved"
    assert summary["analysis_post_count"] == 0 and summary["provider_call_count"] == 0
    with pytest.raises(RuntimeError, match="not empty"):
        issue_exact_owner_authorization(database)


def test_owner_approved_runtime_reads_exact_credential_once_and_surfaces_one_request_id(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    database = tmp_path / "pilot.sqlite3"
    issued = issue_exact_owner_authorization(database)
    calls = []
    app = create_owner_approved_pilot_app(
        credential_reader=lambda target: calls.append(target) or "fake-memory-only-credential",
        database_path=database,
    )
    with TestClient(app) as client:
        configuration = client.get("/api/v1/garment-reference-analyses/configuration").json()
    assert calls == [EXACT_CREDENTIAL_TARGET]
    assert configuration["pilot_ready"] is True
    assert configuration["pilot_request_id"] == issued["request_id"]


def test_configuration_one_cent_over_budget_blocks_before_credential_and_authorization(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(garment, "MAX_OUTPUT_TOKENS", 3_200)
    credential_calls = []
    with pytest.raises(garment.GarmentReferenceError, match=r"\$0\.05") as runtime_error:
        create_secure_pilot_app(credential_reader=lambda target: credential_calls.append(target) or "unused")
    assert runtime_error.value.code == "cost_cap_exceeded"
    assert credential_calls == []

    database = tmp_path / "must-not-exist.sqlite3"
    with pytest.raises(garment.GarmentReferenceError) as authorization_error:
        issue_exact_owner_authorization(database)
    assert authorization_error.value.code == "cost_cap_exceeded"
    assert not database.exists()


def test_blocked_request_is_atomically_cancelled_and_replaced_without_attempt(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    database = tmp_path / "pilot.sqlite3"
    first = issue_exact_owner_authorization(database)
    assert first["request_id"] != "pilot-request:c8c4d4ca-996b-4c2b-99f8-930e565bde7e"

    # Recreate the production blocked request identity in an isolated test database.
    import yarnai.openai_pilot_runtime as runtime
    original_blocked = runtime.BLOCKED_REQUEST_ID
    runtime.BLOCKED_REQUEST_ID = first["request_id"]
    try:
        replacement = replace_blocked_owner_authorization(database)
    finally:
        runtime.BLOCKED_REQUEST_ID = original_blocked

    summary = safe_audit_summary(database)
    assert replacement["supersedes_request_id"] == first["request_id"]
    assert [row["status"] for row in summary["authorizations"]] == ["cancelled", "approved"]
    assert summary["authorizations"][0]["superseded_by_request_id"] == replacement["request_id"]
    assert summary["analysis_post_count"] == 0 and summary["provider_call_count"] == 0

    calls = []
    app = create_owner_approved_pilot_app(
        credential_reader=lambda target: calls.append(target) or "fake-memory-only-credential",
        database_path=database,
    )
    with TestClient(app) as client:
        configuration = client.get("/api/v1/garment-reference-analyses/configuration").json()
    assert calls == [EXACT_CREDENTIAL_TARGET]
    assert configuration["pilot_request_id"] == replacement["request_id"]
