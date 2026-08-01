from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


class MonitoringParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.buttons: list[dict[str, str | None]] = []
        self.links: list[dict[str, str | None]] = []
        self.inline_scripts: list[str] = []
        self.inline_handlers: list[str] = []
        self._inside_inline_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if tag == "script":
            if values.get("src"):
                self.assets.append(values["src"] or "")
            else:
                self._inside_inline_script = True
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "button":
            self.buttons.append(values)
        if tag == "a":
            self.links.append(values)
        self.inline_handlers.extend(name for name, value in attrs if name.startswith("on") and value)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self._inside_inline_script = False

    def handle_data(self, data: str) -> None:
        if self._inside_inline_script and data.strip():
            self.inline_scripts.append(data)


def test_monitoring_route_assets_content_types_and_security_headers() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-monitoring")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]

    parser = MonitoringParser()
    parser.feed(response.text)
    expected = {
        "/static/pattern-execution-monitoring.css",
        "/static/pattern-execution-monitoring.js",
        "/static/pattern-execution-monitoring-assistant.js",
    }
    assert expected <= set(parser.assets)
    for asset in expected:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200
        assert asset_response.content
        assert asset_response.headers["cache-control"] == "public, max-age=0, must-revalidate"
        assert asset_response.headers["x-content-type-options"] == "nosniff"
        if asset.endswith(".js"):
            assert "javascript" in asset_response.headers["content-type"]
        if asset.endswith(".css"):
            assert asset_response.headers["content-type"].startswith("text/css")


def test_monitoring_markup_exposes_required_domain_projections_and_commands() -> None:
    html = (STATIC / "pattern-execution-monitoring.html").read_text(encoding="utf-8")
    parser = MonitoringParser()
    parser.feed(html)

    assert {
        "monitoring-project-title",
        "monitoring-project-context",
        "monitoring-lifecycle",
        "monitoring-runtime-status",
        "monitoring-progress-bar",
        "monitoring-steps",
        "monitoring-checkpoints",
        "monitoring-current-activity",
        "monitoring-blockers",
        "monitoring-warnings",
        "monitoring-recommended-action",
        "monitoring-timeline",
        "monitoring-diagnostics",
        "monitoring-recovery-panel",
        "monitoring-stale-panel",
        "monitoring-failure-panel",
        "monitoring-open-runtime",
        "monitoring-back-runtime",
        "monitoring-open-intervention",
    } <= parser.ids
    commands = {button.get("data-command") for button in parser.buttons}
    assert {"create", "refresh", "recover", "rebuild"} <= commands
    assert all(button.get("type") == "button" and "hidden" in button for button in parser.buttons)
    assert not parser.inline_handlers
    assert not parser.inline_scripts


def test_monitoring_ui_renders_domain_values_without_inline_domain_logic() -> None:
    controller = (STATIC / "pattern-execution-monitoring-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-execution-monitoring.js").read_text(encoding="utf-8")
    lower = f"{controller}\n{domain}".lower()

    assert "snapshot?.progressSummary" in controller
    assert "snapshot?.runtimeSummary" in controller
    assert "snapshot?.currentActivity" in controller
    assert "snapshot?.recommendedAction" in controller
    assert "inspected?.availableCommands" in controller
    assert "allowed.has(button.dataset.command)" in controller
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "complete_current_action" not in controller
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


def test_monitoring_without_project_context_is_safe_and_disables_actions() -> None:
    controller = (STATIC / "pattern-execution-monitoring-assistant.js").read_text(encoding="utf-8")
    guard = "if (!projectId) return renderWithoutProject()"

    assert '.get("project")' in controller
    assert guard in controller
    assert controller.index(guard) < controller.index("new system.ProjectRepository()")
    empty_render = controller.split("function renderWithoutProject()", 1)[1]
    assert "ui.commandBar.hidden = true" in empty_render
    assert "ui.openRuntime.hidden = true" in empty_render
    assert "ui.backRuntime.hidden = true" in empty_render
    assert "Без project context" in empty_render
    assert "throw" not in empty_render.split("function showFatal", 1)[0]


def test_runtime_and_monitoring_navigation_is_bidirectional_and_context_guarded() -> None:
    runtime_html = (STATIC / "pattern-execution-runtime.html").read_text(encoding="utf-8")
    runtime_controller = (STATIC / "pattern-execution-runtime-assistant.js").read_text(encoding="utf-8")
    monitoring_html = (STATIC / "pattern-execution-monitoring.html").read_text(encoding="utf-8")
    monitoring_controller = (STATIC / "pattern-execution-monitoring-assistant.js").read_text(encoding="utf-8")

    assert 'id="runtime-monitoring" href="/pattern-execution-monitoring" hidden' in runtime_html
    assert "/pattern-execution-monitoring?project=" in runtime_controller
    assert "ui.monitoring.hidden = false" in runtime_controller
    assert runtime_controller.index("if (!projectId) return renderWithoutProject()") < runtime_controller.index("ui.monitoring.hidden = false")
    assert 'id="monitoring-back-runtime" href="/pattern-execution-runtime" hidden' in monitoring_html
    assert "/pattern-execution-runtime?project=" in monitoring_controller
    assert "ui.backRuntime.hidden = false" in monitoring_controller
    assert 'id="monitoring-open-intervention" href="/pattern-execution-intervention" hidden' in monitoring_html
    assert "/pattern-execution-intervention?project=" in monitoring_controller
    assert "ui.openIntervention.hidden = !canIntervene" in monitoring_controller


def test_monitoring_layout_has_mobile_overflow_guards() -> None:
    html = (STATIC / "pattern-execution-monitoring.html").read_text(encoding="utf-8")
    css = (STATIC / "pattern-execution-monitoring.css").read_text(encoding="utf-8")

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


def test_monitoring_and_changed_runtime_files_do_not_name_a_later_stage() -> None:
    files = [
        STATIC / "pattern-execution-monitoring.js",
        STATIC / "pattern-execution-monitoring-assistant.js",
        STATIC / "pattern-execution-monitoring.html",
        STATIC / "pattern-execution-monitoring.css",
        STATIC / "pattern-execution-runtime-assistant.js",
        STATIC / "pattern-execution-runtime.html",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
    forbidden = f"Stage {30 + 2}"

    assert forbidden not in combined
    assert forbidden.lower() not in combined.lower()
    assert "PATTERN_EXECUTION_MONITORING" in combined
    assert "/pattern-execution-monitoring" in combined


def test_runtime_and_monitoring_http_smoke() -> None:
    client = TestClient(app)
    runtime = client.get("/pattern-execution-runtime")
    monitoring = client.get("/pattern-execution-monitoring")

    assert runtime.status_code == 200
    assert monitoring.status_code == 200
    assert "runtime-monitoring" in runtime.text
    assert "monitoring-back-runtime" in monitoring.text
