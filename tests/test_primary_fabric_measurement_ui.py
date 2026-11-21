from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app, create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "0198a6c0-0000-7000-8000-000000000075"


def test_primary_fabric_measurement_route_serves_production_workspace() -> None:
    response = TestClient(app).get(
        f"/project-primary-fabric-measurement?project={PROJECT}"
    )
    assert response.status_code == 200
    assert 'id="primary-fabric-measurement-root"' in response.text
    assert "/static/primary-fabric-measurement.js" in response.text
    assert "/static/primary-fabric-measurement-workspace.js" in response.text


def test_measurement_screen_exposes_physical_contract_and_fails_closed() -> None:
    html = (STATIC / "primary-fabric-measurement.html").read_text(encoding="utf-8")
    css = (STATIC / "primary-fabric-measurement.css").read_text(encoding="utf-8")
    workspace = (STATIC / "primary-fabric-measurement-workspace.js").read_text(
        encoding="utf-8"
    )
    assert "Измерьте высоту основного полотна" in html
    assert "Высота основного полотна" in html
    assert "inputmode=\"decimal\"" in html
    assert "Подтвердить измерение" in html
    assert "Продолжить основное полотно" in html
    assert 'id="primary-fabric-measurement-content" hidden' in html
    assert "30 см" not in html
    assert "Stage 76" not in html
    assert "[hidden] { display: none !important; }" in css
    assert "completeMeasurement" in workspace
    assert "reviewMeasurement" not in workspace


def test_stage74_paused_cta_targets_stage75_and_static_cta_is_hidden() -> None:
    html = (STATIC / "primary-fabric-execution.html").read_text(encoding="utf-8")
    workspace = (STATIC / "primary-fabric-execution-workspace.js").read_text(
        encoding="utf-8"
    )
    assert 'id="primary-fabric-execution-measure"' in html
    assert 'href="/saved-projects" hidden>Измерить высоту</a>' in html
    assert "/project-primary-fabric-measurement?project=" in workspace
    assert "ui.measure.hidden = !paused" in workspace
    saved_projects = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    assert saved_projects.index("primary-fabric-measurement.js") < saved_projects.index(
        "user-workspace-entry.js"
    )


def test_stage75_fixture_and_assets_are_served() -> None:
    client = TestClient(create_app())
    for path in (
        "/static/stage75-happy-path-fixture.html",
        "/static/stage75-happy-path-fixture.js",
        "/static/primary-fabric-measurement.css",
    ):
        assert client.get(path).status_code == 200
    script = (STATIC / "stage75-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "seedStage74HappyPath" in script
    assert "ensurePrimaryFabricExecution" in script
    assert "updatePrimaryFabricExecution" in script
    assert "indexedDB" not in script
    assert "objectStore" not in script
