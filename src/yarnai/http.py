"""HTTP API for the first executable YarnAI function."""

from __future__ import annotations

import json
from typing import NoReturn

import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from yarnai import (
    CalculationApplicationError,
    InvalidCalculationRequestError,
    InvalidFirstFunctionInputError,
    first_function_output_to_mapping,
    first_function_request_from_mapping,
    run_first_function,
)


TECHNICAL_ERROR_MESSAGE = (
    "The calculation could not be completed because of an internal technical error."
)


class _InvalidJsonError(ValueError):
    """The request body is not a valid JSON document."""


async def health(_request: Request) -> JSONResponse:
    """Return a minimal process health response."""

    return JSONResponse({"status": "ok"})


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


def create_app() -> Starlette:
    """Create the public YarnAI HTTP application."""

    return Starlette(
        debug=False,
        routes=[
            Route("/health", health, methods=["GET"]),
            Route(
                "/api/v1/calculate",
                calculate_first_function,
                methods=["POST"],
            ),
        ],
    )


app = create_app()


def main() -> None:
    """Run the HTTP service locally on its documented address."""

    uvicorn.run(app, host="127.0.0.1", port=8000)


if __name__ == "__main__":
    main()
