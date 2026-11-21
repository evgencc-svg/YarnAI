from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
PROJECT = "019fc3ba-7200-71c3-b7f9-bd06e3bff304"


def test_production_measurement_route_serves_project_scoped_workspace() -> None:
    response = TestClient(create_app()).get(
        f"/project-foundation-section-measurement?project={PROJECT}"
    )
    assert response.status_code == 200
    assert "Измерьте высоту резинки" in response.text
    assert "foundation-section-measurement.js" in response.text
    assert "foundation-section-measurement-workspace.js" in response.text


def test_measurement_ui_preserves_physical_truth_and_accessibility_copy() -> None:
    html = (STATIC / "foundation-section-measurement.html").read_text(encoding="utf-8")
    css = (STATIC / "foundation-section-measurement.css").read_text(encoding="utf-8")
    workspace = (STATIC / "foundation-section-measurement-workspace.js").read_text(
        encoding="utf-8"
    )
    assert "Цель: не менее 5 см" in html
    assert "на спицах" in html
    assert "естественном нерастянутом состоянии" in html
    assert "от физического начала резинки" in html
    assert "Время вязания и количество рядов не подтверждают сантиметры" in html
    assert "Сохранить измерение" in html
    assert "Проверьте перед подтверждением" not in html
    assert "foundation-measurement-reviewing" not in html
    assert "Продолжить вязать резинку" in html
    assert "Stage 72" not in html
    assert "datetime" not in html
    assert "inputmode=\"decimal\"" in html
    assert ":disabled" in css
    assert "@media (max-width: 640px)" in css
    assert "focus" in workspace
    assert "aria-busy" in workspace
    assert "completeMeasurement" in workspace
    assert "reviewMeasurement" not in workspace


def test_fixture_is_local_test_dev_entry_not_a_forged_final_record() -> None:
    html = (STATIC / "stage72-happy-path-fixture.html").read_text(encoding="utf-8")
    script = (STATIC / "stage72-happy-path-fixture.js").read_text(encoding="utf-8")
    assert "stage72-happy-path-fixture.js" in html
    assert "seedStage71HappyPath" in script
    assert "ensureFoundationSectionExecution" in script
    assert "updateFoundationSectionExecution" in script
    assert "listFoundationSectionMeasurements" in script
    assert "indexedDB" not in script
    assert "objectStore" not in script
