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


def test_stage_13_route_serves_tail_securing_screen() -> None:
    response = TestClient(app).get("/first-tail-securing")

    assert response.status_code == 200
    assert "Закрепим хвост рабочей нити" in response.text
    assert 'id="tail-workflow"' in response.text


def test_stage_13_assets_are_served() -> None:
    client = TestClient(app)

    for asset in (
        "/static/first-tail-securing.html",
        "/static/first-tail-securing.css",
        "/static/first-tail-securing.js",
        "/static/first-tail-securing-assistant.js",
    ):
        response = client.get(asset)
        assert response.status_code == 200
        assert response.content


def test_stage_13_loads_stage_12c_before_engine_and_controller() -> None:
    html = (STATIC / "first-tail-securing.html").read_text(
        encoding="utf-8"
    )

    inspection = html.index(
        'src="/static/first-assembly-inspection.js"'
    )
    securing = html.index('src="/static/first-tail-securing.js"')
    controller = html.index(
        'src="/static/first-tail-securing-assistant.js"'
    )
    assert inspection < securing < controller


def test_main_flow_continues_only_after_completed_stage_12c() -> None:
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")
    inspection_html = (
        STATIC / "first-assembly-inspection.html"
    ).read_text(encoding="utf-8")
    inspection_controller = (
        STATIC / "first-assembly-inspection-assistant.js"
    ).read_text(encoding="utf-8")

    assert 'src="/static/first-tail-securing.js"' in html
    assert (
        'assemblyQualityInspection?.inspection?.status ==='
        in script
    )
    assert '"completed"' in script
    assert "firstTailSecuring.ensureForProject" in script
    assert "tailSecuringHome?.label" in script
    assert 'id="inspection-tail-securing-link"' in inspection_html
    assert "/first-tail-securing?project=" in inspection_controller


def test_ui_contains_tail_information_checklist_and_issue_workflow() -> None:
    html = (STATIC / "first-tail-securing.html").read_text(
        encoding="utf-8"
    )

    for element_id in (
        "tail-source-summary",
        "tail-recommended-count",
        "tail-completed-count",
        "tail-user-confidence",
        "tail-checklist",
        "tail-good-button",
        "tail-problem-button",
        "tail-issue-code",
        "tail-issue-note",
        "tail-acknowledge-button",
        "tail-resolved-button",
        "tail-complete-button",
        "tail-completed-panel",
        "tail-blocked-panel",
    ):
        assert f'id="{element_id}"' in html

    for issue_code in (
        "tail_too_short",
        "tail_visible",
        "tail_not_secured",
        "fabric_distorted",
        "tail_pulled",
        "other",
    ):
        assert f'value="{issue_code}"' in html


def test_completed_view_is_terminal_and_does_not_start_stage_14() -> None:
    html = (STATIC / "first-tail-securing.html").read_text(
        encoding="utf-8"
    )
    parser = _ElementInspector("tail-completed-panel")
    parser.feed(html)
    content = " ".join(" ".join(parser.text).split())

    assert "Хвост рабочей нити закреплён" in content
    assert "Следующий этап не начат автоматически" in content
    assert "Stage 14" not in html
    assert "button" not in parser.tags


def test_blocked_view_has_no_working_controls() -> None:
    html = (STATIC / "first-tail-securing.html").read_text(
        encoding="utf-8"
    )
    parser = _ElementInspector("tail-blocked-panel")
    parser.feed(html)
    content = " ".join(" ".join(parser.text).split())

    assert "button" not in parser.tags
    assert "Закрепление хвоста заблокировано" in content
    assert "не исправляются автоматически" in content


def test_assistant_never_auto_completes() -> None:
    controller = (
        STATIC / "first-tail-securing-assistant.js"
    ).read_text(encoding="utf-8")

    assert "completeForProject" in controller
    assert (
        'completeButton.addEventListener("click"' in controller
    )
    assert "completeForProject(repository, projectId)" in controller
