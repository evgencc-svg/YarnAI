from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


class VisualParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.h1_count = 0
        self.tags: list[str] = []
        self.scripts: list[str] = []
        self.inline_handlers: list[str] = []
        self.labels: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        self.tags.append(tag)
        if values.get("id"):
            self.ids.append(values["id"] or "")
        if tag == "h1":
            self.h1_count += 1
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "label" and values.get("for"):
            self.labels.append(values["for"] or "")
        self.inline_handlers.extend(name for name in values if name.startswith("on"))


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def parse() -> VisualParser:
    parser = VisualParser()
    parser.feed(read("first-user-flow.html"))
    return parser


def test_workspace_routes_share_the_same_product_screen() -> None:
    client = TestClient(app)
    root = client.get("/")
    workspace = client.get("/user-workspace-entry")
    assert root.status_code == workspace.status_code == 200
    for response in (root, workspace):
        assert "Что ты хочешь связать?" in response.text
        assert "У меня есть готовая схема или PDF" in response.text
        assert "Связать похожую вещь по фото" in response.text
        assert "Продолжить работу" in response.text
        assert "Мои проекты" in response.text


def test_workspace_has_one_h1_landmarks_and_accessible_project_dialog() -> None:
    html = read("first-user-flow.html")
    parser = parse()
    assert parser.h1_count == 1
    assert {"header", "nav", "main", "section", "footer", "dialog"} <= set(parser.tags)
    assert len(parser.ids) == len(set(parser.ids))
    assert parser.inline_handlers == []
    assert "new-project-title" in parser.labels
    for element_id in (
        "workspace-start",
        "latest-project",
        "latest-project-empty",
        "saved-projects",
        "saved-projects-empty",
        "saved-projects-list",
        "new-project-form-panel",
        "new-project-submit",
        "new-project-cancel",
        "workspace-status",
    ):
        assert element_id in parser.ids
    assert 'aria-labelledby="create-project-title"' in html
    assert 'aria-live="assertive"' in html


def test_home_copy_is_product_facing_without_internal_workflow_terms() -> None:
    html = read("first-user-flow.html")
    assert "Загрузи фото, схему, PDF или описание" in html
    assert "Здесь появятся твои проекты" in html
    assert "Создать собственный дизайн" in html
    for forbidden in (
        "Продолжить существующий проект",
        "Stage 45",
        "Stage 46",
        "Stage 47",
        "Stage 48",
        "Stage 49",
        "Stage 50",
        "Stage 51",
        "Stage 52",
        "Stage 55",
        "imported-unproven",
        "quarantine",
        "collision",
        "UUID",
    ):
        assert forbidden not in html


def test_assets_are_local_and_loaded_in_controller_order() -> None:
    parser = parse()
    project_system = parser.scripts.index("/static/project-system.js")
    presentation = parser.scripts.index("/static/user-workspace-entry.js?v=20260830-stage22-stale-route-v6")
    legacy_controller = parser.scripts.index("/static/first-user-flow.js")
    workspace_controller = parser.scripts.index("/static/user-workspace-entry-assistant.js")
    assert project_system < presentation < legacy_controller < workspace_controller
    html = read("first-user-flow.html")
    assert '<link rel="stylesheet" href="/static/first-user-flow.css">' in html
    assert "https://" not in html
    assert "http://" not in html


def test_workspace_css_is_responsive_and_uses_the_shared_palette() -> None:
    css = read("first-user-flow.css")
    assert "min-width: 320px" not in css
    assert "box-sizing: border-box" in css
    assert ":focus-visible" in css
    assert "prefers-reduced-motion" in css
    assert css.count("@media (max-width:") >= 2
    for variable in (
        "--workspace-bg",
        "--workspace-surface",
        "--workspace-text",
        "--workspace-border",
        "--workspace-accent",
        "--workspace-shadow",
        "--workspace-radius",
    ):
        assert variable in css
    assert "@import" not in css
    assert "url(http" not in css
    assert css.count("!important") == 2
    assert "overflow-wrap: anywhere" in css
    assert ".new-project-dialog::backdrop" in css
