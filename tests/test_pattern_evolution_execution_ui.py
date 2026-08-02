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
        self.controls: list[dict[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("data-testid"):
            self.testids.add(values["data-testid"] or "")
        if values.get("id"):
            self.ids.add(values["id"] or "")
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
    parser.feed(read("pattern-evolution-execution.html"))
    return parser


def test_stage_49_route_and_static_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-evolution-execution")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Verify the authorized evolution execution" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-evolution-execution"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}
    for name, content_type in (
        ("pattern-evolution-execution.js", "text/javascript"),
        ("pattern-evolution-execution-assistant.js", "text/javascript"),
        ("pattern-evolution-execution.css", "text/css"),
    ):
        asset = client.get(f"/static/{name}")
        assert asset.status_code == 200
        assert asset.headers["content-type"].startswith(content_type)


def test_stage_49_renders_full_source_plan_contracts_and_observations() -> None:
    parser = parse()
    assert {
        "pattern-evolution-execution-page", "execution-identity", "execution-source-chain",
        "execution-verdict", "execution-reasons", "execution-plan", "execution-contracts",
        "execution-observations", "execution-audit",
    } <= parser.testids
    assert {
        "execution-id", "execution-identity-value", "execution-semantic-identity", "execution-digest",
        "execution-lifecycle", "execution-status", "execution-project-id", "execution-pattern-id",
        "execution-initiation-id", "execution-proposal-id", "execution-review-id", "execution-decision-id",
        "execution-decision-outcome", "execution-source-gate", "execution-source-envelope",
        "execution-source-snapshots", "execution-reason-list", "execution-next-action", "execution-risk",
        "execution-operations", "execution-preconditions", "execution-dependencies",
        "execution-mandatory-conditions", "execution-expected-outputs", "execution-evidence-requirements",
        "execution-risk-controls", "execution-stop-conditions", "execution-rollback-contract",
        "execution-migration-contract", "execution-compatibility-contract", "execution-verification-contract",
        "execution-observation-list", "execution-evidence-list",
    } <= parser.ids
    html = read("pattern-evolution-execution.html").lower()
    for marker in (
        "immutable source chain", "stage 45 initiation", "stage 46 proposal", "stage 47 review",
        "stage 48 decision", "computed status", "canonical next action", "deterministic reason codes",
        "operations", "preconditions", "dependencies", "mandatory conditions", "expected outputs",
        "evidence requirements", "rollback contract", "migration contract", "compatibility contract",
        "verification contract", "risk controls", "stop conditions", "structured observations",
    ):
        assert marker in html


def test_stage_49_has_every_explicit_fail_closed_state() -> None:
    parser = parse()
    assert {
        "execution-missing-context-state", "execution-missing-decision-state", "execution-invalid-source-state",
        "execution-nonterminal-decision-state", "execution-nonauthorized-decision-state", "execution-stale-state",
        "execution-imported-unproven-state", "execution-collision-state", "execution-quarantine-state",
        "execution-blocked-state", "execution-revision-required-state", "execution-evidence-required-state",
        "execution-rollback-required-state", "execution-failed-state", "execution-ready-state",
        "execution-executing-state", "execution-verifying-state", "execution-completed-state",
        "execution-cancelled-state",
    } <= parser.testids


def test_stage_49_has_no_manual_authorization_verdict_risk_or_application_controls() -> None:
    parser = parse()
    assert parser.controls == []
    html = read("pattern-evolution-execution.html").lower()
    for forbidden in (
        'data-command="authorize"', 'name="outcome"', 'name="risk"',
        'data-command="apply-migration"', 'data-command="upgrade-schema"',
        'data-command="complete"', 'data-command="mutate-pattern"',
    ):
        assert forbidden not in html


def test_stage_49_controller_uses_repository_truth_and_is_reload_idempotent() -> None:
    controller = read("pattern-evolution-execution-assistant.js")
    for token in (
        "loadSource", "calculateSourceGate", "projectPatternEvolutionExecution",
        "getPatternEvolutionExecution", "getLatestPatternEvolutionExecutionForDecision",
        "createPatternEvolutionExecution", "executionRecord", "rawExecution", "duplicate",
        "imported-unproven", "collision", "quarantine", "stale", "canonicalPlan",
    ):
        assert token in controller
    for forbidden in (
        "Date.now", "new Date", "Math.random", "crypto.randomUUID", "dataset.authorized",
        ".value === \"authorize\"", "applyMigration", "createObjectStore",
    ):
        assert forbidden not in controller


def test_stage_48_and_49_navigation_is_bidirectional_and_guarded() -> None:
    parser = parse()
    assert parser.links["execution-back-decision"] == "/pattern-evolution-decision"
    controller = read("pattern-evolution-execution-assistant.js")
    assert "/pattern-evolution-decision" in controller
    decision_html = read("pattern-evolution-decision.html")
    decision_controller = read("pattern-evolution-decision-assistant.js")
    assert 'id="decision-open-execution"' in decision_html
    assert 'href="/pattern-evolution-execution"' in decision_html
    for token in (
        "executionEligible", 'shown.lifecycle === "authorized"', 'shown.outcome === "authorize"',
        'shown.nextAction === "proceed_to_next_stage"', "validatePatternEvolutionDecision",
        "gate?.valid", "!projection?.stale", 'shown.proofStatus === "proven"',
        "!shown.importedUnproven", "!shown.collision", "!shown.quarantined", "!superseded",
        "initiationRevision", "initiationDigest", "proposalRevision", "proposalDigest",
        "reviewRevision", "reviewDigest", "decisionRevision", "decisionDigest",
    ):
        assert token in decision_controller


def test_stage_49_missing_context_is_static_safe_and_no_forward_navigation() -> None:
    parser = parse()
    assert "execution-missing-context-state" in parser.testids
    assert set(parser.links) == {"execution-back-decision", "execution-open-verification"}
    production = "\n".join(read(name) for name in (
        "pattern-evolution-execution.html", "pattern-evolution-execution.css",
        "pattern-evolution-execution.js", "pattern-evolution-execution-assistant.js",
    ))
    later_stage = 49 + 2
    assert f"STAGE_{later_stage}" not in production.upper()
    assert f"Stage {later_stage}" not in production
    assert f"stage{later_stage}" not in production.lower()
    assert not any(getattr(route, "path", "").endswith(str(later_stage)) for route in app.routes)


def test_stage_49_asset_order_and_package_contract() -> None:
    parser = parse()
    assert parser.scripts[-3:] == [
        "/static/pattern-evolution-execution.js",
        "/static/project-system.js",
        "/static/pattern-evolution-execution-assistant.js",
    ]
    assert "/static/pattern-evolution-execution.css" in parser.styles
    for asset in parser.scripts:
        assert (STATIC / asset.removeprefix("/static/")).is_file()
    package_text = (ROOT / "package.json").read_text(encoding="utf-8")
    package = json.loads(package_text)
    assert package["scripts"]["test:stage49"] == "node --test tests-js/pattern-evolution-execution.test.cjs"
    assert package_text.count('"test:stage49"') == 1
    assert package_text.count("tests-js/pattern-evolution-execution.test.cjs") == 2
    for stage in range(37, 50):
        assert list(package["scripts"]).count(f"test:stage{stage}") == 1
