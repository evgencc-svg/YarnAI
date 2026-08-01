from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


class ActionParser(HTMLParser):
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


def test_action_route_assets_content_types_cache_and_health() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-action")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in response.headers["content-security-policy"]

    parser = ActionParser()
    parser.feed(response.text)
    expected = {
        "/static/pattern-execution-action.css",
        "/static/pattern-execution-action.js",
        "/static/pattern-execution-action-assistant.js",
    }
    assert expected <= set(parser.assets)
    for asset in expected:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200
        assert asset_response.content
        assert asset_response.headers["cache-control"] == "public, max-age=0, must-revalidate"
        if asset.endswith(".js"):
            assert "javascript" in asset_response.headers["content-type"]
        else:
            assert asset_response.headers["content-type"].startswith("text/css")
    assert client.get("/health").status_code == 200


def test_action_route_registered_once_without_conflict() -> None:
    matches = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-action"]
    assert len(matches) == 1
    assert matches[0].methods == {"GET", "HEAD"} or matches[0].methods == {"GET"}


def test_required_dom_anchors_commands_and_csp_safe_markup() -> None:
    html = (STATIC / "pattern-execution-action.html").read_text(encoding="utf-8")
    parser = ActionParser()
    parser.feed(html)

    assert {
        "execution-action-project-title", "execution-action-project-context", "execution-action-lifecycle",
        "execution-action-decision", "execution-action-target", "execution-action-attempt",
        "execution-action-result", "execution-action-verification", "execution-action-evidence",
        "execution-action-problem-panel", "execution-action-command-bar", "execution-action-command-error",
        "execution-action-audit", "execution-action-fingerprint", "execution-action-back-intervention",
    } <= parser.ids
    assert {button.get("data-command") for button in parser.buttons} == {
        "create", "validate", "execute", "verify", "recover", "retry", "cancel", "rebuild",
    }
    assert all(button.get("type") == "button" for button in parser.buttons)
    assert not parser.inline_handlers
    assert not parser.inline_scripts


def test_bidirectional_navigation_is_present_and_guarded() -> None:
    action_html = (STATIC / "pattern-execution-action.html").read_text(encoding="utf-8")
    action_controller = (STATIC / "pattern-execution-action-assistant.js").read_text(encoding="utf-8")
    intervention_html = (STATIC / "pattern-execution-intervention.html").read_text(encoding="utf-8")
    intervention_controller = (STATIC / "pattern-execution-intervention-assistant.js").read_text(encoding="utf-8")

    assert 'id="execution-action-back-intervention" href="/pattern-execution-intervention" hidden' in action_html
    assert "/pattern-execution-intervention?project=" in action_controller
    assert "ui.backIntervention.hidden = !inspected?.intervention" in action_controller
    assert 'id="intervention-open-action" href="/pattern-execution-action" hidden' in intervention_html
    assert "/pattern-execution-action?project=" in intervention_controller
    assert "!confirmedDecision && !existingAction" in intervention_controller


def test_empty_context_has_no_mutation_controls_and_no_automatic_execution() -> None:
    controller = (STATIC / "pattern-execution-action-assistant.js").read_text(encoding="utf-8")
    guard = "if (!projectId) return renderWithoutProject()"

    assert guard in controller
    assert controller.index(guard) < controller.index("new system.ProjectRepository()")
    empty_render = controller.split("function renderWithoutProject()", 1)[1].split("function showFatal", 1)[0]
    assert "ui.commandBar.hidden = true" in empty_render
    assert "ui.backIntervention.hidden = true" in empty_render
    assert "read-only" in empty_render
    initialize_body = controller.split("async function initialize()", 1)[1].split("function bindControls()", 1)[0]
    assert "executePatternExecutionAction" not in initialize_body
    assert "createPatternExecutionAction" not in initialize_body
    assert "runCommand(" not in initialize_body


def test_controls_are_rendered_only_from_domain_available_commands() -> None:
    controller = (STATIC / "pattern-execution-action-assistant.js").read_text(encoding="utf-8")

    assert "const allowed = new Set(inspected?.availableCommands || [])" in controller
    assert "button.hidden = !allowed.has(button.dataset.command)" in controller
    assert "runtimeActionExecuted" in controller
    assert "effectApplied" in controller
    assert "verification?.status" in controller
    assert "alert(" not in controller
    assert "prompt(" not in controller
    assert "confirm(" not in controller
    assert "innerHTML" not in controller
    assert "fetch(" not in controller.lower()


def test_mobile_layout_guards_375px() -> None:
    html = (STATIC / "pattern-execution-action.html").read_text(encoding="utf-8")
    css = (STATIC / "pattern-execution-action.css").read_text(encoding="utf-8")

    assert 'name="viewport"' in html
    assert "@media (max-width: 40rem)" in css
    assert "min-width: 0" in css
    assert "overflow-wrap: anywhere" in css
    assert "grid-template-columns: minmax(0, 1fr)" in css
    assert "button:disabled" in css


def test_changed_files_do_not_name_a_nonexistent_later_stage_or_forbidden_dynamic_code() -> None:
    files = [
        STATIC / "pattern-execution-action.js",
        STATIC / "pattern-execution-action-assistant.js",
        STATIC / "pattern-execution-action.html",
        STATIC / "pattern-execution-action.css",
        ROOT / "tests-js" / "pattern-execution-action.test.cjs",
        ROOT / "tests" / "test_pattern_execution_action_ui.py",
        STATIC / "pattern-execution-intervention-assistant.js",
        STATIC / "pattern-execution-intervention.html",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
    forbidden = f"Stage {30 + 3}"

    assert forbidden not in combined
    assert forbidden.lower() not in combined.lower()
    dynamic_eval = "ev" + "al("
    dynamic_function = "new Fun" + "ction("
    assert dynamic_eval not in combined
    assert dynamic_function not in combined
