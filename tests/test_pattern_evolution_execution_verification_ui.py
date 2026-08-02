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
        self.inline_handlers: list[str] = []
        self.hidden: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("data-testid"):
            self.testids.add(values["data-testid"] or "")
        if values.get("id"):
            self.ids.add(values["id"] or "")
            if "hidden" in values:
                self.hidden.add(values["id"] or "")
        if tag == "a" and values.get("id"):
            self.links[values["id"] or ""] = values.get("href") or ""
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")
        if tag in {"input", "select", "textarea", "button"}:
            self.controls.append(values)
        self.inline_handlers.extend(key for key in values if key.startswith("on"))


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def parse(name: str = "pattern-evolution-execution-verification.html") -> PageParser:
    parser = PageParser()
    parser.feed(read(name))
    return parser


def test_stage_50_route_and_assets_are_available() -> None:
    client = TestClient(app)
    response = client.get("/pattern-evolution-execution-verification")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Verify the actual evolution outcome" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-evolution-execution-verification"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}
    for name, content_type in (
        ("pattern-evolution-execution-verification.js", "text/javascript"),
        ("pattern-evolution-execution-verification-assistant.js", "text/javascript"),
        ("pattern-evolution-execution-verification.css", "text/css"),
        ("pattern-evolution-execution.js", "text/javascript"),
        ("project-system.js", "text/javascript"),
    ):
        asset = client.get(f"/static/{name}")
        assert asset.status_code == 200
        assert asset.headers["content-type"].startswith(content_type)


def test_stage_50_renders_source_policy_outcomes_coverage_and_every_check_family() -> None:
    parser = parse()
    assert {
        "pattern-evolution-execution-verification-page", "verification-identity",
        "verification-source-summary", "verification-outcome", "verification-scope-outcomes",
        "verification-coverage", "verification-checks", "verification-findings",
    } <= parser.testids
    assert {
        "verification-policy", "verification-source-gate", "verification-chain-integrity",
        "verification-verdict", "verification-status", "verification-next-action",
        "verification-scope", "verification-expected-outcome", "verification-actual-outcome",
        "verification-completeness", "verification-consistency", "verification-coverage-values",
        "verification-operation-checks", "verification-precondition-checks",
        "verification-dependency-checks", "verification-mandatory-condition-checks",
        "verification-output-checks", "verification-evidence-checks",
        "verification-postcondition-checks", "verification-compatibility-checks",
        "verification-migration-checks", "verification-rollback-checks",
        "verification-risk-control-checks", "verification-stop-condition-checks",
        "verification-provenance-checks", "verification-integrity-checks",
    } <= parser.ids
    controller = read("pattern-evolution-execution-verification-assistant.js")
    for token in (
        "calculateSourceGate", "calculateVerificationContract",
        "projectPatternEvolutionExecutionVerification", "verification-policy",
        "verification-source-gate", "verification-verdict-output", "verification-status-output",
        "getLatestPatternEvolutionExecutionVerificationForExecution",
    ):
        assert token in controller


def test_stage_50_has_missing_fatal_and_fail_closed_states() -> None:
    parser = parse()
    assert {
        "verification-missing-context-state", "verification-fatal-state",
        "verification-invalid-source-state", "verification-imported-unproven-state",
        "verification-stale-state", "verification-blocked-state",
        "verification-evidence-required-state", "verification-revision-required-state",
        "verification-rollback-required-state", "verification-failed-state",
        "verification-cancelled-state", "verification-completed-state",
    } <= parser.testids
    assert "verification-fatal" in parser.hidden


def test_stage_50_has_no_manual_truth_or_execution_controls() -> None:
    parser = parse()
    assert parser.controls == []
    assert parser.inline_handlers == []
    production = "\n".join(read(name).lower() for name in (
        "pattern-evolution-execution-verification.html",
        "pattern-evolution-execution-verification-assistant.js",
    ))
    for forbidden in (
        'name="verdict"', 'name="risk"', 'name="lifecycle"',
        'data-command="complete"', 'data-command="apply-migration"',
        'data-command="perform-rollback"', 'data-command="pass-evidence"',
        'onclick=', 'onchange=',
    ):
        assert forbidden not in production


def test_stage_49_and_50_navigation_is_bidirectional_and_guarded() -> None:
    parser = parse()
    assert parser.links["verification-back-execution"] == "/pattern-evolution-execution"
    execution = parse("pattern-evolution-execution.html")
    assert execution.links["execution-open-verification"] == "/pattern-evolution-execution-verification"
    controller = read("pattern-evolution-execution-assistant.js")
    for token in (
        "executionEligible", "TERMINAL_LIFECYCLES", "validatePatternEvolutionExecution",
        "gate?.valid", "shown.proofStatus", "!shown.importedUnproven",
        "!shown.collision", "!shown.quarantined", "!projection?.stale",
        "/pattern-evolution-execution-verification",
    ):
        assert token in controller


def test_stage_50_has_guarded_forward_navigation_to_acceptance() -> None:
    parser = parse()
    assert set(parser.links) == {"verification-back-execution", "verification-open-acceptance"}
    assert parser.links["verification-open-acceptance"] == "/pattern-evolution-acceptance"
    assert "verification-open-acceptance" in parser.hidden
    controller = read("pattern-evolution-execution-verification-assistant.js")
    for token in (
        "acceptanceEligible", "verificationSuperseded", "supersedesVerificationId",
        "predecessorVerificationId", "validatePatternEvolutionExecutionVerification",
        "TERMINAL_LIFECYCLES", '"verified"', '"verified_with_conditions"',
        'shown.proofStatus === "proven"', "!shown.importedUnproven",
        "!shown.collision", "!shown.quarantined", "!currentProjection?.stale",
        "/pattern-evolution-acceptance",
    ):
        assert token in controller


def test_stage_50_asset_order_and_package_contract() -> None:
    parser = parse()
    assert parser.scripts[-4:] == [
        "/static/pattern-evolution-execution.js",
        "/static/pattern-evolution-execution-verification.js",
        "/static/project-system.js",
        "/static/pattern-evolution-execution-verification-assistant.js",
    ]
    assert "/static/pattern-evolution-execution-verification.css" in parser.styles
    for asset in parser.scripts:
        assert (STATIC / asset.removeprefix("/static/")).is_file()
    package_text = (ROOT / "package.json").read_text(encoding="utf-8")
    package = json.loads(package_text)
    assert package["scripts"]["test:stage50"] == "node --test tests-js/pattern-evolution-execution-verification.test.cjs"
    assert package_text.count('"test:stage50"') == 1
    assert package_text.count("tests-js/pattern-evolution-execution-verification.test.cjs") == 2
    for stage in range(37, 51):
        assert list(package["scripts"]).count(f"test:stage{stage}") == 1


def test_stage_50_controller_has_no_clock_random_dynamic_or_schema_execution() -> None:
    production = "\n".join(read(name) for name in (
        "pattern-evolution-execution-verification.js",
        "pattern-evolution-execution-verification-assistant.js",
    ))
    for forbidden in (
        "Date.now", "new Date", "Math.random", "crypto.randomUUID",
        "eval(", "new Function", "createObjectStore", "applyMigration",
    ):
        assert forbidden not in production
