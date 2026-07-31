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
        if tag == "img" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "input" and values.get("id") == "pattern-import-input":
            self.file_input = values


def test_pattern_import_route_serves_separate_intake_screen() -> None:
    response = TestClient(app).get("/import-pattern")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Import Pattern" in response.text
    assert "Все материалы войдут в один будущий проект" in response.text
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
        "/static/pattern-import-assistant.js",
        "/static/favicon.png",
    ]
    for asset in parser.assets:
        assert asset.startswith("/static/")
        response = client.get(asset)
        assert response.status_code == 200, asset
        assert response.content


def test_pattern_import_ui_has_material_list_and_explicit_confirmation() -> None:
    html = (STATIC / "pattern-import.html").read_text(encoding="utf-8")
    parser = _PatternImportParser()
    parser.feed(html)

    for element_id in (
        "pattern-import-add",
        "pattern-import-input",
        "pattern-import-materials",
        "pattern-import-confirm",
        "pattern-import-continue",
        "pattern-import-corrupted",
        "pattern-import-reset",
        "pattern-import-blocked",
        "pattern-import-completed",
    ):
        assert element_id in parser.ids

    accept = parser.file_input.get("accept") or ""
    assert parser.file_input.get("multiple") is None
    assert "application/pdf" in accept
    assert "image/*" in accept
    assert "text/plain" in accept
    assert ">Продолжить<" in "".join(html.split())
    assert 'id="pattern-import-continue"' in html
    assert "disabled" in html.split('id="pattern-import-continue"', 1)[1].split(">", 1)[0]


def test_stage_14_completed_view_is_the_only_entry_point() -> None:
    html = (STATIC / "first-blocking.html").read_text(encoding="utf-8")
    controller = (STATIC / "first-blocking-assistant.js").read_text(
        encoding="utf-8"
    )
    engine = (STATIC / "first-blocking.js").read_text(encoding="utf-8")

    assert 'id="blocking-pattern-import-link"' in html
    assert 'href="/import-pattern"' in html
    assert "/import-pattern?project=" in controller
    assert 'result.blocking.status === "completed"' in engine
    assert "Создать проект по описанию" in engine


def test_intake_does_not_read_or_analyze_material_contents() -> None:
    html = (STATIC / "pattern-import.html").read_text(encoding="utf-8")
    engine = (STATIC / "pattern-import.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-import-assistant.js").read_text(
        encoding="utf-8"
    )
    scripts = f"{engine}\n{controller}"

    assert "Содержимое не читается, не распознаётся и не анализируется" in html
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
    assert "PATTERN_IMPORT" in engine
    assert "sourceFingerprint" in engine
    assert "materials" in engine


def test_stage_16_is_absent_and_no_preview_is_rendered() -> None:
    html = (STATIC / "pattern-import.html").read_text(encoding="utf-8")
    engine = (STATIC / "pattern-import.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-import-assistant.js").read_text(
        encoding="utf-8"
    )
    combined = f"{html}\n{engine}\n{controller}"

    assert "Stage 16" not in combined
    assert "STAGE_16" not in combined
    assert "preview" not in combined.lower()
    assert "thumbnail" not in combined.lower()
    assert "<canvas" not in html.lower()


def test_existing_routes_remain_available_with_pattern_import() -> None:
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
