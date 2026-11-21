from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "018f4f62-cd68-7abc-8def-0123456789ab"


def test_stage85_route_and_assets_are_served() -> None:
    client = TestClient(create_app())
    response = client.get(f"/project-underarm-allocation-execution?project={PROJECT}")
    assert response.status_code == 200
    assert 'id="underarm-execution-root"' in response.text
    assert "Переведите петли четырёх подрезов" in response.text
    for asset in (
        "project-underarm-allocation-execution.js",
        "project-underarm-allocation-execution-application.js",
        "project-underarm-allocation-execution-workspace.js",
        "project-underarm-allocation-execution-assistant.js",
        "project-underarm-allocation-execution.css",
        "stage85-happy-path-fixture.html",
        "stage85-happy-path-fixture.js",
    ):
        assert client.get(f"/static/{asset}").status_code == 200


def test_stage85_ui_presents_one_physical_action_and_one_confirmation_at_a_time() -> None:
    html = (STATIC / "project-underarm-allocation-execution.html").read_text(encoding="utf-8")
    workspace = (STATIC / "project-underarm-allocation-execution-workspace.js").read_text(encoding="utf-8")
    assert html.count('id="underarm-execution-step"') == 1
    assert html.count('id="underarm-execution-confirm-step"') == 1
    assert "по одному точному действию" in html
    assert "держатель или гладкую вспомогательную нить" in html
    assert "оставляя каждую петлю живой" in html
    assert "Не закрывайте подрезы" in html
    assert "currentStep.title" in workspace
    assert "currentStep.stitches" in workspace
    assert "confirmCurrentGroup" in workspace
    assert "renderedStepIdentity !== next.currentStep.identity" in workspace
    assert "checkbox.checked = false" in workspace
    assert "fingerprint" not in html.lower()
    assert "operationId" not in html


def test_stage85_asks_for_a_number_only_inside_the_explicit_discrepancy_path() -> None:
    html = (STATIC / "project-underarm-allocation-execution.html").read_text(encoding="utf-8")
    assert html.count('type="number"') == 1
    details = html.split("<details>", 1)[1].split("</details>", 1)[0]
    assert 'name="actualProcessedCount"' in details
    assert "Фактическое количество не совпало" in details
    assert "вычислите" not in html.lower()
    assert "combinedYoke" not in html


def test_stage85_bootstrap_accepts_exactly_one_safe_project_parameter() -> None:
    workspace = (STATIC / "project-underarm-allocation-execution-workspace.js").read_text(encoding="utf-8")
    assert 'params.getAll("project").length === 1' in workspace
    assert '[...params.keys()].length === 1' in workspace
    assert "UUID_V7.test" in workspace
    assert "encodeURIComponent(projectId)" in workspace


def test_stage85_fixture_uses_production_chain_and_physical_controllers() -> None:
    fixture = (STATIC / "stage85-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "YarnAIStage84HappyPathFixture" in fixture
    assert "startExecution" in fixture
    assert "confirmCurrentGroup" in fixture
    assert "reportDiscrepancy" in fixture
    assert "completeExecution" in fixture
    assert "startAllocationRework" in fixture
    assert 'options.scenario === "partial"' in fixture
    assert 'options.scenario === "mismatch"' in fixture
    assert 'options.scenario === "replay"' in fixture
    assert 'options.scenario === "upstream-replacement"' in fixture
    assert 'options.scenario === "manual"' in fixture
    assert "saveProjectUnderarmAllocationExecution" not in fixture


def test_stage85_links_to_production_stage86_without_premature_join_semantics() -> None:
    html = (STATIC / "project-underarm-allocation-execution.html").read_text(encoding="utf-8")
    http = (Path(__file__).parents[1] / "src" / "yarnai" / "http.py").read_text(encoding="utf-8")
    assert "raglan-interface-planning-link" in html
    assert 'Route("/project-raglan-interface-planning"' in http
    assert "Физическое соединение корпуса и рукавов по-прежнему не выполняется" in html
    assert "/project-body-sleeves-join-execution" not in html
