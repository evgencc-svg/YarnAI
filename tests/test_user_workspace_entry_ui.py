from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


ROOT = Path(__file__).parents[1]
STATIC = ROOT / "src" / "yarnai" / "static"


class WorkspaceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.inline_handlers: list[str] = []
        self.labels: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"] or "")
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")
        if tag == "label" and values.get("for"):
            self.labels.append(values["for"] or "")
        self.inline_handlers.extend(name for name in values if name.startswith("on"))


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def parse() -> WorkspaceParser:
    parser = WorkspaceParser()
    parser.feed(read("first-user-flow.html"))
    return parser


def test_stage_53_route_returns_the_established_user_home() -> None:
    client = TestClient(app)
    response = client.get("/user-workspace-entry")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Что ты хочешь связать?" in response.text
    assert client.get("/").status_code == 200
    assert client.get("/calculator").status_code == 200
    assert client.get("/import-pattern").status_code == 200


def test_saved_projects_and_direct_workspace_routes_share_the_real_dom() -> None:
    project_id = "019fc3ba-4100-71c3-b7f9-bd06e3bff304"
    client = TestClient(app)

    saved = client.get("/saved-projects")
    direct = client.get(f"/user-workspace-entry?project={project_id}")

    assert saved.status_code == 200
    assert direct.status_code == 200
    assert saved.text == direct.text
    assert 'id="saved-projects-list"' in saved.text
    assert 'id="project-workspace"' in direct.text
    route_paths = {getattr(route, "path", "") for route in app.routes}
    assert {"/saved-projects", "/user-workspace-entry"} <= route_paths


def test_workspace_contains_required_sections_and_accessible_controls() -> None:
    html = read("first-user-flow.html")
    parser = parse()
    required = {
        "workspace-title",
        "latest-project",
        "latest-project-empty",
        "new-project",
        "new-project-form",
        "new-project-title",
        "workspace-status",
        "saved-projects",
        "saved-projects-empty",
        "saved-projects-list",
    }
    assert required <= set(parser.ids)
    assert len(parser.ids) == len(set(parser.ids))
    assert parser.inline_handlers == []
    assert "new-project-title" in parser.labels
    assert 'aria-live="polite"' in html
    assert 'aria-live="assertive"' in html
    assert "Здесь появятся твои проекты" in html
    assert "У меня есть готовая схема или PDF" in html
    assert "Связать похожую вещь по фото" in html


def test_workspace_assets_are_connected_in_dependency_order() -> None:
    parser = parse()
    project_system = parser.scripts.index("/static/project-system.js")
    domain = parser.scripts.index("/static/user-workspace-entry.js?v=20260830-stage22-stale-route-v6")
    controller = parser.scripts.index("/static/user-workspace-entry-assistant.js")
    assert project_system < domain < controller
    assert parser.styles == [
        "/static/first-user-flow.css",
        "/static/user-workspace-entry.css",
        "/static/project-details-experience.css",
        "/static/project-details-collaboration.css",
        "/static/project-details-closure.css",
        "/static/project-initialization.css",
    ]
    for asset in [*parser.scripts, *parser.styles]:
        assert (STATIC / asset.split("?", 1)[0].removeprefix("/static/")).is_file()


def test_workspace_controller_reuses_project_repository_without_parallel_storage() -> None:
    controller = read("user-workspace-entry-assistant.js")
    for token in (
        "new projectSystem.ProjectRepository()",
        'listProjects({ section: "active" })',
        "repository.getProject",
        "repository.createProject({",
        "workflow_intent: { version: 1, kind: intent }",
        "workspace.buildWorkspaceViewModel",
        'destination.searchParams.set("project", project.project_id)',
    ):
        assert token in controller
    for forbidden in ("localStorage", "sessionStorage", "createObjectStore", "DB_VERSION"):
        assert forbidden not in controller


def test_workspace_copy_is_user_facing_and_has_no_future_stage() -> None:
    production = "\n".join(
        read(name)
        for name in (
            "first-user-flow.html",
            "user-workspace-entry.js",
            "user-workspace-entry-assistant.js",
        )
    )
    for forbidden in (
        "Stage 45",
        "Stage 46",
        "Stage 47",
        "Stage 48",
        "Stage 49",
        "Stage 50",
        "Stage 51",
        "Stage 52",
        "Stage 54",
        "stage54",
    ):
        assert forbidden not in production
    assert "Не удалось открыть сохранённые проекты" in production
    assert "stack" not in read("user-workspace-entry-assistant.js").lower()


def test_stage_53_package_contract_and_safe_static_code() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert package["scripts"]["test:stage53"] == "node --test tests-js/user-workspace-entry.test.cjs"
    assert package["scripts"]["test:stage62"] == "node --test tests-js/user-workspace-entry.test.cjs"
    assert package["scripts"]["test"].count("tests-js/user-workspace-entry.test.cjs") == 1
    production = read("user-workspace-entry.js") + read("user-workspace-entry-assistant.js")
    for forbidden in (
        "Math.random",
        "Date.now",
        "new Date",
        "crypto.randomUUID",
        "console.log",
        "createObjectStore",
    ):
        assert forbidden not in production
    assert "\r\r\n" not in production


def test_stage_53_does_not_change_indexeddb_schema() -> None:
    project_system = read("project-system.js")
    assert "const DB_VERSION = 4;" in project_system
    assert project_system.count("createObjectStore(") == 1


def test_stage_62_project_workspace_has_real_user_sections() -> None:
    html = read("first-user-flow.html")
    parser = parse()
    required = {
        "project-workspace",
        "project-workspace-loading",
        "project-workspace-missing",
        "project-workspace-blocked",
        "project-workspace-ready",
        "project-workspace-title",
        "workspace-next-step",
        "workspace-primary-action",
        "workspace-product-image",
        "workspace-materials",
        "workspace-materials-list",
        "workspace-material-input",
        "workspace-description",
        "workspace-material-status",
        "workspace-confirmed-facts",
        "workspace-assumptions",
        "workspace-warnings",
    }
    assert required <= set(parser.ids)
    assert "workspace-material-input" in parser.labels
    assert "workspace-description" in parser.labels
    assert '<main class="flow-shell">' in html
    assert '<button id="workspace-primary-action"' in html
    assert 'aria-live="polite"' in html
    assert "Материалы проекта" in html
    assert "Подтверждённые сведения" in html
    assert "Что будем делать дальше" in html


def test_stage_62_assets_and_script_order_are_safe() -> None:
    parser = parse()
    assert "/static/user-workspace-entry.css" in parser.styles
    assert parser.scripts.index("/static/project-system.js") < parser.scripts.index("/static/project-initialization.js")
    assert parser.scripts.index("/static/project-initialization.js") < parser.scripts.index("/static/user-workspace-entry.js?v=20260830-stage22-stale-route-v6")
    assert parser.scripts.index("/static/user-workspace-entry.js?v=20260830-stage22-stale-route-v6") < parser.scripts.index("/static/user-workspace-entry-assistant.js")
    for asset in [*parser.scripts, *parser.styles]:
        assert (STATIC / asset.split("?", 1)[0].removeprefix("/static/")).is_file()


def test_stage_62_accessibility_and_responsive_contracts() -> None:
    html = read("first-user-flow.html")
    css = read("user-workspace-entry.css")
    controller = read("user-workspace-entry-assistant.js")
    assert parse().inline_handlers == []
    assert ':focus-visible' in css
    assert "outline: 3px" in css
    assert "@media (max-width: 760px)" in css
    assert "@media (max-width: 360px)" in css
    assert "minmax(0, 1fr)" in css
    assert "overflow-wrap: anywhere" in css
    assert "width: 1200px" not in css
    assert 'aria-describedby="workspace-material-help"' in html
    assert "ui.materialStatus.focus()" in controller
    assert "ui.primaryAction.disabled" in controller
    assert "body.is-project-swatch #result-screen > .result-card > :not(#swatch-assistant)" in css
    assert "body.is-project-swatch #result-screen > :not(#swatch-assistant)" not in css
    assert 'globalObject.location.hash !== "#project-details"' in controller
    assert 'globalObject.location.hash === "#swatch-assistant"' in controller
    assert 'workspace.projectRoute("/project-calculation-entry", projectId)' in controller


def test_stage_62_reuses_repository_and_existing_blob_stores() -> None:
    domain = read("user-workspace-entry.js")
    controller = read("user-workspace-entry-assistant.js")
    system = read("project-system.js")
    app_script = read("app.js")
    for token in (
        "new system.ProjectRepository()",
        "repository.getProject(projectId)",
        "repository.listPatternFiles(projectId)",
        "repository.addPhoto(projectId",
        "repository.savePatternFile(projectId",
        "repository.getPhoto(projectId",
        "repository.getPatternFile(projectId",
        "initializationApi.assessInitialization",
        "initializationApi.latestInitialization",
        "previews.revokeAll()",
    ):
        assert token in controller
    for forbidden in ("localStorage", "sessionStorage", "createObjectStore", "DB_VERSION"):
        assert forbidden not in domain + controller
    assert "const DB_VERSION = 4;" in system
    assert system.count("createObjectStore(") == 1
    assert '"photos"' in system
    assert '"photo_blobs"' in system
    assert '"pattern_files"' in system
    assert '"pattern_file_blobs"' in system
    assert "mergeProjectDraft(captureProjectFormState())" in app_script
    assert "return { ...existing, ...formState };" in app_script
    assert "next.draft_input = { ...previousDraft, ...clone(requestPayload) };" in system
    assert "DB_VERSION = 5" not in system


def test_stage_62_copy_has_no_internal_primary_heading_or_future_stage() -> None:
    production = "\n".join(
        read(name)
        for name in (
            "first-user-flow.html",
            "user-workspace-entry.js",
            "user-workspace-entry-assistant.js",
            "user-workspace-entry.css",
        )
    )
    assert "Initialization entity ready" not in production
    assert "Closure fingerprint mismatch" not in production
    assert "Aggregate lifecycle invalid" not in production
    assert "Stage 63" not in production
    assert "/stage-63" not in production
    assert "Этот формат пока не поддерживается" in production
    assert "Проект не найден" in production
    assert "Сведения изменились — проверьте их ещё раз" in production
