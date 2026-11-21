"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/yarnai/static/pattern-technology-experience.js");

function draft(overrides = {}) {
  return {
    status: "ready",
    draftResult: {
      construction: [
        { id: "construction-mode", property: "construction_mode", value: "seamed" },
        { id: "direction", property: "direction", value: "bottom_up" },
        { id: "knitting-mode", property: "knitting_mode", value: "flat" },
      ],
      components: [
        { id: "back", name: "back", order: 1 },
        { id: "front", name: "front", order: 2 },
        { id: "sleeve", name: "sleeve", quantity: 2, order: 3 },
      ],
      sections: [],
      operations: [
        { id: "op-1", type: "cast_on", componentId: "back", order: 1, instructionSource: "Набрать петли для спинки" },
        { id: "op-2", type: "work_pattern", componentId: "back", order: 2, instructionSource: "Связать спинку" },
        { id: "op-3", type: "seam", order: 3, instructionSource: "Выполнить плечевые швы" },
      ],
      rowInstructions: [{ id: "row-1", rowStart: 1, rowEnd: 1, instructionText: "Набрать петли" }],
      finishing: [{ id: "finish-1", type: "seam", instructionText: "Выполнить плечевые швы", operationId: "op-3" }],
      conflicts: [], missingInformation: [], warnings: [], provenance: [{ id: "source-1" }], alternatives: [],
      ...overrides,
    },
  };
}

function review(targets = [], decisions = [], overrides = {}) {
  return {
    kind: "PATTERN_TECHNOLOGY_REVIEW", status: "reviewing",
    reviewState: { targets }, decisions, corrections: [], unresolvedItems: [], userNotes: [],
    validation: { canConfirm: targets.length > 0 && decisions.every((item) => ["accepted", "corrected"].includes(item.decision)) },
    ...overrides,
  };
}

function input(overrides = {}) {
  return { project: { project_id: "project-1", title: "Мой свитер", draft_input: {} }, draft: draft(), ...overrides };
}

test("01 empty draft fails closed", () => assert.equal(api.buildViewModel({ projectId: "p", draft: {} }).state, "error"));
test("02 one-piece construction has a human label", () => assert.equal(api.buildConstruction({ constructionMode: "seamless", construction: [] }, api.normalizeReview())[0].value, "Цельновязаная конструкция"));
test("03 separate pieces have a human label", () => assert.equal(api.buildViewModel(input()).construction[0].value, "Отдельные детали"));
test("04 top-down direction is localized", () => assert.equal(api.buildConstruction({ direction: "top_down", construction: [] }, api.normalizeReview())[0].value, "Сверху вниз"));
test("05 bottom-up direction is localized", () => assert.ok(api.buildViewModel(input()).construction.some((item) => item.value === "Снизу вверх")));
test("06 circular knitting is localized", () => assert.equal(api.buildConstruction({ knittingMode: "in_the_round", construction: [] }, api.normalizeReview())[0].value, "По кругу"));
test("07 flat knitting is localized", () => assert.ok(api.buildViewModel(input()).construction.some((item) => item.value === "Поворотными рядами")));
test("08 one part is rendered", () => assert.equal(api.buildParts({ components: [{ id: "body", name: "body" }] }, api.normalizeReview()).length, 1));
test("09 several parts are rendered", () => assert.equal(api.buildViewModel(input()).parts.length, 3));
test("10 repeated part quantity is visible", () => assert.equal(api.buildViewModel(input()).parts[2].displayName, "2 × Рукав"));
test("11 parts use stable order", () => { const value = draft({ components: [{ id: "b", name: "back", order: 2 }, { id: "a", name: "front", order: 1 }] }); assert.deepEqual(api.buildViewModel(input({ draft: value })).parts.map((item) => item.id), ["a", "b"]); });
test("12 duplicate parts are suppressed", () => { const value = draft({ components: [{ id: "a", name: "front" }, { id: "b", name: "front" }] }); assert.equal(api.buildViewModel(input({ draft: value })).parts.length, 1); });
test("13 work sequence is built", () => assert.equal(api.buildViewModel(input()).sequence.length, 3));
test("14 work sequence uses stable order", () => { const value = draft({ operations: [{ id: "b", type: "finish", order: 2 }, { id: "a", type: "cast_on", order: 1 }] }); assert.deepEqual(api.buildViewModel(input({ draft: value })).sequence.map((item) => item.id), ["a", "b"]); });
test("15 assembly summary is built", () => assert.match(api.buildViewModel(input()).assembly[0].label, /плечевые швы/i));
test("16 no-seam construction is explicit", () => { const value = draft({ construction: [{ id: "m", property: "construction_mode", value: "seamless" }], finishing: [], operations: [] }); assert.match(api.buildViewModel(input({ draft: value })).assembly[0].label, /без швов/i); });
test("17 accepted decision is confirmed", () => { const r = review([{ id: "construction-mode", category: "construction" }], [{ targetId: "construction-mode", decision: "accepted" }]); assert.equal(api.buildViewModel(input({ review: r })).construction[0].status, "confirmed"); });
test("18 pending decision is proposed", () => { const r = review([{ id: "construction-mode", category: "construction" }], [{ targetId: "construction-mode", decision: "pending" }]); assert.equal(api.buildViewModel(input({ review: r })).construction[0].status, "proposed"); });
test("19 unresolved decision is unknown", () => { const r = review([{ id: "construction-mode", category: "construction" }], [{ targetId: "construction-mode", decision: "unresolved" }]); assert.equal(api.buildViewModel(input({ review: r })).construction[0].status, "unknown"); });
test("20 mixed statuses remain distinct", () => { const r = review([{ id: "construction-mode" }, { id: "direction" }], [{ targetId: "construction-mode", decision: "accepted" }, { targetId: "direction", decision: "pending" }]); assert.deepEqual(api.buildViewModel(input({ review: r })).construction.slice(0, 2).map((item) => item.status), ["confirmed", "proposed"]); });
test("21 exactly one next question is selected", () => { const r = review([{ id: "a", category: "construction", originalValue: "seamed" }, { id: "b", category: "construction", originalValue: "flat" }], [{ targetId: "a", decision: "pending" }, { targetId: "b", decision: "pending" }]); assert.equal(api.buildViewModel(input({ review: r })).nextQuestion.id, "a"); });
test("22 answered question is excluded", () => { const r = review([{ id: "a", category: "construction" }, { id: "b", category: "construction" }], [{ targetId: "a", decision: "pending" }, { targetId: "b", decision: "pending" }]); const saved = { answers: [{ id: "answer:a", questionId: "a", field: "construction", value: "yes", provenance: "user" }] }; assert.equal(api.buildViewModel(input({ review: r, saved })).nextQuestion.id, "b"); });
test("23 blocking question wins", () => { const r = review([{ id: "optional", blocking: false }, { id: "blocking", blocking: true }], [{ targetId: "optional", decision: "pending" }, { targetId: "blocking", decision: "pending" }]); assert.equal(api.buildViewModel(input({ review: r })).nextQuestion.id, "blocking"); });
test("24 stable question fallback uses order", () => { const r = review([{ id: "z", priority: 2 }, { id: "a", priority: 1 }], [{ targetId: "z", decision: "pending" }, { targetId: "a", decision: "pending" }]); assert.equal(api.buildViewModel(input({ review: r })).nextQuestion.id, "a"); });
test("25 no questions returns null", () => assert.equal(api.buildViewModel(input()).nextQuestion, null));
test("26 alternatives are exposed", () => { const value = draft({ alternatives: [{ id: "round", value: "in_the_round" }] }); assert.equal(api.buildViewModel(input({ draft: value })).alternatives[0].label, "По кругу"); });
test("27 missing alternatives stay empty", () => assert.deepEqual(api.buildViewModel(input()).alternatives, []));
test("28 conflict blocks readiness", () => { const value = draft({ conflicts: [{ id: "c", code: "CONFLICT", values: ["flat", "in_the_round"] }] }); const model = api.buildViewModel(input({ draft: value })); assert.equal(model.readiness.ready, false); assert.equal(model.conflicts.length, 1); });
test("29 correction changes presentation", () => { const saved = api.recordCorrection(null, "direction", "поперёк"); assert.ok(api.buildViewModel(input({ saved })).construction.some((item) => item.value === "поперёк")); });
test("30 correction provenance is user", () => assert.equal(api.recordCorrection(null, "parts", "Перед, спинка").corrections[0].provenance, "user"));
test("31 machine draft remains unchanged after correction", () => { const original = draft(); const before = structuredClone(original); api.buildViewModel(input({ draft: original, saved: api.recordCorrection(null, "direction", "сверху вниз") })); assert.deepEqual(original, before); });
test("32 readiness is false with pending review", () => { const r = review([{ id: "a", blocking: true }], [{ targetId: "a", decision: "pending" }]); assert.equal(api.buildViewModel(input({ review: r })).readiness.ready, false); });
test("33 readiness is true without blockers", () => assert.equal(api.buildViewModel(input()).readiness.ready, true));
test("34 stale draft fails closed", () => assert.equal(api.buildViewModel(input({ draft: { ...draft(), status: "stale" } })).readiness.ready, false));
test("35 imported-unproven record fails closed", () => assert.equal(api.buildViewModel(input({ draftProgress: { epoch: 1, imported: true, proven: false } })).state, "error"));
test("36 quarantined record fails closed", () => assert.equal(api.buildViewModel(input({ draftProgress: { epoch: 1, quarantined: true } })).state, "error"));
test("37 collided record fails closed", () => assert.equal(api.buildViewModel(input({ reviewProgress: { epoch: 1, collided: true } })).state, "error"));
test("38 corrupted draft fails closed", () => assert.equal(api.buildViewModel(input({ draft: { status: "ready", draftResult: { components: {} } } })).state, "error"));
test("39 corrupted part is ignored", () => { const value = draft({ components: [null, { id: "a", name: "front" }] }); assert.equal(api.buildViewModel(input({ draft: value })).parts.length, 1); });
test("40 corrupted sequence item is ignored", () => { const value = draft({ operations: [null, { id: "a", type: "finish" }] }); assert.equal(api.buildViewModel(input({ draft: value })).sequence.length, 1); });
test("41 long labels are bounded", () => { const value = draft({ components: [{ id: "a", name: "x".repeat(400) }] }); assert.ok(api.buildViewModel(input({ draft: value })).parts[0].name.length <= 120); });
test("42 source summary is human", () => assert.equal(api.buildViewModel(input()).sources[0].label, "Подтверждённое понимание изделия"));
test("43 raw status and kind are absent from view model", () => { const text = JSON.stringify(api.buildViewModel(input({ draft: { ...draft(), kind: "PATTERN_TECHNOLOGY_DRAFT" } }))); assert.doesNotMatch(text, /PATTERN_TECHNOLOGY_DRAFT/); });
test("44 raw confidence is absent from view model", () => { const value = draft(); value.draftResult.construction[0].confidence = 0.73; assert.doesNotMatch(JSON.stringify(api.buildViewModel(input({ draft: value }))), /confidence|0\.73/); });
test("45 build does not mutate input", () => { const source = input(); const before = structuredClone(source); api.buildViewModel(source); assert.deepEqual(source, before); });
test("46 build is repeatable", () => assert.deepEqual(api.buildViewModel(input()), api.buildViewModel(input())));
test("47 production model has no clock or random", () => { const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/yarnai/static/pattern-technology-experience.js"), "utf8"); assert.doesNotMatch(source, /Date\.now|new Date|Math\.random|randomUUID/); });
test("48 no future placeholder exists", () => assert.doesNotMatch(JSON.stringify(api), /stage58/i));
test("49 continue action selects existing practical route", () => { const model = api.buildViewModel(input()); assert.match(model.continueAction.href, /^\/user-workspace-entry\?project=/); });
test("50 missing project has a safe fallback", () => { const model = api.buildViewModel(); assert.equal(model.state, "missing_project"); assert.equal(model.links.workshop, "/"); });
test("51 confirmed knitting suppresses a repeated craft question at the production gate", () => { const value = draft({ craft: { type: "knitting", value: "knitting" }, missingInformation: [{ id: "missing-craft", code: "MISSING_CRAFT", level: "critical" }] }); const r = review([{ id: "craft-target", category: "craft", originalValue: "knitting", blocking: true }], [{ targetId: "craft-target", decision: "pending" }]); assert.equal(api.buildViewModel(input({ draft: value, review: r })).nextQuestion, null); });
test("52 source and adaptation handoff rows are rendered separately", () => { const value = draft({ sourcePatternEvidence: { fingerprint: "source-fp", facts: { craft: "knitting", product: "sweater", selectedSize: "ML", gauge: [{ stitches: 18, rounds: 24, per: 4, unit: "in" }], needles: [4, 5], yarnSamples: ["Source yarn"] } }, userAdaptationProfile: { fingerprint: "adaptation-fp", selectedSize: { value: "ML" }, gauge: [{ stitches: 20, rows: 26, per: 10, unit: "cm" }], needles: [{ canonicalValue: 3.5, unit: "mm" }], yarn: { names: [], fibre: [{ value: "100% шерсть" }], weight: ["worsted/aran"], lengthOrWeight: [{ value: 200, unit: "m" }, { value: 100, unit: "g" }] } } }); const handoff = api.buildViewModel(input({ draft: value })).handoff; assert.ok(handoff.source.some((entry) => entry.value.includes("18 п."))); assert.ok(handoff.adaptation.some((entry) => entry.value.includes("20 п."))); assert.equal(JSON.stringify(handoff.source).includes("100% шерсть"), false); });
test("53 incomplete technology sections are not presented as a ready plan and Stage 21 is not auto-created", () => { const value = draft({ components: [], operations: [], rowInstructions: [], finishing: [], missingInformation: [{ id: "ops", code: "MISSING_OPERATIONS", level: "critical" }, { id: "finish", code: "MISSING_FINISHING", level: "non_critical" }] }); const model = api.buildViewModel(input({ draft: value })); assert.equal(model.technologyPlan.built, false); assert.equal(model.readiness.ready, false); assert.equal(model.nextQuestion, null); const assistant = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/yarnai/static/pattern-technology-experience-assistant.js"), "utf8"); const prepareDraft = assistant.slice(assistant.indexOf("async function prepareDraft"), assistant.indexOf("function renderCurrent")); assert.equal(prepareDraft.includes("reviewApi.ensureForProject"), false); });
test("54 upstream Stage 19 binding and Stage 20 identity remain visible in the view model", () => { const value = draft({ inputContractVersion: 2, resultIdentity: "result-v2" }); value.revision = 5; value.sourceReviewId = "review-19"; value.sourceReviewRevision = 11; const binding = api.buildViewModel(input({ draft: value, draftRecordCount: 1 })).binding; assert.deepEqual(binding, { stage20Revision: 5, inputContractVersion: 2, sourceReviewId: "review-19", sourceReviewRevision: 11, resultIdentity: "result-v2", sourceProjectionFingerprint: "", draftRecordCount: 1 }); });
test("55 downstream Stage 21 staleness is not part of the Stage 20 source safety gate", () => { const assistant = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/yarnai/static/pattern-technology-experience-assistant.js"), "utf8"); assert.match(assistant, /unsafeInspectionState\(draftInspection\)/); assert.doesNotMatch(assistant, /unsafeInspectionState\(draftInspection, reviewInspection\)/); assert.match(assistant, /downstreamReviewUsable \?/); });
