from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "018f4f62-cd68-7abc-8def-0123456789ab"


def test_stage80_route_assets_and_project_scoped_bootstrap_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-sleeve-physical-execution?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="sleeve-execution-root"' in response.text
    assert "Начать рукав 1 по сохранённому плану" in response.text
    for asset in (
        "project-sleeve-physical-execution.js",
        "project-sleeve-physical-execution-application.js",
        "project-sleeve-physical-execution-workspace.js",
        "project-sleeve-physical-execution-assistant.js",
        "project-sleeve-physical-execution.css",
        "stage80-happy-path-fixture.html",
        "stage80-happy-path-fixture.js",
    ):
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage80_ui_collects_actuals_without_pair_or_join_actions() -> None:
    html = (STATIC / "project-sleeve-physical-execution.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-sleeve-physical-execution-workspace.js").read_text(encoding="utf-8")
    application = (STATIC / "project-sleeve-physical-execution-application.js").read_text(encoding="utf-8")
    assert "actualUnderarmFullTubeStitchCount" in html
    assert "completionBoundary" in html
    assert "validatePair" not in workspace + application
    assert "acceptPairDeviation" not in workspace + application
    assert "joinPreparation" not in html


def test_stage80_fixture_builds_prerequisite_through_production_apis() -> None:
    fixture = (STATIC / "stage80-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "YarnAIStage79HappyPathFixture" in fixture
    assert "confirmReview" in fixture
    assert "getProjectSleevePhysicalExecution" in fixture
    assert "saveProjectSleevePhysicalExecution" not in fixture
    assert "ensureCalculationProgress" not in fixture
