from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"


def test_foundation_preparation_route_and_csp_safe_assets():
    client = TestClient(create_app())
    response = client.get("/project-foundation-section-preparation?project=019fc3ba-4100-71c3-b7f9-bd06e3bff304")
    assert response.status_code == 200
    assert "Подготовим резинку к вязанию" in response.text
    assert "foundation-section-execution-preparation.js" in response.text
    assert "foundation-section-execution-preparation-workspace.js" in response.text
    assert "<script>" not in response.text
    assert "onclick=" not in response.text


def test_foundation_preparation_ui_has_review_completion_and_accessibility_contract():
    html = (STATIC / "foundation-section-execution-preparation.html").read_text(encoding="utf-8")
    assert "Резинка 1×1" in html and "Резинка 2×2" in html
    assert "Проверить подготовку" in html and "Подтвердить подготовку" in html
    assert "не проверена YarnAI" in html
    assert "не меньше 5 см" in html
    assert "Ориентир по количеству рядов не задан" in html
    assert "14 ряд" not in html
    assert "Stage 70" not in html
    assert "fingerprint" not in html.lower()
    assert 'role="alert"' in html and 'tabindex="-1"' in html
    assert "Подготовка следующего участка завершена" in html
    assert "Начать вязание" not in html


def test_saved_projects_loads_preparation_domain_without_inline_script():
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    assert "/static/foundation-section-execution-preparation.js" in html
    assert "<script>" not in html

