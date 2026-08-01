from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class ResultParser(HTMLParser):
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
        if tag == "script" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "button":
            self.buttons.append(values)
        if tag == "a":
            self.links.append(values)
        for name, value in attrs:
            if name.startswith("on") and value:
                self.inline_handlers.append(name)


def test_result_route_and_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-result")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert "default-src 'self'" in response.headers["content-security-policy"]

    parser = ResultParser()
    parser.feed(response.text)
    assert not parser.inline_handlers
    assert {
        "/static/pattern-execution-result.css",
        "/static/pattern-execution-result.js",
        "/static/pattern-execution-result-assistant.js",
    } <= set(parser.assets)
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content


def test_result_page_has_all_user_facing_sections() -> None:
    html = (STATIC / "pattern-execution-result.html").read_text(encoding="utf-8")
    parser = ResultParser()
    parser.feed(html)

    assert {
        "execution-result-status",
        "execution-result-summary",
        "execution-result-counts",
        "execution-result-parameters",
        "execution-result-steps",
        "execution-result-actions",
        "execution-result-checkpoints",
        "execution-result-deviations",
        "execution-result-warnings",
        "execution-result-notes",
        "execution-result-blockers",
        "execution-result-stale-reasons",
        "execution-result-identity",
        "execution-result-fingerprint",
        "execution-result-generate",
        "execution-result-retry",
        "execution-result-rebuild",
        "execution-result-save",
        "execution-result-back",
        "execution-result-runtime",
    } <= parser.ids
    assert all(button.get("type") == "button" for button in parser.buttons)
    assert all("hidden" in button for button in parser.buttons)


def test_result_rendering_is_safe_and_local_only() -> None:
    domain = (STATIC / "pattern-execution-result.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-result-assistant.js").read_text(
        encoding="utf-8"
    )
    html = (STATIC / "pattern-execution-result.html").read_text(encoding="utf-8")
    combined = f"{domain}\n{controller}"
    lower = combined.lower()

    assert "textContent" in controller
    assert "document.createElement" in controller
    assert "replaceChildren" in controller
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "onclick=" not in html
    assert " eval(" not in combined
    assert "new Function" not in combined
    for forbidden in (
        "fetch(",
        "xmlhttprequest",
        "websocket",
        "api.openai.com",
        "tesseract",
        "pdfjs",
        "filereader",
        "http://",
        "https://",
    ):
        assert forbidden not in lower


def test_result_without_project_context_has_no_actions_or_navigation() -> None:
    controller = (STATIC / "pattern-execution-result-assistant.js").read_text(
        encoding="utf-8"
    )
    guard = "if (!projectId) return renderWithoutProject()"

    assert '.get("project")' in controller
    assert guard in controller
    assert "Без project context чтение, сохранение и изменения недоступны" in controller
    assert controller.index(guard) < controller.index("new system.ProjectRepository()")
    empty_render = controller.split("function renderWithoutProject()", 1)[1]
    assert "ui.actionsPanel.hidden = true" in empty_render
    assert "ui.back.hidden = false" not in empty_render


def test_result_navigation_is_bidirectional_only_with_project_context() -> None:
    result_html = (STATIC / "pattern-execution-result.html").read_text(encoding="utf-8")
    result_controller = (
        STATIC / "pattern-execution-result-assistant.js"
    ).read_text(encoding="utf-8")
    completion_html = (
        STATIC / "pattern-execution-completion.html"
    ).read_text(encoding="utf-8")
    completion_controller = (
        STATIC / "pattern-execution-completion-assistant.js"
    ).read_text(encoding="utf-8")

    assert 'href="/pattern-execution-completion" hidden' in result_html
    assert "/pattern-execution-completion?project=" in result_controller
    assert "ui.back.hidden = false" in result_controller
    assert 'href="/pattern-execution-result" hidden' in completion_html
    assert "/pattern-execution-result?project=" in completion_controller
    assert "ui.result.hidden = false" in completion_controller


def test_result_actions_match_explicit_lifecycle() -> None:
    domain = (STATIC / "pattern-execution-result.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-result-assistant.js").read_text(
        encoding="utf-8"
    )

    for status in ("waiting", "generating", "ready", "blocked", "stale", "failed"):
        assert f'"{status}"' in domain
    assert 'mode === "generate"' in controller
    assert 'mode === "retry"' in controller
    assert 'mode === "rebuild"' in controller
    assert "generatePatternExecutionResult" in controller
    assert "retryPatternExecutionResult" in controller
    assert "rebuildPatternExecutionResult" in controller
    assert "readPatternExecutionResult" in controller
    assert "rebuildPatternExecutionResult" not in controller.split(
        "async function execute(mode)"
    )[0]


def test_result_is_responsive_without_page_overflow() -> None:
    css = (STATIC / "pattern-execution-result.css").read_text(encoding="utf-8")
    html = (STATIC / "pattern-execution-result.html").read_text(encoding="utf-8")

    assert 'name="viewport"' in html
    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "max-width: 100%" in css
    assert "overflow-x: hidden" in css
    assert "overflow-x: auto" in css
    assert "overflow-wrap: anywhere" in css
    assert "word-break: break-word" in css
    assert "min-height: 48px" in css
    assert ":focus-visible" in css
    assert "button:disabled" in css


def test_result_files_only_reference_declared_execution_routes() -> None:
    files = [
        STATIC / "pattern-execution-result.js",
        STATIC / "pattern-execution-result-assistant.js",
        STATIC / "pattern-execution-result.html",
        STATIC / "pattern-execution-result.css",
        STATIC / "pattern-execution-completion-assistant.js",
        STATIC / "pattern-execution-completion.html",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
    declared_routes = {
        "/pattern-execution-progress",
        "/pattern-execution-completion",
        "/pattern-execution-result",
        "/pattern-execution-runtime",
    }
    found = {
        token.split("?", 1)[0].rstrip('"`\'')
        for token in combined.replace("=", " ").replace(";", " ").split()
        if token.startswith("/pattern-execution-")
    }
    assert found <= declared_routes
