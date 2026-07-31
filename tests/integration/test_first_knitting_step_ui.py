from __future__ import annotations

from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai.http as http_api


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


def test_calculator_contains_structured_first_step_block() -> None:
    html = (STATIC / "index.html").read_text(encoding="utf-8")

    for element_id in (
        "first-step-panel",
        "first-step-title",
        "first-step-instruction",
        "first-step-stitch-count",
        "first-step-working-width",
        "first-step-gauge",
        "first-step-warnings",
        "first-step-checklist",
        "start-first-step-button",
    ):
        assert f'id="{element_id}"' in html
    assert "Первый шаг" in html
    assert "Что подготовить" in html
    assert "Начать вязание" in html


def test_stage7_javascript_modules_are_connected_and_available(
    client: TestClient,
) -> None:
    calculator = client.get("/calculator")
    assistant = client.get("/step-assistant")

    assert calculator.status_code == 200
    assert assistant.status_code == 200
    assert "/static/first-knitting-step.js" in calculator.text
    assert "/static/project-system.js" in assistant.text
    assert "/static/first-knitting-step.js" in assistant.text
    assert client.get("/static/first-knitting-step.js").status_code == 200
    assert client.get("/static/step-assistant.js").status_code == 200


def test_existing_routes_remain_available(client: TestClient) -> None:
    for route in (
        "/",
        "/calculator",
        "/about",
        "/example",
        "/smart-start",
        "/step-assistant",
        "/test",
        "/feedback",
        "/health",
    ):
        assert client.get(route).status_code == 200


def test_first_step_uses_saved_engine_result_without_html_math() -> None:
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    first_step_script = (STATIC / "first-knitting-step.js").read_text(
        encoding="utf-8"
    )
    app_script = (STATIC / "app.js").read_text(encoding="utf-8")

    assert "selected_candidate" in first_step_script
    assert "working_count" in first_step_script
    assert "density_per_cm" in first_step_script
    assert "firstKnittingStep.ensureForProject" in app_script
    assert "Math.round" not in first_step_script
    assert "100 петель" not in html
    assert "50 см при плотности" not in html


def test_step_assistant_exposes_project_progress_and_explicit_completion() -> None:
    html = (STATIC / "step-assistant.html").read_text(encoding="utf-8")
    script = (STATIC / "step-assistant.js").read_text(encoding="utf-8")

    for element_id in (
        "assistant-project-title",
        "assistant-step-instruction",
        "stitch-target",
        "stitch-completed",
        "stitch-remaining",
        "next-stitch-button",
        "back-stitch-button",
        "next-row-button",
        "next-technology-message",
        "assistant-project-link",
    ):
        assert f'id="{element_id}"' in html
    assert "changeCurrentCount" in script
    assert "completeForProject" in script
    assert "status === \"completed\"" in script
    assert "Следующий этап технологии пока не сформирован" in html
