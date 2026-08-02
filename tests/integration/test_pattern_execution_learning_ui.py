from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.testids: set[str] = set()
        self.links: dict[str, str] = {}
        self.scripts: list[str] = []
        self.styles: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if values.get("data-testid"):
            self.testids.add(values["data-testid"] or "")
        if tag == "a" and values.get("id"):
            self.links[values["id"] or ""] = values.get("href") or ""
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")


def parse_page() -> PageParser:
    parser = PageParser()
    parser.feed((STATIC / "pattern-execution-learning.html").read_text(encoding="utf-8"))
    return parser


def test_learning_assets_exist_and_route_is_available() -> None:
    for name in (
        "pattern-execution-learning.html",
        "pattern-execution-learning.css",
        "pattern-execution-learning.js",
        "pattern-execution-learning-assistant.js",
    ):
        assert (STATIC / name).is_file()
    client = TestClient(app)
    response = client.get("/pattern-execution-learning")
    assert response.status_code == 200
    assert "PATTERN_EXECUTION_LEARNING" in response.text
    for asset in (
        "/static/pattern-execution-learning.css",
        "/static/pattern-execution-learning.js",
        "/static/pattern-execution-learning-assistant.js",
    ):
        assert client.get(asset).status_code == 200


def test_learning_route_is_registered_once() -> None:
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-learning"]
    assert len(routes) == 1
    assert routes[0].methods == {"GET", "HEAD"}


def test_learning_ui_exposes_all_structured_blocks_and_integrity() -> None:
    parser = parse_page()
    assert {
        "pattern-execution-learning-page",
        "learning-status",
        "learning-metrics",
        "learning-integrity",
        "learning-live-region",
        "learning-lessons",
        "learning-successful-patterns",
        "learning-anti-patterns",
        "learning-recommendations",
        "learning-confidence",
    } <= parser.testids
    assert {
        "lesson-title", "lesson-description", "lesson-facts", "lesson-confidence",
        "success-pattern", "success-rationale", "success-facts", "success-confidence",
        "anti-pattern", "anti-reason", "anti-mitigation", "anti-facts", "anti-confidence",
        "recommendation-priority", "recommendation-rationale", "recommendation-benefit",
        "assessment-level", "assessment-rationale", "assessment-coverage", "assessment-limitations",
    } <= parser.ids


def test_local_assets_are_explicit_and_ordered() -> None:
    parser = parse_page()
    assert parser.scripts == [
        "/static/pattern-execution-retrospective.js",
        "/static/pattern-execution-learning.js",
        "/static/project-system.js",
        "/static/pattern-execution-learning-assistant.js",
    ]
    assert "/static/pattern-execution-learning.css" in parser.styles


def test_stage_37_and_stage_38_navigation_is_bidirectional_and_guarded() -> None:
    parser = parse_page()
    assert parser.links["learning-back-retrospective"] == "/pattern-execution-retrospective"
    retrospective_html = (STATIC / "pattern-execution-retrospective.html").read_text(encoding="utf-8")
    retrospective_controller = (STATIC / "pattern-execution-retrospective-assistant.js").read_text(encoding="utf-8")
    assert 'id="retrospective-learning-route"' in retrospective_html
    assert 'href="/pattern-execution-learning"' in retrospective_html
    assert "hidden" in retrospective_html.split('id="retrospective-learning-route"', 1)[1].split(">", 1)[0]
    assert "/pattern-execution-learning?project=${encodeURIComponent(projectId)}" in retrospective_controller
    assert 'status === "completed"' in retrospective_controller
    assert "Boolean(integrity?.valid)" in retrospective_controller
    assert "record?.projectId === projectId" in retrospective_controller


def test_completed_stage_38_exposes_a_guarded_stage_39_link() -> None:
    parser = parse_page()
    controller = (STATIC / "pattern-execution-learning-assistant.js").read_text(encoding="utf-8")
    assert parser.links["learning-adaptation-route"] == "/pattern-execution-adaptation"
    assert "/pattern-execution-adaptation?project=${encodeURIComponent(projectId)}" in controller
    assert 'status === "completed"' in controller
    assert "record?.status === \"completed\"" in controller
    assert "Boolean(integrity?.valid)" in controller


def test_controller_uses_repository_and_completed_retrospective_gate() -> None:
    controller = (STATIC / "pattern-execution-learning-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-execution-learning.js").read_text(encoding="utf-8")
    for token in (
        "readPatternExecutionLearning", "createPatternExecutionLearning", "savePatternExecutionLearning",
        "completed_retrospective_required", 'recordStatus(normalizedSource.retrospective) !== "completed"',
        "sourceRetrospectiveIdentity", "sourceSnapshotFingerprint", "import_identity_unproven",
    ):
        assert token in controller or token in domain
    assert "localStorage" not in controller
    assert "sessionStorage" not in controller


def test_ui_is_responsive_and_only_links_to_the_explicit_adaptation_stage() -> None:
    css = (STATIC / "pattern-execution-learning.css").read_text(encoding="utf-8")
    production = "\n".join((STATIC / name).read_text(encoding="utf-8") for name in (
        "pattern-execution-learning.html", "pattern-execution-learning.css",
        "pattern-execution-learning.js", "pattern-execution-learning-assistant.js",
    ))
    assert "@media" in css
    assert "PATTERN_EXECUTION_STAGE_39" not in production
    assert "pattern-execution-adaptation" in production
    assert "Stage 40" not in production
