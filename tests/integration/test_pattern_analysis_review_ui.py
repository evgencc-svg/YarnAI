from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class ReviewPageParser(HTMLParser):
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


def test_review_route_assets_content_type_and_security_headers() -> None:
    client = TestClient(app)
    response = client.get("/pattern-analysis-review")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "connect-src 'self'" in csp
    assert "Проверка результата анализа" in response.text

    parser = ReviewPageParser()
    parser.feed(response.text)
    assert {
        "pattern-analysis-review-status",
        "pattern-analysis-review-source",
        "pattern-analysis-review-freshness",
        "pattern-analysis-review-save",
        "pattern-analysis-review-validate",
        "pattern-analysis-review-rebase",
        "pattern-analysis-review-confirm",
        "pattern-analysis-review-technology",
        "pattern-analysis-review-back",
        "pattern-analysis-review-conflicts",
        "pattern-analysis-review-categories",
        "pattern-analysis-review-confirmed",
    } <= parser.ids
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content
    assert client.get("/static/pattern-analysis-review.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-analysis-review.css").headers[
        "content-type"
    ].startswith("text/css")


def test_review_page_contains_required_states_and_stage_20_navigation() -> None:
    html = (STATIC / "pattern-analysis-review.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-analysis-review-assistant.js").read_text(
        encoding="utf-8"
    )
    source = f"{html}\n{controller}"

    for copy in (
        "Анализ материалов ещё не выполнен.",
        "Семантический анализ ожидает запуска.",
        "Семантический анализ выполняется.",
        "Семантический анализ завершился с ошибкой.",
        "Подготовка проверки.",
        "Требуется внимание.",
        "Проверка данных.",
        "Можно подтвердить.",
        "Результат анализа подтверждён.",
        "Запись повреждена",
        "Создать черновик технологии",
        "Вернуться к семантическому анализу",
    ):
        assert copy in source
    assert "/pattern-semantic-analysis?project=" in controller
    assert "/pattern-technology-draft?project=" in controller


def test_safe_dom_output_and_no_inline_execution_or_external_calls() -> None:
    html = (STATIC / "pattern-analysis-review.html").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-analysis-review.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-analysis-review-assistant.js").read_text(
        encoding="utf-8"
    )
    scripts = f"{domain}\n{controller}"
    lower = scripts.lower()

    assert "textContent" in controller
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert " eval(" not in scripts
    assert "new Function" not in scripts
    assert "onclick=" not in html
    assert "fetch(" not in lower
    assert "xmlhttprequest" not in lower
    assert "websocket" not in lower
    assert "api.openai.com" not in lower


def test_responsive_structure_uses_chunked_disclosure_without_horizontal_overflow() -> None:
    css = (STATIC / "pattern-analysis-review.css").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-analysis-review-assistant.js").read_text(
        encoding="utf-8"
    )
    html = (STATIC / "pattern-analysis-review.html").read_text(encoding="utf-8")

    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "overflow-wrap: anywhere" in css
    assert "width: 100%" in css
    assert "document.createElement(\"details\")" in controller
    assert ".slice(0, limit)" in controller
    assert "limit + 40" in controller
    assert "viewport" in html


def test_stage_18_forward_link_and_review_back_link_are_present() -> None:
    semantic_html = (STATIC / "pattern-semantic-analysis.html").read_text(
        encoding="utf-8"
    )
    semantic_controller = (
        STATIC / "pattern-semantic-analysis-assistant.js"
    ).read_text(encoding="utf-8")
    review_html = (STATIC / "pattern-analysis-review.html").read_text(
        encoding="utf-8"
    )

    assert "Проверить результат анализа" in semantic_html
    assert "/pattern-analysis-review?project=" in semantic_controller
    assert "Вернуться к семантическому анализу" in review_html
    assert "Создать черновик технологии" in review_html
