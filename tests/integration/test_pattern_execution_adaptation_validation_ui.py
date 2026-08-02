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


def parse_page(name: str = "pattern-execution-adaptation-validation.html") -> PageParser:
    parser = PageParser()
    parser.feed((STATIC / name).read_text(encoding="utf-8"))
    return parser


def test_stage_40_assets_and_route_are_available() -> None:
    for name in (
        "pattern-execution-adaptation-validation.html",
        "pattern-execution-adaptation-validation.css",
        "pattern-execution-adaptation-validation.js",
        "pattern-execution-adaptation-validation-assistant.js",
    ):
        assert (STATIC / name).is_file()
    response = TestClient(app).get("/pattern-execution-adaptation-validation")
    assert response.status_code == 200
    assert "PATTERN_EXECUTION_ADAPTATION_VALIDATION" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-adaptation-validation"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}


def test_stage_40_has_source_plan_evidence_coverage_regression_impact_and_verdict_sections() -> None:
    parser = parse_page()
    assert {
        "pattern-execution-adaptation-validation-page",
        "adaptation-validation-status",
        "adaptation-validation-source-chain",
        "adaptation-validation-stale-warning",
        "adaptation-validation-integrity-errors",
        "selected-completed-adaptation",
        "adaptation-targets-view",
        "proposed-changes-view",
        "preserved-constraints-view",
        "declared-validation-plan-view",
        "validation-coverage",
        "executed-validations",
        "constraint-results",
        "regression-results",
        "expected-impact-results",
        "unresolved-items",
        "evidence-summary",
        "validation-confidence",
        "final-verdict",
        "verdict-reasons",
        "adaptation-validation-terminal",
    } <= parser.testids
    assert {
        "executed-validations-input",
        "constraint-results-input",
        "regression-results-input",
        "expected-impact-results-input",
        "unresolved-items-input",
        "evidence-summary-input",
        "validation-confidence-input",
    } <= parser.ids


def test_stage_40_controller_delegates_lifecycle_and_verdict_to_domain_model() -> None:
    parser = parse_page()
    assert parser.commands == {
        "create-draft",
        "start-validation",
        "save-results",
        "return-draft",
        "start-review",
        "return-running",
        "complete",
    }
    controller = (STATIC / "pattern-execution-adaptation-validation-assistant.js").read_text(encoding="utf-8")
    for token in (
        "createPatternExecutionAdaptationValidation",
        "savePatternExecutionAdaptationValidation",
        "startValidation",
        "returnToDraft",
        "startReview",
        "returnToRunning",
        "completeValidation",
        "setExecutedValidations",
        "setConstraintResults",
        "setRegressionResults",
        "setExpectedImpactResults",
        "setEvidenceSummary",
    ):
        assert token in controller
    assert "deriveFinalVerdict" not in controller
    assert "finalVerdict =" not in controller
    assert "completeValidation(ensureLocal(), inspected" in controller


def test_stage_39_stage_40_and_promotion_navigation_is_context_guarded() -> None:
    parser = parse_page()
    assert parser.links["validation-back-adaptation"] == "/pattern-execution-adaptation"
    adaptation_html = (STATIC / "pattern-execution-adaptation.html").read_text(encoding="utf-8")
    adaptation_controller = (STATIC / "pattern-execution-adaptation-assistant.js").read_text(encoding="utf-8")
    validation_controller = (STATIC / "pattern-execution-adaptation-validation-assistant.js").read_text(encoding="utf-8")
    assert 'id="adaptation-validation-route"' in adaptation_html
    assert 'href="/pattern-execution-adaptation-validation"' in adaptation_html
    assert "hidden" in adaptation_html.split('id="adaptation-validation-route"', 1)[1].split(">", 1)[0]
    assert "/pattern-execution-adaptation-validation?project=${encodeURIComponent(projectId)}" in adaptation_controller
    assert 'status === "completed"' in adaptation_controller
    assert "Boolean(integrity?.valid)" in adaptation_controller
    assert "/pattern-execution-adaptation?project=${encodeURIComponent(projectId)}" in validation_controller
    assert parser.links["validation-forward-promotion"] == "/pattern-execution-adaptation-promotion"
    assert 'id="validation-forward-promotion"' in (STATIC / "pattern-execution-adaptation-validation.html").read_text(encoding="utf-8")
    assert "status === \"completed\"" in validation_controller
    assert "api.FINAL_VERDICTS.includes" in validation_controller


def test_stage_40_assets_are_explicit_ordered_accessible_and_responsive() -> None:
    parser = parse_page()
    assert parser.scripts == [
        "/static/pattern-execution-retrospective.js",
        "/static/pattern-execution-learning.js",
        "/static/pattern-execution-adaptation.js",
        "/static/pattern-execution-adaptation-validation.js",
        "/static/project-system.js",
        "/static/pattern-execution-adaptation-validation-assistant.js",
    ]
    assert "/static/pattern-execution-adaptation-validation.css" in parser.styles
    html = (STATIC / "pattern-execution-adaptation-validation.html").read_text(encoding="utf-8")
    css = (STATIC / "pattern-execution-adaptation-validation.css").read_text(encoding="utf-8")
    assert 'role="alert"' in html
    assert 'aria-live="polite"' in html
    assert "@media" in css


def test_stage_40_has_no_forbidden_production_patterns_or_automatic_application() -> None:
    production = "\n".join((STATIC / name).read_text(encoding="utf-8") for name in (
        "pattern-execution-adaptation-validation.html",
        "pattern-execution-adaptation-validation.css",
        "pattern-execution-adaptation-validation.js",
        "pattern-execution-adaptation-validation-assistant.js",
    ))
    for forbidden in (
        "Date.now(",
        "new Date(",
        "Math.random(",
        "crypto.randomUUID(",
        "console.log(",
        "console.debug(",
        ".stack",
        "localStorage",
        "sessionStorage",
        "applyAdaptation",
        "createPatternExecutionRuntime",
    ):
        assert forbidden not in production
    assert '"summary"' not in production
    assert "No source record or adaptation was changed" in production
