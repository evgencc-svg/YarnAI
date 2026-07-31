from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai.http as http_api


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class _SecondPieceParser(HTMLParser):
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


def test_second_piece_route_returns_page_and_local_assets(
    client: TestClient,
) -> None:
    response = client.get("/second-piece-assistant")
    parser = _SecondPieceParser()
    parser.feed(response.text)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Свяжем вторую такую же деталь" in response.text
    assert parser.scripts == [
        "/static/project-system.js",
        "/static/first-simple-shaping.js",
        "/static/first-bind-off.js",
        "/static/second-identical-piece.js",
        "/static/second-piece-assistant.js",
    ]
    assert parser.stylesheets == [
        "/static/styles.css",
        "/static/second-piece-assistant.css",
    ]
    for asset in [*parser.scripts, *parser.stylesheets]:
        assert client.get(asset).status_code == 200


def test_second_piece_page_contains_source_checklist_progress_and_blocking() -> None:
    html = (STATIC / "second-piece-assistant.html").read_text(encoding="utf-8")
    parser = _SecondPieceParser()
    parser.feed(html)

    assert {
        "second-piece-workflow",
        "second-piece-source-panel",
        "second-piece-source-initial",
        "second-piece-source-target",
        "second-piece-source-events",
        "second-piece-blocked-panel",
        "second-piece-checklist",
        "second-piece-start-button",
        "second-piece-progress-overview",
        "second-piece-current-stitches",
        "second-piece-cast-on-panel",
        "second-piece-shaping-panel",
        "second-piece-shaping-undo",
        "second-piece-bind-off-start",
        "second-piece-bind-off-panel",
        "second-piece-bind-one",
        "second-piece-bind-five",
        "second-piece-bind-custom",
        "second-piece-bind-undo",
        "second-piece-finish-panel",
        "second-piece-complete-button",
        "second-piece-completed-panel",
    } <= parser.ids
    assert "Ноль петель не завершил деталь автоматически" in html
    assert "Вторая одинаковая деталь готова" in html


def test_first_user_flow_exposes_start_continue_and_completed_stage_11() -> None:
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    flow_script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")
    model_script = (
        STATIC / "second-identical-piece.js"
    ).read_text(encoding="utf-8")

    assert 'src="/static/second-identical-piece.js"' in html
    assert "secondIdenticalPiece.inspectAggregate" in flow_script
    assert "secondPieceHome?.href" in flow_script
    assert "Связать вторую такую же деталь" in model_script
    assert "Продолжить вторую деталь" in model_script
    assert "Вторая одинаковая деталь готова" in model_script
    assert "second_piece_in_progress" in model_script
    assert "second_piece_completed" in model_script


def test_blocked_and_completed_paths_hide_active_second_piece_controls() -> None:
    script = (
        STATIC / "second-piece-assistant.js"
    ).read_text(encoding="utf-8")

    assert 'inspection.state === "blocked"' in script
    assert "hideActivePanels()" in script
    assert "elements.blockedPanel.hidden = !blocked" in script
    assert 'progress.status === "completed"' in script
    assert "elements.completedPanel.hidden = false" in script
    assert "elements.bindOffActions.hidden = remaining === 0" in script


def test_stage_10_and_existing_routes_remain_available(
    client: TestClient,
) -> None:
    for route in [
        "/",
        "/calculator",
        "/smart-start",
        "/step-assistant",
        "/section-assistant",
        "/shaping-assistant",
        "/bind-off-assistant",
        "/second-piece-assistant",
        "/health",
    ]:
        assert client.get(route).status_code == 200

    stage_10 = client.get("/bind-off-assistant")
    assert "Закроем все оставшиеся петли" in stage_10.text
    assert "/static/first-bind-off.js" in stage_10.text
    assert "Первая деталь завершена" in stage_10.text
