"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const geometry = require("../src/yarnai/static/garment-set-in-geometry.js");
const plan = require("../src/yarnai/static/garment-polo-plan.js");

// Probe the existing row writer with externally supplied cap events. Two plain
// setup rows put the cap on a right-side row. They are not source length data.
function renderCap({ start, initial, pairs, finalStep, top }) {
  const lastDecrease = 3 + 2 * (pairs - 1);
  const lastRow = lastDecrease + 3;
  const close = (row, edge, count) => ({ row, edge, count, technique: "bind_off" });
  const events = [close(1, "right", initial), close(2, "left", initial)];
  for (let row = 3; row <= lastDecrease; row += 2) {
    events.push({ row, edge: "both", count: 1, technique: "decrease" });
  }
  events.push(close(lastRow - 1, "right", finalStep), close(lastRow, "left", finalStep));
  const sleeve = { cuffStitchesAtMainGauge: start, cap: { events, finalBindOff: top } };
  const finishing = {
    cuff: { rows: 0, stitches: start },
    sleeve: { beforeCapRows: 2, mainRows: lastRow + 2, increaseRows: [] },
  };
  return plan.sleeveRows({ sleeve }, finishing).slice(2);
}

for (const sample of [
  { name: "source size 52", start: 89, initial: 7, pairs: 29, finalStep: 2, top: 13 },
  { name: "independent synthetic cap", start: 33, initial: 3, pairs: 8, finalStep: 2, top: 7 },
]) {
  test("explicit cap schedule preserves every row and edge: " + sample.name, () => {
    const rows = renderCap(sample);
    const end = 2 + 2 * sample.pairs + 2;
    assert.equal(rows.length, end);
    let live = sample.start;
    for (const [index, entry] of rows.entries()) {
      const row = index + 1;
      const rightSide = row % 2 === 1;
      assert.equal(entry.side, rightSide ? "лицевая" : "изнаночная");
      assert.equal(entry.beforeStitches, live);
      const bound = row <= 2 ? sample.initial : row > end - 2 ? sample.finalStep : 0;
      const paired = !bound && rightSide;
      if (bound) {
        assert.equal(entry.events[0].edge, rightSide ? "right" : "left");
        assert.match(entry.text, new RegExp("В начале ряда закрой " + bound + " п"));
      }
      assert.equal((entry.text.match(/2 п\. вместе/g) || []).length, paired ? 2 : 0);
      live -= bound + (paired ? 2 : 0);
      assert.equal(entry.afterStitches, live);
    }
    assert.equal(live, sample.top);
  });
}

test("shoulder groups can match an equal source staircase and an unequal example", () => {
  assert.deepEqual(geometry.spread(30, 3), [10, 10, 10]);
  assert.deepEqual(geometry.spread(23, 3), [7, 8, 8]);
});
