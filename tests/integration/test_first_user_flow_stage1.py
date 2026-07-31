from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai.http as http_api


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


class _FlowParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.headings: list[str] = []
        self.buttons: dict[str, str] = {}
        self.inputs: dict[str, dict[str, str | None]] = {}
        self.scripts: list[str] = []
        self.stylesheets: list[str] = []
        self._heading_depth = 0
        self._button_id: str | None = None
        self._text: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if tag in {"h1", "h2"}:
            self._heading_depth += 1
            self._text = []
        if tag == "button" and attributes.get("id"):
            self._button_id = attributes["id"]
            self._text = []
        if tag == "input" and attributes.get("id"):
            self.inputs[attributes["id"]] = attributes
        if tag == "script" and attributes.get("src"):
            self.scripts.append(attributes["src"] or "")
        if (
            tag == "link"
            and attributes.get("rel") == "stylesheet"
            and attributes.get("href")
        ):
            self.stylesheets.append(attributes["href"] or "")

    def handle_data(self, data: str) -> None:
        if self._heading_depth or self._button_id:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"h1", "h2"} and self._heading_depth:
            self.headings.append(" ".join("".join(self._text).split()))
            self._heading_depth -= 1
            self._text = []
        if tag == "button" and self._button_id:
            self.buttons[self._button_id] = " ".join("".join(self._text).split())
            self._button_id = None
            self._text = []


def parse_flow(html: str) -> _FlowParser:
    parser = _FlowParser()
    parser.feed(html)
    return parser


def test_root_leads_with_three_intention_actions(client: TestClient) -> None:
    response = client.get("/")
    page = parse_flow(response.text)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Что ты хочешь связать?" in page.headings
    assert "📷 Показать фотографию изделия." in page.buttons["choose-photo"]
    assert "📄 Загрузить схему или описание." in page.buttons["choose-pattern"]
    assert "💬 Просто рассказать словами." in page.buttons["choose-text"]
    assert "Желаемая ширина" not in response.text
    assert "Плотность" not in response.text
    assert "Создать аккаунт" not in response.text


def test_flow_accepts_photo_pdf_image_and_text(client: TestClient) -> None:
    response = client.get("/")
    page = parse_flow(response.text)

    assert page.inputs["photo-input"]["accept"] == "image/*"
    pattern_accept = page.inputs["pattern-input"]["accept"] or ""
    assert "application/pdf" in pattern_accept
    assert "image/*" in pattern_accept
    assert 'id="message-input"' in response.text
    assert 'id="conversation-history"' in response.text
    assert 'id="known-facts"' in response.text


def test_flow_assets_are_packaged_and_use_no_external_dependencies(
    client: TestClient,
) -> None:
    response = client.get("/")
    page = parse_flow(response.text)

    assert page.stylesheets == ["/static/first-user-flow.css"]
    assert page.scripts == [
        "/static/intent-engine.js",
        "/static/project-readiness-engine.js",
        "/static/swatch-assistant.js",
        "/static/project-system.js",
        "/static/calculated-project.js",
        "/static/first-knitting-step.js",
        "/static/first-fabric-section.js",
        "/static/first-simple-shaping.js",
        "/static/first-bind-off.js",
        "/static/second-identical-piece.js",
        "/static/first-assembly-preparation.js",
        "/static/first-assembly-join.js",
        "/static/first-user-flow.js",
    ]
    for asset in [*page.stylesheets, *page.scripts]:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200
    combined = "\n".join(
        (
            (STATIC / "first-user-flow.html").read_text(encoding="utf-8"),
            (STATIC / "first-user-flow.css").read_text(encoding="utf-8"),
            (STATIC / "intent-engine.js").read_text(encoding="utf-8"),
            (STATIC / "project-readiness-engine.js").read_text(encoding="utf-8"),
            (STATIC / "first-user-flow.js").read_text(encoding="utf-8"),
        )
    ).lower()
    assert "https://" not in combined
    assert "http://" not in combined
    assert "//cdn." not in combined


def test_flow_declares_prototype_limits_and_correction_path() -> None:
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    ui_script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")
    engine_script = (STATIC / "intent-engine.js").read_text(encoding="utf-8")

    assert "не распознаются автоматически" in " ".join(html.split())
    assert "Нет, это не реглан" in html
    assert "Я получил фотографию" in engine_script
    assert "class RuleBasedProvider" in engine_script
    assert "class IntentProvider" in engine_script
    assert "class ProjectUnderstandingEngine" in engine_script
    assert "localStorage" in ui_script
    assert "OpenAI" not in engine_script
    assert "Vision" not in engine_script


def test_result_screen_is_human_readable_and_supports_corrections() -> None:
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")

    assert 'id="result-screen"' in html
    assert 'id="result-known"' in html
    assert 'id="result-assumptions"' in html
    assert 'id="result-missing"' in html
    assert 'id="result-optional"' in html
    assert 'id="result-blockers"' in html
    assert 'id="calculation-plan"' in html
    assert 'id="open-calculator-link"' in html
    assert 'id="continue-dialog-button"' in html
    assert 'id="summary-correction-form"' in html
    assert "Ты хочешь связать:" in html
    assert "Пока неизвестно:" in html
    assert ">Продолжить<" in "".join(html.split())


def test_intent_decisions_live_outside_the_ui_layer() -> None:
    ui_script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")
    engine_script = (STATIC / "intent-engine.js").read_text(encoding="utf-8")
    readiness_script = (
        STATIC / "project-readiness-engine.js"
    ).read_text(encoding="utf-8")

    assert "collectMissingInformation" in engine_script
    assert "selectNextQuestion" in engine_script
    assert "buildSummary" in engine_script
    assert "ProjectIntent" in engine_script
    assert "collectMissingInformation" not in ui_script
    assert "selectNextQuestion" not in ui_script
    assert "class ProjectReadinessEngine" in readiness_script
    assert 'status = "ready_for_calculation"' in readiness_script
    assert "buildCalculationInput" in readiness_script
    assert "buildCalculationInput" not in ui_script


def test_root_security_policy_allows_local_file_previews(
    client: TestClient,
) -> None:
    response = client.get("/")

    policy = response.headers["content-security-policy"]
    assert "img-src 'self' data: blob:" in policy
    assert "connect-src 'self'" in policy
    assert response.headers["cache-control"] == "no-cache"


def test_existing_calculator_remains_available(client: TestClient) -> None:
    calculator = client.get("/calculator")
    example = client.get("/example")

    assert calculator.status_code == 200
    assert "Сколько петель набрать?" in calculator.text
    assert example.status_code == 200
    assert "Заполнить пример" in example.text
