from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).resolve().parents[1] / "src" / "yarnai" / "static"
PROJECT = "0198a6c0-0000-7000-8000-000000000079"


def test_stage79_production_route_assets_csp_and_bootstrap_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-sleeve-geometry-planning?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="sleeve-geometry-root"' in response.text
    assert "Подготовим точную форму рукава" in response.text
    assert "script-src 'self'" in response.headers["content-security-policy"]
    for path in (
        "/static/project-sleeve-target-geometry-planning.js",
        "/static/project-sleeve-target-geometry-planning-application.js",
        "/static/project-sleeve-target-geometry-planning-workspace.js",
        "/static/project-sleeve-target-geometry-planning-assistant.js",
        "/static/project-sleeve-target-geometry-planning.css",
        "/static/stage79-happy-path-fixture.html",
        "/static/stage79-happy-path-fixture.js",
    ):
        assert client.get(path).status_code == 200
    assert "<script>" not in response.text


def test_stage79_ui_is_projection_driven_and_contains_no_physical_execution() -> None:
    html = (STATIC / "project-sleeve-target-geometry-planning.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-sleeve-target-geometry-planning-workspace.js").read_text(encoding="utf-8")
    assert "Какой должна быть готовая окружность рукава у края манжеты" in workspace
    assert "collectCuffCircumference" in workspace
    assert "getProjectSleeveTargetGeometryPlanning" not in workspace
    assert "saveProjectSleeveTargetGeometryPlanning" not in workspace
    assert "new ProjectRepository" not in workspace
    assert "sourceBindingFingerprint" not in html
    assert "reviewFingerprint" not in html
    assert "physical sleeve" not in html.lower()
    assert "подрезы, соединение деталей и кокетка" in html


def test_stage78_completed_surface_and_saved_projects_link_to_stage79() -> None:
    stage78_html = (STATIC / "project-shaping-policy-planning.html").read_text(encoding="utf-8")
    stage78_workspace = (STATIC / "project-shaping-policy-planning-workspace.js").read_text(encoding="utf-8")
    saved = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    navigation = (STATIC / "user-workspace-entry.js").read_text(encoding="utf-8")
    assert 'id="shaping-policy-sleeve-action"' in stage78_html
    assert "/project-sleeve-geometry-planning?project=" in stage78_workspace
    assert '<script src="/static/project-sleeve-target-geometry-planning.js" defer></script>' in saved
    assert 'PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING: "/project-sleeve-geometry-planning"' in navigation


def test_fixture_uses_production_chain_and_does_not_forge_stage79() -> None:
    fixture = (STATIC / "stage79-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "seedStage78HappyPath" in fixture
    assert "ensureProjectShapingPolicyPlanning" in fixture
    assert "reconstructAuthoritativeSources" in fixture
    assert "saveProjectSleeveTargetGeometryPlanning" not in fixture
    assert "indexedDB" not in fixture
