"""Server-only contract and disabled-by-default gateway for photo review.

This module deliberately contains no HTTP client and no OpenAI SDK import.  A
real provider adapter can only be supplied to :class:`VisionReviewGateway` by
server composition code.  Browser payloads cannot choose a provider or model.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import re
from collections.abc import Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Protocol

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route


DEFAULT_PROVIDER = "openai"
DEFAULT_MODEL = "gpt-5.6-terra"
RESPONSES_API_ENDPOINT = "https://api.openai.com/v1/responses"
MAX_INITIAL_PHOTOS = 3
MAX_FOLLOW_UP_PHOTOS = 1

ALLOWED_VERDICTS = frozenset(
    {
        "verified_continue",
        "more_evidence_required",
        "correction_required",
        "cannot_determine",
    }
)
VERDICT_UI_MESSAGES = {
    "verified_continue": "По фото всё совпадает. Можно продолжать.",
    "more_evidence_required": "Этого фото недостаточно. Нужен ещё такой-то снимок.",
    "correction_required": "Похоже на отклонение. Проверь и исправь вот это перед продолжением.",
    "cannot_determine": "По этим фото нельзя определить уверенно.",
}
VERDICT_ACTIONS = {
    "verified_continue": "continue_current_plan",
    "more_evidence_required": "capture_more_evidence",
    "correction_required": "correct_visible_deviation_then_recheck",
    "cannot_determine": "continue_without_automatic_verification",
}
ALLOWED_CHECKS = frozenset(
    {
        "overall_step_state",
        "stitch_count",
        "row_count",
        "marker_position",
        "edge",
        "construction_detail",
    }
)
SAFE_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_FINGERPRINT = re.compile(r"^(?:fnv1a32:[0-9a-f]{8}|sha256:[0-9a-f]{64})$")
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$")


VERDICT_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "schema_version",
        "identity",
        "verdict",
        "confidence",
        "observations",
        "missing_evidence",
        "safe_next_action",
        "expected_state_references",
        "provider",
        "model",
    ],
    "properties": {
        "schema_version": {"const": 1},
        "identity": {"type": "object"},
        "verdict": {"enum": sorted(ALLOWED_VERDICTS)},
        "confidence": {
            "type": "object",
            "additionalProperties": False,
            "required": ["level", "uncertainty_reasons"],
            "properties": {
                "level": {"enum": ["low", "medium", "high"]},
                "uncertainty_reasons": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
        },
        "observations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["check", "finding", "photo_sha256", "reliability"],
                "properties": {
                    "check": {"enum": sorted(ALLOWED_CHECKS)},
                    "finding": {"type": "string"},
                    "photo_sha256": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
                    "reliability": {"enum": ["visible_reliable", "not_reliably_visible"]},
                },
            },
        },
        "missing_evidence": {"type": "array", "items": {"type": "string"}},
        "safe_next_action": {"enum": sorted(set(VERDICT_ACTIONS.values()))},
        "expected_state_references": {"type": "array", "items": {"type": "string"}},
        "provider": {"type": "string"},
        "model": {"type": "string"},
    },
}


class VisionReviewError(ValueError):
    """A safe, structured vision-review boundary failure."""

    def __init__(self, code: str, message: str, *, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class VisionGatewaySettings:
    """Non-secret server configuration for the future provider boundary."""

    provider: str = DEFAULT_PROVIDER
    model: str = DEFAULT_MODEL
    explicitly_enabled: bool = False
    credential_configured: bool = False

    @classmethod
    def from_environment(
        cls,
        environ: Mapping[str, str] | None = None,
    ) -> "VisionGatewaySettings":
        values = os.environ if environ is None else environ
        raw_enabled = values.get("YARNAI_VISION_ENABLED", "false").strip().lower()
        if raw_enabled not in {"true", "false"}:
            raise ValueError("YARNAI_VISION_ENABLED must be true or false")
        provider = values.get("YARNAI_VISION_PROVIDER", DEFAULT_PROVIDER).strip()
        model = values.get("YARNAI_VISION_MODEL", DEFAULT_MODEL).strip()
        if provider != DEFAULT_PROVIDER:
            raise ValueError("YARNAI_VISION_PROVIDER is not supported")
        if not model or len(model) > 120:
            raise ValueError("YARNAI_VISION_MODEL is invalid")
        # Keep only a boolean.  The credential value never enters application state.
        credential_configured = bool(values.get("OPENAI_API_KEY", "").strip())
        return cls(
            provider=provider,
            model=model,
            explicitly_enabled=raw_enabled == "true",
            credential_configured=credential_configured,
        )


class VisionProvider(Protocol):
    """Server-side-only adapter interface for a future Responses API client."""

    def review(self, request: Mapping[str, Any]) -> Mapping[str, Any]: ...


class VisionUsageMeter(Protocol):
    """Future server quota boundary; one unit is one review session."""

    def reserve_photo_review_session(
        self,
        review_session_id: str,
        *,
        initial_photo_count: int,
        follow_up_photo_count: int,
    ) -> bool: ...

    def commit_photo_review_session(self, review_session_id: str) -> None: ...

    def cancel_photo_review_session(self, review_session_id: str) -> None: ...


class ExecutionStateVerifier(Protocol):
    """Authoritative server-side guard checked before and after provider work."""

    def assert_current(self, identity: Mapping[str, Any]) -> None: ...


class NoChargeUsageMeter:
    """Local disabled meter: it never reserves or charges a quota unit."""

    def reserve_photo_review_session(
        self,
        review_session_id: str,
        *,
        initial_photo_count: int,
        follow_up_photo_count: int,
    ) -> bool:
        del review_session_id, initial_photo_count, follow_up_photo_count
        return False

    def commit_photo_review_session(self, review_session_id: str) -> None:
        del review_session_id

    def cancel_photo_review_session(self, review_session_id: str) -> None:
        del review_session_id


class VisionReviewGateway:
    """Validate, call one injected provider, validate, then meter one session."""

    def __init__(
        self,
        settings: VisionGatewaySettings | None = None,
        *,
        provider: VisionProvider | None = None,
        usage_meter: VisionUsageMeter | None = None,
        state_verifier: ExecutionStateVerifier | None = None,
    ) -> None:
        self.settings = settings or VisionGatewaySettings.from_environment()
        self._provider = provider
        self._usage_meter = usage_meter or NoChargeUsageMeter()
        self._state_verifier = state_verifier

    @property
    def enabled(self) -> bool:
        return bool(
            self.settings.explicitly_enabled
            and self.settings.credential_configured
            and self._provider is not None
            and self._state_verifier is not None
        )

    def public_configuration(self) -> dict[str, Any]:
        # Do not expose whether a credential exists.  The browser learns only
        # whether the complete server-side capability is available.
        return {
            "schema_version": 1,
            "provider": self.settings.provider,
            "model": self.settings.model,
            "enabled": self.enabled,
            "automatic_review": "available" if self.enabled else "unavailable",
            "usage_charged": False,
        }

    def review(self, payload: object) -> dict[str, Any]:
        request = validate_review_request(payload)
        if not self.enabled:
            raise VisionReviewError(
                "vision_gateway_disabled",
                "Automatic photo review is not configured.",
                status_code=503,
            )
        initial_count = 0 if request["follow_up"] else len(request["photos"])
        follow_up_count = len(request["photos"]) if request["follow_up"] else 0
        review_session_id = request["review_session_id"]
        reserved = self._usage_meter.reserve_photo_review_session(
            review_session_id,
            initial_photo_count=initial_count,
            follow_up_photo_count=follow_up_count,
        )
        if not reserved:
            raise VisionReviewError(
                "review_session_duplicate_or_unavailable",
                "Photo review session cannot be reserved.",
                status_code=409,
            )
        try:
            self._state_verifier.assert_current(request["identity"])  # type: ignore[union-attr]
            provider_request = build_responses_api_request(request, self.settings)
            raw_response = self._provider.review(provider_request)  # type: ignore[union-attr]
            # A review can outlive its source revision.  Recheck immediately
            # before accepting or metering the response.
            self._state_verifier.assert_current(request["identity"])  # type: ignore[union-attr]
            verdict = validate_provider_verdict(raw_response, request, self.settings)
            self._usage_meter.commit_photo_review_session(review_session_id)
            return verdict
        except Exception:
            self._usage_meter.cancel_photo_review_session(review_session_id)
            raise


class VisionReviewHttpApi:
    """Single route-registration boundary for the server vision gateway."""

    def __init__(self, gateway: VisionReviewGateway) -> None:
        self.gateway = gateway

    def routes(self) -> list[Route]:
        return [
            Route(
                "/api/v1/vision-reviews/configuration",
                self.configuration,
                methods=["GET"],
            ),
            Route(
                "/api/v1/vision-reviews",
                self.submit,
                methods=["POST"],
            ),
        ]

    async def configuration(self, _request: Request) -> JSONResponse:
        return JSONResponse(self.gateway.public_configuration())

    async def submit(self, request: Request) -> JSONResponse:
        try:
            payload = await request.json()
        except (json.JSONDecodeError, UnicodeDecodeError):
            return _vision_error_response(
                VisionReviewError("invalid_json", "Request body must be valid JSON.", status_code=400)
            )
        try:
            return JSONResponse(self.gateway.review(payload))
        except VisionReviewError as error:
            return _vision_error_response(error)


def validate_review_request(payload: object) -> dict[str, Any]:
    """Strictly validate the browser-to-YarnAI review envelope."""

    request = _strict_mapping(
        payload,
        required={
            "schema_version",
            "review_session_id",
            "identity",
            "photos",
            "expected_visible_state",
            "photo_requirements",
            "allowed_checks",
            "visual_limits",
            "current_execution_state",
            "follow_up",
        },
        code="review_request_schema_invalid",
    )
    if request["schema_version"] != 1:
        _fail("review_request_schema_invalid", "Unsupported review request version.")
    _identifier(request["review_session_id"], "review_session_id")
    identity = _validate_identity(request["identity"])
    current_state = _strict_mapping(
        request["current_execution_state"],
        required={"status", "integrity", "identity"},
        code="review_request_schema_invalid",
    )
    if current_state["status"] in {"stale", "blocked", "corrupt", "failed"}:
        _fail("execution_state_not_reviewable", "Execution state is not reviewable.", 409)
    if current_state["status"] != "completed" or current_state["integrity"] != "current":
        _fail("execution_state_not_reviewable", "Completed current step is required.", 409)
    current_identity = _validate_identity(current_state["identity"])
    if current_identity != identity:
        _fail("review_identity_mismatch", "Current execution identity does not match.", 409)

    follow_up = request["follow_up"]
    if not isinstance(follow_up, bool):
        _fail("review_request_schema_invalid", "follow_up must be boolean.")
    photos = _validate_photos(request["photos"], follow_up=follow_up)
    expected = _strict_mapping(
        request["expected_visible_state"],
        required={"action_title", "instruction", "expected_result", "references"},
        code="review_request_schema_invalid",
    )
    for key in ("action_title", "instruction", "expected_result"):
        _bounded_text(expected[key], key, maximum=4000, allow_empty=key == "expected_result")
    references = _string_list(expected["references"], "references", minimum=1, maximum=20)
    requirements = _string_list(request["photo_requirements"], "photo_requirements", minimum=1, maximum=12)
    limits = _string_list(request["visual_limits"], "visual_limits", minimum=1, maximum=12)
    checks = _string_list(request["allowed_checks"], "allowed_checks", minimum=1, maximum=12)
    if any(check not in ALLOWED_CHECKS for check in checks):
        _fail("unsupported_visual_check", "Request contains an unsupported visual check.")
    normalized = deepcopy(request)
    normalized["identity"] = identity
    normalized["current_execution_state"]["identity"] = current_identity
    normalized["photos"] = photos
    normalized["expected_visible_state"]["references"] = references
    normalized["photo_requirements"] = requirements
    normalized["visual_limits"] = limits
    normalized["allowed_checks"] = checks
    return normalized


def build_responses_api_request(
    request: Mapping[str, Any],
    settings: VisionGatewaySettings,
) -> dict[str, Any]:
    """Build the minimal future Responses API payload without sending it."""

    validated = validate_review_request(request)
    context = {
        "identity": validated["identity"],
        "expected_visible_state": validated["expected_visible_state"],
        "photo_requirements": validated["photo_requirements"],
        "allowed_checks": validated["allowed_checks"],
        "visual_limits": validated["visual_limits"],
    }
    content: list[dict[str, Any]] = [
        {
            "type": "input_text",
            "text": json.dumps(context, ensure_ascii=False, separators=(",", ":")),
        }
    ]
    for photo in validated["photos"]:
        content.append(
            {
                "type": "input_image",
                "image_url": (
                    f"data:{photo['mime_type']};base64,{photo['content_base64']}"
                ),
            }
        )
    return {
        "model": settings.model,
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Inspect only visible evidence. Never infer an unsupported stitch, row, "
                            "marker, edge, or construction claim. Return only the strict schema."
                        ),
                    }
                ],
            },
            {"role": "user", "content": content},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "yarnai_vision_verdict",
                "strict": True,
                "schema": deepcopy(VERDICT_JSON_SCHEMA),
            }
        },
    }


def validate_provider_verdict(
    payload: object,
    request: Mapping[str, Any],
    settings: VisionGatewaySettings,
) -> dict[str, Any]:
    """Reject uncontrolled or mismatched provider output and sanitize the UI result."""

    validated_request = validate_review_request(request)
    verdict = _strict_mapping(
        payload,
        required={
            "schema_version",
            "identity",
            "verdict",
            "confidence",
            "observations",
            "missing_evidence",
            "safe_next_action",
            "expected_state_references",
            "provider",
            "model",
        },
        code="provider_response_schema_invalid",
    )
    if verdict["schema_version"] != 1:
        _fail("provider_response_schema_invalid", "Unsupported provider response version.")
    identity = _validate_identity(verdict["identity"], code="provider_response_schema_invalid")
    if identity != validated_request["identity"]:
        _fail("provider_response_identity_mismatch", "Provider response identity does not match.", 409)
    outcome = verdict["verdict"]
    if outcome not in ALLOWED_VERDICTS:
        _fail("provider_response_verdict_unknown", "Provider response verdict is unknown.")
    if verdict["provider"] != settings.provider or verdict["model"] != settings.model:
        _fail("provider_response_model_mismatch", "Provider or model does not match server configuration.", 409)

    confidence = _strict_mapping(
        verdict["confidence"],
        required={"level", "uncertainty_reasons"},
        code="provider_response_schema_invalid",
    )
    if confidence["level"] not in {"low", "medium", "high"}:
        _fail("provider_response_schema_invalid", "Confidence level is invalid.")
    uncertainty = _string_list(
        confidence["uncertainty_reasons"],
        "uncertainty_reasons",
        minimum=0,
        maximum=20,
    )
    photo_hashes = {photo["sha256"] for photo in validated_request["photos"]}
    observations = _validate_observations(
        verdict["observations"],
        allowed_checks=set(validated_request["allowed_checks"]),
        photo_hashes=photo_hashes,
    )
    missing = _string_list(verdict["missing_evidence"], "missing_evidence", minimum=0, maximum=20)
    if verdict["safe_next_action"] != VERDICT_ACTIONS[outcome]:
        _fail("provider_response_unsafe_action", "Provider response next action is unsupported.")
    references = _string_list(
        verdict["expected_state_references"],
        "expected_state_references",
        minimum=1,
        maximum=20,
    )
    allowed_references = set(validated_request["expected_visible_state"]["references"])
    if any(reference not in allowed_references for reference in references):
        _fail("provider_response_reference_mismatch", "Provider response references unknown state.")
    unreliable = any(item["reliability"] != "visible_reliable" for item in observations)
    if outcome in {"verified_continue", "correction_required"} and unreliable:
        _fail("provider_response_unsupported_claim", "Verdict relies on evidence that is not visibly reliable.")
    if outcome == "verified_continue" and (not observations or missing):
        _fail("provider_response_unsupported_claim", "Continue verdict lacks complete visible support.")
    if outcome == "more_evidence_required" and not missing:
        _fail("provider_response_schema_invalid", "More-evidence verdict must name missing evidence.")
    return {
        "schema_version": 1,
        "review_session_id": validated_request["review_session_id"],
        "identity": identity,
        "verdict": outcome,
        "ui_message": VERDICT_UI_MESSAGES[outcome],
        "confidence": {"level": confidence["level"], "uncertainty_reasons": uncertainty},
        "observations": observations,
        "missing_evidence": missing,
        "safe_next_action": verdict["safe_next_action"],
        "expected_state_references": references,
        "provider": settings.provider,
        "model": settings.model,
        "usage_unit": "photo_review_session",
    }


def _validate_identity(payload: object, *, code: str = "review_request_schema_invalid") -> dict[str, Any]:
    identity = _strict_mapping(
        payload,
        required={
            "project_id",
            "session_id",
            "session_revision",
            "plan_id",
            "plan_revision",
            "plan_fingerprint",
            "action_id",
            "step_id",
            "step_revision",
            "checkpoint_identity",
        },
        code=code,
    )
    for key in ("project_id", "session_id", "plan_id", "action_id", "step_id"):
        _identifier(identity[key], key, code=code)
    for key in ("session_revision", "plan_revision", "step_revision"):
        if not isinstance(identity[key], int) or isinstance(identity[key], bool) or identity[key] < 1:
            _fail(code, f"{key} must be a positive integer.")
    if not isinstance(identity["plan_fingerprint"], str) or not _FINGERPRINT.fullmatch(identity["plan_fingerprint"]):
        _fail(code, "plan_fingerprint is invalid.")
    checkpoint = identity["checkpoint_identity"]
    if checkpoint is not None:
        checkpoint = _strict_mapping(
            checkpoint,
            required={"checkpoint_id", "revision", "fingerprint"},
            code=code,
        )
        _identifier(checkpoint["checkpoint_id"], "checkpoint_id", code=code)
        if not isinstance(checkpoint["revision"], int) or isinstance(checkpoint["revision"], bool) or checkpoint["revision"] < 1:
            _fail(code, "checkpoint revision is invalid.")
        if not isinstance(checkpoint["fingerprint"], str) or not _FINGERPRINT.fullmatch(checkpoint["fingerprint"]):
            _fail(code, "checkpoint fingerprint is invalid.")
        identity = deepcopy(identity)
        identity["checkpoint_identity"] = checkpoint
    return deepcopy(identity)


def _validate_photos(payload: object, *, follow_up: bool) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        _fail("review_request_schema_invalid", "photos must be an array.")
    maximum = MAX_FOLLOW_UP_PHOTOS if follow_up else MAX_INITIAL_PHOTOS
    if not 1 <= len(payload) <= maximum:
        _fail("review_photo_count_invalid", "Review photo count is outside the contract.")
    photos: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_hashes: set[str] = set()
    for raw in payload:
        photo = _strict_mapping(
            raw,
            required={"photo_id", "sha256", "mime_type", "content_base64"},
            code="review_request_schema_invalid",
        )
        _identifier(photo["photo_id"], "photo_id")
        if not isinstance(photo["sha256"], str) or not _SHA256.fullmatch(photo["sha256"]):
            _fail("review_photo_hash_invalid", "Photo SHA-256 is invalid.")
        if photo["mime_type"] not in SAFE_MIME_TYPES:
            _fail("review_photo_mime_invalid", "Photo MIME type is unsupported.")
        content = photo["content_base64"]
        if not isinstance(content, str) or not content or len(content) > 28_000_000:
            _fail("review_photo_content_invalid", "Photo content is invalid.")
        try:
            base64.b64decode(content, validate=True)
        except (binascii.Error, ValueError):
            _fail("review_photo_content_invalid", "Photo content is not valid base64.")
        if photo["photo_id"] in seen_ids or photo["sha256"] in seen_hashes:
            _fail("review_photo_duplicate", "Duplicate photo is not allowed.", 409)
        seen_ids.add(photo["photo_id"])
        seen_hashes.add(photo["sha256"])
        photos.append(deepcopy(photo))
    return photos


def _validate_observations(
    payload: object,
    *,
    allowed_checks: set[str],
    photo_hashes: set[str],
) -> list[dict[str, str]]:
    if not isinstance(payload, list) or len(payload) > 30:
        _fail("provider_response_schema_invalid", "observations must be an array.")
    result: list[dict[str, str]] = []
    for raw in payload:
        item = _strict_mapping(
            raw,
            required={"check", "finding", "photo_sha256", "reliability"},
            code="provider_response_schema_invalid",
        )
        if item["check"] not in allowed_checks:
            _fail("provider_response_unsupported_claim", "Observation uses a check that was not allowed.")
        _bounded_text(item["finding"], "finding", maximum=1000)
        if item["photo_sha256"] not in photo_hashes:
            _fail("provider_response_photo_mismatch", "Observation references an unknown photo.")
        if item["reliability"] not in {"visible_reliable", "not_reliably_visible"}:
            _fail("provider_response_schema_invalid", "Observation reliability is invalid.")
        result.append(deepcopy(item))
    return result


def _strict_mapping(
    payload: object,
    *,
    required: set[str],
    code: str,
) -> dict[str, Any]:
    if not isinstance(payload, Mapping) or any(not isinstance(key, str) for key in payload):
        _fail(code, "Expected a JSON object.")
    keys = set(payload)
    if keys != required:
        _fail(code, "JSON object fields do not match the strict contract.")
    return dict(payload)


def _string_list(
    payload: object,
    field: str,
    *,
    minimum: int,
    maximum: int,
) -> list[str]:
    if not isinstance(payload, list) or not minimum <= len(payload) <= maximum:
        _fail("review_request_schema_invalid", f"{field} is outside the contract.")
    result: list[str] = []
    for value in payload:
        result.append(_bounded_text(value, field, maximum=1000))
    if len(set(result)) != len(result):
        _fail("review_request_schema_invalid", f"{field} contains duplicates.")
    return result


def _bounded_text(
    value: object,
    field: str,
    *,
    maximum: int,
    allow_empty: bool = False,
) -> str:
    if not isinstance(value, str):
        _fail("review_request_schema_invalid", f"{field} must be text.")
    text = value.strip()
    if (not text and not allow_empty) or len(text) > maximum:
        _fail("review_request_schema_invalid", f"{field} is outside the contract.")
    return text


def _identifier(value: object, field: str, *, code: str = "review_request_schema_invalid") -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        _fail(code, f"{field} is invalid.")
    return value


def _fail(code: str, message: str, status_code: int = 422) -> None:
    raise VisionReviewError(code, message, status_code=status_code)


def _vision_error_response(error: VisionReviewError) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": error.code, "message": error.message}},
        status_code=error.status_code,
    )


__all__ = [
    "ALLOWED_VERDICTS",
    "DEFAULT_MODEL",
    "DEFAULT_PROVIDER",
    "ExecutionStateVerifier",
    "MAX_FOLLOW_UP_PHOTOS",
    "MAX_INITIAL_PHOTOS",
    "NoChargeUsageMeter",
    "RESPONSES_API_ENDPOINT",
    "VERDICT_JSON_SCHEMA",
    "VERDICT_UI_MESSAGES",
    "VisionGatewaySettings",
    "VisionProvider",
    "VisionReviewError",
    "VisionReviewGateway",
    "VisionReviewHttpApi",
    "VisionUsageMeter",
    "build_responses_api_request",
    "validate_provider_verdict",
    "validate_review_request",
]
