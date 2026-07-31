"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const api = require("../src/yarnai/static/first-blocking.js");

const PROJECT_ID = "project-stage-14";

function at(minute) {
  return new Date(Date.UTC(2026, 6, 31, 15, minute)).toISOString();
}

function source(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    tailSecuring: {
      id: "tail-1",
      status: "completed",
      revision: 12,
      completedAt: at(0),
    },
    calculation: {
      fingerprint: "f".repeat(64),
      request: {
        garment_type: "джемпер",
        target_width: { value: 48, unit: "cm" },
      },
    },
    ...overrides,
  };
}

function configured(fiberType = "wool", method = "wet_blocking") {
  let state = api.createInitialState(source(), at(1));
  state = api.updateDetails(
    state,
    {
      itemKind: "собранный джемпер",
      fiberType,
      fiberTypeConfirmed: true,
      careLabelKnown: true,
      careLabelText: "Ручная стирка",
      itemReady: true,
    },
    at(2),
  );
  state = api.updateDetails(
    state,
    {
      blockingMethod: method,
      nonstandardMethodConfirmed: method !== state.recommendedMethod,
      steamCompatible: false,
    },
    at(3),
  );
  state = api.setMeasurement(
    state,
    { ...state.targetMeasurements[0], confirmed: true },
    at(4),
  );
  return state;
}

function ready(fiberType = "wool", method = "wet_blocking") {
  let state = configured(fiberType, method);
  for (const item of state.preparationChecklist) {
    if (item.required && item.source === "user" && !item.checked) {
      state = api.setChecklistItem(state, item.id, true, at(5));
    }
  }
  return state;
}

function started() {
  return api.startBlocking(ready(), at(6));
}

function drying() {
  let state = started();
  state = api.confirmStep(state, "prepare", { done: true }, at(7));
  state = api.confirmStep(state, "treatment", { done: true }, at(8));
  state = api.confirmStep(state, "water_removed", { done: true }, at(9));
  state = api.confirmStep(
    state,
    "laid_out",
    {
      flatSurface: true,
      sidesAligned: true,
      seamsStraight: true,
      measurementsChecked: true,
      notOverstretched: true,
      pinsOnlyIfNeeded: true,
    },
    at(10),
  );
  return state;
}

function dryConfirmation(overrides = {}) {
  return {
    fullyDry: true,
    measurementsChecked: true,
    shapeAccepted: true,
    seamsCorrect: true,
    notDeformed: true,
    ...overrides,
  };
}

test("creates the independent FIRST_BLOCKING model", () => {
  const state = api.createInitialState(source(), at(1));
  assert.equal(api.PROGRESS_KIND, "FIRST_BLOCKING");
  assert.equal(state.version, 1);
  assert.equal(state.revision, 1);
  assert.equal(state.status, "collecting");
  assert.equal(state.sourceTailSecuringRevision, 12);
  assert.equal(state.sourceCalculationFingerprint, "f".repeat(64));
  for (const field of [
    "itemKind",
    "fiberType",
    "fiberTypeConfirmed",
    "careLabelKnown",
    "careLabelText",
    "blockingMethod",
    "targetMeasurements",
    "preparationChecklist",
    "currentStep",
    "completedSteps",
    "warnings",
    "blockers",
    "notes",
    "createdAt",
    "updatedAt",
    "startedAt",
    "completedAt",
  ]) {
    assert.ok(Object.hasOwn(state, field), field);
  }
});

test("blocks Stage 14 until Stage 13 is completed", () => {
  const state = api.createInitialState(
    source({ tailSecuring: { status: "securing", revision: 11 } }),
    at(1),
  );
  assert.equal(state.status, "blocked");
  assert.equal(state.blockers[0].code, "TAIL_SECURING_NOT_COMPLETED");
  assert.throws(() => api.startBlocking(state, at(2)));
});

test("recommends wet blocking for wool", () => {
  const recommendation = api.recommendMethod("wool");
  assert.equal(recommendation.method, "wet_blocking");
  assert.match(recommendation.reason, /шерст/i);
});

test("warns about superwash stretching", () => {
  const warnings = api.determineWarnings(
    "superwash_wool",
    "wet_blocking",
    true,
  );
  assert.ok(warnings.some((entry) => entry.code === "SUPERWASH_STRETCH"));
});

test("warns about wet cotton weight", () => {
  const warnings = api.determineWarnings("cotton", "wet_blocking", true);
  assert.ok(warnings.some((entry) => entry.code === "WET_WEIGHT"));
});

test("rejects dangerous acrylic heat", () => {
  const unsafe = api.validateMethod("acrylic", "steam_blocking", {
    careLabelKnown: true,
    steamCompatible: true,
  });
  assert.equal(unsafe.code, "UNSAFE_STEAM");
});

test("unknown fiber remains conservative", () => {
  assert.equal(api.recommendMethod("unknown").method, "gentle_shaping");
  assert.equal(
    api.validateMethod("unknown", "steam_blocking", {
      careLabelKnown: true,
      steamCompatible: true,
    }).code,
    "UNSAFE_STEAM",
  );
  assert.equal(
    api.validateMethod("unknown", "gentle_shaping", {
      careLabelKnown: false,
    }),
    null,
  );
});

test("checklist depends on method and item", () => {
  const wet = configured();
  assert.equal(
    wet.preparationChecklist.find((item) => item.id === "towels_ready")
      .required,
    true,
  );
  const gentle = configured("acrylic", "gentle_shaping");
  assert.equal(
    gentle.preparationChecklist.find((item) => item.id === "towels_ready")
      .required,
    false,
  );
  assert.equal(api.checklistReady(wet), false);
});

test("stage starts only after required checklist", () => {
  assert.throws(() => api.startBlocking(configured(), at(6)), {
    code: "CHECKLIST_INCOMPLETE",
  });
  const state = api.startBlocking(ready(), at(6));
  assert.equal(state.status, "in_progress");
  assert.equal(state.currentStep, "prepare");
  assert.equal(state.startedAt, at(6));
});

test("steps are sequential and wet blocking includes water removal", () => {
  let state = started();
  assert.deepEqual(api.requiredSteps(state.blockingMethod), [
    "prepare",
    "treatment",
    "water_removed",
    "laid_out",
  ]);
  assert.throws(
    () => api.confirmStep(state, "water_removed", { done: true }, at(7)),
    { code: "STEP_OUT_OF_ORDER" },
  );
  state = api.confirmStep(state, "prepare", { done: true }, at(7));
  assert.equal(state.currentStep, "treatment");
});

test("drying requires explicit layout confirmation", () => {
  let state = started();
  state = api.confirmStep(state, "prepare", { done: true }, at(7));
  state = api.confirmStep(state, "treatment", { done: true }, at(8));
  state = api.confirmStep(state, "water_removed", { done: true }, at(9));
  assert.throws(
    () =>
      api.confirmStep(
        state,
        "laid_out",
        { flatSurface: true },
        at(10),
      ),
    { code: "LAYOUT_INCOMPLETE" },
  );
  state = drying();
  assert.equal(state.status, "drying");
  assert.equal(state.currentStep, "drying");
  assert.equal(state.dryingStartedAt, at(10));
});

test("cannot complete before a full-dry result", () => {
  assert.throws(() => api.completeBlocking(drying(), at(11)), {
    code: "EARLY_COMPLETION",
  });
  assert.throws(
    () =>
      api.registerDryResult(
        drying(),
        "all_good",
        dryConfirmation({ fullyDry: false }),
        null,
        at(11),
      ),
    { code: "NOT_FULLY_DRY" },
  );
});

test("explicit completion follows full drying and result check", () => {
  let state = api.registerDryResult(
    drying(),
    "all_good",
    dryConfirmation(),
    null,
    at(11),
  );
  assert.equal(state.status, "drying");
  assert.equal(state.completedAt, null);
  state = api.completeBlocking(state, at(12));
  assert.equal(state.status, "completed");
  assert.equal(state.completedAt, at(12));
});

test("correctable result enters needs_correction without losing history", () => {
  const before = drying();
  const state = api.registerDryResult(
    before,
    "stretched",
    dryConfirmation({ shapeAccepted: false, notDeformed: false }),
    "Рукав длиннее цели",
    at(11),
  );
  assert.equal(state.status, "needs_correction");
  assert.equal(state.correctionHistory.length, 1);
  assert.ok(state.actionHistory.length > before.actionHistory.length);
  assert.ok(state.completedSteps.includes("fully_dried"));
});

test("repeat blocking preserves previous history and completed steps", () => {
  let state = api.registerDryResult(
    drying(),
    "curling_edges",
    dryConfirmation({ shapeAccepted: false }),
    null,
    at(11),
  );
  const historyLength = state.actionHistory.length;
  const completed = [...state.completedSteps];
  state = api.restartCorrection(state, at(12));
  assert.equal(state.status, "in_progress");
  assert.ok(state.actionHistory.length > historyLength);
  assert.deepEqual(state.completedSteps, completed);
});

test("revision increments once per successful state change", () => {
  let state = api.createInitialState(source(), at(1));
  const first = state.revision;
  state = api.updateDetails(
    state,
    {
      itemKind: "джемпер",
      fiberType: "wool",
      fiberTypeConfirmed: true,
      careLabelKnown: true,
      itemReady: true,
    },
    at(2),
  );
  assert.equal(state.revision, first + 1);
  const repeated = api.updateDetails(
    state,
    { careLabelKnown: true },
    at(3),
  );
  assert.equal(repeated.revision, state.revision);
});

test("completedSteps are idempotent", () => {
  const state = drying();
  assert.equal(
    state.completedSteps.length,
    new Set(state.completedSteps).size,
  );
  assert.equal(
    state.completedSteps.filter((step) => step === "laid_out").length,
    1,
  );
});

test("serializes and restores a valid state", () => {
  const state = drying();
  const restored = api.restoreState(api.serializeState(state));
  assert.deepEqual(restored, state);
  assert.equal(api.safeRestore(JSON.stringify(state)).ok, true);
});

test("damaged and unsupported records return safe diagnostics", () => {
  const damaged = api.safeRestore("{bad json");
  assert.equal(damaged.ok, false);
  assert.equal(damaged.diagnostic.code, "BLOCKING_DATA_DAMAGED");
  const state = api.createInitialState(source(), at(1));
  state.version = 99;
  assert.equal(api.safeRestore(state).ok, false);
});

test("target measurements are imported, confirmed and corrected with source", () => {
  let state = api.createInitialState(source(), at(1));
  assert.deepEqual(state.targetMeasurements[0], {
    key: "width",
    label: "Ширина",
    value: 48,
    unit: "cm",
    source: "calculation",
    confirmed: false,
  });
  state = api.setMeasurement(
    state,
    {
      ...state.targetMeasurements[0],
      value: 49,
      confirmed: true,
    },
    at(2),
  );
  assert.equal(state.targetMeasurements[0].value, 49);
  assert.equal(state.targetMeasurements[0].source, "user_corrected");
});

test("completed is terminal", () => {
  let state = api.registerDryResult(
    drying(),
    "all_good",
    dryConfirmation(),
    null,
    at(11),
  );
  state = api.completeBlocking(state, at(12));
  assert.throws(
    () => api.saveNote(state, "Поздняя заметка", at(13)),
    { code: "FIRST_BLOCKING_COMPLETED" },
  );
  assert.deepEqual(api.completeBlocking(state, at(13)), state);
});

test("nonstandard method requires explicit confirmation", () => {
  let state = api.createInitialState(source(), at(1));
  state = api.updateDetails(
    state,
    {
      itemKind: "джемпер",
      fiberType: "wool",
      fiberTypeConfirmed: true,
      careLabelKnown: true,
      itemReady: true,
    },
    at(2),
  );
  assert.throws(
    () =>
      api.updateDetails(
        state,
        { blockingMethod: "spray_blocking" },
        at(3),
      ),
    { code: "NONSTANDARD_CONFIRMATION_REQUIRED" },
  );
});

test("project-system persists FIRST_BLOCKING separately across reload", async () => {
  const { DB_NAME, ProjectRepository } = global.YarnAIProjectSystem;
  const repository = new ProjectRepository();
  await repository.initialize();
  const project = await repository.createProject({ title: "Stage 14 e2e" });
  const added = await repository.addCalculation(
    project.project_id,
    { schema_version: 1, kind: "CALCULATED_PROJECT" },
    {
      status: "READY",
      axes: { width: { selected_candidate: { working_count: 10 } } },
      warnings: [],
      errors: [],
      clarifications: [],
    },
  );
  const calculationId = added.calculation.calculation_id;
  await repository.ensureCalculationProgress(
    project.project_id,
    calculationId,
    api.TAIL_KIND,
    { version: 0, initialized: false },
  );
  const tailPlaceholder = await repository.getCalculationProgress(
    project.project_id,
    calculationId,
    api.TAIL_KIND,
  );
  await repository.updateCalculationProgress(
    project.project_id,
    calculationId,
    api.TAIL_KIND,
    {
      id: "tail-stage-13",
      status: "securing",
      revision: 6,
      completedAt: null,
    },
    {
      baseProgressRevision: tailPlaceholder.revision,
      projectStage: "tail_securing_in_progress",
    },
  );

  let result = await api.ensureForProject(repository, project.project_id);
  assert.equal(result.blocking.status, "blocked");
  const currentTail = await repository.getCalculationProgress(
    project.project_id,
    calculationId,
    api.TAIL_KIND,
  );
  await repository.updateCalculationProgress(
    project.project_id,
    calculationId,
    api.TAIL_KIND,
    {
      id: "tail-stage-13",
      status: "completed",
      revision: 7,
      completedAt: at(0),
    },
    {
      baseProgressRevision: currentTail.revision,
      projectStage: "tail_securing_completed",
    },
  );
  result = await api.ensureForProject(repository, project.project_id);
  assert.equal(result.blocking.status, "collecting");
  assert.equal(result.project.current_stage, "first_blocking_collecting");
  result = await api.updateDetailsForProject(repository, project.project_id, {
    itemKind: "шарф",
    fiberType: "unknown",
    fiberTypeConfirmed: true,
    careLabelKnown: false,
    itemReady: true,
  });
  const savedRevision = result.blocking.revision;
  await repository.close();

  const reopened = new ProjectRepository();
  await reopened.initialize();
  result = await api.ensureForProject(reopened, project.project_id);
  assert.equal(result.blocking.revision, savedRevision);
  assert.equal(result.blocking.itemKind, "шарф");
  const aggregate = await reopened.getProject(project.project_id);
  assert.equal(
    aggregate.progress.filter((entry) => entry.kind === api.PROGRESS_KIND)
      .length,
    1,
  );
  await reopened.close();
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
});