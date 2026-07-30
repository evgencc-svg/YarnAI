"""Authentication, token, validation, and abuse-control primitives."""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
import unicodedata
from typing import Any

from argon2 import PasswordHasher
from argon2.low_level import Type
import jwt

from yarnai.config import RuntimeSettings


EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+"
    r"[A-Za-z]{2,63}$"
)
UUID_V7_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
IDEMPOTENCY_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def uuid7() -> str:
    timestamp = int(time.time() * 1000)
    random_bytes = bytearray(secrets.token_bytes(10))
    value = bytearray(timestamp.to_bytes(6, "big") + random_bytes)
    value[6] = 0x70 | (value[6] & 0x0F)
    value[8] = 0x80 | (value[8] & 0x3F)
    hexadecimal = value.hex()
    return (
        f"{hexadecimal[:8]}-{hexadecimal[8:12]}-{hexadecimal[12:16]}-"
        f"{hexadecimal[16:20]}-{hexadecimal[20:]}"
    )


def normalize_email(value: Any) -> tuple[str, str]:
    if not isinstance(value, str):
        raise ValueError("Email must be a string.")
    email = unicodedata.normalize("NFC", value).strip()
    if len(email) > 320 or not EMAIL_PATTERN.fullmatch(email):
        raise ValueError("Enter a valid email address.")
    local, domain = email.rsplit("@", 1)
    normalized = f"{local.casefold()}@{domain.casefold()}"
    return email, normalized


def validate_password(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("Password must be a string.")
    if len(value) < 12 or len(value) > 1024:
        raise ValueError("Password must contain between 12 and 1024 characters.")
    categories = sum(
        bool(pattern.search(value))
        for pattern in (
            re.compile(r"[a-z]"),
            re.compile(r"[A-Z]"),
            re.compile(r"\d"),
            re.compile(r"[^A-Za-z0-9]"),
        )
    )
    if categories < 3:
        raise ValueError(
            "Password must include at least three of: lowercase, uppercase, "
            "number, symbol."
        )
    return value


def validate_json_depth(value: Any, maximum: int) -> None:
    stack: list[tuple[Any, int]] = [(value, 1)]
    while stack:
        current, depth = stack.pop()
        if depth > maximum:
            raise ValueError("JSON nesting is too deep.")
        if isinstance(current, dict):
            stack.extend((entry, depth + 1) for entry in current.values())
        elif isinstance(current, list):
            stack.extend((entry, depth + 1) for entry in current)


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


class SecurityService:
    def __init__(self, settings: RuntimeSettings) -> None:
        if not settings.jwt_access_secret or not settings.refresh_token_secret:
            raise ValueError("Authentication secrets are not configured")
        self.settings = settings
        self.password_hasher = PasswordHasher(
            time_cost=settings.argon2_time_cost,
            memory_cost=settings.argon2_memory_cost_kib,
            parallelism=settings.argon2_parallelism,
            hash_len=32,
            salt_len=16,
            type=Type.ID,
        )
        self._dummy_password_hash = self.password_hasher.hash(
            "YarnAI dummy password 7!"
        )

    def hash_password(self, password: str) -> str:
        return self.password_hasher.hash(password)

    def verify_password(self, password_hash: str | None, password: str) -> bool:
        candidate = password_hash or self._dummy_password_hash
        try:
            verified = self.password_hasher.verify(candidate, password)
            return bool(password_hash) and verified
        except Exception:
            return False

    def access_token(self, user_id: str, session_id: str) -> tuple[str, datetime]:
        now = utc_now()
        expires_at = now + timedelta(seconds=self.settings.access_token_ttl_seconds)
        token = jwt.encode(
            {
                "sub": user_id,
                "sid": session_id,
                "iat": int(now.timestamp()),
                "exp": int(expires_at.timestamp()),
                "iss": self.settings.auth_issuer,
                "aud": self.settings.auth_audience,
                "jti": uuid7(),
            },
            self.settings.jwt_access_secret,
            algorithm="HS256",
        )
        return token, expires_at

    def decode_access_token(self, token: str) -> dict[str, Any]:
        return jwt.decode(
            token,
            self.settings.jwt_access_secret,
            algorithms=["HS256"],
            audience=self.settings.auth_audience,
            issuer=self.settings.auth_issuer,
            options={"require": ["sub", "sid", "iat", "exp", "iss", "aud", "jti"]},
        )

    def new_refresh_token(self) -> str:
        return secrets.token_urlsafe(48)

    def new_csrf_token(self) -> str:
        return secrets.token_urlsafe(32)

    def token_hash(self, value: str) -> str:
        return hmac.new(
            self.settings.refresh_token_secret.encode("utf-8"),
            value.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    @staticmethod
    def user_agent_hash(user_agent: str | None) -> str | None:
        if not user_agent:
            return None
        return hashlib.sha256(user_agent.encode("utf-8")).hexdigest()


class InProcessRateLimiter:
    """Fixed-window-compatible limiter that can be replaced by a shared backend."""

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_cleanup = time.monotonic()

    def allow(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            if now - self._last_cleanup >= 60:
                retention_cutoff = now - 900
                for event_key, event_queue in list(self._events.items()):
                    while event_queue and event_queue[0] <= retention_cutoff:
                        event_queue.popleft()
                    if not event_queue:
                        del self._events[event_key]
                self._last_cleanup = now
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(window_seconds - (now - events[0])))
                return False, retry_after
            events.append(now)
            return True, 0
