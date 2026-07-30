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
        self.stylesheets: list[str] = []
        self.scripts: list[str] = []

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
        if tag == "link" and attributes.get("rel") == "stylesheet":
            href = attributes.get("href")
            if href:
                self.stylesheets.append(href)
        if tag == "script":
            src = attributes.get("src")
            if src:
                self.scripts.append(src)


def _page_structure(html: str) -> _PageStructureParser:
    parser = _PageStructureParser()
    parser.feed(html)
    return parser


def test_root_returns_html_page_with_calculation_form(
    client: TestClient,
) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    page = _page_structure(response.text)
    assert page.forms == 1
    assert page.calculate_buttons == 1
    assert "YarnAI" in response.text
    assert "Рассчитать" in response.text


def test_page_static_css_and_javascript_are_available(
    client: TestClient,
) -> None:
    page_response = client.get("/")
    page = _page_structure(page_response.text)

    assert page.stylesheets == ["/static/styles.css"]
    assert page.scripts == ["/static/app.js"]

    stylesheet_response = client.get(page.stylesheets[0])
    script_response = client.get(page.scripts[0])

    assert stylesheet_response.status_code == 200
    assert stylesheet_response.headers["content-type"].startswith("text/css")
    assert script_response.status_code == 200
    assert "javascript" in script_response.headers["content-type"]


def test_javascript_calls_http_api_and_reads_complete_result_path() -> None:
    script = (STATIC / "app.js").read_text(encoding="utf-8")

    assert 'const API_PATH = "/api/v1/calculate"' in script
    assert "fetch(API_PATH" in script
    assert "data.axes.width.selected_candidate.working_count" in script


def test_ui_does_not_call_calculation_core_directly() -> None:
    script = (STATIC / "app.js").read_text(encoding="utf-8")

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


def test_page_has_mobile_viewport_and_no_images() -> None:
    html = (STATIC / "index.html").read_text(encoding="utf-8")

    assert 'name="viewport"' in html
    assert "width=device-width" in html
    assert "<img" not in html.lower()


def test_health_contract_remains_unchanged_with_ui_routes(
    client: TestClient,
) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"status": "ok"}
