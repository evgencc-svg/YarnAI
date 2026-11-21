from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"


def test_primary_fabric_preparation_route_serves_semantic_production_workspace() -> None:
    response = TestClient(app).get("/project-primary-fabric-preparation")
    assert response.status_code == 200
    assert 'id="primary-fabric-preparation-root"' in response.text
    assert "primary-fabric-preparation.js" in response.text
    assert "primary-fabric-preparation-workspace.js" in response.text
    assert "Stage 73" not in response.text


def test_workspace_requests_only_authoritative_missing_inputs_with_one_action() -> None:
    html = (STATIC / "primary-fabric-preparation.html").read_text(encoding="utf-8")
    assert 'name="mainPattern"' in html
    assert 'name="patternRepeat"' in html
    assert 'name="sectionHeightCm"' in html
    assert html.count('type="submit"') == 1
    assert "Сохранить подготовку" in html
    assert "reviewing" not in html.lower()
    assert "подтвердите, что" not in html.lower()


def test_fixture_uses_production_domain_and_repository_apis() -> None:
    html = (STATIC / "stage73-happy-path-fixture.html").read_text(encoding="utf-8")
    script = (STATIC / "stage73-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "stage73-happy-path-fixture.js" in html
    assert "seedStage72HappyPath" in script
    assert "ensureFoundationSectionMeasurement" in script
    assert "completeMeasurement" in script
    assert "updateFoundationSectionMeasurement" in script
    assert "YarnAIPrimaryFabricPreparation" in script
    assert "indexedDB" not in script
    assert "objectStore" not in script
