from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class ExecutionStepParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.buttons: list[dict[str, str | None]] = []
        self.links: list[dict[str, str | None]] = []
        self.inline_handlers: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        for name, value in attrs:
            if name.startswith("on") and value:
                self.inline_handlers.append(name)
        if tag == "script" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "button":
            self.buttons.append(values)
        if tag == "a":
            self.links.append(values)


def test_execution_step_route_headers_and_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-step")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "script-src 'self'" in csp
    assert "connect-src 'self'" in csp
    assert "Сейчас сделайте:" in response.text

    parser = ExecutionStepParser()
    parser.feed(response.text)
    assert not parser.inline_handlers
    assert parser.assets
    assert all(asset.startswith("/static/") for asset in parser.assets)
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content
    assert client.get("/static/pattern-execution-step.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-execution-step-assistant.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-execution-step.css").headers[
        "content-type"
    ].startswith("text/css")


def test_execution_step_page_contains_practical_progress_controls() -> None:
    html = (STATIC / "pattern-execution-step.html").read_text(encoding="utf-8")
    parser = ExecutionStepParser()
    parser.feed(html)

    assert {
        "execution-step-status",
        "execution-step-component",
        "execution-step-phase",
        "execution-step-action",
        "execution-step-instruction",
        "execution-step-expected",
        "execution-step-quantity",
        "execution-step-done-when",
        "execution-step-counter",
        "execution-step-measurement-form",
        "execution-step-checkpoints",
        "execution-step-prerequisites",
        "execution-step-warnings",
        "execution-step-blockers",
        "execution-step-stale-reason",
        "execution-step-failure",
        "execution-step-start",
        "execution-step-increment",
        "execution-step-decrement",
        "execution-step-set-value",
        "execution-step-record-measurement",
        "execution-step-check",
        "execution-step-pause",
        "execution-step-resume",
        "execution-step-complete",
        "execution-step-retry",
        "execution-step-rebuild",
    } <= parser.ids
    assert all(button.get("type") == "button" for button in parser.buttons)
    assert all("hidden" in button for button in parser.buttons)


def test_execution_step_uses_safe_local_dom_and_no_remote_analysis() -> None:
    domain = (STATIC / "pattern-execution-step.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-step-assistant.js").read_text(
        encoding="utf-8"
    )
    html = (STATIC / "pattern-execution-step.html").read_text(encoding="utf-8")
    scripts = f"{domain}\n{controller}"
    lower = scripts.lower()

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
        "http://",
        "https://",
    ):
        assert forbidden not in lower


def test_execution_step_requires_project_context_and_hides_actions() -> None:
    html = (STATIC / "pattern-execution-step.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-step-assistant.js").read_text(
        encoding="utf-8"
    )

    assert 'new URLSearchParams(globalObject.location.search).get("project")' in controller
    assert "if (!projectId) return renderWithoutProject()" in controller
    assert "Проект не выбран" in controller
    assert "Без project context запись не создаётся" in controller
    assert "hideButtons()" in controller
    assert "button.hidden = true" in controller
    assert 'href="/pattern-execution-session"' in html
    assert "/pattern-execution-session?project=" in controller


def test_execution_step_lifecycle_buttons_are_conditionally_rendered() -> None:
    controller = (STATIC / "pattern-execution-step-assistant.js").read_text(
        encoding="utf-8"
    )

    for status in (
        'step.status === "ready"',
        '["active", "checking"].includes(step.status)',
        'step.status === "paused"',
        '["blocked", "stale", "failed", "completed"].includes(step.status)',
    ):
        assert status in controller
    assert "ui.increment.hidden = !canIncrement" in controller
    assert "ui.decrement.hidden = step.progressState.current <= 0" in controller
    assert "step.completionState.status !== \"sync_pending\"" in controller
    assert "setDisabled(true)" in controller


def test_execution_step_mobile_layout_has_no_horizontal_overflow() -> None:
    css = (STATIC / "pattern-execution-step.css").read_text(encoding="utf-8")
    html = (STATIC / "pattern-execution-step.html").read_text(encoding="utf-8")
    http = (Path(__file__).parents[2] / "src" / "yarnai" / "http.py").read_text(
        encoding="utf-8"
    )

    assert 'name="viewport"' in html
    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "max-width: 100%" in css
    assert "overflow-x: hidden" in css
    assert "overflow-wrap: anywhere" in css
    assert "width: 100%" in css
    assert "min-height: 48px" in css
    assert ":focus-visible" in css
    assert 'Route(\n            "/pattern-execution-step"' in http


def test_execution_session_navigation_to_current_step_is_guarded() -> None:
    html = (STATIC / "pattern-execution-session.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-session-assistant.js").read_text(
        encoding="utf-8"
    )

    assert 'id="execution-session-step"' in html
    assert 'href="/pattern-execution-step" hidden' in html
    assert "/pattern-execution-step?project=" in controller
    assert "inspected.planValidation?.isValid" in controller
    assert "prerequisitesReady" in controller
    assert "!action.blockerIds.length" in controller
    assert "!session.blockers.length" in controller
    assert "ui.step.hidden = false" in controller
