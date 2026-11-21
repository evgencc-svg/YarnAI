from __future__ import annotations

import base64
import hashlib
import json
import logging
import struct
import zlib
from copy import deepcopy

import pytest
from starlette.testclient import TestClient

import yarnai.garment_reference as garment
from yarnai.config import RuntimeSettings
from yarnai.garment_reference import (
    CONTRACT_VERSION,
    GARMENT_ANALYSIS_ROUTE,
    MAX_GARMENT_ANALYSIS_JSON_OVERHEAD_BYTES,
    MAX_GARMENT_ANALYSIS_REQUEST_BODY_BYTES,
    MAX_SANITIZED_IMAGE_BASE64_BYTES,
    MAX_SANITIZED_IMAGE_BYTES,
    GarmentReferenceError,
    GarmentReferenceGateway,
    validate_pilot_request,
)
from yarnai.http import create_app
from yarnai.vision_review import DEFAULT_MODEL, DEFAULT_PROVIDER, VisionGatewaySettings


PROJECT_ID = "01a05b5f-ecb0-7840-b596-bb62dae64ef9"
PHOTO_ID = "01a05b60-ecb0-7840-b596-bb62dae64ef9"
SOURCE_SHA = "a" * 64
EXACT_SANITIZED_BYTES = 2_043_232
EXACT_WIDTH = 1_200
EXACT_HEIGHT = 1_600


def _chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def png_bytes(width: int = 2, height: int = 2) -> bytes:
    rows = b"".join(b"\x00" + bytes([240, 230, 210, 255]) * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(rows))
        + _chunk(b"IEND", b"")
    )


def exact_prepared_png() -> bytes:
    """Build a deterministic valid 1200x1600 PNG of the exact failed size."""

    pixel_bytes = EXACT_WIDTH * EXACT_HEIGHT * 4
    target_compressed_bytes = EXACT_SANITIZED_BYTES - 57
    random_prefix = hashlib.shake_256(b"yarnai-exact-2043232").digest(2_100_000)

    def compressed_rows(prefix_bytes: int) -> bytes:
        pixels = random_prefix[:prefix_bytes] + bytes(pixel_bytes - prefix_bytes)
        rows = b"".join(
            b"\x00" + pixels[offset : offset + EXACT_WIDTH * 4]
            for offset in range(0, pixel_bytes, EXACT_WIDTH * 4)
        )
        return zlib.compress(rows, 9)

    compressed = b""
    lower, upper = 1_900_000, 2_100_000
    while lower <= upper:
        prefix_bytes = (lower + upper) // 2
        candidate = compressed_rows(prefix_bytes)
        if len(candidate) < target_compressed_bytes:
            lower = prefix_bytes + 1
        elif len(candidate) > target_compressed_bytes:
            upper = prefix_bytes - 1
        else:
            compressed = candidate
            break
    assert len(compressed) == target_compressed_bytes
    result = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", EXACT_WIDTH, EXACT_HEIGHT, 8, 6, 0, 0, 0))
        + _chunk(b"IDAT", compressed)
        + _chunk(b"IEND", b"")
    )
    assert len(result) == EXACT_SANITIZED_BYTES
    return result


def request_payload(image: bytes | None = None) -> dict:
    sanitized = image or png_bytes()
    return {
        "contract_version": CONTRACT_VERSION,
        "pilot_schema_version": 1,
        "request_id": "pilot-request:body-contract-dry-run",
        "source_identity": {
            "project_id": PROJECT_ID,
            "project_revision": 7,
            "reference_photos": [{"photo_id": PHOTO_ID, "sha256": SOURCE_SHA}],
            "request_fingerprint": "fnv1a32:12345678",
        },
        "source_photo_id": PHOTO_ID,
        "source_photo_sha256": SOURCE_SHA,
        "sanitized_image": {
            "mime_type": "image/png",
            "content_base64": base64.b64encode(sanitized).decode("ascii"),
            "sha256": hashlib.sha256(sanitized).hexdigest(),
            "width": EXACT_WIDTH if len(sanitized) == EXACT_SANITIZED_BYTES else 2,
            "height": EXACT_HEIGHT if len(sanitized) == EXACT_SANITIZED_BYTES else 2,
        },
        "user_clarifications": [{"type": "desired_change", "text": "Карман не нужен"}],
        "user_confirmed_exact_sanitized_photo": True,
        "explicit_action": "run_one_shot_garment_photo_pilot",
    }


class MockGarmentReferenceGateway:
    def __init__(self, *, validate: bool = True) -> None:
        self.validate = validate
        self.analysis_posts = 0
        self.calls = 0
        self.provider_calls = 0
        self.authorization_consume_calls = 0

    def public_configuration(self) -> dict:
        return {"enabled": False, "pilot_ready": False}

    def record_analysis_post(self) -> None:
        self.analysis_posts += 1

    def analyze(self, payload: object) -> dict:
        if self.validate:
            validate_pilot_request(payload)
        self.calls += 1
        return {"mock_gateway": "reached", "provider_calls": self.provider_calls}


class CountingAuthorizationStore:
    def __init__(self) -> None:
        self.consume_calls = 0

    def pending_request_id(self) -> str:
        return "pilot-request:body-contract-dry-run"

    def consume(self, _request) -> bool:
        self.consume_calls += 1
        return False


class NoNetworkProvider:
    def __init__(self) -> None:
        self.calls = 0

    def review(self, _request):
        self.calls += 1
        raise AssertionError("provider transport must remain unreachable")


class NoopVerifier:
    def assert_current(self, _identity) -> None:
        return None


def runtime_settings() -> RuntimeSettings:
    return RuntimeSettings(host="127.0.0.1", port=8000, log_level="info")


def test_exact_2043232_png_passes_http_middleware_and_reaches_mock_gateway_once(
    monkeypatch,
    caplog,
) -> None:
    network_attempts = []

    def forbid_network(*args, **kwargs):
        network_attempts.append((args, kwargs))
        raise AssertionError("external network is forbidden in the local dry run")

    monkeypatch.setattr(garment.urllib.request, "build_opener", forbid_network)
    gateway = MockGarmentReferenceGateway()
    payload = request_payload(exact_prepared_png())
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    caplog.set_level(logging.INFO, logger="yarnai.http")

    with TestClient(create_app(runtime_settings(), garment_reference_gateway=gateway)) as client:
        response = client.post(
            GARMENT_ANALYSIS_ROUTE,
            content=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer dry-run-secret-must-not-log",
            },
        )

    assert response.status_code == 200
    assert response.json() == {"mock_gateway": "reached", "provider_calls": 0}
    assert gateway.analysis_posts == 1
    assert gateway.calls == 1
    assert gateway.provider_calls == 0
    assert gateway.authorization_consume_calls == 0
    assert network_attempts == []
    assert len(base64.b64decode(payload["sanitized_image"]["content_base64"])) == EXACT_SANITIZED_BYTES
    assert "dry-run-secret-must-not-log" not in caplog.text
    assert payload["sanitized_image"]["content_base64"][:128] not in caplog.text
    assert "content_base64" not in response.text


def test_route_limit_is_calculated_from_image_base64_and_bounded_json_overhead() -> None:
    assert MAX_SANITIZED_IMAGE_BASE64_BYTES == ((MAX_SANITIZED_IMAGE_BYTES + 2) // 3) * 4
    assert MAX_SANITIZED_IMAGE_BASE64_BYTES == 10_666_668
    assert MAX_GARMENT_ANALYSIS_JSON_OVERHEAD_BYTES == 65_536
    assert MAX_GARMENT_ANALYSIS_REQUEST_BODY_BYTES == 10_732_204

    maximum_metadata = request_payload()
    maximum_metadata["source_identity"]["reference_photos"] = [
        {"photo_id": f"01a05b6{index:x}-ecb0-7840-b596-bb62dae64ef9", "sha256": f"{index:x}" * 64}
        for index in range(12)
    ]
    maximum_metadata["source_identity"]["reference_photos"][0] = {
        "photo_id": PHOTO_ID,
        "sha256": SOURCE_SHA,
    }
    maximum_metadata["sanitized_image"]["content_base64"] = "A" * MAX_SANITIZED_IMAGE_BASE64_BYTES
    maximum_metadata["user_clarifications"] = [
        {"type": "free_text", "text": "\x00" * 300}
        for _ in range(20)
    ]
    serialized = json.dumps(maximum_metadata, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    overhead = len(serialized) - MAX_SANITIZED_IMAGE_BASE64_BYTES
    assert overhead < MAX_GARMENT_ANALYSIS_JSON_OVERHEAD_BYTES


def test_route_accepts_exact_http_boundary_and_rejects_one_byte_above_before_gateway() -> None:
    accepted_gateway = MockGarmentReferenceGateway(validate=False)
    prefix, suffix = b'{"padding":"', b'"}'
    boundary_body = prefix + b"x" * (MAX_GARMENT_ANALYSIS_REQUEST_BODY_BYTES - len(prefix) - len(suffix)) + suffix
    assert len(boundary_body) == MAX_GARMENT_ANALYSIS_REQUEST_BODY_BYTES
    with TestClient(create_app(runtime_settings(), garment_reference_gateway=accepted_gateway)) as client:
        accepted = client.post(GARMENT_ANALYSIS_ROUTE, content=boundary_body, headers={"Content-Type": "application/json"})
    assert accepted.status_code == 200
    assert accepted_gateway.calls == 1

    rejected_gateway = MockGarmentReferenceGateway(validate=False)
    with TestClient(create_app(runtime_settings(), garment_reference_gateway=rejected_gateway)) as client:
        rejected = client.post(
            GARMENT_ANALYSIS_ROUTE,
            content=b"x" * (MAX_GARMENT_ANALYSIS_REQUEST_BODY_BYTES + 1),
            headers={"Content-Type": "application/json"},
        )
    assert rejected.status_code == 413
    assert rejected.json()["error"]["code"] == "REQUEST_TOO_LARGE"
    assert rejected_gateway.analysis_posts == 0
    assert rejected_gateway.calls == 0
    assert rejected_gateway.authorization_consume_calls == 0


def test_ordinary_routes_keep_the_existing_global_one_mib_limit() -> None:
    settings = runtime_settings()
    assert settings.max_request_body_bytes == 1_048_576
    with TestClient(create_app(settings)) as client:
        response = client.post(
            "/api/v1/calculate",
            content=b"x" * (settings.max_request_body_bytes + 1),
            headers={"Content-Type": "application/json"},
        )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        (lambda value: value["sanitized_image"].update(content_base64="%%%"), "sanitized_image_content_invalid"),
        (lambda value: value["sanitized_image"].update(mime_type="image/jpeg"), "sanitized_image_mime_invalid"),
        (
            lambda value: value["sanitized_image"].update(
                content_base64=base64.b64encode(b"\xff\xd8\xff\xd9").decode("ascii"),
                sha256=hashlib.sha256(b"\xff\xd8\xff\xd9").hexdigest(),
            ),
            "sanitized_image_decode_failed",
        ),
        (
            lambda value: value["sanitized_image"].update(
                content_base64=base64.b64encode(png_bytes(1_601, 1)).decode("ascii"),
                sha256=hashlib.sha256(png_bytes(1_601, 1)).hexdigest(),
                width=1_601,
                height=1,
            ),
            "sanitized_image_dimensions_invalid",
        ),
    ],
)
def test_malformed_base64_mime_format_and_dimensions_fail_before_authorization_consume(
    mutation,
    expected_code,
) -> None:
    store = CountingAuthorizationStore()
    provider = NoNetworkProvider()
    gateway = GarmentReferenceGateway(
        VisionGatewaySettings(
            provider=DEFAULT_PROVIDER,
            model=DEFAULT_MODEL,
            explicitly_enabled=True,
            credential_configured=True,
        ),
        provider=provider,
        state_verifier=NoopVerifier(),
        authorization_store=store,
    )
    payload = request_payload()
    mutation(payload)
    with pytest.raises(GarmentReferenceError) as raised:
        gateway.analyze(payload)
    assert raised.value.code == expected_code
    assert store.consume_calls == 0
    assert provider.calls == 0


def test_decoded_size_and_pixel_count_have_separate_fail_closed_checks(monkeypatch) -> None:
    oversized = request_payload()
    oversized_bytes = b"x" * (MAX_SANITIZED_IMAGE_BYTES + 1)
    oversized["sanitized_image"].update(
        content_base64=base64.b64encode(oversized_bytes).decode("ascii"),
        sha256=hashlib.sha256(oversized_bytes).hexdigest(),
    )
    with pytest.raises(GarmentReferenceError) as decoded_size:
        validate_pilot_request(oversized)
    assert decoded_size.value.code == "sanitized_image_size_invalid"

    monkeypatch.setattr(garment, "MAX_SANITIZED_IMAGE_PIXELS", 3)
    with pytest.raises(GarmentReferenceError) as pixel_count:
        validate_pilot_request(request_payload())
    assert pixel_count.value.code == "sanitized_image_pixel_count_invalid"


def test_errors_and_logs_do_not_echo_authorization_or_image_content(caplog) -> None:
    gateway = MockGarmentReferenceGateway()
    payload = request_payload()
    payload["sanitized_image"]["content_base64"] = "private-image-content-not-base64"
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    caplog.set_level(logging.INFO)
    with TestClient(create_app(runtime_settings(), garment_reference_gateway=gateway)) as client:
        response = client.post(
            GARMENT_ANALYSIS_ROUTE,
            content=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer private-authorization-value",
            },
        )
    assert response.status_code == 422
    combined = caplog.text + response.text
    assert "private-image-content-not-base64" not in combined
    assert "private-authorization-value" not in combined
    assert "Bearer " not in combined
