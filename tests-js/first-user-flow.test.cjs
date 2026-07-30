"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

require("../src/yarnai/static/first-user-flow.js");

const {
  DialogueEngine,
  RuleBasedDialogueProvider,
  questionCount,
} = global.YarnAIFirstUserFlow;

function lastAssistant(state) {
  return [...state.messages]
    .reverse()
    .find((message) => message.role === "assistant");
}

function answer(engine, text) {
  const state = engine.submit(text);
  assert.ok(
    questionCount(lastAssistant(state).text) <= 1,
    "assistant must ask no more than one question per turn",
  );
  return state;
}

test("photo starts a prototype dialogue with one question", () => {
  const engine = new DialogueEngine();
  const state = engine.start("photo", {
    name: "sweater.jpg",
    type: "image/jpeg",
    size: 1024,
  });

  assert.equal(state.sourceType, "photo");
  assert.equal(state.attachments[0].name, "sweater.jpg");
  assert.equal(state.messages[0].kind, "attachment");
  assert.match(lastAssistant(state).text, /Я получил фотографию/);
  assert.match(lastAssistant(state).text, /прототип/i);
  assert.equal(questionCount(lastAssistant(state).text), 1);
  assert.equal(state.currentQuestion.id, "item");
});

test("known details skip irrelevant questions", () => {
  const engine = new DialogueEngine();
  engine.start("text");

  let state = answer(
    engine,
    "Хочу кардиган для себя, размер M, свободный и до середины бедра.",
  );
  assert.equal(state.facts.item, "кардиган");
  assert.equal(state.facts.recipient, "для себя");
  assert.equal(state.facts.size, "M");
  assert.equal(state.currentQuestion.id, "desiredFeatures");

  state = answer(engine, "Свободный, с карманами и длинными рукавами.");
  assert.equal(state.currentQuestion.id, "yarnAvailability");
  state = answer(engine, "Пряжа есть: 700 граммов полушерсти.");
  assert.equal(state.facts.yarnStatus, "yes");
  assert.equal(state.facts.yarnAmount, "700 граммов");
  assert.equal(state.currentQuestion.id, "confirm");
});

test("a rejected raglan assumption is corrected in natural language", () => {
  const engine = new DialogueEngine();
  engine.start("photo", {
    name: "idea.png",
    type: "image/png",
    size: 200,
  });
  answer(engine, "Свитер");

  const corrected = answer(engine, "Нет. Это не реглан.");
  assert.equal(corrected.facts.construction, "не реглан");
  assert.equal(corrected.currentQuestion.id, "construction");
  assert.match(lastAssistant(corrected).text, /не реглан/i);

  const continued = answer(engine, "Хочу втачной рукав.");
  assert.equal(continued.facts.construction, "втачной рукав");
  assert.equal(continued.currentQuestion.id, "recipient");
});

test("a different back triggers only the relevant follow-up", () => {
  const engine = new DialogueEngine();
  engine.start("text");
  const corrected = answer(engine, "Нет. Спинка будет другой.");

  assert.equal(corrected.facts.back, "будет другой");
  assert.equal(corrected.currentQuestion.id, "backDetails");
  assert.match(lastAssistant(corrected).text, /Чем именно/);

  const explained = answer(engine, "На спинке будет широкая коса.");
  assert.equal(explained.facts.backDetails, "На спинке будет широкая коса.");
});

test("dialogue history survives serialization", () => {
  const engine = new DialogueEngine();
  engine.start("pattern", {
    name: "pattern.pdf",
    type: "application/pdf",
    size: 4096,
  });
  answer(engine, "Жилет");

  const restored = DialogueEngine.restore(engine.serialize());
  assert.deepEqual(restored.snapshot(), engine.snapshot());
  assert.equal(restored.snapshot().messages.length, 4);
});

test("dialogue provider can be replaced without changing the engine", () => {
  const calls = [];
  const provider = {
    startTurn(state) {
      calls.push(["start", state.sourceType]);
      return {
        facts: {},
        phase: "active",
        question: { id: "custom", text: "Один вопрос?" },
        text: "Подключён другой источник ответа.\n\nОдин вопрос?",
      };
    },
    nextTurn(state, text) {
      calls.push(["next", text]);
      return {
        facts: { received: text },
        phase: "completed",
        question: null,
        text: "Ответ принят.",
      };
    },
  };
  const engine = new DialogueEngine(provider);

  engine.start("text");
  const state = engine.submit("Мой ответ");

  assert.deepEqual(calls, [
    ["start", "text"],
    ["next", "Мой ответ"],
  ]);
  assert.equal(state.facts.received, "Мой ответ");
  assert.equal(state.phase, "completed");
});

test("default provider conforms to the replaceable provider contract", () => {
  const provider = new RuleBasedDialogueProvider();
  assert.equal(typeof provider.startTurn, "function");
  assert.equal(typeof provider.nextTurn, "function");
  assert.equal(typeof provider.attachmentTurn, "function");
});
