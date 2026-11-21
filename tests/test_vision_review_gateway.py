from __future__ import annotations

import base64
from copy import deepcopy
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from yarnai.http import create_app
from yarnai.vision_review import (
    ALLOWED_VERDICTS,
    DEFAULT_MODEL,
    DEFAULT_PROVIDER,
    NoChargeUsageMeter,
    VERDICT_UI_MESSAGES,
    VisionGatewaySettings,
    VisionReviewError,
    VisionReviewGateway,
    build_responses_api_request,
    validate_provider_verdict,
    validate_review_request,
)


PHOTO_SHA = "a" * 64
IDENTITY = {
    "project_id": "project-1",
    "session_id": "session-1",
    "session_revision": 9,
    "plan_id": "plan-1",
    "plan_revision": 36,
    "plan_fingerprint": "fnv1a32:c065298e",
    "action_id": "action-63",
    "step_id": "step-63",
    "step_revision": 12,
    "checkpoint_identity": None,
}


def request_payload(*, review_session_id: str = "review-1") -> dict:
    return {
        "schema_version": 1,
        "review_session_id": review_session_id,
        "identity": deepcopy(IDENTITY),
        "photos": [
            {
                "photo_id": "photo-1",
                "sha256": PHOTO_SHA,
                "mime_type": "image/jpeg",
                "content_base64": base64.b64encode(b"local-photo-bytes").decode("ascii"),
            }
        ],
        "expected_visible_state": {
            "action_title": "Шаг 63",
            "instruction": "Выполнить подтверждённое действие.",
            "expected_result": "Результат шага 63",
            "references": ["step:step-63", "action:action-63"],
        },
        "photo_requirements": ["Покажи весь результат шага."],
        "allowed_checks": ["overall_step_state"],
        "visual_limits": ["Нельзя додумывать невидимые детали."],
        "current_execution_state": {
            "status": "completed",
            "integrity": "current",
            "identity": deepcopy(IDENTITY),
        },
        "follow_up": False,
    }


def verdict_payload(verdict: str = "verified_continue") -> dict:
    action = {
        "verified_continue": "continue_current_plan",
        "more_evidence_required": "capture_more_evidence",
        "correction_required": "correct_visible_deviation_then_recheck",
        "cannot_determine": "continue_without_automatic_verification",
    }[verdict]
    observations = [] if verdict in {"more_evidence_required", "cannot_determine"} else [
        {
            "check": "overall_step_state",
            "finding": "Видимый результат соответствует ожидаемому состоянию.",
            "photo_sha256": PHOTO_SHA,
            "reliability": "visible_reliable",
        }
    ]
    return {
        "schema_version": 1,
        "identity": deepcopy(IDENTITY),
        "verdict": verdict,
        "confidence": {
            "level": "high" if verdict == "verified_continue" else "low",
            "uncertainty_reasons": [] if verdict == "verified_continue" else ["Недостаточно ракурсов"],
        },
        "observations": observations,
        "missing_evidence": ["Фото края"] if verdict == "more_evidence_required" else [],
        "safe_next_action": action,
        "expected_state_references": ["step:step-63"],
        "provider": DEFAULT_PROVIDER,
        "model": DEFAULT_MODEL,
    }


class FakeProvider:
    def __init__(self, response: dict) -> None:
        self.response = response
        self.calls: list[dict] = []

    def review(self, request: dict) -> dict:
        self.calls.append(deepcopy(request))
        return deepcopy(self.response)


class FakeUsageMeter:
    def __init__(self) -> None:
        self.reserved: set[str] = set()
        self.committed: list[str] = []
        self.cancelled: list[str] = []
        self.counts: list[tuple[int, int]] = []

    def reserve_photo_review_session(
        self,
        review_session_id: str,
        *,
        initial_photo_count: int,
        follow_up_photo_count: int,
    ) -> bool:
        self.counts.append((initial_photo_count, follow_up_photo_count))
        if review_session_id in self.reserved:
            return False
        self.reserved.add(review_session_id)
        return True

    def commit_photo_review_session(self, review_session_id: str) -> None:
        self.committed.append(review_session_id)

    def cancel_photo_review_session(self, review_session_id: str) -> None:
        self.cancelled.append(review_session_id)


class FakeStateVerifier:
    def __init__(self, *, fail_on_call: int | None = None) -> None:
        self.fail_on_call = fail_on_call
        self.calls: list[dict] = []

    def assert_current(self, identity: dict) -> None:
        self.calls.append(deepcopy(identity))
        if self.fail_on_call == len(self.calls):
            raise VisionReviewError(
                "execution_state_became_stale",
                "Execution state became stale during review.",
                status_code=409,
            )


def enabled_settings() -> VisionGatewaySettings:
    return VisionGatewaySettings(
        provider=DEFAULT_PROVIDER,
        model=DEFAULT_MODEL,
        explicitly_enabled=True,
        credential_configured=True,
    )


def test_default_configuration_is_openai_terra_and_disabled_without_credential() -> None:
    settings = VisionGatewaySettings.from_environment({})
    gateway = VisionReviewGateway(settings)

    assert settings.provider == "openai"
    assert settings.model == "gpt-5.6-terra"
    assert gateway.enabled is False
    assert gateway.public_configuration() == {
        "schema_version": 1,
        "provider": "openai",
        "model": "gpt-5.6-terra",
        "enabled": False,
        "automatic_review": "unavailable",
        "usage_charged": False,
    }


def test_disabled_http_gateway_makes_no_provider_call_and_no_usage_charge() -> None:
    provider = FakeProvider(verdict_payload())
    meter = FakeUsageMeter()
    gateway = VisionReviewGateway(
        VisionGatewaySettings(), provider=provider, usage_meter=meter
    )
    with TestClient(create_app(vision_gateway=gateway)) as client:
        configuration = client.get("/api/v1/vision-reviews/configuration")
        response = client.post("/api/v1/vision-reviews", json=request_payload())

    assert configuration.status_code == 200
    assert configuration.json()["enabled"] is False
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "vision_gateway_disabled"
    assert provider.calls == []
    assert meter.reserved == set()
    assert meter.committed == []
    assert meter.cancelled == []


def test_no_charge_meter_never_reserves_a_session() -> None:
    meter = NoChargeUsageMeter()
    assert meter.reserve_photo_review_session(
        "review-1", initial_photo_count=3, follow_up_photo_count=1
    ) is False
    assert meter.commit_photo_review_session("review-1") is None
    assert meter.cancel_photo_review_session("review-1") is None


def test_request_builder_contains_only_allowed_context_photos_and_server_model() -> None:
    request = request_payload()
    built = build_responses_api_request(request, enabled_settings())
    serialized = str(built)

    assert set(built) == {"model", "input", "text"}
    assert built["model"] == "gpt-5.6-terra"
    assert "project-1" in serialized
    assert "action-63" in serialized
    assert "local-photo-bytes" not in serialized
    assert "API_KEY" not in serialized
    assert "account" not in serialized.lower()
    assert "billing" not in serialized.lower()
    assert built["text"]["format"]["strict"] is True


@pytest.mark.parametrize("outcome", sorted(ALLOWED_VERDICTS))
def test_fake_provider_accepts_exactly_each_of_four_verdicts(outcome: str) -> None:
    provider = FakeProvider(verdict_payload(outcome))
    meter = FakeUsageMeter()
    gateway = VisionReviewGateway(
        enabled_settings(), provider=provider, usage_meter=meter,
        state_verifier=FakeStateVerifier(),
    )

    result = gateway.review(request_payload(review_session_id=f"review-{outcome}"))

    assert result["verdict"] == outcome
    assert result["ui_message"] == VERDICT_UI_MESSAGES[outcome]
    assert result["provider"] == "openai"
    assert result["model"] == "gpt-5.6-terra"
    assert result["usage_unit"] == "photo_review_session"
    assert len(provider.calls) == 1
    assert meter.counts == [(1, 0)]
    assert meter.committed == [f"review-{outcome}"]


@pytest.mark.parametrize("status", ["stale", "blocked", "corrupt", "failed"])
def test_stale_blocked_corrupt_or_failed_session_is_rejected_before_provider(status: str) -> None:
    payload = request_payload()
    payload["current_execution_state"]["status"] = status
    provider = FakeProvider(verdict_payload())
    meter = FakeUsageMeter()
    gateway = VisionReviewGateway(
        enabled_settings(), provider=provider, usage_meter=meter,
        state_verifier=FakeStateVerifier(),
    )

    with pytest.raises(VisionReviewError, match="not reviewable") as raised:
        gateway.review(payload)

    assert raised.value.code == "execution_state_not_reviewable"
    assert provider.calls == []
    assert meter.reserved == set()


def test_mismatched_request_identity_is_rejected_before_provider() -> None:
    payload = request_payload()
    payload["current_execution_state"]["identity"]["action_id"] = "action-other"

    with pytest.raises(VisionReviewError) as raised:
        validate_review_request(payload)

    assert raised.value.code == "review_identity_mismatch"


@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        (lambda value: value.update(verdict="invented"), "provider_response_verdict_unknown"),
        (lambda value: value.update(model="browser-choice"), "provider_response_model_mismatch"),
        (lambda value: value["identity"].update(action_id="action-other"), "provider_response_identity_mismatch"),
        (lambda value: value.update(safe_next_action="free_form_instruction"), "provider_response_unsafe_action"),
        (lambda value: value.update(extra="uncontrolled"), "provider_response_schema_invalid"),
    ],
)
def test_invalid_unknown_mismatched_or_uncontrolled_provider_response_is_rejected(
    mutation,
    code: str,
) -> None:
    response = verdict_payload()
    mutation(response)

    with pytest.raises(VisionReviewError) as raised:
        validate_provider_verdict(response, request_payload(), enabled_settings())

    assert raised.value.code == code


def test_unreliable_count_claim_cannot_produce_continue_or_correction() -> None:
    request = request_payload()
    request["allowed_checks"] = ["stitch_count"]
    response = verdict_payload("correction_required")
    response["observations"][0].update(
        check="stitch_count",
        finding="Количество петель нельзя увидеть надёжно.",
        reliability="not_reliably_visible",
    )

    with pytest.raises(VisionReviewError) as raised:
        validate_provider_verdict(response, request, enabled_settings())

    assert raised.value.code == "provider_response_unsupported_claim"


def test_duplicate_review_session_is_rejected_without_second_provider_call() -> None:
    provider = FakeProvider(verdict_payload())
    meter = FakeUsageMeter()
    gateway = VisionReviewGateway(
        enabled_settings(), provider=provider, usage_meter=meter,
        state_verifier=FakeStateVerifier(),
    )
    payload = request_payload()

    gateway.review(payload)
    with pytest.raises(VisionReviewError) as raised:
        gateway.review(payload)

    assert raised.value.code == "review_session_duplicate_or_unavailable"
    assert len(provider.calls) == 1
    assert meter.committed == ["review-1"]


def test_correction_verdict_is_server_mapped_to_non_advancing_action() -> None:
    result = validate_provider_verdict(
        verdict_payload("correction_required"),
        request_payload(),
        enabled_settings(),
    )

    assert result["safe_next_action"] == "correct_visible_deviation_then_recheck"
    assert result["safe_next_action"] != "continue_current_plan"


def test_response_is_rejected_if_authoritative_state_becomes_stale_during_review() -> None:
    provider = FakeProvider(verdict_payload())
    meter = FakeUsageMeter()
    verifier = FakeStateVerifier(fail_on_call=2)
    gateway = VisionReviewGateway(
        enabled_settings(),
        provider=provider,
        usage_meter=meter,
        state_verifier=verifier,
    )

    with pytest.raises(VisionReviewError) as raised:
        gateway.review(request_payload())

    assert raised.value.code == "execution_state_became_stale"
    assert len(verifier.calls) == 2
    assert len(provider.calls) == 1
    assert meter.committed == []
    assert meter.cancelled == ["review-1"]


def test_route_registered_once_and_module_has_no_network_client() -> None:
    application = create_app(vision_gateway=VisionReviewGateway(VisionGatewaySettings()))
    paths = [getattr(route, "path", None) for route in application.routes]
    source = (Path(__file__).parents[1] / "src" / "yarnai" / "vision_review.py").read_text(encoding="utf-8")

    assert paths.count("/api/v1/vision-reviews") == 1
    assert paths.count("/api/v1/vision-reviews/configuration") == 1
    assert "import httpx" not in source
    assert "import requests" not in source
    assert "urlopen(" not in source


def test_browser_cannot_override_provider_or_model() -> None:
    payload = request_payload()
    payload["provider"] = "browser-provider"
    payload["model"] = "browser-model"

    with pytest.raises(VisionReviewError) as raised:
        validate_review_request(payload)

    assert raised.value.code == "review_request_schema_invalid"
