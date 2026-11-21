from __future__ import annotations

import base64
import hashlib
import json
import logging
import struct
import zlib
from copy import deepcopy
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai.garment_reference as garment
import yarnai.vision_review as vision_review
from yarnai.garment_reference import (
    CONTRACT_VERSION, COST_CAP_USD, FORBIDDEN_EXACT_CLAIMS, GARMENT_PILOT_JSON_SCHEMA,
    GarmentReferenceError, GarmentReferenceGateway, OpenAIResponsesAdapter,
    PilotAuthorization, SqlitePilotAuthorizationStore, build_pilot_responses_api_request,
    build_validated_pilot_responses_api_request,
    UrllibJsonTransport, estimate_image_tokens, estimate_pilot_configuration_cost, estimate_request_cost, extract_structured_output,
    estimate_validated_request_cost, validate_pilot_provider_response, validate_pilot_request,
)
from yarnai.http import create_app
from yarnai.vision_review import DEFAULT_MODEL, DEFAULT_PROVIDER, VisionGatewaySettings


PROJECT_ID = "01a05b5f-ecb0-7840-b596-bb62dae64ef9"
PHOTO_ID = "01a05b60-ecb0-7840-b596-bb62dae64ef9"
SOURCE_SHA = "a" * 64
REQUEST_ID = "pilot-request:one"


def png_bytes(width: int = 2, height: int = 2) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    rows = b"".join(b"\x00" + bytes([240, 230, 210, 255]) * width for _ in range(height))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def request_payload(*, image: bytes | None = None) -> dict:
    sanitized = image or png_bytes()
    return {
        "contract_version": CONTRACT_VERSION, "pilot_schema_version": 1, "request_id": REQUEST_ID,
        "source_identity": {"project_id": PROJECT_ID, "project_revision": 7, "reference_photos": [{"photo_id": PHOTO_ID, "sha256": SOURCE_SHA}], "request_fingerprint": "fnv1a32:12345678"},
        "source_photo_id": PHOTO_ID, "source_photo_sha256": SOURCE_SHA,
        "sanitized_image": {"mime_type": "image/png", "content_base64": base64.b64encode(sanitized).decode("ascii"), "sha256": hashlib.sha256(sanitized).hexdigest(), "width": 2, "height": 2},
        "user_clarifications": [{"type": "desired_change", "text": "Карман не нужен"}],
        "user_confirmed_exact_sanitized_photo": True, "explicit_action": "run_one_shot_garment_photo_pilot",
    }


def response_payload() -> dict:
    return {
        "visibleObservations": [{"id": "visible:silhouette", "description": "Свободный прямой силуэт", "visualEvidence": "По бокам заметен запас объёма."}],
        "uncertainObservations": [{"id": "uncertain:direction", "possibleInterpretations": ["Снизу вверх", "Сверху вниз"], "uncertaintyReason": "Монтажные линии не видны.", "clarificationMethod": "Показать изнанку плеча.", "confidence": "medium"}],
        "technologyOptions": [
            {"id": "option:bottom", "name": "Снизу вверх", "construction": "Корпус и рукава отдельными частями.", "knittingDirection": "Снизу вверх", "suggestedTechniques": ["Резинка", "Лицевой узор"], "observationIds": ["visible:silhouette", "uncertain:direction"], "visualEvidence": "Поддерживает прямой силуэт.", "alternativeExplanation": "Плечо может быть собрано иначе.", "confidence": "medium"},
            {"id": "option:top", "name": "Сверху вниз", "construction": "Единая верхняя часть с последующим разделением.", "knittingDirection": "Сверху вниз", "suggestedTechniques": ["Прибавки", "Вязание по кругу"], "observationIds": ["visible:silhouette", "uncertain:direction"], "visualEvidence": "Также совместимо с видимым силуэтом.", "alternativeExplanation": "На фото не доказано отсутствие швов.", "confidence": "low"},
        ],
        "cannotDetermineFromPhoto": [{"feature": "Точная плотность", "reason": "Нет контрольного образца с линейкой."}],
        "clarifyingQuestions": [{"question": "Есть ли плечевой шов?", "reason": "Он различает две конструкции.", "distinguishes": ["Со швом", "Без шва"]}],
        "forbiddenExactClaims": sorted(FORBIDDEN_EXACT_CLAIMS),
    }


class FakeProvider:
    def __init__(self, response: dict | None = None, error: Exception | None = None) -> None:
        self.response, self.error, self.calls = response or response_payload(), error, []
    def review(self, request: dict) -> dict:
        self.calls.append(deepcopy(request))
        if self.error: raise self.error
        return deepcopy(self.response)


class FakeVerifier:
    def __init__(self) -> None: self.calls = []
    def assert_current(self, identity: dict) -> None: self.calls.append(deepcopy(identity))


class FakeTransport:
    def __init__(self, response: dict) -> None: self.response, self.calls = response, []
    def post_json(self, endpoint, payload, *, headers, timeout_seconds):
        self.calls.append({"endpoint": endpoint, "payload": deepcopy(payload), "headers": dict(headers), "timeout": timeout_seconds})
        return deepcopy(self.response)


def enabled_settings(**overrides) -> VisionGatewaySettings:
    values = dict(provider=DEFAULT_PROVIDER, model=DEFAULT_MODEL, explicitly_enabled=True, credential_configured=True)
    values.update(overrides)
    return VisionGatewaySettings(**values)


def authorized_gateway(tmp_path: Path, *, provider=None, settings=None):
    request = request_payload(); store = SqlitePilotAuthorizationStore(tmp_path / "pilot.sqlite3")
    store.issue(PilotAuthorization(
        authorization_id="authorization:one", request_id=request["request_id"], source_identity=request["source_identity"],
        source_photo_id=request["source_photo_id"], source_photo_sha256=request["source_photo_sha256"],
        sanitized_photo_sha256=request["sanitized_image"]["sha256"], sanitized_width=request["sanitized_image"]["width"],
        sanitized_height=request["sanitized_image"]["height"], sanitized_byte_size=len(base64.b64decode(request["sanitized_image"]["content_base64"])),
    ))
    fake, verifier = provider or FakeProvider(), FakeVerifier()
    return GarmentReferenceGateway(settings or enabled_settings(), provider=fake, state_verifier=verifier, authorization_store=store), fake, verifier, store


def test_default_feature_flag_is_closed_and_network_tripwire_stays_silent(monkeypatch) -> None:
    attempts = []
    monkeypatch.setattr(garment.urllib.request, "urlopen", lambda *args, **kwargs: attempts.append((args, kwargs)) or (_ for _ in ()).throw(AssertionError("external network tripwire")))
    with TestClient(create_app()) as client:
        configuration = client.get("/api/v1/garment-reference-analyses/configuration")
        response = client.post("/api/v1/garment-reference-analyses", json=request_payload())
        client.get("/garment-reference-analysis"); client.get("/health")
    assert configuration.json()["enabled"] is False and configuration.json()["pilot_ready"] is False
    assert configuration.json()["usage_charged"] is False and "Реальный анализ ещё не запускался" in configuration.json()["message"]
    assert configuration.json()["cost_cap_usd"] == "0.05"
    assert configuration.json()["worst_case_cost_usd"] == "0.048900"
    assert response.status_code == 503 and attempts == []


def test_default_app_composition_never_reads_openai_api_key(monkeypatch) -> None:
    class KeyReadTripwire(dict):
        def get(self, key, default=None):
            if key == "OPENAI_API_KEY":
                raise AssertionError("default app composition attempted to read OPENAI_API_KEY")
            return super().get(key, default)

    monkeypatch.setattr(vision_review.os, "environ", KeyReadTripwire())
    with TestClient(create_app()) as client:
        assert client.get("/api/v1/garment-reference-analyses/configuration").json()["enabled"] is False


@pytest.mark.parametrize("settings", [VisionGatewaySettings(explicitly_enabled=False, credential_configured=True), VisionGatewaySettings(explicitly_enabled=True, credential_configured=False)])
def test_disabled_flag_or_missing_credential_refuses_before_transport(tmp_path: Path, settings) -> None:
    gateway, provider, _, _ = authorized_gateway(tmp_path, settings=settings)
    with pytest.raises(GarmentReferenceError) as raised: gateway.analyze(request_payload())
    assert raised.value.code == "garment_reference_gateway_disabled" and provider.calls == []


@pytest.mark.parametrize("settings", [enabled_settings(provider="other"), enabled_settings(model="browser-choice")])
def test_wrong_provider_or_model_refuses_before_transport(tmp_path: Path, settings) -> None:
    gateway, provider, _, _ = authorized_gateway(tmp_path, settings=settings)
    with pytest.raises(GarmentReferenceError) as raised: gateway.analyze(request_payload())
    assert raised.value.code == "provider_model_not_allowed" and provider.calls == []


def test_png_decode_metadata_sha_and_identity_guards_fail_closed() -> None:
    request = request_payload(); request["sanitized_image"]["sha256"] = "b" * 64
    with pytest.raises(GarmentReferenceError) as raised: validate_pilot_request(request)
    assert raised.value.code == "sanitized_image_sha256_mismatch"
    metadata_png = png_bytes()[:-12]; text = b"comment\x00private"
    metadata_png += struct.pack(">I", len(text)) + b"tEXt" + text + struct.pack(">I", zlib.crc32(b"tEXt" + text) & 0xFFFFFFFF) + png_bytes()[-12:]
    with pytest.raises(GarmentReferenceError) as raised: validate_pilot_request(request_payload(image=metadata_png))
    assert raised.value.code == "sanitized_image_metadata_present"
    foreign = request_payload(); foreign["source_photo_sha256"] = "c" * 64
    with pytest.raises(GarmentReferenceError) as raised: validate_pilot_request(foreign)
    assert raised.value.code == "pilot_photo_identity_mismatch"


def test_official_cost_formula_stays_below_cap_and_unknown_dimensions_fail() -> None:
    estimate = estimate_request_cost(request_payload())
    configuration = estimate_pilot_configuration_cost()
    assert estimate["image_tokens_upper_bound"] == 2 and estimate["max_output_tokens"] == 2_200 and estimate["upper_bound_usd"] < COST_CAP_USD
    assert configuration["input_tokens_upper_bound"] == 9_000
    assert configuration["input_cost_upper_bound_usd"] == garment.Decimal("0.022500")
    assert configuration["output_cost_upper_bound_usd"] == garment.Decimal("0.026400")
    assert configuration["upper_bound_usd"] == garment.Decimal("0.048900") <= COST_CAP_USD
    assert estimate_image_tokens(1600, 1600) == 3_000
    with pytest.raises(GarmentReferenceError) as raised: estimate_image_tokens(0, 1600)
    assert raised.value.code == "image_token_cost_unknown"


def test_gateway_uses_one_immutable_validation_artifact_without_redecode(tmp_path: Path, monkeypatch) -> None:
    gateway, provider, _, store = authorized_gateway(tmp_path)
    original_boundary = garment.validate_pilot_request
    original_strict_png = garment.validate_sanitized_png
    original_decode = garment.base64.b64decode
    original_estimator = garment.estimate_validated_request_cost
    original_builder = garment.build_validated_pilot_responses_api_request
    counts = {"boundary": 0, "strict_png": 0, "decode": 0, "estimator": 0, "builder": 0}
    validated_png_bytes = []

    def boundary_spy(payload):
        counts["boundary"] += 1
        return original_boundary(payload)

    def strict_png_spy(image_bytes, *, expected_sha256):
        counts["strict_png"] += 1
        validated_png_bytes.append(image_bytes)
        return original_strict_png(image_bytes, expected_sha256=expected_sha256)

    def decode_spy(*args, **kwargs):
        counts["decode"] += 1
        return original_decode(*args, **kwargs)

    def estimator_spy(request):
        counts["estimator"] += 1
        return original_estimator(request)

    def builder_spy(request, settings):
        counts["builder"] += 1
        assert request.sanitized_image.image_bytes is validated_png_bytes[0]
        built = original_builder(request, settings)
        encoded = built["input"][1]["content"][1]["image_url"].split(",", 1)[1]
        assert encoded == base64.b64encode(validated_png_bytes[0]).decode("ascii")
        return built

    monkeypatch.setattr(garment, "validate_pilot_request", boundary_spy)
    monkeypatch.setattr(garment, "validate_sanitized_png", strict_png_spy)
    monkeypatch.setattr(garment.base64, "b64decode", decode_spy)
    monkeypatch.setattr(garment, "estimate_validated_request_cost", estimator_spy)
    monkeypatch.setattr(garment, "build_validated_pilot_responses_api_request", builder_spy)
    monkeypatch.setattr(
        garment.urllib.request,
        "build_opener",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("real network is forbidden")),
    )

    with TestClient(create_app(garment_reference_gateway=gateway)) as client:
        response = client.post("/api/v1/garment-reference-analyses", json=request_payload())
    result = response.json()

    assert response.status_code == 200
    assert result["pilot_schema_version"] == 1
    assert counts == {"boundary": 1, "strict_png": 1, "decode": 1, "estimator": 2, "builder": 1}
    assert len(provider.calls) == 1
    assert store.audit_summary()["analysis_post_count"] == 1


def test_invalid_png_stops_after_one_strict_validation_before_provider(tmp_path: Path, monkeypatch) -> None:
    gateway, provider, _, store = authorized_gateway(tmp_path)
    original_strict_png = garment.validate_sanitized_png
    strict_calls = 0

    def strict_png_spy(image_bytes, *, expected_sha256):
        nonlocal strict_calls
        strict_calls += 1
        return original_strict_png(image_bytes, expected_sha256=expected_sha256)

    monkeypatch.setattr(garment, "validate_sanitized_png", strict_png_spy)
    monkeypatch.setattr(
        garment,
        "build_validated_pilot_responses_api_request",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("builder must remain unreachable")),
    )
    damaged = request_payload(image=b"syntactically valid base64 but not a PNG")
    with pytest.raises(GarmentReferenceError) as raised:
        gateway.analyze(damaged)

    assert raised.value.code == "sanitized_image_decode_failed"
    assert strict_calls == 1
    assert provider.calls == []
    assert store.pending_request_id() == REQUEST_ID
    assert store.audit_summary()["provider_call_count"] == 0


def test_validated_only_estimator_and_builder_reject_raw_objects_without_validation(monkeypatch) -> None:
    raw = request_payload()
    validated = validate_pilot_request(raw)
    validation_calls = 0

    def validation_tripwire(_payload):
        nonlocal validation_calls
        validation_calls += 1
        raise AssertionError("validated-only path must not validate raw input")

    monkeypatch.setattr(garment, "validate_pilot_request", validation_tripwire)
    assert estimate_request_cost(validated)["upper_bound_usd"] < COST_CAP_USD
    assert build_pilot_responses_api_request(validated, enabled_settings())["model"] == DEFAULT_MODEL
    with pytest.raises(TypeError, match="ValidatedPilotRequest"):
        estimate_validated_request_cost(raw)  # type: ignore[arg-type]
    with pytest.raises(TypeError, match="ValidatedPilotRequest"):
        build_validated_pilot_responses_api_request(raw, enabled_settings())  # type: ignore[arg-type]
    assert validation_calls == 0


def test_validated_request_is_deeply_immutable_and_detached_from_raw_input() -> None:
    raw = request_payload()
    original_png = png_bytes()
    validated = validate_pilot_request(raw)

    raw["request_id"] = "pilot-request:tampered"
    raw["source_identity"]["reference_photos"][0]["sha256"] = "b" * 64
    raw["user_clarifications"][0]["text"] = "Подменено после проверки"
    raw["sanitized_image"]["content_base64"] = base64.b64encode(b"tampered").decode("ascii")
    with pytest.raises(FrozenInstanceError):
        validated.request_id = "pilot-request:tampered"  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        validated.sanitized_image.width = 999  # type: ignore[misc]

    built = build_validated_pilot_responses_api_request(validated, enabled_settings())
    encoded = built["input"][1]["content"][1]["image_url"].split(",", 1)[1]
    assert validated.request_id == REQUEST_ID
    assert validated.source_identity.reference_photos[0].sha256 == SOURCE_SHA
    assert validated.user_clarifications[0].text == "Карман не нужен"
    assert validated.sanitized_image.image_bytes == original_png
    assert base64.b64decode(encoded, validate=True) == original_png


def test_two_independent_requests_each_cross_the_strict_png_boundary_once(monkeypatch) -> None:
    original_strict_png = garment.validate_sanitized_png
    strict_calls = 0

    def strict_png_spy(image_bytes, *, expected_sha256):
        nonlocal strict_calls
        strict_calls += 1
        return original_strict_png(image_bytes, expected_sha256=expected_sha256)

    monkeypatch.setattr(garment, "validate_sanitized_png", strict_png_spy)
    first_raw = request_payload()
    second_raw = request_payload()
    second_raw["request_id"] = "pilot-request:two"
    first = validate_pilot_request(first_raw)
    second = validate_pilot_request(second_raw)

    assert strict_calls == 2
    assert first is not second
    assert first.request_id == REQUEST_ID and second.request_id == "pilot-request:two"


def test_cost_above_cap_refuses_before_transport(tmp_path: Path, monkeypatch) -> None:
    gateway, provider, _, _ = authorized_gateway(tmp_path); monkeypatch.setattr(garment, "MAX_OUTPUT_TOKENS", 3_200)
    with pytest.raises(GarmentReferenceError) as raised: gateway.analyze(request_payload())
    assert raised.value.code == "cost_cap_exceeded" and provider.calls == []


@pytest.mark.parametrize("component", ["instruction", "schema"])
def test_growing_system_text_is_budgeted_and_refused_before_transport(tmp_path: Path, monkeypatch, component: str) -> None:
    gateway, provider, _, _ = authorized_gateway(tmp_path)
    if component == "instruction":
        monkeypatch.setattr(garment, "_developer_instruction", lambda: "x" * 6_000)
    else:
        schema = deepcopy(GARMENT_PILOT_JSON_SCHEMA)
        schema["description"] = "x" * 6_000
        monkeypatch.setattr(garment, "GARMENT_PILOT_JSON_SCHEMA", schema)
    with pytest.raises(GarmentReferenceError) as raised:
        gateway.analyze(request_payload())
    assert raised.value.code == "text_token_cost_unknown"
    assert provider.calls == []


def test_valid_russian_fake_response_keeps_structure_and_one_shot_is_not_retried(tmp_path: Path) -> None:
    serialized = json.dumps(response_payload(), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    assert len(serialized) <= garment.MAX_OUTPUT_TOKENS
    gateway, provider, verifier, store = authorized_gateway(tmp_path)
    first = gateway.analyze(request_payload())
    assert first["pilot_schema_version"] == 1 and len(first["technologyOptions"]) == 2 and len(provider.calls) == 1 and len(verifier.calls) == 2
    assert first["visibleObservations"][0]["description"] == "Свободный прямой силуэт"
    assert [option["name"] for option in first["technologyOptions"]] == ["Снизу вверх", "Сверху вниз"]
    assert first["cannotDetermineFromPhoto"][0]["reason"] == "Нет контрольного образца с линейкой."
    assert first["clarifyingQuestions"][0]["question"] == "Есть ли плечевой шов?"
    assert store.pending_request_id() is None
    reopened = GarmentReferenceGateway(enabled_settings(), provider=provider, state_verifier=verifier, authorization_store=SqlitePilotAuthorizationStore(tmp_path / "pilot.sqlite3"))
    with pytest.raises(GarmentReferenceError) as raised: reopened.analyze(request_payload())
    assert raised.value.code == "pilot_authorization_missing_or_used" and len(provider.calls) == 1


def test_request_builder_matches_responses_contract_and_contains_no_project_metadata() -> None:
    built = build_pilot_responses_api_request(request_payload(), enabled_settings())
    assert built["model"] == "gpt-5.6-terra" and built["store"] is False and built["background"] is False and built["stream"] is False
    assert built["service_tier"] == "default"
    assert built["tools"] == [] and built["reasoning"] == {"effort": "medium"} and built["max_output_tokens"] == 2_200
    assert built["text"]["format"] == {"type": "json_schema", "name": "yarnai_garment_photo_pilot_v1", "strict": True, "schema": GARMENT_PILOT_JSON_SCHEMA}
    image = built["input"][1]["content"][1]
    assert image["type"] == "input_image" and image["detail"] == "high" and image["image_url"].startswith("data:image/png;base64,")
    serialized = json.dumps(built, ensure_ascii=False)
    assert PROJECT_ID not in serialized and PHOTO_ID not in serialized and "OPENAI_API_KEY" not in serialized
    for forbidden in ("file_id", "web_search", "file_search", "previous_response_id", "metadata"): assert forbidden not in serialized


def test_request_instruction_explicitly_requires_short_russian_user_text() -> None:
    built = build_pilot_responses_api_request(request_payload(), enabled_settings())
    instruction = built["input"][0]["content"][0]["text"]
    context = json.loads(built["input"][1]["content"][0]["text"])

    for required in (
        "Все пользовательские тексты ответа пиши только по-русски",
        "Названия ровно двух или трёх",
        "коротко, простыми словами",
        "fully-fashioned (вязание деталей точно по форме)",
        "Не обещай точность, которую нельзя получить по одной фотографии",
    ):
        assert required in instruction
    assert context["purpose"] == "Предложить честные варианты технологии для визуально похожего вязаного изделия простыми русскими словами."


@pytest.mark.parametrize("mutation, code", [
    (lambda value: value.update(extra=True), "provider_response_schema_invalid"),
    (lambda value: value["technologyOptions"].append(deepcopy(value["technologyOptions"][0])), "provider_response_schema_invalid"),
    (lambda value: value["technologyOptions"][0].update(observationIds=["visible:missing"]), "provider_response_evidence_mismatch"),
    (lambda value: value["technologyOptions"][0].update(confidence="0.97"), "provider_response_schema_invalid"),
    (lambda value: value["visibleObservations"][0].update(description="Набрать 40 петель"), "provider_response_forbidden_exact_claim"),
    (lambda value: value.update(forbiddenExactClaims=["stitch_counts"] * 8), "provider_response_schema_invalid"),
])
def test_schema_mismatch_unknown_ids_four_options_and_exact_claims_are_rejected(mutation, code) -> None:
    response = response_payload(); mutation(response)
    with pytest.raises(GarmentReferenceError) as raised: validate_pilot_provider_response(response, request_payload(), enabled_settings())
    assert raised.value.code == code


def test_malformed_incomplete_and_refusal_are_safe_failures() -> None:
    with pytest.raises(GarmentReferenceError) as incomplete: extract_structured_output({"status": "incomplete", "model": DEFAULT_MODEL, "output": []})
    assert incomplete.value.code == "provider_response_incomplete"
    with pytest.raises(GarmentReferenceError) as refusal: extract_structured_output({"status": "completed", "model": DEFAULT_MODEL, "output": [{"type": "message", "content": [{"type": "refusal", "refusal": "no"}]}]})
    assert refusal.value.code == "provider_refusal"
    with pytest.raises(GarmentReferenceError) as malformed: extract_structured_output({"status": "completed", "model": DEFAULT_MODEL, "output": [{"type": "message", "content": [{"type": "output_text", "text": "not-json"}]}]})
    assert malformed.value.code == "provider_response_malformed"


def test_timeout_consumes_authorization_and_does_not_retry(tmp_path: Path) -> None:
    provider = FakeProvider(error=TimeoutError("offline fake timeout")); gateway, _, _, store = authorized_gateway(tmp_path, provider=provider)
    with pytest.raises(GarmentReferenceError) as raised: gateway.analyze(request_payload())
    assert raised.value.code == "provider_timeout" and len(provider.calls) == 1 and store.pending_request_id() is None


def test_adapter_keeps_key_out_of_payload_logs_and_http_configuration(caplog) -> None:
    raw = {"status": "completed", "model": DEFAULT_MODEL, "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(response_payload())}]}]}
    transport = FakeTransport(raw); adapter = OpenAIResponsesAdapter("sk-test-never-log", transport=transport); caplog.set_level(logging.DEBUG)
    assert adapter.review({"model": DEFAULT_MODEL})["technologyOptions"]
    assert transport.calls[0]["headers"]["Authorization"] == "Bearer sk-test-never-log"
    assert "sk-test-never-log" not in transport.calls[0]["payload"] and "sk-test-never-log" not in caplog.text
    with TestClient(create_app()) as client: public = client.get("/api/v1/garment-reference-analyses/configuration").text
    assert "OPENAI_API_KEY" not in public and "credential" not in public.lower() and "base64" not in public.lower()


def test_durable_transport_audit_counts_one_call_and_records_safe_usage(tmp_path: Path, monkeypatch) -> None:
    raw = {
        "id": "resp_safe_audit_id", "status": "completed", "model": DEFAULT_MODEL,
        "usage": {
            "input_tokens": 100, "input_tokens_details": {"cached_tokens": 10, "cache_write_tokens": 20},
            "output_tokens": 50, "output_tokens_details": {"reasoning_tokens": 5}, "total_tokens": 150,
        },
        "output": [],
    }
    body = json.dumps(raw).encode("utf-8")

    class FakeResponse:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *args): return None
        def read(self, maximum): assert maximum == 2_000_001; return body

    class FakeOpener:
        def __init__(self): self.calls = 0
        def open(self, request, timeout): self.calls += 1; assert request.full_url == "https://api.openai.com/v1/responses"; return FakeResponse()

    opener = FakeOpener()
    monkeypatch.setattr(garment.urllib.request, "build_opener", lambda *handlers: opener)
    store = SqlitePilotAuthorizationStore(tmp_path / "audit.sqlite3")
    transport = UrllibJsonTransport(audit=store, request_id="pilot-request:audit")
    assert transport.post_json("https://api.openai.com/v1/responses", {"model": DEFAULT_MODEL}, headers={}, timeout_seconds=1)["id"] == "resp_safe_audit_id"
    with pytest.raises(GarmentReferenceError, match="transport attempt"):
        transport.post_json("https://api.openai.com/v1/responses", {"model": DEFAULT_MODEL}, headers={}, timeout_seconds=1)
    summary = store.audit_summary()
    assert opener.calls == 1 and summary["provider_call_count"] == 1
    row = summary["provider_calls"][0]
    assert row["http_status"] == 200 and row["result_status"] == "completed" and row["provider_response_id"] == "resp_safe_audit_id"
    assert json.loads(row["usage_json"])["total_tokens"] == 150 and row["actual_cost_usd"] == "0.000792"


def test_injected_gateway_route_returns_validated_result_without_secret(tmp_path: Path) -> None:
    gateway, provider, _, _ = authorized_gateway(tmp_path)
    with TestClient(create_app(garment_reference_gateway=gateway)) as client:
        configuration = client.get("/api/v1/garment-reference-analyses/configuration")
        response = client.post("/api/v1/garment-reference-analyses", json=request_payload())
    assert configuration.json()["pilot_ready"] is True and configuration.json()["pilot_request_id"] == REQUEST_ID
    assert response.status_code == 200 and len(response.json()["technologyOptions"]) == 2
    assert "content_base64" not in response.text and "Authorization" not in response.text and len(provider.calls) == 1
