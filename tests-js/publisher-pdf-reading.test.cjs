"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const experience = require("../src/yarnai/static/material-understanding-experience.js");
const rules = require("../src/yarnai/static/pattern-semantic-rules.js");
const reader = require("../src/yarnai/static/pattern-source-instruction-evidence.js");

const sample = [
  "finished measurements", 'Chest – 32 (38, 48)"', 'Length – 19 (20½, 23)"',
  "yarn", "Test yarn (80 grs):", "4 (5, 7) balls", "An unrelated title",
  "Designed by Example Studio", "BACK", "Cast on 81 (91,\n 111) sts.",
  "FRONT", "Work as for back.", "SLEEVES", "Repeat every 8 th (6th, 4th) row.",
  "FINISHING", "Sew shoulder seams.", '8" 9 (10, 11)"', "SLEEVE",
  "STANDARD ABBREVIATIONS & TERMS", "wrap: wrap the stitch",
].join("\n");

test("measured size headings retain units, order and wrapped size columns", () => {
  assert.deepEqual(rules.finishedChestSizes(sample), ["32 in", "38 in", "48 in"]);
  for (const [index, label] of rules.finishedChestSizes(sample).entries()) {
    const reading = reader.readGradedSource(sample.replaceAll("\n", "\r\n"), label);
    assert.deepEqual(reading.order, ["32 in", "38 in", "48 in"]);
    assert.equal(reading.attribution.title, "An unrelated title");
    assert.equal(reading.sections[0].projected, "Cast on " + [81, 91, 111][index] + " sts.");
    assert.equal(reading.sections[2].vectors[0].selectedRawValue, ["8 th", "6th", "4th"][index]);
    assert.equal(reading.specifications[0], "Длина изделия — " + ['19"', '20½"', '23"'][index]);
    assert.deepEqual(reading.warnings, []);
    assert.equal(reading.sections.length, 4);
    assert.doesNotMatch(reading.sections.at(-1).projected, /8"|wrap/);
  }
  assert.equal(reader.readGradedSource(sample, "XXL"), null);
  assert.deepEqual(rules.finishedChestSizes(sample.replace("38, 48", "38, 38")), []);
});

test("unreadable PDFs explain the failure even with a readable size preference", () => {
  const profile = { sourceFileId: "preference", extractionStatus: "extracted", mediaType: "text/plain" };
  for (const [status, expected] of [["failed", /повреждённый PDF/], ["no_text_layer", /нет текстового слоя/]]) {
    const pdf = { name: "input.pdf", mediaType: "application/pdf", extractionStatus: status, error: { code: "pdf_invalid" } };
    const model = experience.buildViewModel({ projectId: "sample", extraction: { result: { files: [pdf, profile] } } });
    assert.equal(model.continueAction.enabled, false);
    assert.match(model.error.message, expected);
  }
});

test("incomplete and ambiguous source instructions remain visible for review", () => {
  const text = sample.replace("91,\n 111", "91, ?, 111").replace("Work as for back.", "Work as for front.").replace("SLEEVES\n", "Notes\n");
  const reading = reader.readGradedSource(text, "38 in");
  assert.equal(reading.sections[0].vectors[0].selectedRawValue, null);
  assert.match(reading.sections[0].projected, /\?/);
  assert.equal(reading.warnings.length, 2);
  assert.equal(reader.readTwoPhaseRaglan(reading), null);
});
