from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class CheckpointParser(HTMLParser):
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


def test_checkpoint_route_headers_and_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-checkpoint")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "script-src 'self'" in csp
    assert "connect-src 'self'" in csp

    parser = CheckpointParser()
    parser.feed(response.text)
    assert not parser.inline_handlers
    assert parser.assets
    assert all(asset.startswith("/static/") for asset in parser.assets)
    for asset in parser.assets:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content
    assert client.get("/static/pattern-execution-checkpoint.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-execution-checkpoint-assistant.js").headers[
        "content-type"
    ].startswith(("text/javascript", "application/javascript"))
    assert client.get("/static/pattern-execution-checkpoint.css").headers[
        "content-type"
    ].startswith("text/css")


def test_checkpoint_page_contains_lifecycle_and_typed_observation_contract() -> None:
    html = (STATIC / "pattern-execution-checkpoint.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-checkpoint-assistant.js").read_text(
        encoding="utf-8"
    )
    parser = CheckpointParser()
    parser.feed(html)

    assert {
        "execution-checkpoint-status",
        "execution-checkpoint-component",
        "execution-checkpoint-phase",
        "execution-checkpoint-action",
        "execution-checkpoint-label",
        "execution-checkpoint-expected",
        "execution-checkpoint-type",
        "execution-checkpoint-unit",
        "execution-checkpoint-observations",
        "execution-checkpoint-start",
        "execution-checkpoint-defer",
        "execution-checkpoint-resume",
        "execution-checkpoint-reject",
        "execution-checkpoint-confirm",
        "execution-checkpoint-recover",
        "execution-checkpoint-rebuild",
        "execution-checkpoint-reason",
        "execution-checkpoint-back",
    } <= parser.ids
    assert all(button.get("type") == "button" for button in parser.buttons)
    assert all("hidden" in button for button in parser.buttons)
    for checkpoint_type in (
        "visual_confirmation",
        "row_count",
        "stitch_count",
        "measurement",
        "size_length",
        "checkpoint_match",
        "required_result",
        "choice",
        "informational",
    ):
        assert checkpoint_type in controller


def test_checkpoint_uses_safe_dom_without_network_or_analysis() -> None:
    domain = (STATIC / "pattern-execution-checkpoint.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-checkpoint-assistant.js").read_text(
        encoding="utf-8"
    )
    html = (STATIC / "pattern-execution-checkpoint.html").read_text(encoding="utf-8")
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


def test_checkpoint_without_project_context_hides_mutations_and_creates_nothing() -> None:
    controller = (STATIC / "pattern-execution-checkpoint-assistant.js").read_text(
        encoding="utf-8"
    )

    assert 'projectId = parameters.get("project")' in controller
    assert "if (!projectId) return renderWithoutProject()" in controller
    assert "Проект не выбран" in controller
    assert "Без project context запись не создаётся" in controller
    assert "hideActions()" in controller
    assert "element.hidden = true" in controller
    before_context_guard = controller.index("if (!projectId) return renderWithoutProject()")
    create_call = controller.index("createPatternExecutionCheckpointForCurrentAction")
    assert before_context_guard < create_call


def test_checkpoint_mobile_layout_and_safe_back_navigation() -> None:
    css = (STATIC / "pattern-execution-checkpoint.css").read_text(encoding="utf-8")
    html = (STATIC / "pattern-execution-checkpoint.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-checkpoint-assistant.js").read_text(
        encoding="utf-8"
    )
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
    assert 'href="/pattern-execution-step"' in html
    assert "/pattern-execution-step?project=" in controller
    assert 'Route(\n            "/pattern-execution-checkpoint"' in http


def test_stage_24_navigation_is_guarded_by_proven_checkpoint_context() -> None:
    html = (STATIC / "pattern-execution-step.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-step-assistant.js").read_text(
        encoding="utf-8"
    )

    assert 'id="execution-step-open-checkpoint"' in html
    assert 'href="/pattern-execution-checkpoint" hidden' in html
    assert "/pattern-execution-checkpoint?project=" in controller
    assert "inspected?.sourceValidation?.valid" in controller
    assert "externalCheckpointRequired === true" in controller
    assert "checkpointCriteria.length > 0" in controller
    assert "ui.checkpoint.hidden = false" in controller


def test_checkpoint_has_no_future_stage_reference() -> None:
    files = [
        STATIC / "pattern-execution-checkpoint.js",
        STATIC / "pattern-execution-checkpoint-assistant.js",
        STATIC / "pattern-execution-checkpoint.html",
        STATIC / "pattern-execution-checkpoint.css",
        STATIC / "pattern-execution-step-assistant.js",
        STATIC / "pattern-execution-step.html",
    ]
    forbidden = "Stage " + str(20 + 6)
    assert all(forbidden not in path.read_text(encoding="utf-8") for path in files)
