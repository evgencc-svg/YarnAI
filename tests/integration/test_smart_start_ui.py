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


class _SmartStartParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: dict[str, dict[str, str | None]] = {}
        self.scripts: list[str] = []
        self.stylesheets: list[str] = []
        self.icons: list[str] = []

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
        if tag == "link" and attributes.get("rel") == "stylesheet":
            self.stylesheets.append(attributes["href"])
        if tag == "link" and attributes.get("rel") == "icon":
            self.icons.append(attributes["href"])


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


def test_smart_start_route_and_existing_http_contracts(
    client: TestClient,
) -> None:
    responses = {
        path: client.get(path)
        for path in ("/", "/about", "/example", "/smart-start", "/health")
    }

    for path in ("/", "/about", "/example", "/smart-start"):
        assert responses[path].status_code == 200
        assert responses[path].headers["content-type"].startswith("text/html")
    assert "Smart Start" in responses["/smart-start"].text
    assert responses["/health"].headers["content-type"] == "application/json"
    assert responses["/health"].json() == {"status": "ok"}


def test_smart_start_page_has_required_accessible_controls_and_assets(
    client: TestClient,
) -> None:
    response = client.get("/smart-start")
    parser = _SmartStartParser()
    parser.feed(response.text)

    assert parser.scripts == [
        "/static/smart-start-state.js",
        "/static/step-assistant-state.js",
        "/static/tester-mode.js",
        "/static/smart-start.js",
    ]
    assert parser.stylesheets == ["/static/styles.css"]
    assert parser.icons == ["/static/favicon.png"]
    for asset in [*parser.scripts, *parser.stylesheets, *parser.icons]:
        assert client.get(asset).status_code == 200

    assert {
        "smart-start-empty",
        "smart-start-workflow",
        "step-region",
        "step-position",
        "step-progress",
        "step-card",
        "smart-back-button",
        "smart-next-button",
        "smart-reset-button",
        "completion-panel",
    } <= parser.ids.keys()
    assert parser.ids["step-region"]["aria-live"] == "polite"
    assert parser.ids["completion-panel"]["aria-live"] == "polite"
    assert 'name="viewport"' in response.text
    assert "width=device-width" in response.text
    assert "Вернуться к расчёту" in response.text
    assert "Начало проекта подготовлено" in response.text


def test_start_button_is_revealed_only_for_a_final_successful_result() -> None:
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    script = (STATIC / "app.js").read_text(encoding="utf-8")
    state_script = (STATIC / "smart-start-state.js").read_text(
        encoding="utf-8"
    )

    assert 'id="start-knitting-link"' in html
    start_link = html.split('id="start-knitting-link"', maxsplit=1)[1]
    assert "hidden" in start_link.split(">", maxsplit=1)[0]
    assert "Начать вязание" in html
    assert "startKnittingLink.hidden = true" in script
    assert "startKnittingLink.hidden = false" in script
    assert "state?.createCalculation(data)" in script
    assert "state.saveCurrentCalculation(storage, calculation)" in script
    assert (
        'url.searchParams.set("calculation", calculation.fingerprint)'
        in script
    )
    assert "result.final !== true" in state_script
    assert 'result.status !== "READY"' in state_script
    assert 'result.status !== "READY_WITH_WARNINGS"' in state_script


def test_smart_start_uses_public_calculation_fields_and_has_six_steps() -> None:
    calculator_script = (STATIC / "app.js").read_text(encoding="utf-8")
    state_script = (STATIC / "smart-start-state.js").read_text(
        encoding="utf-8"
    )
    workflow_script = (STATIC / "smart-start.js").read_text(encoding="utf-8")

    assert '"normalized_inputs"' in state_script
    assert '"original_request"' in state_script
    assert '"selected_candidate"' in state_script
    assert "candidate.working_count" in state_script
    assert '"gauges", "width"' in state_script
    assert (
        "data.axes.width.selected_candidate.working_count"
        in calculator_script
    )
    assert "const STEP_COUNT = 6" in state_script
    for title in (
        "Проверить исходные данные",
        "Подготовить материалы",
        "Подтвердить плотность",
        "Набрать рассчитанное количество петель",
        "Пересчитать петли",
        "Зафиксировать готовность",
    ):
        assert title in workflow_script
    assert "Набери ${count} ${accusativeStitches(count)}." in workflow_script
    smart_start_html = " ".join(
        (STATIC / "smart-start.html").read_text(encoding="utf-8").split()
    )
    assert "первому ряду по описанию проекта" in smart_start_html


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is unavailable")
def test_smart_start_state_transitions_persistence_and_corruption() -> None:
    state_path = STATIC / "smart-start-state.js"
    node_script = r"""
const state = require(process.argv[1]);
const values = new Map();
const storage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const result = {
  status: "READY",
  final: true,
  normalized_inputs: {
    original_request: {
      knitting_mode: "flat",
      zone_pattern: "stockinette",
      fabric_context: {
        yarn: "example yarn",
        needle_mm: 4,
        needle_type: "metal circular",
      },
      width: {
        value: 50,
        unit: "cm",
        size_kind: "finished",
        gauge: {
          ready_count: 20,
          base_length: 10,
          base_unit: "cm",
          source: "personal_swatch",
        },
      },
    },
  },
  gauges: {width: {ready_count: "20", source: "personal_swatch"}},
  axes: {width: {selected_candidate: {working_count: 100}}},
};
const calculation = state.createCalculation(result);
const saved = state.saveCurrentCalculation(storage, calculation);
const restoredCalculation = state.readCurrentCalculation(
  storage,
  calculation.fingerprint,
);
let progress = state.readProgress(storage, calculation.fingerprint);
state.advanceProgress(progress);
state.advanceProgress(progress);
state.saveProgress(storage, progress);
const restoredStep = state.readProgress(
  storage,
  calculation.fingerprint,
).currentStep;
state.goBackProgress(progress);
const afterBack = progress.currentStep;
while (!progress.completed) {
  state.advanceProgress(progress);
}
const completed = progress.completed;
const restarted = state.resetProgress(storage, calculation.fingerprint);

const changedResult = JSON.parse(JSON.stringify(result));
changedResult.axes.width.selected_candidate.working_count = 101;
const changedCalculation = state.createCalculation(changedResult);
const newCalculationStartsFresh =
  state.readProgress(storage, changedCalculation.fingerprint).currentStep;

storage.setItem(state.CALCULATION_STORAGE_KEY, "{broken");
const brokenCalculation = state.readCurrentCalculation(storage);
state.saveCurrentCalculation(storage, calculation);
storage.setItem(
  `${state.PROGRESS_STORAGE_PREFIX}${calculation.fingerprint}`,
  "{broken",
);
const brokenProgress = state.readProgress(
  storage,
  calculation.fingerprint,
).currentStep;

const tampered = JSON.parse(JSON.stringify(calculation));
tampered.workingCount = 999;
storage.setItem(state.CALCULATION_STORAGE_KEY, JSON.stringify(tampered));
const tamperedCalculation = state.readCurrentCalculation(storage);

console.log(JSON.stringify({
  saved,
  workingCount: restoredCalculation.workingCount,
  restoredStep,
  afterBack,
  completed,
  restartedStep: restarted.currentStep,
  calculationStillAvailable:
    values.has(state.CALCULATION_STORAGE_KEY),
  fingerprintsDiffer:
    calculation.fingerprint !== changedCalculation.fingerprint,
  newCalculationStartsFresh,
  brokenCalculation,
  brokenProgress,
  tamperedCalculation,
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
    result = json.loads(completed.stdout)

    assert result == {
        "saved": True,
        "workingCount": 100,
        "restoredStep": 2,
        "afterBack": 1,
        "completed": True,
        "restartedStep": 0,
        "calculationStillAvailable": True,
        "fingerprintsDiffer": True,
        "newCalculationStartsFresh": 0,
        "brokenCalculation": None,
        "brokenProgress": 0,
        "tamperedCalculation": None,
    }


def test_smart_start_mobile_and_print_guards_are_present() -> None:
    stylesheet = (STATIC / "styles.css").read_text(encoding="utf-8")
    html = (STATIC / "smart-start.html").read_text(encoding="utf-8")
    script = (STATIC / "smart-start.js").read_text(encoding="utf-8")

    assert "@media (max-width: 560px)" in stylesheet
    assert ".smart-actions .smart-next-button" in stylesheet
    assert "overflow-wrap: anywhere" in stylesheet
    assert "@media print" in stylesheet
    assert ".smart-actions," in stylesheet
    assert "smart-start-empty" in html
    assert "showEmptyState()" in script
    assert "JSON.parse(raw)" in (
        STATIC / "smart-start-state.js"
    ).read_text(encoding="utf-8")
