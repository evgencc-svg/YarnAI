"use strict";
const assert = require("node:assert/strict"); const test = require("node:test");
const domain = require("../src/yarnai/static/project-construction-strategy-planning.js"); const workspace = require("../src/yarnai/static/project-construction-strategy-planning-workspace.js");
function node() { return { hidden: false, textContent: "", disabled: false, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, focus() {}, addEventListener() {} }; }
function ui() { return { root: node(), loading: node(), blocked: node(), blockedMessage: node(), content: node(), completedHeight: node(), stitchCount: node(), direction: node(), method: node(), derivation: node(), form: { ...node(), elements: { namedItem: () => ({ value: "" }) } }, strategyList: node(), strategyError: node(), save: node(), completed: node(), completedChoice: node(), completedNext: node(), error: node() }; }
test("ready workspace renders only assessment strategies and completed state exposes no execution action", () => {
  const controls = ui(); const controller = workspace.createController({ domain, system: {}, ui: controls, document: {}, globalObject: {} }); const assessment = { knownInputs: { primaryFabricHeightCm: 30, stitchCount: 100 }, derivations: { armholeStartCm: 41, currentHeightCm: 30 }, availableStrategies: domain.STRATEGY_CATALOG };
  controller.renderReady(assessment); assert.equal(controls.form.hidden, false); assert.match(controls.derivation.textContent, /41/);
  const snapshot = { ...assessment, clarification: { strategyIdentity: domain.STRATEGY_CATALOG[2].identity, value: domain.STRATEGY_CATALOG[2].value } }; controller.renderCompleted(snapshot); assert.equal(controls.form.hidden, true); assert.equal(controls.completedChoice.textContent, domain.STRATEGY_CATALOG[2].label); assert.match(controls.completedNext.textContent, /политика формирования/); assert.equal(Object.prototype.hasOwnProperty.call(controls, "executionAction"), false);
});
