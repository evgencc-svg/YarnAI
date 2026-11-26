"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const workspace = require("../src/yarnai/static/user-workspace-entry.js");
const stageChain = require("./stage60-to-65-saved-chain.cjs");
const stage66Chain = require("./stage60-to-66-saved-chain.cjs");
const firstStepDomain = require("../src/yarnai/static/project-execution-first-step.js");
const firstStepWorkspace = require("../src/yarnai/static/project-execution-first-step-workspace.js");
const nextStepWorkspace = require("../src/yarnai/static/project-execution-next-step-workspace.js");
const clarificationWorkspace = require("../src/yarnai/static/project-execution-next-step-clarification-workspace.js");
const stage69Chain = require("./stage69-source-chain.cjs");

const PROJECT_ID = "019fc3ba-4100-71c3-b7f9-bd06e3bff304";
const ASSISTANT_SOURCE = fs.readFileSync(
  path.join(__dirname, "../src/yarnai/static/user-workspace-entry-assistant.js"),
  "utf8",
);

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.hidden = true;
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.classList = { add() {}, remove() {} };
    this.files = [];
    this.value = "";
    this.textContent = "";
    this.href = "";
    this.disabled = false;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this[name] = String(value);
  }

  removeAttribute(name) {
    delete this[name];
  }

  focus() {}
  reset() {}
  scrollIntoView() {}
  querySelector() { return new FakeElement(); }
}

function fakeDocument() {
  const elements = new Map();
  return {
    body: new FakeElement("body"),
    title: "",
    activeElement: new FakeElement(),
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new FakeElement());
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
    createElement(tagName) { return new FakeElement(tagName); },
    elements,
  };
}

function projectRecord() {
  return {
    project_id: PROJECT_ID,
    title: "Stage 63 fixture",
    revision: 1,
    workspace_status: "ACTIVE",
    draft_input: {
      project_intent: {
        garmentType: "cardigan",
        sampleKnown: true,
        gaugeKnown: true,
        gauge: { stitches: 20, rows: 28, widthCm: 10, heightCm: 10 },
      },
    },
  };
}

function initializedRecord() {
  return {
    lifecycle: "initialized",
    identity: "initialization-one",
    integrity: { quarantined: false, collision: false, importedUnproven: false },
    snapshot: {
      garment: {
        type: "Cardigan",
        sizeMode: "standard",
        standardSize: "M",
        recipient: "self",
        fit: "regular",
      },
      measurements: { body: {}, garment: {} },
      assumptions: [],
      warnings: [],
    },
  };
}

function aggregate() {
  return {
    project: projectRecord(),
    progress: [],
    calculations: [],
    photos: [],
  };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function executeAssistant(pathname, repository, overrides = {}) {
  const document = fakeDocument();
  const assigned = [];
  const windowListeners = {};
  const location = {
    pathname,
    origin: "http://localhost",
    href: `http://localhost${pathname}?project=${PROJECT_ID}`,
    hash: "",
    assign(value) { assigned.push(value); },
  };
  const context = {
    Blob,
    URL,
    console,
    document,
    location,
    setTimeout,
    clearTimeout,
    addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); },
    requestAnimationFrame(callback) { callback(); },
    YarnAIProjectSystem: {
      ProjectRepository: class { constructor() { return repository; } },
      isUuidv7(value) { return value === PROJECT_ID; },
    },
    YarnAIUserWorkspaceEntry: workspace,
    YarnAIProjectExecutionPlanWorkspace: stageChain.planWorkspace,
    YarnAIProjectExecutionPlan: stageChain.planDomain,
    YarnAIProjectCalculationEntry: stageChain.calculationDomain,
    YarnAIProjectInitialization: stageChain.initializationDomain,
    YarnAISwatchGauge: stageChain.gaugeDomain,
    YarnAIProjectDetailsExperience: stageChain.experience,
    YarnAIProjectReadiness: stageChain.readiness,
    ...overrides,
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(ASSISTANT_SOURCE, context, { filename: "user-workspace-entry-assistant.js" });
  return { assigned, context, document, location, windowListeners };
}

function stage69Overrides() {
  return {
    YarnAIProjectExecutionStartWorkspace: stage66Chain.startWorkspace,
    YarnAIProjectExecutionStart: stage69Chain.stage66Domain,
    YarnAIProjectExecutionFirstStepWorkspace: firstStepWorkspace,
    YarnAIProjectExecutionFirstStep: stage69Chain.stage67Domain,
    YarnAIProjectExecutionNextStepWorkspace: nextStepWorkspace,
    YarnAIProjectExecutionNextStep: stage69Chain.stage68Domain,
    YarnAIProjectExecutionNextStepClarificationWorkspace: clarificationWorkspace,
    YarnAIProjectExecutionNextStepClarification: stage69Chain.stage69Domain,
  };
}

function completedStage69Aggregate() {
  const source = stage69Chain.build();
  const assessment = stage69Chain.stage69Domain.assessSource(source.input);
  const snapshot = stage69Chain.stage69Domain.createCompletedSnapshot(assessment, { foundationType: "ribbing", foundationHeight: 5 }, { createdAt: stage69Chain.TIMES[6], confirmedAt: stage69Chain.TIMES[6], explicitConfirmation: true, operationId: stage69Chain.OPS[5] });
  source.aggregate.progress.push({ progress_id: "stage69-navigation-progress", project_id: PROJECT_ID, calculation_id: source.calculationId, kind: stage69Chain.stage69Domain.KIND, revision: 1, state: stage69Chain.stage69Domain.createProgressState(snapshot), updated_at: stage69Chain.TIMES[6] });
  return source.aggregate;
}

function descendants(element) {
  return element.children.flatMap(child => [child, ...descendants(child)]);
}

function continuation(card) {
  const links = descendants(card).filter(el => el.className === "saved-project-continue");
  assert.equal(links.length, 1);
  assert.equal(links[0].tagName, "A");
  return links[0];
}

function descendantText(element) {
  return [element?.textContent || "", ...(element?.children || []).flatMap(descendantText)].join(" ");
}

test("the real /saved-projects DOM handler renders the Stage 64 destination", async () => {
  const seen = [];
  const repository = {
    async initialize() {},
    async listProjects() { return [projectRecord()]; },
    async getProject(projectId) { seen.push(projectId); return aggregate(); },
    async close() {},
  };

  const page = executeAssistant("/saved-projects", repository);
  await nextTurn();
  await nextTurn();

  const list = page.document.elements.get("#saved-projects-list");
  const card = list.children[0];
  const link = continuation(card);
  assert.deepEqual(seen, [PROJECT_ID]);
  assert.equal(link.href, `/project-calculation-entry?project=${PROJECT_ID}`);
  assert.equal(link.href.includes("/calculator"), false);
});

test("the real /saved-projects DOM handler renders the Stage 65 destination", async () => {
  const value = stageChain.savedChain();
  const repository = { async initialize() {}, async listProjects() { return [value.project]; }, async getProject() { return value; }, async close() {} };
  const page = executeAssistant("/saved-projects", repository);
  await nextTurn(); await nextTurn();
  const card = page.document.elements.get("#saved-projects-list").children[0];
  const link = continuation(card);
  assert.equal(link.href, `/project-execution-plan?project=${PROJECT_ID}`);
  assert.equal(link.href.includes("/calculator"), false);
  assert.equal(card.children[0].children[0].textContent, "Проект: свитер");
  assert.equal(card.children[0].children[1].textContent.includes("Stage 63"), false);
  assert.equal(card.children[0].children[1].textContent.includes("Можно подготовить план работы"), true);
});

test("the real /saved-projects handler uses the Stage 65 recovery decision", async () => {
  const value = stageChain.savedChain();
  value.calculations[0].request.project_calculation_entry.fingerprint = "fnv1a32:rejected";
  const repository = { async initialize() {}, async listProjects() { return [value.project]; }, async getProject() { return value; }, async close() {} };
  const page = executeAssistant("/saved-projects", repository);
  await nextTurn(); await nextTurn();
  const card = page.document.elements.get("#saved-projects-list").children[0];
  const link = continuation(card);
  assert.equal(link.href, `/project-calculation-entry?project=${PROJECT_ID}`);
  assert.equal(link.textContent, "Проверить начальный расчёт");
  assert.equal(card.children[0].children[1].textContent.includes("Нужно проверить исходные данные плана"), true);
});

test("the real /saved-projects handler opens Stage 67 for a started project", async () => {
  const value = stage66Chain.withCompletedPlan();
  const started = stage66Chain.startedSnapshot(value);
  const calculationId = value.project.active_calculation_id;
  value.progress.push({
    progress_id: "stage66-progress-record",
    project_id: PROJECT_ID,
    calculation_id: calculationId,
    kind: stage66Chain.startDomain.PROGRESS_KIND,
    state: stage66Chain.startDomain.createProgressState(started, calculationId),
    revision: 1,
    created_at: stage66Chain.START_AT,
    updated_at: stage66Chain.START_AT,
  });
  const repository = { async initialize() {}, async listProjects() { return [value.project]; }, async getProject() { return value; }, async close() {} };
  const page = executeAssistant("/saved-projects", repository, {
    YarnAIProjectExecutionStartWorkspace: stage66Chain.startWorkspace,
    YarnAIProjectExecutionStart: stage66Chain.startDomain,
    YarnAIProjectExecutionFirstStepWorkspace: firstStepWorkspace,
    YarnAIProjectExecutionFirstStep: firstStepDomain,
  });
  await nextTurn(); await nextTurn();
  const card = page.document.elements.get("#saved-projects-list").children[0];
  const link = continuation(card);
  assert.equal(link.href, `/project-execution-first-step?project=${PROJECT_ID}`);
  assert.equal(link.href.includes("/pattern-execution-session"), false);
});

test("the real /saved-projects handler offers clarification before confirmation", async () => {
  const source = stage69Chain.build();
  const repository = { async initialize() {}, async listProjects() { return [source.aggregate.project]; }, async getProject() { return source.aggregate; }, async close() {} };
  const page = executeAssistant("/saved-projects", repository, stage69Overrides());
  await nextTurn(); await nextTurn();
  const listCard = page.document.elements.get("#saved-projects-list").children[0];
  const link = continuation(listCard);
  assert.equal(link.tagName, "A");
  assert.equal(link.textContent, "Уточнить следующий шаг");
  assert.equal(link.href, `/project-execution-next-step-clarification?project=${PROJECT_ID}`);
});

test("completed clarification renders both cards terminal without a focusable CTA and survives pageshow", async () => {
  const aggregate = completedStage69Aggregate();
  const repository = { async initialize() {}, async listProjects() { return [aggregate.project]; }, async getProject() { return aggregate; }, async close() {} };
  const page = executeAssistant("/saved-projects", repository, stage69Overrides());
  await nextTurn(); await nextTurn();

  function assertTerminalCards() {
    const cards = [
      page.document.elements.get("#saved-projects-list").children[0],
      page.document.elements.get("#latest-project").children[0],
    ];
    assert.equal(cards.length, 2);
    for (const card of cards) {
      assert.equal(descendants(card).filter(el => el.dataset.fullProjectBackup === PROJECT_ID).length, 1);
      assert.equal(descendants(card).some(child => child.tagName === "A"), false);
      assert.match(descendantText(card), /Следующий шаг подготовлен/);
      assert.match(descendantText(card), /Связать резинку высотой 5 см/);
      assert.doesNotMatch(descendantText(card), /Уточнить следующий шаг/);
      assert.equal(descendantText(card).includes("Stage 69"), false);
    }
  }

  assertTerminalCards();
  await page.windowListeners.pageshow[0]({ persisted: true });
  await nextTurn(); await nextTurn();
  assertTerminalCards();
});

test("/user-workspace-entry has no primary continuation after completed clarification", async () => {
  const aggregate = completedStage69Aggregate();
  const repository = { async initialize() {}, async getProject() { return aggregate; }, async listPatternFiles() { return []; }, async close() {} };
  const page = executeAssistant("/user-workspace-entry", repository, stage69Overrides());
  await nextTurn(); await nextTurn(); await nextTurn();
  const primary = page.document.elements.get("#workspace-primary-action");
  assert.equal(primary.hidden, true);
  assert.equal(primary.disabled, true);
  assert.equal(primary.href, "");
  assert.equal(page.document.elements.get("#workspace-next-action-title").textContent, "Следующий шаг подготовлен");
  assert.equal(page.document.elements.get("#workspace-next-action-copy").textContent, "Связать резинку высотой 5 см");
});

test("the real /user-workspace-entry handler keeps the UUID and opens Stage 64", async () => {
  const seen = [];
  const initialization = initializedRecord();
  const repository = {
    async initialize() {},
    async getProject(projectId) { seen.push(projectId); return aggregate(); },
    async listPatternFiles() { return []; },
    async close() {},
  };
  const experience = {
    contextFromAggregate(value) {
      return {
        project: value.project,
        intent: value.project.draft_input.project_intent,
        details: {},
        technology: null,
        relevantProgress: [],
        collaborationState: {},
        closureHistory: null,
      };
    },
    applyDetailsToIntent(intent) { return intent; },
    progressSafety() { return { safe: true }; },
    readinessPresentation() {
      return {
        action: {
          enabled: true,
          href: `/project-calculation-entry?project=${PROJECT_ID}`,
          label: "Continue",
          description: "Stage 64",
        },
      };
    },
  };
  const page = executeAssistant("/user-workspace-entry", repository, {
    YarnAIProjectInitialization: {
      HISTORY_KEY: "project_initializations",
      ProjectInitializationError: class extends Error {},
      assessInitialization() {
        return { verdict: "ready", current: true, canContinue: true, existing: initialization, reasons: [] };
      },
      latestInitialization() { return initialization; },
    },
    YarnAIProjectDetailsExperience: experience,
    YarnAIProjectReadiness: { evaluateProjectReadiness() { return { status: "ready_for_calculation" }; } },
  });

  await nextTurn();
  await nextTurn();
  const primary = page.document.elements.get("#workspace-primary-action");
  await primary.listeners.click();
  await nextTurn();
  await nextTurn();

  assert.deepEqual(seen, [PROJECT_ID, PROJECT_ID]);
  assert.deepEqual(page.assigned, [`/project-calculation-entry?project=${PROJECT_ID}`]);
  assert.equal(page.document.elements.get("#project-workspace-missing").hidden, true);
});
