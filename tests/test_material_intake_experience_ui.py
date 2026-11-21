from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

from fastapi.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"
HTML = STATIC / "pattern-import.html"
CSS = STATIC / "pattern-import.css"
DOMAIN = STATIC / "material-intake-experience.js"
CONTROLLER = STATIC / "material-intake-experience-assistant.js"


class IntakeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.headings: list[tuple[str, str | None]] = []
        self.scripts: list[str] = []
        self.assets: list[str] = []
        self.labels: list[str] = []
        self.inputs: dict[str, dict[str, str | None]] = {}
        self.textareas: dict[str, dict[str, str | None]] = {}
        self.inline_handlers: list[str] = []
        self.tags: Counter[str] = Counter()

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        values = dict(attrs)
        self.tags[tag] += 1
        if values.get("id"):
            self.ids.append(values["id"] or "")
        if tag in {"h1", "h2", "h3"}:
            self.headings.append((tag, values.get("id")))
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
            self.assets.append(values["src"] or "")
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "img" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "label" and values.get("for"):
            self.labels.append(values["for"] or "")
        if tag == "input" and values.get("id"):
            self.inputs[values["id"] or ""] = values
        if tag == "textarea" and values.get("id"):
            self.textareas[values["id"] or ""] = values
        self.inline_handlers.extend(
            name for name, _value in attrs if name.lower().startswith("on")
        )


def parsed() -> tuple[str, IntakeParser]:
    html = HTML.read_text(encoding="utf-8")
    parser = IntakeParser()
    parser.feed(html)
    return html, parser


def test_material_intake_route_and_core_copy() -> None:
    response = TestClient(app).get("/import-pattern?project=test-project")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Что у тебя есть?" in response.text
    assert "Добавь фото, схему, PDF или описание вещи" in response.text
    assert "YarnAI сначала разберёт материалы" in response.text
    assert "Проверить материалы" in response.text


def test_page_has_one_h1_semantic_landmarks_and_no_duplicate_ids() -> None:
    _html, parser = parsed()

    assert sum(tag == "h1" for tag, _id in parser.headings) == 1
    assert parser.tags["main"] == 1
    assert parser.tags["form"] == 1
    assert parser.tags["section"] >= 5
    assert len(parser.ids) == len(set(parser.ids))
    assert not parser.inline_handlers


def test_all_four_source_types_and_purpose_options_are_present() -> None:
    html, _parser = parsed()

    for text in (
        "Фото вещи",
        "Фотография модели, которую ты хочешь связать.",
        "Схема",
        "Изображение выкройки, узора или условных обозначений.",
        "PDF",
        "Описание модели, журнал или инструкция.",
        "Описание",
        "Напиши своими словами или вставь готовый текст.",
    ):
        assert text in html

    controller = CONTROLLER.read_text(encoding="utf-8")
    for value in ("garment_photo", "chart", "unknown"):
        assert value in controller
    for label in ("Это фото вещи", "Это схема", "Не уверен"):
        assert label in DOMAIN.read_text(encoding="utf-8")


def test_file_input_drop_zone_and_textarea_are_accessible() -> None:
    html, parser = parsed()
    file_input = parser.inputs["pattern-import-input"]
    textarea = parser.textareas["material-intake-description"]

    assert "pattern-import-input" in parser.labels
    assert "material-intake-description" in parser.labels
    assert file_input.get("multiple") is None
    accept = file_input.get("accept") or ""
    assert "application/pdf" in accept
    assert "image/*" in accept
    assert textarea.get("placeholder")
    assert 'id="material-intake-drop-zone"' in html
    assert 'tabindex="0"' in html.split('id="material-intake-drop-zone"', 1)[1].split(">", 1)[0]


def test_material_list_summary_errors_and_primary_action_exist() -> None:
    html, parser = parsed()

    for element_id in (
        "pattern-import-materials",
        "pattern-import-count",
        "material-intake-empty",
        "material-intake-summary-title",
        "material-intake-summary-message",
        "material-intake-received",
        "pattern-import-form-error",
        "pattern-import-status-message",
        "pattern-import-continue",
    ):
        assert element_id in parser.ids

    button = html.split('id="pattern-import-continue"', 1)[1].split(">", 1)[0]
    assert "disabled" in button
    assert 'aria-live="assertive"' in html
    assert 'aria-live="polite"' in html


def test_missing_project_and_back_navigation_fail_closed() -> None:
    html, _parser = parsed()
    controller = CONTROLLER.read_text(encoding="utf-8")

    assert "Проект не найден" in html
    assert "Вернись в мастерскую и начни новый проект." in html
    assert "Вернуться в мастерскую" in html
    assert html.count('href="/"') >= 3
    assert "createProject" not in controller
    assert "showMissing" in controller


def test_local_assets_are_available_and_scripts_are_ordered() -> None:
    _html, parser = parsed()
    assert parser.scripts == [
        "/static/project-system.js",
        "/static/first-blocking.js",
        "/static/pattern-analysis.js",
        "/static/pattern-import.js",
        "/static/garment-reference-analysis.js",
        "/static/material-intake-experience.js",
        "/static/material-intake-experience-assistant.js",
    ]
    client = TestClient(app)
    for asset in parser.assets:
        assert asset.startswith("/static/")
        response = client.get(asset)
        assert response.status_code == 200, asset
        assert response.content


def test_controller_uses_public_repository_contract_and_safe_dom() -> None:
    controller = CONTROLLER.read_text(encoding="utf-8")

    for method in (
        "getProject",
        "addCalculation",
        "updateProject",
        "getPatternFile",
    ):
        assert f"repository.{method}" in controller
    for import_method in (
        "ensureForProject",
        "addMaterialsForProject",
        "removeMaterialForProject",
        "completeForProject",
    ):
        assert f"patternImport.{import_method}" in controller
    assert "textContent" in controller
    assert "replaceChildren" in controller
    assert "innerHTML" not in controller
    assert "alert(" not in controller
    assert "confirm(" not in controller
    assert "objectStore(" not in controller
    assert "indexedDB" not in controller


def test_preview_lifecycle_is_safe_and_pdf_runtime_is_not_added() -> None:
    combined = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (HTML, DOMAIN, CONTROLLER)
    )

    assert "createObjectURL" in combined
    assert "revokeObjectURL" in combined
    assert "beforeunload" in combined
    assert "pdfjs" not in combined.lower()
    assert "<canvas" not in combined.lower()
    assert "<svg" not in combined.lower()


def test_mobile_styles_include_narrow_layout_and_overflow_guards() -> None:
    css = CSS.read_text(encoding="utf-8")

    assert "@media (max-width: 560px)" in css
    assert "@media (max-width: 900px)" in css
    assert "overflow-x: hidden" in css
    assert "overflow-wrap: anywhere" in css
    assert "minmax(0, 1fr)" in css
    assert ":focus-visible" in css
    assert "prefers-reduced-motion" in css


def test_no_internal_state_or_future_stage_is_exposed() -> None:
    html, _parser = parsed()
    visible_contract = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (HTML, DOMAIN, CONTROLLER)
    )

    for forbidden in (
        "Stage 55",
        "Stage 56",
        "stage56",
        "pattern_files",
        "pattern_file_blobs",
        "progress kind",
        "raw query",
        "UUID",
    ):
        assert forbidden not in visible_contract
    assert "lifecycle" not in html.lower()


def test_static_security_scan_for_stage55_files() -> None:
    domain = DOMAIN.read_text(encoding="utf-8")
    controller = CONTROLLER.read_text(encoding="utf-8")
    html = HTML.read_text(encoding="utf-8")

    for forbidden in (
        "Math.random",
        "Date.now",
        "new Date",
        "crypto.randomUUID",
        "console.log",
        "eval(",
        "new Function",
        "createObjectStore",
    ):
        assert forbidden not in f"{domain}\n{controller}"
    assert "http://" not in f"{html}\n{domain}\n{controller}"
    assert "https://" not in f"{html}\n{domain}\n{controller}"
    assert "<<<<<<<" not in f"{html}\n{domain}\n{controller}"
