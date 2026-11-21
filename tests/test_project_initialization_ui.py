from __future__ import annotations

from html.parser import HTMLParser
from html import unescape
import json
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.buttons: dict[str, dict[str, str | None]] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"] or "")
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")
        if tag == "button" and values.get("id"):
            self.buttons[values["id"] or ""] = values


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def parsed() -> AssetParser:
    value = AssetParser()
    value.feed(read("first-user-flow.html"))
    return value


def test_stage61_uses_the_existing_workspace_route() -> None:
    response = TestClient(app).get("/user-workspace-entry?project=test#project-details")
    assert response.status_code == 200
    assert 'id="project-initialization"' in response.text
    route_paths = {getattr(route, "path", "") for route in app.routes}
    assert "/project-initialization" not in route_paths
    assert "/user-workspace-entry" in route_paths


def test_stage61_assets_exist_once_and_are_in_dependency_order() -> None:
    page = parsed()
    for name in ("project-initialization.js", "project-initialization-assistant.js", "project-initialization.css"):
        assert (STATIC / name).is_file()
    assert page.scripts.count("/static/project-initialization.js") == 1
    assert page.scripts.count("/static/project-initialization-assistant.js") == 1
    assert page.styles.count("/static/project-initialization.css") == 1
    system = page.scripts.index("/static/project-system.js")
    experience = page.scripts.index("/static/project-details-experience.js")
    collaboration = page.scripts.index("/static/project-details-collaboration.js")
    closure = page.scripts.index("/static/project-details-closure.js")
    initialization = page.scripts.index("/static/project-initialization.js")
    closure_controller = page.scripts.index("/static/project-details-closure-assistant.js")
    initialization_controller = page.scripts.index("/static/project-initialization-assistant.js")
    assert system < experience < collaboration < closure < initialization < closure_controller < initialization_controller


def test_stage61_dom_hooks_and_accessibility_contract_are_complete() -> None:
    page = parsed()
    html = read("first-user-flow.html")
    required = {
        "project-initialization", "project-initialization-title", "project-initialization-status",
        "project-initialization-summary", "project-initialization-garment", "project-initialization-source",
        "project-initialization-readiness", "project-initialization-assumptions-count",
        "project-initialization-warnings-count", "project-initialization-assumptions",
        "project-initialization-warnings", "project-initialization-changes-panel",
        "project-initialization-changes", "project-initialization-review", "project-initialization-back",
        "project-initialization-confirm", "project-initialization-continue", "project-initialization-reason",
        "project-initialization-save-status", "project-initialization-error", "project-initialization-live",
    }
    assert required <= set(page.ids)
    assert len(page.ids) == len(set(page.ids))
    assert 'aria-describedby="project-initialization-status project-initialization-reason"' in html
    assert 'id="project-initialization-status" class="project-initialization-status" role="status" aria-live="polite" tabindex="-1"' in html
    assert 'id="project-initialization-error" class="project-initialization-error" role="alert" aria-live="assertive" hidden' in html


def test_stage61_actions_are_native_buttons_with_safe_initial_state() -> None:
    page = parsed()
    for element_id in ("project-initialization-review", "project-initialization-back", "project-initialization-confirm", "project-initialization-continue"):
        assert page.buttons[element_id]["type"] == "button"
    assert "disabled" in page.buttons["project-initialization-review"]
    assert "disabled" in page.buttons["project-initialization-confirm"]
    assert "disabled" in page.buttons["project-initialization-continue"]
    assert "disabled" not in page.buttons["project-initialization-back"]


def test_stage61_copy_is_user_facing_and_separates_assumptions_warnings_and_changes() -> None:
    html = unescape(read("first-user-flow.html"))
    for phrase in (
        "Рабочая основа проекта", "Подготовить проект к дальнейшей работе", "Что войдёт в основу",
        "Принятые ограничения", "Допущения", "Предупреждения",
        "Что изменилось после предыдущей основы", "Проверить основу", "Вернуться к сведениям",
        "Инициализировать проект", "Продолжить", "Сначала завершите итоговую проверку сведений о проекте",
    ):
        assert phrase in html
    assert "snapshot_fingerprint" not in html
    assert "source_closure_identity" not in html


def test_stage61_domain_and_controller_keep_responsibilities_separate() -> None:
    domain = read("project-initialization.js")
    controller = read("project-initialization-assistant.js")
    assert "document.querySelector" not in domain
    assert "indexedDB" not in domain
    assert "localStorage" not in domain
    assert "Date.now" not in domain
    assert "Math.random" not in domain
    assert "new Date" not in domain
    assert "ProjectRepository" in controller
    assert "assessInitialization" in controller
    assert "validateContinue" in controller
    assert "location.assign" in controller
    assert "location.assign" not in domain


def test_stage61_css_has_visible_focus_mobile_layout_and_overflow_protection() -> None:
    css = read("project-initialization.css")
    assert ":focus-visible" in css
    assert "outline: 3px" in css
    assert "overflow-wrap: anywhere" in css
    assert "min-width: 0" in css
    assert "@media (max-width: 620px)" in css
    assert "@media (max-width: 900px)" in css
    assert "grid-template-columns: minmax(0, 1fr)" in css
    assert "width: 100%" in css
    assert "@media (prefers-reduced-motion: reduce)" in css
    assert "@import" not in css
    assert "url(http" not in css


def test_stage58_to_stage60_assets_remain_present_and_once_only() -> None:
    page = parsed()
    for name in (
        "project-details-experience.js", "project-details-experience-assistant.js",
        "project-details-collaboration.js", "project-details-collaboration-assistant.js",
        "project-details-closure.js", "project-details-closure-assistant.js",
    ):
        assert page.scripts.count(f"/static/{name}") == 1


def test_stage61_does_not_create_or_navigate_to_a_future_stage() -> None:
    combined = "\n".join(read(name) for name in ("first-user-flow.html", "project-initialization.js", "project-initialization-assistant.js"))
    assert "/stage-62" not in combined.lower()
    assert "#stage-62" not in combined.lower()
    assert "project-stage-62" not in combined.lower()
    assert "PROJECT_STAGE_62" not in combined


def test_stage61_participates_in_full_node_and_build_contracts() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert package["scripts"]["test:stage61"] == "node --test tests-js/project-initialization.test.cjs"
    assert package["scripts"]["pretest"] == (
        "npm run test:garment-photo && npm run test:stage61 && npm run test:stage60"
    )
    assert "project-initialization.js" in package["scripts"]["postbuild"]
    assert "project-initialization-assistant.js" in package["scripts"]["postbuild"]
