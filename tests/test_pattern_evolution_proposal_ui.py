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
    parser.feed(read("pattern-evolution-proposal.html"))
    return parser


def test_stage_46_http_route_title_content_type_and_assets() -> None:
    names = (
        "pattern-evolution-proposal.html",
        "pattern-evolution-proposal.css",
        "pattern-evolution-proposal.js",
        "pattern-evolution-proposal-assistant.js",
    )
    assert all((STATIC / name).is_file() for name in names)
    response = TestClient(app).get("/pattern-evolution-proposal")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Compose a traceable evolution proposal" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-evolution-proposal"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}


def test_stage_46_ui_exposes_source_constraints_and_editors() -> None:
    parser = parse()
    assert {
        "pattern-evolution-proposal-page", "proposal-source-card",
        "proposal-summary-editor", "proposal-baseline-target",
        "proposal-changes-editor", "proposal-behavior-components",
        "proposal-criteria-trace", "proposal-compatibility-migration",
        "proposal-rollback-impact", "proposal-risks-assumptions",
        "proposal-readiness-verdict", "proposal-audit", "proposal-actions",
    } <= parser.testids
    assert {
        "proposal-hypothesis", "proposal-scope", "proposal-protected",
        "proposal-allowed", "proposal-forbidden", "proposal-criteria",
        "proposal-provenance", "proposal-source-digest", "proposal-baseline",
        "proposal-target", "proposal-changes", "proposal-preserved",
        "proposal-components", "proposal-traceability", "proposal-compatibility",
        "proposal-migrations", "proposal-rollback", "proposal-impact",
        "proposal-risks", "proposal-assumptions", "proposal-constraints",
        "proposal-questions", "proposal-readiness", "proposal-verdict",
        "proposal-verdict-reasons", "proposal-audit",
    } <= parser.ids
    assert parser.commands == {
        "create", "save", "compose", "ready", "submit", "reject",
        "cancel", "revalidate", "open-latest",
    }


def test_stage_46_ui_has_all_controlled_empty_and_error_states() -> None:
    parser = parse()
    assert {
        "proposal-empty-state", "proposal-missing-initiation-state",
        "proposal-not-approved-state", "proposal-stale-state",
        "proposal-imported-state", "proposal-quarantine-state",
    } <= parser.testids
    html = read("pattern-evolution-proposal.html")
    for message in (
        "Initiation required", "Approved initiation required", "Source changed",
        "Imported source is unproven", "Quarantined proposal",
    ):
        assert message in html


def test_stage_46_controller_delegates_domain_rules_and_storage() -> None:
    controller = read("pattern-evolution-proposal-assistant.js")
    for token in (
        "loadSource", "createPatternEvolutionProposal", "savePatternEvolutionProposal",
        "getPatternEvolutionProposal", "projectPatternEvolutionProposal",
        "updatePatternEvolutionProposal", "startComposing", "markReady",
        "submitProposal", "rejectProposal", "cancelProposal",
        "revalidatePatternEvolutionProposal", "imported-unproven", "stale",
        "quarantine", "collision",
    ):
        assert token in controller
    for forbidden in (
        "deriveVerdict", "calculateReadiness", "calculateTraceability",
        'getElementById("proposal-verdict").value',
        'getElementById("proposal-readiness").value',
    ):
        assert forbidden not in controller


def test_stages_45_and_46_navigation_is_bidirectional_and_guarded() -> None:
    initiation_html = read("pattern-evolution-initiation.html")
    initiation_controller = read("pattern-evolution-initiation-assistant.js")
    parser = parse()
    assert 'id="evolution-open-proposal"' in initiation_html
    assert 'href="/pattern-evolution-proposal"' in initiation_html
    for token in (
        'record.status === "approved"', 'record.verdict === "approve"',
        "!shown?.stale", 'shown?.proofStatus === "proven"',
        "shown?.sourceProof?.fullChainProven",
    ):
        assert token in initiation_controller
    assert "/pattern-evolution-proposal?" in initiation_controller
    assert parser.links["proposal-back-initiation"] == "/pattern-evolution-initiation"
    assert "/pattern-evolution-initiation?" in read("pattern-evolution-proposal-assistant.js")


def test_stage_46_forward_navigation_to_review_is_guarded() -> None:
    html = read("pattern-evolution-proposal.html")
    controller = read("pattern-evolution-proposal-assistant.js")
    assert 'id="proposal-open-review"' in html
    assert 'href="/pattern-evolution-proposal-review"' in html
    for token in (
        'record.status === "submitted"', 'record.verdict === "submit"',
        "!shown?.stale", 'shown?.proofStatus === "proven"',
        "shown?.sourceProof?.fullChainProven",
    ):
        assert token in controller
    assert "/pattern-evolution-proposal-review?" in controller


def test_stage_46_assets_package_order_and_future_stage_boundary() -> None:
    parser = parse()
    assert parser.scripts[-3:] == [
        "/static/pattern-evolution-proposal.js",
        "/static/project-system.js",
        "/static/pattern-evolution-proposal-assistant.js",
    ]
    assert "/static/pattern-evolution-proposal.css" in parser.styles
    for asset in parser.scripts:
        assert (STATIC / asset.removeprefix("/static/")).is_file()
    package = (STATIC.parents[2] / "package.json").read_text(encoding="utf-8")
    assert package.index('"test:stage45"') < package.index('"test:stage46"')
    assert package.count('"test:stage46"') == 1
    assert package.count("tests-js/pattern-evolution-proposal.test.cjs") == 2
    production = "\n".join(read(name) for name in (
        "pattern-evolution-proposal.html", "pattern-evolution-proposal.css",
        "pattern-evolution-proposal.js", "pattern-evolution-proposal-assistant.js",
    ))
    later_stage = 46 + 1
    assert f"STAGE_{later_stage}" not in production.upper()
    assert f"Stage {later_stage}" not in production
    assert not any(getattr(route, "path", None) == "/pattern-evolution-validation" for route in app.routes)
