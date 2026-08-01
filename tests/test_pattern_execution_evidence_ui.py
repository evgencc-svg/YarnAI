from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


class EvidenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.buttons: list[dict[str, str | None]] = []
        self.inline_scripts: list[str] = []
        self.inline_handlers: list[str] = []
        self._inside_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if tag == "script":
            if values.get("src"):
                self.assets.append(values["src"] or "")
            else:
                self._inside_script = True
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "button":
            self.buttons.append(values)
        self.inline_handlers.extend(name for name, value in attrs if name.startswith("on") and value)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self._inside_script = False

    def handle_data(self, data: str) -> None:
        if self._inside_script and data.strip():
            self.inline_scripts.append(data)


def test_evidence_http_route_assets_content_types_cache_and_health() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-evidence")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"

    parser = EvidenceParser()
    parser.feed(response.text)
    expected = {
        "/static/pattern-execution-evidence.css",
        "/static/pattern-execution-evidence.js",
        "/static/pattern-execution-evidence-assistant.js",
    }
    assert expected <= set(parser.assets)
    for asset in expected:
        item = client.get(asset)
        assert item.status_code == 200
        assert item.content
        assert item.headers["cache-control"] == "public, max-age=0, must-revalidate"
        if asset.endswith(".js"):
            assert "javascript" in item.headers["content-type"]
        else:
            assert item.headers["content-type"].startswith("text/css")
    assert client.get("/health").status_code == 200
    assert client.get("/pattern-execution-action").status_code == 200


def test_evidence_route_is_registered_once() -> None:
    matches = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-evidence"]
    assert len(matches) == 1
    assert "GET" in matches[0].methods


def test_required_safe_dom_and_explicit_commands() -> None:
    html = (STATIC / "pattern-execution-evidence.html").read_text(encoding="utf-8")
    parser = EvidenceParser()
    parser.feed(html)
    assert {
        "execution-evidence-title", "execution-evidence-context", "execution-evidence-lifecycle",
        "execution-evidence-identity", "execution-evidence-chain-status", "execution-evidence-chain",
        "execution-evidence-items", "execution-evidence-assertions", "execution-evidence-missing",
        "execution-evidence-contradictions", "execution-evidence-unexpected", "execution-evidence-summary",
        "execution-evidence-command-bar", "execution-evidence-command-error", "execution-evidence-audit",
        "execution-evidence-fingerprint", "execution-evidence-back-action", "execution-evidence-export",
    } <= parser.ids
    assert {button.get("data-command") for button in parser.buttons if button.get("data-command")} == {
        "create", "collect", "validate", "complete", "retry", "rebuild", "cancel",
    }
    assert all(button.get("type") == "button" and "hidden" in button for button in parser.buttons)
    assert not parser.inline_handlers
    assert not parser.inline_scripts


def test_no_project_context_is_read_only_and_loading_never_collects_or_validates() -> None:
    controller = (STATIC / "pattern-execution-evidence-assistant.js").read_text(encoding="utf-8")
    guard = "if (!projectId) return renderWithoutProject()"
    assert guard in controller
    assert controller.index(guard) < controller.index("new system.ProjectRepository()")
    initialize = controller.split("async function initialize()", 1)[1].split("function bindControls()", 1)[0]
    for forbidden in (
        "collectPatternExecutionEvidence", "validatePatternExecutionEvidence",
        "completePatternExecutionEvidence", "createPatternExecutionEvidence", "runCommand(",
    ):
        assert forbidden not in initialize
    empty = controller.split("function renderWithoutProject()", 1)[1].split("function showFatal", 1)[0]
    assert "ui.commandBar.hidden = true" in empty
    assert "ui.backAction.hidden = true" in empty
    assert "read-only" in empty


def test_controls_require_verified_action_and_domain_available_commands() -> None:
    controller = (STATIC / "pattern-execution-evidence-assistant.js").read_text(encoding="utf-8")
    assert 'inspected?.action?.lifecycle === "completed"' in controller
    assert 'inspected?.action?.verification?.status === "verified"' in controller
    assert 'inspected?.action?.currentAttempt?.status === "verified"' in controller
    assert "const allowed = new Set(inspected?.availableCommands || [])" in controller
    assert "!verifiedAction || !allowed.has(button.dataset.command)" in controller
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "fetch(" not in controller.lower()


def test_action_and_evidence_navigation_is_bidirectional_and_guarded() -> None:
    action_html = (STATIC / "pattern-execution-action.html").read_text(encoding="utf-8")
    action_controller = (STATIC / "pattern-execution-action-assistant.js").read_text(encoding="utf-8")
    evidence_html = (STATIC / "pattern-execution-evidence.html").read_text(encoding="utf-8")
    evidence_controller = (STATIC / "pattern-execution-evidence-assistant.js").read_text(encoding="utf-8")
    assert 'id="execution-action-open-evidence" href="/pattern-execution-evidence" hidden' in action_html
    assert "/pattern-execution-evidence?project=" in action_controller
    assert 'snapshot?.lifecycle === "completed"' in action_controller
    assert 'snapshot?.verification?.status === "verified"' in action_controller
    assert 'id="execution-evidence-back-action" href="/pattern-execution-action" hidden' in evidence_html
    assert "/pattern-execution-action?project=" in evidence_controller
    assert "ui.backAction.hidden = !inspected?.action" in evidence_controller


def test_375px_layout_has_no_horizontal_overflow_primitives() -> None:
    html = (STATIC / "pattern-execution-evidence.html").read_text(encoding="utf-8")
    css = (STATIC / "pattern-execution-evidence.css").read_text(encoding="utf-8")
    assert 'name="viewport"' in html
    assert "@media (max-width: 40rem)" in css
    assert "max-width: 100%" in css
    assert "overflow-x: clip" in css
    assert "min-width: 0" in css
    assert "overflow-wrap: anywhere" in css
    assert "word-break: break-word" in css
    assert "grid-template-columns: minmax(0, 1fr)" in css
    assert ":focus-visible" in css


def test_no_later_stage_or_forbidden_dynamic_execution_constructs() -> None:
    files = [
        STATIC / "pattern-execution-evidence.js", STATIC / "pattern-execution-evidence-assistant.js",
        STATIC / "pattern-execution-evidence.html", STATIC / "pattern-execution-evidence.css",
        STATIC / "pattern-execution-action-assistant.js", STATIC / "pattern-execution-action.html",
        ROOT / "tests-js" / "pattern-execution-evidence.test.cjs",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
    forbidden_stage = f"Stage {30 + 5}"
    assert forbidden_stage not in combined
    assert forbidden_stage.lower() not in combined.lower()
    for forbidden in (
        "ev" + "al(", "new Fun" + "ction(", "import" + "(",
        "XMLHttpRequest", "WebSocket", "child_process", "process.exec", "shell_exec",
    ):
        assert forbidden not in combined
