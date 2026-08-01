from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class ExecutionPlanParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.buttons: list[dict[str, str | None]] = []

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
        if tag == "button":
            self.buttons.append(values)


def test_execution_plan_route_headers_and_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-plan")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert "connect-src 'self'" in response.headers["content-security-policy"]
    assert "План выполнения изделия" in response.text

    parser = ExecutionPlanParser()
    parser.feed(response.text)
    assert parser.assets
    assert all(asset.startswith("/static/") for asset in parser.assets)
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content
    assert client.get("/static/pattern-execution-plan.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-execution-plan.css").headers[
        "content-type"
    ].startswith("text/css")


def test_execution_plan_page_has_all_lifecycle_and_result_regions() -> None:
    html = (STATIC / "pattern-execution-plan.html").read_text(encoding="utf-8")
    parser = ExecutionPlanParser()
    parser.feed(html)

    assert {
        "execution-plan-status",
        "execution-plan-source",
        "execution-plan-source-revision",
        "execution-plan-source-fingerprint",
        "execution-plan-fingerprint",
        "execution-plan-build",
        "execution-plan-retry",
        "execution-plan-rebuild",
        "execution-plan-first",
        "execution-plan-summary",
        "execution-plan-prerequisites",
        "execution-plan-components",
        "execution-plan-phases",
        "execution-plan-dependencies",
        "execution-plan-checkpoints",
        "execution-plan-blockers",
        "execution-plan-warnings",
        "execution-plan-validation",
    } <= parser.ids
    assert all(button.get("type") == "button" for button in parser.buttons)
    assert 'aria-live="polite"' in html
    assert 'role="alert"' in html


def test_execution_plan_is_safe_local_only_and_has_no_stage_24() -> None:
    html = (STATIC / "pattern-execution-plan.html").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-execution-plan.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-plan-assistant.js").read_text(
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
        "math.random",
    ):
        assert forbidden not in lower
    assert "stage 24" not in lower
    assert "stage-24" not in lower


def test_execution_plan_layout_and_stage_21_navigation() -> None:
    css = (STATIC / "pattern-execution-plan.css").read_text(encoding="utf-8")
    html = (STATIC / "pattern-execution-plan.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-plan-assistant.js").read_text(
        encoding="utf-8"
    )

    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "overflow-wrap: anywhere" in css
    assert "max-width: 100%" in css
    assert "width: 100%" in css
    assert ":focus-visible" in css
    assert 'name="viewport"' in html
    assert "/pattern-technology-review" in html
    assert "/pattern-technology-review?project=" in controller
    assert 'href="/pattern-execution-session" hidden' in html
    assert "/pattern-execution-session?project=" in controller
