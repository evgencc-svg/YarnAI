from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.scripts: list[str] = []
        self.h1_count = 0
        self.inline_handlers: list[str] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"] or "")
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "h1":
            self.h1_count += 1
        self.inline_handlers.extend(name for name, _ in attrs if name.startswith("on"))


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def test_pattern_analysis_route_is_the_material_understanding_screen() -> None:
    response = TestClient(app).get("/pattern-analysis?project=test-project")

    assert response.status_code == 200
    assert "Вот что YarnAI понял" in response.text
    assert "Что это за вещь?" in response.text
    assert "Что уже понятно" in response.text
    assert "Нужно уточнить" in response.text
    assert "Чего пока не хватает" in response.text
    assert "Уточним один момент" in response.text
    assert "Использованные материалы" in response.text
    assert "Изменить материалы" in response.text
    assert "Перейти к проверке" in response.text


def test_page_has_one_h1_unique_ids_and_no_inline_handlers() -> None:
    parser = PageParser()
    parser.feed(read("pattern-analysis.html"))

    assert parser.h1_count == 1
    assert len(parser.ids) == len(set(parser.ids))
    assert not parser.inline_handlers
    assert "understanding-missing-project" in parser.ids
    assert "understanding-error" in parser.ids
    assert "understanding-question-card" in parser.ids
    assert "understanding-correction-form" in parser.ids


def test_assets_and_scripts_are_connected_in_dependency_order() -> None:
    parser = PageParser()
    parser.feed(read("pattern-analysis.html"))

    assert '/static/pattern-analysis.css' in read("pattern-analysis.html")
    assert parser.scripts == [
        "/static/project-system.js",
        "/static/project-readiness-engine.js",
        "/static/pattern-analysis.js",
        "/static/pattern-content-extraction.js",
        "/static/pattern-semantic-rules.js",
        "/static/pattern-semantic-analysis.js",
        "/static/pattern-analysis-review.js",
        "/static/material-understanding-experience.js",
        "/static/pattern-source-instruction-evidence.js",
        "/static/pattern-technology-review.js",
        "/static/graded-raglan-instruction.js",
        "/static/garment-polo-plan.js",
        "/static/graded-front-neck.js",
        "/static/graded-body-panels.js",
        "/static/garment-set-in-geometry.js",
        "/static/graded-sleeves.js",
        "/static/pattern-execution-checkpoint.js",
        "/static/graded-assembly.js",
        "/static/anthony-personal-fit.js",
        "/static/anthony-personal-fit-view.js",
        "/static/material-understanding-experience-assistant.js",
    ]
    client = TestClient(app)
    for asset in ["/static/pattern-analysis.css", *parser.scripts]:
        assert client.get(asset).status_code == 200, asset


def test_controller_uses_public_repository_and_safe_dom() -> None:
    controller = read("material-understanding-experience-assistant.js")

    assert "new system.ProjectRepository()" in controller
    assert "repository.updateProject" in controller
    assert "reviewApi.updateItem" in controller
    assert "reviewApi.saveForProject" in controller
    assert "reviewApi.ensureForProject" in controller
    assert "textContent" in controller
    assert "replaceChildren" in controller
    assert "innerHTML" not in controller
    assert "indexedDB" not in controller
    assert "alert(" not in controller
    assert "confirm(" not in controller


def test_existing_routes_and_forward_route_remain_available() -> None:
    client = TestClient(app)

    for route in (
        "/",
        "/import-pattern",
        "/pattern-analysis",
        "/pattern-analysis-review",
        "/pattern-technology-draft",
    ):
        assert client.get(route).status_code == 200, route


def test_user_copy_does_not_expose_internal_analysis_details() -> None:
    html = read("pattern-analysis.html")

    for forbidden in (
        "Stage 56",
        "PATTERN_ANALYSIS",
        "LOW_CONFIDENCE",
        "UNRESOLVED",
        "confidence =",
        "snapshot",
        "object store",
    ):
        assert forbidden not in html
    assert "Разбор проекта" in html
    assert "Понятно" not in html or "Пока неизвестно" in html


def test_accessibility_and_mobile_contracts_are_present() -> None:
    html = read("pattern-analysis.html")
    css = read("pattern-analysis.css")

    assert "aria-live" in html
    assert "<fieldset>" in html
    assert "<legend" in html
    assert "focus-visible" in css
    assert "prefers-reduced-motion" in css
    assert "overflow-x: hidden" in css
    assert "@media (max-width: 360px)" in css
    assert "@media (max-width: 760px)" in css


def test_stage56_production_files_pass_static_security_scan() -> None:
    names = (
        "pattern-analysis.html",
        "pattern-analysis.css",
        "material-understanding-experience.js",
        "material-understanding-experience-assistant.js",
    )
    combined = "\n".join(read(name) for name in names)

    for forbidden in (
        "Math.random",
        "Date.now",
        "new Date",
        "crypto.randomUUID",
        "console.log",
        "alert(",
        "confirm(",
        "<<<<<<<",
        ">>>>>>>",
        "stage57",
        "Stage 57",
        "createObjectStore",
        "@import url(",
    ):
        assert forbidden not in combined
    assert "C:\\Users\\" not in combined
    assert "http://" not in combined
    assert "https://" not in combined


def test_missing_project_and_storage_error_copy_is_fail_closed() -> None:
    html = read("pattern-analysis.html")
    controller = read("material-understanding-experience-assistant.js")

    assert "Проект не найден" in html
    assert "Вернись в мастерскую и выбери проект заново." in html
    assert "Не удалось разобрать материалы" in html
    assert "Не удалось открыть результат разбора" in read(
        "material-understanding-experience.js"
    )
    assert "isUuidv7" in controller
