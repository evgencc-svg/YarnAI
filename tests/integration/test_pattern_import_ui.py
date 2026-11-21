from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from fastapi.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class _PatternImportParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()
        self.file_input: dict[str, str | None] = {}

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if tag == "script" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "input" and values.get("id") == "pattern-import-input":
            self.file_input = values


def test_pattern_import_route_serves_material_intake_screen() -> None:
    response = TestClient(app).get("/import-pattern?project=test-project")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Что у тебя есть?" in response.text
    assert "Добавь фото, схему, PDF или описание вещи" in response.text
    assert 'id="pattern-import-workflow"' in response.text


def test_pattern_import_assets_are_local_and_available() -> None:
    html = (STATIC / "pattern-import.html").read_text(encoding="utf-8")
    parser = _PatternImportParser()
    parser.feed(html)
    client = TestClient(app)

    assert parser.assets == [
        "/static/favicon.png",
        "/static/styles.css",
        "/static/pattern-import.css",
        "/static/project-system.js",
        "/static/first-blocking.js",
        "/static/pattern-analysis.js",
        "/static/pattern-import.js",
        "/static/garment-reference-analysis.js",
        "/static/material-intake-experience.js",
        "/static/material-intake-experience-assistant.js",
    ]
    for asset in parser.assets:
        assert asset.startswith("/static/")
        response = client.get(asset)
        assert response.status_code == 200, asset
        assert response.content


def test_pattern_import_ui_has_material_list_and_explicit_action() -> None:
    html = (STATIC / "pattern-import.html").read_text(encoding="utf-8")
    parser = _PatternImportParser()
    parser.feed(html)

    for element_id in (
        "material-intake-drop-zone",
        "pattern-import-input",
        "pattern-import-materials",
        "material-intake-description",
        "material-intake-summary-title",
        "pattern-import-continue",
        "pattern-import-corrupted",
        "pattern-import-blocked",
        "pattern-import-completed",
    ):
        assert element_id in parser.ids

    accept = parser.file_input.get("accept") or ""
    assert parser.file_input.get("multiple") is None
    assert "application/pdf" in accept
    assert "image/*" in accept
    assert "text/plain" in accept
    assert "Проверить материалы" in html
    assert "disabled" in html.split('id="pattern-import-continue"', 1)[1].split(">", 1)[0]


def test_home_and_legacy_entry_points_still_target_import_pattern() -> None:
    blocking_html = (STATIC / "first-blocking.html").read_text(encoding="utf-8")
    blocking_controller = (STATIC / "first-blocking-assistant.js").read_text(
        encoding="utf-8"
    )
    workspace_controller = (
        STATIC / "user-workspace-entry-assistant.js"
    ).read_text(encoding="utf-8")

    assert 'id="blocking-pattern-import-link"' in blocking_html
    assert 'href="/import-pattern"' in blocking_html
    assert "/import-pattern?project=" in blocking_controller
    assert 'let createDestination = "/import-pattern"' in workspace_controller


def test_intake_does_not_analyze_material_contents() -> None:
    domain = (STATIC / "material-intake-experience.js").read_text(encoding="utf-8")
    controller = (
        STATIC / "material-intake-experience-assistant.js"
    ).read_text(encoding="utf-8")
    scripts = f"{domain}\n{controller}"

    for forbidden_api in (
        "FileReader",
        ".arrayBuffer(",
        ".text()",
        "pdfjs",
        "tesseract",
        "canvas.getContext",
        "createImageBitmap",
    ):
        assert forbidden_api not in scripts
    assert "createObjectURL" in controller
    assert "revokeObjectURL" in controller


def test_existing_routes_remain_available_with_material_intake() -> None:
    client = TestClient(app)
    for route in (
        "/",
        "/calculator",
        "/smart-start",
        "/step-assistant",
        "/section-assistant",
        "/shaping-assistant",
        "/bind-off-assistant",
        "/second-piece-assistant",
        "/first-assembly-join",
        "/first-assembly-inspection",
        "/first-tail-securing",
        "/first-blocking",
        "/import-pattern",
        "/pattern-analysis",
    ):
        assert client.get(route).status_code == 200, route
