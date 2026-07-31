from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


class _PatternAnalysisParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
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


def test_pattern_analysis_route_opens_without_server_error() -> None:
    response = TestClient(app).get("/pattern-analysis")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Анализ материалов" in response.text
    assert "Анализ материалов ещё не выполнялся." in response.text


def test_pattern_analysis_assets_are_local_and_available() -> None:
    html = (STATIC / "pattern-analysis.html").read_text(encoding="utf-8")
    parser = _PatternAnalysisParser()
    parser.feed(html)
    client = TestClient(app)

    assert parser.assets == [
        "/static/favicon.png",
        "/static/styles.css",
        "/static/project-system.js",
        "/static/pattern-analysis.js",
        "/static/pattern-analysis-assistant.js",
        "/static/favicon.png",
    ]
    for asset in parser.assets:
        assert asset.startswith("/static/")
        response = client.get(asset)
        assert response.status_code == 200, asset
        assert response.content


def test_waiting_state_has_the_required_copy_and_safe_fallback() -> None:
    html = (STATIC / "pattern-analysis.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-analysis-assistant.js").read_text(
        encoding="utf-8"
    )
    parser = _PatternAnalysisParser()
    parser.feed(html)

    assert {
        "pattern-analysis-project-title",
        "pattern-analysis-status",
        "pattern-analysis-details",
    } <= parser.ids
    assert 'waiting: "Ожидает запуска."' in controller
    assert "Анализ материалов ещё не выполнялся." in controller
    assert "filesCount" in controller


def test_pattern_analysis_stage_performs_no_file_processing() -> None:
    engine = (STATIC / "pattern-analysis.js").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-analysis-assistant.js").read_text(
        encoding="utf-8"
    )
    combined = f"{engine}\n{controller}"

    for forbidden_api in (
        "FileReader",
        ".arrayBuffer(",
        ".text()",
        "pdfjs",
        "tesseract",
        "canvas.getContext",
        "createImageBitmap",
        "fetch(",
        "WebSocket",
        "XMLHttpRequest",
        "OpenAI",
        "llm",
    ):
        assert forbidden_api not in combined
    assert "PATTERN_ANALYSIS" in engine
    assert "patternDetected: false" in engine


def test_pattern_analysis_does_not_introduce_stage_17() -> None:
    files = (
        STATIC / "pattern-analysis.html",
        STATIC / "pattern-analysis.js",
        STATIC / "pattern-analysis-assistant.js",
    )
    combined = "\n".join(path.read_text(encoding="utf-8") for path in files)

    assert "Stage 17" not in combined
    assert "STAGE_17" not in combined
