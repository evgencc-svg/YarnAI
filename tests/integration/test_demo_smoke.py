from __future__ import annotations

import json
from pathlib import Path

from starlette.testclient import TestClient

import yarnai.http as http_api


ROOT = Path(__file__).parents[2]
EXAMPLE = ROOT / "examples" / "first_function_width.json"


def test_public_demo_smoke_journey() -> None:
    """Exercise the public pages, assets, health check, and canonical result."""

    with TestClient(http_api.create_app()) as client:
        start = client.get("/")
        about = client.get("/about")
        example_page = client.get("/example")
        script = client.get("/static/app.js")
        stylesheet = client.get("/static/styles.css")
        favicon = client.get("/static/favicon.png")
        health = client.get("/health")
        calculation = client.post(
            "/api/v1/calculate",
            json=json.loads(EXAMPLE.read_text(encoding="utf-8")),
        )

    assert start.status_code == 200
    assert "Сколько петель набрать?" in start.text
    assert about.status_code == 200
    assert "Расчёт ширины в петлях" in about.text
    assert example_page.status_code == 200
    assert script.status_code == 200
    assert stylesheet.status_code == 200
    assert favicon.status_code == 200
    assert favicon.headers["content-type"] == "image/png"
    assert health.json() == {"status": "ok"}
    assert calculation.status_code == 200
    result = calculation.json()
    assert result["status"] == "READY"
    assert result["axes"]["width"]["selected_candidate"]["working_count"] == 100
