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
        self.inputs: list[dict[str, str | None]] = []

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
        if tag in {"input", "select", "textarea"}:
            self.inputs.append(values)


def parse_page() -> PageParser:
    parser = PageParser()
    parser.feed((STATIC / "pattern-execution-adaptation-promotion.html").read_text(encoding="utf-8"))
    return parser


def test_stage_41_route_assets_content_type_and_static_integration() -> None:
    for name in (
        "pattern-execution-adaptation-promotion.html",
        "pattern-execution-adaptation-promotion.css",
        "pattern-execution-adaptation-promotion.js",
        "pattern-execution-adaptation-promotion-assistant.js",
    ):
        assert (STATIC / name).is_file()
    response = TestClient(app).get("/pattern-execution-adaptation-promotion")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "PATTERN_EXECUTION_ADAPTATION_PROMOTION" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-adaptation-promotion"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}


def test_stage_41_page_has_chain_lifecycle_coverage_constraints_regressions_impact_and_verdict() -> None:
    parser = parse_page()
    assert {
        "pattern-execution-adaptation-promotion-page",
        "adaptation-promotion-lifecycle",
        "adaptation-promotion-source-chain",
        "adaptation-promotion-proof-warning",
        "adaptation-promotion-proof-errors",
        "promotion-coverage",
        "promotion-constraints",
        "promotion-regressions",
        "promotion-expected-impact",
        "promotion-decision-conditions",
        "promotion-verdict",
        "promotion-verdict-reasons",
        "promotion-return-to-adaptation",
        "promotion-lifecycle-controls",
        "promotion-completion-blockers",
        "adaptation-promotion-terminal",
    } <= parser.testids


def test_stage_41_controller_uses_domain_lifecycle_and_has_no_manual_verdict_bypass() -> None:
    parser = parse_page()
    assert parser.commands == {"create-draft", "start-evaluation", "save-conditions", "start-decision", "complete"}
    controller = (STATIC / "pattern-execution-adaptation-promotion-assistant.js").read_text(encoding="utf-8")
    for token in (
        "createPatternExecutionAdaptationPromotion",
        "savePatternExecutionAdaptationPromotion",
        "startEvaluation",
        "setDecisionConditions",
        "startDecision",
        "completePromotion",
        "readPatternExecutionAdaptationPromotion",
    ):
        assert token in controller
    assert "derivePromotionVerdict" not in controller
    assert not any((entry.get("name") or "").lower() == "promotionverdict" for entry in parser.inputs)
    assert not any(entry.get("id") == "promotion-verdict-value" for entry in parser.inputs)


def test_stage_40_and_stage_41_navigation_is_bidirectional_and_context_guarded() -> None:
    parser = parse_page()
    assert parser.links["promotion-back-validation"] == "/pattern-execution-adaptation-validation"
    validation_html = (STATIC / "pattern-execution-adaptation-validation.html").read_text(encoding="utf-8")
    validation_controller = (STATIC / "pattern-execution-adaptation-validation-assistant.js").read_text(encoding="utf-8")
    promotion_controller = (STATIC / "pattern-execution-adaptation-promotion-assistant.js").read_text(encoding="utf-8")
    assert 'id="validation-forward-promotion"' in validation_html
    assert 'href="/pattern-execution-adaptation-promotion"' in validation_html
    assert "hidden" in validation_html.split('id="validation-forward-promotion"', 1)[1].split(">", 1)[0]
    assert "status === \"completed\"" in validation_controller
    assert "Boolean(integrity?.valid)" in validation_controller
    assert "api.FINAL_VERDICTS.includes" in validation_controller
    assert "/pattern-execution-adaptation-validation?" in promotion_controller


def test_stage_41_handles_missing_or_unproven_sources_and_renders_completion_reasons() -> None:
    controller = (STATIC / "pattern-execution-adaptation-promotion-assistant.js").read_text(encoding="utf-8")
    for token in (
        "renderWithoutProject",
        "source_chain_unavailable",
        "source chain is not fully proven",
        "coverage missing",
        "source revision changed",
        "imported identity chain is unproven",
        "showFatal",
        "formatError",
    ):
        assert token in controller


def test_stage_41_assets_are_explicit_accessible_responsive_and_build_registered() -> None:
    parser = parse_page()
    assert parser.scripts == [
        "/static/pattern-execution-retrospective.js",
        "/static/pattern-execution-learning.js",
        "/static/pattern-execution-adaptation.js",
        "/static/pattern-execution-adaptation-validation.js",
        "/static/pattern-execution-adaptation-promotion.js",
        "/static/project-system.js",
        "/static/pattern-execution-adaptation-promotion-assistant.js",
    ]
    assert "/static/pattern-execution-adaptation-promotion.css" in parser.styles
    html = (STATIC / "pattern-execution-adaptation-promotion.html").read_text(encoding="utf-8")
    css = (STATIC / "pattern-execution-adaptation-promotion.css").read_text(encoding="utf-8")
    package = (STATIC.parents[2] / "package.json").read_text(encoding="utf-8")
    assert 'role="alert"' in html
    assert 'aria-live="polite"' in html
    assert "@media" in css
    assert '"test:stage41"' in package
    assert "pattern-execution-adaptation-promotion.js" in package
    assert "pattern-execution-adaptation-promotion-assistant.js" in package


def test_stage_41_has_no_forbidden_production_patterns_or_source_mutation_commands() -> None:
    production = "\n".join((STATIC / name).read_text(encoding="utf-8") for name in (
        "pattern-execution-adaptation-promotion.html",
        "pattern-execution-adaptation-promotion.css",
        "pattern-execution-adaptation-promotion.js",
        "pattern-execution-adaptation-promotion-assistant.js",
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
        "savePatternExecutionAdaptation(",
        "savePatternExecutionAdaptationValidation(",
    ):
        assert forbidden not in production
