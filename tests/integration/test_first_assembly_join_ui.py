from pathlib import Path

from fastapi.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


def test_stage_12b_route_serves_the_join_assistant() -> None:
    response = TestClient(app).get("/first-assembly-join")

    assert response.status_code == 200
    assert "Соединим два одинаковых прямых края" in response.text
    assert 'id="join-workflow"' in response.text


def test_stage_12b_assistant_loads_model_before_ui_controller() -> None:
    html = (STATIC / "first-assembly-join.html").read_text(encoding="utf-8")

    model = html.index('src="/static/first-assembly-join.js"')
    controller = html.index(
        'src="/static/first-assembly-join-assistant.js"'
    )
    assert model < controller
    assert 'src="/static/project-system.js"' in html
    assert 'src="/static/first-assembly-preparation.js"' in html


def test_stage_12b_ui_exposes_required_controls_and_views() -> None:
    html = (STATIC / "first-assembly-join.html").read_text(encoding="utf-8")

    for element_id in (
        "join-source-summary",
        "join-operation-name",
        "join-total-count",
        "join-completed-count",
        "join-remaining-count",
        "join-checklist",
        "join-start-button",
        "join-next-button",
        "join-undo-button",
        "join-repeat-button",
        "join-progress",
        "join-edge-finished-panel",
        "join-thread-button",
        "join-complete-button",
        "join-completed-panel",
        "join-blocked-panel",
    ):
        assert f'id="{element_id}"' in html


def test_stage_12b_model_declares_record_statuses_actions_and_stages() -> None:
    script = (STATIC / "first-assembly-join.js").read_text(encoding="utf-8")

    assert '"FIRST_ASSEMBLY_JOIN"' in script
    for status in ("ready", "in_progress", "blocked", "completed"):
        assert f'"{status}"' in script
    for action in (
        "startJoin",
        "completeUnit",
        "undoLastUnit",
        "repeatLastUnit",
        "confirmThreadSecured",
        "unconfirmThreadSecured",
        "completeJoin",
    ):
        assert action in script
    assert '"assembly_join_ready"' in script
    assert '"assembly_join_in_progress"' in script
    assert '"assembly_join_completed"' in script
    assert "Stage 12C" not in script


def test_stage_12b_home_supports_start_continue_and_result() -> None:
    script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")

    assert 'src="/static/first-assembly-join.js"' in html
    assert "firstAssemblyJoin.ensureForProject" in script
    assert "firstAssemblyJoin?.homeState" in script
    assert "assemblyJoinHome.href" in script
    assert "assemblyJoinHome?.label" in script


def test_stage_12b_assets_are_served() -> None:
    client = TestClient(app)

    for asset in (
        "/static/first-assembly-join.js",
        "/static/first-assembly-join-assistant.js",
        "/static/first-assembly-join.css",
    ):
        response = client.get(asset)
        assert response.status_code == 200
        assert response.text


def test_stage_12b_mobile_css_stacks_working_controls() -> None:
    css = (STATIC / "first-assembly-join.css").read_text(encoding="utf-8")

    assert "@media (max-width: 640px)" in css
    assert ".join-action-controls" in css
    assert "grid-template-columns: 1fr" in css
