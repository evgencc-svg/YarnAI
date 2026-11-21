from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_stage87_route_serves_production_workspace() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/project-body-sleeves-join-execution")
    assert response.status_code == 200
    assert "Stage 87" in response.text
    assert "Соединим корпус и рукава" in response.text
    assert "project-body-sleeves-join-execution-workspace.js" in response.text


def test_stage87_ui_exposes_one_physical_action_and_hides_domain_internals() -> None:
    html = (STATIC / "project-body-sleeves-join-execution.html").read_text(encoding="utf-8")
    assert "Текущее физическое действие" in html
    assert "Я выполнил(а) и проверил(а)" in html
    assert "Итоговая проверка" in html
    assert "fingerprint" not in html
    assert "repositoryRevision" not in html
    assert "sourceInterval" not in html


def test_stage87_presentation_preserves_execution_boundary() -> None:
    html = (STATIC / "project-body-sleeves-join-execution.html").read_text(encoding="utf-8")
    assert "без убавок" in html
    assert "четырёх групп подрезов" in html
    assert "PROJECT_YOKE_TARGET_GEOMETRY_PLANNING" not in html
    assert "Перейти к геометрии кокетки" in html
    assert (STATIC / "project-yoke-target-geometry-planning.js").exists()


def test_stage87_fixture_is_local_only_and_reuses_stage86() -> None:
    fixture = (STATIC / "stage87-happy-path-fixture.js").read_text(encoding="utf-8")
    assert '"127.0.0.1", "localhost"' in fixture
    assert "seedStage86HappyPath" in fixture
    assert "raglanDecreasesWorked" not in fixture
