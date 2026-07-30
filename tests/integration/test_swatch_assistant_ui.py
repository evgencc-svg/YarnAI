from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai.http as http_api


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


def test_swatch_assistant_is_connected_to_the_intention_flow(
    client: TestClient,
) -> None:
    page = client.get("/")
    script = client.get("/static/swatch-assistant.js")

    assert page.status_code == 200
    assert script.status_code == 200
    assert 'src="/static/swatch-assistant.js"' in page.text
    assert 'id="swatch-assistant"' in page.text
    assert 'id="swatch-form"' in page.text
    assert page.text.count('name="stitches-') == 3
    assert "Проверить и сохранить плотность" in page.text


def test_swatch_assistant_has_no_external_or_probabilistic_dependencies() -> None:
    assistant = (STATIC / "swatch-assistant.js").read_text(encoding="utf-8")
    flow = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")

    assert "MAXIMUM_SPREAD_RATIO" in assistant
    assert "sourceMeasurementCount" in assistant
    assert "engine.recordGauge(assessment.gauge)" in flow
    assert "fetch(" not in assistant
    assert "XMLHttpRequest" not in assistant
    assert "WebSocket" not in assistant
