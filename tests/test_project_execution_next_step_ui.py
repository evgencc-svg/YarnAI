import re
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "019fc4aa-5100-7001-8af9-bd06e3bff101"


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def test_stage68_route_and_assets_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-execution-next-step?project={PROJECT}")
    assert response.status_code == 200
    assert "Следующий шаг" in response.text
    for asset in (
        "project-execution-next-step.css",
        "project-execution-next-step.js",
        "project-execution-next-step-workspace.js",
        "project-execution-next-step-assistant.js",
    ):
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage68_csp_bootstrap_uses_external_script_only() -> None:
    html = read("project-execution-next-step.html")
    scripts = re.findall(r"<script\b([^>]*)>(.*?)</script>", html, flags=re.IGNORECASE | re.DOTALL)
    assert scripts
    assert all(re.search(r"\bsrc\s*=", attributes) and not body.strip() for attributes, body in scripts)
    assert '/static/project-execution-next-step-assistant.js' in html
    assistant = read("project-execution-next-step-assistant.js")
    workspace = read("project-execution-next-step-workspace.js")
    assert 'addEventListener("DOMContentLoaded", startController' in assistant
    assert 'createController' in assistant
    assert 'addEventListener("pageshow", handlePageShow)' in workspace


def test_stage68_ui_is_human_facing_and_accessible() -> None:
    html = read("project-execution-next-step.html")
    css = read("project-execution-next-step.css")
    assert "Stage 68" not in html
    assert "PROJECT_EXECUTION_NEXT_STEP_PREPARATION" not in html
    assert 'aria-live="polite"' in html
    assert 'role="alert"' in html
    assert 'tabindex="-1"' in html
    assert ":focus-visible" in css
    assert "overflow-wrap" in css


def test_stage68_uses_immutable_sources_and_no_legacy_execution_routes() -> None:
    domain = read("project-execution-next-step.js")
    workspace = read("project-execution-next-step-workspace.js")
    production = domain + workspace
    assert "PROJECT_EXECUTION_FIRST_STEP" in domain
    assert "PROJECT_EXECUTION_START" in domain
    assert "PROJECT_EXECUTION_PLAN_PREPARATION" in domain
    assert "PATTERN_EXECUTION_SESSION" not in production
    assert "FIRST_FABRIC_SECTION" not in production
    assert "live draft" not in production.lower()


def test_stage68_unavailable_screen_keeps_completed_cast_on_and_exposes_conditional_clarification() -> None:
    html = read("project-execution-next-step.html")
    workspace = read("project-execution-next-step-workspace.js")
    domain = read("project-execution-next-step.js")
    assert "Набор петель завершён" in html
    assert "Нужно подготовить следующий шаг" in workspace
    assert "петель подтверждено" in workspace
    assert "повторять набор не нужно" in workspace
    assert "Мои проекты" in html
    assert "execution-next-step-clarify" in html
    assert 'snapshot.reasonCode !== "NEXT_STEP_CONDITIONAL"' in workspace
    assert 'assessment.reasonCode === "NEXT_STEP_CONDITIONAL"' in domain


def test_stage68_timestamps_are_formatted_before_rendering() -> None:
    workspace = read("project-execution-next-step-workspace.js")
    assert "formatUserTimestamp" in workspace
    assert "formatTimestamp(snapshot.timestamps.preparedAt)" in workspace
    assert "textContent = snapshot.timestamps." not in workspace


def test_stage67_and_saved_projects_navigate_to_stage68() -> None:
    first_step = read("project-execution-first-step.js")
    first_step_html = read("project-execution-first-step.html")
    saved = read("user-workspace-entry.js")
    saved_html = read("first-user-flow.html")
    assert "/project-execution-next-step?project=${encodeURIComponent(validateProjectIdentity(projectIdentity))}" in first_step
    assert "execution-first-step-next-step" in first_step_html
    assert 'projectRoute("/project-execution-next-step", projectId)' in saved
    assert "/static/project-execution-next-step.js" in saved_html


def test_direct_route_requires_project_query_in_controller() -> None:
    workspace = read("project-execution-next-step-workspace.js")
    assert 'rawProject === null' in workspace
    assert 'target.location.pathname !== "/project-execution-next-step"' in workspace
    assert 'domain.diagnostic("PROJECT_ID_REQUIRED")' in workspace
    assert 'domain.diagnostic("PROJECT_ID_INVALID")' in workspace
