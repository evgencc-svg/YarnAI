"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
const gauge = require("../src/yarnai/static/swatch-gauge.js");
require("../src/yarnai/static/project-system.js");
const system = global.YarnAIProjectSystem;
const PROJECT = "018f5f64-8b27-7a36-8c58-4f491a95cd01";
const NOW = "2026-08-02T12:00:00.000Z";
let repositories = [];

function prepared(overrides = {}) {
  return {
    stitches: 22, rows: 31, width: 10, height: 10, unit: "cm",
    preparation: {
      knitted: true, washed: true, dry: true, unstretched: true,
      representative: true, sameYarn: true, sameTools: true, samePattern: true,
    },
    photoId: null,
    ...overrides,
  };
}

function source(overrides = {}) {
  return {
    projectIdentity: PROJECT,
    initializationIdentity: "initialization-1",
    initializationFingerprint: "fnv1a32:12345678",
    yarn: "меринос", tool: "спицы 4 мм", technique: "спицами",
    pattern: "лицевая гладь", recipient: "woman", size: "M",
    ...overrides,
  };
}

function confirmed(input = prepared(), metadata = {}) {
  return gauge.buildConfirmedRecord(input, {
    source: metadata.source || source(),
    identity: metadata.identity || "gauge-1",
    confirmedAt: metadata.confirmedAt || NOW,
    createdBy: "Наталья",
  });
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(system.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database blocked"));
  });
}

beforeEach(async () => {
  repositories = [];
  await deleteDatabase();
});
afterEach(async () => {
  await Promise.all(repositories.map((repo) => repo.close().catch(() => undefined)));
  await deleteDatabase();
});
function repository() {
  const repo = new system.ProjectRepository();
  repositories.push(repo);
  return repo;
}

test("01 normalizes stitches and rows to ten centimeters", () => {
  const result = gauge.assessMeasurement(prepared());
  assert.equal(result.computed.stitchesPer10Cm, 22);
  assert.equal(result.computed.rowsPer10Cm, 31);
  assert.equal(result.readiness, "ready");
});

test("02 supports a non-standard measured area", () => {
  const result = gauge.assessMeasurement(prepared({ stitches: 11, rows: 14, width: 5, height: 4 }));
  assert.equal(result.computed.stitchesPer10Cm, 22);
  assert.equal(result.computed.rowsPer10Cm, 35);
});

test("03 converts inches with an exact 2.54 policy", () => {
  const result = gauge.assessMeasurement(prepared({ stitches: 20, rows: 30, width: 4, height: 4, unit: "in" }));
  assert.equal(result.canonical.widthCm, 10.16);
  assert.equal(result.computed.stitchesPer10Cm, 19.69);
  assert.equal(result.assumptions[0].code, "CANONICAL_CM");
});

test("04 repeated display conversion starts from canonical centimeters", () => {
  const cm = 12.345678;
  assert.equal(gauge.toCentimeters(gauge.fromCentimeters(cm, "in"), "in"), cm);
});

test("05 preserves internal precision before display rounding", () => {
  const result = gauge.assessMeasurement(prepared({ stitches: 17, width: 7 }));
  assert.equal(result.computed.stitchesPer10CmExact, 24.285714);
  assert.equal(result.computed.stitchesPer10Cm, 24.29);
});

for (const [name, patch, code] of [
  ["06 empty value blocks", { stitches: "" }, "INVALID_NUMBER"],
  ["07 zero blocks", { width: 0 }, "NON_POSITIVE_VALUE"],
  ["08 negative blocks", { rows: -1 }, "NON_POSITIVE_VALUE"],
  ["09 NaN blocks", { stitches: "NaN" }, "INVALID_NUMBER"],
  ["10 Infinity blocks", { height: Infinity }, "INVALID_NUMBER"],
  ["11 non numeric blocks", { width: "ten" }, "INVALID_NUMBER"],
  ["12 excessive stitches block", { stitches: 10001 }, "STITCHES_TOO_LARGE"],
  ["13 tiny width blocks", { width: 0.1 }, "WIDTH_TOO_SMALL"],
]) {
  test(name, () => {
    const result = gauge.assessMeasurement(prepared(patch));
    assert.equal(result.canConfirm, false);
    assert.ok(result.errors.some((item) => item.code === code));
  });
}

test("14 a small but possible area warns instead of blocking", () => {
  const result = gauge.assessMeasurement(prepared({ stitches: 8, rows: 8, width: 4, height: 4 }));
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((item) => item.code === "SMALL_WIDTH"));
});

test("15 unusually high gauge requires acknowledgement", () => {
  const input = prepared({ stitches: 101, width: 10 });
  const result = gauge.assessMeasurement(input);
  assert.equal(result.readiness, "conditionally-ready");
  assert.equal(result.canConfirm, false);
  assert.ok(result.requiredAcknowledgements.includes("UNUSUALLY_HIGH_STITCH_GAUGE"));
});

test("16 serious preparation warnings require a separate acknowledgement", () => {
  const input = prepared({ preparation: { ...prepared().preparation, washed: false } });
  const first = gauge.assessMeasurement(input);
  const second = gauge.assessMeasurement({ ...input, acknowledgedWarningCodes: first.requiredAcknowledgements });
  assert.equal(first.canConfirm, false);
  assert.equal(second.canConfirm, true);
});

test("17 missing photo is a non-blocking warning", () => {
  const result = gauge.assessMeasurement(prepared());
  assert.equal(result.canConfirm, true);
  assert.ok(result.warnings.some((item) => item.code === "PHOTO_MISSING"));
});

test("18 an unknitted sample is blocked", () => {
  const result = gauge.assessMeasurement(prepared({ preparation: { ...prepared().preparation, knitted: false } }));
  assert.equal(result.readiness, "blocked");
});

test("19 stretching blocks confirmation", () => {
  const result = gauge.assessMeasurement(prepared({ preparation: { ...prepared().preparation, unstretched: false } }));
  assert.ok(result.errors.some((item) => item.code === "SWATCH_STRETCHED"));
});

test("20 source mismatch blocks confirmation", () => {
  const result = gauge.assessMeasurement(prepared({ preparation: { ...prepared().preparation, sameYarn: false } }));
  assert.ok(result.errors.some((item) => item.code === "YARN_MISMATCH"));
});

test("21 draft has a closed allowlist and canonical source fingerprint", () => {
  const draft = gauge.buildDraft({ ...prepared(), injected: "ignored" }, { source: source(), updatedAt: NOW });
  assert.deepEqual(Object.keys(draft).sort(), ["acknowledgedWarningCodes", "format", "measurementInput", "photoId", "preparation", "projectIdentity", "sourceFingerprint", "updatedAt", "version"].sort());
  assert.equal(draft.injected, undefined);
});

test("22 corrupted draft fails closed", () => {
  const draft = { ...gauge.buildDraft(prepared(), { source: source(), updatedAt: NOW }), unknown: true };
  assert.throws(() => gauge.validateDraft(draft), (error) => error.code === "MALFORMED_DRAFT");
});

test("23 confirmed record uses the exact top-level allowlist", () => {
  const record = confirmed();
  assert.equal(record.format, gauge.FORMAT);
  assert.equal(record.lifecycle, "confirmed");
  assert.equal(record.snapshot.provenance.aiAnalysis, false);
  assert.equal(record.snapshot.linkedPhotoIdentity, null);
  assert.equal(Object.isFrozen(record), true);
});

test("24 unknown confirmed field fails closed", () => {
  const record = JSON.parse(JSON.stringify(confirmed()));
  record.domState = {};
  assert.throws(() => gauge.validateConfirmedRecord(record), (error) => error.code === "MALFORMED_GAUGE_RECORD");
});

test("25 fingerprint is stable", () => {
  assert.equal(confirmed().fingerprint, confirmed().fingerprint);
});

test("26 relevant measurement changes fingerprint", () => {
  assert.notEqual(confirmed().fingerprint, confirmed(prepared({ stitches: 23 })).fingerprint);
});

test("27 key order does not change canonical fingerprint", () => {
  assert.equal(gauge.fingerprint({ a: 1, b: 2 }), gauge.fingerprint({ b: 2, a: 1 }));
});

test("28 tampered computation is rejected", () => {
  const record = JSON.parse(JSON.stringify(confirmed()));
  record.snapshot.computed.stitchesPer10Cm = 99;
  assert.throws(() => gauge.validateConfirmedRecord(record), (error) => ["GAUGE_CALCULATION_MISMATCH", "GAUGE_FINGERPRINT_MISMATCH"].includes(error.code));
});

for (const [name, changed] of [
  ["29 yarn change makes gauge stale", { yarn: "хлопок" }],
  ["30 tool change makes gauge stale", { tool: "спицы 5 мм" }],
  ["31 technique change makes gauge stale", { technique: "крючком" }],
  ["32 initialization change makes gauge stale", { initializationIdentity: "initialization-2" }],
  ["33 recipient change makes gauge stale", { recipient: "child" }],
]) {
  test(name, () => {
    const result = gauge.evaluateRecord(confirmed(), source(changed));
    assert.equal(result.stale, true);
    assert.equal(result.current, false);
  });
}

test("34 current source selects the latest confirmed revision", () => {
  const history = gauge.appendHistory(null, confirmed());
  const current = gauge.selectCurrentRecord(history, source());
  assert.equal(current.state, "current");
  assert.equal(current.current.identity, "gauge-1");
});

test("35 stale revision remains in immutable history but is not current", () => {
  const history = gauge.appendHistory(null, confirmed());
  const selected = gauge.selectCurrentRecord(history, source({ yarn: "хлопок" }));
  assert.equal(selected.state, "stale");
  assert.equal(selected.current, null);
  assert.equal(selected.history.records.length, 1);
});

test("36 repeated confirmation is idempotent", () => {
  const record = confirmed();
  const once = gauge.appendHistory(null, record);
  const twice = gauge.appendHistory(once, confirmed(prepared(), { identity: "gauge-2", confirmedAt: "2026-08-02T12:01:00.000Z" }));
  assert.equal(twice.records.length, 1);
});

test("37 a new measurement appends without modifying the old revision", () => {
  const first = confirmed();
  const once = gauge.appendHistory(null, first);
  const twice = gauge.appendHistory(once, confirmed(prepared({ stitches: 23 }), { identity: "gauge-2", confirmedAt: "2026-08-02T12:01:00.000Z" }));
  assert.equal(twice.records.length, 2);
  assert.deepEqual(twice.records[0], first);
});

test("38 damaged history fails closed", () => {
  const history = JSON.parse(JSON.stringify(gauge.appendHistory(null, confirmed())));
  history.currentRecordIdentity = "missing";
  assert.equal(gauge.selectCurrentRecord(history, source()).state, "blocked");
});

test("39 project scope isolation rejects another project", () => {
  assert.throws(() => gauge.validateConfirmedRecord(confirmed(), { projectIdentity: "another-project" }), (error) => error.code === "PROJECT_SCOPE_MISMATCH");
});

test("40 destination allowlist preserves project identity", () => {
  const valid = gauge.safeDestination(`/user-workspace-entry?project=${PROJECT}`, PROJECT);
  assert.equal(valid.valid, true);
  assert.equal(valid.href, `/user-workspace-entry?project=${PROJECT}`);
});

test("41 arbitrary and external destinations are rejected", () => {
  assert.equal(gauge.safeDestination("javascript:alert(1)", PROJECT).valid, false);
  assert.equal(gauge.safeDestination("https://example.com/user-workspace-entry?project=" + PROJECT, PROJECT).valid, false);
  assert.equal(gauge.safeDestination("/calculator?project=" + PROJECT, PROJECT).valid, false);
});

test("42 photo validation is MIME and size allowlisted", () => {
  assert.equal(gauge.validatePhoto({ type: "image/png", size: 10 }).valid, true);
  assert.equal(gauge.validatePhoto({ type: "image/svg+xml", size: 10 }).valid, false);
  assert.equal(gauge.validatePhoto({ type: "image/png", size: gauge.MAX_PHOTO_BYTES + 1 }).valid, false);
});

test("43 repository deletes only a project-scoped photo and its blob", async () => {
  const repo = repository();
  await repo.initialize();
  const project = await repo.createProject({ title: "Фото образца" });
  const other = await repo.createProject({ title: "Другой проект" });
  const photo = await repo.addPhoto(project.project_id, new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), { purpose: "SWATCH" });
  await assert.rejects(repo.deletePhoto(other.project_id, photo.photo_id), (error) => error.code === "INVALID_PHOTO_SCOPE" || error.code === "PHOTO_REVISION_CONFLICT");
  const deleted = await repo.deletePhoto(project.project_id, photo.photo_id);
  assert.equal(deleted.status, "DELETED");
  assert.equal(await repo.getPhoto(project.project_id, photo.photo_id), null);
  assert.equal(await repo.deletePhoto(project.project_id, photo.photo_id), null);
});

test("44 repository preserves immutable gauge history and current schema", async () => {
  const repo = repository();
  await repo.initialize();
  const project = await repo.createProject({ title: "Плотность" });
  const projectSource = source({ projectIdentity: project.project_id });
  const record = gauge.buildConfirmedRecord(prepared(), { source: projectSource, identity: "gauge-1", confirmedAt: NOW });
  const history = gauge.appendHistory(null, record);
  const first = await repo.updateProject(project.project_id, { draft_input: { [gauge.HISTORY_KEY]: history } }, { baseRevision: project.revision });
  const changed = JSON.parse(JSON.stringify(history));
  changed.records[0].snapshot.computed.stitchesPer10Cm = 99;
  await assert.rejects(repo.updateProject(project.project_id, { draft_input: { [gauge.HISTORY_KEY]: changed } }, { baseRevision: first.revision }));
  assert.equal(system.DB_VERSION, 4);
  assert.equal(system.STORE_NAMES.length, 16);
  assert.equal(new Set(system.STORE_NAMES).size, 16);
});
