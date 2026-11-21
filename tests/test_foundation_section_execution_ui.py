from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "019fc3ba-4100-71c3-b7f9-bd06e3bff304"


def test_foundation_execution_route_uses_csp_safe_production_assets():
    response = TestClient(create_app()).get(f"/project-foundation-section-execution?project={PROJECT}")
    assert response.status_code == 200
    assert "Свяжите резинку" in response.text
    assert "foundation-section-execution.js" in response.text
    assert "foundation-section-execution-workspace.js" in response.text
    assert "<script>" not in response.text
    assert "onclick=" not in response.text


def test_foundation_execution_ui_preserves_physical_truth_and_user_language():
    html = (STATIC / "foundation-section-execution.html").read_text(encoding="utf-8")
    assert "Начать вязать резинку" in html
    assert "Приостановить" in html and "Продолжить" in html
    assert "не менее 5 см" in html
    assert "не подтверждает её техническую правильность" in html
    assert "сами по себе не означают, что 5 см достигнуты" in html
    assert "5 см готово" not in html
    assert "Завершить резинку" not in html
    assert "Stage 71" not in html
    assert "fingerprint" not in html.lower()
    assert "T10:" not in html


def test_saved_projects_loads_and_routes_foundation_execution():
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    workspace = (STATIC / "user-workspace-entry.js").read_text(encoding="utf-8")
    assistant = (STATIC / "user-workspace-entry-assistant.js").read_text(encoding="utf-8")
    assert "/static/foundation-section-execution.js" in html
    assert 'FOUNDATION_SECTION_EXECUTION: "/project-foundation-section-execution"' in workspace
    assert "workspace_foundation_execution_status" in workspace
    assert "foundationExecution(aggregate" in assistant
