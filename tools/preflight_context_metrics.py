"""Measure approximate context reduction produced by a local preflight.

This temporary utility uses only the Python standard library. Estimated token
counts use ``ceil(total Unicode characters / 4)``. The estimate is useful for
repeatable before/after comparisons, but it is not an exact Codex/OpenAI token
count and can be less accurate for code, markup, and non-English text.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
import json
import math
import os
from pathlib import Path
import re
import sys
from typing import Iterable, Sequence


SUPPORTED_SUFFIXES = frozenset({".md", ".txt", ".json", ".yaml", ".yml"})
EXCLUDED_DIRECTORY_NAMES = frozenset(
    {
        ".git",
        ".venv",
        "venv",
        "node_modules",
        "build",
        "dist",
        "out",
        "target",
        ".cache",
        "cache",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".tox",
        ".nox",
        ".next",
        "coverage",
    }
)
WORD_PATTERN = re.compile(r"\b[\w]+(?:['’-][\w]+)*\b", re.UNICODE)
TOKEN_ESTIMATION_FORMULA = "ceil(total_unicode_characters / 4)"


class MetricsError(ValueError):
    """Raised when an input cannot be measured safely or unambiguously."""


@dataclass(frozen=True, slots=True)
class TextMetrics:
    files: int
    bytes: int
    characters: int
    words: int
    estimated_tokens: int


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare source text with a compact preflight brief using a "
            "documented approximate token count."
        )
    )
    parser.add_argument(
        "--source",
        nargs="+",
        type=Path,
        required=True,
        metavar="PATH",
        help="One or more supported files and/or directories.",
    )
    parser.add_argument(
        "--brief",
        type=Path,
        required=True,
        metavar="FILE",
        help="Compact context brief produced by the local preflight.",
    )
    parser.add_argument(
        "--log",
        type=Path,
        default=Path("preflight-metrics.jsonl"),
        metavar="FILE",
        help="Append-only JSONL log (default: preflight-metrics.jsonl).",
    )
    return parser.parse_args(argv)


def normalized_path(path: Path) -> Path:
    return path.expanduser().resolve(strict=False)


def is_supported(path: Path) -> bool:
    return path.suffix.casefold() in SUPPORTED_SUFFIXES


def is_excluded_directory_name(name: str) -> bool:
    return name.casefold() in EXCLUDED_DIRECTORY_NAMES


def collect_source_files(
    inputs: Iterable[Path], *, excluded_files: Iterable[Path] = ()
) -> tuple[list[Path], list[str]]:
    excluded = {normalized_path(path) for path in excluded_files}
    collected: dict[str, Path] = {}
    warnings: list[str] = []

    for supplied_path in inputs:
        path = normalized_path(supplied_path)
        if not path.exists():
            raise MetricsError(f"Source path does not exist: {path}")

        if path.is_file():
            if path in excluded:
                continue
            if any(is_excluded_directory_name(part) for part in path.parent.parts):
                warnings.append(f"Excluded file below ignored directory: {path}")
                continue
            if not is_supported(path):
                raise MetricsError(
                    f"Unsupported explicit source file type: {path.suffix or '<none>'} "
                    f"({path})"
                )
            decode_text(path, path.read_bytes())
            collected[os.path.normcase(str(path))] = path
            continue

        if not path.is_dir():
            raise MetricsError(f"Source path is neither a file nor directory: {path}")
        if is_excluded_directory_name(path.name):
            continue

        for root, directory_names, file_names in os.walk(path, followlinks=False):
            directory_names[:] = sorted(
                name
                for name in directory_names
                if not is_excluded_directory_name(name)
            )
            root_path = Path(root)
            for file_name in sorted(file_names):
                unresolved_candidate = root_path / file_name
                if unresolved_candidate.is_symlink():
                    warnings.append(f"Excluded symbolic link: {unresolved_candidate}")
                    continue
                candidate = normalized_path(unresolved_candidate)
                if candidate in excluded or not is_supported(candidate):
                    continue
                try:
                    decode_text(candidate, candidate.read_bytes())
                except MetricsError:
                    warnings.append(f"Excluded binary/non-UTF text file: {candidate}")
                    continue
                collected[os.path.normcase(str(candidate))] = candidate

    files = sorted(collected.values(), key=lambda item: os.path.normcase(str(item)))
    if not files:
        raise MetricsError(
            "No supported text files found after applying exclusions. "
            f"Supported extensions: {', '.join(sorted(SUPPORTED_SUFFIXES))}"
        )
    return files, warnings


def decode_text(path: Path, data: bytes) -> str:
    if data.startswith((b"\xff\xfe\x00\x00", b"\x00\x00\xfe\xff")):
        encoding = "utf-32"
    elif data.startswith((b"\xff\xfe", b"\xfe\xff")):
        encoding = "utf-16"
    else:
        encoding = "utf-8-sig"
        if b"\x00" in data[:8192]:
            raise MetricsError(f"Binary-looking file skipped by policy: {path}")

    try:
        return data.decode(encoding)
    except UnicodeDecodeError as exc:
        raise MetricsError(
            f"File is not supported UTF text and may be binary: {path} ({exc})"
        ) from exc


def measure_files(paths: Sequence[Path]) -> TextMetrics:
    total_bytes = 0
    total_characters = 0
    total_words = 0

    for path in paths:
        data = path.read_bytes()
        text = decode_text(path, data)
        total_bytes += len(data)
        total_characters += len(text)
        total_words += len(WORD_PATTERN.findall(text))

    return TextMetrics(
        files=len(paths),
        bytes=total_bytes,
        characters=total_characters,
        words=total_words,
        estimated_tokens=math.ceil(total_characters / 4),
    )


def calculate_reduction(
    original: TextMetrics, brief: TextMetrics
) -> tuple[dict[str, int | float | None], list[str]]:
    warnings: list[str] = []
    saved = original.estimated_tokens - brief.estimated_tokens

    if original.estimated_tokens == 0:
        percentage = None
        warnings.append("Percentage reduction is undefined for empty source text.")
    else:
        percentage = round(saved / original.estimated_tokens * 100, 2)

    if brief.estimated_tokens == 0:
        ratio = None
        warnings.append("Compression ratio is undefined for an empty brief.")
    else:
        ratio = round(original.estimated_tokens / brief.estimated_tokens, 2)

    return (
        {
            "estimated_tokens_saved": saved,
            "percentage": percentage,
            "compression_ratio": ratio,
        },
        warnings,
    )


def ensure_brief_file(path: Path) -> Path:
    path = normalized_path(path)
    if not path.exists() or not path.is_file():
        raise MetricsError(f"Brief must be an existing file: {path}")
    if not is_supported(path):
        raise MetricsError(
            f"Unsupported brief file type: {path.suffix or '<none>'} ({path})"
        )
    return path


def append_jsonl(log_path: Path, record: dict[str, object]) -> Path:
    path = normalized_path(log_path)
    if not path.parent.exists() or not path.parent.is_dir():
        raise MetricsError(f"Log directory does not exist: {path.parent}")
    serialized = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
    with path.open("a", encoding="utf-8", newline="\n") as log_file:
        log_file.write(serialized)
        log_file.write("\n")
    return path


def format_value(value: int | float | None, *, suffix: str = "") -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:,.2f}{suffix}"
    return f"{value:,}{suffix}"


def print_human_summary(record: dict[str, object], log_path: Path) -> None:
    original = record["original"]
    brief = record["brief"]
    reduction = record["reduction"]
    assert isinstance(original, dict)
    assert isinstance(brief, dict)
    assert isinstance(reduction, dict)

    print("Nexora preflight context metrics")
    print(f"Estimator: {TOKEN_ESTIMATION_FORMULA} (approximate, not exact)")
    print()
    print("Original:")
    print(f"  Files:            {format_value(original['files'])}")
    print(f"  Bytes:            {format_value(original['bytes'])}")
    print(f"  Characters:       {format_value(original['characters'])}")
    print(f"  Words:            {format_value(original['words'])}")
    print(f"  Estimated tokens: {format_value(original['estimated_tokens'])}")
    print()
    print("Brief:")
    print(f"  Files:            {format_value(brief['files'])}")
    print(f"  Bytes:            {format_value(brief['bytes'])}")
    print(f"  Characters:       {format_value(brief['characters'])}")
    print(f"  Words:            {format_value(brief['words'])}")
    print(f"  Estimated tokens: {format_value(brief['estimated_tokens'])}")
    print()
    print("Reduction:")
    print(
        "  Estimated tokens saved: "
        f"{format_value(reduction['estimated_tokens_saved'])}"
    )
    print(
        "  Percentage:             "
        f"{format_value(reduction['percentage'], suffix='%')}"
    )
    print(
        "  Original / brief:        "
        f"{format_value(reduction['compression_ratio'], suffix='x')}"
    )
    print(f"Log appended: {log_path}")
    print()
    print("JSON:")
    print(json.dumps(record, ensure_ascii=False, indent=2))


def run(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    brief_path = ensure_brief_file(args.brief)
    log_path = normalized_path(args.log)

    if brief_path == log_path:
        raise MetricsError("Brief and JSONL log must be different files.")

    source_files, collection_warnings = collect_source_files(
        args.source,
        excluded_files=(brief_path, log_path),
    )
    original_metrics = measure_files(source_files)
    brief_metrics = measure_files([brief_path])
    reduction, warnings = calculate_reduction(original_metrics, brief_metrics)
    warnings = collection_warnings + warnings

    record: dict[str, object] = {
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "source_paths": [str(normalized_path(path)) for path in args.source],
        "brief_path": str(brief_path),
        "token_estimation": {
            "method": "heuristic",
            "formula": TOKEN_ESTIMATION_FORMULA,
            "exact": False,
        },
        "original": asdict(original_metrics),
        "brief": asdict(brief_metrics),
        "reduction": reduction,
        "warnings": warnings,
    }

    written_log_path = append_jsonl(log_path, record)
    print_human_summary(record, written_log_path)
    return 0


def main() -> int:
    try:
        return run()
    except (MetricsError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
