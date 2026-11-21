from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "019fc3ba-4100-71c3-b7f9-bd06e3bff304"


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def test_project_execution_first_step_route_and_assets_return_200() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-execution-first-step?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="execution-first-step-root"' in response.text
    for asset in (
        "project-execution-first-step.css",
        "project-execution-first-step.js",
        "project-execution-first-step-workspace.js",
        "project-execution-first-step-assistant.js",
    ):
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage67_route_is_registered_and_controller_is_project_scoped() -> None:
    app = create_app()
    route_paths = {getattr(route, "path", None) for route in app.routes}
    assert "/project-execution-first-step" in route_paths
    workspace = read("project-execution-first-step-workspace.js")
    assert 'target.location.pathname !== "/project-execution-first-step"' in workspace
    assert "projectIdentityFromLocation" in workspace
    assert "system.isUuidv7" in workspace
    assert "assessAggregateReadiness" in workspace


def test_stage67_accessibility_and_form_contract() -> None:
    html = read("project-execution-first-step.html")
    css = read("project-execution-first-step.css")
    assert 'aria-live="polite"' in html
    assert 'role="alert"' in html
    assert 'tabindex="-1"' in html
    assert '<label for="execution-first-step-count">' in html
    assert 'id="execution-first-step-count"' in html
    assert 'type="number"' in html
    assert 'step="1"' in html
    assert 'for="execution-first-step-confirmation"' in html
    assert "Я пересчитал(а): на спицах 100 петель" in html
    assert ":focus-visible" in css
    assert ".button:disabled" in css
    assert "@media (max-width: 440px)" in css


def test_stage67_navigation_is_local_allowlisted_and_has_no_legacy_assets() -> None:
    html = read("project-execution-first-step.html")
    domain = read("project-execution-first-step.js")
    workspace = read("project-execution-first-step-workspace.js")
    production = html + domain + workspace + read("project-execution-first-step-assistant.js")
    assert 'href="/saved-projects"' in html
    assert "/static/project-execution-first-step.js" in html
    assert "/static/project-execution-first-step-workspace.js" in html
    assert "/static/project-execution-first-step-assistant.js" in html
    assert "/static/project-execution-first-step.css" in html
    assert 'new Set(["/project-execution-next-step", "/project-execution-first-step", "/project-execution-start"])' in domain
    assert "INVALID_NEXT_DESTINATION" in domain
    assert "/pattern-execution-session" not in production
    assert "/static/pattern-execution-session" not in production
    assert "/static/pattern-execution-step" not in production


def test_stage67_heading_uses_user_facing_step_type_without_internal_stage_labels() -> None:
    workspace = read("project-execution-first-step-workspace.js")
    html = read("project-execution-first-step.html")
    assert 'CAST_ON: "Набор петель"' in workspace
    assert "ui.title.textContent = userFacingStepTitle(snapshot.step)" in workspace
    assert "aggregate?.project?.title || context.product" not in workspace
    visible_surface = html + workspace + read("project-execution-first-step.js")
    for internal_stage in ("Stage 63", "Stage 65", "Stage 66"):
        assert internal_stage not in visible_surface


def test_stage66_exposes_separate_stage67_action_and_keeps_saved_projects_link() -> None:
    html = read("project-execution-start.html")
    workspace = read("project-execution-start-workspace.js")
    assert 'id="execution-start-first-step-link"' in html
    assert "Перейти к первому шагу" in html
    assert 'id="execution-start-started-back"' in html
    assert 'href="/saved-projects"' in html
    assert 'hrefFor(domain, "/project-execution-first-step", projectId)' in workspace
    assert 'ui.startedBack.href = "/saved-projects"' in workspace


def test_saved_projects_loads_stage67_navigation_without_old_execution_dependencies() -> None:
    html = read("first-user-flow.html")
    controller = read("user-workspace-entry-assistant.js")
    presentation = read("user-workspace-entry.js")
    assert "/static/project-execution-first-step.js" in html
    assert "/static/project-execution-first-step-workspace.js" in html
    assert "workspace_stage67_status" in controller
    assert 'projectRoute("/project-execution-first-step", projectId)' in presentation
    assert "PROJECT_EXECUTION_FIRST_STEP" in presentation


def test_direct_bad_stage67_urls_remain_ui_blocked_not_server_errors() -> None:
    client = TestClient(create_app())
    for suffix in ("", "?project=bad"):
        response = client.get(f"/project-execution-first-step{suffix}")
        assert response.status_code == 200
        assert 'id="execution-first-step-blocked"' in response.text
