"use strict";

(function exposeFirstUserFlow(globalObject) {
  const STORAGE_KEY = "yarnai:first-user-flow:stage1";
  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const STATE_VERSION = 1;

  const SOURCE_LABELS = {
    photo: "Фотография",
    pattern: "Схема или описание",
    text: "Рассказ словами",
  };

  const ITEM_PATTERNS = [
    ["кардиган", /кардиган/i],
    ["свитер", /свитер|джемпер|пуловер/i],
    ["жилет", /жилет/i],
    ["платье", /плать/i],
    ["топ", /\bтоп\b/i],
    ["шапка", /шапк|берет/i],
    ["шарф", /шарф|снуд/i],
    ["носки", /нос(?:ки|ок)/i],
    ["варежки", /вареж|перчат/i],
    ["плед", /плед|покрывал/i],
    ["игрушка", /игруш|амигуруми/i],
  ];

  const WEARABLE_PATTERN =
    /кардиган|свитер|джемпер|пуловер|жилет|плать|топ|шапк|берет|нос|вареж|перчат/i;

  function cleanText(value, maximum = 240) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maximum);
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function questionCount(text) {
    return (String(text).match(/\?/g) || []).length;
  }

  function ensureOneQuestion(text) {
    if (questionCount(text) <= 1) {
      return text;
    }
    let seen = false;
    return String(text).replace(/\?/g, () => {
      if (!seen) {
        seen = true;
        return "?";
      }
      return ".";
    });
  }

  function newState() {
    return {
      version: STATE_VERSION,
      sourceType: null,
      sources: [],
      attachments: [],
      facts: {},
      messages: [],
      currentQuestion: null,
      phase: "idle",
    };
  }

  function assistantMessage(text) {
    return {
      role: "assistant",
      kind: "text",
      text: ensureOneQuestion(text),
      createdAt: new Date().toISOString(),
    };
  }

  function userMessage(text, kind = "text", attachment = null) {
    return {
      role: "user",
      kind,
      text: cleanText(text, 2000),
      attachment: attachment ? copy(attachment) : null,
      createdAt: new Date().toISOString(),
    };
  }

  function detectItem(text) {
    for (const [label, pattern] of ITEM_PATTERNS) {
      if (pattern.test(text)) {
        return label;
      }
    }
    return null;
  }

  function detectSize(text) {
    const named = text.match(
      /(?:размер|ношу|обычно)\s*(?:—|:)?\s*(XXS|XS|S|M|L|XL|XXL|\d{2,3})\b/i,
    );
    if (named) {
      return named[1].toUpperCase();
    }
    const standalone = text.match(/\b(XXS|XS|S|M|L|XL|XXL)\b/i);
    return standalone ? standalone[1].toUpperCase() : null;
  }

  function detectYarnAmount(text) {
    const amount = text.match(
      /(\d{2,4})\s*(?:грамм(?:а|ов)?|метр(?:а|ов)?|гр|г)(?=\s|[.,!?]|$)/i,
    );
    return amount ? cleanText(amount[0], 80) : null;
  }

  function isAffirmative(text) {
    return /^(?:да|верно|всё верно|правильно|точно|ага|угу)\b/i.test(
      cleanText(text),
    );
  }

  function isNegative(text) {
    return /^(?:нет|неверно|не совсем|не так)\b/i.test(cleanText(text));
  }

  function learnGeneralFacts(facts, text) {
    const item = detectItem(text);
    if (item) {
      facts.item = item;
    }

    if (/для\s+себя|мне\b/i.test(text)) {
      facts.recipient = "для себя";
    } else {
      const recipient = text.match(
        /для\s+(реб[её]нка|дочери|сына|мамы|папы|мужа|жены|подруги|мужчины|женщины)/i,
      );
      if (recipient) {
        facts.recipient = cleanText(recipient[0], 100);
      }
    }

    const size = detectSize(text);
    if (size) {
      facts.size = size;
    }

    if (/пряж/i.test(text)) {
      if (/\bнет\b|пока\s+нет|не\s+купил/i.test(text)) {
        facts.yarnStatus = "no";
      } else if (/есть|имеется|купил|взял|нашл/i.test(text)) {
        facts.yarnStatus = "yes";
      }
      const amount = detectYarnAmount(text);
      if (amount) {
        facts.yarnStatus = "yes";
        facts.yarnAmount = amount;
      }
      const description = text.match(
        /(?:пряж[аи]|из)\s+(?:есть\s+)?([^.!?]{3,100})/i,
      );
      if (description && !/^(?:нет|пока нет)$/i.test(description[1].trim())) {
        facts.yarnDescription = cleanText(description[1], 120);
      }
    }

    if (/реглан/i.test(text) && !/не\s+реглан/i.test(text)) {
      facts.construction = "реглан";
    } else if (/втачн/i.test(text)) {
      facts.construction = "втачной рукав";
    } else if (/спущенн\w*\s+плеч/i.test(text)) {
      facts.construction = "спущенное плечо";
    }
  }

  function applyCorrection(facts, text) {
    if (/не\s+(?:будет\s+)?реглан|это\s+не\s+реглан/i.test(text)) {
      const alternative = text.match(
        /не\s+реглан[\s,.!]*(?:а|но)\s+([^.!?]+)/i,
      );
      facts.construction = alternative
        ? cleanText(alternative[1], 120)
        : "не реглан";
      return {
        handled: true,
        acknowledgement: "Понял: конструкция не реглан.",
        question: alternative
          ? null
          : {
              id: "construction",
              text: "Как должна быть устроена линия плеча или рукав?",
            },
      };
    }

    if (/спин\w*.*(?:друг|отлич)/i.test(text)) {
      facts.back = "будет другой";
      return {
        handled: true,
        acknowledgement: "Понял: спинка должна отличаться от показанного варианта.",
        question: {
          id: "backDetails",
          text: "Чем именно должна отличаться спинка?",
        },
      };
    }

    if (/(?:я\s+)?не\s+(?:хочу|нуж)/i.test(text)) {
      facts.correction = cleanText(text, 180);
      return {
        handled: true,
        acknowledgement: "Спасибо, исправление записал.",
        question: null,
      };
    }

    return { handled: false, acknowledgement: "", question: null };
  }

  function learnExpectedFact(facts, questionId, text) {
    const answer = cleanText(text, 500);
    if (!answer) {
      return;
    }

    if (questionId === "item" && !facts.item) {
      facts.item = answer;
    } else if (questionId === "recipient") {
      facts.recipient = answer;
    } else if (questionId === "size") {
      facts.size = detectSize(answer) || answer;
    } else if (questionId === "preserve") {
      facts.preserve = answer;
    } else if (questionId === "adaptation") {
      facts.desiredChanges = answer;
    } else if (questionId === "desiredFeatures") {
      facts.desiredFeatures = answer;
    } else if (questionId === "yarnAvailability") {
      if (isNegative(answer) || /пока\s+нет|не\s+купил/i.test(answer)) {
        facts.yarnStatus = "no";
      } else {
        facts.yarnStatus = "yes";
        if (!/^(?:да|есть|ага|угу)$/i.test(answer)) {
          facts.yarnDescription = answer;
        }
      }
    } else if (questionId === "yarnDescription") {
      facts.yarnDescription = answer;
    } else if (questionId === "yarnAmount") {
      facts.yarnAmount = detectYarnAmount(answer) || answer;
    } else if (questionId === "construction") {
      facts.construction = facts.construction || answer;
    } else if (questionId === "backDetails") {
      facts.backDetails = answer;
    } else if (questionId === "correction") {
      facts.correction = answer;
    }
  }

  function nextQuestion(state) {
    const { facts, sourceType } = state;

    if (!facts.item) {
      return {
        id: "item",
        text:
          sourceType === "text"
            ? "Расскажи, что ты хочешь связать?"
            : "Что именно ты хочешь связать по этому материалу?",
      };
    }

    if (WEARABLE_PATTERN.test(facts.item) && !facts.recipient) {
      return {
        id: "recipient",
        text: "Для кого будет эта вещь?",
      };
    }

    if (WEARABLE_PATTERN.test(facts.item) && !facts.size) {
      return {
        id: "size",
        text: "Какой обычный размер носит этот человек?",
      };
    }

    if (sourceType === "photo" && !facts.preserve) {
      return {
        id: "preserve",
        text: "Что в этой вещи особенно важно сохранить?",
      };
    }

    if (sourceType === "pattern" && !facts.desiredChanges) {
      return {
        id: "adaptation",
        text: "Что в этой схеме нужно оставить как есть, а что изменить?",
      };
    }

    if (sourceType === "text" && !facts.desiredFeatures) {
      return {
        id: "desiredFeatures",
        text: "Каким должен получиться результат?",
      };
    }

    if (!facts.yarnStatus) {
      return {
        id: "yarnAvailability",
        text: "Пряжа для этой вещи уже есть?",
      };
    }

    if (facts.yarnStatus === "yes" && !facts.yarnDescription) {
      return {
        id: "yarnDescription",
        text: "Что известно об этой пряже?",
      };
    }

    if (facts.yarnStatus === "yes" && !facts.yarnAmount) {
      return {
        id: "yarnAmount",
        text: "Сколько этой пряжи у тебя есть?",
      };
    }

    if (facts.back === "будет другой" && !facts.backDetails) {
      return {
        id: "backDetails",
        text: "Чем именно должна отличаться спинка?",
      };
    }

    return {
      id: "confirm",
      text: "Я всё верно понял?",
    };
  }

  function shortSummary(facts) {
    const parts = [];
    if (facts.item) {
      parts.push(`изделие — ${facts.item}`);
    }
    if (facts.recipient) {
      parts.push(facts.recipient);
    }
    if (facts.size) {
      parts.push(`размер — ${facts.size}`);
    }
    if (facts.preserve) {
      parts.push(`сохранить — ${facts.preserve}`);
    }
    if (facts.desiredChanges) {
      parts.push(`изменить — ${facts.desiredChanges}`);
    }
    if (facts.desiredFeatures) {
      parts.push(`результат — ${facts.desiredFeatures}`);
    }
    if (facts.yarnStatus === "no") {
      parts.push("пряжа пока не выбрана");
    } else if (facts.yarnDescription) {
      parts.push(`пряжа — ${facts.yarnDescription}`);
    }
    if (facts.yarnAmount) {
      parts.push(`количество — ${facts.yarnAmount}`);
    }
    if (facts.construction) {
      parts.push(`конструкция — ${facts.construction}`);
    }
    if (facts.back) {
      parts.push(
        facts.backDetails
          ? `спинка — ${facts.backDetails}`
          : `спинка — ${facts.back}`,
      );
    }
    return parts.join("; ");
  }

  class RuleBasedDialogueProvider {
    startTurn(state) {
      let introduction;
      if (state.sourceType === "photo") {
        introduction =
          "Я получил фотографию.\n\nАнализ изображения пока работает как прототип: я не распознаю детали автоматически. Чтобы помочь составить технологию вязания, мне нужно понять несколько вещей.";
      } else if (state.sourceType === "pattern") {
        introduction =
          "Я получил схему или описание.\n\nРазбор файла пока работает как прототип: я не читаю его содержимое автоматически. Давай уточним только то, что нужно для твоей задачи.";
      } else {
        introduction =
          "Можно описать идею обычными словами — профессиональные термины не нужны.";
      }
      const question = nextQuestion(state);
      return {
        facts: copy(state.facts),
        phase: "active",
        question,
        text: `${introduction}\n\n${question.text}`,
      };
    }

    attachmentTurn(state, attachment) {
      const kind =
        attachment.kind === "photo" ? "фотографию" : "схему или описание";
      const prototypeNote =
        attachment.kind === "photo"
          ? "Изображение показано в диалоге, но автоматического распознавания пока нет."
          : "Файл показан в диалоге, но автоматического разбора пока нет.";
      const question = state.currentQuestion || nextQuestion(state);
      return {
        facts: copy(state.facts),
        phase: state.phase === "completed" ? "active" : state.phase,
        question,
        text: `Я добавил ${kind}. ${prototypeNote}\n\n${question.text}`,
      };
    }

    nextTurn(state, text) {
      const facts = copy(state.facts);
      const correction = applyCorrection(facts, text);

      if (!correction.handled) {
        learnGeneralFacts(facts, text);
        learnExpectedFact(facts, state.currentQuestion?.id, text);
      }

      if (
        state.currentQuestion?.id === "confirm" &&
        !correction.handled &&
        isAffirmative(text)
      ) {
        return {
          facts,
          phase: "completed",
          question: null,
          text:
            "Отлично, намерение зафиксировано. На следующем этапе из этих сведений можно будет собрать личный план вязания. Сейчас это UX-прототип, поэтому расчёт и распознавание ещё не запускаются.",
        };
      }

      if (
        state.currentQuestion?.id === "confirm" &&
        !correction.handled &&
        isNegative(text)
      ) {
        const question = {
          id: "correction",
          text: "Что именно я понял неверно?",
        };
        return {
          facts,
          phase: "active",
          question,
          text: `Хорошо, не буду считать это подтверждённым.\n\n${question.text}`,
        };
      }

      let question = correction.question;
      if (!question) {
        const nextState = { ...state, facts };
        question = nextQuestion(nextState);
      }

      const summary = shortSummary(facts);
      let acknowledgement = correction.acknowledgement;
      if (!acknowledgement && summary) {
        acknowledgement = `Пока я понял так: ${summary}.`;
      }
      if (!acknowledgement) {
        acknowledgement = "Спасибо, продолжаем.";
      }

      return {
        facts,
        phase: "active",
        question,
        text: `${acknowledgement}\n\n${question.text}`,
      };
    }
  }

  class DialogueEngine {
    constructor(provider = new RuleBasedDialogueProvider(), state = null) {
      if (
        !provider ||
        typeof provider.startTurn !== "function" ||
        typeof provider.nextTurn !== "function"
      ) {
        throw new TypeError("Dialogue provider must implement startTurn and nextTurn.");
      }
      this.provider = provider;
      this.state = state ? this._validatedState(state) : newState();
    }

    _validatedState(value) {
      if (
        !value ||
        value.version !== STATE_VERSION ||
        !Array.isArray(value.messages) ||
        !value.facts ||
        typeof value.facts !== "object"
      ) {
        throw new TypeError("Saved dialogue state is invalid.");
      }
      const state = copy(value);
      state.sources = Array.isArray(state.sources) ? state.sources : [];
      state.attachments = Array.isArray(state.attachments)
        ? state.attachments
        : [];
      return state;
    }

    _applyTurn(turn) {
      if (!turn || typeof turn.text !== "string") {
        throw new TypeError("Dialogue provider returned an invalid turn.");
      }
      if (questionCount(turn.text) > 1) {
        throw new Error("Assistant turn must contain no more than one question.");
      }
      this.state.facts = copy(turn.facts || this.state.facts);
      this.state.phase = turn.phase || "active";
      this.state.currentQuestion = turn.question ? copy(turn.question) : null;
      this.state.messages.push(assistantMessage(turn.text));
      return copy(this.state);
    }

    start(sourceType, attachment = null) {
      if (!SOURCE_LABELS[sourceType]) {
        throw new TypeError("Unknown dialogue source.");
      }
      this.state = newState();
      this.state.sourceType = sourceType;
      this.state.sources = [sourceType];
      this.state.phase = "active";
      if (attachment) {
        const metadata = this._attachmentMetadata(sourceType, attachment);
        this.state.attachments.push(metadata);
        this.state.messages.push(
          userMessage(`${SOURCE_LABELS[sourceType]}: ${metadata.name}`, "attachment", metadata),
        );
      }
      return this._applyTurn(this.provider.startTurn(copy(this.state)));
    }

    submit(text) {
      const cleaned = cleanText(text, 2000);
      if (!cleaned) {
        throw new TypeError("Message must not be empty.");
      }
      if (!this.state.sourceType) {
        throw new Error("Dialogue has not been started.");
      }
      this.state.messages.push(userMessage(cleaned));
      return this._applyTurn(
        this.provider.nextTurn(copy(this.state), cleaned),
      );
    }

    addAttachment(kind, attachment) {
      if (!["photo", "pattern"].includes(kind)) {
        throw new TypeError("Unknown attachment kind.");
      }
      const metadata = this._attachmentMetadata(kind, attachment);
      if (!this.state.sourceType) {
        return this.start(kind, metadata);
      }
      if (!this.state.sources.includes(kind)) {
        this.state.sources.push(kind);
      }
      this.state.attachments.push(metadata);
      this.state.messages.push(
        userMessage(`${SOURCE_LABELS[kind]}: ${metadata.name}`, "attachment", metadata),
      );
      const provider = this.provider;
      if (typeof provider.attachmentTurn === "function") {
        return this._applyTurn(provider.attachmentTurn(copy(this.state), metadata));
      }
      return copy(this.state);
    }

    _attachmentMetadata(kind, attachment) {
      const name = cleanText(attachment?.name, 180);
      if (!name) {
        throw new TypeError("Attachment name is required.");
      }
      return {
        kind,
        name,
        type: cleanText(attachment.type || "", 120),
        size: Number.isFinite(Number(attachment.size))
          ? Number(attachment.size)
          : 0,
      };
    }

    snapshot() {
      return copy(this.state);
    }

    serialize() {
      return JSON.stringify(this.state);
    }

    static restore(serialized, provider = new RuleBasedDialogueProvider()) {
      return new DialogueEngine(provider, JSON.parse(serialized));
    }
  }

  const publicApi = {
    DialogueEngine,
    MAX_FILE_BYTES,
    RuleBasedDialogueProvider,
    SOURCE_LABELS: copy(SOURCE_LABELS),
    STATE_VERSION,
    questionCount,
  };
  globalObject.YarnAIFirstUserFlow = publicApi;

  if (typeof document === "undefined") {
    return;
  }

  const startScreen = document.querySelector("#start-screen");
  const dialogScreen = document.querySelector("#dialog-screen");
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
  photoInput.addEventListener("change", () => handleFileChoice("photo", photoInput));
  patternInput.addEventListener("change", () =>
    handleFileChoice("pattern", patternInput),
  );
  newDialogButton.addEventListener("click", resetDialogue);
  messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text) {
      return;
    }
    engine.submit(text);
    messageInput.value = "";
    persistAndRender();
    messageInput.focus();
  });
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      messageForm.requestSubmit();
    }
  });

  if (engine.snapshot().messages.length > 0) {
    openDialog();
    render();
  }

  function restoreEngine() {
    try {
      const serialized = globalObject.localStorage?.getItem(STORAGE_KEY);
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
    } catch {
      // The live dialogue remains usable when browser storage is unavailable.
    }
    render();
  }

  function openDialog() {
    startScreen.hidden = true;
    dialogScreen.hidden = false;
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
    dialogScreen.hidden = true;
    startScreen.hidden = false;
    try {
      globalObject.localStorage?.removeItem(STORAGE_KEY);
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
    conversationHistory.replaceChildren();
    state.messages.forEach((message) => {
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
    renderFacts(state.facts);

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

  function renderFacts(facts) {
    const entries = [
      ["Изделие", facts.item],
      ["Для кого", facts.recipient],
      ["Размер", facts.size],
      ["Важно сохранить", facts.preserve],
      ["Желаемые изменения", facts.desiredChanges],
      ["Результат", facts.desiredFeatures],
      [
        "Пряжа",
        facts.yarnStatus === "no"
          ? "пока не выбрана"
          : facts.yarnDescription,
      ],
      ["Количество пряжи", facts.yarnAmount],
      ["Конструкция", facts.construction],
      ["Спинка", facts.backDetails || facts.back],
    ].filter((entry) => entry[1]);

    knownFacts.replaceChildren();
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-facts";
      empty.textContent = "Здесь появятся только сведения из твоих ответов.";
      knownFacts.append(empty);
      return;
    }
    entries.forEach(([label, value]) => {
      const fact = document.createElement("div");
      fact.className = "fact";
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
