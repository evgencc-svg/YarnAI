"""Command-line interface for the first executable YarnAI function."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any, TextIO

from yarnai import (
    CalculationApplicationError,
    InvalidCalculationRequestError,
    InvalidFirstFunctionInputError,
    first_function_output_to_mapping,
    first_function_request_from_mapping,
    run_first_function,
)


EXIT_SUCCESS = 0
EXIT_INPUT_ERROR = 2
EXIT_TECHNICAL_ERROR = 3


def main(argv: Sequence[str] | None = None) -> int:
    """Run the first function CLI and return its stable process exit code."""

    parser = argparse.ArgumentParser(
        prog="python -m yarnai",
        description=(
            "Calculate the first YarnAI function from JSON read from a file "
            "or standard input."
        ),
    )
    parser.add_argument(
        "--input",
        metavar="PATH",
        default="-",
        help="JSON input file; use '-' or omit the option to read stdin",
    )
    arguments = parser.parse_args(argv)

    try:
        payload = _read_json(arguments.input)
    except OSError as error:
        _write_error(
            sys.stderr,
            category="input",
            code="input_file_error",
            message=f"Cannot read JSON input: {error}",
        )
        return EXIT_INPUT_ERROR
    except UnicodeError as error:
        _write_error(
            sys.stderr,
            category="input",
            code="invalid_input_encoding",
            message=f"JSON input must be UTF-8: {error}",
        )
        return EXIT_INPUT_ERROR
    except json.JSONDecodeError as error:
        _write_error(
            sys.stderr,
            category="input",
            code="invalid_json",
            message=(
                f"Invalid JSON at line {error.lineno}, column {error.colno}: "
                f"{error.msg}"
            ),
            details={"line": error.lineno, "column": error.colno},
        )
        return EXIT_INPUT_ERROR
    except ValueError as error:
        _write_error(
            sys.stderr,
            category="input",
            code="invalid_json",
            message=f"Invalid JSON: {error}",
        )
        return EXIT_INPUT_ERROR

    try:
        request = first_function_request_from_mapping(payload)
        output = run_first_function(request)
        response = first_function_output_to_mapping(output)
        _write_json(sys.stdout, response)
    except (InvalidFirstFunctionInputError, InvalidCalculationRequestError) as error:
        _write_error(
            sys.stderr,
            category="input",
            code=error.code,
            message=str(error),
            details=dict(error.details),
        )
        return EXIT_INPUT_ERROR
    except CalculationApplicationError as error:
        _write_error(
            sys.stderr,
            category="technical",
            code=error.code,
            message=str(error),
        )
        return EXIT_TECHNICAL_ERROR
    except Exception as error:
        _write_error(
            sys.stderr,
            category="technical",
            code="unexpected_technical_error",
            message=f"Unexpected technical failure: {type(error).__name__}: {error}",
        )
        return EXIT_TECHNICAL_ERROR

    return EXIT_SUCCESS


def _read_json(input_path: str) -> object:
    if input_path == "-":
        return json.load(sys.stdin, parse_constant=_reject_json_constant)
    with Path(input_path).open(encoding="utf-8") as input_file:
        return json.load(input_file, parse_constant=_reject_json_constant)


def _reject_json_constant(value: str):
    raise ValueError(f"non-standard constant {value}")


def _write_error(
    stream: TextIO,
    *,
    category: str,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> None:
    error: dict[str, Any] = {
        "category": category,
        "code": code,
        "message": message,
    }
    if details:
        error["details"] = details
    _write_json(stream, {"error": error})


def _write_json(stream: TextIO, value: object) -> None:
    json.dump(value, stream, ensure_ascii=True, indent=2, allow_nan=False)
    stream.write("\n")


if __name__ == "__main__":
    raise SystemExit(main())
