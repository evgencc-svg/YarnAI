from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "018f4f62-cd68-7abc-8def-0123456789ab"


def test_stage84_route_and_assets_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-join-layout-planning?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="join-layout-root"' in response.text
    assert "Какая часть начинается сразу после маркера начала ряда на корпусе?" in response.text
    for asset in (
        "project-join-layout-planning.js",
        "project-join-layout-planning-application.js",
        "project-join-layout-planning-workspace.js",
        "project-join-layout-planning-assistant.js",
        "project-join-layout-planning.css",
        "stage84-happy-path-fixture.html",
        "stage84-happy-path-fixture.js",
    ):
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage84_ui_collects_one_human_decision_at_a_time_and_stays_planning_only() -> None:
    html = (STATIC / "project-join-layout-planning.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-join-layout-planning-workspace.js").read_text(encoding="utf-8")
    assert html.count('data-layout-question="') == 3
    assert 'name="bodyAnchor"' in html
    assert 'name="sleeve1Side"' in html
    assert 'name="oddBodyExtraSection"' in html
    assert 'for (const node of doc.querySelectorAll("[data-layout-question]"))' in workspace
    assert "не снимайте петли" in html
    assert "не переносите их на держатели" in html
    assert "детали не соединены" in html
    assert "fingerprint" not in html.lower()
    assert "operationId" not in html
    assert 'id="underarm-allocation-execution-link"' in html
    assert "/project-underarm-allocation-execution" in html


def test_stage83_navigation_exposes_stage84_only_after_completion() -> None:
    html = (STATIC / "project-underarm-allocation-planning.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-underarm-allocation-planning-workspace.js").read_text(encoding="utf-8")
    assert 'id="join-layout-planning-link"' in html
    assert 'next.lifecycle === "completed"' in workspace
    assert "/project-join-layout-planning?project=" in workspace


def test_stage84_bootstrap_accepts_exactly_one_safe_project_parameter() -> None:
    workspace = (STATIC / "project-join-layout-planning-workspace.js").read_text(encoding="utf-8")
    assert 'params.getAll("project").length === 1' in workspace
    assert '[...params.keys()].length === 1' in workspace
    assert "UUID_V7.test" in workspace
    assert "encodeURIComponent(projectId)" in workspace


def test_stage84_fixture_uses_production_controllers_and_covers_staleness_and_rework() -> None:
    fixture = (STATIC / "stage84-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "YarnAIStage83HappyPathFixture" in fixture
    assert "startJoinLayoutPlanning" in fixture
    assert "answerLayoutDecision" in fixture
    assert "completePlan" in fixture
    assert "startAllocationRework" in fixture
    assert "startLayoutRework" in fixture
    assert 'options.scenario === "missing-layout-decision"' in fixture
    assert "stage84-layout-partition-invalid" in fixture
    assert "saveProjectJoinLayoutPlanning" not in fixture


def test_stage84_exposes_the_now_implemented_stage85_route_only_after_completion() -> None:
    html = (STATIC / "project-join-layout-planning.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-join-layout-planning-workspace.js").read_text(encoding="utf-8")
    http = (Path(__file__).parents[1] / "src" / "yarnai" / "http.py").read_text(encoding="utf-8")
    assert 'id="underarm-allocation-execution-link"' in html
    assert 'next.lifecycle === "completed"' in workspace
    assert "/project-underarm-allocation-execution?project=" in workspace
    assert 'Route("/project-underarm-allocation-execution"' in http
