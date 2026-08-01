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
        self.buttons: list[dict[str, str | None]] = []
        self.labels: list[str] = []

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
        if tag == "button":
            self.buttons.append(values)
        if tag == "label" and values.get("for"):
            self.labels.append(values["for"] or "")


def test_review_route_content_type_cache_and_security_headers() -> None:
    response = TestClient(app).get("/pattern-technology-review")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "connect-src 'self'" in csp
    assert "Проверка технологии вязания" in response.text


def test_review_page_has_complete_sectioned_ui_and_local_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-technology-review")
    parser = ReviewPageParser()
    parser.feed(response.text)

    required = {
        "pattern-technology-review-status",
        "pattern-technology-review-source",
        "pattern-technology-review-source-revision",
        "pattern-technology-review-summary",
        "pattern-technology-review-overview",
        "pattern-technology-review-materials",
        "pattern-technology-review-components",
        "pattern-technology-review-sections",
        "pattern-technology-review-operations",
        "pattern-technology-review-rows",
        "pattern-technology-review-repeats",
        "pattern-technology-review-stitches",
        "pattern-technology-review-finishing",
        "pattern-technology-review-abbreviations",
        "pattern-technology-review-assumptions",
        "pattern-technology-review-missing",
        "pattern-technology-review-conflicts",
        "pattern-technology-review-warnings",
        "pattern-technology-review-provenance",
        "pattern-technology-review-validation",
        "pattern-technology-review-validation-critical",
        "pattern-technology-review-validation-noncritical",
        "pattern-technology-review-validation-informational",
    }
    assert required <= parser.ids
    assert parser.assets
    assert all(asset.startswith("/static/") for asset in parser.assets)
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content
    assert client.get("/static/pattern-technology-review.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-technology-review.css").headers[
        "content-type"
    ].startswith("text/css")


def test_review_actions_and_correction_form_are_accessible() -> None:
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")
    parser = ReviewPageParser()
    parser.feed(html)

    for action_id in (
        "pattern-technology-review-start",
        "pattern-technology-review-validate",
        "pattern-technology-review-confirm",
        "pattern-technology-review-reopen",
        "pattern-technology-review-new",
        "pattern-technology-review-correction-cancel",
    ):
        assert action_id in parser.ids
    assert all(button.get("type") in {"button", "submit"} for button in parser.buttons)
    assert {
        "pattern-technology-review-correction-type",
        "pattern-technology-review-correction-value",
        "pattern-technology-review-correction-unit",
    } <= set(parser.labels)
    assert 'aria-live="polite"' in html
    assert 'role="alert"' in html
    assert '<details class="card review-disclosure"' in html


def test_safe_rendering_local_only_and_no_stage_23() -> None:
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-technology-review.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-technology-review-assistant.js").read_text(
        encoding="utf-8"
    )
    scripts = f"{domain}\n{controller}"
    lower = f"{html}\n{scripts}".lower()

    assert "textContent" in controller
    assert "document.createElement" in controller
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
        "tesseract",
        "pdfjs",
        "filereader",
    ):
        assert forbidden not in lower
    later_stage = 20 + 3
    assert f"stage {later_stage}" not in lower
    assert f"stage-{later_stage}" not in lower


def test_responsive_layout_prevents_narrow_horizontal_overflow() -> None:
    css = (STATIC / "pattern-technology-review.css").read_text(encoding="utf-8")
    html = (STATIC / "pattern-technology-review.html").read_text(encoding="utf-8")

    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "overflow-wrap: anywhere" in css
    assert "max-width: 100%" in css
    assert "width: 100%" in css
    assert ":focus-visible" in css
    assert 'name="viewport"' in html


def test_stage_20_and_stage_21_navigation_is_bidirectional() -> None:
    draft_html = (STATIC / "pattern-technology-draft.html").read_text(
        encoding="utf-8"
    )
    draft_controller = (
        STATIC / "pattern-technology-draft-assistant.js"
    ).read_text(encoding="utf-8")
    review_html = (STATIC / "pattern-technology-review.html").read_text(
        encoding="utf-8"
    )
    review_controller = (
        STATIC / "pattern-technology-review-assistant.js"
    ).read_text(encoding="utf-8")

    assert "Проверить технологию" in draft_html
    assert "/pattern-technology-review?project=" in draft_controller
    assert "Вернуться к Stage 20" in review_html
    assert "/pattern-technology-draft?project=" in review_controller


def test_stage_21_links_forward_to_stage_22() -> None:
    review_html = (STATIC / "pattern-technology-review.html").read_text(
        encoding="utf-8"
    )
    review_controller = (
        STATIC / "pattern-technology-review-assistant.js"
    ).read_text(encoding="utf-8")

    assert 'id="pattern-technology-review-nav-plan"' in review_html
    assert "/pattern-execution-plan?project=" in review_controller
