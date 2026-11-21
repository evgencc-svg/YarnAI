from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"


def test_stage91_route_and_production_assets_are_available() -> None:
    client = TestClient(app)
    response = client.get("/project-neckline-opening-planning")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    html = response.text
    assert '<meta name="viewport" content="width=device-width,initial-scale=1">' in html
    assert '<link rel="stylesheet" href="/static/project-neckline-opening-planning.css">' in html
    for asset in (
        "project-neckline-opening-planning-v1.js",
        "project-neckline-opening-planning-v2.js",
        "project-neckline-opening-planning.js",
        "project-neckline-opening-planning-application.js",
        "project-neckline-opening-planning-workspace.js",
        "project-neckline-opening-planning-assistant.js",
    ):
        assert f'<script src="/static/{asset}" defer></script>' in html
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage91_workspace_has_human_controls_and_no_internal_action_leak() -> None:
    html = (STATIC / "project-neckline-opening-planning.html").read_text(encoding="utf-8")
    for identity in (
        "neckline-opening-root",
        "neckline-opening-loading",
        "neckline-opening-blocked",
        "neckline-opening-terminal-counts",
        "neckline-opening-choices",
        "neckline-shape",
        "neckline-depth",
        "neckline-width",
        "opening-feature",
        "opening-method",
        "neckline-opening-candidates",
        "neckline-opening-schedule-body",
        "neckline-opening-final-confirm",
        "neckline-opening-completed",
        "neckline-opening-successor",
    ):
        assert f'id="{identity}"' in html
    lowered = html.lower()
    for internal in (
        "resolve_required_choice",
        "complete_neckline_opening_plan",
        "operation_id",
        "sourcefingerprint",
        "reviewfingerprint",
        "neckline_opening_plan_v1",
    ):
        assert internal not in lowered
    assert "планка и воротник" in lowered
    assert "никакие петли ещё не" in lowered
    assert "единый физический план v3" in lowered
    assert "один линейный поток будущих действий" in lowered


def test_stage91_v3_workspace_projects_human_execution_semantics() -> None:
    workspace = (STATIC / "project-neckline-opening-planning-workspace.js").read_text(encoding="utf-8")
    assistant = (STATIC / "project-neckline-opening-planning-assistant.js").read_text(encoding="utf-8")
    for phrase in ("selected?.executionSteps", "step.instruction", "step.yarnAfter", "без скрытого поворота"):
        assert phrase in workspace
    assert "yarnActions" not in workspace
    assert "Исторический план доступен только для чтения" in assistant
    assert "линейному списку" in assistant


def test_stage91_mobile_presentation_contract() -> None:
    css = (STATIC / "project-neckline-opening-planning.css").read_text(encoding="utf-8")
    assert "@media(max-width:680px)" in css
    assert "grid-template-columns:1fr" in css
    assert "overflow-x:auto" in css
    assert "min-height:44px" in css


def test_stage90_completion_and_saved_workspace_route_to_stage91() -> None:
    stage90_html = (STATIC / "project-raglan-shaping-execution.html").read_text(encoding="utf-8")
    stage90_workspace = (STATIC / "project-raglan-shaping-execution-workspace.js").read_text(encoding="utf-8")
    saved_workspace = (STATIC / "user-workspace-entry.js").read_text(encoding="utf-8")
    assert 'id="raglan-execution-next"' in stage90_html
    assert "/project-neckline-opening-planning?project=" in stage90_workspace
    assert 'PROJECT_NECKLINE_OPENING_PLANNING: "/project-neckline-opening-planning"' in saved_workspace
