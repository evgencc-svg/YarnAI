"use strict";

(function initializeFirstUserFlow(globalObject) {
  let engineApi = globalObject.YarnAIIntentEngine;
  if (
    !engineApi &&
    typeof module !== "undefined" &&
    module.exports &&
    typeof require === "function"
  ) {
    engineApi = require("./intent-engine.js");
  }
  if (!engineApi) {
    throw new Error("Project Understanding Engine is unavailable.");
  }
  let readinessApi = globalObject.YarnAIProjectReadiness;
  if (
    !readinessApi &&
    typeof module !== "undefined" &&
    module.exports &&
    typeof require === "function"
  ) {
    readinessApi = require("./project-readiness-engine.js");
  }
  if (!readinessApi) {
    throw new Error("Project Readiness Engine is unavailable.");
  }
  let swatchApi = globalObject.YarnAISwatchAssistant;
  if (
    !swatchApi &&
    typeof module !== "undefined" &&
    module.exports &&
    typeof require === "function"
  ) {
    swatchApi = require("./swatch-assistant.js");
  }
  if (!swatchApi) {
    throw new Error("Swatch Assistant is unavailable.");
  }
  const projectSystem = globalObject.YarnAIProjectSystem;
  const calculatedProjects = globalObject.YarnAICalculatedProjects;
  const firstKnittingStep = globalObject.YarnAIFirstKnittingStep;
  globalObject.YarnAIFirstUserFlow = engineApi;

  if (typeof document === "undefined") {
    return;
  }

  const STORAGE_KEY = "yarnai:first-user-flow:stage2";
  const LEGACY_STORAGE_KEY = "yarnai:first-user-flow:stage1";
  const {
    DialogueEngine,
    MAX_FILE_BYTES,
  } = engineApi;

  const startScreen = document.querySelector("#start-screen");
  const dialogScreen = document.querySelector("#dialog-screen");
  const resultScreen = document.querySelector("#result-screen");
  const conversationHistory = document.querySelector("#conversation-history");
  const knownFacts = document.querySelector("#known-facts");
  const attachmentPreview = document.querySelector("#attachment-preview");
  const messageForm = document.querySelector("#message-form");
  const messageInput = document.querySelector("#message-input");
  const fileError = document.querySelector("#file-error");
  const photoInput = document.querySelector("#photo-input");
  const patternInput = document.querySelector("#pattern-input");
  const choosePhoto = document.querySelector("#choose-photo");
  const choosePattern = document.querySelector("#choose-pattern");
  const chooseText = document.querySelector("#choose-text");
  const addPhotoButton = document.querySelector("#add-photo-button");
  const addPatternButton = document.querySelector("#add-pattern-button");
  const newDialogButton = document.querySelector("#new-dialog-button");
  const resultKnown = document.querySelector("#result-known");
  const resultAssumptions = document.querySelector("#result-assumptions");
  const resultAssumptionsBlock = document.querySelector(
    "#result-assumptions-block",
  );
  const resultMissing = document.querySelector("#result-missing");
  const resultMissingBlock = document.querySelector("#result-missing-block");
  const resultOptional = document.querySelector("#result-optional");
  const resultOptionalBlock = document.querySelector("#result-optional-block");
  const resultBlockers = document.querySelector("#result-blockers");
  const resultBlockersBlock = document.querySelector(
    "#result-blockers-block",
  );
  const readinessStatus = document.querySelector("#readiness-status");
  const readinessStatusLabel = document.querySelector(
    "#readiness-status-label",
  );
  const readinessStatusTitle = document.querySelector(
    "#readiness-status-title",
  );
  const readinessStatusDescription = document.querySelector(
    "#readiness-status-description",
  );
  const calculationPlanTitle = document.querySelector(
    "#calculation-plan-title",
  );
  const calculationPlanDescription = document.querySelector(
    "#calculation-plan-description",
  );
  const calculationPlanOutputs = document.querySelector(
    "#calculation-plan-outputs",
  );
  const calculationPlanLimits = document.querySelector(
    "#calculation-plan-limits",
  );
  const resultWarning = document.querySelector("#result-warning");
  const continueButton = document.querySelector("#continue-dialog-button");
  const openCalculatorLink = document.querySelector("#open-calculator-link");
  const summaryCorrectionForm = document.querySelector(
    "#summary-correction-form",
  );
  const summaryCorrectionInput = document.querySelector(
    "#summary-correction-input",
  );
  const summaryNewDialogButton = document.querySelector(
    "#summary-new-dialog-button",
  );
  const swatchAssistant = document.querySelector("#swatch-assistant");
  const swatchAssistantTitle = document.querySelector(
    "#swatch-assistant-title",
  );
  const swatchAssistantIntroduction = document.querySelector(
    "#swatch-assistant-introduction",
  );
  const swatchAssistantSteps = document.querySelector(
    "#swatch-assistant-steps",
  );
  const swatchForm = document.querySelector("#swatch-form");
  const swatchFeedback = document.querySelector("#swatch-feedback");
  const savedProjectsLoading = document.querySelector(
    "#saved-projects-loading",
  );
  const savedProjectsEmpty = document.querySelector("#saved-projects-empty");
  const savedProjectsError = document.querySelector("#saved-projects-error");
  const savedProjectsList = document.querySelector("#saved-projects-list");

  let engine = restoreEngine();
  let activeObjectUrl = null;

  choosePhoto.addEventListener("click", () => photoInput.click());
  choosePattern.addEventListener("click", () => patternInput.click());
  chooseText.addEventListener("click", () => {
    engine.start("text");
    persistAndRender();
    openDialog();
  });
  addPhotoButton.addEventListener("click", () => photoInput.click());
  addPatternButton.addEventListener("click", () => patternInput.click());
  photoInput.addEventListener("change", () =>
    handleFileChoice("photo", photoInput),
  );
  patternInput.addEventListener("change", () =>
    handleFileChoice("pattern", patternInput),
  );
  newDialogButton.addEventListener("click", resetDialogue);
  summaryNewDialogButton.addEventListener("click", resetDialogue);
  continueButton.addEventListener("click", () => {
    engine.continue();
    persistAndRender();
    if (engine.snapshot().phase === "active") {
      openDialog();
    }
  });

  messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text) {
      return;
    }
    engine.submit(text);
    messageInput.value = "";
    persistAndRender();
    if (engine.snapshot().phase === "active") {
      messageInput.focus();
    }
  });
  summaryCorrectionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = summaryCorrectionInput.value.trim();
    if (!text) {
      return;
    }
    engine.correct(text);
    summaryCorrectionInput.value = "";
    persistAndRender();
    summaryCorrectionInput.focus();
  });
  swatchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(swatchForm);
    const assessment = swatchApi.assessSwatch({
      measurementWidthCm: formData.get("measurement-width"),
      stitchMeasurements: [
        formData.get("stitches-1"),
        formData.get("stitches-2"),
        formData.get("stitches-3"),
      ],
      rows: formData.get("rows"),
      rowHeightCm: formData.get("row-height"),
      context: {
        sameYarn: formData.has("same-yarn"),
        sameTools: formData.has("same-tools"),
        samePattern: formData.has("same-pattern"),
        processed: formData.has("processed"),
        fullyDry: formData.has("fully-dry"),
        relaxed: formData.has("relaxed"),
      },
    });
    if (!assessment.ready) {
      swatchFeedback.replaceChildren();
      const list = document.createElement("ul");
      assessment.errors.forEach((error) => {
        const item = document.createElement("li");
        item.textContent = error.message;
        list.append(item);
      });
      swatchFeedback.append(list);
      swatchFeedback.hidden = false;
      swatchFeedback.focus();
      return;
    }
    swatchFeedback.hidden = true;
    engine.recordGauge(assessment.gauge);
    persistAndRender();
    openCalculatorLink.focus();
  });
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      messageForm.requestSubmit();
    }
  });

  if (engine.snapshot().messages.length > 0) {
    render();
  }
  initializeSavedProjects();

  function restoreEngine() {
    try {
      const serialized =
        globalObject.localStorage?.getItem(STORAGE_KEY) ||
        globalObject.localStorage?.getItem(LEGACY_STORAGE_KEY);
      return serialized
        ? DialogueEngine.restore(serialized)
        : new DialogueEngine();
    } catch {
      return new DialogueEngine();
    }
  }

  function persistAndRender() {
    try {
      globalObject.localStorage?.setItem(STORAGE_KEY, engine.serialize());
      globalObject.localStorage?.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // The live dialogue remains usable when browser storage is unavailable.
    }
    render();
  }

  function showScreen(screen) {
    startScreen.hidden = screen !== "start";
    dialogScreen.hidden = screen !== "dialog";
    resultScreen.hidden = screen !== "result";
  }

  function openDialog() {
    showScreen("dialog");
    globalObject.requestAnimationFrame?.(() => messageInput.focus());
  }

  function resetDialogue() {
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
    engine = new DialogueEngine();
    photoInput.value = "";
    patternInput.value = "";
    attachmentPreview.replaceChildren();
    attachmentPreview.hidden = true;
    fileError.hidden = true;
    showScreen("start");
    try {
      globalObject.localStorage?.removeItem(STORAGE_KEY);
      globalObject.localStorage?.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Nothing else is required for an in-memory reset.
    }
    choosePhoto.focus();
  }

  function handleFileChoice(kind, input) {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const problem = validateFile(kind, file);
    if (problem) {
      fileError.textContent = problem;
      fileError.hidden = false;
      input.value = "";
      if (dialogScreen.hidden) {
        engine.start("text");
        persistAndRender();
        openDialog();
      }
      return;
    }
    fileError.hidden = true;
    if (engine.snapshot().messages.length === 0) {
      engine.start(kind, file);
    } else {
      engine.addAttachment(kind, file);
    }
    showAttachment(file);
    persistAndRender();
    openDialog();
    input.value = "";
  }

  function validateFile(kind, file) {
    if (file.size > MAX_FILE_BYTES) {
      return "Файл больше 15 МБ. Выбери, пожалуйста, файл поменьше.";
    }
    const name = file.name.toLowerCase();
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    if (kind === "photo" && !isImage) {
      return "Для фотографии подойдёт файл изображения.";
    }
    if (kind === "pattern" && !isImage && !isPdf) {
      return "Для схемы подойдёт PDF или файл изображения.";
    }
    return "";
  }

  function showAttachment(file) {
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
    attachmentPreview.replaceChildren();
    const isImage = file.type.startsWith("image/");
    if (isImage) {
      activeObjectUrl = URL.createObjectURL(file);
      const image = document.createElement("img");
      image.src = activeObjectUrl;
      image.alt = `Загруженный материал: ${file.name}`;
      attachmentPreview.append(image);
    } else {
      attachmentPreview.append(fileCard(file.name, file.size));
    }
    attachmentPreview.hidden = false;
  }

  function render() {
    const state = engine.snapshot();
    if (["summary", "completed"].includes(state.phase)) {
      showScreen("result");
      renderSummary(state.summary, state.projectIntent);
    } else if (state.messages.length > 0) {
      showScreen("dialog");
    } else {
      showScreen("start");
    }

    renderConversation(state.messages);
    renderFacts(state.summary?.knownFacts || []);

    if (
      state.attachments.length > 0 &&
      !activeObjectUrl &&
      attachmentPreview.hidden
    ) {
      const latest = state.attachments[state.attachments.length - 1];
      attachmentPreview.replaceChildren(fileCard(latest.name, latest.size));
      attachmentPreview.hidden = false;
    }
  }

  function renderConversation(messages) {
    conversationHistory.replaceChildren();
    messages.forEach((message) => {
      const item = document.createElement("article");
      item.className = `message message-${message.role}`;
      if (message.kind === "attachment") {
        item.classList.add("message-attachment");
      }
      const content = document.createElement("div");
      const label = document.createElement("span");
      label.className = "message-meta";
      label.textContent = message.role === "assistant" ? "YarnAI" : "Ты";
      const text = document.createElement("span");
      text.textContent = message.text;
      content.append(label, text);
      item.append(content);
      conversationHistory.append(item);
    });
    conversationHistory.scrollTop = conversationHistory.scrollHeight;
  }

  function renderFacts(entries) {
    knownFacts.replaceChildren();
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-facts";
      empty.textContent = "Здесь появятся сведения из твоих ответов.";
      knownFacts.append(empty);
      return;
    }
    entries.forEach(({ label, value, status }) => {
      const fact = document.createElement("div");
      fact.className = "fact";
      fact.dataset.status = status || "known";
      const labelElement = document.createElement("span");
      labelElement.className = "fact-label";
      labelElement.textContent = label;
      const valueElement = document.createElement("span");
      valueElement.className = "fact-value";
      valueElement.textContent = value;
      fact.append(labelElement, valueElement);
      knownFacts.append(fact);
    });
  }

  function renderSummary(summary, projectIntent) {
    if (!summary || !projectIntent) {
      return;
    }
    const readiness = readinessApi.evaluateProjectReadiness(projectIntent);
    const statusCopy = {
      collecting: {
        label: "Собираем данные",
        title: "Проект ещё нужно уточнить",
      },
      ready_for_sample: {
        label: "Следующий этап — образец",
        title: "Проект понятен, пора проверить плотность",
      },
      ready_for_calculation: {
        label: "Готов к передаче",
        title: "Можно перейти к расчёту",
      },
      blocked: {
        label: "Нужна корректировка",
        title: "Расчёт пока заблокирован",
      },
    }[readiness.status];

    readinessStatus.dataset.state = readiness.status;
    readinessStatusLabel.textContent = statusCopy.label;
    readinessStatusTitle.textContent = statusCopy.title;
    readinessStatusDescription.textContent =
      readiness.nextAction.description;

    renderList(
      resultKnown,
      readiness.knownFacts.map(
        (fact) => `${fact.label} — ${fact.value}`,
      ),
      "Пока нет подтверждённых данных.",
    );
    renderList(
      resultAssumptions,
      readiness.assumptions.map((assumption) => {
        const reason = assumption.reason ? `: ${assumption.reason}` : "";
        return `${assumption.label} — ${assumption.value}${reason}`;
      }),
      "Предположений нет.",
    );
    resultAssumptionsBlock.hidden = readiness.assumptions.length === 0;
    renderList(
      resultMissing,
      readiness.missingRequired.map(
        (item) => `${item.label} — ${item.reason}`,
      ),
      "Обязательные параметры собраны.",
    );
    resultMissingBlock.hidden = readiness.missingRequired.length === 0;
    renderList(
      resultOptional,
      readiness.missingOptional.map(
        (item) => `${item.label} — ${item.reason}`,
      ),
      "Дополнительных уточнений нет.",
    );
    resultOptionalBlock.hidden = readiness.missingOptional.length === 0;
    renderList(
      resultBlockers,
      readiness.blockers.map((blocker) => blocker.message),
      "Блокирующих ограничений нет.",
    );
    resultBlockersBlock.hidden = readiness.blockers.length === 0;

    renderSwatchAssistant(readiness, projectIntent);

    calculationPlanTitle.textContent = readiness.calculationPlan.title;
    calculationPlanDescription.textContent =
      readiness.calculationPlan.description;
    renderList(
      calculationPlanOutputs,
      readiness.calculationPlan.outputs,
      "Результат расчёта ещё не определён.",
    );
    renderList(
      calculationPlanLimits,
      readiness.calculationPlan.notIncluded,
      "Ограничений нет.",
    );

    resultWarning.textContent = readiness.nextAction.description;
    resultWarning.dataset.state =
      readiness.status === "ready_for_calculation" ? "complete" : "missing";
    continueButton.hidden =
      readiness.nextAction.type !== "continue_dialog" || !summary.canContinue;
    continueButton.textContent = readiness.nextAction.label;
    openCalculatorLink.hidden =
      readiness.nextAction.type !== "open_calculator";
    if (readiness.nextAction.href) {
      openCalculatorLink.href = calculatedProjects?.prepareCalculatorHandoff(
        readiness.nextAction.href,
        projectIntent,
        getSessionStorage(),
      ) ?? readiness.nextAction.href;
      openCalculatorLink.textContent = readiness.nextAction.label;
    }
  }

  async function initializeSavedProjects() {
    if (!projectSystem || !calculatedProjects) {
      showSavedProjectsError(
        "Список проектов временно недоступен. Новый расчёт можно начать ниже.",
      );
      return;
    }
    try {
      const repository = new projectSystem.ProjectRepository();
      await repository.initialize();
      const projects = await repository.listProjects({ section: "active" });
      const entries = await Promise.all(
        projects.map(async (project) => {
          try {
            const aggregate = await repository.getProject(project.project_id);
            return {
              project,
              inspection: calculatedProjects.inspectAggregate(aggregate),
              stepInspection: firstKnittingStep?.inspectAggregate(aggregate),
            };
          } catch (error) {
            return {
              project,
              inspection: {
                state: "invalid",
                message:
                  error?.userMessage ||
                  "Запись проекта повреждена. Она не была удалена.",
              },
              stepInspection: null,
            };
          }
        }),
      );
      renderSavedProjects(entries);
      savedProjectsLoading.hidden = true;
      savedProjectsEmpty.hidden = entries.length > 0;
      savedProjectsList.hidden = entries.length === 0;
      await repository.close();
    } catch {
      showSavedProjectsError(
        "Не удалось прочитать локальные проекты. Новый расчёт можно начать ниже.",
      );
    }
  }

  function renderSavedProjects(entries) {
    const formatter = new Intl.DateTimeFormat("ru", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    savedProjectsList.replaceChildren(
      ...entries.map(({ project, inspection, stepInspection }) => {
        const card = document.createElement("article");
        card.className = "saved-project-card";
        card.dataset.projectId = project.project_id;

        const content = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = project.title;
        const meta = document.createElement("p");
        meta.className = "saved-project-meta";
        const garment =
          inspection.garmentType ||
          inspection.structured?.garment_type ||
          "тип изделия не указан";
        const stepStages = {
          not_started: "Первый шаг готов",
          in_progress: "Набор петель в работе",
          completed: "Набор петель завершён",
          blocked: "Первый шаг заблокирован",
        };
        const stage =
          stepInspection?.state === "ready"
            ? stepStages[stepInspection.step.status]
            : inspection.state === "ready" || inspection.state === "legacy"
              ? calculatedProjects.stageLabel(inspection.stage)
              : inspection.state === "draft"
                ? "Черновик"
                : "Требуется восстановление";
        meta.textContent =
          `${garment} · ${stage} · изменён ` +
          formatter.format(new Date(project.updated_at));

        const summary = document.createElement("p");
        summary.className = "saved-project-summary";
        if (stepInspection?.state === "ready") {
          summary.textContent = firstKnittingStep.progressSummary(
            stepInspection.step,
          );
        } else {
          summary.textContent =
            inspection.state === "ready" || inspection.state === "legacy"
              ? calculatedProjects.resultSummary(inspection.result)
              : inspection.message;
        }
        content.append(title, meta, summary);

        const link = document.createElement("a");
        link.className = "saved-project-continue";
        link.href = firstKnittingStep?.continueDestination(
          inspection,
          stepInspection,
          project.project_id,
        ) ?? `/calculator?project=${encodeURIComponent(project.project_id)}`;
        link.textContent =
          stepInspection?.state === "ready" &&
          stepInspection.step.status === "not_started"
            ? "Начать"
            : stepInspection?.state === "ready" &&
                stepInspection.step.status === "completed"
              ? "Открыть итог"
              : "Продолжить";
        card.append(content, link);
        return card;
      }),
    );
  }

  function showSavedProjectsError(message) {
    savedProjectsLoading.hidden = true;
    savedProjectsEmpty.hidden = true;
    savedProjectsList.hidden = true;
    savedProjectsError.textContent = message;
    savedProjectsError.hidden = false;
  }

  function getSessionStorage() {
    try {
      return globalObject.sessionStorage;
    } catch {
      return null;
    }
  }

  function renderSwatchAssistant(readiness, projectIntent) {
    const visible = readiness.status === "ready_for_sample";
    swatchAssistant.hidden = !visible;
    if (!visible) {
      return;
    }
    const guide = swatchApi.instructionsFor(projectIntent);
    swatchAssistantTitle.textContent = guide.title;
    swatchAssistantIntroduction.textContent =
      `Для расчёта нужна фактическая плотность полотна из пряжи «${guide.yarn}». ` +
      "Помощник проверит подготовку и согласованность измерений.";
    swatchAssistantSteps.replaceChildren();
    guide.steps.forEach((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      swatchAssistantSteps.append(item);
    });
  }

  function renderList(element, values, emptyText) {
    element.replaceChildren();
    const items = values.length > 0 ? values : [emptyText];
    items.forEach((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      if (values.length === 0) {
        item.className = "empty-summary-item";
      }
      element.append(item);
    });
  }

  function fileCard(name, size) {
    const card = document.createElement("div");
    card.className = "file-card";
    const icon = document.createElement("span");
    icon.className = "file-card-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "📄";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = name;
    const meta = document.createElement("span");
    meta.textContent = `${formatBytes(size)} · содержимое не распознаётся`;
    details.append(title, meta);
    card.append(icon, details);
    return card;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) {
      return `${value} Б`;
    }
    if (value < 1024 * 1024) {
      return `${Math.round(value / 1024)} КБ`;
    }
    return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
  }
})(typeof window !== "undefined" ? window : globalThis);
