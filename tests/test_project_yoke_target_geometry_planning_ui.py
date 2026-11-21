from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_stage88_route_serves_production_workspace() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/project-yoke-target-geometry-planning")
    assert response.status_code == 200
    assert "Stage 88" in response.text
    assert "Определим, куда должна прийти кокетка" in response.text
    assert "project-yoke-target-geometry-planning-workspace.js" in response.text


def test_stage88_ui_asks_only_required_polo_and_geometry_questions() -> None:
    html = (STATIC / "project-yoke-target-geometry-planning.html").read_text(encoding="utf-8")
    assert "Когда должен начаться разрез поло относительно реглана?" in html
    assert "готовая окружность верхнего края кокетки" in html
    assert "Какую часть верхнего края должен занимать каждый рукав?" in html
    assert "глубину горловины за окружность" in html
    assert "частота убавок будут спланированы дальше" in html


def test_stage88_presentation_hides_internal_contract_and_storage_details() -> None:
    html = (STATIC / "project-yoke-target-geometry-planning.html").read_text(encoding="utf-8")
    for internal in ["YOKE_TARGET_GEOMETRY_PLANNING_CONTRACT_V1", "fingerprint", "repositoryRevision", "operationId", "epoch", "IndexedDB"]:
        assert internal not in html
    assert "PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING" not in html
    workspace = (STATIC / "project-yoke-target-geometry-planning-workspace.js").read_text(encoding="utf-8")
    assert "/project-raglan-shaping-schedule-planning" in workspace


def test_stage88_fixture_is_local_only_and_reuses_completed_stage87() -> None:
    fixture = (STATIC / "stage88-happy-path-fixture.js").read_text(encoding="utf-8")
    assert '"127.0.0.1", "localhost"' in fixture
    assert "seedStage87HappyPath" in fixture
    assert "completeGeometry" in fixture
    assert "raglanDecreasesWorked" not in fixture
