from __future__ import annotations

import json
import shutil
import subprocess
from html.parser import HTMLParser
from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai.http as http_api


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class _StepAssistantParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: dict[str, dict[str, str | None]] = {}
        self.scripts: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if element_id := attributes.get("id"):
            self.ids[element_id] = attributes
        if tag == "script" and attributes.get("src"):
            self.scripts.append(attributes["src"])


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


def test_step_assistant_route_assets_and_required_controls(
    client: TestClient,
) -> None:
    response = client.get("/step-assistant")
    parser = _StepAssistantParser()
    parser.feed(response.text)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Step Assistant" in response.text
    assert parser.scripts == [
        "/static/smart-start-state.js",
        "/static/step-assistant-state.js",
        "/static/tester-mode.js",
        "/static/project-system.js",
        "/static/first-knitting-step.js",
        "/static/step-assistant.js",
    ]
    for asset in parser.scripts:
        assert client.get(asset).status_code == 200

    assert {
        "step-assistant-empty",
        "step-assistant-workflow",
        "active-row-panel",
        "row-number",
        "row-type",
        "stitch-target",
        "stitch-completed",
        "stitch-remaining",
        "stitch-progress-text",
        "stitch-progress",
        "next-stitch-button",
        "back-stitch-button",
        "row-completion-panel",
        "row-completion-title",
        "completion-back-button",
        "next-row-button",
    } <= parser.ids.keys()
    assert parser.ids["active-row-panel"]["aria-live"] == "polite"
    assert parser.ids["row-completion-panel"]["aria-live"] == "polite"
    assert "hidden" in parser.ids["row-completion-panel"]
    assert "Следующая петля" in response.text
    assert "Ряд завершён." in response.text
    assert "Следующий ряд" in response.text
    assert 'name="viewport"' in response.text


def test_step_assistant_supports_project_mode_and_keeps_standalone_guard(
) -> None:
    smart_html = (STATIC / "smart-start.html").read_text(encoding="utf-8")
    script = (STATIC / "step-assistant.js").read_text(encoding="utf-8")

    assert 'id="step-assistant-link"' in smart_html
    assert 'href="/step-assistant"' in smart_html
    assert "smartStartProgress.completed" in script
    assert "calculationState.readCurrentCalculation(storage)" in script
    assert 'new URLSearchParams(window.location.search).get("project")' in script
    assert "firstKnittingStep.loadForProject" in script
    assert "showEmptyState()" in script


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is unavailable")
def test_step_assistant_progress_persistence_isolation_and_corruption() -> None:
    state_path = STATIC / "step-assistant-state.js"
    node_script = r"""
const state = require(process.argv[1]);
const values = new Map();
const storage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const count = 3;
let progress = state.readProgress(storage, "fingerprint-a", count);
state.advanceStitch(progress, count);
state.advanceStitch(progress, count);
state.saveProgress(storage, progress, count);
const restoredStitch =
  state.readProgress(storage, "fingerprint-a", count).currentStitch;
state.goBackStitch(progress, count);
const afterBack = progress.currentStitch;
state.advanceStitch(progress, count);
state.advanceStitch(progress, count);
const firstRowComplete = progress.completedRows;
state.saveProgress(storage, progress, count);
state.advanceRow(progress, count);
state.saveProgress(storage, progress, count);
const secondRow = {
  currentRow: progress.currentRow,
  currentStitch: progress.currentStitch,
  completedRows: progress.completedRows,
};
const otherCalculation =
  state.readProgress(storage, "fingerprint-b", count);

storage.setItem(
  `${state.PROGRESS_STORAGE_PREFIX}fingerprint-a`,
  "{broken",
);
const broken = state.readProgress(storage, "fingerprint-a", count);
storage.setItem(
  `${state.PROGRESS_STORAGE_PREFIX}fingerprint-a`,
  JSON.stringify({
    version: 1,
    fingerprint: "fingerprint-a",
    currentRow: 2,
    currentStitch: 4,
    completedRows: [1],
    lastUpdated: "invalid-but-present",
  }),
);
const invalidCount = state.readProgress(storage, "fingerprint-a", count);
storage.setItem(
  `${state.PROGRESS_STORAGE_PREFIX}fingerprint-a`,
  JSON.stringify({
    version: 1,
    fingerprint: "fingerprint-a",
    currentRow: 1,
    currentStitch: 0,
    completedRows: [],
    lastUpdated: "not-a-timestamp",
  }),
);
const invalidTimestamp = state.readProgress(
  storage,
  "fingerprint-a",
  count,
);

console.log(JSON.stringify({
  restoredStitch,
  afterBack,
  firstRowComplete,
  secondRow,
  otherCalculation: {
    currentRow: otherCalculation.currentRow,
    currentStitch: otherCalculation.currentStitch,
    completedRows: otherCalculation.completedRows,
  },
  broken: {
    currentRow: broken.currentRow,
    currentStitch: broken.currentStitch,
    completedRows: broken.completedRows,
  },
  invalidCount: {
    currentRow: invalidCount.currentRow,
    currentStitch: invalidCount.currentStitch,
    completedRows: invalidCount.completedRows,
  },
  invalidTimestamp: {
    currentRow: invalidTimestamp.currentRow,
    currentStitch: invalidTimestamp.currentStitch,
    completedRows: invalidTimestamp.completedRows,
  },
  hasTimestamp: typeof progress.lastUpdated === "string",
}));
"""
    completed = subprocess.run(
        ["node", "-e", node_script, str(state_path)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert json.loads(completed.stdout) == {
        "restoredStitch": 2,
        "afterBack": 1,
        "firstRowComplete": [1],
        "secondRow": {
            "currentRow": 2,
            "currentStitch": 0,
            "completedRows": [1],
        },
        "otherCalculation": {
            "currentRow": 1,
            "currentStitch": 0,
            "completedRows": [],
        },
        "broken": {
            "currentRow": 1,
            "currentStitch": 0,
            "completedRows": [],
        },
        "invalidCount": {
            "currentRow": 1,
            "currentStitch": 0,
            "completedRows": [],
        },
        "invalidTimestamp": {
            "currentRow": 1,
            "currentStitch": 0,
            "completedRows": [],
        },
        "hasTimestamp": True,
    }


def test_step_assistant_mobile_guards_and_health_are_unchanged(
    client: TestClient,
) -> None:
    stylesheet = (STATIC / "styles.css").read_text(encoding="utf-8")
    script = (STATIC / "step-assistant.js").read_text(encoding="utf-8")

    assert "@media (max-width: 560px)" in stylesheet
    assert ".assistant-counts" in stylesheet
    assert "grid-template-columns: 1fr" in stylesheet
    assert "overflow-wrap: anywhere" in stylesheet
    assert "calculation.workingCount" in script
    assert client.get("/health").json() == {"status": "ok"}
