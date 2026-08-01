from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class CompletionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.buttons: list[dict[str, str | None]] = []
        self.inline_handlers: list[str] = []
        self.live_regions: list[str] = []
        self.links: list[dict[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if values.get("aria-live"):
            self.live_regions.append(values["aria-live"] or "")
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


def test_completion_route_headers_and_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-completion")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert "default-src 'self'" in response.headers["content-security-policy"]

    parser = CompletionParser()
    parser.feed(response.text)
    assert not parser.inline_handlers
    assert parser.assets
    assert all(asset.startswith("/static/") for asset in parser.assets)
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content
    assert client.get("/static/pattern-execution-completion.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-execution-completion-assistant.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-execution-completion.css").headers[
        "content-type"
    ].startswith("text/css")


def test_completion_page_contains_lifecycle_summary_and_actions() -> None:
    html = (STATIC / "pattern-execution-completion.html").read_text(encoding="utf-8")
    parser = CompletionParser()
    parser.feed(html)

    assert {
        "execution-completion-status",
        "execution-completion-verdict",
        "execution-completion-session",
        "execution-completion-epoch",
        "execution-completion-plan",
        "execution-completion-progress",
        "execution-completion-counts",
        "execution-completion-phases",
        "execution-completion-steps",
        "execution-completion-checkpoints",
        "execution-completion-blockers",
        "execution-completion-warnings",
        "execution-completion-stale-reasons",
        "execution-completion-audit",
        "execution-completion-verify",
        "execution-completion-retry",
        "execution-completion-rebuild",
        "execution-completion-back",
        "execution-completion-result",
    } <= parser.ids
    assert all(button.get("type") == "button" for button in parser.buttons)
    assert all("hidden" in button for button in parser.buttons)
    assert "polite" in parser.live_regions


def test_completion_ui_uses_safe_dom_and_no_external_processing() -> None:
    domain = (STATIC / "pattern-execution-completion.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-completion-assistant.js").read_text(
        encoding="utf-8"
    )
    html = (STATIC / "pattern-execution-completion.html").read_text(encoding="utf-8")
    scripts = f"{domain}\n{controller}"
    lower = scripts.lower()

    assert "textContent" in controller
    assert "document.createElement" in controller
    assert "replaceChildren" in controller
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
        "http://",
        "https://",
    ):
        assert forbidden not in lower


def test_completion_without_project_context_has_no_mutations_or_navigation() -> None:
    controller = (STATIC / "pattern-execution-completion-assistant.js").read_text(
        encoding="utf-8"
    )

    guard = "if (!projectId) return renderWithoutProject()"
    assert '.get("project")' in controller
    assert guard in controller
    assert "Без project context чтение и mutations недоступны" in controller
    assert "hideActions()" in controller
    assert "element.hidden = true" in controller
    assert "ui.actionsPanel.hidden = true" in controller
    assert controller.index(guard) < controller.index("new system.ProjectRepository()")
    render_empty = controller.split("function renderWithoutProject()", 1)[1]
    assert "ui.back.hidden = false" not in render_empty


def test_completion_responsive_accessible_and_bidirectionally_linked() -> None:
    css = (STATIC / "pattern-execution-completion.css").read_text(encoding="utf-8")
    html = (STATIC / "pattern-execution-completion.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-completion-assistant.js").read_text(
        encoding="utf-8"
    )
    progress_html = (STATIC / "pattern-execution-progress.html").read_text(
        encoding="utf-8"
    )
    progress_controller = (
        STATIC / "pattern-execution-progress-assistant.js"
    ).read_text(encoding="utf-8")
    http = (ROOT / "src" / "yarnai" / "http.py").read_text(encoding="utf-8")

    assert 'name="viewport"' in html
    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "max-width: 100%" in css
    assert "overflow-x: hidden" in css
    assert "overflow-wrap: anywhere" in css
    assert "word-break: break-word" in css
    assert "width: 100%" in css
    assert "min-height: 48px" in css
    assert ":focus-visible" in css
    assert "button:disabled" in css
    assert 'aria-live="polite"' in html
    assert 'href="/pattern-execution-progress" hidden' in html
    assert "/pattern-execution-progress?project=" in controller
    assert 'href="/pattern-execution-completion" hidden' in progress_html
    assert "/pattern-execution-completion?project=" in progress_controller
    assert "ui.completion.hidden = false" in progress_controller
    assert 'href="/pattern-execution-result" hidden' in html
    assert "/pattern-execution-result?project=" in controller
    assert "ui.result.hidden = false" in controller
    assert 'Route(\n            "/pattern-execution-completion"' in http


def test_completion_actions_follow_explicit_lifecycle_rules() -> None:
    domain = (STATIC / "pattern-execution-completion.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-completion-assistant.js").read_text(
        encoding="utf-8"
    )

    for status in ("waiting", "verifying", "ready", "blocked", "failed", "stale"):
        assert f'"{status}"' in domain
    assert 'mode === "verify"' in controller
    assert 'mode === "retry"' in controller
    assert 'mode === "rebuild"' in controller
    assert "verifyPatternExecutionCompletion" in controller
    assert "retryPatternExecutionCompletion" in controller
    assert "rebuildPatternExecutionCompletion" in controller
    assert "readPatternExecutionCompletion" in controller
    assert "rebuildPatternExecutionCompletion" not in controller.split(
        "async function execute(mode)"
    )[0]


def test_completion_files_have_no_route_beyond_the_declared_completion_page() -> None:
    files = [
        STATIC / "pattern-execution-completion.js",
        STATIC / "pattern-execution-completion-assistant.js",
        STATIC / "pattern-execution-completion.html",
        STATIC / "pattern-execution-completion.css",
        STATIC / "pattern-execution-progress-assistant.js",
        STATIC / "pattern-execution-progress.html",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
    declared_routes = {
        "/pattern-execution-progress",
        "/pattern-execution-completion",
        "/pattern-execution-checkpoint",
        "/pattern-execution-result",
    }
    found = {
        token.split("?", 1)[0].rstrip('"`\'')
        for token in combined.replace("=", " ").replace(";", " ").split()
        if token.startswith("/pattern-execution-")
    }
    assert found <= declared_routes
