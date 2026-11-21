"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");
global.window = globalThis;

require("../src/yarnai/static/project-system.js");
require("../src/yarnai/static/project-details-experience.js");
require("../src/yarnai/static/project-details-collaboration.js");
require("../src/yarnai/static/project-details-closure.js");
require("../src/yarnai/static/project-initialization.js");
require("../src/yarnai/static/swatch-gauge.js");
require("../src/yarnai/static/project-calculation-entry.js");
require("../src/yarnai/static/project-readiness-engine.js");
require("../src/yarnai/static/project-execution-plan.js");
require("../src/yarnai/static/project-execution-plan-workspace.js");
require("../src/yarnai/static/project-execution-start.js");
require("../src/yarnai/static/project-execution-start-workspace.js");
require("../src/yarnai/static/project-execution-first-step.js");
require("../src/yarnai/static/project-execution-next-step.js");
require("../src/yarnai/static/project-execution-next-step-clarification.js");
require("../src/yarnai/static/foundation-section-execution-preparation.js");
const fixture = require("../src/yarnai/static/stage70-happy-path-fixture.js");

const system = global.YarnAIProjectSystem;
let repositories = [];

function repository() {
  const value = new system.ProjectRepository();
  repositories.push(value);
  return value;
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(system.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database blocked"));
  });
}

beforeEach(async () => { repositories = []; await deleteDatabase(); });
afterEach(async () => {
  await Promise.all(repositories.map((value) => value.close().catch(() => undefined)));
  await deleteDatabase();
});

async function withBrowserContext(url, action) {
  const documentDescriptor = Object.getOwnPropertyDescriptor(global, "document");
  const locationDescriptor = Object.getOwnPropertyDescriptor(global, "location");
  Object.defineProperty(global, "document", { configurable: true, writable: true, value: {} });
  Object.defineProperty(global, "location", { configurable: true, writable: true, value: new URL(url) });
  try {
    return await action();
  } finally {
    if (documentDescriptor) Object.defineProperty(global, "document", documentDescriptor);
    else delete global.document;
    if (locationDescriptor) Object.defineProperty(global, "location", locationDescriptor);
    else delete global.location;
  }
}

test("browser fixture refuses the canonical production origin before opening IndexedDB", async () => {
  await withBrowserContext("http://127.0.0.1:8000/static/stage70-happy-path-fixture.html", async () => {
    await assert.rejects(
      fixture.seedStage70HappyPath(),
      (error) => error?.code === "FIXTURE_PRODUCTION_STORAGE_FORBIDDEN",
    );
    assert.equal((await indexedDB.databases()).some((entry) => entry.name === system.DB_NAME), false);
  });
});

test("every downstream browser fixture checks isolation before constructing a repository", () => {
  for (let stage = 71; stage <= 91; stage += 1) {
    const source = fs.readFileSync(
      path.join(__dirname, `../src/yarnai/static/stage${stage}-happy-path-fixture.js`),
      "utf8",
    );
    const guardIndex = source.indexOf("assertIsolatedFixtureEnvironment");
    const repositoryIndex = source.indexOf("new system.ProjectRepository");
    assert.notEqual(guardIndex, -1, `Stage ${stage} must invoke the isolation guard`);
    assert.notEqual(repositoryIndex, -1, `Stage ${stage} must construct through ProjectRepository`);
    assert.ok(guardIndex < repositoryIndex, `Stage ${stage} must guard before opening storage`);
  }
});

test("browser fixture requires an explicit marker on a separate localhost origin", async () => {
  await withBrowserContext("http://127.0.0.1:8100/static/stage70-happy-path-fixture.html", async () => {
    await assert.rejects(
      fixture.seedStage70HappyPath(),
      (error) => error?.code === "FIXTURE_ISOLATION_MARKER_REQUIRED",
    );
  });
});

test("isolated localhost fixture remains usable with fake IndexedDB", async () => {
  await withBrowserContext("http://127.0.0.1:8100/static/stage70-happy-path-fixture.html?testStorage=isolated", async () => {
    const repo = repository();
    await repo.initialize();
    const result = await fixture.seedStage70HappyPath({ repository: repo, startedAt: Date.parse("2026-08-08T10:00:00.000Z") });
    const aggregate = await repo.getProject(result.projectId);
    assert.equal(aggregate.project.title, "Stage 70 happy-path manual fixture");
  });
});

test("test/dev fixture persists a live-valid Stage 60-69 chain and opens Stage 70 collecting", async () => {
  const repo = repository();
  await repo.initialize();
  const result = await fixture.seedStage70HappyPath({ repository: repo, startedAt: Date.parse("2026-08-08T10:00:00.000Z") });

  assert.equal(result.stage70Assessment.lifecycle, "ready");
  assert.equal(result.stage70Assessment.workingMethod, null);
  assert.equal(result.stage70Assessment.authoritativeTool, null);
  assert.equal(result.stage70Assessment.confirmedContext.castOnCount, 100);
  assert.deepEqual(result.stage70Assessment.confirmedContext.target, { kind: "height", value: 5, unit: "cm" });
  assert.equal(result.stage65Snapshot.planScope.boundedInputs.workingMethod, "unknown");
  assert.equal(result.stage67Snapshot.check.observedStitchCount, 100);
  assert.equal(result.stage69Snapshot.clarification.foundationType, "ribbing");
  assert.equal(await repo.getCurrentFoundationSectionExecutionPreparation(result.projectId, result.calculationId), null);

  const before = await repo.getProject(result.projectId);
  const record = await repo.ensureFoundationSectionExecutionPreparation(
    result.projectId,
    result.calculationId,
    result.stage70Assessment,
    { expectedProjectRevision: before.project.revision, timestamp: "2026-08-08T10:01:00.000Z" },
  );
  const after = await repo.getProject(result.projectId);
  const reassessment = global.YarnAIFoundationSectionExecutionPreparation.assessSource({
    projectId: result.projectId, project: after.project, progress: after.progress,
    stage63Domain: global.YarnAISwatchGauge,
    stage65Domain: global.YarnAIProjectExecutionPlan,
    stage66Domain: global.YarnAIProjectExecutionStart,
    stage67Domain: global.YarnAIProjectExecutionFirstStep,
    stage68Domain: global.YarnAIProjectExecutionNextStep,
    stage69Domain: global.YarnAIProjectExecutionNextStepClarification,
    preparationProgressRevision: record.revision,
    validatedAt: "2026-08-08T10:01:01.000Z",
  });
  const state = global.YarnAIFoundationSectionExecutionPreparation.validateProgressState(record.state, { assessment: reassessment });

  assert.equal(reassessment.lifecycle, "ready");
  assert.equal(state.lifecycle, "collecting");
  assert.equal(state.draft.workingMethod, null);
  assert.equal(state.draft.ribPattern, null);
  assert.equal(state.draft.toolConfirmation, null);
  assert.equal(state.draft.rowEstimate, null);
});
