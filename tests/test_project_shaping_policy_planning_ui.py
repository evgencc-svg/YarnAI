from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).resolve().parents[1] / "src" / "yarnai" / "static"
PROJECT = "0198a6c0-0000-7000-8000-000000000078"


def test_stage78_production_route_assets_csp_and_bootstrap_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-shaping-policy-planning?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="shaping-policy-root"' in response.text
    assert "Как распределять формирование реглана?" in response.text
    assert "Stage 78" not in response.text
    assert "script-src 'self'" in response.headers["content-security-policy"]
    for path in (
        "/static/project-shaping-policy-planning.js",
        "/static/project-shaping-policy-planning-workspace.js",
        "/static/project-shaping-policy-planning-assistant.js",
        "/static/project-shaping-policy-planning.css",
        "/static/stage78-happy-path-fixture.html",
        "/static/stage78-happy-path-fixture.js",
    ):
        assert client.get(path).status_code == 200
    assert '<script src="/static/project-shaping-policy-planning-assistant.js" defer></script>' in response.text
    assert "<script>" not in response.text


def test_stage78_is_fail_closed_without_project_and_collects_only_shaping_policy() -> None:
    html = (STATIC / "project-shaping-policy-planning.html").read_text(encoding="utf-8")
    domain = (STATIC / "project-shaping-policy-planning.js").read_text(encoding="utf-8")
    workspace = (STATIC / "project-shaping-policy-planning-workspace.js").read_text(encoding="utf-8")
    assert 'id="shaping-policy-content" hidden' in html
    assert 'id="shaping-policy-options"></div>' in html
    assert 'name="policy"' not in html
    assert "joining_strategy" not in html
    assert "finishing_strategy" not in html
    assert 'firstMissingInput: "shaping_policy"' in domain
    assert 'status: "blocked_on_prerequisites"' in domain
    assert "nextMissingInput: null" in domain
    assert "blockingPrerequisites" in domain
    assert 'newPlan: null' in domain
    assert "готовые размеры и расчёт прибавок рукава" in workspace
    assert "/project-sleeve-geometry-planning?project=" in workspace
    assert "способ соединения" not in workspace
    assert "Это только справочная информация, а не инструкция" in workspace
    assert "/project-primary-fabric-execution" not in html


def test_stage77_completed_cta_targets_stage78_production_route() -> None:
    html = (STATIC / "project-construction-strategy-planning.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-construction-strategy-planning-workspace.js").read_text(encoding="utf-8")
    assert 'id="construction-strategy-shaping-action"' in html
    assert "`/project-shaping-policy-planning?project=${encodeURIComponent(projectId || snapshot.projectIdentity)}`" in workspace
    saved_projects = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    assert '<script src="/static/project-shaping-policy-planning.js" defer></script>' in saved_projects


def test_fixture_completes_stage77_through_production_apis_only() -> None:
    fixture = (STATIC / "stage78-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "seedStage78HappyPath" in fixture
    assert "ensureProjectConstructionStrategyPlanning" in fixture
    assert "stage78.ROUTE_PATH" in fixture
    assert "ensureProjectShapingPolicyPlanning" not in fixture
    assert "indexedDB" not in fixture
