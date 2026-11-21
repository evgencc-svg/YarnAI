"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
global.BroadcastChannel = undefined;
if (typeof global.CustomEvent === "undefined") {
  global.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type, options);
      this.detail = options.detail;
    }
  };
}

const windowEvents = new EventTarget();
global.addEventListener = windowEvents.addEventListener.bind(windowEvents);
global.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
global.dispatchEvent = windowEvents.dispatchEvent.bind(windowEvents);

const gauge = require("../src/yarnai/static/swatch-gauge.js");
require("../src/yarnai/static/project-system.js");
const system = global.YarnAIProjectSystem;

class FakeElement extends EventTarget {
  constructor(options = {}) {
    super();
    this.id = options.id || "";
    this.name = options.name || "";
    this.type = options.type || "";
    this.value = options.value || "";
    this.checked = options.checked === true;
    this.hidden = options.hidden === true;
    this.disabled = options.disabled === true;
    this.textContent = options.textContent || "";
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.files = [];
    this.src = "";
    this.alt = "";
    this.href = "";
  }

  focus() { global.document.activeElement = this; }
  click() { this.dispatchEvent(new Event("click")); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  replaceChildren(...children) { this.children = children; }
}

function browserDocument() {
  const elements = new Map();
  const add = (id, options = {}) => {
    const element = new FakeElement({ id, ...options });
    elements.set(`#${id}`, element);
    return element;
  };

  const hidden = [
    "blocked-state", "ready-state", "project-image-wrap", "error-summary",
    "warning-summary", "assumption-summary", "warning-ack-wrap",
    "photo-preview-wrap", "confirmed-panel", "history-panel",
  ];
  [
    "loading-state", "blocked-state", "blocked-title", "blocked-message",
    "blocked-action", "ready-state", "workspace-back", "gauge-form",
    "project-context-title", "context-garment", "context-size",
    "context-recipient", "context-yarn", "context-tool", "context-technique",
    "project-image-wrap", "project-image", "swatch-status", "gauge-status",
    "stitches", "rows", "width", "height", "stitches-error", "rows-error",
    "width-error", "height-error", "stitch-result", "row-result",
    "error-summary", "error-list", "warning-summary", "warning-list",
    "assumption-summary", "assumption-list", "warning-ack-wrap", "warning-ack",
    "confirm-gauge", "save-status", "swatch-photo-input", "choose-photo",
    "replace-photo", "remove-photo", "photo-empty", "photo-preview-wrap",
    "photo-preview", "photo-name", "photo-status", "confirmed-panel",
    "confirmed-summary", "continue-workspace", "history-panel", "history-list",
  ].forEach((id) => add(id, { hidden: hidden.includes(id) }));

  const fields = {
    stitches: elements.get("#stitches"),
    rows: elements.get("#rows"),
    width: elements.get("#width"),
    height: elements.get("#height"),
  };
  Object.entries(fields).forEach(([name, field]) => {
    field.name = name;
    field.type = "number";
  });

  const preparationNames = [
    "knitted", "washed", "dry", "unstretched", "representative",
    "same-yarn", "same-tools", "same-pattern",
  ];
  const controls = new Map(Object.entries(fields));
  preparationNames.forEach((name) => {
    const control = new FakeElement({ name, type: "checkbox" });
    controls.set(name, control);
  });
  const centimeters = new FakeElement({ name: "unit", type: "radio", value: "cm", checked: true });
  const inches = new FakeElement({ name: "unit", type: "radio", value: "in" });
  const unitGroup = {
    get value() { return centimeters.checked ? "cm" : inches.checked ? "in" : ""; },
    set value(value) {
      centimeters.checked = value === "cm";
      inches.checked = value === "in";
    },
  };
  controls.set("unit", unitGroup);

  const form = elements.get("#gauge-form");
  form.elements = { namedItem: (name) => controls.get(name) || null };
  elements.get("#warning-ack").type = "checkbox";
  elements.get("#confirm-gauge").disabled = true;
  elements.get("#swatch-photo-input").type = "file";

  const unitLabels = [new FakeElement(), new FakeElement()];
  const document = {
    readyState: "loading",
    activeElement: null,
    title: "",
    querySelector: (selector) => elements.get(selector) || null,
    querySelectorAll: (selector) => selector === ".unit-label" ? unitLabels : [],
    createElement: () => new FakeElement(),
  };

  class FakeFormData {
    constructor(source) {
      assert.equal(source, form);
    }
    get(name) {
      const control = controls.get(name);
      if (!control) return null;
      if (control === unitGroup) return unitGroup.value || null;
      if (control.type === "checkbox") return control.checked ? "on" : null;
      return control.value;
    }
    has(name) { return this.get(name) !== null; }
  }

  return { document, elements, form, controls, FakeFormData };
}

function waitUntil(predicate, timeout = 1500) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const inspect = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeout) return reject(new Error("Timed out waiting for controller hydration."));
      setTimeout(inspect, 5);
    };
    inspect();
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test("reload hydrates warning acknowledgement after native form restoration and preserves one confirmed revision", async () => {
  const setupRepository = new system.ProjectRepository();
  await setupRepository.initialize();
  const created = await setupRepository.createProject({ title: "Stage 63 browser hydration" });
  const projectId = created.project_id;
  const source = gauge.buildSourceSnapshot({
    projectIdentity: projectId,
    initializationIdentity: "stage61-initialization",
    initializationFingerprint: "stage61-fingerprint",
    yarn: "меринос",
    tool: "спицы 4 мм",
    technique: "спицами",
    pattern: "лицевая гладь",
    recipient: "woman",
    size: "custom",
  });
  const measurement = {
    stitches: 20,
    rows: 28,
    width: 10,
    height: 10,
    unit: "cm",
    preparation: {
      knitted: true,
      washed: false,
      dry: true,
      unstretched: true,
      representative: true,
      sameYarn: true,
      sameTools: true,
      samePattern: true,
    },
    photoId: null,
  };
  const required = gauge.assessMeasurement(measurement).requiredAcknowledgements;
  assert.deepEqual(required, ["SWATCH_NOT_WASHED"]);
  const acknowledged = { ...measurement, acknowledgedWarningCodes: required };
  const confirmed = gauge.buildConfirmedRecord(acknowledged, {
    source,
    identity: system.uuidv7(),
    confirmedAt: "2026-08-03T10:00:00.000Z",
    createdBy: "Владелец проекта",
  });
  const history = gauge.appendHistory(null, confirmed);
  const draft = gauge.buildDraft(acknowledged, {
    source,
    updatedAt: "2026-08-03T10:00:00.000Z",
  });
  await setupRepository.updateProject(projectId, {
    draft_input: {
      project_intent: {
        garmentType: "свитер",
        yarn: "меринос",
        needles: "спицы 4 мм",
        technique: "спицами",
        mainPattern: "лицевая гладь",
      },
      [gauge.HISTORY_KEY]: history,
      [gauge.DRAFT_KEY]: draft,
    },
  });

  const dom = browserDocument();
  dom.document.readyState = "complete";
  const acknowledgement = dom.elements.get("#warning-ack");
  let acknowledgementChecked = acknowledgement.checked;
  let restoreUncheckedAfterFirstHydration = true;
  Object.defineProperty(acknowledgement, "checked", {
    configurable: true,
    get: () => acknowledgementChecked,
    set: (value) => {
      acknowledgementChecked = value === true;
      if (!acknowledgementChecked || !restoreUncheckedAfterFirstHydration) return;
      restoreUncheckedAfterFirstHydration = false;
      setTimeout(() => {
        acknowledgementChecked = false;
        dom.form.dispatchEvent(new Event("input"));
        dom.form.dispatchEvent(new Event("change"));
        dom.form.dispatchEvent(new Event("reset"));
      }, 0);
    },
  });
  global.document = dom.document;
  global.FormData = dom.FakeFormData;
  global.location = { pathname: "/swatch-assistant", search: `?project=${projectId}` };

  const initializationRecord = {
    identity: "stage61-initialization",
    lifecycle: "initialized",
    integrity: { recordFingerprint: "stage61-fingerprint" },
    snapshot: {
      garment: { type: "свитер", sizeMode: "custom", standardSize: null, recipient: "woman" },
    },
  };
  global.YarnAISwatchGauge = gauge;
  global.YarnAIUserWorkspaceEntry = {
    projectIdentityFromLocation: () => projectId,
  };
  global.YarnAIProjectInitialization = {
    HISTORY_KEY: "project_initializations",
    assessInitialization: () => ({
      verdict: "ready", current: true, canContinue: true,
      existing: initializationRecord, reasons: [],
    }),
    validateInitializationRecord: () => ({ valid: true, trusted: true, record: initializationRecord }),
  };
  global.YarnAIProjectDetailsExperience = {
    contextFromAggregate: (aggregate) => ({
      project: aggregate.project,
      intent: aggregate.project.draft_input.project_intent,
      details: {},
      technology: null,
      relevantProgress: [],
      collaborationState: {},
      closureHistory: null,
    }),
    applyDetailsToIntent: (intent) => structuredClone(intent),
    progressSafety: () => ({ safe: true }),
  };
  global.YarnAIProjectReadiness = { evaluateProjectReadiness: () => ({ status: "ready" }) };

  // Chrome can report readyState=complete before pageshow and restore native form
  // controls during/just after pageshow. Both unchecked states must lose to IndexedDB.
  global.addEventListener("pageshow", () => {
    dom.elements.get("#warning-ack").checked = false;
    dom.form.dispatchEvent(new Event("input"));
    dom.form.dispatchEvent(new Event("change"));
    dom.form.dispatchEvent(new Event("reset"));
    setTimeout(() => {
      dom.elements.get("#warning-ack").checked = false;
      dom.form.dispatchEvent(new Event("input"));
      dom.form.dispatchEvent(new Event("change"));
      dom.form.dispatchEvent(new Event("reset"));
    }, 0);
  }, { once: true });

  require("../src/yarnai/static/swatch-assistant-workspace.js");

  await delay(30);
  assert.equal(dom.elements.get("#ready-state").hidden, true);
  assert.equal(dom.elements.get("#warning-ack").checked, false);
  const beforePageShow = await setupRepository.getProject(projectId);
  const revisionBeforePageShow = beforePageShow.project.revision;
  const draftBeforePageShow = structuredClone(beforePageShow.project.draft_input[gauge.DRAFT_KEY]);
  assert.deepEqual(draftBeforePageShow.acknowledgedWarningCodes, ["SWATCH_NOT_WASHED"]);
  global.dispatchEvent(new Event("pageshow"));

  await waitUntil(() => dom.elements.get("#ready-state").hidden === false);
  await delay(450);

  assert.equal(dom.elements.get("#warning-ack").checked, true);
  assert.equal(dom.elements.get("#confirm-gauge").disabled, false);
  assert.equal(dom.elements.get("#stitch-result").textContent, "20");
  assert.equal(dom.elements.get("#row-result").textContent, "28");
  assert.equal(dom.elements.get("#save-status").textContent, "Черновик восстановлен.");
  assert.equal(dom.elements.get("#history-list").children.length, 1);
  assert.match(dom.elements.get("#confirmed-summary").textContent, /20.*28/);

  const reloaded = await setupRepository.getProject(projectId);
  const reloadedDraft = reloaded.project.draft_input[gauge.DRAFT_KEY];
  const reloadedHistory = gauge.normalizeHistory(reloaded.project.draft_input[gauge.HISTORY_KEY], { projectIdentity: projectId });
  assert.deepEqual(reloadedDraft, draftBeforePageShow);
  assert.equal(reloaded.project.revision, revisionBeforePageShow);
  assert.equal(reloadedHistory.records.length, 1);
  assert.equal(reloadedHistory.records[0].identity, confirmed.identity);
  assert.equal(reloadedHistory.records[0].snapshot.computed.stitchesPer10Cm, 20);
  assert.equal(reloadedHistory.records[0].snapshot.computed.rowsPer10Cm, 28);

  global.dispatchEvent(new Event("pagehide"));
  await delay(20);
  await setupRepository.close();
});