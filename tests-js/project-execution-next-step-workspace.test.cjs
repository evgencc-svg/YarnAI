"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const workspace = require("../src/yarnai/static/project-execution-next-step-workspace.js");

test("01 user timestamps are localized without ISO transport syntax", () => {
  const value = workspace.formatUserTimestamp("2026-08-04T08:09:10.123Z", { locale: "ru-RU", timeZone: "Europe/Warsaw" });
  assert.match(value, /04\.08\.2026/);
  assert.doesNotMatch(value, /T|Z|:\d{2}[.,]\d{3}/);
});

test("02 presentation mapping does not use the project title as a step title", () => {
  assert.equal(workspace.userFacingStepTitle({ type: "FOUNDATION_SECTION" }), "Начальный участок");
});

test("03 browser lifecycle, accessibility and timestamp regression contracts", () => {
  const root = path.join(__dirname, "../src/yarnai/static");
  const html = fs.readFileSync(path.join(root, "project-execution-next-step.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "project-execution-next-step-workspace.js"), "utf8");
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="alert"[^>]*tabindex="-1"/);
  assert.match(source, /addEventListener\("pageshow", handlePageShow\)/);
  assert.match(source, /ui\.blocked\.focus\(\)/);
  assert.doesNotMatch(source, /textContent\s*=\s*snapshot\.timestamps\./);
});

test("04 Stage 68 has no inline scripts and boots from an external assistant", () => {
  const root = path.join(__dirname, "../src/yarnai/static");
  const html = fs.readFileSync(path.join(root, "project-execution-next-step.html"), "utf8");
  const assistant = fs.readFileSync(path.join(root, "project-execution-next-step-assistant.js"), "utf8");
  const workspaceSource = fs.readFileSync(path.join(root, "project-execution-next-step-workspace.js"), "utf8");
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.ok(scriptTags.length > 0);
  for (const scriptTag of scriptTags) {
    assert.match(scriptTag[1], /\bsrc\s*=/i);
    assert.equal(scriptTag[2].trim(), "");
  }
  assert.match(html, /project-execution-next-step-assistant\.js/);
  assert.match(assistant, /addEventListener\("DOMContentLoaded", startController/);
  assert.match(assistant, /createController/);
  assert.match(workspaceSource, /addEventListener\("pageshow", handlePageShow\)/);
});

test("05 route and asset names are exact", () => {
  const root = path.join(__dirname, "../src/yarnai/static");
  const html = fs.readFileSync(path.join(root, "project-execution-next-step.html"), "utf8");
  for (const asset of ["project-execution-next-step.css", "project-execution-next-step.js", "project-execution-next-step-workspace.js", "project-execution-next-step-assistant.js"]) assert.match(html, new RegExp(asset.replaceAll(".", "\\.")));
  assert.match(html, /Мои проекты/);
});
