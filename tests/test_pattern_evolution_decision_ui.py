from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
ROOT = STATIC.parents[2]


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.testids: set[str] = set()
        self.ids: set[str] = set()
        self.links: dict[str, str] = {}
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.commands: set[str] = set()
        self.controls: list[dict[str, str | None]] = []

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
            self.controls.append(values)


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def parse() -> PageParser:
    parser = PageParser()
    parser.feed(read("pattern-evolution-decision.html"))
    return parser


def test_stage_48_route_and_assets_have_expected_content_types() -> None:
    client = TestClient(app)
    response = client.get("/pattern-evolution-decision")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Decide the reviewed evolution proposal" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-evolution-decision"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}
    for name, content_type in (
        ("pattern-evolution-decision.js", "text/javascript"),
        ("pattern-evolution-decision-assistant.js", "text/javascript"),
        ("pattern-evolution-decision.css", "text/css"),
    ):
        response = client.get(f"/static/{name}")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith(content_type)


def test_stage_48_renders_identity_source_chain_outcome_and_restrictions() -> None:
    parser = parse()
    assert {
        "pattern-evolution-decision-page", "decision-identity", "decision-source-chain",
        "decision-outcome-panel", "decision-reasons", "decision-conditions",
        "decision-traceability", "decision-restrictions", "decision-audit", "decision-actions",
    } <= parser.testids
    assert {
        "decision-id", "decision-identity-value", "decision-digest", "decision-lifecycle",
        "decision-source-project-id", "decision-source-pattern-id", "decision-source-initiation-id",
        "decision-source-initiation-revision", "decision-source-initiation-digest",
        "decision-source-proposal-id", "decision-source-proposal-revision", "decision-source-proposal-digest",
        "decision-source-review-id", "decision-source-review-revision", "decision-source-review-digest",
        "decision-source-review-state", "decision-source-review-readiness", "decision-source-provenance",
        "decision-outcome", "decision-reason-list", "decision-condition-list", "decision-next-action",
        "decision-affected-change-ids", "decision-evidence-requests", "decision-revision-requests",
        "decision-blockers", "decision-decline-reasons", "decision-migration-dependency",
        "decision-rollback-obligations", "decision-compatibility-restrictions",
    } <= parser.ids
    html = read("pattern-evolution-decision.html").lower()
    for label in (
        "decision identity", "decision digest", "decision policy", "immutable source chain",
        "stage 45 initiation", "stage 46 proposal", "stage 47 review", "source provenance",
        "computed decision outcome", "deterministic reasons", "mandatory decision conditions",
        "canonical next action", "affected change ids", "evidence requests", "revision requests",
        "blockers", "decline reasons", "migration dependency", "rollback obligations",
        "compatibility restrictions",
    ):
        assert label in html


def test_stage_48_has_all_deterministic_states() -> None:
    parser = parse()
    assert {
        "decision-missing-context-state", "decision-missing-review-state", "decision-authorized-state",
        "decision-revision-required-state", "decision-evidence-required-state", "decision-blocked-state",
        "decision-declined-state", "decision-cancelled-state", "decision-stale-state",
        "decision-imported-state", "decision-collision-state", "decision-quarantine-state",
    } <= parser.testids
    html = read("pattern-evolution-decision.html")
    for message in (
        "Project context required", "Review required", "Authorized", "Revision required",
        "Evidence required", "Decision blocked", "Declined", "Cancelled", "Stale decision",
        "Imported source is unproven", "Identity collision", "Invalid or quarantined decision",
    ):
        assert message in html


def test_stage_48_controller_delegates_to_domain_and_repository() -> None:
    controller = read("pattern-evolution-decision-assistant.js")
    for token in (
        "loadSource", "evaluateDecision", "projectPatternEvolutionDecision",
        "createPatternEvolutionDecision", "savePatternEvolutionDecision", "getPatternEvolutionDecision",
        "startDecision", "markDecisionReady", "finalizeDecision", "cancelDecision",
        "revalidatePatternEvolutionDecision", "reasons", "conditions", "nextAction",
        "imported-unproven", "stale", "quarantine", "collision",
    ):
        assert token in controller
    for forbidden in (
        "Date.now", "new Date", "Math.random", "crypto.randomUUID",
        'getElementById("decision-outcome").value', 'getElementById("decision-risk").value',
    ):
        assert forbidden not in controller


def test_stage_48_has_no_manual_authorize_outcome_risk_or_apply_control() -> None:
    parser = parse()
    assert parser.commands == {"create", "start", "ready", "finalize", "cancel", "revalidate", "open-latest"}
    for control in parser.controls:
        identity = " ".join(filter(None, (control.get("id"), control.get("name"), control.get("data-command")))).lower()
        assert "authorize" not in identity
        assert "outcome" not in identity
        assert "risk" not in identity
        assert "apply" not in identity
        assert "proposal" not in identity


def test_stage_47_and_48_navigation_is_bidirectional_and_terminal_guarded() -> None:
    parser = parse()
    assert parser.links["decision-back-review"] == "/pattern-evolution-proposal-review"
    controller = read("pattern-evolution-decision-assistant.js")
    assert "/pattern-evolution-proposal-review" in controller
    review_html = read("pattern-evolution-proposal-review.html")
    review_controller = read("pattern-evolution-proposal-review-assistant.js")
    assert 'id="review-open-decision"' in review_html
    assert 'href="/pattern-evolution-decision"' in review_html
    for token in (
        "terminalVerdict", 'shown?.status === "approved"', 'shown?.status === "changes_requested"',
        'shown?.status === "rejected"', 'shown?.status === "cancelled"', "proof?.fullGate",
        "!shown.importedUnproven", "!shown.collision", 'projection?.effectiveStatus !== "stale"',
        "/pattern-evolution-decision?",
    ):
        assert token in review_controller


def test_stage_48_asset_order_package_and_future_boundary() -> None:
    parser = parse()
    assert parser.scripts[-3:] == [
        "/static/pattern-evolution-decision.js",
        "/static/project-system.js",
        "/static/pattern-evolution-decision-assistant.js",
    ]
    assert "/static/pattern-evolution-decision.css" in parser.styles
    for asset in parser.scripts:
        assert (STATIC / asset.removeprefix("/static/")).is_file()
    package_text = (ROOT / "package.json").read_text(encoding="utf-8")
    package = json.loads(package_text)
    assert package["scripts"]["test:stage48"] == "node --test tests-js/pattern-evolution-decision.test.cjs"
    assert package_text.count('"test:stage48"') == 1
    assert package_text.count("tests-js/pattern-evolution-decision.test.cjs") == 2
    for stage in range(37, 49):
        assert list(package["scripts"]).count(f"test:stage{stage}") == 1
    production = "\n".join(read(name) for name in (
        "pattern-evolution-decision.html", "pattern-evolution-decision.css",
        "pattern-evolution-decision.js", "pattern-evolution-decision-assistant.js",
    ))
    later_stage = 48 + 1
    assert f"STAGE_{later_stage}" not in production.upper()
    assert f"Stage {later_stage}" not in production
    assert f"stage{later_stage}" not in production.lower()
    assert not any(getattr(route, "path", "").endswith(str(later_stage)) for route in app.routes)
