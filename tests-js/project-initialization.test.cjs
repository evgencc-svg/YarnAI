"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("fake-indexeddb/auto");

global.window = globalThis;
const experience = require("../src/yarnai/static/project-details-experience.js");
require("../src/yarnai/static/project-details-collaboration.js");
const closure = require("../src/yarnai/static/project-details-closure.js");
const api = require("../src/yarnai/static/project-initialization.js");
require("../src/yarnai/static/project-system.js");

const system = global.YarnAIProjectSystem;
const PROJECT = "018f5f64-8b27-7a36-8c58-4f491a95cd01";
const NOW = "2026-08-02T10:03:00.000Z";

function fullDetails(overrides = {}) {
  return experience.applyPatch(null, {
    sizeMode: "custom", recipient: "woman", fit: "regular",
    bust: 96, waist: 76, hips: 102, shoulderWidth: 39, upperArm: 30,
    armholeDepth: 21, neck: 36, garmentWidth: 50, garmentLength: 62,
    sleeveLength: 57, necklineDepth: 10, ...overrides,
  });
}

function standardDetails(overrides = {}) {
  return experience.applyPatch(null, { sizeMode: "standard", recipient: "woman", standardSize: "M", fit: "regular", garmentLength: 62, sleeveLength: 57, ...overrides });
}

function liveInput(overrides = {}) {
  return {
    projectId: PROJECT,
    garmentType: "свитер",
    technology: { components: [{ name: "sleeve" }] },
    intent: { garmentType: "свитер" },
    details: overrides.details || fullDetails(),
    collaborationState: overrides.collaborationState || {},
    safe: overrides.safe !== false,
    nextDestination: { enabled: true, href: `/user-workspace-entry?project=${PROJECT}#swatch-assistant`, label: "Продолжить", description: "Перейти к образцу." },
    ...overrides,
  };
}

function complete(input = liveInput(), options = {}) {
  const snapshot = closure.buildProjectDetailsSnapshot(input);
  const draft = closure.buildClosureDraft({ snapshot }, { closureId: options.closureId || "closure-1", createdAt: "2026-08-02T10:00:00.000Z", previousClosureId: options.previousClosureId });
  const reviewing = closure.startReviewing(draft, { reviewedAt: "2026-08-02T10:01:00.000Z", acknowledged: options.acknowledged === true });
  return closure.completeClosure(reviewing, { completedAt: "2026-08-02T10:02:00.000Z", acknowledged: options.acknowledged === true });
}

function closureHistory(records = [complete()]) {
  return { version: closure.HISTORY_VERSION, records, latestClosureId: records.at(-1)?.closureId || null };
}

function assess(overrides = {}) {
  const input = overrides.liveInput || liveInput();
  return api.assessInitialization({
    projectIdentity: input.projectId,
    closureHistory: overrides.closureHistory || closureHistory(),
    initializationHistory: overrides.initializationHistory,
    liveInput: input,
    nextDestination: overrides.nextDestination || input.nextDestination,
    identity: overrides.identity || "initialization-1",
    createdAt: overrides.createdAt || NOW,
  });
}

function initialize(overrides = {}) {
  const input = overrides.liveInput || liveInput();
  const draft = api.buildInitializationDraft({
    projectIdentity: input.projectId,
    closureHistory: overrides.closureHistory || closureHistory(),
    initializationHistory: overrides.initializationHistory,
    liveInput: input,
    nextDestination: input.nextDestination,
  }, { identity: overrides.identity || "initialization-1", createdAt: overrides.createdAt || NOW, createdBy: "Владелец" });
  const reviewing = api.startReviewing(draft, { reviewedAt: "2026-08-02T10:04:00.000Z" });
  const ready = api.markReady(reviewing);
  return api.initializeProject(ready, { initializedAt: "2026-08-02T10:05:00.000Z" });
}

function history(records) {
  return { format: api.HISTORY_FORMAT, version: api.HISTORY_VERSION, records, latestInitializationIdentity: records.at(-1)?.identity || null };
}

function reFingerprintClosure(source, change) {
  const value = structuredClone(source);
  change(value);
  delete value.recordFingerprint;
  value.recordFingerprint = closure.fingerprint(value);
  return value;
}

test("01 snapshot is canonical and uses the exact allowlist", () => {
  const snapshot = assess().candidateSnapshot;
  assert.deepEqual(Object.keys(snapshot), api.SNAPSHOT_KEYS);
  assert.equal(snapshot.project.identity, PROJECT);
});
test("02 snapshot fingerprint is stable", () => assert.equal(api.fingerprint(assess().candidateSnapshot), api.fingerprint(structuredClone(assess().candidateSnapshot))));
test("03 fingerprint ignores object key order", () => {
  const first = assess().candidateSnapshot;
  const reversed = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(api.fingerprint(first), api.fingerprint(reversed));
});
test("04 meaningful measurement change changes fingerprint", () => assert.notEqual(api.fingerprint(assess().candidateSnapshot), api.fingerprint(assess({ liveInput: liveInput({ details: fullDetails({ bust: 99 }) }), closureHistory: closureHistory([complete(liveInput({ details: fullDetails({ bust: 99 }) }))]) }).candidateSnapshot)));
test("05 lifecycle follows draft reviewing ready initialized", () => assert.equal(initialize().lifecycle, "initialized"));
test("06 invalid lifecycle transition is rejected", () => assert.throws(() => api.markReady(api.buildInitializationDraft({ projectIdentity: PROJECT, closureHistory: closureHistory(), liveInput: liveInput(), nextDestination: liveInput().nextDestination }, { identity: "i", createdAt: NOW })), { code: "INITIALIZATION_LIFECYCLE_VIOLATION" }));
test("07 draft cannot initialize", () => {
  const draft = api.buildInitializationDraft({ projectIdentity: PROJECT, closureHistory: closureHistory(), liveInput: liveInput(), nextDestination: liveInput().nextDestination }, { identity: "i", createdAt: NOW });
  assert.throws(() => api.initializeProject(draft, { initializedAt: NOW }), { code: "INITIALIZATION_LIFECYCLE_VIOLATION" });
});
test("08 reviewing cannot initialize", () => {
  const draft = api.buildInitializationDraft({ projectIdentity: PROJECT, closureHistory: closureHistory(), liveInput: liveInput(), nextDestination: liveInput().nextDestination }, { identity: "i", createdAt: NOW });
  assert.throws(() => api.initializeProject(api.startReviewing(draft, { reviewedAt: NOW }), { initializedAt: NOW }), { code: "INITIALIZATION_LIFECYCLE_VIOLATION" });
});
test("09 ready closure is accepted", () => assert.equal(assess().verdict, "ready"));
test("10 conditional closure with acknowledgement is accepted", () => {
  const input = liveInput({ details: standardDetails() });
  assert.equal(assess({ liveInput: input, closureHistory: closureHistory([complete(input, { acknowledged: true })]) }).sourceVerdict, "ready");
});
test("11 conditional closure without acknowledgement is blocked", () => {
  const input = liveInput({ details: standardDetails() });
  const raw = complete(input, { acknowledged: true });
  const broken = reFingerprintClosure(raw, (value) => { value.acknowledged = false; value.decision = "requires_acknowledgement"; });
  assert.equal(assess({ liveInput: input, closureHistory: closureHistory([broken]) }).verdict, "blocked");
});
test("12 blocked closure cannot initialize", () => assert.equal(assess({ liveInput: liveInput({ safe: false }) }).verdict, "stale"));
test("13 missing closure blocks", () => assert.equal(api.assessInitialization({ projectIdentity: PROJECT, closureHistory: null, liveInput: liveInput() }).reasons[0].code, "COMPLETED_CLOSURE_MISSING"));
test("14 malformed closure blocks", () => assert.equal(assess({ closureHistory: { version: 1, records: [{}], latestClosureId: "x" } }).verdict, "blocked"));
test("15 unsupported closure version blocks", () => assert.equal(assess({ closureHistory: closureHistory([{ ...complete(), schemaVersion: 2 }]) }).verdict, "blocked"));
test("16 project mismatch blocks", () => assert.equal(api.assessInitialization({ projectIdentity: "another", closureHistory: closureHistory(), liveInput: liveInput() }).verdict, "blocked"));
test("17 source fingerprint mismatch blocks", () => assert.equal(assess({ closureHistory: closureHistory([{ ...complete(), snapshotFingerprint: "bad" }]) }).verdict, "blocked"));
test("18 live snapshot mismatch is stale", () => assert.equal(assess({ liveInput: liveInput({ details: fullDetails({ bust: 101 }) }) }).verdict, "stale"));
test("19 stale source returns a meaningful change", () => assert.ok(assess({ liveInput: liveInput({ details: fullDetails({ bust: 101 }) }) }).changes.some((item) => item.label)));
test("20 superseded closure is stale", () => {
  const old = complete(liveInput(), { closureId: "old" });
  const current = complete(liveInput({ details: fullDetails({ bust: 98 }) }), { closureId: "current", previousClosureId: "old" });
  const result = api.assessInitialization({ projectIdentity: PROJECT, sourceClosureIdentity: "old", closureHistory: closureHistory([old, current]), liveInput: liveInput({ details: fullDetails({ bust: 98 }) }), nextDestination: liveInput().nextDestination });
  assert.equal(result.verdict, "stale");
});
test("21 quarantined closure blocks", () => assert.equal(assess({ closureHistory: closureHistory([reFingerprintClosure(complete(), (value) => { value.state.quarantined = true; })]) }).verdict, "blocked"));
test("22 imported-unproven closure blocks", () => assert.equal(assess({ closureHistory: closureHistory([reFingerprintClosure(complete(), (value) => { value.state.importedUnproven = true; })]) }).verdict, "blocked"));
test("23 broken closure history blocks", () => assert.equal(assess({ closureHistory: { version: 1, records: [complete()], latestClosureId: "wrong" } }).reasons[0].code, "BROKEN_CLOSURE_HISTORY"));
test("24 ambiguous closure identity blocks", () => assert.equal(assess({ closureHistory: closureHistory([complete(), complete()]) }).reasons[0].code, "AMBIGUOUS_LATEST_CLOSURE"));
test("25 missing initialization field blocks", () => {
  const broken = structuredClone(assess().candidateSnapshot); broken.garment.recipient = "";
  assert.throws(() => api.validateInitializationSnapshot(broken), { code: "INITIALIZATION_REQUIRED_FIELD_MISSING" });
});
test("26 verdict is deterministic", () => assert.deepEqual(assess(), assess()));
test("27 injected clock is preserved", () => assert.equal(initialize({ createdAt: "2026-01-01T00:00:00.000Z" }).created_at, "2026-01-01T00:00:00.000Z"));
test("28 injected identity is preserved", () => assert.equal(initialize({ identity: "chosen-identity" }).identity, "chosen-identity"));
test("29 initialized record is deeply immutable", () => assert.ok(Object.isFrozen(initialize().snapshot.measurements.body)));
test("30 identical duplicate is idempotent", () => {
  const value = initialize();
  const first = api.appendInitialized(null, value);
  assert.deepEqual(api.appendInitialized(first, value), first);
});
test("31 duplicate identity with changed content is blocked", () => {
  const value = initialize();
  const changed = { ...value, initialized_at: "2026-08-02T11:00:00.000Z" };
  assert.throws(() => api.appendInitialized(history([value]), changed));
});
test("32 history is append-only", () => {
  const first = initialize();
  const secondClosure = complete(liveInput({ details: fullDetails({ bust: 98 }) }), { closureId: "closure-2", previousClosureId: "closure-1" });
  const second = initialize({ identity: "initialization-2", liveInput: liveInput({ details: fullDetails({ bust: 98 }) }), closureHistory: closureHistory([complete(), secondClosure]), initializationHistory: history([first]) });
  assert.deepEqual(api.appendInitialized(history([first]), second).records[0], first);
});
test("33 reload recovers the current record", () => {
  const value = initialize();
  const result = assess({ initializationHistory: history([value]) });
  assert.equal(result.existing.identity, value.identity);
  assert.equal(result.canCreate, false);
});
test("34 old initialized record remains byte-for-byte unchanged", () => {
  const value = initialize();
  const before = JSON.stringify(value);
  assess({ initializationHistory: history([value]) });
  assert.equal(JSON.stringify(value), before);
});
test("35 new closure permits a new initialization", () => {
  const first = initialize();
  const input = liveInput({ details: fullDetails({ bust: 98 }) });
  const nextClosure = complete(input, { closureId: "closure-2", previousClosureId: "closure-1" });
  assert.equal(assess({ liveInput: input, closureHistory: closureHistory([complete(), nextClosure]), initializationHistory: history([first]) }).canCreate, true);
});
test("36 new initialization records one-way supersedes metadata", () => {
  const first = initialize();
  const input = liveInput({ details: fullDetails({ bust: 98 }) });
  const nextClosure = complete(input, { closureId: "closure-2", previousClosureId: "closure-1" });
  const second = initialize({ identity: "initialization-2", liveInput: input, closureHistory: closureHistory([complete(), nextClosure]), initializationHistory: history([first]) });
  assert.equal(second.supersession.supersedes, first.identity);
});
test("37 stale comparison reports only meaningful fields", () => {
  const first = initialize();
  const input = liveInput({ details: fullDetails({ bust: 98 }) });
  const nextClosure = complete(input, { closureId: "closure-2", previousClosureId: "closure-1" });
  const changes = assess({ liveInput: input, closureHistory: closureHistory([complete(), nextClosure]), initializationHistory: history([first]) }).changes;
  assert.ok(changes.some((item) => item.path.endsWith("bust.value")));
  assert.ok(changes.every((item) => !item.path.startsWith("audit")));
});
test("38 helper draft is excluded", () => assert.doesNotMatch(JSON.stringify(assess({ liveInput: liveInput({ collaborationState: { helperDraft: { secret: "draft" } } }) }).candidateSnapshot), /secret|draft/));
test("39 rejected proposal is excluded", () => assert.doesNotMatch(JSON.stringify(assess({ liveInput: liveInput({ collaborationState: { responses: { r: { proposals: [{ path: "details.fit", value: "relaxed" }] } }, reviews: { r: { decisions: { "details.fit": "rejected" } } } } }) }).candidateSnapshot), /rejected|relaxed/));
test("40 accepted collaboration is preserved", () => {
  const source = complete();
  const copy = structuredClone(source);
  copy.snapshot.collaboration = { applied: [{ path: "details.fit", requestId: "r", responseId: "s", helperLabel: "Анна", acceptedAt: NOW, value: "regular" }], appliedCount: 1, requestIds: ["r"], responseIds: ["s"] };
  copy.collaboration = copy.snapshot.collaboration;
  copy.snapshotFingerprint = closure.fingerprint(copy.snapshot);
  copy.sourceIdentity = closure.fingerprint({ projectId: copy.projectId, snapshotFingerprint: copy.snapshotFingerprint });
  delete copy.recordFingerprint; copy.recordFingerprint = closure.fingerprint(copy);
  assert.equal(api.buildInitializationSnapshot(copy, { projectIdentity: PROJECT, identity: "i", createdAt: NOW }).collaboration.appliedCount, 1);
});
test("41 warnings are preserved", () => {
  const input = liveInput({ details: standardDetails() });
  const value = complete(input, { acknowledged: true });
  assert.deepEqual(api.buildInitializationSnapshot(value, { projectIdentity: PROJECT, identity: "i", createdAt: NOW }).warnings, value.validation.warnings);
});
test("42 assumptions are preserved", () => {
  const input = liveInput({ details: standardDetails() });
  const value = complete(input, { acknowledged: true });
  assert.equal(api.buildInitializationSnapshot(value, { projectIdentity: PROJECT, identity: "i", createdAt: NOW }).assumptions.length, value.assumptions.length);
});
test("43 provenance is preserved", () => assert.ok(assess().candidateSnapshot.provenance.length > 0));
test("44 DOM state is excluded", () => assert.doesNotMatch(JSON.stringify(assess({ liveInput: liveInput({ domState: { open: true } }) }).candidateSnapshot), /domState/));
test("45 route and hash state are excluded", () => assert.doesNotMatch(JSON.stringify(assess({ liveInput: liveInput({ routeHash: "#private" }) }).candidateSnapshot), /routeHash|private/));
test("46 Continue revalidates a live source", () => {
  const value = initialize();
  assert.equal(api.validateContinue({ projectIdentity: PROJECT, closureHistory: closureHistory(), initializationHistory: history([value]), liveInput: liveInput(), nextDestination: liveInput().nextDestination }).allowed, true);
});
test("47 Continue blocks stale state", () => {
  const value = initialize();
  assert.throws(() => api.validateContinue({ projectIdentity: PROJECT, closureHistory: closureHistory(), initializationHistory: history([value]), liveInput: liveInput({ details: fullDetails({ bust: 99 }) }), nextDestination: liveInput().nextDestination }), { code: "LIVE_SNAPSHOT_STALE" });
});
test("48 Continue blocks broken initialization integrity", () => {
  const value = { ...initialize(), snapshot_fingerprint: "broken" };
  assert.throws(() => api.validateContinue({ projectIdentity: PROJECT, closureHistory: closureHistory(), initializationHistory: history([value]), liveInput: liveInput(), nextDestination: liveInput().nextDestination }));
});
test("49 invalid destination blocks", () => assert.equal(assess({ nextDestination: { enabled: true, href: "/stage-62" } }).reasons[0].code, "INVALID_NEXT_DESTINATION"));
test("50 history collision is rejected", () => assert.throws(() => api.normalizeHistory(history([initialize(), initialize()]), { allowUntrusted: true })));
test("51 import remaps identities and project references", () => {
  const imported = api.importInitializationHistory(history([initialize()]), { sourceProjectIdentity: PROJECT, projectIdentity: "new-project", collision: true, importedAt: NOW, identityProvider: () => "new-initialization" });
  assert.equal(imported.records[0].project_identity, "new-project");
  assert.equal(imported.records[0].identity, "new-initialization");
});
test("52 imported integrity is never promoted automatically", () => {
  const imported = api.makeImportedUnproven(initialize(), { importedAt: NOW });
  assert.equal(imported.integrity.importedUnproven, true);
  assert.throws(() => api.validateInitializationRecord(imported), { code: "IMPORTED_UNPROVEN" });
});
test("53 repository persists, deduplicates and deletes initialization with its project", async () => {
  const repo = new system.ProjectRepository();
  await repo.initialize();
  try {
    const project = await repo.createProject({ title: "Stage 61" });
    const input = liveInput({ projectId: project.project_id, nextDestination: { enabled: true, href: `/user-workspace-entry?project=${project.project_id}#swatch-assistant` } });
    const source = complete(input);
    const value = initialize({ liveInput: input, closureHistory: closureHistory([source]) });
    const saved = await repo.saveProjectInitialization(project.project_id, value);
    const repeated = await repo.saveProjectInitialization(project.project_id, value);
    assert.equal(saved.revision, repeated.revision);
    assert.equal((await repo.listProjectInitializations(project.project_id)).length, 1);
    await repo.softDeleteProject(project.project_id);
    await repo.permanentlyDeleteProject(project.project_id, { confirmed: true });
    await assert.rejects(repo.getProject(project.project_id));
  } finally { await repo.close(); }
});
test("54 repository schema remains version 4 with sixteen unique stores", () => {
  assert.equal(system.DB_VERSION, 4);
  assert.equal(system.STORE_NAMES.length, 16);
  assert.equal(new Set(system.STORE_NAMES).size, 16);
});
