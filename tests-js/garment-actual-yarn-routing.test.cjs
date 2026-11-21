"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { webcrypto } = require("node:crypto");
const controller = fs.readFileSync(require.resolve("../src/yarnai/static/garment-actual-yarn-assistant.js"), "utf8");

async function load(mode) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { hidden: true, disabled: false, dataset: {}, value: "", textContent: "", handlers: {},
      addEventListener(name, handler) { this.handlers[name] = handler; },
      setAttribute() {}, replaceChildren() {}, append() {}, querySelectorAll() { return []; }, focus() { this.focused = true; }, scrollIntoView() {} });
    return elements.get(id);
  }
  let writes = 0;
  const variant = { metersPer100g: { min: 160, max: 200 } };
  const result = { flow: { route: "already_have", confirmedActualYarn: mode === "confirmed" ? { upstream: {} } : null },
    recommendation: { artifact: { thinnerAlternative: variant, recommendedMiddle: variant, thickerAlternative: variant } },
    intake: { aggregate: { operations: [], progress: [] }, calculation: { calculation_id: "calculation:test" }, artifact: { yarn: { selectionStatus: "selected" } } } };
  const sandbox = { document: { getElementById: element, createElement: element }, URLSearchParams, TextEncoder, crypto: webcrypto,
    location: { search: "?project=test" }, __YARNAI_MANUAL_INTAKE__: {},
    YarnAIProjectSystem: { isUuidv7: () => true, ProjectRepository: class { async initialize() {} async listProjects() { return []; } } },
    YarnAIManualCalculationIntake: {}, YarnAIManualIntakeValidation: {},
    YarnAIGarmentActualYarn: { ROUTES: { NOT_SELECTED: "not_selected", ALREADY_HAVE: "already_have", HELP_CHOOSE: "help_choose" },
      async inspectForProject() {
        if (mode === "missing") throw Object.assign(new Error(), { code: "ACTUAL_YARN_RECOMMENDATION_REQUIRED" });
        if (mode === "corrupt") throw Object.assign(new Error(), { code: "CORRUPT", userMessage: "Повреждение данных" });
        return result;
      }, async selectRouteForProject() { writes++; throw new Error("Unexpected write"); }
    } };
  vm.runInNewContext(controller, sandbox);
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  return { element, writes: () => writes };
}

test("missing recommendation leaves factual intake usable without fabricating comparison or writing a route", async () => {
  const ui = await load("missing");
  assert.equal(ui.element("intake-form").hidden, false);
  assert.match(ui.element("yarn-route-status").textContent, /сходство.*не оценены/);
  ui.element("choose-existing-yarn").handlers.click();
  assert.equal(ui.element("yarn-status").value, "selected");
  assert.equal(ui.element("yarn-name").focused, true);
  ui.element("choose-recommended-yarn").handlers.click();
  assert.equal(ui.element("yarn-recommendation-panel").hidden, false);
  assert.equal(ui.writes(), 0);
});
test("confirmed actual yarn reveals measurements; candidate alone does not", async () => {
  assert.equal((await load("confirmed")).element("intake-form").hidden, false);
  assert.equal((await load("candidate")).element("intake-form").hidden, true);
});
test("supported polo preparation guide opens without inventing a yarn choice or persisting a route", async () => {
  const ui = await load("missing");
  ui.element("polo-preparation-guide").hidden = false;
  ui.element("choose-recommended-yarn").handlers.click();
  assert.equal(ui.element("polo-yarn-help").open, true);
  assert.equal(ui.element("yarn-recommendation-panel").hidden, true);
  assert.equal(ui.element("intake-form").hidden, false);
  assert.equal(ui.writes(), 0);
});
test("an integrity failure must not be treated as an absent recommendation", async () => {
  const ui = await load("corrupt");
  assert.equal(ui.element("intake-form").hidden, true);
  assert.equal(ui.element("form-error").textContent, "Повреждение данных");
});
