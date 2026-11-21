from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app, create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "0198a6c0-0000-7000-8000-000000000074"


def test_primary_fabric_execution_route_serves_production_workspace():
    # Exercise the exported singleton used by ``uvicorn yarnai.http:app``, not
    # only a freshly-created test application.
    response = TestClient(app).get(f"/project-primary-fabric-execution?project={PROJECT}")
    assert response.status_code == 200
    assert response.text != "Not Found"
    assert 'id="primary-fabric-execution-root"' in response.text
    assert "/static/primary-fabric-execution.js" in response.text
    assert "/static/primary-fabric-execution-workspace.js" in response.text


def test_execution_screen_has_lifecycle_controls_without_subjective_completion():
    html = (STATIC / "primary-fabric-execution.html").read_text(encoding="utf-8")
    assert "Свяжите основное полотно" in html
    assert ">Начать<" in html
    assert ">Приостановить<" in html
    assert ">Продолжить<" in html
    assert "30 см связано" not in html
    assert "stage74" not in html.lower()


def test_stage74_fixture_and_production_assets_are_served():
    client = TestClient(create_app())
    for path in ("/static/stage74-happy-path-fixture.html", "/static/stage74-happy-path-fixture.js", "/static/primary-fabric-execution.css"):
        assert client.get(path).status_code == 200


def test_stage74_fixture_destination_is_a_registered_production_route():
    fixture = (STATIC / "stage74-happy-path-fixture.js").read_text(encoding="utf-8")
    route_paths = {getattr(route, "path", None) for route in app.routes}
    assert "/project-primary-fabric-execution" in route_paths
    assert "`${origin}${stage74.ROUTE_PATH}?project=${projectId}`" in fixture
    assert "primary-fabric-execution.html?project=" not in fixture


def test_static_html_is_fail_closed_before_and_after_bootstrap():
    html = (STATIC / "primary-fabric-execution.html").read_text(encoding="utf-8")
    css = (STATIC / "primary-fabric-execution.css").read_text(encoding="utf-8")
    assistant = (STATIC / "primary-fabric-execution-assistant.js").read_text(encoding="utf-8")
    assert 'id="primary-fabric-execution-content" hidden' in html
    assert 'id="primary-fabric-execution-start" class="button primary" type="button" hidden disabled' in html
    assert "[hidden] { display: none !important; }" in css
    assert 'location.pathname !== "/project-primary-fabric-execution"' not in assistant
