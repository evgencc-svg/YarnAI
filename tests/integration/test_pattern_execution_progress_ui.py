from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class ProgressParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.buttons: list[dict[str, str | None]] = []
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


def test_progress_route_headers_and_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-progress")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert "default-src 'self'" in response.headers["content-security-policy"]

    parser = ProgressParser()
    parser.feed(response.text)
    assert not parser.inline_handlers
    assert parser.assets
    assert all(asset.startswith("/static/") for asset in parser.assets)
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content
    assert client.get("/static/pattern-execution-progress.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-execution-progress-assistant.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-execution-progress.css").headers[
        "content-type"
    ].startswith("text/css")


def test_progress_page_contains_required_aggregate_contract() -> None:
    html = (STATIC / "pattern-execution-progress.html").read_text(encoding="utf-8")
    parser = ProgressParser()
    parser.feed(html)

    assert {
        "execution-progress-status",
        "execution-progress-percent",
        "execution-progress-phases",
        "execution-progress-steps-total",
        "execution-progress-step-counts",
        "execution-progress-checkpoint-counts",
        "execution-progress-current-title",
        "execution-progress-next-action",
        "execution-progress-blockers",
        "execution-progress-stale-reasons",
        "execution-progress-build",
        "execution-progress-rebuild",
        "execution-progress-retry",
        "execution-progress-back",
        "execution-progress-completion",
    } <= parser.ids
    assert all(button.get("type") == "button" for button in parser.buttons)
    assert all("hidden" in button for button in parser.buttons)


def test_progress_ui_is_xss_safe_and_has_no_network_or_reanalysis() -> None:
    domain = (STATIC / "pattern-execution-progress.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-progress-assistant.js").read_text(
        encoding="utf-8"
    )
    html = (STATIC / "pattern-execution-progress.html").read_text(encoding="utf-8")
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


def test_progress_without_project_context_hides_mutations() -> None:
    controller = (STATIC / "pattern-execution-progress-assistant.js").read_text(
        encoding="utf-8"
    )

    assert '.get("project")' in controller
    assert "if (!projectId) return renderWithoutProject()" in controller
    assert "Без project context чтение и mutation недоступны" in controller
    assert "hideActions()" in controller
    assert "element.hidden = true" in controller
    context_guard = controller.index("if (!projectId) return renderWithoutProject()")
    repository_creation = controller.index("new system.ProjectRepository()")
    assert context_guard < repository_creation


def test_progress_mobile_layout_and_bidirectional_navigation() -> None:
    css = (STATIC / "pattern-execution-progress.css").read_text(encoding="utf-8")
    html = (STATIC / "pattern-execution-progress.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-progress-assistant.js").read_text(
        encoding="utf-8"
    )
    checkpoint_html = (STATIC / "pattern-execution-checkpoint.html").read_text(
        encoding="utf-8"
    )
    checkpoint_controller = (
        STATIC / "pattern-execution-checkpoint-assistant.js"
    ).read_text(encoding="utf-8")
    http = (ROOT / "src" / "yarnai" / "http.py").read_text(encoding="utf-8")

    assert 'name="viewport"' in html
    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "max-width: 100%" in css
    assert "overflow-x: hidden" in css
    assert "overflow-wrap: anywhere" in css
    assert "width: 100%" in css
    assert "min-height: 48px" in css
    assert ":focus-visible" in css
    assert 'href="/pattern-execution-checkpoint" hidden' in html
    assert "/pattern-execution-checkpoint?project=" in controller
    assert 'href="/pattern-execution-progress" hidden' in checkpoint_html
    assert "/pattern-execution-progress?project=" in checkpoint_controller
    assert "ui.progress.hidden = false" in checkpoint_controller
    assert 'href="/pattern-execution-completion" hidden' in html
    assert "/pattern-execution-completion?project=" in controller
    assert "ui.completion.hidden = false" in controller
    assert 'Route(\n            "/pattern-execution-progress"' in http


def test_progress_actions_are_gated_and_read_does_not_rebuild() -> None:
    controller = (STATIC / "pattern-execution-progress-assistant.js").read_text(
        encoding="utf-8"
    )

    assert 'mode === "build"' in controller
    assert 'mode === "rebuild"' in controller
    assert 'mode === "retry"' in controller
    assert 'state.status === "waiting"' in controller
    assert 'state?.status === "failed"' in controller
    assert "inspected.staleness.reasons" in controller
    assert "rebuildPatternExecutionProgress" in controller
    assert "buildPatternExecutionProgress" in controller
    assert "retryPatternExecutionProgress" in controller
    assert "rebuildPatternExecutionProgress" not in controller.split(
        "async function execute(mode)"
    )[0]


def test_progress_forward_navigation_stops_at_completion() -> None:
    controller = (STATIC / "pattern-execution-progress-assistant.js").read_text(
        encoding="utf-8"
    )
    html = (STATIC / "pattern-execution-progress.html").read_text(encoding="utf-8")

    assert controller.count("/pattern-execution-completion?project=") == 1
    assert html.count('href="/pattern-execution-completion"') == 1
