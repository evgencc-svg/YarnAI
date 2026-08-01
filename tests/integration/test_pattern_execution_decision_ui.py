from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class DecisionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.testids: set[str] = set()
        self.links: dict[str, str] = {}
        self.commands: set[str] = set()
        self.inline_script = False
        self.inline_handlers = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        identity = values.get("id")
        if identity:
            self.ids.add(identity)
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


def parsed_page() -> tuple[str, DecisionParser]:
    html = (STATIC / "pattern-execution-decision.html").read_text(encoding="utf-8")
    parser = DecisionParser()
    parser.feed(html)
    return html, parser


def production_text() -> str:
    return "\n".join(
        (STATIC / name).read_text(encoding="utf-8")
        for name in (
            "pattern-execution-decision.html",
            "pattern-execution-decision.css",
            "pattern-execution-decision.js",
            "pattern-execution-decision-assistant.js",
        )
    )


def test_decision_route_and_assets_are_available() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-decision")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    _, parser = parsed_page()
    expected = {
        "/static/pattern-execution-decision.css",
        "/static/pattern-execution-decision.js",
        "/static/pattern-execution-decision-assistant.js",
    }
    assert expected <= set(parser.assets)
    for asset in expected:
        item = client.get(asset)
        assert item.status_code == 200
        assert item.content


def test_decision_route_is_registered_once() -> None:
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-decision"]
    assert len(routes) == 1
    assert "GET" in routes[0].methods


def test_page_has_status_recommendation_allowed_outcomes_and_explicit_confirmation() -> None:
    html, parser = parsed_page()
    assert "PATTERN_EXECUTION_DECISION" in html
    assert {
        "decision-status", "verification-status", "decision-recommendation", "allowed-outcomes",
        "decision-outcome", "decision-reason", "selected-criteria", "selected-evidence",
        "decision-explicit-confirmation", "confirm-decision",
    } <= parser.testids
    assert {"create", "begin", "decide", "rebuild"} == parser.commands


def test_stage_35_links_back_to_stage_34_and_routes_recovery_outcomes() -> None:
    _, parser = parsed_page()
    assert parser.links["execution-decision-back-verification"] == "/pattern-execution-verification"
    assert parser.links["execution-decision-more-evidence"] == "/pattern-execution-evidence"
    assert parser.links["execution-decision-correct-action"] == "/pattern-execution-action"
    assert parser.links["execution-decision-open-follow-up"] == "/pattern-execution-follow-up"
    controller = (STATIC / "pattern-execution-decision-assistant.js").read_text(encoding="utf-8")
    assert 'status !== "more_evidence_required"' in controller
    assert '["correction_required", "rejected", "blocked"]' in controller
    assert "/pattern-execution-verification${query}" in controller
    assert "/pattern-execution-follow-up${query}" in controller


def test_stage_34_exposes_stage_35_transition() -> None:
    verification_html = (STATIC / "pattern-execution-verification.html").read_text(encoding="utf-8")
    verification_controller = (STATIC / "pattern-execution-verification-assistant.js").read_text(encoding="utf-8")
    assert 'id="execution-verification-open-decision" href="/pattern-execution-decision" hidden' in verification_html
    assert "/pattern-execution-decision${query}" in verification_controller


def test_stage_35_exposes_follow_up_but_no_unimplemented_later_stage() -> None:
    production = production_text()
    assert "Stage 36" in production
    assert "/pattern-execution-follow-up" in production
    assert "Stage 37" not in production
    assert "/pattern-execution-stage-37" not in production
    assert "Продолжить" not in production
    assert 'status: "accepted"' not in (STATIC / "pattern-execution-decision-assistant.js").read_text(encoding="utf-8")


def test_controller_reads_only_and_requires_explicit_decision_and_rebuild_commands() -> None:
    controller = (STATIC / "pattern-execution-decision-assistant.js").read_text(encoding="utf-8")
    initialize = controller.split("async function initialize()", 1)[1].split("function bindControls()", 1)[0]
    assert "repository.readPatternExecutionDecision(projectId)" in initialize
    assert "executePatternExecutionAction" not in controller
    assert "collectPatternExecutionEvidence" not in controller
    assert "verifyPatternExecutionVerification" not in controller
    assert "ui.confirmation.checked" in controller
    assert "repository.decidePatternExecution" in controller
    assert "repository.rebuildPatternExecutionDecision" in controller
    assert "new Date" not in controller
    assert "Date.now" not in controller


def test_csp_safe_dom_and_responsive_controls() -> None:
    html, parser = parsed_page()
    css = (STATIC / "pattern-execution-decision.css").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-decision-assistant.js").read_text(encoding="utf-8")
    assert 'name="viewport"' in html
    assert not parser.inline_script
    assert not parser.inline_handlers
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "eval(" not in controller
    assert ":focus-visible" in css
    assert "@media (max-width: 42rem)" in css
