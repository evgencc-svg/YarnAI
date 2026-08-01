from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class SemanticPageParser(HTMLParser):
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


def test_semantic_analysis_route_assets_and_security_headers() -> None:
    client = TestClient(app)
    response = client.get("/pattern-semantic-analysis")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "connect-src 'self'" in csp
    assert "Семантический анализ материалов" in response.text

    parser = SemanticPageParser()
    parser.feed(response.text)
    assert {
        "pattern-semantic-analysis-status",
        "pattern-semantic-analysis-start",
        "pattern-semantic-analysis-retry",
        "pattern-semantic-analysis-back",
        "pattern-semantic-analysis-results",
        "pattern-semantic-analysis-fields",
        "pattern-semantic-analysis-partial",
        "pattern-semantic-analysis-diagnostics",
    } <= parser.ids
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content


def test_page_contains_all_states_and_safe_rendering() -> None:
    html = (STATIC / "pattern-semantic-analysis.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-semantic-analysis-assistant.js").read_text(
        encoding="utf-8"
    )
    source = f"{html}\n{controller}"

    for copy in (
        "Семантический анализ ещё не создан.",
        "Материалы готовы к структурному анализу.",
        "Анализируем структуру материалов…",
        "Семантический анализ завершён.",
        "Анализ завершён частично",
        "Не удалось выполнить анализ",
        "Начать анализ",
        "Повторить анализ",
    ):
        assert copy in source
    assert "textContent" in controller
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "<img src=x onerror=alert(1)>" not in html
    assert "<script>alert(1)</script>" not in html


def test_navigation_connects_completed_stage_18_to_stage_19() -> None:
    extraction_html = (STATIC / "pattern-content-extraction.html").read_text(
        encoding="utf-8"
    )
    extraction_controller = (
        STATIC / "pattern-content-extraction-assistant.js"
    ).read_text(encoding="utf-8")
    semantic_html = (STATIC / "pattern-semantic-analysis.html").read_text(
        encoding="utf-8"
    )
    semantic_controller = (
        STATIC / "pattern-semantic-analysis-assistant.js"
    ).read_text(encoding="utf-8")

    assert "pattern-semantic-analysis-link" in extraction_html
    assert '["completed", "partial"].includes(state.status)' in extraction_controller
    assert "/pattern-content-extraction" in semantic_html
    assert "/pattern-content-extraction?project=" in semantic_controller
    assert "pattern-analysis-review-link" in semantic_html
    assert "/pattern-analysis-review?project=" in semantic_controller
    assert 'state.status !== "completed"' in semantic_controller


def test_stage_has_responsive_css_and_no_external_or_openai_calls() -> None:
    css = (STATIC / "pattern-semantic-analysis.css").read_text(encoding="utf-8")
    rules = (STATIC / "pattern-semantic-rules.js").read_text(encoding="utf-8")
    state = (STATIC / "pattern-semantic-analysis.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-semantic-analysis-assistant.js").read_text(
        encoding="utf-8"
    )
    scripts = f"{rules}\n{state}\n{controller}".lower()

    assert "@media (max-width: 560px)" in css
    assert "fetch(" not in scripts
    assert "xmlhttprequest" not in scripts
    assert "websocket" not in scripts
    assert "openai" not in scripts
    assert "api.openai.com" not in scripts


def test_existing_routes_remain_available() -> None:
    client = TestClient(app)
    for route in (
        "/health",
        "/pattern-content-extraction",
        "/pattern-analysis",
        "/import-pattern",
        "/calculator",
    ):
        assert client.get(route).status_code == 200
