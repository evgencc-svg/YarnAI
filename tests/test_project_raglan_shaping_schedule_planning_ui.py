from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_stage89_route_serves_production_workspace() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/project-raglan-shaping-schedule-planning")
    assert response.status_code == 200
    assert "Stage 89" in response.text
    assert "Разложим убавления по кругам кокетки" in response.text
    assert "project-raglan-shaping-schedule-planning-workspace.js" in response.text


def test_stage89_ui_exposes_fail_closed_eligibility_and_safe_schedule_review() -> None:
    html = (STATIC / "project-raglan-shaping-schedule-planning.html").read_text(encoding="utf-8")
    assert "На каких фазах узора разрешены убавления?" in html
    assert "не будет предполагать ритм «через ряд»" in html
    assert "Круг соединения уже провязан" in html
    assert "Проверьте расписание" in html
    assert "Финальная проверка" in html


def test_stage89_presentation_hides_contract_storage_and_polo_execution_details() -> None:
    html = (STATIC / "project-raglan-shaping-schedule-planning.html").read_text(encoding="utf-8")
    for internal in [
        "RAGLAN_SHAPING_SCHEDULE_PLANNING_CONTRACT_V1",
        "RAGLAN_SHAPING_SCHEDULE_PLAN_V1",
        "fingerprint",
        "repositoryRevision",
        "operationId",
        "epoch",
        "IndexedDB",
    ]:
        assert internal not in html
    for forbidden in ["вязать воротник", "выполнить планку", "закрыть петли планки", "открыть перед"]:
        assert forbidden not in html.lower()


def test_stage89_fixture_reuses_completed_stage88_and_db_version_is_not_bumped() -> None:
    fixture = (STATIC / "stage89-happy-path-fixture.js").read_text(encoding="utf-8")
    system = (STATIC / "project-system.js").read_text(encoding="utf-8")
    assert '"127.0.0.1", "localhost"' in fixture
    assert "seedStage88HappyPath" in fixture
    assert "completeSchedule" in fixture
    assert "const DB_VERSION = 4;" in system
    assert "DB_VERSION = 5" not in system
