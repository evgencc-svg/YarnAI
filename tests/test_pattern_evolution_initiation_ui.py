from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.testids: set[str] = set()
        self.ids: set[str] = set()
        self.links: dict[str, str] = {}
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.commands: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("data-testid"):
            self.testids.add(values["data-testid"] or "")
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if values.get("data-command"):
            self.commands.add(values["data-command"] or "")
        if tag == "a" and values.get("id"):
            self.links[values["id"] or ""] = values.get("href") or ""
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def parse() -> PageParser:
    parser = PageParser()
    parser.feed(read("pattern-evolution-initiation.html"))
    return parser


def test_stage_45_route_title_and_assets() -> None:
    names = (
        "pattern-evolution-initiation.html",
        "pattern-evolution-initiation.css",
        "pattern-evolution-initiation.js",
        "pattern-evolution-initiation-assistant.js",
    )
    assert all((STATIC / name).is_file() for name in names)
    response = TestClient(app).get("/pattern-evolution-initiation")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Open a controlled evolution cycle" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-evolution-initiation"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}


def test_stage_45_ui_exposes_required_workflow_fields() -> None:
    parser = parse()
    assert {
        "pattern-evolution-initiation-page",
        "source-closure-card",
        "evolution-hypothesis-form",
        "evolution-scope-safeguards",
        "evolution-value-criteria",
        "evolution-risks-constraints",
        "evolution-decision",
        "evolution-actions",
    } <= parser.testids
    assert {
        "evolution-hypothesis", "evolution-rationale", "evolution-scope",
        "evolution-protected", "evolution-allowed", "evolution-forbidden",
        "evolution-expected-value", "evolution-success-criteria", "evolution-risks",
        "evolution-constraints", "evolution-assumptions", "evolution-questions",
        "evolution-readiness", "evolution-verdict", "evolution-verdict-reasons",
        "evolution-evidence-summary", "evolution-audit",
    } <= parser.ids
    assert parser.commands == {"create", "save", "assess", "ready", "approve", "reject", "cancel", "revalidate", "open-latest"}


def test_stage_45_controller_delegates_rules_and_handles_unproven_states() -> None:
    controller = read("pattern-evolution-initiation-assistant.js")
    for token in (
        "createPatternEvolutionInitiation", "savePatternEvolutionInitiation",
        "getPatternEvolutionInitiation", "projectPatternEvolutionInitiation",
        "updatePatternEvolutionInitiation", "startAssessing", "markReady",
        "approveInitiation", "rejectInitiation", "cancelInitiation",
        "revalidatePatternEvolutionInitiation", "imported-unproven", "stale",
    ):
        assert token in controller
    for forbidden in (
        "deriveVerdict", "calculateReadiness",
        'getElementById("evolution-verdict").value',
        'getElementById("evolution-proof-status").value',
    ):
        assert forbidden not in controller


def test_stages_44_and_45_navigation_is_bidirectional() -> None:
    closure_html = read("pattern-execution-adaptation-closure.html")
    closure_controller = read("pattern-execution-adaptation-closure-assistant.js")
    controller = read("pattern-evolution-initiation-assistant.js")
    parser = parse()
    assert 'id="closure-open-evolution"' in closure_html
    assert 'href="/pattern-evolution-initiation"' in closure_html
    assert "/pattern-evolution-initiation?" in closure_controller
    assert 'record.lifecycle !== "closed"' in closure_controller
    assert parser.links["evolution-back-closure"] == "/pattern-execution-adaptation-closure"
    assert "/pattern-execution-adaptation-closure?" in controller
    assert parser.links["evolution-open-proposal"] == "/pattern-evolution-proposal"
    assert 'record.status === "approved"' in controller
    assert 'record.verdict === "approve"' in controller
    assert 'shown?.proofStatus === "proven"' in controller
    assert "/pattern-evolution-proposal?" in controller


def test_stage_45_assets_package_and_subsequent_stage_boundary() -> None:
    parser = parse()
    assert parser.scripts[-3:] == [
        "/static/pattern-evolution-initiation.js",
        "/static/project-system.js",
        "/static/pattern-evolution-initiation-assistant.js",
    ]
    assert "/static/pattern-evolution-initiation.css" in parser.styles
    for asset in parser.scripts:
        assert (STATIC / asset.removeprefix("/static/")).is_file()
    package = (STATIC.parents[2] / "package.json").read_text(encoding="utf-8")
    assert '"test:stage45"' in package
    assert "tests-js/pattern-evolution-initiation.test.cjs" in package
    production = "\n".join(read(name) for name in (
        "pattern-evolution-initiation.html",
        "pattern-evolution-initiation.css",
        "pattern-evolution-initiation.js",
        "pattern-evolution-initiation-assistant.js",
    ))
    later_stage = 45 + 2
    assert f"STAGE_{later_stage}" not in production.upper()
    assert f"Stage {later_stage}" not in production
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-evolution-initiation"]
    assert len(routes) == 1
