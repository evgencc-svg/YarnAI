"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  ProjectReadinessEngine,
  evaluateProjectReadiness,
} = require("../src/yarnai/static/project-readiness-engine.js");

function projectIntent(overrides = {}) {
  return {
    schemaVersion: 1,
    goal: "связать свитер",
    garmentType: "свитер",
    recipient: "для мужчины",
    gender: "male",
    ageGroup: "adult",
    size: "L",
    style: "свободный",
    construction: "реглан сверху",
    technique: "спицы",
    yarnKnown: true,
    yarn: "меринос",
    yarnAmount: "600 граммов",
    targetWidth: { value: 50, unit: "cm", sizeKind: "finished" },
    sampleKnown: true,
    gaugeKnown: true,
    gauge: {
      stitches: 20,
      rows: 28,
      widthCm: 10,
      heightCm: 10,
    },
    preferences: {},
    assumptions: [],
    fieldStatus: {
      garmentType: "known",
      technique: "known",
      yarn: "known",
      targetWidth: "known",
      sampleKnown: "known",
      gauge: "known",
    },
    ...overrides,
  };
}

test("invalid ProjectIntent returns a blocked readiness state", () => {
  const readiness = new ProjectReadinessEngine().evaluate(null);

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.blockers[0].code, "invalid_project_intent");
  assert.equal(readiness.calculationInput, null);
});

test("collecting separates confirmed facts, assumptions, and missing data", () => {
  const intent = projectIntent({
    targetWidth: null,
    sampleKnown: null,
    gaugeKnown: false,
    gauge: null,
    technique: "спицы",
    assumptions: [
      {
        field: "technique",
        value: "спицы",
        reason: "базовое предположение",
      },
    ],
    fieldStatus: {
      garmentType: "known",
      technique: "assumed",
      yarn: "known",
      targetWidth: "unknown",
      sampleKnown: "unknown",
      gauge: "unknown",
    },
  });

  const readiness = evaluateProjectReadiness(intent);

  assert.equal(readiness.status, "collecting");
  assert.ok(
    readiness.knownFacts.some((fact) => fact.field === "garmentType"),
  );
  assert.equal(
    readiness.knownFacts.some((fact) => fact.field === "technique"),
    false,
  );
  assert.ok(
    readiness.assumptions.some((item) => item.field === "technique"),
  );
  assert.ok(
    readiness.missingRequired.some((item) => item.field === "targetWidth"),
  );
  assert.equal(readiness.calculationInput, null);
});

test("a described project with no sample is ready for the sample step", () => {
  const readiness = evaluateProjectReadiness(
    projectIntent({
      sampleKnown: false,
      gaugeKnown: false,
      gauge: null,
    }),
  );

  assert.equal(readiness.status, "ready_for_sample");
  assert.equal(readiness.nextAction.type, "make_sample");
  assert.equal(readiness.calculationInput, null);
  assert.ok(
    readiness.missingRequired.some((item) => item.field === "gauge"),
  );
});

test("complete width data becomes an exact calculator input and link", () => {
  const intent = projectIntent();
  const before = structuredClone(intent);
  const readiness = evaluateProjectReadiness(intent);

  assert.equal(readiness.status, "ready_for_calculation");
  assert.deepEqual(intent, before, "readiness evaluation must not mutate intent");
  assert.equal(readiness.nextAction.type, "open_calculator");
  assert.match(readiness.nextAction.href, /^\/calculator\?/);
  assert.match(readiness.nextAction.href, /width-value=50/);
  assert.match(readiness.nextAction.href, /gauge-count=20/);
  assert.deepEqual(readiness.calculationInput.axes, ["width"]);
  assert.equal(readiness.calculationInput.width.value, 50);
  assert.equal(readiness.calculationInput.width.gauge.ready_count, 20);
  assert.equal(readiness.calculationInput.fabric_context.yarn, "меринос");
  assert.match(readiness.calculationPlan.description, /рабочее число петель/i);
  assert.ok(readiness.calculationPlan.notIncluded.includes("расход пряжи"));
  assert.ok(
    readiness.assumptions.some(
      (item) => item.field === "swatchDefaults",
    ),
  );
});

test("an explicitly unsupported technique blocks calculator transfer", () => {
  const readiness = evaluateProjectReadiness(
    projectIntent({ technique: "крючок" }),
  );

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.blockers[0].code, "unsupported_technique");
  assert.equal(readiness.calculationInput, null);
});
