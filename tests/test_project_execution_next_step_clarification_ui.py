import re
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "019fc4aa-5100-7001-8af9-bd06e3bff101"


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def test_stage69_route_and_assets_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-execution-next-step-clarification?project={PROJECT}")
    assert response.status_code == 200
    assert "Уточним следующий шаг" in response.text
    for asset in (
        "project-execution-next-step-clarification.css",
        "project-execution-next-step-clarification.js",
        "project-execution-next-step-clarification-workspace.js",
        "project-execution-next-step-clarification-assistant.js",
    ):
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage69_csp_uses_external_scripts_and_handlers_only() -> None:
    html = read("project-execution-next-step-clarification.html")
    scripts = re.findall(r"<script\b([^>]*)>(.*?)</script>", html, flags=re.IGNORECASE | re.DOTALL)
    assert scripts
    assert all(re.search(r"\bsrc\s*=", attributes) and not body.strip() for attributes, body in scripts)
    assert not re.search(r"\son\w+\s*=", html, flags=re.IGNORECASE)
    assert "/static/project-execution-next-step-clarification-assistant.js" in html


def test_stage69_visible_ui_is_human_facing_and_has_no_future_action() -> None:
    html = read("project-execution-next-step-clarification.html")
    for text in (
        "Набор петель завершён",
        "100 петель подтверждено",
        "Повторять набор не нужно",
        "Чтобы продолжить, нужно уточнить начальный участок изделия.",
        "Что вязать после набора петель?",
        "До какой высоты вязать этот участок?",
        "Подтвердить следующий шаг",
        "Мои проекты",
    ):
        assert text in html
    for technical in (
        "Stage 65",
        "Stage 68",
        "FOUNDATION_SECTION",
        "NEXT_STEP_CONDITIONAL",
        "fingerprint",
        "Stage 70",
    ):
        assert technical not in html


def test_stage69_accessibility_and_mobile_contracts() -> None:
    html = read("project-execution-next-step-clarification.html")
    css = read("project-execution-next-step-clarification.css")
    workspace = read("project-execution-next-step-clarification-workspace.js")
    assert 'role="alert"' in html
    assert 'tabindex="-1"' in html
    assert 'aria-live="polite"' in html
    assert ':focus-visible' in css
    assert '@media (max-width: 560px)' in css
    assert 'minmax(0, 1fr)' in css
    assert 'addEventListener("pageshow", handlePageShow)' in workspace
    assert "textContent" in workspace
    assert "innerHTML" not in workspace


def test_stage68_transition_is_conditional_and_saved_projects_load_stage69_assets() -> None:
    stage68 = read("project-execution-next-step.js")
    stage68_html = read("project-execution-next-step.html")
    saved_html = read("first-user-flow.html")
    saved = read("user-workspace-entry.js")
    assert 'assessment.reasonCode === "NEXT_STEP_CONDITIONAL"' in stage68
    assert "/project-execution-next-step-clarification?project=${encodeURIComponent" in stage68
    assert "execution-next-step-clarify" in stage68_html
    assert "/static/project-execution-next-step-clarification.js" in saved_html
    assert 'projectRoute("/project-execution-next-step-clarification", projectId)' in saved


def test_previous_stage_routes_still_respond_and_saved_projects_has_no_dead_future_link() -> None:
    client = TestClient(create_app())
    assert client.get(f"/project-execution-first-step?project={PROJECT}").status_code == 200
    assert client.get(f"/project-execution-next-step?project={PROJECT}").status_code == 200
    saved = client.get("/saved-projects")
    assert saved.status_code == 200
    assert "/project-execution-stage-70" not in saved.text
