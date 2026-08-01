from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class RuntimeParser(HTMLParser):
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
        self.inline_handlers.extend(name for name, value in attrs if name.startswith("on") and value)


def test_runtime_route_assets_content_type_and_security_headers() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-runtime")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]

    parser = RuntimeParser()
    parser.feed(response.text)
    expected = {
        "/static/pattern-execution-runtime.css",
        "/static/pattern-execution-runtime.js",
        "/static/pattern-execution-runtime-assistant.js",
    }
    assert expected <= set(parser.assets)
    for asset in expected:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200
        assert asset_response.content
        assert asset_response.headers["cache-control"] == "public, max-age=0, must-revalidate"
        assert asset_response.headers["x-content-type-options"] == "nosniff"


def test_runtime_markup_exposes_status_identity_progress_actions_audit_and_commands() -> None:
    html = (STATIC / "pattern-execution-runtime.html").read_text(encoding="utf-8")
    parser = RuntimeParser()
    parser.feed(html)

    assert {
        "runtime-status",
        "runtime-revision",
        "runtime-progress-text",
        "runtime-progress-bar",
        "runtime-cursor",
        "runtime-active-action",
        "runtime-completed-count",
        "runtime-total-count",
        "runtime-actions",
        "runtime-audit",
        "runtime-source-identity",
        "runtime-fingerprint",
        "runtime-recovery-panel",
        "runtime-stale-panel",
        "runtime-stale-reasons",
        "runtime-errors-panel",
        "runtime-errors",
        "runtime-command-bar",
        "runtime-back",
    } <= parser.ids
    commands = {button.get("data-command") for button in parser.buttons}
    assert {
        "create",
        "validate",
        "start",
        "pause",
        "resume",
        "begin_current_action",
        "complete_current_action",
        "fail_current_action",
        "block_current_action",
        "unblock_current_action",
        "skip_current_action",
        "stop",
        "recover",
        "mark_stale",
        "rebuild",
    } <= commands
    assert all(button.get("type") == "button" and "hidden" in button for button in parser.buttons)
    assert not parser.inline_handlers


def test_runtime_ui_uses_domain_available_commands_and_has_no_hidden_auto_run() -> None:
    domain = (STATIC / "pattern-execution-runtime.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-runtime-assistant.js").read_text(encoding="utf-8")
    combined = f"{domain}\n{controller}"
    lower = combined.lower()

    assert "inspected?.availableCommands" in controller
    assert 'allowed.has(button.dataset.command)' in controller
    assert "addEventListener" in controller
    assert "textContent" in controller
    assert "replaceChildren" in controller
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "availableCommands" in domain
    assert "TRANSITIONS" in domain
    for forbidden in (
        "settimeout",
        "setinterval",
        "fetch(",
        "xmlhttprequest",
        "websocket",
        "api.openai.com",
        "tesseract",
        "filereader",
        "http://",
        "https://",
    ):
        assert forbidden not in lower


def test_runtime_without_project_context_is_safe_and_has_no_commands_or_navigation() -> None:
    controller = (STATIC / "pattern-execution-runtime-assistant.js").read_text(encoding="utf-8")
    guard = "if (!projectId) return renderWithoutProject()"

    assert '.get("project")' in controller
    assert guard in controller
    assert controller.index(guard) < controller.index("new system.ProjectRepository()")
    empty_render = controller.split("function renderWithoutProject()", 1)[1]
    assert "ui.commandBar.hidden = true" in empty_render
    assert "Без project context чтение, создание и изменение runtime недоступны" in empty_render
    assert "ui.back.hidden = false" not in empty_render


def test_stage_28_and_stage_29_navigation_is_bidirectional_and_context_guarded() -> None:
    result_html = (STATIC / "pattern-execution-result.html").read_text(encoding="utf-8")
    result_controller = (STATIC / "pattern-execution-result-assistant.js").read_text(encoding="utf-8")
    runtime_html = (STATIC / "pattern-execution-runtime.html").read_text(encoding="utf-8")
    runtime_controller = (STATIC / "pattern-execution-runtime-assistant.js").read_text(encoding="utf-8")

    assert 'id="execution-result-runtime" href="/pattern-execution-runtime" hidden' in result_html
    assert "/pattern-execution-runtime?project=" in result_controller
    assert 'ui.runtime.hidden = !(snapshot && status === "ready"' in result_controller
    assert 'id="runtime-back" href="/pattern-execution-result" hidden' in runtime_html
    assert "/pattern-execution-result?project=" in runtime_controller
    assert "ui.back.hidden = false" in runtime_controller


def test_runtime_markup_is_responsive_without_horizontal_page_overflow() -> None:
    html = (STATIC / "pattern-execution-runtime.html").read_text(encoding="utf-8")
    css = (STATIC / "pattern-execution-runtime.css").read_text(encoding="utf-8")

    assert 'name="viewport"' in html
    assert "@media (max-width: 560px)" in css
    assert "min-width: 0" in css
    assert "max-width: 100%" in css
    assert "overflow-x: hidden" in css
    assert "overflow-wrap: anywhere" in css
    assert "word-break: break-word" in css
    assert "min-height: 48px" in css
    assert ":focus-visible" in css
    assert "button:disabled" in css


def test_runtime_files_and_navigation_do_not_reference_a_later_stage() -> None:
    files = [
        STATIC / "pattern-execution-runtime.js",
        STATIC / "pattern-execution-runtime-assistant.js",
        STATIC / "pattern-execution-runtime.html",
        STATIC / "pattern-execution-runtime.css",
        STATIC / "pattern-execution-result-assistant.js",
        STATIC / "pattern-execution-result.html",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in files)

    later_stage = f"Stage {29 + 1}"
    assert later_stage not in combined
    assert later_stage.lower() not in combined.lower()
    assert "PATTERN_EXECUTION_RUNTIME" in combined
    assert "/pattern-execution-runtime" in combined
