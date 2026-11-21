from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).resolve().parents[1] / "src" / "yarnai" / "static"
PROJECT = "0198a6c0-0000-7000-8000-000000000076"


def test_production_route_and_assets_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-next-section-planning?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="next-section-planning-root"' in response.text
    assert "Основное полотно готово. Подготовим следующий этап изделия." in response.text
    assert "Stage 76" not in response.text
    for path in (
        "/static/project-next-section-planning.js",
        "/static/project-next-section-planning-workspace.js",
        "/static/project-next-section-planning-assistant.js",
        "/static/project-next-section-planning.css",
        "/static/stage76-happy-path-fixture.html",
        "/static/stage76-happy-path-fixture.js",
    ):
        assert client.get(path).status_code == 200


def test_stage75_navigation_is_planning_only() -> None:
    html = (STATIC / "primary-fabric-measurement.html").read_text(encoding="utf-8")
    workspace = (STATIC / "primary-fabric-measurement-workspace.js").read_text(encoding="utf-8")
    assert "Подготовить следующий этап" in html
    assert "`/project-next-section-planning?project=${encodeURIComponent(projectId)}`" in workspace
    assert "Текущий immutable-план исчерпан" in workspace
    assert 'ui.reachedAction.href = `/project-primary-fabric-execution' not in workspace


def test_planning_bootstrap_is_external_and_collects_only_first_missing_input() -> None:
    html = (STATIC / "project-next-section-planning.html").read_text(encoding="utf-8")
    domain = (STATIC / "project-next-section-planning.js").read_text(encoding="utf-8")
    assert "<script>" not in html
    assert 'name="direction" value="bottom_up"' in html
    assert 'name="direction" value="top_down"' in html
    assert "construction_direction" in domain
    assert 'newPlan: null' in domain
    assert "DIRECTION_ONLY_INSUFFICIENT_FOR_SAFE_SUCCESSOR" in domain
    assert "CAST_ON" in domain and "FOUNDATION_SECTION" in domain and "PRIMARY_FABRIC" in domain


def test_fixture_opens_the_registered_production_route() -> None:
    fixture = (STATIC / "stage76-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "planning.ROUTE_PATH" in fixture
    assert "seedStage76HappyPath" in fixture
    assert "ensureProjectNextSectionPlanning" not in fixture
