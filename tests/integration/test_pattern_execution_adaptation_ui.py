from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.testids: set[str] = set()
        self.links: dict[str, str] = {}
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.commands: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if values.get("data-testid"):
            self.testids.add(values["data-testid"] or "")
        if values.get("data-command"):
            self.commands.add(values["data-command"] or "")
        if tag == "a" and values.get("id"):
            self.links[values["id"] or ""] = values.get("href") or ""
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")


def parse_page() -> PageParser:
    parser = PageParser()
    parser.feed((STATIC / "pattern-execution-adaptation.html").read_text(encoding="utf-8"))
    return parser


def test_stage_39_assets_and_route_are_available() -> None:
    for name in (
        "pattern-execution-adaptation.html",
        "pattern-execution-adaptation.css",
        "pattern-execution-adaptation.js",
        "pattern-execution-adaptation-assistant.js",
    ):
        assert (STATIC / name).is_file()
    client = TestClient(app)
    response = client.get("/pattern-execution-adaptation")
    assert response.status_code == 200
    assert "PATTERN_EXECUTION_ADAPTATION" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-adaptation"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}


def test_stage_39_has_all_required_structured_sections() -> None:
    parser = parse_page()
    assert {
        "pattern-execution-adaptation-page",
        "adaptation-status",
        "adaptation-source-chain",
        "adaptation-integrity-errors",
        "adaptation-learning",
        "adaptation-targets",
        "proposed-changes",
        "preserved-constraints",
        "validation-plan",
        "expected-impact",
        "confidence-assessment",
        "adaptation-terminal",
    } <= parser.testids
    assert {
        "adaptation-targets-input",
        "proposed-changes-input",
        "preserved-constraints-input",
        "validation-plan-input",
        "expected-impact-input",
        "confidence-assessment-input",
    } <= parser.ids


def test_stage_39_exposes_only_the_requested_lifecycle_commands() -> None:
    parser = parse_page()
    assert parser.commands == {
        "create-draft",
        "save-sections",
        "start-review",
        "return-draft",
        "complete",
    }
    controller = (STATIC / "pattern-execution-adaptation-assistant.js").read_text(encoding="utf-8")
    for token in (
        "createPatternExecutionAdaptation",
        "savePatternExecutionAdaptation",
        "startReview",
        "returnToDraft",
        "completeAdaptation",
        "adaptation-integrity-errors",
        "adaptation-terminal",
    ):
        assert token in controller
    assert 'command === "complete"' in controller
    assert "createPatternExecutionAdaptation(projectId);" in controller
    assert "completeAdaptation(ensureLocal(), inspected" in controller


def test_stage_38_and_stage_39_navigation_is_bidirectional_and_guarded() -> None:
    parser = parse_page()
    assert parser.links["adaptation-back-learning"] == "/pattern-execution-learning"
    learning_html = (STATIC / "pattern-execution-learning.html").read_text(encoding="utf-8")
    learning_controller = (STATIC / "pattern-execution-learning-assistant.js").read_text(encoding="utf-8")
    adaptation_controller = (STATIC / "pattern-execution-adaptation-assistant.js").read_text(encoding="utf-8")
    assert 'id="learning-adaptation-route"' in learning_html
    assert 'href="/pattern-execution-adaptation"' in learning_html
    assert "hidden" in learning_html.split('id="learning-adaptation-route"', 1)[1].split(">", 1)[0]
    assert "/pattern-execution-adaptation?project=${encodeURIComponent(projectId)}" in learning_controller
    assert 'status === "completed"' in learning_controller
    assert "Boolean(integrity?.valid)" in learning_controller
    assert "/pattern-execution-learning?project=${encodeURIComponent(projectId)}" in adaptation_controller
    assert parser.links["adaptation-validation-route"] == "/pattern-execution-adaptation-validation"
    assert "/pattern-execution-adaptation-validation?project=${encodeURIComponent(projectId)}" in adaptation_controller
    assert 'status === "completed"' in adaptation_controller


def test_stage_39_assets_are_explicit_and_ordered() -> None:
    parser = parse_page()
    assert parser.scripts == [
        "/static/pattern-execution-retrospective.js",
        "/static/pattern-execution-learning.js",
        "/static/pattern-execution-adaptation.js",
        "/static/project-system.js",
        "/static/pattern-execution-adaptation-assistant.js",
    ]
    assert "/static/pattern-execution-adaptation.css" in parser.styles


def test_integrity_and_terminal_presentations_are_real_not_synthetic() -> None:
    html = (STATIC / "pattern-execution-adaptation.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-adaptation-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-execution-adaptation.js").read_text(encoding="utf-8")
    assert 'role="alert"' in html
    assert "integrity?.issues?.length" in controller
    assert 'ui.terminal.hidden = status !== "completed"' in controller
    assert "No source record was changed" in controller
    assert "initialize().catch" in controller
    assert "completeAdaptation" in domain
    assert "autoComplete" not in controller
    assert "setTimeout" not in controller
    assert "localStorage" not in controller
    assert "sessionStorage" not in controller


def test_stage_39_is_responsive_and_does_not_start_a_later_stage() -> None:
    css = (STATIC / "pattern-execution-adaptation.css").read_text(encoding="utf-8")
    production = "\n".join((STATIC / name).read_text(encoding="utf-8") for name in (
        "pattern-execution-adaptation.html",
        "pattern-execution-adaptation.css",
        "pattern-execution-adaptation.js",
        "pattern-execution-adaptation-assistant.js",
    ))
    assert "@media" in css
    assert "Stage 40" not in production
    assert "PATTERN_EXECUTION_STAGE_40" not in production
