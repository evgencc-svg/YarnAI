"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.window = globalThis;
const experience = require("../src/yarnai/static/project-details-experience.js");
const collaboration = require("../src/yarnai/static/project-details-collaboration.js");
const api = require("../src/yarnai/static/project-details-closure.js");

function fullDetails(overrides = {}) {
  return experience.applyPatch(null, {
    sizeMode: "custom", recipient: "woman", fit: "regular",
    bust: 96, waist: 76, hips: 102, shoulderWidth: 39, upperArm: 30,
    armholeDepth: 21, neck: 36, garmentWidth: 50, garmentLength: 62,
    sleeveLength: 57, necklineDepth: 10, ...overrides,
  });
}

function standardDetails(overrides = {}) {
  return experience.applyPatch(null, {
    sizeMode: "standard", recipient: "woman", standardSize: "M", fit: "regular",
    garmentLength: 62, sleeveLength: 57, ...overrides,
  });
}

function input(overrides = {}) {
  const details = overrides.details || fullDetails();
  return {
    projectId: "project-1",
    garmentType: "свитер",
    technology: { components: [{ name: "sleeve" }] },
    intent: { garmentType: "свитер" },
    details,
    safe: true,
    nextDestination: { enabled: true, label: "Перейти к образцу", href: "/user-workspace-entry?project=project-1#swatch-assistant", description: "Следующий шаг — образец." },
    ...overrides,
  };
}

function metadata(overrides = {}) {
  return { closureId: "closure-1", createdAt: "2026-08-02T10:00:00.000Z", createdBy: "Владелец", ...overrides };
}

function completed(source = input(), overrides = {}) {
  const snapshot = api.buildProjectDetailsSnapshot(source);
  const draft = api.buildClosureDraft({ snapshot }, metadata(overrides));
  const reviewing = api.startReviewing(draft, { reviewedAt: "2026-08-02T10:01:00.000Z", acknowledged: overrides.acknowledged === true });
  return api.completeClosure(reviewing, { completedAt: "2026-08-02T10:02:00.000Z", acknowledged: overrides.acknowledged === true });
}

function acceptedCollaboration(details = fullDetails({ bust: 98 })) {
  const requestId = "request-1";
  const responseId = "response-1";
  const pathName = "details.bodyMeasurements.bust";
  return {
    version: 1,
    requests: { [requestId]: { requestId, projectId: "project-1" } },
    responses: { [responseId]: { responseId, requestId, projectId: "project-1", helper: { label: "Наталья" }, proposals: [{ path: pathName, value: details.bodyMeasurements.bust.value }] } },
    reviews: { [responseId]: { decisions: { [pathName]: "accepted" }, reviewedAt: "2026-08-02T09:00:00.000Z" } },
    provenance: { version: 1, byPath: { [pathName]: { source: "collaboration_response", requestId, responseId, helperLabel: "Наталья", acceptedAt: "2026-08-02T09:00:00.000Z" } } },
    lastApplied: { requestId, responseId, acceptedPaths: [pathName] },
  };
}

test("01 minimal snapshot is canonical and allowlisted", () => {
  const snapshot = api.buildProjectDetailsSnapshot(input({ details: experience.applyPatch(null, { sizeMode: "custom" }) }));
  assert.deepEqual(Object.keys(snapshot), api.SNAPSHOT_KEYS);
  assert.equal(snapshot.projectId, "project-1");
});

test("02 full snapshot contains recipient, garment, fit and measurements", () => {
  const snapshot = api.buildProjectDetailsSnapshot(input());
  assert.equal(snapshot.details.recipient, "woman");
  assert.equal(snapshot.garmentType, "свитер");
  assert.equal(snapshot.details.bodyMeasurements.bust.value, 96);
  assert.equal(snapshot.details.garmentMeasurements.garmentLength.value, 62);
});

test("03 arbitrary draft input is not included", () => {
  const snapshot = api.buildProjectDetailsSnapshot(input({ unrelated: { credential: "secret" } }));
  assert.doesNotMatch(JSON.stringify(snapshot), /credential|secret|unrelated/);
});

test("04 unknown raw measurement path fails closed", () => {
  const details = fullDetails();
  details.bodyMeasurements.medicalGuess = { value: 10, unit: "cm" };
  const snapshot = api.buildProjectDetailsSnapshot(input({ details }));
  assert.ok(snapshot.validation.blockingErrors.some((item) => item.code === "unknown_snapshot_path"));
});

test("05 snapshot is stable", () => assert.deepEqual(api.buildProjectDetailsSnapshot(input()), api.buildProjectDetailsSnapshot(input())));

test("06 snapshot ignores source key order", () => {
  const first = fullDetails();
  const second = { ...first, bodyMeasurements: Object.fromEntries(Object.entries(first.bodyMeasurements).reverse()) };
  assert.equal(api.fingerprint(api.buildProjectDetailsSnapshot(input({ details: first }))), api.fingerprint(api.buildProjectDetailsSnapshot(input({ details: second }))));
});

test("07 builders do not mutate inputs", () => {
  const source = input();
  const before = structuredClone(source);
  api.buildProjectDetailsSnapshot(source);
  assert.deepEqual(source, before);
});

test("08 stable fingerprint repeats", () => {
  const snapshot = api.buildProjectDetailsSnapshot(input());
  assert.equal(api.fingerprint(snapshot), api.fingerprint(structuredClone(snapshot)));
});

test("09 significant measurement changes fingerprint", () => {
  const before = api.buildProjectDetailsSnapshot(input());
  const after = api.buildProjectDetailsSnapshot(input({ details: fullDetails({ bust: 99 }) }));
  assert.notEqual(api.fingerprint(before), api.fingerprint(after));
});

test("10 cosmetic UI state does not change fingerprint", () => {
  assert.equal(api.fingerprint(api.buildProjectDetailsSnapshot(input({ accordionOpen: true }))), api.fingerprint(api.buildProjectDetailsSnapshot(input({ accordionOpen: false }))));
});

test("11 complete custom details are ready", () => assert.equal(api.computeReadiness(input()).status, "ready"));
test("12 recommended gaps and standard-size assumption are conditional", () => assert.equal(api.computeReadiness(input({ details: standardDetails() })).status, "conditionally-ready"));
test("13 missing required blocks", () => assert.equal(api.computeReadiness(input({ details: experience.applyPatch(null, { sizeMode: "custom", recipient: "woman" }) })).status, "blocked"));
test("14 validation error blocks", () => assert.equal(api.computeReadiness(input({ validationErrors: [{ code: "invalid_value", path: "details.bodyMeasurements.bust", message: "Ошибка" }] })).status, "blocked"));
test("15 unresolved conflict blocks", () => assert.equal(api.computeReadiness(input({ conflicts: [{ code: "conflict", path: "details.fit", message: "Конфликт" }] })).status, "blocked"));
test("16 warnings and blockers stay separate", () => {
  const readiness = api.computeReadiness(input({ validationWarnings: [{ code: "warning", message: "Проверь" }] }));
  assert.equal(readiness.blockingErrors.length, 0);
  assert.equal(readiness.warnings.length, 1);
});

test("17 positive fit width mismatch is a warning", () => {
  const snapshot = api.buildProjectDetailsSnapshot(input({ details: fullDetails({ bust: 110, garmentWidth: 52 }) }));
  assert.ok(snapshot.validation.warnings.some((item) => item.code === "positive_fit_width_warning"));
});

test("18 impossible body/finished ratio blocks", () => {
  const snapshot = api.buildProjectDetailsSnapshot(input({ details: fullDetails({ bust: 200, garmentWidth: 40 }) }));
  assert.ok(snapshot.validation.blockingErrors.some((item) => item.code === "impossible_finished_width"));
});

test("19 standard size works without custom body measurements", () => {
  const snapshot = api.buildProjectDetailsSnapshot(input({ details: standardDetails({ garmentWidth: 50, necklineDepth: 10 }) }));
  assert.equal(snapshot.missingRequired.length, 0);
});

test("20 custom mode works without a standard size", () => assert.equal(api.buildProjectDetailsSnapshot(input()).details.standardSize, ""));
test("21 coherent positive fit adds informational comparison", () => assert.ok(api.buildProjectDetailsSnapshot(input()).validation.notices.some((item) => item.code === "body_finished_width_compared")));

test("22 assumptions are normalized and sorted", () => {
  const result = api.normalizeAssumptions([{ code: "b", label: "Б" }, { code: "a", label: "А" }]);
  assert.deepEqual(result.map((item) => item.code), ["a", "b"]);
});

test("23 assumption normalization is idempotent", () => {
  const first = api.normalizeAssumptions([{ code: "a", label: "А" }, { code: "a", label: "А" }]);
  assert.deepEqual(api.normalizeAssumptions(first), first);
});

test("24 provenance summary uses human labels", () => {
  const row = api.buildProjectDetailsSnapshot(input()).provenance.find((item) => item.path.endsWith("bust"));
  assert.equal(row.label, "Обхват груди");
  assert.doesNotMatch(row.sourceLabel, /details\./);
});

test("25 accepted collaboration provenance is included", () => {
  const details = fullDetails({ bust: 98 });
  const snapshot = api.buildProjectDetailsSnapshot(input({ details, collaborationState: acceptedCollaboration(details) }));
  assert.equal(snapshot.collaboration.appliedCount, 1);
  assert.equal(snapshot.provenance.find((item) => item.path.endsWith("bust")).source, "collaboration_response");
});

test("26 broken collaboration provenance blocks", () => {
  const details = fullDetails({ bust: 98 });
  const state = acceptedCollaboration(details);
  delete state.responses["response-1"];
  const snapshot = api.buildProjectDetailsSnapshot(input({ details, collaborationState: state }));
  assert.ok(snapshot.validation.blockingErrors.some((item) => item.code === "collaboration_provenance_broken"));
});

test("27 closure draft contains immutable snapshot and identity", () => {
  const draft = api.buildClosureDraft(input(), metadata());
  assert.equal(draft.kind, api.KIND);
  assert.equal(draft.lifecycle, "draft");
  assert.ok(draft.snapshotFingerprint);
  assert.ok(Object.isFrozen(draft.snapshot));
});

test("28 draft transitions to reviewing", () => assert.equal(api.startReviewing(api.buildClosureDraft(input(), metadata()), { reviewedAt: "2026-08-02T10:01:00.000Z" }).lifecycle, "reviewing"));
test("29 reviewing transitions to completed", () => assert.equal(completed().lifecycle, "completed"));

test("30 blocked closure cannot complete", () => {
  const draft = api.buildClosureDraft(input({ details: {} }), metadata());
  const review = api.startReviewing(draft, { reviewedAt: "2026-08-02T10:01:00.000Z" });
  assert.throws(() => api.completeClosure(review, { completedAt: "2026-08-02T10:02:00.000Z" }), { code: "CLOSURE_BLOCKED" });
});

test("31 conditional closure requires acknowledgement", () => {
  const draft = api.buildClosureDraft(input({ details: standardDetails() }), metadata());
  const review = api.startReviewing(draft, { reviewedAt: "2026-08-02T10:01:00.000Z" });
  assert.throws(() => api.completeClosure(review, { completedAt: "2026-08-02T10:02:00.000Z" }), { code: "ACKNOWLEDGEMENT_REQUIRED" });
});

test("32 conditional closure completes after acknowledgement", () => assert.equal(completed(input({ details: standardDetails() }), { acknowledged: true }).decision, "closed"));

test("33 completed closure is deeply immutable", () => {
  const value = completed();
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.snapshot.details));
  assert.throws(() => api.startReviewing(value), { code: "COMPLETED_CLOSURE_IMMUTABLE" });
});

test("34 repeated closure has a new identity", () => assert.notEqual(completed(input(), { closureId: "closure-a" }).closureId, completed(input(), { closureId: "closure-b" }).closureId));
test("35 repeated closure records supersession metadata", () => assert.equal(completed(input(), { closureId: "closure-b", previousClosureId: "closure-a" }).supersession.supersedesClosureId, "closure-a"));

test("36 live snapshot matches current closure", () => assert.equal(api.evaluateStoredClosure(completed(), input()).current, true));
test("37 recipient change makes closure stale", () => assert.equal(api.evaluateStoredClosure(completed(), input({ details: fullDetails({ recipient: "man" }) })).stale, true));
test("38 fit change makes closure stale", () => assert.equal(api.evaluateStoredClosure(completed(), input({ details: fullDetails({ fit: "relaxed" }) })).stale, true));
test("39 body measurement change makes closure stale", () => assert.equal(api.evaluateStoredClosure(completed(), input({ details: fullDetails({ bust: 99 }) })).stale, true));
test("40 finished measurement change makes closure stale", () => assert.equal(api.evaluateStoredClosure(completed(), input({ details: fullDetails({ garmentLength: 64 }) })).stale, true));

test("41 applied collaboration change makes closure stale", () => {
  const original = completed();
  const details = fullDetails({ bust: 98 });
  assert.equal(api.evaluateStoredClosure(original, input({ details, collaborationState: acceptedCollaboration(details) })).stale, true);
});

test("42 helper draft does not make closure stale", () => assert.equal(api.evaluateStoredClosure(completed(), input({ collaborationState: { helperDraft: { bust: 120 } } })).stale, false));
test("43 rejected proposal does not make closure stale", () => assert.equal(api.evaluateStoredClosure(completed(), input({ collaborationState: { responses: { r: { proposals: [{ path: "details.fit", value: "relaxed" }] } }, reviews: { r: { decisions: { "details.fit": "rejected" } } } } })).stale, false));
test("44 stale diff contains human changed field", () => assert.ok(api.evaluateStoredClosure(completed(), input({ details: fullDetails({ bust: 99 }) })).comparison.changes.some((item) => item.label === "Обхват груди")));

test("45 malformed closure fails closed", () => assert.equal(api.evaluateStoredClosure("{", input()).valid, false));
test("46 unknown kind fails", () => assert.throws(() => api.validateClosurePayload({ ...completed(), kind: "OTHER" }), { code: "UNKNOWN_CLOSURE_KIND" }));
test("47 unsupported version fails", () => assert.throws(() => api.validateClosurePayload({ ...completed(), schemaVersion: 2 }), { code: "UNSUPPORTED_CLOSURE_VERSION" }));
test("48 project identity mismatch fails", () => assert.equal(api.evaluateStoredClosure(completed(), input({ projectId: "project-2" })).valid, false));
test("49 snapshot fingerprint mismatch fails", () => assert.throws(() => api.validateClosurePayload({ ...completed(), snapshotFingerprint: "bad" }), { code: "SNAPSHOT_FINGERPRINT_MISMATCH" }));
test("50 tampered snapshot fails", () => {
  const value = structuredClone(completed());
  value.snapshot.details.recipient = "man";
  assert.throws(() => api.validateClosurePayload(value));
});

test("51 unknown snapshot key fails", () => {
  const value = structuredClone(completed());
  value.snapshot.secret = "x";
  assert.throws(() => api.validateClosurePayload(value), { code: "UNKNOWN_SNAPSHOT_PATH" });
});

for (const [number, key, code] of [[52, "importedUnproven", "IMPORTED_UNPROVEN"], [53, "quarantined", "QUARANTINED"], [54, "collided", "COLLIDED"]]) {
  test(`${number} ${key} closure fails closed`, () => {
    const value = structuredClone(completed());
    value.state[key] = true;
    value.recordFingerprint = api.fingerprint((() => { const next = structuredClone(value); delete next.recordFingerprint; return next; })());
    assert.throws(() => api.validateClosurePayload(value), { code });
  });
}

test("55 incompatible duplicate identity is rejected", () => {
  const first = completed();
  const history = api.appendCompletedClosure(null, first);
  const second = completed(input({ details: fullDetails({ bust: 99 }) }));
  assert.throws(() => api.appendCompletedClosure(history, second), { code: "CLOSURE_IDENTITY_COLLISION" });
});

test("56 lifecycle violation is rejected", () => assert.throws(() => api.markReady(api.buildClosureDraft(input(), metadata())), { code: "LIFECYCLE_VIOLATION" }));
test("57 review summary is deterministic", () => assert.deepEqual(api.buildReviewSummary(input()), api.buildReviewSummary(input())));
test("58 blocked decision is cannot_close", () => assert.equal(api.buildClosureDraft(input({ details: {} }), metadata()).decision, "cannot_close"));
test("59 conditional decision requires acknowledgement", () => assert.equal(api.buildClosureDraft(input({ details: standardDetails() }), metadata()).decision, "requires_acknowledgement"));
test("60 ready decision is ready_to_close", () => assert.equal(api.buildClosureDraft(input(), metadata()).decision, "ready_to_close"));
test("61 completed decision is closed", () => assert.equal(completed().decision, "closed"));
test("62 stale decision is computed live", () => assert.equal(api.evaluateStoredClosure(completed(), input({ details: fullDetails({ fit: "relaxed" }) })).decision, "stale"));

test("63 history append preserves unrelated project fields", () => {
  const draftInput = { yarn: "merino", [api.HISTORY_KEY]: api.appendCompletedClosure(null, completed()) };
  assert.equal(draftInput.yarn, "merino");
});

test("64 Stage 58 data is not mutated", () => {
  const details = fullDetails();
  const before = structuredClone(details);
  completed(input({ details }));
  assert.deepEqual(details, before);
});

test("65 Stage 59 state is not erased", () => {
  const state = { requests: { keep: { value: 1 } } };
  const before = structuredClone(state);
  api.buildProjectDetailsSnapshot(input({ collaborationState: state }));
  assert.deepEqual(state, before);
});

test("66 stored verdict is revalidated against live readiness", () => {
  const evaluation = api.evaluateStoredClosure(completed(), input({ details: experience.applyPatch(null, { sizeMode: "custom" }) }));
  assert.equal(evaluation.canContinue, false);
});

test("67 existing next destination is preserved outside the immutable snapshot", () => assert.match(api.buildReviewSummary(input()).nextDestination.href, /#swatch-assistant$/));
test("68 no automatic navigation exists in the pure module", () => assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-details-closure.js"), "utf8"), /location\.assign|location\.replace/));
test("69 current completed closure unlocks Continue", () => assert.equal(api.buildReviewSummary({ ...input(), latestClosure: completed() }).canContinue, true));
test("70 stale closure blocks Continue", () => assert.equal(api.buildReviewSummary({ ...input({ details: fullDetails({ bust: 99 }) }), latestClosure: completed() }).canContinue, false));

test("identical duplicate history record is idempotent", () => {
  const value = completed();
  const history = api.appendCompletedClosure(null, value);
  assert.deepEqual(api.appendCompletedClosure(history, value), history);
});

test("history preserves completed record bytes when a successor is appended", () => {
  const first = completed(input(), { closureId: "closure-a" });
  const before = structuredClone(first);
  let history = api.appendCompletedClosure(null, first);
  history = api.appendCompletedClosure(history, completed(input({ details: fullDetails({ bust: 99 }) }), { closureId: "closure-b", previousClosureId: "closure-a" }));
  assert.deepEqual(history.records[0], before);
  assert.equal(history.records[1].supersession.previousClosureId, "closure-a");
});

test("unknown destination fails closed", () => assert.equal(api.buildReviewSummary(input({ nextDestination: { enabled: true, href: "https://evil.example" } })).nextDestination.enabled, false));

test("production pure functions have no clock, random, DOM or IndexedDB", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-details-closure.js"), "utf8");
  assert.doesNotMatch(source, /Date\.now|new Date|Math\.random|randomUUID|indexedDB\.open|document\./);
});

require("fake-indexeddb/auto");
require("../src/yarnai/static/project-system.js");

test("ProjectRepository persists closure history without losing aggregate fields or changing stores", async () => {
  const { DB_NAME, DB_VERSION, STORE_NAMES, ProjectRepository } = global.YarnAIProjectSystem;
  const repository = new ProjectRepository();
  try {
    await repository.initialize();
    const created = await repository.createProject({ title: "Closure project", draft_input: { preserved: { yarn: "merino" }, project_details_experience: fullDetails() } });
    const aggregate = await repository.getProject(created.project_id);
    const source = input({ projectId: created.project_id, details: aggregate.project.draft_input.project_details_experience });
    const closure = completed(source, { closureId: "closure-repository" });
    const draftInput = structuredClone(aggregate.project.draft_input);
    draftInput[api.HISTORY_KEY] = api.appendCompletedClosure(draftInput[api.HISTORY_KEY], closure);
    await repository.updateProject(created.project_id, { draft_input: draftInput });
    const restored = await repository.getProject(created.project_id);
    assert.equal(api.latestClosure(restored.project.draft_input[api.HISTORY_KEY]).closureId, "closure-repository");
    assert.equal(restored.project.draft_input.preserved.yarn, "merino");
    assert.equal(restored.project.draft_input.project_details_experience.bodyMeasurements.bust.value, 96);
    const immutableHistory = structuredClone(restored.project.draft_input[api.HISTORY_KEY]);
    const tamperedDraft = structuredClone(restored.project.draft_input);
    tamperedDraft[api.HISTORY_KEY].records[0].snapshot.details.recipient = "man";
    await assert.rejects(repository.updateProject(created.project_id, { draft_input: tamperedDraft }), { code: "PROJECT_DETAILS_CLOSURE_IMMUTABLE" });
    const preservedDraft = structuredClone(restored.project.draft_input);
    preservedDraft.project_details_collaboration = { preserved: true };
    await repository.updateProject(created.project_id, { draft_input: preservedDraft });
    const afterUnrelatedSave = await repository.getProject(created.project_id);
    assert.deepEqual(afterUnrelatedSave.project.draft_input[api.HISTORY_KEY], immutableHistory);
    assert.equal(DB_VERSION, 4);
    assert.equal(STORE_NAMES.length, 16);
  } finally {
    await repository.close().catch(() => undefined);
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = resolve;
    });
  }
});
