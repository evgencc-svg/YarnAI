"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");
global.window = globalThis;
[
  "project-system", "project-details-experience", "project-details-collaboration", "project-details-closure", "project-initialization", "swatch-gauge", "project-calculation-entry", "project-readiness-engine", "project-execution-plan", "project-execution-plan-workspace", "project-execution-start", "project-execution-start-workspace", "project-execution-first-step", "project-execution-next-step", "project-execution-next-step-clarification", "foundation-section-execution-preparation", "foundation-section-execution", "foundation-section-measurement", "primary-fabric-preparation", "primary-fabric-execution", "primary-fabric-measurement", "project-next-section-planning", "project-construction-strategy-planning", "project-shaping-policy-planning", "project-sleeve-target-geometry-planning", "project-sleeve-target-geometry-planning-application",
].forEach((name) => require(`../src/yarnai/static/${name}.js`));
["stage70", "stage71", "stage72", "stage73", "stage74", "stage75", "stage76", "stage77", "stage78"].forEach((stage) => require(`../src/yarnai/static/${stage}-happy-path-fixture.js`));
const domain = global.YarnAIProjectSleeveTargetGeometryPlanning;
const application = global.YarnAIProjectSleeveTargetGeometryPlanningApplication;
const stage78 = global.YarnAIProjectShapingPolicyPlanning;
const system = global.YarnAIProjectSystem;
const navigation = require("../src/yarnai/static/user-workspace-entry.js");
const START = Date.parse("2026-08-08T20:00:00.000Z");
let repositories = [];
let minute = 2;
function metadata() { const at = `2026-08-08T20:${String(minute++).padStart(2, "0")}:00.000Z`; return { at, operationId: system.uuidv7() }; }
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }
beforeEach(async () => { repositories = []; minute = 2; await deleteDatabase(); });
afterEach(async () => { await Promise.all(repositories.map((value) => value.close().catch(() => undefined))); await deleteDatabase(); });

async function seedCompleted78(repo) {
  await repo.initialize();
  const seeded = await global.YarnAIStage78HappyPathFixture.seedStage78HappyPath({ repository: repo, startedAt: START });
  const aggregate = await repo.getProject(seeded.projectId); const meta = metadata();
  const snapshot = stage78.createCompletedSnapshot(seeded.assessment78, { policy: "raglan_synchronized" }, { timestamp: meta.at, operationId: meta.operationId, explicitConfirmation: true });
  await repo.ensureProjectShapingPolicyPlanning(seeded.projectId, seeded.calculationId, stage78.createProgressState(snapshot), { expectedProjectRevision: aggregate.project.revision, timestamp: meta.at, operationId: meta.operationId });
  return seeded;
}
function controller(repo, seeded, options = {}) { return application.createController({ repository: repo, projectId: seeded.projectId, throwErrors: true, ...options }); }
async function collectGeometry(app, values = ["20", "30", "40"]) {
  await app.collectCuffCircumference(values[0], metadata());
  await app.collectUpperCircumference(values[1], metadata());
  return app.collectCuffToUnderarmLength(values[2], metadata());
}
async function overrideCuffToMain(repo, app, seeded, overrides = {}) {
  const current = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId);
  const pattern = { ...current.state.construction.mainPattern, source_identity: "stage79:user-cuff", source_fingerprint: domain.fingerprint({ purpose: "test-cuff", ...overrides }), origin: "user_override", ...overrides };
  await app.overrideCuff({ pattern, targetHeightCm: "5", transitionIdentity: "cuff-to-main-same-count-pattern-change:v1" }, metadata());
  return pattern;
}
async function bindBoth(app) { await app.bindCuffGauge({ explicitConfirmation: true }, metadata()); return app.bindMainGauge({ explicitConfirmation: true }, metadata()); }
async function reopen(repo, seeded) { await repo.close(); repositories = repositories.filter((item) => item !== repo); const next = repository(); await next.initialize(); return { repo: next, app: controller(next, seeded) }; }
async function completed79(repo, seeded, values = ["20", "30", "40"]) {
  const app = controller(repo, seeded); await app.loadOrStart(seeded.projectId); await collectGeometry(app, values); await overrideCuffToMain(repo, app, seeded); await bindBoth(app); const review = await app.enterReview({}, metadata()); const completed = await app.confirmReview(review.review.reviewFingerprint, metadata()); return { app, review, completed };
}

test("authoritative source reconstruction validates the exact Stage 61/63/65/70/73/75/76/77/78 chain", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const aggregate = await repo.getProject(seeded.projectId);
  const sources = application.reconstructAuthoritativeSources({ aggregate, validatedAt: metadata().at });
  assert.deepEqual(sources.bindings.map((entry) => entry.stage), domain.SOURCE_STAGES);
  assert.equal(sources.upper_arm_body_circumference_cm, "30"); assert.equal(sources.shoulder_point_to_cuff_length_cm, "57"); assert.equal(sources.armhole_depth_cm, "21");
  assert.equal(sources.direction, "bottom_up"); assert.equal(sources.topology_identity, domain.REQUIRED_TOPOLOGY); assert.equal(sources.stage78_outcome_status, "blocked_on_prerequisites");
  assert.equal(sources.inherited_cuff_pattern.identity, "rib_1x1"); assert.equal(sources.inherited_main_pattern.origin, "inherited_stage73");
  for (const binding of sources.bindings) { assert.equal(binding.current_repository_revision, binding.repository_revision); assert.equal(binding.current_domain_fingerprint, binding.domain_fingerprint); assert.equal(binding.current_snapshot_fingerprint, binding.snapshot_fingerprint); }
});

test("missing every relevant source fails closed", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const original = await repo.getProject(seeded.projectId);
  for (const stage of domain.SOURCE_STAGES) {
    const aggregate = structuredClone(original);
    if (stage === 61) aggregate.project.draft_input.project_initializations.records = [];
    else if (stage === 63) aggregate.project.draft_input.swatch_gauge_history.records = [];
    else aggregate.progress = aggregate.progress.filter((entry) => entry.kind !== application.REQUIRED_PROGRESS[stage]);
    assert.throws(() => application.reconstructAuthoritativeSources({ aggregate, validatedAt: metadata().at }), (error) => Boolean(error.code), `stage ${stage}`);
  }
});

test("project/calculation/fingerprint/revision and unsafe source changes fail closed", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const original = await repo.getProject(seeded.projectId);
  const mutations = [
    (value) => { value.project.active_calculation_id = system.uuidv7(); },
    (value) => { value.progress.find((entry) => entry.kind === "PROJECT_NEXT_SECTION_PLANNING").state.snapshot.fingerprint = "fnv1a32:00000000"; },
    (value) => { value.progress.find((entry) => entry.kind === "PRIMARY_FABRIC_MEASUREMENT").revision += 1; },
    (value) => { value.progress.find((entry) => entry.kind === "PROJECT_SHAPING_POLICY_PLANNING").quarantined = true; },
  ];
  for (const mutate of mutations) { const aggregate = structuredClone(original); mutate(aggregate); assert.throws(() => application.reconstructAuthoritativeSources({ aggregate, validatedAt: metadata().at })); }
});

test("sequential collection is deterministic and never derives sleeve targets from body references", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const app = controller(repo, seeded);
  let view = await app.loadOrStart(seeded.projectId); assert.equal(view.lifecycle, "ready_to_collect"); assert.equal(view.nextMissingInput, "cuffTargetCircumferenceCm");
  assert.equal(view.confirmedGeometryTargets.upperSleeveTargetCircumferenceCm, false); assert.equal(view.confirmedGeometryTargets.cuffToUnderarmLengthCm, false);
  view = await app.collectCuffCircumference("20", metadata()); assert.equal(view.nextMissingInput, "upperSleeveTargetCircumferenceCm");
  view = await app.collectUpperCircumference("30", metadata()); assert.equal(view.nextMissingInput, "cuffToUnderarmLengthCm");
  view = await app.collectCuffToUnderarmLength("40", metadata()); assert.equal(view.nextMissingInput, null);
  const state = (await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId)).state;
  assert.equal(state.referenceMeasurements.upperArmBodyCircumferenceCm, "30"); assert.equal(state.referenceMeasurements.shoulderPointToCuffLengthCm, "57");
  assert.equal(state.targets.upperSleeveTargetCircumferenceCm.provenance, "user_entered_at_stage_79"); assert.equal(state.targets.cuffToUnderarmLengthCm.value, "40");
});

test("cuff and main gauge proofs are independent and missing, stale, or cross-pattern reuse fails closed", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const app = controller(repo, seeded); await app.loadOrStart(seeded.projectId); await collectGeometry(app);
  await assert.rejects(() => app.enterReview({}, metadata()), (error) => error.code === "CUFF_GAUGE_REQUIRED");
  await app.bindCuffGauge({ explicitConfirmation: true }, metadata());
  await assert.rejects(() => app.enterReview({}, metadata()), (error) => error.code === "MAIN_GAUGE_REQUIRED");
  await assert.rejects(() => app.bindMainGauge({ explicitConfirmation: true }, metadata()), (error) => error.code === "CROSS_ZONE_GAUGE_REUSE_FORBIDDEN");
  await overrideCuffToMain(repo, app, seeded); const view = await bindBoth(app); assert.equal(view.gaugeStatus.cuff.status, "valid"); assert.equal(view.gaugeStatus.main.status, "valid");
  const aggregate = await repo.getProject(seeded.projectId); const sources = application.reconstructAuthoritativeSources({ aggregate, validatedAt: metadata().at }); const current = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId);
  const binding = application.buildGaugeBinding({ aggregate, sources, state: current.state, domain, dependencies: application.dependenciesFromGlobal(), zone: "main", explicitConfirmation: true, confirmedAt: metadata().at }); binding.currentRecordFingerprint = "fnv1a32:00000000";
  assert.throws(() => domain.bindGauge(current.state, sources, binding, metadata()), (error) => error.code === "GAUGE_STALE");
});

test("application exposes projection-safe pattern alignment without leaking pattern payloads into presentation", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const app = controller(repo, seeded); await app.loadOrStart(seeded.projectId); await collectGeometry(app); await app.bindCuffGauge({ explicitConfirmation: true }, metadata());
  await assert.rejects(() => app.bindMainGauge({ explicitConfirmation: true }, metadata()), (error) => error.code === "CROSS_ZONE_GAUGE_REUSE_FORBIDDEN");
  let view = await app.alignCuffPatternWithMain(metadata()); assert.equal(view.gaugeStatus.cuff.status, "missing"); assert.equal(view.inheritedPolicy.cuffCandidate, view.inheritedPolicy.mainPattern);
  view = await bindBoth(app); assert.equal(view.gaugeStatus.cuff.status, "valid"); assert.equal(view.gaugeStatus.main.status, "valid");
});

test("blocked application projection distinguishes no-valid endpoints and gauge incompatibility", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const app = controller(repo, seeded); await app.loadOrStart(seeded.projectId); await collectGeometry(app);
  const aggregate = await repo.getProject(seeded.projectId); const sources = application.reconstructAuthoritativeSources({ aggregate, validatedAt: metadata().at });
  let state = (await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId)).state;
  const oddPattern = { identity: "odd_repeat", source_identity: "stage79:test-odd", source_fingerprint: domain.fingerprint({ purpose: "no-valid-endpoint" }), display_value: "odd repeat", horizontal_repeat: 2, fixed_working_stitches: 1, vertical_repeat: 1, end_phase: "any", origin: "user_override" };
  state = domain.overrideMainPattern(state, sources, oddPattern, metadata());
  const common = { aggregate, sources, domain, dependencies: application.dependenciesFromGlobal(), explicitConfirmation: true, confirmedAt: metadata().at };
  state = domain.bindGauge(state, sources, application.buildGaugeBinding({ ...common, state, zone: "cuff" }), metadata());
  const mainBinding = application.buildGaugeBinding({ ...common, state, zone: "main" }); mainBinding.gaugeRecordIdentity += ":independent-main";
  state = domain.bindGauge(state, sources, mainBinding, metadata());
  let noValidError; try { domain.enterReview(state, sources, { inheritedConstructionReviewed: true }, metadata()); } catch (error) { noValidError = error; }
  assert.equal(noValidError.code, "TARGET_IMPOSSIBLE_UNDER_CURRENT_CONSTRAINTS");
  const endpointProjection = application.blockedProjection(noValidError, { domain, state }); assert.equal(endpointProjection.endpointState.status, "no_valid_candidate"); assert.equal(endpointProjection.blocked, true);
  const gaugeProjection = application.blockedProjection(new domain.SleevePlanningError("GAUGE_PATTERN_MISMATCH", "mismatch"), { domain, state, zone: "main" }); assert.equal(gaugeProjection.gaugeStatus.main.status, "incompatible");
  const staleProjection = application.blockedProjection(new domain.SleevePlanningError("GAUGE_STALE", "stale"), { domain, state, zone: "cuff" }); assert.equal(staleProjection.gaugeStatus.cuff.status, "stale");
});

test("review projection exposes exact selected endpoint, taper summary, target length, and stop condition", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const app = controller(repo, seeded); await app.loadOrStart(seeded.projectId); await collectGeometry(app); await overrideCuffToMain(repo, app, seeded); await bindBoth(app);
  const view = await app.enterReview({}, metadata()); assert.equal(view.lifecycle, "reviewing"); assert.equal(view.endpointState.status, "selected"); assert.equal(view.review.castOnTarget, 40); assert.equal(view.review.upperTarget, 60); assert.equal(view.review.increaseEventCount, 10); assert.equal(view.review.targetLengthCm, "40"); assert.equal(view.review.stopCondition.holdOrRemoveUnderarmStitches, false); assert.equal(view.review.stopCondition.physicalConfirmationRequiredLater, true);
  const rounds = view.review.scheduleSummary.events.map((entry) => entry.mainRound); assert.equal(rounds.length, 10); assert.deepEqual(rounds, [...rounds].sort((a, b) => a - b));
});

test("structured endpoint tie stays unresolved until an explicit candidate is confirmed", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const app = controller(repo, seeded); await app.loadOrStart(seeded.projectId); await collectGeometry(app, ["20.25", "30.25", "40"]); await overrideCuffToMain(repo, app, seeded); await bindBoth(app);
  let view = await app.enterReview({}, metadata()); assert.equal(view.endpointState.status, "tie"); assert.equal(view.review.castOnTarget, null); assert.equal(view.endpointState.tiedCandidates.length, 2);
  view = await app.confirmStructuredEndpointTie(view.endpointState.tiedCandidates[0], metadata()); assert.equal(view.endpointState.status, "selected"); assert.ok(view.review.reviewFingerprint); assert.ok(view.review.castOnTarget);
});

test("operation receipts make identical replay a no-op and conflicting replay fail", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const app = controller(repo, seeded); await app.loadOrStart(seeded.projectId); const meta = metadata();
  await app.collectCuffCircumference("20", meta); const before = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId);
  await app.collectCuffCircumference("20", meta); const replay = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId); assert.equal(replay.revision, before.revision); assert.equal(replay.state.fingerprint, before.state.fingerprint);
  await assert.rejects(() => app.collectCuffCircumference("21", meta), (error) => error.code === "OPERATION_ID_CONFLICT");
  const recovered = await app.collectUpperCircumference("30", metadata()); assert.equal(recovered.nextMissingInput, "cuffToUnderarmLengthCm");
});

test("project revision fence rejects a source/project change between read and atomic write", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const app = controller(repo, seeded); await app.loadOrStart(seeded.projectId);
  const aggregate = await repo.getProject(seeded.projectId); const sources = application.reconstructAuthoritativeSources({ aggregate, validatedAt: metadata().at }); const current = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId); const meta = metadata();
  const next = domain.collectTarget(current.state, sources, { field: "cuffTargetCircumferenceCm", value: "20" }, meta);
  await repo.updateCalculationProgress(seeded.projectId, seeded.calculationId, "SMART_START", { current_step: 1, completed: false }, { baseProgressRevision: 1, timestamp: metadata().at });
  await assert.rejects(() => repo.saveProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId, next, { expectedProjectRevision: aggregate.project.revision, expectedRepositoryRevision: current.revision, timestamp: meta.at, operationId: meta.operationId }), (error) => error.code === "REVISION_CONFLICT");
  const loaded = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId); assert.equal(loaded.state.targets.cuffTargetCircumferenceCm, undefined);
});

test("reload reconstructs every persisted lifecycle state and receipts remain effective", async () => {
  let repo = repository(); const seeded = await seedCompleted78(repo); let app = controller(repo, seeded); let view = await app.loadOrStart(seeded.projectId);
  ({ repo, app } = await reopen(repo, seeded)); assert.deepEqual(await app.reconstructAfterReload(seeded.projectId), view);
  view = await app.collectCuffCircumference("20", metadata()); ({ repo, app } = await reopen(repo, seeded)); assert.deepEqual(await app.reconstructAfterReload(seeded.projectId), view);
  view = await app.collectUpperCircumference("30", metadata()); ({ repo, app } = await reopen(repo, seeded)); assert.deepEqual(await app.reconstructAfterReload(seeded.projectId), view);
  view = await app.collectCuffToUnderarmLength("40", metadata()); ({ repo, app } = await reopen(repo, seeded)); assert.deepEqual(await app.reconstructAfterReload(seeded.projectId), view);
  await overrideCuffToMain(repo, app, seeded); await bindBoth(app); const reviewing = await app.enterReview({}, metadata()); ({ repo, app } = await reopen(repo, seeded)); assert.deepEqual(await app.reconstructAfterReload(seeded.projectId), reviewing);
  const completionMetadata = metadata(); const completed = await app.confirmReview(reviewing.review.reviewFingerprint, completionMetadata); ({ repo, app } = await reopen(repo, seeded)); assert.deepEqual(await app.reconstructAfterReload(seeded.projectId), completed);
  const beforeReplay = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId); assert.deepEqual(await app.confirmReview(reviewing.review.reviewFingerprint, completionMetadata), completed); const afterReplay = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId); assert.equal(afterReplay.revision, beforeReplay.revision);
});

test("an unresolved structured tie reconstructs identically after a full repository reload", async () => {
  let repo = repository(); const seeded = await seedCompleted78(repo); let app = controller(repo, seeded); await app.loadOrStart(seeded.projectId); await collectGeometry(app, ["20.25", "30.25", "40"]); await overrideCuffToMain(repo, app, seeded); await bindBoth(app);
  const tie = await app.enterReview({}, metadata()); assert.equal(tie.endpointState.status, "tie"); ({ repo, app } = await reopen(repo, seeded)); assert.deepEqual(await app.reconstructAfterReload(seeded.projectId), tie);
});

test("completed epoch is immutable and a contiguous superseding epoch preserves history", async () => {
  let repo = repository(); const seeded = await seedCompleted78(repo); let { app, completed } = await completed79(repo, seeded); const first = structuredClone(completed.completed.immutableSummary);
  const next = await app.startNewEpoch(metadata()); assert.equal(next.epoch, 2); assert.equal(next.lifecycle, "ready_to_collect"); assert.equal(next.nextMissingInput, "cuffTargetCircumferenceCm"); ({ repo, app } = await reopen(repo, seeded)); assert.deepEqual(await app.reconstructAfterReload(seeded.projectId), next);
  const history = await repo.getProjectSleeveTargetGeometryPlanningHistory(seeded.projectId, seeded.calculationId); assert.equal(history.length, 2); assert.deepEqual(history[0].state.completedSnapshot, first); assert.equal(history[1].state.predecessorIdentity, history[0].state.identity);
  const aggregate = await repo.getProject(seeded.projectId); const replay = await repo.saveProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId, history[0].state, { expectedProjectRevision: aggregate.project.revision, expectedRepositoryRevision: history[0].revision, timestamp: metadata().at, operationId: system.uuidv7() }); assert.equal(replay.progress_id, history[0].progress_id);
  const sources = application.reconstructAuthoritativeSources({ aggregate, validatedAt: metadata().at }); assert.throws(() => domain.collectTarget(history[0].state, sources, { field: "cuffTargetCircumferenceCm", value: "21" }, metadata()), (error) => error.code === "COMPLETED_EPOCH_IMMUTABLE");
});

test("duplicate completion returns the same completed epoch and scope contains no physical sleeve, underarm allocation, or yoke execution", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); const { app, completed } = await completed79(repo, seeded); const before = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId); const receipt = before.state.operations.at(-1);
  const replay = await app.confirmReview(completed.completed.immutableSummary.confirmations.finalReview.reviewFingerprint, { at: receipt.at, operationId: receipt.operationId }); const after = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId);
  assert.equal(replay.completed.immutableSummary.fingerprint, completed.completed.immutableSummary.fingerprint); assert.equal(after.revision, before.revision);
  const serialized = JSON.stringify(after.state); assert.doesNotMatch(serialized, /physicalSleeveResult|underarmAllocation|combinedYoke|joinExecution|sleeve1Execution/); assert.equal(after.state.completedSnapshot.derivedGeometry.stopCondition.holdOrRemoveUnderarmStitches, false);
});

test("navigation metadata routes completed Stage 78 and live Stage 79 to presentation and never loops a completion", async () => {
  const repo = repository(); const seeded = await seedCompleted78(repo); let aggregate = await repo.getProject(seeded.projectId);
  let action = navigation.sleeveTargetGeometryPlanningNextAction(aggregate.progress, seeded.projectId); assert.equal(action.action, "start-sleeve-target-geometry"); assert.match(action.destination, /^\/project-sleeve-geometry-planning\?project=/);
  const app = controller(repo, seeded); await app.loadOrStart(seeded.projectId); aggregate = await repo.getProject(seeded.projectId); action = navigation.sleeveTargetGeometryPlanningNextAction(aggregate.progress, seeded.projectId); assert.equal(action.action, "continue-sleeve-target-geometry"); assert.match(action.destination, /^\/project-sleeve-geometry-planning\?project=/);
  const { completed } = await completed79(repo, seeded); aggregate = await repo.getProject(seeded.projectId); action = navigation.sleeveTargetGeometryPlanningNextAction(aggregate.progress, seeded.projectId); assert.equal(action.action, "start-sleeve-physical-execution"); assert.match(action.destination, /^\/project-sleeve-physical-execution\?project=/); assert.equal(completed.completed.physicalSleeveCompleted, false);
  const completedWorkspace = navigation.buildWorkspaceViewModel([aggregate.project], aggregate.progress); assert.equal(completedWorkspace.projects[0].action, null);
  const corrupt = structuredClone(aggregate.progress); corrupt.find((entry) => entry.kind === domain.KIND).state.fingerprint = "fnv1a32:00000000"; assert.equal(navigation.sleeveTargetGeometryPlanningNextAction(corrupt, seeded.projectId).status, "blocked");
});

test("IndexedDB remains v4 with the same stores and Stage 79 presentation adds no migration or createObjectStore call", () => {
  assert.equal(system.DB_VERSION, 4); assert.equal(system.STORE_NAMES.length, 16); assert.equal(new Set(system.STORE_NAMES).size, 16); assert.equal(system.STORE_NAMES.includes("sleeve_planning"), false);
  const production = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-system.js"), "utf8"); assert.equal((production.match(/createObjectStore\s*\(/g) || []).length, 1);
  for (const name of ["project-sleeve-target-geometry-planning.html", "project-sleeve-target-geometry-planning.css", "project-sleeve-target-geometry-planning-workspace.js", "project-sleeve-target-geometry-planning-assistant.js", "stage79-happy-path-fixture.html", "stage79-happy-path-fixture.js"]) assert.equal(fs.existsSync(path.join(__dirname, "../src/yarnai/static", name)), true);
  assert.equal(application.ROUTE_METADATA.routePath, "/project-sleeve-geometry-planning"); assert.equal(application.ROUTE_METADATA.presentationAvailable, true);
});
