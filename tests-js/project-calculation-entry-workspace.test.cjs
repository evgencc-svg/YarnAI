"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
const domain = require("../src/yarnai/static/project-calculation-entry.js");
require("../src/yarnai/static/project-system.js");
const system = global.YarnAIProjectSystem;
const routes = require("../src/yarnai/static/user-workspace-entry.js");
const workspace = require("../src/yarnai/static/project-calculation-entry-workspace.js");

const PROJECT = "018f5f64-8b27-7a36-8c58-4f491a95cd01";
const NOW = "2026-08-03T10:00:00.000Z";
let repositories = [];

function initialization(width = 50, projectId = PROJECT) {
  return {
    identity: "initialization-1", project_identity: projectId, lifecycle: "initialized",
    source_closure_identity: "closure-1", source_closure_fingerprint: "fnv1a32:closure",
    snapshot_fingerprint: "fnv1a32:snapshot",
    snapshot: { project: { identity: projectId }, garment: { type: "sweater", sizeMode: "custom", recipient: "woman", fit: "regular" }, measurements: { garment: { garmentWidth: { value: width, unit: "cm" } }, body: {} } },
    integrity: { importedUnproven: false, quarantined: false, collision: false, recordFingerprint: "fnv1a32:init" },
  };
}

function gauge(stitches = 20, fingerprint = "fnv1a32:gauge", projectId = PROJECT) {
  return {
    identity: "gauge-1", projectIdentity: projectId,
    sourceInitializationIdentity: "initialization-1", sourceInitializationFingerprint: "fnv1a32:init",
    lifecycle: "confirmed", confirmationKey: "fnv1a32:confirmation", fingerprint,
    snapshot: { computed: { stitchesPer10Cm: stitches, rowsPer10Cm: 28 } },
  };
}

function assessment(width = 50, stitches = 20, fingerprint = "fnv1a32:gauge", projectId = PROJECT) {
  return domain.assessEntry({
    projectIdentity: projectId,
    project: { project_id: projectId },
    initialization: initialization(width, projectId),
    gauge: gauge(stitches, fingerprint, projectId),
    acknowledgedWarningCodes: ["UNKNOWN_PATTERN_REPEAT"],
  });
}

function completedSnapshot(identity = "entry-1", width = 50, stitches = 20, fingerprint = "fnv1a32:gauge", projectId = PROJECT) {
  let value = domain.buildSnapshot({ assessment: assessment(width, stitches, fingerprint, projectId) }, { identity, createdAt: NOW });
  value = domain.startReviewing(value, { timestamp: NOW });
  value = domain.markReady(value, { timestamp: NOW });
  return domain.complete(value, { timestamp: NOW });
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(system.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database blocked"));
  });
}

function repository() {
  const value = new system.ProjectRepository();
  repositories.push(value);
  return value;
}

async function storeSnapshot(repo, projectId, snapshot) {
  return repo.addCalculation(projectId, {
    project_calculation_entry: { kind: domain.KIND, version: domain.VERSION, fingerprint: snapshot.fingerprint },
  }, {
    status: "READY_WITH_WARNINGS", normalized_inputs: { working_width_cm: snapshot.workingWidth.canonicalValueCm },
    warnings: snapshot.warnings, errors: [], clarifications: [], snapshot,
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

test("01 invalid UUID is rejected by the URL-only parser", () => {
  assert.equal(routes.projectIdentityFromLocation({ search: "?project=bad" }, system.isUuidv7), "");
});

test("02 missing project fails closed", async () => {
  const repo = repository();
  await repo.initialize();
  await assert.rejects(repo.getProject(PROJECT), { code: "PROJECT_NOT_FOUND" });
});

test("03 repository error remains an error", async () => {
  const error = Object.assign(new Error("storage"), { code: "INDEXEDDB_UNAVAILABLE" });
  const fake = { initialize: async () => { throw error; } };
  await assert.rejects(fake.initialize(), { code: "INDEXEDDB_UNAVAILABLE" });
});

test("04 project-scoped draft hydrates", () => {
  const draft = domain.buildDraft({ projectIdentity: PROJECT, value: 50, unit: "cm", confirmed: true, acknowledgedWarningCodes: ["UNKNOWN_PATTERN_REPEAT"], sourceFingerprint: "source", updatedAt: NOW });
  assert.equal(domain.validateDraft(draft, { projectIdentity: PROJECT }).width.value, 50);
  assert.throws(() => domain.validateDraft(draft, { projectIdentity: "other" }), { code: "DRAFT_INVALID" });
});

test("05 completed revision hydrates from calculations", async () => {
  const repo = repository();
  await repo.initialize();
  const project = await repo.createProject({ title: "Stage 64" });
  const saved = await storeSnapshot(repo, project.project_id, completedSnapshot("entry-1", 50, 20, "fnv1a32:gauge", project.project_id));
  const aggregate = await repo.getProject(project.project_id);
  const values = workspace.stage64Calculations(aggregate, domain);
  assert.equal(values.length, 1);
  assert.equal(values[0].record.calculation_id, saved.calculation.calculation_id);
});

test("06 reload does not create a revision", async () => {
  const repo = repository();
  await repo.initialize();
  const project = await repo.createProject({ title: "Reload" });
  await storeSnapshot(repo, project.project_id, completedSnapshot("entry-1", 50, 20, "fnv1a32:gauge", project.project_id));
  const before = await repo.getProject(project.project_id);
  const after = await repo.getProject(project.project_id);
  assert.equal(after.project.revision, before.project.revision);
  assert.equal(after.calculations.length, 1);
});

test("07 semantic duplicate is detectable before persistence", async () => {
  const repo = repository();
  await repo.initialize();
  const project = await repo.createProject({ title: "Duplicate" });
  const snapshot = completedSnapshot("entry-1", 50, 20, "fnv1a32:gauge", project.project_id);
  await storeSnapshot(repo, project.project_id, snapshot);
  const history = workspace.stage64Calculations(await repo.getProject(project.project_id), domain);
  assert.equal(history.filter((entry) => entry.snapshot.fingerprint === snapshot.fingerprint).length, 1);
});

test("08 changed width creates a new immutable calculation revision", async () => {
  const repo = repository();
  await repo.initialize();
  const project = await repo.createProject({ title: "Revision" });
  const first = completedSnapshot("entry-1", 50, 20, "fnv1a32:gauge", project.project_id);
  const second = completedSnapshot("entry-2", 51, 20, "fnv1a32:gauge", project.project_id);
  await storeSnapshot(repo, project.project_id, first);
  await storeSnapshot(repo, project.project_id, second);
  const history = workspace.stage64Calculations(await repo.getProject(project.project_id), domain);
  assert.equal(history.length, 2);
  assert.notEqual(history[0].snapshot.fingerprint, history[1].snapshot.fingerprint);
});

test("09 changed gauge makes completed result stale", () => {
  const snapshot = completedSnapshot();
  assert.equal(domain.staleStatus(snapshot, assessment(50, 21, "fnv1a32:new")).stale, true);
});

test("10 Stage 63 confirmation object stays immutable", () => {
  const source = Object.freeze(gauge());
  domain.assessEntry({ projectIdentity: PROJECT, project: { project_id: PROJECT }, initialization: initialization(), gauge: source, acknowledgedWarningCodes: ["UNKNOWN_PATTERN_REPEAT"] });
  assert.equal(source.fingerprint, "fnv1a32:gauge");
});

test("11 read-only opening leaves project revision unchanged", async () => {
  const repo = repository();
  await repo.initialize();
  const project = await repo.createProject({ title: "Read only" });
  const first = await repo.getProject(project.project_id);
  await repo.getProject(project.project_id);
  const last = await repo.getProject(project.project_id);
  assert.equal(last.project.revision, first.project.revision);
});

test("12 draft autosave remains project-scoped", async () => {
  const repo = repository();
  await repo.initialize();
  const one = await repo.createProject({ title: "One" });
  const two = await repo.createProject({ title: "Two" });
  const draft = domain.buildDraft({ projectIdentity: one.project_id, value: 50, unit: "cm", confirmed: true, sourceFingerprint: "source", updatedAt: NOW });
  await repo.updateProject(one.project_id, { draft_input: { [domain.DRAFT_KEY]: draft } });
  assert.ok((await repo.getProject(one.project_id)).project.draft_input[domain.DRAFT_KEY]);
  assert.equal((await repo.getProject(two.project_id)).project.draft_input, null);
});

test("13 readyState complete still waits for pageshow", async () => {
  let pageshow;
  let settled = false;
  const pending = workspace.waitForPageShow({
    document: { readyState: "complete" },
    addEventListener(name, handler) {
      assert.equal(name, "pageshow");
      pageshow = handler;
    },
  }).then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  pageshow();
  await pending;
  assert.equal(settled, true);
});

test("14 autosave is guarded until hydration settles", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-calculation-entry-workspace.js"), "utf8");
  assert.match(source, /if \(!hydrated \|\| busy\) return/);
  assert.match(source, /hydrated = true;\s+bindEvents\(\)/);
});

test("15 browser restoration reapplies hydrated controls after final settle", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-calculation-entry-workspace.js"), "utf8");
  assert.match(source, /await waitForNativeRestoration\(target\);\s+restoreHydratedControls\(\);/);
  assert.match(source, /ui\.warningAck\.checked =/);
});

test("16 repeated reads keep one completed result", async () => {
  const repo = repository();
  await repo.initialize();
  const project = await repo.createProject({ title: "One result" });
  await storeSnapshot(repo, project.project_id, completedSnapshot("entry-1", 50, 20, "fnv1a32:gauge", project.project_id));
  assert.equal(workspace.stage64Calculations(await repo.getProject(project.project_id), domain).length, 1);
  assert.equal(workspace.stage64Calculations(await repo.getProject(project.project_id), domain).length, 1);
});

test("17 back route preserves UUID", () => {
  const value = domain.safeDestination(`/user-workspace-entry?project=${PROJECT}`, PROJECT);
  assert.equal(value.valid, true);
  assert.match(value.href, new RegExp(PROJECT));
});

test("18 unsafe destination is blocked", () => {
  assert.equal(domain.safeDestination(`https://evil.example/project-calculation-entry?project=${PROJECT}`, PROJECT).valid, false);
  assert.equal(domain.safeDestination(`/calculator?project=${PROJECT}`, PROJECT).valid, false);
});

test("19 stale warning acknowledgments are discarded", () => {
  const result = domain.assessEntry({
    projectIdentity: PROJECT, project: { project_id: PROJECT }, initialization: initialization(), gauge: gauge(),
    acknowledgedWarningCodes: ["OLD_WARNING", "UNKNOWN_PATTERN_REPEAT"],
  });
  assert.deepEqual(result.acknowledgedWarningCodes, ["UNKNOWN_PATTERN_REPEAT"]);
});
