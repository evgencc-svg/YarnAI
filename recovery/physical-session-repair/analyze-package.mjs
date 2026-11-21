import { readFileSync } from "node:fs";
import vm from "node:vm";
import { decodeValue } from "../exact-project-handoff/core.mjs";

const packagePath = process.argv[2];
if (!packagePath) throw new Error("PACKAGE_PATH_REQUIRED");
const recoveryPackage = JSON.parse(readFileSync(packagePath, "utf8"));
const records = recoveryPackage.records
  .filter((entry) => ["projects", "calculations", "progress", "operations", "checkpoints"].includes(entry.store))
  .map((entry) => ({ store: entry.store, key: decodeValue(entry.key), value: decodeValue(entry.value) }));

for (const source of ["src/yarnai/static/pattern-execution-plan.js", "src/yarnai/static/pattern-execution-session.js"]) {
  vm.runInThisContext(readFileSync(source, "utf8"), { filename: source });
}

const planApi = globalThis.YarnAIPatternExecutionPlan;
const sessionApi = globalThis.YarnAIPatternExecutionSession;
const progress = records.filter((entry) => entry.store === "progress").map((entry) => entry.value);
const byKind = (kind) => progress.find((entry) => entry.kind === kind)?.state || null;
const project = records.find((entry) => entry.store === "projects")?.value || null;
const calculation = records.find((entry) => entry.store === "calculations")?.value || null;
const plan = byKind("PATTERN_EXECUTION_PLAN");
const session = byKind("PATTERN_EXECUTION_SESSION");
const review = byKind("PATTERN_TECHNOLOGY_REVIEW");
const draft = byKind("PATTERN_TECHNOLOGY_DRAFT");
const analysis = byKind("PATTERN_ANALYSIS_REVIEW");
const semantic = byKind("PATTERN_SEMANTIC_ANALYSIS");
const instructionEvidence = byKind("SOURCE_PATTERN_INSTRUCTION_EVIDENCE");
const context = { technologyReview: review, technologyDraft: draft, analysisReview: analysis, semanticAnalysis: semantic, instructionEvidence, requireCurrentIdentity: true };

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value?.[key] ?? null]));
}

function firstDivergence(left, right, path = "$") {
  if (Object.is(left, right)) return null;
  if (typeof left !== typeof right || left === null || right === null) return { path, left, right };
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return { path, left, right };
    if (left.length !== right.length) return { path: `${path}.length`, left: left.length, right: right.length };
    for (let index = 0; index < left.length; index += 1) {
      const found = firstDivergence(left[index], right[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (typeof left === "object") {
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    for (const key of keys) {
      if (!(key in left) || !(key in right)) return { path: `${path}.${key}`, left: left[key], right: right[key] };
      const found = firstDivergence(left[key], right[key], `${path}.${key}`);
      if (found) return found;
    }
    return null;
  }
  return { path, left, right };
}

const identityKeys = Object.keys(sessionApi.sourceIdentityFromPlan(plan));
const expectedIdentity = sessionApi.sourceIdentityFromPlan(plan);
const storedIdentity = pick(session, identityKeys);
const identityDiff = identityKeys
  .filter((key) => (storedIdentity[key] ?? null) !== (expectedIdentity[key] ?? null))
  .map((key) => ({ field: key, stored: storedIdentity[key], expected: expectedIdentity[key] }));
const currentSnapshot = sessionApi.buildPlanSnapshot(plan);
const currentExecution = sessionApi.buildExecution(currentSnapshot);
const virtual = session?.virtualDryRun || null;
const virtualOrder = (virtual?.execution?.actions || []).map((entry) => pick(entry, ["order", "stepId", "actionId", "sourceOperationIdentity"]));
const currentOrder = currentExecution.actions.map((entry) => pick(entry, ["order", "stepId", "actionId", "sourceOperationIdentity"]));
const fullGraphFirstDivergence = firstDivergence(virtual?.execution?.actions || [], currentExecution.actions, "$.execution.actions");
const orderFirstDivergence = firstDivergence(virtualOrder, currentOrder, "$.orderedOperationIdentities");
const stale = sessionApi.detectExecutionSessionStaleness(session, plan, context);

const semanticAction = (entry) => pick(entry, [
  "actionId", "stepId", "sourceOperationIdentity", "phaseId", "componentId", "order", "title", "instruction",
  "prerequisiteActionIds", "checkpointIds", "required", "blockerIds",
]);
const virtualSemanticActions = (virtual?.execution?.actions || []).map(semanticAction);
const currentSemanticActions = currentExecution.actions.map(semanticAction);
const executionBehavior = (entry) => pick(entry, [
  "actionId", "stepId", "sourceOperationIdentity", "phaseId", "componentId", "order", "title", "instruction",
  "prerequisiteActionIds", "required", "blockerIds",
]);
const virtualExecutionBehavior = (virtual?.execution?.actions || []).map(executionBehavior);
const currentExecutionBehavior = currentExecution.actions.map(executionBehavior);

const historicalStates = [];
function collectHistoricalStates(value, checkpointRevision, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value.kind === "PATTERN_EXECUTION_PLAN" && value.state?.kind === "PATTERN_EXECUTION_PLAN") {
    historicalStates.push({ checkpointRevision, kind: value.kind, state: value.state });
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectHistoricalStates(child, checkpointRevision, seen);
}
for (const checkpoint of records.filter((entry) => entry.store === "checkpoints").map((entry) => entry.value)) {
  collectHistoricalStates(checkpoint, checkpoint.revision ?? null);
}
const historicalPlans = historicalStates.map((entry) => ({
  checkpointRevision: entry.checkpointRevision,
  id: entry.state.id,
  revision: entry.state.revision,
  status: entry.state.status,
  planFingerprint: entry.state.planFingerprint,
  stepCount: entry.state.plan?.steps?.length ?? null,
})).filter((entry, index, array) => index === array.findIndex((candidate) => candidate.id === entry.id && candidate.revision === entry.revision && candidate.planFingerprint === entry.planFingerprint));

const recent = (store) => records.filter((entry) => entry.store === store).map((entry) => entry.value)
  .sort((left, right) => String(right.created_at || right.createdAt || right.updated_at || right.updatedAt || "").localeCompare(String(left.created_at || left.createdAt || left.updated_at || left.updatedAt || "")))
  .slice(0, 6)
  .map((entry) => pick(entry, ["operation_id", "checkpoint_id", "kind", "type", "revision", "created_at", "createdAt", "updated_at", "updatedAt"]));

const output = {
  package: {
    formatVersion: recoveryPackage.formatVersion,
    packageLogicalSha256: recoveryPackage.packageLogicalSha256,
    createdAt: recoveryPackage.createdAt,
    source: recoveryPackage.source,
    manifest: pick(recoveryPackage.manifest, ["projectCount", "recordCount", "storeCounts", "targetedLogicalHash", "targetedLosslessHash", "manifestLogicalSha256"]),
  },
  project: pick(project, ["project_id", "title", "revision", "current_stage", "active_calculation_id", "created_at", "updated_at"]),
  calculation: pick(calculation, ["calculation_id", "project_id", "revision", "created_at", "updated_at"]),
  stages: {
    stage21: pick(review, ["id", "revision", "status", "confirmedSnapshotFingerprint", "resultFingerprint", "updatedAt"]),
    stage22: pick(plan, ["id", "revision", "status", "planFingerprint", "planningInputFingerprint", "sourceTechnologyReviewId", "sourceTechnologyReviewRevision", "sourceTechnologyReviewFingerprint", "sourceConfirmedSnapshotFingerprint", "updatedAt"]),
  },
  plan: {
    storedFingerprint: plan?.planFingerprint,
    calculatedFingerprint: planApi.calculatePlanFingerprint(plan),
    nestedFingerprint: plan?.plan?.planFingerprint,
    stepCount: plan?.plan?.steps?.length ?? null,
    actionCount: currentExecution.actions.length,
    snapshotFingerprint: currentSnapshot.snapshotFingerprint,
    executionGraphFingerprint: plan?.plan?.handoff?.executionGraphFingerprint ?? null,
    firstAction: currentExecution.actions[0] || null,
  },
  session: {
    summary: pick(session, ["id", "revision", "status", "createdAt", "updatedAt", "sessionFingerprint", "sourceExecutionPlanId", "sourceExecutionPlanRevision", "sourceExecutionPlanFingerprint"]),
    calculatedFingerprint: sessionApi.calculateSessionFingerprint(session),
    physical: {
      planSnapshot: session?.planSnapshot,
      actionCount: session?.execution?.actions?.length ?? null,
      completedActionIds: session?.completedActionIds || [],
      skippedActionIds: session?.skippedActionIds || [],
      currentPosition: session?.currentPosition,
    },
    virtual: virtual ? {
      id: virtual.id, contractId: virtual.contractId, mode: virtual.mode, revision: virtual.revision, status: virtual.status,
      sourceExecutionPlanId: virtual.sourceExecutionPlanId, sourceExecutionPlanRevision: virtual.sourceExecutionPlanRevision,
      sourceExecutionPlanFingerprint: virtual.sourceExecutionPlanFingerprint, planSnapshotFingerprint: virtual.planSnapshotFingerprint,
      executionGraphFingerprint: virtual.executionGraphFingerprint, actionCount: virtual.execution.actions.length,
      completedStepCount: virtual.completedStepIds.length, receiptCount: virtual.receipts.length,
      physicalCompletionValues: Array.from(new Set(virtual.receipts.map((entry) => entry.physicalCompletion))),
      fitConfirmedValues: Array.from(new Set(virtual.receipts.map((entry) => entry.fitConfirmed))),
      runFingerprint: virtual.runFingerprint,
    } : null,
  },
  identityTrace: {
    stored: storedIdentity,
    expected: expectedIdentity,
    differences: identityDiff,
    staleDiagnostics: stale.diagnostics,
    orderFirstDivergence,
    fullGraphFirstDivergence,
    semanticExecutionFirstDivergence: firstDivergence(virtualSemanticActions, currentSemanticActions, "$.semanticExecution.actions"),
    executionBehaviorFirstDivergence: firstDivergence(virtualExecutionBehavior, currentExecutionBehavior, "$.executionBehavior.actions"),
    orderedIdentityCount: currentOrder.length,
    semanticExecutionCount: currentSemanticActions.length,
  },
  historicalPlans,
  executionOperationHistory: records.filter((entry) => entry.store === "operations").map((entry) => entry.value)
    .filter((entry) => String(entry.kind || "").startsWith("PATTERN_EXECUTION_"))
    .map((entry) => pick(entry, ["operation_id", "kind", "base_revision", "resulting_revision", "created_at", "occurred_at"])),
  recentOperations: recent("operations"),
  recentCheckpoints: recent("checkpoints"),
};

const compact = process.argv.includes("--compact");
process.stdout.write(JSON.stringify(compact ? {
  package: {
    packageLogicalSha256: output.package.packageLogicalSha256,
    createdAt: output.package.createdAt,
    source: pick(output.package.source, ["origin", "database", "version", "databaseLogicalHash", "databaseLosslessHash", "databaseRecordCount", "databaseProjectCount"]),
    manifest: output.package.manifest,
  },
  project: output.project,
  stages: output.stages,
  plan: output.plan,
  session: output.session,
  identityTrace: output.identityTrace,
  historicalPlans: output.historicalPlans,
  nonVirtualExecutionOperations: output.executionOperationHistory.filter((entry) => entry.kind !== "PATTERN_EXECUTION_VIRTUAL_STEP_COMPLETED"),
  recentOperations: output.recentOperations,
  recentCheckpoints: output.recentCheckpoints,
} : output, null, 2));
