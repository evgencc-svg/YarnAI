"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const api = require("../src/yarnai/static/project-details-experience.js");

function intent(overrides = {}) {
  return {
    garmentType: "свитер",
    recipient: "для мужчины",
    gender: "male",
    ageGroup: "adult",
    size: "L",
    style: "свободный",
    yarnKnown: true,
    yarn: "меринос",
    targetWidth: { value: 56, unit: "cm", sizeKind: "finished" },
    sampleKnown: false,
    gauge: null,
    fieldStatus: { size: "known", recipient: "known", targetWidth: "known" },
    ...overrides,
  };
}

function custom(overrides = {}) {
  return api.applyPatch(null, {
    sizeMode: "custom",
    recipient: "man",
    fit: "relaxed",
    bust: 104,
    garmentWidth: 56,
    garmentLength: 68,
    sleeveLength: 62,
    ...overrides,
  });
}

function standard(overrides = {}) {
  return api.applyPatch(null, {
    sizeMode: "standard",
    recipient: "woman",
    standardSize: "L",
    fit: "regular",
    garmentWidth: 52,
    garmentLength: 64,
    sleeveLength: 58,
    ...overrides,
  });
}

function project(saved) {
  return { project_id: "project-1", title: "Серый свитер", draft_input: saved ? { project_details_experience: saved } : {} };
}

function model(overrides = {}) {
  const sourceIntent = overrides.intent || intent();
  const saved = overrides.saved === undefined ? custom() : overrides.saved;
  return api.buildViewModel({
    project: project(saved),
    intent: sourceIntent,
    saved,
    technology: { components: [{ name: "sleeve" }] },
    readiness: { status: "ready_for_sample", blockers: [], missingRequired: [{ field: "gauge", label: "Плотность" }] },
    ...overrides,
  });
}

test("01 empty project uses a stable details shape", () => assert.deepEqual(api.normalizeProjectDetails(), {
  version: 1, sizeMode: null, standardSize: "", recipient: "", fit: "", bodyMeasurements: {}, garmentMeasurements: {}, provenance: {},
}));
test("02 standard size mode is normalized", () => assert.equal(api.normalizeMode("standard_size"), "standard"));
test("03 custom measurements mode is normalized", () => assert.equal(api.normalizeMode("measurements"), "custom"));
test("04 unknown mode is rejected", () => assert.equal(api.normalizeMode("mystery"), null));
test("05 existing standard size is accepted", () => assert.equal(api.normalizeSize("l"), "L"));
test("06 unsupported size is not invented", () => assert.equal(api.normalizeSize("8XL"), ""));
test("07 confirmed garment type is presented", () => assert.equal(model().garmentType, "свитер"));
test("08 unknown garment type uses a stable fallback", () => assert.equal(api.garmentKind("неизвестная вещь"), "other"));
test("09 standard size may keep a custom length", () => assert.equal(standard().garmentMeasurements.garmentLength.value, 64));
test("10 a body measurement is normalized", () => assert.equal(custom().bodyMeasurements.bust.value, 104));
test("11 garment measurement is separate from body measurement", () => {
  const value = custom();
  assert.equal(value.bodyMeasurements.bust.value, 104);
  assert.equal(value.garmentMeasurements.garmentWidth.value, 56);
});
test("12 body and garment groups never alias", () => {
  const value = custom();
  assert.notEqual(value.bodyMeasurements, value.garmentMeasurements);
});
test("13 regular fit is normalized", () => assert.equal(api.normalizeFit("normal"), "regular"));
test("14 fitted fit is normalized", () => assert.equal(api.normalizeFit("по фигуре"), "fitted"));
test("15 relaxed fit is normalized", () => assert.equal(api.normalizeFit("свободный"), "relaxed"));
test("16 oversized fit is normalized", () => assert.equal(api.normalizeFit("oversize"), "oversized"));
test("17 unknown fit is rejected", () => assert.equal(api.normalizeFit("unknown"), ""));
test("18 sweater custom mode requires bust", () => {
  const fields = api.requiredFields({ details: api.applyPatch(null, { sizeMode: "custom", recipient: "man" }), garmentType: "свитер" });
  assert.ok(fields.some((entry) => entry.field === "bust"));
});
test("19 hat custom mode requires head circumference", () => {
  const fields = api.requiredFields({ details: api.applyPatch(null, { sizeMode: "custom", recipient: "child" }), garmentType: "шапка" });
  assert.ok(fields.some((entry) => entry.field === "head"));
});
test("20 optional waist does not block a sweater", () => assert.equal(model().missing.some((entry) => entry.field === "waist"), false));
test("21 exactly one next field is selected", () => assert.equal(api.nextMissingField({ details: {}, garmentType: "свитер" }).field, "sizeMode"));
test("22 answered field is excluded from next question", () => {
  const details = api.applyPatch(null, { sizeMode: "custom" });
  assert.equal(api.nextMissingField({ details, garmentType: "свитер" }).field, "recipient");
});
test("23 blocking fields preserve stable priority", () => assert.deepEqual(
  api.requiredFields({ details: {}, garmentType: "свитер" }).slice(0, 2).map((entry) => entry.field),
  ["sizeMode", "recipient"],
));
test("24 stable field ordering is repeatable", () => assert.deepEqual(model().fields, model().fields));
test("25 no missing fields after complete custom input", () => assert.equal(model().missing.length, 0));
test("26 known summary contains garment type", () => assert.ok(model().known.some((entry) => entry.label === "Изделие")));
test("27 missing summary contains human labels", () => {
  const value = model({ saved: null, intent: intent({ size: null, recipient: null, gender: null, targetWidth: null }) });
  assert.ok(value.missing.every((entry) => entry.label && !entry.label.includes("_")));
});
test("28 source label user is human", () => assert.equal(api.sourceLabel("user"), "Указано тобой"));
test("29 source label standard size is human", () => assert.equal(api.sourceLabel("standard_size"), "Из стандартного размера"));
test("30 user value overrides project description", () => {
  const merged = api.mergeDetails(api.detailsFromIntent(intent({ size: "M" })), standard({ standardSize: "XL" }));
  assert.equal(merged.standardSize, "XL");
});
test("31 unresolved standard/custom conflict is detected", () => {
  const value = api.normalizeProjectDetails({ sizeMode: "standard", standardSize: "L", bodyMeasurements: { bust: 100 } });
  assert.equal(api.detectModeConflict(value).active, true);
});
test("32 explicit custom mode resolves the conflict", () => {
  let value = api.applyPatch(null, { standardSize: "L", bust: 100 });
  value = api.applyPatch(value, { sizeMode: "custom" });
  assert.equal(api.detectModeConflict(value).active, false);
});
test("33 valid numeric value passes", () => assert.equal(api.validateField("bust", "104.5").valid, true));
test("34 zero value fails", () => assert.equal(api.validateField("bust", 0).valid, false));
test("35 negative value fails", () => assert.equal(api.validateField("bust", -2).valid, false));
test("36 NaN fails", () => assert.equal(api.validateField("bust", Number.NaN).valid, false));
test("37 Infinity fails", () => assert.equal(api.validateField("bust", Infinity).valid, false));
test("38 too-small value is a warning", () => assert.ok(api.validateField("bust", 5).warning));
test("39 too-large technical value fails", () => assert.equal(api.validateField("bust", 800).valid, false));
test("40 corrupted measurement is ignored", () => assert.equal(api.normalizeMeasurement({ value: "broken" }), null));
test("41 stale data fails closed", () => assert.equal(api.progressSafety([{ stale: true }]).safe, false));
test("42 imported-unproven data fails closed", () => assert.equal(api.progressSafety([{ imported_unproven: true }]).safe, false));
test("43 quarantined data fails closed", () => assert.equal(api.progressSafety([{ quarantined: true }]).safe, false));
test("44 collided data fails closed", () => assert.equal(api.progressSafety([{ collided: true }]).safe, false));
test("45 incomplete details block continue", () => {
  const result = api.readinessPresentation({ details: {}, garmentType: "свитер", readiness: { status: "ready_for_sample", blockers: [] } });
  assert.equal(result.action.enabled, false);
});
test("46 complete details select swatch", () => assert.match(model().readiness.action.href, /#swatch-assistant$/));
test("47 complete density selects calculator", () => {
  const result = model({ readiness: { status: "ready_for_calculation", blockers: [], nextAction: { href: "/calculator?width-value=56" } } });
  assert.equal(result.readiness.action.label, "Перейти к расчёту");
});
test("48 calculator route is preserved exactly", () => {
  const href = "/calculator?width-value=56&gauge-count=20";
  assert.equal(model({ readiness: { status: "ready_for_calculation", blockers: [], nextAction: { href } } }).readiness.action.href, href);
});
test("49 duplicate required fields are suppressed", () => {
  const fields = api.requiredFields({ details: custom(), garmentType: "свитер", technology: { components: [{ name: "sleeve" }, { name: "sleeve" }] } });
  assert.equal(fields.length, new Set(fields.map((entry) => entry.field)).size);
});
test("50 long project title is bounded", () => assert.ok(model({ project: { project_id: "p", title: "x".repeat(400), draft_input: {} } }).project.title.length <= 180));
test("51 raw field names are absent from presentation labels", () => assert.doesNotMatch(JSON.stringify(model().fields.map((field) => field.label)), /bust_|garment_/));
test("52 raw progress kind is absent from the view model", () => assert.doesNotMatch(JSON.stringify(model({ progressRecords: [{ kind: "PATTERN_TECHNOLOGY_DRAFT", state: {} }] })), /PATTERN_TECHNOLOGY_DRAFT/));
test("53 build does not mutate input", () => {
  const source = { project: project(custom()), intent: intent(), saved: custom(), readiness: { status: "ready_for_sample", blockers: [] } };
  const before = structuredClone(source);
  api.buildViewModel(source);
  assert.deepEqual(source, before);
});
test("54 build is repeatable", () => assert.deepEqual(model(), model()));
test("55 production model has no clock or random", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-details-experience.js"), "utf8");
  assert.doesNotMatch(source, /Date\.now|new Date|Math\.random|randomUUID/);
});
test("56 future stage is absent", () => assert.doesNotMatch(JSON.stringify(api), /stage59/i));
test("57 missing project has a safe fallback", () => assert.equal(api.buildViewModel().state, "missing_project"));
test("58 partial update preserves old values", () => {
  const updated = api.applyPatch(custom(), { waist: 86 });
  assert.equal(updated.bodyMeasurements.bust.value, 104);
  assert.equal(updated.bodyMeasurements.waist.value, 86);
});
test("59 empty update does not erase values", () => {
  const updated = api.applyPatch(custom(), { bust: "", garmentLength: null });
  assert.equal(updated.bodyMeasurements.bust.value, 104);
  assert.equal(updated.garmentMeasurements.garmentLength.value, 68);
});
test("60 corrupted saved details use a safe fallback", () => {
  const value = api.normalizeProjectDetails({ stale: true, bodyMeasurements: { bust: 104 } });
  assert.deepEqual(value.bodyMeasurements, {});
});

test("project intent handoff preserves unrelated material and gauge values", () => {
  const original = intent({ gauge: { stitches: 20, widthCm: 10 } });
  const next = api.applyDetailsToIntent(original, custom());
  assert.equal(next.yarn, "меринос");
  assert.deepEqual(next.gauge, original.gauge);
  assert.equal(next.targetWidth.value, 56);
});

test("switching back to standard mode retains custom measurements without applying them", () => {
  let value = custom();
  value = api.applyPatch(value, { standardSize: "L", sizeMode: "standard" });
  assert.equal(value.bodyMeasurements.bust.value, 104);
  assert.equal(value.sizeMode, "standard");
});

require("fake-indexeddb/auto");
global.window = globalThis;
require("../src/yarnai/static/project-system.js");

test("integration persists partial user details without erasing project data", async () => {
  const { DB_NAME, ProjectRepository } = global.YarnAIProjectSystem;
  const repository = new ProjectRepository();
  let reopened;
  try {
    await repository.initialize();
    const created = await repository.createProject({
      title: "Integration sweater",
      draft_input: { preserved: { yarn: "merino" } },
    });
    const beforeRead = await repository.getProject(created.project_id);
    await repository.getProject(created.project_id);
    const afterRead = await repository.getProject(created.project_id);
    assert.equal(afterRead.project.revision, beforeRead.project.revision, "plain opening must not write");

    const saved = api.applyPatch(null, {
      sizeMode: "custom", recipient: "woman", fit: "regular", bust: 96,
      garmentWidth: 51, garmentLength: 62, sleeveLength: 57,
    });
    await repository.updateProject(created.project_id, {
      draft_input: {
        ...afterRead.project.draft_input,
        project_details_experience: saved,
        project_intent: api.applyDetailsToIntent({ garmentType: "??????", yarn: "merino" }, saved),
      },
    });
    await repository.close();

    reopened = new ProjectRepository();
    await reopened.initialize();
    const restored = await reopened.getProject(created.project_id);
    const details = restored.project.draft_input.project_details_experience;
    assert.equal(details.bodyMeasurements.bust.value, 96);
    assert.equal(details.bodyMeasurements.bust.provenance, "user");
    assert.equal(details.garmentMeasurements.garmentLength.value, 62);
    assert.equal(restored.project.draft_input.preserved.yarn, "merino");

    const partial = api.applyPatch(details, { waist: 78, bust: "" });
    assert.equal(partial.bodyMeasurements.bust.value, 96);
    assert.equal(partial.bodyMeasurements.waist.value, 78);
  } finally {
    await repository.close().catch(() => undefined);
    await reopened?.close().catch(() => undefined);
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
  }
});
