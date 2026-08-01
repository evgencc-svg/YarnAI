from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class ExecutionSessionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.buttons: list[dict[str, str | None]] = []
        self.links: list[str] = []
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
        if tag == "img" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "button":
            self.buttons.append(values)
        if tag == "a" and values.get("href"):
            self.links.append(values["href"] or "")


def test_execution_session_route_headers_and_local_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-session")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "script-src 'self'" in csp
    assert "connect-src 'self'" in csp
    assert "Выполнение проекта" in response.text

    parser = ExecutionSessionParser()
    parser.feed(response.text)
    assert parser.assets
    assert all(asset.startswith("/static/") for asset in parser.assets)
    assert not parser.inline_handlers
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content
    assert client.get("/static/pattern-execution-session.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-execution-session.css").headers[
        "content-type"
    ].startswith("text/css")


def test_execution_session_page_has_lifecycle_progress_and_actions() -> None:
    html = (STATIC / "pattern-execution-session.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-session-assistant.js").read_text(
        encoding="utf-8"
    )
    parser = ExecutionSessionParser()
    parser.feed(html)

    assert {
        "execution-session-plan-status",
        "execution-session-state",
        "execution-session-status",
        "execution-session-progress",
        "execution-session-phase",
        "execution-session-component",
        "execution-session-action",
        "execution-session-count",
        "execution-session-percent",
        "execution-session-current",
        "execution-session-current-title",
        "execution-session-current-instruction",
        "execution-session-current-prerequisites",
        "execution-session-current-checkpoints",
        "execution-session-current-blockers",
        "execution-session-start",
        "execution-session-start-action",
        "execution-session-complete-action",
        "execution-session-skip-action",
        "execution-session-pause",
        "execution-session-resume",
        "execution-session-rebuild",
    } <= parser.ids
    assert all(button.get("type") == "button" for button in parser.buttons)
    assert all("hidden" in button for button in parser.buttons)
    for label in (
        "выполнение ещё не начато",
        "подготовка",
        "выполняется",
        "приостановлено",
        "заблокировано",
        "завершено",
        "устарело",
        "ошибка",
    ):
        assert label in f"{html}\n{controller}"


def test_execution_session_is_safe_and_local_only() -> None:
    html = (STATIC / "pattern-execution-session.html").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-execution-session.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-session-assistant.js").read_text(
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
        "http://",
        "https://",
    ):
        assert forbidden not in lower


def test_execution_session_requires_project_context_and_hides_invalid_actions() -> None:
    html = (STATIC / "pattern-execution-session.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-session-assistant.js").read_text(
        encoding="utf-8"
    )

    assert 'new URLSearchParams(globalObject.location.search).get("project")' in controller
    assert "if (!projectId) return renderWithoutProject()" in controller
    assert "Проект не выбран" in controller
    assert "Выберите проект" in controller
    assert "hideButtons()" in controller
    assert "button.hidden = true" in controller
    assert "/pattern-execution-plan" in html
    assert "/pattern-execution-plan?project=" in controller
    parser = ExecutionSessionParser()
    parser.feed(html)
    assert "/pattern-execution-session" not in parser.links


def test_execution_session_mobile_layout_and_http_registration() -> None:
    css = (STATIC / "pattern-execution-session.css").read_text(encoding="utf-8")
    html = (STATIC / "pattern-execution-session.html").read_text(encoding="utf-8")
    http = (Path(__file__).parents[2] / "src" / "yarnai" / "http.py").read_text(
        encoding="utf-8"
    )

    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "max-width: 100%" in css
    assert "overflow-wrap: anywhere" in css
    assert "width: 100%" in css
    assert ":focus-visible" in css
    assert 'name="viewport"' in html
    assert 'Route(\n            "/pattern-execution-session"' in http


def test_stage_22_links_to_stage_23_only_with_project_context() -> None:
    html = (STATIC / "pattern-execution-plan.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-plan-assistant.js").read_text(
        encoding="utf-8"
    )

    assert 'id="execution-plan-session"' in html
    assert 'href="/pattern-execution-session" hidden' in html
    assert "/pattern-execution-session?project=" in controller
    assert "ui.session.hidden = true" in controller
    assert "ui.session.hidden = false" in controller
