from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai.http as http_api


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class _BindOffParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.scripts: list[str] = []
        self.stylesheets: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if element_id := attributes.get("id"):
            self.ids.add(element_id)
        if tag == "script" and attributes.get("src"):
            self.scripts.append(attributes["src"])
        if (
            tag == "link"
            and attributes.get("rel") == "stylesheet"
            and attributes.get("href")
        ):
            self.stylesheets.append(attributes["href"])


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


def test_bind_off_page_and_assets_are_served(client: TestClient) -> None:
    response = client.get("/bind-off-assistant")
    parser = _BindOffParser()
    parser.feed(response.text)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Закроем все оставшиеся петли" in response.text
    assert parser.scripts == [
        "/static/project-system.js",
        "/static/first-knitting-step.js",
        "/static/first-fabric-section.js",
        "/static/first-simple-shaping.js",
        "/static/first-bind-off.js",
        "/static/bind-off-assistant.js",
    ]
    assert parser.stylesheets == [
        "/static/styles.css",
        "/static/bind-off-assistant.css",
    ]
    for asset in [*parser.scripts, *parser.stylesheets]:
        assert client.get(asset).status_code == 200


def test_bind_off_page_contains_preparation_progress_blocking_and_completion() -> None:
    html = (STATIC / "bind-off-assistant.html").read_text(encoding="utf-8")
    parser = _BindOffParser()
    parser.feed(html)

    assert {
        "bind-off-workflow",
        "bind-off-blocked-panel",
        "bind-off-preparation-panel",
        "bind-off-checklist",
        "bind-off-start-button",
        "bind-off-partial-button",
        "bind-off-stepped-button",
        "bind-off-special-button",
        "bind-off-instruction-panel",
        "bind-off-progress-panel",
        "bind-off-initial-count",
        "bind-off-bound-count",
        "bind-off-remaining-count",
        "bind-off-one-button",
        "bind-off-five-button",
        "bind-off-custom-amount",
        "bind-off-undo-button",
        "bind-off-finish-panel",
        "bind-off-complete-button",
        "bind-off-completed-panel",
    } <= parser.ids
    assert "Все петли закрыты и последняя петля закреплена?" in html
    assert "Этап ещё не завершён автоматически" in html
    assert "Первая деталь завершена" in html


def test_first_user_flow_and_completed_shaping_link_to_bind_off() -> None:
    home_html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    home_script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")
    shaping_html = (STATIC / "shaping-assistant.html").read_text(encoding="utf-8")
    shaping_script = (STATIC / "shaping-assistant.js").read_text(encoding="utf-8")

    assert 'src="/static/first-bind-off.js"' in home_html
    assert "firstBindOff.ensureForProject" in home_script
    assert "bindOffHome?.href" in home_script
    assert 'id="shaping-bind-off-link"' in shaping_html
    assert "/bind-off-assistant?project=" in shaping_script


def test_blocked_and_completed_render_paths_do_not_expose_active_controls() -> None:
    script = (STATIC / "bind-off-assistant.js").read_text(encoding="utf-8")

    assert 'inspection.state === "blocked"' in script
    assert "blockedPanel.hidden = !blocked" in script
    assert 'bindOff.status === "completed"' in script
    assert "completedPanel.hidden" in script
    assert "actionControls.hidden = zero" in script
    assert "FIRST_BIND_OFF" in (
        STATIC / "first-bind-off.js"
    ).read_text(encoding="utf-8")


def test_existing_routes_remain_available(client: TestClient) -> None:
    for route in [
        "/",
        "/calculator",
        "/smart-start",
        "/step-assistant",
        "/section-assistant",
        "/shaping-assistant",
        "/bind-off-assistant",
        "/health",
    ]:
        assert client.get(route).status_code == 200
