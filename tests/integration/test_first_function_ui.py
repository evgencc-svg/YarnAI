from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import pytest
from starlette.testclient import TestClient

import yarnai.http as http_api


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


class _PageStructureParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.forms = 0
        self.calculate_buttons = 0
        self.action_buttons: set[str] = set()
        self.stylesheets: list[str] = []
        self.scripts: list[str] = []
        self.icons: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if tag == "form":
            self.forms += 1
        if (
            tag == "button"
            and attributes.get("id") == "calculate-button"
            and attributes.get("type") == "submit"
        ):
            self.calculate_buttons += 1
        if tag == "button" and attributes.get("id"):
            self.action_buttons.add(attributes["id"])
        if tag == "link" and attributes.get("rel") == "stylesheet":
            href = attributes.get("href")
            if href:
                self.stylesheets.append(href)
        if tag == "link" and attributes.get("rel") == "icon":
            href = attributes.get("href")
            if href:
                self.icons.append(href)
        if tag == "script":
            src = attributes.get("src")
            if src:
                self.scripts.append(src)


def _page_structure(html: str) -> _PageStructureParser:
    parser = _PageStructureParser()
    parser.feed(html)
    return parser


def test_calculator_returns_html_page_with_calculation_form(
    client: TestClient,
) -> None:
    response = client.get("/calculator")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    page = _page_structure(response.text)
    assert page.forms == 3
    assert page.calculate_buttons == 1
    assert "YarnAI" in response.text
    assert "Рассчитать" in response.text
    assert {
        "fill-example-button",
        "clear-form-button",
        "share-button",
    } <= page.action_buttons


def test_page_static_css_and_javascript_are_available(
    client: TestClient,
) -> None:
    page_response = client.get("/calculator")
    page = _page_structure(page_response.text)

    assert page.stylesheets == ["/static/styles.css"]
    assert page.scripts == [
        "/static/smart-start-state.js",
        "/static/step-assistant-state.js",
        "/static/tester-mode.js",
        "/static/project-system.js",
        "/static/cloud-accounts.js",
        "/static/sync-service.js",
        "/static/calculator-result.js",
        "/static/app.js",
    ]
    assert page.icons == ["/static/favicon.png"]

    stylesheet_response = client.get(page.stylesheets[0])
    script_response = client.get(page.scripts[0])

    assert stylesheet_response.status_code == 200
    assert stylesheet_response.headers["content-type"].startswith("text/css")
    assert script_response.status_code == 200
    assert "javascript" in script_response.headers["content-type"]
    assert client.get(page.icons[0]).status_code == 200


def test_javascript_calls_http_api_and_reads_complete_result_path() -> None:
    script = (STATIC / "app.js").read_text(encoding="utf-8")
    integration_script = (STATIC / "calculator-result.js").read_text(
        encoding="utf-8"
    )

    assert 'const API_PATH = "/api/v1/calculate"' in script
    assert "fetch(API_PATH" in script
    assert "selected_candidate" in integration_script
    assert "actual_size_original_unit" in integration_script


def test_ui_does_not_call_calculation_core_directly() -> None:
    script = "\n".join(
        (
            (STATIC / "app.js").read_text(encoding="utf-8"),
            (STATIC / "calculator-result.js").read_text(encoding="utf-8"),
        )
    )

    assert "yarnai_calculation" not in script
    assert "run_first_function" not in script
    assert "first_function_request_from_mapping" not in script
    assert "WebAssembly" not in script


def test_ui_has_no_external_cdn_or_javascript_dependencies() -> None:
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    stylesheet = (STATIC / "styles.css").read_text(encoding="utf-8")
    script = (STATIC / "app.js").read_text(encoding="utf-8")
    page = _page_structure(html)

    for asset_url in [*page.stylesheets, *page.scripts]:
        assert urlparse(asset_url).scheme == ""
        assert asset_url.startswith("/static/")

    combined = "\n".join((html, stylesheet, script)).lower()
    assert "http://" not in combined
    assert "https://" not in combined
    assert "//cdn." not in combined
    assert "import " not in script
    assert "require(" not in script


def test_page_has_mobile_viewport_and_brand_image() -> None:
    html = (STATIC / "index.html").read_text(encoding="utf-8")

    assert 'name="viewport"' in html
    assert "width=device-width" in html
    assert '<img class="brand-mark"' in html


def test_demo_pages_and_canonical_example_are_available(
    client: TestClient,
) -> None:
    about = client.get("/about")
    example = client.get("/example")
    canonical = client.get("/static/canonical-example.json")

    assert about.status_code == 200
    assert "Что рассчитывается" in about.text
    assert "Какие данные необходимы" in about.text
    assert "Что означает результат" in about.text
    assert example.status_code == 200
    assert "Заполнить пример" in example.text
    assert canonical.status_code == 200
    assert canonical.headers["content-type"].startswith("application/json")


def test_packaged_example_matches_repository_canonical_example() -> None:
    packaged = (STATIC / "canonical-example.json").read_text(encoding="utf-8")
    canonical = (
        ROOT / "examples" / "first_function_width.json"
    ).read_text(encoding="utf-8")

    assert packaged == canonical


def test_javascript_supports_example_clear_and_query_sharing() -> None:
    script = (STATIC / "app.js").read_text(encoding="utf-8")

    assert (
        'const CANONICAL_EXAMPLE_PATH = "/static/canonical-example.json"'
        in script
    )
    assert "fillCanonicalExample" in script
    assert "clearForm" in script
    assert "new URLSearchParams(window.location.search)" in script
    assert "window.history.replaceState" in script
    assert "navigator.clipboard" in script
    assert 'window.addEventListener("beforeprint", preparePrintView)' in script
    assert 'window.addEventListener("afterprint", restoreDetailsAfterPrint)' in script


def test_calculator_result_has_complete_states_and_details() -> None:
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    script = (STATIC / "app.js").read_text(encoding="utf-8")
    integration_script = (STATIC / "calculator-result.js").read_text(
        encoding="utf-8"
    )

    for element_id in (
        "loading-panel",
        "result-panel",
        "working-count",
        "working-width",
        "result-gauge",
        "result-swatch",
        "warnings-panel",
        "error-panel",
        "previous-stage-link",
    ):
        assert f'id="{element_id}"' in html
    assert "Не хватает данных для расчёта" in script
    assert "Ссылка на расчёт повреждена" in script
    assert "Расчёт не запускался" in script
    assert "calculatorResult?.readTransfer" in script
    assert "calculatorResult?.resultDetails" in script
    assert "REQUIRED_PARAMETERS" in integration_script
    assert "URLSearchParams" in integration_script


def test_page_has_version_noscript_and_print_styles() -> None:
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    stylesheet = (STATIC / "styles.css").read_text(encoding="utf-8")

    assert "Демо 0.1.0" in html
    assert "<noscript>" in html
    assert "Для заполнения примера и расчёта нужен JavaScript" in html
    assert "@media print" in stylesheet


def test_health_contract_remains_unchanged_with_ui_routes(
    client: TestClient,
) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"status": "ok"}
