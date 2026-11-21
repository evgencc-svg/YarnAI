from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_stage86_route_serves_production_workspace() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/project-raglan-interface-planning")
    assert response.status_code == 200
    assert "Stage 86" in response.text
    assert "Как должна выглядеть линия реглана" in response.text
    assert "project-raglan-interface-planning-workspace.js" in response.text


def test_stage86_ui_offers_only_supported_human_choices() -> None:
    html = (STATIC / "project-raglan-interface-planning.html").read_text(encoding="utf-8")
    assert html.count("data-raglan-width=") == 3
    assert 'data-raglan-width="0"' in html
    assert 'data-raglan-width="1"' in html
    assert 'data-raglan-width="2"' in html
    assert "Аккуратная граница" in html
    assert "Тонкая линия" in html
    assert "Двойная линия" in html
    assert "fingerprint" not in html
    assert "repositoryRevision" not in html


def test_stage86_presentation_states_physical_boundary() -> None:
    html = (STATIC / "project-raglan-interface-planning.html").read_text(encoding="utf-8")
    assert "Никакие петли пока не перемещаются" in html
    assert "Этот экран соединение не выполняет" in html
    assert "/project-body-sleeves-join-execution" not in html
    assert "body-sleeves-join-link" in html
    assert (STATIC / "project-body-sleeves-join-execution.js").exists()


def test_stage86_fixture_is_local_only() -> None:
    fixture = (STATIC / "stage86-happy-path-fixture.js").read_text(encoding="utf-8")
    assert '"127.0.0.1", "localhost"' in fixture
    assert "seedStage85HappyPath" in fixture
