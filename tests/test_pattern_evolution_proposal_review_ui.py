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
        self.form_controls: list[dict[str, str | None]] = []

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
        if tag in {"input", "select", "textarea", "button"}:
            self.form_controls.append(values)


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def parse() -> PageParser:
    parser = PageParser()
    parser.feed(read("pattern-evolution-proposal-review.html"))
    return parser


def test_stage_47_route_assets_and_content_types() -> None:
    client = TestClient(app)
    response = client.get("/pattern-evolution-proposal-review")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Review an immutable evolution proposal" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-evolution-proposal-review"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}
    for name, content_type in (
        ("pattern-evolution-proposal-review.js", "text/javascript"),
        ("pattern-evolution-proposal-review-assistant.js", "text/javascript"),
        ("pattern-evolution-proposal-review.css", "text/css"),
    ):
        assert (STATIC / name).is_file()
        asset = client.get(f"/static/{name}")
        assert asset.status_code == 200
        assert asset.headers["content-type"].startswith(content_type)


def test_stage_47_ui_exposes_source_verdict_dimensions_and_findings() -> None:
    parser = parse()
    assert {
        "pattern-evolution-proposal-review-page", "review-source-card",
        "review-verdict-readiness", "review-dimensions", "review-findings",
        "review-affected-changes", "review-audit", "review-actions",
    } <= parser.testids
    assert {
        "review-source-proposal-id", "review-source-proposal-revision",
        "review-source-proposal-digest", "review-source-initiation-id",
        "review-source-status", "review-source-validity",
        "review-source-provenance", "review-source-freshness",
        "review-verdict", "review-readiness", "review-risk",
        "review-dimension-grid", "review-blocking-findings",
        "review-revision-requests", "review-evidence-requests",
        "review-affected-change-ids", "review-evidence-references",
        "review-conflicts", "review-audit-log",
    } <= parser.ids
    html = read("pattern-evolution-proposal-review.html")
    for label in (
        "source proposal", "Proposal revision", "Proposal digest", "Initiation ID",
        "Source validity", "Provenance", "Computed aggregate verdict",
        "Implementation readiness", "Deterministic risk", "Independent review dimensions",
        "Blocking findings", "Revision requests", "Evidence requests", "Affected change IDs",
    ):
        assert label.lower() in html.lower()


def test_stage_47_has_deterministic_empty_and_error_states() -> None:
    parser = parse()
    assert {
        "review-empty-state", "review-missing-proposal-state",
        "review-not-submitted-state", "review-stale-state",
        "review-imported-state", "review-blocked-state",
        "review-quarantine-state", "review-collision-state",
    } <= parser.testids
    html = read("pattern-evolution-proposal-review.html")
    for message in (
        "Proposal required", "Submitted proposal required", "Stale source chain",
        "Imported source is unproven", "Review blocked",
        "Invalid or quarantined review", "Identity collision",
    ):
        assert message in html


def test_stage_47_controller_delegates_domain_results_and_repository() -> None:
    controller = read("pattern-evolution-proposal-review-assistant.js")
    for token in (
        "loadSource", "createPatternEvolutionProposalReview",
        "savePatternEvolutionProposalReview", "getPatternEvolutionProposalReview",
        "projectPatternEvolutionProposalReview", "startReview", "markReady",
        "finalizeReview", "cancelReview", "revalidatePatternEvolutionProposalReview",
        "dimensions", "findings", "readiness", "risk", "verdict",
        "imported-unproven", "stale", "quarantine", "collision",
    ):
        assert token in controller
    for forbidden in (
        "assessReview(", "deriveVerdict(", "calculateRisk(",
        'getElementById("review-verdict").value',
        'getElementById("review-readiness").value',
        'getElementById("review-risk").value',
    ):
        assert forbidden not in controller


def test_stage_47_has_no_manual_approve_verdict_readiness_or_risk_control() -> None:
    parser = parse()
    assert parser.commands == {"create", "start", "ready", "finalize", "cancel", "revalidate", "open-latest"}
    for control in parser.form_controls:
        identity = " ".join(filter(None, (control.get("id"), control.get("name"), control.get("data-command")))).lower()
        assert "approve" not in identity
        assert "verdict" not in identity
        assert "readiness" not in identity
        assert "risk" not in identity


def test_stages_46_and_47_navigation_is_bidirectional_and_guarded() -> None:
    proposal_html = read("pattern-evolution-proposal.html")
    proposal_controller = read("pattern-evolution-proposal-assistant.js")
    parser = parse()
    assert 'id="proposal-open-review"' in proposal_html
    assert 'href="/pattern-evolution-proposal-review"' in proposal_html
    for token in (
        'record.status === "submitted"', 'record.verdict === "submit"',
        "!shown?.stale", 'shown?.proofStatus === "proven"',
        "shown?.sourceProof?.fullChainProven",
    ):
        assert token in proposal_controller
    assert "/pattern-evolution-proposal-review?" in proposal_controller
    assert parser.links["review-back-proposal"] == "/pattern-evolution-proposal"
    assert "/pattern-evolution-proposal?" in read("pattern-evolution-proposal-review-assistant.js")


def test_stage_47_forward_navigation_to_decision_is_terminal_and_proven() -> None:
    parser = parse()
    assert parser.links["review-open-decision"] == "/pattern-evolution-decision"
    assert 'aria-disabled="true"' in read("pattern-evolution-proposal-review.html")
    controller = read("pattern-evolution-proposal-review-assistant.js")
    for token in (
        "terminalVerdict", 'shown?.status === "approved"', 'shown?.status === "changes_requested"',
        'shown?.status === "rejected"', 'shown?.status === "cancelled"', "proof?.fullGate",
        "!shown.importedUnproven", "!shown.collision", 'projection?.effectiveStatus !== "stale"',
        "/pattern-evolution-decision?",
    ):
        assert token in controller


def test_stage_47_asset_order_package_and_future_boundary() -> None:
    parser = parse()
    assert parser.scripts[-3:] == [
        "/static/pattern-evolution-proposal-review.js",
        "/static/project-system.js",
        "/static/pattern-evolution-proposal-review-assistant.js",
    ]
    assert "/static/pattern-evolution-proposal-review.css" in parser.styles
    for asset in parser.scripts:
        assert (STATIC / asset.removeprefix("/static/")).is_file()
    package = (STATIC.parents[2] / "package.json").read_text(encoding="utf-8")
    assert package.index('"test:stage46"') < package.index('"test:stage47"')
    assert package.count('"test:stage47"') == 1
    assert package.count("tests-js/pattern-evolution-proposal-review.test.cjs") == 2
    production = "\n".join(read(name) for name in (
        "pattern-evolution-proposal-review.html",
        "pattern-evolution-proposal-review.css",
        "pattern-evolution-proposal-review.js",
        "pattern-evolution-proposal-review-assistant.js",
    ))
    later_stage = 47 + 2
    assert f"STAGE_{later_stage}" not in production.upper()
    assert f"Stage {later_stage}" not in production
    forbidden_route = "/pattern-evolution-proposal-" + "implementation"
    assert not any(getattr(route, "path", None) == forbidden_route for route in app.routes)
