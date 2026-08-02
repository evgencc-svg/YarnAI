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


def parse(name: str = "pattern-evolution-closure.html") -> PageParser:
    parser = PageParser()
    parser.feed(read(name))
    return parser


def test_stage_52_route_and_four_assets_are_available() -> None:
    client = TestClient(app)
    response = client.get("/pattern-evolution-closure")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Close one immutable evolution cycle" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-evolution-closure"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}
    for name, content_type in (
        ("pattern-evolution-closure.js", "text/javascript"),
        ("pattern-evolution-closure-assistant.js", "text/javascript"),
        ("pattern-evolution-closure.html", "text/html"),
        ("pattern-evolution-closure.css", "text/css"),
    ):
        asset = client.get(f"/static/{name}")
        assert asset.status_code == 200
        assert asset.headers["content-type"].startswith(content_type)


def test_stage_52_has_required_semantic_regions_and_states() -> None:
    parser = parse()
    assert {
        "pattern-evolution-closure-page", "closure-loading-state",
        "closure-missing-context-state", "closure-fatal-state", "closure-summary",
        "closure-outcome-summary", "closure-live-chain-summary", "closure-acceptance-summary",
        "closure-evidence-summary", "closure-risk-summary", "closure-findings",
        "closure-no-promotion-deployment-notice", "closure-stale-state",
        "closure-imported-unproven-state", "closure-collision-state", "closure-quarantine-state",
    } <= parser.testids
    assert {
        "closure-loading", "closure-fatal", "closure-workflow", "closure-missing-context",
        "closure-lifecycle", "closure-status", "closure-outcome", "closure-risk",
        "closure-chain-validity", "closure-trust", "closure-policy-summary",
        "closure-acceptance-reconciliation", "closure-condition-disposition", "closure-criteria",
        "closure-disposition", "closure-evidence-completeness", "closure-evidence-consistency",
        "closure-evidence-coverage", "closure-evidence-provenance", "closure-risk-reconciliation",
        "closure-reason-list", "closure-source-binding", "closure-stale-projection",
    } <= parser.ids
    assert {"closure-fatal", "closure-workflow", "closure-missing-context"} <= parser.hidden


def test_stage_52_has_no_manual_truth_or_operation_controls() -> None:
    parser = parse()
    assert parser.controls == []
    assert parser.inline_handlers == []
    production = "\n".join(read(name).lower() for name in (
        "pattern-evolution-closure.html", "pattern-evolution-closure-assistant.js",
    ))
    for forbidden in (
        'name="verdict"', 'name="outcome"', 'name="risk"', 'name="status"',
        'name="lifecycle"', 'data-command="promote"', 'data-command="deploy"',
        'data-command="rollback"', "onclick=", "onchange=", "onsubmit=",
    ):
        assert forbidden not in production


def test_stage_52_only_navigates_back_and_stage_51_forward_is_fail_closed() -> None:
    closure = parse()
    assert closure.links == {"closure-back-acceptance": "/pattern-evolution-acceptance"}
    acceptance = parse("pattern-evolution-acceptance.html")
    assert acceptance.links["acceptance-open-closure"] == "/pattern-evolution-closure"
    assert "acceptance-open-closure" in acceptance.hidden
    controller = read("pattern-evolution-acceptance-assistant.js")
    for token in (
        "closureEligible", "TERMINAL_LIFECYCLES", "validatePatternEvolutionAcceptance",
        "gate?.valid", 'shown.proofStatus !== "proven"', "shown.importedUnproven",
        "shown.quarantined", "shown.collision", "shown.superseded", "currentProjection?.stale",
        "/pattern-evolution-closure",
    ):
        assert token in controller


def test_stage_52_controller_is_fail_closed_and_renders_all_summaries() -> None:
    controller = read("pattern-evolution-closure-assistant.js")
    for token in (
        "loadSource", "calculateLiveChainGate", "calculateClosureContract",
        "createPatternEvolutionClosure", "transitionPatternEvolutionClosure",
        "getLatestPatternEvolutionClosureForAcceptance", "projectPatternEvolutionClosure",
        'const status = projection?.status', '|| "blocked"',
        'const risk = projection?.risk', 'level: "indeterminate"',
        "closure-missing-context", "closure-fatal", "closure-loading",
        "closure-acceptance-reconciliation", "closure-evidence-completeness",
        "closure-risk-reconciliation", "closure-policy-summary",
    ):
        assert token in controller
    assert "forward" not in controller.lower()


def test_stage_52_static_assets_are_in_dependency_order() -> None:
    parser = parse()
    assert parser.scripts == [
        "/static/pattern-evolution-initiation.js",
        "/static/pattern-evolution-proposal.js",
        "/static/pattern-evolution-proposal-review.js",
        "/static/pattern-evolution-decision.js",
        "/static/pattern-evolution-execution.js",
        "/static/pattern-evolution-execution-verification.js",
        "/static/pattern-evolution-acceptance.js",
        "/static/pattern-evolution-closure.js",
        "/static/project-system.js",
        "/static/pattern-evolution-closure-assistant.js",
    ]
    assert "/static/pattern-evolution-closure.css" in parser.styles
    for asset in parser.scripts:
        assert (STATIC / asset.removeprefix("/static/")).is_file()


def test_stage_52_package_and_project_system_contract() -> None:
    package_text = (ROOT / "package.json").read_text(encoding="utf-8")
    package = json.loads(package_text)
    assert package["scripts"]["test:stage52"] == "node --test tests-js/pattern-evolution-closure.test.cjs"
    assert package_text.count('"test:stage52"') == 1
    assert package["scripts"]["test"].count("tests-js/pattern-evolution-closure.test.cjs") == 1
    assert "pattern-evolution-closure.js" in package["scripts"]["prebuild"]
    assert "pattern-evolution-closure-assistant.js" in package["scripts"]["build"]
    project_system = read("project-system.js")
    for token in (
        '"PATTERN_EVOLUTION_CLOSURE"', "pattern_evolution_closure",
        "savePatternEvolutionClosure", "getLatestPatternEvolutionClosureForAcceptance",
        "resolvePatternEvolutionClosureLiveChain", "importPatternEvolutionClosure",
        "revalidatePatternEvolutionClosure", 'objectStore("progress")',
    ):
        assert token in project_system


def test_stage_52_domain_controller_and_http_are_safe() -> None:
    production = "\n".join(read(name) for name in (
        "pattern-evolution-closure.js", "pattern-evolution-closure-assistant.js",
    ))
    forbidden_tokens = (
        "Date" + ".now", "new " + "Date", "performance" + ".now",
        "Math" + ".random", "crypto" + ".randomUUID", "eval" + "(",
        "new " + "Function", "createObject" + "Store", "apply" + "Migration",
        "perform" + "Rollback",
    )
    for forbidden in forbidden_tokens:
        assert forbidden not in production
    assert "\r\r\n" not in (ROOT / "src" / "yarnai" / "http.py").read_bytes().decode("utf-8")


def test_stage_52_has_no_navigation_assets_routes_or_tests_for_the_next_stage() -> None:
    parser = parse()
    assert set(parser.links) == {"closure-back-acceptance"}
    production = "\n".join(read(name) for name in (
        "pattern-evolution-closure.html", "pattern-evolution-closure.css",
        "pattern-evolution-closure.js", "pattern-evolution-closure-assistant.js",
    ))
    forbidden_stage = 52 + 1
    assert f"STAGE_{forbidden_stage}" not in production.upper()
    assert f"Stage {forbidden_stage}" not in production
    assert f"stage{forbidden_stage}" not in production.lower()
    assert not any(getattr(route, "path", "").endswith(str(forbidden_stage)) for route in app.routes)
    assert not any(path.name.startswith(f"stage{forbidden_stage}") for path in STATIC.iterdir())
