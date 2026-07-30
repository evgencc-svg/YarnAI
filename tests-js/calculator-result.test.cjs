"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const calculator = require("../src/yarnai/static/calculator-result.js");
const {
  evaluateProjectReadiness,
} = require("../src/yarnai/static/project-readiness-engine.js");

function completeIntent() {
  return {
    schemaVersion: 1,
    goal: "связать свитер",
    garmentType: "свитер",
    recipient: "для взрослого",
    gender: null,
    ageGroup: "adult",
    size: null,
    style: null,
    construction: null,
    technique: "спицы",
    yarnKnown: true,
    yarn: "меринос",
    yarnAmount: null,
    sampleKnown: true,
    targetWidth: {
      value: 50,
      unit: "cm",
      sizeKind: "finished",
      raw: "50 см",
    },
    gaugeKnown: true,
    gauge: {
      stitches: 20,
      widthCm: 10,
      rows: null,
      heightCm: null,
      sourceMeasurementCount: 3,
      raw: "20 петель на 10 см",
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
  };
}

function successfulResult(overrides = {}) {
  return {
    status: "READY",
    axes: {
      width: {
        selected_candidate: {
          working_count: 100,
          actual_size_original_unit: "50",
          original_unit: "cm",
        },
      },
    },
    gauges: {
      width: {
        ready_count: "20",
        base_length_cm: "10",
        density_per_cm: "2",
        source: "personal_swatch",
        measurement_count: 3,
        quality: "canonical",
        canonical: true,
        swatch_context: {
          off_needles: "yes",
          processing_state: "after_intended_processing",
          fully_dry: "yes",
          rest_hours: 12,
          measurement_state: "relaxed",
        },
      },
    },
    ...overrides,
  };
}

test("successful calculator transfer is independent of URL parameter order", () => {
  const readiness = evaluateProjectReadiness(completeIntent());
  const original = new URL(readiness.nextAction.href, "https://yarnai.test");
  const reversed = [...original.searchParams.entries()].reverse();
  const transfer = calculator.readTransfer(
    `?${new URLSearchParams(reversed).toString()}`,
  );

  assert.equal(readiness.status, "ready_for_calculation");
  assert.equal(transfer.state, "ready");
  assert.equal(transfer.values["width-value"], "50");
  assert.equal(transfer.values["gauge-count"], "20");
});

test("missing calculator parameters do not produce a ready transfer", () => {
  assert.equal(calculator.readTransfer("").state, "absent");

  const transfer = calculator.readTransfer(
    "?width-value=50&gauge-count=20",
  );
  assert.equal(transfer.state, "missing");
  assert.ok(transfer.missing.includes("gauge-length"));
});

test("damaged calculator parameters are rejected before calculation", () => {
  const readiness = evaluateProjectReadiness(completeIntent());
  const url = new URL(readiness.nextAction.href, "https://yarnai.test");
  url.searchParams.set("gauge-count", "not-a-number");

  const transfer = calculator.readTransfer(url.search);

  assert.equal(transfer.state, "damaged");
  assert.deepEqual(transfer.damaged, ["gauge-count"]);
});

test("successful result exposes count, working width, gauge and swatch", () => {
  assert.deepEqual(calculator.resultDetails(successfulResult()), {
    workingCount: 100,
    workingWidth: { value: "50", unit: "cm" },
    gauge: {
      readyCount: "20",
      baseLengthCm: "10",
      densityPerCm: "2",
    },
    swatch: {
      source: "personal_swatch",
      measurementCount: 3,
      quality: "canonical",
      canonical: true,
      offNeedles: "yes",
      processingState: "after_intended_processing",
      fullyDry: "yes",
      restHours: 12,
      measurementState: "relaxed",
    },
  });
});

test("all calculator warnings remain available for display", () => {
  const warnings = calculator.diagnostics(
    [
      { reason: "Образец мал.", next_action: "Связать образец больше." },
      { reason: "Контекст отличается.", next_action: "Сверить пряжу." },
    ],
    "Проверьте расчёт.",
  );

  assert.deepEqual(warnings, [
    {
      reason: "Образец мал.",
      nextAction: "Связать образец больше.",
    },
    {
      reason: "Контекст отличается.",
      nextAction: "Сверить пряжу.",
    },
  ]);
});

test("calculator errors are converted to understandable display entries", () => {
  const errors = calculator.diagnostics(
    [{ reason: "Размер равен нулю.", next_action: "Проверьте мерку." }],
    "Исправьте данные.",
  );

  assert.deepEqual(errors, [
    {
      reason: "Размер равен нулю.",
      nextAction: "Проверьте мерку.",
    },
  ]);
  assert.equal(calculator.resultDetails({ status: "INPUT_ERROR" }), null);
});

test("full Smart Start to Calculator transfer preserves the core input", () => {
  const readiness = evaluateProjectReadiness(completeIntent());
  const transfer = calculator.readTransfer(
    new URL(readiness.nextAction.href, "https://yarnai.test").search,
  );

  assert.equal(readiness.nextAction.type, "open_calculator");
  assert.equal(transfer.state, "ready");
  assert.equal(
    Number(transfer.values["width-value"]),
    readiness.calculationInput.width.value,
  );
  assert.equal(
    Number(transfer.values["gauge-count"]),
    readiness.calculationInput.width.gauge.ready_count,
  );
  assert.equal(
    transfer.values.yarn,
    readiness.calculationInput.fabric_context.yarn,
  );
});
