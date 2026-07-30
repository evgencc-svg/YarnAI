"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

require("../src/yarnai/static/first-user-flow.js");

const {
  DialogueEngine,
  IntentProvider,
  ProjectUnderstandingEngine,
  RuleBasedDialogueProvider,
  RuleBasedProvider,
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

function completeSweaterDiscovery() {
  const engine = new ProjectUnderstandingEngine();
  engine.start("text");
  answer(
    engine,
    "Хочу мужской свитер размера L, свободный, реглан сверху, из шерстяной пряжи, 600 граммов.",
  );
  answer(engine, "Свободный свитер с высоким воротником.");
  const summary = answer(engine, "Да");
  assert.equal(summary.phase, "summary");
  return engine;
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

test("ProjectIntent is built as the single structured project description", () => {
  const engine = completeSweaterDiscovery();
  const intent = engine.getIntent();

  assert.equal(intent.schemaVersion, 1);
  assert.equal(intent.goal, "связать свитер");
  assert.equal(intent.garmentType, "свитер");
  assert.equal(intent.recipient, "для мужчины");
  assert.equal(intent.gender, "male");
  assert.equal(intent.size, "L");
  assert.equal(intent.style, "свободный");
  assert.equal(intent.construction, "реглан сверху");
  assert.equal(intent.technique, "спицы");
  assert.equal(intent.yarnKnown, true);
  assert.match(intent.yarn, /шерстяной пряжи/i);
  assert.equal(intent.yarnAmount, "600 граммов");
  assert.equal(intent.sourceType, "text");
  assert.equal(intent.fieldStatus.technique, "assumed");
});

test("missingInformation distinguishes discovery from calculation requirements", () => {
  const engine = completeSweaterDiscovery();
  const intent = engine.getIntent();
  const missing = new Map(
    intent.missingInformation.map((item) => [item.field, item]),
  );

  assert.equal(missing.has("garmentType"), false);
  assert.equal(missing.has("size"), false);
  assert.equal(missing.get("sampleKnown").stage, "technology");
  assert.equal(missing.get("gauge").requiredFor, "calculation");
  assert.match(missing.get("gauge").reason, /петли и ряды/i);
});

test("explicit corrections recalculate ProjectIntent and missing information", () => {
  const engine = completeSweaterDiscovery();
  let state = engine.correct(
    "Нет, это будет детский свитер. Размер будет XL. Это не реглан.",
  );

  assert.equal(state.projectIntent.garmentType, "свитер");
  assert.equal(state.projectIntent.ageGroup, "child");
  assert.equal(state.projectIntent.gender, null);
  assert.equal(state.projectIntent.size, "XL");
  assert.equal(state.projectIntent.construction, null);
  assert.deepEqual(state.projectIntent.excludedValues.construction, ["реглан"]);
  assert.ok(
    state.projectIntent.missingInformation.some(
      (item) => item.field === "construction",
    ),
  );
  assert.match(state.summary.knownItems[0], /детский свитер/i);

  state = engine.correct("Конструкция будет с втачным рукавом.");
  assert.equal(state.projectIntent.construction, "втачной рукав");
  assert.equal(
    state.projectIntent.missingInformation.some(
      (item) => item.field === "construction",
    ),
    false,
  );
});

test("assumptions are replaced when the user provides explicit information", () => {
  const engine = completeSweaterDiscovery();
  let intent = engine.getIntent();
  assert.ok(
    intent.assumptions.some((assumption) => assumption.field === "technique"),
  );

  const state = engine.correct("Вязать буду крючком.");
  intent = state.projectIntent;
  assert.equal(intent.technique, "крючок");
  assert.equal(intent.fieldStatus.technique, "known");
  assert.equal(
    intent.assumptions.some((assumption) => assumption.field === "technique"),
    false,
  );
});

test("Continue selects the first rule-applicable required question", () => {
  const engine = completeSweaterDiscovery();
  let state = engine.continue();

  assert.equal(state.phase, "active");
  assert.equal(state.dialogMode, "requirements");
  assert.equal(state.currentQuestion.id, "targetWidth");
  assert.match(state.currentQuestion.text, /готовая ширина/i);

  state = answer(engine, "50 см");
  assert.equal(state.projectIntent.targetWidth.value, 50);
  assert.equal(state.projectIntent.targetWidth.unit, "cm");
  state = engine.continue();
  assert.equal(state.currentQuestion.id, "sampleKnown");
  assert.match(state.currentQuestion.text, /контрольный образец/i);

  const withoutYarn = new ProjectUnderstandingEngine();
  withoutYarn.start("text");
  answer(withoutYarn, "Хочу связать шарф.");
  answer(withoutYarn, "Длинный классический шарф.");
  answer(withoutYarn, "Нет, пряжи пока нет.");
  answer(withoutYarn, "Да");
  const yarnQuestion = withoutYarn.continue();
  assert.equal(yarnQuestion.currentQuestion.id, "yarnChoice");
  assert.match(yarnQuestion.currentQuestion.text, /какую пряжу/i);
});

test("summary is a human-readable view model instead of a JSON dump", () => {
  const engine = completeSweaterDiscovery();
  const summary = engine.getSummary();

  assert.equal(summary.title, "Понял.");
  assert.ok(summary.knownItems.includes("мужской свитер"));
  assert.ok(summary.knownItems.includes("размер L"));
  assert.ok(
    summary.missingItems.some((item) => item.label === "плотность вязания"),
  );
  assert.match(summary.warning, /технологию вязания/i);
  assert.doesNotMatch(summary.knownItems.join(" "), /[{}"]/);
});

test("gauge answers update the summary and remove calculation gaps", () => {
  const engine = completeSweaterDiscovery();
  let state = engine.continue();
  assert.equal(state.currentQuestion.id, "targetWidth");

  state = answer(engine, "Готовая ширина детали 50 см.");
  assert.equal(state.phase, "summary");
  assert.deepEqual(state.projectIntent.targetWidth, {
    value: 50,
    unit: "cm",
    sizeKind: "finished",
    raw: "Готовая ширина детали 50 см",
  });

  state = engine.continue();
  assert.equal(state.currentQuestion.id, "sampleKnown");

  state = answer(engine, "Да, контрольный образец уже связан.");
  assert.equal(state.phase, "summary");
  assert.equal(state.projectIntent.sampleKnown, true);
  state = engine.continue();
  assert.equal(state.currentQuestion.id, "gauge");

  state = answer(engine, "20 петель и 28 рядов на 10 см.");
  assert.equal(state.projectIntent.gaugeKnown, true);
  assert.deepEqual(state.projectIntent.gauge, {
    stitches: 20,
    rows: 28,
    widthCm: 10,
    heightCm: 10,
    raw: "20 петель и 28 рядов на 10 см",
  });
  assert.equal(
    state.projectIntent.missingInformation.some(
      (item) => ["sampleKnown", "gauge"].includes(item.field),
    ),
    false,
  );
  assert.equal(state.summary.complete, true);
});

test("structured swatch measurements update ProjectIntent without dialogue parsing", () => {
  const engine = completeSweaterDiscovery();
  let state = engine.continue();
  state = answer(engine, "Готовая ширина детали 50 см.");

  state = engine.recordGauge({
    stitches: 20,
    widthCm: 10,
    rows: 28,
    heightCm: 10,
    sourceMeasurementCount: 3,
    measurements: [
      { stitches: 19, widthCm: 10 },
      { stitches: 20, widthCm: 10 },
      { stitches: 21, widthCm: 10 },
    ],
    context: {
      processed: true,
      fullyDry: true,
      relaxed: true,
      offNeedles: true,
      restHours: 12,
    },
  });

  assert.equal(state.phase, "summary");
  assert.equal(state.projectIntent.sampleKnown, true);
  assert.equal(state.projectIntent.gaugeKnown, true);
  assert.equal(state.projectIntent.gauge.sourceMeasurementCount, 3);
  assert.deepEqual(state.projectIntent.gauge.measurements[1], {
    stitches: 20,
    widthCm: 10,
  });
  assert.equal(state.summary.complete, true);
});

test("IntentProvider defines the replaceable provider boundary", () => {
  const provider = new RuleBasedProvider();

  assert.ok(provider instanceof IntentProvider);
  assert.equal(typeof provider.buildIntent, "function");
  assert.equal(typeof provider.selectNextQuestion, "function");
  assert.equal(typeof provider.continueTurn, "function");
});
