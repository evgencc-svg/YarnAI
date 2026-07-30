"""Runtime configuration for the YarnAI HTTP service."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
import os
from urllib.parse import urlsplit


DEFAULT_HTTP_HOST = "127.0.0.1"
DEFAULT_HTTP_PORT = 8000
DEFAULT_LOG_LEVEL = "info"
HTTP_HOST_ENVIRONMENT_VARIABLE = "YARNAI_HOST"
LOG_LEVEL_ENVIRONMENT_VARIABLE = "YARNAI_LOG_LEVEL"
VALID_LOG_LEVELS = frozenset(
    {"critical", "error", "warning", "info", "debug"}
)
VALID_COOKIE_SAMESITE = frozenset({"lax", "strict"})


def _integer(
    environment: Mapping[str, str],
    name: str,
    default: int,
    *,
    minimum: int = 1,
    maximum: int | None = None,
) -> int:
    raw_value = environment.get(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if value < minimum or (maximum is not None and value > maximum):
        bounds = f"between {minimum} and {maximum}" if maximum else f"at least {minimum}"
        raise ValueError(f"{name} must be {bounds}")
    return value


def _boolean(
    environment: Mapping[str, str],
    name: str,
    default: bool,
) -> bool:
    raw_value = environment.get(name, str(default)).strip().lower()
    if raw_value in {"1", "true", "yes", "on"}:
        return True
    if raw_value in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false")


def _secret(
    environment: Mapping[str, str],
    name: str,
) -> str | None:
    value = environment.get(name, "").strip()
    if value and len(value.encode("utf-8")) < 32:
        raise ValueError(f"{name} must contain at least 32 bytes")
    return value or None


def _allowed_origins(environment: Mapping[str, str]) -> tuple[str, ...]:
    origins = tuple(
        origin.strip()
        for origin in environment.get("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    )
    for origin in origins:
        parsed = urlsplit(origin)
        if (
            origin == "*"
            or parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path
            or parsed.query
            or parsed.fragment
            or parsed.username
            or parsed.password
        ):
            raise ValueError(
                "ALLOWED_ORIGINS must contain exact HTTP(S) origins "
                "without wildcards, credentials, paths, queries, or fragments"
            )
    return origins


@dataclass(frozen=True, slots=True)
class RuntimeSettings:
    """Validated settings used by the supported production command."""

    host: str
    port: int
    log_level: str
    database_url: str | None = None
    jwt_access_secret: str | None = None
    refresh_token_secret: str | None = None
    access_token_ttl_seconds: int = 600
    refresh_token_ttl_seconds: int = 2_592_000
    auth_issuer: str = "yarnai"
    auth_audience: str = "yarnai-web"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    allowed_origins: tuple[str, ...] = ()
    trusted_proxy_ips: tuple[str, ...] = ()
    argon2_time_cost: int = 3
    argon2_memory_cost_kib: int = 65_536
    argon2_parallelism: int = 4
    max_request_body_bytes: int = 1_048_576
    max_project_payload_bytes: int = 524_288
    max_json_depth: int = 32
    max_active_sessions: int = 10

    @classmethod
    def from_environment(
        cls,
        environ: Mapping[str, str] | None = None,
    ) -> RuntimeSettings:
        """Read only the environment variables used by the HTTP runtime."""

        environment = os.environ if environ is None else environ
        host = environment.get(
            HTTP_HOST_ENVIRONMENT_VARIABLE,
            DEFAULT_HTTP_HOST,
        ).strip()
        if not host:
            raise ValueError(
                f"{HTTP_HOST_ENVIRONMENT_VARIABLE} must not be empty"
            )

        port = _integer(
            environment,
            "PORT",
            DEFAULT_HTTP_PORT,
            maximum=65_535,
        )

        log_level = environment.get(
            LOG_LEVEL_ENVIRONMENT_VARIABLE,
            DEFAULT_LOG_LEVEL,
        ).strip().lower()
        if log_level not in VALID_LOG_LEVELS:
            allowed = ", ".join(sorted(VALID_LOG_LEVELS))
            raise ValueError(
                f"{LOG_LEVEL_ENVIRONMENT_VARIABLE} must be one of: {allowed}"
            )

        database_url = environment.get("DATABASE_URL", "").strip() or None
        supported_database_prefixes = (
            "postgres://",
            "postgresql://",
            "postgresql+psycopg://",
            "sqlite://",
            "sqlite+pysqlite://",
        )
        if database_url and not database_url.startswith(supported_database_prefixes):
            raise ValueError("DATABASE_URL must use PostgreSQL")
        allow_test_adapter = _boolean(
            environment,
            "YARNAI_ALLOW_TEST_DATABASE_ADAPTER",
            False,
        )
        if database_url and database_url.startswith("sqlite") and not allow_test_adapter:
            raise ValueError("SQLite is allowed only as an explicit test adapter")
        jwt_access_secret = _secret(environment, "JWT_ACCESS_SECRET")
        refresh_token_secret = _secret(environment, "REFRESH_TOKEN_SECRET")
        account_configuration = (
            database_url,
            jwt_access_secret,
            refresh_token_secret,
        )
        if any(account_configuration) and not all(account_configuration):
            raise ValueError(
                "DATABASE_URL, JWT_ACCESS_SECRET, and REFRESH_TOKEN_SECRET "
                "must be configured together"
            )

        cookie_samesite = environment.get("COOKIE_SAMESITE", "lax").strip().lower()
        if cookie_samesite not in VALID_COOKIE_SAMESITE:
            raise ValueError("COOKIE_SAMESITE must be lax or strict")

        return cls(
            host=host,
            port=port,
            log_level=log_level,
            database_url=database_url,
            jwt_access_secret=jwt_access_secret,
            refresh_token_secret=refresh_token_secret,
            access_token_ttl_seconds=_integer(
                environment, "ACCESS_TOKEN_TTL_SECONDS", 600, maximum=3_600
            ),
            refresh_token_ttl_seconds=_integer(
                environment,
                "REFRESH_TOKEN_TTL_SECONDS",
                2_592_000,
                maximum=31_536_000,
            ),
            auth_issuer=environment.get("AUTH_ISSUER", "yarnai").strip() or "yarnai",
            auth_audience=environment.get(
                "AUTH_AUDIENCE", "yarnai-web"
            ).strip() or "yarnai-web",
            cookie_secure=_boolean(environment, "COOKIE_SECURE", False),
            cookie_samesite=cookie_samesite,
            allowed_origins=_allowed_origins(environment),
            trusted_proxy_ips=tuple(
                value.strip()
                for value in environment.get("TRUSTED_PROXY_IPS", "").split(",")
                if value.strip()
            ),
            argon2_time_cost=_integer(
                environment, "ARGON2_TIME_COST", 3, maximum=10
            ),
            argon2_memory_cost_kib=_integer(
                environment,
                "ARGON2_MEMORY_COST_KIB",
                65_536,
                minimum=8_192,
                maximum=1_048_576,
            ),
            argon2_parallelism=_integer(
                environment, "ARGON2_PARALLELISM", 4, maximum=16
            ),
            max_request_body_bytes=_integer(
                environment,
                "MAX_REQUEST_BODY_BYTES",
                1_048_576,
                minimum=4_096,
                maximum=10_485_760,
            ),
            max_project_payload_bytes=_integer(
                environment,
                "MAX_PROJECT_PAYLOAD_BYTES",
                524_288,
                minimum=1_024,
                maximum=5_242_880,
            ),
            max_json_depth=_integer(
                environment, "MAX_JSON_DEPTH", 32, maximum=128
            ),
            max_active_sessions=_integer(
                environment, "MAX_ACTIVE_SESSIONS", 10, maximum=100
            ),
        )

    @property
    def accounts_enabled(self) -> bool:
        return bool(
            self.database_url
            and self.jwt_access_secret
            and self.refresh_token_secret
        )
