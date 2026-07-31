from html.parser import HTMLParser
from pathlib import Path

from fastapi.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class _AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        values = dict(attrs)
        if tag == "script" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "img" and values.get("src"):
            self.assets.append(values["src"] or "")


def test_first_blocking_route_loads_html() -> None:
    response = TestClient(app).get("/first-blocking")

    assert response.status_code == 200
    assert "Придадим изделию правильную форму" in response.text
    assert 'id="blocking-workflow"' in response.text


def test_first_blocking_assets_load() -> None:
    client = TestClient(app)
    for asset in (
        "/static/first-blocking.html",
        "/static/first-blocking.css",
        "/static/first-blocking.js",
        "/static/first-blocking-assistant.js",
    ):
        response = client.get(asset)
        assert response.status_code == 200
        assert response.content


def test_first_blocking_html_has_no_broken_local_assets() -> None:
    html = (STATIC / "first-blocking.html").read_text(encoding="utf-8")
    parser = _AssetParser()
    parser.feed(html)
    client = TestClient(app)

    for asset in parser.assets:
        assert asset.startswith("/static/")
        assert client.get(asset).status_code == 200, asset


def test_first_user_flow_loads_and_prefers_first_blocking() -> None:
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")

    assert 'src="/static/first-blocking.js"' in html
    assert "firstBlocking.ensureForProject" in script
    assert '\"first_blocking_\"' in script
    assert "blockingHome?.label" in script
    assert "blockingHome.href" in script


def test_stage_13_completed_view_links_to_stage_14() -> None:
    html = (STATIC / "first-tail-securing.html").read_text(
        encoding="utf-8"
    )
    controller = (
        STATIC / "first-tail-securing-assistant.js"
    ).read_text(encoding="utf-8")

    assert 'id="tail-first-blocking-link"' in html
    assert 'href="/first-blocking"' in html
    assert "/first-blocking?project=" in controller


def test_ui_contains_safety_drying_correction_and_completion_controls() -> None:
    html = (STATIC / "first-blocking.html").read_text(encoding="utf-8")

    for element_id in (
        "blocking-fiber",
        "blocking-method",
        "blocking-checklist",
        "blocking-measurements",
        "blocking-layout-checks",
        "blocking-drying-panel",
        "blocking-dry-checks",
        "blocking-correction-panel",
        "blocking-complete",
        "blocking-completed",
        "blocking-corrupted",
        "blocking-reset",
    ):
        assert f'id="{element_id}"' in html

    assert "YarnAI не определяет фактическую влажность" in html
    assert "Следующий этап не создаётся и не запускается" in html
    assert "Stage 15" not in html
