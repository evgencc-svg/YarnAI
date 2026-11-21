"""Strict server boundary for garment-reference analysis.

The module has no HTTP client and imports no OpenAI SDK. Production composition
keeps the capability disabled; tests may inject a deterministic fake provider.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import re
import sqlite3
import struct
import urllib.error
import urllib.request
import zlib
from collections.abc import Mapping
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, ROUND_CEILING
from pathlib import Path
from threading import Lock
from typing import Any, Protocol

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from yarnai.vision_review import (
    DEFAULT_MODEL,
    DEFAULT_PROVIDER,
    NoChargeUsageMeter,
    VisionGatewaySettings,
    VisionProvider,
    VisionUsageMeter,
)


CONTRACT_VERSION = "GARMENT_REFERENCE_ANALYSIS_V1"
PILOT_SCHEMA_VERSION = 1
PHOTO_PURPOSE = "GARMENT_REFERENCE"
DISABLED_MESSAGE = "Автоматический анализ фотографий пока не подключён."
PILOT_NOT_RUN_MESSAGE = "Реальный анализ ещё не запускался."
SAFE_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
SANITIZED_MIME_TYPE = "image/png"
MAX_SANITIZED_IMAGE_BYTES = 8_000_000
MAX_SANITIZED_IMAGE_BASE64_BYTES = ((MAX_SANITIZED_IMAGE_BYTES + 2) // 3) * 4
MAX_SANITIZED_IMAGE_DIMENSION = 1_600
MAX_SANITIZED_IMAGE_PIXELS = MAX_SANITIZED_IMAGE_DIMENSION * MAX_SANITIZED_IMAGE_DIMENSION
GARMENT_ANALYSIS_ROUTE = "/api/v1/garment-reference-analyses"
# The JSON allowance covers the complete bounded request metadata, including
# worst-case JSON escaping for the 6,000-byte clarification budget.
MAX_GARMENT_ANALYSIS_JSON_OVERHEAD_BYTES = 64 * 1_024
MAX_GARMENT_ANALYSIS_REQUEST_BODY_BYTES = (
    MAX_SANITIZED_IMAGE_BASE64_BYTES
    + MAX_GARMENT_ANALYSIS_JSON_OVERHEAD_BYTES
)
MAX_OUTPUT_TOKENS = 2_200
MAX_TEXT_INPUT_TOKENS = 6_000
REASONING_EFFORT = "medium"
COST_CAP_USD = Decimal("0.05")
INPUT_USD_PER_MILLION = Decimal("2.00")
CACHED_INPUT_USD_PER_MILLION = Decimal("0.20")
CACHE_WRITE_USD_PER_MILLION = Decimal("2.50")
OUTPUT_USD_PER_MILLION = Decimal("12.00")
PRICING_VERIFIED_DATE = "2026-09-30"
IMAGE_TOKEN_MULTIPLIER = Decimal("1.2")
IMAGE_DETAIL = "high"
RESPONSES_ENDPOINT_PATH = "/v1/responses"
RESPONSES_ENDPOINT_URL = f"https://api.openai.com{RESPONSES_ENDPOINT_PATH}"
PROVIDER_RETRIES = 0
PROVIDER_STORE = False
PROVIDER_BACKGROUND = False
PROVIDER_STREAM = False
PROVIDER_WEB_SEARCH = False
PROVIDER_TOOLS: tuple[Any, ...] = ()
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_UUID_V7 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$")
_FINGERPRINT = re.compile(r"^fnv1a32:[0-9a-f]{8}$")


FORBIDDEN_EXACT_CLAIMS = frozenset(
    {
        "stitch_counts",
        "row_counts",
        "measurements",
        "gauge",
        "yarn_usage",
        "exact_yarn_composition",
        "authorship",
        "original_pattern_reconstruction",
    }
)


def _strict_object_schema(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
        "required": required,
    }


GARMENT_PILOT_JSON_SCHEMA: dict[str, Any] = _strict_object_schema(
    {
        "visibleObservations": {
            "type": "array",
            "minItems": 1,
            "maxItems": 20,
            "items": _strict_object_schema(
                {
                    "id": {"type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$"},
                    "description": {"type": "string"},
                    "visualEvidence": {"type": "string"},
                },
                ["id", "description", "visualEvidence"],
            ),
        },
        "uncertainObservations": {
            "type": "array",
            "minItems": 1,
            "maxItems": 20,
            "items": _strict_object_schema(
                {
                    "id": {"type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$"},
                    "possibleInterpretations": {"type": "array", "minItems": 2, "maxItems": 5, "items": {"type": "string"}},
                    "uncertaintyReason": {"type": "string"},
                    "clarificationMethod": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                ["id", "possibleInterpretations", "uncertaintyReason", "clarificationMethod", "confidence"],
            ),
        },
        "technologyOptions": {
            "type": "array",
            "minItems": 2,
            "maxItems": 3,
            "items": _strict_object_schema(
                {
                    "id": {"type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$"},
                    "name": {"type": "string"},
                    "construction": {"type": "string"},
                    "knittingDirection": {"type": "string"},
                    "suggestedTechniques": {"type": "array", "minItems": 1, "maxItems": 12, "items": {"type": "string"}},
                    "observationIds": {"type": "array", "minItems": 1, "maxItems": 20, "items": {"type": "string"}},
                    "visualEvidence": {"type": "string"},
                    "alternativeExplanation": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                ["id", "name", "construction", "knittingDirection", "suggestedTechniques", "observationIds", "visualEvidence", "alternativeExplanation", "confidence"],
            ),
        },
        "cannotDetermineFromPhoto": {
            "type": "array",
            "minItems": 1,
            "maxItems": 20,
            "items": _strict_object_schema(
                {"feature": {"type": "string"}, "reason": {"type": "string"}},
                ["feature", "reason"],
            ),
        },
        "clarifyingQuestions": {
            "type": "array",
            "minItems": 1,
            "maxItems": 12,
            "items": _strict_object_schema(
                {"question": {"type": "string"}, "reason": {"type": "string"}, "distinguishes": {"type": "array", "minItems": 2, "maxItems": 5, "items": {"type": "string"}}},
                ["question", "reason", "distinguishes"],
            ),
        },
        "forbiddenExactClaims": {
            "type": "array",
            "minItems": len(FORBIDDEN_EXACT_CLAIMS),
            "maxItems": len(FORBIDDEN_EXACT_CLAIMS),
            "items": {"type": "string", "enum": sorted(FORBIDDEN_EXACT_CLAIMS)},
        },
    },
    ["visibleObservations", "uncertainObservations", "technologyOptions", "cannotDetermineFromPhoto", "clarifyingQuestions", "forbiddenExactClaims"],
)


class GarmentReferenceError(ValueError):
    def __init__(self, code: str, message: str, *, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class GarmentReferenceStateVerifier(Protocol):
    def assert_current(self, source_identity: Mapping[str, Any]) -> None: ...


class PilotAuthorizationStore(Protocol):
    """Server-only durable one-shot authorization boundary."""

    def pending_request_id(self) -> str | None: ...

    def pending_binding(self) -> dict[str, Any] | None: ...

    def consume(self, request: ValidatedPilotRequest) -> bool: ...


class PilotTransportAudit(Protocol):
    """Secret-free durable audit for the single authorized attempt."""

    def record_analysis_post(self) -> None: ...

    def record_transport_started(self, request_id: str, endpoint: str) -> None: ...

    def record_transport_result(self, request_id: str, *, http_status: int | None, response: Mapping[str, Any]) -> None: ...

    def record_transport_error(self, request_id: str, *, http_status: int | None, error_code: str) -> None: ...

    def record_validation(self, request_id: str, *, passed: bool, error_code: str | None) -> None: ...

    def record_output_validation_diagnostic(self, request_id: str, diagnostic: Mapping[str, Any]) -> None: ...


@dataclass(frozen=True, slots=True)
class PilotAuthorization:
    authorization_id: str
    request_id: str
    source_identity: Mapping[str, Any]
    source_photo_id: str
    source_photo_sha256: str
    sanitized_photo_sha256: str
    sanitized_width: int
    sanitized_height: int
    sanitized_byte_size: int
    provider: str = DEFAULT_PROVIDER
    model: str = DEFAULT_MODEL
    endpoint: str = RESPONSES_ENDPOINT_PATH
    retries: int = PROVIDER_RETRIES
    store: bool = PROVIDER_STORE
    background: bool = PROVIDER_BACKGROUND
    stream: bool = PROVIDER_STREAM
    web_search: bool = PROVIDER_WEB_SEARCH
    tools: tuple[Any, ...] = PROVIDER_TOOLS
    cost_cap_usd: Decimal = COST_CAP_USD


@dataclass(frozen=True, slots=True)
class _ValidatedPilotPhotoIdentity:
    photo_id: str
    sha256: str


@dataclass(frozen=True, slots=True)
class _ValidatedPilotSourceIdentity:
    project_id: str
    project_revision: int
    reference_photos: tuple[_ValidatedPilotPhotoIdentity, ...]
    request_fingerprint: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "project_id": self.project_id,
            "project_revision": self.project_revision,
            "reference_photos": [
                {"photo_id": photo.photo_id, "sha256": photo.sha256}
                for photo in self.reference_photos
            ],
            "request_fingerprint": self.request_fingerprint,
        }


@dataclass(frozen=True, slots=True)
class _ValidatedPilotClarification:
    type: str
    text: str


@dataclass(frozen=True, slots=True)
class _ValidatedSanitizedImage:
    mime_type: str
    content_base64: str
    image_bytes: bytes
    sha256: str
    width: int
    height: int


@dataclass(frozen=True, slots=True)
class ValidatedPilotRequest:
    """Immutable result of crossing the raw pilot-request trust boundary."""

    request_id: str
    source_identity: _ValidatedPilotSourceIdentity
    source_photo_id: str
    source_photo_sha256: str
    sanitized_image: _ValidatedSanitizedImage
    user_clarifications: tuple[_ValidatedPilotClarification, ...]

    def source_identity_dict(self) -> dict[str, Any]:
        return self.source_identity.as_dict()

    def clarifications_list(self) -> list[dict[str, str]]:
        return [
            {"type": clarification.type, "text": clarification.text}
            for clarification in self.user_clarifications
        ]


class NoPilotAuthorizationStore:
    def pending_request_id(self) -> None:
        return None

    def pending_binding(self) -> None:
        return None

    def consume(self, request: ValidatedPilotRequest) -> bool:
        del request
        return False


class SqlitePilotAuthorizationStore:
    """Atomic one-shot store; authorization creation has no browser route."""

    def __init__(self, database_path: str | Path) -> None:
        self.database_path = str(Path(database_path))
        self._lock = Lock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=5, isolation_level=None)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS garment_pilot_authorizations (
                    authorization_id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL UNIQUE,
                    binding_json TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    cap_microusd INTEGER NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('approved', 'consumed')),
                    approved_at TEXT NOT NULL,
                    consumed_at TEXT
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS garment_pilot_analysis_posts (
                    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                    request_id TEXT NOT NULL,
                    started_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS garment_pilot_authorization_cancellations (
                    request_id TEXT PRIMARY KEY,
                    superseded_by_request_id TEXT NOT NULL UNIQUE,
                    reason TEXT NOT NULL,
                    cancelled_at TEXT NOT NULL,
                    FOREIGN KEY(request_id) REFERENCES garment_pilot_authorizations(request_id)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS garment_pilot_transport_audit (
                    request_id TEXT PRIMARY KEY,
                    endpoint TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    http_status INTEGER,
                    result_status TEXT,
                    provider_response_id TEXT,
                    provider_model TEXT,
                    usage_json TEXT,
                    actual_cost_usd TEXT,
                    error_code TEXT,
                    validation_passed INTEGER,
                    validation_error_code TEXT,
                    completed_at TEXT
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(garment_pilot_transport_audit)").fetchall()
            }
            diagnostic_columns = {
                "provider_response_metadata_json": "TEXT",
                "validation_stage": "TEXT",
                "validation_reason_code": "TEXT",
                "validation_issues_json": "TEXT",
                "model_output_sha256": "TEXT",
                "model_output_text": "TEXT",
                "model_output_truncated": "INTEGER",
                "model_output_redacted": "INTEGER",
                "model_output_top_level_keys_json": "TEXT",
            }
            for name, sql_type in diagnostic_columns.items():
                if name not in columns:
                    connection.execute(f"ALTER TABLE garment_pilot_transport_audit ADD COLUMN {name} {sql_type}")

    def issue(self, authorization: PilotAuthorization) -> None:
        """Server-side owner operation; deliberately unavailable over HTTP."""

        values = self._authorization_values(authorization)
        with self._lock, self._connect() as connection:
            connection.execute(
                "INSERT INTO garment_pilot_authorizations VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, NULL)",
                values,
            )

    @staticmethod
    def _authorization_values(authorization: PilotAuthorization) -> tuple[Any, ...]:
        binding = _authorization_binding(
            {
                "request_id": authorization.request_id,
                "source_identity": authorization.source_identity,
                "source_photo_id": authorization.source_photo_id,
                "source_photo_sha256": authorization.source_photo_sha256,
                "sanitized_photo_sha256": authorization.sanitized_photo_sha256,
                "sanitized_width": authorization.sanitized_width,
                "sanitized_height": authorization.sanitized_height,
                "sanitized_byte_size": authorization.sanitized_byte_size,
                "provider": authorization.provider,
                "model": authorization.model,
                "endpoint": authorization.endpoint,
                "retries": authorization.retries,
                "store": authorization.store,
                "background": authorization.background,
                "stream": authorization.stream,
                "web_search": authorization.web_search,
                "tools": list(authorization.tools),
                "cost_cap_usd": str(authorization.cost_cap_usd),
            }
        )
        return (
            authorization.authorization_id,
            authorization.request_id,
            json.dumps(binding, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            authorization.provider,
            authorization.model,
            int(authorization.cost_cap_usd * Decimal(1_000_000)),
            datetime.now(UTC).isoformat(),
        )

    def replace_unattempted(
        self,
        blocked_request_id: str,
        replacement: PilotAuthorization,
        *,
        reason: str,
    ) -> None:
        """Atomically cancel one unattempted request and issue its exact replacement."""

        values = self._authorization_values(replacement)
        with self._lock, self._connect() as connection:
            try:
                connection.execute("BEGIN IMMEDIATE")
                active = connection.execute(
                    """SELECT a.request_id
                       FROM garment_pilot_authorizations AS a
                       LEFT JOIN garment_pilot_authorization_cancellations AS c ON c.request_id=a.request_id
                       WHERE a.status='approved' AND c.request_id IS NULL"""
                ).fetchall()
                posts = connection.execute(
                    "SELECT COUNT(*) FROM garment_pilot_analysis_posts WHERE request_id=?",
                    (blocked_request_id,),
                ).fetchone()[0]
                calls = connection.execute(
                    "SELECT COUNT(*) FROM garment_pilot_transport_audit WHERE request_id=?",
                    (blocked_request_id,),
                ).fetchone()[0]
                if (
                    len(active) != 1
                    or active[0]["request_id"] != blocked_request_id
                    or posts != 0
                    or calls != 0
                    or replacement.request_id == blocked_request_id
                ):
                    connection.execute("ROLLBACK")
                    raise RuntimeError("Blocked authorization is not an exact unattempted active request")
                connection.execute(
                    "INSERT INTO garment_pilot_authorization_cancellations VALUES (?, ?, ?, ?)",
                    (
                        blocked_request_id,
                        replacement.request_id,
                        _safe_audit_text(reason, 200),
                        datetime.now(UTC).isoformat(),
                    ),
                )
                connection.execute(
                    "INSERT INTO garment_pilot_authorizations VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, NULL)",
                    values,
                )
                connection.execute("COMMIT")
            except Exception:
                if connection.in_transaction:
                    connection.execute("ROLLBACK")
                raise

    def pending_request_id(self) -> str | None:
        binding = self.pending_binding()
        return binding.get("request_id") if binding else None

    def pending_binding(self) -> dict[str, Any] | None:
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT a.binding_json
                   FROM garment_pilot_authorizations AS a
                   LEFT JOIN garment_pilot_authorization_cancellations AS c ON c.request_id=a.request_id
                   WHERE a.status='approved' AND c.request_id IS NULL
                   ORDER BY a.approved_at"""
            ).fetchall()
        return json.loads(rows[0]["binding_json"]) if len(rows) == 1 else None

    def consume(self, request: ValidatedPilotRequest) -> bool:
        binding = _authorization_binding(request)
        serialized = json.dumps(binding, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        with self._lock, self._connect() as connection:
            try:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    """SELECT a.*, c.request_id AS cancelled_request_id
                       FROM garment_pilot_authorizations AS a
                       LEFT JOIN garment_pilot_authorization_cancellations AS c ON c.request_id=a.request_id
                       WHERE a.request_id=?""",
                    (binding["request_id"],),
                ).fetchone()
                if (
                    row is None
                    or row["status"] != "approved"
                    or row["cancelled_request_id"] is not None
                    or row["binding_json"] != serialized
                    or row["provider"] != DEFAULT_PROVIDER
                    or row["model"] != DEFAULT_MODEL
                    or row["cap_microusd"] != int(COST_CAP_USD * Decimal(1_000_000))
                ):
                    connection.execute("ROLLBACK")
                    return False
                updated = connection.execute(
                    "UPDATE garment_pilot_authorizations SET status='consumed', consumed_at=? WHERE request_id=? AND status='approved'",
                    (datetime.now(UTC).isoformat(), binding["request_id"]),
                ).rowcount
                connection.execute("COMMIT")
                return updated == 1
            except Exception:
                if connection.in_transaction:
                    connection.execute("ROLLBACK")
                raise

    def authorization_rows(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT a.*, CASE WHEN c.request_id IS NULL THEN a.status ELSE 'cancelled' END AS effective_status,
                          c.cancelled_at, c.superseded_by_request_id, c.reason AS cancellation_reason
                   FROM garment_pilot_authorizations AS a
                   LEFT JOIN garment_pilot_authorization_cancellations AS c ON c.request_id=a.request_id
                   ORDER BY a.approved_at"""
            ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["status"] = item.pop("effective_status")
            result.append(item)
        return result

    def record_analysis_post(self) -> None:
        with self._lock, self._connect() as connection:
            request_id = self.pending_request_id()
            if request_id is None:
                raise GarmentReferenceError("pilot_authorization_missing_or_used", "Одноразовое разрешение отсутствует или уже использовано.", status_code=409)
            try:
                connection.execute(
                    "INSERT INTO garment_pilot_analysis_posts VALUES (1, ?, ?)",
                    (request_id, datetime.now(UTC).isoformat()),
                )
            except sqlite3.IntegrityError as error:
                raise GarmentReferenceError("analysis_post_already_attempted", "Второй analysis POST запрещён.", status_code=409) from error

    def record_transport_started(self, request_id: str, endpoint: str) -> None:
        with self._lock, self._connect() as connection:
            try:
                connection.execute(
                    "INSERT INTO garment_pilot_transport_audit (request_id, endpoint, started_at) VALUES (?, ?, ?)",
                    (request_id, endpoint, datetime.now(UTC).isoformat()),
                )
            except sqlite3.IntegrityError as error:
                raise GarmentReferenceError("provider_transport_already_attempted", "Вторая provider transport attempt запрещена.", status_code=409) from error

    def record_transport_result(self, request_id: str, *, http_status: int | None, response: Mapping[str, Any]) -> None:
        usage = normalize_provider_usage(response.get("usage"))
        cost = calculate_actual_cost_usd(usage) if usage is not None else None
        with self._lock, self._connect() as connection:
            connection.execute(
                """UPDATE garment_pilot_transport_audit
                   SET http_status=?, result_status=?, provider_response_id=?, provider_model=?, usage_json=?, actual_cost_usd=?, completed_at=?
                   WHERE request_id=?""",
                (
                    http_status,
                    _safe_audit_text(response.get("status"), 80),
                    _safe_audit_text(response.get("id"), 200),
                    _safe_audit_text(response.get("model"), 200),
                    json.dumps(usage, sort_keys=True, separators=(",", ":")) if usage is not None else None,
                    str(cost) if cost is not None else None,
                    datetime.now(UTC).isoformat(),
                    request_id,
                ),
            )

    def record_transport_error(self, request_id: str, *, http_status: int | None, error_code: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                "UPDATE garment_pilot_transport_audit SET http_status=?, error_code=?, completed_at=? WHERE request_id=?",
                (http_status, _safe_audit_text(error_code, 120), datetime.now(UTC).isoformat(), request_id),
            )

    def record_validation(self, request_id: str, *, passed: bool, error_code: str | None) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                "UPDATE garment_pilot_transport_audit SET validation_passed=?, validation_error_code=? WHERE request_id=?",
                (1 if passed else 0, _safe_audit_text(error_code, 120), request_id),
            )

    def record_output_validation_diagnostic(self, request_id: str, diagnostic: Mapping[str, Any]) -> None:
        """Persist a bounded, secret-free replay snapshot in the existing transport audit."""

        issues = diagnostic.get("issues")
        metadata = diagnostic.get("provider_response_metadata")
        top_level_keys = diagnostic.get("top_level_keys")
        model_output = diagnostic.get("model_output")
        if not isinstance(issues, list) or not isinstance(metadata, Mapping) or not isinstance(top_level_keys, list):
            raise ValueError("Invalid provider output diagnostic")
        if model_output is not None and not isinstance(model_output, str):
            raise ValueError("Invalid model output diagnostic")
        issues_json = json.dumps(issues, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        metadata_json = json.dumps(dict(metadata), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        keys_json = json.dumps(top_level_keys, ensure_ascii=False, separators=(",", ":"))
        if len(issues_json.encode("utf-8")) > 100_000 or len(metadata_json.encode("utf-8")) > 20_000 or len(keys_json.encode("utf-8")) > 20_000:
            raise ValueError("Provider output diagnostic exceeds audit limit")
        with self._lock, self._connect() as connection:
            updated = connection.execute(
                """UPDATE garment_pilot_transport_audit
                   SET provider_response_metadata_json=?, validation_stage=?, validation_reason_code=?,
                       validation_issues_json=?, model_output_sha256=?, model_output_text=?,
                       model_output_truncated=?, model_output_redacted=?, model_output_top_level_keys_json=?
                   WHERE request_id=?""",
                (
                    metadata_json,
                    _safe_audit_text(diagnostic.get("validation_stage"), 120),
                    _safe_audit_text(diagnostic.get("reason_code"), 120),
                    issues_json,
                    _safe_audit_text(diagnostic.get("model_output_sha256"), 64),
                    model_output,
                    1 if diagnostic.get("model_output_truncated") is True else 0,
                    1 if diagnostic.get("model_output_redacted") is True else 0,
                    keys_json,
                    request_id,
                ),
            ).rowcount
        if updated != 1:
            raise ValueError("Provider transport audit row is missing")

    def audit_summary(self) -> dict[str, Any]:
        with self._connect() as connection:
            authorization = connection.execute(
                """SELECT a.authorization_id, a.request_id,
                          CASE WHEN c.request_id IS NULL THEN a.status ELSE 'cancelled' END AS status,
                          a.approved_at, a.consumed_at, c.cancelled_at,
                          c.superseded_by_request_id, c.reason AS cancellation_reason
                   FROM garment_pilot_authorizations AS a
                   LEFT JOIN garment_pilot_authorization_cancellations AS c ON c.request_id=a.request_id
                   ORDER BY a.approved_at"""
            ).fetchall()
            posts = connection.execute("SELECT request_id, started_at FROM garment_pilot_analysis_posts").fetchall()
            transports = connection.execute("SELECT * FROM garment_pilot_transport_audit ORDER BY started_at").fetchall()
        return {
            "authorization_count": len(authorization),
            "authorizations": [dict(row) for row in authorization],
            "analysis_post_count": len(posts),
            "analysis_posts": [dict(row) for row in posts],
            "provider_call_count": len(transports),
            "provider_calls": [dict(row) for row in transports],
        }


class JsonTransport(Protocol):
    def post_json(
        self,
        endpoint: str,
        payload: Mapping[str, Any],
        *,
        headers: Mapping[str, str],
        timeout_seconds: float,
    ) -> Mapping[str, Any]: ...


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, ANN201 - urllib signature
        del req, fp, code, msg, headers, newurl
        return None


class UrllibJsonTransport:
    """One foreground HTTPS attempt. urllib performs no application retry."""

    def __init__(self, *, audit: PilotTransportAudit | None = None, request_id: str | None = None) -> None:
        self._audit = audit
        self._request_id = request_id

    def post_json(
        self,
        endpoint: str,
        payload: Mapping[str, Any],
        *,
        headers: Mapping[str, str],
        timeout_seconds: float,
    ) -> Mapping[str, Any]:
        if endpoint != RESPONSES_ENDPOINT_URL:
            raise GarmentReferenceError(
                "provider_endpoint_mismatch",
                "Provider endpoint не совпадает с одноразовым разрешением.",
                status_code=409,
            )
        if self._audit is not None:
            if not self._request_id:
                raise GarmentReferenceError("provider_audit_request_id_missing", "Server-issued request ID отсутствует.", status_code=409)
            self._audit.record_transport_started(self._request_id, RESPONSES_ENDPOINT_PATH)
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
            headers=dict(headers),
            method="POST",
        )
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirectHandler())
            with opener.open(request, timeout=timeout_seconds) as response:  # noqa: S310 - fixed HTTPS endpoint
                http_status = int(getattr(response, "status", 200))
                body = response.read(2_000_001)
        except urllib.error.HTTPError as error:
            if self._audit is not None:
                self._audit.record_transport_error(self._request_id, http_status=error.code, error_code=f"http_{error.code}")  # type: ignore[arg-type]
            raise
        except TimeoutError:
            if self._audit is not None:
                self._audit.record_transport_error(self._request_id, http_status=None, error_code="timeout")  # type: ignore[arg-type]
            raise
        except urllib.error.URLError:
            if self._audit is not None:
                self._audit.record_transport_error(self._request_id, http_status=None, error_code="url_error")  # type: ignore[arg-type]
            raise
        if len(body) > 2_000_000:
            if self._audit is not None:
                self._audit.record_transport_error(self._request_id, http_status=http_status, error_code="response_too_large")  # type: ignore[arg-type]
            raise GarmentReferenceError("provider_response_too_large", "Ответ сервера анализа слишком большой.")
        try:
            parsed = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            if self._audit is not None:
                self._audit.record_transport_error(self._request_id, http_status=http_status, error_code="response_malformed")  # type: ignore[arg-type]
            raise GarmentReferenceError("provider_response_malformed", "Сервер анализа вернул повреждённый ответ.") from error
        if not isinstance(parsed, Mapping):
            if self._audit is not None:
                self._audit.record_transport_error(self._request_id, http_status=http_status, error_code="response_malformed")  # type: ignore[arg-type]
            raise GarmentReferenceError("provider_response_malformed", "Сервер анализа вернул повреждённый ответ.")
        result = dict(parsed)
        if self._audit is not None:
            self._audit.record_transport_result(self._request_id, http_status=http_status, response=result)  # type: ignore[arg-type]
        return result


class OpenAIResponsesAdapter:
    """Server-only credential holder and strict Responses API decoder."""

    def __init__(self, credential: str, *, transport: JsonTransport | None = None, timeout_seconds: float = 45.0) -> None:
        if not isinstance(credential, str) or not credential.strip():
            raise ValueError("Server OpenAI credential is required")
        self.__credential = credential.strip()
        self._transport = transport or UrllibJsonTransport()
        self._timeout_seconds = timeout_seconds

    def review(self, request: Mapping[str, Any]) -> Mapping[str, Any]:
        try:
            response = self._transport.post_json(
                RESPONSES_ENDPOINT_URL,
                request,
                headers={
                    "Authorization": f"Bearer {self.__credential}",
                    "Content-Type": "application/json",
                    "User-Agent": "YarnAI/garment-photo-pilot-v1",
                },
                timeout_seconds=self._timeout_seconds,
            )
        except TimeoutError as error:
            raise GarmentReferenceError("provider_timeout", "Сервер анализа не ответил вовремя. Повтор автоматически не выполняется.", status_code=504) from error
        except urllib.error.URLError as error:
            raise GarmentReferenceError("provider_unavailable", "Сервер анализа недоступен. Повтор автоматически не выполняется.", status_code=502) from error
        return extract_structured_output(response)


class GarmentReferenceGateway:
    """One injected provider boundary, disabled unless every server gate exists."""

    def __init__(
        self,
        settings: VisionGatewaySettings | None = None,
        *,
        provider: VisionProvider | None = None,
        usage_meter: VisionUsageMeter | None = None,
        state_verifier: GarmentReferenceStateVerifier | None = None,
        authorization_store: PilotAuthorizationStore | None = None,
    ) -> None:
        # Default composition does not inspect environment variables, including credentials.
        self.settings = settings or VisionGatewaySettings()
        self._provider = provider
        self._usage_meter = usage_meter or NoChargeUsageMeter()
        self._state_verifier = state_verifier
        self._authorization_store = authorization_store or NoPilotAuthorizationStore()

    @property
    def enabled(self) -> bool:
        return bool(
            self.settings.explicitly_enabled
            and self.settings.credential_configured
            and self._provider is not None
            and self._state_verifier is not None
            and not isinstance(self._authorization_store, NoPilotAuthorizationStore)
        )

    def public_configuration(self) -> dict[str, Any]:
        cost = assert_pilot_configuration_cost_safe()
        pending_request_id = self._authorization_store.pending_request_id() if self.enabled else None
        return {
            "contract_version": CONTRACT_VERSION,
            "provider": self.settings.provider,
            "model": self.settings.model,
            "enabled": self.enabled,
            "pilot_ready": bool(pending_request_id),
            "pilot_request_id": pending_request_id,
            "automatic_analysis": "available" if self.enabled else "unavailable",
            "usage_charged": False,
            "cost_cap_usd": str(COST_CAP_USD),
            "worst_case_cost_usd": str(cost["upper_bound_usd"]),
            "message": PILOT_NOT_RUN_MESSAGE if self.enabled else f"{PILOT_NOT_RUN_MESSAGE} {DISABLED_MESSAGE}",
            "data_notice": "store:false не означает полное отсутствие хранения: стандартные журналы контроля злоупотреблений могут храниться до 30 дней.",
        }

    def analyze(self, payload: object) -> dict[str, Any]:
        request = validate_pilot_request(payload)
        if not self.enabled:
            raise GarmentReferenceError("garment_reference_gateway_disabled", DISABLED_MESSAGE, status_code=503)
        if self.settings.provider != DEFAULT_PROVIDER or self.settings.model != DEFAULT_MODEL:
            raise GarmentReferenceError("provider_model_not_allowed", "Настройка сервера анализа не разрешена.", status_code=409)
        source_identity = request.source_identity_dict()
        self._state_verifier.assert_current(source_identity)  # type: ignore[union-attr]
        assert_pilot_configuration_cost_safe()
        estimate = estimate_validated_request_cost(request)
        if estimate["upper_bound_usd"] > COST_CAP_USD:
            raise GarmentReferenceError("cost_cap_exceeded", "Безопасная верхняя оценка стоимости превышает $0.05.", status_code=409)
        # Atomic irreversible consume happens immediately before the only transport attempt.
        if not self._authorization_store.consume(request):
            raise GarmentReferenceError("pilot_authorization_missing_or_used", "Для этой очищенной фотографии нет действующего одноразового разрешения.", status_code=409)
        try:
            provider_request = build_validated_pilot_responses_api_request(request, self.settings)
            raw_response = self._provider.review(provider_request)  # type: ignore[union-attr]
            self._state_verifier.assert_current(source_identity)  # type: ignore[union-attr]
            result = validate_validated_pilot_provider_response(raw_response, request, self.settings)
            result["cost_upper_bound_usd"] = str(estimate["upper_bound_usd"])
            self._record_validation(request.request_id, passed=True, error_code=None)
            return result
        except GarmentReferenceError as error:
            self._record_validation(request.request_id, passed=False, error_code=error.code)
            raise
        except TimeoutError as error:
            self._record_validation(request.request_id, passed=False, error_code="provider_timeout")
            raise GarmentReferenceError("provider_timeout", "Сервер анализа не ответил вовремя. Повтор автоматически не выполняется.", status_code=504) from error
        except Exception as error:
            self._record_validation(request.request_id, passed=False, error_code="provider_failed")
            raise GarmentReferenceError("provider_failed", "Анализ не завершён. Повтор автоматически не выполняется.", status_code=502) from error

    def record_analysis_post(self) -> None:
        recorder = getattr(self._authorization_store, "record_analysis_post", None)
        if callable(recorder):
            recorder()

    def _record_validation(self, request_id: str, *, passed: bool, error_code: str | None) -> None:
        recorder = getattr(self._authorization_store, "record_validation", None)
        if callable(recorder):
            recorder(request_id, passed=passed, error_code=error_code)


class GarmentReferenceHttpApi:
    def __init__(self, gateway: GarmentReferenceGateway) -> None:
        self.gateway = gateway

    def routes(self) -> list[Route]:
        return [
            Route("/api/v1/garment-reference-analyses/configuration", self.configuration, methods=["GET"]),
            Route("/api/v1/garment-reference-analyses", self.submit, methods=["POST"]),
        ]

    async def configuration(self, _request: Request) -> JSONResponse:
        return JSONResponse(self.gateway.public_configuration())

    async def submit(self, request: Request) -> JSONResponse:
        try:
            payload = await request.json()
        except (json.JSONDecodeError, UnicodeDecodeError):
            if getattr(request.state, "body_too_large", False):
                return _error_response(
                    GarmentReferenceError(
                        "REQUEST_TOO_LARGE",
                        "Request body is too large.",
                        status_code=413,
                    )
                )
            return _error_response(GarmentReferenceError("invalid_json", "Request body must be valid JSON.", status_code=400))
        if getattr(request.state, "body_too_large", False):
            return _error_response(
                GarmentReferenceError(
                    "REQUEST_TOO_LARGE",
                    "Request body is too large.",
                    status_code=413,
                )
            )
        try:
            self.gateway.record_analysis_post()
        except GarmentReferenceError as error:
            return _error_response(error)
        try:
            return JSONResponse(self.gateway.analyze(payload))
        except GarmentReferenceError as error:
            return _error_response(error)


def validate_pilot_request(payload: object) -> ValidatedPilotRequest:
    value = _strict_mapping(
        payload,
        required={
            "contract_version",
            "pilot_schema_version",
            "request_id",
            "source_identity",
            "source_photo_id",
            "source_photo_sha256",
            "sanitized_image",
            "user_clarifications",
            "user_confirmed_exact_sanitized_photo",
            "explicit_action",
        },
        code="pilot_request_schema_invalid",
    )
    if value["contract_version"] != CONTRACT_VERSION or value["pilot_schema_version"] != PILOT_SCHEMA_VERSION:
        _fail("pilot_request_schema_invalid", "Версия запроса анализа не поддерживается.")
    _pilot_identifier(value["request_id"], "request_id")
    if value["explicit_action"] != "run_one_shot_garment_photo_pilot" or value["user_confirmed_exact_sanitized_photo"] is not True:
        _fail("pilot_confirmation_required", "Нужно отдельно подтвердить отправку выбранной очищенной фотографии.", 409)
    identity = _validate_pilot_source_identity(value["source_identity"])
    source_photo_id = value["source_photo_id"]
    source_photo_sha256 = value["source_photo_sha256"]
    if not isinstance(source_photo_id, str) or not _UUID_V7.fullmatch(source_photo_id):
        _fail("pilot_photo_identity_invalid", "Выбранная фотография имеет неверную identity.")
    if not isinstance(source_photo_sha256, str) or not _SHA256.fullmatch(source_photo_sha256):
        _fail("pilot_photo_identity_invalid", "Выбранная фотография имеет неверный SHA-256.")
    if {"photo_id": source_photo_id, "sha256": source_photo_sha256} not in identity["reference_photos"]:
        _fail("pilot_photo_identity_mismatch", "Фотография не относится к текущему проекту или revision.", 409)
    image = _strict_mapping(
        value["sanitized_image"],
        required={"mime_type", "content_base64", "sha256", "width", "height"},
        code="pilot_request_schema_invalid",
    )
    if image["mime_type"] != SANITIZED_MIME_TYPE:
        _fail("sanitized_image_mime_invalid", "Очищенная копия должна быть PNG.")
    if not isinstance(image["sha256"], str) or not _SHA256.fullmatch(image["sha256"]):
        _fail("sanitized_image_hash_invalid", "SHA-256 очищенной копии имеет неверный формат.")
    content = image["content_base64"]
    if not isinstance(content, str) or not content or len(content) > MAX_SANITIZED_IMAGE_BASE64_BYTES:
        _fail("sanitized_image_content_invalid", "Очищенная копия имеет недопустимый размер.")
    try:
        image_bytes = base64.b64decode(content, validate=True)
    except (binascii.Error, ValueError) as error:
        raise GarmentReferenceError("sanitized_image_content_invalid", "Очищенная копия повреждена.") from error
    if not 1 <= len(image_bytes) <= MAX_SANITIZED_IMAGE_BYTES:
        _fail("sanitized_image_size_invalid", "Очищенная копия имеет недопустимый размер.")
    width, height = validate_sanitized_png(image_bytes, expected_sha256=image["sha256"])
    if image["width"] != width or image["height"] != height:
        _fail("sanitized_image_dimensions_mismatch", "Размеры очищенной копии не совпадают.", 409)
    clarifications = _array(value["user_clarifications"], "user_clarifications", minimum=0, maximum=20)
    normalized_clarifications: list[_ValidatedPilotClarification] = []
    total_text_bytes = 0
    for raw in clarifications:
        item = _strict_mapping(raw, required={"type", "text"}, code="pilot_request_schema_invalid")
        if item["type"] not in {"free_text", "observation_correction", "desired_change", "priority", "unseen_detail"}:
            _fail("pilot_request_schema_invalid", "Тип пояснения не поддерживается.")
        text = _pilot_text(item["text"], "text", 2_000)
        total_text_bytes += len(text.encode("utf-8"))
        normalized_clarifications.append(_ValidatedPilotClarification(type=item["type"], text=text))
    if total_text_bytes > 6_000:
        _fail("pilot_text_budget_exceeded", "Пояснения слишком велики для безопасной верхней оценки стоимости.", 409)
    return ValidatedPilotRequest(
        request_id=value["request_id"],
        source_identity=_ValidatedPilotSourceIdentity(
            project_id=identity["project_id"],
            project_revision=identity["project_revision"],
            reference_photos=tuple(
                _ValidatedPilotPhotoIdentity(photo_id=photo["photo_id"], sha256=photo["sha256"])
                for photo in identity["reference_photos"]
            ),
            request_fingerprint=identity["request_fingerprint"],
        ),
        source_photo_id=source_photo_id,
        source_photo_sha256=source_photo_sha256,
        sanitized_image=_ValidatedSanitizedImage(
            mime_type=SANITIZED_MIME_TYPE,
            content_base64=base64.b64encode(image_bytes).decode("ascii"),
            image_bytes=image_bytes,
            sha256=image["sha256"],
            width=width,
            height=height,
        ),
        user_clarifications=tuple(normalized_clarifications),
    )


def _validate_pilot_source_identity(payload: object) -> dict[str, Any]:
    identity = _strict_mapping(
        payload,
        required={"project_id", "project_revision", "reference_photos", "request_fingerprint"},
        code="pilot_request_schema_invalid",
    )
    if not isinstance(identity["project_id"], str) or not _UUID_V7.fullmatch(identity["project_id"]):
        _fail("pilot_request_schema_invalid", "project_id имеет неверный формат.")
    if not isinstance(identity["project_revision"], int) or isinstance(identity["project_revision"], bool) or identity["project_revision"] < 1:
        _fail("pilot_request_schema_invalid", "project_revision имеет неверный формат.")
    if not isinstance(identity["request_fingerprint"], str) or not _FINGERPRINT.fullmatch(identity["request_fingerprint"]):
        _fail("pilot_request_schema_invalid", "request_fingerprint имеет неверный формат.")
    photos = _array(identity["reference_photos"], "reference_photos", minimum=1, maximum=12)
    normalized_photos: list[dict[str, str]] = []
    for raw in photos:
        photo = _strict_mapping(raw, required={"photo_id", "sha256"}, code="pilot_request_schema_invalid")
        if not isinstance(photo["photo_id"], str) or not _UUID_V7.fullmatch(photo["photo_id"]):
            _fail("pilot_request_schema_invalid", "photo_id имеет неверный формат.")
        if not isinstance(photo["sha256"], str) or not _SHA256.fullmatch(photo["sha256"]):
            _fail("pilot_request_schema_invalid", "photo SHA-256 имеет неверный формат.")
        normalized_photos.append({"photo_id": photo["photo_id"], "sha256": photo["sha256"]})
    if len({item["photo_id"] for item in normalized_photos}) != len(normalized_photos) or len({item["sha256"] for item in normalized_photos}) != len(normalized_photos):
        _fail("pilot_request_schema_invalid", "Набор фотографий содержит повтор.")
    return {
        "project_id": identity["project_id"],
        "project_revision": identity["project_revision"],
        "reference_photos": normalized_photos,
        "request_fingerprint": identity["request_fingerprint"],
    }


def validate_sanitized_png(image_bytes: bytes, *, expected_sha256: str) -> tuple[int, int]:
    """Decode a metadata-free PNG envelope with bounded decompression."""

    if not isinstance(image_bytes, bytes) or not 1 <= len(image_bytes) <= MAX_SANITIZED_IMAGE_BYTES:
        _fail("sanitized_image_size_invalid", "Очищенная копия имеет недопустимый размер.")
    if hashlib.sha256(image_bytes).hexdigest() != expected_sha256:
        _fail("sanitized_image_sha256_mismatch", "Байты очищенной копии не совпадают с утверждённым SHA-256.", 409)
    if not image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        _fail("sanitized_image_decode_failed", "Очищенная копия не является декодируемым PNG.")
    position = 8
    width = height = channels = None
    idat = bytearray()
    seen_ihdr = seen_iend = False
    allowed_chunks = {b"IHDR", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"cHRM", b"pHYs"}
    while position < len(image_bytes):
        if position + 12 > len(image_bytes):
            _fail("sanitized_image_decode_failed", "PNG-структура очищенной копии обрезана.")
        length = struct.unpack(">I", image_bytes[position : position + 4])[0]
        chunk_type = image_bytes[position + 4 : position + 8]
        end = position + 12 + length
        if length > MAX_SANITIZED_IMAGE_BYTES or end > len(image_bytes):
            _fail("sanitized_image_decode_failed", "PNG-chunk очищенной копии повреждён.")
        data = image_bytes[position + 8 : position + 8 + length]
        expected_crc = struct.unpack(">I", image_bytes[position + 8 + length : end])[0]
        if zlib.crc32(chunk_type + data) & 0xFFFFFFFF != expected_crc:
            _fail("sanitized_image_decode_failed", "CRC очищенной копии не совпадает.")
        if chunk_type not in allowed_chunks:
            _fail("sanitized_image_metadata_present", "Очищенная копия содержит запрещённые metadata или animation chunks.")
        if chunk_type == b"IHDR":
            if seen_ihdr or position != 8 or length != 13:
                _fail("sanitized_image_decode_failed", "IHDR очищенной копии повреждён.")
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", data)
            if not 1 <= width <= MAX_SANITIZED_IMAGE_DIMENSION or not 1 <= height <= MAX_SANITIZED_IMAGE_DIMENSION:
                _fail("sanitized_image_dimensions_invalid", "Размеры очищенной копии выходят за разрешённые пределы.")
            if width * height > MAX_SANITIZED_IMAGE_PIXELS:
                _fail("sanitized_image_pixel_count_invalid", "Количество пикселей очищенной копии превышает безопасный предел.")
            if bit_depth != 8 or color_type not in {2, 6} or compression != 0 or filtering != 0 or interlace != 0:
                _fail("sanitized_image_decode_failed", "PNG-кодирование очищенной копии не поддерживается.")
            channels = 3 if color_type == 2 else 4
            seen_ihdr = True
        elif chunk_type == b"IDAT":
            if not seen_ihdr or seen_iend:
                _fail("sanitized_image_decode_failed", "Порядок PNG-chunks нарушен.")
            idat.extend(data)
        elif chunk_type == b"IEND":
            if length != 0 or seen_iend:
                _fail("sanitized_image_decode_failed", "IEND очищенной копии повреждён.")
            seen_iend = True
            if end != len(image_bytes):
                _fail("sanitized_image_decode_failed", "После IEND обнаружены лишние байты.")
        position = end
    if not seen_ihdr or not seen_iend or not idat or width is None or height is None or channels is None:
        _fail("sanitized_image_decode_failed", "PNG-структура очищенной копии неполна.")
    expected_length = height * (1 + width * channels)
    try:
        decoder = zlib.decompressobj()
        decoded = decoder.decompress(bytes(idat), expected_length + 1)
        if len(decoded) > expected_length:
            raise GarmentReferenceValidationError("sanitized PNG contains excess image data")
        decoded += decoder.flush(max(1, expected_length + 1 - len(decoded)))
    except zlib.error as error:
        raise GarmentReferenceError("sanitized_image_decode_failed", "Пиксельные данные очищенной копии повреждены.") from error
    if len(decoded) != expected_length or decoder.unused_data or decoder.unconsumed_tail or not decoder.eof:
        _fail("sanitized_image_decode_failed", "Размер декодированных пикселей очищенной копии не совпадает.")
    stride = 1 + width * channels
    if any(decoded[offset] > 4 for offset in range(0, len(decoded), stride)):
        _fail("sanitized_image_decode_failed", "PNG использует неизвестный фильтр строк.")
    return width, height


def estimate_image_tokens(width: int, height: int) -> int:
    if not 1 <= width <= MAX_SANITIZED_IMAGE_DIMENSION or not 1 <= height <= MAX_SANITIZED_IMAGE_DIMENSION:
        _fail("image_token_cost_unknown", "Нельзя доказать стоимость изображения с такими размерами.", 409)
    patch_count = ((width + 31) // 32) * ((height + 31) // 32)
    resized_patch_upper_bound = min(patch_count, 2_500)
    return int((Decimal(resized_patch_upper_bound) * IMAGE_TOKEN_MULTIPLIER).to_integral_value(rounding=ROUND_CEILING))


def _require_validated_pilot_request(request: object) -> ValidatedPilotRequest:
    if not isinstance(request, ValidatedPilotRequest):
        raise TypeError("ValidatedPilotRequest is required")
    return request


def estimate_validated_request_cost(request: ValidatedPilotRequest) -> dict[str, Any]:
    validated = _require_validated_pilot_request(request)
    prompt = _provider_text_context(validated)
    # Byte counts conservatively cover the supplied text without an external
    # tokenizer. Include the actual instruction and schema, not a fixed guess
    # that silently becomes stale when either grows. Reserve framing overhead.
    schema_text = json.dumps(GARMENT_PILOT_JSON_SCHEMA, ensure_ascii=False, separators=(",", ":"))
    text_tokens = sum(len(value.encode("utf-8")) for value in (
        prompt, _developer_instruction(), schema_text,
    )) + 512
    if text_tokens > MAX_TEXT_INPUT_TOKENS:
        _fail("text_token_cost_unknown", "Нельзя доказать верхнюю границу стоимости текста.", 409)
    image = validated.sanitized_image
    image_tokens = estimate_image_tokens(image.width, image.height)
    input_tokens = text_tokens + image_tokens
    input_rate = max(INPUT_USD_PER_MILLION, CACHED_INPUT_USD_PER_MILLION, CACHE_WRITE_USD_PER_MILLION)
    input_cost = Decimal(input_tokens) * input_rate / Decimal(1_000_000)
    output_cost = Decimal(MAX_OUTPUT_TOKENS) * OUTPUT_USD_PER_MILLION / Decimal(1_000_000)
    upper = (input_cost + output_cost).quantize(Decimal("0.000001"), rounding=ROUND_CEILING)
    return {
        "pricing_verified_date": PRICING_VERIFIED_DATE,
        "input_tokens_upper_bound": input_tokens,
        "image_tokens_upper_bound": image_tokens,
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "worst_case_input_usd_per_million": input_rate,
        "input_cost_upper_bound_usd": input_cost.quantize(Decimal("0.000001"), rounding=ROUND_CEILING),
        "output_cost_upper_bound_usd": output_cost.quantize(Decimal("0.000001"), rounding=ROUND_CEILING),
        "upper_bound_usd": upper,
    }


def estimate_pilot_configuration_cost() -> dict[str, Any]:
    """Absolute cost ceiling for every request accepted by this pilot configuration."""

    image_tokens = estimate_image_tokens(MAX_SANITIZED_IMAGE_DIMENSION, MAX_SANITIZED_IMAGE_DIMENSION)
    input_tokens = MAX_TEXT_INPUT_TOKENS + image_tokens
    input_rate = max(INPUT_USD_PER_MILLION, CACHED_INPUT_USD_PER_MILLION, CACHE_WRITE_USD_PER_MILLION)
    input_cost = Decimal(input_tokens) * input_rate / Decimal(1_000_000)
    output_cost = Decimal(MAX_OUTPUT_TOKENS) * OUTPUT_USD_PER_MILLION / Decimal(1_000_000)
    upper = (input_cost + output_cost).quantize(Decimal("0.000001"), rounding=ROUND_CEILING)
    return {
        "pricing_verified_date": PRICING_VERIFIED_DATE,
        "text_tokens_upper_bound": MAX_TEXT_INPUT_TOKENS,
        "image_tokens_upper_bound": image_tokens,
        "input_tokens_upper_bound": input_tokens,
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "worst_case_input_usd_per_million": input_rate,
        "output_usd_per_million": OUTPUT_USD_PER_MILLION,
        "input_cost_upper_bound_usd": input_cost.quantize(Decimal("0.000001"), rounding=ROUND_CEILING),
        "output_cost_upper_bound_usd": output_cost.quantize(Decimal("0.000001"), rounding=ROUND_CEILING),
        "upper_bound_usd": upper,
        "cost_cap_usd": COST_CAP_USD,
    }


def assert_pilot_configuration_cost_safe() -> dict[str, Any]:
    estimate = estimate_pilot_configuration_cost()
    if estimate["upper_bound_usd"] > COST_CAP_USD:
        _fail("cost_cap_exceeded", "Безопасная верхняя оценка стоимости превышает $0.05.", 409)
    return estimate


def estimate_request_cost(request: Mapping[str, Any] | ValidatedPilotRequest) -> dict[str, Any]:
    validated = request if isinstance(request, ValidatedPilotRequest) else validate_pilot_request(request)
    return estimate_validated_request_cost(validated)


def normalize_provider_usage(value: object) -> dict[str, Any] | None:
    if not isinstance(value, Mapping):
        return None
    input_tokens = _non_negative_int(value.get("input_tokens"))
    output_tokens = _non_negative_int(value.get("output_tokens"))
    total_tokens = _non_negative_int(value.get("total_tokens"))
    if input_tokens is None or output_tokens is None or total_tokens is None or total_tokens != input_tokens + output_tokens:
        return None
    input_details = value.get("input_tokens_details") if isinstance(value.get("input_tokens_details"), Mapping) else {}
    output_details = value.get("output_tokens_details") if isinstance(value.get("output_tokens_details"), Mapping) else {}
    cached_tokens = _non_negative_int(input_details.get("cached_tokens")) or 0
    cache_write_tokens = _non_negative_int(input_details.get("cache_write_tokens")) or 0
    reasoning_tokens = _non_negative_int(output_details.get("reasoning_tokens")) or 0
    if cached_tokens + cache_write_tokens > input_tokens or reasoning_tokens > output_tokens:
        return None
    return {
        "input_tokens": input_tokens,
        "cached_input_tokens": cached_tokens,
        "cache_write_tokens": cache_write_tokens,
        "output_tokens": output_tokens,
        "reasoning_tokens": reasoning_tokens,
        "total_tokens": total_tokens,
    }


def calculate_actual_cost_usd(usage: Mapping[str, Any]) -> Decimal:
    input_tokens = int(usage["input_tokens"])
    cached_tokens = int(usage["cached_input_tokens"])
    cache_write_tokens = int(usage["cache_write_tokens"])
    output_tokens = int(usage["output_tokens"])
    ordinary_input_tokens = input_tokens - cached_tokens - cache_write_tokens
    cost = (
        Decimal(ordinary_input_tokens) * INPUT_USD_PER_MILLION
        + Decimal(cached_tokens) * CACHED_INPUT_USD_PER_MILLION
        + Decimal(cache_write_tokens) * CACHE_WRITE_USD_PER_MILLION
        + Decimal(output_tokens) * OUTPUT_USD_PER_MILLION
    ) / Decimal(1_000_000)
    return cost.quantize(Decimal("0.000001"), rounding=ROUND_CEILING)


def build_validated_pilot_responses_api_request(
    request: ValidatedPilotRequest,
    settings: VisionGatewaySettings,
) -> dict[str, Any]:
    validated = _require_validated_pilot_request(request)
    if settings.provider != DEFAULT_PROVIDER or settings.model != DEFAULT_MODEL:
        _fail("provider_model_not_allowed", "Настройка сервера анализа не разрешена.", 409)
    assert_pilot_configuration_cost_safe()
    estimate = estimate_validated_request_cost(validated)
    if estimate["upper_bound_usd"] > COST_CAP_USD:
        _fail("cost_cap_exceeded", "Безопасная верхняя оценка стоимости превышает $0.05.", 409)
    image = validated.sanitized_image
    return {
        "model": DEFAULT_MODEL,
        "service_tier": "default",
        "store": PROVIDER_STORE,
        "background": PROVIDER_BACKGROUND,
        "stream": PROVIDER_STREAM,
        "truncation": "disabled",
        "reasoning": {"effort": REASONING_EFFORT},
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "tools": list(PROVIDER_TOOLS),
        "input": [
            {
                "role": "developer",
                "content": [{"type": "input_text", "text": _developer_instruction()}],
            },
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": _provider_text_context(validated)},
                    {
                        "type": "input_image",
                        "detail": IMAGE_DETAIL,
                        "image_url": f"data:{SANITIZED_MIME_TYPE};base64,{image.content_base64}",
                    },
                ],
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "yarnai_garment_photo_pilot_v1",
                "strict": True,
                "schema": deepcopy(GARMENT_PILOT_JSON_SCHEMA),
            }
        },
    }


def build_pilot_responses_api_request(
    request: Mapping[str, Any] | ValidatedPilotRequest,
    settings: VisionGatewaySettings,
) -> dict[str, Any]:
    validated = request if isinstance(request, ValidatedPilotRequest) else validate_pilot_request(request)
    return build_validated_pilot_responses_api_request(validated, settings)


def _developer_instruction() -> str:
    return (
        "Анализируй только изделие, которое непосредственно видно на одной очищенной фотографии. "
        "Отделяй видимые признаки от предположений и неизвестного. Все пользовательские тексты ответа пиши только по-русски, "
        "коротко, простыми словами для человека без технической подготовки. Названия ровно двух или трёх действительно разных "
        "вариантов технологии тоже пиши по-русски. Английский профессиональный термин допустим только при необходимости и при первом "
        "упоминании сразу с коротким русским объяснением в скобках, например: fully-fashioned (вязание деталей точно по форме). "
        "Кратко описывай изделие, конструкцию и подходящие техники; в visualEvidence объясняй связь с видимыми признаками, "
        "а в alternativeExplanation честно указывай ограничение, риск или другое возможное объяснение. Причины неопределённости, "
        "то, что нельзя установить по фото, и вопросы для уточнения также пиши кратко и по-русски. Не обещай точность, которую нельзя "
        "получить по одной фотографии. Не заявляй количество петель и рядов, размеры, плотность, расход и точный состав пряжи, авторство "
        "или восстановление оригинальной схемы. Машинные ключи, stable ID и enum-значения сохраняй по строгой схеме; новых полей не добавляй."
    )


def _provider_text_context(request: ValidatedPilotRequest) -> str:
    validated = _require_validated_pilot_request(request)
    return json.dumps(
        {
            "purpose": "Предложить честные варианты технологии для визуально похожего вязаного изделия простыми русскими словами.",
            "userClarifications": validated.clarifications_list(),
            "requiredForbiddenExactClaims": sorted(FORBIDDEN_EXACT_CLAIMS),
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )


def extract_structured_output(response: Mapping[str, Any]) -> dict[str, Any]:
    status = response.get("status")
    if status == "incomplete":
        _fail("provider_response_incomplete", "Сервер анализа вернул незавершённый ответ. Повтор автоматически не выполняется.", 502)
    if status != "completed" or response.get("model") != DEFAULT_MODEL:
        _fail("provider_response_failed", "Сервер анализа не вернул завершённый ответ разрешённой модели.", 502)
    texts: list[str] = []
    for output in response.get("output", []):
        if not isinstance(output, Mapping) or output.get("type") != "message":
            continue
        for content in output.get("content", []):
            if isinstance(content, Mapping) and content.get("type") == "refusal":
                _fail("provider_refusal", "Модель отказалась анализировать фотографию. Повтор автоматически не выполняется.", 422)
            if isinstance(content, Mapping) and content.get("type") == "output_text" and isinstance(content.get("text"), str):
                texts.append(content["text"])
    if len(texts) != 1:
        _fail("provider_response_malformed", "Сервер анализа вернул повреждённый ответ.", 502)
    try:
        parsed = json.loads(texts[0])
    except json.JSONDecodeError as error:
        raise GarmentReferenceError("provider_response_malformed", "Сервер анализа вернул повреждённый JSON.", status_code=502) from error
    if not isinstance(parsed, Mapping):
        _fail("provider_response_malformed", "Сервер анализа вернул повреждённый JSON.", 502)
    return dict(parsed)


def validate_validated_pilot_provider_response(
    payload: object,
    request: ValidatedPilotRequest,
    settings: VisionGatewaySettings,
) -> dict[str, Any]:
    validated_request = _require_validated_pilot_request(request)
    value = _strict_mapping(
        payload,
        required={"visibleObservations", "uncertainObservations", "technologyOptions", "cannotDetermineFromPhoto", "clarifyingQuestions", "forbiddenExactClaims"},
        code="provider_response_schema_invalid",
    )
    all_ids: set[str] = set()
    visible: list[dict[str, Any]] = []
    for raw in _pilot_array(value["visibleObservations"], "visibleObservations", 1, 20):
        item = _strict_mapping(raw, required={"id", "description", "visualEvidence"}, code="provider_response_schema_invalid")
        item_id = _pilot_unique_id(item["id"], all_ids)
        visible.append({"id": item_id, "description": _pilot_text(item["description"], "description", 2_000), "visualEvidence": _pilot_text(item["visualEvidence"], "visualEvidence", 2_000)})
    uncertain: list[dict[str, Any]] = []
    for raw in _pilot_array(value["uncertainObservations"], "uncertainObservations", 1, 20):
        item = _strict_mapping(raw, required={"id", "possibleInterpretations", "uncertaintyReason", "clarificationMethod", "confidence"}, code="provider_response_schema_invalid")
        item_id = _pilot_unique_id(item["id"], all_ids)
        if item["confidence"] not in {"low", "medium", "high"}:
            _fail("provider_response_schema_invalid", "Confidence должен быть low, medium или high.")
        uncertain.append({
            "id": item_id,
            "possibleInterpretations": _pilot_text_list(item["possibleInterpretations"], "possibleInterpretations", 2, 5, 1_000),
            "uncertaintyReason": _pilot_text(item["uncertaintyReason"], "uncertaintyReason", 2_000),
            "clarificationMethod": _pilot_text(item["clarificationMethod"], "clarificationMethod", 2_000),
            "confidence": item["confidence"],
        })
    observation_ids = {item["id"] for item in visible} | {item["id"] for item in uncertain}
    options: list[dict[str, Any]] = []
    for raw in _pilot_array(value["technologyOptions"], "technologyOptions", 2, 3):
        item = _strict_mapping(raw, required={"id", "name", "construction", "knittingDirection", "suggestedTechniques", "observationIds", "visualEvidence", "alternativeExplanation", "confidence"}, code="provider_response_schema_invalid")
        item_id = _pilot_unique_id(item["id"], all_ids)
        if item["confidence"] not in {"low", "medium", "high"}:
            _fail("provider_response_schema_invalid", "Confidence должен быть low, medium или high.")
        references = _pilot_text_list(item["observationIds"], "observationIds", 1, 20, 200)
        if any(reference not in observation_ids for reference in references):
            _fail("provider_response_evidence_mismatch", "Вариант технологии ссылается на неизвестное наблюдение.")
        options.append({
            "id": item_id,
            "name": _pilot_text(item["name"], "name", 300),
            "construction": _pilot_text(item["construction"], "construction", 3_000),
            "knittingDirection": _pilot_text(item["knittingDirection"], "knittingDirection", 1_000),
            "suggestedTechniques": _pilot_text_list(item["suggestedTechniques"], "suggestedTechniques", 1, 12, 1_000),
            "observationIds": references,
            "visualEvidence": _pilot_text(item["visualEvidence"], "visualEvidence", 2_000),
            "alternativeExplanation": _pilot_text(item["alternativeExplanation"], "alternativeExplanation", 2_000),
            "confidence": item["confidence"],
        })
    cannot_determine = []
    for raw in _pilot_array(value["cannotDetermineFromPhoto"], "cannotDetermineFromPhoto", 1, 20):
        item = _strict_mapping(raw, required={"feature", "reason"}, code="provider_response_schema_invalid")
        cannot_determine.append({"feature": _pilot_text(item["feature"], "feature", 1_000), "reason": _pilot_text(item["reason"], "reason", 2_000)})
    questions = []
    for raw in _pilot_array(value["clarifyingQuestions"], "clarifyingQuestions", 1, 12):
        item = _strict_mapping(raw, required={"question", "reason", "distinguishes"}, code="provider_response_schema_invalid")
        questions.append({
            "question": _pilot_text(item["question"], "question", 1_000),
            "reason": _pilot_text(item["reason"], "reason", 2_000),
            "distinguishes": _pilot_text_list(item["distinguishes"], "distinguishes", 2, 5, 1_000),
        })
    forbidden = _pilot_text_list(value["forbiddenExactClaims"], "forbiddenExactClaims", len(FORBIDDEN_EXACT_CLAIMS), len(FORBIDDEN_EXACT_CLAIMS), 100)
    if set(forbidden) != FORBIDDEN_EXACT_CLAIMS:
        _fail("provider_response_forbidden_claim_boundary_missing", "Ответ не подтвердил все запреты на точные утверждения.")
    normalized = {
        "contract_version": CONTRACT_VERSION,
        "pilot_schema_version": PILOT_SCHEMA_VERSION,
        "request_id": validated_request.request_id,
        "source_identity": validated_request.source_identity_dict(),
        "provider": {"provider": settings.provider, "model": settings.model},
        "sanitized_photo_sha256": validated_request.sanitized_image.sha256,
        "visibleObservations": visible,
        "uncertainObservations": uncertain,
        "technologyOptions": options,
        "cannotDetermineFromPhoto": cannot_determine,
        "clarifyingQuestions": questions,
        "forbiddenExactClaims": sorted(FORBIDDEN_EXACT_CLAIMS),
    }
    _reject_forbidden_exact_claims(normalized)
    return normalized


def validate_pilot_provider_response(
    payload: object,
    request: Mapping[str, Any] | ValidatedPilotRequest,
    settings: VisionGatewaySettings,
) -> dict[str, Any]:
    validated = request if isinstance(request, ValidatedPilotRequest) else validate_pilot_request(request)
    return validate_validated_pilot_provider_response(payload, validated, settings)


def _reject_forbidden_exact_claims(value: object) -> None:
    text = json.dumps(value, ensure_ascii=False)
    exact_quantity = re.compile(r"(?iu)\b\d+(?:[.,]\d+)?\s*(?:петел(?:ь|и|я)?|петл(?:я|и|ей)?|ряд(?:а|ов)?|см|мм|г(?:рамм(?:а|ов)?)?|метр(?:а|ов)?|stitches?|rows?|grams?|cm|mm)\b")
    gauge = re.compile(r"(?iu)\b\d+\s*[x×]\s*\d+\b")
    restored = re.compile(r"(?iu)(?:восстанов(?:лена|ить|ленная).{0,30}(?:оригинальн|исходн).{0,20}схем|точн.{0,20}авторск.{0,20}схем)")
    if exact_quantity.search(text) or gauge.search(text) or restored.search(text):
        _fail("provider_response_forbidden_exact_claim", "Ответ содержит запрещённое точное утверждение.")


def _authorization_binding(request: Mapping[str, Any] | ValidatedPilotRequest) -> dict[str, Any]:
    if isinstance(request, ValidatedPilotRequest):
        image = request.sanitized_image
        source_identity = request.source_identity_dict()
        source_identity.pop("request_fingerprint")
        return {
            "request_id": request.request_id,
            "source_identity": source_identity,
            "source_photo_id": request.source_photo_id,
            "source_photo_sha256": request.source_photo_sha256,
            "sanitized_photo_sha256": image.sha256,
            "sanitized_width": image.width,
            "sanitized_height": image.height,
            "sanitized_byte_size": len(image.image_bytes),
            "provider": DEFAULT_PROVIDER,
            "model": DEFAULT_MODEL,
            "endpoint": RESPONSES_ENDPOINT_PATH,
            "retries": PROVIDER_RETRIES,
            "store": PROVIDER_STORE,
            "background": PROVIDER_BACKGROUND,
            "stream": PROVIDER_STREAM,
            "web_search": PROVIDER_WEB_SEARCH,
            "tools": list(PROVIDER_TOOLS),
            "cost_cap_usd": str(COST_CAP_USD),
        }
    sanitized_sha = request.get("sanitized_photo_sha256")
    sanitized_width = request.get("sanitized_width")
    sanitized_height = request.get("sanitized_height")
    sanitized_byte_size = request.get("sanitized_byte_size")
    if sanitized_sha is None and isinstance(request.get("sanitized_image"), Mapping):
        image = request["sanitized_image"]
        sanitized_sha = image.get("sha256")
        sanitized_width = image.get("width")
        sanitized_height = image.get("height")
        content = image.get("content_base64")
        if isinstance(content, str):
            try:
                sanitized_byte_size = len(base64.b64decode(content, validate=True))
            except (binascii.Error, ValueError):
                sanitized_byte_size = None
    raw_identity = request.get("source_identity")
    source_identity = None
    if isinstance(raw_identity, Mapping):
        source_identity = {
            "project_id": raw_identity.get("project_id"),
            "project_revision": raw_identity.get("project_revision"),
            "reference_photos": deepcopy(raw_identity.get("reference_photos")),
        }
    return {
        "request_id": request.get("request_id"),
        "source_identity": source_identity,
        "source_photo_id": request.get("source_photo_id"),
        "source_photo_sha256": request.get("source_photo_sha256"),
        "sanitized_photo_sha256": sanitized_sha,
        "sanitized_width": sanitized_width,
        "sanitized_height": sanitized_height,
        "sanitized_byte_size": sanitized_byte_size,
        "provider": request.get("provider", DEFAULT_PROVIDER),
        "model": request.get("model", DEFAULT_MODEL),
        "endpoint": request.get("endpoint", RESPONSES_ENDPOINT_PATH),
        "retries": request.get("retries", PROVIDER_RETRIES),
        "store": request.get("store", PROVIDER_STORE),
        "background": request.get("background", PROVIDER_BACKGROUND),
        "stream": request.get("stream", PROVIDER_STREAM),
        "web_search": request.get("web_search", PROVIDER_WEB_SEARCH),
        "tools": deepcopy(request.get("tools", list(PROVIDER_TOOLS))),
        "cost_cap_usd": str(request.get("cost_cap_usd", COST_CAP_USD)),
    }


def _non_negative_int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def _safe_audit_text(value: object, maximum: int) -> str | None:
    if not isinstance(value, str):
        return None
    return value[:maximum]


def _pilot_array(value: object, field: str, minimum: int, maximum: int) -> list[Any]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        _fail("provider_response_schema_invalid", f"{field} выходит за границы строгой schema.")
    return value


def _pilot_text(value: object, field: str, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        _fail("provider_response_schema_invalid", f"{field} выходит за границы строгой schema.")
    return value.strip()


def _pilot_text_list(value: object, field: str, minimum: int, maximum: int, text_maximum: int) -> list[str]:
    values = [_pilot_text(item, field, text_maximum) for item in _pilot_array(value, field, minimum, maximum)]
    if len(values) != len(set(values)):
        _fail("provider_response_schema_invalid", f"{field} содержит повтор.")
    return values


def _pilot_identifier(value: object, field: str) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        _fail("pilot_request_schema_invalid", f"{field} имеет неверный формат.")
    return value


def _pilot_unique_id(value: object, seen: set[str]) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value) or value in seen:
        _fail("provider_response_schema_invalid", "Stable ID имеет неверный формат или повторяется.")
    seen.add(value)
    return value


def validate_analysis_request(payload: object) -> dict[str, Any]:
    value = _strict_mapping(
        payload,
        required={"contract_version", "request_id", "project_id", "project_revision", "reference_photos", "user_clarifications", "request_fingerprint"},
        code="analysis_request_schema_invalid",
    )
    if value["contract_version"] != CONTRACT_VERSION:
        _fail("analysis_request_schema_invalid", "Unsupported garment-reference contract.")
    _identifier(value["request_id"], "request_id")
    if not isinstance(value["project_id"], str) or not _UUID_V7.fullmatch(value["project_id"]):
        _fail("analysis_request_schema_invalid", "project_id is invalid.")
    if not isinstance(value["project_revision"], int) or isinstance(value["project_revision"], bool) or value["project_revision"] < 1:
        _fail("analysis_request_schema_invalid", "project_revision is invalid.")
    if not isinstance(value["request_fingerprint"], str) or not _FINGERPRINT.fullmatch(value["request_fingerprint"]):
        _fail("analysis_request_schema_invalid", "request_fingerprint is invalid.")
    photos = _array(value["reference_photos"], "reference_photos", minimum=1, maximum=12)
    seen_ids: set[str] = set()
    seen_hashes: set[str] = set()
    for photo in photos:
        item = _strict_mapping(photo, required={"photo_id", "sha256", "mime_type", "purpose", "content_base64"}, code="analysis_request_schema_invalid")
        if not isinstance(item["photo_id"], str) or not _UUID_V7.fullmatch(item["photo_id"]):
            _fail("analysis_photo_identity_invalid", "Reference photo id is invalid.")
        if not isinstance(item["sha256"], str) or not _SHA256.fullmatch(item["sha256"]):
            _fail("analysis_photo_identity_invalid", "Reference photo SHA-256 is invalid.")
        if item["mime_type"] not in SAFE_MIME_TYPES or item["purpose"] != PHOTO_PURPOSE:
            _fail("analysis_photo_purpose_invalid", "Reference photo purpose or MIME is invalid.")
        content = item["content_base64"]
        if not isinstance(content, str) or not content or len(content) > 28_000_000:
            _fail("analysis_photo_content_invalid", "Reference photo content is invalid.")
        try:
            decoded = base64.b64decode(content, validate=True)
        except (binascii.Error, ValueError):
            _fail("analysis_photo_content_invalid", "Reference photo content is not valid base64.")
        if hashlib.sha256(decoded).hexdigest() != item["sha256"]:
            _fail("analysis_photo_sha256_mismatch", "Reference photo bytes do not match SHA-256.", 409)
        if item["photo_id"] in seen_ids or item["sha256"] in seen_hashes:
            _fail("analysis_photo_duplicate", "Duplicate reference photo is not allowed.", 409)
        seen_ids.add(item["photo_id"])
        seen_hashes.add(item["sha256"])
    clarifications = _array(value["user_clarifications"], "user_clarifications", minimum=0, maximum=100)
    for clarification in clarifications:
        item = _strict_mapping(clarification, required={"clarification_id", "type", "text", "target_observation_id"}, code="analysis_request_schema_invalid")
        _identifier(item["clarification_id"], "clarification_id")
        if item["type"] not in {"free_text", "observation_correction", "desired_change", "priority", "unseen_detail"}:
            _fail("analysis_request_schema_invalid", "Clarification type is invalid.")
        _bounded_text(item["text"], "text", 4000)
        if item["target_observation_id"] is not None:
            _identifier(item["target_observation_id"], "target_observation_id")
    if value["request_fingerprint"] != calculate_request_fingerprint(value):
        _fail("analysis_request_fingerprint_mismatch", "Request fingerprint does not match request content.", 409)
    return deepcopy(value)


def calculate_request_fingerprint(request: Mapping[str, Any]) -> str:
    """Reproduce the browser FNV-1a fingerprint over the metadata-only request."""

    core = {
        "contract_version": request["contract_version"],
        "request_id": request["request_id"],
        "project_id": request["project_id"],
        "project_revision": request["project_revision"],
        "reference_photos": [
            {
                "photo_id": item["photo_id"],
                "sha256": item["sha256"],
                "mime_type": item["mime_type"],
            }
            for item in request["reference_photos"]
        ],
        "user_clarifications": deepcopy(request["user_clarifications"]),
    }
    source = _canonicalize(core)
    value = 0x811C9DC5
    encoded = source.encode("utf-16le", errors="surrogatepass")
    for index in range(0, len(encoded), 2):
        value ^= encoded[index] | (encoded[index + 1] << 8)
        value = (value * 0x01000193) & 0xFFFFFFFF
    return f"fnv1a32:{value:08x}"


def request_source_identity(request: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "project_id": request["project_id"],
        "project_revision": request["project_revision"],
        "reference_photos": [{"photo_id": item["photo_id"], "sha256": item["sha256"]} for item in request["reference_photos"]],
        "request_fingerprint": request["request_fingerprint"],
    }


def build_responses_api_request(request: Mapping[str, Any], settings: VisionGatewaySettings) -> dict[str, Any]:
    validated = validate_analysis_request(request)
    source = request_source_identity(validated)
    content: list[dict[str, Any]] = [{
        "type": "input_text",
        "text": json.dumps({"contract_version": CONTRACT_VERSION, "source_identity": source, "user_clarifications": validated["user_clarifications"]}, ensure_ascii=False, separators=(",", ":")),
    }]
    for photo in validated["reference_photos"]:
        content.append({"type": "input_image", "image_url": f"data:{photo['mime_type']};base64,{photo['content_base64']}"})
    return {
        "model": settings.model,
        "input": [
            {"role": "developer", "content": [{"type": "input_text", "text": "Separate visible observations, inferences and unknowns. Never reconstruct an exact commercial pattern or invent stitch/row counts. Return only GARMENT_REFERENCE_ANALYSIS_V1 JSON."}]},
            {"role": "user", "content": content},
        ],
    }


def validate_provider_response(payload: object, request: Mapping[str, Any], settings: VisionGatewaySettings) -> dict[str, Any]:
    validated_request = validate_analysis_request(request)
    value = _strict_mapping(payload, required={"contract_version", "source_identity", "provider", "visible_observations", "inferences", "unknowns", "questions", "technology_options"}, code="provider_response_schema_invalid")
    if value["contract_version"] != CONTRACT_VERSION:
        _fail("provider_response_schema_invalid", "Unsupported provider contract.")
    identity = _strict_mapping(value["source_identity"], required={"project_id", "project_revision", "reference_photos", "request_fingerprint"}, code="provider_response_schema_invalid")
    if identity != request_source_identity(validated_request):
        _fail("provider_response_identity_mismatch", "Provider response identity does not match.", 409)
    provider = _strict_mapping(value["provider"], required={"provider", "model"}, code="provider_response_schema_invalid")
    if provider != {"provider": settings.provider, "model": settings.model}:
        _fail("provider_response_model_mismatch", "Provider or model does not match server configuration.", 409)
    photo_ids = {item["photo_id"] for item in validated_request["reference_photos"]}
    observation_ids: set[str] = set()
    for raw in _array(value["visible_observations"], "visible_observations", minimum=0, maximum=40):
        item = _strict_mapping(raw, required={"id", "field", "value", "evidence_photo_ids", "status", "explanation"}, code="provider_response_schema_invalid")
        _unique_id(item["id"], observation_ids)
        if item["status"] != "observed":
            _fail("provider_response_schema_invalid", "Visible observation status must be observed.")
        _identifier(item["field"], "field")
        _bounded_text(item["value"], "value", 2000); _bounded_text(item["explanation"], "explanation", 2000)
        evidence = _text_list(item["evidence_photo_ids"], "evidence_photo_ids", 1, 8, 200)
        if any(reference not in photo_ids for reference in evidence):
            _fail("provider_response_photo_mismatch", "Observation references an unknown photo.")
    inference_ids: set[str] = set()
    for raw in _array(value["inferences"], "inferences", minimum=0, maximum=30):
        item = _strict_mapping(raw, required={"id", "field", "value", "status", "uncertainty", "why_plausible", "confirm_or_reject"}, code="provider_response_schema_invalid")
        _unique_id(item["id"], inference_ids)
        if item["status"] != "inferred" or item["uncertainty"] not in {"low", "medium", "high"}:
            _fail("provider_response_schema_invalid", "Inference status or uncertainty is invalid.")
        for key in ("field", "value", "why_plausible", "confirm_or_reject"):
            _bounded_text(item[key], key, 2000)
    other_ids = set(observation_ids | inference_ids)
    for collection, required, minimum, maximum in (
        ("unknowns", {"id", "field", "explanation"}, 1, 30),
        ("questions", {"id", "text", "reason"}, 0, 20),
    ):
        for raw in _array(value[collection], collection, minimum=minimum, maximum=maximum):
            item = _strict_mapping(raw, required=required, code="provider_response_schema_invalid")
            _unique_id(item["id"], other_ids)
            for key in required - {"id"}:
                _bounded_text(item[key], key, 2000)
    option_ids: set[str] = set()
    for raw in _array(value["technology_options"], "technology_options", minimum=1, maximum=3):
        required = {"option_id", "name", "construction_summary", "knitting_direction", "seam_mode", "major_components", "shaping_approach", "yarn_characteristics", "tools_and_techniques", "expected_visual_similarity", "deliberate_differences", "advantages", "risks", "difficulty_explanation", "missing_inputs_before_calculation", "evidence_observation_ids", "assumption_inference_ids"}
        item = _strict_mapping(raw, required=required, code="provider_response_schema_invalid")
        _unique_id(item["option_id"], option_ids)
        for key in ("name", "construction_summary", "knitting_direction", "seam_mode", "shaping_approach", "expected_visual_similarity", "difficulty_explanation"):
            _bounded_text(item[key], key, 4000)
        for key, minimum in (("major_components", 1), ("yarn_characteristics", 1), ("tools_and_techniques", 1), ("deliberate_differences", 0), ("advantages", 1), ("risks", 1), ("missing_inputs_before_calculation", 1)):
            _text_list(item[key], key, minimum, 30, 1000)
        evidence_ids = _text_list(item["evidence_observation_ids"], "evidence_observation_ids", 0, 40, 200)
        assumption_ids = _text_list(item["assumption_inference_ids"], "assumption_inference_ids", 0, 30, 200)
        if any(item_id not in observation_ids for item_id in evidence_ids) or any(item_id not in inference_ids for item_id in assumption_ids):
            _fail("provider_response_evidence_mismatch", "Technology option references unknown evidence.")
    return deepcopy(value)


def _strict_mapping(payload: object, *, required: set[str], code: str) -> dict[str, Any]:
    if not isinstance(payload, Mapping) or any(not isinstance(key, str) for key in payload) or set(payload) != required:
        _fail(code, "JSON object fields do not match the strict contract.")
    return dict(payload)


def _canonicalize(value: Any) -> str:
    if isinstance(value, Mapping):
        return "{" + ",".join(
            f"{json.dumps(key, ensure_ascii=False, separators=(',', ':'))}:{_canonicalize(value[key])}"
            for key in sorted(value)
        ) + "}"
    if isinstance(value, list):
        return "[" + ",".join(_canonicalize(item) for item in value) + "]"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _array(payload: object, field: str, *, minimum: int, maximum: int) -> list[Any]:
    if not isinstance(payload, list) or not minimum <= len(payload) <= maximum:
        _fail("provider_response_schema_invalid" if field not in {"reference_photos", "user_clarifications"} else "analysis_request_schema_invalid", f"{field} is outside the contract.")
    return payload


def _text_list(payload: object, field: str, minimum: int, maximum: int, text_maximum: int) -> list[str]:
    values = [_bounded_text(item, field, text_maximum) for item in _array(payload, field, minimum=minimum, maximum=maximum)]
    if len(set(values)) != len(values):
        _fail("provider_response_schema_invalid", f"{field} contains duplicates.")
    return values


def _bounded_text(value: object, field: str, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        _fail("provider_response_schema_invalid", f"{field} is outside the contract.")
    return value.strip()


def _identifier(value: object, field: str) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        _fail("analysis_request_schema_invalid", f"{field} is invalid.")
    return value


def _unique_id(value: object, seen: set[str]) -> None:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value) or value in seen:
        _fail("provider_response_schema_invalid", "Stable ids must be valid and unique.")
    seen.add(value)


def _fail(code: str, message: str, status_code: int = 422) -> None:
    raise GarmentReferenceError(code, message, status_code=status_code)


def _error_response(error: GarmentReferenceError) -> JSONResponse:
    return JSONResponse({"error": {"code": error.code, "message": error.message}}, status_code=error.status_code)


__all__ = [
    "CONTRACT_VERSION", "COST_CAP_USD", "DISABLED_MESSAGE", "FORBIDDEN_EXACT_CLAIMS",
    "GARMENT_PILOT_JSON_SCHEMA", "GarmentReferenceError", "GarmentReferenceGateway",
    "GarmentReferenceHttpApi", "MAX_OUTPUT_TOKENS", "OpenAIResponsesAdapter", "PHOTO_PURPOSE",
    "PILOT_NOT_RUN_MESSAGE", "PilotAuthorization", "SqlitePilotAuthorizationStore",
    "ValidatedPilotRequest", "build_pilot_responses_api_request",
    "build_validated_pilot_responses_api_request", "build_responses_api_request", "calculate_request_fingerprint",
    "assert_pilot_configuration_cost_safe", "estimate_image_tokens", "estimate_pilot_configuration_cost",
    "estimate_request_cost", "estimate_validated_request_cost", "extract_structured_output",
    "request_source_identity", "validate_analysis_request", "validate_pilot_provider_response",
    "validate_pilot_request", "validate_provider_response", "validate_sanitized_png",
    "validate_validated_pilot_provider_response",
]
