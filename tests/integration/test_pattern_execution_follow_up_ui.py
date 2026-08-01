from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class FollowUpParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.testids: set[str] = set()
        self.links: dict[str, str] = {}
        self.commands: set[str] = set()
        self.inline_script = False
        self.inline_handlers = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        identity = values.get("id")
        if values.get("data-testid"):
            self.testids.add(values["data-testid"] or "")
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
            self.commands.add(values["data-command"] or "")
        self.inline_handlers |= any(name.startswith("on") and value for name, value in attrs)


def parsed_page() -> tuple[str, FollowUpParser]:
    html = (STATIC / "pattern-execution-follow-up.html").read_text(encoding="utf-8")
    parser = FollowUpParser()
    parser.feed(html)
    return html, parser


def production_text() -> str:
    return "\n".join(
        (STATIC / name).read_text(encoding="utf-8")
        for name in (
            "pattern-execution-follow-up.html",
            "pattern-execution-follow-up.css",
            "pattern-execution-follow-up.js",
            "pattern-execution-follow-up-assistant.js",
            "pattern-execution-decision.html",
            "pattern-execution-decision-assistant.js",
            "project-system.js",
        )
    )


def test_follow_up_route_and_assets_are_available() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-follow-up")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    _, parser = parsed_page()
    expected = {
        "/static/pattern-execution-follow-up.css",
        "/static/pattern-execution-follow-up.js",
        "/static/pattern-execution-follow-up-assistant.js",
        "/static/pattern-execution-decision.js",
        "/static/project-system.js",
    }
    assert expected <= set(parser.assets)
    for asset in expected:
        item = client.get(asset)
        assert item.status_code == 200
        assert item.content


def test_follow_up_route_is_registered_once() -> None:
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-follow-up"]
    assert len(routes) == 1
    assert "GET" in routes[0].methods


def test_page_exposes_lifecycle_commands_and_explicit_confirmation() -> None:
    html, parser = parsed_page()
    assert "PATTERN_EXECUTION_FOLLOW_UP" in html
    assert {
        "follow-up-status", "follow-up-revision", "decision-outcome", "follow-up-recommendation",
        "follow-up-kind", "follow-up-reason", "selected-criteria", "selected-evidence",
        "selected-actions", "follow-up-explicit-confirmation",
    } <= parser.testids
    assert {"create", "schedule", "activate", "complete", "fail", "cancel", "rebuild"} == parser.commands
    controller = (STATIC / "pattern-execution-follow-up-assistant.js").read_text(encoding="utf-8")
    for state in ("waiting", "ready", "scheduling", "active", "completed", "failed", "cancelled", "blocked", "stale"):
        assert state in controller


def test_stage_35_and_stage_36_navigation_is_bidirectional() -> None:
    _, parser = parsed_page()
    assert parser.links["execution-follow-up-back-decision"] == "/pattern-execution-decision"
    assert parser.links["execution-follow-up-evidence-route"] == "/pattern-execution-evidence"
    assert parser.links["execution-follow-up-action-route"] == "/pattern-execution-action"
    decision_html = (STATIC / "pattern-execution-decision.html").read_text(encoding="utf-8")
    decision_controller = (STATIC / "pattern-execution-decision-assistant.js").read_text(encoding="utf-8")
    assert 'id="execution-decision-open-follow-up"' in decision_html
    assert "/pattern-execution-follow-up${query}" in decision_controller


def test_outcome_routes_are_explicit_and_have_no_later_stage() -> None:
    controller = (STATIC / "pattern-execution-follow-up-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-execution-follow-up.js").read_text(encoding="utf-8")
    assert 'accepted: ["completion"]' in domain
    assert 'more_evidence_required: ["collect_evidence"]' in domain
    assert 'correction_required: ["corrective_action"]' in domain
    assert 'rejected: ["corrective_action", "termination"]' in domain
    assert 'routeKind === "collect_evidence"' in controller
    assert 'routeKind === "corrective_action"' in controller
    production = production_text()
    assert "Stage 37" not in production
    assert "/pattern-execution-stage-37" not in production


def test_controller_never_runs_previous_stages() -> None:
    controller = (STATIC / "pattern-execution-follow-up-assistant.js").read_text(encoding="utf-8")
    initialize = controller.split("async function initialize()", 1)[1].split("function bindControls()", 1)[0]
    assert "repository.readPatternExecutionFollowUp(projectId)" in initialize
    assert "ui.confirmation.checked" in controller
    assert "repository.createPatternExecutionFollowUp" in controller
    assert "repository.rebuildPatternExecutionFollowUp" in controller
    assert "executePatternExecutionAction" not in controller
    assert "collectPatternExecutionEvidence" not in controller
    assert "completePatternExecutionVerification" not in controller
    assert "decidePatternExecution" not in controller


def test_terminal_lock_stale_rebuild_and_safe_error_rendering() -> None:
    controller = (STATIC / "pattern-execution-follow-up-assistant.js").read_text(encoding="utf-8")
    assert '["completed", "failed", "cancelled"]' in controller
    assert 'status !== "stale"' in controller
    assert 'commands.has(command)' in controller
    assert "safeMessage" in controller
    assert "error?.stack" not in controller


def test_csp_safe_dom_and_responsive_layout() -> None:
    html, parser = parsed_page()
    css = (STATIC / "pattern-execution-follow-up.css").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-follow-up-assistant.js").read_text(encoding="utf-8")
    assert 'name="viewport"' in html
    assert not parser.inline_script
    assert not parser.inline_handlers
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "eval(" not in controller
    assert "@media" in css
