"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const calculatedProjects = require("../src/yarnai/static/calculated-project.js");

const { DB_NAME, ProjectRepository } = global.YarnAIProjectSystem;
let repositories = [];

function repository() {
  const value = new ProjectRepository();
  repositories.push(value);
  return value;
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

function projectIntent() {
  return {
    schemaVersion: 1,
    goal: "связать свитер",
    garmentType: "свитер",
    technique: "спицы",
    yarnKnown: true,
    yarn: "меринос",
    sampleKnown: true,
    targetWidth: {
      value: 50,
      unit: "cm",
      sizeKind: "finished",
      raw: "50 см",
    },
    gaugeKnown: true,
    gauge: {
      stitches: 20,
      widthCm: 10,
      rows: 28,
      heightCm: 10,
      sourceMeasurementCount: 3,
      measurements: [
        { stitches: 19.5, widthCm: 10 },
        { stitches: 20, widthCm: 10 },
        { stitches: 20.5, widthCm: 10 },
      ],
      context: {
        sameYarn: true,
        sameTools: true,
        samePattern: true,
        processed: true,
        fullyDry: true,
        relaxed: true,
        offNeedles: true,
        restHours: 12,
      },
      raw: "20 петель на 10 см",
    },
    preferences: {},
    assumptions: [],
    fieldStatus: {
      garmentType: "known",
      technique: "known",
      yarn: "known",
      targetWidth: "known",
      sampleKnown: "known",
      gauge: "known",
    },
  };
}

function requestPayload() {
  const fabric = {
    yarn: "меринос",
    yarn_batch: "not specified",
    strands: 1,
    strands_description: "one strand",
    needle_mm: 4,
    needle_type: "circular",
    pattern: "stockinette",
    mode: "flat",
    processing: "wash and dry flat",
  };
  return {
    axes: ["width"],
    functional_category: "ordinary",
    knitting_mode: "flat",
    zone_pattern: "stockinette",
    pattern_class: "constant_stitch_count",
    zone_homogeneous: "yes",
    fabric_context: fabric,
    width: {
      size_kind: "finished",
      value: 50,
      unit: "cm",
      direction: "nearest",
      gauge: {
        method: "ready_value",
        source: "personal_swatch",
        ready_count: 20,
        base_length: 10,
        base_unit: "cm",
        source_measurement_count: 3,
        context: {
          off_needles: "yes",
          processing_state: "after_intended_processing",
          fully_dry: "yes",
          rest_hours: 12,
          measurement_state: "relaxed",
          fabric,
          mode: "flat",
          heavy_or_large: "no",
        },
      },
    },
  };
}

function successfulResult(status = "READY_WITH_WARNINGS") {
  return {
    status,
    axes: {
      width: {
        selected_candidate: {
          working_count: 100,
          actual_size_original_unit: 50,
          original_unit: "cm",
        },
      },
    },
    gauges: {
      width: {
        ready_count: 20,
        base_length_cm: 10,
        density_per_cm: 2,
      },
    },
    warnings: [
      {
        code: "CHECK_SAMPLE",
        reason: "Проверьте контрольный образец.",
        next_action: "Сверьте условия измерения.",
      },
    ],
  };
}

beforeEach(async () => {
  repositories = [];
  await deleteDatabase();
});

afterEach(async () => {
  await Promise.all(repositories.map((entry) => entry.close()));
  await deleteDatabase();
});

test("successful calculation is saved as a structured project", async () => {
  const repo = repository();
  const intent = projectIntent();
  const result = successfulResult();
  const structured = calculatedProjects.createStructuredInput({
    projectIntent: intent,
    request: requestPayload(),
    result,
  });
  const project = await repo.createProject({
    title: calculatedProjects.projectTitle(intent),
  });
  await repo.addCalculation(project.project_id, structured, result);

  const aggregate = await repo.getProject(project.project_id);
  const restored = calculatedProjects.inspectAggregate(aggregate);

  assert.equal(restored.state, "ready");
  assert.equal(restored.project.project_id, project.project_id);
  assert.equal(restored.project.title, "Связать свитер");
  assert.equal(restored.project.workspace_status, "ACTIVE");
  assert.equal(restored.structured.schema_version, 1);
  assert.deepEqual(restored.structured.project_intent, intent);
  assert.equal(restored.structured.garment_type, "свитер");
  assert.deepEqual(restored.structured.target_width, {
    value: 50,
    unit: "cm",
    size_kind: "finished",
  });
  assert.deepEqual(restored.structured.stitch_gauge, {
    stitches: 20,
    width_cm: 10,
    density_per_cm: 2,
  });
  assert.deepEqual(restored.structured.row_gauge, {
    rows: 28,
    height_cm: 10,
  });
  assert.equal(restored.structured.swatch.measurements.length, 3);
  assert.deepEqual(
    restored.structured.swatch.measurements,
    intent.gauge.measurements,
  );
  assert.deepEqual(restored.structured.swatch.context, intent.gauge.context);
  assert.deepEqual(restored.structured.average_gauge, {
    stitches: 20,
    width_cm: 10,
    density_per_cm: 2,
  });
  assert.deepEqual(restored.result, result);
  assert.deepEqual(restored.warnings, result.warnings);
  assert.equal(restored.stage, "calculation_complete");
});

test("repeated saves update one stable project without project duplicates", async () => {
  const repo = repository();
  const intent = projectIntent();
  const project = await repo.createProject({
    title: calculatedProjects.projectTitle(intent),
  });
  const first = calculatedProjects.createStructuredInput({
    projectIntent: intent,
    request: requestPayload(),
    result: successfulResult("READY"),
  });
  await repo.addCalculation(project.project_id, first, successfulResult("READY"));

  const changedRequest = requestPayload();
  changedRequest.width.value = 52;
  const changedResult = successfulResult();
  changedResult.axes.width.selected_candidate.working_count = 104;
  const second = calculatedProjects.createStructuredInput({
    projectIntent: intent,
    request: changedRequest,
    result: changedResult,
  });
  await repo.addCalculation(project.project_id, second, changedResult);

  const projects = await repo.listProjects({ section: "active" });
  const aggregate = await repo.getProject(project.project_id);
  const restored = calculatedProjects.inspectAggregate(aggregate);

  assert.equal(projects.length, 1);
  assert.equal(projects[0].project_id, project.project_id);
  assert.equal(aggregate.calculations.length, 2);
  assert.equal(restored.result.axes.width.selected_candidate.working_count, 104);
  assert.equal(restored.structured.target_width.value, 52);
});

test("blocked and erroneous calculations cannot be structured for saving", () => {
  for (const status of ["IMPOSSIBLE", "INPUT_ERROR", "CONFIRMATION_REQUIRED"]) {
    assert.throws(
      () =>
        calculatedProjects.createStructuredInput({
          projectIntent: projectIntent(),
          request: requestPayload(),
          result: { status },
        }),
      /Only a successful calculation/,
    );
  }
});

test("projects remain sorted by most recent modification", async () => {
  const repo = repository();
  const older = await repo.createProject({ title: "Старый" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const newer = await repo.createProject({ title: "Новый" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await repo.updateProject(older.project_id, { notes: "обновлён" });

  const projects = await repo.listProjects({ section: "active" });

  assert.deepEqual(
    projects.map((project) => project.project_id),
    [older.project_id, newer.project_id],
  );
});

test("damaged and unsupported saved records are handled without exceptions", () => {
  const damaged = calculatedProjects.inspectAggregate({
    project: {
      schema_version: 1,
      project_id: "project",
      active_calculation_id: "calculation",
    },
    calculations: [
      {
        calculation_id: "calculation",
        request: {
          schema_version: 1,
          kind: "CALCULATED_PROJECT",
          project_intent: { schemaVersion: 1 },
          calculation_input: {},
          swatch: { measurements: "damaged" },
        },
        result: successfulResult(),
      },
    ],
  });
  const unsupportedProject = calculatedProjects.inspectAggregate({
    project: { schema_version: 99 },
    calculations: [],
  });
  const unsupportedCalculation = calculatedProjects.inspectAggregate({
    project: {
      schema_version: 1,
      active_calculation_id: "calculation",
    },
    calculations: [
      {
        calculation_id: "calculation",
        request: {
          schema_version: 99,
          kind: "CALCULATED_PROJECT",
        },
        result: successfulResult(),
      },
    ],
  });

  assert.equal(damaged.state, "invalid");
  assert.match(damaged.message, /повреждены/);
  assert.equal(unsupportedProject.state, "unsupported");
  assert.equal(unsupportedCalculation.state, "unsupported");
  assert.match(unsupportedCalculation.message, /не поддерживается/);
});

test("ProjectIntent handoff preserves three swatch measurements", () => {
  const storage = new Map();
  const adapter = {
    getItem(key) {
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      storage.set(key, value);
    },
  };
  const href = calculatedProjects.prepareCalculatorHandoff(
    "/calculator?width-value=50",
    projectIntent(),
    adapter,
  );
  const restored = calculatedProjects.readCalculatorHandoff(
    new URL(href, "https://yarnai.test").search,
    adapter,
  );

  assert.match(href, /project-intent=session/);
  assert.deepEqual(restored, projectIntent());
  assert.equal(restored.gauge.measurements.length, 3);
});
