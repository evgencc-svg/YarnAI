from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class VerificationParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.links: dict[str, str] = {}
        self.buttons: set[str] = set()
        self.text: list[str] = []
        self.inline_script = False
        self.inline_handlers = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        identity = values.get("id")
        if identity:
            self.ids.add(identity)
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "script":
            if values.get("src"):
                self.assets.append(values["src"] or "")
            else:
                self.inline_script = True
        if tag == "a" and identity:
            self.links[identity] = values.get("href") or ""
        if tag == "button" and values.get("data-command"):
            self.buttons.add(values["data-command"] or "")
        self.inline_handlers |= any(name.startswith("on") and value for name, value in attrs)

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.text.append(data.strip())


def parsed_page() -> tuple[str, VerificationParser]:
    html = (STATIC / "pattern-execution-verification.html").read_text(encoding="utf-8")
    parser = VerificationParser()
    parser.feed(html)
    return html, parser


def test_verification_route_and_assets_are_available() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-verification")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    _, parser = parsed_page()
    expected = {
        "/static/pattern-execution-verification.css",
        "/static/pattern-execution-verification.js",
        "/static/pattern-execution-verification-assistant.js",
    }
    assert expected <= set(parser.assets)
    for asset in expected:
        item = client.get(asset)
        assert item.status_code == 200
        assert item.content


def test_verification_route_is_registered_once() -> None:
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-verification"]
    assert len(routes) == 1
    assert "GET" in routes[0].methods


def test_page_exposes_heading_description_action_evidence_criteria_and_outcome() -> None:
    html, parser = parsed_page()
    required = {
        "execution-verification-title", "execution-verification-description", "execution-verification-status",
        "execution-verification-summary", "execution-verification-action", "execution-verification-evidence",
        "execution-verification-criteria", "execution-verification-contradictions",
        "execution-verification-command-bar", "execution-verification-command-error",
    }
    assert required <= parser.ids
    assert "PATTERN_EXECUTION_VERIFICATION" in html
    assert "действительно ли собранные evidence подтверждают выполненное действие" in html
    assert {"create", "verify", "rebuild"} == parser.buttons
    assert not parser.inline_script
    assert not parser.inline_handlers


def test_stage_33_and_34_navigation_is_bidirectional_with_recovery() -> None:
    _, parser = parsed_page()
    assert parser.links["execution-verification-back-evidence"] == "/pattern-execution-evidence"
    assert parser.links["execution-verification-add-evidence"] == "/pattern-execution-evidence"
    assert parser.links["execution-verification-fix-action"] == "/pattern-execution-action"
    evidence_html = (STATIC / "pattern-execution-evidence.html").read_text(encoding="utf-8")
    evidence_controller = (STATIC / "pattern-execution-evidence-assistant.js").read_text(encoding="utf-8")
    assert 'id="execution-evidence-open-verification" href="/pattern-execution-verification" hidden' in evidence_html
    assert "/pattern-execution-verification?project=" in evidence_controller
    controller = (STATIC / "pattern-execution-verification-assistant.js").read_text(encoding="utf-8")
    assert 'status !== "needs_evidence"' in controller
    assert '["rejected", "contradicted", "blocked"]' in controller


def test_reload_reads_saved_verification_without_implicit_execution() -> None:
    controller = (STATIC / "pattern-execution-verification-assistant.js").read_text(encoding="utf-8")
    initialize = controller.split("async function initialize()", 1)[1].split("function bindControls()", 1)[0]
    assert "repository.readPatternExecutionVerification(projectId)" in initialize
    assert "executePatternExecutionAction" not in controller
    assert "executePatternExecutionVerificationCommand" not in initialize
    assert "createPatternExecutionVerification" not in initialize


def test_broken_references_render_safe_blocked_state() -> None:
    domain = (STATIC / "pattern-execution-verification.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-verification-assistant.js").read_text(encoding="utf-8")
    assert "brokenReferences" in domain
    assert 'effectiveStatus = brokenReferences ? "blocked"' in domain
    assert 'status === "blocked"' in controller
    assert "Безопасное blocked-состояние" in controller
    assert "showFatal" in controller


def test_keyboard_layout_and_safe_dom_primitives() -> None:
    html, _ = parsed_page()
    css = (STATIC / "pattern-execution-verification.css").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-verification-assistant.js").read_text(encoding="utf-8")
    assert 'name="viewport"' in html
    assert 'tabindex="0"' in html
    assert ":focus-visible" in css
    assert "overflow-x: auto" in css
    assert "@media (max-width: 42rem)" in css
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "fetch(" not in controller.lower()


def test_no_later_stage_is_exposed_in_production_ui() -> None:
    later_stage = f"Stage {31 + 5}"
    production = "\n".join(
        (STATIC / name).read_text(encoding="utf-8")
        for name in (
            "pattern-execution-verification.html",
            "pattern-execution-verification.css",
            "pattern-execution-verification.js",
            "pattern-execution-verification-assistant.js",
        )
    )
    assert later_stage not in production
    assert later_stage.lower() not in production.lower()
