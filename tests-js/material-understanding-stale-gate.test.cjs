"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const model = require("../src/yarnai/static/material-understanding-experience.js");

const repositories = [];

function semantic(overrides = {}) {
  return {
    status: "completed",
    result: {
      sourceSummary: { filesCount: 1, imageFilesCount: 1, pdfFilesCount: 0, textFilesCount: 0 },
      garment: { type: "pullover", confidence: 0.72 },
      craft: { value: "knitting", confidence: 0.95 },
      construction: { method: "unknown", features: [], confidence: 0 },
      sizing: { selectedSize: null, confidence: 0 },
      yarn: { names: [], confidence: 0 },
      stitchPatterns: [],
      ...overrides,
    },
  };
}

function input(overrides = {}) {
  return {
    project: { project_id: "project-flax", title: "Контроль Flax", draft_input: {} },
    semantic: semantic(),
    intent: { fieldStatus: {}, assumptions: [], missingInformation: [], preferences: {} },
    ...overrides,
  };
}

function review(items, canConfirm = true) {
  return {
    status: canConfirm ? "ready_to_confirm" : "reviewing",
    validation: { isValid: true, canConfirm, errors: [] },
    reviewedData: { items, conflictGroups: [] },
  };
}

function reviewItem(category, reviewedValue, overrides = {}) {
  return {
    itemId: `item:${category}`,
    category,
    reviewedValue,
    originalValue: reviewedValue,
    decision: "unresolved",
    severity: "important",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
});

test("machine proposal is active until an explicit current answer exists", () => {
  const view = model.buildViewModel(input());
  assert.ok(view.assumed.some((item) => item.field === "garmentType" && item.value === "джемпер"));
});

test("explicit correction becomes canonical and supersedes the old machine proposal", () => {
  const saved = model.recordCorrection(null, "garmentType", "Свитер Flax");
  const view = model.buildViewModel(input({ saved }));
  assert.equal(view.summary.title, "Свитер Flax");
  assert.ok(view.confirmed.some((item) => item.field === "garmentType" && item.value === "Свитер Flax"));
  assert.equal(view.assumed.some((item) => item.field === "garmentType"), false);
  assert.equal(view.continueAction.enabled, true);
});

test("a corrected review item is also the current canonical value", () => {
  const currentReview = review([
    reviewItem("product", "Свитер Flax", { decision: "corrected" }),
  ]);
  const view = model.buildViewModel(input({ review: currentReview }));
  assert.equal(view.summary.title, "Свитер Flax");
  assert.equal(view.assumed.some((item) => item.field === "garmentType"), false);
});

test("another genuinely unresolved critical field remains visible and blocking", () => {
  const saved = model.recordCorrection(null, "garmentType", "Свитер Flax");
  const currentReview = review([
    reviewItem("product", "pullover"),
    reviewItem("craft", "unknown", { severity: "critical" }),
  ], false);
  const view = model.buildViewModel(input({ saved, review: currentReview }));
  assert.equal(view.assumed.some((item) => item.field === "garmentType"), false);
  assert.equal(view.nextQuestion.field, "technique");
  assert.equal(view.continueAction.enabled, false);
});

test("an answer for one field does not resolve another field", () => {
  const saved = model.recordAnswer(null, { id: "size", field: "size", required: true }, "M");
  const view = model.buildViewModel(input({
    saved,
    intent: {
      fieldStatus: {}, assumptions: [], preferences: {},
      missingInformation: [
        { field: "size", label: "размер", required: true },
        { field: "yarn", label: "пряжа", required: true },
      ],
    },
  }));
  assert.equal(view.nextQuestion.field, "yarn");
  assert.equal(view.continueAction.enabled, false);
});

test("invalid and uncertain answers do not resolve a required question", () => {
  const question = { id: "garmentType", field: "garmentType", required: true };
  assert.deepEqual(model.recordAnswer(null, question, "   ").answers, []);
  assert.deepEqual(model.recordAnswer(null, question, "Не уверена").answers, []);
  assert.equal(model.validAnswer({ field: "technique", required: true }, "вязание крючком"), false);
});

test("repeated correction is idempotent", () => {
  const first = model.recordCorrection(null, "garmentType", "Свитер Flax");
  const second = model.recordCorrection(first, "garmentType", "Свитер Flax");
  assert.deepEqual(second, first);
});

test("persistence round-trip does not restore the superseded proposal", async () => {
  const repository = new global.YarnAIProjectSystem.ProjectRepository();
  repositories.push(repository);
  await repository.initialize();
  const saved = model.recordCorrection(null, "garmentType", "Свитер Flax");
  const project = await repository.createProject({
    title: "Контроль Flax round-trip",
    draft_input: { material_understanding: saved },
  });
  await repository.close();
  repositories.splice(repositories.indexOf(repository), 1);

  const reopened = new global.YarnAIProjectSystem.ProjectRepository();
  repositories.push(reopened);
  await reopened.initialize();
  const aggregate = await reopened.getProject(project.project_id);
  const view = model.buildViewModel(input({
    project: aggregate.project,
    saved: aggregate.project.draft_input.material_understanding,
  }));
  assert.equal(view.summary.title, "Свитер Flax");
  assert.equal(view.assumed.some((item) => item.field === "garmentType"), false);
  assert.equal(view.continueAction.enabled, true);
});

test("legacy saved correction maps to the existing product review item", () => {
  const state = review([reviewItem("product", "pullover")]);
  assert.equal(model.reviewItemForField(state, "garmentType").itemId, "item:product");
  assert.equal(model.reviewItemForField(state, "technique"), null);
});

test("review answer normalization is deterministic", () => {
  assert.equal(model.reviewValueForAnswer("technique", "Вязание спицами"), "knitting");
  assert.equal(model.reviewValueForAnswer("garmentType", "Свитер Flax"), "Свитер Flax");
});

test("assistant routes product corrections through review and normalizes legacy saves", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/yarnai/static/material-understanding-experience-assistant.js"),
    "utf8",
  );
  assert.match(source, /reviewItemForField/);
  assert.match(source, /reconcileSavedUnderstanding/);
  assert.match(source, /reviewApi\.saveForProject/);
  assert.match(source, /finally\s*\{\s*busy = false;\s*setInteractive\(false\);/);
  assert.doesNotMatch(source, /garmentType:\s*"garment"/);
});
