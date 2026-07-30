from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai.http as http_api


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"
TEST_BUILD_VERSION = "TESTER_READY_V1"


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


def test_tester_start_route_explains_local_storage_and_version_source(
    client: TestClient,
) -> None:
    response = client.get("/test")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "это тестовая версия YarnAI".casefold() in response.text.casefold()
    assert "только в браузере этого устройства" in response.text
    assert "не синхронизируется между устройствами" in response.text
    assert "Очистка данных браузера" in response.text
    assert "Начать новый тест" in response.text
    assert 'id="continue-test-button"' in response.text
    continue_tag = response.text.split(
        'id="continue-test-button"', maxsplit=1
    )[1].split(">", maxsplit=1)[0]
    assert "hidden" in continue_tag
    assert "Удалить все локальные тесты" in response.text
    assert "Локальные данные YarnAI повреждены" in response.text
    assert "data-test-build-version" in response.text

    version_script = (STATIC / "tester-mode.js").read_text(encoding="utf-8")
    assert f'const TEST_BUILD_VERSION = "{TEST_BUILD_VERSION}"' in version_script
    assert TEST_BUILD_VERSION not in response.text


def test_all_tester_routes_and_empty_states_are_safe(
    client: TestClient,
) -> None:
    routes = {
        "/test": "Начать новый тест",
        "/calculator": "Начать расчёт",
        "/smart-start": "Вернуться к началу теста",
        "/step-assistant": "Вернуться к началу теста",
        "/feedback": "Вернуться к началу теста",
    }

    for route, safe_action in routes.items():
        response = client.get(route)
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")
        assert safe_action in response.text

    assert client.get("/health").content == b'{"status":"ok"}'


def test_test_panel_and_feedback_form_are_accessible_and_local() -> None:
    for filename in ("index.html", "smart-start.html", "step-assistant.html"):
        html = (STATIC / filename).read_text(encoding="utf-8")
        assert 'class="tester-panel"' in html
        assert 'aria-label="Тестовый режим"' in html
        assert "О тестовой версии" in html
        assert "Начать заново" in html
        assert "Сообщить о проблеме" in html

    feedback = (STATIC / "feedback.html").read_text(encoding="utf-8")
    for field_id, label in (
        ("attempted", "Что ты пытался сделать?"),
        ("happened", "Что произошло?"),
        ("expected", "Что ты ожидал увидеть?"),
        ("comment", "Комментарий (необязательно)"),
    ):
        assert f'for="{field_id}"' in feedback
        assert f'id="{field_id}"' in feedback
        assert label in feedback
    assert "Ничего не отправляется автоматически" in " ".join(
        feedback.split()
    )
    assert "Я согласна включить" in feedback

    stylesheet = (STATIC / "styles.css").read_text(encoding="utf-8")
    assert ".tester-panel" in stylesheet
    assert "flex-wrap: wrap" in stylesheet
    assert ":focus-visible" in stylesheet
    assert "@media (max-width: 560px)" in stylesheet


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js is unavailable")
def test_tester_storage_reset_diagnostics_copy_and_download() -> None:
    state_path = STATIC / "smart-start-state.js"
    assistant_path = STATIC / "step-assistant-state.js"
    tester_path = STATIC / "tester-mode.js"
    node_script = r"""
const smart = require(process.argv[1]);
const assistant = require(process.argv[2]);
const tester = require(process.argv[3]);

class Storage {
  constructor() {
    this.values = new Map();
  }
  get length() {
    return this.values.size;
  }
  key(index) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

function calculationResult(workingCount) {
  return {
    status: "READY",
    final: true,
    normalized_inputs: {
      original_request: {
        knitting_mode: "flat",
        zone_pattern: "stockinette",
        fabric_context: {
          yarn: "test yarn",
          needle_mm: 4,
          needle_type: "circular",
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
    axes: {width: {selected_candidate: {working_count: workingCount}}},
  };
}

(async () => {
  const storage = new Storage();
  storage.setItem("unrelated.application", "keep");
  const calculationA = smart.createCalculation(calculationResult(2));
  const calculationB = smart.createCalculation(calculationResult(3));
  smart.saveCurrentCalculation(storage, calculationA);

  const smartA = smart.initialProgress(calculationA.fingerprint);
  smart.advanceProgress(smartA);
  smart.advanceProgress(smartA);
  smart.saveProgress(storage, smartA);
  const assistantA = assistant.initialProgress(calculationA.fingerprint);
  assistant.advanceStitch(assistantA, 2);
  assistant.advanceStitch(assistantA, 2);
  assistant.advanceRow(assistantA, 2);
  assistant.advanceStitch(assistantA, 2);
  assistant.saveProgress(storage, assistantA, 2);

  smart.saveCurrentCalculation(storage, calculationB);
  const smartB = smart.initialProgress(calculationB.fingerprint);
  smart.advanceProgress(smartB);
  smart.saveProgress(storage, smartB);
  const assistantB = assistant.initialProgress(calculationB.fingerprint);
  assistant.advanceStitch(assistantB, 3);
  assistant.saveProgress(storage, assistantB, 3);

  const testsBeforeReset = tester.listLocalTests(storage, {
    smartState: smart,
    assistantState: assistant,
  });
  tester.activateTest(storage, calculationA.fingerprint, {
    smartState: smart,
  });
  const diagnostics = tester.createDiagnosticSnapshot({
    storage,
    smartState: smart,
    assistantState: assistant,
    fingerprint: calculationA.fingerprint,
    route: "/feedback",
    viewportWidth: 375,
    userAgent: "TestBrowser/1.0",
    now: new Date("2026-07-30T12:00:00.000Z"),
  });

  const privateAnswers = {
    attempted: "Иван пытался связать секретный проект",
    happened: "email owner@example.test",
    expected: "точный адрес",
    comment: "секрет localStorage",
  };
  const privateReport = tester.buildFeedbackReport({
    answers: privateAnswers,
    includeAnswers: false,
    diagnostics,
  });
  const consentedReport = tester.buildFeedbackReport({
    answers: privateAnswers,
    includeAnswers: true,
    diagnostics,
  });

  let clipboardText = "";
  const copied = await tester.copyReport(
    privateReport,
    {writeText: async (text) => { clipboardText = text; }},
    () => {},
  );
  let manualText = "";
  const fallback = await tester.copyReport(
    privateReport,
    null,
    (text) => { manualText = text; },
  );

  let clicked = false;
  let blobParts = null;
  let blobOptions = null;
  class FakeBlob {
    constructor(parts, options) {
      blobParts = parts;
      blobOptions = options;
    }
  }
  const fakeLink = {
    hidden: false,
    href: "",
    download: "",
    click() { clicked = true; },
    remove() {},
  };
  const filename = tester.downloadReport(privateReport, {
    document: {
      body: {append() {}},
      createElement: () => fakeLink,
    },
    urlApi: {
      createObjectURL: () => "blob:test",
      revokeObjectURL() {},
    },
    BlobConstructor: FakeBlob,
    now: new Date("2026-07-30T12:00:00.000Z"),
  });

  const resetA = tester.resetCurrentTest(
    storage,
    calculationA.fingerprint,
    {smartState: smart, assistantState: assistant},
  );
  const afterCurrentReset = {
    calculationA: storage.getItem(smart.calculationKey(
      calculationA.fingerprint,
    )),
    smartA: storage.getItem(smart.progressKey(calculationA.fingerprint)),
    assistantA: storage.getItem(assistant.progressKey(
      calculationA.fingerprint,
    )),
    calculationB: storage.getItem(smart.calculationKey(
      calculationB.fingerprint,
    )) !== null,
    smartB: storage.getItem(smart.progressKey(
      calculationB.fingerprint,
    )) !== null,
    assistantB: storage.getItem(assistant.progressKey(
      calculationB.fingerprint,
    )) !== null,
  };

  tester.activateTest(storage, calculationB.fingerprint, {
    smartState: smart,
  });
  const removedAll = tester.removeAllLocalTests(storage);
  const yarnaiKeysAfterFullReset = [...storage.values.keys()].filter(
    (key) => key.startsWith("yarnai."),
  );

  const corrupted = new Storage();
  corrupted.setItem(smart.CALCULATION_STORAGE_KEY, "{broken");
  const corruptedDataDetected = tester.hasLocalYarnAIData(corrupted);
  const corruptedDiagnostics = tester.createDiagnosticSnapshot({
    storage: corrupted,
    smartState: smart,
    assistantState: assistant,
    route: "/smart-start",
    viewportWidth: 375,
    userAgent: "TestBrowser/1.0",
    now: new Date("2026-07-30T12:00:00.000Z"),
  });

  console.log(JSON.stringify({
    version: tester.TEST_BUILD_VERSION,
    testCount: testsBeforeReset.length,
    fingerprintsDiffer:
      calculationA.fingerprint !== calculationB.fingerprint,
    diagnostics,
    privateReport,
    consentedReport,
    copied,
    clipboardMatches: clipboardText === privateReport,
    fallback,
    manualMatches: manualText === privateReport,
    download: {
      filename,
      clicked,
      contentsMatch: blobParts[0] === privateReport,
      type: blobOptions.type,
    },
    resetA,
    afterCurrentReset,
    removedAll,
    yarnaiKeysAfterFullReset,
    unrelatedPreserved:
      storage.getItem("unrelated.application") === "keep",
    corruptedTests: tester.listLocalTests(corrupted, {
      smartState: smart,
      assistantState: assistant,
    }).length,
    corruptedDataDetected,
    corruptedDiagnostics,
  }));
})();
"""
    completed = subprocess.run(
        [
            "node",
            "-e",
            node_script,
            str(state_path),
            str(assistant_path),
            str(tester_path),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    result = json.loads(completed.stdout)

    assert result["version"] == TEST_BUILD_VERSION
    assert result["testCount"] == 2
    assert result["fingerprintsDiffer"] is True
    assert result["diagnostics"] == {
        "testBuildVersion": TEST_BUILD_VERSION,
        "route": "/feedback",
        "fingerprint": result["diagnostics"]["fingerprint"],
        "smartStartStep": 3,
        "currentRow": 2,
        "currentStitch": 1,
        "viewportWidth": 375,
        "userAgent": "TestBrowser/1.0",
        "generatedAt": "2026-07-30T12:00:00.000Z",
        "hasValidState": True,
        "diagnosticCodes": [],
    }
    for forbidden in (
        "Иван",
        "owner@example.test",
        "точный адрес",
        "секрет localStorage",
    ):
        assert forbidden not in result["privateReport"]
    assert "Иван пытался связать секретный проект" in result["consentedReport"]
    assert f"Версия тестовой сборки: {TEST_BUILD_VERSION}" in result[
        "privateReport"
    ]
    assert "Fingerprint:" in result["privateReport"]
    assert result["copied"] == "copied"
    assert result["clipboardMatches"] is True
    assert result["fallback"] == "manual"
    assert result["manualMatches"] is True
    assert result["download"] == {
        "filename": "yarnai-feedback-2026-07-30.txt",
        "clicked": True,
        "contentsMatch": True,
        "type": "text/plain;charset=utf-8",
    }
    assert result["resetA"] is True
    assert result["afterCurrentReset"] == {
        "calculationA": None,
        "smartA": None,
        "assistantA": None,
        "calculationB": True,
        "smartB": True,
        "assistantB": True,
    }
    assert result["removedAll"] is True
    assert result["yarnaiKeysAfterFullReset"] == []
    assert result["unrelatedPreserved"] is True
    assert result["corruptedTests"] == 0
    assert result["corruptedDataDetected"] is True
    assert result["corruptedDiagnostics"]["hasValidState"] is False
    assert result["corruptedDiagnostics"]["diagnosticCodes"] == [
        "CALCULATION_INVALID_JSON"
    ]


def test_no_external_sdks_cookies_or_hidden_collection_were_added() -> None:
    tester_sources = "\n".join(
        (STATIC / name).read_text(encoding="utf-8")
        for name in (
            "test.html",
            "feedback.html",
            "tester-mode.js",
            "test-page.js",
            "feedback.js",
        )
    )

    assert "document.cookie" not in tester_sources
    assert "fetch(" not in tester_sources
    assert "XMLHttpRequest" not in tester_sources
    assert "https://" not in tester_sources
    assert "http://" not in tester_sources
