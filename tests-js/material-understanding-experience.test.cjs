"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../src/yarnai/static/material-understanding-experience.js");

function semantic(overrides = {}) {
  const result = {
    sourceSummary: { filesCount: 1, imageFilesCount: 0, pdfFilesCount: 0, textFilesCount: 1 },
    garment: { type: "sweater", confidence: 0.92 },
    craft: { value: "knitting", confidence: 0.95 },
    construction: { method: "top_down", features: ["raglan"], confidence: 0.72 },
    sizing: { selectedSize: null, confidence: 0 },
    yarn: { names: [], confidence: 0 }, stitchPatterns: [],
    ...overrides,
  };
  return { status: "completed", result };
}

function base(overrides = {}) {
  return {
    project: { project_id: "project-1", title: "Свитер Натальи", draft_input: {} },
    semantic: semantic(),
    intent: { fieldStatus: {}, assumptions: [], missingInformation: [], preferences: {} },
    importState: { materials: [{ id: "m1", type: "text" }] },
    ...overrides,
  };
}

test("01 empty analysis stays in a real loading state", () => { const vm = model.buildViewModel(base({ semantic: null })); assert.equal(vm.state, "loading"); });
test("01a failed analysis exposes the retry error state instead of permanent loading", () => { const vm = model.buildViewModel(base({ semantic: { ...semantic(), status: "failed" } })); assert.equal(vm.state, "error"); });
test("02 one confirmed fact is exposed", () => { const vm = model.buildViewModel(base({ semantic: semantic({ construction: { method: "unknown", features: [], confidence: 0 }, craft: { value: "unknown", confidence: 0 } }) })); assert.equal(vm.confirmed.length, 1); });
test("03 several confirmed facts retain stable order", () => { const vm = model.buildViewModel(base()); assert.deepEqual(vm.confirmed.slice(0, 2).map((x) => x.field), ["garmentType", "technique"]); });
test("04 a lower-confidence value is an assumption", () => { const vm = model.buildViewModel(base()); assert.ok(vm.assumed.some((x) => x.field === "construction")); });
test("05 unknown value is not presented as a fact", () => { const vm = model.buildViewModel(base({ semantic: semantic({ garment: { type: "unknown", confidence: 0 } }) })); assert.equal(vm.summary.trust, "unknown"); });
test("06 confirmed assumed and unknown are separated", () => { const vm = model.buildViewModel(base({ intent: { fieldStatus: {}, assumptions: [], preferences: {}, missingInformation: [{ field: "size", label: "размер", required: true }] } })); assert.ok(vm.confirmed.length && vm.assumed.length && vm.unknown.length); });
test("07 photo source summary is human-readable", () => { const vm = model.buildViewModel(base({ importState: { materials: [{ type: "image" }] } })); assert.equal(vm.sources[0].label, "1 фотография"); });
test("08 chart source is distinguished by purpose", () => { const vm = model.buildViewModel(base({ importState: { materials: [{ id: "c", type: "image" }] }, purposes: { c: "chart" } })); assert.equal(vm.sources[0].kind, "chart"); });
test("09 PDF source summary is human-readable", () => { const vm = model.buildViewModel(base({ importState: { materials: [{ type: "pdf" }] } })); assert.equal(vm.sources[0].label, "1 PDF"); });
test("10 text source is an author description", () => { const vm = model.buildViewModel(base()); assert.equal(vm.sources[0].label, "Описание пользователя"); });
test("11 multiple source kinds are all retained", () => { const vm = model.buildViewModel(base({ importState: { materials: [{ type: "image" }, { type: "pdf" }, { type: "text" }] } })); assert.equal(vm.sources.length, 3); });
test("12 exactly one next question is selected", () => { const vm = model.buildViewModel(base({ intent: { fieldStatus: {}, assumptions: [], preferences: {}, missingInformation: [{ field: "size", label: "размер" }, { field: "yarn", label: "пряжа" }] } })); assert.equal(vm.nextQuestion.field, "size"); });
test("13 answered question is excluded", () => { const vm = model.buildViewModel(base({ saved: { answers: [{ id: "answer:size", questionId: "size", field: "size", value: "M", provenance: "user" }] }, intent: { fieldStatus: {}, assumptions: [], preferences: {}, missingInformation: [{ field: "size", label: "размер" }, { field: "yarn", label: "пряжа" }] } })); assert.equal(vm.nextQuestion.field, "yarn"); });
test("14 question ordering is stable", () => { const input = base({ questions: [{ id: "b", field: "size", text: "B?", priority: 2 }, { id: "a", field: "yarn", text: "A?", priority: 1 }] }); assert.deepEqual(model.buildViewModel(input).nextQuestion, model.buildViewModel(input).nextQuestion); });
test("15 explicit priority wins", () => { const question = model.selectNextQuestion({ questions: [{ id: "late", field: "size", text: "Late?", priority: 9 }, { id: "first", field: "yarn", text: "First?", priority: 1 }] }); assert.equal(question.id, "first"); });
test("16 missing field receives a stable fallback question", () => { const question = model.selectNextQuestion({ missing: [{ field: "custom", label: "деталь", priority: 1 }] }); assert.match(question.text, /Уточни/); });
test("17 no missing data means no question", () => { assert.equal(model.selectNextQuestion({ missing: [] }), null); });
test("18 required question blocks readiness", () => { const vm = model.buildViewModel(base({ intent: { fieldStatus: {}, assumptions: [], preferences: {}, missingInformation: [{ field: "size", label: "размер", required: true }] } })); assert.equal(vm.readiness.ready, false); });
test("19 complete safe understanding can be ready", () => { const vm = model.buildViewModel(base()); assert.equal(vm.readiness.ready, true); });
test("20 review conflict blocks and is explained", () => { const vm = model.buildViewModel(base({ review: { status: "reviewing", validation: { canConfirm: true }, reviewedData: { items: [], conflictGroups: [{ conflictId: "g", status: "unresolved" }] } } })); assert.equal(vm.conflicts[0].message, "Материалы описывают вещь по-разному"); assert.equal(vm.readiness.ready, false); });
test("21 corrupted analysis fails closed", () => { const vm = model.buildViewModel(base({ semantic: { status: "completed", result: { garment: null } } })); assert.equal(vm.state, "error"); });
test("22 stale progress fails closed", () => { const vm = model.buildViewModel(base({ semanticProgress: { epoch: 2 } })); assert.equal(vm.state, "error"); });
test("23 imported unproven progress fails closed", () => { const vm = model.buildViewModel(base({ semanticProgress: { imported: true, proven: false } })); assert.equal(vm.state, "error"); });
test("24 quarantined progress fails closed", () => { const vm = model.buildViewModel(base({ semanticProgress: { quarantined: true } })); assert.equal(vm.state, "error"); });
test("25 collided progress fails closed", () => { const vm = model.buildViewModel(base({ semanticProgress: { collided: true } })); assert.equal(vm.state, "error"); });
test("26 user correction overrides summary", () => { const saved = model.recordCorrection(null, "garmentType", "кардиган"); const vm = model.buildViewModel(base({ saved })); assert.equal(vm.summary.title, "Кардиган"); });
test("27 correction removes machine assumption for same value", () => { const saved = model.recordCorrection(null, "construction", "снизу вверх"); const vm = model.buildViewModel(base({ saved })); assert.ok(vm.confirmed.some((x) => x.value === "снизу вверх" && x.origin === "user")); });
test("28 trust labels are user-facing", () => { assert.deepEqual(model.TRUST, { confirmed: "Понятно", assumed: "Нужно подтвердить", unknown: "Пока неизвестно" }); });
test("29 view model never exposes numeric confidence as a label", () => { const vm = model.buildViewModel(base()); assert.doesNotMatch(JSON.stringify(vm), /0\.92|0\.72/); });
test("30 view model does not expose machine progress labels", () => { const vm = model.buildViewModel(base()); assert.doesNotMatch(JSON.stringify(vm), /PATTERN_SEMANTIC|completed/); });
test("31 long user value is safely bounded", () => { const saved = model.recordCorrection(null, "description", "я".repeat(900)); assert.equal(saved.corrections[0].value.length, 500); });
test("32 input is not mutated", () => { const input = base(); const before = structuredClone(input); model.buildViewModel(input); assert.deepEqual(input, before); });
test("33 repeated calls are identical", () => { const input = base(); assert.deepEqual(model.buildViewModel(input), model.buildViewModel(input)); });
test("34 production model has no clock or random identity", () => { const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/material-understanding-experience.js"), "utf8"); assert.doesNotMatch(source, /Date\.now|new Date|Math\.random|randomUUID/); });
test("35 production model does not mention the next stage number", () => { const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/material-understanding-experience.js"), "utf8"); assert.doesNotMatch(source.toLowerCase(), /stage\s*57|stage57/); });
test("36 unconfirmed understanding continues to the explicit review gate", () => { const vm = model.buildViewModel(base()); assert.equal(vm.continueAction.href, "/pattern-analysis-review?project=project-1"); assert.equal(vm.continueAction.label, "Перейти к проверке"); });
test("36a confirmed understanding continues to the existing technology route", () => { const vm = model.buildViewModel(base({ review: { status: "confirmed", confirmedSnapshot: {}, validation: { canConfirm: true }, reviewedData: { items: [], conflictGroups: [] } } })); assert.equal(vm.continueAction.href, "/pattern-technology-draft?project=project-1"); });
test("37 missing project has a safe workshop fallback", () => { const vm = model.buildViewModel({}); assert.equal(vm.state, "missing_project"); assert.equal(vm.links.workshop, "/"); });
test("38 duplicate facts collapse", () => { const vm = model.buildViewModel(base({ intent: { garmentType: "свитер", fieldStatus: { garmentType: "known" }, assumptions: [], missingInformation: [], preferences: {} } })); assert.equal(vm.confirmed.filter((x) => x.field === "garmentType" && x.value === "свитер").length, 1); });
test("39 conflicting facts are not silently selected", () => { const vm = model.buildViewModel(base({ intent: { garmentType: "кардиган", fieldStatus: { garmentType: "known" }, assumptions: [], missingInformation: [], preferences: {} } })); assert.ok(vm.conflicts.some((x) => x.id === "garmentType")); });
test("40 unknown analysis gives a safe unknown summary", () => { const vm = model.buildViewModel(base({ semantic: semantic({ garment: { type: "unknown", confidence: 0 }, craft: { value: "unknown", confidence: 0 }, construction: { method: "unknown", features: [], confidence: 0 } }) })); assert.equal(vm.summary.title, "Пока не удалось точно определить изделие"); });
