from __future__ import annotations

from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


def test_existing_physical_step_route_contains_the_two_post_step_choices() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/pattern-execution-step")

    assert response.status_code == 200
    html = response.text
    assert "Продолжить без фотопроверки" in html
    assert "Проверить по фото" in html
    assert "/static/pattern-execution-vision-review.js" in html
    assert "execution-step-vision-review" in html
    assert "manual ChatGPT" not in html
    assert "Скопировать в ChatGPT" not in html


def test_disabled_copy_is_exact_and_live_ui_never_claims_ai_review() -> None:
    domain = (STATIC / "pattern-execution-vision-review.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-step-assistant.js").read_text(encoding="utf-8")
    combined = domain + controller

    assert "Автоматическая фотопроверка пока не подключена. Можно продолжить без фотопроверки." in combined
    assert "Фото проверено ИИ" not in combined
    assert "OpenAI проверил" not in combined
    assert "отправлено в OpenAI" not in combined
    assert "/api/v1/vision-reviews/configuration" in domain
    assert "fetch(" not in controller


def test_photo_flow_uses_existing_repository_photo_boundary_and_no_new_stage() -> None:
    controller = (STATIC / "pattern-execution-step-assistant.js").read_text(encoding="utf-8")
    html = (STATIC / "pattern-execution-step.html").read_text(encoding="utf-8")
    project_system = (STATIC / "project-system.js").read_text(encoding="utf-8")

    assert "repository.addPhoto" in controller
    assert "STEP_VISION_REVIEW" in controller
    assert 'createStore(database, "photos", "photo_id")' in project_system
    assert 'createStore(database, "photo_blobs", "blob_id")' in project_system
    assert "Stage 24" in html
    assert "Stage 25" not in html


def test_post_step_ui_assets_are_served_with_no_store_gateway_configuration() -> None:
    with TestClient(create_app()) as client:
        script = client.get("/static/pattern-execution-vision-review.js")
        configuration = client.get("/api/v1/vision-reviews/configuration")

    assert script.status_code == 200
    assert "javascript" in script.headers["content-type"]
    assert configuration.status_code == 200
    assert configuration.headers["cache-control"] == "no-store"
    assert configuration.json()["enabled"] is False
    assert "credential" not in configuration.text.lower()
    assert "key" not in configuration.text.lower()
