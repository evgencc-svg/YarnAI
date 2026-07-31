from html.parser import HTMLParser
from pathlib import Path

from fastapi.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class _ElementInspector(HTMLParser):
    def __init__(self, target_id: str) -> None:
        super().__init__()
        self.target_id = target_id
        self.depth = 0
        self.tags: list[str] = []
        self.text: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if self.depth:
            self.depth += 1
            self.tags.append(tag)
        elif attributes.get("id") == self.target_id:
            self.depth = 1
            self.tags.append(tag)

    def handle_endtag(self, _tag: str) -> None:
        if self.depth:
            self.depth -= 1

    def handle_data(self, data: str) -> None:
        if self.depth and data.strip():
            self.text.append(data.strip())


def test_stage_12c_route_serves_inspection_screen() -> None:
    response = TestClient(app).get("/first-assembly-inspection")

    assert response.status_code == 200
    assert "Проверим первый шов" in response.text
    assert 'id="inspection-workflow"' in response.text


def test_stage_12c_assets_are_served() -> None:
    client = TestClient(app)

    for asset in (
        "/static/first-assembly-inspection.html",
        "/static/first-assembly-inspection.css",
        "/static/first-assembly-inspection.js",
        "/static/first-assembly-inspection-assistant.js",
    ):
        response = client.get(asset)
        assert response.status_code == 200
        assert response.content


def test_stage_12c_loads_sources_before_controller() -> None:
    html = (STATIC / "first-assembly-inspection.html").read_text(
        encoding="utf-8"
    )

    preparation = html.index('src="/static/first-assembly-preparation.js"')
    join = html.index('src="/static/first-assembly-join.js"')
    inspection = html.index('src="/static/first-assembly-inspection.js"')
    controller = html.index(
        'src="/static/first-assembly-inspection-assistant.js"'
    )
    assert preparation < join < inspection < controller


def test_main_flow_continues_from_join_to_inspection() -> None:
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")
    join_html = (STATIC / "first-assembly-join.html").read_text(
        encoding="utf-8"
    )

    assert 'src="/static/first-assembly-inspection.js"' in html
    assert "assemblyJoinInspection?.join?.status === \"completed\"" in script
    assert "firstAssemblyInspection.ensureForProject" in script
    assert "assemblyQualityHome?.label" in script
    assert 'id="join-inspection-link"' in join_html
    assert "/first-assembly-inspection" in join_html


def test_completed_view_states_first_operation_is_finished() -> None:
    html = (STATIC / "first-assembly-inspection.html").read_text(
        encoding="utf-8"
    )
    parser = _ElementInspector("inspection-completed-panel")
    parser.feed(html)
    content = " ".join(parser.text)

    assert "Первый шов проверен" in content
    assert "Первая сборочная операция завершена" in content
    assert "Продолжить работу над изделием" in content


def test_blocked_view_has_no_working_controls() -> None:
    html = (STATIC / "first-assembly-inspection.html").read_text(
        encoding="utf-8"
    )
    parser = _ElementInspector("inspection-blocked-panel")
    parser.feed(html)

    assert "button" not in parser.tags
    assert "Проверка первого шва заблокирована" in " ".join(parser.text)
    assert "Вернуться к проекту" in " ".join(parser.text)


def test_stage_12a_and_12b_routes_still_work() -> None:
    client = TestClient(app)

    for route in ("/", "/first-assembly-join"):
        response = client.get(route)
        assert response.status_code == 200
    for asset in (
        "/static/first-assembly-preparation.js",
        "/static/first-assembly-join.html",
        "/static/first-assembly-join.css",
        "/static/first-assembly-join.js",
        "/static/first-assembly-join-assistant.js",
    ):
        assert client.get(asset).status_code == 200


def test_stage_12c_ui_has_check_issue_complete_and_blocked_states() -> None:
    html = (STATIC / "first-assembly-inspection.html").read_text(
        encoding="utf-8"
    )

    for element_id in (
        "inspection-source-summary",
        "inspection-checklist",
        "inspection-good-button",
        "inspection-problem-button",
        "inspection-issue-code",
        "inspection-issue-note",
        "inspection-acknowledge-button",
        "inspection-resolved-button",
        "inspection-complete-button",
        "inspection-completed-panel",
        "inspection-blocked-panel",
    ):
        assert f'id="{element_id}"' in html
