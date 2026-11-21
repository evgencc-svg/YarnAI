from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_stage92_route_serves_production_workspace_and_assets() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/project-neckline-opening-execution")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")
        for asset in (
            "project-neckline-opening-execution.js",
            "project-neckline-opening-execution-application.js",
            "project-neckline-opening-execution-workspace.js",
            "project-neckline-opening-execution-assistant.js",
            "project-neckline-opening-execution.css",
        ):
            assert client.get(f"/static/{asset}").status_code == 200


def test_stage92_ui_is_step_focused_and_hides_storage_internals() -> None:
    html = (STATIC / "project-neckline-opening-execution.html").read_text(encoding="utf-8")
    for identity in (
        "neckline-execution-root",
        "neckline-execution-progress",
        "neckline-execution-entry",
        "neckline-execution-current",
        "neckline-execution-action",
        "neckline-execution-orientation",
        "neckline-execution-step-facts",
        "neckline-execution-paused",
        "neckline-execution-discrepancy",
        "neckline-execution-terminal",
        "neckline-execution-completed",
        "neckline-execution-successor",
    ):
        assert f'id="{identity}"' in html
    for phrase in (
        "ровно один шаг",
        "физически проверяйте результат",
        "неподтверждённый шаг не считается завершённым",
        "ничего не перепланируется",
    ):
        assert phrase in html.lower()
    for internal in ("fingerprint", "operationid", "repositoryrevision", "indexeddb", "raw json"):
        assert internal not in html.lower()


def test_stage92_workspace_has_action_specific_confirmation_and_recovery() -> None:
    workspace = (STATIC / "project-neckline-opening-execution-workspace.js").read_text(encoding="utf-8")
    assistant = (STATIC / "project-neckline-opening-execution-assistant.js").read_text(encoding="utf-8")
    for action in ("yarn_break", "yarn_join", "yarn_activate", "traverse", "decrease", "bind_off", "hold", "turn", "no_turn", "stop"):
        assert f"{action}:" in workspace
    assert "resolveDiscrepancy" in workspace
    assert "currentStepAlreadyPerformed" in workspace
    assert "не меняет порядок" in assistant
    assert "план не исправляется автоматически" in assistant.lower()


def test_stage91_and_saved_workspace_route_to_stage92() -> None:
    planning_workspace = (STATIC / "project-neckline-opening-planning-workspace.js").read_text(encoding="utf-8")
    saved_workspace = (STATIC / "user-workspace-entry.js").read_text(encoding="utf-8")
    assert "/project-neckline-opening-execution?project=" in planning_workspace
    assert 'PROJECT_NECKLINE_OPENING_EXECUTION: "/project-neckline-opening-execution"' in saved_workspace
    assert "start-neckline-opening-execution" in saved_workspace


def test_stage92_keeps_db_v4_and_does_not_create_successor_production_assets() -> None:
    system = (STATIC / "project-system.js").read_text(encoding="utf-8")
    assert "const DB_VERSION = 4;" in system
    assert "DB_VERSION = 5" not in system
    assert not (STATIC / "project-neckline-edge-finishing-planning.js").exists()
