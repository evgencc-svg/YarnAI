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
    parser.feed(read("pattern-execution-adaptation-rollout-evaluation.html"))
    return parser


def test_stage_43_route_title_and_assets() -> None:
    names = (
        "pattern-execution-adaptation-rollout-evaluation.html",
        "pattern-execution-adaptation-rollout-evaluation.css",
        "pattern-execution-adaptation-rollout-evaluation.js",
        "pattern-execution-adaptation-rollout-evaluation-assistant.js",
    )
    assert all((STATIC / name).is_file() for name in names)
    response = TestClient(app).get("/pattern-execution-adaptation-rollout-evaluation")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Evaluate adaptation rollout outcomes" in response.text
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-adaptation-rollout-evaluation"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}


def test_stage_43_ui_exposes_required_inputs_and_derived_outputs() -> None:
    parser = parse()
    assert {
        "pattern-execution-adaptation-rollout-evaluation-page",
        "rollout-evaluation-lifecycle",
        "rollout-evaluation-source-proof",
        "evaluation-strategy-scope",
        "evaluation-observations",
        "evaluation-metrics",
        "evaluation-evidence",
        "evaluation-regressions",
        "evaluation-side-effects",
        "evaluation-impact-comparison",
        "evaluation-stability",
        "evaluation-rollback",
        "evaluation-follow-up",
        "evaluation-verdict",
        "evaluation-lifecycle-controls",
    } <= parser.testids
    assert parser.commands == {
        "create", "save-strategy", "collect", "save-observations", "save-metrics",
        "save-evidence", "save-regressions", "save-side-effects", "analyze", "review",
        "complete", "abort", "open-latest",
    }
    html = read("pattern-execution-adaptation-rollout-evaluation.html")
    assert 'id="evaluation-verdict-value"' in html
    assert 'id="evaluation-proof-status"' in html
    assert 'id="evaluation-expected-impact"' in html
    assert 'id="evaluation-actual-impact"' in html
    assert 'id="evaluation-stability-value"' in html
    assert 'id="evaluation-rollback-value"' in html


def test_stage_43_controller_uses_domain_model_without_manual_verdict_or_proof() -> None:
    controller = read("pattern-execution-adaptation-rollout-evaluation-assistant.js")
    for token in (
        "createPatternExecutionAdaptationRolloutEvaluation",
        "savePatternExecutionAdaptationRolloutEvaluation",
        "getPatternExecutionAdaptationRolloutEvaluation",
        "projectPatternExecutionAdaptationRolloutEvaluation",
        "setEvaluationStrategy",
        "setObservations",
        "setMetrics",
        "setEvidence",
        "setRegressions",
        "setSideEffects",
        "startCollecting",
        "startAnalyzing",
        "startReviewing",
        "completeEvaluation",
        "abortEvaluation",
        "terminal",
        "imported-unproven",
    ):
        assert token in controller
    assert "deriveVerdict" not in controller
    assert "calculateSourceProof" not in controller
    assert 'getElementById("evaluation-verdict-value").value' not in controller
    assert 'getElementById("evaluation-proof-status").value' not in controller


def test_stage_42_and_43_navigation_is_bidirectional() -> None:
    rollout = read("pattern-execution-adaptation-rollout.html")
    rollout_controller = read("pattern-execution-adaptation-rollout-assistant.js")
    evaluation_controller = read("pattern-execution-adaptation-rollout-evaluation-assistant.js")
    parser = parse()
    assert 'id="rollout-open-evaluation"' in rollout
    assert 'href="/pattern-execution-adaptation-rollout-evaluation"' in rollout
    assert "/pattern-execution-adaptation-rollout-evaluation?" in rollout_controller
    assert 'record?.lifecycle !== "completed"' in rollout_controller
    assert parser.links["evaluation-back-rollout"] == "/pattern-execution-adaptation-rollout"
    assert "/pattern-execution-adaptation-rollout?" in evaluation_controller


def test_stage_43_static_paths_package_and_subsequent_stage_boundary() -> None:
    parser = parse()
    assert parser.scripts[-4:] == [
        "/static/pattern-execution-adaptation-rollout.js",
        "/static/pattern-execution-adaptation-rollout-evaluation.js",
        "/static/project-system.js",
        "/static/pattern-execution-adaptation-rollout-evaluation-assistant.js",
    ]
    assert "/static/pattern-execution-adaptation-rollout-evaluation.css" in parser.styles
    for asset in parser.scripts:
        assert (STATIC / asset.removeprefix("/static/")).is_file()
    package = (STATIC.parents[2] / "package.json").read_text(encoding="utf-8")
    assert '"test:stage43"' in package
    production = "\n".join(read(name) for name in (
        "pattern-execution-adaptation-rollout-evaluation.html",
        "pattern-execution-adaptation-rollout-evaluation.css",
        "pattern-execution-adaptation-rollout-evaluation.js",
        "pattern-execution-adaptation-rollout-evaluation-assistant.js",
    ))
    later_number = 43 + 1
    assert f"STAGE_{later_number}" not in production.upper()
    assert f"Stage {later_number}" not in production
