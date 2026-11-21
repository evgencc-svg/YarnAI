from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "018f4f62-cd68-7abc-8def-0123456789ab"


def test_stage81_route_assets_and_project_scoped_bootstrap_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-sleeve-pair-validation?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="sleeve-pair-validation-root"' in response.text
    assert "Проверить два готовых рукава" in response.text
    for asset in (
        "project-sleeve-pair-validation.js",
        "project-sleeve-pair-validation-application.js",
        "project-sleeve-pair-validation-workspace.js",
        "project-sleeve-pair-validation-assistant.js",
        "project-sleeve-pair-validation.css",
        "stage81-happy-path-fixture.html",
        "stage81-happy-path-fixture.js",
    ):
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage81_ui_reuses_actuals_and_exposes_explicit_accept_or_rework_only() -> None:
    html = (STATIC / "project-sleeve-pair-validation.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-sleeve-pair-validation-workspace.js").read_text(encoding="utf-8")
    assert "actualCuffToUnderarmLengthCm" not in html
    assert 'name="acceptanceNote"' in html
    assert 'name="sleeve_1"' in html and 'name="sleeve_2"' in html
    assert "±" not in workspace
    assert "joinPreparation" not in html
    assert "polo" not in (html + workspace).lower()


def test_stage80_navigates_to_stage81_only_after_pair_ready_projection() -> None:
    html = (STATIC / "project-sleeve-physical-execution.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-sleeve-physical-execution-workspace.js").read_text(encoding="utf-8")
    assert 'id="sleeve-pair-validation-link"' in html
    assert "awaiting_pair_validation" in workspace
    assert "/project-sleeve-pair-validation?project=" in workspace


def test_stage81_fixture_builds_results_and_decisions_through_production_apis() -> None:
    fixture = (STATIC / "stage81-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "YarnAIStage80HappyPathFixture" in fixture
    assert "completeComponent" in fixture
    assert "startPairReview" in fixture
    assert "completePairDecision" in fixture
    assert "saveProjectSleevePairValidation" not in fixture
    assert "ensureCalculationProgress" not in fixture
