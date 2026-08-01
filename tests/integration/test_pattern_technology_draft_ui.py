from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class TechnologyPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.links: list[str] = []

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
        if tag == "a" and values.get("href"):
            self.links.append(values["href"] or "")


def test_technology_route_assets_content_type_and_security_headers() -> None:
    client = TestClient(app)
    response = client.get("/pattern-technology-draft")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "connect-src 'self'" in csp
    assert "Черновик технологии вязания" in response.text

    parser = TechnologyPageParser()
    parser.feed(response.text)
    assert {
        "pattern-technology-draft-status",
        "pattern-technology-draft-source",
        "pattern-technology-draft-freshness",
        "pattern-technology-draft-build",
        "pattern-technology-draft-rebuild",
        "pattern-technology-draft-retry",
        "pattern-technology-draft-back",
        "pattern-technology-draft-issues",
        "pattern-technology-draft-critical",
        "pattern-technology-draft-warnings",
        "pattern-technology-draft-missing",
        "pattern-technology-draft-conflicts",
        "pattern-technology-draft-result",
        "pattern-technology-draft-operations",
        "pattern-technology-draft-provenance",
    } <= parser.ids
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content
    assert client.get("/static/pattern-technology-draft.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-technology-draft.css").headers[
        "content-type"
    ].startswith("text/css")


def test_page_contains_all_states_and_only_review_stage_link() -> None:
    html = (STATIC / "pattern-technology-draft.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-technology-draft-assistant.js").read_text(
        encoding="utf-8"
    )
    source = f"{html}\n{controller}"

    for copy in (
        "Подтверждённый анализ готов к преобразованию.",
        "Строим черновик технологии.",
        "Черновик построен и требует внимания.",
        "Структурированный черновик готов.",
        "Построение не выполнено:",
        "Критические проблемы",
        "Недостающие сведения",
        "Противоречия",
        "Материалы",
        "Инструменты",
        "Компоненты и секции",
        "Операции, ряды и повторы",
        "Изменения количества петель",
        "Происхождение подтверждённых значений",
    ):
        assert copy in source
    assert "Проверить технологию" in source
    assert "/pattern-technology-review?project=" in controller
    later_stage = 20 + 2
    assert f"stage {later_stage}" not in source.lower()
    assert f"stage-{later_stage}" not in source.lower()


def test_safe_dom_practices_and_local_only_implementation() -> None:
    html = (STATIC / "pattern-technology-draft.html").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-technology-draft.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-technology-draft-assistant.js").read_text(
        encoding="utf-8"
    )
    scripts = f"{domain}\n{controller}"
    lower = scripts.lower()

    assert "textContent" in controller
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "onclick=" not in html
    assert " eval(" not in scripts
    assert "new Function" not in scripts
    for forbidden in (
        "fetch(",
        "xmlhttprequest",
        "websocket",
        "api.openai.com",
        "llm",
        "tesseract",
        "ocr",
        "pdfjs",
        "filereader",
    ):
        assert forbidden not in lower


def test_responsive_accessible_structure_without_horizontal_overflow() -> None:
    css = (STATIC / "pattern-technology-draft.css").read_text(encoding="utf-8")
    html = (STATIC / "pattern-technology-draft.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-technology-draft-assistant.js").read_text(
        encoding="utf-8"
    )

    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "overflow-wrap: anywhere" in css
    assert "width: 100%" in css
    assert ":focus-visible" in css
    assert "viewport" in html
    assert 'type="button"' in html
    assert 'aria-live="polite"' in html
    assert "document.createElement" in controller


def test_stage_19_and_stage_20_navigation_is_bidirectional() -> None:
    review_html = (STATIC / "pattern-analysis-review.html").read_text(
        encoding="utf-8"
    )
    review_controller = (
        STATIC / "pattern-analysis-review-assistant.js"
    ).read_text(encoding="utf-8")
    technology_html = (STATIC / "pattern-technology-draft.html").read_text(
        encoding="utf-8"
    )
    technology_controller = (
        STATIC / "pattern-technology-draft-assistant.js"
    ).read_text(encoding="utf-8")

    assert "Создать черновик технологии" in review_html
    assert "/pattern-technology-draft?project=" in review_controller
    assert "Вернуться к проверке анализа" in technology_html
    assert "/pattern-analysis-review?project=" in technology_controller
