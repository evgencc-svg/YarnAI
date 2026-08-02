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


def parse(name: str = "pattern-evolution-acceptance.html") -> PageParser:
    parser = PageParser()
    parser.feed(read(name))
    return parser


def test_stage_51_route_and_assets_are_available() -> None:
    client = TestClient(app)
    response = client.get("/pattern-evolution-acceptance")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Decide whether the verified result may advance" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-evolution-acceptance"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}
    for name, content_type in (
        ("pattern-evolution-acceptance.js", "text/javascript"),
        ("pattern-evolution-acceptance-assistant.js", "text/javascript"),
        ("pattern-evolution-acceptance.css", "text/css"),
        ("pattern-evolution-execution-verification.js", "text/javascript"),
        ("project-system.js", "text/javascript"),
    ):
        asset = client.get(f"/static/{name}")
        assert asset.status_code == 200
        assert asset.headers["content-type"].startswith(content_type)


def test_stage_51_renders_identity_source_outcome_and_full_contract() -> None:
    parser = parse()
    assert {
        "pattern-evolution-acceptance-page", "acceptance-identity",
        "acceptance-source-summary", "acceptance-outcome", "acceptance-conformance",
        "acceptance-contract", "acceptance-quality", "acceptance-findings",
    } <= parser.testids
    assert {
        "acceptance-policy", "acceptance-source-gate", "acceptance-chain-integrity",
        "acceptance-verdict-output", "acceptance-status-output", "acceptance-risk-output",
        "acceptance-next-action", "acceptance-source-assessment",
        "acceptance-decision-conformance", "acceptance-execution-conformance",
        "acceptance-verification-conformance", "acceptance-criteria",
        "acceptance-mandatory-conditions", "acceptance-residual-conditions",
        "acceptance-evidence", "acceptance-risk-assessment", "acceptance-benefit-assessment",
        "acceptance-cost-assessment", "acceptance-compatibility-assessment",
        "acceptance-migration-readiness", "acceptance-rollback-readiness",
        "acceptance-operational-readiness", "acceptance-governance-assessment",
        "acceptance-authorization-assessment", "acceptance-provenance-assessment",
        "acceptance-integrity-assessment", "acceptance-post-obligations",
        "acceptance-stop-conditions", "acceptance-rejection-reasons",
        "acceptance-audit-information", "acceptance-completeness",
        "acceptance-consistency", "acceptance-coverage",
    } <= parser.ids
    controller = read("pattern-evolution-acceptance-assistant.js")
    for token in (
        "calculateSourceGate", "calculateAcceptanceContract",
        "projectPatternEvolutionAcceptance", "getLatestPatternEvolutionAcceptanceForVerification",
        "acceptance-policy", "acceptance-source-gate", "acceptance-verdict-output",
    ):
        assert token in controller


def test_stage_51_has_missing_fatal_fail_closed_and_every_terminal_state() -> None:
    parser = parse()
    expected = {
        "acceptance-missing-context-state", "acceptance-fatal-state",
        "acceptance-source-ineligible-state", "acceptance-imported-unproven-state",
        "acceptance-stale-state", "acceptance-accepted-state",
        "acceptance-accepted-with-conditions-state", "acceptance-revision-required-state",
        "acceptance-evidence-required-state", "acceptance-rollback-required-state",
        "acceptance-rejected-state", "acceptance-blocked-state",
        "acceptance-failed-state", "acceptance-cancelled-state",
    }
    assert expected <= parser.testids
    assert "acceptance-fatal" in parser.hidden


def test_stage_51_has_no_manual_truth_risk_or_execution_controls() -> None:
    parser = parse()
    assert parser.controls == []
    assert parser.inline_handlers == []
    production = "\n".join(read(name).lower() for name in (
        "pattern-evolution-acceptance.html", "pattern-evolution-acceptance-assistant.js",
    ))
    for forbidden in (
        'name="verdict"', 'name="risk"', 'name="status"', 'name="lifecycle"',
        'data-command="accept"', 'data-command="reject"', 'data-command="apply-migration"',
        'data-command="perform-rollback"', 'onclick=', 'onchange=', 'onsubmit=',
    ):
        assert forbidden not in production


def test_stage_50_and_stage_51_forward_navigation_are_guarded() -> None:
    acceptance = parse()
    assert acceptance.links["acceptance-back-verification"] == "/pattern-evolution-execution-verification"
    assert acceptance.links["acceptance-open-closure"] == "/pattern-evolution-closure"
    assert "acceptance-open-closure" in acceptance.hidden
    acceptance_controller = read("pattern-evolution-acceptance-assistant.js")
    assert all(token in acceptance_controller for token in ("closureEligible", "validatePatternEvolutionAcceptance", "gate?.valid", "shown.importedUnproven", "shown.quarantined", "shown.collision", "/pattern-evolution-closure"))
    verification = parse("pattern-evolution-execution-verification.html")
    assert verification.links["verification-open-acceptance"] == "/pattern-evolution-acceptance"
    controller = read("pattern-evolution-execution-verification-assistant.js")
    for token in (
        "acceptanceEligible", "TERMINAL_LIFECYCLES", "validatePatternEvolutionExecutionVerification",
        "gate?.valid", 'shown.proofStatus === "proven"', "!shown.importedUnproven",
        "!shown.collision", "!shown.quarantined", "!currentProjection?.stale",
        '"verified_with_conditions"', "/pattern-evolution-acceptance",
    ):
        assert token in controller


def test_stage_51_has_only_guarded_closure_navigation_and_no_later_literals() -> None:
    parser = parse()
    assert set(parser.links) == {"acceptance-back-verification", "acceptance-open-closure"}
    production = "\n".join(read(name) for name in (
        "pattern-evolution-acceptance.html", "pattern-evolution-acceptance.css",
        "pattern-evolution-acceptance.js", "pattern-evolution-acceptance-assistant.js",
    ))
    forbidden_stage = 51 + 2
    assert f"STAGE_{forbidden_stage}" not in production.upper()
    assert f"Stage {forbidden_stage}" not in production
    assert f"stage{forbidden_stage}" not in production.lower()
    assert not any(getattr(route, "path", "").endswith(str(forbidden_stage)) for route in app.routes)
    assert not any(path.name.startswith(f"stage{forbidden_stage}") for path in STATIC.iterdir())


def test_stage_51_asset_order_package_and_project_system_contract() -> None:
    parser = parse()
    assert parser.scripts[-5:] == [
        "/static/pattern-evolution-execution.js",
        "/static/pattern-evolution-execution-verification.js",
        "/static/pattern-evolution-acceptance.js",
        "/static/project-system.js",
        "/static/pattern-evolution-acceptance-assistant.js",
    ]
    assert "/static/pattern-evolution-acceptance.css" in parser.styles
    for asset in parser.scripts:
        assert (STATIC / asset.removeprefix("/static/")).is_file()
    package_text = (ROOT / "package.json").read_text(encoding="utf-8")
    package = json.loads(package_text)
    assert package["scripts"]["test:stage51"] == "node --test tests-js/pattern-evolution-acceptance.test.cjs"
    assert package_text.count('"test:stage51"') == 1
    assert package_text.count("tests-js/pattern-evolution-acceptance.test.cjs") == 2
    project_system = read("project-system.js")
    for token in (
        '"PATTERN_EVOLUTION_ACCEPTANCE"', "savePatternEvolutionAcceptance",
        "getLatestPatternEvolutionAcceptanceForVerification",
        "importPatternEvolutionAcceptance", "revalidatePatternEvolutionAcceptance",
    ):
        assert token in project_system


def test_stage_51_controller_domain_and_http_are_safe() -> None:
    production = "\n".join(read(name) for name in (
        "pattern-evolution-acceptance.js", "pattern-evolution-acceptance-assistant.js",
    ))
    for forbidden in (
        "Date.now", "new Date", "performance.now", "Math.random", "crypto.randomUUID",
        "eval(", "new Function", "createObjectStore", "applyMigration", "performRollback",
    ):
        assert forbidden not in production
    assert "\r\r\n" not in (ROOT / "src" / "yarnai" / "http.py").read_bytes().decode("utf-8")
