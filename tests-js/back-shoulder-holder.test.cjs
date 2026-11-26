"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const reader = require("../src/yarnai/static/pattern-source-instruction-evidence.js");
const plan = require("../src/yarnai/static/garment-polo-plan.js");

// Numeric controls transcribed from the publisher. Every expected row balance
// is specified independently of the production row generator.
const cases = [
  { size: "52 in", start: 101, groups: [10, 10], counts: [10, 10, 10, 10, 10, 10], balances: [91, 81, 71, 61, 51, 41] },
  { size: "40 in", start: 85, groups: [8, 7], counts: [8, 8, 7, 7, 7, 7], balances: [77, 69, 62, 55, 48, 41] },
];
for (const entry of cases) {
  test("publisher shoulder rows and live neck stitches at " + entry.size, () => {
    const source = { startStitches: entry.start, firstSide: "RS",
      groups: [{ count: entry.groups[0], rows: 2 }, { count: entry.groups[1], rows: 4 }],
      hold: { count: 41, destination: "back_neck" } };
    const replay = plan.replayShoulderSection(source);
    assert.deepEqual(replay.rows.map(r => [r.row, r.side, r.edge]), [
      [1, "RS", "right"], [2, "WS", "left"], [3, "RS", "right"],
      [4, "WS", "left"], [5, "RS", "right"], [6, "WS", "left"],
    ]);
    assert.deepEqual(replay.rows.map(r => r.count), entry.counts);
    assert.deepEqual(replay.rows.map(r => r.afterStitches), entry.balances);
    assert.deepEqual(replay.rows.map(r => r.beforeStitches), [entry.start, ...entry.balances.slice(0, -1)]);
    assert.deepEqual(replay.holder, { afterRow: 6, count: 41, destination: "back_neck" });
    assert.equal(replay.workingStitches, 0);
    assert.equal(replay.status, "held");
  });
}

const sample = { startStitches: 27, firstSide: "WS",
  groups: [{ count: 3, rows: 2 }, { count: 5, rows: 2 }],
  hold: { count: 11, destination: "sample_neck" } };
const log = [
  { row: 1, kind: "bind_off", edge: "left", count: 3 },
  { row: 2, kind: "bind_off", edge: "right", count: 3 },
  { row: 3, kind: "bind_off", edge: "left", count: 5 },
  { row: 4, kind: "bind_off", edge: "right", count: 5 },
  { afterRow: 4, kind: "hold", count: 11, destination: "sample_neck" },
];
test("independent WS-first trace agrees with the source and keeps the holder identifiable", () => {
  const replay = plan.replayShoulderSection(sample, log);
  assert.deepEqual(replay, plan.replayShoulderSection(sample));
  assert.deepEqual(replay.rows.map(r => r.afterStitches), [24, 21, 16, 11]);
  assert.deepEqual(replay.rows.map(r => r.side), ["WS", "RS", "WS", "RS"]);
  assert.deepEqual(replay.holder, { afterRow: 4, count: 11, destination: "sample_neck" });
  assert.equal(replay.workingStitches, 0);
});

for (const [name, change, code] of [
  ["no holder requested", s => { delete s.hold; }, "PLAN_BODY_OPEN"],
  ["transfer omitted", (_, ops) => ops.pop(), "PLAN_BODY_OPEN"],
  ["holder count contradicts live stitches", s => { s.hold.count++; }, "PLAN_HOLDER_BALANCE"],
  ["wrong transfer destination", (_, ops) => { ops[4].destination = "other"; }, "PLAN_HOLDER_TRANSFER"],
  ["same sum, wrong group order", (_, ops) => { [ops[0].count, ops[2].count] = [ops[2].count, ops[0].count]; }, "PLAN_SHOULDER_ORDER"],
  ["unreachable edge", (_, ops) => { ops[0].edge = "right"; }, "PLAN_EDGE_UNREACHABLE"],
  ["wrong face of the fabric", (_, ops) => { ops[0].side = "RS"; }, "PLAN_SHOULDER_SIDE"],
  ["more closed than live", s => { s.startStitches = 2; }, "PLAN_ROW_IMPOSSIBLE"],
  ["reuse after transfer", (_, ops) => ops.push({ ...ops[0], row: 5 }), "PLAN_SECTION_FINISHED"],
  ["repeated transfer", (_, ops) => ops.push(ops[4]), "PLAN_SECTION_FINISHED"],
  ["skipped row", (_, ops) => { ops[1].row = 3; }, "PLAN_SHOULDER_ROW"],
  ["early transfer", (_, ops) => { ops[4].afterRow = 3; }, "PLAN_HOLDER_TRANSFER"],
]) test("rejects " + name, () => {
  const source = structuredClone(sample);
  const commands = structuredClone(log);
  change(source, commands);
  assert.throws(() => plan.replayShoulderSection(source, commands), { code });
});

test("the polo body still refuses a back ending with live stitches", () => {
  const body = { panelStitches: 101, armhole: { events: [] },
    shoulder: { bindOffGroups: [10, 10, 10], startRow: 3 },
    backNeck: { startRow: 9, perSide: [], additionalCenterBindOff: 0 } };
  const finishing = { body: { geometryRowOffset: 0, mainRows: 8 }, hem: { rows: 0, stitches: 101 } };
  assert.throws(() => plan.bodyRows({ body }, finishing, false), { code: "PLAN_BODY_OPEN" });
});

test("round-trip through a different size table supplies source order, count and starting side", () => {
  const text = [
    "finished measurements", 'Chest – 31 (37, 43)"', "BACK",
    "Decrease to the stated balance—25 (27, 31) sts.",
    'Work even until armholes measure 6 (7, 8)", end on RS.',
    "Shape Shoulders: Bind off 2 (3, 4) sts at beginning of the next 2 rows,",
    "then 5 (5, 6) sts at beginning of the next 2 rows. Slip remaining 11 sts to holder for back neck.",
    "FRONT", "Finish separately.",
  ].join("\n");
  const read = value => reader.readBackShoulderSection(reader.readGradedSource(value, "37 in"));
  const source = read(text);
  assert.equal(source.startStitches, 27);
  assert.deepEqual(plan.replayShoulderSection(source).rows.map(r => r.afterStitches), [24, 21, 16, 11]);
  assert.equal(source.firstSide, "WS");
  for (const bad of [text.replace("end on RS", "turn"), text.replace("3, 4", "?, 4"),
      text.replace("Slip remaining", "Close 1. Slip remaining"), text.replace("back neck.", "back neck. Work another row.")]) {
    assert.equal(read(bad), null);
  }
});
