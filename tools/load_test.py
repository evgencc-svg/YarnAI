"""Reproducible standard-library load test for a running YarnAI server."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import statistics
import threading
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).parents[1]
CANONICAL_PAYLOAD = json.loads(
    (ROOT / "examples" / "first_function_width.json").read_text(
        encoding="utf-8"
    )
)
ALTERNATE_PAYLOAD = deepcopy(CANONICAL_PAYLOAD)
ALTERNATE_PAYLOAD["width"]["value"] = 40


@dataclass(frozen=True, slots=True)
class RequestSpec:
    name: str
    method: str
    path: str
    payload: dict[str, Any] | None = None
    expected_working_count: int | None = None


@dataclass(frozen=True, slots=True)
class RequestResult:
    name: str
    status: int | None
    elapsed_ms: float
    success: bool
    timeout: bool
    error: str | None
    body_sha256: str | None = None


SCENARIO_GETS = (
    RequestSpec("test", "GET", "/test"),
    RequestSpec("home", "GET", "/"),
)
SCENARIO_AFTER_CALCULATION = (
    RequestSpec("smart_start", "GET", "/smart-start"),
    RequestSpec("step_assistant", "GET", "/step-assistant"),
    RequestSpec("css", "GET", "/static/styles.css"),
    RequestSpec("javascript", "GET", "/static/app.js"),
    RequestSpec("health", "GET", "/health"),
)


class ProcessSampler:
    """Sample server RSS and thread count without third-party packages."""

    def __init__(self, pid: int | None, interval: float = 0.1) -> None:
        self.pid = pid
        self.interval = interval
        self.samples: list[tuple[float, int]] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self.pid is None:
            return
        self._sample()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> dict[str, Any]:
        if self.pid is None:
            return {
                "available": False,
                "reason": "No --pid was supplied.",
            }
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
        self._sample()
        if not self.samples:
            return {
                "available": False,
                "reason": f"Process {self.pid} could not be sampled.",
            }
        rss_values = [sample[0] for sample in self.samples]
        thread_values = [sample[1] for sample in self.samples]
        return {
            "available": True,
            "pid": self.pid,
            "monitored_processes": 1,
            "rss_before_mb": round(rss_values[0], 3),
            "rss_peak_mb": round(max(rss_values), 3),
            "rss_after_mb": round(rss_values[-1], 3),
            "rss_change_mb": round(rss_values[-1] - rss_values[0], 3),
            "threads_before": thread_values[0],
            "threads_peak": max(thread_values),
            "threads_after": thread_values[-1],
            "sample_count": len(self.samples),
        }

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            self._sample()

    def _sample(self) -> None:
        if self.pid is None:
            return
        sample = _process_sample(self.pid)
        if sample is not None:
            self.samples.append(sample)


def _process_sample(pid: int) -> tuple[float, int] | None:
    if platform.system() == "Windows":
        return _windows_process_sample(pid)
    status_path = Path(f"/proc/{pid}/status")
    if status_path.exists():
        values: dict[str, str] = {}
        for line in status_path.read_text(encoding="utf-8").splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                values[key] = value.strip()
        if "VmRSS" not in values:
            return None
        rss_kib = int(values["VmRSS"].split()[0])
        threads = int(values.get("Threads", "1"))
        return rss_kib / 1024, threads
    return None


def _windows_process_sample(pid: int) -> tuple[float, int] | None:
    import ctypes
    from ctypes import wintypes

    class ProcessMemoryCounters(ctypes.Structure):
        _fields_ = [
            ("cb", wintypes.DWORD),
            ("PageFaultCount", wintypes.DWORD),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    class ThreadEntry32(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ThreadID", wintypes.DWORD),
            ("th32OwnerProcessID", wintypes.DWORD),
            ("tpBasePri", wintypes.LONG),
            ("tpDeltaPri", wintypes.LONG),
            ("dwFlags", wintypes.DWORD),
        ]

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    handle = kernel32.OpenProcess(0x0400 | 0x0010, False, pid)
    if not handle:
        return None
    try:
        counters = ProcessMemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        if not psapi.GetProcessMemoryInfo(
            handle,
            ctypes.byref(counters),
            counters.cb,
        ):
            return None

        snapshot = kernel32.CreateToolhelp32Snapshot(0x00000004, 0)
        invalid_handle = ctypes.c_void_p(-1).value
        thread_count = 0
        if snapshot != invalid_handle:
            try:
                entry = ThreadEntry32()
                entry.dwSize = ctypes.sizeof(entry)
                available = kernel32.Thread32First(
                    snapshot,
                    ctypes.byref(entry),
                )
                while available:
                    if entry.th32OwnerProcessID == pid:
                        thread_count += 1
                    available = kernel32.Thread32Next(
                        snapshot,
                        ctypes.byref(entry),
                    )
            finally:
                kernel32.CloseHandle(snapshot)
        return counters.WorkingSetSize / (1024 * 1024), thread_count
    finally:
        kernel32.CloseHandle(handle)


def _perform_request(
    base_url: str,
    spec: RequestSpec,
    timeout: float,
) -> RequestResult:
    data = None
    headers = {"Accept": "*/*"}
    if spec.payload is not None:
        data = json.dumps(
            spec.payload,
            ensure_ascii=True,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(
        f"{base_url.rstrip('/')}{spec.path}",
        data=data,
        headers=headers,
        method=spec.method,
    )
    started_at = time.perf_counter()
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read()
            status = response.status
            content_type = response.headers.get("Content-Type", "")
        success, validation_error = _validate_response(
            spec,
            status,
            content_type,
            body,
        )
        return RequestResult(
            name=spec.name,
            status=status,
            elapsed_ms=(time.perf_counter() - started_at) * 1000,
            success=success,
            timeout=False,
            error=validation_error,
            body_sha256=hashlib.sha256(body).hexdigest(),
        )
    except HTTPError as error:
        return RequestResult(
            name=spec.name,
            status=error.code,
            elapsed_ms=(time.perf_counter() - started_at) * 1000,
            success=False,
            timeout=False,
            error="HTTPError",
        )
    except (TimeoutError, URLError, OSError) as error:
        is_timeout = isinstance(error, TimeoutError) or "timed out" in str(
            error
        ).lower()
        return RequestResult(
            name=spec.name,
            status=None,
            elapsed_ms=(time.perf_counter() - started_at) * 1000,
            success=False,
            timeout=is_timeout,
            error=type(error).__name__,
        )


def _validate_response(
    spec: RequestSpec,
    status: int,
    content_type: str,
    body: bytes,
) -> tuple[bool, str | None]:
    if status != 200:
        return False, f"unexpected_status_{status}"
    if spec.name == "health":
        if content_type != "application/json":
            return False, "health_content_type"
        if body != b'{"status":"ok"}':
            return False, "health_contract"
    elif spec.name == "css" and not content_type.startswith("text/css"):
        return False, "css_content_type"
    elif spec.name == "javascript" and "javascript" not in content_type:
        return False, "javascript_content_type"
    elif spec.expected_working_count is not None:
        try:
            result = json.loads(body)
            working_count = result["axes"]["width"]["selected_candidate"][
                "working_count"
            ]
        except (KeyError, TypeError, json.JSONDecodeError):
            return False, "calculation_shape"
        if working_count != spec.expected_working_count:
            return False, "calculation_mixed_or_incorrect"
    return True, None


def _user_scenario(
    base_url: str,
    user_id: int,
    cycles: int,
    timeout: float,
    start_event: threading.Event,
) -> list[RequestResult]:
    payload = CANONICAL_PAYLOAD if user_id % 2 == 0 else ALTERNATE_PAYLOAD
    expected = 100 if user_id % 2 == 0 else 80
    calculation = RequestSpec(
        "calculation",
        "POST",
        "/api/v1/calculate",
        payload,
        expected,
    )
    start_event.wait()
    results: list[RequestResult] = []
    for _cycle in range(cycles):
        for spec in (*SCENARIO_GETS, calculation, *SCENARIO_AFTER_CALCULATION):
            results.append(_perform_request(base_url, spec, timeout))
    return results


def run_user_profile(
    base_url: str,
    users: int,
    cycles: int,
    timeout: float,
) -> dict[str, Any]:
    start_event = threading.Event()
    started_at = time.perf_counter()
    with ThreadPoolExecutor(max_workers=users) as executor:
        futures = [
            executor.submit(
                _user_scenario,
                base_url,
                user_id,
                cycles,
                timeout,
                start_event,
            )
            for user_id in range(users)
        ]
        start_event.set()
        results = [
            result
            for future in futures
            for result in future.result()
        ]
    duration = time.perf_counter() - started_at
    return _summarize(results, duration, users=users, cycles=cycles)


def run_burst_profile(
    base_url: str,
    requests_per_route: int,
    concurrency: int,
    timeout: float,
) -> dict[str, Any]:
    specs = [
        *[RequestSpec("health", "GET", "/health")] * requests_per_route,
        *[RequestSpec("home", "GET", "/")] * requests_per_route,
        *[
            RequestSpec(
                "calculation",
                "POST",
                "/api/v1/calculate",
                CANONICAL_PAYLOAD,
                100,
            )
        ]
        * requests_per_route,
    ]
    start_event = threading.Event()

    def run(spec: RequestSpec) -> RequestResult:
        start_event.wait()
        return _perform_request(base_url, spec, timeout)

    started_at = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(run, spec) for spec in specs]
        start_event.set()
        results = [future.result() for future in futures]
    duration = time.perf_counter() - started_at
    return _summarize(
        results,
        duration,
        concurrency=concurrency,
        requests_per_route=requests_per_route,
    )


def run_isolation_check(
    base_url: str,
    repetitions_per_user: int,
    timeout: float,
) -> dict[str, Any]:
    specs = []
    for _index in range(repetitions_per_user):
        specs.extend(
            (
                RequestSpec(
                    "user_a",
                    "POST",
                    "/api/v1/calculate",
                    CANONICAL_PAYLOAD,
                    100,
                ),
                RequestSpec(
                    "user_b",
                    "POST",
                    "/api/v1/calculate",
                    ALTERNATE_PAYLOAD,
                    80,
                ),
            )
        )
    with ThreadPoolExecutor(max_workers=20) as executor:
        results = list(
            executor.map(
                lambda spec: _perform_request(base_url, spec, timeout),
                specs,
            )
        )
    digests: dict[str, set[str]] = defaultdict(set)
    for result in results:
        if result.body_sha256:
            digests[result.name].add(result.body_sha256)
    errors = [result for result in results if not result.success]
    return {
        "requests": len(results),
        "successful": len(results) - len(errors),
        "errors": len(errors),
        "user_a_expected_working_count": 100,
        "user_b_expected_working_count": 80,
        "stable_response_per_user": all(
            len(digests[user]) == 1 for user in ("user_a", "user_b")
        ),
        "responses_differ_between_users": digests["user_a"].isdisjoint(
            digests["user_b"]
        ),
        "independent": not errors
        and all(len(digests[user]) == 1 for user in ("user_a", "user_b"))
        and digests["user_a"].isdisjoint(digests["user_b"]),
    }


def _summarize(
    results: list[RequestResult],
    duration: float,
    **profile: int,
) -> dict[str, Any]:
    elapsed = [result.elapsed_ms for result in results]
    statuses = Counter(
        str(result.status) if result.status is not None else "no_response"
        for result in results
    )
    errors = [result for result in results if not result.success]
    routes: dict[str, list[RequestResult]] = defaultdict(list)
    for result in results:
        routes[result.name].append(result)
    return {
        **profile,
        "requests": len(results),
        "successful": len(results) - len(errors),
        "errors": len(errors),
        "http_5xx": sum(
            count
            for status, count in statuses.items()
            if status.isdigit() and 500 <= int(status) <= 599
        ),
        "timeouts": sum(result.timeout for result in results),
        "lost_requests": sum(result.status is None for result in results),
        "status_counts": dict(sorted(statuses.items())),
        "min_ms": round(min(elapsed), 3),
        "median_ms": round(statistics.median(elapsed), 3),
        "p95_ms": round(_percentile(elapsed, 0.95), 3),
        "max_ms": round(max(elapsed), 3),
        "duration_s": round(duration, 3),
        "throughput_rps": round(len(results) / duration, 3),
        "error_types": dict(
            sorted(Counter(result.error for result in errors).items())
        ),
        "routes": {
            name: {
                "requests": len(route_results),
                "errors": sum(not result.success for result in route_results),
                "min_ms": round(
                    min(result.elapsed_ms for result in route_results),
                    3,
                ),
                "median_ms": round(
                    statistics.median(
                        result.elapsed_ms for result in route_results
                    ),
                    3,
                ),
                "p95_ms": round(
                    _percentile(
                        [result.elapsed_ms for result in route_results],
                        0.95,
                    ),
                    3,
                ),
                "max_ms": round(
                    max(result.elapsed_ms for result in route_results),
                    3,
                ),
            }
            for name, route_results in sorted(routes.items())
        },
    }


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * fraction) - 1)
    return ordered[index]


def _post_test_health(
    base_url: str,
    timeout: float,
) -> dict[str, Any]:
    result = _perform_request(
        base_url,
        RequestSpec("health", "GET", "/health"),
        timeout,
    )
    return {
        "status": result.status,
        "success": result.success,
        "exact_contract": result.success,
        "content_type": "application/json" if result.success else None,
        "body": '{"status":"ok"}' if result.success else None,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="URL of an already running YarnAI production server",
    )
    parser.add_argument(
        "--profile",
        choices=("smoke", "a", "b", "c", "all"),
        default="all",
    )
    parser.add_argument("--pid", type=int, help="server PID for memory sampling")
    parser.add_argument("--timeout", type=float, default=10)
    parser.add_argument("--cycles-a", type=int, default=10)
    parser.add_argument("--cycles-b", type=int, default=5)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sampler = ProcessSampler(args.pid)
    sampler.start()
    profiles: dict[str, Any] = {}
    if args.profile == "smoke":
        profiles["smoke"] = run_user_profile(
            args.base_url,
            users=2,
            cycles=1,
            timeout=args.timeout,
        )
    else:
        if args.profile in {"a", "all"}:
            profiles["a"] = run_user_profile(
                args.base_url,
                users=20,
                cycles=args.cycles_a,
                timeout=args.timeout,
            )
        if args.profile in {"b", "all"}:
            profiles["b"] = run_user_profile(
                args.base_url,
                users=50,
                cycles=args.cycles_b,
                timeout=args.timeout,
            )
        if args.profile in {"c", "all"}:
            profiles["c"] = run_burst_profile(
                args.base_url,
                requests_per_route=100,
                concurrency=100,
                timeout=args.timeout,
            )
    isolation = run_isolation_check(
        args.base_url,
        repetitions_per_user=5 if args.profile == "smoke" else 100,
        timeout=args.timeout,
    )
    result = {
        "base_url": args.base_url,
        "profiles": profiles,
        "isolation": isolation,
        "post_test_health": _post_test_health(args.base_url, args.timeout),
        "memory": sampler.stop(),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    succeeded = (
        all(profile["errors"] == 0 for profile in profiles.values())
        and isolation["independent"]
        and result["post_test_health"]["exact_contract"]
    )
    return 0 if succeeded else 1


if __name__ == "__main__":
    raise SystemExit(main())
