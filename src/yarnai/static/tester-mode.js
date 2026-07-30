"use strict";

(function exposeTesterMode(globalObject) {
  const TEST_BUILD_VERSION = "TESTER_READY_V1";
  const YARNAI_STORAGE_PREFIX = "yarnai.";
  const RESET_CONFIRMATION =
    "Удалить прогресс этого теста и начать заново?";
  const RESET_ALL_CONFIRMATION =
    "Удалить все локальные тесты YarnAI? Это действие нельзя отменить.";

  function getLocalStorage() {
    return safely(() => globalObject.localStorage, null);
  }

  function listLocalTests(storage, dependencies = {}) {
    const smartState =
      dependencies.smartState ?? globalObject.YarnAISmartStartState;
    const assistantState =
      dependencies.assistantState ??
      globalObject.YarnAIStepAssistantState;
    if (!storage || !smartState) {
      return [];
    }

    return smartState.listCalculations(storage).map((calculation) => {
      const smartProgress = smartState.readProgress(
        storage,
        calculation.fingerprint,
      );
      const assistantProgress = assistantState?.readProgress(
        storage,
        calculation.fingerprint,
        calculation.workingCount,
      );
      return {
        calculation,
        smartProgress,
        assistantProgress,
        continueRoute: smartProgress.completed
          ? "/step-assistant"
          : "/smart-start",
      };
    });
  }

  function activateTest(storage, fingerprint, dependencies = {}) {
    const smartState =
      dependencies.smartState ?? globalObject.YarnAISmartStartState;
    if (!storage || !smartState) {
      return null;
    }
    return smartState.activateCalculation(storage, fingerprint);
  }

  function resetCurrentTest(storage, fingerprint, dependencies = {}) {
    const smartState =
      dependencies.smartState ?? globalObject.YarnAISmartStartState;
    const assistantState =
      dependencies.assistantState ??
      globalObject.YarnAIStepAssistantState;
    if (!storage || !smartState || typeof fingerprint !== "string") {
      return false;
    }

    const assistantReset =
      !assistantState ||
      Boolean(assistantState.resetProgress(storage, fingerprint));
    return (
      smartState.removeCalculation(storage, fingerprint) &&
      assistantReset
    );
  }

  function removeAllLocalTests(storage) {
    if (!storage) {
      return false;
    }
    return safely(() => {
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (
          typeof key === "string" &&
          key.startsWith(YARNAI_STORAGE_PREFIX)
        ) {
          keys.push(key);
        }
      }
      keys.forEach((key) => storage.removeItem(key));
      return true;
    }, false);
  }

  function hasLocalYarnAIData(storage) {
    if (!storage) {
      return false;
    }
    return safely(() => {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (
          typeof key === "string" &&
          key.startsWith(YARNAI_STORAGE_PREFIX)
        ) {
          return true;
        }
      }
      return false;
    }, false);
  }

  function clearActiveCalculation(storage, dependencies = {}) {
    const smartState =
      dependencies.smartState ?? globalObject.YarnAISmartStartState;
    if (!storage || !smartState) {
      return false;
    }
    return safely(() => {
      storage.removeItem(smartState.CALCULATION_STORAGE_KEY);
      return true;
    }, false);
  }

  function createDiagnosticSnapshot(options = {}) {
    const storage = options.storage ?? getLocalStorage();
    const smartState =
      options.smartState ?? globalObject.YarnAISmartStartState;
    const assistantState =
      options.assistantState ?? globalObject.YarnAIStepAssistantState;
    const route =
      options.route ??
      globalObject.location?.pathname ??
      "неизвестно";
    const requestedFingerprint =
      options.fingerprint ?? readFingerprintFromLocation();
    const diagnosticCodes = [];

    if (!storage || !smartState || !assistantState) {
      diagnosticCodes.push("STORAGE_UNAVAILABLE");
      return diagnosticResult(
        options,
        route,
        requestedFingerprint,
        null,
        null,
        null,
        diagnosticCodes,
      );
    }

    const calculation = readDiagnosticCalculation(
      storage,
      smartState,
      requestedFingerprint,
      diagnosticCodes,
    );
    if (!calculation) {
      return diagnosticResult(
        options,
        route,
        requestedFingerprint,
        null,
        null,
        null,
        diagnosticCodes,
      );
    }

    const fingerprint = calculation.fingerprint;
    const smartProgress = readDiagnosticProgress(
      storage,
      smartState.progressKey(fingerprint),
      (value) => smartState.isValidProgress(value, fingerprint),
      () => smartState.initialProgress(fingerprint),
      "SMART_START_PROGRESS",
      diagnosticCodes,
    );
    const assistantProgress = readDiagnosticProgress(
      storage,
      assistantState.progressKey(fingerprint),
      (value) =>
        assistantState.isValidProgress(
          value,
          fingerprint,
          calculation.workingCount,
        ),
      () => assistantState.initialProgress(fingerprint),
      "STEP_ASSISTANT_PROGRESS",
      diagnosticCodes,
    );

    return diagnosticResult(
      options,
      route,
      fingerprint,
      calculation,
      smartProgress,
      assistantProgress,
      diagnosticCodes,
    );
  }

  function readDiagnosticCalculation(
    storage,
    smartState,
    requestedFingerprint,
    diagnosticCodes,
  ) {
    const key = requestedFingerprint
      ? smartState.calculationKey(requestedFingerprint)
      : smartState.CALCULATION_STORAGE_KEY;
    const result = readStoredJson(
      storage,
      key,
      smartState.isValidCalculation,
    );

    if (result.status === "valid") {
      return result.value;
    }

    if (requestedFingerprint) {
      const current = readStoredJson(
        storage,
        smartState.CALCULATION_STORAGE_KEY,
        (value) =>
          smartState.isValidCalculation(value) &&
          value.fingerprint === requestedFingerprint,
      );
      if (current.status === "valid") {
        return current.value;
      }
    }

    diagnosticCodes.push(
      result.status === "missing"
        ? "CALCULATION_MISSING"
        : `CALCULATION_${result.status.toUpperCase()}`,
    );
    return null;
  }

  function readDiagnosticProgress(
    storage,
    key,
    validator,
    createInitial,
    codePrefix,
    diagnosticCodes,
  ) {
    const result = readStoredJson(storage, key, validator);
    if (result.status === "valid") {
      return result.value;
    }
    if (result.status !== "missing") {
      diagnosticCodes.push(
        `${codePrefix}_${result.status.toUpperCase()}`,
      );
    }
    return createInitial();
  }

  function readStoredJson(storage, key, validator) {
    try {
      const raw = storage.getItem(key);
      if (raw === null) {
        return { status: "missing", value: null };
      }
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        return { status: "invalid_json", value: null };
      }
      return validator(value)
        ? { status: "valid", value }
        : { status: "invalid", value: null };
    } catch {
      return { status: "unavailable", value: null };
    }
  }

  function diagnosticResult(
    options,
    route,
    fingerprint,
    calculation,
    smartProgress,
    assistantProgress,
    diagnosticCodes,
  ) {
    const now = options.now instanceof Date ? options.now : new Date();
    return {
      testBuildVersion: TEST_BUILD_VERSION,
      route,
      fingerprint: fingerprint || "нет",
      smartStartStep: smartProgress
        ? smartProgress.currentStep + 1
        : "нет",
      currentRow: assistantProgress?.currentRow ?? "нет",
      currentStitch: assistantProgress?.currentStitch ?? "нет",
      viewportWidth:
        options.viewportWidth ??
        globalObject.innerWidth ??
        "неизвестно",
      userAgent:
        options.userAgent ??
        globalObject.navigator?.userAgent ??
        "неизвестно",
      generatedAt: now.toISOString(),
      hasValidState: Boolean(calculation) && diagnosticCodes.length === 0,
      diagnosticCodes: [...diagnosticCodes],
    };
  }

  function buildFeedbackReport({
    answers = {},
    includeAnswers = false,
    diagnostics,
  }) {
    const technical = diagnostics ?? createDiagnosticSnapshot();
    const lines = [
      "YarnAI — отчёт тестировщика",
      `Версия тестовой сборки: ${technical.testBuildVersion}`,
      "",
      "Ответы тестировщика:",
    ];
    const answerFields = [
      ["Что ты пытался сделать?", answers.attempted],
      ["Что произошло?", answers.happened],
      ["Что ты ожидал увидеть?", answers.expected],
      ["Комментарий", answers.comment],
    ];
    if (includeAnswers) {
      answerFields.forEach(([label, value]) => {
        lines.push(`${label}: ${cleanUserText(value) || "не указано"}`);
      });
    } else {
      lines.push(
        "Не включены: согласие на добавление введённых текстов не дано.",
      );
    }

    lines.push(
      "",
      "Техническая диагностика (без персональных данных):",
      `Текущий маршрут: ${technical.route}`,
      `Fingerprint: ${technical.fingerprint}`,
      `Текущий шаг Smart Start: ${technical.smartStartStep}`,
      `Текущий ряд: ${technical.currentRow}`,
      `Текущая петля: ${technical.currentStitch}`,
      `Ширина viewport: ${technical.viewportWidth}`,
      `User agent: ${technical.userAgent}`,
      `Время формирования: ${technical.generatedAt}`,
      `Корректное состояние: ${technical.hasValidState ? "да" : "нет"}`,
      `Диагностические коды: ${
        technical.diagnosticCodes.length
          ? technical.diagnosticCodes.join(", ")
          : "нет"
      }`,
    );
    return `${lines.join("\n")}\n`;
  }

  async function copyReport(text, clipboard, manualFallback) {
    if (clipboard && typeof clipboard.writeText === "function") {
      try {
        await clipboard.writeText(text);
        return "copied";
      } catch {
        // The explicit fallback below keeps the report available locally.
      }
    }
    if (typeof manualFallback === "function") {
      manualFallback(text);
    }
    return "manual";
  }

  function downloadReport(text, options = {}) {
    const documentObject = options.document ?? globalObject.document;
    const urlApi = options.urlApi ?? globalObject.URL;
    const BlobConstructor = options.BlobConstructor ?? globalObject.Blob;
    const now = options.now instanceof Date ? options.now : new Date();
    if (
      !documentObject ||
      !urlApi ||
      typeof urlApi.createObjectURL !== "function" ||
      typeof BlobConstructor !== "function"
    ) {
      return null;
    }

    const filename = `yarnai-feedback-${now
      .toISOString()
      .slice(0, 10)}.txt`;
    const blob = new BlobConstructor([text], {
      type: "text/plain;charset=utf-8",
    });
    const url = urlApi.createObjectURL(blob);
    const link = documentObject.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    documentObject.body.append(link);
    link.click();
    link.remove();
    globalObject.setTimeout?.(() => urlApi.revokeObjectURL(url), 0);
    return filename;
  }

  function initializeTesterUi() {
    if (!globalObject.document) {
      return;
    }
    document.querySelectorAll("[data-test-build-version]").forEach(
      (element) => {
        element.textContent = TEST_BUILD_VERSION;
      },
    );

    const storage = getLocalStorage();
    const smartState = globalObject.YarnAISmartStartState;
    const calculation =
      storage && smartState
        ? smartState.readCurrentCalculation(storage)
        : null;

    document.querySelectorAll("[data-feedback-link]").forEach((link) => {
      if (calculation) {
        link.href = `/feedback?calculation=${encodeURIComponent(
          calculation.fingerprint,
        )}`;
      } else {
        link.href = "/feedback";
      }
    });

    document.querySelectorAll("[data-reset-current-test]").forEach(
      (button) => {
        button.disabled = !calculation;
        if (button.dataset.testerResetBound === "true") {
          return;
        }
        button.dataset.testerResetBound = "true";
        button.addEventListener("click", () => {
          const activeStorage = getLocalStorage();
          const activeCalculation =
            activeStorage && smartState
              ? smartState.readCurrentCalculation(activeStorage)
              : null;
          if (
            !activeCalculation ||
            !globalObject.confirm(RESET_CONFIRMATION)
          ) {
            return;
          }
          resetCurrentTest(
            activeStorage,
            activeCalculation.fingerprint,
          );
          globalObject.location.assign("/?tester=new");
        });
      },
    );
  }

  function readFingerprintFromLocation() {
    return safely(
      () =>
        new URLSearchParams(globalObject.location?.search ?? "").get(
          "calculation",
        ) ?? "",
      "",
    );
  }

  function cleanUserText(value) {
    return typeof value === "string"
      ? value.replace(/\r\n?/g, "\n").trim()
      : "";
  }

  function safely(action, fallback) {
    try {
      return action();
    } catch {
      return fallback;
    }
  }

  const api = Object.freeze({
    TEST_BUILD_VERSION,
    YARNAI_STORAGE_PREFIX,
    RESET_CONFIRMATION,
    RESET_ALL_CONFIRMATION,
    getLocalStorage,
    listLocalTests,
    activateTest,
    resetCurrentTest,
    removeAllLocalTests,
    hasLocalYarnAIData,
    clearActiveCalculation,
    createDiagnosticSnapshot,
    buildFeedbackReport,
    copyReport,
    downloadReport,
    initializeTesterUi,
  });

  globalObject.YarnAITesterMode = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  initializeTesterUi();
})(typeof globalThis === "undefined" ? window : globalThis);
