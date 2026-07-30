"""Runtime configuration for the YarnAI HTTP service."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
import os


DEFAULT_HTTP_HOST = "127.0.0.1"
DEFAULT_HTTP_PORT = 8000
DEFAULT_LOG_LEVEL = "info"
HTTP_HOST_ENVIRONMENT_VARIABLE = "YARNAI_HOST"
LOG_LEVEL_ENVIRONMENT_VARIABLE = "YARNAI_LOG_LEVEL"
VALID_LOG_LEVELS = frozenset(
    {"critical", "error", "warning", "info", "debug"}
)


@dataclass(frozen=True, slots=True)
class RuntimeSettings:
    """Validated settings used by the supported production command."""

    host: str
    port: int
    log_level: str

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

        raw_port = environment.get("PORT", str(DEFAULT_HTTP_PORT))
        try:
            port = int(raw_port)
        except ValueError as error:
            raise ValueError("PORT must be an integer") from error
        if not 1 <= port <= 65535:
            raise ValueError("PORT must be between 1 and 65535")

        log_level = environment.get(
            LOG_LEVEL_ENVIRONMENT_VARIABLE,
            DEFAULT_LOG_LEVEL,
        ).strip().lower()
        if log_level not in VALID_LOG_LEVELS:
            allowed = ", ".join(sorted(VALID_LOG_LEVELS))
            raise ValueError(
                f"{LOG_LEVEL_ENVIRONMENT_VARIABLE} must be one of: {allowed}"
            )

        return cls(host=host, port=port, log_level=log_level)
