from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


class InterventionParser(HTMLParser):
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


def test_intervention_route_assets_content_types_and_security_headers() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-intervention")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]

    parser = InterventionParser()
    parser.feed(response.text)
    expected = {
        "/static/pattern-execution-intervention.css",
        "/static/pattern-execution-intervention.js",
        "/static/pattern-execution-intervention-assistant.js",
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
        else:
            assert asset_response.headers["content-type"].startswith("text/css")


def test_route_is_registered_once_for_get() -> None:
    matches = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-intervention"]
    assert len(matches) == 1
    assert matches[0].methods == {"GET", "HEAD"} or matches[0].methods == {"GET"}


def test_markup_exposes_required_sections_controls_and_guarded_action_link() -> None:
    html = (STATIC / "pattern-execution-intervention.html").read_text(encoding="utf-8")
    parser = InterventionParser()
    parser.feed(html)

    assert {
        "intervention-project-title", "intervention-project-context", "intervention-lifecycle",
        "intervention-monitoring-status", "intervention-assessment-reason", "intervention-observations",
        "intervention-blockers", "intervention-warnings", "intervention-recommendation",
        "intervention-actions", "intervention-select", "intervention-confirmation-panel",
        "intervention-confirm", "intervention-decision-panel", "intervention-decision",
        "intervention-state-panel", "intervention-source-identity", "intervention-back-monitoring",
        "intervention-open-action",
    } <= parser.ids
    commands = {button.get("data-command") for button in parser.buttons}
    assert {"create", "check_identity", "recover", "rebuild", "cancel", "complete"} <= commands
    assert all(button.get("type") == "button" for button in parser.buttons)
    assert not parser.inline_handlers
    assert not parser.inline_scripts
    assert {link.get("id") for link in parser.links if (link.get("href") or "").startswith("/pattern-execution-")} == {
        "intervention-back-monitoring", "intervention-open-action",
    }


def test_monitoring_and_intervention_navigation_is_bidirectional_and_guarded() -> None:
    monitoring_html = (STATIC / "pattern-execution-monitoring.html").read_text(encoding="utf-8")
    monitoring_controller = (STATIC / "pattern-execution-monitoring-assistant.js").read_text(encoding="utf-8")
    intervention_html = (STATIC / "pattern-execution-intervention.html").read_text(encoding="utf-8")
    intervention_controller = (STATIC / "pattern-execution-intervention-assistant.js").read_text(encoding="utf-8")

    assert 'id="monitoring-open-intervention" href="/pattern-execution-intervention" hidden' in monitoring_html
    assert "/pattern-execution-intervention?project=" in monitoring_controller
    assert "const canIntervene = Boolean(" in monitoring_controller
    assert "ui.openIntervention.hidden = !canIntervene" in monitoring_controller
    assert 'id="intervention-back-monitoring" href="/pattern-execution-monitoring" hidden' in intervention_html
    assert "/pattern-execution-monitoring?project=" in intervention_controller
    assert "if (inspected?.monitoringRecord && inspected?.monitoring && !inspected?.corrupt)" in intervention_controller


def test_intervention_to_action_navigation_requires_confirmation_or_existing_action() -> None:
    html = (STATIC / "pattern-execution-intervention.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-intervention-assistant.js").read_text(encoding="utf-8")

    assert 'id="intervention-open-action" href="/pattern-execution-action" hidden' in html
    assert "/pattern-execution-action?project=" in controller
    assert 'lifecycle?.state === "confirmed"' in controller
    assert "Boolean(inspected?.rawIntervention?.decision)" in controller
    assert "!confirmedDecision && !existingAction" in controller
    empty_render = controller.split("function renderWithoutProject()", 1)[1].split("function showFatal", 1)[0]
    assert "ui.openAction.hidden = true" in empty_render


def test_empty_project_context_is_safe_and_disables_all_mutations() -> None:
    controller = (STATIC / "pattern-execution-intervention-assistant.js").read_text(encoding="utf-8")
    guard = "if (!projectId) return renderWithoutProject()"

    assert '.get("project")' in controller
    assert guard in controller
    assert controller.index(guard) < controller.index("new system.ProjectRepository()")
    empty_render = controller.split("function renderWithoutProject()", 1)[1].split("function showFatal", 1)[0]
    assert "ui.commandBar.hidden = true" in empty_render
    assert "ui.backMonitoring.hidden = true" in empty_render
    assert "ui.select.hidden = true" in empty_render
    assert "ui.confirmationPanel.hidden = true" in empty_render
    assert "Без project context" in empty_render
    assert "throw" not in empty_render


def test_ui_escapes_text_and_never_calls_runtime_mutations_or_network() -> None:
    controller = (STATIC / "pattern-execution-intervention-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-execution-intervention.js").read_text(encoding="utf-8")
    lower = f"{controller}\n{domain}".lower()

    assert "textContent" in controller
    assert "replaceChildren" in controller
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    for runtime_mutation in (
        "startPatternExecutionRuntime", "pausePatternExecutionRuntime", "resumePatternExecutionRuntime",
        "recoverPatternExecutionRuntime", "rebuildPatternExecutionRuntime", "stopPatternExecutionRuntime",
    ):
        assert runtime_mutation not in controller
    for forbidden in ("fetch(", "xmlhttprequest", "websocket", "api.openai.com", "tesseract", "filereader", "setinterval"):
        assert forbidden not in lower


def test_mobile_layout_guards_375px_without_inline_csp_violations() -> None:
    html = (STATIC / "pattern-execution-intervention.html").read_text(encoding="utf-8")
    css = (STATIC / "pattern-execution-intervention.css").read_text(encoding="utf-8")

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


def test_new_and_changed_stage_files_do_not_name_a_nonexistent_later_stage() -> None:
    files = [
        STATIC / "pattern-execution-intervention.js",
        STATIC / "pattern-execution-intervention-assistant.js",
        STATIC / "pattern-execution-intervention.html",
        STATIC / "pattern-execution-intervention.css",
        STATIC / "pattern-execution-intervention.test.cjs",
        STATIC / "pattern-execution-monitoring-assistant.js",
        STATIC / "pattern-execution-monitoring.html",
        ROOT / "tests" / "test_pattern_execution_intervention_ui.py",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
    forbidden = f"Stage {30 + 2}"

    assert forbidden not in combined
    assert forbidden.lower() not in combined.lower()
