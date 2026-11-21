from pathlib import Path

from starlette.testclient import TestClient

import yarnai.http as http_api


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def test_stage64_route_serves_a_new_project_scoped_screen() -> None:
    with TestClient(http_api.create_app()) as client:
        response = client.get(
            "/project-calculation-entry?project=018f5f64-8b27-7a36-8c58-4f491a95cd01"
        )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert 'id="entry-form"' in response.text
    assert 'src="/static/project-calculation-entry.js"' in response.text
    assert 'src="/static/project-calculation-entry-workspace.js"' in response.text
    assert 'src="/static/project-calculation-entry-assistant.js"' in response.text
    assert 'href="/static/project-calculation-entry.css"' in response.text


def test_stage64_html_contains_required_result_warning_history_and_actions() -> None:
    html = read("project-calculation-entry.html")
    for identity in (
        "error-summary",
        "warning-section",
        "warning-acknowledgement",
        "calculation-result",
        "completed-section",
        "history-section",
        "history-list",
        "project-back",
        "confirm-entry",
    ):
        assert f'id="{identity}"' in html
    assert "Подтвердить начальный расчёт" in html
    assert "Перейти к плану работы" in html
    assert "/calculator" not in html


def test_stage64_accessibility_contract_is_present() -> None:
    html = read("project-calculation-entry.html")
    assert 'for="working-width"' in html
    assert html.count("<fieldset") >= 2
    assert html.count("<legend") >= 2
    assert 'role="alert"' in html
    assert 'aria-live="polite"' in html
    assert 'aria-describedby="working-width-help working-width-error"' in html
    assert 'inputmode="decimal"' in html
    assert 'type="button" disabled' in html
    css = read("project-calculation-entry.css")
    assert ":focus-visible" in css
    assert "@media (max-width: 620px)" in css
    assert "prefers-reduced-motion" in css


def test_stage64_domain_is_dom_independent_and_snapshot_is_allowlisted() -> None:
    script = read("project-calculation-entry.js")
    for token in (
        'FORMAT = "yarnai-project-calculation-entry"',
        "SNAPSHOT_KEYS",
        "FORBIDDEN_SNAPSHOT_KEYS",
        "selectWorkingWidth",
        "calculateRawStitches",
        "applyRoundingRule",
        "calculateFingerprint",
        "staleStatus",
        "transitionLifecycle",
        "COMPLETED_SNAPSHOT_IMMUTABLE",
    ):
        assert token in script
    for forbidden in ("document.", "indexedDB", "location.", "history.", "fetch("):
        assert forbidden not in script


def test_stage64_workspace_reuses_repository_and_guards_hydration() -> None:
    script = read("project-calculation-entry-workspace.js")
    for token in (
        "new system.ProjectRepository",
        "repository.getProject",
        "repository.updateProject",
        "repository.addCalculation",
        "stage64Calculations",
        "sourceChainFingerprint",
        "await waitForNativeRestoration(target)",
        "restoreHydratedControls",
        "hydrated = true",
        "if (!hydrated || busy) return",
        "duplicate",
        "safeDestination",
    ):
        assert token in script
    assert "localStorage" not in script
    assert "sessionStorage" not in script
    assert "fetch(" not in script


def test_stage62_and_stage63_route_to_stage64_with_project_uuid() -> None:
    stage62 = read("user-workspace-entry.js")
    stage63 = read("swatch-assistant-workspace.js")
    home = read("first-user-flow.html")
    assert 'projectRoute("/project-calculation-entry", projectId)' in stage62
    assert 'actionModel("ready", "open-calculation"' in stage62
    assert "safeCalculationHref" in stage63
    assert 'destination.pathname === "/project-calculation-entry"' in stage63
    assert 'src="/static/project-calculation-entry.js"' in home
    assert "encodeURIComponent(projectId)" in stage62
    assert "encodeURIComponent(projectId)" in stage63


def test_stage64_does_not_change_indexeddb_schema_or_start_future_stage() -> None:
    project_system = read("project-system.js")
    assert "const DB_VERSION = 4;" in project_system
    stores_block = project_system.split("const STORE_NAMES = [", 1)[1].split("];", 1)[0]
    stores = [
        line.strip().strip(chr(34) + ",")
        for line in stores_block.splitlines()
        if line.strip().startswith(chr(34))
    ]
    assert len(stores) == 16
    assert len(set(stores)) == 16
    assert "project_calculation_entry" not in stores
    changed = "\n".join(
        read(name)
        for name in (
            "project-calculation-entry.js",
            "project-calculation-entry.html",
            "project-calculation-entry-workspace.js",
            "project-calculation-entry-assistant.js",
            "swatch-assistant-workspace.js",
        )
    )
    next_stage = 65 + 1
    assert f"STAGE_{next_stage}" not in changed
    assert f"Stage {next_stage}" not in changed
    assert f"stage{next_stage}" not in changed
