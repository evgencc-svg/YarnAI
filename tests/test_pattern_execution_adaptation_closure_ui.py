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
        self.links: dict[str, str] = {}
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
            self.links[values["id"] or ""] = values.get("href") or ""
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def parse() -> PageParser:
    parser = PageParser()
    parser.feed(read("pattern-execution-adaptation-closure.html"))
    return parser


def test_stage_44_route_title_and_assets() -> None:
    names = (
        "pattern-execution-adaptation-closure.html",
        "pattern-execution-adaptation-closure.css",
        "pattern-execution-adaptation-closure.js",
        "pattern-execution-adaptation-closure-assistant.js",
    )
    assert all((STATIC / name).is_file() for name in names)
    response = TestClient(app).get("/pattern-execution-adaptation-closure")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Close the adaptation cycle" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-adaptation-closure"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}


def test_stage_44_ui_exposes_proof_decisions_scope_and_dispositions() -> None:
    parser = parse()
    assert {
        "pattern-execution-adaptation-closure-page",
        "adaptation-closure-lifecycle",
        "adaptation-closure-source-proof",
        "closure-derived-decision",
        "closure-scope-controls",
        "closure-outcome",
        "closure-permanent-reverted-changes",
        "closure-constraints",
        "closure-residual-risks",
        "closure-obligations",
        "closure-monitoring-commitments",
        "closure-ownership",
        "closure-resolutions",
        "closure-blocking-reasons",
        "closure-lifecycle-controls",
    } <= parser.testids
    assert parser.commands == {
        "create", "save-scope", "save-changes", "save-constraints", "save-risks",
        "save-obligations", "save-monitoring", "save-ownership", "prepare", "decide",
        "finalize", "close", "reject", "abort", "supersede", "open-latest",
    }
    html = read("pattern-execution-adaptation-closure.html")
    for identifier in (
        "closure-evaluation-verdict", "closure-decision", "closure-verdict",
        "closure-accepted-outcome", "closure-rejected-outcome", "closure-rollback-resolution",
        "closure-follow-up-resolution", "closure-digest", "closure-terminal",
    ):
        assert f'id="{identifier}"' in html


def test_stage_44_controller_delegates_business_logic_to_domain_module() -> None:
    controller = read("pattern-execution-adaptation-closure-assistant.js")
    for token in (
        "createPatternExecutionAdaptationClosure",
        "savePatternExecutionAdaptationClosure",
        "getPatternExecutionAdaptationClosure",
        "projectPatternExecutionAdaptationClosure",
        "setClosureScope",
        "setPermanentChanges",
        "setRevertedChanges",
        "setConstraintDisposition",
        "setResidualRisks",
        "setObligations",
        "setMonitoringCommitments",
        "setOwnership",
        "startPreparing",
        "startDeciding",
        "startFinalizing",
        "closeClosure",
        "rejectClosure",
        "abortClosure",
        "supersedeClosure",
        "terminal",
        "imported-unproven",
    ):
        assert token in controller
    for forbidden in (
        "deriveClosureDecision",
        "deriveClosureVerdict",
        "calculateSourceProof",
        'getElementById("closure-decision").value',
        'getElementById("closure-verdict").value',
        'getElementById("closure-proof-status").value',
    ):
        assert forbidden not in controller


def test_stages_43_and_44_navigation_is_bidirectional() -> None:
    evaluation_html = read("pattern-execution-adaptation-rollout-evaluation.html")
    evaluation_controller = read("pattern-execution-adaptation-rollout-evaluation-assistant.js")
    closure_controller = read("pattern-execution-adaptation-closure-assistant.js")
    parser = parse()
    assert 'id="evaluation-open-closure"' in evaluation_html
    assert 'href="/pattern-execution-adaptation-closure"' in evaluation_html
    assert "/pattern-execution-adaptation-closure?" in evaluation_controller
    assert 'record?.lifecycle !== "completed"' in evaluation_controller
    assert parser.links["closure-back-evaluation"] == "/pattern-execution-adaptation-rollout-evaluation"
    assert "/pattern-execution-adaptation-rollout-evaluation?" in closure_controller


def test_stage_44_static_paths_package_and_subsequent_stage_boundary() -> None:
    parser = parse()
    assert parser.scripts[-4:] == [
        "/static/pattern-execution-adaptation-rollout-evaluation.js",
        "/static/pattern-execution-adaptation-closure.js",
        "/static/project-system.js",
        "/static/pattern-execution-adaptation-closure-assistant.js",
    ]
    assert "/static/pattern-execution-adaptation-closure.css" in parser.styles
    for asset in parser.scripts:
        assert (STATIC / asset.removeprefix("/static/")).is_file()
    package = (STATIC.parents[2] / "package.json").read_text(encoding="utf-8")
    assert '"test:stage44"' in package
    assert "tests-js/pattern-execution-adaptation-closure.test.cjs" in package
    production = "\n".join(read(name) for name in (
        "pattern-execution-adaptation-closure.html",
        "pattern-execution-adaptation-closure.css",
        "pattern-execution-adaptation-closure.js",
        "pattern-execution-adaptation-closure-assistant.js",
    ))
    later_number = 44 + 1
    assert f"STAGE_{later_number}" not in production.upper()
    assert f"Stage {later_number}" not in production
