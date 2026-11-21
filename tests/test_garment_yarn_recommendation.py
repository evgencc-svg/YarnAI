from __future__ import annotations

import base64
import hashlib
import json
import math
from pathlib import Path
import struct
import zlib
from copy import deepcopy

import pytest
from starlette.applications import Starlette
from starlette.testclient import TestClient

import yarnai.garment_yarn_recommendation as yarn
from yarnai.garment_reference import COST_CAP_USD, PilotAuthorization, SqlitePilotAuthorizationStore, validate_pilot_request
from yarnai.vision_review import DEFAULT_MODEL, DEFAULT_PROVIDER, VisionGatewaySettings


PROJECT_ID = "01a05b5f-ecb0-7840-b596-bb62dae64ef9"
PHOTO_ID = "01a05b60-ecb0-7840-b596-bb62dae64ef9"
SOURCE_SHA = "a" * 64
REQUEST_ID = "yarn-supplement:test"
VALID_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "garment_yarn_recommendation_valid.json"
RECORDED_BAD_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "garment_yarn_recommendation_recorded_bad.json"
SEMANTIC_CONTEXT = {
    "analysis": {"id": "analysis:test", "revision": 5, "fingerprint": "fnv1a32:c37bc08a"},
    "upstreamFacts": {
        "knit_scale": {"status": "observed"}, "vertical_texture": {"status": "observed"},
        "stitch_clarity": {"status": "inferred"}, "surface": {"status": "observed"},
        "fabric_behavior": {"status": "inferred"}, "color_effect": {"status": "observed"},
    },
    "unknownClaimCodes": ["shoulder_and_sleeve_construction", "seam_mode", "internal_construction"],
    "technologyDecision": {"id": "decision:test", "revision": 7, "fingerprint": "fnv1a32:27b54bd9", "constructionIdentity": "seamed_set_in_sleeve", "provenance": "selected"},
}


def png_bytes() -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    rows = b"\x00" + bytes([120, 110, 100, 255]) * 2
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 1, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def request_payload() -> dict:
    image = png_bytes()
    return {"contract_version": "GARMENT_REFERENCE_ANALYSIS_V1", "pilot_schema_version": 1, "request_id": REQUEST_ID, "source_identity": {"project_id": PROJECT_ID, "project_revision": 7, "reference_photos": [{"photo_id": PHOTO_ID, "sha256": SOURCE_SHA}], "request_fingerprint": "fnv1a32:12345678"}, "source_photo_id": PHOTO_ID, "source_photo_sha256": SOURCE_SHA, "sanitized_image": {"mime_type": "image/png", "content_base64": base64.b64encode(image).decode(), "sha256": hashlib.sha256(image).hexdigest(), "width": 2, "height": 1}, "user_clarifications": [], "user_confirmed_exact_sanitized_photo": True, "explicit_action": "run_one_shot_garment_photo_pilot"}


def rng(minimum, maximum, unit): return {"min": minimum, "max": maximum, "unit": unit}


def variant(kind, meters, stitches, rows, needles, surface="smooth") -> dict:
    return {"kind": kind, "metersPer100g": rng(*meters, "m_per_100g"), "categoryRu": "средняя толщина", "targetStitchesPer10cm": rng(*stitches, "stitches_per_10cm"), "targetRowsPer10cm": None if rows is None else rng(*rows, "rows_per_10cm"), "rowGaugeUncertainty": "Ряды уточнить по образцу." if rows is None else None, "initialNeedlesMm": rng(*needles, "mm"), "strandCount": 1, "surface": surface, "textureEffect": "Вертикальные дорожки остаются читаемыми.", "drapeStructure": "Пластичное полотно.", "garmentWeightVolume": "Средние вес и объём.", "trimBehavior": "Воротник, планка и резинка держат форму.", "referenceSimilarity": "Масштаб близок к фотографии.", "risk": "Состав изменит объём.", "confidence": "medium", "basis": ["Адаптация для ручной конструкции."]}


def response_payload() -> dict:
    return json.loads(VALID_FIXTURE_PATH.read_text(encoding="utf-8"))


def provider_envelope(payload: object | None = None, *, status: str = "completed", refusal: str | None = None, output_text: str | None = None) -> dict:
    content = []
    if refusal is not None:
        content.append({"type": "refusal", "refusal": refusal})
    elif output_text is not None:
        content.append({"type": "output_text", "text": output_text})
    else:
        content.append({"type": "output_text", "text": json.dumps(payload, ensure_ascii=False, separators=(",", ":"))})
    return {"id": "resp_fake_yarn_v1", "status": status, "model": DEFAULT_MODEL, "incomplete_details": {"reason": "max_output_tokens"} if status == "incomplete" else None, "output": [{"type": "message", "content": content}]}


class FakeProvider:
    def __init__(self): self.calls = []
    def analyze(self, request, *, semantic_context=None): self.calls.append({"request": request, "semantic_context": deepcopy(semantic_context)}); return deepcopy(response_payload())


class FakeVerifier:
    def __init__(self): self.calls = []
    def assert_current(self, identity): self.calls.append(deepcopy(identity))
    def semantic_context(self, identity): self.calls.append({"semantic_context_for": deepcopy(identity)}); return deepcopy(SEMANTIC_CONTEXT)


class NetworkBlockedFakeTransport:
    """Explicit local fake: it has no socket-capable code path."""

    def __init__(self, response, audit, request_id):
        self.response = deepcopy(response); self.audit = audit; self.request_id = request_id; self.calls = []

    def post_json(self, endpoint, payload, *, headers, timeout_seconds):
        self.calls.append({"endpoint": endpoint, "payload": deepcopy(payload), "headers": sorted(headers), "timeout_seconds": timeout_seconds})
        self.audit.record_transport_started(self.request_id, "/v1/responses")
        self.audit.record_transport_result(self.request_id, http_status=200, response=self.response)
        return deepcopy(self.response)


def authorized_gateway(tmp_path):
    raw = request_payload(); request = validate_pilot_request(raw); store = SqlitePilotAuthorizationStore(tmp_path / "supplement.sqlite3")
    store.issue(PilotAuthorization(authorization_id="supplement-auth:test", request_id=REQUEST_ID, source_identity=raw["source_identity"], source_photo_id=PHOTO_ID, source_photo_sha256=SOURCE_SHA, sanitized_photo_sha256=raw["sanitized_image"]["sha256"], sanitized_width=2, sanitized_height=1, sanitized_byte_size=len(request.sanitized_image.image_bytes)))
    provider, verifier = FakeProvider(), FakeVerifier()
    gateway = yarn.GarmentYarnRecommendationGateway(VisionGatewaySettings(provider=DEFAULT_PROVIDER, model=DEFAULT_MODEL, explicitly_enabled=True, credential_configured=True), provider=provider, state_verifier=verifier, authorization_store=store)
    return gateway, provider, verifier, store


def authorized_adapter_gateway(tmp_path, response):
    raw = request_payload(); request = validate_pilot_request(raw); store = SqlitePilotAuthorizationStore(tmp_path / "supplement-adapter.sqlite3")
    store.issue(PilotAuthorization(authorization_id="supplement-auth:test", request_id=REQUEST_ID, source_identity=raw["source_identity"], source_photo_id=PHOTO_ID, source_photo_sha256=SOURCE_SHA, sanitized_photo_sha256=raw["sanitized_image"]["sha256"], sanitized_width=2, sanitized_height=1, sanitized_byte_size=len(request.sanitized_image.image_bytes)))
    transport = NetworkBlockedFakeTransport(response, store, REQUEST_ID)
    provider = yarn.OpenAIYarnRecommendationProvider("local-fake-credential", transport=transport, audit=store, request_id=REQUEST_ID)
    verifier = FakeVerifier()
    gateway = yarn.GarmentYarnRecommendationGateway(VisionGatewaySettings(provider=DEFAULT_PROVIDER, model=DEFAULT_MODEL, explicitly_enabled=True, credential_configured=True), provider=provider, state_verifier=verifier, authorization_store=store)
    return gateway, transport, verifier, store


def test_configuration_exposes_only_exact_pending_public_binding_and_hides_it_after_consume(tmp_path):
    gateway, _provider, _verifier, store = authorized_gateway(tmp_path)
    configuration = gateway.configuration()
    assert configuration["pilot_ready"] is True and configuration["pilot_request_id"] == REQUEST_ID
    assert configuration["pilot_authorization_binding"] == {
        "request_id": REQUEST_ID,
        "source_identity": {"project_id": PROJECT_ID, "project_revision": 7, "reference_photos": [{"photo_id": PHOTO_ID, "sha256": SOURCE_SHA}]},
        "source_photo_id": PHOTO_ID,
        "source_photo_sha256": SOURCE_SHA,
        "sanitized_photo_sha256": request_payload()["sanitized_image"]["sha256"],
        "sanitized_width": 2,
        "sanitized_height": 1,
        "sanitized_byte_size": len(png_bytes()),
    }
    assert "binding_json" not in json.dumps(configuration)
    assert store.consume(validate_pilot_request(request_payload())) is True
    consumed = gateway.configuration()
    assert consumed["pilot_ready"] is False and consumed["pilot_request_id"] is None and consumed["pilot_authorization_binding"] is None


def test_strict_valid_payload_and_three_ordered_ranges():
    result = yarn.validate_provider_payload(response_payload(), semantic_context=SEMANTIC_CONTEXT)
    assert result["thinnerAlternative"]["metersPer100g"]["min"] > result["recommendedMiddle"]["metersPer100g"]["min"] > result["thickerAlternative"]["metersPer100g"]["min"]


def test_recorded_bad_output_is_exact_and_returns_all_semantic_issues_in_stable_order():
    recorded = json.loads(RECORDED_BAD_FIXTURE_PATH.read_text(encoding="utf-8"))
    compact = json.dumps(recorded, ensure_ascii=False, separators=(",", ":"))
    assert hashlib.sha256(compact.encode()).hexdigest() == "ed7f49d72adc7503ccbefb83a6a663b8a1c28c76f28951f111288d05fcfb2d6c"
    with pytest.raises(yarn.ProviderOutputValidationError) as caught:
        yarn.validate_provider_payload(recorded, semantic_context=SEMANTIC_CONTEXT)
    semantic = [
        (issue["reasonCode"], issue["path"])
        for issue in caught.value.issues
        if issue["reasonCode"] in {"UNGROUNDED_VISUAL_EVIDENCE", "REQUIRED_LIMITATION_MISSING", "SURFACE_LEVELS_NOT_DISTINCT"}
    ]
    assert semantic == [
        ("UNGROUNDED_VISUAL_EVIDENCE", "$.visualEvidence.fabricBehavior"),
        ("REQUIRED_LIMITATION_MISSING", "$.limitations[?(@.code=='exact_fiber_composition_unknown')]"),
        ("REQUIRED_LIMITATION_MISSING", "$.limitations[?(@.code=='exact_brand_article_unknown')]"),
        ("REQUIRED_LIMITATION_MISSING", "$.limitations[?(@.code=='original_yarn_linear_density_unknown')]"),
        ("REQUIRED_LIMITATION_MISSING", "$.limitations[?(@.code=='actual_original_gauge_unknown')]"),
        ("REQUIRED_LIMITATION_MISSING", "$.limitations[?(@.code=='post_wash_behavior_unknown')]"),
        ("SURFACE_LEVELS_NOT_DISTINCT", "$.surfaceRecommendation.mediumOrStrongHalo"),
    ]


def test_selected_manufacturing_choice_is_allowed_but_cannot_be_promoted_to_visual_fact():
    value = response_payload()
    assert yarn.validate_provider_payload(value, semantic_context=SEMANTIC_CONTEXT)["manufacturingChoice"]["provenance"] == "selected"
    value["visualEvidence"]["claimProvenance"]["fabricBehavior"] = {"kind": "observed", "upstreamFactCode": "fabric_behavior", "uncertainty": None}
    with pytest.raises(yarn.ProviderOutputValidationError) as caught:
        yarn.validate_provider_payload(value, semantic_context=SEMANTIC_CONTEXT)
    assert any(issue["reasonCode"] == "UNGROUNDED_VISUAL_EVIDENCE" and issue["path"] == "$.visualEvidence.fabricBehavior" for issue in caught.value.issues)


@pytest.mark.parametrize("missing_code", list(yarn._LIMITATION_CODES))
def test_each_required_structured_limitation_fails_independently(missing_code):
    value = response_payload(); value["limitations"] = [item for item in value["limitations"] if item["code"] != missing_code]
    with pytest.raises(yarn.ProviderOutputValidationError) as caught:
        yarn.validate_provider_payload(value, semantic_context=SEMANTIC_CONTEXT)
    expected_path = f"$.limitations[?(@.code=='{missing_code}')]"
    assert any(issue["reasonCode"] == "REQUIRED_LIMITATION_MISSING" and issue["path"] == expected_path for issue in caught.value.issues)


def test_four_surface_levels_are_distinct_and_medium_strong_cannot_be_combined():
    assert yarn.validate_provider_payload(response_payload(), semantic_context=SEMANTIC_CONTEXT)["surfaceRecommendation"]["strongHalo"]["level"] == "strong_halo"
    value = response_payload(); value["surfaceRecommendation"] = {
        "preferred": "Гладкая поверхность.", "slightHalo": "Слабый ворс.",
        "mediumOrStrongHalo": "Средний или сильный ворс.", "companionThread": "Без дополнительной нити.",
    }
    with pytest.raises(yarn.ProviderOutputValidationError) as caught:
        yarn.validate_provider_payload(value, semantic_context=SEMANTIC_CONTEXT)
    assert any(issue["reasonCode"] == "SURFACE_LEVELS_NOT_DISTINCT" and issue["path"] == "$.surfaceRecommendation.mediumOrStrongHalo" for issue in caught.value.issues)


def test_owner_decision_binding_mismatch_fails_closed():
    context = deepcopy(SEMANTIC_CONTEXT); context["technologyDecision"]["fingerprint"] = "fnv1a32:aaaaaaaa"
    with pytest.raises(yarn.ProviderOutputValidationError) as caught:
        yarn.validate_provider_payload(response_payload(), semantic_context=context)
    assert any(issue["reasonCode"] == "SELECTED_TECHNOLOGY_BINDING_MISMATCH" and issue["path"] == "$.manufacturingChoice.decisionFingerprint" for issue in caught.value.issues)


@pytest.mark.parametrize("bad", [(0, 1), (-1, 2), (5, 4), (math.nan, 2), (math.inf, math.inf)])
def test_invalid_ranges_fail_closed(bad):
    response = response_payload(); response["recommendedMiddle"]["initialNeedlesMm"] = rng(*bad, "mm")
    with pytest.raises(Exception): yarn.validate_provider_payload(response)


def test_unknown_fields_wrong_units_and_false_row_boundary_fail():
    extra = response_payload(); extra["brand"] = "Example"
    with pytest.raises(Exception): yarn.validate_provider_payload(extra)
    wrong = response_payload(); wrong["recommendedMiddle"]["metersPer100g"]["unit"] = "mm"
    with pytest.raises(Exception): yarn.validate_provider_payload(wrong)
    gauge = response_payload(); gauge["swatchRequirement"]["targetIsNotActualGauge"] = False
    with pytest.raises(Exception): yarn.validate_provider_payload(gauge)


def test_gateway_consumes_once_calls_provider_once_and_never_retries(tmp_path):
    gateway, provider, verifier, store = authorized_gateway(tmp_path); gateway.record_post(); result = gateway.analyze(request_payload())
    assert result["provenance"] == {"method": "provider_supplement", "provider": "openai", "model": "gpt-5.6-terra", "requestId": REQUEST_ID}
    assert len(provider.calls) == 1 and len(verifier.calls) == 3
    with pytest.raises(Exception): gateway.analyze(request_payload())
    assert len(provider.calls) == 1 and store.audit_summary()["analysis_post_count"] == 1


def test_cost_guard_blocks_before_provider_and_request_contract_has_no_tools(tmp_path, monkeypatch):
    gateway, provider, _, _ = authorized_gateway(tmp_path)
    built = yarn.build_provider_request(validate_pilot_request(request_payload()), SEMANTIC_CONTEXT)
    assert built["model"] == "gpt-5.6-terra" and built["tools"] == [] and built["store"] is False
    monkeypatch.setattr(yarn, "estimate_validated_request_cost", lambda _: {"upper_bound_usd": COST_CAP_USD + 1})
    with pytest.raises(Exception): gateway.analyze(request_payload())
    assert provider.calls == []


@pytest.mark.parametrize(
    ("mutate", "reason_code", "path"),
    [
        (lambda value: value["recommendedMiddle"].update(strandCount="1"), "type_mismatch", "$.recommendedMiddle.strandCount"),
        (lambda value: value.pop("summary"), "required_field_missing", "$.summary"),
        (lambda value: value["recommendedMiddle"].update(surface="unknown_surface"), "enum_invalid", "$.recommendedMiddle.surface"),
        (lambda value: value["recommendedMiddle"]["initialNeedlesMm"].update(min=5, max=4), "range_order_invalid", "$.recommendedMiddle.initialNeedlesMm.max"),
        (lambda value: value["thickerAlternative"].update(rowGaugeUncertainty=None), "required_when_target_rows_null", "$.thickerAlternative.rowGaugeUncertainty"),
    ],
)
def test_schema_and_domain_rejections_report_exact_reason_and_json_path(mutate, reason_code, path):
    value = response_payload(); mutate(value)
    with pytest.raises(yarn.ProviderOutputValidationError) as caught:
        yarn.validate_provider_payload(value)
    assert any(issue["reasonCode"] == reason_code and issue["path"] == path for issue in caught.value.issues)
    assert caught.value.status_code == 502


@pytest.mark.parametrize(
    ("envelope", "reason_code", "path"),
    [
        (provider_envelope(output_text="{not json}"), "json_invalid", "$.output_text[char:1]"),
        (provider_envelope(output_text="```json\n{}\n```"), "markdown_fence_forbidden", "$.output_text"),
        (provider_envelope(response_payload(), status="incomplete"), "response_incomplete", "$.status"),
        (provider_envelope(refusal="Не могу выполнить запрос."), "provider_refusal", "$.output[].content[].refusal"),
    ],
)
def test_envelope_rejections_are_provider_failures_not_user_422(envelope, reason_code, path):
    with pytest.raises(yarn.ProviderOutputError) as caught:
        yarn.extract_yarn_recommendation_output(envelope)
    assert caught.value.status_code == 502
    assert caught.value.reason_code == reason_code
    assert caught.value.path == path


def test_provider_schema_encodes_row_gauge_xor_and_safe_whitespace_normalization():
    variant_schema = yarn.YARN_RECOMMENDATION_JSON_SCHEMA["properties"]["recommendedMiddle"]
    assert len(variant_schema["anyOf"]) == 2
    assert {branch["properties"]["targetRowsPer10cm"].get("type") for branch in variant_schema["anyOf"]} == {"object", "null"}
    assert {branch["properties"]["rowGaugeUncertainty"].get("type") for branch in variant_schema["anyOf"]} == {"string", "null"}
    root = yarn.YARN_RECOMMENDATION_JSON_SCHEMA["properties"]
    assert root["limitations"]["minItems"] == root["limitations"]["maxItems"] == 5
    assert root["limitations"]["items"]["properties"]["code"]["enum"] == list(yarn._LIMITATION_CODES)
    assert set(root["surfaceRecommendation"]["properties"]) == {"smooth", "slightHalo", "mediumHalo", "strongHalo", "companionThread"}
    assert set(root["visualEvidence"]["properties"]["claimProvenance"]["properties"]) == set(yarn._VISUAL_FACT_CODES)
    instruction = yarn._developer_instruction()
    for phrase in ("provenance=selected", "ровно пять", "medium_halo", "strong_halo", "не визуальный факт"):
        assert phrase in instruction
    value = response_payload(); value["summary"] = "  Ориентир без точного распознавания.  "
    assert yarn.validate_provider_payload(value)["summary"] == "Ориентир без точного распознавания."


def test_valid_fake_provider_full_path_records_exact_replay_and_one_call(tmp_path, monkeypatch):
    monkeypatch.setattr("urllib.request.build_opener", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("external transport forbidden")))
    gateway, transport, verifier, store = authorized_adapter_gateway(tmp_path, provider_envelope(response_payload()))
    gateway.record_post(); result = gateway.analyze(request_payload())
    assert result["summary"].startswith("Для похожего поло")
    assert result["provenance"]["requestId"] == REQUEST_ID
    assert len(transport.calls) == 1 and len(verifier.calls) == 3
    row = store.audit_summary()["provider_calls"][0]
    expected_output = provider_envelope(response_payload())["output"][0]["content"][0]["text"]
    assert row["validation_passed"] == 1 and row["validation_reason_code"] == "validated"
    assert row["model_output_text"] == expected_output
    assert row["model_output_sha256"] == hashlib.sha256(expected_output.encode()).hexdigest()
    assert row["model_output_truncated"] == 0 and row["model_output_redacted"] == 0
    assert json.loads(row["model_output_top_level_keys_json"]) == sorted(response_payload())


def test_invalid_fake_provider_http_502_has_short_reason_and_durable_diagnostic(tmp_path):
    invalid = response_payload(); invalid["recommendedMiddle"]["strandCount"] = "1"
    gateway, transport, _, store = authorized_adapter_gateway(tmp_path, provider_envelope(invalid))
    with TestClient(Starlette(routes=gateway.routes())) as client:
        response = client.post(yarn.YARN_RECOMMENDATION_ROUTE, json=request_payload())
    assert response.status_code == 502
    assert response.json()["error"] == {
        "code": "provider_output_validation_failed",
        "message": "Ответ provider нарушил строгий контракт рекомендации; результат не сохранён.",
        "reason_code": "type_mismatch",
        "path": "$.recommendedMiddle.strandCount",
    }
    assert len(transport.calls) == 1
    row = store.audit_summary()["provider_calls"][0]
    issues = json.loads(row["validation_issues_json"])
    assert row["validation_passed"] == 0 and row["validation_error_code"] == "provider_output_validation_failed"
    assert row["validation_stage"] == "domain_validation" and row["validation_reason_code"] == "type_mismatch"
    assert any(issue["path"] == "$.recommendedMiddle.strandCount" and issue["actualType"] == "string" for issue in issues)


def test_semantic_failure_prevents_authoritative_result_and_does_not_retry(tmp_path):
    invalid = json.loads(RECORDED_BAD_FIXTURE_PATH.read_text(encoding="utf-8"))
    gateway, transport, _, store = authorized_adapter_gateway(tmp_path, provider_envelope(invalid))
    with TestClient(Starlette(routes=gateway.routes())) as client:
        response = client.post(yarn.YARN_RECOMMENDATION_ROUTE, json=request_payload())
    assert response.status_code == 502
    assert response.json()["error"] == {
        "code": "provider_output_validation_failed",
        "message": "Ответ provider нарушил строгий контракт рекомендации; результат не сохранён.",
        "reason_code": "UNGROUNDED_VISUAL_EVIDENCE",
        "path": "$.visualEvidence.fabricBehavior",
    }
    assert len(transport.calls) == 1
    row = store.audit_summary()["provider_calls"][0]
    issues = json.loads(row["validation_issues_json"])
    assert row["validation_passed"] == 0
    assert row["validation_stage"] == "semantic_validation"
    assert [(issue["reasonCode"], issue["path"]) for issue in issues[:7]] == [
        ("UNGROUNDED_VISUAL_EVIDENCE", "$.visualEvidence.fabricBehavior"),
        *[("REQUIRED_LIMITATION_MISSING", f"$.limitations[?(@.code=='{code}')]") for code in yarn._LIMITATION_CODES],
        ("SURFACE_LEVELS_NOT_DISTINCT", "$.surfaceRecommendation.mediumOrStrongHalo"),
    ]


def test_audit_redacts_image_or_secret_like_model_output():
    output = '```json\n{"content_base64":"' + "A" * 3000 + '"}\n```'
    with pytest.raises(yarn.ProviderOutputError) as caught:
        yarn.extract_yarn_recommendation_output(provider_envelope(output_text=output))
    diagnostic = caught.value.diagnostic
    assert diagnostic["model_output"] == "[REDACTED_FOR_SECRET_OR_IMAGE_SAFETY]"
    assert diagnostic["model_output_redacted"] is True
    assert diagnostic["model_output_sha256"] == hashlib.sha256(output.encode()).hexdigest()
