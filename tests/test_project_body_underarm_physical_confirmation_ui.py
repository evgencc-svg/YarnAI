from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "018f4f62-cd68-7abc-8def-0123456789ab"


def test_stage82_route_and_assets_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-body-underarm-physical-confirmation?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="body-underarm-confirmation-root"' in response.text
    assert "Корпус сейчас физически довязан до линии подрезов" in response.text
    for asset in (
        "project-body-underarm-physical-confirmation.js",
        "project-body-underarm-physical-confirmation-application.js",
        "project-body-underarm-physical-confirmation-workspace.js",
        "project-body-underarm-physical-confirmation-assistant.js",
        "project-body-underarm-physical-confirmation.css",
        "stage82-happy-path-fixture.html",
        "stage82-happy-path-fixture.js",
    ):
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage82_ui_collects_physical_observation_without_user_arithmetic_or_join() -> None:
    html = (STATIC / "project-body-underarm-physical-confirmation.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-body-underarm-physical-confirmation-workspace.js").read_text(encoding="utf-8")
    assert 'name="actualBodyHeightAtUnderarmCm"' in html
    assert 'name="actualBodyFullTubeStitchCount"' in html
    assert "вручную посчитайте все живые петли" in html
    assert "не сняты, детали не соединены" in html
    assert "combinedYoke" not in html + workspace
    assert "joinPreparation" not in html
    assert "fingerprint" not in html.lower()
    assert "operationId" not in html


def test_stage82_bootstrap_accepts_exactly_one_safe_project_parameter() -> None:
    workspace = (STATIC / "project-body-underarm-physical-confirmation-workspace.js").read_text(encoding="utf-8")
    assert 'params.getAll("project").length === 1' in workspace
    assert '[...params.keys()].length === 1' in workspace
    assert "UUID_V7.test" in workspace
    assert "encodeURIComponent(projectId)" in workspace


def test_stage81_navigation_exposes_stage82_only_from_completed_acceptance() -> None:
    html = (STATIC / "project-sleeve-pair-validation.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-sleeve-pair-validation-workspace.js").read_text(encoding="utf-8")
    assert 'id="body-underarm-confirmation-link"' in html
    assert "next.pairValidationBoundary?.completed === true" in workspace
    assert "!rework" in workspace
    assert "/project-body-underarm-physical-confirmation?project=" in workspace


def test_stage82_fixture_uses_production_controllers_and_supports_upstream_replacement() -> None:
    fixture = (STATIC / "stage82-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "YarnAIStage81HappyPathFixture" in fixture
    assert "confirmAlreadyAtBoundary" in fixture
    assert "editResultDraft" in fixture
    assert "completeConfirmation" in fixture
    assert "startComponentRework" in fixture
    assert "saveProjectBodyUnderarmPhysicalConfirmation" not in fixture
    assert "ensureCalculationProgress" not in fixture
