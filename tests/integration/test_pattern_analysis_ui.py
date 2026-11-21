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
        self.ids: list[str] = []
        self.h1_count = 0

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"] or "")
        if tag == "script" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"] or "")
        if tag == "h1":
            self.h1_count += 1


def test_pattern_analysis_route_opens_material_understanding() -> None:
    response = TestClient(app).get("/pattern-analysis?project=test-project")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Вот что YarnAI понял" in response.text
    assert "Проверь описание" in response.text


def test_pattern_analysis_assets_are_local_and_available() -> None:
    html = (STATIC / "pattern-analysis.html").read_text(encoding="utf-8")
    parser = _PatternAnalysisParser()
    parser.feed(html)
    client = TestClient(app)

    assert parser.h1_count == 1
    assert len(parser.ids) == len(set(parser.ids))
    assert "/static/pattern-analysis.css" in parser.assets
    assert "/static/material-understanding-experience.js" in parser.assets
    assert "/static/material-understanding-experience-assistant.js" in parser.assets
    for asset in parser.assets:
        assert asset.startswith("/static/")
        assert client.get(asset).status_code == 200, asset


def test_understanding_page_has_all_human_states() -> None:
    html = (STATIC / "pattern-analysis.html").read_text(encoding="utf-8")
    parser = _PatternAnalysisParser()
    parser.feed(html)

    assert {
        "understanding-missing-project",
        "understanding-error",
        "understanding-loading",
        "understanding-content",
        "understanding-summary-title",
        "understanding-question-card",
        "understanding-correction-form",
        "understanding-continue",
    } <= set(parser.ids)
    for copy in (
        "Что это за вещь?",
        "Что уже понятно",
        "Нужно уточнить",
        "Чего пока не хватает",
        "Уточним один момент",
        "Использованные материалы",
    ):
        assert copy in html


def test_stage56_adapts_existing_deterministic_analysis() -> None:
    controller = (STATIC / "material-understanding-experience-assistant.js").read_text(encoding="utf-8")
    model = (STATIC / "material-understanding-experience.js").read_text(encoding="utf-8")
    combined = f"{model}\n{controller}"

    assert "YarnAIPatternContentExtraction" in controller
    assert "YarnAIPatternSemanticAnalysis" in controller
    assert "YarnAIPatternAnalysisReview" in controller
    assert "ProjectRepository" in controller
    assert "textContent" in controller
    for forbidden in ("innerHTML", "alert(", "confirm(", "Math.random", "Date.now", "new Date", "stage57", "Stage 57"):
        assert forbidden not in combined


def test_stage56_does_not_modify_storage_schema_or_create_parallel_route() -> None:
    model = (STATIC / "material-understanding-experience.js").read_text(encoding="utf-8")
    controller = (STATIC / "material-understanding-experience-assistant.js").read_text(encoding="utf-8")
    combined = f"{model}\n{controller}"

    assert "createObjectStore" not in combined
    assert "DB_VERSION" not in combined
    assert "indexedDB" not in controller
    assert "/pattern-analysis?project=" not in controller
    assert "/pattern-analysis-review?project=" in model
    assert "/pattern-technology-draft?project=" in model
