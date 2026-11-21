"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const api = require("../src/yarnai/static/project-calculation-entry.js");

const PROJECT = "018f5f64-8b27-7a36-8c58-4f491a95cd01";
const NOW = "2026-08-03T10:00:00.000Z";

function initialization(overrides = {}) {
  const record = {
    identity: "initialization-1",
    project_identity: PROJECT,
    lifecycle: "initialized",
    source_closure_identity: "closure-1",
    source_closure_fingerprint: "fnv1a32:closure",
    snapshot_fingerprint: "fnv1a32:snapshot",
    snapshot: {
      project: { identity: PROJECT },
      garment: { type: "sweater", sizeMode: "custom", standardSize: null, recipient: "woman", fit: "regular" },
      measurements: { garment: { garmentWidth: { value: 50, unit: "cm" } }, body: {} },
    },
    integrity: { importedUnproven: false, quarantined: false, collision: false, recordFingerprint: "fnv1a32:init" },
  };
  return Object.assign(record, overrides);
}

function gauge(overrides = {}) {
  const record = {
    identity: "gauge-1",
    projectIdentity: PROJECT,
    sourceInitializationIdentity: "initialization-1",
    sourceInitializationFingerprint: "fnv1a32:init",
    lifecycle: "confirmed",
    confirmationKey: "fnv1a32:confirmation",
    fingerprint: "fnv1a32:gauge",
    snapshot: { computed: { stitchesPer10Cm: 20, rowsPer10Cm: 28 } },
  };
  return Object.assign(record, overrides);
}

function input(overrides = {}) {
  return {
    projectIdentity: PROJECT,
    project: { project_id: PROJECT },
    initialization: initialization(),
    gauge: gauge(),
    acknowledgedWarningCodes: ["UNKNOWN_PATTERN_REPEAT"],
    ...overrides,
  };
}

function completed(overrides = {}) {
  const assessed = api.assessEntry(input(overrides));
  let snapshot = api.buildSnapshot({ assessment: assessed }, { identity: "entry-1", createdAt: NOW });
  snapshot = api.startReviewing(snapshot, { timestamp: NOW });
  snapshot = api.markReady(snapshot, { timestamp: NOW });
  return api.complete(snapshot, { timestamp: NOW });
}

test("01 valid project calculates 100 stitches", () => {
  const result = api.assessEntry(input());
  assert.equal(result.rawResult, 100);
  assert.equal(result.finalStitchCount, 100);
  assert.equal(result.readiness, "conditionally-ready");
  assert.equal(result.canComplete, true);
});

test("02 non-standard gauge calculates 110 stitches", () => {
  const result = api.assessEntry(input({ gauge: gauge({ snapshot: { computed: { stitchesPer10Cm: 22, rowsPer10Cm: 30 } } }) }));
  assert.equal(result.finalStitchCount, 110);
});

test("03 fractional raw result uses deterministic half-up rounding", () => {
  assert.equal(api.calculateRawStitches(50, 20.1), 100.5);
  assert.equal(api.applyRoundingRule(100.5), 101);
  assert.equal(api.applyRoundingRule(100.49), 100);
});

test("04 invalid width blocks", () => {
  const noWidth = initialization();
  noWidth.snapshot.measurements.garment = {};
  const result = api.assessEntry(input({ initialization: noWidth, draftWidth: { value: -1, unit: "cm", semanticRole: "garment_detail_width", confirmed: true } }));
  assert.equal(result.readiness, "blocked");
  assert.ok(result.blockingErrors.some((item) => item.code === "WORKING_WIDTH_INVALID"));
});

test("05 invalid gauge blocks", () => {
  const result = api.assessEntry(input({ gauge: gauge({ snapshot: { computed: { stitchesPer10Cm: 0, rowsPer10Cm: 28 } } }) }));
  assert.ok(result.blockingErrors.some((item) => item.code === "STITCH_GAUGE_INVALID"));
});

test("06 missing Stage 61 initialization blocks", () => {
  assert.ok(api.assessEntry(input({ initialization: null })).blockingErrors.some((item) => item.code === "INITIALIZATION_MISSING"));
});

test("07 missing confirmed gauge blocks", () => {
  assert.ok(api.assessEntry(input({ gauge: null })).blockingErrors.some((item) => item.code === "CONFIRMED_GAUGE_MISSING"));
});

test("08 gauge from another project blocks", () => {
  assert.ok(api.assessEntry(input({ gauge: gauge({ projectIdentity: "other" }) })).blockingErrors.some((item) => item.code === "GAUGE_PROJECT_MISMATCH"));
});

test("09 stale gauge revision blocks", () => {
  assert.ok(api.assessEntry(input({ gauge: gauge({ sourceInitializationFingerprint: "old" }) })).blockingErrors.some((item) => item.code === "GAUGE_STALE"));
});

test("10 conflicting confirmed widths block", () => {
  const result = api.assessEntry(input({ widthSources: [{ value: 55, unit: "cm", semanticRole: "confirmed_pattern_width", provenance: "pattern_analysis", sourceIdentity: "pattern-1", confirmed: true }] }));
  assert.ok(result.blockingErrors.some((item) => item.code === "WORKING_WIDTH_CONFLICT"));
});

test("11 unknown semantic role is rejected", () => {
  assert.equal(api.normalizeWidthSource({ value: 50, unit: "cm", semanticRole: "half_bust", provenance: "user", sourceIdentity: "x", confirmed: true }), null);
});

test("12 unknown repeat gives conditional readiness", () => {
  const result = api.assessEntry(input({ acknowledgedWarningCodes: [] }));
  assert.equal(result.readiness, "conditionally-ready");
  assert.equal(result.canComplete, false);
});

test("13 required warning acknowledgment is enforced", () => {
  const result = api.assessEntry(input({ acknowledgedWarningCodes: [] }));
  assert.deepEqual(result.missingAcknowledgements, ["UNKNOWN_PATTERN_REPEAT"]);
});

test("14 fingerprint is stable for identical inputs", () => {
  assert.equal(api.assessEntry(input()).fingerprint, api.assessEntry(input()).fingerprint);
});

test("15 fingerprint changes with width", () => {
  const first = api.assessEntry(input()).fingerprint;
  const changed = initialization();
  changed.snapshot.measurements.garment.garmentWidth.value = 51;
  assert.notEqual(first, api.assessEntry(input({ initialization: changed })).fingerprint);
});

test("16 fingerprint changes with gauge", () => {
  const first = api.assessEntry(input()).fingerprint;
  assert.notEqual(first, api.assessEntry(input({ gauge: gauge({ fingerprint: "fnv1a32:gauge2", snapshot: { computed: { stitchesPer10Cm: 21, rowsPer10Cm: 28 } } }) })).fingerprint);
});

test("17 equivalent units give the same canonical fingerprint", () => {
  const noWidth = initialization();
  noWidth.snapshot.measurements.garment = {};
  const cm = api.assessEntry(input({ initialization: noWidth, draftWidth: { value: 25.4, unit: "cm", semanticRole: "garment_detail_width", confirmed: true } })).fingerprint;
  const inches = api.assessEntry(input({ initialization: noWidth, draftWidth: { value: 10, unit: "in", semanticRole: "garment_detail_width", confirmed: true } })).fingerprint;
  assert.equal(cm, inches);
});

test("18 completed snapshot is immutable", () => {
  const snapshot = completed();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => api.startReviewing(snapshot, { timestamp: NOW }), { code: "COMPLETED_SNAPSHOT_IMMUTABLE" });
});

test("19 blocked entry cannot build or complete", () => {
  assert.throws(() => api.buildSnapshot({ assessment: api.assessEntry(input({ gauge: null })) }, { identity: "x", createdAt: NOW }), { code: "ENTRY_BLOCKED" });
});

test("20 draft cannot transition directly to completed", () => {
  const draft = api.buildSnapshot({ assessment: api.assessEntry(input()) }, { identity: "entry-1", createdAt: NOW });
  assert.throws(() => api.complete(draft, { timestamp: NOW }), { code: "LIFECYCLE_TRANSITION_INVALID" });
});

test("21 snapshot is JSON-safe", () => {
  const snapshot = completed();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test("22 snapshot uses a closed allowlist", () => {
  const snapshot = completed();
  assert.deepEqual(Object.keys(snapshot), api.SNAPSHOT_KEYS);
  const unsafe = structuredClone(snapshot);
  unsafe.route = "/calculator";
  assert.throws(() => api.validateSnapshot(unsafe), { code: "SNAPSHOT_NOT_ALLOWLISTED" });
});

test("23 stale detection keeps old result but blocks current use", () => {
  const snapshot = completed();
  const current = api.assessEntry(input());
  assert.equal(api.staleStatus(snapshot, current).current, true);
  const changedGauge = api.assessEntry(input({ gauge: gauge({ fingerprint: "fnv1a32:new", snapshot: { computed: { stitchesPer10Cm: 21, rowsPer10Cm: 28 } } }) }));
  assert.equal(api.staleStatus(snapshot, changedGauge).stale, true);
});
