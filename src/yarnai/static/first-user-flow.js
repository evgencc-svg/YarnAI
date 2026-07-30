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
  const resultWarning = document.querySelector("#result-warning");
  const continueButton = document.querySelector("#continue-dialog-button");
  const summaryCorrectionForm = document.querySelector(
    "#summary-correction-form",
  );
  const summaryCorrectionInput = document.querySelector(
    "#summary-correction-input",
  );
  const summaryNewDialogButton = document.querySelector(
    "#summary-new-dialog-button",
  );

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
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      messageForm.requestSubmit();
    }
  });

  if (engine.snapshot().messages.length > 0) {
    render();
  }

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
      renderSummary(state.summary);
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

  function renderSummary(summary) {
    if (!summary) {
      return;
    }
    renderList(resultKnown, summary.knownItems, "Пока нет подтверждённых данных.");
    renderList(
      resultAssumptions,
      summary.assumptions,
      "Предположений нет.",
    );
    resultAssumptionsBlock.hidden = summary.assumptions.length === 0;
    renderList(
      resultMissing,
      summary.missingItems.map((item) => item.label),
      "Обязательные параметры собраны.",
    );
    resultMissingBlock.hidden = summary.missingItems.length === 0;
    resultWarning.textContent = summary.warning;
    resultWarning.dataset.state = summary.complete ? "complete" : "missing";
    continueButton.hidden = !summary.canContinue;
    continueButton.textContent = summary.complete
      ? "Готово"
      : "Продолжить";
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
