"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const reader = require("../src/yarnai/static/pattern-source-instruction-evidence.js");
const review = require("../src/yarnai/static/pattern-technology-review.js");

test("taper uses paired side decreases, keeps the chest and leaves a plain final round", () => {
  const source = { valid: true, facts: { bodyStart: 200, bodyLoss: 4, preHem: 196, hem: 220, yokeCm: 20, hemStartCm: 50, firstDecreaseCm: 5 } };
  const gauge = { stitches: 20, rows: 25, per: 10, unit: "cm" };
  const input = { chest: 88, belt: 78, hips: 80, finishedChest: 100, minHem: 89, maxHem: 93 };
  const result = review.planTwoPhaseBodyTaper(source, gauge, input);
  assert.deepEqual(result.options.map((o) => o.plain), [184, 180]);
  for (const o of result.options) {
    assert.equal(200 - o.rounds.length * 4, o.plain);
    assert.equal(o.rib % 2, 0);
    assert.equal(o.rounds.at(-1), result.bodyRounds - 1);
    assert.ok(o.rounds.every((n, i) => !i || n - o.rounds[i-1] >= 2));
  }
  assert.equal(review.planTwoPhaseBodyTaper(source, gauge, { ...input, finishedChest: 120 }), null);
  assert.equal(review.planTwoPhaseBodyTaper({ ...source, valid: false }, gauge, input), null);
});

test("size selection retains fractions, common counts and the section order", () => {
  const text = "SIZE:\nS - M - L\nNECK EDGE:\nCast on 60-64-68 stitches. Rib for 3½-4-4½ cm.\nBODY:\nDecrease 4 stitches every 3 cm.";
  const reading = reader.readGradedSource(text, "L");
  assert.equal(reading.sections[0].projected, "Cast on 68 stitches. Rib for 4½ cm.");
  assert.deepEqual(reading.sections[0].vectors.map((vector) => vector.normalizedValue), [68, 4.5]);
  assert.equal(reading.sections[1].projected, "Decrease 4 stitches every 3 cm.");
  assert.equal(reader.readGradedSource(text, "XL"), null);
});

test("a mismatched series is preserved and flagged for review", () => {
  const text = "SIZE: S - M - L\nNECK EDGE:\nCast on 60-64-68-72 stitches.";
  const [section] = reader.readGradedSource(text, "M").sections;
  assert.match(section.projected, /60-64-68-72/);
  assert.equal(section.vectors[0].selectionStatus, "ambiguous");
});
