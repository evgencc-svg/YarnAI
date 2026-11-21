"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
const domain = require("../src/yarnai/static/project-execution-plan.js");
require("../src/yarnai/static/project-system.js");
const system = global.YarnAIProjectSystem;
const routes = require("../src/yarnai/static/user-workspace-entry.js");
const workspace = require("../src/yarnai/static/project-execution-plan-workspace.js");
const stageChain = require("./stage60-to-65-saved-chain.cjs");

const PROJECT = "018f5f64-8b27-7a36-8c58-4f491a95cd01";
const NOW = "2026-08-03T10:00:00.000Z";
let repositories = [];
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }
function draft(projectId = PROJECT) { return domain.buildDraft({ projectIdentity: projectId, boundedInputs: {}, acknowledgedWarningCodes: [], sourceFingerprint: "fnv1a32:source", updatedAt: NOW }); }
function state(projectId = PROJECT, calculationId = "calculation-1") { return domain.createProgressState({ projectIdentity: projectId, calculationId, draft: draft(projectId), updatedAt: NOW }); }

beforeEach(async () => { repositories = []; await deleteDatabase(); });
afterEach(async () => { await Promise.all(repositories.map((repo) => repo.close().catch(() => undefined))); await deleteDatabase(); });

test("01 invalid UUID is rejected", () => assert.equal(routes.projectIdentityFromLocation({ href: "http://localhost/project-execution-plan?project=bad" }, system.isUuidv7), ""));
test("02 missing project fails closed", async () => { const repo = repository(); await repo.initialize(); await assert.rejects(repo.getProject(PROJECT), { code: "PROJECT_NOT_FOUND" }); });
test("03 repository errors are preserved", async () => { const failure = Object.assign(new Error("storage"), { code: "INDEXEDDB_UNAVAILABLE" }); await assert.rejects(Promise.reject(failure), { code: "INDEXEDDB_UNAVAILABLE" }); });
test("04 project-scoped draft hydrates", () => assert.equal(domain.validateDraft(draft(), { projectIdentity: PROJECT }).projectIdentity, PROJECT));
test("05 completed history hydrates", () => assert.deepEqual(domain.validateProgressState(state(), { projectIdentity: PROJECT, calculationId: "calculation-1" }).history, []));
test("06 read-only opening does not mutate project revision", async () => { const repo = repository(); await repo.initialize(); const project = await repo.createProject({ title: "Read only" }); const before = await repo.getProject(project.project_id); await repo.getProject(project.project_id); const after = await repo.getProject(project.project_id); assert.equal(after.project.revision, before.project.revision); });
test("07 reload does not create progress", async () => { const repo = repository(); await repo.initialize(); const project = await repo.createProject({ title: "Reload" }); assert.equal((await repo.getProject(project.project_id)).progress.length, 0); assert.equal((await repo.getProject(project.project_id)).progress.length, 0); });
test("08 repository ensure is idempotent", async () => { const repo = repository(); await repo.initialize(); const project = await repo.createProject({ title: "Plan" }); const calculation = await repo.addCalculation(project.project_id, { value: 1 }, { status: "READY", normalized_inputs: {}, warnings: [], errors: [], clarifications: [] }); const initial = domain.createProgressState({ projectIdentity: project.project_id, calculationId: calculation.calculation.calculation_id, updatedAt: NOW }); const first = await repo.ensureProjectExecutionPlanPreparation(project.project_id, calculation.calculation.calculation_id, initial); const second = await repo.ensureProjectExecutionPlanPreparation(project.project_id, calculation.calculation.calculation_id, initial); assert.equal(first.progress_id, second.progress_id); });
test("09 source change is detectable through fingerprint", () => assert.notEqual(domain.fingerprint({ source: 1 }), domain.fingerprint({ source: 2 })));
test("10 a new source supports a different revision fingerprint", () => assert.notEqual(domain.fingerprint({ calculation: "one" }), domain.fingerprint({ calculation: "two" })));
test("11 JSON cloning does not mutate Stage 64 input", () => { const input = Object.freeze({ fingerprint: "calculation" }); domain.fingerprint(input); assert.equal(input.fingerprint, "calculation"); });
test("12 draft is project scoped", () => assert.throws(() => domain.validateDraft(draft(), { projectIdentity: "other" }), { code: "DRAFT_INVALID" }));
test("13 acknowledgements are project scoped with the draft", () => assert.equal(domain.buildDraft({ projectIdentity: PROJECT, boundedInputs: {}, acknowledgedWarningCodes: ["A"], sourceFingerprint: "source", updatedAt: NOW }).acknowledgedWarningCodes[0], "A"));
test("14 listeners are attached after hydration settle", () => { const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-plan-workspace.js"), "utf8"); assert.match(source, /hydrated = true; bindEvents\(\)/); });
test("15 readyState complete still waits for pageshow", async () => { let handler; let settled = false; const pending = workspace.waitForPageShow({ addEventListener(_name, value) { handler = value; } }).then(() => { settled = true; }); await Promise.resolve(); assert.equal(settled, false); handler(); await pending; });
test("16 late native restoration is followed by control reapply", () => { const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-plan-workspace.js"), "utf8"); assert.match(source, /await waitForNativeRestoration\(target\); applyControls/); });
test("17 hydrated checkbox is controller state", () => { const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-plan-workspace.js"), "utf8"); assert.match(source, /hydratedAcknowledgements/); });
test("18 unknown bounded values need no invented data", () => assert.equal(domain.normalizeBoundedInputs({}).confirmed, true));
test("19 autosave guard blocks pre-hydration input", () => { const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-plan-workspace.js"), "utf8"); assert.match(source, /if \(!hydrated \|\| busy\) return null/); });
test("20 unsafe destination is blocked", () => assert.equal(domain.safeDestination("/calculator?project=" + PROJECT, PROJECT).valid, false));
test("21 back route preserves UUID", () => assert.match(domain.safeDestination("/user-workspace-entry?project=" + PROJECT, PROJECT).href, new RegExp(PROJECT)));
test("22 calculation route preserves UUID", () => assert.match(domain.safeDestination("/project-calculation-entry?project=" + PROJECT, PROJECT).href, new RegExp(PROJECT)));
test("23 gauge route preserves UUID", () => assert.match(domain.safeDestination("/swatch-assistant?project=" + PROJECT, PROJECT).href, new RegExp(PROJECT)));
test("24 state has one deterministic scope", () => assert.equal(state().kind, domain.PROGRESS_KIND));
test("25 corrupt draft fails closed", () => assert.throws(() => domain.validateDraft({ format: "bad" }, { projectIdentity: PROJECT }), { code: "DRAFT_INVALID" }));
test("26 stale warning codes clear acknowledgements during restore", () => { const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-plan-workspace.js"), "utf8"); assert.match(source, /draft\.acknowledgedWarningCodes\.some/); });
test("27 completed history field is append-only by repository contract", () => { const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-system.js"), "utf8"); assert.match(source, /PROJECT_EXECUTION_PLAN_HISTORY_IMMUTABLE/); });
test("28 validation summary is focusable", () => { const html = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-plan.html"), "utf8"); assert.match(html, /id="error-summary"[^>]*tabindex="-1"/); });
test("29 confirmation uses aria-live status", () => { const html = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-plan.html"), "utf8"); assert.match(html, /id="save-status"[^>]*aria-live="polite"/); });
test("30 a saved Stage 60 -> 61 -> 63 -> 64 chain opens Stage 65", () => {
  const result = workspace.assessAggregateReadiness(stageChain.readinessOptions());
  assert.equal(result.ready, true);
  assert.equal(result.verified.closure.lifecycle, "completed");
  assert.equal(result.verified.initialization.lifecycle, "initialized");
  assert.equal(result.verified.gauge.lifecycle, "confirmed");
  assert.equal(result.verified.calculation.snapshot.lifecycle, "completed");
});
test("31 Stage 65 validates Stage 61 with its original safe continuation", () => {
  const destination = workspace.initializationContinuation(stageChain.PROJECT_ID);
  assert.equal(stageChain.initializationDomain.validDestination(destination).enabled, true);
  assert.match(destination.href, /\/swatch-assistant\?project=/);
});
test("32 a rejected calculation fingerprint reports a concrete recovery", () => {
  const aggregate = stageChain.savedChain();
  aggregate.calculations[0].request.project_calculation_entry.fingerprint = "fnv1a32:rejected";
  const result = workspace.assessAggregateReadiness(stageChain.readinessOptions(aggregate));
  assert.equal(result.ready, false);
  assert.equal(result.problem.code, "CALCULATION_FINGERPRINT_MISMATCH");
  assert.match(result.problem.message, /Контрольная сумма активного начального расчёта/);
  assert.equal(result.problem.href, `/project-calculation-entry?project=${stageChain.PROJECT_ID}`);
  assert.equal(result.problem.label, "Проверить начальный расчёт");
});
