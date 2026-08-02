from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class RetrospectiveParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.testids: set[str] = set()
        self.links: dict[str, str] = {}
        self.commands: set[str] = set()
        self.inline_script = False
        self.inline_handlers = False
        self.live_regions = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        identity = values.get("id")
        if values.get("data-testid"):
            self.testids.add(values["data-testid"] or "")
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "script":
            if values.get("src"):
                self.assets.append(values["src"] or "")
            else:
                self.inline_script = True
        if tag == "a" and identity:
            self.links[identity] = values.get("href") or ""
        if tag == "button" and values.get("data-command"):
            self.commands.add(values["data-command"] or "")
        if values.get("aria-live"):
            self.live_regions += 1
        self.inline_handlers |= any(name.startswith("on") and value for name, value in attrs)


def parsed_page() -> tuple[str, RetrospectiveParser]:
    html = (STATIC / "pattern-execution-retrospective.html").read_text(encoding="utf-8")
    parser = RetrospectiveParser()
    parser.feed(html)
    return html, parser


def production_text() -> str:
    return "\n".join(
        (STATIC / name).read_text(encoding="utf-8")
        for name in (
            "pattern-execution-retrospective.html",
            "pattern-execution-retrospective.css",
            "pattern-execution-retrospective.js",
            "pattern-execution-retrospective-assistant.js",
        )
    )


def test_retrospective_route_and_local_assets_are_available() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-retrospective")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    _, parser = parsed_page()
    expected = {
        "/static/pattern-execution-retrospective.css",
        "/static/pattern-execution-retrospective.js",
        "/static/pattern-execution-retrospective-assistant.js",
        "/static/project-system.js",
    }
    assert expected <= set(parser.assets)
    for asset in expected:
        item = client.get(asset)
        assert item.status_code == 200
        assert item.content


def test_retrospective_route_is_registered_once() -> None:
    routes = [route for route in app.routes if getattr(route, "path", None) == "/pattern-execution-retrospective"]
    assert len(routes) == 1
    assert "GET" in routes[0].methods


def test_page_exposes_separate_categories_summary_and_live_status() -> None:
    html, parser = parsed_page()
    assert "PATTERN_EXECUTION_RETROSPECTIVE" in html
    assert {
        "pattern-execution-retrospective-page",
        "retrospective-status",
        "retrospective-summary",
        "retrospective-integrity",
        "retrospective-live-region",
        "retrospective-facts",
        "retrospective-conclusions",
        "retrospective-unresolved-questions",
        "retrospective-future-considerations",
    } <= parser.testids
    assert parser.live_regions >= 2


def test_page_exposes_required_lifecycle_and_category_commands() -> None:
    _, parser = parsed_page()
    assert {
        "save-draft",
        "start-review",
        "return-draft",
        "complete",
        "add-fact",
        "add-conclusion",
        "add-question",
        "add-consideration",
    } <= parser.commands
    controller = (STATIC / "pattern-execution-retrospective-assistant.js").read_text(encoding="utf-8")
    assert "data-remove-id" in controller
    for state in ("draft", "reviewing", "completed", "stale", "corrupted"):
        assert state in controller


def test_navigation_targets_follow_up_and_completed_learning_entry() -> None:
    html, parser = parsed_page()
    assert parser.links["retrospective-back-follow-up"] == "/pattern-execution-follow-up"
    assert parser.links["retrospective-learning-route"] == "/pattern-execution-learning"
    assert "hidden" in html.split('id="retrospective-learning-route"', 1)[1].split(">", 1)[0]
    controller = (STATIC / "pattern-execution-retrospective-assistant.js").read_text(encoding="utf-8")
    assert 'status === "completed"' in controller
    assert "Boolean(integrity?.valid)" in controller
    assert "record?.projectId === projectId" in controller
    assert "PATTERN_EXECUTION_STAGE_38" not in production_text()
    assert "/pattern-execution-stage-38" not in production_text()


def test_stage_36_link_is_safe_and_conditionally_visible() -> None:
    follow_up_html = (STATIC / "pattern-execution-follow-up.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-follow-up-assistant.js").read_text(encoding="utf-8")
    assert 'id="execution-follow-up-retrospective-route"' in follow_up_html
    assert 'href="/pattern-execution-retrospective"' in follow_up_html
    assert "hidden" in follow_up_html.split('id="execution-follow-up-retrospective-route"', 1)[1].split(">", 1)[0]
    assert 'status === "completed"' in controller
    assert 'snapshot.status === "completed"' in controller
    assert "snapshot.projectId === projectId" in controller
    assert "Boolean(snapshot.inputFingerprint)" in controller
    assert "Boolean(snapshot.fingerprint)" in controller
    assert 'status === "stale"' not in controller.split("ui.retrospectiveRoute.hidden", 1)[1].split(";", 1)[0]


def test_ui_uses_safe_dom_and_safe_error_text() -> None:
    html, parser = parsed_page()
    controller = (STATIC / "pattern-execution-retrospective-assistant.js").read_text(encoding="utf-8")
    assert 'name="viewport"' in html
    assert not parser.inline_script
    assert not parser.inline_handlers
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "eval(" not in controller
    assert "safeMessage" in controller
    assert "error?.stack" not in controller
    assert "JSON.stringify" not in controller


def test_page_has_no_unsafe_external_resources_or_debug_console() -> None:
    _, parser = parsed_page()
    assert all(asset.startswith("/static/") for asset in parser.assets)
    production = production_text()
    for token in ("console.log(", "console.debug(", "console.warn(", "console.error("):
        assert token not in production


def test_controller_never_mutates_previous_execution_stages() -> None:
    controller = (STATIC / "pattern-execution-retrospective-assistant.js").read_text(encoding="utf-8")
    assert "readPatternExecutionRetrospective" in controller
    assert "savePatternExecutionRetrospective" in controller
    for forbidden in (
        "updatePatternExecutionResult",
        "updatePatternExecutionRuntime",
        "completePatternExecutionFollowUp",
        "decidePatternExecution",
        "createProjectVersion",
    ):
        assert forbidden not in controller


def test_responsive_css_and_explicit_form_labels_are_present() -> None:
    html, _ = parsed_page()
    css = (STATIC / "pattern-execution-retrospective.css").read_text(encoding="utf-8")
    assert html.count("<label>") >= 14
    assert "@media" in css
    assert ":disabled" in css
