"use strict";

// Run with the UTF-8 text layer of a locally held English DROPS 269-3 source.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const reader = require("../src/yarnai/static/pattern-source-instruction-evidence.js");
const review = require("../src/yarnai/static/pattern-technology-review.js");

const document = fs.readFileSync(process.argv[2], "utf8");
const reading = reader.readGradedSource(document, "XXL");
const expectedColumns = [
  [132, 7, 43], [45, 45, 31, 380, 8, 412, 28], [81, 20, 125, 81, 20, 124],
  [290, 20, 1, 286, 58, 52, 338, 7, 65, 70],
  [81, 20, 101, 20, 5, 14, 2, 63, 38, 70, 7, 45],
];
assert.deepEqual(reading.sections.map((s) => s.vectors.map((v) => v.normalizedValue)), expectedColumns);
const replay = reader.readTwoPhaseRaglan(reading);
assert.equal(replay.valid, true);
const sourceGauge = { stitches: 21, rows: 28, per: 10, unit: "cm" };
for (const stitches of [21, 20]) {
  const target = { ...sourceGauge, stitches };
  const c = review.calculateConstraintAwareTopDownCounts({ sourceGauge, adaptationGauge: target, twoPhaseReplay: replay }, { size: "XXL" }).chosenCandidate;
  assert.ok(c);
  // Simulate each physical round independently of the candidate's declared end totals.
  let count = c.neck;
  for (let round = 1; round <= c.yokeRows; round++) {
    if (round % 2 === 1 && round <= 2 * c.full) count += 8;
    else if (round % 2 === 1 && round < 2 * (c.full + c.bodyOnly)) count += 4;
    if (round === 2 * c.full - 1) assert.equal(count, c.midpoint);
  }
  assert.equal(count, 2 * (c.front + c.held));
  assert.equal(count, c.total);
  count -= c.held * 2;
  count += 2 * c.underarm;
  assert.equal(count, c.body);
  for (let round = 1; round <= c.bodyRows; round++) if (c.bodyDecreaseRows.includes(round)) count -= 4;
  assert.equal(count, c.plain);
  count = c.held + c.underarm;
  assert.equal(count, c.arm);
  for (let round = 1; round <= c.sleeveRows; round++) if (c.sleeveDecreaseRows.includes(round)) count -= 2;
  assert.equal(count, c.beforeCuff);
  assert.ok([c.neck, c.hem, c.cuff].every((n) => n > 0 && n % 2 === 0));
  assert.ok(c.cuff >= c.beforeCuff && c.hem >= c.plain);
  assert.ok(Math.abs(c.chestCm - 138) < 0.5 && Math.abs(c.armCm - 101 / 2.1) < 0.5);
  assert.deepEqual([c.yokeRows, c.bodyRows, c.sleeveRows], [78, 84, 106]);
  const expected = stitches === 21 ? [132,380,412,290,286,338,101,63,70] : [124,364,392,276,272,322,96,60,66];
  assert.deepEqual([c.neck,c.midpoint,c.total,c.body,c.plain,c.hem,c.arm,c.beforeCuff,c.cuff], expected);
}
console.log("38 source series, both gauge scenarios and every shaping round passed.");
