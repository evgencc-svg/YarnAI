"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const api = require("../src/yarnai/static/pattern-execution-retrospective.js");
require("../src/yarnai/static/project-system.js");

const PROJECT = "project:one";
const CALCULATION = "calculation:one";
const NOW = "2026-07-31T10:00:00.000Z";

function source(overrides = {}) {
  const result = { kind: "PATTERN_EXECUTION_RESULT", id: "result:one", projectId: PROJECT, sourceCalculationId: CALCULATION, status: "ready", revision: 4, resultFingerprint: "fnv1a32:result", updatedAt: NOW };
  const runtime = { kind: "PATTERN_EXECUTION_RUNTIME", id: "runtime:one", projectId: PROJECT, calculationId: CALCULATION, status: "completed", revision: 7, epoch: 1, runtimeFingerprint: "fnv1a32:runtime", sourceResultId: result.id, sourceResultFingerprint: result.resultFingerprint, updatedAt: NOW };
  const monitoring = { kind: "PATTERN_EXECUTION_MONITORING", id: "monitoring:one", projectId: PROJECT, status: "completed", revision: 2, epoch: 1, fingerprint: "fnv1a32:monitoring" };
  const intervention = { kind: "PATTERN_EXECUTION_INTERVENTION", id: "intervention:one", projectId: PROJECT, status: "completed", revision: 2, epoch: 1, fingerprint: "fnv1a32:intervention" };
  const action = { kind: "PATTERN_EXECUTION_ACTION", id: "action:one", projectId: PROJECT, status: "completed", revision: 2, epoch: 1, fingerprint: "fnv1a32:action" };
  const evidence = { kind: "PATTERN_EXECUTION_EVIDENCE", id: "evidence:one", projectId: PROJECT, status: "completed", revision: 2, epoch: 1, fingerprint: "fnv1a32:evidence" };
  const verification = { kind: "PATTERN_EXECUTION_VERIFICATION", id: "verification:one", projectId: PROJECT, status: "verified", revision: 2, epoch: 1, fingerprint: "fnv1a32:verification" };
  const decision = { kind: "PATTERN_EXECUTION_DECISION", id: "decision:one", projectId: PROJECT, status: "accepted", revision: 2, epoch: 1, fingerprint: "fnv1a32:decision" };
  const followUp = { kind: "PATTERN_EXECUTION_FOLLOW_UP", id: "follow-up:one", projectId: PROJECT, calculationId: CALCULATION, status: "completed", revision: 4, epoch: 1, inputFingerprint: "fnv1a32:chain", fingerprint: "fnv1a32:follow-up", updatedAt: NOW };
  return {
    projectId: PROJECT, calculationId: CALCULATION, result, runtime, monitoring,
    interventions: [intervention], actions: [action], evidence: [evidence],
    verifications: [verification], decisions: [decision], followUp, followUps: [followUp],
    ...structuredClone(overrides),
  };
}

function draft(input = {}, sourceValue = source()) {
  return api.createPatternExecutionRetrospective(sourceValue, { includeAutomaticFacts: false, ...input });
}

function fact(id = "fact:user") {
  return { id, text: "  Подтверждённый   факт  ", sourceType: "verification", sourceRefs: [{ sourceType: "verification", sourceId: "verification:one" }], evidenceLevel: "verified", tags: ["beta", "alpha"] };
}

function question(id = "question:user") {
  return { id, text: "Что осталось неизвестным?", sourceRefs: [{ sourceType: "evidence", sourceId: "evidence:one" }], reason: "Нет достаточного evidence", nextCheck: "Проверить на следующем цикле" };
}

test("creates an immutable draft with the required kind", () => {
  const record = draft();
  assert.equal(record.status, "draft");
  assert.equal(record.kind, api.PROGRESS_KIND);
  assert.ok(Object.isFrozen(record));
});

test("identity and id are deterministic for identical input", () => {
  assert.deepEqual(draft(), draft());
  assert.equal(draft().identity, draft().identity);
});

test("identity is independent of object key order", () => {
  const first = source();
  const reversed = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(draft({}, first).identity, draft({}, reversed).identity);
});

test("arrays receive stable order and deterministic IDs", () => {
  const record = draft({ facts: [{ ...fact("fact:z"), order: 2 }, { ...fact("fact:a"), order: 1 }] });
  assert.deepEqual(record.facts.map((entry) => entry.id), ["fact:a", "fact:z"]);
  assert.deepEqual(record.facts[0].tags, ["alpha", "beta"]);
});

test("timestamp fallback is fixed and reproducible", () => {
  const value = source();
  delete value.result.updatedAt; delete value.runtime.updatedAt; delete value.followUp.updatedAt;
  assert.equal(draft({}, value).createdAt, api.DEFAULT_TIMESTAMP);
});

test("text normalization is explicit NFC whitespace normalization", () => {
  const record = api.addFact(draft(), fact(), {});
  assert.equal(record.facts[0].text, "Подтверждённый факт");
});

test("fact carries stable source references", () => {
  const record = api.addFact(draft(), fact(), {});
  assert.deepEqual(record.facts[0].sourceRefs, [{ sourceType: "verification", sourceId: "verification:one", identity: null }]);
});

for (const level of api.EVIDENCE_LEVELS) {
  test(`evidence level ${level} is supported`, () => {
    const value = fact(`fact:${level}`); value.evidenceLevel = level;
    if (level === "derived") value.sourceRefs.push({ sourceType: "result", sourceId: "result:one" });
    assert.equal(api.addFact(draft(), value).facts[0].evidenceLevel, level);
  });
}

test("unsupported evidence level is rejected", () => {
  assert.throws(() => api.addFact(draft(), { ...fact(), evidenceLevel: "likely" }), (error) => error.code === "corrupted_input");
});

test("derived fact requires multiple explicit sources", () => {
  assert.throws(() => api.addFact(draft(), { ...fact(), evidenceLevel: "derived" }), (error) => error.code === "corrupted_input");
});

test("conclusion references existing facts", () => {
  const withFact = api.addFact(draft(), fact());
  const record = api.addConclusion(withFact, { id: "conclusion:one", text: "Вывод", factIds: ["fact:user"], status: "confirmed" });
  assert.deepEqual(record.conclusions[0].factIds, ["fact:user"]);
});

test("conclusion cannot reference an absent fact", () => {
  assert.throws(() => api.addConclusion(draft(), { text: "Вывод", factIds: ["missing"], status: "confirmed" }), (error) => error.code === "missing_fact_reference");
});

for (const status of api.CONCLUSION_STATUSES) {
  test(`conclusion status ${status} is supported`, () => {
    const withFact = api.addFact(draft(), fact());
    assert.equal(api.addConclusion(withFact, { text: status, factIds: ["fact:user"], status }).conclusions[0].status, status);
  });
}

test("unsupported conclusion status is rejected", () => {
  const withFact = api.addFact(draft(), fact());
  assert.throws(() => api.addConclusion(withFact, { text: "x", factIds: ["fact:user"], status: "assumed" }), (error) => error.code === "corrupted_input");
});

test("adds a sourced unresolved question", () => {
  const record = api.addUnresolvedQuestion(draft(), question());
  assert.equal(record.unresolvedQuestions[0].reason, "Нет достаточного evidence");
});

test("question without reason or source is rejected", () => {
  assert.throws(() => api.addUnresolvedQuestion(draft(), { text: "Почему?" }), (error) => error.code === "corrupted_input");
});

for (const scope of api.CONSIDERATION_SCOPES) {
  test(`future consideration scope ${scope} is supported`, () => {
    const record = api.addFutureConsideration(draft(), { text: "Рассмотреть позже", rationale: "Есть наблюдение", scope });
    assert.equal(record.futureConsiderations[0].scope, scope);
  });
}

test("general_review remains a consideration and not a rule", () => {
  const record = api.addFutureConsideration(draft(), { text: "Проверить обобщение", rationale: "Один случай", scope: "general_review" });
  assert.equal(record.futureConsiderations[0].origin, "user");
  assert.equal(Object.hasOwn(record.futureConsiderations[0], "universalRule"), false);
});

test("unsupported consideration scope is rejected", () => {
  assert.throws(() => api.addFutureConsideration(draft(), { text: "x", rationale: "y", scope: "all_projects" }), (error) => error.code === "corrupted_input");
});

test("machine summary is deterministic and counts confirmed conclusions only", () => {
  let record = api.addFact(draft(), fact());
  record = api.addConclusion(record, { text: "Да", factIds: ["fact:user"], status: "confirmed" });
  record = api.addUnresolvedQuestion(record, question());
  record = api.addFutureConsideration(record, { text: "Позже", rationale: "Факт", relatedFactIds: ["fact:user"], scope: "this_project" });
  assert.deepEqual(record.summary.machine, api.machineSummary(record, record.integrity));
  assert.equal(record.summary.machine.confirmedConclusionCount, 1);
});

test("draft transitions to reviewing", () => assert.equal(api.startReview(draft(), source()).status, "reviewing"));

test("reviewing returns to draft", () => {
  const reviewing = api.startReview(draft(), source());
  assert.equal(api.returnToDraft(reviewing, source()).status, "draft");
});

test("reviewing transitions to completed", () => {
  const reviewing = api.startReview(draft(), source());
  assert.equal(api.completeRetrospective(reviewing, source()).status, "completed");
});

test("draft cannot transition directly to completed", () => {
  assert.throws(() => api.completeRetrospective(draft(), source()), (error) => error.code === "invalid_transition");
});

test("completed retrospective is terminal and immutable", () => {
  const completed = api.completeRetrospective(api.startReview(draft(), source()), source());
  assert.throws(() => api.returnToDraft(completed, source()), (error) => error.code === "terminal_retrospective");
  assert.throws(() => api.addFact(completed, fact()), (error) => error.code === "terminal_retrospective");
});

test("full source chain has valid integrity", () => assert.equal(api.calculateIntegrity(source()).valid, true));

test("missing optional source is advisory and does not block completion", () => {
  const value = source({ monitoring: null, interventions: [], actions: [], evidence: [], verifications: [], decisions: [] });
  const integrity = api.calculateIntegrity(value);
  assert.equal(integrity.valid, true);
  assert.ok(integrity.advisoryIssues.length >= 1);
});

for (const critical of ["result", "runtime", "followUp"]) {
  test(`missing critical source ${critical} blocks completion`, () => {
    const value = source(); value[critical] = null;
    if (critical === "followUp") value.followUps = [];
    const record = draft({}, value);
    const reviewing = api.startReview(record, value);
    assert.throws(() => api.completeRetrospective(reviewing, value), (error) => error.code === "critical_integrity");
  });
}

test("project mismatch is critical", () => {
  const value = source(); value.runtime.projectId = "project:other";
  assert.ok(api.calculateIntegrity(value).criticalIssues.some((entry) => entry.code === "project_mismatch"));
});

test("source identity mismatch is critical", () => {
  const value = source(); value.runtime.sourceResultFingerprint = "fnv1a32:other";
  assert.ok(api.calculateIntegrity(value).criticalIssues.some((entry) => entry.code === "source_identity_mismatch"));
});

test("stale source is critical", () => {
  const value = source(); value.result.status = "stale";
  assert.ok(api.calculateIntegrity(value).criticalIssues.some((entry) => entry.code === "stale_source"));
});

test("corrupted source is critical", () => {
  const value = source(); value.followUp.corrupted = true;
  assert.ok(api.calculateIntegrity(value).criticalIssues.some((entry) => entry.code === "corrupted_source"));
});

test("retrospective becomes stale after source snapshot changes", () => {
  const value = source(); const record = draft({}, value); value.runtime.revision += 1;
  assert.equal(api.isPatternExecutionRetrospectiveStale(record, value), true);
});

test("older completed follow-up cannot replace the latest one", () => {
  const value = source(); value.followUps.push({ ...value.followUp, id: "follow-up:new", epoch: 2, revision: 1 });
  assert.ok(api.calculateIntegrity(value).criticalIssues.some((entry) => entry.code === "older_follow_up_selected"));
});

test("safe normalization handles corrupted data without throwing", () => {
  const safe = api.safeNormalizePatternExecutionRetrospective('{"kind":');
  assert.equal(safe.corrupted, true); assert.equal(safe.record, null);
});

test("export and import round trip preserves snapshot", () => {
  const record = draft();
  assert.deepEqual(api.deserializePatternExecutionRetrospective(api.serializePatternExecutionRetrospective(record)), record);
});

test("project remap updates project-scoped references and identity", () => {
  const record = draft();
  const remapped = api.remapPatternExecutionRetrospective(record, new Map([[PROJECT, "project:two"], [CALCULATION, "calculation:two"], ["result:one", "result:two"], ["runtime:one", "runtime:two"], ["follow-up:one", "follow-up:two"]]));
  assert.equal(remapped.projectId, "project:two");
  assert.equal(remapped.sourceResultId, "result:two");
  assert.equal(remapped.sourceRuntimeId, "runtime:two");
  assert.equal(remapped.sourceFollowUpId, "follow-up:two");
  assert.notEqual(remapped.identity, record.identity);
  assert.doesNotMatch(api.serializePatternExecutionRetrospective(remapped), /project:one/);
});

test("duplicate import is deterministic", () => {
  const record = draft();
  const imported = api.importPatternExecutionRetrospective([record], api.serializePatternExecutionRetrospective(record));
  assert.equal(imported.status, "duplicate"); assert.equal(imported.changed, false);
});

test("import can preserve a quarantine-safe stale diagnostic", () => {
  const stale = api.makeImportedPatternExecutionRetrospectiveStale(draft(), { collision: true });
  assert.equal(stale.status, "stale");
  assert.equal(api.validatePatternExecutionRetrospective(stale).valid, true);
});

test("repository exposes Stage 37 save load list and quarantine support", () => {
  const prototype = globalThis.YarnAIProjectSystem.ProjectRepository.prototype;
  for (const method of ["listPatternExecutionRetrospectives", "getPatternExecutionRetrospective", "savePatternExecutionRetrospective", "createPatternExecutionRetrospective", "readPatternExecutionRetrospective", "_quarantinePatternExecutionRetrospective"]) assert.equal(typeof prototype[method], "function", method);
});

test("no later execution stage is introduced", () => {
  const files = ["pattern-execution-retrospective.js", "pattern-execution-retrospective-assistant.js", "pattern-execution-retrospective.html"];
  const production = files.map((name) => fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8")).join("\n");
  assert.doesNotMatch(production, /PATTERN_EXECUTION_STAGE_38|pattern-execution-stage-38/);
});

test("production uses no system clock randomness debug console or raw stack", () => {
  const files = ["pattern-execution-retrospective.js", "pattern-execution-retrospective-assistant.js", "pattern-execution-retrospective.html", "pattern-execution-retrospective.css"];
  const production = files.map((name) => fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8")).join("\n");
  for (const forbidden of [/Date\.now\s*\(/, /new Date\s*\(/, /Math\.random\s*\(/, /randomUUID\s*\(/, /crypto\.randomUUID\s*\(/, /performance\.now\s*\(/, /console\.(?:log|debug|warn|error)\s*\(/, /\.stack\b/]) assert.doesNotMatch(production, forbidden);
});

test("IndexedDB remains version 4 with canonical 16 unique stores and one production create call", () => {
  const system = globalThis.YarnAIProjectSystem;
  assert.equal(system.DB_VERSION, 4); assert.equal(system.STORE_NAMES.length, 16); assert.equal(new Set(system.STORE_NAMES).size, 16);
  const staticRoot = path.join(__dirname, "../src/yarnai/static");
  const calls = fs.readdirSync(staticRoot).filter((name) => name.endsWith(".js") && !name.endsWith(".test.js") && !name.endsWith(".test.cjs")).flatMap((name) => [...fs.readFileSync(path.join(staticRoot, name), "utf8").matchAll(/createObjectStore\s*\(/g)]);
  assert.equal(calls.length, 1);
});
