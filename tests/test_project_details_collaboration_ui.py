from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.ids: set[str] = set()
        self.h1_count = 0
        self.labels_for: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if tag == "h1":
            self.h1_count += 1
        if tag == "label" and values.get("for"):
            self.labels_for.add(values["for"] or "")


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def test_stage59_assets_are_wired_in_dependency_order_and_served() -> None:
    html = read("first-user-flow.html")
    parser = PageParser()
    parser.feed(html)
    assert "/static/project-details-collaboration.css" in parser.styles
    domain = parser.scripts.index("/static/project-details-collaboration.js")
    assistant = parser.scripts.index("/static/project-details-collaboration-assistant.js")
    assert parser.scripts.index("/static/project-details-experience.js") < domain < assistant
    assert parser.scripts.index("/static/project-system.js") < domain
    with TestClient(create_app()) as client:
        page = client.get("/user-workspace-entry?project=01890f42-8a7b-7c6d-8e9f-0123456789ab#project-details")
        assert page.status_code == 200
        for asset in (
            "/static/project-details-collaboration.js",
            "/static/project-details-collaboration-assistant.js",
            "/static/project-details-collaboration.css",
        ):
            assert client.get(asset).status_code == 200


def test_stage59_remains_inside_existing_page_with_one_h1_and_no_new_route() -> None:
    html = read("first-user-flow.html")
    parser = PageParser()
    parser.feed(html)
    assert parser.h1_count == 1
    assert "project-details" in parser.ids
    assert "project-details-collaboration-owner" in parser.ids
    assert "project-details-collaboration-helper" in parser.ids
    assert "#project-details-collaboration" in read("project-details-collaboration-assistant.js")
    with TestClient(create_app()) as client:
        assert client.get("/project-details-collaboration").status_code == 404
        assert client.get("/user-workspace-entry").status_code == 200


def test_owner_and_helper_controls_have_labels_groups_download_import_and_review_actions() -> None:
    html = read("first-user-flow.html")
    parser = PageParser()
    parser.feed(html)
    for control_id in (
        "project-details-collaboration-helper-label",
        "project-details-collaboration-owner-label",
        "project-details-collaboration-instruction",
        "project-details-collaboration-response-file",
        "project-details-collaboration-request-file",
    ):
        assert control_id in parser.labels_for
    for token in (
        "<fieldset",
        "<legend>Какие данные передать</legend>",
        "Общая информация о получателе",
        "Стандартный размер",
        "Посадка",
        "Мерки тела",
        "Мерки готового изделия",
        "Тип изделия",
        "известно / не хватает",
        "Скачать request JSON",
        "Скачать response JSON",
        "Принять выбранные",
        "Отклонить все",
        "Закрыть без изменений",
    ):
        assert token in html


def test_stage59_has_live_regions_and_visible_fail_closed_markers() -> None:
    html = read("first-user-flow.html")
    controller = read("project-details-collaboration-assistant.js")
    domain = read("project-details-collaboration.js")
    assert html.count('aria-live="') >= 10
    for marker in (
        "MALFORMED_REQUEST",
        "MALFORMED_RESPONSE",
        "REQUEST_PROJECT_MISMATCH",
        "SNAPSHOT_FINGERPRINT_MISMATCH",
        "UNKNOWN_EDITABLE_PATH",
        "READ_ONLY_FIELD",
        "SCOPE_EXPANSION",
        "STALE_REQUEST",
        "STALE_RESPONSE",
        "IMPORTED_UNPROVEN",
        "QUARANTINED",
        "COLLISION",
        "UNCONFIRMED_CONFLICT",
    ):
        assert marker in domain
    assert "Проект пока не изменён" in controller
    assert "не изменяется" in controller
    assert "userMessage" in controller


def test_stage59_uses_repository_without_inline_indexeddb_or_external_dependencies() -> None:
    domain = read("project-details-collaboration.js")
    controller = read("project-details-collaboration-assistant.js")
    stage58_controller = read("project-details-experience-assistant.js")
    system = read("project-system.js")
    package = (STATIC.parents[2] / "package.json").read_text(encoding="utf-8")
    for source in (domain, controller):
        assert "indexedDB.open" not in source
        assert "localStorage" not in source
        assert "sessionStorage" not in source
        assert "https://" not in source
        assert "http://" not in source
        assert "createObjectStore" not in source
        assert "DB_VERSION" not in source
    assert "new system.ProjectRepository()" in controller
    assert "saveProjectDetailsCollaborationDraft" in controller
    assert "getProjectDetailsCollaborationDraft" in controller
    assert 'const DB_VERSION = 4;' in system
    assert system.count("createObjectStore(") == 1
    assert '"test:stage59"' in package
    assert "const latestAggregate = await repository.getProject(projectId);" in stage58_controller
    assert "{ ...latestAggregate.project.draft_input }" in stage58_controller
    assert "tests-js/project-details-collaboration.test.cjs" in package


def test_stage59_css_has_responsive_overflow_and_focus_protection() -> None:
    css = read("project-details-collaboration.css")
    for token in (
        "min-width: 0",
        "max-width: 100%",
        "overflow-wrap: anywhere",
        ":focus-visible",
        "@media (max-width: 760px)",
        "@media (max-width: 390px)",
        "grid-template-columns: minmax(0, 1fr)",
    ):
        assert token in css


def test_stage59_does_not_introduce_stage60_or_cloud_collaboration() -> None:
    sources = "\n".join(
        read(name)
        for name in (
            "project-details-collaboration.js",
            "project-details-collaboration-assistant.js",
            "project-details-collaboration.css",
        )
    ).lower()
    assert "stage 60" not in sources
    assert "stage60" not in sources
    for forbidden in ("websocket", "firebase", "supabase", "sendgrid", "socket.io"):
        assert forbidden not in sources
