"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/yarnai/static/pattern-execution-export.js");

const formatters = {
  formatGauge: (value) => value?.length ? "20 петель × 26 рядов в 10 см" : "не указана",
  formatNeedles: (value) => value?.length ? "3,5 мм и 4,5 мм" : "не указаны",
  formatYarn: (value) => [value.composition, value.putUp, value.quantity ? `${value.quantity} мотков` : null].filter(Boolean).join(", "),
  formatNeedle: (value) => value?.value ? `${value.value} мм` : "по подтверждённому плану",
  formatRepeat: (value) => value?.group === "raglan" ? `Повтор реглана: ${value.ordinal} из ${value.total}` : null,
  formatMeasurement: (value, unit) => `${value} ${unit}`,
  formatKnittingText: (value) => String(value || "").replace("4.5 mm", "4,5 мм"),
};

function fixture(options = {}) {
  const count = options.count ?? 127;
  const phaseRanges = [[1, 5], [6, 46], [47, 61], [62, 65], [66, 93], [94, 121], [122, 124], [125, count]];
  const steps = Array.from({ length: count }, (_unused, index) => {
    const order = index + 1;
    return {
      id: `action:${order}`, stepId: `step:${order}`, sourceOperationIdentity: `operation:${order}`,
      order, globalOrder: order, title: `Шаг ${order}: Действие ${order}`,
      instruction: order === 1 ? "Набери петли на 4.5 mm и выполни M1." : `Выполни подтверждённое действие ${order}.`,
      activeStitchesBefore: order - 1, activeStitchesAfter: order,
      needles: { value: 4.5, unit: "mm" }, rowMode: order % 2 ? "round" : "row",
      repeat: order === 6 ? { group: "raglan", ordinal: 1, total: 20 } : null,
      criterion: order === 63 ? { type: "measurement", value: 30, unit: "cm" } : { type: "exact_state" },
    };
  });
  const phases = phaseRanges.filter(([start]) => start <= count).map(([start, end], index) => ({
    title: ["Набор и подготовка кокетки", "Реглан и глубина кокетки", "Немецкие укороченные ряды", "Разделение и корпус", "Правый рукав", "Левый рукав", "Резинка горловины", "Завершение изделия"][index],
    actions: steps.slice(start - 1, Math.min(end, count)),
  }));
  const plan = {
    summary: {
      craft: "вязание спицами", construction: "сверху вниз, по кругу", selectedSize: "ML",
      gauge: [{ stitches: 20, rows: 26, per: 10, unit: "cm" }], needles: ["3.5 mm", "4.5 mm"],
      yarn: { composition: "100% шерсть", putUp: "200 m / 100 g", quantity: 6 },
    },
    steps, phases,
    coverage: { exactOneToOne: true, userStepCount: count, sourceOperationCount: count },
  };
  const explanationInput = { evidence: { userAdaptationProfile: { yarn: options.unknownYarn ? {} : { composition: "100% шерсть", lengthOrWeight: [{ value: 200, unit: "m" }] } } } };
  const review = { immutableSourceSnapshot: { executableTechnologyPlanInput: explanationInput } };
  const executionPlan = { status: "ready", plan };
  const executionSession = {
    status: "waiting", started: false,
    execution: { actions: steps.map((step) => ({ stepId: step.stepId, status: "pending" })) },
    virtualDryRun: { status: "completed", completedStepIds: steps.map((step) => step.stepId), execution: { actions: steps } },
  };
  const reviewApi = {
    buildAdaptationExplanation(input) {
      assert.equal(input, explanationInput);
      return { changes: [{ title: "Плотность", before: "18 петель", after: "20 петель", why: "Stage 21 сохранил расчёт.", practical: "Числа связаны с планом." }] };
    },
  };
  return { project: { title: "Контроль Flax" }, review, executionPlan, executionSession, dependencies: { formatters, reviewApi } };
}

function visibleText(model) {
  return JSON.stringify({
    title: model.title, purpose: model.purpose, beforeStart: model.beforeStart, changes: model.changes,
    sections: model.sections, glossary: model.glossary, statuses: model.statuses, legalNotice: model.legalNotice,
  });
}

test("export model uses only confirmed Stage 21 explanation and ready Stage 22 plan", () => {
  const input = fixture();
  const model = api.buildExportModel(input, input.dependencies);
  assert.equal(model.title, "Контроль Flax");
  assert.equal(model.changes[0].why, "принятый расчёт адаптации сохранил расчёт.");
  assert.equal(model.stepCount, 127);
});

test("all 127 steps keep exact count, order, numbering and one-to-one source coverage", () => {
  const input = fixture();
  const model = api.buildExportModel(input, input.dependencies);
  const exported = model.sections.flatMap((section) => section.steps);
  assert.equal(exported.length, 127);
  assert.deepEqual(exported.map((step) => step.number), Array.from({ length: 127 }, (_unused, index) => index + 1));
  assert.equal(new Set(exported.map((step) => step.number)).size, 127);
  for (const number of [1, 2, 63, 64, 126, 127]) assert.equal(exported[number - 1].number, number);
});

test("unknown yarn is omitted instead of inheriting a default quantity", () => {
  const input = fixture({ unknownYarn: true });
  const model = api.buildExportModel(input, input.dependencies);
  assert.equal(model.beforeStart.some((entry) => entry.label === "Пряжа и материалы"), false);
  assert.equal(visibleText(model).includes("6 мотков"), false);
});

test("visible export contains no UUID, revision, fingerprint, raw key or source identity", () => {
  const input = fixture();
  input.project.project_id = "01a04c4a-769d-7cc8-9d3a-bc8fcbbda06b";
  input.executionPlan.revision = 36;
  input.executionPlan.planFingerprint = "fnv1a32:c065298e";
  const rendered = visibleText(api.buildExportModel(input, input.dependencies));
  for (const forbidden of ["01a04c4a", "revision", "fingerprint", "sourceOperationIdentity", "stepId", "raw key", "Stage 21", "Stage 22"]) assert.equal(rendered.includes(forbidden), false, forbidden);
});

test("physical 0/127 and completed virtual 127/127 are stated honestly", () => {
  const input = fixture();
  const status = api.buildExportModel(input, input.dependencies).statuses;
  assert.equal(status.virtual, "Виртуальная проверка плана завершена: 127 из 127 шагов.");
  assert.equal(status.physical, "Физическое вязание этого экземпляра ещё не начато и не проверено.");
  assert.equal(status.physicalCompleted, 0);
});

test("missing, stale and invalid plans fail closed before export", () => {
  const input = fixture();
  input.executionPlan.plan.steps[4] = structuredClone(input.executionPlan.plan.steps[3]);
  assert.throws(() => api.buildExportModel(input, input.dependencies), { code: "EXPORT_STEP_ORDER_MISMATCH" });

  const blocked = api.inspectAggregate({}, {
    planApi: { inspectAggregate: () => ({ state: "stale", project: { title: "x" }, executionPlan: { status: "stale" } }) },
    sessionApi: { inspectAggregate: () => ({ state: "waiting" }) },
  });
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.code, "EXPORT_PLAN_STALE");
});

test("print model explains known abbreviation without changing step text", () => {
  const input = fixture();
  const model = api.buildExportModel(input, input.dependencies);
  assert.equal(model.glossary[0].abbreviation, "M1");
  assert.match(model.sections[0].steps[0].instruction, /M1/);
});

test("technical causal-trace wording is rendered in ordinary Russian", () => {
  const input = fixture();
  input.dependencies.reviewApi.buildAdaptationExplanation = () => ({ changes: [{
    title: "Распределение", before: "102 петли", after: "140 петель",
    why: "Stage 21 сохранил quotient/remainder-распределение.",
    practical: "Это одно исполнимое действие Stage 22.",
  }] });
  const change = api.buildExportModel(input, input.dependencies).changes[0];
  assert.equal(change.why, "В подтверждённой адаптации сохранено точное распределение с остатком.");
  assert.equal(change.practical, "Это одно действие готового плана.");
});
