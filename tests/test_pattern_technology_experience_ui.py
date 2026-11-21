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


def test_pattern_technology_route_is_the_user_experience() -> None:
    response = TestClient(app).get(
        "/pattern-technology-draft?project=test-project"
    )

    assert response.status_code == 200
    for copy in (
        "Как будем вязать эту вещь",
        "Общий способ работы",
        "Конструкция изделия",
        "Из каких деталей состоит вещь",
        "Порядок работы",
        "Как соединяем детали",
        "Определено",
        "Предлагаемый вариант",
        "Нужно решить",
        "Нужно выбрать один вариант",
        "Изменить",
        "На чём основан этот способ",
        "Что понадобится дальше",
        "Подтвердить способ вязания",
        "Вернуться к разбору",
        "Проект не найден",
    ):
        assert copy in response.text


def test_page_has_one_h1_unique_ids_and_no_inline_handlers() -> None:
    parser = PageParser()
    parser.feed(read("pattern-technology-draft.html"))

    assert parser.h1_count == 1
    assert len(parser.ids) == len(set(parser.ids))
    assert not parser.inline_handlers
    assert "technology-missing-project" in parser.ids
    assert "technology-error" in parser.ids
    assert "technology-question-form" in parser.ids
    assert "technology-correction-form" in parser.ids


def test_assets_are_connected_in_dependency_order() -> None:
    parser = PageParser()
    parser.feed(read("pattern-technology-draft.html"))

    assert parser.scripts == [
        "/static/project-system.js",
        "/static/project-readiness-engine.js",
        "/static/pattern-analysis-review.js",
        "/static/pattern-technology-draft.js",
        "/static/pattern-technology-review.js",
        "/static/pattern-technology-experience.js",
        "/static/pattern-technology-experience-assistant.js",
    ]
    client = TestClient(app)
    for asset in [
        "/static/pattern-technology-draft.css",
        *parser.scripts,
    ]:
        assert client.get(asset).status_code == 200, asset


def test_controller_reuses_public_domain_apis_and_safe_dom() -> None:
    controller = read("pattern-technology-experience-assistant.js")

    for required in (
        "new system.ProjectRepository()",
        "draftApi.ensureForProject",
        "draftApi.buildForProject",
        "reviewApi.ensureForProject",
        "reviewApi.decideForProject",
        "reviewApi.correctForProject",
        "reviewApi.confirmForProject",
        "repository.updateProject",
        "textContent",
        "replaceChildren",
    ):
        assert required in controller
    for forbidden in (
        "innerHTML",
        "indexedDB",
        "alert(",
        "confirm(",
    ):
        assert forbidden not in controller


def test_accessibility_and_mobile_contracts_are_present() -> None:
    html = read("pattern-technology-draft.html")
    css = read("pattern-technology-draft.css")

    for required in (
        "aria-live",
        "<fieldset>",
        "<legend",
        "<main",
        "<section",
        "<form",
        "<ol",
    ):
        assert required in html
    assert "focus-visible" in css
    assert "prefers-reduced-motion" in css
    assert "min-width: 320px" in css
    assert "@media (max-width: 390px)" in css
    assert "overflow-wrap: anywhere" in css


def test_user_copy_does_not_expose_internal_fields() -> None:
    html = read("pattern-technology-draft.html")

    for forbidden in (
        "Stage 57",
        "PATTERN_TECHNOLOGY_DRAFT",
        "PATTERN_TECHNOLOGY_REVIEW",
        "lifecycle",
        "progress kind",
        "raw status",
        "confidence",
        "snapshot",
        "IndexedDB",
        "UUID",
        "stage58",
    ):
        assert forbidden not in html


def test_stage57_production_files_pass_static_security_scan() -> None:
    names = (
        "pattern-technology-draft.html",
        "pattern-technology-draft.css",
        "pattern-technology-experience.js",
        "pattern-technology-experience-assistant.js",
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
        "innerHTML",
        "<<<<<<<",
        ">>>>>>>",
        "createObjectStore",
        "DB_VERSION",
        "@import url(",
        "http://",
        "https://",
        "stage58",
    ):
        assert forbidden not in combined
    assert "C:\\Users\\" not in combined


def test_existing_back_and_forward_routes_remain_available() -> None:
    client = TestClient(app)

    for route in (
        "/",
        "/user-workspace-entry",
        "/pattern-analysis",
        "/pattern-technology-draft",
        "/pattern-technology-review",
        "/calculator",
    ):
        assert client.get(route).status_code == 200, route


def test_missing_and_storage_error_copy_is_fail_closed() -> None:
    html = read("pattern-technology-draft.html")
    model = read("pattern-technology-experience.js")

    assert "Проект не найден" in html
    assert "Пока не удалось подготовить способ вязания" in html
    assert "Не удалось открыть способ вязания" in model
    assert "Попробуй обновить страницу." in model
