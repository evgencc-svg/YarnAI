from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


class DetailsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.h1_count = 0
        self.tags: list[str] = []
        self.scripts: list[str] = []
        self.styles: list[str] = []
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


def parse() -> DetailsParser:
    parser = DetailsParser()
    parser.feed(read("first-user-flow.html"))
    return parser


def test_project_details_anchor_uses_the_existing_workspace_route() -> None:
    response = TestClient(app).get("/user-workspace-entry?project=test#project-details")
    assert response.status_code == 200
    assert 'id="project-details"' in response.text
    assert "Для кого и какого размера вяжем?" in response.text


def test_project_details_has_accessible_product_controls() -> None:
    html = read("first-user-flow.html")
    parser = parse()
    assert parser.h1_count == 1
    assert len(parser.ids) == len(set(parser.ids))
    assert parser.inline_handlers == []
    assert {"main", "section", "form", "fieldset", "legend", "label", "nav"} <= set(parser.tags)
    for element_id in (
        "project-details",
        "project-details-form",
        "project-details-standard-card",
        "project-details-custom-card",
        "project-details-fit-card",
        "project-details-garment-width",
        "project-details-garment-length",
        "project-details-sleeve-length",
        "project-details-known",
        "project-details-missing-list",
        "project-details-save",
        "project-details-continue",
        "project-details-missing",
    ):
        assert element_id in parser.ids
    assert 'inputmode="decimal"' in html
    assert 'aria-live="polite"' in html
    assert 'type="radio" name="sizeMode" value="standard"' in html
    assert 'type="radio" name="sizeMode" value="custom"' in html


def test_project_details_copy_separates_body_and_finished_garment() -> None:
    html = read("first-user-flow.html")
    for copy in (
        "Твои мерки",
        "Размеры готовой вещи",
        "Обхват груди",
        "Как должна сидеть вещь?",
        "Длина готовой вещи",
        "Длина рукава",
        "Что уже известно",
        "Чего ещё не хватает",
        "Сейчас нужно уточнить",
        "Сохранить параметры",
        "Вернуться к способу вязания",
        "Проект не найден",
    ):
        assert copy in html
    assert "????" not in html


def test_project_details_assets_are_local_and_ordered() -> None:
    parser = parse()
    system = parser.scripts.index("/static/project-system.js")
    domain = parser.scripts.index("/static/project-details-experience.js")
    controller = parser.scripts.index("/static/project-details-experience-assistant.js")
    assert system < domain < controller
    assert "/static/project-details-experience.css" in parser.styles
    for asset in [*parser.scripts, *parser.styles]:
        assert asset.startswith("/static/")
    for name in (
        "project-details-experience.js",
        "project-details-experience-assistant.js",
        "project-details-experience.css",
    ):
        assert (STATIC / name).is_file()


def test_project_details_ui_avoids_raw_technical_copy() -> None:
    html = read("first-user-flow.html")
    section = html.split('id="project-details"', 1)[1].split("<dialog", 1)[0]
    for forbidden in (
        "Stage 58",
        "Stage 59",
        "lifecycle",
        "progress kind",
        "IndexedDB",
        "UUID",
        "bust_circumference_cm",
        "garment_length_cm",
        "alert(",
        "confirm(",
    ):
        assert forbidden not in section


def test_project_details_css_is_mobile_first_and_accessible() -> None:
    css = read("project-details-experience.css")
    assert "@media (max-width: 620px)" in css
    assert "@media (max-width: 900px)" in css
    assert "prefers-reduced-motion" in css
    assert ":focus-visible" in css
    assert "min-width: 320px" not in css
    assert "@import" not in css
    assert "url(http" not in css
    assert "grid-template-columns: 1fr" in css


def test_stage58_package_script_is_in_full_test_command() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert package["scripts"]["test:stage58"] == "node --test tests-js/project-details-experience.test.cjs"
    assert package["scripts"]["test"].count("tests-js/project-details-experience.test.cjs") == 1
    assert "project-details-experience.js" in package["scripts"]["build"]
    assert "project-details-experience-assistant.js" in package["scripts"]["build"]
