from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


class ClosureParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.tags: list[str] = []
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.h1_count = 0
        self.inline_handlers: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        self.tags.append(tag)
        if values.get("id"):
            self.ids.append(values["id"] or "")
        if tag == "h1":
            self.h1_count += 1
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")
        self.inline_handlers.extend(name for name in values if name.startswith("on"))


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def parser() -> ClosureParser:
    value = ClosureParser()
    value.feed(read("first-user-flow.html"))
    return value


def test_project_details_closure_stays_on_existing_route() -> None:
    response = TestClient(app).get("/user-workspace-entry?project=test#project-details")
    assert response.status_code == 200
    assert 'id="project-details-closure"' in response.text
    assert "Проверка данных перед расчётом" in response.text


def test_closure_assets_are_local_present_and_ordered() -> None:
    parsed = parser()
    for name in (
        "project-details-closure.js",
        "project-details-closure-assistant.js",
        "project-details-closure.css",
    ):
        assert (STATIC / name).is_file()
    assert "/static/project-details-closure.css" in parsed.styles
    system = parsed.scripts.index("/static/project-system.js")
    experience = parsed.scripts.index("/static/project-details-experience.js")
    collaboration = parsed.scripts.index("/static/project-details-collaboration.js")
    closure = parsed.scripts.index("/static/project-details-closure.js")
    controller = parsed.scripts.index("/static/project-details-closure-assistant.js")
    assert system < experience < collaboration < closure < controller
    assert all(asset.startswith("/static/") for asset in [*parsed.scripts, *parsed.styles])


def test_closure_review_has_accessible_semantics_and_actions() -> None:
    html = read("first-user-flow.html")
    parsed = parser()
    assert parsed.h1_count == 1
    assert len(parsed.ids) == len(set(parsed.ids))
    assert parsed.inline_handlers == []
    assert {"section", "h2", "h3", "fieldset", "legend", "label", "button", "dl", "ul"} <= set(parsed.tags)
    for element_id in (
        "project-details-closure",
        "project-details-closure-readiness",
        "project-details-closure-known",
        "project-details-closure-missing-required",
        "project-details-closure-missing-recommended",
        "project-details-closure-errors",
        "project-details-closure-warnings",
        "project-details-closure-assumptions",
        "project-details-closure-provenance",
        "project-details-closure-collaboration-summary",
        "project-details-closure-acknowledgement",
        "project-details-closure-review-button",
        "project-details-closure-confirm",
        "project-details-closure-continue",
        "project-details-closure-stale-changes",
    ):
        assert element_id in parsed.ids
    assert 'aria-live="polite"' in html
    assert 'aria-live="assertive"' in html
    assert '<legend>Подтверждение допущений</legend>' in html


def test_closure_copy_separates_errors_warnings_assumptions_and_history() -> None:
    html = read("first-user-flow.html")
    for copy in (
        "Итоговые сведения",
        "Обязательные",
        "Рекомендуемые",
        "Блокирующие ошибки",
        "Предупреждения",
        "Допущения",
        "Происхождение значений",
        "Совместная проверка",
        "Предыдущее подтверждение",
        "Проверить ещё раз",
        "Подтвердить данные",
        "Вернуться к редактированию",
        "Продолжить",
    ):
        assert copy in html
    assert 'id="project-details-closure-confirm" type="button" disabled' in html
    assert 'id="project-details-closure-continue" type="button" disabled' in html


def test_closure_assets_fail_closed_without_direct_storage_or_future_stage() -> None:
    domain = read("project-details-closure.js")
    controller = read("project-details-closure-assistant.js")
    combined = domain + controller
    assert "indexedDB.open" not in combined
    assert "localStorage" not in combined
    assert "createObjectStore" not in combined
    assert "Stage 61" not in combined
    assert "stage61" not in combined.lower()
    assert "ProjectRepository" in controller
    assert "evaluateStoredClosure" in domain
    assert "compareSnapshots" in domain
    assert "location.assign" not in domain
    assert "location.assign" in controller
    assert "new CustomEvent" not in domain


def test_closure_css_is_responsive_keyboard_visible_and_wraps_long_text() -> None:
    css = read("project-details-closure.css")
    assert "@media (max-width: 620px)" in css
    assert "@media (max-width: 900px)" in css
    assert "@media (prefers-reduced-motion: reduce)" in css
    assert ":focus-visible" in css
    assert "overflow-wrap: anywhere" in css
    assert "min-width: 0" in css
    assert "grid-template-columns: 1fr" in css
    assert "@import" not in css
    assert "url(http" not in css


def test_stage60_package_script_participates_in_test_and_build() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert package["scripts"]["test:stage60"] == "node --test tests-js/project-details-closure.test.cjs"
    assert package["scripts"]["pretest"] == (
        "npm run test:garment-photo && npm run test:stage61 && npm run test:stage60"
    )
    assert "project-details-closure.js" in package["scripts"]["postbuild"]
    assert "project-details-closure-assistant.js" in package["scripts"]["postbuild"]
    assert package["devDependencies"] == {"fake-indexeddb": "6.2.5"}
