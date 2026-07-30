from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_success_screen_exposes_explicit_project_save_action() -> None:
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    script = (STATIC / "app.js").read_text(encoding="utf-8")

    assert 'id="save-project-button"' in html
    assert "Сохранить проект" in html
    assert 'id="save-project-status"' in html
    assert 'id="result-measurements"' in html
    assert "saveCalculatedProject" in script
    assert '"READY", "READY_WITH_WARNINGS"' in script
    assert "createStructuredInput" in script


def test_home_screen_keeps_empty_state_and_renders_saved_projects() -> None:
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")

    for element_id in (
        "saved-projects",
        "saved-projects-loading",
        "saved-projects-empty",
        "saved-projects-error",
        "saved-projects-list",
    ):
        assert f'id="{element_id}"' in html
    assert "Сохранённых проектов пока нет" in html
    assert 'link.textContent = "Продолжить"' in script
    assert 'listProjects({ section: "active" })' in script
    assert "resultSummary" in script


def test_resume_path_restores_structured_result_without_frontend_math() -> None:
    app_script = (STATIC / "app.js").read_text(encoding="utf-8")
    project_script = (STATIC / "calculated-project.js").read_text(
        encoding="utf-8"
    )

    assert "inspectAggregate(aggregate)" in app_script
    assert "applyPayloadToForm(inspection.request)" in app_script
    assert "inspection.result" in app_script
    assert "renderSwatchMeasurements" in app_script
    assert "showProjectRestoreProblem" in app_script
    assert "project_intent" in project_script
    assert "swatch" in project_script
    assert "measurements" in project_script
    assert "average_gauge" in project_script
    assert "warnings" in project_script
    assert "current_stage" in project_script
    assert "Math.round" not in project_script


def test_damaged_and_unsupported_project_copy_is_user_facing_and_non_destructive() -> None:
    app_script = (STATIC / "app.js").read_text(encoding="utf-8")
    project_script = (STATIC / "calculated-project.js").read_text(
        encoding="utf-8"
    )

    assert "Не удалось открыть сохранённый проект" in app_script
    assert "Начать новый расчёт" in app_script
    assert "проект не удалён" in project_script.lower()
    assert 'state: "invalid"' in project_script
    assert 'state: "unsupported"' in project_script
    assert "deleteProject" not in project_script
