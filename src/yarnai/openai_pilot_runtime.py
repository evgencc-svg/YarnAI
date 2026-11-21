"""Explicit Windows-only runtime for the authorized YarnAI photo pilot.

This module is never imported by the default app composition. It reads one
exact Generic Credential through CredReadW, keeps it in process memory, and
injects it into the existing garment-reference gateway. Authorization issuance
is a separate one-shot CLI operation that never reads the credential.
"""

from __future__ import annotations

import ctypes
import json
import os
import sys
import uuid
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

import uvicorn
from ctypes import wintypes

from yarnai.garment_reference import (
    COST_CAP_USD,
    GarmentReferenceError,
    GarmentReferenceGateway,
    OpenAIResponsesAdapter,
    PilotAuthorization,
    RESPONSES_ENDPOINT_PATH,
    SqlitePilotAuthorizationStore,
    UrllibJsonTransport,
    assert_pilot_configuration_cost_safe,
)
from yarnai.http import create_app
from yarnai.vision_review import DEFAULT_MODEL, DEFAULT_PROVIDER, VisionGatewaySettings


EXACT_CREDENTIAL_TARGET = "YarnAIOpenAIPilot"
EXACT_CREDENTIAL_USERNAME = "YarnAI"
_CRED_TYPE_GENERIC = 1
PILOT_DATABASE_PATH = Path(__file__).resolve().parents[2] / "tmp" / "openai-garment-pilot-v1.sqlite3"
EXACT_PROJECT_ID = "01a05c3e-a029-7ca7-a949-b8cf5d27e5b0"
EXACT_PROJECT_REVISION = 3
EXACT_PHOTO_ID = "01a05c60-31d1-7416-88ff-7a21959702b1"
EXACT_ORIGINAL_SHA256 = "2fdf50d9b9f8042b0eaf7bb4b80ed7ed3bc0e092b2e370b5723f461a4b574c58"
EXACT_SANITIZED_SHA256 = "5ff571f273ea8d21dc1b09d628b5d89dd1ee07759214fe9c6b98943d8ef780cf"
EXACT_SANITIZED_WIDTH = 1200
EXACT_SANITIZED_HEIGHT = 1600
EXACT_SANITIZED_BYTE_SIZE = 2_043_232
BLOCKED_REQUEST_ID = "pilot-request:c8c4d4ca-996b-4c2b-99f8-930e565bde7e"


class _CREDENTIALW(ctypes.Structure):
    pass


_PCREDENTIALW = ctypes.POINTER(_CREDENTIALW)
_CREDENTIALW._fields_ = [
    ("Flags", wintypes.DWORD),
    ("Type", wintypes.DWORD),
    ("TargetName", wintypes.LPWSTR),
    ("Comment", wintypes.LPWSTR),
    ("LastWritten", wintypes.FILETIME),
    ("CredentialBlobSize", wintypes.DWORD),
    ("CredentialBlob", ctypes.POINTER(ctypes.c_ubyte)),
    ("Persist", wintypes.DWORD),
    ("AttributeCount", wintypes.DWORD),
    ("Attributes", ctypes.c_void_p),
    ("TargetAlias", wintypes.LPWSTR),
    ("UserName", wintypes.LPWSTR),
]


def _read_windows_generic_credential(target: str) -> str:
    if os.name != "nt":
        raise RuntimeError("The secure pilot runtime requires Windows Credential Manager")
    advapi32 = ctypes.WinDLL("Advapi32.dll", use_last_error=True)
    cred_read = advapi32.CredReadW
    cred_read.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(_PCREDENTIALW)]
    cred_read.restype = wintypes.BOOL
    cred_free = advapi32.CredFree
    cred_free.argtypes = [ctypes.c_void_p]
    cred_free.restype = None

    pointer = _PCREDENTIALW()
    if not cred_read(target, _CRED_TYPE_GENERIC, 0, ctypes.byref(pointer)):
        raise RuntimeError("The exact YarnAI pilot credential is unavailable")
    raw = bytearray()
    try:
        credential = pointer.contents
        if credential.Type != _CRED_TYPE_GENERIC or credential.TargetName != target or credential.UserName != EXACT_CREDENTIAL_USERNAME:
            raise RuntimeError("The exact YarnAI pilot credential identity does not match")
        if credential.CredentialBlobSize <= 0 or credential.CredentialBlobSize > 16_384:
            raise RuntimeError("The exact YarnAI pilot credential payload is invalid")
        raw.extend(ctypes.string_at(credential.CredentialBlob, credential.CredentialBlobSize))
        try:
            secret = raw.decode("utf-16-le").rstrip("\x00")
        except UnicodeDecodeError as error:
            raise RuntimeError("The exact YarnAI pilot credential payload is invalid") from error
        if not secret or secret != secret.strip() or "\x00" in secret:
            raise RuntimeError("The exact YarnAI pilot credential payload is invalid")
        return secret
    finally:
        for index in range(len(raw)):
            raw[index] = 0
        cred_free(pointer)


def read_yarnai_pilot_credential(
    target: str,
    *,
    native_reader: Callable[[str], str] | None = None,
) -> str:
    """Read only the fixed owner-authorized credential target."""

    if target != EXACT_CREDENTIAL_TARGET:
        raise RuntimeError("Credential target is not authorized for the YarnAI pilot")
    resolved_reader = native_reader or _read_windows_generic_credential
    return resolved_reader(EXACT_CREDENTIAL_TARGET)


class AwaitingOwnerAuthorizationStore:
    """Enabled gateway store that cannot authorize or consume any request."""

    def pending_request_id(self) -> None:
        return None

    def consume(self, request: Mapping[str, Any]) -> bool:
        del request
        return False


class AwaitingOwnerStateVerifier:
    """Fail closed until a future owner-approved exact binding is injected."""

    def assert_current(self, source_identity: Mapping[str, Any]) -> None:
        del source_identity
        raise GarmentReferenceError(
            "exact_owner_approval_missing",
            "Точное одноразовое разрешение владельца ещё не создано.",
            status_code=409,
        )


class ExactOwnerApprovedStateVerifier:
    """Match only the exact owner-approved project revision and one photo."""

    def assert_current(self, source_identity: Mapping[str, Any]) -> None:
        expected = {
            "project_id": EXACT_PROJECT_ID,
            "project_revision": EXACT_PROJECT_REVISION,
            "reference_photos": [{"photo_id": EXACT_PHOTO_ID, "sha256": EXACT_ORIGINAL_SHA256}],
        }
        actual = {
            "project_id": source_identity.get("project_id"),
            "project_revision": source_identity.get("project_revision"),
            "reference_photos": source_identity.get("reference_photos"),
        }
        if actual != expected:
            raise GarmentReferenceError(
                "exact_owner_approved_identity_mismatch",
                "Project, revision или фотография не совпадают с одноразовым разрешением владельца.",
                status_code=409,
            )


def create_secure_pilot_app(
    *,
    credential_reader: Callable[[str], str] | None = None,
    transport: Any | None = None,
    state_verifier: Any | None = None,
    authorization_store: Any | None = None,
):
    """Compose the existing gateway with an in-memory credential and explicit gates."""

    assert_pilot_configuration_cost_safe()
    if "OPENAI_API_KEY" in os.environ:
        raise RuntimeError("The secure pilot runtime refuses credential environment variables")
    resolved_credential_reader = credential_reader or read_yarnai_pilot_credential
    credential = resolved_credential_reader(EXACT_CREDENTIAL_TARGET)
    adapter = OpenAIResponsesAdapter(credential, transport=transport)
    gateway = GarmentReferenceGateway(
        VisionGatewaySettings(
            provider=DEFAULT_PROVIDER,
            model=DEFAULT_MODEL,
            explicitly_enabled=True,
            credential_configured=True,
        ),
        provider=adapter,
        state_verifier=state_verifier or AwaitingOwnerStateVerifier(),
        authorization_store=authorization_store or AwaitingOwnerAuthorizationStore(),
    )
    return create_app(garment_reference_gateway=gateway)


def issue_exact_owner_authorization(database_path: Path = PILOT_DATABASE_PATH) -> dict[str, Any]:
    """Create exactly one durable authorization without reading any credential."""

    assert_pilot_configuration_cost_safe()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    store = SqlitePilotAuthorizationStore(database_path)
    if store.authorization_rows() or store.audit_summary()["analysis_post_count"] or store.audit_summary()["provider_call_count"]:
        raise RuntimeError("The exact YarnAI pilot authorization database is not empty")
    request_id = f"pilot-request:{uuid.uuid4()}"
    authorization_id = f"pilot-authorization:{uuid.uuid4()}"
    store.issue(
        PilotAuthorization(
            authorization_id=authorization_id,
            request_id=request_id,
            source_identity={
                "project_id": EXACT_PROJECT_ID,
                "project_revision": EXACT_PROJECT_REVISION,
                "reference_photos": [{"photo_id": EXACT_PHOTO_ID, "sha256": EXACT_ORIGINAL_SHA256}],
            },
            source_photo_id=EXACT_PHOTO_ID,
            source_photo_sha256=EXACT_ORIGINAL_SHA256,
            sanitized_photo_sha256=EXACT_SANITIZED_SHA256,
            sanitized_width=EXACT_SANITIZED_WIDTH,
            sanitized_height=EXACT_SANITIZED_HEIGHT,
            sanitized_byte_size=EXACT_SANITIZED_BYTE_SIZE,
            provider=DEFAULT_PROVIDER,
            model=DEFAULT_MODEL,
            endpoint=RESPONSES_ENDPOINT_PATH,
            retries=0,
            store=False,
            background=False,
            stream=False,
            web_search=False,
            tools=(),
            cost_cap_usd=COST_CAP_USD,
        )
    )
    return {
        "authorization_id": authorization_id,
        "request_id": request_id,
        "authorization_count": 1,
        "provider": DEFAULT_PROVIDER,
        "model": DEFAULT_MODEL,
        "endpoint": RESPONSES_ENDPOINT_PATH,
        "retries": 0,
        "store": False,
        "background": False,
        "stream": False,
        "web_search": False,
        "tools": [],
        "cost_cap_usd": str(COST_CAP_USD),
    }


def replace_blocked_owner_authorization(database_path: Path = PILOT_DATABASE_PATH) -> dict[str, Any]:
    """Cancel the known pre-transport request and atomically issue one exact replacement."""

    assert_pilot_configuration_cost_safe()
    store = SqlitePilotAuthorizationStore(database_path)
    request_id = f"pilot-request:{uuid.uuid4()}"
    authorization_id = f"pilot-authorization:{uuid.uuid4()}"
    replacement = PilotAuthorization(
        authorization_id=authorization_id,
        request_id=request_id,
        source_identity={
            "project_id": EXACT_PROJECT_ID,
            "project_revision": EXACT_PROJECT_REVISION,
            "reference_photos": [{"photo_id": EXACT_PHOTO_ID, "sha256": EXACT_ORIGINAL_SHA256}],
        },
        source_photo_id=EXACT_PHOTO_ID,
        source_photo_sha256=EXACT_ORIGINAL_SHA256,
        sanitized_photo_sha256=EXACT_SANITIZED_SHA256,
        sanitized_width=EXACT_SANITIZED_WIDTH,
        sanitized_height=EXACT_SANITIZED_HEIGHT,
        sanitized_byte_size=EXACT_SANITIZED_BYTE_SIZE,
        provider=DEFAULT_PROVIDER,
        model=DEFAULT_MODEL,
        endpoint=RESPONSES_ENDPOINT_PATH,
        retries=0,
        store=False,
        background=False,
        stream=False,
        web_search=False,
        tools=(),
        cost_cap_usd=COST_CAP_USD,
    )
    store.replace_unattempted(
        BLOCKED_REQUEST_ID,
        replacement,
        reason="clean_restart_owner_approval_after_blocked_before_transport",
    )
    return {
        "authorization_id": authorization_id,
        "request_id": request_id,
        "supersedes_request_id": BLOCKED_REQUEST_ID,
        "provider": DEFAULT_PROVIDER,
        "model": DEFAULT_MODEL,
        "endpoint": RESPONSES_ENDPOINT_PATH,
        "retries": 0,
        "store": False,
        "background": False,
        "stream": False,
        "web_search": False,
        "tools": [],
        "cost_cap_usd": str(COST_CAP_USD),
    }


def create_owner_approved_pilot_app(
    *,
    credential_reader: Callable[[str], str] | None = None,
    database_path: Path = PILOT_DATABASE_PATH,
):
    store = SqlitePilotAuthorizationStore(database_path)
    rows = [row for row in store.authorization_rows() if row["status"] == "approved"]
    if len(rows) != 1:
        raise RuntimeError("Exactly one active YarnAI pilot authorization is required")
    request_id = rows[0]["request_id"]
    transport = UrllibJsonTransport(audit=store, request_id=request_id)
    return create_secure_pilot_app(
        credential_reader=credential_reader,
        transport=transport,
        state_verifier=ExactOwnerApprovedStateVerifier(),
        authorization_store=store,
    )


def safe_audit_summary(database_path: Path = PILOT_DATABASE_PATH) -> dict[str, Any]:
    return SqlitePilotAuthorizationStore(database_path).audit_summary()


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if command == "issue-authorization":
        print(json.dumps(issue_exact_owner_authorization(), ensure_ascii=False, sort_keys=True))
        return
    if command == "replace-blocked-authorization":
        print(json.dumps(replace_blocked_owner_authorization(), ensure_ascii=False, sort_keys=True))
        return
    if command == "audit":
        print(json.dumps(safe_audit_summary(), ensure_ascii=False, sort_keys=True))
        return
    if command != "serve":
        raise SystemExit("Expected serve, issue-authorization, replace-blocked-authorization, or audit")
    uvicorn.run(
        create_owner_approved_pilot_app(),
        host="127.0.0.1",
        port=8023,
        log_level="info",
        access_log=True,
        server_header=False,
        workers=1,
    )


if __name__ == "__main__":
    main()
