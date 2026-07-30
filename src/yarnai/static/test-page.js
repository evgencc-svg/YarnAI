"use strict";

(function initializeTestPage() {
  const testerMode = window.YarnAITesterMode;
  const storage = testerMode.getLocalStorage();
  const continueButton = document.querySelector("#continue-test-button");
  const savedTests = document.querySelector("#saved-tests");
  const savedTestsList = document.querySelector("#saved-tests-list");
  const noTestsMessage = document.querySelector("#no-tests-message");
  const corruptedTestsMessage = document.querySelector(
    "#corrupted-tests-message",
  );
  const storageWarning = document.querySelector("#storage-warning");
  const removeAllButton = document.querySelector("#remove-all-tests-button");
  const actionStatus = document.querySelector("#test-action-status");

  if (!storage) {
    storageWarning.hidden = false;
    continueButton.hidden = true;
    removeAllButton.disabled = true;
    return;
  }

  const tests = testerMode.listLocalTests(storage);
  const hasLocalData = testerMode.hasLocalYarnAIData(storage);
  continueButton.hidden = tests.length !== 1;
  noTestsMessage.hidden = tests.length !== 0 || hasLocalData;
  corruptedTestsMessage.hidden = tests.length !== 0 || !hasLocalData;
  savedTests.hidden = tests.length === 0;
  removeAllButton.disabled = !hasLocalData;

  if (tests.length === 1) {
    continueButton.addEventListener("click", () => continueTest(tests[0]));
  }

  tests.forEach((test) => {
    const item = document.createElement("li");
    item.className = "saved-test-card";

    const title = document.createElement("strong");
    title.textContent = `${test.calculation.workingCount} петель`;

    const details = document.createElement("span");
    details.textContent = describeTest(test);

    const button = document.createElement("button");
    button.className = "secondary-button";
    button.type = "button";
    button.textContent = tests.length > 1 ? "Продолжить этот тест" : "Открыть";
    button.setAttribute(
      "aria-label",
      `Продолжить тест: ${test.calculation.workingCount} петель`,
    );
    button.addEventListener("click", () => continueTest(test));

    item.append(title, details, button);
    savedTestsList.append(item);
  });

  removeAllButton.addEventListener("click", () => {
    if (!window.confirm(testerMode.RESET_ALL_CONFIRMATION)) {
      return;
    }
    if (testerMode.removeAllLocalTests(storage)) {
      savedTests.hidden = true;
      continueButton.hidden = true;
      noTestsMessage.hidden = false;
      corruptedTestsMessage.hidden = true;
      removeAllButton.disabled = true;
      actionStatus.textContent = "Все локальные тесты YarnAI удалены.";
      actionStatus.hidden = false;
      removeAllButton.focus();
    } else {
      actionStatus.textContent =
        "Не удалось удалить данные. Проверь настройки браузера.";
      actionStatus.hidden = false;
    }
  });

  function continueTest(test) {
    if (
      testerMode.activateTest(
        storage,
        test.calculation.fingerprint,
      )
    ) {
      window.location.assign(test.continueRoute);
      return;
    }
    actionStatus.textContent =
      "Не удалось открыть этот тест. Начни новый тестовый расчёт.";
    actionStatus.hidden = false;
  }

  function describeTest(test) {
    if (test.smartProgress.completed) {
      return `Step Assistant: ряд ${test.assistantProgress.currentRow}, ` +
        `петля ${test.assistantProgress.currentStitch}.`;
    }
    return `Smart Start: шаг ${test.smartProgress.currentStep + 1} из 6.`;
  }
})();
