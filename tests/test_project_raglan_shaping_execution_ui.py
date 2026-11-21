from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_stage90_route_serves_production_workspace() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/project-raglan-shaping-execution")
    assert response.status_code == 200
    assert "Stage 90" in response.text
    assert "Провяжем кокетку круг за кругом" in response.text
    assert "project-raglan-shaping-execution-workspace.js" in response.text


def test_stage90_ui_exposes_complete_round_and_exact_count_workflow() -> None:
    html = (STATIC / "project-raglan-shaping-execution.html").read_text(encoding="utf-8")
    for required in [
        "Круг 1 уже полностью провязан",
        "Что делать сейчас",
        "Начать этот круг",
        "Круг полностью выполнен и проверен",
        "Фактические петли после возврата к началу круга",
        "Есть расхождение или я не уверен(а)",
    ]:
        assert required in html


def test_stage90_ui_exposes_pause_reload_reconciliation_and_recovery() -> None:
    html = (STATIC / "project-raglan-shaping-execution.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-raglan-shaping-execution-workspace.js").read_text(encoding="utf-8")
    assert "Работа на паузе" in html
    assert "Продолжить с сохранённого места" in html
    assert "Этот круг уже мог быть начат" in html
    assert "Физический возврат к проверенной границе" in html
    assert 'currentRound?.workStatus === "awaiting_reconciliation"' in workspace
    assert "startRecoveryEpoch" in workspace


def test_stage90_ui_has_terminal_boundary_and_no_stage91_execution() -> None:
    html = (STATIC / "project-raglan-shaping-execution.html").read_text(encoding="utf-8")
    assert "Все круги провязаны — финальная проверка" in html
    assert "Реглан физически выполнен" in html
    assert "Горловина, открытие поло, планка, воротник и закрытие подрезов здесь не выполнялись" in html
    for forbidden in ["вязать воротник", "выполнить планку", "поднять петли горловины", "пришить пуговицы"]:
        assert forbidden not in html.lower()


def test_stage90_presentation_hides_contract_storage_and_operation_internals() -> None:
    html = (STATIC / "project-raglan-shaping-execution.html").read_text(encoding="utf-8")
    for internal in [
        "RAGLAN_SHAPING_EXECUTION_CONTRACT_V1",
        "RAGLAN_SHAPING_EXECUTION_RESULT_V1",
        "fingerprint",
        "repositoryRevision",
        "operationId",
        "epoch",
        "IndexedDB",
    ]:
        assert internal not in html


def test_stage90_fixture_reuses_completed_stage89_and_db_version_is_not_bumped() -> None:
    fixture = (STATIC / "stage90-happy-path-fixture.js").read_text(encoding="utf-8")
    system = (STATIC / "project-system.js").read_text(encoding="utf-8")
    assert "seedStage89HappyPath" in fixture
    assert "completeRound" in fixture
    assert "completeExecution" in fixture
    assert "const DB_VERSION = 4;" in system
    assert "DB_VERSION = 5" not in system
