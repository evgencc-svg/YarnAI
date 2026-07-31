from pathlib import Path

from fastapi.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


def test_home_loads_stage_12a_model_before_first_user_flow() -> None:
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")

    model = html.index('src="/static/first-assembly-preparation.js"')
    flow = html.index('src="/static/first-user-flow.js"')
    assert model < flow


def test_stage_12a_home_card_exposes_checklist_and_user_controls() -> None:
    script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")

    assert "firstAssemblyPreparation.ensureForProject" in script
    assert "renderAssemblyChecklist" in script
    assert 'item.source === "user"' in script
    assert "firstAssemblyPreparation.confirmForProject" in script
    assert "Stage 12B, пока не реализован" in script


def test_stage_12a_model_has_minimal_statuses_and_supported_operation() -> None:
    script = (
        STATIC / "first-assembly-preparation.js"
    ).read_text(encoding="utf-8")

    assert '"FIRST_ASSEMBLY_PREPARATION"' in script
    assert '"join_two_identical_straight_edges"' in script
    assert '["collecting", "ready", "blocked"]' in script
    assert '"assembly_preparation_collecting"' in script
    assert '"assembly_preparation_ready"' in script
    assert '"completed"' not in script.split(
        "const STATUSES = Object.freeze(", 1
    )[1].split(");", 1)[0]


def test_stage_12a_assets_are_served_without_a_new_assistant_route() -> None:
    client = TestClient(app)

    assert client.get("/").status_code == 200
    asset = client.get("/static/first-assembly-preparation.js")
    assert asset.status_code == 200
    assert "FIRST_ASSEMBLY_PREPARATION" in asset.text
