"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { build } = require("../src/yarnai/static/graded-raglan-instruction.js");

// Numeric reference for the checked size; the publisher's document stays local.
const facts = {
  castOn: 132, ribNeedle: 3, mainNeedle: 4, neckCm: 7, midFrontMarker: 43,
  markers: 4, firstFront: 45, firstSleeve: 19, fullRepeats: 31, fullDelta: 8,
  midYoke: 380, bodyRepeats: 8, bodyDelta: 4, endYoke: 412, yokeCm: 28,
  leftHeld: 81, front: 125, leftUnderarm: 20, bodyStart: 290, firstDecreaseCm: 7,
  bodyIntervalCm: 7, bodyLoss: 4, bodyDecreaseTimes: 1, preHem: 286, hemStartCm: 58,
  hemNeedle: 3, hem: 338, hemCm: 7, frontLength: 65, shoulderLength: 70,
  sleeveNeedle: 4, sleeveStart: 101, sleevePlain: 1, fastLoss: 2, fastRepeats: 5,
  slowLoss: 2, slowRepeats: 14, slowCm: 2, preCuff: 63, cuffStartCm: 38,
  cuffNeedle: 3, cuff: 70, cuffGain: 7, cuffCm: 7
};
const source = { title: "Barley Field Sweater", author: "DROPS Design", number: "DROPS 269-3", size: "XXL" };
const sample = {
  basis: "synthetic", yarn: "Искусственные данные", stockSt: 21, stockRows: 28,
  ribStitches: 24, ribWidth: 10, ribRounds: 32, ribHeight: 10, targetRib: 118.2,
  shoulderWidth: 47, upperArm: 38, belly: 114, atHem: 108, totalLength: 70,
  armLength: 45, depth: 28, chest: 120, belt: 105, hips: 101, finishedChest: 138,
  minHem: 116, maxHem: 120, plainChoice: "250"
};
const make = (patch = {}) => build({ valid: true, facts }, { unit: "cm", stitches: 21, rows: 28, per: 10 }, { ...sample, ...patch }, source);
const list = s => s.split(",").map(Number);
const numbers = text => [...text.matchAll(/\d+/g)].map(m => Number(m[0]));

test("replay the printed operations from cast-on to both bind-offs", () => {
  const { model } = make();
  const steps = model.sections.flatMap(s => s.steps);
  assert.deepEqual(steps.map(s => s.number), Array.from({ length: 14 }, (_, i) => i + 1));
  assert.match(model.purpose, /искусственные/);
  const cast = Number(/набери (\d+)/.exec(steps[0].instruction)[1]);
  assert.equal(cast, 132);
  assert.deepEqual(numbers(steps[1].instruction), [4,19,45,19,45]);
  assert.deepEqual(numbers(steps[2].instruction), [1,61,31,8,132,380]);
  assert.deepEqual(numbers(steps[3].instruction), [63,77,8,4,380,412]);
  let stitches = cast;
  for (let r = 1; r <= 78; r++) {
    if (r % 2 === 1) stitches += r <= 61 ? 8 : 4;
    if (r === 61) assert.equal(stitches, 380);
  }
  assert.deepEqual(numbers(steps[4].instruction), [81,20,125,81,20,124]);
  assert.equal(stitches, 1 + 81 + 125 + 81 + 124);
  stitches += 2 * (20 - 81);
  const body = steps[5];
  const rounds = list(/убавку в кругах ([\d, ]+)/.exec(body.instruction)[1]);
  assert.deepEqual(rounds, [20,27,34,41,48,55,62,69,76,83]);
  const ledger = [];
  for (let r = 1; r <= 84; r++) if (rounds.includes(r)) ledger.push(stitches -= 4);
  assert.deepEqual(numbers(body.details[0]).slice(0,10), ledger);
  assert.equal(stitches, 250);
  const hem = steps[6].instruction;
  assert.match(hem, /12 групп по 8 и 22 по 7/);
  assert.equal(12 * 8 + 22 * 7, stitches);
  stitches += 12 + 22;
  assert.equal(stitches, 284);
  assert.match(hem, /Итог — 284/);
  assert.equal(stitches % 2, 0);
  assert.ok(Math.abs(stitches / 2.4 - 118.2) < 0.5);
  for (const at of [7,10]) {
    assert.deepEqual(numbers(steps[at].instruction).slice(0,4), [4,81,20,101]);
    const sleeve = steps[at + 1];
    const fast = list(/Первая серия — круги ([\d, ]+)/.exec(sleeve.instruction)[1]);
    const slow = list(/Вторая серия — круги ([\d, ]+)/.exec(sleeve.instruction)[1]);
    assert.deepEqual(fast, [2,4,6,8,10]);
    assert.deepEqual(slow, [16,21,27,32,38,44,49,55,60,66,72,77,83,88]);
    let arm = 81 + 20;
    for (let r = 1; r <= 106; r++) if (fast.includes(r) || slow.includes(r)) arm -= 2;
    assert.equal(arm, 63);
    assert.equal(arm, 7 * 9);
    assert.equal(arm + 7, 70);
    assert.match(steps[at + 2].instruction, /7 групп по 9.*Итог — 70/);
    assert.match(steps[at + 2].instruction, /22-й.*последнюю петлю/);
  }
  // Front includes the separating round. Shoulder-to-front offset is the source's 70 − 65 cm.
  assert.ok(Math.abs((78 + 1 + 84) / 2.8 + 22 / 3.2 + 5 - 70) < 0.5);
  assert.ok(Math.abs(106 / 2.8 + 22 / 3.2 - 45) < 0.5);
});

test("different selected taper recalculates the transition; length changes alter available rounds", () => {
  const other = make({ plainChoice: "246", armLength: 47, totalLength: 72 });
  assert.equal(other.state, "ready");
  const steps = other.model.sections.flatMap(s => s.steps);
  assert.match(steps[5].instruction, /по 90-й круг/);
  assert.match(steps[6].instruction, /246 п\. на 18 групп по 7 и 20 по 6/);
  assert.match(steps[8].details[0], /112-го/);
});

for (const [label, patch] of Object.entries({
  "absent gauge": { stockSt: null }, "unmeasured rib": { ribWidth: null }, "missing arm": { upperArm: null },
  "no taper selected": { plainChoice: "" }, "invalid selection": { plainChoice: "248" }, "impossible shoulder-to-hem length": { totalLength: 12 },
  "too few yoke rounds": { depth: 22 }, "no room for sleeve decreases": { armLength: 16 },
  "incompatible stitch gauge": { stockSt: 22 }, "insufficient hem circumference": { atHem: 124 }
})) {
  test(label + " blocks the full instruction", () => assert.equal(make(patch).state, "blocked"));
}
