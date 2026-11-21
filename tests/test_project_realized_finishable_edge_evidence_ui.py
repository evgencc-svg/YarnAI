from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_realized_edge_evidence_route_serves_boundary_and_assets() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/project-realized-finishable-edge-evidence")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")
        for asset in (
            "project-realized-finishable-edge-evidence.js",
            "project-realized-finishable-edge-evidence-application.js",
            "project-realized-finishable-edge-evidence-workspace.js",
            "project-realized-finishable-edge-evidence-assistant.js",
            "project-realized-finishable-edge-evidence.css",
        ):
            assert client.get(f"/static/{asset}").status_code == 200


def test_workspace_exposes_physical_inventory_not_finishing_actions() -> None:
    html = (STATIC / "project-realized-finishable-edge-evidence.html").read_text(
        encoding="utf-8"
    )
    for identity in (
        "edge-evidence-root",
        "edge-evidence-context",
        "edge-evidence-start",
        "edge-evidence-collect",
        "edge-evidence-review",
        "edge-evidence-segments",
        "edge-evidence-completed",
    ):
        assert f'id="{identity}"' in html
    for phrase in (
        "REALIZED_FINISHABLE_EDGE_EVIDENCE_V1",
        "physical_discrete_unit_inventory_v1",
        "neckline/polo zones",
        "Finishing gauge",
    ):
        assert phrase.lower() in html.lower()
    for forbidden in (
        "выполнить pickup",
        "вязать воротник",
        "вязать планку",
        "buttonhole",
    ):
        assert forbidden.lower() not in html.lower()


def test_safe_projection_and_historical_handoff_are_wired() -> None:
    domain = (STATIC / "project-realized-finishable-edge-evidence.js").read_text(
        encoding="utf-8"
    )
    stage92_workspace = (STATIC / "project-neckline-opening-execution-workspace.js").read_text(
        encoding="utf-8"
    )
    saved_workspace = (STATIC / "user-workspace-entry.js").read_text(encoding="utf-8")
    assert "topologySummary" in domain
    assert 'routePath: null, productionImplemented: false' in domain
    assert "/project-realized-finishable-edge-evidence" in stage92_workspace
    assert (
        'PROJECT_REALIZED_FINISHABLE_EDGE_EVIDENCE: '
        '"/project-realized-finishable-edge-evidence"'
    ) in saved_workspace


def test_boundary_keeps_indexeddb_v4_and_does_not_create_stage93() -> None:
    system = (STATIC / "project-system.js").read_text(encoding="utf-8")
    assert "const DB_VERSION = 4;" in system
    assert "DB_VERSION = 5" not in system
    assert not (STATIC / "project-neckline-edge-finishing-planning.js").exists()
    assert not (STATIC / "project-neckline-edge-finishing-planning.html").exists()
