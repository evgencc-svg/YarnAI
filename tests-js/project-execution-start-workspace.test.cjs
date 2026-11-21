"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
const domain = require("../src/yarnai/static/project-execution-start.js");
require("../src/yarnai/static/project-system.js");
const system = global.YarnAIProjectSystem;
const workspace = require("../src/yarnai/static/project-execution-start-workspace.js");
const fixture = require("./stage60-to-66-saved-chain.cjs");

let repositories = [];
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }

beforeEach(async () => { repositories = []; await deleteDatabase(); });
afterEach(async () => { await Promise.all(repositories.map((repo) => repo.close().catch(() => undefined))); await deleteDatabase(); });

function repositorySnapshot(projectId, planFingerprint = "fnv1a32:plan") {
  const assessment = {
    ready: true,
    projectIdentity: projectId,
    source: {
      projectRevision: 2,
      calculationId: "pending",
      planIdentity: `${projectId}:plan`,
      planFingerprint,
      sourceIdentities: { closure: "closure", initialization: "init", gauge: "gauge", calculation: "calc", stage65: `${projectId}:plan` },
      sourceFingerprints: { closure: "fnv1a32:closure", initialization: "fnv1a32:init", gauge: "fnv1a32:gauge", calculation: "fnv1a32:calc", stage65: planFingerprint },
    },
    preparation: {
      product: "Свитер", size: "custom", recipient: "woman", yarn: "Не указана", tools: ["Не указан"], technique: "Не указан",
      materials: ["Подтверждённые дополнительные материалы не указаны"],
      gaugeSummary: { stitchesPer10Cm: 20, rowsPer10Cm: 28, display: "20 п. × 28 р. на 10 см" },
      firstStep: { sourceIdentity: `${projectId}:step:1`, type: "CAST_ON", instruction: "Набрать 100 петель", stitchCount: 100 },
      warnings: [], assumptions: [],
    },
  };
  let snapshot = domain.buildDraft(assessment, { createdAt: fixture.START_AT, acknowledged: true, acknowledgedAt: fixture.START_AT });
  snapshot = domain.markReady(snapshot, { timestamp: fixture.START_AT });
  return domain.start(snapshot, { startedAt: fixture.START_AT });
}

test("01 repository stores one project-scoped start and reload restores it", async () => {
  const repo = repository();
  await repo.initialize();
  const project = await repo.createProject({ title: "Stage 66 reload" });
  const calculation = await repo.addCalculation(project.project_id, { stage: 66 }, { status: "READY", normalized_inputs: {}, warnings: [], errors: [], clarifications: [] });
  const calculationId = calculation.calculation.calculation_id;
  const snapshot = repositorySnapshot(project.project_id);
  const state = domain.createProgressState(snapshot, calculationId);
  const first = await repo.ensureProjectExecutionStart(project.project_id, calculationId, state);
  const second = await repo.ensureProjectExecutionStart(project.project_id, calculationId, state);
  assert.equal(second.progress_id, first.progress_id);
  assert.equal((await repo.getProject(project.project_id)).progress.filter((entry) => entry.kind === domain.PROGRESS_KIND).length, 1);
  assert.equal(domain.existingStatus(await repo.getProjectExecutionStart(project.project_id), { projectIdentity: project.project_id }).snapshot.firstStep.instruction, "Набрать 100 петель");
});

test("02 duplicate start with conflicting snapshot returns the original record", async () => {
  const repo = repository();
  await repo.initialize();
  const project = await repo.createProject({ title: "Stage 66 duplicate" });
  const calculation = await repo.addCalculation(project.project_id, { stage: 66 }, { status: "READY", normalized_inputs: {}, warnings: [], errors: [], clarifications: [] });
  const calculationId = calculation.calculation.calculation_id;
  const firstState = domain.createProgressState(repositorySnapshot(project.project_id, "fnv1a32:plan1"), calculationId);
  const secondState = domain.createProgressState(repositorySnapshot(project.project_id, "fnv1a32:plan2"), calculationId);
  const first = await repo.ensureProjectExecutionStart(project.project_id, calculationId, firstState);
  const duplicate = await repo.ensureProjectExecutionStart(project.project_id, calculationId, secondState);
  assert.equal(duplicate.progress_id, first.progress_id);
  assert.equal(duplicate.state.snapshot.sourceStage65Fingerprint, "fnv1a32:plan1");
});

test("03 start record cannot be updated", async () => {
  const repo = repository();
  await repo.initialize();
  await assert.rejects(repo.updateProjectExecutionStart("x", "y", {}), { code: "PROJECT_EXECUTION_START_IMMUTABLE" });
});

test("04 existing started record wins over a later readiness read", () => {
  const aggregate = fixture.withCompletedPlan();
  const snapshot = fixture.startedSnapshot(aggregate);
  aggregate.progress.push({ project_id: fixture.PROJECT_ID, calculation_id: aggregate.project.active_calculation_id, kind: domain.PROGRESS_KIND, state: domain.createProgressState(snapshot, aggregate.project.active_calculation_id), updated_at: fixture.START_AT });
  const result = workspace.assessAggregateReadiness(fixture.readinessOptions(aggregate));
  assert.equal(result.started, true);
  assert.equal(result.existing.snapshot.firstStep.instruction, "Набрать 100 петель");
});

test("05 pageshow and native restoration are explicit", async () => {
  let pageHandler;
  let frames = 0;
  const target = { addEventListener(_name, handler) { pageHandler = handler; }, requestAnimationFrame(handler) { frames += 1; handler(); } };
  let settled = false;
  const pending = workspace.waitForPageShow(target).then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  pageHandler();
  await pending;
  await workspace.waitForNativeRestoration(target);
  assert.equal(frames, 2);
});

test("06 UI binds acknowledgment before enabling explicit start", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-start-workspace.js"), "utf8");
  assert.match(source, /ui\.start\.disabled = busy \|\| !acknowledged/);
  assert.match(source, /if \(!ui\.acknowledgment\.checked\)/);
  assert.match(source, /aggregate = await repository\.getProject\(projectId\);\s*result = assessAggregateReadiness/);
});

test("07 HTML exposes labels, aria-live, focus target and natural tab order", () => {
  const html = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-start.html"), "utf8");
  assert.match(html, /id="execution-start-acknowledgment" type="checkbox"/);
  assert.match(html, /id="execution-start-status" role="status" aria-live="polite"/);
  assert.match(html, /id="execution-start-blocked-message" role="alert" aria-live="assertive" tabindex="-1"/);
  assert.match(html, /id="execution-start-button"[^>]*disabled/);
  assert.equal(html.includes("tabindex=\"1\""), false);
});

test("08 /saved-projects uses the full Stage 66 readiness function", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/user-workspace-entry-assistant.js"), "utf8");
  assert.match(source, /startWorkspace\.assessAggregateReadiness/);
  assert.match(source, /workspace_stage66_status/);
});

test("09 project card distinguishes ready, blocked and started states", () => {
  const workspaceDomain = require("../src/yarnai/static/user-workspace-entry.js");
  const base = { project_id: fixture.PROJECT_ID, title: "Свитер", workspace_status: "ACTIVE", revision: 1 };
  const states = [
    ["ready", "Можно подготовиться к началу", "Подготовиться к началу"],
    ["blocked", "Начало заблокировано", "Проверить причину блокировки"],
    ["started", "Выполнение начато", "Открыть начатое выполнение"],
  ];
  for (const [status, state, label] of states) {
    const project = { ...base, workspace_stage66_status: status };
    const model = workspaceDomain.buildWorkspaceViewModel([project], []);
    assert.equal(model.projects[0].state, state);
    assert.equal(model.projects[0].action.label, label);
    assert.match(model.projects[0].action.href, new RegExp(fixture.PROJECT_ID));
  }
});

test("10 IndexedDB schema version and stores are unchanged", () => {
  assert.equal(system.DB_VERSION, 4);
  assert.equal(system.STORE_NAMES.includes("project_execution_start"), false);
});

test("11 started state returns to the saved projects page", async () => {
  const aggregate = fixture.withCompletedPlan();
  const snapshot = fixture.startedSnapshot(aggregate);
  aggregate.progress.push({
    project_id: fixture.PROJECT_ID,
    calculation_id: aggregate.project.active_calculation_id,
    kind: domain.PROGRESS_KIND,
    state: domain.createProgressState(snapshot, aggregate.project.active_calculation_id),
    updated_at: fixture.START_AT,
  });
  const element = () => ({
    hidden: true,
    textContent: "",
    href: "",
    checked: false,
    disabled: false,
    addEventListener() {},
    focus() {},
    replaceChildren() {},
  });
  const ui = Object.fromEntries([
    "loading", "blocked", "blockedMessage", "blockedCode", "recovery", "ready", "started", "title",
    "product", "size", "recipient", "yarn", "tools", "technique", "gaugeValue", "materials",
    "warningsSection", "warnings", "assumptions", "firstStep", "acknowledgment", "start", "status",
    "startedAt", "startedStep", "nextMessage", "back", "startedBack", "details", "detailsBody",
  ].map((name) => [name, element()]));
  const handlers = {};
  const target = {
    location: { pathname: "/project-execution-start" },
    addEventListener(name, handler) { handlers[name] = handler; },
    requestAnimationFrame(handler) { handler(); },
  };
  const controller = workspace.createController({
    globalObject: target,
    document: { createElement: element },
    domain,
    planDomain: {},
    planWorkspace: {},
    calculationDomain: {},
    initialization: {},
    gauge: {},
    experience: {},
    readiness: {},
    routes: { projectIdentityFromLocation() { return fixture.PROJECT_ID; } },
    system: { isUuidv7() { return true; } },
    repositoryFactory: () => ({
      async initialize() {},
      async getProject() { return aggregate; },
      async close() {},
    }),
    ui,
  });

  const started = controller.start();
  handlers.pageshow();
  await started;

  assert.equal(ui.started.hidden, false);
  assert.equal(ui.startedBack.href, "/saved-projects");
});
