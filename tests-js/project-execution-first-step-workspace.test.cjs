"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fixture = require("./stage60-to-66-saved-chain.cjs");
const domain = require("../src/yarnai/static/project-execution-first-step.js");
const workspace = require("../src/yarnai/static/project-execution-first-step-workspace.js");

const OPS = Array.from({ length: 20 }, (_, index) => `019fc3ba-4100-7${String(300 + index).slice(-3)}-8af9-bd06e3bff${String(200 + index).slice(-3)}`);

function aggregateWithStage66() {
  const aggregate = fixture.withCompletedPlan();
  const snapshot = fixture.startedSnapshot(aggregate);
  const calculationId = aggregate.project.active_calculation_id;
  aggregate.progress.push({
    schema_version: 1,
    progress_id: "stage66-progress-record",
    project_id: fixture.PROJECT_ID,
    calculation_id: calculationId,
    kind: fixture.startDomain.PROGRESS_KIND,
    epoch: 1,
    state: fixture.startDomain.createProgressState(snapshot, calculationId),
    revision: 1,
    created_at: fixture.START_AT,
    updated_at: fixture.START_AT,
  });
  return aggregate;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

class FakeElement {
  constructor() {
    this.hidden = true;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.textContent = "";
    this.href = "";
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.focused = false;
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() { this.focused = true; }
}

function fakeUi() {
  const names = [
    "root", "loading", "blocked", "blockedMessage", "blockedCode", "recovery", "content",
    "title", "lifecycle", "instruction", "target", "yarn", "tools", "gauge", "technique",
    "warningsSection", "warnings", "assumptionsSection", "assumptions", "ready", "active",
    "paused", "checking", "completed", "activate", "pause", "check", "resume", "pausedAt",
    "count", "confirmation", "complete", "cancelCheck", "checkFeedback", "completedCount",
    "completedAt", "status",
  ];
  return Object.fromEntries(names.map((name) => [name, new FakeElement()]));
}

function fakeTarget() {
  const listeners = new Map();
  return {
    location: { pathname: "/project-execution-first-step", search: `?project=${fixture.PROJECT_ID}` },
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) { callback(); },
    addEventListener(type, listener, options = {}) {
      const values = listeners.get(type) || [];
      values.push({ listener, once: options.once === true });
      listeners.set(type, values);
    },
    dispatch(type) {
      const values = [...(listeners.get(type) || [])];
      listeners.set(type, values.filter((entry) => !entry.once));
      values.forEach((entry) => entry.listener({ type, persisted: type === "pageshow" }));
    },
  };
}

function fakeDocument() {
  return { createElement() { return new FakeElement(); } };
}

function fakeRepository(aggregate) {
  const calls = { ensure: 0, update: 0 };
  return {
    calls,
    async initialize() {},
    async close() {},
    async getProject() { return aggregate; },
    async ensureProjectExecutionFirstStep(projectId, calculationId, state) {
      calls.ensure += 1;
      let existing = aggregate.progress.find((entry) => entry.kind === domain.KIND);
      if (!existing) {
        existing = {
          schema_version: 1,
          progress_id: "stage67-progress-record",
          project_id: projectId,
          calculation_id: calculationId,
          kind: domain.KIND,
          epoch: 1,
          state: clone(state),
          revision: 1,
          created_at: state.snapshot.timestamps.createdAt,
          updated_at: state.snapshot.timestamps.createdAt,
        };
        aggregate.progress.push(existing);
      }
      return clone(existing);
    },
    async updateProjectExecutionFirstStep(projectId, calculationId, state, options) {
      calls.update += 1;
      const record = aggregate.progress.find((entry) => entry.kind === domain.KIND);
      const current = domain.validateProgressState(record.state, { projectIdentity: projectId, calculationId });
      const replay = current.snapshot.audit.find((entry) => entry.operationId === options.operationId);
      if (!replay) {
        assert.equal(options.expectedRevision, current.snapshot.revision);
        assert.equal(options.expectedFingerprint, current.snapshot.fingerprint);
        record.state = clone(state);
        record.revision += 1;
        record.updated_at = options.timestamp;
      }
      return { project: clone(aggregate.project), progress: clone(record), replayed: Boolean(replay) };
    },
  };
}

function nextTurn() { return new Promise((resolve) => setImmediate(resolve)); }

test("00 user timestamps use deterministic Russian presentation formatting", () => {
  const raw = "2026-08-04T04:41:19.676Z";
  const formatted = workspace.formatUserTimestamp(raw, { locale: "ru-RU", timeZone: "Europe/Warsaw" });
  assert.equal(formatted, "04.08.2026, 06:41");
  assert.equal(formatted.includes(".676"), false);
  assert.equal(formatted.includes("T04:41"), false);
  assert.equal(formatted.includes("Z"), false);
  assert.doesNotMatch(workspace.createController.toString(), /textContent\s*=\s*snapshot\.timestamps\./);
});

test("01 aggregate assessment safely distinguishes ensure, restore and corruption", () => {
  const aggregate = aggregateWithStage66();
  let result = workspace.assessAggregateReadiness({ aggregate, projectId: fixture.PROJECT_ID, domain, stage66Domain: fixture.startDomain });
  assert.equal(result.ready, true);
  assert.equal(result.canEnsure, true);
  const snapshot = domain.createSnapshot(result.source, { createdAt: "2026-08-02T16:00:00.000Z", operationId: OPS[0] });
  aggregate.progress.push({ progress_id: "stage67-progress-record", project_id: fixture.PROJECT_ID, calculation_id: snapshot.calculationId, kind: domain.KIND, state: domain.createProgressState(snapshot), revision: 1 });
  result = workspace.assessAggregateReadiness({ aggregate, projectId: fixture.PROJECT_ID, domain, stage66Domain: fixture.startDomain });
  assert.equal(result.ready, true);
  assert.equal(result.canEnsure, false);
  assert.equal(result.snapshot.identity, snapshot.identity);
  aggregate.progress.at(-1).state = clone(aggregate.progress.at(-1).state);
  aggregate.progress.at(-1).state.snapshot.step.targetStitchCount = 101;
  result = workspace.assessAggregateReadiness({ aggregate, projectId: fixture.PROJECT_ID, domain, stage66Domain: fixture.startDomain });
  assert.equal(result.ready, false);
  assert.equal(result.canEnsure, false);
});

test("02 controller ensures once and reload/pageshow do not transition lifecycle", async () => {
  const aggregate = aggregateWithStage66();
  assert.match(aggregate.project.title, /^Stage 63/);
  const repository = fakeRepository(aggregate);
  const target = fakeTarget();
  const ui = fakeUi();
  let operationIndex = 0;
  const controller = workspace.createController({
    globalObject: target,
    document: fakeDocument(),
    domain,
    stage66Domain: fixture.startDomain,
    routes: { projectIdentityFromLocation() { return fixture.PROJECT_ID; } },
    system: { isUuidv7(value) { return value === fixture.PROJECT_ID; }, uuidv7() { return OPS[operationIndex++]; } },
    repositoryFactory: () => repository,
    now: () => `2026-08-02T17:${String(operationIndex).padStart(2, "0")}:00.000Z`,
    ui,
  });
  const started = controller.start();
  target.dispatch("pageshow");
  await started;
  assert.equal(repository.calls.ensure, 1);
  assert.equal(controller.getState().snapshot.lifecycle, "ready");
  assert.equal(ui.title.textContent, "Набор петель");
  assert.equal(ui.instruction.textContent, "Набрать 100 петель");
  assert.equal(ui.target.textContent, "100 петель");
  for (const internalStage of ["Stage 63", "Stage 65", "Stage 66"]) {
    assert.equal(ui.title.textContent.includes(internalStage), false);
  }
  assert.equal(ui.activate.disabled, false);
  target.dispatch("pageshow");
  await nextTurn();
  assert.equal(repository.calls.ensure, 1);
  assert.equal(controller.getState().snapshot.lifecycle, "ready");
});

test("03 controller renders lifecycle, mismatch focus and safe double-click completion", async () => {
  const aggregate = aggregateWithStage66();
  const repository = fakeRepository(aggregate);
  const target = fakeTarget();
  const ui = fakeUi();
  let operationIndex = 0;
  const controller = workspace.createController({
    globalObject: target,
    document: fakeDocument(),
    domain,
    stage66Domain: fixture.startDomain,
    routes: { projectIdentityFromLocation() { return fixture.PROJECT_ID; } },
    system: { isUuidv7() { return true; }, uuidv7() { return OPS[operationIndex++]; } },
    repositoryFactory: () => repository,
    now: () => `2026-08-02T18:${String(operationIndex).padStart(2, "0")}:00.000Z`,
    locale: "ru-RU",
    timeZone: "Europe/Warsaw",
    ui,
  });
  const started = controller.start(); target.dispatch("pageshow"); await started;
  await controller.perform("activate");
  await controller.perform("pause");
  assert.equal(controller.getState().snapshot.lifecycle, "paused");
  const pausedAt = controller.getState().snapshot.timestamps.lastPausedAt;
  assert.match(pausedAt, /^2026-08-02T18:\d{2}:00\.000Z$/);
  assert.equal(ui.pausedAt.textContent, workspace.formatUserTimestamp(pausedAt, { locale: "ru-RU", timeZone: "Europe/Warsaw" }));
  assert.doesNotMatch(ui.pausedAt.textContent, /T|Z|:\d{2}\.\d{3}/);
  await controller.perform("resume");
  await controller.perform("checking");
  assert.equal(controller.getState().snapshot.lifecycle, "checking");
  ui.count.value = "";
  await controller.perform("complete");
  assert.equal(ui.count.focused, true);
  assert.equal(controller.getState().snapshot.lifecycle, "checking");
  ui.count.value = "99";
  ui.confirmation.checked = true;
  await controller.perform("complete");
  assert.equal(ui.checkFeedback.textContent, "Не хватает 1 петли.");
  assert.equal(controller.getState().snapshot.lifecycle, "checking");
  ui.count.value = "100";
  ui.confirmation.checked = true;
  const before = repository.calls.update;
  await Promise.all([controller.perform("complete"), controller.perform("complete")]);
  assert.equal(controller.getState().snapshot.lifecycle, "completed");
  assert.equal(repository.calls.update, before + 1);
  assert.equal(ui.completedCount.textContent, "100 петель");
  const completedAt = controller.getState().snapshot.timestamps.completedAt;
  assert.match(completedAt, /^2026-08-02T18:\d{2}:00\.000Z$/);
  assert.equal(ui.completedAt.textContent, workspace.formatUserTimestamp(completedAt, { locale: "ru-RU", timeZone: "Europe/Warsaw" }));
  assert.doesNotMatch(ui.completedAt.textContent, /T|Z|:\d{2}\.\d{3}/);
});

test("04 recovery and navigation allowlist never use the legacy execution route", () => {
  assert.equal(workspace.recoveryHref(domain, domain.diagnostic("PROJECT_NOT_FOUND", "Нет проекта"), fixture.PROJECT_ID), "/saved-projects");
  assert.equal(domain.safeDestination(`/pattern-execution-session?project=${fixture.PROJECT_ID}`, fixture.PROJECT_ID).valid, false);
});


test("05 user-facing first-step title is derived from the semantic step type", () => {
  assert.equal(workspace.userFacingStepTitle({ type: "CAST_ON" }), "Набор петель");
  assert.equal(workspace.userFacingStepTitle({ type: "UNKNOWN" }), "Первый шаг");
});
