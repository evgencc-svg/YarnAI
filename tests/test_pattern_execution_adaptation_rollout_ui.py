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
        self.links: dict[str, tuple[str, bool]] = {}
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.commands: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("data-testid"):
            self.testids.add(values["data-testid"] or "")
        if values.get("data-command"):
            self.commands.add(values["data-command"] or "")
        if tag == "a" and values.get("id"):
            self.links[values["id"] or ""] = (values.get("href") or "", "hidden" in values)
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def parse_page(name: str = "pattern-execution-adaptation-rollout.html") -> PageParser:
    parser = PageParser()
    parser.feed(read(name))
    return parser


def test_stage_42_route_content_type_and_assets() -> None:
    for name in (
        "pattern-execution-adaptation-rollout.html",
        "pattern-execution-adaptation-rollout.css",
        "pattern-execution-adaptation-rollout.js",
        "pattern-execution-adaptation-rollout-assistant.js",
    ):
        assert (STATIC / name).is_file()
    response = TestClient(app).get("/pattern-execution-adaptation-rollout")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "PATTERN_EXECUTION_ADAPTATION_ROLLOUT" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-adaptation-rollout"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}


def test_stage_42_page_exposes_working_proof_plan_evidence_monitoring_and_verdict_ui() -> None:
    parser = parse_page()
    assert {
        "pattern-execution-adaptation-rollout-page",
        "adaptation-rollout-lifecycle",
        "adaptation-rollout-source-chain",
        "adaptation-rollout-proof-warning",
        "adaptation-rollout-proof-errors",
        "rollout-promotion-verdict",
        "rollout-strategy-scope",
        "rollout-plan",
        "rollout-promotion-constraints",
        "rollout-deployment-evidence",
        "rollout-observations",
        "rollout-rollback-assessment",
        "rollout-expected-impact",
        "rollout-verdict",
        "rollout-lifecycle-controls",
        "adaptation-rollout-terminal",
    } <= parser.testids
    assert parser.commands == {
        "create-draft", "save-plan", "start-preparing", "start-deploying",
        "save-item-statuses", "save-evidence", "start-monitoring", "save-constraints",
        "save-observations", "save-rollback", "complete", "abort",
    }


def test_stage_42_controller_loads_promotion_context_and_uses_only_domain_transitions() -> None:
    controller = read("pattern-execution-adaptation-rollout-assistant.js")
    for token in (
        'query.get("promotion")',
        "readPatternExecutionAdaptationRollout",
        "createPatternExecutionAdaptationRollout",
        "savePatternExecutionAdaptationRollout",
        "startPreparing",
        "startDeploying",
        "setRolloutItemStatuses",
        "setDeploymentEvidence",
        "startMonitoring",
        "setObservations",
        "setRollbackAssessment",
        "completeRollout",
        "abortRollout",
        "ALLOWED_PROMOTION_VERDICTS",
        "imported-unproven",
    ):
        assert token in controller
    assert "deriveRolloutVerdict" not in controller
    assert "calculateExpectedImpact" not in controller


def test_stage_41_to_42_navigation_is_guarded_and_reverse_link_preserves_context() -> None:
    promotion_html = read("pattern-execution-adaptation-promotion.html")
    promotion_controller = read("pattern-execution-adaptation-promotion-assistant.js")
    rollout_controller = read("pattern-execution-adaptation-rollout-assistant.js")
    parser = parse_page()
    assert 'id="promotion-forward-rollout"' in promotion_html
    assert 'href="/pattern-execution-adaptation-rollout"' in promotion_html
    assert "hidden" in promotion_html.split('id="promotion-forward-rollout"', 1)[1].split(">", 1)[0]
    for token in ('lifecycle === "completed"', "proof.fullChainProven", '=== "proven"', 'includes(verdict)', "!inspected?.stale"):
        assert token in promotion_controller
    assert parser.links["rollout-back-promotion"] == ("/pattern-execution-adaptation-promotion", False)
    assert "/pattern-execution-adaptation-promotion?" in rollout_controller
    for token in ('params.set("adaptation"', 'params.set("validation"', 'params.set("promotion"'):
        assert token in rollout_controller


def test_stage_42_terminal_stale_and_invalid_promotion_states_are_explicit() -> None:
    html = read("pattern-execution-adaptation-rollout.html")
    controller = read("pattern-execution-adaptation-rollout-assistant.js")
    assert "Terminal rollout is read-only" in html
    for token in (
        '["completed", "aborted"]',
        "control.disabled = terminal || busy",
        "Rollout creation is blocked",
        "proofStatus",
        "record?.collision",
        "source_chain_unavailable",
        "showFatal",
        "formatError",
    ):
        assert token in controller


def test_stage_42_assets_are_registered_accessible_responsive_and_do_not_name_a_later_stage() -> None:
    parser = parse_page()
    assert parser.scripts[-4:] == [
        "/static/pattern-execution-adaptation-promotion.js",
        "/static/pattern-execution-adaptation-rollout.js",
        "/static/project-system.js",
        "/static/pattern-execution-adaptation-rollout-assistant.js",
    ]
    assert "/static/pattern-execution-adaptation-rollout.css" in parser.styles
    assert 'role="alert"' in read("pattern-execution-adaptation-rollout.html")
    assert 'aria-live="polite"' in read("pattern-execution-adaptation-rollout.html")
    assert "@media" in read("pattern-execution-adaptation-rollout.css")
    package = (STATIC.parents[2] / "package.json").read_text(encoding="utf-8")
    assert '"test:stage42"' in package
    assert "pattern-execution-adaptation-rollout.js" in package
    assert "pattern-execution-adaptation-rollout-assistant.js" in package
    production = "\n".join(read(name) for name in (
        "pattern-execution-adaptation-rollout.html",
        "pattern-execution-adaptation-rollout.css",
        "pattern-execution-adaptation-rollout.js",
        "pattern-execution-adaptation-rollout-assistant.js",
    ))
    later_number = 42 + 1
    assert f"STAGE_{later_number}" not in production.upper()
    assert f"Stage {later_number}" not in production
