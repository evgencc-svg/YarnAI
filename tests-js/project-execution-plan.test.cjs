"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const domain = require("../src/yarnai/static/project-execution-plan.js");

const PROJECT = "018f5f64-8b27-7a36-8c58-4f491a95cd01";
const OTHER = "018f5f64-8b27-7a36-9c58-4f491a95cd02";
const NOW = "2026-08-03T10:00:00.000Z";

function sources(options = {}) {
  const projectId = options.projectId || PROJECT;
  const closure = { closureId: "closure-1", projectId, lifecycle: "completed", recordFingerprint: "fnv1a32:closure" };
  const initialization = {
    identity: "initialization-1", project_identity: projectId, lifecycle: "initialized",
    source_closure_identity: closure.closureId, source_closure_fingerprint: closure.recordFingerprint,
    snapshot_fingerprint: "fnv1a32:init-snapshot",
    snapshot: { project: { identity: projectId }, garment: { type: "sweater", sizeMode: "custom", recipient: "woman" }, measurements: { garment: { garmentWidth: { value: 50, unit: "cm" } } } },
    integrity: { recordFingerprint: "fnv1a32:init", importedUnproven: false, collision: false, quarantined: false },
  };
  const gauge = {
    identity: "gauge-1", projectIdentity: projectId, lifecycle: "confirmed",
    sourceInitializationIdentity: initialization.identity, sourceInitializationFingerprint: initialization.integrity.recordFingerprint,
    fingerprint: "fnv1a32:gauge", snapshot: { computed: { stitchesPer10Cm: 20, rowsPer10Cm: 28 } },
  };
  const snapshot = {
    lifecycle: options.calculationLifecycle || "completed", projectIdentity: projectId,
    sourceIdentities: { initialization: initialization.identity, projectDetailsClosure: closure.closureId, gaugeRevision: gauge.identity },
    sourceFingerprints: { initialization: initialization.integrity.recordFingerprint, projectDetails: closure.recordFingerprint, gauge: gauge.fingerprint },
    fingerprint: options.calculationFingerprint || "fnv1a32:calculation", calculationTarget: "stitches_for_working_width",
    workingWidth: { canonicalValueCm: options.width || 50, semanticRole: "garment_detail_width" }, finalStitchCount: options.stitches === undefined ? 100 : options.stitches,
  };
  const calculation = {
    record: { calculation_id: "calculation-1", project_id: options.calculationProjectId || projectId, request: { project_calculation_entry: { kind: "PROJECT_CALCULATION_ENTRY", fingerprint: options.requestFingerprint || snapshot.fingerprint } }, result: { snapshot } },
    snapshot,
  };
  const project = { project_id: projectId, active_calculation_id: "calculation-1", title: "Свитер" };
  return { projectIdentity: projectId, project, closure, initialization, gauge, calculation };
}

function assessment(options = {}) {
  const sourceChain = domain.validateSourceChain(options.sources || sources(options));
  const preliminary = domain.assessPlan({ sourceChain, technology: options.technology, boundedInputs: options.boundedInputs });
  return domain.assessPlan({ sourceChain, technology: options.technology, boundedInputs: options.boundedInputs, acknowledgedWarningCodes: options.acknowledgedWarningCodes || preliminary.requiredAcknowledgementCodes });
}

function completed(options = {}) {
  const value = assessment(options);
  let snapshot = domain.buildSnapshot({ assessment: value }, { createdAt: NOW });
  snapshot = domain.startReviewing(snapshot, { timestamp: NOW });
  snapshot = domain.markReady(snapshot, { timestamp: NOW });
  return domain.complete(snapshot, { timestamp: NOW });
}

test("01 valid source chain", () => assert.equal(domain.validateSourceChain(sources()).valid, true));
test("02 project missing", () => { const input = sources(); input.project = null; assert.equal(domain.validateSourceChain(input).blockingErrors[0].code, "PROJECT_MISSING"); });
test("03 UUID invalid", () => assert.throws(() => domain.validateProjectIdentity("bad"), { code: "PROJECT_ID_INVALID" }));
test("04 initialization missing", () => { const input = sources(); input.initialization = null; assert.equal(domain.validateSourceChain(input).blockingErrors[0].code, "INITIALIZATION_MISSING"); });
test("05 gauge missing", () => { const input = sources(); input.gauge = null; assert.equal(domain.validateSourceChain(input).blockingErrors[0].code, "GAUGE_MISSING"); });
test("06 gauge stale", () => { const input = sources(); input.gauge.sourceInitializationFingerprint = "old"; assert.equal(domain.validateSourceChain(input).blockingErrors[0].code, "GAUGE_STALE"); });
test("07 calculation missing", () => { const input = sources(); input.calculation = null; input.calculations = []; assert.equal(domain.validateSourceChain(input).blockingErrors[0].code, "CALCULATION_MISSING"); });
test("08 calculation not completed", () => assert.equal(domain.validateSourceChain(sources({ calculationLifecycle: "ready" })).blockingErrors[0].code, "CALCULATION_NOT_COMPLETED"));
test("09 calculation belongs to another project", () => assert.equal(domain.validateSourceChain(sources({ calculationProjectId: OTHER })).blockingErrors[0].code, "CALCULATION_PROJECT_MISMATCH"));
test("10 calculation stale", () => { const input = sources(); input.project.active_calculation_id = "new-calculation"; assert.equal(domain.validateSourceChain(input).blockingErrors[0].code, "CALCULATION_STALE"); });
test("11 calculation fingerprint mismatch", () => assert.equal(domain.validateSourceChain(sources({ requestFingerprint: "broken" })).blockingErrors[0].code, "CALCULATION_FINGERPRINT_MISMATCH"));
test("12 result creates CAST_ON", () => assert.equal(assessment().steps[0].type, "CAST_ON"));
test("13 first step contains 100 stitches", () => assert.equal(assessment().steps[0].expectedOutput.stitchCount, 100));
test("14 unknown repeat creates warning", () => assert.ok(assessment().warnings.some((item) => item.code === "UNKNOWN_PATTERN_REPEAT")));
test("15 unknown edge stitches create warning", () => assert.ok(assessment().warnings.some((item) => item.code === "UNKNOWN_EDGE_STITCHES")));
test("16 unknown construction creates no shaping", () => assert.equal(assessment().steps.some((item) => item.type === "SHAPING"), false));
test("17 partial plan is conditionally-ready", () => assert.equal(assessment().readiness, "conditionally-ready"));
test("18 plan without actionable step is blocked", () => assert.equal(domain.validateSourceChain(sources({ stitches: 0 })).valid, false));
test("19 conflicting technology blocks", () => assert.equal(assessment({ technology: { status: "confirmed", id: "tech", fingerprint: "tech-fp", confirmedSnapshot: { conflicts: [{ resolved: false }] } } }).readiness, "blocked"));
test("20 required acknowledgements are enforced", () => { const value = domain.assessPlan({ sourceChain: domain.validateSourceChain(sources()) }); assert.equal(value.canComplete, false); });
test("21 acknowledged codes must be a subset", () => assert.equal(domain.assessPlan({ sourceChain: domain.validateSourceChain(sources()), acknowledgedWarningCodes: ["OLD_CODE"] }).blockingErrors[0].code, "ACKNOWLEDGEMENT_INVALID"));
test("22 fingerprint is stable", () => assert.equal(assessment().fingerprint, assessment().fingerprint));
test("23 fingerprint changes with calculation", () => assert.notEqual(assessment().fingerprint, assessment({ calculationFingerprint: "fnv1a32:new-calculation" }).fingerprint));
test("24 fingerprint changes with technology", () => assert.notEqual(assessment().fingerprint, assessment({ technology: { status: "confirmed", id: "tech", fingerprint: "tech-fp", confirmedSnapshot: { mainPattern: "stockinette" } } }).fingerprint));
test("25 fingerprint changes with bounded input", () => assert.notEqual(assessment().fingerprint, assessment({ boundedInputs: { direction: "bottom_up", confirmed: true } }).fingerprint));
test("26 completed snapshot is immutable", () => assert.throws(() => domain.transitionLifecycle(completed(), "completed", { timestamp: NOW }), { code: "COMPLETED_SNAPSHOT_IMMUTABLE" }));
test("27 blocked plan cannot complete", () => assert.throws(() => domain.buildSnapshot({ assessment: assessment({ technology: { status: "confirmed", confirmedSnapshot: { conflicts: [{}] } } }) }, { createdAt: NOW }), { code: "TECHNOLOGY_CONFLICT" }));
test("28 draft to completed is forbidden", () => assert.throws(() => domain.complete(domain.buildSnapshot({ assessment: assessment() }, { createdAt: NOW }), { timestamp: NOW }), { code: "LIFECYCLE_TRANSITION_INVALID" }));
test("29 snapshot is JSON safe", () => assert.equal(domain.jsonSafe(completed()), true));
test("30 snapshot top-level allowlist", () => assert.deepEqual(Object.keys(completed()).sort(), [...domain.SNAPSHOT_KEYS].sort()));
test("31 step allowlist", () => completed().steps.forEach((item) => assert.deepEqual(Object.keys(item).sort(), [...domain.STEP_KEYS].sort())));
test("32 duplicate step identities are rejected", () => { const value = JSON.parse(JSON.stringify(completed())); value.lifecycle = "ready"; value.completedAt = null; value.audit.explicitConfirmation = false; value.steps[1].identity = value.steps[0].identity; assert.throws(() => domain.validateSnapshot(value), { code: "DUPLICATE_STEP_IDENTITY" }); });
test("33 missing dependency is rejected", () => { const value = JSON.parse(JSON.stringify(completed())); value.lifecycle = "ready"; value.completedAt = null; value.audit.explicitConfirmation = false; value.steps[1].dependencies = ["missing"]; assert.throws(() => domain.validateSnapshot(value), { code: "STEP_DEPENDENCY_MISSING" }); });
test("34 sequence numbers are deterministic", () => assert.deepEqual(assessment().steps.map((item) => item.sequenceNumber), [1, 2, 3]));
test("35 conditional steps are separate", () => { const value = assessment(); assert.equal(value.steps.filter((item) => item.status === "confirmed").length, 1); assert.equal(value.steps.filter((item) => item.status === "conditional").length, 2); });
test("36 unknown late stages are omitted", () => assert.equal(assessment().planScope.omittedStepTypes.includes("JOINING"), true));
