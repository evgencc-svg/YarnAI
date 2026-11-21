"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildLatestProjectPresentation,
  buildPrimaryActionModel,
  buildWorkspaceViewModel,
} = require("../src/yarnai/static/user-workspace-entry.js");

function project(id = "one", changes = {}) {
  return {
    project_id: id,
    title: `Проект ${id}`,
    revision: 1,
    workspace_status: "ACTIVE",
    ...changes,
  };
}

function progress(kind, changes = {}) {
  return { project_id: "one", kind, state: {}, ...changes };
}

test("primary action presents the product promise and one repository destination", () => {
  assert.deepEqual(buildPrimaryActionModel(), {
    eyebrow: "Новая вещь",
    title: "Хочу связать вот это",
    description: "Фото, схема, PDF или обычное описание",
    actionId: "create-project",
    actionLabel: "Начать новый проект",
    destination: "/import-pattern",
  });
});

test("latest project has a calm user-facing presentation", () => {
  const model = buildWorkspaceViewModel(
    [project("one", { title: "Тёплый кардиган", garment_type: "Кардиган" })],
    [progress("PATTERN_ANALYSIS")],
  );
  assert.deepEqual(model.latestPresentation, {
    available: true,
    heading: "Продолжить работу",
    title: "Тёплый кардиган",
    description: "Кардиган · Нужно проверить разбор",
    action: { label: "Проверить разбор", href: "/pattern-analysis?project=one" },
  });
});

test("saved semantic review reopens through the product analysis screen", () => {
  const model = buildWorkspaceViewModel(
    [project("one", { title: "Flax" })],
    [progress("PATTERN_SEMANTIC_ANALYSIS"), progress("PATTERN_ANALYSIS_REVIEW")],
  );
  assert.deepEqual(model.latestProject.action, {
    label: "Проверить разбор",
    href: "/pattern-analysis?project=one",
    canContinue: true,
  });
});

test("technical progress names never leak into visible copy", () => {
  const model = buildWorkspaceViewModel([project()], [progress("PATTERN_CONTENT_EXTRACTION")]);
  const visible = JSON.stringify(model);
  for (const token of ["PATTERN_", "lifecycle", "imported-unproven", "quarantine", "stale"]) {
    assert.equal(visible.includes(token), false, token);
  }
});

test("continue actions use contextual labels", () => {
  const cases = [
    ["PATTERN_IMPORT", "Загрузить материалы"],
    ["PATTERN_ANALYSIS_REVIEW", "Проверить разбор"],
    ["PATTERN_TECHNOLOGY_REVIEW", "Начать вязание"],
    ["FIRST_KNITTING_STEP", "Вернуться к шагу"],
  ];
  for (const [kind, label] of cases) {
    assert.equal(buildWorkspaceViewModel([project()], [progress(kind)]).latestProject.action.label, label);
  }
});

test("empty state is intentional and shares the create action", () => {
  const model = buildWorkspaceViewModel([], []);
  assert.equal(model.empty, true);
  assert.equal(model.emptyState.title, "Здесь появятся твои проекты");
  assert.equal(model.emptyState.actionId, model.primaryAction.actionId);
});

test("long project titles are preserved for wrapping by the UI", () => {
  const title = "Очень длинное название проекта ".repeat(12).trim();
  const model = buildWorkspaceViewModel([project("one", { title })], []);
  assert.equal(model.projects[0].title, title);
  assert.equal(model.latestPresentation.title, title);
});

test("unknown progress falls back to opening the project", () => {
  const model = buildWorkspaceViewModel([project()], [progress("UNKNOWN_STATE")]);
  assert.equal(model.projects[0].state, "Открыть проект");
  assert.equal(model.projects[0].action.label, "Открыть проект");
  assert.equal(model.latestProject, null);
});

test("corrupted progress fails closed", () => {
  const model = buildWorkspaceViewModel([project()], [progress("PATTERN_ANALYSIS", { state: "broken" })]);
  assert.equal(model.projects[0].action.label, "Открыть проект");
  assert.equal(model.projects[0].canContinue, false);
});

test("presentation is stable across repeated calls", () => {
  const projects = [project("one", { updated_at: "2026-01-01T00:00:00Z" })];
  const records = [progress("PATTERN_IMPORT")];
  assert.deepEqual(buildWorkspaceViewModel(projects, records), buildWorkspaceViewModel(projects, records));
});

test("presentation does not mutate inputs", () => {
  const projects = [project("one", { project_intent: { garment_type: "Шапка" } })];
  const records = [progress("PATTERN_IMPORT", { state: { status: "collecting" } })];
  const before = JSON.stringify({ projects, records });
  buildWorkspaceViewModel(projects, records);
  assert.equal(JSON.stringify({ projects, records }), before);
});

test("production presentation has no clock or random dependency", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/user-workspace-entry.js"), "utf8");
  for (const token of ["Math.random", "Date.now", "new Date", "crypto.randomUUID"]) {
    assert.equal(source.includes(token), false, token);
  }
});

test("the visual stage does not introduce a future stage", () => {
  const names = [
    "first-user-flow.html",
    "first-user-flow.css",
    "user-workspace-entry.js",
    "user-workspace-entry-assistant.js",
  ];
  const source = names.map((name) => fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8")).join("\n");
  assert.doesNotMatch(source, /stage\s*55/i);
});

test("the home and empty states preserve both explicit controller intents", () => {
  const html = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/first-user-flow.html"), "utf8");
  assert.equal((html.match(/data-create-destination="\/import-pattern\?intent=pattern_source"/g) || []).length, 2);
  assert.equal((html.match(/data-create-destination="\/import-pattern\?intent=garment_reference"/g) || []).length, 2);
});

test("the home screen names each supported intent once and has no duplicate continue scenario", () => {
  const html = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/first-user-flow.html"), "utf8");
  assert.equal((html.match(/У меня есть готовая схема или PDF/g) || []).length, 1);
  assert.equal((html.match(/Связать похожую вещь по фото/g) || []).length, 1);
  assert.equal(html.includes("Продолжить существующий проект"), false);
});

test("incomplete latest-project data uses a safe calm fallback", () => {
  assert.deepEqual(buildLatestProjectPresentation({ title: "Без действия" }), {
    available: false,
    heading: "Продолжить работу",
    description: "Здесь появится проект, к которому можно быстро вернуться.",
    action: null,
  });
});
