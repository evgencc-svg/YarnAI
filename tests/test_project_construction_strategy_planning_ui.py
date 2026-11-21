from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).resolve().parents[1] / "src" / "yarnai" / "static"
PROJECT = "0198a6c0-0000-7000-8000-000000000077"


def test_stage77_production_route_and_assets_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-construction-strategy-planning?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="construction-strategy-root"' in response.text
    assert "Как дальше формируется верх свитера?" in response.text
    assert "Stage 77" not in response.text
    for path in (
        "/static/project-construction-strategy-planning.js",
        "/static/project-construction-strategy-planning-workspace.js",
        "/static/project-construction-strategy-planning-assistant.js",
        "/static/project-construction-strategy-planning.css",
        "/static/stage77-happy-path-fixture.html",
        "/static/stage77-happy-path-fixture.js",
    ):
        assert client.get(path).status_code == 200


def test_static_page_is_fail_closed_without_project_context() -> None:
    html = (STATIC / "project-construction-strategy-planning.html").read_text(encoding="utf-8")
    assert 'id="construction-strategy-content" hidden' in html
    assert 'id="construction-strategy-options"></div>' in html
    assert 'name="strategy"' not in html
    assert "/project-primary-fabric-execution" not in html
    assert "construction-strategy-execution" not in html


def test_stage76_completed_cta_targets_stage77_production_route() -> None:
    html = (STATIC / "project-next-section-planning.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-next-section-planning-workspace.js").read_text(encoding="utf-8")
    assert 'id="next-section-construction-action"' in html
    assert "`/project-construction-strategy-planning?project=${encodeURIComponent(projectId || snapshot.projectIdentity)}`" in workspace
    assert "/project-primary-fabric-execution" not in workspace


def test_stage77_collects_only_construction_strategy_and_explains_derivation() -> None:
    domain = (STATIC / "project-construction-strategy-planning.js").read_text(encoding="utf-8")
    html = (STATIC / "project-construction-strategy-planning.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-construction-strategy-planning-workspace.js").read_text(encoding="utf-8")
    assert 'firstMissingInput: "construction_strategy"' in domain
    assert 'nextMissingInput: "shaping_policy"' in domain
    assert 'newPlan: null' in domain
    assert "garmentLengthCm - armholeDepthCm" in domain
    assert "Расчёт справочный" in workspace
    assert "решение о формировании будет подтверждено отдельно" in workspace
    assert "joining_strategy" in domain and "finishing_strategy" in domain


def test_fixture_uses_production_apis_and_opens_registered_route() -> None:
    fixture = (STATIC / "stage77-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "seedStage77HappyPath" in fixture
    assert "ensureProjectNextSectionPlanning" in fixture
    assert "stage77.ROUTE_PATH" in fixture
    assert "ensureProjectConstructionStrategyPlanning" not in fixture
    assert "indexedDB" not in fixture
