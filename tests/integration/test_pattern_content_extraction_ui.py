from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class ExtractionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if tag == "script" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "img" and values.get("src"):
            self.assets.append(values["src"] or "")


def test_extraction_page_and_assets_are_available_with_security_headers() -> None:
    client = TestClient(app)
    response = client.get("/pattern-content-extraction")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert "Извлечение содержимого" in response.text
    parser = ExtractionParser()
    parser.feed(response.text)
    assert {
        "pattern-content-extraction-status",
        "pattern-content-extraction-start",
        "pattern-content-extraction-retry",
        "pattern-content-extraction-view",
        "pattern-content-extraction-files",
        "pattern-content-extraction-combined",
    } <= parser.ids
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content


def test_page_contains_all_required_state_copy_and_safe_rendering() -> None:
    html = (STATIC / "pattern-content-extraction.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-content-extraction-assistant.js").read_text(
        encoding="utf-8"
    )

    for copy in (
        "Извлечение содержимого ещё не подготовлено.",
        "Материалы готовы к чтению.",
        "Читаем содержимое материалов…",
        "Начать извлечение",
        "Повторить извлечение",
        "Просмотреть извлечённый текст",
    ):
        assert copy in f"{html}\n{controller}"
    assert "textContent" in controller
    assert "innerHTML" not in controller
    assert "Markdown" not in controller


def test_pdf_endpoint_returns_contract_and_controlled_error() -> None:
    client = TestClient(app)
    invalid = client.post(
        "/api/v1/pattern-content-extraction/pdf",
        content=b"not pdf",
        headers={"content-type": "application/pdf"},
    )

    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "pdf_invalid"
    assert "Traceback" not in invalid.text
    assert invalid.headers["cache-control"] == "no-store"


def test_stage_16_navigation_and_old_routes_remain_available() -> None:
    client = TestClient(app)
    analysis_html = (STATIC / "pattern-analysis.html").read_text(encoding="utf-8")

    assert "pattern-content-extraction-link" in analysis_html
    for route in ("/health", "/pattern-analysis", "/import-pattern", "/calculator"):
        assert client.get(route).status_code == 200
