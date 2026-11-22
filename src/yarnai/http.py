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
from yarnai.pattern_content_extraction import (
    MAX_PDF_BYTES,
    PdfExtractionError,
    extract_pdf_text,
)
from yarnai.polo_vision_runtime import configured_gateway
from yarnai.vision_review import VisionReviewGateway, VisionReviewHttpApi
from yarnai.garment_reference import (
    GARMENT_ANALYSIS_ROUTE,
    MAX_GARMENT_ANALYSIS_REQUEST_BODY_BYTES,
    GarmentReferenceGateway,
    GarmentReferenceHttpApi,
)
from yarnai.garment_yarn_recommendation import YARN_RECOMMENDATION_ROUTE


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
        route = scope.get("path")
        if route == "/api/v1/pattern-content-extraction/pdf":
            request_limit = MAX_PDF_BYTES
        elif route == "/api/v1/vision-reviews":
            request_limit = 12 * 1024 * 1024
        elif route in {GARMENT_ANALYSIS_ROUTE, YARN_RECOMMENDATION_ROUTE}:
            request_limit = MAX_GARMENT_ANALYSIS_REQUEST_BODY_BYTES
        else:
            request_limit = self.maximum_bytes
        raw_length = headers.get(b"content-length")
        if raw_length:
            try:
                too_large = int(raw_length) > request_limit
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
                if received > request_limit:
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


async def user_workspace_entry(_request: Request) -> FileResponse:
    """Return the user project workspace on the established home UI."""

    return FileResponse(
        STATIC_DIRECTORY / "first-user-flow.html",
        media_type="text/html",
    )


async def saved_projects(_request: Request) -> FileResponse:
    """Return the saved-project list on the same project-workspace origin."""

    return FileResponse(
        STATIC_DIRECTORY / "first-user-flow.html",
        media_type="text/html",
    )


async def swatch_assistant(_request: Request) -> FileResponse:
    """Return the project-scoped swatch measurement workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "swatch-assistant.html",
        media_type="text/html",
    )


async def project_calculation_entry(_request: Request) -> FileResponse:
    """Return the project-scoped initial calculation workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-calculation-entry.html",
        media_type="text/html",
    )


async def project_execution_plan(_request: Request) -> FileResponse:
    return FileResponse(STATIC_DIRECTORY / "project-execution-plan.html", media_type="text/html")


async def project_execution_start(_request: Request) -> FileResponse:
    return FileResponse(STATIC_DIRECTORY / "project-execution-start.html", media_type="text/html")

async def project_execution_first_step(_request: Request) -> FileResponse:
    return FileResponse(STATIC_DIRECTORY / "project-execution-first-step.html", media_type="text/html")


async def project_execution_next_step(_request: Request) -> FileResponse:
    return FileResponse(STATIC_DIRECTORY / "project-execution-next-step.html", media_type="text/html")


async def project_execution_next_step_clarification(_request: Request) -> FileResponse:
    return FileResponse(
        STATIC_DIRECTORY / "project-execution-next-step-clarification.html",
        media_type="text/html",
    )


async def foundation_section_execution_preparation(_request: Request) -> FileResponse:
    """Return the project-scoped foundation-section preparation workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "foundation-section-execution-preparation.html",
        media_type="text/html",
    )


async def foundation_section_execution(_request: Request) -> FileResponse:
    """Return the project-scoped foundation-section execution workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "foundation-section-execution.html",
        media_type="text/html",
    )


async def foundation_section_measurement(_request: Request) -> FileResponse:
    """Return the project-scoped physical foundation measurement workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "foundation-section-measurement.html",
        media_type="text/html",
    )


async def primary_fabric_preparation(_request: Request) -> FileResponse:
    """Return the project-scoped primary-fabric preparation workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "primary-fabric-preparation.html",
        media_type="text/html",
    )


async def primary_fabric_execution(_request: Request) -> FileResponse:
    """Return the project-scoped primary-fabric execution workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "primary-fabric-execution.html",
        media_type="text/html",
    )


async def primary_fabric_measurement(_request: Request) -> FileResponse:
    """Return the project-scoped physical primary-fabric measurement workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "primary-fabric-measurement.html",
        media_type="text/html",
    )


async def project_next_section_planning(_request: Request) -> FileResponse:
    """Return the planning boundary after the current immutable plan is exhausted."""

    return FileResponse(
        STATIC_DIRECTORY / "project-next-section-planning.html",
        media_type="text/html",
    )


async def project_construction_strategy_planning(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 77 construction strategy clarification."""

    return FileResponse(
        STATIC_DIRECTORY / "project-construction-strategy-planning.html",
        media_type="text/html",
    )


async def project_shaping_policy_planning(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 78 shaping-policy clarification."""

    return FileResponse(
        STATIC_DIRECTORY / "project-shaping-policy-planning.html",
        media_type="text/html",
    )


async def project_sleeve_target_geometry_planning(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 79 sleeve geometry planning workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-sleeve-target-geometry-planning.html",
        media_type="text/html",
    )


async def project_sleeve_physical_execution(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 80 physical sleeve execution workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-sleeve-physical-execution.html",
        media_type="text/html",
    )


async def project_sleeve_pair_validation(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 81 physical sleeve-pair validation."""

    return FileResponse(
        STATIC_DIRECTORY / "project-sleeve-pair-validation.html",
        media_type="text/html",
    )


async def project_body_underarm_physical_confirmation(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 82 body-underarm physical confirmation."""

    return FileResponse(
        STATIC_DIRECTORY / "project-body-underarm-physical-confirmation.html",
        media_type="text/html",
    )


async def project_underarm_allocation_planning(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 83 underarm allocation planning workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-underarm-allocation-planning.html",
        media_type="text/html",
    )


async def project_join_layout_planning(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 84 immutable join-layout workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-join-layout-planning.html",
        media_type="text/html",
    )


async def project_underarm_allocation_execution(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 85 physical underarm allocation workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-underarm-allocation-execution.html",
        media_type="text/html",
    )


async def project_raglan_interface_planning(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 86 immutable raglan-interface workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-raglan-interface-planning.html",
        media_type="text/html",
    )


async def project_body_sleeves_join_execution(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 87 physical body/sleeves join workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-body-sleeves-join-execution.html",
        media_type="text/html",
    )


async def project_yoke_target_geometry_planning(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 88 yoke target geometry workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-yoke-target-geometry-planning.html",
        media_type="text/html",
    )


async def project_raglan_shaping_schedule_planning(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 89 raglan shaping schedule workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-raglan-shaping-schedule-planning.html",
        media_type="text/html",
    )


async def project_raglan_shaping_execution(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 90 physical raglan shaping workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-raglan-shaping-execution.html",
        media_type="text/html",
    )


async def project_neckline_opening_planning(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 91 neckline/opening planning workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-neckline-opening-planning.html",
        media_type="text/html",
    )


async def project_neckline_opening_execution(_request: Request) -> FileResponse:
    """Return the project-scoped Stage 92 physical neckline/opening workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-neckline-opening-execution.html",
        media_type="text/html",
    )


async def project_realized_finishable_edge_evidence(_request: Request) -> FileResponse:
    """Return the project-scoped realized physical edge-evidence workspace."""

    return FileResponse(
        STATIC_DIRECTORY / "project-realized-finishable-edge-evidence.html",
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


async def garment_reference_analysis(_request: Request) -> FileResponse:
    """Return the garment-reference brief and technology decision page."""

    return FileResponse(
        STATIC_DIRECTORY / "garment-reference-analysis.html",
        media_type="text/html",
    )


async def manual_calculation_intake(_request: Request) -> FileResponse:
    """Return the local factual-data draft for one confirmed manual route."""

    return FileResponse(
        STATIC_DIRECTORY / "manual-calculation-intake.html",
        media_type="text/html",
    )


async def garment_polo_execution(_request: Request) -> FileResponse:
    """Return the measured, resumable flat polo knitting workflow."""
    return FileResponse(STATIC_DIRECTORY / "garment-polo-execution.html", media_type="text/html")


async def garment_reference_happy_path_fixture(_request: Request) -> FileResponse:
    """Return the test-only isolated garment-reference fixture page."""

    return FileResponse(
        STATIC_DIRECTORY / "garment-reference-happy-path-fixture.html",
        media_type="text/html",
    )


async def pattern_analysis(_request: Request) -> FileResponse:
    """Return the imported-material analysis lifecycle page."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-analysis.html",
        media_type="text/html",
    )


async def pattern_content_extraction(_request: Request) -> FileResponse:
    """Return the deterministic imported-content extraction page."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-content-extraction.html",
        media_type="text/html",
    )


async def pattern_semantic_analysis(_request: Request) -> FileResponse:
    """Return the deterministic source-material semantic analysis page."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-semantic-analysis.html",
        media_type="text/html",
    )


async def pattern_analysis_review(_request: Request) -> FileResponse:
    """Return the human review and confirmation page for semantic analysis."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-analysis-review.html",
        media_type="text/html",
    )


async def pattern_technology_draft(_request: Request) -> FileResponse:
    """Return the deterministic technology-draft page."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-technology-draft.html",
        media_type="text/html",
    )


async def pattern_technology_review(_request: Request) -> FileResponse:
    """Return the user review page for a structured technology draft."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-technology-review.html",
        media_type="text/html",
    )


async def pattern_source_instruction_evidence(_request: Request) -> FileResponse:
    """Return the source PDF instruction evidence and review page."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-source-instruction-evidence.html",
        media_type="text/html",
    )


async def pattern_execution_plan(_request: Request) -> FileResponse:
    """Return the deterministic execution-plan page for confirmed technology."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-plan.html",
        media_type="text/html",
    )


async def pattern_execution_print(_request: Request) -> FileResponse:
    """Return the read-only adapted instruction prepared for browser printing."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-print.html",
        media_type="text/html",
    )


async def pattern_execution_session(_request: Request) -> FileResponse:
    """Return the deterministic execution-session page for a ready plan."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-session.html",
        media_type="text/html",
    )


async def pattern_execution_step(_request: Request) -> FileResponse:
    """Return one recoverable execution step from an active session."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-step.html",
        media_type="text/html",
    )


async def pattern_execution_checkpoint(_request: Request) -> FileResponse:
    """Return a source-proven verification checkpoint for an execution action."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-checkpoint.html",
        media_type="text/html",
    )


async def pattern_execution_progress(_request: Request) -> FileResponse:
    """Return deterministic aggregate progress derived from execution records."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-progress.html",
        media_type="text/html",
    )


async def pattern_execution_completion(_request: Request) -> FileResponse:
    """Return immutable proof of completed pattern execution."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-completion.html",
        media_type="text/html",
    )


async def pattern_execution_result(_request: Request) -> FileResponse:
    """Return the saved user-facing result of completed pattern execution."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-result.html",
        media_type="text/html",
    )


async def pattern_execution_runtime(_request: Request) -> FileResponse:
    """Return the deterministic runtime for an approved execution result."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-runtime.html",
        media_type="text/html",
    )


async def pattern_execution_monitoring(_request: Request) -> FileResponse:
    """Return the deterministic projection of pattern execution runtime state."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-monitoring.html",
        media_type="text/html",
    )


async def pattern_execution_intervention(_request: Request) -> FileResponse:
    """Return the explicit intent-only intervention workflow."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-intervention.html",
        media_type="text/html",
    )


async def pattern_execution_action(_request: Request) -> FileResponse:
    """Return the explicit execution and verification workflow."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-action.html",
        media_type="text/html",
    )


async def pattern_execution_evidence(_request: Request) -> FileResponse:
    """Return the read-only-by-default execution evidence workflow."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-evidence.html",
        media_type="text/html",
    )


async def pattern_execution_verification(_request: Request) -> FileResponse:
    """Return deterministic verification of action execution evidence."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-verification.html",
        media_type="text/html",
    )


async def pattern_execution_decision(_request: Request) -> FileResponse:
    """Return the explicit deterministic decision over execution verification."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-decision.html",
        media_type="text/html",
    )


async def pattern_execution_follow_up(_request: Request) -> FileResponse:
    """Return the explicit deterministic route after an execution decision."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-follow-up.html",
        media_type="text/html",
    )


async def pattern_execution_retrospective(_request: Request) -> FileResponse:
    """Return the deterministic retrospective of a completed execution cycle."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-retrospective.html",
        media_type="text/html",
    )


async def pattern_execution_learning(_request: Request) -> FileResponse:
    """Return structured learning derived from a completed retrospective."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-learning.html",
        media_type="text/html",
    )


async def pattern_execution_adaptation(_request: Request) -> FileResponse:
    """Return a deterministic proposal for adapting future pattern execution."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-adaptation.html",
        media_type="text/html",
    )


async def pattern_execution_adaptation_validation(_request: Request) -> FileResponse:
    """Return an evidence-bound validation of one completed adaptation."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-adaptation-validation.html",
        media_type="text/html",
    )


async def pattern_execution_adaptation_promotion(_request: Request) -> FileResponse:
    """Return the deterministic promotion decision for a validated adaptation."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-adaptation-promotion.html",
        media_type="text/html",
    )


async def pattern_execution_adaptation_rollout(_request: Request) -> FileResponse:
    """Return the controlled rollout of one promoted adaptation."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-adaptation-rollout.html",
        media_type="text/html",
    )


async def pattern_execution_adaptation_rollout_evaluation(_request: Request) -> FileResponse:
    """Return the evidence-bound evaluation of one completed adaptation rollout."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-adaptation-rollout-evaluation.html",
        media_type="text/html",
    )


async def pattern_execution_adaptation_closure(_request: Request) -> FileResponse:
    """Return the evidence-bound final closure of one adaptation cycle."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-execution-adaptation-closure.html",
        media_type="text/html",
    )


async def pattern_evolution_initiation(_request: Request) -> FileResponse:
    """Return the evidence-bound initiation of a new pattern evolution cycle."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-evolution-initiation.html",
        media_type="text/html",
    )


async def pattern_evolution_proposal(_request: Request) -> FileResponse:
    """Return a traceable proposal based on one approved evolution initiation."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-evolution-proposal.html",
        media_type="text/html",
    )


async def pattern_evolution_proposal_review(_request: Request) -> FileResponse:
    """Return an independent deterministic review of one submitted proposal."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-evolution-proposal-review.html",
        media_type="text/html",
    )


async def pattern_evolution_decision(_request: Request) -> FileResponse:
    """Return the deterministic governance decision for one reviewed proposal."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-evolution-decision.html",
        media_type="text/html",
    )


async def pattern_evolution_execution(_request: Request) -> FileResponse:
    """Return the deterministic execution envelope for one authorized decision."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-evolution-execution.html",
        media_type="text/html",
    )


async def pattern_evolution_execution_verification(_request: Request) -> FileResponse:
    """Return the deterministic verification of one terminal evolution execution."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-evolution-execution-verification.html",
        media_type="text/html",
    )


async def pattern_evolution_acceptance(_request: Request) -> FileResponse:
    """Return the deterministic governance acceptance for one verified evolution."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-evolution-acceptance.html",
        media_type="text/html",
    )


async def pattern_evolution_closure(_request: Request) -> FileResponse:
    """Return the deterministic administrative closure for one evolution cycle."""

    return FileResponse(
        STATIC_DIRECTORY / "pattern-evolution-closure.html",
        media_type="text/html",
    )


async def extract_pattern_pdf(request: Request) -> JSONResponse:
    """Extract only the local text layer of one PDF."""

    payload = await request.body()
    if getattr(request.state, "body_too_large", False) or len(payload) > MAX_PDF_BYTES:
        return _error_response(
            413,
            code="file_too_large",
            message="PDF exceeds the safe local extraction size limit.",
        )
    try:
        return JSONResponse(extract_pdf_text(payload))
    except PdfExtractionError as error:
        return _error_response(422, code=error.code, message=error.message)


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


def create_app(
    settings: RuntimeSettings | None = None,
    *,
    vision_gateway: VisionReviewGateway | None = None,
    garment_reference_gateway: GarmentReferenceGateway | None = None,
) -> Starlette:
    """Create the public YarnAI HTTP application."""

    runtime_settings = settings or RuntimeSettings.from_environment()
    routes = [
        Route("/", user_interface, methods=["GET"]),
        Route("/saved-projects", saved_projects, methods=["GET"]),
        Route("/user-workspace-entry", user_workspace_entry, methods=["GET"]),
        Route("/swatch-assistant", swatch_assistant, methods=["GET"]),
        Route("/project-calculation-entry", project_calculation_entry, methods=["GET"]),
        Route("/project-execution-plan", project_execution_plan, methods=["GET"]),
        Route("/project-execution-start", project_execution_start, methods=["GET"]),
        Route("/project-execution-first-step", project_execution_first_step, methods=["GET"]),
        Route("/project-execution-next-step", project_execution_next_step, methods=["GET"]),
        Route("/project-execution-next-step-clarification", project_execution_next_step_clarification, methods=["GET"]),
        Route("/project-foundation-section-preparation", foundation_section_execution_preparation, methods=["GET"]),
        Route("/project-foundation-section-execution", foundation_section_execution, methods=["GET"]),
        Route("/project-foundation-section-measurement", foundation_section_measurement, methods=["GET"]),
        Route("/project-primary-fabric-preparation", primary_fabric_preparation, methods=["GET"]),
        Route("/project-primary-fabric-execution", primary_fabric_execution, methods=["GET"]),
        Route("/project-primary-fabric-measurement", primary_fabric_measurement, methods=["GET"]),
        Route("/project-next-section-planning", project_next_section_planning, methods=["GET"]),
        Route("/project-construction-strategy-planning", project_construction_strategy_planning, methods=["GET"]),
        Route("/project-shaping-policy-planning", project_shaping_policy_planning, methods=["GET"]),
        Route("/project-sleeve-geometry-planning", project_sleeve_target_geometry_planning, methods=["GET"]),
        Route("/project-sleeve-physical-execution", project_sleeve_physical_execution, methods=["GET"]),
        Route("/project-sleeve-pair-validation", project_sleeve_pair_validation, methods=["GET"]),
        Route("/project-body-underarm-physical-confirmation", project_body_underarm_physical_confirmation, methods=["GET"]),
        Route("/project-underarm-allocation-planning", project_underarm_allocation_planning, methods=["GET"]),
        Route("/project-join-layout-planning", project_join_layout_planning, methods=["GET"]),
        Route("/project-underarm-allocation-execution", project_underarm_allocation_execution, methods=["GET"]),
        Route("/project-raglan-interface-planning", project_raglan_interface_planning, methods=["GET"]),
        Route("/project-body-sleeves-join-execution", project_body_sleeves_join_execution, methods=["GET"]),
        Route("/project-yoke-target-geometry-planning", project_yoke_target_geometry_planning, methods=["GET"]),
        Route("/project-raglan-shaping-schedule-planning", project_raglan_shaping_schedule_planning, methods=["GET"]),
        Route("/project-raglan-shaping-execution", project_raglan_shaping_execution, methods=["GET"]),
        Route("/project-neckline-opening-planning", project_neckline_opening_planning, methods=["GET"]),
        Route("/project-neckline-opening-execution", project_neckline_opening_execution, methods=["GET"]),
        Route("/project-realized-finishable-edge-evidence", project_realized_finishable_edge_evidence, methods=["GET"]),
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
            "/garment-reference-analysis",
            garment_reference_analysis,
            methods=["GET"],
        ),
        Route(
            "/manual-calculation-intake",
            manual_calculation_intake,
            methods=["GET"],
        ),
        Route("/garment-polo-execution", garment_polo_execution, methods=["GET"]),
        Route(
            "/garment-reference-happy-path-fixture",
            garment_reference_happy_path_fixture,
            methods=["GET"],
        ),
        Route(
            "/pattern-analysis",
            pattern_analysis,
            methods=["GET"],
        ),
        Route(
            "/pattern-content-extraction",
            pattern_content_extraction,
            methods=["GET"],
        ),
        Route(
            "/pattern-semantic-analysis",
            pattern_semantic_analysis,
            methods=["GET"],
        ),
        Route(
            "/pattern-analysis-review",
            pattern_analysis_review,
            methods=["GET"],
        ),
        Route(
            "/pattern-technology-draft",
            pattern_technology_draft,
            methods=["GET"],
        ),
        Route(
            "/pattern-technology-review",
            pattern_technology_review,
            methods=["GET"],
        ),
        Route(
            "/pattern-source-instruction-evidence",
            pattern_source_instruction_evidence,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-plan",
            pattern_execution_plan,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-print",
            pattern_execution_print,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-session",
            pattern_execution_session,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-step",
            pattern_execution_step,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-checkpoint",
            pattern_execution_checkpoint,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-progress",
            pattern_execution_progress,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-completion",
            pattern_execution_completion,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-result",
            pattern_execution_result,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-runtime",
            pattern_execution_runtime,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-monitoring",
            pattern_execution_monitoring,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-intervention",
            pattern_execution_intervention,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-action",
            pattern_execution_action,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-evidence",
            pattern_execution_evidence,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-verification",
            pattern_execution_verification,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-decision",
            pattern_execution_decision,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-follow-up",
            pattern_execution_follow_up,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-retrospective",
            pattern_execution_retrospective,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-learning",
            pattern_execution_learning,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-adaptation",
            pattern_execution_adaptation,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-adaptation-validation",
            pattern_execution_adaptation_validation,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-adaptation-promotion",
            pattern_execution_adaptation_promotion,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-adaptation-rollout",
            pattern_execution_adaptation_rollout,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-adaptation-rollout-evaluation",
            pattern_execution_adaptation_rollout_evaluation,
            methods=["GET"],
        ),
        Route(
            "/pattern-execution-adaptation-closure",
            pattern_execution_adaptation_closure,
            methods=["GET"],
        ),
        Route(
            "/pattern-evolution-initiation",
            pattern_evolution_initiation,
            methods=["GET"],
        ),
        Route(
            "/pattern-evolution-proposal",
            pattern_evolution_proposal,
            methods=["GET"],
        ),
        Route(
            "/pattern-evolution-proposal-review",
            pattern_evolution_proposal_review,
            methods=["GET"],
        ),
        Route(
            "/pattern-evolution-decision",
            pattern_evolution_decision,
            methods=["GET"],
        ),
        Route(
            "/pattern-evolution-execution",
            pattern_evolution_execution,
            methods=["GET"],
        ),
        Route(
            "/pattern-evolution-execution-verification",
            pattern_evolution_execution_verification,
            methods=["GET"],
        ),
        Route(
            "/pattern-evolution-acceptance",
            pattern_evolution_acceptance,
            methods=["GET"],
        ),
        Route(
            "/pattern-evolution-closure",
            pattern_evolution_closure,
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
        Route(
            "/api/v1/pattern-content-extraction/pdf",
            extract_pattern_pdf,
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
    routes.extend(
        VisionReviewHttpApi(
            vision_gateway or configured_gateway(),
        ).routes()
    )
    routes.extend(
        GarmentReferenceHttpApi(
            garment_reference_gateway or GarmentReferenceGateway(),
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
