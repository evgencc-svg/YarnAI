"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  assessSwatch,
  instructionsFor,
} = require("../src/yarnai/static/swatch-assistant.js");

function validInput(overrides = {}) {
  return {
    measurementWidthCm: 10,
    stitchMeasurements: [19, 20, 21],
    rows: 28,
    rowHeightCm: 10,
    context: {
      sameYarn: true,
      sameTools: true,
      samePattern: true,
      processed: true,
      fullyDry: true,
      relaxed: true,
    },
    ...overrides,
  };
}

test("prepared consistent measurements become a structured gauge", () => {
  const result = assessSwatch(validInput());

  assert.equal(result.ready, true);
  assert.equal(result.gauge.stitches, 20);
  assert.equal(result.gauge.widthCm, 10);
  assert.equal(result.gauge.rows, 28);
  assert.equal(result.gauge.sourceMeasurementCount, 3);
  assert.equal(result.gauge.context.processed, true);
  assert.deepEqual(
    result.gauge.measurements.map((item) => item.stitches),
    [19, 20, 21],
  );
});

test("assistant does not accept an unprepared sample", () => {
  const result = assessSwatch(
    validInput({
      context: {
        sameYarn: true,
        sameTools: false,
        samePattern: true,
        processed: false,
        fullyDry: true,
        relaxed: true,
      },
    }),
  );

  assert.equal(result.ready, false);
  assert.equal(result.gauge, null);
  assert.ok(
    result.errors.some(
      (error) =>
        error.code === "unconfirmed_sample_context" &&
        error.field === "sameTools",
    ),
  );
  assert.ok(result.errors.some((error) => error.field === "processed"));
});

test("measurements with more than ten percent spread must be repeated", () => {
  const result = assessSwatch(
    validInput({ stitchMeasurements: [18, 20, 22] }),
  );

  assert.equal(result.ready, false);
  assert.ok(
    result.errors.some((error) => error.code === "inconsistent_measurements"),
  );
});

test("instructions use the actual project yarn and existing sample state", () => {
  const guide = instructionsFor({
    yarn: "меринос",
    sampleKnown: true,
  });

  assert.equal(guide.title, "Измерим готовый образец");
  assert.equal(guide.yarn, "меринос");
  assert.match(guide.steps[0], /меринос/);
});
