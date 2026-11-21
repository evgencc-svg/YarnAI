from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "018f4f62-cd68-7abc-8def-0123456789ab"


def test_stage83_route_and_assets_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-underarm-allocation-planning?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="underarm-allocation-root"' in response.text
    assert "Какой длины должен быть один подрез после закрытия" in response.text
    for asset in (
        "project-underarm-allocation-planning.js",
        "project-underarm-allocation-planning-application.js",
        "project-underarm-allocation-planning-workspace.js",
        "project-underarm-allocation-planning-assistant.js",
        "project-underarm-allocation-planning.css",
        "stage83-happy-path-fixture.html",
        "stage83-happy-path-fixture.js",
    ):
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage83_ui_has_one_design_input_and_keeps_execution_out_of_scope() -> None:
    html = (STATIC / "project-underarm-allocation-planning.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-underarm-allocation-planning-workspace.js").read_text(encoding="utf-8")
    assert html.count('name="targetUnderarmSpanCm"') == 1
    assert 'name="targetConfirmed"' in html
    assert 'input.name = "allocationCandidate"' in workspace
    assert "петли подрезов ещё не сняты и не переведены" in html
    assert "общий счёт кокетки" in html
    assert "Соединить детали" not in html
    assert "fingerprint" not in html.lower()
    assert "operationId" not in html


def test_stage83_bootstrap_accepts_exactly_one_safe_project_parameter() -> None:
    workspace = (STATIC / "project-underarm-allocation-planning-workspace.js").read_text(encoding="utf-8")
    assert 'params.getAll("project").length === 1' in workspace
    assert '[...params.keys()].length === 1' in workspace
    assert "UUID_V7.test" in workspace
    assert "encodeURIComponent(projectId)" in workspace


def test_stage82_navigation_exposes_stage83_only_after_completion() -> None:
    html = (STATIC / "project-body-underarm-physical-confirmation.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-body-underarm-physical-confirmation-workspace.js").read_text(encoding="utf-8")
    assert 'id="underarm-allocation-planning-link"' in html
    assert 'next.lifecycle === "completed"' in workspace
    assert "/project-underarm-allocation-planning?project=" in workspace


def test_stage83_fixture_uses_production_controllers_and_covers_staleness_and_rework() -> None:
    fixture = (STATIC / "stage83-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "YarnAIStage82HappyPathFixture" in fixture
    assert "startAllocationPlanning" in fixture
    assert "setTargetUnderarmSpan" in fixture
    assert "completePlan" in fixture
    assert "startComponentRework" in fixture
    assert "startAllocationRework" in fixture
    assert "saveProjectUnderarmAllocationPlanning" not in fixture
