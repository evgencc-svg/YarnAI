"""HTTP API for the first executable YarnAI function."""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from contextlib import asynccontextmanager
from pathlib import Path
from time import perf_counter
from typing import NoReturn

import uvicorn
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from yarnai import (
    CalculationApplicationError,
    InvalidCalculationRequestError,
    InvalidFirstFunctionInputError,
    first_function_output_to_mapping,
    first_function_request_from_mapping,
    run_first_function,
)
from yarnai.config import RuntimeSettings
from yarnai.cloud_api import CloudApi
from yarnai.database import create_database_engine, create_session_factory
from yarnai.security import uuid7


TECHNICAL_ERROR_MESSAGE = (
    "The calculation could not be completed because of an internal technical error."
)
STATIC_DIRECTORY = Path(__file__).with_name("static")
LOGGER = logging.getLogger("yarnai.http")
STATIC_CACHE_CONTROL = "public, max-age=0, must-revalidate"
DYNAMIC_CACHE_CONTROL = "no-store"
PAGE_CACHE_CONTROL = "no-cache"


class _InvalidJsonError(ValueError):
    """The request body is not a valid JSON document."""


class ProductionHttpMiddleware:
    """Log requests, contain failures, and apply explicit cache policies."""

    def __init__(self, application, *, hsts_enabled: bool = False) -> None:
        self.application = application
        self.hsts_enabled = hsts_enabled

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.application(scope, receive, send)
            return

        method = scope.get("method", "UNKNOWN")
        route = scope.get("path", "")
        request_id = uuid7()
        scope.setdefault("state", {})["request_id"] = request_id
        started_at = perf_counter()
        status_code = 500
        response_started = False

        async def send_with_policy(message) -> None:
            nonlocal response_started, status_code
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                headers = list(message.get("headers", []))
                if not any(
                    name.lower() == b"cache-control" for name, _value in headers
                ):
                    headers.append(
                        (
                            b"cache-control",
                            _cache_control_for(route).encode("ascii"),
                        )
                    )
                security_headers = (
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (
                        b"permissions-policy",
                        b"camera=(), microphone=(), geolocation=()",
                    ),
                    (
                        b"content-security-policy",
                        b"default-src 'self'; script-src 'self'; style-src 'self'; "
                        b"img-src 'self' data: blob:; connect-src 'self'; "
                        b"frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
                    ),
                    (b"x-request-id", request_id.encode("ascii")),
                )
                if self.hsts_enabled:
                    security_headers += (
                        (
                            b"strict-transport-security",
                            b"max-age=31536000; includeSubDomains",
                        ),
                    )
                existing = {name.lower() for name, _value in headers}
                headers.extend(
                    (name, value)
                    for name, value in security_headers
                    if name not in existing
                )
                message["headers"] = headers
            await send(message)

        try:
            await self.application(scope, receive, send_with_policy)
        except Exception as error:
            LOGGER.error(
                "unhandled_exception method=%s route=%s exception_type=%s",
                method,
                route,
                type(error).__name__,
            )
            if response_started:
                raise
            response = _technical_error_response("unexpected_technical_error")
            status_code = response.status_code
            await response(scope, receive, send_with_policy)
        finally:
            elapsed_ms = (perf_counter() - started_at) * 1000
            if status_code >= 500:
                LOGGER.error(
                    "http_5xx method=%s route=%s status=%d duration_ms=%.2f",
                    method,
                    route,
                    status_code,
                    elapsed_ms,
                )
            LOGGER.info(
                "http_request method=%s route=%s status=%d duration_ms=%.2f",
                method,
                route,
                status_code,
                elapsed_ms,
            )


class RequestBodyLimitMiddleware:
    """Reject declared oversized request bodies before they are buffered."""

    def __init__(self, application, maximum_bytes: int) -> None:
        self.application = application
        self.maximum_bytes = maximum_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.application(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        raw_length = headers.get(b"content-length")
        if raw_length:
            try:
                too_large = int(raw_length) > self.maximum_bytes
            except ValueError:
                too_large = True
            if too_large:
                response = _error_response(
                    413,
                    code="REQUEST_TOO_LARGE",
                    message="Request body is too large.",
                )
                await response(scope, receive, send)
                return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.maximum_bytes:
                    scope.setdefault("state", {})["body_too_large"] = True
                    return {
                        "type": "http.request",
                        "body": b"",
                        "more_body": False,
                    }
            return message

        await self.application(scope, limited_receive, send)


def _cache_control_for(route: str) -> str:
    if route.startswith("/static/"):
        return STATIC_CACHE_CONTROL
    if route == "/health" or route.startswith("/api/"):
        return DYNAMIC_CACHE_CONTROL
    return PAGE_CACHE_CONTROL


async def health(_request: Request) -> JSONResponse:
    """Return a minimal process health response."""

    return JSONResponse({"status": "ok"})


async def user_interface(_request: Request) -> FileResponse:
    """Return the intention-first YarnAI start page."""

    return FileResponse(
        STATIC_DIRECTORY / "first-user-flow.html",
        media_type="text/html",
    )


async def width_calculator(_request: Request) -> FileResponse:
    """Return the existing deterministic width calculator."""

    return FileResponse(STATIC_DIRECTORY / "index.html", media_type="text/html")


async def about_first_function(_request: Request) -> FileResponse:
    """Return the user-facing explanation of the first function."""

    return FileResponse(STATIC_DIRECTORY / "about.html", media_type="text/html")


async def canonical_example(_request: Request) -> FileResponse:
    """Return the calculator with the canonical example loaded by JavaScript."""

    return FileResponse(STATIC_DIRECTORY / "index.html", media_type="text/html")


async def smart_start(_request: Request) -> FileResponse:
    """Return the Smart Start workflow page."""

    return FileResponse(
        STATIC_DIRECTORY / "smart-start.html",
        media_type="text/html",
    )


async def step_assistant(_request: Request) -> FileResponse:
    """Return the row-by-row Step Assistant page."""

    return FileResponse(
        STATIC_DIRECTORY / "step-assistant.html",
        media_type="text/html",
    )


async def section_assistant(_request: Request) -> FileResponse:
    """Return the first straight fabric section assistant page."""

    return FileResponse(
        STATIC_DIRECTORY / "section-assistant.html",
        media_type="text/html",
    )


async def shaping_assistant(_request: Request) -> FileResponse:
    """Return the first simple shaping assistant page."""

    return FileResponse(
        STATIC_DIRECTORY / "shaping-assistant.html",
        media_type="text/html",
    )


async def bind_off_assistant(_request: Request) -> FileResponse:
    """Return the first bind-off and piece completion assistant page."""

    return FileResponse(
        STATIC_DIRECTORY / "bind-off-assistant.html",
        media_type="text/html",
    )


async def second_piece_assistant(_request: Request) -> FileResponse:
    """Return the identical second-piece assistant page."""

    return FileResponse(
        STATIC_DIRECTORY / "second-piece-assistant.html",
        media_type="text/html",
    )


async def first_assembly_join(_request: Request) -> FileResponse:
    """Return the first straight-edge joining assistant page."""

    return FileResponse(
        STATIC_DIRECTORY / "first-assembly-join.html",
        media_type="text/html",
    )


async def first_assembly_inspection(_request: Request) -> FileResponse:
    """Return the first completed-join inspection assistant page."""

    return FileResponse(
        STATIC_DIRECTORY / "first-assembly-inspection.html",
        media_type="text/html",
    )


async def first_tail_securing(_request: Request) -> FileResponse:
    """Return the first working-tail securing assistant page."""

    return FileResponse(
        STATIC_DIRECTORY / "first-tail-securing.html",
        media_type="text/html",
    )


async def first_blocking(_request: Request) -> FileResponse:
    """Return the first safe blocking assistant page."""

    return FileResponse(
        STATIC_DIRECTORY / "first-blocking.html",
        media_type="text/html",
    )


async def pattern_import(_request: Request) -> FileResponse:
    """Return the safe pattern-material intake page."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-import.html",
        media_type="text/html",
    )


async def pattern_analysis(_request: Request) -> FileResponse:
    """Return the imported-material analysis lifecycle page."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-analysis.html",
        media_type="text/html",
    )


async def tester_start(_request: Request) -> FileResponse:
    """Return the entry page for local user testing."""

    return FileResponse(STATIC_DIRECTORY / "test.html", media_type="text/html")


async def feedback(_request: Request) -> FileResponse:
    """Return the local tester feedback report page."""

    return FileResponse(
        STATIC_DIRECTORY / "feedback.html",
        media_type="text/html",
    )


async def calculate_first_function(request: Request) -> JSONResponse:
    """Calculate the first function through the public YarnAI boundary."""

    try:
        payload = await _read_json(request)
    except _InvalidJsonError:
        return _error_response(
            400,
            code="invalid_json",
            message="Request body must contain valid JSON.",
        )
    except Exception:
        return _technical_error_response("unexpected_technical_error")

    try:
        calculation_request = first_function_request_from_mapping(payload)
        output = run_first_function(calculation_request)
        response = first_function_output_to_mapping(output)
        return JSONResponse(response, status_code=200)
    except (InvalidFirstFunctionInputError, InvalidCalculationRequestError) as error:
        return _error_response(
            422,
            code=error.code,
            message=str(error),
            details=dict(error.details),
        )
    except CalculationApplicationError as error:
        return _technical_error_response(error.code)
    except Exception:
        return _technical_error_response("unexpected_technical_error")


async def _read_json(request: Request) -> object:
    body = await request.body()
    if getattr(request.state, "body_too_large", False):
        raise _InvalidJsonError
    try:
        text = body.decode("utf-8")
        return json.loads(text, parse_constant=_reject_json_constant)
    except (UnicodeDecodeError, json.JSONDecodeError, _InvalidJsonError) as error:
        raise _InvalidJsonError from error


def _reject_json_constant(_value: str) -> NoReturn:
    raise _InvalidJsonError


def _error_response(
    status_code: int,
    *,
    code: str,
    message: str,
    details: dict[str, str] | None = None,
) -> JSONResponse:
    error: dict[str, object] = {
        "code": code,
        "message": message,
    }
    if details:
        error["details"] = details
    return JSONResponse({"error": error}, status_code=status_code)


def _technical_error_response(code: str) -> JSONResponse:
    return _error_response(
        500,
        code=code,
        message=TECHNICAL_ERROR_MESSAGE,
    )


def create_app(settings: RuntimeSettings | None = None) -> Starlette:
    """Create the public YarnAI HTTP application."""

    runtime_settings = settings or RuntimeSettings.from_environment()
    routes = [
        Route("/", user_interface, methods=["GET"]),
        Route("/calculator", width_calculator, methods=["GET"]),
        Route("/about", about_first_function, methods=["GET"]),
        Route("/example", canonical_example, methods=["GET"]),
        Route("/smart-start", smart_start, methods=["GET"]),
        Route("/step-assistant", step_assistant, methods=["GET"]),
        Route("/section-assistant", section_assistant, methods=["GET"]),
        Route("/shaping-assistant", shaping_assistant, methods=["GET"]),
        Route("/bind-off-assistant", bind_off_assistant, methods=["GET"]),
        Route(
            "/second-piece-assistant",
            second_piece_assistant,
            methods=["GET"],
        ),
        Route(
            "/first-assembly-join",
            first_assembly_join,
            methods=["GET"],
        ),
        Route(
            "/first-assembly-inspection",
            first_assembly_inspection,
            methods=["GET"],
        ),
        Route(
            "/first-tail-securing",
            first_tail_securing,
            methods=["GET"],
        ),
        Route(
            "/first-blocking",
            first_blocking,
            methods=["GET"],
        ),
        Route(
            "/import-pattern",
            pattern_import,
            methods=["GET"],
        ),
        Route(
            "/pattern-analysis",
            pattern_analysis,
            methods=["GET"],
        ),
        Route("/test", tester_start, methods=["GET"]),
        Route("/feedback", feedback, methods=["GET"]),
        Route("/health", health, methods=["GET"]),
        Route(
            "/api/v1/calculate",
            calculate_first_function,
            methods=["POST"],
        ),
    ]
    engine = None
    if runtime_settings.accounts_enabled:
        engine = create_database_engine(runtime_settings.database_url)
        routes.extend(
            CloudApi(
                runtime_settings,
                create_session_factory(engine),
            ).routes()
        )
    routes.append(
        Mount(
            "/static",
            app=StaticFiles(directory=STATIC_DIRECTORY),
            name="static",
        )
    )
    middleware = [
        Middleware(
            ProductionHttpMiddleware,
            hsts_enabled=runtime_settings.cookie_secure,
        ),
        Middleware(
            RequestBodyLimitMiddleware,
            maximum_bytes=runtime_settings.max_request_body_bytes,
        ),
    ]
    if runtime_settings.allowed_origins:
        middleware.append(
            Middleware(
                CORSMiddleware,
                allow_origins=list(runtime_settings.allowed_origins),
                allow_credentials=True,
                allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                allow_headers=[
                    "Authorization",
                    "Content-Type",
                    "Idempotency-Key",
                    "X-CSRF-Token",
                ],
                max_age=600,
            )
        )
    application = Starlette(
        debug=False,
        lifespan=_application_lifespan,
        routes=routes,
        middleware=middleware,
    )
    application.state.database_engine = engine
    return application


@asynccontextmanager
async def _application_lifespan(_application: Starlette):
    LOGGER.info("application_start")
    try:
        yield
    finally:
        engine = getattr(_application.state, "database_engine", None)
        if engine is not None:
            engine.dispose()
        LOGGER.info("application_stop")


app = create_app()


def server_address(
    environ: Mapping[str, str] | None = None,
) -> tuple[str, int]:
    """Return the configured HTTP host and port."""

    settings = RuntimeSettings.from_environment(environ)
    return settings.host, settings.port


def configure_logging(log_level: str) -> None:
    """Configure concise logs without request bodies or browser identifiers."""

    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def main() -> None:
    """Run the HTTP service on its configured address."""

    settings = RuntimeSettings.from_environment()
    configure_logging(settings.log_level)
    options = {
        "host": settings.host,
        "port": settings.port,
        "log_level": settings.log_level,
        "reload": False,
        "proxy_headers": bool(settings.trusted_proxy_ips),
        "access_log": False,
        "server_header": False,
        "workers": 1,
    }
    if settings.trusted_proxy_ips:
        options["forwarded_allow_ips"] = ",".join(settings.trusted_proxy_ips)
    uvicorn.run(
        app,
        **options,
    )


if __name__ == "__main__":
    main()
