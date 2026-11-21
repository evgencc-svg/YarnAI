from pathlib import Path

from fastapi.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "019fc3ba-4100-71c3-b7f9-bd06e3bff304"


def test_project_execution_start_route_and_assets_return_200() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-execution-start?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="execution-start-button"' in response.text
    assert 'id="execution-start-acknowledgment"' in response.text
    for asset in (
        "project-execution-start.css",
        "project-execution-start.js",
        "project-execution-start-workspace.js",
        "project-execution-start-assistant.js",
    ):
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage66_is_project_scoped_and_handles_bad_query_in_ui() -> None:
    client = TestClient(create_app())
    for query in ("", "?project=bad"):
        response = client.get(f"/project-execution-start{query}")
        assert response.status_code == 200
        assert 'id="execution-start-blocked"' in response.text
    workspace = (STATIC / "project-execution-start-workspace.js").read_text(encoding="utf-8")
    assert 'target.location.pathname !== "/project-execution-start"' in workspace
    assert "projectIdentityFromLocation" in workspace


def test_stage66_does_not_break_completed_routes() -> None:
    client = TestClient(create_app())
    for route in (
        "/saved-projects",
        f"/project-execution-plan?project={PROJECT}",
        f"/project-calculation-entry?project={PROJECT}",
        f"/swatch-assistant?project={PROJECT}",
    ):
        assert client.get(route).status_code == 200


def test_stage66_accessibility_contract_is_present() -> None:
    html = (STATIC / "project-execution-start.html").read_text(encoding="utf-8")
    css = (STATIC / "project-execution-start.css").read_text(encoding="utf-8")
    assert 'aria-live="polite"' in html
    assert 'aria-live="assertive"' in html
    assert 'tabindex="-1"' in html
    assert ":focus-visible" in css
    assert "button:disabled" in css
    assert "status-chip" in html
