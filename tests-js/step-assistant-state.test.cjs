"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const state = require("../src/yarnai/static/step-assistant-state.js");

function storage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("standalone Step Assistant localStorage scenario remains compatible", () => {
  const localStorage = storage();
  const progress = state.initialProgress("standalone-calculation");
  state.advanceStitch(progress, 3);
  state.advanceStitch(progress, 3);
  assert.equal(state.saveProgress(localStorage, progress, 3), true);

  const restored = state.readProgress(
    localStorage,
    "standalone-calculation",
    3,
  );
  assert.equal(restored.currentRow, 1);
  assert.equal(restored.currentStitch, 2);

  state.goBackStitch(restored, 3);
  assert.equal(restored.currentStitch, 1);
  assert.equal(state.saveProgress(localStorage, restored, 3), true);
  assert.equal(
    state.readProgress(localStorage, "standalone-calculation", 3).currentStitch,
    1,
  );
});

test("standalone counter remains non-negative", () => {
  const progress = state.initialProgress("standalone-calculation");
  state.goBackStitch(progress, 3);
  assert.equal(progress.currentStitch, 0);
});
