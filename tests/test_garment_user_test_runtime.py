from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
import sqlite3

import pytest
from starlette.testclient import TestClient

import yarnai.openai_pilot_runtime as pilot
from yarnai.garment_reference import GarmentReferenceError, validate_pilot_request
from yarnai.garment_user_test_runtime import UserTestSessionStore, SessionSourceVerifier, create_user_test_app
from yarnai.vision_review import DEFAULT_MODEL
from test_garment_reference_gateway import request_payload, response_payload, FakeTransport

ORIGIN = "http://127.0.0.1:8030"
CONFIG = "/api/v1/garment-reference-analyses/configuration"
ANALYZE = "/api/v1/garment-reference-analyses"


@pytest.fixture(autouse=True)
def forbid_external_actions(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    def forbidden(*args, **kwargs):
        raise AssertionError("No real credential or external transport is permitted")
    monkeypatch.setattr(pilot, "read_yarnai_pilot_credential", forbidden)
    monkeypatch.setattr(pilot.UrllibJsonTransport, "post_json", forbidden)


def prepared(tmp_path):
    path = tmp_path / "user-test.sqlite3"
    store = UserTestSessionStore(path)
    allowance = store.issue(origin=ORIGIN)
    payload = request_payload()
    payload["request_id"] = allowance["request_id"]
    return path, store, payload


def fake_transport():
    return FakeTransport({"status": "completed", "model": DEFAULT_MODEL, "output": [
        {"type": "message", "content": [{"type": "output_text", "text": json.dumps(response_payload())}]}]})


def test_no_session_and_consumed_session_refuse_before_credential(tmp_path):
    reads = []
    with pytest.raises(RuntimeError):
        create_user_test_app(tmp_path / "empty.sqlite3", credential_reader=lambda target: reads.append(target))
    path, store, payload = prepared(tmp_path)
    assert store.consume(validate_pilot_request(payload))
    with pytest.raises(RuntimeError):
        create_user_test_app(path, credential_reader=lambda target: reads.append(target))
    assert reads == []


def test_one_browser_selected_project_binds_exactly_and_replay_cannot_spend(tmp_path):
    path, store, payload = prepared(tmp_path)
    transport = fake_transport()
    app = create_user_test_app(path, credential_reader=lambda _: "fake-test-secret", transport=transport)
    with TestClient(app, base_url=ORIGIN) as client:
        config = client.get(CONFIG).json()
        assert config["pilot_ready"] and config["pilot_request_id"] == payload["request_id"]
        assert "fake-test-secret" not in json.dumps(config)
        headers = {"Origin": ORIGIN, "X-YarnAI-User-Test-Token": config["user_test_token"]}
        response = client.post(ANALYZE, json=payload, headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["source_identity"] == payload["source_identity"]
        assert client.post(ANALYZE, json=payload, headers=headers).status_code == 409
        assert not client.get(CONFIG).json()["pilot_ready"]
    assert len(transport.calls) == 1
    restored = UserTestSessionStore(path)
    assert restored.pending_request_id() is None
    assert restored.pending_binding()["sanitized_photo_sha256"] == payload["sanitized_image"]["sha256"]
    with pytest.raises(sqlite3.IntegrityError):
        restored.issue(origin=ORIGIN)
    changed = deepcopy(payload["source_identity"])
    changed["project_revision"] += 1
    with pytest.raises(GarmentReferenceError, match="изменилась"):
        SessionSourceVerifier(restored).assert_current(changed)


def test_cross_site_wrong_port_and_missing_nonce_never_reach_transport(tmp_path):
    path, store, payload = prepared(tmp_path)
    transport = fake_transport()
    app = create_user_test_app(path, credential_reader=lambda _: "fake-test-secret", transport=transport)
    with TestClient(app, base_url=ORIGIN) as client:
        config = client.get(CONFIG).json()
        assert client.get(CONFIG, headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
        assert client.get(CONFIG, headers={"Host": "localhost:8030"}).status_code == 403
        for headers in [
            {}, {"Origin": ORIGIN},
            {"Origin": "http://127.0.0.1:8000", "X-YarnAI-User-Test-Token": config["user_test_token"]},
            {"Origin": "https://example.org", "X-YarnAI-User-Test-Token": config["user_test_token"]},
        ]:
            assert client.post(ANALYZE, json=payload, headers=headers).status_code == 403
        assert client.get(CONFIG).json()["pilot_ready"]
    assert transport.calls == []


def test_concurrent_consumption_has_one_winner_and_preserves_exact_binding(tmp_path):
    path, store, payload = prepared(tmp_path)
    validated = validate_pilot_request(payload)
    stores = [UserTestSessionStore(path) for _ in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda s: s.consume(validated), stores))
    assert sorted(outcomes) == [False, True]
    assert store.session()["status"] == "consumed"


def test_invalid_payload_burns_http_attempt_without_provider_or_silent_retry(tmp_path):
    path, store, payload = prepared(tmp_path)
    transport = fake_transport()
    app = create_user_test_app(path, credential_reader=lambda _: "fake-test-secret", transport=transport)
    with TestClient(app, base_url=ORIGIN) as client:
        token = client.get(CONFIG).json()["user_test_token"]
        headers = {"Origin": ORIGIN, "X-YarnAI-User-Test-Token": token}
        broken = deepcopy(payload)
        broken["sanitized_image"]["sha256"] = "b" * 64
        assert client.post(ANALYZE, json=broken, headers=headers).status_code >= 400
        assert not client.get(CONFIG).json()["pilot_ready"]
        assert client.post(ANALYZE, json=payload, headers=headers).status_code == 409
    assert transport.calls == []
    with pytest.raises(RuntimeError):
        create_user_test_app(path, credential_reader=lambda _: (_ for _ in ()).throw(AssertionError("credential")))
