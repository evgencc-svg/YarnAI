from __future__ import annotations

from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


ROOT = Path(__file__).parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_project_execution_plan_route_and_assets() -> None:
    response = TestClient(create_app()).get("/project-execution-plan?project=018f5f64-8b27-7a36-8c58-4f491a95cd01")
    assert response.status_code == 200
    assert "План работы над изделием" in response.text
    for asset in ("project-execution-plan.css", "project-execution-plan.js", "project-execution-plan-workspace.js", "project-execution-plan-assistant.js"):
        assert f'/static/{asset}' in response.text


def test_plan_screen_exposes_semantic_sections_and_accessibility() -> None:
    html = (STATIC / "project-execution-plan.html").read_text(encoding="utf-8")
    for element_id in ("error-summary", "plan-steps", "warning-list", "assumption-list", "warning-acknowledgement", "confirm-plan", "completed-section", "history-section"):
        assert f'id="{element_id}"' in html
    assert '<ol id="plan-steps"' in html
    assert "aria-live=\"polite\"" in html
    assert "fieldset" in html and "legend" in html
    assert "Набрать" not in html  # the confirmed count is rendered from the canonical snapshot


def test_stage_65_navigation_and_saved_project_destination_are_project_scoped() -> None:
    workspace = (STATIC / "user-workspace-entry.js").read_text(encoding="utf-8")
    assistant = (STATIC / "user-workspace-entry-assistant.js").read_text(encoding="utf-8")
    calculation = (STATIC / "project-calculation-entry-workspace.js").read_text(encoding="utf-8")
    assert 'PROJECT_EXECUTION_PLAN_PREPARATION: "/project-execution-plan"' in workspace
    assert 'projectRoute("/project-execution-plan", projectId)' in workspace
    assert "workspace_stage65_ready" in assistant
    assert "/project-execution-plan?project=${encodeURIComponent(projectId)}" in calculation
    assert 'projectRoute("/calculator"' not in workspace


def test_stage_65_snapshot_and_step_allowlists_exclude_ui_state() -> None:
    domain = (STATIC / "project-execution-plan.js").read_text(encoding="utf-8")
    for field in ("sourceIdentities", "sourceFingerprints", "planScope", "blockingErrors", "fingerprint"):
        assert f'"{field}"' in domain
    for field in ("sequenceNumber", "expectedOutput", "validationCheckpoint", "dependencies", "provenance"):
        assert f'"{field}"' in domain
    for forbidden in ("scrollPosition", "activeAccordion", "focusState", "objectUrl"):
        assert forbidden not in domain
    assert "createObjectStore" not in domain
    assert "DB_VERSION" not in domain


def test_no_later_stage_route_files_or_tests_exist() -> None:
    forbidden_number = str(60 + 6)
    names = [path.name.lower() for path in STATIC.iterdir()] + [path.name.lower() for path in (ROOT / "tests-js").iterdir()]
    assert not any(f"stage{forbidden_number}" in name or f"stage-{forbidden_number}" in name for name in names)

