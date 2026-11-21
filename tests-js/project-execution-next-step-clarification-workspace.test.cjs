"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const fixture = require("./stage69-source-chain.cjs");
const workspace = require("../src/yarnai/static/project-execution-next-step-clarification-workspace.js");

function options(aggregate) {
  return { aggregate, projectId: fixture.PROJECT_ID, domain: fixture.stage69Domain, stage65Domain: fixture.planDomain, stage66Domain: fixture.stage66Domain, stage67Domain: fixture.stage67Domain, stage68Domain: fixture.stage68Domain };
}

function completedSource() {
  const source = fixture.build();
  const assessment = fixture.stage69Domain.assessSource(source.input);
  const snapshot = fixture.stage69Domain.createCompletedSnapshot(assessment, { foundationType: "ribbing", foundationHeight: 5 }, { createdAt: fixture.TIMES[6], confirmedAt: fixture.TIMES[6], explicitConfirmation: true, operationId: fixture.OPS[5] });
  source.aggregate.progress.push({ kind: fixture.stage69Domain.KIND, progress_id: "stage69-progress", project_id: fixture.PROJECT_ID, calculation_id: source.calculationId, revision: 1, state: fixture.stage69Domain.createProgressState(snapshot), updated_at: fixture.TIMES[6] });
  return { source, snapshot };
}

test("01 aggregate readiness is ready only with a valid Stage 68 conditional snapshot", () => {
  const source = fixture.build();
  const result = workspace.assessAggregateReadiness(options(source.aggregate));
  assert.equal(result.lifecycle, "ready");
  assert.deepEqual(result.assessment.missingInputs, ["foundation_type", "foundation_height"]);
  const tampered = fixture.build({ mutate({ stage68Record }) { stage68Record.state.snapshot.fingerprint = "fnv1a32:tampered"; } });
  assert.equal(workspace.assessAggregateReadiness(options(tampered.aggregate)).lifecycle, "blocked");
});

test("02 a completed snapshot wins on reload", () => {
  const { source, snapshot } = completedSource();
  const result = workspace.assessAggregateReadiness(options(source.aggregate));
  assert.equal(result.lifecycle, "completed");
  assert.equal(result.snapshot.fingerprint, snapshot.fingerprint);
});

test("06 completed continuation is terminal and exposes only a human summary", () => {
  const { source } = completedSource();
  const readiness = workspace.assessAggregateReadiness(options(source.aggregate));
  const projection = workspace.continuationProjection(readiness, fixture.stage69Domain);
  assert.deepEqual({ status: projection.status, title: projection.title, summary: projection.summary, action: projection.action, destination: projection.destination }, {
    status: "pending", title: "Следующий шаг подготовлен", summary: "Связать резинку высотой 5 см", action: null, destination: null,
  });
});

test("07 stale, conflicting, corrupted and foreign records fail closed", () => {
  for (const mutate of [
    (record) => { record.stale = true; },
    (record) => { record.revision = 2; },
    (record) => { record.state.snapshot.fingerprint = "fnv1a32:tampered"; },
    (record) => { record.project_id = "019fc4dd-5100-7001-8af9-bd06e3bf9999"; },
  ]) {
    const { source } = completedSource();
    const aggregate = JSON.parse(JSON.stringify(source.aggregate));
    mutate(aggregate.progress.at(-1));
    const result = workspace.assessAggregateReadiness(options(aggregate));
    assert.equal(result.lifecycle, "blocked");
    assert.equal(workspace.continuationProjection(result, fixture.stage69Domain).destination, null);
  }
  const { source } = completedSource();
  source.aggregate.progress.push(JSON.parse(JSON.stringify(source.aggregate.progress.at(-1))));
  assert.equal(workspace.assessAggregateReadiness(options(source.aggregate)).lifecycle, "blocked");
});

test("03 user timestamps are localized without transport syntax", () => {
  const value = workspace.formatUserTimestamp("2026-08-04T08:09:10.123Z", { locale: "ru-RU", timeZone: "Europe/Warsaw" });
  assert.match(value, /04\.08\.2026/);
  assert.doesNotMatch(value, /T|Z|:\d{2}[.,]\d{3}/);
});

test("04 HTML has accessible external bootstrap and no future action", () => {
  const root = path.join(__dirname, "../src/yarnai/static");
  const html = fs.readFileSync(path.join(root, "project-execution-next-step-clarification.html"), "utf8");
  const assistant = fs.readFileSync(path.join(root, "project-execution-next-step-clarification-assistant.js"), "utf8");
  const source = fs.readFileSync(path.join(root, "project-execution-next-step-clarification-workspace.js"), "utf8");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length);
  scripts.forEach((entry) => { assert.match(entry[1], /\bsrc\s*=/i); assert.equal(entry[2].trim(), ""); });
  assert.match(html, /role="alert"[^>]*tabindex="-1"/);
  assert.match(html, /Подтвердить следующий шаг/);
  assert.match(html, /Мои проекты/);
  assert.doesNotMatch(html + source, /Stage 70|stage70|execution pipeline|fingerprint/i);
  assert.match(assistant, /addEventListener\("DOMContentLoaded", startController/);
  assert.match(source, /addEventListener\("pageshow", handlePageShow\)/);
  assert.match(source, /ui\.formError\.focus\(\)/);
  assert.doesNotMatch(html + assistant + source, /stage[-_]?70/i);
  const http = fs.readFileSync(path.join(__dirname, "../src/yarnai/http.py"), "utf8");
  assert.doesNotMatch(http, /project-execution-(?:stage-?70|next-step-execution)/i);
});

test("05 presentation labels remain separate from canonical values", () => {
  assert.equal(workspace.TYPE_LABELS.ribbing, "резинка");
  assert.equal(workspace.TYPE_ACTIONS.ribbing, "резинку");
  assert.equal(fixture.stage69Domain.resolveClarification(fixture.assessment(), { foundationType: "ribbing", foundationHeight: 5 }).foundationType, "ribbing");
});
