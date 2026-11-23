"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const reader = require("../src/yarnai/static/pattern-source-instruction-evidence.js");

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
