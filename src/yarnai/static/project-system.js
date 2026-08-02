"use strict";

(function initializeProjectSystem(global) {
  const DB_NAME = "yarnai-local";
  const DB_VERSION = 4;
  const RECORD_SCHEMA_VERSION = 1;
  const EXPORT_SCHEMA_VERSION = 1;
  const EXPORT_FORMAT = "yarnai-project";
  const PARTITION_KEY = "guest:local";
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
  const DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  const CHECKPOINT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
  const UUID_V7_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TIMESTAMP_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const ACTIVE_STATUSES = new Set(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]);
  const DEFAULT_CALCULATION_PROGRESS_KINDS = Object.freeze([
    "SMART_START",
    "STEP_ASSISTANT",
  ]);
  const SUPPORTED_CALCULATION_PROGRESS_KINDS = Object.freeze([
    ...DEFAULT_CALCULATION_PROGRESS_KINDS,
    "FIRST_FABRIC_SECTION",
    "FIRST_SIMPLE_SHAPING",
    "FIRST_BIND_OFF",
    "SECOND_IDENTICAL_PIECE",
    "FIRST_ASSEMBLY_PREPARATION",
    "FIRST_ASSEMBLY_JOIN",
    "FIRST_ASSEMBLY_INSPECTION",
    "FIRST_TAIL_SECURING",
    "FIRST_BLOCKING",
    "PATTERN_IMPORT",
    "PATTERN_ANALYSIS",
    "PATTERN_CONTENT_EXTRACTION",
    "PATTERN_SEMANTIC_ANALYSIS",
    "PATTERN_ANALYSIS_REVIEW",
    "PATTERN_TECHNOLOGY_DRAFT",
    "PATTERN_TECHNOLOGY_REVIEW",
    "PATTERN_EXECUTION_PLAN",
    "PATTERN_EXECUTION_SESSION",
    "PATTERN_EXECUTION_STEP",
    "PATTERN_EXECUTION_CHECKPOINT",
    "PATTERN_EXECUTION_PROGRESS",
    "PATTERN_EXECUTION_COMPLETION",
    "PATTERN_EXECUTION_RESULT",
    "PATTERN_EXECUTION_RUNTIME",
    "PATTERN_EXECUTION_MONITORING",
    "PATTERN_EXECUTION_INTERVENTION",
    "PATTERN_EXECUTION_ACTION",
    "PATTERN_EXECUTION_EVIDENCE",
    "PATTERN_EXECUTION_VERIFICATION",
    "PATTERN_EXECUTION_DECISION",
    "PATTERN_EXECUTION_FOLLOW_UP",
    "PATTERN_EXECUTION_RETROSPECTIVE",
    "PATTERN_EXECUTION_LEARNING",
    "PATTERN_EXECUTION_ADAPTATION",
    "PATTERN_EXECUTION_ADAPTATION_VALIDATION",
    "PATTERN_EXECUTION_ADAPTATION_PROMOTION",
    "PATTERN_EXECUTION_ADAPTATION_ROLLOUT",
    "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION",
    "PATTERN_EXECUTION_ADAPTATION_CLOSURE",
  ]);
  const ALL_STATUSES = new Set([...ACTIVE_STATUSES, "ARCHIVED", "DELETED"]);
  const RESTORABLE_STATUSES = new Set([
    "DRAFT",
    "ACTIVE",
    "PAUSED",
    "COMPLETED",
    "ARCHIVED",
  ]);
  const STORE_NAMES = [
    "meta",
    "projects",
    "calculations",
    "progress",
    "operations",
    "checkpoints",
    "photos",
    "photo_blobs",
    "pattern_files",
    "pattern_file_blobs",
    "settings",
    "cache",
    "sync_state",
    "transfer_receipts",
    "quarantine",
    "migration_records",
  ];
  const INDEX_MANIFEST = {
    projects: [
      ["by_partition_status_updated", ["partition_key", "workspace_status", "updated_at"]],
      ["by_partition_last_opened", ["partition_key", "last_opened_at"]],
      ["by_updated_at", "updated_at"],
      ["by_purge_after", "purge_after"],
    ],
    calculations: [
      ["by_project_created", ["project_id", "created_at"]],
      ["by_project_fingerprint", ["project_id", "fingerprint"]],
      ["by_fingerprint", "fingerprint"],
      ["by_supersedes", "supersedes_calculation_id"],
    ],
    progress: [
      ["by_scope_epoch", ["project_id", "calculation_id", "kind", "epoch"], { unique: true }],
      ["by_project_updated", ["project_id", "updated_at"]],
      ["by_calculation_kind", ["calculation_id", "kind"]],
      ["by_kind_updated", ["kind", "updated_at"]],
      ["by_purge_after", "purge_after"],
    ],
    operations: [
      ["by_device_sequence", ["device_id", "device_sequence"], { unique: true }],
      ["by_partition_sync_time", ["partition_key", "sync_status", "occurred_at"]],
      ["by_state_created", ["state", "created_at"]],
      ["by_aggregate_revision", ["aggregate_type", "aggregate_id", "resulting_revision"]],
      ["by_project_time", ["project_id", "occurred_at"]],
      ["by_retention_until", "retention_until"],
    ],
    checkpoints: [
      ["by_aggregate_revision", ["aggregate_type", "aggregate_id", "revision"]],
      ["by_project_created", ["project_id", "created_at"]],
      ["by_retention_until", "retention_until"],
    ],
    photos: [
      ["by_project_created", ["project_id", "created_at"]],
      ["by_project_status", ["project_id", "status"]],
      ["by_sha256", "sha256"],
      ["by_purge_after", "purge_after"],
    ],
    photo_blobs: [
      ["by_photo_variant", ["photo_id", "variant_kind"], { unique: true }],
      ["by_state_accessed", ["storage_state", "last_accessed_at"]],
      ["by_purge_after", "purge_after"],
    ],
    pattern_files: [
      ["by_project_material", ["project_id", "material_id"], { unique: true }],
      ["by_project_created", ["project_id", "created_at"]],
    ],
    pattern_file_blobs: [
      ["by_pattern_file", "pattern_file_id", { unique: true }],
    ],
    settings: [
      ["by_partition_key", ["partition_key", "setting_key"], { unique: true }],
      ["by_sync_scope_updated", ["sync_scope", "updated_at"]],
    ],
    cache: [
      ["by_expires_at", "expires_at"],
      ["by_priority_accessed", ["priority", "last_accessed_at"]],
    ],
    transfer_receipts: [
      ["by_external_checksum", ["transfer_kind", "external_id", "checksum"], { unique: true }],
      ["by_created_at", "created_at"],
    ],
    quarantine: [
      ["by_expires_at", "expires_at"],
      ["by_source", ["source_store", "source_key"]],
    ],
    migration_records: [
      ["by_source_status", ["source_kind", "status"]],
    ],
  };

  let lastUuidTimestamp = -1;

  class ProjectRepositoryError extends Error {
    constructor(code, userMessage, options = {}) {
      super(userMessage);
      this.name = "ProjectRepositoryError";
      this.code = code;
      this.userMessage = userMessage;
      this.transient = Boolean(options.transient);
      this.details = options.details ?? {};
      if (options.cause) {
        this.cause = options.cause;
      }
    }
  }

  function uuidv7(now = Date.now()) {
    if (!global.crypto?.getRandomValues) {
      throw new ProjectRepositoryError(
        "UUID_UNAVAILABLE",
        "Браузер не может безопасно создать идентификатор проекта.",
      );
    }
    const timestamp = Math.max(Number(now), lastUuidTimestamp);
    lastUuidTimestamp = timestamp;
    const bytes = new Uint8Array(16);
    global.crypto.getRandomValues(bytes);
    let value = BigInt(timestamp);
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = Number(value & 0xffn);
      value >>= 8n;
    }
    bytes[6] = 0x70 | (bytes[6] & 0x0f);
    bytes[8] = 0x80 | (bytes[8] & 0x3f);
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10).join(""),
    ].join("-");
  }

  function utcNow() {
    return new Date().toISOString();
  }

  function isUuidv7(value) {
    return typeof value === "string" && UUID_V7_PATTERN.test(value);
  }

  function isTimestamp(value, nullable = false) {
    if (nullable && value === null) {
      return true;
    }
    return (
      typeof value === "string" &&
      TIMESTAMP_PATTERN.test(value) &&
      Number.isFinite(Date.parse(value))
    );
  }

  function clone(value) {
    if (global.structuredClone) {
      return global.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function remapExactReferences(value, referenceMap) {
    if (typeof value === "string") return referenceMap.get(value) ?? value;
    if (Array.isArray(value)) return value.map((entry) => remapExactReferences(entry, referenceMap));
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) value[key] = remapExactReferences(value[key], referenceMap);
    }
    return value;
  }

  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") {
      return JSON.stringify(value);
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new ProjectRepositoryError(
          "INVALID_NUMBER",
          "Данные содержат недопустимое числовое значение.",
        );
      }
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
        .join(",")}}`;
    }
    throw new ProjectRepositoryError(
      "INVALID_VALUE",
      "Данные содержат неподдерживаемое значение.",
    );
  }

  function fnv1a32Fingerprint(value) {
    const input = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }

  function semanticReviewFingerprint(semantic) {
    return fnv1a32Fingerprint({
      id: semantic?.id,
      revision: semantic?.revision,
      sourceExtractionId: semantic?.sourceExtractionId,
      sourceExtractionRevision: semantic?.sourceExtractionRevision,
      sourceImportRevision: semantic?.sourceImportRevision,
      sourceFingerprint: semantic?.sourceFingerprint,
      result: semantic?.result,
    });
  }

  function validateImportedPatternAnalysisReview(state, sourceProjectId) {
    if (
      !state ||
      state.kind !== "PATTERN_ANALYSIS_REVIEW" ||
      state.projectId !== sourceProjectId ||
      !Array.isArray(state.reviewedData?.items) ||
      !Array.isArray(state.reviewedData?.conflictGroups)
    ) {
      throw new ProjectRepositoryError(
        "INVALID_IMPORT_REVIEW",
        "Импортируемая запись проверки анализа повреждена.",
      );
    }
    const itemIds = new Set();
    for (const item of state.reviewedData.items) {
      if (!item?.itemId || itemIds.has(item.itemId)) {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_REVIEW_DUPLICATE_ITEM",
          "Импортируемая проверка содержит повторяющийся itemId.",
        );
      }
      itemIds.add(item.itemId);
    }
    for (const group of state.reviewedData.conflictGroups) {
      if (!Array.isArray(group?.itemIds) || group.itemIds.some((itemId) => !itemIds.has(itemId))) {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_REVIEW_CONFLICT",
          "Импортируемая группа конфликта ссылается на отсутствующий item.",
        );
      }
    }
    if (state.status === "confirmed" && !state.confirmedSnapshot) {
      throw new ProjectRepositoryError(
        "INVALID_IMPORT_REVIEW_CONFIRMED_SNAPSHOT",
        "Подтверждённая импортируемая проверка не содержит snapshot.",
      );
    }
    if (
      state.status === "confirmed" &&
      Number(state.confirmedSnapshot?.validation?.unresolvedCriticalCount || 0) > 0
    ) {
      throw new ProjectRepositoryError(
        "INVALID_IMPORT_REVIEW_UNRESOLVED_CRITICAL",
        "Подтверждённый snapshot содержит нерешённый critical item.",
      );
    }
  }

  function validateImportedPatternTechnologyDraft(state, sourceProjectId) {
    const invalid = (code, message) => {
      throw new ProjectRepositoryError(code, message);
    };
    if (
      !state ||
      state.kind !== "PATTERN_TECHNOLOGY_DRAFT" ||
      state.version !== 1 ||
      state.projectId !== sourceProjectId ||
      state.sourceProjectId !== sourceProjectId ||
      state.immutableSourceSnapshot?.projectId !== sourceProjectId ||
      !["waiting", "building", "needs_attention", "ready", "failed"].includes(state.status) ||
      !Array.isArray(state.audit)
    ) invalid("INVALID_IMPORT_TECHNOLOGY_DRAFT", "Импортируемый черновик технологии повреждён.");
    if (
      fnv1a32Fingerprint(state.immutableSourceSnapshot) !== state.immutableSourceFingerprint ||
      state.immutableSourceFingerprint !== state.sourceConfirmedFingerprint
    ) invalid("IMMUTABLE_SOURCE_CHANGED", "Snapshot источника черновика был изменён.");
    if (state.draftResult) {
      if (
        state.draftResult.schemaVersion !== 1 ||
        state.draftResult.projectSummary?.projectId !== sourceProjectId ||
        fnv1a32Fingerprint(state.draftResult) !== state.draftFingerprint
      ) invalid("INVALID_IMPORT_TECHNOLOGY_DRAFT", "Результат черновика не прошёл проверку fingerprint.");
      const arrays = ["components", "sections", "operations", "rowInstructions", "repeats", "stitchCountChanges", "provenance", "missingInformation", "conflicts", "warnings"];
      if (arrays.some((key) => !Array.isArray(state.draftResult[key]))) invalid("INVALID_IMPORT_TECHNOLOGY_DRAFT", "В черновике отсутствуют обязательные структурные разделы.");
      const ids = new Set();
      for (const key of ["components", "sections", "operations", "rowInstructions", "repeats", "stitchCountChanges", "provenance", "conflicts"]) {
        for (const entity of state.draftResult[key]) {
          if (!entity?.id || ids.has(entity.id)) invalid("DUPLICATE_ENTITY_ID", "Импортируемый черновик содержит повторяющийся entity ID.");
          ids.add(entity.id);
        }
      }
      const componentIds = new Set(state.draftResult.components.map((entry) => entry.id));
      const sectionIds = new Set(state.draftResult.sections.map((entry) => entry.id));
      const provenanceIds = new Set(state.draftResult.provenance.map((entry) => entry.id));
      for (const operation of state.draftResult.operations) {
        if (!sectionIds.has(operation.sectionId) || operation.componentId && !componentIds.has(operation.componentId) || !Array.isArray(operation.provenanceRefs) || operation.provenanceRefs.some((id) => !provenanceIds.has(id))) invalid("BROKEN_ENTITY_REFERENCE", "Импортируемый черновик содержит недействительную внутреннюю ссылку.");
      }
      const critical = [
        ...state.draftResult.missingInformation,
        ...state.draftResult.conflicts,
        ...state.draftResult.warnings,
      ].filter((entry) => entry.level === "critical" && !entry.resolved);
      if (fnv1a32Fingerprint(critical.map((entry) => ({ code: entry.code, entityId: entry.entityIds?.[0] ?? entry.entityId ?? null, level: "critical" })).sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))) !== state.criticalIssuesFingerprint) invalid("CRITICAL_ISSUES_FINGERPRINT_MISMATCH", "Fingerprint критических проблем черновика не совпадает.");
      if (state.status === "ready" && (critical.length || !state.validation?.canBecomeReady)) invalid("READY_WITH_CRITICAL_ISSUES", "Импортируемый черновик ошибочно помечен готовым.");
    } else if (!["waiting", "building", "failed"].includes(state.status)) invalid("INVALID_IMPORT_TECHNOLOGY_DRAFT", "У построенного черновика отсутствует результат.");
  }

  function validateImportedPatternTechnologyReview(state, sourceProjectId) {
    const invalid = (code, message) => {
      throw new ProjectRepositoryError(code, message);
    };
    if (
      !state ||
      state.kind !== "PATTERN_TECHNOLOGY_REVIEW" ||
      state.version !== 1 ||
      state.projectId !== sourceProjectId ||
      !["waiting", "reviewing", "needs_attention", "confirmed", "stale", "failed"].includes(state.status) ||
      !Array.isArray(state.reviewState?.targets) ||
      !Array.isArray(state.decisions) ||
      !Array.isArray(state.corrections) ||
      !Array.isArray(state.audit) ||
      !state.immutableSourceSnapshot
    ) invalid("INVALID_IMPORT_TECHNOLOGY_REVIEW", "Импортируемая проверка технологии повреждена.");
    if (
      fnv1a32Fingerprint(state.immutableSourceSnapshot) !== state.immutableSourceSnapshotFingerprint ||
      state.immutableSourceSnapshot.sourceDraftIdentity?.projectId !== sourceProjectId ||
      state.immutableSourceSnapshot.sourceReviewIdentity?.projectId !== sourceProjectId ||
      state.immutableSourceSnapshot.sourceSemanticIdentity?.projectId !== sourceProjectId ||
      fnv1a32Fingerprint(state.immutableSourceSnapshot.structuredDraft) !== state.sourceDraftFingerprint ||
      fnv1a32Fingerprint(state.immutableSourceSnapshot.validation) !== state.sourceValidationFingerprint
    ) invalid("SOURCE_SNAPSHOT_MUTATED", "Immutable snapshot проверки технологии был изменён.");
    const targetIds = new Set();
    for (const target of state.reviewState.targets) {
      if (!target?.id || targetIds.has(target.id)) invalid("INVALID_IMPORT_TECHNOLOGY_REVIEW", "Review содержит повторяющийся target ID.");
      targetIds.add(target.id);
    }
    const decisionTargets = new Set();
    for (const decision of state.decisions) {
      if (!targetIds.has(decision?.targetId) || decisionTargets.has(decision.targetId)) invalid("INVALID_IMPORT_TECHNOLOGY_REVIEW", "Review содержит повреждённое решение.");
      decisionTargets.add(decision.targetId);
    }
    for (const correction of state.corrections) {
      if (!targetIds.has(correction?.targetId) || correction.sourceElementId !== correction.targetId) invalid("INVALID_IMPORT_TECHNOLOGY_REVIEW", "Исправление ссылается на отсутствующий target.");
    }
    if (state.status === "confirmed") {
      if (!state.confirmedSnapshot || !state.confirmedSnapshotFingerprint) invalid("CONFIRMED_SNAPSHOT_INVALID", "Подтверждённый импорт не содержит snapshot.");
      const snapshotPayload = clone(state.confirmedSnapshot);
      delete snapshotPayload.confirmedSnapshotFingerprint;
      if (
        fnv1a32Fingerprint(snapshotPayload) !== state.confirmedSnapshotFingerprint ||
        state.confirmedSnapshot.confirmedSnapshotFingerprint !== state.confirmedSnapshotFingerprint
      ) invalid("CONFIRMED_SNAPSHOT_FINGERPRINT_MISMATCH", "Fingerprint подтверждённого snapshot не совпадает.");
    }
  }

  function patternExecutionPlanFingerprint(state) {
    if (!state?.plan) return null;
    const plan = clone(state.plan);
    delete plan.planFingerprint;
    const blockers = [...(Array.isArray(state.blockers) ? state.blockers : [])]
      .sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)));
    const warnings = [...(Array.isArray(state.warnings) ? state.warnings : [])]
      .sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)));
    return fnv1a32Fingerprint({
      planningInputFingerprint: state.planningInputFingerprint,
      planningAlgorithmVersion: state.planningAlgorithmVersion,
      plan,
      blockers,
      warnings,
    });
  }

  function patternExecutionPlanningInputFingerprint(state) {
    return fnv1a32Fingerprint({
      planningAlgorithmVersion: state.planningAlgorithmVersion,
      sourceConfirmedSnapshotFingerprint: state.sourceConfirmedSnapshotFingerprint,
      sourceTechnologyReviewId: state.sourceTechnologyReviewId,
      sourceTechnologyReviewRevision: state.sourceTechnologyReviewRevision,
      sourceTechnologyReviewFingerprint: state.sourceTechnologyReviewFingerprint,
      sourceTechnologyDraftId: state.sourceTechnologyDraftId,
      sourceTechnologyDraftRevision: state.sourceTechnologyDraftRevision,
      sourceTechnologyDraftFingerprint: state.sourceTechnologyDraftFingerprint,
      sourceAnalysisReviewId: state.sourceAnalysisReviewId,
      sourceAnalysisReviewRevision: state.sourceAnalysisReviewRevision,
      sourceAnalysisReviewFingerprint: state.sourceAnalysisReviewFingerprint,
      sourceSemanticAnalysisId: state.sourceSemanticAnalysisId,
      sourceSemanticAnalysisRevision: state.sourceSemanticAnalysisRevision,
      sourceSemanticAnalysisFingerprint: state.sourceSemanticAnalysisFingerprint,
      sourceImportRevision: state.sourceImportRevision,
      sourceAlgorithmVersion: state.sourceAlgorithmVersion,
    });
  }

  function patternTechnologyReviewIdentityFingerprint(review) {
    return fnv1a32Fingerprint({
      id: review.id,
      projectId: review.projectId,
      revision: review.revision,
      status: review.status,
      confirmedSnapshotFingerprint: review.confirmedSnapshotFingerprint,
      sourceDraftId: review.sourceDraftId,
      sourceDraftRevision: review.sourceDraftRevision,
      sourceDraftFingerprint: review.sourceDraftFingerprint,
    });
  }

  function validateImportedPatternExecutionPlan(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    if (
      !state ||
      state.kind !== "PATTERN_EXECUTION_PLAN" ||
      state.schemaVersion !== 1 ||
      state.version !== 1 ||
      state.projectId !== sourceProjectId ||
      !["waiting", "planning", "ready", "blocked", "stale", "failed"].includes(state.status) ||
      !Number.isInteger(state.revision) || state.revision < 1 ||
      !Array.isArray(state.blockers) || !Array.isArray(state.warnings) || !Array.isArray(state.audit)
    ) invalid("INVALID_IMPORT_EXECUTION_PLAN", "Импортируемая запись плана выполнения повреждена.");
    if (!state.plan) {
      if (!["waiting", "planning", "failed"].includes(state.status)) invalid("INVALID_IMPORT_EXECUTION_PLAN", "Готовая запись не содержит план.");
      return;
    }
    const plan = state.plan;
    const arrayFields = ["prerequisites", "materials", "tools", "measurements", "gauge", "components", "phases", "checkpoints", "unresolved", "completionCriteria"];
    if (plan.schemaVersion !== 1 || arrayFields.some((key) => !Array.isArray(plan[key])) || !plan.summary || !plan.firstAction || !Array.isArray(plan.dependencyGraph?.nodes) || !Array.isArray(plan.dependencyGraph?.edges)) invalid("INVALID_IMPORT_EXECUTION_PLAN", "Импортируемый план имеет повреждённую структуру.");
    const componentIds = new Set();
    for (const component of plan.components) {
      if (!component?.id || componentIds.has(component.id)) invalid("INVALID_IMPORT_EXECUTION_PLAN", "План содержит повторяющийся component ID.");
      componentIds.add(component.id);
    }
    const phaseIds = new Set();
    const actionIds = new Set();
    for (const phase of plan.phases) {
      if (!phase?.id || phaseIds.has(phase.id) || !Array.isArray(phase.actions) || !Array.isArray(phase.dependsOnPhaseIds) || !Array.isArray(phase.componentIds)) invalid("INVALID_IMPORT_EXECUTION_PLAN", "План содержит повреждённую фазу.");
      phaseIds.add(phase.id);
      for (const action of phase.actions) {
        if (!action?.id || actionIds.has(action.id) || !Array.isArray(action.sourceTargetIds)) invalid("INVALID_IMPORT_EXECUTION_PLAN", "План содержит повреждённое действие.");
        actionIds.add(action.id);
      }
    }
    for (const phase of plan.phases) {
      if (phase.dependsOnPhaseIds.some((id) => !phaseIds.has(id)) || phase.componentIds.some((id) => !componentIds.has(id))) invalid("INVALID_IMPORT_EXECUTION_PLAN_REFERENCE", "Фаза ссылается на отсутствующий объект.");
    }
    const checkpointIds = new Set();
    for (const checkpoint of plan.checkpoints) {
      if (!checkpoint?.id || checkpointIds.has(checkpoint.id) || !phaseIds.has(checkpoint.phaseId) || checkpoint.componentIds?.some((id) => !componentIds.has(id))) invalid("INVALID_IMPORT_EXECUTION_PLAN_REFERENCE", "Контрольная точка ссылается на отсутствующий объект.");
      checkpointIds.add(checkpoint.id);
    }
    for (const edge of plan.dependencyGraph.edges) if (!phaseIds.has(edge?.from) || !phaseIds.has(edge?.to)) invalid("INVALID_IMPORT_EXECUTION_PLAN_REFERENCE", "Граф плана содержит отсутствующую фазу.");
    if (plan.firstAction.phaseId && !phaseIds.has(plan.firstAction.phaseId) || plan.firstAction.actionId && !actionIds.has(plan.firstAction.actionId)) invalid("INVALID_IMPORT_EXECUTION_PLAN_REFERENCE", "Первое действие ссылается на отсутствующий объект.");
    if (!state.planningInputFingerprint || state.planningInputFingerprint !== patternExecutionPlanningInputFingerprint(state)) invalid("INVALID_IMPORT_EXECUTION_PLAN_FINGERPRINT", "Fingerprint входа планирования не совпадает.");
    if (!state.planFingerprint || state.planFingerprint !== plan.planFingerprint || state.planFingerprint !== patternExecutionPlanFingerprint(state)) invalid("INVALID_IMPORT_EXECUTION_PLAN_FINGERPRINT", "Fingerprint плана не совпадает.");
  }

  function patternExecutionSessionFingerprint(state) {
    const payload = clone(state);
    delete payload.sessionFingerprint;
    return fnv1a32Fingerprint(payload);
  }

  function patternExecutionSessionSnapshotFingerprint(snapshot) {
    const payload = clone(snapshot);
    delete payload.snapshotFingerprint;
    return fnv1a32Fingerprint(payload);
  }

  function validateImportedPatternExecutionSession(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    if (
      !state || state.kind !== "PATTERN_EXECUTION_SESSION" || state.schemaVersion !== 1 || state.version !== 1 ||
      state.projectId !== sourceProjectId ||
      !["waiting", "starting", "active", "paused", "blocked", "completed", "stale", "failed"].includes(state.status) ||
      !Number.isInteger(state.revision) || state.revision < 1 || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt) ||
      !Array.isArray(state.completedActionIds) || !Array.isArray(state.skippedActionIds) || !Array.isArray(state.checkpoints) ||
      !Array.isArray(state.blockers) || !Array.isArray(state.audit) || state.audit.length > 24 ||
      state.execution?.mode !== "sequential" || !Array.isArray(state.execution?.actions) || !state.currentPosition
    ) invalid("INVALID_IMPORT_EXECUTION_SESSION", "Импортируемая сессия выполнения повреждена.");
    if (state.sessionFingerprint !== patternExecutionSessionFingerprint(state)) invalid("INVALID_IMPORT_EXECUTION_SESSION_FINGERPRINT", "Fingerprint сессии выполнения не совпадает.");
    if (state.planSnapshot === null) {
      if (!["waiting", "starting", "failed"].includes(state.status) || state.execution.actions.length) invalid("INVALID_IMPORT_EXECUTION_SESSION", "Сессия без snapshot содержит execution state.");
      return;
    }
    const snapshot = state.planSnapshot;
    if (
      snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.components) || !Array.isArray(snapshot.phases) ||
      !Array.isArray(snapshot.actions) || !Array.isArray(snapshot.prerequisites) || !Array.isArray(snapshot.blockers) ||
      !Array.isArray(snapshot.checkpoints) || snapshot.snapshotFingerprint !== patternExecutionSessionSnapshotFingerprint(snapshot)
    ) invalid("INVALID_IMPORT_EXECUTION_SESSION_SNAPSHOT", "Snapshot сессии выполнения повреждён.");
    const uniqueIds = (entries, field) => {
      const ids = new Set();
      for (const entry of entries) {
        const id = entry?.[field];
        if (!id || ids.has(id)) invalid("INVALID_IMPORT_EXECUTION_SESSION", `Сессия содержит повторяющийся ${field}.`);
        ids.add(id);
      }
      return ids;
    };
    const componentIds = uniqueIds(snapshot.components, "componentId");
    const phaseIds = uniqueIds(snapshot.phases, "phaseId");
    const snapshotActionIds = uniqueIds(snapshot.actions, "actionId");
    const checkpointIds = uniqueIds(snapshot.checkpoints, "checkpointId");
    const executionActionIds = uniqueIds(state.execution.actions, "actionId");
    const allowedStatuses = new Set(["pending", "available", "in_progress", "completed", "skipped", "blocked"]);
    for (const phase of snapshot.phases) {
      if (!Array.isArray(phase.actionIds) || !Array.isArray(phase.componentIds) || !Array.isArray(phase.dependsOnPhaseIds) ||
        phase.actionIds.some((id) => !snapshotActionIds.has(id)) || phase.componentIds.some((id) => !componentIds.has(id)) ||
        phase.dependsOnPhaseIds.some((id) => !phaseIds.has(id))) invalid("INVALID_IMPORT_EXECUTION_SESSION_REFERENCE", "Snapshot сессии содержит повреждённую фазовую ссылку.");
    }
    for (const checkpoint of snapshot.checkpoints) if (!phaseIds.has(checkpoint.phaseId) || checkpoint.componentIds?.some((id) => !componentIds.has(id))) invalid("INVALID_IMPORT_EXECUTION_SESSION_REFERENCE", "Checkpoint сессии содержит повреждённую ссылку.");
    for (const action of state.execution.actions) {
      if (!snapshotActionIds.has(action.actionId) || !phaseIds.has(action.phaseId) || action.componentId && !componentIds.has(action.componentId) ||
        !Number.isInteger(action.order) || action.order < 1 || !Array.isArray(action.prerequisiteActionIds) ||
        !Array.isArray(action.checkpointIds) || !Array.isArray(action.blockerIds) ||
        action.prerequisiteActionIds.some((id) => !executionActionIds.has(id) || id === action.actionId) ||
        action.checkpointIds.some((id) => !checkpointIds.has(id)) || !allowedStatuses.has(action.status) || typeof action.required !== "boolean") {
        invalid("INVALID_IMPORT_EXECUTION_SESSION_REFERENCE", "Execution action содержит повреждённую ссылку.");
      }
      if (action.required && action.status === "skipped") invalid("INVALID_IMPORT_EXECUTION_SESSION", "Обязательное действие ошибочно пропущено.");
    }
    if (executionActionIds.size !== snapshotActionIds.size || [...snapshotActionIds].some((id) => !executionActionIds.has(id))) invalid("INVALID_IMPORT_EXECUTION_SESSION_REFERENCE", "Execution state не соответствует snapshot действий.");
    const colors = new Map();
    const actionMap = new Map(state.execution.actions.map((entry) => [entry.actionId, entry]));
    const visit = (id) => {
      if (colors.get(id) === 1) return true;
      if (colors.get(id) === 2) return false;
      colors.set(id, 1);
      for (const dependency of actionMap.get(id).prerequisiteActionIds) if (visit(dependency)) return true;
      colors.set(id, 2);
      return false;
    };
    if (state.execution.actions.some((entry) => visit(entry.actionId))) invalid("INVALID_IMPORT_EXECUTION_SESSION_REFERENCE", "Execution actions содержат цикл.");
    const completed = [...new Set(state.execution.actions.filter((entry) => entry.status === "completed").map((entry) => entry.actionId))].sort();
    const skipped = [...new Set(state.execution.actions.filter((entry) => entry.status === "skipped").map((entry) => entry.actionId))].sort();
    if (canonicalize(completed) !== canonicalize([...new Set(state.completedActionIds)].sort()) || canonicalize(skipped) !== canonicalize([...new Set(state.skippedActionIds)].sort())) invalid("INVALID_IMPORT_EXECUTION_SESSION", "Индексы прогресса сессии не соответствуют действиям.");
    const currentId = state.currentPosition.actionId;
    if (currentId !== null && !executionActionIds.has(currentId)) invalid("INVALID_IMPORT_EXECUTION_SESSION_REFERENCE", "Текущая позиция сессии отсутствует.");
    if (state.execution.actions.filter((entry) => ["available", "in_progress"].includes(entry.status)).length > 1) invalid("INVALID_IMPORT_EXECUTION_SESSION", "Сессия содержит несколько текущих действий.");
    if (state.status === "blocked" && !state.blockers.length) invalid("INVALID_IMPORT_EXECUTION_SESSION", "Заблокированная сессия не содержит blocker.");
    const required = state.execution.actions.filter((entry) => entry.required);
    const completedRequired = required.filter((entry) => entry.status === "completed").length;
    const percent = required.length ? Math.floor((completedRequired * 100) / required.length) : 100;
    if (state.currentPosition.completedRequiredCount !== completedRequired || state.currentPosition.totalRequiredCount !== required.length || state.currentPosition.progressPercent !== percent) invalid("INVALID_IMPORT_EXECUTION_SESSION", "Текущий прогресс сессии рассчитан неверно.");
    if (state.status === "completed" && completedRequired !== required.length) invalid("INVALID_IMPORT_EXECUTION_SESSION", "Завершённая сессия содержит незавершённые обязательные действия.");
  }

  function patternExecutionStepSnapshotFingerprint(snapshot) {
    const payload = clone(snapshot);
    delete payload.snapshotFingerprint;
    return fnv1a32Fingerprint(payload);
  }

  function patternExecutionStepFingerprint(state) {
    const payload = clone(state);
    delete payload.stepFingerprint;
    if (payload.validation) {
      payload.validation = {
        valid: payload.validation.valid,
        stale: payload.validation.stale,
      };
    }
    return fnv1a32Fingerprint(payload);
  }

  function validateImportedPatternExecutionStep(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const statuses = new Set(["waiting", "ready", "active", "paused", "checking", "completed", "blocked", "stale", "failed"]);
    const progressTypes = new Set(["binary", "counter", "rows", "stitches", "measurement", "checkpoint", "timed", "informational"]);
    if (
      !state || state.kind !== "PATTERN_EXECUTION_STEP" || state.schemaVersion !== 1 || state.version !== 1 ||
      state.projectId !== sourceProjectId || !statuses.has(state.status) ||
      !Number.isInteger(state.revision) || state.revision < 1 || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt) ||
      !state.id || !state.sourceSessionId || !state.sourcePlanId || !state.phaseId || !state.actionId ||
      !Number.isInteger(state.sourceSessionRevision) || state.sourceSessionRevision < 1 ||
      !Number.isInteger(state.sourcePlanRevision) || state.sourcePlanRevision < 1 ||
      !Number.isInteger(state.sourceImportRevision) || state.sourceImportRevision < 1 ||
      !state.immutableSnapshot || !state.progressState || !state.completionState || !state.lifecycle ||
      !Array.isArray(state.blockers) || !Array.isArray(state.audit) || state.audit.length > 24 || !Array.isArray(state.operations)
    ) invalid("INVALID_IMPORT_EXECUTION_STEP", "Импортируемая запись исполняемого шага повреждена.");
    if (!progressTypes.has(state.progressState.type) || state.lifecycle.state !== state.status) {
      invalid("INVALID_IMPORT_EXECUTION_STEP", "Lifecycle или progress исполняемого шага повреждён.");
    }
    if (state.immutableSnapshot.snapshotFingerprint !== patternExecutionStepSnapshotFingerprint(state.immutableSnapshot)) {
      invalid("INVALID_IMPORT_EXECUTION_STEP_FINGERPRINT", "Immutable snapshot исполняемого шага изменён.");
    }
    if (state.stepFingerprint !== patternExecutionStepFingerprint(state)) {
      invalid("INVALID_IMPORT_EXECUTION_STEP_FINGERPRINT", "Fingerprint исполняемого шага не совпадает.");
    }
    if (["counter", "rows", "stitches"].includes(state.progressState.type)) {
      const value = state.progressState.current;
      const target = state.progressState.target;
      if (!Number.isInteger(value) || value < 0 || target !== null && (!Number.isInteger(target) || target < 0) || target !== null && value > target && !state.progressState.allowExceedTarget) {
        invalid("INVALID_IMPORT_EXECUTION_STEP", "Числовой progress исполняемого шага повреждён.");
      }
    }
    if (state.progressState.type === "checkpoint" && !Array.isArray(state.progressState.criteria)) {
      invalid("INVALID_IMPORT_EXECUTION_STEP", "Checkpoint progress исполняемого шага повреждён.");
    }
    if (state.status === "completed" && (state.completionState.status !== "completed" || !["user", "checkpoint"].includes(state.completionState.completedBy))) {
      invalid("INVALID_IMPORT_EXECUTION_STEP", "Завершение исполняемого шага не доказано.");
    }
  }

  function patternExecutionCheckpointSnapshotFingerprint(snapshot) {
    const payload = clone(snapshot);
    delete payload.snapshotFingerprint;
    return fnv1a32Fingerprint(payload);
  }

  function patternExecutionCheckpointFingerprint(state) {
    const payload = clone(state);
    delete payload.checkpointFingerprint;
    if (payload.validation) {
      payload.validation = {
        valid: payload.validation.valid,
        complete: payload.validation.complete,
        matchesExpected: payload.validation.matchesExpected,
        stale: payload.validation.stale,
      };
    }
    return fnv1a32Fingerprint(payload);
  }

  function validateImportedPatternExecutionCheckpoint(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const statuses = new Set(["waiting", "ready", "reviewing", "deferred", "rejected", "sync_pending", "confirmed", "blocked", "stale", "failed"]);
    if (
      !state || state.kind !== "PATTERN_EXECUTION_CHECKPOINT" || state.schemaVersion !== 1 || state.version !== 1 ||
      state.projectId !== sourceProjectId || !statuses.has(state.status) || !state.id || !state.sourceSessionId ||
      !state.sourcePlanId || !state.sourceStepId || !state.phaseId || !state.actionId || !state.checkpointId ||
      !Number.isInteger(state.revision) || state.revision < 1 || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt) ||
      !state.identityChain || !state.immutableSourceSnapshot || !state.lifecycle || !state.decision || !state.synchronization ||
      !Array.isArray(state.observations) || !Array.isArray(state.audit) || state.audit.length > 32 ||
      !Array.isArray(state.operations) || state.operations.length > 96
    ) invalid("INVALID_IMPORT_EXECUTION_CHECKPOINT", "Импортируемый Stage 25 повреждён.");
    if (state.lifecycle.state !== state.status) invalid("INVALID_IMPORT_EXECUTION_CHECKPOINT", "Lifecycle Stage 25 повреждён.");
    if (state.immutableSourceSnapshot.snapshotFingerprint !== patternExecutionCheckpointSnapshotFingerprint(state.immutableSourceSnapshot)) invalid("INVALID_IMPORT_EXECUTION_CHECKPOINT_FINGERPRINT", "Immutable snapshot Stage 25 изменён.");
    if (state.checkpointFingerprint !== patternExecutionCheckpointFingerprint(state)) invalid("INVALID_IMPORT_EXECUTION_CHECKPOINT_FINGERPRINT", "Fingerprint Stage 25 не совпадает.");
  }

  function patternExecutionProgressSnapshotFingerprint(snapshot) {
    return fnv1a32Fingerprint(snapshot);
  }

  function patternExecutionProgressFingerprint(state) {
    const payload = clone(state);
    delete payload.progressFingerprint;
    if (payload.validation) {
      payload.validation = {
        valid: payload.validation.valid,
        stale: payload.validation.stale,
      };
    }
    return fnv1a32Fingerprint(payload);
  }

  function validateImportedPatternExecutionProgress(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const statuses = new Set(["waiting", "building", "ready", "blocked", "stale", "failed"]);
    if (
      !state || state.kind !== "PATTERN_EXECUTION_PROGRESS" || state.schemaVersion !== 1 || state.version !== 1 ||
      state.projectId !== sourceProjectId || !statuses.has(state.status) || !state.id ||
      !Number.isInteger(state.revision) || state.revision < 1 || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt) ||
      !state.counts || !state.counts.steps || !state.counts.checkpoints ||
      !Array.isArray(state.blockers) || !Array.isArray(state.staleReasons) ||
      !Array.isArray(state.audit) || state.audit.length > 32 || !Array.isArray(state.operations) || state.operations.length > 96
    ) invalid("INVALID_IMPORT_EXECUTION_PROGRESS", "Импортируемый агрегированный progress повреждён.");
    if (state.immutableSnapshot) {
      if (state.immutableSnapshotFingerprint !== patternExecutionProgressSnapshotFingerprint(state.immutableSnapshot)) {
        invalid("INVALID_IMPORT_EXECUTION_PROGRESS_FINGERPRINT", "Immutable snapshot агрегированного progress изменён.");
      }
    } else if (!["waiting", "building", "failed"].includes(state.status)) {
      invalid("INVALID_IMPORT_EXECUTION_PROGRESS", "Агрегированный progress не содержит immutable snapshot.");
    }
    if (state.progressFingerprint !== patternExecutionProgressFingerprint(state)) {
      invalid("INVALID_IMPORT_EXECUTION_PROGRESS_FINGERPRINT", "Fingerprint агрегированного progress не совпадает.");
    }
    const stepKeys = ["waiting", "ready", "active", "paused", "blocked", "completed", "stale", "failed", "skipped"];
    const checkpointKeys = ["pending", "reviewing", "passed", "failed"];
    const validCount = (value) => Number.isInteger(value) && value >= 0;
    if (
      !validCount(state.counts.phases?.total) || !validCount(state.counts.steps.total) ||
      stepKeys.some((key) => !validCount(state.counts.steps[key])) ||
      stepKeys.reduce((sum, key) => sum + state.counts.steps[key], 0) !== state.counts.steps.total ||
      !validCount(state.counts.checkpoints.total) || checkpointKeys.some((key) => !validCount(state.counts.checkpoints[key])) ||
      checkpointKeys.reduce((sum, key) => sum + state.counts.checkpoints[key], 0) !== state.counts.checkpoints.total
    ) invalid("INVALID_IMPORT_EXECUTION_PROGRESS", "Counts агрегированного progress противоречивы.");
    if (state.status === "ready" && state.blockers.length || state.status === "blocked" && !state.blockers.length || state.status === "stale" && !state.staleReasons.length) {
      invalid("INVALID_IMPORT_EXECUTION_PROGRESS", "Lifecycle агрегированного progress противоречив.");
    }
  }

  function patternExecutionCompletionFingerprint(snapshot) {
    const payload = clone(snapshot);
    delete payload.completionFingerprint;
    delete payload.completionId;
    delete payload.createdAt;
    return fnv1a32Fingerprint(payload);
  }

  function validateImportedPatternExecutionCompletion(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const statuses = new Set(["waiting", "verifying", "ready", "blocked", "failed", "stale"]);
    if (
      !state || state.kind !== "PATTERN_EXECUTION_COMPLETION" || state.schemaVersion !== 1 || state.version !== 1 ||
      state.sourceSchemaVersion !== 1 || state.projectId !== sourceProjectId || !statuses.has(state.status) || !state.id ||
      !Number.isInteger(state.revision) || state.revision < 1 || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt) ||
      !state.verification || !Array.isArray(state.blockers) || !Array.isArray(state.warnings) || !Array.isArray(state.staleReasons) ||
      !Array.isArray(state.audit) || state.audit.length > 32 || !Array.isArray(state.operations) || state.operations.length > 96
    ) invalid("INVALID_IMPORT_EXECUTION_COMPLETION", "Импортируемый Stage 27 повреждён.");
    if (state.status === "ready") {
      const snapshot = state.completionSnapshot;
      if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.sourceSchemaVersion !== 1 || snapshot.executionStatus !== "completed" ||
          snapshot.completionFingerprint !== patternExecutionCompletionFingerprint(snapshot) || state.completionFingerprint !== snapshot.completionFingerprint ||
          !Array.isArray(snapshot.phaseSummaries) || !Array.isArray(snapshot.stepSummaries) || !Array.isArray(snapshot.checkpointSummaries) ||
          !Array.isArray(snapshot.warnings) || !Array.isArray(snapshot.blockers)) {
        invalid("INVALID_IMPORT_EXECUTION_COMPLETION_FINGERPRINT", "Completion snapshot или fingerprint Stage 27 повреждён.");
      }
      if (state.blockers.length) invalid("INVALID_IMPORT_EXECUTION_COMPLETION", "Ready completion содержит blockers.");
    }
    if (state.status === "blocked" && !state.blockers.length || state.status === "failed" && !state.failure || state.status === "stale" && !state.staleReasons.length || state.status === "verifying" && !state.interruptedOperation) {
      invalid("INVALID_IMPORT_EXECUTION_COMPLETION", "Lifecycle Stage 27 противоречив.");
    }
  }

  function patternExecutionResultFingerprint(snapshot) {
    const payload = clone(snapshot);
    delete payload.fingerprint;
    delete payload.generatedAt;
    delete payload.resultRevision;
    return fnv1a32Fingerprint(payload);
  }

  function validateImportedPatternExecutionResult(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const statuses = new Set(["waiting", "generating", "ready", "blocked", "stale", "failed"]);
    if (
      !state || state.kind !== "PATTERN_EXECUTION_RESULT" || state.schemaVersion !== 1 || state.version !== 1 ||
      state.sourceSchemaVersion !== 1 || state.projectId !== sourceProjectId || !statuses.has(state.status) || !state.id ||
      !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.resultRevision) || state.resultRevision < 0 ||
      !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt) || !Array.isArray(state.blockers) ||
      !Array.isArray(state.warnings) || !Array.isArray(state.staleReasons) || !Array.isArray(state.audit) || state.audit.length > 32 ||
      !Array.isArray(state.operations) || state.operations.length > 96
    ) invalid("INVALID_IMPORT_EXECUTION_RESULT", "Импортируемый итоговый результат повреждён.");
    if (state.resultSnapshot) {
      const snapshot = state.resultSnapshot;
      const arrays = ["completedSteps", "completedActions", "confirmedCheckpoints", "actualParameters", "plannedParameters", "deviations", "warnings", "notes"];
      if (
        snapshot.schemaVersion !== 1 || !snapshot.resultId || snapshot.projectId !== sourceProjectId || !snapshot.sessionId ||
        !Number.isInteger(snapshot.resultRevision) || snapshot.resultRevision < 1 || !snapshot.sourceIdentity || !snapshot.planSummary ||
        !snapshot.executionSummary || !snapshot.completionReference || arrays.some((key) => !Array.isArray(snapshot[key])) ||
        !isTimestamp(snapshot.generatedAt) || snapshot.fingerprint !== patternExecutionResultFingerprint(snapshot) ||
        state.resultFingerprint !== snapshot.fingerprint || state.resultRevision !== snapshot.resultRevision
      ) invalid("INVALID_IMPORT_EXECUTION_RESULT_FINGERPRINT", "Итоговый snapshot или fingerprint повреждён.");
    } else if (state.resultFingerprint !== null || state.resultRevision !== 0) {
      invalid("INVALID_IMPORT_EXECUTION_RESULT", "Пустая запись результата содержит несогласованную revision.");
    }
    if (
      state.status === "ready" && (!state.resultSnapshot || state.blockers.length) ||
      state.status === "blocked" && !state.blockers.length ||
      state.status === "failed" && !state.failure ||
      state.status === "stale" && !state.staleReasons.length ||
      state.status === "generating" && !state.interruptedOperation
    ) invalid("INVALID_IMPORT_EXECUTION_RESULT", "Lifecycle итогового результата противоречив.");
  }

  function patternExecutionRuntimeActionFingerprint(action) {
    return fnv1a32Fingerprint({
      id: action.id,
      ordinal: action.ordinal,
      sourceReference: action.sourceReference,
      title: action.title,
      payload: action.payload,
      prerequisiteIds: action.prerequisiteIds,
      required: action.required,
      allowSkip: action.allowSkip,
    });
  }

  function patternExecutionRuntimeFingerprint(state) {
    return fnv1a32Fingerprint({
      schemaVersion: state.schemaVersion,
      sourceSchemaVersion: state.sourceSchemaVersion,
      projectId: state.projectId,
      type: state.type,
      epoch: state.epoch,
      sourceResultId: state.sourceResultId,
      sourceResultRevision: state.sourceResultRevision,
      sourceResultFingerprint: state.sourceResultFingerprint,
      sourceExecutionId: state.sourceExecutionId,
      sourcePlanId: state.sourcePlanId,
      sourceIdentity: state.sourceIdentity,
      actions: state.actions.map((action) => ({
        id: action.id,
        ordinal: action.ordinal,
        sourceReference: action.sourceReference,
        title: action.title,
        payload: action.payload,
        prerequisiteIds: action.prerequisiteIds,
        required: action.required,
        allowSkip: action.allowSkip,
        fingerprint: action.fingerprint,
      })),
    });
  }

  function validateImportedPatternExecutionRuntime(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const runtimeStatuses = new Set(["waiting", "ready", "running", "paused", "blocked", "recovering", "completed", "failed", "stopped", "stale"]);
    const actionStatuses = new Set(["pending", "ready", "running", "paused", "completed", "blocked", "failed", "skipped"]);
    const arrays = ["actions", "completedActionIds", "failedActionIds", "skippedActionIds", "blockedActionIds", "staleReasons", "audit", "operations"];
    if (
      !state || state.type !== "PATTERN_EXECUTION_RUNTIME" || state.kind !== "PATTERN_EXECUTION_RUNTIME" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.sourceSchemaVersion !== 1 ||
      state.projectId !== sourceProjectId || !state.id || !runtimeStatuses.has(state.status) ||
      !Number.isInteger(state.epoch) || state.epoch < 1 || !Number.isInteger(state.revision) || state.revision < 1 ||
      !state.sourceResultId || !Number.isInteger(state.sourceResultRevision) || state.sourceResultRevision < 1 ||
      !state.sourceResultFingerprint || !state.sourceExecutionId || !state.sourcePlanId || !state.sourceIdentity ||
      arrays.some((field) => !Array.isArray(state[field])) || state.actions.length === 0 ||
      state.audit.length > 64 || state.operations.length > 128 ||
      !Number.isInteger(state.cursor) || state.cursor < 0 || state.cursor > state.actions.length ||
      !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt)
    ) invalid("INVALID_IMPORT_EXECUTION_RUNTIME", "Импортируемый runtime повреждён.");
    for (const field of ["startedAt", "pausedAt", "completedAt", "failedAt", "stoppedAt"]) {
      if (state[field] !== null && !isTimestamp(state[field])) invalid("INVALID_IMPORT_EXECUTION_RUNTIME", "Runtime содержит повреждённый timestamp.");
    }
    const ids = new Set();
    state.actions.forEach((action, index) => {
      if (
        !action || !action.id || ids.has(action.id) || action.ordinal !== index + 1 || !actionStatuses.has(action.state) ||
        !action.sourceReference || typeof action.title !== "string" || !action.title.trim() || !Object.hasOwn(action, "payload") ||
        !Array.isArray(action.prerequisiteIds) || typeof action.required !== "boolean" || typeof action.allowSkip !== "boolean" ||
        !Number.isInteger(action.attempt) || action.attempt < 0 || action.fingerprint !== patternExecutionRuntimeActionFingerprint(action)
      ) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_ACTION", "Runtime action повреждён.");
      for (const field of ["startedAt", "completedAt", "failedAt"]) {
        if (action?.[field] !== null && !isTimestamp(action?.[field])) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_ACTION", "Runtime action содержит повреждённый timestamp.");
      }
      ids.add(action.id);
    });
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
      if (visiting.has(id)) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_GRAPH", "Prerequisite graph содержит цикл.");
      if (visited.has(id)) return;
      visiting.add(id);
      const action = state.actions.find((entry) => entry.id === id);
      for (const prerequisiteId of action?.prerequisiteIds || []) {
        if (!ids.has(prerequisiteId)) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_GRAPH", "Prerequisite ссылается на неизвестный action.");
        visit(prerequisiteId);
      }
      visiting.delete(id);
      visited.add(id);
    };
    state.actions.forEach((action) => visit(action.id));
    const projection = (actionState) => state.actions.filter((action) => action.state === actionState).map((action) => action.id).sort();
    const same = (left, right) => canonicalize([...left].sort()) === canonicalize([...right].sort());
    if (
      !same(state.completedActionIds, projection("completed")) || !same(state.failedActionIds, projection("failed")) ||
      !same(state.skippedActionIds, projection("skipped")) || !same(state.blockedActionIds, projection("blocked"))
    ) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_PROJECTION", "Runtime state projections противоречат actions.");
    const unresolved = state.actions.findIndex((action) => !["completed", "skipped"].includes(action.state));
    const expectedCursor = unresolved < 0 ? state.actions.length : unresolved;
    if (state.cursor !== expectedCursor) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_CURSOR", "Runtime cursor противоречит actions.");
    const active = state.activeActionId ? state.actions.find((action) => action.id === state.activeActionId) : null;
    if (state.activeActionId && (!active || !["running", "paused", "blocked"].includes(active.state))) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_ACTIVE_ACTION", "Active action повреждён.");
    if (["completed", "failed", "stopped", "stale"].includes(state.status) && state.actions.some((action) => action.state === "running")) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_LIFECYCLE", "Терминальный runtime содержит running action.");
    if (state.status === "completed" && state.actions.some((action) => action.required && action.state !== "completed")) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_LIFECYCLE", "Completed runtime содержит незавершённый обязательный action.");
    if (state.status === "failed" && !state.lastError || state.status === "stale" && !state.staleReasons.length) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_LIFECYCLE", "Lifecycle runtime противоречив.");
    const sourceIdentityPayload = clone(state.sourceIdentity);
    delete sourceIdentityPayload.sourceIdentityFingerprint;
    if (state.sourceIdentity.sourceIdentityFingerprint !== fnv1a32Fingerprint(sourceIdentityPayload)) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_IDENTITY", "Runtime source identity fingerprint повреждён.");
    if (state.runtimeFingerprint !== patternExecutionRuntimeFingerprint(state)) invalid("INVALID_IMPORT_EXECUTION_RUNTIME_FINGERPRINT", "Runtime fingerprint повреждён.");
    const runtimeApi = global.YarnAIPatternExecutionRuntime;
    if (runtimeApi?.validateRuntime) {
      const report = runtimeApi.validateRuntime(state);
      if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_RUNTIME", "Runtime не прошёл повторную доменную validation.");
    }
  }

  function patternExecutionMonitoringSourceIdentityFingerprint(identity) {
    const payload = clone(identity);
    delete payload.sourceIdentityFingerprint;
    return fnv1a32Fingerprint(payload);
  }

  function patternExecutionMonitoringRecommendedActionFingerprint(action) {
    const payload = clone(action);
    delete payload.fingerprint;
    return fnv1a32Fingerprint(payload);
  }

  function patternExecutionMonitoringTimelineFingerprint(entry) {
    return fnv1a32Fingerprint({
      eventType: entry.eventType,
      runtimeRevision: entry.runtimeRevision,
      actionId: entry.actionId,
      stepId: entry.stepId,
      checkpointId: entry.checkpointId,
      status: entry.status,
      timestamp: entry.timestamp,
      reason: entry.reason,
    });
  }

  function patternExecutionMonitoringFingerprint(state) {
    return fnv1a32Fingerprint({
      schemaVersion: state.schemaVersion,
      sourceSchemaVersion: state.sourceSchemaVersion,
      id: state.id,
      projectId: state.projectId,
      type: state.type,
      revision: state.revision,
      epoch: state.epoch,
      lifecycle: state.lifecycle,
      sourceIdentity: state.sourceIdentity,
      runtimeSummary: state.runtimeSummary,
      progressSummary: state.progressSummary,
      currentActivity: state.currentActivity,
      blockers: state.blockers,
      warnings: state.warnings,
      diagnostics: state.diagnostics,
      recommendedAction: state.recommendedAction,
      timeline: state.timeline,
      lastObservationFingerprint: state.lastObservationFingerprint,
    });
  }

  function validateImportedPatternExecutionMonitoring(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const lifecycles = new Set(["waiting", "observing", "healthy", "attention_required", "blocked", "completed", "failed", "stale"]);
    const activities = new Set(["running", "paused", "recovering", "blocked", "waiting", "completed", "failed", "stopped", "stale", "none"]);
    const recommendations = new Set(["open_runtime", "resume_runtime", "review_paused_action", "resolve_blocker", "retry_recovery", "rebuild_runtime", "review_result", "inspect_failure", "no_action_required"]);
    const arrays = ["blockers", "warnings", "diagnostics", "timeline", "audit", "operations"];
    if (
      !state || state.type !== "PATTERN_EXECUTION_MONITORING" || state.kind !== "PATTERN_EXECUTION_MONITORING" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.sourceSchemaVersion !== 1 ||
      state.projectId !== sourceProjectId || !state.id || !Number.isInteger(state.revision) || state.revision < 1 ||
      !Number.isInteger(state.epoch) || state.epoch < 1 || !state.lifecycle || !lifecycles.has(state.lifecycle.state) ||
      !state.sourceIdentity || !state.runtimeSummary || !state.progressSummary || !state.currentActivity ||
      !state.recommendedAction || arrays.some((field) => !Array.isArray(state[field])) ||
      state.timeline.length > 32 || state.audit.length > 24 || state.operations.length > 64 ||
      !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt) ||
      !activities.has(state.currentActivity.status) || !recommendations.has(state.recommendedAction.type)
    ) invalid("INVALID_IMPORT_EXECUTION_MONITORING", "Импортируемый monitoring snapshot повреждён.");
    if (state.lifecycle.previousState !== null && !lifecycles.has(state.lifecycle.previousState)) invalid("INVALID_IMPORT_EXECUTION_MONITORING_LIFECYCLE", "Lifecycle monitoring snapshot повреждён.");
    if (state.lifecycle.observedAt !== null && !isTimestamp(state.lifecycle.observedAt)) invalid("INVALID_IMPORT_EXECUTION_MONITORING_LIFECYCLE", "Lifecycle monitoring содержит повреждённый timestamp.");
    if (state.sourceIdentity.sourceIdentityFingerprint !== patternExecutionMonitoringSourceIdentityFingerprint(state.sourceIdentity)) invalid("INVALID_IMPORT_EXECUTION_MONITORING_IDENTITY", "Source identity monitoring snapshot повреждена.");
    const progress = state.progressSummary;
    const runtime = state.runtimeSummary;
    const numericFields = ["totalSteps", "completedSteps", "currentStepIndex", "completedPercent", "totalCheckpoints", "completedCheckpoints", "blockedCount", "warningCount", "failedCount", "remainingCount"];
    if (numericFields.some((field) => !Number.isInteger(progress[field]) || progress[field] < 0) || progress.completedSteps > progress.totalSteps || progress.currentStepIndex > progress.totalSteps || progress.completedPercent > 100 || progress.completedCheckpoints > progress.totalCheckpoints) invalid("INVALID_IMPORT_EXECUTION_MONITORING_PROGRESS", "Progress monitoring snapshot противоречив.");
    const expectedPercent = progress.totalSteps === 0 ? 0 : Math.round(progress.completedSteps * 100 / progress.totalSteps);
    if (progress.completedPercent !== expectedPercent || progress.totalSteps !== runtime.totalSteps || progress.completedSteps !== runtime.completedSteps || progress.totalCheckpoints !== runtime.totalCheckpoints || progress.completedCheckpoints !== runtime.completedCheckpoints) invalid("INVALID_IMPORT_EXECUTION_MONITORING_PROGRESS", "Агрегация monitoring snapshot противоречива.");
    if (state.recommendedAction.sourceRevision !== state.sourceIdentity.runtime?.revision || state.recommendedAction.fingerprint !== patternExecutionMonitoringRecommendedActionFingerprint(state.recommendedAction)) invalid("INVALID_IMPORT_EXECUTION_MONITORING_RECOMMENDATION", "Рекомендация monitoring snapshot повреждена.");
    const timelineIds = new Set();
    state.timeline.forEach((entry, index) => {
      if (!entry?.id || entry.sequence !== index + 1 || timelineIds.has(entry.id) || !Number.isInteger(entry.runtimeRevision) || entry.runtimeRevision < 1 || !isTimestamp(entry.timestamp) || entry.id !== `monitoring-timeline:${patternExecutionMonitoringTimelineFingerprint(entry).slice(8)}`) invalid("INVALID_IMPORT_EXECUTION_MONITORING_TIMELINE", "Timeline monitoring snapshot повреждён.");
      timelineIds.add(entry.id);
    });
    if (state.fingerprint !== patternExecutionMonitoringFingerprint(state)) invalid("INVALID_IMPORT_EXECUTION_MONITORING_FINGERPRINT", "Fingerprint monitoring snapshot повреждён.");
    const monitoringApi = global.YarnAIPatternExecutionMonitoring;
    if (monitoringApi?.validateMonitoring) {
      const report = monitoringApi.validateMonitoring(state);
      if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_MONITORING", "Monitoring snapshot не прошёл повторную доменную validation.");
    }
  }

  function normalizePatternExecutionInterventionValue(value) {
    if (Array.isArray(value)) return value.map(normalizePatternExecutionInterventionValue).sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)));
    if (value && typeof value === "object") {
      const next = {};
      for (const key of Object.keys(value).sort()) next[key] = normalizePatternExecutionInterventionValue(value[key]);
      return next;
    }
    return value;
  }

  function patternExecutionInterventionIdentityFingerprint(identity) {
    const payload = normalizePatternExecutionInterventionValue(clone(identity));
    delete payload.sourceIdentityFingerprint;
    return fnv1a32Fingerprint(payload);
  }

  function normalizePatternExecutionInterventionAction(action) {
    if (!action) return null;
    return {
      id: action.id, type: action.type, label: action.label, reason: action.reason,
      sourceObservationIds: [...new Set(action.sourceObservationIds || [])].sort(),
      requiresConfirmation: action.requiresConfirmation, expectedEffect: action.expectedEffect,
      targetIdentity: normalizePatternExecutionInterventionValue(action.targetIdentity),
      priority: action.priority, impact: action.impact,
    };
  }

  function patternExecutionInterventionDecisionFingerprint(decision) {
    return fnv1a32Fingerprint({
      intervention: decision.intervention,
      selectedAction: normalizePatternExecutionInterventionAction(decision.selectedAction),
      sourceMonitoringIdentity: decision.sourceMonitoringIdentity,
      targetIdentity: normalizePatternExecutionInterventionValue(decision.targetIdentity),
      reason: decision.reason,
      expectedEffect: decision.expectedEffect,
      confirmation: decision.confirmation ? { confirmedBy: decision.confirmation.confirmedBy, method: decision.confirmation.method, sourceVerified: decision.confirmation.sourceVerified } : null,
      sourceObservationIds: [...new Set(decision.sourceObservationIds || [])].sort(),
      runtimeActionExecuted: false,
      effectApplied: false,
    });
  }

  function patternExecutionInterventionFingerprint(state) {
    const stableIssues = (values) => [...(values || [])].map(clone).sort((left, right) => String(left.code || "").localeCompare(String(right.code || "")) || canonicalize(left.details || {}).localeCompare(canonicalize(right.details || {})));
    const actions = [...(state.actions || [])].map((entry) => ({ ...clone(entry), sourceObservationIds: [...new Set(entry.sourceObservationIds || [])].sort(), targetIdentity: normalizePatternExecutionInterventionValue(entry.targetIdentity) })).sort((left, right) => String(left.type || "").localeCompare(String(right.type || "")));
    const recommendation = state.recommendation ? { ...clone(state.recommendation), sourceObservationIds: [...new Set(state.recommendation.sourceObservationIds || [])].sort(), targetIdentity: normalizePatternExecutionInterventionValue(state.recommendation.targetIdentity) } : null;
    const decision = state.decision ? clone(state.decision) : null;
    if (decision?.confirmation) delete decision.confirmation.confirmedAt;
    if (decision) {
      decision.selectedAction = normalizePatternExecutionInterventionAction(decision.selectedAction);
      decision.sourceObservationIds = [...new Set(decision.sourceObservationIds || [])].sort();
      decision.targetIdentity = normalizePatternExecutionInterventionValue(decision.targetIdentity);
    }
    return fnv1a32Fingerprint({
      schemaVersion: state.schemaVersion, sourceSchemaVersion: state.sourceSchemaVersion,
      projectId: state.projectId, type: state.type, revision: state.revision, epoch: state.epoch,
      lifecycle: state.lifecycle ? { state: state.lifecycle.state, previousState: state.lifecycle.previousState } : null,
      monitoringStatus: state.monitoringStatus, requiresIntervention: state.requiresIntervention,
      assessmentReason: state.assessmentReason,
      sourceIdentity: normalizePatternExecutionInterventionValue(state.sourceIdentity),
      sourceEvidence: normalizePatternExecutionInterventionValue(state.sourceEvidence),
      observations: [...(state.observations || [])].map(clone).sort((left, right) => String(left.id || "").localeCompare(String(right.id || ""))),
      blockers: stableIssues(state.blockers), warnings: stableIssues(state.warnings), actions,
      recommendation,
      selectedAction: normalizePatternExecutionInterventionAction(state.selectedAction),
      confirmation: state.confirmation ? { confirmedBy: state.confirmation.confirmedBy, method: state.confirmation.method, sourceVerified: state.confirmation.sourceVerified, sourceIdentityFingerprint: state.confirmation.sourceIdentityFingerprint } : null,
      decision,
      previousEpoch: state.previousEpoch || null,
      importedDiagnostic: state.importedDiagnostic || null,
    });
  }

  function remapImportedPatternExecutionIntervention(state, referenceMap) {
    const next = clone(state);
    const previousObservationIds = (next.observations || []).map((entry) => entry.id);
    remapExactReferences(next, referenceMap);
    next.sourceIdentity.sourceIdentityFingerprint = patternExecutionInterventionIdentityFingerprint(next.sourceIdentity);
    const observationMap = new Map();
    next.observations = (next.observations || []).map((entry, index) => {
      const core = clone(entry); delete core.id;
      const id = `intervention-observation:${fnv1a32Fingerprint(core).slice(8)}`;
      observationMap.set(previousObservationIds[index], id);
      return { id, ...core };
    }).sort((left, right) => left.id.localeCompare(right.id));
    const remapObservationIds = (values) => [...new Set((values || []).map((id) => observationMap.get(id) || id))].sort();
    next.actions = (next.actions || []).map((action) => ({ ...action, sourceObservationIds: remapObservationIds(action.sourceObservationIds) })).sort((left, right) => left.type.localeCompare(right.type));
    if (next.recommendation) next.recommendation.sourceObservationIds = remapObservationIds(next.recommendation.sourceObservationIds);
    if (next.selectedAction) next.selectedAction.sourceObservationIds = remapObservationIds(next.selectedAction.sourceObservationIds);
    if (next.decision) {
      next.decision.sourceObservationIds = remapObservationIds(next.decision.sourceObservationIds);
      next.decision.selectedAction.sourceObservationIds = remapObservationIds(next.decision.selectedAction.sourceObservationIds);
      next.decision.fingerprint = patternExecutionInterventionDecisionFingerprint(next.decision);
    }
    next.fingerprint = patternExecutionInterventionFingerprint(next);
    return next;
  }

  function makeImportedPatternExecutionInterventionStale(state, timestamp, collision) {
    const next = clone(state);
    const previousLifecycle = next.lifecycle.state;
    const diagnostic = { fingerprint: next.fingerprint, lifecycle: previousLifecycle, selectedActionId: next.selectedAction?.id || null, decisionFingerprint: next.decision?.fingerprint || null };
    next.revision += 1; next.updatedAt = timestamp;
    next.lifecycle = { state: "stale", previousState: previousLifecycle, assessedAt: next.lifecycle.assessedAt || timestamp };
    next.monitoringStatus = "stale"; next.requiresIntervention = true;
    next.assessmentReason = "Imported identity не доказана; executable intent удалён до явного rebuild.";
    const issueCore = { code: "import_identity_unproven", message: "Imported intervention сохранён в безопасном stale-состоянии.", details: {} };
    const issue = { id: `intervention-issue:${fnv1a32Fingerprint(issueCore).slice(8)}`, code: issueCore.code, source: "source", message: issueCore.message, details: {} };
    const issueMap = new Map((next.blockers || []).map((entry) => [`${entry.code}|${entry.source}|${canonicalize(entry.details || {})}`, entry]));
    issueMap.set(`${issue.code}|${issue.source}|${canonicalize(issue.details)}`, issue);
    next.blockers = [...issueMap.values()].sort((left, right) => left.code.localeCompare(right.code) || canonicalize(left.details || {}).localeCompare(canonicalize(right.details || {})));
    const allObservationIds = [...new Set((next.observations || []).map((entry) => entry.id))].sort();
    const blockerObservationIds = [...new Set((next.observations || []).filter((entry) => ["blocker", "warning"].includes(entry.kind)).map((entry) => entry.id))].sort();
    next.actions = (next.actions || []).map((action) => ({
      ...action, reason: `stale:${action.type}`,
      sourceObservationIds: ["review_blocker", "resolve_blocker", "return_to_checkpoint"].includes(action.type) ? blockerObservationIds : allObservationIds,
      eligible: false, blockedReason: "monitoring_is_stale_rebuild_intervention_required",
      priority: action.type === "no_action" ? 50 : action.priority,
    })).sort((left, right) => left.type.localeCompare(right.type));
    next.recommendation = null; next.selectedAction = null; next.confirmation = null; next.decision = null;
    next.importedDiagnostic = diagnostic;
    const auditDetails = { originalFingerprint: diagnostic.fingerprint, collision: Boolean(collision) };
    const auditCore = { event: "intervention_imported_stale", revision: next.revision, epoch: next.epoch, details: normalizePatternExecutionInterventionValue(auditDetails) };
    next.audit = [...(next.audit || []), { id: `intervention-audit:${fnv1a32Fingerprint(auditCore).slice(8)}`, ...auditCore, at: timestamp }].slice(-32);
    next.fingerprint = patternExecutionInterventionFingerprint(next);
    return next;
  }

  function validateImportedPatternExecutionIntervention(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const lifecycles = new Set(["waiting", "assessing", "ready", "confirmation_required", "confirmed", "cancelled", "completed", "blocked", "failed", "stale"]);
    const monitoringStates = new Set(["healthy", "attention_required", "blocked", "completed", "failed", "stale"]);
    const actionTypes = new Set(["no_action", "acknowledge", "resume_runtime", "pause_runtime", "retry_runtime", "recover_runtime", "review_blocker", "resolve_blocker", "return_to_checkpoint", "rebuild_runtime", "stop_runtime", "accept_completion", "inspect_failure", "rebuild_monitoring"]);
    const arrays = ["observations", "blockers", "warnings", "actions", "audit", "operations"];
    if (
      !state || state.type !== "PATTERN_EXECUTION_INTERVENTION" || state.kind !== "PATTERN_EXECUTION_INTERVENTION" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.sourceSchemaVersion !== 1 ||
      state.projectId !== sourceProjectId || !state.id || !Number.isInteger(state.revision) || state.revision < 1 ||
      !Number.isInteger(state.epoch) || state.epoch < 1 || !state.lifecycle || !lifecycles.has(state.lifecycle.state) ||
      state.monitoringStatus !== null && !monitoringStates.has(state.monitoringStatus) || !state.sourceIdentity || !state.sourceEvidence ||
      arrays.some((field) => !Array.isArray(state[field])) || state.actions.length !== actionTypes.size ||
      state.audit.length > 32 || state.operations.length > 64 || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt) ||
      typeof state.fingerprint !== "string" || !/^fnv1a32:[0-9a-f]{8}$/.test(state.fingerprint)
    ) invalid("INVALID_IMPORT_EXECUTION_INTERVENTION", "Импортируемый intervention snapshot повреждён.");
    const seenActions = new Set();
    for (const action of state.actions) {
      if (!action || !actionTypes.has(action.type) || action.id !== `intervention-action:${action.type}` || seenActions.has(action.type) || typeof action.eligible !== "boolean" || typeof action.requiresConfirmation !== "boolean" || !Array.isArray(action.sourceObservationIds) || !Number.isInteger(action.priority) || action.priority < 1 || action.eligible && action.blockedReason !== null || !action.eligible && typeof action.blockedReason !== "string") invalid("INVALID_IMPORT_EXECUTION_INTERVENTION_ACTION", "Intervention action повреждён.");
      seenActions.add(action.type);
    }
    if (state.selectedAction && (!actionTypes.has(state.selectedAction.type) || !state.actions.some((entry) => entry.id === state.selectedAction.id && entry.eligible))) invalid("INVALID_IMPORT_EXECUTION_INTERVENTION_SELECTION", "Selected intervention action противоречиво.");
    if (["confirmation_required", "confirmed", "completed"].includes(state.lifecycle.state) && !state.selectedAction) invalid("INVALID_IMPORT_EXECUTION_INTERVENTION_LIFECYCLE", "Lifecycle intervention требует выбранное action.");
    if (["confirmed", "completed"].includes(state.lifecycle.state) && (!state.confirmation || !state.decision)) invalid("INVALID_IMPORT_EXECUTION_INTERVENTION_DECISION", "Подтверждённый intervention не содержит decision.");
    if (state.decision && (state.decision.runtimeActionExecuted !== false || state.decision.effectApplied !== false || state.decision.selectedAction?.id !== state.selectedAction?.id)) invalid("INVALID_IMPORT_EXECUTION_INTERVENTION_DECISION", "Decision не является безопасным intent snapshot.");
    if (state.lifecycle.state === "stale" && (state.selectedAction || state.confirmation || state.decision || state.actions.some((entry) => entry.eligible))) invalid("INVALID_IMPORT_EXECUTION_INTERVENTION_STALE", "Stale intervention сохраняет executable intent.");
    if (state.sourceIdentity.sourceIdentityFingerprint !== patternExecutionInterventionIdentityFingerprint(state.sourceIdentity)) invalid("INVALID_IMPORT_EXECUTION_INTERVENTION_IDENTITY", "Source identity intervention повреждена.");
    if (state.decision && state.decision.fingerprint !== patternExecutionInterventionDecisionFingerprint(state.decision)) invalid("INVALID_IMPORT_EXECUTION_INTERVENTION_DECISION", "Decision fingerprint intervention повреждён.");
    if (state.fingerprint !== patternExecutionInterventionFingerprint(state)) invalid("INVALID_IMPORT_EXECUTION_INTERVENTION_FINGERPRINT", "Fingerprint intervention snapshot повреждён.");
    const interventionApi = global.YarnAIPatternExecutionIntervention;
    if (interventionApi?.validatePatternExecutionIntervention) {
      const report = interventionApi.validatePatternExecutionIntervention(state);
      if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_INTERVENTION", "Intervention snapshot не прошёл повторную доменную validation.");
    }
  }

  function normalizePatternExecutionActionValue(value) {
    if (Array.isArray(value)) return value.map(normalizePatternExecutionActionValue).sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)));
    if (value && typeof value === "object") {
      const next = {};
      for (const key of Object.keys(value).sort()) next[key] = normalizePatternExecutionActionValue(value[key]);
      return next;
    }
    return value;
  }

  function normalizePatternExecutionActionSelected(value) {
    return value ? {
      id: value.id, type: value.type, label: value.label, reason: value.reason,
      sourceObservationIds: [...new Set(value.sourceObservationIds || [])].sort(),
      requiresConfirmation: Boolean(value.requiresConfirmation), expectedEffect: value.expectedEffect,
      targetIdentity: normalizePatternExecutionActionValue(value.targetIdentity),
      priority: value.priority, impact: value.impact,
    } : null;
  }

  function normalizePatternExecutionActionReason(value) {
    return value ? { code: String(value.code || "unspecified"), message: String(value.message || value.code || "unspecified"), details: normalizePatternExecutionActionValue(value.details || {}) } : null;
  }

  function normalizePatternExecutionActionAttempt(value) {
    return value ? { ...clone(value), evidence: normalizePatternExecutionActionValue(value.evidence || {}), error: normalizePatternExecutionActionReason(value.error) } : null;
  }

  function normalizePatternExecutionActionVerification(value) {
    return value ? { ...clone(value), targetIdentity: normalizePatternExecutionActionValue(value.targetIdentity), evidence: normalizePatternExecutionActionValue(value.evidence || {}) } : null;
  }

  function normalizePatternExecutionActionResult(value) {
    return value ? {
      ...clone(value), affectedIdentity: normalizePatternExecutionActionValue(value.affectedIdentity),
      evidence: normalizePatternExecutionActionValue(value.evidence || {}),
      warnings: [...new Set(value.warnings || [])].sort(),
      blockedReason: normalizePatternExecutionActionReason(value.blockedReason),
    } : null;
  }

  function patternExecutionActionVerificationFingerprint(value) {
    const normalized = normalizePatternExecutionActionVerification(value);
    delete normalized.fingerprint;
    return fnv1a32Fingerprint(normalized);
  }

  function patternExecutionActionFingerprint(state) {
    return fnv1a32Fingerprint({
      schemaVersion: state.schemaVersion, kind: state.kind, id: state.id,
      projectId: state.projectId, epoch: state.epoch, revision: state.revision,
      lifecycle: state.lifecycle, createdAt: state.createdAt,
      interventionIdentity: normalizePatternExecutionActionValue(state.interventionIdentity),
      interventionFingerprint: state.interventionFingerprint,
      decisionIdentity: normalizePatternExecutionActionValue(state.decisionIdentity),
      selectedAction: normalizePatternExecutionActionSelected(state.selectedAction),
      targetIdentity: normalizePatternExecutionActionValue(state.targetIdentity),
      sourceIdentity: normalizePatternExecutionActionValue(state.sourceIdentity),
      executionPlan: normalizePatternExecutionActionValue(state.executionPlan),
      currentAttempt: normalizePatternExecutionActionAttempt(state.currentAttempt),
      attemptHistory: [...(state.attemptHistory || [])].map(normalizePatternExecutionActionAttempt).sort((left, right) => (left.ordinal || 0) - (right.ordinal || 0) || String(left.attemptId || "").localeCompare(String(right.attemptId || ""))),
      verification: normalizePatternExecutionActionVerification(state.verification),
      result: normalizePatternExecutionActionResult(state.result),
      blockedReason: normalizePatternExecutionActionReason(state.blockedReason),
      failure: normalizePatternExecutionActionReason(state.failure),
      previousEpoch: normalizePatternExecutionActionValue(state.previousEpoch),
      importedDiagnostic: normalizePatternExecutionActionValue(state.importedDiagnostic),
      audit: (state.audit || []).map((entry) => ({ id: entry.id, event: entry.event, revision: entry.revision, epoch: entry.epoch, at: entry.at, details: normalizePatternExecutionActionValue(entry.details) })),
    });
  }

  function patternExecutionActionIdempotencyKey(state, ordinal) {
    return `action-idempotency:${fnv1a32Fingerprint({
      projectId: state.projectId, interventionFingerprint: state.interventionFingerprint,
      decisionFingerprint: state.decisionIdentity.fingerprint, actionType: state.selectedAction.type,
      targetIdentity: state.targetIdentity, epoch: state.epoch, ordinal,
    }).slice(8)}`;
  }

  function remapImportedPatternExecutionAction(state, referenceMap) {
    const next = clone(state);
    remapExactReferences(next, referenceMap);
    for (const attempt of [...(next.attemptHistory || []), next.currentAttempt].filter(Boolean)) {
      attempt.idempotencyKey = patternExecutionActionIdempotencyKey(next, attempt.ordinal);
      if (attempt.preconditionFingerprint) attempt.preconditionFingerprint = fnv1a32Fingerprint({ remapped: true, actionId: next.id, ordinal: attempt.ordinal, sourceIdentity: next.sourceIdentity, targetIdentity: next.targetIdentity });
    }
    if (next.result) {
      next.result.preconditionFingerprint = fnv1a32Fingerprint({ sourceState: next.result.sourceState, affectedIdentity: next.result.affectedIdentity, targetIdentity: next.targetIdentity });
      next.result.effectFingerprint = fnv1a32Fingerprint({ actionType: next.result.actionType, resultingState: next.result.resultingState, changed: next.result.changed, noOp: next.result.noOp, affectedIdentity: next.result.affectedIdentity, evidence: next.result.evidence });
      if (next.currentAttempt) next.currentAttempt.effectFingerprint = next.result.effectFingerprint;
    }
    if (next.verification?.fingerprint) next.verification.fingerprint = patternExecutionActionVerificationFingerprint(next.verification);
    next.fingerprint = patternExecutionActionFingerprint(next);
    return next;
  }

  function makeImportedPatternExecutionActionStale(state, timestamp, collision) {
    const next = clone(state);
    const original = { fingerprint: next.fingerprint, lifecycle: next.lifecycle, selectedAction: next.selectedAction?.type || null, effectApplied: next.currentAttempt?.effectApplied === true };
    next.revision += 1; next.updatedAt = timestamp; next.lifecycle = "stale";
    next.executionPlan = {
      actionType: next.selectedAction.type, executionMode: next.executionPlan.executionMode,
      targetKind: next.executionPlan.targetKind, expectedEffect: next.selectedAction.expectedEffect,
      executable: false,
    };
    if (next.currentAttempt) { next.currentAttempt.status = "stale"; next.currentAttempt.effectApplied = false; }
    next.blockedReason = { code: "import_identity_unproven", message: "import_identity_unproven", details: { executableIntentRemoved: true } };
    next.failure = null; next.importedDiagnostic = original;
    const details = { import: true, collision: Boolean(collision), originalFingerprint: original.fingerprint };
    const core = { event: "marked_stale", revision: next.revision, epoch: next.epoch, details: normalizePatternExecutionActionValue(details) };
    next.audit = [...(next.audit || []), { id: `action-audit:${fnv1a32Fingerprint(core).slice(8)}`, ...core, at: timestamp }].slice(-64);
    next.fingerprint = patternExecutionActionFingerprint(next);
    return next;
  }

  function validateImportedPatternExecutionAction(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const lifecycles = new Set(["waiting", "validating", "ready", "executing", "verifying", "completed", "blocked", "failed", "cancelled", "stale"]);
    const actions = new Set(["no_action", "acknowledge", "resume_runtime", "pause_runtime", "retry_runtime", "recover_runtime", "review_blocker", "resolve_blocker", "return_to_checkpoint", "rebuild_runtime", "stop_runtime", "accept_completion", "inspect_failure", "rebuild_monitoring"]);
    const modes = new Set(["no_op", "acknowledgement", "runtime_transition", "recovery_request", "blocker_review", "blocker_resolution", "checkpoint_return", "runtime_rebuild", "runtime_stop", "completion_acceptance", "failure_inspection", "monitoring_rebuild"]);
    const attempts = [...(state?.attemptHistory || []), state?.currentAttempt].filter(Boolean);
    if (!state || state.type !== "PATTERN_EXECUTION_ACTION" || state.kind !== "PATTERN_EXECUTION_ACTION" || state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId || !state.id || !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1 || !lifecycles.has(state.lifecycle) || !actions.has(state.selectedAction?.type) || !modes.has(state.executionPlan?.executionMode) || !state.interventionIdentity || !/^fnv1a32:[0-9a-f]{8}$/.test(state.interventionFingerprint || "") || !state.decisionIdentity || !/^fnv1a32:[0-9a-f]{8}$/.test(state.decisionIdentity.fingerprint || "") || !Array.isArray(state.attemptHistory) || !Array.isArray(state.audit) || !Array.isArray(state.operations) || state.audit.length > 64 || state.operations.length > 96 || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt)) invalid("INVALID_IMPORT_EXECUTION_ACTION", "Импортируемый execution action snapshot повреждён.");
    for (const attempt of attempts) {
      if (!attempt.attemptId || !Number.isInteger(attempt.ordinal) || attempt.ordinal < 1 || !/^fnv1a32:[0-9a-f]{8}$/.test(attempt.preconditionFingerprint || "") || !attempt.idempotencyKey || typeof attempt.effectApplied !== "boolean" || typeof attempt.runtimeActionExecuted !== "boolean" || attempt.effectApplied && !attempt.runtimeActionExecuted) invalid("INVALID_IMPORT_EXECUTION_ACTION_ATTEMPT", "Execution attempt повреждён.");
    }
    if (state.lifecycle === "completed" && (state.verification?.status !== "verified" || state.currentAttempt?.status !== "verified")) invalid("INVALID_IMPORT_EXECUTION_ACTION_VERIFICATION", "Completed action не имеет verified результата.");
    if (state.lifecycle === "cancelled" && (state.currentAttempt?.effectApplied === true || state.result?.changed === true)) invalid("INVALID_IMPORT_EXECUTION_ACTION_CANCELLED", "Cancelled action маскирует применённый эффект.");
    if (state.lifecycle === "stale" && state.executionPlan?.executable === true) invalid("INVALID_IMPORT_EXECUTION_ACTION_STALE", "Stale action сохраняет executable intent.");
    if (state.fingerprint !== patternExecutionActionFingerprint(state)) invalid("INVALID_IMPORT_EXECUTION_ACTION_FINGERPRINT", "Fingerprint execution action повреждён.");
    const actionApi = global.YarnAIPatternExecutionAction;
    if (actionApi?.validatePatternExecutionAction) {
      const report = actionApi.validatePatternExecutionAction(state);
      if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_ACTION", "Execution action не прошёл повторную доменную validation.");
    }
  }

  const PATTERN_EXECUTION_EVIDENCE_TYPES = [
    "ACTION_IDENTITY", "ACTION_ATTEMPT", "ADAPTER_INVOCATION", "PRE_STATE_SNAPSHOT",
    "POST_STATE_SNAPSHOT", "VERIFICATION_RESULT", "TARGET_IDENTITY", "SOURCE_CHAIN",
    "SIDE_EFFECT_BOUNDARY", "IDEMPOTENCY_PROOF", "AUDIT_PROOF", "IMPORT_SAFETY",
  ];
  const PATTERN_EXECUTION_EVIDENCE_ASSERTIONS = [
    "ACTION_WAS_VERIFIED", "ACTION_EFFECT_CONFIRMED", "ACTION_TARGET_MATCHED",
    "ACTION_ATTEMPT_MATCHED", "SOURCE_CHAIN_MATCHED", "NO_UNEXPECTED_SIDE_EFFECTS",
    "IDEMPOTENCY_KEY_MATCHED", "AUDIT_SEQUENCE_MATCHED", "IMPORT_IDENTITY_SAFE",
  ];

  function normalizePatternExecutionEvidenceValue(value) {
    if (Array.isArray(value)) return value.map(normalizePatternExecutionEvidenceValue);
    if (value && typeof value === "object") {
      const next = {};
      for (const key of Object.keys(value).sort()) next[key] = normalizePatternExecutionEvidenceValue(value[key]);
      return next;
    }
    return value;
  }

  function patternExecutionEvidenceItemFingerprint(item) {
    return fnv1a32Fingerprint({
      id: item.id, type: item.type, source: item.source,
      sourceIdentity: normalizePatternExecutionEvidenceValue(item.sourceIdentity),
      observedValue: normalizePatternExecutionEvidenceValue(item.observedValue),
      expectedValue: normalizePatternExecutionEvidenceValue(item.expectedValue),
      status: item.status, collectedAt: item.collectedAt,
    });
  }

  function patternExecutionEvidenceFingerprint(state) {
    const items = [...(state.evidenceItems || [])].map(normalizePatternExecutionEvidenceValue).sort((left, right) => PATTERN_EXECUTION_EVIDENCE_TYPES.indexOf(left.type) - PATTERN_EXECUTION_EVIDENCE_TYPES.indexOf(right.type) || String(left.id || "").localeCompare(String(right.id || "")));
    const assertions = [...(state.assertions || [])].map((entry) => ({ ...normalizePatternExecutionEvidenceValue(entry), evidenceItemIds: [...new Set(entry.evidenceItemIds || [])].sort() })).sort((left, right) => PATTERN_EXECUTION_EVIDENCE_ASSERTIONS.indexOf(left.type) - PATTERN_EXECUTION_EVIDENCE_ASSERTIONS.indexOf(right.type));
    const diagnostics = (values) => [...(values || [])].map(normalizePatternExecutionEvidenceValue).sort((left, right) => String(left.code || "").localeCompare(String(right.code || "")) || canonicalize(left.details || {}).localeCompare(canonicalize(right.details || {})));
    return fnv1a32Fingerprint({
      schemaVersion: state.schemaVersion, kind: state.kind, id: state.id,
      projectId: state.projectId, calculationId: state.calculationId,
      executionEpoch: state.executionEpoch, evidenceEpoch: state.evidenceEpoch,
      evidenceAttemptOrdinal: state.evidenceAttemptOrdinal, epoch: state.epoch,
      actionId: state.actionId, actionFingerprint: state.actionFingerprint,
      actionAttemptId: state.actionAttemptId, actionAttemptOrdinal: state.actionAttemptOrdinal,
      interventionId: state.interventionId, interventionFingerprint: state.interventionFingerprint,
      decisionId: state.decisionId, decisionFingerprint: state.decisionFingerprint,
      runtimeId: state.runtimeId, monitoringId: state.monitoringId, resultId: state.resultId,
      sourceIdentities: normalizePatternExecutionEvidenceValue(state.sourceIdentities),
      collectedSourceIdentities: normalizePatternExecutionEvidenceValue(state.collectedSourceIdentities),
      lifecycle: state.lifecycle, collectionStatus: state.collectionStatus, validationStatus: state.validationStatus,
      evidenceItems: items, assertions, unexpectedChanges: diagnostics(state.unexpectedChanges),
      missingEvidence: diagnostics(state.missingEvidence), contradictions: diagnostics(state.contradictions),
      summary: normalizePatternExecutionEvidenceValue(state.summary), previousEvidence: normalizePatternExecutionEvidenceValue(state.previousEvidence),
      revision: state.revision, createdAt: state.createdAt, collectedAt: state.collectedAt,
      validatedAt: state.validatedAt, completedAt: state.completedAt,
      importedDiagnostic: normalizePatternExecutionEvidenceValue(state.importedDiagnostic),
      audit: (state.audit || []).map((entry) => ({ id: entry.id, event: entry.event, revision: entry.revision, epoch: entry.epoch, evidenceEpoch: entry.evidenceEpoch, at: entry.at, details: normalizePatternExecutionEvidenceValue(entry.details) })),
    });
  }

  function remapImportedPatternExecutionEvidence(state, referenceMap) {
    const next = clone(state);
    remapExactReferences(next, referenceMap);
    next.evidenceItems = (next.evidenceItems || []).map((item) => {
      item.fingerprint = patternExecutionEvidenceItemFingerprint(item);
      return item;
    }).sort((left, right) => PATTERN_EXECUTION_EVIDENCE_TYPES.indexOf(left.type) - PATTERN_EXECUTION_EVIDENCE_TYPES.indexOf(right.type));
    const itemIds = new Set(next.evidenceItems.map((item) => item.id));
    next.assertions = (next.assertions || []).map((assertion) => ({
      ...assertion,
      evidenceItemIds: [...new Set(assertion.evidenceItemIds || [])].filter((id) => itemIds.has(id)).sort(),
    })).sort((left, right) => PATTERN_EXECUTION_EVIDENCE_ASSERTIONS.indexOf(left.type) - PATTERN_EXECUTION_EVIDENCE_ASSERTIONS.indexOf(right.type));
    next.fingerprint = patternExecutionEvidenceFingerprint(next);
    return next;
  }

  function makeImportedPatternExecutionEvidenceStale(state, timestamp, collision) {
    const next = clone(state);
    const original = { id: next.id, fingerprint: next.fingerprint, epoch: next.epoch, evidenceEpoch: next.evidenceEpoch, evidenceAttemptOrdinal: next.evidenceAttemptOrdinal, lifecycle: next.lifecycle };
    next.revision += 1; next.updatedAt = timestamp; next.lifecycle = "stale"; next.validationStatus = "stale";
    next.importedDiagnostic = { reason: "import_identity_unproven", collision: Boolean(collision), original: normalizePatternExecutionEvidenceValue(original) };
    const details = { reason: "import_identity_unproven", collision: Boolean(collision) };
    const core = { event: "import_marked_stale", revision: next.revision, epoch: next.epoch, evidenceEpoch: next.evidenceEpoch, details: normalizePatternExecutionEvidenceValue(details) };
    next.audit = [...(next.audit || []), { id: `evidence-audit:${fnv1a32Fingerprint(core).slice(8)}`, ...core, at: timestamp }].slice(-64);
    next.fingerprint = patternExecutionEvidenceFingerprint(next);
    return next;
  }

  function validateImportedPatternExecutionEvidence(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const lifecycles = new Set(["waiting", "collecting", "validating", "ready", "completed", "blocked", "failed", "cancelled", "stale"]);
    const itemStatuses = new Set(["present", "missing", "invalid", "contradictory"]);
    const assertionStatuses = new Set(["passed", "failed", "unknown"]);
    if (!state || state.type !== "PATTERN_EXECUTION_EVIDENCE" || state.kind !== "PATTERN_EXECUTION_EVIDENCE" || state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId || !state.id || !state.calculationId || !state.actionId || !state.actionFingerprint || !state.actionAttemptId || !Number.isInteger(state.actionAttemptOrdinal) || state.actionAttemptOrdinal < 1 || !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1 || !Number.isInteger(state.executionEpoch) || state.executionEpoch < 1 || !Number.isInteger(state.evidenceEpoch) || state.evidenceEpoch < 1 || !Number.isInteger(state.evidenceAttemptOrdinal) || state.evidenceAttemptOrdinal < 1 || !lifecycles.has(state.lifecycle) || !Array.isArray(state.evidenceItems) || !Array.isArray(state.assertions) || !Array.isArray(state.audit) || !Array.isArray(state.operations) || state.audit.length > 64 || state.operations.length > 96 || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt)) invalid("INVALID_IMPORT_EXECUTION_EVIDENCE", "Импортируемый evidence snapshot повреждён.");
    const ids = new Set();
    for (const item of state.evidenceItems) {
      if (!item.id || ids.has(item.id) || !PATTERN_EXECUTION_EVIDENCE_TYPES.includes(item.type) || !itemStatuses.has(item.status) || !isTimestamp(item.collectedAt) || item.fingerprint !== patternExecutionEvidenceItemFingerprint(item)) invalid("INVALID_IMPORT_EXECUTION_EVIDENCE_ITEM", "Evidence item повреждён.");
      ids.add(item.id);
    }
    for (const assertion of state.assertions) if (!PATTERN_EXECUTION_EVIDENCE_ASSERTIONS.includes(assertion.type) || !assertionStatuses.has(assertion.status) || !Array.isArray(assertion.evidenceItemIds) || assertion.evidenceItemIds.some((id) => !ids.has(id))) invalid("INVALID_IMPORT_EXECUTION_EVIDENCE_ASSERTION", "Evidence assertion повреждён.");
    if (state.lifecycle === "completed" && (state.validationStatus !== "successful" || !state.completedAt || !state.summary || PATTERN_EXECUTION_EVIDENCE_ASSERTIONS.some((type) => !state.assertions.some((assertion) => assertion.type === type && assertion.status === "passed")))) invalid("INVALID_IMPORT_EXECUTION_EVIDENCE_COMPLETED", "Completed evidence не доказан.");
    if (state.fingerprint !== patternExecutionEvidenceFingerprint(state)) invalid("INVALID_IMPORT_EXECUTION_EVIDENCE_FINGERPRINT", "Fingerprint evidence повреждён.");
    const evidenceApi = global.YarnAIPatternExecutionEvidence;
    if (evidenceApi?.validatePatternExecutionEvidenceSnapshot) {
      const report = evidenceApi.validatePatternExecutionEvidenceSnapshot(state);
      if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_EVIDENCE", "Evidence не прошёл доменную validation.");
    }
  }

  function patternExecutionVerificationFingerprint(state) {
    const api = global.YarnAIPatternExecutionVerification;
    if (api?.fingerprintPatternExecutionVerification) return api.fingerprintPatternExecutionVerification(state);
    const criteria = [...(state.expectedCriteria || [])].map(normalizePatternExecutionEvidenceValue).sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || String(left.id || left.criterionId || "").localeCompare(String(right.id || right.criterionId || "")));
    const results = [...(state.criterionResults || [])].map(normalizePatternExecutionEvidenceValue).sort((left, right) => String(left.criterionId || "").localeCompare(String(right.criterionId || "")));
    const diagnostics = (values) => [...(values || [])].map(normalizePatternExecutionEvidenceValue).sort((left, right) => String(left.code || "").localeCompare(String(right.code || "")) || canonicalize(left).localeCompare(canonicalize(right)));
    return fnv1a32Fingerprint({
      schemaVersion: state.schemaVersion, version: state.version, kind: state.kind, type: state.type,
      id: state.id, projectId: state.projectId, calculationId: state.calculationId,
      actionId: state.actionId, actionRevision: state.actionRevision, actionFingerprint: state.actionFingerprint,
      evidenceIds: [...(state.evidenceIds || [])].sort(), status: state.status,
      expectedCriteria: criteria, criterionResults: results.map((entry) => ({
        ...entry,
        supportingEvidenceIds: [...new Set(entry.supportingEvidenceIds || [])].sort(),
        conflictingEvidenceIds: [...new Set(entry.conflictingEvidenceIds || [])].sort(),
      })),
      contradictions: diagnostics(state.contradictions), diagnostics: diagnostics(state.diagnostics),
      summary: normalizePatternExecutionEvidenceValue(state.summary), inputFingerprint: state.inputFingerprint,
      verifiedAt: state.verifiedAt, epoch: state.epoch, revision: state.revision,
      createdAt: state.createdAt, updatedAt: state.updatedAt,
      previousVerification: normalizePatternExecutionEvidenceValue(state.previousVerification),
      importedDiagnostic: normalizePatternExecutionEvidenceValue(state.importedDiagnostic),
    });
  }

  function remapImportedPatternExecutionVerification(state, referenceMap) {
    const next = clone(state);
    remapExactReferences(next, referenceMap);
    next.evidenceIds = [...new Set(next.evidenceIds || [])].sort();
    next.criterionResults = [...(next.criterionResults || [])].map((entry) => ({
      ...entry,
      supportingEvidenceIds: [...new Set(entry.supportingEvidenceIds || [])].sort(),
      conflictingEvidenceIds: [...new Set(entry.conflictingEvidenceIds || [])].sort(),
    })).sort((left, right) => String(left.criterionId || "").localeCompare(String(right.criterionId || "")));
    next.inputFingerprint = fnv1a32Fingerprint({
      remapped: true, actionId: next.actionId, actionRevision: next.actionRevision,
      actionFingerprint: next.actionFingerprint, evidenceIds: next.evidenceIds,
      criteria: next.expectedCriteria,
    });
    next.fingerprint = patternExecutionVerificationFingerprint(next);
    return next;
  }

  function makeImportedPatternExecutionVerificationStale(state, timestamp, collision) {
    const next = clone(state);
    next.status = "stale";
    next.revision = Math.max(1, Number(next.revision) || 1) + 1;
    next.updatedAt = timestamp;
    next.verifiedAt = null;
    next.importedDiagnostic = { reason: "import_identity_unproven", collision: Boolean(collision) };
    next.fingerprint = patternExecutionVerificationFingerprint(next);
    return next;
  }

  function validateImportedPatternExecutionVerification(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const statuses = new Set(["waiting", "ready", "verifying", "needs_evidence", "contradicted", "verified", "rejected", "blocked", "stale"]);
    const outcomes = new Set(["confirmed", "disproved", "insufficient", "conflicting"]);
    if (!state || state.type !== "PATTERN_EXECUTION_VERIFICATION" || state.kind !== "PATTERN_EXECUTION_VERIFICATION" || state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId || !state.id || !state.calculationId || !state.inputFingerprint || !statuses.has(state.status) || !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1 || !Array.isArray(state.evidenceIds) || new Set(state.evidenceIds).size !== state.evidenceIds.length || !Array.isArray(state.expectedCriteria) || !Array.isArray(state.criterionResults) || !Array.isArray(state.contradictions) || !Array.isArray(state.diagnostics) || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt)) {
      invalid("INVALID_IMPORT_EXECUTION_VERIFICATION", "Импортируемая execution verification повреждена.");
    }
    if (state.actionId !== null && !state.actionId || state.actionRevision !== null && (!Number.isInteger(state.actionRevision) || state.actionRevision < 1)) invalid("INVALID_IMPORT_EXECUTION_VERIFICATION_ACTION", "Ссылка verification на action повреждена.");
    const criterionIds = new Set((state.expectedCriteria || []).map((entry) => entry?.id || entry?.criterionId));
    if (criterionIds.has(undefined) || criterionIds.size !== state.expectedCriteria.length) invalid("INVALID_IMPORT_EXECUTION_VERIFICATION_CRITERIA", "Критерии verification повреждены.");
    for (const result of state.criterionResults) if (!criterionIds.has(result.criterionId) || !outcomes.has(result.outcome) || typeof result.required !== "boolean" || !Array.isArray(result.supportingEvidenceIds) || !Array.isArray(result.conflictingEvidenceIds) || typeof result.explanation !== "string") invalid("INVALID_IMPORT_EXECUTION_VERIFICATION_RESULT", "Результат критерия verification повреждён.");
    if (["verified", "rejected"].includes(state.status) && !isTimestamp(state.verifiedAt)) invalid("INVALID_IMPORT_EXECUTION_VERIFICATION_TERMINAL", "Терминальная verification не имеет времени проверки.");
    if (state.fingerprint !== patternExecutionVerificationFingerprint(state)) invalid("INVALID_IMPORT_EXECUTION_VERIFICATION_FINGERPRINT", "Fingerprint verification повреждён.");
    const api = global.YarnAIPatternExecutionVerification;
    const report = api?.validatePatternExecutionVerification?.(state);
    if (report && !report.valid) invalid("INVALID_IMPORT_EXECUTION_VERIFICATION", "Verification не прошла доменную validation.");
  }

  function validateImportedPatternExecutionDecision(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const api = global.YarnAIPatternExecutionDecision;
    if (!state || state.type !== "PATTERN_EXECUTION_DECISION" || state.kind !== "PATTERN_EXECUTION_DECISION" || state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId || !state.id || !state.calculationId || !state.executionPlanId || !state.sessionId || !state.actionId || !state.verificationId || !Number.isInteger(state.verificationRevision) || state.verificationRevision < 1 || !state.verificationFingerprint || !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1 || !Array.isArray(state.criterionIds) || !Array.isArray(state.evidenceReferences) || !Array.isArray(state.allowedOutcomes) || !state.decision) invalid("INVALID_IMPORT_EXECUTION_DECISION", "Imported execution decision is corrupted.");
    if (!api?.validatePatternExecutionDecision || !api?.fingerprintPatternExecutionDecision) invalid("PATTERN_EXECUTION_DECISION_API_MISSING", "Execution decision module is not loaded.");
    const report = api.validatePatternExecutionDecision(state);
    if (!report.valid || state.fingerprint !== api.fingerprintPatternExecutionDecision(state)) invalid("INVALID_IMPORT_EXECUTION_DECISION", "Decision failed domain validation.");
  }

  function validateImportedPatternExecutionFollowUp(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const api = global.YarnAIPatternExecutionFollowUp;
    if (
      !state || state.type !== "PATTERN_EXECUTION_FOLLOW_UP" || state.kind !== "PATTERN_EXECUTION_FOLLOW_UP" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId ||
      !state.id || !state.calculationId || !state.planId || !state.sessionId || !state.decisionId ||
      !Number.isInteger(state.decisionRevision) || state.decisionRevision < 1 || !state.decisionFingerprint ||
      !Number.isInteger(state.decisionEpoch) || state.decisionEpoch < 1 ||
      !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1
    ) invalid("INVALID_IMPORT_EXECUTION_FOLLOW_UP", "Imported execution follow-up is corrupted.");
    if (!api?.validatePatternExecutionFollowUp || !api?.fingerprintPatternExecutionFollowUp) invalid("PATTERN_EXECUTION_FOLLOW_UP_API_MISSING", "Execution follow-up module is not loaded.");
    const report = api.validatePatternExecutionFollowUp(state);
    if (!report.valid || state.fingerprint !== api.fingerprintPatternExecutionFollowUp(state)) invalid("INVALID_IMPORT_EXECUTION_FOLLOW_UP", "Follow-up failed domain validation.");
  }

  function validateImportedPatternExecutionRetrospective(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const api = global.YarnAIPatternExecutionRetrospective;
    if (
      !state || state.type !== "PATTERN_EXECUTION_RETROSPECTIVE" || state.kind !== "PATTERN_EXECUTION_RETROSPECTIVE" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId ||
      !state.id || !state.calculationId || !state.sourceResultId || !state.sourceRuntimeId || !state.sourceFollowUpId ||
      !state.sourceIdentity || !state.sourceSnapshotFingerprint || !state.identity ||
      !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1
    ) invalid("INVALID_IMPORT_EXECUTION_RETROSPECTIVE", "Imported execution retrospective is corrupted.");
    if (!api?.validatePatternExecutionRetrospective) invalid("PATTERN_EXECUTION_RETROSPECTIVE_API_MISSING", "Execution retrospective module is not loaded.");
    const report = api.validatePatternExecutionRetrospective(state);
    if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_RETROSPECTIVE", "Retrospective failed domain validation.");
  }

  function validateImportedPatternExecutionLearning(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const api = global.YarnAIPatternExecutionLearning;
    if (
      !state || state.type !== "PATTERN_EXECUTION_LEARNING" || state.kind !== "PATTERN_EXECUTION_LEARNING" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId ||
      !state.id || !state.calculationId || !state.sourceResultId || !state.sourceRuntimeId ||
      !state.sourceFollowUpId || !state.sourceRetrospectiveId || !state.sourceRetrospectiveIdentity ||
      !state.sourceSnapshotFingerprint || !state.identity || !Number.isInteger(state.revision) || state.revision < 1 ||
      !Number.isInteger(state.epoch) || state.epoch < 1
    ) invalid("INVALID_IMPORT_EXECUTION_LEARNING", "Imported execution learning is corrupted.");
    if (!api?.validatePatternExecutionLearning) invalid("PATTERN_EXECUTION_LEARNING_API_MISSING", "Execution learning module is not loaded.");
    const report = api.validatePatternExecutionLearning(state);
    if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_LEARNING", "Learning failed domain validation.");
  }

  function validateImportedPatternExecutionAdaptation(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const api = global.YarnAIPatternExecutionAdaptation;
    if (
      !state || state.type !== "PATTERN_EXECUTION_ADAPTATION" || state.kind !== "PATTERN_EXECUTION_ADAPTATION" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId ||
      !state.id || !state.calculationId || !state.resultId || !state.runtimeId || !state.followUpId ||
      !state.retrospectiveId || !state.learningId || !state.sourceIdentities || !state.learningSnapshot ||
      !Array.isArray(state.criticalReferences) || !state.identity || !Number.isInteger(state.revision) || state.revision < 1 ||
      !Number.isInteger(state.epoch) || state.epoch < 1
    ) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION", "Imported execution adaptation is corrupted.");
    if (!api?.validatePatternExecutionAdaptation) invalid("PATTERN_EXECUTION_ADAPTATION_API_MISSING", "Execution adaptation module is not loaded.");
    const report = api.validatePatternExecutionAdaptation(state);
    if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION", "Adaptation failed domain validation.");
  }

  function validateImportedPatternExecutionAdaptationValidation(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const api = global.YarnAIPatternExecutionAdaptationValidation;
    if (
      !state || state.type !== "PATTERN_EXECUTION_ADAPTATION_VALIDATION" || state.kind !== "PATTERN_EXECUTION_ADAPTATION_VALIDATION" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId ||
      !state.id || state.adaptationValidationId !== state.id || !state.calculationId || !state.resultId || !state.runtimeId ||
      !state.followUpId || !state.retrospectiveId || !state.learningId || !state.adaptationId || !state.adaptationIdentity ||
      !state.sourceIdentities || !state.adaptationSnapshot || !Array.isArray(state.criticalReferences) || !state.identity ||
      !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1
    ) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION_VALIDATION", "Imported execution adaptation validation is corrupted.");
    if (!api?.validatePatternExecutionAdaptationValidation) invalid("PATTERN_EXECUTION_ADAPTATION_VALIDATION_API_MISSING", "Execution adaptation validation module is not loaded.");
    const report = api.validatePatternExecutionAdaptationValidation(state);
    if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION_VALIDATION", "Adaptation validation failed domain validation.");
  }

  function validateImportedPatternExecutionAdaptationPromotion(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const api = global.YarnAIPatternExecutionAdaptationPromotion;
    if (
      !state || state.type !== "PATTERN_EXECUTION_ADAPTATION_PROMOTION" || state.kind !== "PATTERN_EXECUTION_ADAPTATION_PROMOTION" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId ||
      !state.id || state.adaptationPromotionId !== state.id || !state.calculationId || !state.patternExecutionId ||
      !state.adaptationId || !state.adaptationValidationId || !state.sourceIdentities || !state.adaptationSnapshot ||
      !state.validationSnapshot || !state.sourceProof || !state.coverage || !state.expectedImpact || !state.identity ||
      !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1
    ) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION_PROMOTION", "Imported execution adaptation promotion is corrupted.");
    if (!api?.validatePatternExecutionAdaptationPromotion) invalid("PATTERN_EXECUTION_ADAPTATION_PROMOTION_API_MISSING", "Execution adaptation promotion module is not loaded.");
    const report = api.validatePatternExecutionAdaptationPromotion(state);
    if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION_PROMOTION", "Adaptation promotion failed domain validation.");
  }

  function validateImportedPatternExecutionAdaptationRollout(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const api = global.YarnAIPatternExecutionAdaptationRollout;
    if (
      !state || state.type !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT" || state.kind !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId ||
      !state.id || state.adaptationRolloutId !== state.id || !state.calculationId || !state.patternExecutionId ||
      !state.adaptationId || !state.adaptationValidationId || !state.adaptationPromotionId || !state.sourceIdentities ||
      !state.projectSnapshot || !state.calculationSnapshot || !state.runtimeSnapshot || !state.adaptationSnapshot ||
      !state.validationSnapshot || !state.promotionSnapshot || !state.sourceProof || !state.expectedImpact || !state.identity ||
      !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1
    ) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT", "Imported execution adaptation rollout is corrupted.");
    if (!api?.validatePatternExecutionAdaptationRollout) invalid("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_API_MISSING", "Execution adaptation rollout module is not loaded.");
    const report = api.validatePatternExecutionAdaptationRollout(state);
    if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT", "Adaptation rollout failed domain validation.");
  }

  function validateImportedPatternExecutionAdaptationRolloutEvaluation(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const api = global.YarnAIPatternExecutionAdaptationRolloutEvaluation;
    if (
      !state || state.type !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION" || state.kind !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId ||
      !state.id || state.evaluationId !== state.id || state.adaptationRolloutEvaluationId !== state.id ||
      !state.calculationId || !state.runtimeId || !state.adaptationId || !state.validationId || !state.promotionId || !state.rolloutId ||
      !state.sourceIdentities || !state.projectSnapshot || !state.calculationSnapshot || !state.runtimeSnapshot ||
      !state.adaptationSnapshot || !state.validationSnapshot || !state.promotionSnapshot || !state.rolloutSnapshot ||
      !state.sourceProof || !state.expectedImpact || !state.impactComparison || !state.identity ||
      !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1
    ) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION", "Imported rollout evaluation is corrupted.");
    if (!api?.validatePatternExecutionAdaptationRolloutEvaluation) invalid("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_API_MISSING", "Rollout evaluation module is not loaded.");
    const report = api.validatePatternExecutionAdaptationRolloutEvaluation(state);
    if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION", "Rollout evaluation failed domain validation.");
  }

  function validateImportedPatternExecutionAdaptationClosure(state, sourceProjectId) {
    const invalid = (code, message) => { throw new ProjectRepositoryError(code, message); };
    const api = global.YarnAIPatternExecutionAdaptationClosure;
    if (
      !state || state.type !== "PATTERN_EXECUTION_ADAPTATION_CLOSURE" || state.kind !== "PATTERN_EXECUTION_ADAPTATION_CLOSURE" ||
      state.schemaVersion !== 1 || state.version !== 1 || state.projectId !== sourceProjectId ||
      !state.id || state.closureId !== state.id || state.adaptationClosureId !== state.id ||
      !state.calculationId || !state.runtimeId || !state.adaptationId || !state.validationId || !state.promotionId || !state.rolloutId || !state.evaluationId ||
      !state.sourceIdentities || !state.sourceRevisions || !state.sourceDigests || !state.projectSnapshot || !state.calculationSnapshot ||
      !state.runtimeSnapshot || !state.adaptationSnapshot || !state.validationSnapshot || !state.promotionSnapshot || !state.rolloutSnapshot || !state.evaluationSnapshot ||
      !state.sourceProof || !state.closureScope || !state.acceptedOutcome || !state.identity ||
      !Number.isInteger(state.revision) || state.revision < 1 || !Number.isInteger(state.epoch) || state.epoch < 1
    ) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION_CLOSURE", "Imported adaptation closure is corrupted.");
    if (!api?.validatePatternExecutionAdaptationClosure) invalid("PATTERN_EXECUTION_ADAPTATION_CLOSURE_API_MISSING", "Adaptation closure module is not loaded.");
    const report = api.validatePatternExecutionAdaptationClosure(state);
    if (!report.valid) invalid("INVALID_IMPORT_EXECUTION_ADAPTATION_CLOSURE", "Adaptation closure failed domain validation.");
  }
  async function sha256Text(text) {
    if (!global.crypto?.subtle) {
      throw new ProjectRepositoryError(
        "CHECKSUM_UNAVAILABLE",
        "Браузер не поддерживает безопасную проверку целостности данных.",
      );
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await global.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function checksumPayload(payload) {
    return sha256Text(canonicalize(payload));
  }

  function projectChecksumPayload(project) {
    const value = clone(project);
    delete value.materialized_checksum;
    return value;
  }

  function normalizeTitle(value, fallback = null) {
    const normalized =
      typeof value === "string" ? value.normalize("NFC").trim() : "";
    const title = normalized || fallback;
    if (!title || [...title].length > 120) {
      throw new ProjectRepositoryError(
        "INVALID_TITLE",
        "Название проекта должно содержать от 1 до 120 символов.",
        { details: { field: "title" } },
      );
    }
    return title;
  }

  function normalizeNotes(value) {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string" || [...value].length > 10000) {
      throw new ProjectRepositoryError(
        "INVALID_NOTES",
        "Заметка проекта не должна превышать 10 000 символов.",
        { details: { field: "notes" } },
      );
    }
    return value.normalize("NFC");
  }

  function mapStorageError(error, fallbackCode = "STORAGE_ERROR") {
    if (error instanceof ProjectRepositoryError) {
      return error;
    }
    const name = error?.name ?? "";
    if (name === "QuotaExceededError") {
      return new ProjectRepositoryError(
        "STORAGE_QUOTA_EXCEEDED",
        "Недостаточно места в браузере. Освободите место или экспортируйте проекты.",
        { transient: false, cause: error },
      );
    }
    if (name === "AbortError" || name === "TransactionInactiveError") {
      return new ProjectRepositoryError(
        "STORAGE_TEMPORARILY_UNAVAILABLE",
        "Локальное сохранение временно недоступно. YarnAI повторит попытку.",
        { transient: true, cause: error },
      );
    }
    if (name === "ConstraintError") {
      return new ProjectRepositoryError(
        "STORAGE_CONSTRAINT",
        "Изменение конфликтует с уже сохранёнными данными.",
        { cause: error },
      );
    }
    return new ProjectRepositoryError(
      fallbackCode,
      "Не удалось обратиться к локальному хранилищу проектов.",
      { transient: true, cause: error },
    );
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => {
        // onabort provides the final transaction error.
      };
    });
  }

  function createStore(database, name, keyPath) {
    if (!database.objectStoreNames.contains(name)) {
      return database.createObjectStore(name, { keyPath });
    }
    return null;
  }

  function ensureIndexes(store, definitions) {
    if (!store) {
      return;
    }
    definitions.forEach(([name, keyPath, options]) => {
      if (!store.indexNames.contains(name)) {
        store.createIndex(name, keyPath, options ?? {});
      }
    });
  }

  function applySchemaMigration(database, transaction, oldVersion) {
    if (oldVersion < 1) {
      const stores = {
        meta: createStore(database, "meta", "key"),
        projects: createStore(database, "projects", "project_id"),
        calculations: createStore(database, "calculations", "calculation_id"),
        progress: createStore(database, "progress", "progress_id"),
        operations: createStore(database, "operations", "operation_id"),
        checkpoints: createStore(database, "checkpoints", "checkpoint_id"),
        photos: createStore(database, "photos", "photo_id"),
        photo_blobs: createStore(database, "photo_blobs", "blob_id"),
        pattern_files: createStore(database, "pattern_files", "pattern_file_id"),
        pattern_file_blobs: createStore(database, "pattern_file_blobs", "blob_id"),
        settings: createStore(database, "settings", "setting_id"),
        cache: createStore(database, "cache", "cache_key"),
        sync_state: createStore(database, "sync_state", "partition_key"),
        transfer_receipts: createStore(database, "transfer_receipts", "transfer_id"),
        quarantine: createStore(database, "quarantine", "quarantine_id"),
        migration_records: createStore(database, "migration_records", "migration_id"),
      };
      Object.entries(INDEX_MANIFEST).forEach(([storeName, definitions]) => {
        ensureIndexes(stores[storeName] ?? transaction.objectStore(storeName), definitions);
      });
      stores.meta.put({
        key: "database_manifest",
        database_name: DB_NAME,
        indexeddb_version: DB_VERSION,
        record_schema_version: RECORD_SCHEMA_VERSION,
        created_at: utcNow(),
      });
    }
    if (oldVersion < 2) {
      const operations = transaction.objectStore("operations");
      ensureIndexes(operations, [
        ["by_state_created", ["state", "created_at"]],
      ]);
      const cursorRequest = operations.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          return;
        }
        const operation = cursor.value;
        operation.operation_type = operation.operation_type ?? operation.kind;
        operation.revision =
          operation.revision ?? operation.resulting_revision;
        operation.state =
          operation.state ??
          (operation.sync_status === "SYNCED" ? "uploaded" : "pending");
        cursor.update(operation);
        cursor.continue();
      };
    }
    if (oldVersion < 3) {
      const progress = transaction.objectStore("progress");
      ensureIndexes(progress, [
        ["by_kind_updated", ["kind", "updated_at"]],
      ]);
      const timestamp = utcNow();
      const cursorRequest = progress.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const source = cursor.value;
        if (
          source.kind === "PATTERN_IMPORT" &&
          source.state?.status === "completed" &&
          Number.isInteger(source.state?.revision) &&
          source.state.revision > 0 &&
          Array.isArray(source.state?.materials) &&
          source.state.materials.length > 0
        ) {
          const existingRequest = progress
            .index("by_scope_epoch")
            .get([
              source.project_id,
              source.calculation_id,
              "PATTERN_ANALYSIS",
              1,
            ]);
          existingRequest.onsuccess = () => {
            if (!existingRequest.result) {
              progress.add({
                schema_version: RECORD_SCHEMA_VERSION,
                progress_id: uuidv7(),
                project_id: source.project_id,
                calculation_id: source.calculation_id,
                partition_key: source.partition_key ?? PARTITION_KEY,
                kind: "PATTERN_ANALYSIS",
                epoch: 1,
                state: {
                  projectId: source.project_id,
                  revision: 1,
                  status: "waiting",
                  createdAt: timestamp,
                  updatedAt: timestamp,
                  sourceImportRevision: source.state.revision,
                  filesCount: source.state.materials.length,
                  analysisVersion: 1,
                  result: {
                    patternDetected: false,
                    garmentType: null,
                    construction: null,
                    confidence: 0,
                    missingInformation: [],
                    notes: [],
                  },
                  warnings: [],
                  errors: [],
                },
                created_at: timestamp,
                updated_at: timestamp,
                revision: 1,
                deleted_at: null,
                purge_after: null,
                sync_status: "LOCAL_ONLY",
                server_version: null,
                last_synced_at: null,
                conflict_id: null,
              });
            }
          };
        }
        cursor.continue();
      };
      const meta = transaction.objectStore("meta");
      const manifestRequest = meta.get("database_manifest");
      manifestRequest.onsuccess = () => {
        const manifest = manifestRequest.result;
        if (manifest) {
          manifest.indexeddb_version = DB_VERSION;
          manifest.updated_at = timestamp;
          meta.put(manifest);
        }
      };
    }
    if (oldVersion < 4) {
      const patternFiles = createStore(database, "pattern_files", "pattern_file_id");
      const patternFileBlobs = createStore(database, "pattern_file_blobs", "blob_id");
      ensureIndexes(patternFiles, INDEX_MANIFEST.pattern_files);
      ensureIndexes(patternFileBlobs, INDEX_MANIFEST.pattern_file_blobs);
      const timestamp = utcNow();
      const meta = transaction.objectStore("meta");
      const manifestRequest = meta.get("database_manifest");
      manifestRequest.onsuccess = () => {
        const manifest = manifestRequest.result;
        if (manifest) {
          manifest.indexeddb_version = DB_VERSION;
          manifest.updated_at = timestamp;
          meta.put(manifest);
        }
      };
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(
          new ProjectRepositoryError(
            "INDEXEDDB_UNAVAILABLE",
            "Локальное хранилище IndexedDB недоступно в этом браузере.",
          ),
        );
        return;
      }
      let request;
      try {
        request = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(mapStorageError(error, "INDEXEDDB_UNAVAILABLE"));
        return;
      }
      request.onupgradeneeded = (event) => {
        try {
          applySchemaMigration(request.result, request.transaction, event.oldVersion);
        } catch (error) {
          request.transaction.abort();
          reject(mapStorageError(error, "SCHEMA_MIGRATION_FAILED"));
        }
      };
      request.onblocked = () => {
        reject(
          new ProjectRepositoryError(
            "SCHEMA_UPGRADE_BLOCKED",
            "Другая вкладка YarnAI мешает обновить хранилище. Закройте её и обновите страницу.",
            { transient: true },
          ),
        );
      };
      request.onerror = () => reject(mapStorageError(request.error));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          global.dispatchEvent?.(new CustomEvent("yarnai-storage-versionchange"));
        };
        resolve(database);
      };
    });
  }

  async function readByProject(database, storeName, indexName, projectId) {
    const transaction = database.transaction(storeName, "readonly");
    const index = transaction.objectStore(storeName).index(indexName);
    const range = global.IDBKeyRange.bound(
      [projectId, ""],
      [projectId, "\uffff"],
    );
    const result = await requestResult(index.getAll(range));
    await transactionComplete(transaction);
    return result;
  }

  function baseProject(projectId, title, notes, timestamp) {
    return {
      schema_version: RECORD_SCHEMA_VERSION,
      project_id: projectId,
      partition_key: PARTITION_KEY,
      owner_user_id: null,
      title,
      notes,
      workspace_status: "DRAFT",
      status_before_archive: null,
      status_before_delete: null,
      active_calculation_id: null,
      current_stage: null,
      draft_input: null,
      has_unfinished_calculation: false,
      created_at: timestamp,
      updated_at: timestamp,
      last_opened_at: null,
      archived_at: null,
      deleted_at: null,
      purge_after: null,
      revision: 1,
      duplicated_from_project_id: null,
      imported_from_project_id: null,
      sync_status: "LOCAL_ONLY",
      server_version: null,
      server_updated_at: null,
      last_synced_at: null,
      conflict_id: null,
      materialized_checksum: "",
    };
  }

  function validateProjectRecord(project) {
    if (!project || typeof project !== "object" || Array.isArray(project)) {
      throw new ProjectRepositoryError(
        "INVALID_PROJECT",
        "Запись проекта имеет неверный формат.",
      );
    }
    if (project.schema_version !== RECORD_SCHEMA_VERSION) {
      throw new ProjectRepositoryError(
        "UNSUPPORTED_PROJECT_SCHEMA",
        "Версия локального проекта не поддерживается этой версией YarnAI.",
      );
    }
    if (!isUuidv7(project.project_id)) {
      throw new ProjectRepositoryError(
        "INVALID_PROJECT_ID",
        "Идентификатор проекта повреждён.",
      );
    }
    normalizeTitle(project.title);
    normalizeNotes(project.notes);
    if (!ALL_STATUSES.has(project.workspace_status)) {
      throw new ProjectRepositoryError(
        "INVALID_PROJECT_STATUS",
        "Состояние проекта не поддерживается.",
      );
    }
    if (
      !Number.isInteger(project.revision) ||
      project.revision < 1 ||
      !isTimestamp(project.created_at) ||
      !isTimestamp(project.updated_at)
    ) {
      throw new ProjectRepositoryError(
        "INVALID_PROJECT_METADATA",
        "Служебные данные проекта повреждены.",
      );
    }
    if (
      project.active_calculation_id !== null &&
      !isUuidv7(project.active_calculation_id)
    ) {
      throw new ProjectRepositoryError(
        "INVALID_ACTIVE_CALCULATION",
        "Ссылка на активный расчёт повреждена.",
      );
    }
    return project;
  }

  function validateCalculationRecord(calculation, projectId) {
    if (
      !calculation ||
      calculation.schema_version !== RECORD_SCHEMA_VERSION ||
      !isUuidv7(calculation.calculation_id) ||
      calculation.project_id !== projectId ||
      typeof calculation.fingerprint !== "string" ||
      calculation.fingerprint.length !== 64 ||
      !isTimestamp(calculation.created_at)
    ) {
      throw new ProjectRepositoryError(
        "INVALID_CALCULATION",
        "Сохранённый расчёт проекта повреждён.",
      );
    }
  }

  function validateProgressRecord(progress, projectId, calculationId, kind) {
    if (
      !progress ||
      progress.schema_version !== RECORD_SCHEMA_VERSION ||
      !isUuidv7(progress.progress_id) ||
      progress.project_id !== projectId ||
      progress.calculation_id !== calculationId ||
      progress.kind !== kind ||
      !Number.isInteger(progress.epoch) ||
      progress.epoch < 1 ||
      !progress.state ||
      typeof progress.state !== "object" ||
      Array.isArray(progress.state) ||
      !Number.isInteger(progress.revision) ||
      progress.revision < 1 ||
      !isTimestamp(progress.created_at) ||
      !isTimestamp(progress.updated_at)
    ) {
      throw new ProjectRepositoryError(
        "INVALID_PROGRESS",
        "Сохранённый прогресс проекта повреждён. Исходная запись не изменена.",
      );
    }
    return progress;
  }

  function createOperation(project, kind, payload, timestamp, baseRevision, resultRevision) {
    return {
      schema_version: RECORD_SCHEMA_VERSION,
      operation_id: uuidv7(),
      partition_key: PARTITION_KEY,
      project_id: project.project_id,
      aggregate_type: "PROJECT",
      aggregate_id: project.project_id,
      device_id: null,
      device_sequence: null,
      base_revision: baseRevision,
      resulting_revision: resultRevision,
      revision: resultRevision,
      kind,
      operation_type: kind,
      payload: {
        ...clone(payload ?? {}),
        project: clone(project),
      },
      occurred_at: timestamp,
      created_at: timestamp,
      retention_until: new Date(Date.parse(timestamp) + CHECKPOINT_RETENTION_MS).toISOString(),
      sync_status: "LOCAL_ONLY",
      state: "pending",
      server_version: null,
      uploaded_at: null,
      last_error: null,
      retryable: false,
    };
  }

  function createCheckpoint(project, checksum, generation, timestamp, status = "VALID") {
    return {
      schema_version: RECORD_SCHEMA_VERSION,
      checkpoint_id: uuidv7(),
      project_id: project.project_id,
      aggregate_type: "PROJECT",
      aggregate_id: project.project_id,
      revision: project.revision,
      generation,
      snapshot: clone(project),
      payload_checksum: checksum,
      included_operation_from: null,
      included_operation_to: null,
      created_at: timestamp,
      retention_until: new Date(Date.parse(timestamp) + CHECKPOINT_RETENTION_MS).toISOString(),
      validation_status: status,
    };
  }

  async function allocateOperationMetadata(transaction, operation) {
    const meta = transaction.objectStore("meta");
    const deviceRecord = await requestResult(meta.get("device_identity"));
    const counterRecord = await requestResult(meta.get("device_sequence"));
    const timestamp = utcNow();
    const deviceId = deviceRecord?.device_id ?? uuidv7();
    const sequence = (counterRecord?.value ?? 0) + 1;
    if (!deviceRecord) {
      meta.put({ key: "device_identity", device_id: deviceId, created_at: timestamp });
    }
    meta.put({ key: "device_sequence", value: sequence, updated_at: timestamp });
    operation.device_id = deviceId;
    operation.device_sequence = sequence;
    return operation;
  }

  class ProjectRepository {
    constructor(options = {}) {
      this._databasePromise = options.database
        ? Promise.resolve(options.database)
        : openDatabase();
      this._writeQueues = new Map();
      this._channel =
        typeof global.BroadcastChannel === "function"
          ? new global.BroadcastChannel("yarnai-projects-v1")
          : null;
    }

    async initialize() {
      const database = await this._database();
      if (!STORE_NAMES.every((name) => database.objectStoreNames.contains(name))) {
        throw new ProjectRepositoryError(
          "SCHEMA_INCOMPLETE",
          "Локальная база проектов имеет неполную схему.",
        );
      }
      return this;
    }

    async close() {
      const database = await this._databasePromise.catch(() => null);
      database?.close();
      this._channel?.close();
    }

    async _database() {
      try {
        return await this._databasePromise;
      } catch (error) {
        throw mapStorageError(error);
      }
    }

    async getOutboxOperations(options = {}) {
      const states = new Set(options.states ?? ["pending"]);
      const limit = Math.max(1, Math.min(Number(options.limit) || 50, 100));
      const database = await this._database();
      const transaction = database.transaction("operations", "readonly");
      const stored = await requestResult(
        transaction.objectStore("operations").getAll(),
      );
      await transactionComplete(transaction);
      const selected = stored
        .map((operation) => ({
          ...operation,
          operation_type: operation.operation_type ?? operation.kind,
          revision: operation.revision ?? operation.resulting_revision,
          state:
            operation.state ??
            (operation.sync_status === "SYNCED" ? "uploaded" : "pending"),
        }))
        .filter(
          (operation) =>
            states.has(operation.state) &&
            (!options.projectId || operation.project_id === options.projectId),
        )
        .sort(
          (left, right) =>
            left.created_at.localeCompare(right.created_at) ||
            left.device_sequence - right.device_sequence,
        )
        .slice(0, limit);
      const projects = new Map();
      for (const operation of selected) {
        if (!operation.payload?.project && !projects.has(operation.project_id)) {
          projects.set(
            operation.project_id,
            await this._getRawProject(operation.project_id),
          );
        }
      }
      return selected.map((operation) => {
        const result = clone(operation);
        if (!result.payload?.project) {
          result.payload = {
            ...clone(result.payload ?? {}),
            project: clone(projects.get(result.project_id)),
          };
        }
        return result;
      });
    }

    async getOutboxSummary(projectId = null) {
      const operations = await this.getOutboxOperations({
        states: ["pending", "uploading", "failed", "uploaded"],
        limit: 100,
        projectId,
      });
      return operations.reduce(
        (summary, operation) => {
          summary[operation.state] += 1;
          if (operation.state === "failed" && operation.retryable) {
            summary.retryable_failed += 1;
          }
          return summary;
        },
        {
          pending: 0,
          uploading: 0,
          uploaded: 0,
          failed: 0,
          retryable_failed: 0,
        },
      );
    }

    async _updateOutboxState(operationIds, state, details = {}) {
      if (!Array.isArray(operationIds) || operationIds.length === 0) {
        return;
      }
      const database = await this._database();
      const transaction = database.transaction("operations", "readwrite");
      const store = transaction.objectStore("operations");
      try {
        for (const operationId of operationIds) {
          const operation = await requestResult(store.get(operationId));
          if (!operation) {
            continue;
          }
          operation.state = state;
          operation.sync_status =
            state === "uploaded" ? "SYNCED" : "LOCAL_ONLY";
          operation.uploaded_at =
            state === "uploaded" ? details.uploaded_at ?? utcNow() : null;
          operation.server_version =
            details.server_version?.[operation.project_id] ??
            operation.server_version ??
            null;
          operation.last_error = details.error ?? null;
          operation.retryable = Boolean(details.retryable);
          store.put(operation);
        }
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
    }

    async markOperationsUploading(operationIds) {
      return this._updateOutboxState(operationIds, "uploading");
    }

    async markOperationsUploaded(confirmations) {
      const serverVersion = {};
      for (const confirmation of confirmations) {
        serverVersion[confirmation.project_id] = confirmation.server_revision;
      }
      return this._updateOutboxState(
        confirmations.map((confirmation) => confirmation.operation_id),
        "uploaded",
        { server_version: serverVersion },
      );
    }

    async markOperationsFailed(errors, options = {}) {
      for (const error of errors) {
        await this._updateOutboxState([error.operation_id], "failed", {
          error: {
            code: error.code ?? "SYNC_UPLOAD_FAILED",
            message: error.message ?? "Operation upload failed.",
            status: error.status ?? 0,
          },
          retryable: Boolean(options.retryable ?? error.retryable),
        });
      }
    }

    async resetUploadingOperations() {
      const uploading = await this.getOutboxOperations({
        states: ["uploading"],
        limit: 100,
      });
      await this._updateOutboxState(
        uploading.map((operation) => operation.operation_id),
        "pending",
      );
    }

    async requeueRetryableFailedOperations() {
      const failed = await this.getOutboxOperations({
        states: ["failed"],
        limit: 100,
      });
      await this._updateOutboxState(
        failed
          .filter((operation) => operation.retryable)
          .map((operation) => operation.operation_id),
        "pending",
      );
    }

    _serialize(projectId, command) {
      const previous = this._writeQueues.get(projectId) ?? Promise.resolve();
      const current = previous.catch(() => undefined).then(command);
      const tracked = current.catch(() => undefined).finally(() => {
        if (this._writeQueues.get(projectId) === tracked) {
          this._writeQueues.delete(projectId);
        }
      });
      this._writeQueues.set(projectId, tracked);
      return current;
    }

    _notify(projectId, revision, kind) {
      this._channel?.postMessage({ project_id: projectId, revision, kind });
      global.dispatchEvent?.(
        new CustomEvent("yarnai-project-changed", {
          detail: { project_id: projectId, revision, kind },
        }),
      );
    }

    async _getRawProject(projectId) {
      if (!isUuidv7(projectId)) {
        throw new ProjectRepositoryError(
          "INVALID_PROJECT_ID",
          "Идентификатор проекта имеет неверный формат.",
        );
      }
      const database = await this._database();
      const transaction = database.transaction("projects", "readonly");
      const project = await requestResult(
        transaction.objectStore("projects").get(projectId),
      );
      await transactionComplete(transaction);
      return project ?? null;
    }

    async createProject(input = {}) {
      const title = normalizeTitle(
        input.title,
        `Новый проект · ${new Intl.DateTimeFormat("ru", {
          dateStyle: "short",
        }).format(new Date())}`,
      );
      const notes = normalizeNotes(input.notes ?? "") ?? "";
      const timestamp = utcNow();
      const project = baseProject(uuidv7(), title, notes, timestamp);
      if (input.draft_input !== undefined) {
        project.draft_input = clone(input.draft_input);
        project.has_unfinished_calculation = Boolean(input.draft_input);
      }
      project.materialized_checksum = await checksumPayload(
        projectChecksumPayload(project),
      );
      const operation = createOperation(
        project,
        "PROJECT_CREATED",
        { title: project.title },
        timestamp,
        0,
        1,
      );
      const checkpoint = createCheckpoint(
        project,
        project.materialized_checksum,
        1,
        timestamp,
      );
      const previousCheckpoint = createCheckpoint(
        project,
        project.materialized_checksum,
        0,
        timestamp,
      );
      const database = await this._database();
      const transaction = database.transaction(
        ["projects", "operations", "checkpoints", "meta"],
        "readwrite",
      );
      try {
        await allocateOperationMetadata(transaction, operation);
        transaction.objectStore("projects").add(project);
        transaction.objectStore("operations").add(operation);
        transaction.objectStore("checkpoints").add(previousCheckpoint);
        transaction.objectStore("checkpoints").add(checkpoint);
        await transactionComplete(transaction);
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be closed.
        }
        throw mapStorageError(error);
      }
      this._notify(project.project_id, project.revision, "PROJECT_CREATED");
      return clone(project);
    }

    async _validatedCurrentProject(projectId) {
      const project = await this._getRawProject(projectId);
      if (!project) {
        throw new ProjectRepositoryError(
          "PROJECT_NOT_FOUND",
          "Проект не найден в локальном хранилище.",
        );
      }
      validateProjectRecord(project);
      const checksum = await checksumPayload(projectChecksumPayload(project));
      if (project.materialized_checksum !== checksum) {
        return this._recoverProject(projectId, project);
      }
      return project;
    }

    async _recoverProject(projectId, corruptedProject) {
      const database = await this._database();
      const checkpoints = await readByProject(
        database,
        "checkpoints",
        "by_project_created",
        projectId,
      );
      const candidates = checkpoints
        .filter((entry) => entry.validation_status === "VALID")
        .sort((left, right) => right.revision - left.revision);
      let recovered = null;
      for (const checkpoint of candidates) {
        try {
          validateProjectRecord(checkpoint.snapshot);
          const checksum = await checksumPayload(
            projectChecksumPayload(checkpoint.snapshot),
          );
          if (checksum === checkpoint.payload_checksum) {
            recovered = clone(checkpoint.snapshot);
            break;
          }
        } catch {
          // A damaged recovery generation is skipped.
        }
      }
      if (!recovered) {
        throw new ProjectRepositoryError(
          "PROJECT_RECOVERY_FAILED",
          "Проект повреждён, и исправная локальная копия не найдена.",
        );
      }
      const timestamp = utcNow();
      const previousRevision = recovered.revision;
      recovered.revision += 1;
      recovered.updated_at = timestamp;
      recovered.materialized_checksum = await checksumPayload(
        projectChecksumPayload(recovered),
      );
      const operation = createOperation(
        recovered,
        "PROJECT_RECOVERED",
        { recovered_from_revision: previousRevision },
        timestamp,
        previousRevision,
        recovered.revision,
      );
      const checkpoint = createCheckpoint(
        recovered,
        recovered.materialized_checksum,
        recovered.revision,
        timestamp,
      );
      const quarantine = {
        quarantine_id: uuidv7(),
        source_store: "projects",
        source_key: projectId,
        reason_code: "CHECKSUM_MISMATCH",
        record: clone(corruptedProject),
        created_at: timestamp,
        expires_at: new Date(Date.parse(timestamp) + CHECKPOINT_RETENTION_MS).toISOString(),
      };
      const transaction = database.transaction(
        ["projects", "operations", "checkpoints", "quarantine", "meta"],
        "readwrite",
      );
      try {
        await allocateOperationMetadata(transaction, operation);
        transaction.objectStore("quarantine").add(quarantine);
        transaction.objectStore("projects").put(recovered);
        transaction.objectStore("operations").add(operation);
        transaction.objectStore("checkpoints").add(checkpoint);
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
      this._notify(projectId, recovered.revision, "PROJECT_RECOVERED");
      recovered.recovery_notice =
        "Проект восстановлен из последней исправной локальной копии.";
      return recovered;
    }

    async getProject(projectId, options = {}) {
      const project = await this._validatedCurrentProject(projectId);
      if (project.workspace_status === "DELETED" && !options.includeDeleted) {
        throw new ProjectRepositoryError(
          "PROJECT_DELETED",
          "Проект находится в корзине.",
        );
      }
      const database = await this._database();
      const [calculations, progress, operations, photos, stagedDraft] =
        await Promise.all([
          readByProject(database, "calculations", "by_project_created", projectId),
          readByProject(database, "progress", "by_project_updated", projectId),
          readByProject(database, "operations", "by_project_time", projectId),
          readByProject(database, "photos", "by_project_created", projectId),
          this._readLatestRecoveryDraft(projectId),
        ]);
      calculations.forEach((calculation) =>
        validateCalculationRecord(calculation, projectId),
      );
      if (
        project.active_calculation_id &&
        !calculations.some(
          (entry) => entry.calculation_id === project.active_calculation_id,
        )
      ) {
        throw new ProjectRepositoryError(
          "ACTIVE_CALCULATION_MISSING",
          "Активный расчёт проекта не найден. Доступно восстановление из экспорта.",
        );
      }
      return {
        project: clone(project),
        calculations: clone(calculations),
        progress: clone(progress),
        operations: clone(operations),
        photos: clone(photos),
        recovery_draft: stagedDraft,
      };
    }

    async getCalculationProgress(projectId, calculationId, kind) {
      if (!isUuidv7(projectId) || !isUuidv7(calculationId)) {
        throw new ProjectRepositoryError(
          "INVALID_PROGRESS_SCOPE",
          "Ссылка на прогресс проекта повреждена.",
        );
      }
      if (typeof kind !== "string" || !kind.trim()) {
        throw new ProjectRepositoryError(
          "INVALID_PROGRESS_KIND",
          "Тип прогресса проекта не указан.",
        );
      }
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const record = await requestResult(
        transaction
          .objectStore("progress")
          .index("by_scope_epoch")
          .get([projectId, calculationId, kind, 1]),
      );
      await transactionComplete(transaction);
      if (!record) {
        return null;
      }
      validateProgressRecord(record, projectId, calculationId, kind);
      return clone(record);
    }

    async ensureCalculationProgress(
      projectId,
      calculationId,
      kind,
      initialState,
      options = {},
    ) {
      if (
        !isUuidv7(projectId) ||
        !isUuidv7(calculationId) ||
        typeof kind !== "string" ||
        !kind.trim() ||
        !initialState ||
        typeof initialState !== "object" ||
        Array.isArray(initialState)
      ) {
        throw new ProjectRepositoryError(
          "INVALID_PROGRESS_SCOPE",
          "Не удалось безопасно подготовить состояние проекта.",
        );
      }
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.workspace_status === "DELETED") {
          throw new ProjectRepositoryError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Нельзя изменять прогресс проекта из корзины.",
          );
        }
        if (before.active_calculation_id !== calculationId) {
          throw new ProjectRepositoryError(
            "CALCULATION_MISMATCH",
            "Прогресс относится не к активному расчёту проекта.",
          );
        }
        const database = await this._database();
        const readTransaction = database.transaction("progress", "readonly");
        const existing = await requestResult(
          readTransaction
            .objectStore("progress")
            .index("by_scope_epoch")
            .get([projectId, calculationId, kind, 1]),
        );
        await transactionComplete(readTransaction);
        if (existing) {
          validateProgressRecord(existing, projectId, calculationId, kind);
          return clone(existing);
        }

        const timestamp = options.timestamp ?? utcNow();
        const progress = this._initialProgress(
          projectId,
          calculationId,
          kind,
          timestamp,
        );
        progress.state = clone(initialState);
        const nextProject = clone(before);
        if (typeof options.projectStage === "string") {
          nextProject.current_stage = options.projectStage;
        }
        nextProject.updated_at = timestamp;
        nextProject.revision = before.revision + 1;
        nextProject.materialized_checksum = await checksumPayload(
          projectChecksumPayload(nextProject),
        );
        const operation = createOperation(
          nextProject,
          options.operationKind ?? "PROGRESS_CREATED",
          {
            calculation_id: calculationId,
            progress_id: progress.progress_id,
            progress_kind: kind,
            progress_revision: progress.revision,
            progress_state: clone(progress.state),
          },
          timestamp,
          before.revision,
          nextProject.revision,
        );
        const checkpoint = createCheckpoint(
          nextProject,
          nextProject.materialized_checksum,
          nextProject.revision,
          timestamp,
        );
        const transaction = database.transaction(
          ["projects", "progress", "operations", "checkpoints", "meta"],
          "readwrite",
        );
        try {
          const storedProject = await requestResult(
            transaction.objectStore("projects").get(projectId),
          );
          if (!storedProject || storedProject.revision !== before.revision) {
            transaction.abort();
            throw new ProjectRepositoryError(
              "PROGRESS_REVISION_CONFLICT",
              "Проект изменён в другой вкладке. Обновите страницу.",
            );
          }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress);
          transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation);
          transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) {
          throw mapStorageError(error);
        }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async updateCalculationProgress(
      projectId,
      calculationId,
      kind,
      state,
      options = {},
    ) {
      if (!state || typeof state !== "object" || Array.isArray(state)) {
        throw new ProjectRepositoryError(
          "INVALID_PROGRESS_STATE",
          "Новое состояние прогресса имеет неверный формат.",
        );
      }
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.workspace_status === "DELETED") {
          throw new ProjectRepositoryError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Нельзя изменять прогресс проекта из корзины.",
          );
        }
        if (before.active_calculation_id !== calculationId) {
          throw new ProjectRepositoryError(
            "CALCULATION_MISMATCH",
            "Прогресс относится не к активному расчёту проекта.",
          );
        }
        const database = await this._database();
        const readTransaction = database.transaction("progress", "readonly");
        const currentProgress = await requestResult(
          readTransaction
            .objectStore("progress")
            .index("by_scope_epoch")
            .get([projectId, calculationId, kind, 1]),
        );
        await transactionComplete(readTransaction);
        if (!currentProgress) {
          throw new ProjectRepositoryError(
            "PROGRESS_NOT_FOUND",
            "Запись прогресса проекта не найдена.",
          );
        }
        validateProgressRecord(
          currentProgress,
          projectId,
          calculationId,
          kind,
        );
        if (
          options.baseProgressRevision !== undefined &&
          currentProgress.revision !== options.baseProgressRevision
        ) {
          throw new ProjectRepositoryError(
            "PROGRESS_REVISION_CONFLICT",
            "Прогресс изменён в другой вкладке. Обновите страницу.",
          );
        }

        const timestamp = options.timestamp ?? utcNow();
        const nextProgress = clone(currentProgress);
        nextProgress.state = clone(state);
        nextProgress.updated_at = timestamp;
        nextProgress.revision = currentProgress.revision + 1;

        const nextProject = clone(before);
        if (typeof options.projectStage === "string") {
          nextProject.current_stage = options.projectStage;
        }
        if (
          options.projectDraftInput !== undefined &&
          options.projectDraftInput !== null
        ) {
          nextProject.draft_input = clone(options.projectDraftInput);
          nextProject.has_unfinished_calculation = false;
        }
        nextProject.updated_at = timestamp;
        nextProject.revision = before.revision + 1;
        nextProject.materialized_checksum = await checksumPayload(
          projectChecksumPayload(nextProject),
        );
        validateProjectRecord(nextProject);

        const operation = createOperation(
          nextProject,
          options.operationKind ?? "PROGRESS_UPDATED",
          {
            calculation_id: calculationId,
            progress_id: nextProgress.progress_id,
            progress_kind: kind,
            progress_revision: nextProgress.revision,
            progress_state: clone(nextProgress.state),
          },
          timestamp,
          before.revision,
          nextProject.revision,
        );
        const checkpoint = createCheckpoint(
          nextProject,
          nextProject.materialized_checksum,
          nextProject.revision,
          timestamp,
        );
        const transaction = database.transaction(
          ["projects", "progress", "operations", "checkpoints", "meta"],
          "readwrite",
        );
        try {
          const storedProject = await requestResult(
            transaction.objectStore("projects").get(projectId),
          );
          const storedProgress = await requestResult(
            transaction.objectStore("progress").get(nextProgress.progress_id),
          );
          if (
            !storedProject ||
            storedProject.revision !== before.revision ||
            !storedProgress ||
            storedProgress.revision !== currentProgress.revision
          ) {
            transaction.abort();
            throw new ProjectRepositoryError(
              "PROGRESS_REVISION_CONFLICT",
              "Прогресс изменён параллельно и не был перезаписан.",
            );
          }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").put(nextProgress);
          transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation);
          transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) {
          throw mapStorageError(error);
        }
        this._notify(projectId, nextProject.revision, operation.kind);
        return {
          project: clone(nextProject),
          progress: clone(nextProgress),
        };
      });
    }

    async openProject(projectId, options = {}) {
      const aggregate = await this.getProject(projectId, options);
      const status = aggregate.project.workspace_status;
      if (status === "DELETED" && !options.includeDeleted) {
        throw new ProjectRepositoryError(
          "PROJECT_DELETED",
          "Сначала восстановите проект из корзины.",
        );
      }
      const timestamp = utcNow();
      const database = await this._database();
      const project = clone(aggregate.project);
      project.last_opened_at = timestamp;
      project.materialized_checksum = await checksumPayload(
        projectChecksumPayload(project),
      );
      const settingId = `last-opened:${PARTITION_KEY}`;
      const transaction = database.transaction(
        ["projects", "settings"],
        "readwrite",
      );
      try {
        transaction.objectStore("projects").put(project);
        transaction.objectStore("settings").put({
          setting_id: settingId,
          partition_key: PARTITION_KEY,
          setting_key: "last_opened_project_id",
          value: projectId,
          value_type: "UUID",
          sync_scope: "LOCAL_DEVICE",
          schema_version: 1,
          revision: 1,
          created_at: timestamp,
          updated_at: timestamp,
          sync_status: "LOCAL_ONLY",
          server_version: null,
        });
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
      aggregate.project = project;
      return aggregate;
    }

    async listProjects(options = {}) {
      const section = options.section ?? "active";
      if (!["active", "archive", "trash", "all"].includes(section)) {
        throw new ProjectRepositoryError(
          "INVALID_LIST_SECTION",
          "Неизвестный раздел списка проектов.",
        );
      }
      const database = await this._database();
      const transaction = database.transaction("projects", "readonly");
      const projects = await requestResult(
        transaction.objectStore("projects").getAll(),
      );
      await transactionComplete(transaction);
      return projects
        .filter((project) => project.partition_key === PARTITION_KEY)
        .filter((project) => {
          if (section === "active") {
            return ACTIVE_STATUSES.has(project.workspace_status);
          }
          if (section === "archive") {
            return project.workspace_status === "ARCHIVED";
          }
          if (section === "trash") {
            return project.workspace_status === "DELETED";
          }
          return true;
        })
        .sort(
          (left, right) =>
            right.updated_at.localeCompare(left.updated_at) ||
            right.created_at.localeCompare(left.created_at) ||
            right.project_id.localeCompare(left.project_id),
        )
        .map(clone);
    }

    async _mutateProject(projectId, kind, mutator, payload = {}, options = {}) {
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (
          options.baseRevision !== undefined &&
          before.revision !== options.baseRevision
        ) {
          throw new ProjectRepositoryError(
            "REVISION_CONFLICT",
            "Проект изменён в другой вкладке. Перезагрузите его перед сохранением.",
            {
              details: {
                expected_revision: options.baseRevision,
                current_revision: before.revision,
              },
            },
          );
        }
        const next = clone(before);
        mutator(next, before);
        validateProjectRecord(next);
        const timestamp = options.timestamp ?? utcNow();
        next.updated_at = timestamp;
        next.revision = before.revision + 1;
        next.materialized_checksum = await checksumPayload(
          projectChecksumPayload(next),
        );
        const operation = createOperation(
          next,
          kind,
          payload,
          timestamp,
          before.revision,
          next.revision,
        );
        const checkpoint = createCheckpoint(
          next,
          next.materialized_checksum,
          next.revision,
          timestamp,
        );
        const database = await this._database();
        const transaction = database.transaction(
          ["projects", "operations", "checkpoints", "meta"],
          "readwrite",
        );
        try {
          const current = await requestResult(
            transaction.objectStore("projects").get(projectId),
          );
          if (!current || current.revision !== before.revision) {
            transaction.abort();
            throw new ProjectRepositoryError(
              "REVISION_CONFLICT",
              "Проект изменён параллельно. Изменения не были перезаписаны.",
            );
          }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("projects").put(next);
          transaction.objectStore("operations").add(operation);
          transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) {
          throw mapStorageError(error);
        }
        this._notify(projectId, next.revision, kind);
        return clone(next);
      });
    }

    async updateProject(projectId, patch, options = {}) {
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new ProjectRepositoryError(
          "INVALID_PROJECT_UPDATE",
          "Изменения проекта имеют неверный формат.",
        );
      }
      const allowed = new Set([
        "title",
        "notes",
        "draft_input",
        "has_unfinished_calculation",
      ]);
      const unknown = Object.keys(patch).filter((key) => !allowed.has(key));
      if (unknown.length) {
        throw new ProjectRepositoryError(
          "UNKNOWN_PROJECT_FIELD",
          "Изменение содержит неподдерживаемые поля.",
          { details: { fields: unknown } },
        );
      }
      const normalizedPatch = {};
      if ("title" in patch) {
        normalizedPatch.title = normalizeTitle(patch.title);
      }
      if ("notes" in patch) {
        normalizedPatch.notes = normalizeNotes(patch.notes);
      }
      if ("draft_input" in patch) {
        normalizedPatch.draft_input =
          patch.draft_input === null ? null : clone(patch.draft_input);
      }
      if ("has_unfinished_calculation" in patch) {
        normalizedPatch.has_unfinished_calculation = Boolean(
          patch.has_unfinished_calculation,
        );
      }
      return this._mutateProject(
        projectId,
        "PROJECT_UPDATED",
        (next) => {
          if (next.workspace_status === "DELETED") {
            throw new ProjectRepositoryError(
              "INVALID_LIFECYCLE_TRANSITION",
              "Нельзя редактировать проект в корзине.",
            );
          }
          Object.assign(next, normalizedPatch);
        },
        { changed_fields: Object.keys(normalizedPatch) },
        options,
      );
    }

    async _transition(projectId, kind, transition, payload = {}) {
      return this._mutateProject(projectId, kind, transition, payload);
    }

    async archiveProject(projectId) {
      const current = await this._validatedCurrentProject(projectId);
      if (current.workspace_status === "ARCHIVED") {
        return clone(current);
      }
      if (!ACTIVE_STATUSES.has(current.workspace_status)) {
        throw new ProjectRepositoryError(
          "INVALID_LIFECYCLE_TRANSITION",
          "Этот проект нельзя архивировать в текущем состоянии.",
        );
      }
      return this._transition(projectId, "PROJECT_ARCHIVED", (next) => {
        next.status_before_archive = next.workspace_status;
        next.workspace_status = "ARCHIVED";
        next.archived_at = utcNow();
      });
    }

    async transitionProjectStatus(projectId, targetStatus) {
      if (!ACTIVE_STATUSES.has(targetStatus)) {
        throw new ProjectRepositoryError(
          "INVALID_PROJECT_STATUS",
          "Запрошено неподдерживаемое рабочее состояние проекта.",
        );
      }
      const current = await this._validatedCurrentProject(projectId);
      if (current.workspace_status === targetStatus) {
        return clone(current);
      }
      const allowed = new Set([
        "DRAFT:ACTIVE",
        "ACTIVE:PAUSED",
        "PAUSED:ACTIVE",
        "ACTIVE:COMPLETED",
      ]);
      if (!allowed.has(`${current.workspace_status}:${targetStatus}`)) {
        throw new ProjectRepositoryError(
          "INVALID_LIFECYCLE_TRANSITION",
          `Переход ${current.workspace_status} → ${targetStatus} недопустим.`,
        );
      }
      return this._transition(
        projectId,
        "PROJECT_STATUS_CHANGED",
        (next) => {
          next.workspace_status = targetStatus;
        },
        {
          from_status: current.workspace_status,
          to_status: targetStatus,
        },
      );
    }

    async restoreProject(projectId) {
      return this._transition(projectId, "PROJECT_RESTORED_FROM_ARCHIVE", (next) => {
        if (next.workspace_status !== "ARCHIVED") {
          throw new ProjectRepositoryError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Проект не находится в архиве.",
          );
        }
        next.workspace_status = ACTIVE_STATUSES.has(next.status_before_archive)
          ? next.status_before_archive
          : "PAUSED";
        next.status_before_archive = null;
        next.archived_at = null;
      });
    }

    async softDeleteProject(projectId) {
      const current = await this._validatedCurrentProject(projectId);
      if (current.workspace_status === "DELETED") {
        return clone(current);
      }
      const timestamp = utcNow();
      return this._mutateProject(
        projectId,
        "PROJECT_DELETED",
        (next) => {
          next.status_before_delete = next.workspace_status;
          next.workspace_status = "DELETED";
          next.deleted_at = timestamp;
          next.purge_after = new Date(
            Date.parse(timestamp) + DELETE_RETENTION_MS,
          ).toISOString();
        },
        {},
        { timestamp },
      );
    }

    async restoreDeletedProject(projectId) {
      return this._transition(
        projectId,
        "PROJECT_RESTORED_FROM_TRASH",
        (next) => {
          if (next.workspace_status !== "DELETED") {
            throw new ProjectRepositoryError(
              "INVALID_LIFECYCLE_TRANSITION",
              "Проект не находится в корзине.",
            );
          }
          next.workspace_status = RESTORABLE_STATUSES.has(
            next.status_before_delete,
          )
            ? next.status_before_delete
            : "PAUSED";
          next.status_before_delete = null;
          next.deleted_at = null;
          next.purge_after = null;
        },
      );
    }

    async permanentlyDeleteProject(projectId, options = {}) {
      if (options.confirmed !== true) {
        throw new ProjectRepositoryError(
          "CONFIRMATION_REQUIRED",
          "Для безвозвратного удаления требуется явное подтверждение.",
        );
      }
      return this._serialize(projectId, async () => {
        const project = await this._validatedCurrentProject(projectId);
        if (project.workspace_status !== "DELETED") {
          throw new ProjectRepositoryError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Сначала переместите проект в корзину.",
          );
        }
        const database = await this._database();
        const [calculations, progress, operations, checkpoints, photos, patternFiles] =
          await Promise.all([
            readByProject(database, "calculations", "by_project_created", projectId),
            readByProject(database, "progress", "by_project_updated", projectId),
            readByProject(database, "operations", "by_project_time", projectId),
            readByProject(database, "checkpoints", "by_project_created", projectId),
            readByProject(database, "photos", "by_project_created", projectId),
            readByProject(database, "pattern_files", "by_project_created", projectId),
          ]);
        const photoBlobs = [];
        for (const photo of photos) {
          const tx = database.transaction("photo_blobs", "readonly");
          const blobs = await requestResult(
            tx
              .objectStore("photo_blobs")
              .index("by_photo_variant")
              .getAll(
                global.IDBKeyRange.bound(
                  [photo.photo_id, ""],
                  [photo.photo_id, "\uffff"],
                ),
              ),
          );
          await transactionComplete(tx);
          photoBlobs.push(...blobs);
        }
        const patternFileBlobs = [];
        for (const file of patternFiles) {
          const tx = database.transaction("pattern_file_blobs", "readonly");
          const blob = await requestResult(
            tx.objectStore("pattern_file_blobs").index("by_pattern_file").get(file.pattern_file_id),
          );
          await transactionComplete(tx);
          if (blob) patternFileBlobs.push(blob);
        }
        const transaction = database.transaction(
          [
            "projects",
            "calculations",
            "progress",
            "operations",
            "checkpoints",
            "photos",
            "photo_blobs",
            "pattern_files",
            "pattern_file_blobs",
            "meta",
          ],
          "readwrite",
        );
        try {
          transaction.objectStore("projects").delete(projectId);
          calculations.forEach((entry) =>
            transaction.objectStore("calculations").delete(entry.calculation_id),
          );
          progress.forEach((entry) =>
            transaction.objectStore("progress").delete(entry.progress_id),
          );
          operations.forEach((entry) =>
            transaction.objectStore("operations").delete(entry.operation_id),
          );
          checkpoints.forEach((entry) =>
            transaction.objectStore("checkpoints").delete(entry.checkpoint_id),
          );
          photos.forEach((entry) =>
            transaction.objectStore("photos").delete(entry.photo_id),
          );
          photoBlobs.forEach((entry) =>
            transaction.objectStore("photo_blobs").delete(entry.blob_id),
          );
          patternFiles.forEach((entry) =>
            transaction.objectStore("pattern_files").delete(entry.pattern_file_id),
          );
          patternFileBlobs.forEach((entry) =>
            transaction.objectStore("pattern_file_blobs").delete(entry.blob_id),
          );
          transaction.objectStore("meta").put({
            key: `project_tombstone:${projectId}`,
            project_id: projectId,
            deleted_at: project.deleted_at,
            purged_at: utcNow(),
            revision: project.revision,
          });
          await transactionComplete(transaction);
        } catch (error) {
          throw mapStorageError(error);
        }
        this._notify(projectId, project.revision, "PROJECT_PURGED");
        return {
          project_id: projectId,
          deleted_related: {
            calculations: calculations.length,
            progress: progress.length,
            operations: operations.length,
            checkpoints: checkpoints.length,
            photos: photos.length,
            photo_blobs: photoBlobs.length,
            pattern_files: patternFiles.length,
            pattern_file_blobs: patternFileBlobs.length,
          },
        };
      });
    }

    async duplicateProject(projectId, options = {}) {
      const source = await this.getProject(projectId);
      if (source.project.workspace_status === "DELETED") {
        throw new ProjectRepositoryError(
          "INVALID_LIFECYCLE_TRANSITION",
          "Восстановите проект из корзины перед дублированием.",
        );
      }
      const timestamp = utcNow();
      const newProjectId = uuidv7();
      const suffix = " — копия";
      const maximumBase = 120 - [...suffix].length;
      const title = normalizeTitle(
        options.title ??
          `${[...source.project.title].slice(0, maximumBase).join("")}${suffix}`,
      );
      const project = baseProject(
        newProjectId,
        title,
        source.project.notes,
        timestamp,
      );
      project.duplicated_from_project_id = projectId;
      project.draft_input = clone(source.project.draft_input);
      project.has_unfinished_calculation =
        source.project.has_unfinished_calculation;
      const calculationMap = new Map();
      const calculations = source.calculations.map((entry) => {
        const calculationId = uuidv7();
        calculationMap.set(entry.calculation_id, calculationId);
        return {
          ...clone(entry),
          calculation_id: calculationId,
          project_id: newProjectId,
          created_at: timestamp,
          created_by_device_id: null,
          supersedes_calculation_id: null,
        };
      });
      if (source.project.active_calculation_id) {
        project.active_calculation_id =
          calculationMap.get(source.project.active_calculation_id) ?? null;
      }
      project.materialized_checksum = await checksumPayload(
        projectChecksumPayload(project),
      );
      const progress = project.active_calculation_id
        ? DEFAULT_CALCULATION_PROGRESS_KINDS.map((kind) =>
            this._initialProgress(
              newProjectId,
              project.active_calculation_id,
              kind,
              timestamp,
            ),
          )
        : [];
      const operation = createOperation(
        project,
        "PROJECT_DUPLICATED",
        { source_project_id: projectId },
        timestamp,
        0,
        1,
      );
      const checkpoint = createCheckpoint(
        project,
        project.materialized_checksum,
        1,
        timestamp,
      );
      const previousCheckpoint = createCheckpoint(
        project,
        project.materialized_checksum,
        0,
        timestamp,
      );
      const database = await this._database();
      const transaction = database.transaction(
        ["projects", "calculations", "progress", "operations", "checkpoints", "meta"],
        "readwrite",
      );
      try {
        await allocateOperationMetadata(transaction, operation);
        transaction.objectStore("projects").add(project);
        calculations.forEach((entry) =>
          transaction.objectStore("calculations").add(entry),
        );
        progress.forEach((entry) => transaction.objectStore("progress").add(entry));
        transaction.objectStore("operations").add(operation);
        transaction.objectStore("checkpoints").add(previousCheckpoint);
        transaction.objectStore("checkpoints").add(checkpoint);
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
      this._notify(newProjectId, 1, "PROJECT_DUPLICATED");
      return clone(project);
    }

    _initialProgress(projectId, calculationId, kind, timestamp) {
      return {
        schema_version: RECORD_SCHEMA_VERSION,
        progress_id: uuidv7(),
        project_id: projectId,
        calculation_id: calculationId,
        partition_key: PARTITION_KEY,
        kind,
        epoch: 1,
        state:
          kind === "SMART_START"
            ? { current_step: 0, completed: false }
            : kind === "FIRST_FABRIC_SECTION"
              ? { version: 0, initialized: false }
              : kind === "FIRST_SIMPLE_SHAPING"
                ? { version: 0, initialized: false }
              : kind === "FIRST_BIND_OFF"
                ? { version: 0, initialized: false }
              : kind === "SECOND_IDENTICAL_PIECE"
                ? { version: 0, initialized: false }
              : kind === "FIRST_ASSEMBLY_PREPARATION"
                ? { version: 0, initialized: false }
              : kind === "FIRST_ASSEMBLY_JOIN"
                ? { version: 0, initialized: false }
              : kind === "FIRST_ASSEMBLY_INSPECTION"
                ? { version: 0, initialized: false }
              : kind === "FIRST_TAIL_SECURING"
                ? { version: 0, initialized: false }
              : kind === "FIRST_BLOCKING"
                ? { version: 0, initialized: false }
              : kind === "PATTERN_IMPORT"
                ? { version: 0, initialized: false }
              : {
                  current_row: 1,
                  current_stitch: 0,
                  completed_rows: [],
                },
        created_at: timestamp,
        updated_at: timestamp,
        revision: 1,
        deleted_at: null,
        purge_after: null,
        sync_status: "LOCAL_ONLY",
        server_version: null,
        last_synced_at: null,
        conflict_id: null,
      };
    }

    async addCalculation(projectId, requestPayload, resultPayload, options = {}) {
      if (!requestPayload || typeof requestPayload !== "object") {
        throw new ProjectRepositoryError(
          "INVALID_CALCULATION_INPUT",
          "Входные данные расчёта имеют неверный формат.",
        );
      }
      if (
        !resultPayload ||
        !["READY", "READY_WITH_WARNINGS"].includes(resultPayload.status)
      ) {
        throw new ProjectRepositoryError(
          "INVALID_CALCULATION_RESULT",
          "Можно сохранить только успешно завершённый расчёт.",
        );
      }
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.workspace_status === "DELETED") {
          throw new ProjectRepositoryError(
            "INVALID_LIFECYCLE_TRANSITION",
            "Нельзя добавить расчёт в проект из корзины.",
          );
        }
        const timestamp = utcNow();
        const calculationId = uuidv7();
        const fingerprint = await checksumPayload({
          request: requestPayload,
          normalized_inputs: resultPayload.normalized_inputs ?? null,
          result: resultPayload,
        });
        const calculation = {
          schema_version: RECORD_SCHEMA_VERSION,
          calculation_id: calculationId,
          project_id: projectId,
          partition_key: PARTITION_KEY,
          fingerprint,
          request: clone(requestPayload),
          normalized_input: clone(resultPayload.normalized_inputs ?? null),
          result: clone(resultPayload),
          domain_status: resultPayload.status,
          warnings: clone(resultPayload.warnings ?? []),
          diagnostics: {
            errors: clone(resultPayload.errors ?? []),
            clarifications: clone(resultPayload.clarifications ?? []),
          },
          engine_version: options.engine_version ?? null,
          canon_version: resultPayload.canon_version ?? null,
          specification_version: resultPayload.specification_version ?? null,
          created_at: timestamp,
          created_by_device_id: null,
          supersedes_calculation_id: before.active_calculation_id,
          payload_checksum: await checksumPayload({
            request: requestPayload,
            result: resultPayload,
          }),
          sync_status: "LOCAL_ONLY",
          server_version: null,
        };
        const next = clone(before);
        next.active_calculation_id = calculationId;
        next.draft_input = clone(requestPayload);
        next.has_unfinished_calculation = false;
        if (next.workspace_status === "DRAFT") {
          next.workspace_status = "ACTIVE";
        }
        next.updated_at = timestamp;
        next.revision += 1;
        next.materialized_checksum = await checksumPayload(
          projectChecksumPayload(next),
        );
        const progress = DEFAULT_CALCULATION_PROGRESS_KINDS.map((kind) =>
          this._initialProgress(projectId, calculationId, kind, timestamp),
        );
        const operation = createOperation(
          next,
          "CALCULATION_CREATED",
          {
            calculation_id: calculationId,
            supersedes_calculation_id: calculation.supersedes_calculation_id,
          },
          timestamp,
          before.revision,
          next.revision,
        );
        const checkpoint = createCheckpoint(
          next,
          next.materialized_checksum,
          next.revision,
          timestamp,
        );
        const database = await this._database();
        const transaction = database.transaction(
          ["projects", "calculations", "progress", "operations", "checkpoints", "meta"],
          "readwrite",
        );
        try {
          const current = await requestResult(
            transaction.objectStore("projects").get(projectId),
          );
          if (!current || current.revision !== before.revision) {
            transaction.abort();
            throw new ProjectRepositoryError(
              "REVISION_CONFLICT",
              "Проект изменён параллельно; расчёт не был перезаписан.",
            );
          }
          await allocateOperationMetadata(transaction, operation);
          calculation.created_by_device_id = operation.device_id;
          transaction.objectStore("calculations").add(calculation);
          progress.forEach((entry) => transaction.objectStore("progress").add(entry));
          transaction.objectStore("projects").put(next);
          transaction.objectStore("operations").add(operation);
          transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) {
          throw mapStorageError(error);
        }
        await this.clearRecoveryDraft(projectId);
        this._notify(projectId, next.revision, "CALCULATION_CREATED");
        return {
          project: clone(next),
          calculation: clone(calculation),
          progress: clone(progress),
        };
      });
    }

    async stageRecoveryDraft(projectId, patch) {
      if (!patch || typeof patch !== "object") {
        return;
      }
      const project = await this._validatedCurrentProject(projectId);
      const timestamp = utcNow();
      const snapshot = {
        project_id: projectId,
        base_revision: project.revision,
        patch: clone(patch),
        staged_at: timestamp,
      };
      const checksum = await checksumPayload(snapshot);
      const checkpoint = {
        schema_version: RECORD_SCHEMA_VERSION,
        checkpoint_id: uuidv7(),
        project_id: projectId,
        aggregate_type: "RECOVERY_DRAFT",
        aggregate_id: projectId,
        revision: project.revision,
        generation: Date.now(),
        snapshot,
        payload_checksum: checksum,
        included_operation_from: null,
        included_operation_to: null,
        created_at: timestamp,
        retention_until: new Date(
          Date.parse(timestamp) + 24 * 60 * 60 * 1000,
        ).toISOString(),
        validation_status: "PENDING_DRAFT",
      };
      const database = await this._database();
      const transaction = database.transaction("checkpoints", "readwrite");
      transaction.objectStore("checkpoints").add(checkpoint);
      try {
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
    }

    async _readLatestRecoveryDraft(projectId) {
      const database = await this._database();
      const checkpoints = await readByProject(
        database,
        "checkpoints",
        "by_project_created",
        projectId,
      );
      const drafts = checkpoints
        .filter(
          (entry) =>
            entry.aggregate_type === "RECOVERY_DRAFT" &&
            entry.validation_status === "PENDING_DRAFT",
        )
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
      for (const draft of drafts) {
        try {
          const checksum = await checksumPayload(draft.snapshot);
          if (
            checksum === draft.payload_checksum &&
            draft.snapshot.project_id === projectId
          ) {
            return clone(draft.snapshot);
          }
        } catch {
          // Corrupted recovery drafts never block project opening.
        }
      }
      return null;
    }

    async clearRecoveryDraft(projectId) {
      const database = await this._database();
      const checkpoints = await readByProject(
        database,
        "checkpoints",
        "by_project_created",
        projectId,
      );
      const draftIds = checkpoints
        .filter((entry) => entry.aggregate_type === "RECOVERY_DRAFT")
        .map((entry) => entry.checkpoint_id);
      if (!draftIds.length) {
        return;
      }
      const transaction = database.transaction("checkpoints", "readwrite");
      draftIds.forEach((id) => transaction.objectStore("checkpoints").delete(id));
      try {
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
    }

    async savePatternFile(projectId, materialId, blob, metadata = {}) {
      if (!isUuidv7(projectId) || typeof materialId !== "string" || !materialId.trim()) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_FILE_SCOPE",
          "Не удалось связать файл с импортом материалов.",
        );
      }
      if (!(blob instanceof Blob) || blob.size <= 0 || blob.size > 50 * 1024 * 1024) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_FILE",
          "Файл пуст или превышает безопасный лимит 50 МБ.",
        );
      }
      await this._validatedCurrentProject(projectId);
      const database = await this._database();
      const existingTx = database.transaction("pattern_files", "readonly");
      const existing = await requestResult(
        existingTx.objectStore("pattern_files").index("by_project_material").get([projectId, materialId]),
      );
      await transactionComplete(existingTx);
      if (existing) return clone(existing);
      const timestamp = utcNow();
      const bytes = await blob.arrayBuffer();
      const hash = await global.crypto.subtle.digest("SHA-256", bytes);
      const checksum = [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const patternFileId = uuidv7();
      const record = {
        schema_version: 1,
        pattern_file_id: patternFileId,
        project_id: projectId,
        material_id: materialId,
        display_name: String(metadata.displayName ?? "material").slice(0, 200),
        media_type: String(metadata.mediaType ?? blob.type ?? "application/octet-stream").slice(0, 120),
        byte_size: blob.size,
        checksum,
        created_at: timestamp,
        updated_at: timestamp,
      };
      const blobRecord = {
        blob_id: uuidv7(),
        pattern_file_id: patternFileId,
        blob,
        byte_size: blob.size,
        checksum,
        created_at: timestamp,
      };
      const transaction = database.transaction(
        ["pattern_files", "pattern_file_blobs"],
        "readwrite",
      );
      try {
        transaction.objectStore("pattern_files").add(record);
        transaction.objectStore("pattern_file_blobs").add(blobRecord);
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
      return clone(record);
    }

    async getPatternFile(projectId, materialId) {
      const database = await this._database();
      const metadataTx = database.transaction("pattern_files", "readonly");
      const metadata = await requestResult(
        metadataTx.objectStore("pattern_files").index("by_project_material").get([projectId, materialId]),
      );
      await transactionComplete(metadataTx);
      if (!metadata) return null;
      const blobTx = database.transaction("pattern_file_blobs", "readonly");
      const blobRecord = await requestResult(
        blobTx.objectStore("pattern_file_blobs").index("by_pattern_file").get(metadata.pattern_file_id),
      );
      await transactionComplete(blobTx);
      if (!blobRecord) return null;
      return { metadata: clone(metadata), blob: blobRecord.blob };
    }

    async deletePatternFile(projectId, materialId) {
      const database = await this._database();
      const readTx = database.transaction("pattern_files", "readonly");
      const metadata = await requestResult(
        readTx.objectStore("pattern_files").index("by_project_material").get([projectId, materialId]),
      );
      await transactionComplete(readTx);
      if (!metadata) return false;
      const blobReadTx = database.transaction("pattern_file_blobs", "readonly");
      const blobRecord = await requestResult(
        blobReadTx.objectStore("pattern_file_blobs").index("by_pattern_file").get(metadata.pattern_file_id),
      );
      await transactionComplete(blobReadTx);
      const transaction = database.transaction(
        ["pattern_files", "pattern_file_blobs"],
        "readwrite",
      );
      transaction.objectStore("pattern_files").delete(metadata.pattern_file_id);
      if (blobRecord) transaction.objectStore("pattern_file_blobs").delete(blobRecord.blob_id);
      await transactionComplete(transaction);
      return true;
    }

    async getPatternContentExtraction(projectId, calculationId) {
      return this.getCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_CONTENT_EXTRACTION",
      );
    }

    async ensurePatternContentExtraction(projectId, calculationId, state, options = {}) {
      if (state?.status !== "waiting") {
        throw new ProjectRepositoryError(
          "INVALID_EXTRACTION_INITIAL_STATE",
          "Начальная запись извлечения должна ожидать запуска.",
        );
      }
      return this.ensureCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_CONTENT_EXTRACTION",
        state,
        options,
      );
    }

    async _transitionPatternContentExtraction(
      projectId,
      calculationId,
      state,
      allowedFrom,
      allowedTo,
      options = {},
    ) {
      const current = await this.getPatternContentExtraction(projectId, calculationId);
      if (!current || !allowedFrom.includes(current.state?.status) || !allowedTo.includes(state?.status)) {
        throw new ProjectRepositoryError(
          "PATTERN_CONTENT_EXTRACTION_TRANSITION_INVALID",
          "Недопустимый переход состояния извлечения содержимого.",
        );
      }
      if (
        state.projectId !== projectId ||
        state.kind !== "PATTERN_CONTENT_EXTRACTION" ||
        state.revision !== current.state.revision + 1 ||
        state.filesCount !== current.state.filesCount
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_CONTENT_EXTRACTION_REVISION_INVALID",
          "Ревизия записи извлечения содержимого недопустима.",
        );
      }
      for (const field of ["sourceImportId", "sourceImportRevision", "sourceAnalysisId", "sourceAnalysisRevision"]) {
        if (current.state[field] !== state[field]) {
          throw new ProjectRepositoryError(
            "SOURCE_REVISION_MISMATCH",
            "Связи исходного импорта или анализа изменились.",
          );
        }
      }
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_CONTENT_EXTRACTION",
        state,
        { ...options, baseProgressRevision: current.revision },
      );
    }

    async startPatternContentExtraction(projectId, calculationId, state, options = {}) {
      return this._transitionPatternContentExtraction(
        projectId, calculationId, state,
        ["waiting", "partial", "failed", "completed"], ["extracting"], options,
      );
    }

    async completePatternContentExtraction(projectId, calculationId, state, options = {}) {
      return this._transitionPatternContentExtraction(
        projectId, calculationId, state, ["extracting"], ["completed", "partial"], options,
      );
    }

    async failPatternContentExtraction(projectId, calculationId, state, options = {}) {
      return this._transitionPatternContentExtraction(
        projectId, calculationId, state, ["waiting", "extracting"], ["failed"], options,
      );
    }

    async retryPatternContentExtraction(projectId, calculationId, state, options = {}) {
      return this.startPatternContentExtraction(projectId, calculationId, state, options);
    }

    async getPatternSemanticAnalysis(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(
        projectId,
        effectiveCalculationId,
        "PATTERN_SEMANTIC_ANALYSIS",
      );
    }

    async ensurePatternSemanticAnalysis(projectId, calculationId, state, options = {}) {
      if (state?.status !== "waiting") {
        throw new ProjectRepositoryError(
          "INVALID_SEMANTIC_ANALYSIS_INITIAL_STATE",
          "Начальная запись семантического анализа должна ожидать запуска.",
        );
      }
      return this.ensureCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_SEMANTIC_ANALYSIS",
        state,
        options,
      );
    }

    async _transitionPatternSemanticAnalysis(
      projectId,
      calculationId,
      state,
      allowedFrom,
      allowedTo,
      options = {},
    ) {
      const current = await this.getPatternSemanticAnalysis(projectId, calculationId);
      if (!current || !allowedFrom.includes(current.state?.status) || !allowedTo.includes(state?.status)) {
        throw new ProjectRepositoryError(
          "PATTERN_SEMANTIC_ANALYSIS_TRANSITION_INVALID",
          "Недопустимый переход состояния семантического анализа.",
        );
      }
      if (
        state.projectId !== projectId ||
        state.kind !== "PATTERN_SEMANTIC_ANALYSIS" ||
        state.revision !== current.state.revision + 1
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_SEMANTIC_ANALYSIS_REVISION_INVALID",
          "Ревизия записи семантического анализа недопустима.",
        );
      }
      const sourceRebaseAllowed = options.allowSourceRebase === true &&
        ["partial", "failed"].includes(current.state?.status) &&
        state.status === "analyzing";
      for (const field of ["sourceExtractionId", "sourceExtractionRevision", "sourceImportRevision", "sourceFingerprint"]) {
        if (current.state[field] !== state[field]) {
          if (sourceRebaseAllowed) continue;
          throw new ProjectRepositoryError(
            "SEMANTIC_SOURCE_REVISION_MISMATCH",
            "Связь семантического анализа с extraction изменилась.",
          );
        }
      }
      const transitionOptions = { ...options };
      delete transitionOptions.allowSourceRebase;
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_SEMANTIC_ANALYSIS",
        state,
        { ...transitionOptions, baseProgressRevision: current.revision },
      );
    }

    async startPatternSemanticAnalysis(projectId, calculationId, state, options = {}) {
      return this._transitionPatternSemanticAnalysis(
        projectId, calculationId, state,
        ["waiting", "partial", "failed"], ["analyzing"], options,
      );
    }

    async completePatternSemanticAnalysis(projectId, calculationId, state, options = {}) {
      return this._transitionPatternSemanticAnalysis(
        projectId, calculationId, state, ["analyzing"], ["completed", "partial"], options,
      );
    }

    async failPatternSemanticAnalysis(projectId, calculationId, state, options = {}) {
      return this._transitionPatternSemanticAnalysis(
        projectId, calculationId, state,
        ["waiting", "analyzing", "completed", "partial", "failed"], ["failed"], options,
      );
    }

    async retryPatternSemanticAnalysis(projectId, calculationId, state, options = {}) {
      return this._transitionPatternSemanticAnalysis(
        projectId, calculationId, state,
        ["partial", "failed"], ["analyzing"],
        { ...options, allowSourceRebase: true },
      );
    }

    async getPatternAnalysisReview(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(
        projectId,
        effectiveCalculationId,
        "PATTERN_ANALYSIS_REVIEW",
      );
    }

    async ensurePatternAnalysisReview(projectId, calculationId, state, options = {}) {
      if (state?.kind !== "PATTERN_ANALYSIS_REVIEW" || state?.status !== "waiting") {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_ANALYSIS_REVIEW_INITIAL_STATE",
          "Начальная запись проверки анализа должна ожидать подготовки.",
        );
      }
      return this.ensureCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_ANALYSIS_REVIEW",
        state,
        options,
      );
    }

    async updatePatternAnalysisReview(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternAnalysisReview(projectId, calculationId);
      if (!current) {
        throw new ProjectRepositoryError(
          "PATTERN_ANALYSIS_REVIEW_NOT_FOUND",
          "Запись проверки анализа не найдена.",
        );
      }
      if (current.state?.status === "confirmed") {
        const unchanged = canonicalize(current.state) === canonicalize(state);
        if (unchanged) return { progress: current };
        if (options.allowConfirmedRebase !== true) {
          throw new ProjectRepositoryError(
            "PATTERN_ANALYSIS_REVIEW_CONFIRMED_IMMUTABLE",
            "Подтверждённая ревизия проверки недоступна для редактирования.",
          );
        }
      }
      if (
        state?.kind !== "PATTERN_ANALYSIS_REVIEW" ||
        state?.projectId !== projectId ||
        state?.id !== current.state?.id ||
        state?.revision !== current.state?.revision + 1
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_ANALYSIS_REVIEW_REVISION_INVALID",
          "Ревизия проверки анализа устарела или повреждена.",
        );
      }
      const transitionOptions = { ...options };
      delete transitionOptions.allowConfirmedRebase;
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_ANALYSIS_REVIEW",
        state,
        { ...transitionOptions, baseProgressRevision: current.revision },
      );
    }

    async getPatternTechnologyDraft(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(
        projectId,
        effectiveCalculationId,
        "PATTERN_TECHNOLOGY_DRAFT",
      );
    }

    async ensurePatternTechnologyDraft(projectId, calculationId, state, options = {}) {
      if (
        state?.kind !== "PATTERN_TECHNOLOGY_DRAFT" ||
        state?.status !== "waiting" ||
        state?.projectId !== projectId ||
        state?.sourceProjectId !== projectId
      ) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_TECHNOLOGY_DRAFT_INITIAL_STATE",
          "Начальная запись черновика технологии должна ожидать построения.",
        );
      }
      return this.ensureCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_TECHNOLOGY_DRAFT",
        state,
        options,
      );
    }

    async updatePatternTechnologyDraft(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternTechnologyDraft(projectId, calculationId);
      if (!current) {
        throw new ProjectRepositoryError(
          "PATTERN_TECHNOLOGY_DRAFT_NOT_FOUND",
          "Запись черновика технологии не найдена.",
        );
      }
      if (
        state?.kind !== "PATTERN_TECHNOLOGY_DRAFT" ||
        state?.projectId !== projectId ||
        state?.sourceProjectId !== projectId ||
        state?.id !== current.state?.id ||
        state?.revision !== current.state?.revision + 1
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_TECHNOLOGY_DRAFT_REVISION_INVALID",
          "Ревизия черновика технологии устарела или повреждена.",
        );
      }
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_TECHNOLOGY_DRAFT",
        state,
        { ...options, baseProgressRevision: current.revision },
      );
    }

    async getPatternTechnologyReview(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(
        projectId,
        effectiveCalculationId,
        "PATTERN_TECHNOLOGY_REVIEW",
      );
    }

    async ensurePatternTechnologyReview(projectId, calculationId, state, options = {}) {
      if (
        state?.kind !== "PATTERN_TECHNOLOGY_REVIEW" ||
        state?.status !== "waiting" ||
        state?.projectId !== projectId ||
        state?.immutableSourceSnapshot?.sourceDraftIdentity?.projectId !== projectId
      ) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_TECHNOLOGY_REVIEW_INITIAL_STATE",
          "Начальная запись проверки технологии должна ожидать пользователя.",
        );
      }
      return this.ensureCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_TECHNOLOGY_REVIEW",
        state,
        options,
      );
    }

    async updatePatternTechnologyReview(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternTechnologyReview(projectId, calculationId);
      if (!current) {
        throw new ProjectRepositoryError(
          "PATTERN_TECHNOLOGY_REVIEW_NOT_FOUND",
          "Запись проверки технологии не найдена.",
        );
      }
      if (
        state?.kind !== "PATTERN_TECHNOLOGY_REVIEW" ||
        state?.projectId !== projectId ||
        state?.id !== current.state?.id ||
        state?.revision !== current.state?.revision + 1
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_TECHNOLOGY_REVIEW_REVISION_INVALID",
          "Ревизия проверки технологии устарела или повреждена.",
        );
      }
      if (
        current.state?.status === "confirmed" &&
        state.status !== "reviewing" &&
        state.status !== "stale"
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_TECHNOLOGY_REVIEW_CONFIRMED_IMMUTABLE",
          "Подтверждённую проверку можно изменить только через явное reopen или stale transition.",
        );
      }
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_TECHNOLOGY_REVIEW",
        state,
        { ...options, baseProgressRevision: current.revision },
      );
    }

    async getPatternExecutionPlan(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(
        projectId,
        effectiveCalculationId,
        "PATTERN_EXECUTION_PLAN",
      );
    }

    async ensurePatternExecutionPlan(projectId, calculationId, state, options = {}) {
      if (
        state?.kind !== "PATTERN_EXECUTION_PLAN" ||
        state?.schemaVersion !== 1 ||
        state?.version !== 1 ||
        state?.status !== "waiting" ||
        state?.projectId !== projectId
      ) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_EXECUTION_PLAN_INITIAL_STATE",
          "Начальная запись плана выполнения должна ожидать построения.",
        );
      }
      return this.ensureCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_EXECUTION_PLAN",
        state,
        options,
      );
    }

    async updatePatternExecutionPlan(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternExecutionPlan(projectId, calculationId);
      if (!current) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_PLAN_NOT_FOUND",
          "Запись плана выполнения не найдена.",
        );
      }
      if (
        state?.kind !== "PATTERN_EXECUTION_PLAN" ||
        state?.projectId !== projectId ||
        state?.id !== current.state?.id ||
        state?.revision !== current.state?.revision + 1
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_PLAN_REVISION_INVALID",
          "Ревизия плана выполнения устарела или повреждена.",
        );
      }
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_EXECUTION_PLAN",
        state,
        { ...options, baseProgressRevision: current.revision },
      );
    }

    async getPatternExecutionSession(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(projectId, effectiveCalculationId, "PATTERN_EXECUTION_SESSION");
    }

    async ensurePatternExecutionSession(projectId, calculationId, state, options = {}) {
      if (
        state?.kind !== "PATTERN_EXECUTION_SESSION" || state?.schemaVersion !== 1 || state?.version !== 1 ||
        state?.status !== "waiting" || state?.projectId !== projectId
      ) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_EXECUTION_SESSION_INITIAL_STATE",
          "Начальная запись сессии выполнения должна ожидать явного запуска.",
        );
      }
      return this.ensureCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_SESSION", state, options);
    }

    async updatePatternExecutionSession(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternExecutionSession(projectId, calculationId);
      if (!current) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_SESSION_NOT_FOUND",
          "Запись сессии выполнения не найдена.",
        );
      }
      if (
        state?.kind !== "PATTERN_EXECUTION_SESSION" || state?.projectId !== projectId ||
        state?.id !== current.state?.id || state?.revision !== current.state?.revision + 1
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_SESSION_REVISION_INVALID",
          "Revision сессии выполнения устарела или повреждена.",
        );
      }
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_EXECUTION_SESSION",
        state,
        { ...options, baseProgressRevision: current.revision },
      );
    }

    async getPatternExecutionStep(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(projectId, effectiveCalculationId, "PATTERN_EXECUTION_STEP");
    }

    async ensurePatternExecutionStep(projectId, calculationId, state, options = {}) {
      if (
        state?.kind !== "PATTERN_EXECUTION_STEP" || state?.schemaVersion !== 1 || state?.version !== 1 ||
        !["ready", "blocked"].includes(state?.status) || state?.projectId !== projectId
      ) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_EXECUTION_STEP_INITIAL_STATE",
          "Начальная запись исполняемого шага должна быть готова или явно заблокирована.",
        );
      }
      return this.ensureCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_STEP", state, options);
    }

    async updatePatternExecutionStep(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternExecutionStep(projectId, calculationId);
      if (!current) {
        throw new ProjectRepositoryError("PATTERN_EXECUTION_STEP_NOT_FOUND", "Запись исполняемого шага не найдена.");
      }
      if (
        state?.kind !== "PATTERN_EXECUTION_STEP" || state?.projectId !== projectId ||
        state?.id !== current.state?.id || state?.revision !== current.state?.revision + 1
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_STEP_REVISION_INVALID",
          "Revision исполняемого шага устарела или повреждена.",
          { details: { expectedRevision: current.state?.revision + 1, actualRevision: state?.revision } },
        );
      }
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_EXECUTION_STEP",
        state,
        { ...options, baseProgressRevision: current.revision },
      );
    }

    async mutatePatternExecutionStep(projectId, calculationId, mutation, options = {}) {
      if (typeof mutation !== "function") {
        throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_STEP_MUTATION", "Mutation исполняемого шага не задана.");
      }
      const current = await this.getPatternExecutionStep(projectId, calculationId);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_STEP_NOT_FOUND", "Запись исполняемого шага не найдена.");
      const expectedRevision = options.expectedRevision ?? current.state.revision;
      if (expectedRevision !== current.state.revision) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_STEP_REVISION_CONFLICT",
          "Исполняемый шаг изменён в другой операции.",
          { details: { expectedRevision, actualRevision: current.state.revision } },
        );
      }
      const next = mutation(clone(current.state));
      if (canonicalize(next) === canonicalize(current.state)) return current;
      return this.updatePatternExecutionStep(projectId, calculationId, next, options);
    }

    async startPatternExecutionStep(projectId, calculationId, options = {}) {
      const api = global.YarnAIPatternExecutionStep;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_STEP_API_MISSING", "Модуль исполняемого шага не загружен.");
      return this.mutatePatternExecutionStep(projectId, calculationId, (state) => api.startStep(state, options), options);
    }

    async updatePatternExecutionStepProgress(projectId, calculationId, command, value, options = {}) {
      const api = global.YarnAIPatternExecutionStep;
      const operations = {
        increment: (state) => api.incrementProgress(state, options),
        decrement: (state) => api.decrementProgress(state, options),
        set: (state) => api.setProgress(state, value, options),
        measurement: (state) => api.setMeasurement(state, value, options),
        checkpoint: (state) => api.setCheckpointCriterion(state, value?.criterionId, value?.status, options),
        check: (state) => api.checkStep(state, options),
      };
      if (!api || !operations[command]) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_STEP_MUTATION", "Команда progress недоступна.");
      return this.mutatePatternExecutionStep(projectId, calculationId, operations[command], options);
    }

    async pausePatternExecutionStep(projectId, calculationId, options = {}) {
      const api = global.YarnAIPatternExecutionStep;
      return this.mutatePatternExecutionStep(projectId, calculationId, (state) => api.pauseStep(state, options), options);
    }

    async resumePatternExecutionStep(projectId, calculationId, options = {}) {
      const api = global.YarnAIPatternExecutionStep;
      return this.mutatePatternExecutionStep(projectId, calculationId, (state) => api.resumeStep(state, options), options);
    }

    async completePatternExecutionStep(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionStep;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_STEP_API_MISSING", "Модуль исполняемого шага не загружен.");
      return api.completeForProject(this, projectId, options);
    }

    async recoverPatternExecutionStep(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionStep;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_STEP_API_MISSING", "Модуль исполняемого шага не загружен.");
      return api.recoverForProject(this, projectId, options);
    }

    async validatePatternExecutionStepStale(projectId) {
      const api = global.YarnAIPatternExecutionStep;
      return api.inspectAggregate(await this.getProject(projectId));
    }

    async rebuildPatternExecutionStep(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionStep;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_STEP_API_MISSING", "Модуль исполняемого шага не загружен.");
      return api.rebuildForProject(this, projectId, options);
    }

    async syncPatternExecutionStepCompletion(projectId, calculationId, options = {}) {
      const step = options.stepState;
      const operationId = typeof options.operationId === "string" ? options.operationId.trim() : "";
      if (
        !step || step.kind !== "PATTERN_EXECUTION_STEP" || step.projectId !== projectId ||
        step.completionState?.status !== "sync_pending" || step.completionState?.operationId !== operationId || !operationId
      ) {
        throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_STEP_COMPLETION", "Ожидающее завершение шага не доказано.");
      }
      const currentStep = await this.getPatternExecutionStep(projectId, calculationId);
      if (!currentStep || currentStep.state.id !== step.id || currentStep.state.revision !== step.revision) {
        throw new ProjectRepositoryError("PATTERN_EXECUTION_STEP_REVISION_CONFLICT", "Шаг изменился до синхронизации сессии.");
      }
      const current = await this.getPatternExecutionSession(projectId, calculationId);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_SESSION_NOT_FOUND", "Сессия выполнения не найдена.");
      const priorAudit = current.state.audit?.find((entry) => entry.event === "action_completed" && entry.actionId === step.actionId && entry.operationId === operationId);
      const priorAction = current.state.execution?.actions?.find((entry) => entry.actionId === step.actionId);
      if (priorAudit && priorAction?.status === "completed") return current;
      if (current.state.revision !== options.expectedSessionRevision) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_SESSION_REVISION_CONFLICT",
          "Сессия изменилась до подтверждения шага.",
          { details: { expectedRevision: options.expectedSessionRevision, actualRevision: current.state.revision } },
        );
      }
      if (
        current.state.id !== step.sourceSessionId || current.state.sessionFingerprint !== step.sourceSessionFingerprint ||
        current.state.sourceExecutionPlanId !== step.sourcePlanId || current.state.sourceExecutionPlanRevision !== step.sourcePlanRevision ||
        current.state.sourceExecutionPlanFingerprint !== step.sourcePlanFingerprint || current.state.sourceImportRevision !== step.sourceImportRevision
      ) {
        throw new ProjectRepositoryError("PATTERN_EXECUTION_STEP_SOURCE_MISMATCH", "Identity сессии не совпадает с immutable snapshot шага.");
      }
      const sessionApi = global.YarnAIPatternExecutionSession;
      if (!sessionApi) throw new ProjectRepositoryError("PATTERN_EXECUTION_SESSION_API_MISSING", "Модуль сессии выполнения не загружен.");
      const next = sessionApi.completeCurrentAction(current.state, {
        actionId: step.actionId,
        expectedRevision: current.state.revision,
        operationId,
        result: { source: "PATTERN_EXECUTION_STEP", stepId: step.id, stepRevision: step.revision },
      });
      return this.updatePatternExecutionSession(projectId, calculationId, next, {
        operationKind: "PATTERN_EXECUTION_STEP_SESSION_SYNCHRONIZED",
        projectStage: "pattern_execution_step_checking",
      });
    }

    async listPatternExecutionCheckpoints(projectId, calculationId = null) {
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(
        transaction.objectStore("progress").index("by_calculation_kind").getAll(
          global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_CHECKPOINT"]),
        ),
      );
      await transactionComplete(transaction);
      return records.filter((entry) => entry.project_id === projectId).sort((left, right) => left.epoch - right.epoch).map((entry) => {
        validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_CHECKPOINT");
        return clone(entry);
      });
    }

    async getPatternExecutionCheckpoint(projectId, recordId = null, calculationId = null) {
      const records = await this.listPatternExecutionCheckpoints(projectId, calculationId);
      if (recordId) return records.find((entry) => entry.progress_id === recordId || entry.state?.id === recordId) || null;
      return records.at(-1) || null;
    }

    async createPatternExecutionCheckpoint(projectId, calculationId, state, options = {}) {
      if (
        state?.kind !== "PATTERN_EXECUTION_CHECKPOINT" || state?.schemaVersion !== 1 || state?.version !== 1 ||
        state?.status !== "waiting" || state?.projectId !== projectId || state?.revision !== 1 ||
        typeof options.operationId !== "string" || !options.operationId.trim()
      ) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_CHECKPOINT_INITIAL_STATE", "Начальный Stage 25 повреждён или не содержит operationId.");
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Checkpoint относится не к активному расчёту.");
        const existing = await this.listPatternExecutionCheckpoints(projectId, calculationId);
        const duplicate = existing.find((entry) => entry.state?.id === state.id || (
          entry.state?.sourceSessionId === state.sourceSessionId && entry.state?.checkpointId === state.checkpointId && entry.state?.actionId === state.actionId && entry.state?.status !== "stale"
        ));
        if (duplicate) return clone(duplicate);
        const timestamp = options.timestamp || utcNow();
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_CHECKPOINT", timestamp);
        progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1;
        progress.state = clone(state);
        const nextProject = clone(before); nextProject.current_stage = "pattern_execution_checkpoint_waiting"; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_CHECKPOINT_CREATED", {
          calculation_id: calculationId, progress_id: progress.progress_id, progress_kind: progress.kind,
          progress_epoch: progress.epoch, progress_revision: progress.revision, operation_id: options.operationId,
          progress_state: clone(progress.state),
        }, timestamp, before.revision, nextProject.revision);
        const projectCheckpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database();
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PROGRESS_REVISION_CONFLICT", "Проект изменён в другой вкладке."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(projectCheckpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async updatePatternExecutionCheckpoint(projectId, recordId, state, options = {}) {
      const operationId = typeof options.operationId === "string" ? options.operationId.trim() : "";
      if (!operationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_OPERATION_REQUIRED", "Для mutation Stage 25 требуется operationId.");
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        const database = await this._database();
        const read = database.transaction("progress", "readonly");
        const current = await requestResult(read.objectStore("progress").get(recordId));
        await transactionComplete(read);
        if (!current || current.project_id !== projectId || current.kind !== "PATTERN_EXECUTION_CHECKPOINT") throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_NOT_FOUND", "Checkpoint не найден.");
        validateProgressRecord(current, projectId, current.calculation_id, current.kind);
        const expectedRevision = options.expectedRevision;
        if (!Number.isInteger(expectedRevision) || expectedRevision !== current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_REVISION_CONFLICT", "Checkpoint изменён в другой операции.", { details: { expectedRevision, actualRevision: current.state.revision } });
        if (canonicalize(state) === canonicalize(current.state)) return clone(current);
        if (state?.kind !== current.kind || state?.projectId !== projectId || state?.id !== current.state.id || state?.revision !== current.state.revision + 1 || !state.operations?.some((entry) => entry.operationId === operationId)) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_REVISION_INVALID", "Mutation Stage 25 повреждена.");
        const timestamp = options.timestamp || utcNow();
        const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_checkpoint_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_CHECKPOINT_${state.status.toUpperCase()}`, {
          calculation_id: current.calculation_id, progress_id: current.progress_id, progress_epoch: current.epoch,
          progress_revision: nextProgress.revision, operation_id: operationId, progress_state: clone(state),
        }, timestamp, before.revision, nextProject.revision);
        const projectCheckpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          const storedProgress = await requestResult(transaction.objectStore("progress").get(recordId));
          if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_REVISION_CONFLICT", "Checkpoint изменён параллельно."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(projectCheckpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(nextProgress);
      });
    }

    async mutatePatternExecutionCheckpoint(projectId, recordId, mutation, options = {}) {
      if (typeof mutation !== "function") throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_CHECKPOINT_MUTATION", "Mutation Stage 25 не задана.");
      const current = await this.getPatternExecutionCheckpoint(projectId, recordId);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_NOT_FOUND", "Checkpoint не найден.");
      if (options.expectedRevision !== current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_REVISION_CONFLICT", "Checkpoint изменён в другой операции.", { details: { expectedRevision: options.expectedRevision, actualRevision: current.state.revision } });
      const next = mutation(clone(current.state));
      if (canonicalize(next) === canonicalize(current.state)) return current;
      return this.updatePatternExecutionCheckpoint(projectId, current.progress_id, next, options);
    }

    async startPatternExecutionCheckpoint(projectId, recordId, options = {}) {
      const api = global.YarnAIPatternExecutionCheckpoint;
      return this.mutatePatternExecutionCheckpoint(projectId, recordId, (state) => api.startReview(state, options), options);
    }

    async deferPatternExecutionCheckpoint(projectId, recordId, options = {}) {
      const api = global.YarnAIPatternExecutionCheckpoint;
      return this.mutatePatternExecutionCheckpoint(projectId, recordId, (state) => api.deferCheckpoint(state, options), options);
    }

    async rejectPatternExecutionCheckpoint(projectId, recordId, options = {}) {
      const api = global.YarnAIPatternExecutionCheckpoint;
      return this.mutatePatternExecutionCheckpoint(projectId, recordId, (state) => api.rejectCheckpoint(state, options), options);
    }

    async confirmPatternExecutionCheckpoint(projectId, recordId, options = {}) {
      const api = global.YarnAIPatternExecutionCheckpoint;
      const aggregate = await this.getProject(projectId);
      const calculation = aggregate.calculations.find((entry) => entry.calculation_id === aggregate.project.active_calculation_id);
      const find = (kind) => aggregate.progress.find((entry) => entry.calculation_id === calculation?.calculation_id && entry.kind === kind && entry.epoch === 1)?.state || null;
      const current = await this.getPatternExecutionCheckpoint(projectId, recordId, calculation?.calculation_id);
      const context = { executionPlan: find("PATTERN_EXECUTION_PLAN"), technologyReview: find("PATTERN_TECHNOLOGY_REVIEW"), technologyDraft: find("PATTERN_TECHNOLOGY_DRAFT"), analysisReview: find("PATTERN_ANALYSIS_REVIEW"), semanticAnalysis: find("PATTERN_SEMANTIC_ANALYSIS"), requireCurrentIdentity: true };
      const next = api.beginConfirmation(current.state, find("PATTERN_EXECUTION_SESSION"), context.executionPlan, find("PATTERN_EXECUTION_STEP"), { ...options, context });
      const pending = await this.updatePatternExecutionCheckpoint(projectId, current.progress_id, next, options);
      return this.syncPatternExecutionCheckpoint(projectId, pending.progress_id, { ...options, expectedRevision: pending.state.revision });
    }

    _patternExecutionCheckpointContext(aggregate) {
      const calculation = aggregate.calculations.find((entry) => entry.calculation_id === aggregate.project.active_calculation_id) || null;
      const find = (kind) => aggregate.progress.find((entry) => entry.calculation_id === calculation?.calculation_id && entry.kind === kind && entry.epoch === 1)?.state || null;
      return {
        calculation, session: find("PATTERN_EXECUTION_SESSION"), plan: find("PATTERN_EXECUTION_PLAN"), step: find("PATTERN_EXECUTION_STEP"),
        context: { executionPlan: find("PATTERN_EXECUTION_PLAN"), technologyReview: find("PATTERN_TECHNOLOGY_REVIEW"), technologyDraft: find("PATTERN_TECHNOLOGY_DRAFT"), analysisReview: find("PATTERN_ANALYSIS_REVIEW"), semanticAnalysis: find("PATTERN_SEMANTIC_ANALYSIS"), requireCurrentIdentity: true },
      };
    }

    async createPatternExecutionCheckpointForCurrentAction(projectId, checkpointId, options = {}) {
      const api = global.YarnAIPatternExecutionCheckpoint;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_API_MISSING", "Модуль Stage 25 не загружен.");
      const operationId = typeof options.operationId === "string" ? options.operationId.trim() : "";
      if (!operationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_OPERATION_REQUIRED", "Для создания Stage 25 требуется operationId.");
      const aggregate = await this.getProject(projectId); const source = this._patternExecutionCheckpointContext(aggregate);
      if (!source.calculation) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Активный расчёт не найден.");
      const existing = (await this.listPatternExecutionCheckpoints(projectId, source.calculation.calculation_id)).find((entry) => entry.state?.sourceSessionId === source.session?.id && entry.state?.actionId === source.session?.currentPosition?.actionId && entry.state?.checkpointId === checkpointId && entry.state?.status !== "stale");
      if (existing) return existing;
      const initial = api.createCheckpoint(source.session, source.plan, source.step, { projectId, checkpointId, context: source.context, now: options.now });
      const created = await this.createPatternExecutionCheckpoint(projectId, source.calculation.calculation_id, initial, { ...options, operationId });
      const readyOperationId = `${operationId}:ready`;
      const ready = api.prepareCheckpoint(created.state, source.session, source.plan, source.step, { expectedRevision: created.state.revision, operationId: readyOperationId, context: source.context, now: options.now });
      return this.updatePatternExecutionCheckpoint(projectId, created.progress_id, ready, { expectedRevision: created.state.revision, operationId: readyOperationId, operationKind: "PATTERN_EXECUTION_CHECKPOINT_READY" });
    }

    async recordPatternExecutionCheckpointObservation(projectId, recordId, observationId, value, options = {}) {
      const api = global.YarnAIPatternExecutionCheckpoint;
      return this.mutatePatternExecutionCheckpoint(projectId, recordId, (state) => api.setObservation(state, observationId, value, options), options);
    }

    async recoverPatternExecutionCheckpoint(projectId, recordId, options = {}) {
      const api = global.YarnAIPatternExecutionCheckpoint;
      const aggregate = await this.getProject(projectId); const source = this._patternExecutionCheckpointContext(aggregate);
      const current = await this.getPatternExecutionCheckpoint(projectId, recordId, source.calculation?.calculation_id);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_NOT_FOUND", "Checkpoint не найден.");
      if (current.state.status === "confirmed") return current;
      if (current.state.status === "sync_pending") return this.syncPatternExecutionCheckpoint(projectId, current.progress_id, { operationId: current.state.synchronization.operationId, expectedRevision: current.state.revision, timestamp: options.timestamp });
      const next = api.recoverCheckpoint(current.state, source.session, source.plan, source.step, { ...options, expectedRevision: options.expectedRevision ?? current.state.revision, context: source.context });
      if (canonicalize(next) === canonicalize(current.state)) return current;
      return this.updatePatternExecutionCheckpoint(projectId, current.progress_id, next, { ...options, expectedRevision: current.state.revision });
    }

    async validatePatternExecutionCheckpointStale(projectId, recordId = null) {
      const api = global.YarnAIPatternExecutionCheckpoint;
      const aggregate = await this.getProject(projectId); const source = this._patternExecutionCheckpointContext(aggregate);
      const current = await this.getPatternExecutionCheckpoint(projectId, recordId, source.calculation?.calculation_id);
      if (!current) return { stale: false, reasonCode: "checkpoint_missing", record: null };
      return { ...api.detectStaleness(current.state, source.session, source.plan, source.step, source.context), record: current };
    }

    async rebuildPatternExecutionCheckpoint(projectId, recordId, options = {}) {
      const api = global.YarnAIPatternExecutionCheckpoint;
      const aggregate = await this.getProject(projectId); const source = this._patternExecutionCheckpointContext(aggregate);
      const current = await this.getPatternExecutionCheckpoint(projectId, recordId, source.calculation?.calculation_id);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_NOT_FOUND", "Checkpoint не найден.");
      const next = api.rebuildCheckpoint(current.state, source.session, source.plan, source.step, { ...options, expectedRevision: options.expectedRevision ?? current.state.revision, context: source.context });
      return this.updatePatternExecutionCheckpoint(projectId, current.progress_id, next, { ...options, expectedRevision: current.state.revision });
    }

    async syncPatternExecutionCheckpoint(projectId, recordId, options = {}) {
      const operationId = typeof options.operationId === "string" ? options.operationId.trim() : "";
      if (!operationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_OPERATION_REQUIRED", "Для sync Stage 25 требуется operationId.");
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId); const calculationId = before.active_calculation_id;
        const database = await this._database();
        const read = database.transaction("progress", "readonly");
        const checkpointProgress = await requestResult(read.objectStore("progress").get(recordId));
        const index = read.objectStore("progress").index("by_scope_epoch");
        const sessionProgress = await requestResult(index.get([projectId, calculationId, "PATTERN_EXECUTION_SESSION", 1]));
        const stepProgress = await requestResult(index.get([projectId, calculationId, "PATTERN_EXECUTION_STEP", 1]));
        await transactionComplete(read);
        if (!checkpointProgress || !sessionProgress) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_SYNC_SOURCE_MISSING", "Связанные записи Stage 23/25 отсутствуют.");
        const state = checkpointProgress.state;
        if (state.status === "confirmed" && state.synchronization?.operationId === operationId) return clone(checkpointProgress);
        if (state.status !== "sync_pending" || state.synchronization?.operationId !== operationId || state.revision !== options.expectedRevision) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_REVISION_CONFLICT", "Pending checkpoint изменился до sync.");
        const checkpointApi = global.YarnAIPatternExecutionCheckpoint; const sessionApi = global.YarnAIPatternExecutionSession; const stepApi = global.YarnAIPatternExecutionStep;
        if (!checkpointApi || !sessionApi || !stepApi) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_API_MISSING", "Модули Stage 23–25 не загружены.");
        let nextSession = clone(sessionProgress.state);
        if (!checkpointApi.sessionAcknowledged(nextSession, operationId, state.actionId)) nextSession = sessionApi.completeCurrentAction(nextSession, { actionId: state.actionId, expectedRevision: nextSession.revision, operationId, result: { source: "PATTERN_EXECUTION_CHECKPOINT", checkpointRecordId: state.id, checkpointId: state.checkpointId, checkpointRevision: state.revision } });
        let nextStep = stepProgress ? clone(stepProgress.state) : null;
        if (state.sourceStepId) {
          if (!nextStep || nextStep.id !== state.sourceStepId) throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_STEP_MISSING", "Связанный Stage 24 отсутствует.");
          if (!(nextStep.status === "completed" && nextStep.completionState?.operationId === operationId)) nextStep = stepApi.finalizeCheckpointCompletion(nextStep, nextSession, state, { expectedRevision: nextStep.revision, operationId });
        }
        const nextCheckpoint = checkpointApi.finalizeConfirmation(state, nextSession, nextStep, { operationId });
        const timestamp = options.timestamp || utcNow(); const changed = [];
        for (const [record, nextState] of [[sessionProgress, nextSession], [stepProgress, nextStep], [checkpointProgress, nextCheckpoint]]) {
          if (!record || !nextState || canonicalize(record.state) === canonicalize(nextState)) continue;
          const nextRecord = clone(record); nextRecord.state = clone(nextState); nextRecord.revision += 1; nextRecord.updated_at = timestamp; changed.push(nextRecord);
        }
        const nextProject = clone(before); nextProject.current_stage = "pattern_execution_checkpoint_confirmed"; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, "PATTERN_EXECUTION_CHECKPOINT_SYNCHRONIZED", { operation_id: operationId, checkpoint_progress_id: recordId, checkpoint_state: clone(nextCheckpoint), session_state: clone(nextSession), step_state: clone(nextStep) }, timestamp, before.revision, nextProject.revision);
        const projectCheckpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          const storedCheckpoint = await requestResult(transaction.objectStore("progress").get(recordId));
          if (!storedProject || storedProject.revision !== before.revision || !storedCheckpoint || storedCheckpoint.revision !== checkpointProgress.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_CHECKPOINT_REVISION_CONFLICT", "Identity изменилась во время sync."); }
          await allocateOperationMetadata(transaction, operation);
          changed.forEach((entry) => transaction.objectStore("progress").put(entry)); transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(projectCheckpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(changed.find((entry) => entry.progress_id === recordId) || checkpointProgress);
      });
    }

    async getPatternExecutionProgress(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(projectId, effectiveCalculationId, "PATTERN_EXECUTION_PROGRESS");
    }

    async ensurePatternExecutionProgress(projectId, calculationId, state, options = {}) {
      if (
        state?.kind !== "PATTERN_EXECUTION_PROGRESS" || state?.schemaVersion !== 1 || state?.version !== 1 ||
        state?.status !== "waiting" || state?.projectId !== projectId || state?.revision !== 1
      ) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_EXECUTION_PROGRESS_INITIAL_STATE",
          "Начальный агрегированный progress должен ожидать явного построения.",
        );
      }
      return this.ensureCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_PROGRESS", state, options);
    }

    async updatePatternExecutionProgress(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternExecutionProgress(projectId, calculationId);
      if (!current) {
        throw new ProjectRepositoryError("PATTERN_EXECUTION_PROGRESS_NOT_FOUND", "Агрегированный progress не найден.");
      }
      if (
        state?.kind !== "PATTERN_EXECUTION_PROGRESS" || state?.projectId !== projectId ||
        state?.id !== current.state?.id || state?.revision !== current.state?.revision + 1
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_PROGRESS_REVISION_CONFLICT",
          "Агрегированный progress изменён в другой операции.",
          { details: { expectedRevision: current.state?.revision + 1, actualRevision: state?.revision } },
        );
      }
      if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_PROGRESS_REVISION_CONFLICT",
          "Агрегированный progress изменён в другой операции.",
          { details: { expectedRevision: options.expectedRevision, actualRevision: current.state.revision } },
        );
      }
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_EXECUTION_PROGRESS",
        state,
        { ...options, baseProgressRevision: current.revision },
      );
    }

    async buildPatternExecutionProgress(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionProgress;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_PROGRESS_API_MISSING", "Модуль агрегированного progress не загружен.");
      return api.buildForProject(this, projectId, options);
    }

    async rebuildPatternExecutionProgress(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionProgress;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_PROGRESS_API_MISSING", "Модуль агрегированного progress не загружен.");
      return api.rebuildForProject(this, projectId, options);
    }

    async retryPatternExecutionProgress(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionProgress;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_PROGRESS_API_MISSING", "Модуль агрегированного progress не загружен.");
      return api.retryForProject(this, projectId, options);
    }

    async recoverPatternExecutionProgress(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionProgress;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_PROGRESS_API_MISSING", "Модуль агрегированного progress не загружен.");
      return api.recoverForProject(this, projectId, options);
    }

    async validatePatternExecutionProgressStale(projectId) {
      const api = global.YarnAIPatternExecutionProgress;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_PROGRESS_API_MISSING", "Модуль агрегированного progress не загружен.");
      return api.inspectAggregate(await this.getProject(projectId));
    }

    async getPatternExecutionCompletion(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(projectId, effectiveCalculationId, "PATTERN_EXECUTION_COMPLETION");
    }

    async ensurePatternExecutionCompletion(projectId, calculationId, state, options = {}) {
      const api = global.YarnAIPatternExecutionCompletion;
      if (
        state?.kind !== "PATTERN_EXECUTION_COMPLETION" || state?.schemaVersion !== 1 || state?.version !== 1 ||
        state?.sourceSchemaVersion !== 1 || state?.status !== "waiting" || state?.projectId !== projectId || state?.revision !== 1 ||
        api?.validateCompletionState && api.validateCompletionState(state).length
      ) {
        throw new ProjectRepositoryError(
          "INVALID_PATTERN_EXECUTION_COMPLETION_INITIAL_STATE",
          "Начальный completion должен ожидать явной verification.",
        );
      }
      return this.ensureCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_COMPLETION", state, options);
    }

    async updatePatternExecutionCompletion(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternExecutionCompletion(projectId, calculationId);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_COMPLETION_NOT_FOUND", "Completion не найден.");
      const api = global.YarnAIPatternExecutionCompletion;
      if (
        state?.kind !== "PATTERN_EXECUTION_COMPLETION" || state?.projectId !== projectId ||
        state?.id !== current.state?.id || state?.revision !== current.state?.revision + 1 ||
        api?.validateCompletionState && api.validateCompletionState(state).length
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_COMPLETION_REVISION_CONFLICT",
          "Completion изменён в другой операции.",
          { details: { expectedRevision: current.state?.revision + 1, actualRevision: state?.revision } },
        );
      }
      if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_COMPLETION_REVISION_CONFLICT",
          "Completion изменён в другой операции.",
          { details: { expectedRevision: options.expectedRevision, actualRevision: current.state.revision } },
        );
      }
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_EXECUTION_COMPLETION",
        state,
        { ...options, baseProgressRevision: current.revision },
      );
    }

    async verifyPatternExecutionCompletion(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionCompletion;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_COMPLETION_API_MISSING", "Модуль completion не загружен.");
      return api.verifyForProject(this, projectId, options);
    }

    async retryPatternExecutionCompletion(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionCompletion;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_COMPLETION_API_MISSING", "Модуль completion не загружен.");
      return api.retryForProject(this, projectId, options);
    }

    async rebuildPatternExecutionCompletion(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionCompletion;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_COMPLETION_API_MISSING", "Модуль completion не загружен.");
      return api.rebuildForProject(this, projectId, options);
    }

    async readPatternExecutionCompletion(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionCompletion;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_COMPLETION_API_MISSING", "Модуль completion не загружен.");
      return api.readForProject(this, projectId, options);
    }

    async recoverPatternExecutionCompletion(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionCompletion;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_COMPLETION_API_MISSING", "Модуль completion не загружен.");
      return api.recoverForProject(this, projectId, options);
    }

    async getPatternExecutionResult(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(projectId, effectiveCalculationId, "PATTERN_EXECUTION_RESULT");
    }

    async ensurePatternExecutionResult(projectId, calculationId, state, options = {}) {
      const api = global.YarnAIPatternExecutionResult;
      if (
        state?.kind !== "PATTERN_EXECUTION_RESULT" || state?.schemaVersion !== 1 || state?.version !== 1 ||
        state?.sourceSchemaVersion !== 1 || state?.status !== "waiting" || state?.projectId !== projectId || state?.revision !== 1 ||
        api?.validateResultState && api.validateResultState(state).length
      ) {
        throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_RESULT_INITIAL_STATE", "Начальный итоговый результат должен ожидать явной генерации.");
      }
      return this.ensureCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_RESULT", state, options);
    }

    async updatePatternExecutionResult(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternExecutionResult(projectId, calculationId);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_RESULT_NOT_FOUND", "Итоговый результат не найден.");
      const api = global.YarnAIPatternExecutionResult;
      if (
        state?.kind !== "PATTERN_EXECUTION_RESULT" || state?.projectId !== projectId ||
        state?.id !== current.state?.id || state?.revision !== current.state?.revision + 1 ||
        api?.validateResultState && api.validateResultState(state).length
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_RESULT_REVISION_CONFLICT",
          "Итоговый результат изменён в другой операции.",
          { details: { expectedRevision: current.state?.revision + 1, actualRevision: state?.revision } },
        );
      }
      if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_RESULT_REVISION_CONFLICT",
          "Итоговый результат изменён в другой операции.",
          { details: { expectedRevision: options.expectedRevision, actualRevision: current.state.revision } },
        );
      }
      return this.updateCalculationProgress(
        projectId,
        calculationId,
        "PATTERN_EXECUTION_RESULT",
        state,
        { ...options, baseProgressRevision: current.revision },
      );
    }

    async generatePatternExecutionResult(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionResult;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_RESULT_API_MISSING", "Модуль итогового результата не загружен.");
      return api.generateForProject(this, projectId, options);
    }

    async retryPatternExecutionResult(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionResult;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_RESULT_API_MISSING", "Модуль итогового результата не загружен.");
      return api.retryForProject(this, projectId, options);
    }

    async rebuildPatternExecutionResult(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionResult;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_RESULT_API_MISSING", "Модуль итогового результата не загружен.");
      return api.rebuildForProject(this, projectId, options);
    }

    async readPatternExecutionResult(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionResult;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_RESULT_API_MISSING", "Модуль итогового результата не загружен.");
      return api.readForProject(this, projectId, options);
    }

    async recoverPatternExecutionResult(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionResult;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_RESULT_API_MISSING", "Модуль итогового результата не загружен.");
      return api.recoverForProject(this, projectId, options);
    }

    async getPatternExecutionRuntime(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(projectId, effectiveCalculationId, "PATTERN_EXECUTION_RUNTIME");
    }

    async ensurePatternExecutionRuntime(projectId, calculationId, state, options = {}) {
      const api = global.YarnAIPatternExecutionRuntime;
      const report = api?.validateRuntime?.(state);
      if (
        state?.type !== "PATTERN_EXECUTION_RUNTIME" || state?.kind !== "PATTERN_EXECUTION_RUNTIME" ||
        state?.schemaVersion !== 1 || state?.version !== 1 || state?.sourceSchemaVersion !== 1 ||
        state?.status !== "waiting" || state?.projectId !== projectId || state?.revision !== 1 ||
        report && !report.valid
      ) {
        throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_RUNTIME_INITIAL_STATE", "Начальный runtime должен ожидать явной validation.");
      }
      validateImportedPatternExecutionRuntime(state, projectId);
      return this.ensureCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_RUNTIME", state, options);
    }

    async updatePatternExecutionRuntime(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternExecutionRuntime(projectId, calculationId);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_RUNTIME_NOT_FOUND", "Runtime не найден.");
      const api = global.YarnAIPatternExecutionRuntime;
      const report = api?.validateRuntime?.(state);
      if (
        state?.type !== "PATTERN_EXECUTION_RUNTIME" || state?.kind !== "PATTERN_EXECUTION_RUNTIME" ||
        state?.projectId !== projectId || state?.id !== current.state?.id ||
        state?.revision !== current.state?.revision + 1 || report && !report.valid
      ) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_RUNTIME_REVISION_CONFLICT",
          "Runtime изменён другой операцией.",
          { details: { expectedRevision: current.state?.revision + 1, actualRevision: state?.revision } },
        );
      }
      if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) {
        throw new ProjectRepositoryError(
          "PATTERN_EXECUTION_RUNTIME_REVISION_CONFLICT",
          "Runtime изменён другой операцией.",
          { details: { expectedRevision: options.expectedRevision, actualRevision: current.state.revision } },
        );
      }
      validateImportedPatternExecutionRuntime(state, projectId);
      return this.updateCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_RUNTIME", state, { ...options, baseProgressRevision: current.revision });
    }

    async createPatternExecutionRuntime(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionRuntime;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_RUNTIME_API_MISSING", "Модуль runtime не загружен.");
      return api.createForProject(this, projectId, options);
    }

    async readPatternExecutionRuntime(projectId) {
      const api = global.YarnAIPatternExecutionRuntime;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_RUNTIME_API_MISSING", "Модуль runtime не загружен.");
      return api.readForProject(this, projectId);
    }

    async executePatternExecutionRuntimeCommand(projectId, command, options = {}) {
      const api = global.YarnAIPatternExecutionRuntime;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_RUNTIME_API_MISSING", "Модуль runtime не загружен.");
      return api.executeForProject(this, projectId, command, options);
    }

    async validatePatternExecutionRuntime(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "validate", options); }
    async startPatternExecutionRuntime(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "start", options); }
    async pausePatternExecutionRuntime(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "pause", options); }
    async resumePatternExecutionRuntime(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "resume", options); }
    async beginPatternExecutionRuntimeAction(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "begin_current_action", options); }
    async completePatternExecutionRuntimeAction(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "complete_current_action", options); }
    async failPatternExecutionRuntimeAction(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "fail_current_action", options); }
    async blockPatternExecutionRuntimeAction(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "block_current_action", options); }
    async unblockPatternExecutionRuntimeAction(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "unblock_current_action", options); }
    async skipPatternExecutionRuntimeAction(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "skip_current_action", options); }
    async stopPatternExecutionRuntime(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "stop", options); }
    async failPatternExecutionRuntime(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "fail", options); }
    async recoverPatternExecutionRuntime(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "recover", options); }
    async markPatternExecutionRuntimeStale(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "mark_stale", options); }
    async rebuildPatternExecutionRuntime(projectId, options = {}) { return this.executePatternExecutionRuntimeCommand(projectId, "rebuild", options); }

    async getPatternExecutionMonitoring(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(projectId, effectiveCalculationId, "PATTERN_EXECUTION_MONITORING");
    }

    async listPatternExecutionMonitoringByProject(projectId) {
      const aggregate = await this.getProject(projectId);
      return aggregate.progress.filter((entry) => entry.kind === "PATTERN_EXECUTION_MONITORING");
    }

    async ensurePatternExecutionMonitoring(projectId, calculationId, state, options = {}) {
      const api = global.YarnAIPatternExecutionMonitoring;
      const report = api?.validateMonitoring?.(state);
      if (
        state?.type !== "PATTERN_EXECUTION_MONITORING" || state?.kind !== "PATTERN_EXECUTION_MONITORING" ||
        state?.schemaVersion !== 1 || state?.version !== 1 || state?.sourceSchemaVersion !== 1 ||
        state?.lifecycle?.state !== "waiting" || state?.projectId !== projectId || state?.revision !== 1 ||
        report && !report.valid
      ) {
        throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_MONITORING_INITIAL_STATE", "Начальный monitoring snapshot должен ожидать явного refresh.");
      }
      validateImportedPatternExecutionMonitoring(state, projectId);
      return this.ensureCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_MONITORING", state, options);
    }

    async updatePatternExecutionMonitoring(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternExecutionMonitoring(projectId, calculationId);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_MONITORING_NOT_FOUND", "Monitoring snapshot не найден.");
      const api = global.YarnAIPatternExecutionMonitoring;
      const report = api?.validateMonitoring?.(state);
      if (
        state?.type !== "PATTERN_EXECUTION_MONITORING" || state?.kind !== "PATTERN_EXECUTION_MONITORING" ||
        state?.projectId !== projectId || state?.id !== current.state?.id ||
        state?.revision !== current.state?.revision + 1 || report && !report.valid
      ) {
        throw new ProjectRepositoryError("PATTERN_EXECUTION_MONITORING_REVISION_CONFLICT", "Monitoring snapshot изменён другой операцией.");
      }
      if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) {
        throw new ProjectRepositoryError("PATTERN_EXECUTION_MONITORING_REVISION_CONFLICT", "Monitoring snapshot изменён другой операцией.");
      }
      validateImportedPatternExecutionMonitoring(state, projectId);
      return this.updateCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_MONITORING", state, { ...options, baseProgressRevision: current.revision });
    }

    async createPatternExecutionMonitoring(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionMonitoring;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_MONITORING_API_MISSING", "Модуль monitoring не загружен.");
      return api.createForProject(this, projectId, options);
    }

    async readPatternExecutionMonitoring(projectId) {
      const api = global.YarnAIPatternExecutionMonitoring;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_MONITORING_API_MISSING", "Модуль monitoring не загружен.");
      return api.readForProject(this, projectId);
    }

    async executePatternExecutionMonitoringCommand(projectId, command, options = {}) {
      const api = global.YarnAIPatternExecutionMonitoring;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_MONITORING_API_MISSING", "Модуль monitoring не загружен.");
      return api.executeForProject(this, projectId, command, options);
    }

    async refreshPatternExecutionMonitoring(projectId, options = {}) { return this.executePatternExecutionMonitoringCommand(projectId, "refresh", options); }
    async recoverPatternExecutionMonitoring(projectId, options = {}) { return this.executePatternExecutionMonitoringCommand(projectId, "recover", options); }
    async rebuildPatternExecutionMonitoring(projectId, options = {}) { return this.executePatternExecutionMonitoringCommand(projectId, "rebuild", options); }

    async getPatternExecutionIntervention(projectId, calculationId = null) {
      let effectiveCalculationId = calculationId;
      if (!effectiveCalculationId) {
        const project = await this._validatedCurrentProject(projectId);
        effectiveCalculationId = project.active_calculation_id;
      }
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(projectId, effectiveCalculationId, "PATTERN_EXECUTION_INTERVENTION");
    }

    async listPatternExecutionInterventionByProject(projectId) {
      const aggregate = await this.getProject(projectId);
      return aggregate.progress.filter((entry) => entry.kind === "PATTERN_EXECUTION_INTERVENTION");
    }

    async ensurePatternExecutionIntervention(projectId, calculationId, state, options = {}) {
      const api = global.YarnAIPatternExecutionIntervention;
      const report = api?.validatePatternExecutionIntervention?.(state);
      if (
        state?.type !== "PATTERN_EXECUTION_INTERVENTION" || state?.kind !== "PATTERN_EXECUTION_INTERVENTION" ||
        state?.schemaVersion !== 1 || state?.version !== 1 || state?.sourceSchemaVersion !== 1 ||
        state?.projectId !== projectId || state?.revision !== 1 || report && !report.valid
      ) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_INTERVENTION_INITIAL_STATE", "Начальный intervention snapshot повреждён.");
      validateImportedPatternExecutionIntervention(state, projectId);
      return this.ensureCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_INTERVENTION", state, options);
    }

    async updatePatternExecutionIntervention(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternExecutionIntervention(projectId, calculationId);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_INTERVENTION_NOT_FOUND", "Intervention snapshot не найден.");
      const api = global.YarnAIPatternExecutionIntervention;
      const report = api?.validatePatternExecutionIntervention?.(state);
      if (
        state?.type !== "PATTERN_EXECUTION_INTERVENTION" || state?.kind !== "PATTERN_EXECUTION_INTERVENTION" ||
        state?.projectId !== projectId || state?.id !== current.state?.id || state?.revision !== current.state?.revision + 1 || report && !report.valid
      ) throw new ProjectRepositoryError("PATTERN_EXECUTION_INTERVENTION_REVISION_CONFLICT", "Intervention snapshot изменён другой операцией.");
      if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_INTERVENTION_REVISION_CONFLICT", "Intervention snapshot изменён другой операцией.");
      validateImportedPatternExecutionIntervention(state, projectId);
      return this.updateCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_INTERVENTION", state, { ...options, baseProgressRevision: current.revision });
    }

    async createPatternExecutionIntervention(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionIntervention;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_INTERVENTION_API_MISSING", "Модуль intervention не загружен.");
      return api.createForProject(this, projectId, options);
    }

    async readPatternExecutionIntervention(projectId) {
      const api = global.YarnAIPatternExecutionIntervention;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_INTERVENTION_API_MISSING", "Модуль intervention не загружен.");
      return api.readForProject(this, projectId);
    }

    async executePatternExecutionInterventionCommand(projectId, command, options = {}) {
      const api = global.YarnAIPatternExecutionIntervention;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_INTERVENTION_API_MISSING", "Модуль intervention не загружен.");
      return api.executeForProject(this, projectId, command, options);
    }

    async selectPatternExecutionInterventionAction(projectId, options = {}) { return this.executePatternExecutionInterventionCommand(projectId, "select", options); }
    async confirmPatternExecutionIntervention(projectId, options = {}) { return this.executePatternExecutionInterventionCommand(projectId, "confirm", options); }
    async cancelPatternExecutionIntervention(projectId, options = {}) { return this.executePatternExecutionInterventionCommand(projectId, "cancel", options); }
    async completePatternExecutionIntervention(projectId, options = {}) { return this.executePatternExecutionInterventionCommand(projectId, "complete", options); }
    async recoverPatternExecutionIntervention(projectId, options = {}) { return this.executePatternExecutionInterventionCommand(projectId, "recover", options); }
    async rebuildPatternExecutionIntervention(projectId, options = {}) { return this.executePatternExecutionInterventionCommand(projectId, "rebuild", options); }

    async getPatternExecutionAction(projectId, calculationId = null) {
      const aggregate = await this.getProject(projectId);
      const effectiveCalculationId = calculationId || aggregate.project.active_calculation_id;
      if (!effectiveCalculationId) return null;
      return this.getCalculationProgress(projectId, effectiveCalculationId, "PATTERN_EXECUTION_ACTION");
    }

    async listPatternExecutionActionByProject(projectId) {
      const aggregate = await this.getProject(projectId);
      return aggregate.progress.filter((entry) => entry.kind === "PATTERN_EXECUTION_ACTION");
    }

    async ensurePatternExecutionAction(projectId, calculationId, state, options = {}) {
      const api = global.YarnAIPatternExecutionAction;
      const report = api?.validatePatternExecutionAction?.(state);
      if (state?.type !== "PATTERN_EXECUTION_ACTION" || state?.kind !== "PATTERN_EXECUTION_ACTION" || state?.projectId !== projectId || report && !report.valid) {
        throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_ACTION_INITIAL_STATE", "Начальный execution action snapshot повреждён.");
      }
      validateImportedPatternExecutionAction(state, projectId);
      return this.ensureCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_ACTION", state, options);
    }

    async updatePatternExecutionAction(projectId, calculationId, state, options = {}) {
      const current = await this.getPatternExecutionAction(projectId, calculationId);
      if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_ACTION_NOT_FOUND", "Execution action snapshot не найден.");
      const api = global.YarnAIPatternExecutionAction;
      const report = api?.validatePatternExecutionAction?.(state);
      if (state?.type !== "PATTERN_EXECUTION_ACTION" || state?.kind !== "PATTERN_EXECUTION_ACTION" || state?.projectId !== projectId || report && !report.valid || options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision || options.expectedFingerprint !== undefined && options.expectedFingerprint !== current.state.fingerprint) {
        throw new ProjectRepositoryError("PATTERN_EXECUTION_ACTION_REVISION_CONFLICT", "Execution action snapshot изменён другой операцией.");
      }
      validateImportedPatternExecutionAction(state, projectId);
      return this.updateCalculationProgress(projectId, calculationId, "PATTERN_EXECUTION_ACTION", state, { ...options, baseProgressRevision: current.revision });
    }

    async createPatternExecutionAction(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionAction;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ACTION_API_MISSING", "Модуль execution action не загружен.");
      return api.createForProject(this, projectId, options);
    }

    async readPatternExecutionAction(projectId) {
      const api = global.YarnAIPatternExecutionAction;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ACTION_API_MISSING", "Модуль execution action не загружен.");
      return api.readForProject(this, projectId);
    }

    async executePatternExecutionActionCommand(projectId, actionCommand, options = {}) {
      const api = global.YarnAIPatternExecutionAction;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ACTION_API_MISSING", "Модуль execution action не загружен.");
      return api.executeForProject(this, projectId, actionCommand, options);
    }

    async validatePatternExecutionAction(projectId, options = {}) { return this.executePatternExecutionActionCommand(projectId, "validate", options); }
    async executePatternExecutionAction(projectId, options = {}) { return this.executePatternExecutionActionCommand(projectId, "execute", options); }
    async verifyPatternExecutionAction(projectId, options = {}) { return this.executePatternExecutionActionCommand(projectId, "verify", options); }
    async recoverPatternExecutionAction(projectId, options = {}) { return this.executePatternExecutionActionCommand(projectId, "recover", options); }
    async retryPatternExecutionAction(projectId, options = {}) { return this.executePatternExecutionActionCommand(projectId, "retry", options); }
    async cancelPatternExecutionAction(projectId, options = {}) { return this.executePatternExecutionActionCommand(projectId, "cancel", options); }
    async rebuildPatternExecutionAction(projectId, options = {}) { return this.executePatternExecutionActionCommand(projectId, "rebuild", options); }

    async listPatternExecutionEvidence(projectId, calculationId = null) {
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(
        transaction.objectStore("progress").index("by_calculation_kind").getAll(
          global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_EVIDENCE"]),
        ),
      );
      await transactionComplete(transaction);
      return records.filter((entry) => entry.project_id === projectId).sort((left, right) => left.epoch - right.epoch).map((entry) => {
        validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_EVIDENCE");
        validateImportedPatternExecutionEvidence(entry.state, projectId);
        return clone(entry);
      });
    }

    async getPatternExecutionEvidence(projectId, recordId = null, calculationId = null) {
      const records = await this.listPatternExecutionEvidence(projectId, calculationId);
      if (recordId) return records.find((entry) => entry.progress_id === recordId || entry.state?.id === recordId) || null;
      return records.at(-1) || null;
    }

    async savePatternExecutionEvidence(projectId, calculationId, state, options = {}) {
      const api = global.YarnAIPatternExecutionEvidence;
      const report = api?.validatePatternExecutionEvidenceSnapshot?.(state);
      if (state?.kind !== "PATTERN_EXECUTION_EVIDENCE" || state?.type !== "PATTERN_EXECUTION_EVIDENCE" || state?.projectId !== projectId || state?.calculationId !== calculationId || report && !report.valid) {
        throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_EVIDENCE_STATE", "Evidence snapshot повреждён.");
      }
      validateImportedPatternExecutionEvidence(state, projectId);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Evidence относится не к активному расчёту.");
        const existing = await this.listPatternExecutionEvidence(projectId, calculationId);
        const current = options.recordId
          ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId)
          : existing.find((entry) => entry.state?.id === state.id);
        if (current) {
          if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision || options.expectedFingerprint !== undefined && options.expectedFingerprint !== current.state.fingerprint) {
            throw new ProjectRepositoryError("PATTERN_EXECUTION_EVIDENCE_REVISION_CONFLICT", "Evidence изменён другой операцией.", { details: { expectedRevision: options.expectedRevision, actualRevision: current.state.revision } });
          }
          if (canonicalize(state) === canonicalize(current.state)) return clone(current);
          if (state.id !== current.state.id || state.epoch !== current.state.epoch || state.revision !== current.state.revision + 1) throw new ProjectRepositoryError("PATTERN_EXECUTION_EVIDENCE_REVISION_CONFLICT", "Evidence revision или identity повреждены.");
          const timestamp = options.timestamp || utcNow();
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
          const nextProject = clone(before); nextProject.current_stage = `pattern_execution_evidence_${state.lifecycle}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
          nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
          const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_EVIDENCE_${state.lifecycle.toUpperCase()}`, {
            calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch,
            progress_revision: nextProgress.revision, operation_id: options.operationId || null, progress_state: clone(state),
          }, timestamp, before.revision, nextProject.revision);
          const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
          const database = await this._database();
          const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
          try {
            const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
            const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id));
            if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_EVIDENCE_REVISION_CONFLICT", "Evidence изменён параллельно."); }
            await allocateOperationMetadata(transaction, operation);
            transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject);
            transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
            await transactionComplete(transaction);
          } catch (error) { throw mapStorageError(error); }
          this._notify(projectId, nextProject.revision, operation.kind);
          return clone(nextProgress);
        }

        if (state.revision !== 1 || existing.some((entry) => entry.state?.id === state.id)) throw new ProjectRepositoryError("PATTERN_EXECUTION_EVIDENCE_IDENTITY_CONFLICT", "Новая evidence запись имеет конфликт identity.");
        const timestamp = options.timestamp || utcNow();
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_EVIDENCE", timestamp);
        progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1;
        progress.state = clone(state);
        if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_EVIDENCE_EPOCH_CONFLICT", "Storage epoch evidence не совпадает с progress epoch.");
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_evidence_${state.lifecycle}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_EVIDENCE_CREATED", {
          calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch,
          progress_revision: progress.revision, operation_id: options.operationId || null, progress_state: clone(state),
        }, timestamp, before.revision, nextProject.revision);
        const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database();
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_EVIDENCE_REVISION_CONFLICT", "Проект изменён параллельно."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async ensurePatternExecutionEvidence(projectId, calculationId, state, options = {}) { return this.savePatternExecutionEvidence(projectId, calculationId, state, options); }
    async updatePatternExecutionEvidence(projectId, recordId, state, options = {}) { return this.savePatternExecutionEvidence(projectId, state.calculationId, state, { ...options, recordId }); }

    async createPatternExecutionEvidence(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionEvidence;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_EVIDENCE_API_MISSING", "Модуль execution evidence не загружен.");
      return api.createForProject(this, projectId, options);
    }

    async readPatternExecutionEvidence(projectId) {
      const api = global.YarnAIPatternExecutionEvidence;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_EVIDENCE_API_MISSING", "Модуль execution evidence не загружен.");
      return api.readForProject(this, projectId);
    }

    async executePatternExecutionEvidenceCommand(projectId, evidenceCommand, options = {}) {
      const api = global.YarnAIPatternExecutionEvidence;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_EVIDENCE_API_MISSING", "Модуль execution evidence не загружен.");
      return api.executeForProject(this, projectId, evidenceCommand, options);
    }

    async collectPatternExecutionEvidence(projectId, options = {}) { return this.executePatternExecutionEvidenceCommand(projectId, "collect", options); }
    async validatePatternExecutionEvidence(projectId, options = {}) { return this.executePatternExecutionEvidenceCommand(projectId, "validate", options); }
    async completePatternExecutionEvidence(projectId, options = {}) { return this.executePatternExecutionEvidenceCommand(projectId, "complete", options); }
    async retryPatternExecutionEvidence(projectId, options = {}) { return this.executePatternExecutionEvidenceCommand(projectId, "retry", options); }
    async rebuildPatternExecutionEvidence(projectId, options = {}) { return this.executePatternExecutionEvidenceCommand(projectId, "rebuild", options); }

    async listPatternExecutionVerification(projectId, calculationId = null) {
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(
        transaction.objectStore("progress").index("by_calculation_kind").getAll(
          global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_VERIFICATION"]),
        ),
      );
      await transactionComplete(transaction);
      return records.filter((entry) => entry.project_id === projectId).sort((left, right) => left.epoch - right.epoch).map((entry) => {
        validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_VERIFICATION");
        validateImportedPatternExecutionVerification(entry.state, projectId);
        return clone(entry);
      });
    }

    async getPatternExecutionVerification(projectId, recordId = null, calculationId = null) {
      const records = await this.listPatternExecutionVerification(projectId, calculationId);
      if (recordId) return records.find((entry) => entry.progress_id === recordId || entry.state?.id === recordId) || null;
      return records.at(-1) || null;
    }

    async _assertPatternExecutionVerificationReferences(projectId, calculationId, state) {
      const actionRecord = await this.getPatternExecutionAction(projectId, calculationId);
      const evidenceRecords = await this.listPatternExecutionEvidence(projectId, calculationId);
      if (state.actionId && (!actionRecord || actionRecord.project_id !== projectId || actionRecord.state?.projectId !== projectId || actionRecord.state?.id !== state.actionId)) {
        throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_ACTION_REFERENCE_INVALID", "Verification ссылается на action другого проекта или отсутствующий action.");
      }
      const evidenceById = new Map(evidenceRecords.map((entry) => [entry.state?.id, entry]));
      if (state.evidenceIds.some((id) => !evidenceById.has(id) || evidenceById.get(id).project_id !== projectId || evidenceById.get(id).state?.projectId !== projectId)) {
        throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_EVIDENCE_REFERENCE_INVALID", "Verification ссылается на evidence другого проекта или отсутствующее evidence.");
      }
      const linkedItemIds = new Set(state.evidenceIds.flatMap((id) => (evidenceById.get(id)?.state?.evidenceItems || []).map((item) => item.id)));
      for (const result of state.criterionResults) {
        for (const id of [...result.supportingEvidenceIds, ...result.conflictingEvidenceIds]) {
          if (!linkedItemIds.has(id)) throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_ITEM_REFERENCE_INVALID", "Criterion result ссылается на evidence item вне verification.");
        }
      }
    }

    async savePatternExecutionVerification(projectId, calculationId, state, options = {}) {
      const api = global.YarnAIPatternExecutionVerification;
      const report = api?.validatePatternExecutionVerification?.(state);
      if (state?.kind !== "PATTERN_EXECUTION_VERIFICATION" || state?.type !== "PATTERN_EXECUTION_VERIFICATION" || state?.projectId !== projectId || state?.calculationId !== calculationId || report && !report.valid) {
        throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_VERIFICATION_STATE", "Execution verification snapshot повреждён.");
      }
      validateImportedPatternExecutionVerification(state, projectId);
      await this._assertPatternExecutionVerificationReferences(projectId, calculationId, state);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Verification относится не к активному расчёту.");
        const existing = await this.listPatternExecutionVerification(projectId, calculationId);
        const current = options.recordId
          ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId)
          : existing.find((entry) => entry.state?.id === state.id);
        if (current) {
          if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision || options.expectedFingerprint !== undefined && options.expectedFingerprint !== current.state.fingerprint) {
            throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_REVISION_CONFLICT", "Verification изменена другой операцией.", { details: { expectedRevision: options.expectedRevision, actualRevision: current.state.revision } });
          }
          if (canonicalize(state) === canonicalize(current.state)) return clone(current);
          if (state.id !== current.state.id || state.epoch !== current.state.epoch || state.revision !== current.state.revision + 1) throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_REVISION_CONFLICT", "Verification revision или identity повреждены.");
          if (["verified", "rejected"].includes(current.state.status) && state.status !== current.state.status) throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_TERMINAL", "Терминальная verification требует отдельного rebuild.");
          const timestamp = options.timestamp || utcNow();
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
          const nextProject = clone(before); nextProject.current_stage = `pattern_execution_verification_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
          nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
          const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_VERIFICATION_${state.status.toUpperCase()}`, {
            calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch,
            progress_revision: nextProgress.revision, operation_id: options.operationId || null, progress_state: clone(state),
          }, timestamp, before.revision, nextProject.revision);
          const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
          const database = await this._database();
          const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
          try {
            const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
            const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id));
            if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_REVISION_CONFLICT", "Verification изменена параллельно."); }
            await allocateOperationMetadata(transaction, operation);
            transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject);
            transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
            await transactionComplete(transaction);
          } catch (error) { throw mapStorageError(error); }
          this._notify(projectId, nextProject.revision, operation.kind);
          return clone(nextProgress);
        }
        if (state.revision !== 1 || existing.some((entry) => entry.state?.id === state.id)) throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_IDENTITY_CONFLICT", "Новая verification имеет конфликт identity.");
        const timestamp = options.timestamp || utcNow();
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_VERIFICATION", timestamp);
        progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1;
        progress.state = clone(state);
        if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_EPOCH_CONFLICT", "Storage epoch verification не совпадает с progress epoch.");
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_verification_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_VERIFICATION_CREATED", {
          calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch,
          progress_revision: progress.revision, operation_id: options.operationId || null, progress_state: clone(state),
        }, timestamp, before.revision, nextProject.revision);
        const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database();
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_REVISION_CONFLICT", "Проект изменён параллельно."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async ensurePatternExecutionVerification(projectId, calculationId, state, options = {}) { return this.savePatternExecutionVerification(projectId, calculationId, state, options); }
    async updatePatternExecutionVerification(projectId, recordId, state, options = {}) { return this.savePatternExecutionVerification(projectId, state.calculationId, state, { ...options, recordId }); }
    async createPatternExecutionVerification(projectId, options = {}) {
      const api = global.YarnAIPatternExecutionVerification;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_API_MISSING", "Модуль execution verification не загружен.");
      return api.createForProject(this, projectId, options);
    }
    async readPatternExecutionVerification(projectId) {
      const api = global.YarnAIPatternExecutionVerification;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_API_MISSING", "Модуль execution verification не загружен.");
      return api.readForProject(this, projectId);
    }
    async executePatternExecutionVerificationCommand(projectId, verificationCommand, options = {}) {
      const api = global.YarnAIPatternExecutionVerification;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_VERIFICATION_API_MISSING", "Модуль execution verification не загружен.");
      return api.executeForProject(this, projectId, verificationCommand, options);
    }
    async verifyPatternExecutionVerification(projectId, options = {}) { return this.executePatternExecutionVerificationCommand(projectId, "verify", options); }
    async rebuildPatternExecutionVerification(projectId, options = {}) { return this.executePatternExecutionVerificationCommand(projectId, "rebuild", options); }

    async listPatternExecutionDecisions(projectId, calculationId = null) {
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(
        transaction.objectStore("progress").index("by_calculation_kind").getAll(
          global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_DECISION"]),
        ),
      );
      await transactionComplete(transaction);
      return records.filter((entry) => entry.project_id === projectId).sort((left, right) => left.epoch - right.epoch).map((entry) => {
        validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_DECISION");
        validateImportedPatternExecutionDecision(entry.state, projectId);
        return clone(entry);
      });
    }

    async getPatternExecutionDecision(projectId, decisionId = null, calculationId = null) {
      const records = await this.listPatternExecutionDecisions(projectId, calculationId);
      if (decisionId) return records.find((entry) => entry.progress_id === decisionId || entry.state?.id === decisionId) || null;
      return records.at(-1) || null;
    }

    async _assertPatternExecutionDecisionReferences(projectId, calculationId, state) {
      const verificationRecords = await this.listPatternExecutionVerification(projectId, calculationId);
      const verificationRecord = verificationRecords.find((entry) => entry.state?.id === state.verificationId);
      if (!verificationRecord || verificationRecord.project_id !== projectId || verificationRecord.state?.projectId !== projectId) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_VERIFICATION_REFERENCE_INVALID", "Decision references a missing or cross-project verification.");
      if (verificationRecord.state.revision !== state.verificationRevision || verificationRecord.state.fingerprint !== state.verificationFingerprint) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_VERIFICATION_REFERENCE_STALE", "Decision references a different verification revision or fingerprint.");
      const actionRecord = await this.getPatternExecutionAction(projectId, calculationId);
      if (!actionRecord || actionRecord.project_id !== projectId || actionRecord.state?.projectId !== projectId || actionRecord.state?.id !== state.actionId) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_ACTION_REFERENCE_INVALID", "Decision references a missing or cross-project action.");
      const identity = actionRecord.state.sourceIdentity || {};
      const planId = identity.executionPlanIdentity?.id || identity.plan?.id || identity.runtimeSourceIdentity?.chain?.plan?.id || actionRecord.state.executionPlanId;
      const sessionId = identity.sessionIdentity?.id || identity.session?.id || identity.runtimeSourceIdentity?.chain?.session?.id || actionRecord.state.sessionId;
      if (planId !== state.executionPlanId || sessionId !== state.sessionId) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_SOURCE_REFERENCE_INVALID", "Decision plan/session references are inconsistent.");
      const evidenceRecords = await this.listPatternExecutionEvidence(projectId, calculationId);
      const evidenceIds = new Set();
      for (const entry of evidenceRecords) {
        if (entry.project_id !== projectId || entry.state?.projectId !== projectId) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_EVIDENCE_REFERENCE_INVALID", "Decision evidence crosses project boundary.");
        if (entry.state?.id) evidenceIds.add(entry.state.id);
        for (const item of Array.isArray(entry.state?.evidenceItems) ? entry.state.evidenceItems : []) if (item.id) evidenceIds.add(item.id);
      }
      if (state.evidenceReferences.some((entry) => !evidenceIds.has(entry.id))) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_EVIDENCE_REFERENCE_INVALID", "Decision references evidence outside its verification.");
    }

    async savePatternExecutionDecision(projectId, calculationOrState, stateOrOptions = {}, maybeOptions = {}) {
      const directState = calculationOrState && typeof calculationOrState === "object";
      const state = directState ? calculationOrState : stateOrOptions;
      const calculationId = directState ? state.calculationId : calculationOrState;
      const options = directState ? stateOrOptions : maybeOptions;
      const api = global.YarnAIPatternExecutionDecision;
      const report = api?.validatePatternExecutionDecision?.(state);
      if (state?.kind !== "PATTERN_EXECUTION_DECISION" || state?.type !== "PATTERN_EXECUTION_DECISION" || state?.projectId !== projectId || state?.calculationId !== calculationId || report && !report.valid) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_DECISION_STATE", "Execution decision snapshot is corrupted.");
      validateImportedPatternExecutionDecision(state, projectId);
      await this._assertPatternExecutionDecisionReferences(projectId, calculationId, state);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Decision does not belong to the active calculation.");
        const existing = await this.listPatternExecutionDecisions(projectId, calculationId);
        const current = options.recordId ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId) : existing.find((entry) => entry.state?.id === state.id);
        if (current) {
          if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision || options.expectedFingerprint !== undefined && options.expectedFingerprint !== current.state.fingerprint) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_REVISION_CONFLICT", "Decision was changed by another operation.", { details: { expectedRevision: options.expectedRevision, actualRevision: current.state.revision } });
          if (canonicalize(state) === canonicalize(current.state)) return clone(current);
          if (state.id !== current.state.id || state.epoch !== current.state.epoch || state.revision !== current.state.revision + 1) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_REVISION_CONFLICT", "Decision revision or identity is invalid.");
          if (["accepted", "rejected"].includes(current.state.status)) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_TERMINAL", "Terminal decision is immutable; use rebuild.");
          if (state.verificationId !== current.state.verificationId || state.actionId !== current.state.actionId || state.executionPlanId !== current.state.executionPlanId || state.sessionId !== current.state.sessionId || state.previousDecisionId !== current.state.previousDecisionId) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_REFERENCE_IMMUTABLE", "Supporting decision references are immutable.");
          const timestamp = options.timestamp || utcNow();
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
          const nextProject = clone(before); nextProject.current_stage = `pattern_execution_decision_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
          nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
          const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_DECISION_${state.status.toUpperCase()}`, { calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch, progress_revision: nextProgress.revision, operation_id: options.operationId || null, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
          const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
          const database = await this._database();
          const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
          try {
            const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
            const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id));
            if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_REVISION_CONFLICT", "Decision changed concurrently."); }
            await allocateOperationMetadata(transaction, operation);
            transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject);
            transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
            await transactionComplete(transaction);
          } catch (error) { throw mapStorageError(error); }
          this._notify(projectId, nextProject.revision, operation.kind);
          return clone(nextProgress);
        }
        if (state.revision !== 1 || existing.some((entry) => entry.state?.id === state.id)) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_IDENTITY_CONFLICT", "New decision identity conflicts with an existing snapshot.");
        const timestamp = options.timestamp || utcNow();
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_DECISION", timestamp);
        progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1;
        progress.state = clone(state);
        if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_EPOCH_CONFLICT", "Decision epoch differs from progress epoch.");
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_decision_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_DECISION_CREATED", { calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch, progress_revision: progress.revision, operation_id: options.operationId || null, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
        const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database();
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_REVISION_CONFLICT", "Project changed concurrently."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async updatePatternExecutionDecision(projectId, decisionId, patch, expectedRevision, expectedFingerprint, options = {}) {
      const api = global.YarnAIPatternExecutionDecision;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_API_MISSING", "Execution decision module is not loaded.");
      return api.updateForProject(this, projectId, decisionId, patch, expectedRevision, expectedFingerprint, options);
    }
    async createPatternExecutionDecision(projectId, input = {}) {
      const api = global.YarnAIPatternExecutionDecision;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_API_MISSING", "Execution decision module is not loaded.");
      return api.createForProject(this, projectId, input);
    }
    async readPatternExecutionDecision(projectId, decisionId = null) {
      const api = global.YarnAIPatternExecutionDecision;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_API_MISSING", "Execution decision module is not loaded.");
      return api.readForProject(this, projectId, decisionId);
    }
    async decidePatternExecution(projectId, decisionId, command) {
      const api = global.YarnAIPatternExecutionDecision;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_API_MISSING", "Execution decision module is not loaded.");
      return api.decideForProject(this, projectId, decisionId, command);
    }
    async rebuildPatternExecutionDecision(projectId, decisionId, input = {}) {
      const api = global.YarnAIPatternExecutionDecision;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_DECISION_API_MISSING", "Execution decision module is not loaded.");
      return api.rebuildForProject(this, projectId, decisionId, input);
    }

    async listPatternExecutionFollowUps(projectId, calculationId = null) {
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(
        transaction.objectStore("progress").index("by_calculation_kind").getAll(
          global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_FOLLOW_UP"]),
        ),
      );
      await transactionComplete(transaction);
      return records.filter((entry) => entry.project_id === projectId).sort((left, right) => left.epoch - right.epoch).map((entry) => {
        validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_FOLLOW_UP");
        validateImportedPatternExecutionFollowUp(entry.state, projectId);
        return clone(entry);
      });
    }

    async getPatternExecutionFollowUp(projectId, followUpId = null, calculationId = null) {
      const records = await this.listPatternExecutionFollowUps(projectId, calculationId);
      if (followUpId) return records.find((entry) => entry.progress_id === followUpId || entry.state?.id === followUpId) || null;
      return records.at(-1) || null;
    }

    async _assertPatternExecutionFollowUpReferences(projectId, calculationId, state) {
      const decisionRecord = await this.getPatternExecutionDecision(projectId, state.decisionId, calculationId);
      if (!decisionRecord || decisionRecord.project_id !== projectId || decisionRecord.state?.projectId !== projectId) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_DECISION_REFERENCE_INVALID", "Follow-up references a missing or cross-project decision.");
      if (
        decisionRecord.state.revision !== state.decisionRevision ||
        decisionRecord.state.fingerprint !== state.decisionFingerprint ||
        decisionRecord.state.status !== state.decisionStatus ||
        decisionRecord.state.epoch !== state.decisionEpoch ||
        decisionRecord.state.decision?.outcome !== state.outcome
      ) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_DECISION_REFERENCE_STALE", "Follow-up references another decision identity.");
      if (decisionRecord.state.executionPlanId !== state.planId || decisionRecord.state.sessionId !== state.sessionId) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_SCOPE_REFERENCE_INVALID", "Follow-up plan/session references are inconsistent.");
      const verificationRecords = await this.listPatternExecutionVerification(projectId, calculationId);
      const verification = verificationRecords.find((entry) => entry.state?.id === state.verificationReference?.id);
      if (!verification || verification.state?.projectId !== projectId) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_VERIFICATION_REFERENCE_INVALID", "Follow-up references a missing or cross-project verification.");
      const action = await this.getPatternExecutionAction(projectId, calculationId);
      const actionIds = new Set(action?.state?.id ? [action.state.id] : []);
      if (state.actionReferences.some((entry) => !actionIds.has(entry.id))) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_ACTION_REFERENCE_INVALID", "Follow-up references a missing or cross-project action.");
      const evidence = await this.listPatternExecutionEvidence(projectId, calculationId);
      const evidenceIds = new Set();
      for (const record of evidence) {
        if (record.state?.projectId !== projectId) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_EVIDENCE_REFERENCE_INVALID", "Follow-up evidence crosses the project boundary.");
        if (record.state?.id) evidenceIds.add(record.state.id);
        for (const item of Array.isArray(record.state?.evidenceItems) ? record.state.evidenceItems : []) if (item.id) evidenceIds.add(item.id);
      }
      if (state.evidenceReferences.some((entry) => !evidenceIds.has(entry.id))) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_EVIDENCE_REFERENCE_INVALID", "Follow-up references missing evidence.");
      const targetIds = new Set(state.targetReferences.map((entry) => entry.id));
      if (state.followUpKind === "collect_evidence" && state.selectedEvidenceIds.some((id) => !targetIds.has(id) || !evidenceIds.has(id))) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_TARGET_REFERENCE_INVALID", "Follow-up evidence targets are not provable.");
      if (state.followUpKind === "corrective_action" && state.selectedActionIds.some((id) => !targetIds.has(id) || !actionIds.has(id))) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_TARGET_REFERENCE_INVALID", "Follow-up action targets are not provable.");
    }

    async savePatternExecutionFollowUp(projectId, calculationOrState, stateOrOptions = {}, maybeOptions = {}) {
      const directState = calculationOrState && typeof calculationOrState === "object";
      const state = directState ? calculationOrState : stateOrOptions;
      const calculationId = directState ? state.calculationId : calculationOrState;
      const options = directState ? stateOrOptions : maybeOptions;
      const api = global.YarnAIPatternExecutionFollowUp;
      const report = api?.validatePatternExecutionFollowUp?.(state);
      if (state?.kind !== "PATTERN_EXECUTION_FOLLOW_UP" || state?.type !== "PATTERN_EXECUTION_FOLLOW_UP" || state?.projectId !== projectId || state?.calculationId !== calculationId || report && !report.valid) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_FOLLOW_UP_STATE", "Execution follow-up snapshot is corrupted.");
      validateImportedPatternExecutionFollowUp(state, projectId);
      await this._assertPatternExecutionFollowUpReferences(projectId, calculationId, state);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Follow-up does not belong to the active calculation.");
        const existing = await this.listPatternExecutionFollowUps(projectId, calculationId);
        const current = options.recordId ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId) : existing.find((entry) => entry.state?.id === state.id);
        if (current) {
          if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision || options.expectedFingerprint !== undefined && options.expectedFingerprint !== current.state.fingerprint) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_REVISION_CONFLICT", "Follow-up was changed by another operation.", { details: { expectedRevision: options.expectedRevision, actualRevision: current.state.revision } });
          if (canonicalize(state) === canonicalize(current.state)) return clone(current);
          if (state.id !== current.state.id || state.epoch !== current.state.epoch || state.revision !== current.state.revision + 1) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_REVISION_CONFLICT", "Follow-up revision or identity is invalid.");
          if (["completed", "failed", "cancelled"].includes(current.state.status)) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_TERMINAL", "Terminal follow-up is immutable; use rebuild.");
          const immutableFields = ["followUpKind", "decisionId", "decisionRevision", "decisionFingerprint", "decisionStatus", "decisionEpoch", "outcome", "reasonCode", "selectedCriterionIds", "selectedEvidenceIds", "selectedActionIds", "targetReferences", "evidenceRequirements", "actionTargets", "verificationReference", "evidenceReferences", "actionReferences", "previousFollowUpId"];
          if (immutableFields.some((field) => canonicalize(state[field]) !== canonicalize(current.state[field]))) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_REFERENCE_IMMUTABLE", "Follow-up route identity is immutable.");
          const timestamp = options.timestamp || utcNow();
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
          const nextProject = clone(before); nextProject.current_stage = `pattern_execution_follow_up_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
          nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
          const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_FOLLOW_UP_${state.status.toUpperCase()}`, { calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch, progress_revision: nextProgress.revision, operation_id: options.operationId || null, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
          const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
          const database = await this._database();
          const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
          try {
            const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
            const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id));
            if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_REVISION_CONFLICT", "Follow-up changed concurrently."); }
            await allocateOperationMetadata(transaction, operation);
            transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject);
            transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
            await transactionComplete(transaction);
          } catch (error) { throw mapStorageError(error); }
          this._notify(projectId, nextProject.revision, operation.kind);
          return clone(nextProgress);
        }
        if (state.revision !== 1 || existing.some((entry) => entry.state?.id === state.id)) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_IDENTITY_CONFLICT", "New follow-up identity conflicts with an existing snapshot.");
        const timestamp = options.timestamp || utcNow();
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_FOLLOW_UP", timestamp);
        progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1;
        progress.state = clone(state);
        if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_EPOCH_CONFLICT", "Follow-up epoch differs from progress epoch.");
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_follow_up_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_FOLLOW_UP_CREATED", { calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch, progress_revision: progress.revision, operation_id: options.operationId || null, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
        const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database();
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_REVISION_CONFLICT", "Project changed concurrently."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async updatePatternExecutionFollowUp(projectId, followUpId, patch, expectedRevision, expectedFingerprint, options = {}) {
      const api = global.YarnAIPatternExecutionFollowUp;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_API_MISSING", "Execution follow-up module is not loaded.");
      return api.updateForProject(this, projectId, followUpId, patch, expectedRevision, expectedFingerprint, options);
    }
    async createPatternExecutionFollowUp(projectId, input = {}) {
      const api = global.YarnAIPatternExecutionFollowUp;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_API_MISSING", "Execution follow-up module is not loaded.");
      return api.createForProject(this, projectId, input);
    }
    async readPatternExecutionFollowUp(projectId, followUpId = null) {
      const api = global.YarnAIPatternExecutionFollowUp;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_API_MISSING", "Execution follow-up module is not loaded.");
      return api.readForProject(this, projectId, followUpId);
    }
    async executePatternExecutionFollowUpCommand(projectId, followUpId, commandName, input = {}) {
      const api = global.YarnAIPatternExecutionFollowUp;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_API_MISSING", "Execution follow-up module is not loaded.");
      return api.executeForProject(this, projectId, followUpId, commandName, input);
    }
    async schedulePatternExecutionFollowUp(projectId, followUpId, input = {}) { return this.executePatternExecutionFollowUpCommand(projectId, followUpId, "schedule", input); }
    async activatePatternExecutionFollowUp(projectId, followUpId, input = {}) { return this.executePatternExecutionFollowUpCommand(projectId, followUpId, "activate", input); }
    async completePatternExecutionFollowUp(projectId, followUpId, input = {}) { return this.executePatternExecutionFollowUpCommand(projectId, followUpId, "complete", input); }
    async failPatternExecutionFollowUp(projectId, followUpId, input = {}) { return this.executePatternExecutionFollowUpCommand(projectId, followUpId, "fail", input); }
    async cancelPatternExecutionFollowUp(projectId, followUpId, input = {}) { return this.executePatternExecutionFollowUpCommand(projectId, followUpId, "cancel", input); }
    async rebuildPatternExecutionFollowUp(projectId, followUpId, input = {}) {
      const api = global.YarnAIPatternExecutionFollowUp;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_API_MISSING", "Execution follow-up module is not loaded.");
      return api.rebuildForProject(this, projectId, followUpId, input);
    }

    async _quarantinePatternExecutionRetrospective(record, reasonCode) {
      const api = global.YarnAIPatternExecutionRetrospective;
      const identity = api?.fingerprint ? api.fingerprint({ progressId: record?.progress_id || null, state: record?.state || null, reasonCode }) : canonicalize({ progressId: record?.progress_id || null, reasonCode });
      const timestamp = record?.state?.updatedAt || record?.updated_at || "1970-01-01T00:00:00.000Z";
      const quarantine = {
        quarantine_id: `retrospective-quarantine:${identity}`, source_store: "progress",
        source_key: record?.progress_id || null, reason_code: reasonCode, record: clone(record),
        created_at: timestamp, expires_at: timestamp,
      };
      const database = await this._database();
      const transaction = database.transaction("quarantine", "readwrite");
      transaction.objectStore("quarantine").put(quarantine);
      await transactionComplete(transaction);
      return clone(quarantine);
    }

    async listPatternExecutionRetrospectives(projectId, calculationId = null) {
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(
        transaction.objectStore("progress").index("by_calculation_kind").getAll(
          global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_RETROSPECTIVE"]),
        ),
      );
      await transactionComplete(transaction);
      const valid = [];
      for (const entry of records.filter((item) => item.project_id === projectId).sort((left, right) => left.epoch - right.epoch)) {
        try {
          validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_RETROSPECTIVE");
          validateImportedPatternExecutionRetrospective(entry.state, projectId);
          valid.push(clone(entry));
        } catch (error) {
          await this._quarantinePatternExecutionRetrospective(entry, error?.code || "INVALID_PATTERN_EXECUTION_RETROSPECTIVE");
        }
      }
      return valid;
    }

    async getPatternExecutionRetrospective(projectId, retrospectiveId = null, calculationId = null) {
      const records = await this.listPatternExecutionRetrospectives(projectId, calculationId);
      if (retrospectiveId) return records.find((entry) => entry.progress_id === retrospectiveId || entry.state?.id === retrospectiveId) || null;
      return records.at(-1) || null;
    }

    async _assertPatternExecutionRetrospectiveReferences(projectId, calculationId, state) {
      const api = global.YarnAIPatternExecutionRetrospective;
      if (!api?.loadSource || !api?.calculateIntegrity) throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_API_MISSING", "Execution retrospective module is not loaded.");
      const source = await api.loadSource(this, projectId);
      if (source.calculationId !== calculationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_SCOPE_INVALID", "Retrospective does not belong to the active calculation.");
      const integrity = api.calculateIntegrity(source, state);
      if (!integrity.valid) throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_INTEGRITY_INVALID", "Critical retrospective source references are missing, stale, or inconsistent.", { details: { issues: integrity.criticalIssues } });
    }

    async savePatternExecutionRetrospective(projectId, calculationOrState, stateOrOptions = {}, maybeOptions = {}) {
      const directState = calculationOrState && typeof calculationOrState === "object";
      const state = directState ? calculationOrState : stateOrOptions;
      const calculationId = directState ? state.calculationId : calculationOrState;
      const options = directState ? stateOrOptions : maybeOptions;
      const api = global.YarnAIPatternExecutionRetrospective;
      const report = api?.validatePatternExecutionRetrospective?.(state);
      if (!api || state?.kind !== "PATTERN_EXECUTION_RETROSPECTIVE" || state?.type !== "PATTERN_EXECUTION_RETROSPECTIVE" || state?.projectId !== projectId || state?.calculationId !== calculationId || !report?.valid) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_RETROSPECTIVE_STATE", "Execution retrospective snapshot is corrupted.");
      validateImportedPatternExecutionRetrospective(state, projectId);
      await this._assertPatternExecutionRetrospectiveReferences(projectId, calculationId, state);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Retrospective does not belong to the active calculation.");
        const existing = await this.listPatternExecutionRetrospectives(projectId, calculationId);
        const duplicate = existing.find((entry) => entry.state?.identity === state.identity && entry.state?.id !== state.id);
        if (duplicate) return clone(duplicate);
        const current = options.recordId ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId) : existing.find((entry) => entry.state?.id === state.id);
        const timestamp = options.timestamp || state.updatedAt;
        if (current) {
          if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision || options.expectedIdentity !== undefined && options.expectedIdentity !== current.state.identity) throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_REVISION_CONFLICT", "Retrospective was changed by another operation.");
          if (canonicalize(state) === canonicalize(current.state)) return clone(current);
          if (current.state.status === "completed") throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_TERMINAL", "Completed retrospective is immutable; create a new retrospective.");
          if (state.id !== current.state.id || state.epoch !== current.state.epoch || state.revision <= current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_REVISION_CONFLICT", "Retrospective revision or identity is invalid.");
          const immutableFields = ["projectId", "calculationId", "sourceResultId", "sourceRuntimeId", "sourceMonitoringId", "sourceFollowUpId", "sourceIdentity", "sourceFollowUpIdentity", "sourceSnapshot", "sourceSnapshotFingerprint", "epoch", "createdAt"];
          if (immutableFields.some((field) => canonicalize(state[field]) !== canonicalize(current.state[field]))) throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_SOURCE_IMMUTABLE", "Retrospective source snapshot is immutable.");
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
          const nextProject = clone(before); nextProject.current_stage = `pattern_execution_retrospective_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
          nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
          const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_RETROSPECTIVE_${state.status.toUpperCase()}`, { calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch, progress_revision: nextProgress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
          const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
          const database = await this._database();
          const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
          try {
            const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
            const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id));
            if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_REVISION_CONFLICT", "Retrospective changed concurrently."); }
            await allocateOperationMetadata(transaction, operation);
            transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject);
            transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
            await transactionComplete(transaction);
          } catch (error) { throw mapStorageError(error); }
          this._notify(projectId, nextProject.revision, operation.kind);
          return clone(nextProgress);
        }
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_RETROSPECTIVE", timestamp);
        progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1;
        progress.state = clone(state);
        if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_EPOCH_CONFLICT", "Retrospective epoch differs from progress epoch.");
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_retrospective_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_RETROSPECTIVE_CREATED", { calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch, progress_revision: progress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
        const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database();
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_REVISION_CONFLICT", "Project changed concurrently."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject);
          transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async createPatternExecutionRetrospective(projectId, input = {}) {
      const api = global.YarnAIPatternExecutionRetrospective;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_API_MISSING", "Execution retrospective module is not loaded.");
      return api.createForProject(this, projectId, input);
    }
    async readPatternExecutionRetrospective(projectId, retrospectiveId = null) {
      const api = global.YarnAIPatternExecutionRetrospective;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_API_MISSING", "Execution retrospective module is not loaded.");
      return api.readForProject(this, projectId, retrospectiveId);
    }

    async _quarantinePatternExecutionLearning(record, reasonCode) {
      const api = global.YarnAIPatternExecutionLearning;
      const identity = api?.fingerprint ? api.fingerprint({ progressId: record?.progress_id || null, state: record?.state || null, reasonCode }) : canonicalize({ progressId: record?.progress_id || null, reasonCode });
      const timestamp = record?.state?.updatedAt || record?.updated_at || "1970-01-01T00:00:00.000Z";
      const quarantine = {
        quarantine_id: `learning-quarantine:${identity}`, source_store: "progress", source_key: record?.progress_id || null,
        reason_code: reasonCode, record: clone(record), created_at: timestamp, expires_at: timestamp,
      };
      const database = await this._database();
      const transaction = database.transaction("quarantine", "readwrite");
      transaction.objectStore("quarantine").put(quarantine);
      await transactionComplete(transaction);
      return clone(quarantine);
    }

    async listPatternExecutionLearnings(projectId, calculationId = null) {
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(transaction.objectStore("progress").index("by_calculation_kind").getAll(global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_LEARNING"])));
      await transactionComplete(transaction);
      const valid = [];
      for (const entry of records.filter((item) => item.project_id === projectId).sort((left, right) => left.epoch - right.epoch)) {
        try {
          validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_LEARNING");
          validateImportedPatternExecutionLearning(entry.state, projectId);
          valid.push(clone(entry));
        } catch (error) {
          await this._quarantinePatternExecutionLearning(entry, error?.code || "INVALID_PATTERN_EXECUTION_LEARNING");
        }
      }
      return valid;
    }

    async getPatternExecutionLearning(projectId, learningId = null, calculationId = null) {
      const records = await this.listPatternExecutionLearnings(projectId, calculationId);
      if (learningId) return records.find((entry) => entry.progress_id === learningId || entry.state?.id === learningId) || null;
      return records.at(-1) || null;
    }

    async _assertPatternExecutionLearningReferences(projectId, calculationId, state) {
      const api = global.YarnAIPatternExecutionLearning;
      if (!api?.loadSource || !api?.calculateIntegrity) throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_API_MISSING", "Execution learning module is not loaded.");
      const source = await api.loadSource(this, projectId);
      if (source.calculationId !== calculationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_SCOPE_INVALID", "Learning does not belong to the active calculation.");
      const integrity = api.calculateIntegrity(source, state);
      if (!integrity.valid) throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_INTEGRITY_INVALID", "Critical learning source references are missing, stale, or inconsistent.", { details: { issues: integrity.criticalIssues } });
    }

    async savePatternExecutionLearning(projectId, calculationOrState, stateOrOptions = {}, maybeOptions = {}) {
      const directState = calculationOrState && typeof calculationOrState === "object";
      const state = directState ? calculationOrState : stateOrOptions;
      const calculationId = directState ? state.calculationId : calculationOrState;
      const options = directState ? stateOrOptions : maybeOptions;
      const api = global.YarnAIPatternExecutionLearning;
      const report = api?.validatePatternExecutionLearning?.(state);
      if (!api || state?.kind !== "PATTERN_EXECUTION_LEARNING" || state?.type !== "PATTERN_EXECUTION_LEARNING" || state?.projectId !== projectId || state?.calculationId !== calculationId || !report?.valid) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_LEARNING_STATE", "Execution learning snapshot is corrupted.");
      validateImportedPatternExecutionLearning(state, projectId);
      await this._assertPatternExecutionLearningReferences(projectId, calculationId, state);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Learning does not belong to the active calculation.");
        const existing = await this.listPatternExecutionLearnings(projectId, calculationId);
        const duplicate = existing.find((entry) => entry.state?.identity === state.identity && entry.state?.id !== state.id);
        if (duplicate) return clone(duplicate);
        const current = options.recordId ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId) : existing.find((entry) => entry.state?.id === state.id);
        const timestamp = options.timestamp || state.updatedAt;
        if (current) {
          if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision || options.expectedIdentity !== undefined && options.expectedIdentity !== current.state.identity) throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_REVISION_CONFLICT", "Learning was changed by another operation.");
          if (canonicalize(state) === canonicalize(current.state)) return clone(current);
          if (current.state.status === "completed") throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_TERMINAL", "Completed learning is immutable; create a new learning record.");
          if (state.id !== current.state.id || state.epoch !== current.state.epoch || state.revision <= current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_REVISION_CONFLICT", "Learning revision or identity is invalid.");
          const immutableFields = ["projectId", "calculationId", "sourceResultId", "sourceRuntimeId", "sourceFollowUpId", "sourceRetrospectiveId", "sourceRetrospectiveIdentity", "sourceSnapshot", "sourceSnapshotFingerprint", "epoch", "createdAt"];
          if (immutableFields.some((field) => canonicalize(state[field]) !== canonicalize(current.state[field]))) throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_SOURCE_IMMUTABLE", "Learning source snapshot is immutable.");
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
          const nextProject = clone(before); nextProject.current_stage = `pattern_execution_learning_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
          nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
          const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_LEARNING_${state.status.toUpperCase()}`, { calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch, progress_revision: nextProgress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
          const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
          const database = await this._database();
          const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
          try {
            const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
            const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id));
            if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_REVISION_CONFLICT", "Learning changed concurrently."); }
            await allocateOperationMetadata(transaction, operation);
            transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
            await transactionComplete(transaction);
          } catch (error) { throw mapStorageError(error); }
          this._notify(projectId, nextProject.revision, operation.kind);
          return clone(nextProgress);
        }
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_LEARNING", timestamp);
        progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1;
        progress.state = clone(state);
        if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_EPOCH_CONFLICT", "Learning epoch differs from progress epoch.");
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_learning_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_LEARNING_CREATED", { calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch, progress_revision: progress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
        const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database();
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_REVISION_CONFLICT", "Project changed concurrently."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async createPatternExecutionLearning(projectId, input = {}) {
      const api = global.YarnAIPatternExecutionLearning;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_API_MISSING", "Execution learning module is not loaded.");
      return api.createForProject(this, projectId, input);
    }
    async readPatternExecutionLearning(projectId, learningId = null) {
      const api = global.YarnAIPatternExecutionLearning;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_API_MISSING", "Execution learning module is not loaded.");
      return api.readForProject(this, projectId, learningId);
    }

    async _quarantinePatternExecutionAdaptation(record, reasonCode) {
      const api = global.YarnAIPatternExecutionAdaptation;
      const identity = api?.fingerprint ? api.fingerprint({ progressId: record?.progress_id || null, state: record?.state || null, reasonCode }) : canonicalize({ progressId: record?.progress_id || null, reasonCode });
      const timestamp = record?.state?.updatedAt || record?.updated_at || "1970-01-01T00:00:00.000Z";
      const quarantine = {
        quarantine_id: `adaptation-quarantine:${identity}`, source_store: "progress", source_key: record?.progress_id || null,
        reason_code: reasonCode, record: clone(record), created_at: timestamp, expires_at: timestamp,
      };
      const database = await this._database();
      const transaction = database.transaction("quarantine", "readwrite");
      transaction.objectStore("quarantine").put(quarantine);
      await transactionComplete(transaction);
      return clone(quarantine);
    }

    async listPatternExecutionAdaptations(projectId, calculationId = null) {
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(transaction.objectStore("progress").index("by_calculation_kind").getAll(global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION"])));
      await transactionComplete(transaction);
      const valid = [];
      for (const entry of records.filter((item) => item.project_id === projectId).sort((left, right) => left.epoch - right.epoch || left.state.revision - right.state.revision || (String(left.state.id) < String(right.state.id) ? -1 : String(left.state.id) > String(right.state.id) ? 1 : 0))) {
        try {
          validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION");
          validateImportedPatternExecutionAdaptation(entry.state, projectId);
          valid.push(clone(entry));
        } catch (error) {
          await this._quarantinePatternExecutionAdaptation(entry, error?.code || "INVALID_PATTERN_EXECUTION_ADAPTATION");
        }
      }
      return valid;
    }

    async getPatternExecutionAdaptation(projectId, adaptationId = null, calculationId = null) {
      const records = await this.listPatternExecutionAdaptations(projectId, calculationId);
      if (adaptationId) return records.find((entry) => entry.progress_id === adaptationId || entry.state?.id === adaptationId) || null;
      return records.at(-1) || null;
    }

    async _assertPatternExecutionAdaptationReferences(projectId, calculationId, state) {
      const api = global.YarnAIPatternExecutionAdaptation;
      if (!api?.loadSource || !api?.calculateIntegrity) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_API_MISSING", "Execution adaptation module is not loaded.");
      const source = await api.loadSource(this, projectId);
      if (source.calculationId !== calculationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_SCOPE_INVALID", "Adaptation does not belong to the active calculation.");
      const integrity = api.calculateIntegrity(source, state, { includeContent: false });
      if (!integrity.valid) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_INTEGRITY_INVALID", "Critical adaptation source references are missing, stale, or inconsistent.", { details: { issues: integrity.criticalIssues } });
    }

    async savePatternExecutionAdaptation(projectId, calculationOrState, stateOrOptions = {}, maybeOptions = {}) {
      const directState = calculationOrState && typeof calculationOrState === "object";
      const state = directState ? calculationOrState : stateOrOptions;
      const calculationId = directState ? state.calculationId : calculationOrState;
      const options = directState ? stateOrOptions : maybeOptions;
      const api = global.YarnAIPatternExecutionAdaptation;
      const report = api?.validatePatternExecutionAdaptation?.(state);
      if (!api || state?.kind !== "PATTERN_EXECUTION_ADAPTATION" || state?.type !== "PATTERN_EXECUTION_ADAPTATION" || state?.projectId !== projectId || state?.calculationId !== calculationId || !report?.valid) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_ADAPTATION_STATE", "Execution adaptation snapshot is corrupted.");
      validateImportedPatternExecutionAdaptation(state, projectId);
      await this._assertPatternExecutionAdaptationReferences(projectId, calculationId, state);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Adaptation does not belong to the active calculation.");
        const existing = await this.listPatternExecutionAdaptations(projectId, calculationId);
        const sameIdentity = existing.find((entry) => entry.state?.identity === state.identity && entry.state?.id !== state.id);
        if (sameIdentity) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_IDENTITY_COLLISION", "Adaptation identity collides with another record; no record was overwritten.");
        const current = options.recordId ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId) : existing.find((entry) => entry.state?.id === state.id);
        const timestamp = options.timestamp || state.updatedAt;
        if (current) {
          if (options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision || options.expectedIdentity !== undefined && options.expectedIdentity !== current.state.identity) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_REVISION_CONFLICT", "Adaptation was changed by another operation.");
          if (canonicalize(state) === canonicalize(current.state)) return clone(current);
          if (current.state.status === "completed") throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_TERMINAL", "Completed adaptation is immutable.");
          if (state.id !== current.state.id || state.epoch !== current.state.epoch || state.revision <= current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_REVISION_CONFLICT", "Adaptation revision or identity is invalid.");
          const immutableFields = ["projectId", "calculationId", "resultId", "runtimeId", "followUpId", "retrospectiveId", "learningId", "sourceIdentities", "learningSnapshot", "criticalReferences", "epoch", "createdAt"];
          if (immutableFields.some((field) => canonicalize(state[field]) !== canonicalize(current.state[field]))) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_SOURCE_IMMUTABLE", "Adaptation source proof is immutable.");
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
          const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
          nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
          const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_ADAPTATION_${state.status.toUpperCase()}`, { calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch, progress_revision: nextProgress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
          const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
          const database = await this._database();
          const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
          try {
            const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
            const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id));
            if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_REVISION_CONFLICT", "Adaptation changed concurrently."); }
            await allocateOperationMetadata(transaction, operation);
            transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
            await transactionComplete(transaction);
          } catch (error) { throw mapStorageError(error); }
          this._notify(projectId, nextProject.revision, operation.kind);
          return clone(nextProgress);
        }
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_ADAPTATION", timestamp);
        progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1;
        progress.state = clone(state);
        if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_EPOCH_CONFLICT", "Adaptation epoch differs from progress epoch.");
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_ADAPTATION_CREATED", { calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch, progress_revision: progress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
        const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database();
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_REVISION_CONFLICT", "Project changed concurrently."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async createPatternExecutionAdaptation(projectId, input = {}) {
      const api = global.YarnAIPatternExecutionAdaptation;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_API_MISSING", "Execution adaptation module is not loaded.");
      return api.createForProject(this, projectId, input);
    }

    async readPatternExecutionAdaptation(projectId, adaptationId = null) {
      const api = global.YarnAIPatternExecutionAdaptation;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_API_MISSING", "Execution adaptation module is not loaded.");
      return api.readForProject(this, projectId, adaptationId);
    }

    async _quarantinePatternExecutionAdaptationValidation(record, reasonCode) {
      const api = global.YarnAIPatternExecutionAdaptationValidation;
      const identity = api?.fingerprint ? api.fingerprint({ progressId: record?.progress_id || null, state: record?.state || null, reasonCode }) : canonicalize({ progressId: record?.progress_id || null, reasonCode });
      const timestamp = record?.state?.updatedAt || record?.updated_at || "1970-01-01T00:00:00.000Z";
      const quarantine = {
        quarantine_id: `adaptation-validation-quarantine:${identity}`, source_store: "progress", source_key: record?.progress_id || null,
        reason_code: reasonCode, record: clone(record), created_at: timestamp, expires_at: timestamp,
      };
      const database = await this._database();
      const transaction = database.transaction("quarantine", "readwrite");
      transaction.objectStore("quarantine").put(quarantine);
      await transactionComplete(transaction);
      return clone(quarantine);
    }

    async listPatternExecutionAdaptationValidations(projectId, calculationId = null, adaptationId = null) {
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(transaction.objectStore("progress").index("by_calculation_kind").getAll(global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION_VALIDATION"])));
      await transactionComplete(transaction);
      const valid = [];
      for (const entry of records.filter((item) => item.project_id === projectId && (!adaptationId || item.state?.adaptationId === adaptationId)).sort((left, right) => left.epoch - right.epoch || left.state.revision - right.state.revision || (String(left.state.id) < String(right.state.id) ? -1 : String(left.state.id) > String(right.state.id) ? 1 : 0))) {
        try {
          validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION_VALIDATION");
          validateImportedPatternExecutionAdaptationValidation(entry.state, projectId);
          valid.push(clone(entry));
        } catch (error) {
          await this._quarantinePatternExecutionAdaptationValidation(entry, error?.code || "INVALID_PATTERN_EXECUTION_ADAPTATION_VALIDATION");
        }
      }
      return valid;
    }

    async getPatternExecutionAdaptationValidation(projectId, adaptationValidationId = null, calculationId = null, adaptationId = null) {
      const records = await this.listPatternExecutionAdaptationValidations(projectId, calculationId, adaptationId);
      if (adaptationValidationId) return records.find((entry) => entry.progress_id === adaptationValidationId || entry.state?.id === adaptationValidationId || entry.state?.adaptationValidationId === adaptationValidationId) || null;
      return records.at(-1) || null;
    }

    async _assertPatternExecutionAdaptationValidationReferences(projectId, calculationId, state) {
      const api = global.YarnAIPatternExecutionAdaptationValidation;
      if (!api?.loadSource || !api?.calculateIntegrity) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_API_MISSING", "Execution adaptation validation module is not loaded.");
      const source = await api.loadSource(this, projectId, state.adaptationId);
      if (source.calculationId !== calculationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_SCOPE_INVALID", "Adaptation validation does not belong to the active calculation.");
      const integrity = api.calculateIntegrity(source, state);
      if (!integrity.valid) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_INTEGRITY_INVALID", "Critical validation source references are missing, stale, or inconsistent.", { details: { issues: integrity.criticalIssues } });
    }

    async savePatternExecutionAdaptationValidation(projectId, calculationOrState, stateOrOptions = {}, maybeOptions = {}) {
      const directState = calculationOrState && typeof calculationOrState === "object";
      const state = directState ? calculationOrState : stateOrOptions;
      const calculationId = directState ? state.calculationId : calculationOrState;
      const options = directState ? stateOrOptions : maybeOptions;
      const api = global.YarnAIPatternExecutionAdaptationValidation;
      const report = api?.validatePatternExecutionAdaptationValidation?.(state);
      if (!api || state?.kind !== "PATTERN_EXECUTION_ADAPTATION_VALIDATION" || state?.type !== "PATTERN_EXECUTION_ADAPTATION_VALIDATION" || state?.projectId !== projectId || state?.calculationId !== calculationId || !report?.valid) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_ADAPTATION_VALIDATION_STATE", "Execution adaptation validation snapshot is corrupted.");
      validateImportedPatternExecutionAdaptationValidation(state, projectId);
      await this._assertPatternExecutionAdaptationValidationReferences(projectId, calculationId, state);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Adaptation validation does not belong to the active calculation.");
        const existing = await this.listPatternExecutionAdaptationValidations(projectId, calculationId);
        const sameIdentity = existing.find((entry) => entry.state?.identity === state.identity && entry.state?.id !== state.id);
        if (sameIdentity) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_IDENTITY_COLLISION", "Validation identity collides with another record; no record was overwritten.");
        const current = options.recordId ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId) : existing.find((entry) => entry.state?.id === state.id);
        const timestamp = options.timestamp || state.updatedAt;
        if (current) {
          if ((options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) || (options.expectedIdentity !== undefined && options.expectedIdentity !== current.state.identity)) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_REVISION_CONFLICT", "Validation was changed by another operation.");
          if (canonicalize(state) === canonicalize(current.state)) return clone(current);
          if (current.state.status === "completed") throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_TERMINAL", "Completed validation is immutable.");
          if (state.id !== current.state.id || state.adaptationValidationId !== current.state.adaptationValidationId || state.epoch !== current.state.epoch || state.revision <= current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_REVISION_CONFLICT", "Validation revision or identity is invalid.");
          const immutableFields = ["projectId", "calculationId", "resultId", "runtimeId", "followUpId", "retrospectiveId", "learningId", "adaptationId", "adaptationValidationId", "scope", "sourceIdentities", "adaptationIdentity", "adaptationSnapshot", "declaredValidationPlan", "criticalReferences", "epoch", "createdAt"];
          if (immutableFields.some((field) => canonicalize(state[field]) !== canonicalize(current.state[field]))) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_SOURCE_IMMUTABLE", "Validation source proof is immutable.");
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
          const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_validation_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
          nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
          const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_ADAPTATION_VALIDATION_${state.status.toUpperCase()}`, { calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch, progress_revision: nextProgress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
          const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
          const database = await this._database();
          const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
          try {
            const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
            const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id));
            if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_REVISION_CONFLICT", "Validation changed concurrently."); }
            await allocateOperationMetadata(transaction, operation);
            transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
            await transactionComplete(transaction);
          } catch (error) { throw mapStorageError(error); }
          this._notify(projectId, nextProject.revision, operation.kind);
          return clone(nextProgress);
        }
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_ADAPTATION_VALIDATION", timestamp);
        progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1;
        progress.state = clone(state);
        if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_EPOCH_CONFLICT", "Validation epoch differs from progress epoch.");
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_validation_${state.status}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_ADAPTATION_VALIDATION_CREATED", { calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch, progress_revision: progress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
        const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database();
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_REVISION_CONFLICT", "Project changed concurrently."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async createPatternExecutionAdaptationValidation(projectId, input = {}) {
      const api = global.YarnAIPatternExecutionAdaptationValidation;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_API_MISSING", "Execution adaptation validation module is not loaded.");
      return api.createForProject(this, projectId, input);
    }

    async readPatternExecutionAdaptationValidation(projectId, adaptationValidationId = null, adaptationId = null) {
      const api = global.YarnAIPatternExecutionAdaptationValidation;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_API_MISSING", "Execution adaptation validation module is not loaded.");
      return api.readForProject(this, projectId, adaptationValidationId, adaptationId);
    }

    async _quarantinePatternExecutionAdaptationPromotion(record, reasonCode) {
      const api = global.YarnAIPatternExecutionAdaptationPromotion;
      const identity = api?.fingerprint ? api.fingerprint({ progressId: record?.progress_id || null, state: record?.state || null, reasonCode }) : canonicalize({ progressId: record?.progress_id || null, reasonCode });
      const timestamp = record?.state?.updatedAt || record?.updated_at || "1970-01-01T00:00:00.000Z";
      const quarantine = {
        quarantine_id: `adaptation-promotion-quarantine:${identity}`, source_store: "progress", source_key: record?.progress_id || null,
        reason_code: reasonCode, record: clone(record), created_at: timestamp, expires_at: timestamp,
      };
      const database = await this._database();
      const transaction = database.transaction("quarantine", "readwrite");
      transaction.objectStore("quarantine").put(quarantine);
      await transactionComplete(transaction);
      return clone(quarantine);
    }

    async listPatternExecutionAdaptationPromotions(projectId, calculationId = null, adaptationId = null, adaptationValidationId = null, patternExecutionId = null) {
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(transaction.objectStore("progress").index("by_calculation_kind").getAll(global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION_PROMOTION"])));
      await transactionComplete(transaction);
      const valid = [];
      const filtered = records.filter((entry) => entry.project_id === projectId && (!adaptationId || entry.state?.adaptationId === adaptationId) && (!adaptationValidationId || entry.state?.adaptationValidationId === adaptationValidationId) && (!patternExecutionId || entry.state?.patternExecutionId === patternExecutionId));
      filtered.sort((left, right) => left.epoch - right.epoch || left.state.revision - right.state.revision || (String(left.state.id) < String(right.state.id) ? -1 : String(left.state.id) > String(right.state.id) ? 1 : 0));
      for (const entry of filtered) {
        try {
          validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION_PROMOTION");
          validateImportedPatternExecutionAdaptationPromotion(entry.state, projectId);
          valid.push(clone(entry));
        } catch (error) {
          await this._quarantinePatternExecutionAdaptationPromotion(entry, error?.code || "INVALID_PATTERN_EXECUTION_ADAPTATION_PROMOTION");
        }
      }
      return valid;
    }

    async getPatternExecutionAdaptationPromotion(projectId, adaptationPromotionId = null, calculationId = null, adaptationId = null, adaptationValidationId = null) {
      const records = await this.listPatternExecutionAdaptationPromotions(projectId, calculationId, adaptationId, adaptationValidationId);
      if (adaptationPromotionId) return records.find((entry) => entry.progress_id === adaptationPromotionId || entry.state?.id === adaptationPromotionId || entry.state?.adaptationPromotionId === adaptationPromotionId) || null;
      return records.at(-1) || null;
    }

    async getLatestPatternExecutionAdaptationPromotion(projectId, calculationId = null, adaptationId = null, adaptationValidationId = null, patternExecutionId = null) {
      const records = await this.listPatternExecutionAdaptationPromotions(projectId, calculationId, adaptationId, adaptationValidationId, patternExecutionId);
      return records.at(-1) || null;
    }

    async _assertPatternExecutionAdaptationPromotionReferences(projectId, calculationId, state) {
      const api = global.YarnAIPatternExecutionAdaptationPromotion;
      if (!api?.loadSource || !api?.calculateSourceProof) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_API_MISSING", "Execution adaptation promotion module is not loaded.");
      const source = await api.loadSource(this, projectId, state.adaptationId, state.adaptationValidationId);
      if (source.calculationId !== calculationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_SCOPE_INVALID", "Adaptation promotion does not belong to the active calculation.");
      const proof = api.calculateSourceProof(source, state);
      if (["promote", "promote_with_constraints"].includes(state.promotionVerdict) && !proof.fullChainProven) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_PROOF_INVALID", "A positive promotion verdict requires the current full source chain.", { details: { issues: proof.issues } });
      if (!proof.adaptationResolved || !proof.validationResolved || !proof.sameProject || !proof.samePatternExecution || !proof.validationTargetsAdaptation) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_REFERENCE_INVALID", "Promotion references do not resolve to one adaptation and its validation.", { details: { issues: proof.issues } });
    }

    async savePatternExecutionAdaptationPromotion(projectId, calculationOrState, stateOrOptions = {}, maybeOptions = {}) {
      const directState = calculationOrState && typeof calculationOrState === "object";
      const state = directState ? calculationOrState : stateOrOptions;
      const calculationId = directState ? state.calculationId : calculationOrState;
      const options = directState ? stateOrOptions : maybeOptions;
      const api = global.YarnAIPatternExecutionAdaptationPromotion;
      const report = api?.validatePatternExecutionAdaptationPromotion?.(state);
      if (!api || state?.kind !== "PATTERN_EXECUTION_ADAPTATION_PROMOTION" || state?.type !== "PATTERN_EXECUTION_ADAPTATION_PROMOTION" || state?.projectId !== projectId || state?.calculationId !== calculationId || !report?.valid) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_ADAPTATION_PROMOTION_STATE", "Execution adaptation promotion snapshot is corrupted.");
      validateImportedPatternExecutionAdaptationPromotion(state, projectId);
      await this._assertPatternExecutionAdaptationPromotionReferences(projectId, calculationId, state);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Adaptation promotion does not belong to the active calculation.");
        const existing = await this.listPatternExecutionAdaptationPromotions(projectId, calculationId);
        const sameIdentity = existing.find((entry) => entry.state?.identity === state.identity && entry.state?.id !== state.id);
        if (sameIdentity) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_IDENTITY_COLLISION", "Promotion identity collides with another record; no record was overwritten.");
        const current = options.recordId ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId) : existing.find((entry) => entry.state?.id === state.id);
        const timestamp = options.timestamp || state.updatedAt;
        if (current) {
          if ((options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) || (options.expectedIdentity !== undefined && options.expectedIdentity !== current.state.identity)) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_REVISION_CONFLICT", "Promotion was changed by another operation.");
          if (canonicalize(state) === canonicalize(current.state)) return clone(current);
          if (current.state.lifecycle === "completed") throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_TERMINAL", "Completed promotion is immutable.");
          if (state.id !== current.state.id || state.adaptationPromotionId !== current.state.adaptationPromotionId || state.epoch !== current.state.epoch || state.revision <= current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_REVISION_CONFLICT", "Promotion revision or identity is invalid.");
          const immutableFields = ["projectId", "calculationId", "patternExecutionId", "adaptationId", "adaptationValidationId", "adaptationPromotionId", "sourceIdentities", "adaptationSnapshot", "validationSnapshot", "epoch", "createdAt"];
          if (immutableFields.some((field) => canonicalize(state[field]) !== canonicalize(current.state[field]))) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_SOURCE_IMMUTABLE", "Promotion source proof is immutable.");
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
          const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_promotion_${state.lifecycle}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
          nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
          const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_ADAPTATION_PROMOTION_${state.lifecycle.toUpperCase()}`, { calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch, progress_revision: nextProgress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
          const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
          const database = await this._database();
          const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
          try {
            const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
            const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id));
            if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_REVISION_CONFLICT", "Promotion changed concurrently."); }
            await allocateOperationMetadata(transaction, operation);
            transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
            await transactionComplete(transaction);
          } catch (error) { throw mapStorageError(error); }
          this._notify(projectId, nextProject.revision, operation.kind);
          return clone(nextProgress);
        }
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_ADAPTATION_PROMOTION", timestamp);
        progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1;
        progress.state = clone(state);
        if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_EPOCH_CONFLICT", "Promotion epoch differs from progress epoch.");
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_promotion_${state.lifecycle}`; nextProject.updated_at = timestamp; nextProject.revision += 1;
        nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_ADAPTATION_PROMOTION_CREATED", { calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch, progress_revision: progress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
        const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database();
        const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try {
          const storedProject = await requestResult(transaction.objectStore("projects").get(projectId));
          if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_REVISION_CONFLICT", "Project changed concurrently."); }
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint);
          await transactionComplete(transaction);
        } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind);
        return clone(progress);
      });
    }

    async createPatternExecutionAdaptationPromotion(projectId, input = {}) {
      const api = global.YarnAIPatternExecutionAdaptationPromotion;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_API_MISSING", "Execution adaptation promotion module is not loaded.");
      return api.createForProject(this, projectId, input);
    }

    async readPatternExecutionAdaptationPromotion(projectId, adaptationPromotionId = null, adaptationId = null, adaptationValidationId = null) {
      const api = global.YarnAIPatternExecutionAdaptationPromotion;
      if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_API_MISSING", "Execution adaptation promotion module is not loaded.");
      return api.readForProject(this, projectId, adaptationPromotionId, adaptationId, adaptationValidationId);
    }

    async _quarantinePatternExecutionAdaptationRollout(record, reasonCode) {
      const api = global.YarnAIPatternExecutionAdaptationRollout;
      const identity = api?.fingerprint ? api.fingerprint({ progressId: record?.progress_id || null, state: record?.state || null, reasonCode }) : canonicalize({ progressId: record?.progress_id || null, reasonCode });
      const timestamp = record?.state?.updatedAt || record?.updated_at || "1970-01-01T00:00:00.000Z";
      const quarantine = { quarantine_id: `adaptation-rollout-quarantine:${identity}`, source_store: "progress", source_key: record?.progress_id || null, reason_code: reasonCode, record: clone(record), created_at: timestamp, expires_at: timestamp };
      const database = await this._database();
      const transaction = database.transaction("quarantine", "readwrite");
      transaction.objectStore("quarantine").put(quarantine);
      await transactionComplete(transaction);
      return clone(quarantine);
    }

    async listPatternExecutionAdaptationRollouts(projectId, calculationId = null, patternExecutionId = null, adaptationId = null, adaptationValidationId = null, adaptationPromotionId = null, filters = {}) {
      if (calculationId && typeof calculationId === "object") { filters = calculationId; calculationId = filters.calculationId || null; patternExecutionId = filters.patternExecutionId || filters.runtimeId || null; adaptationId = filters.adaptationId || null; adaptationValidationId = filters.adaptationValidationId || null; adaptationPromotionId = filters.adaptationPromotionId || null; }
      const project = await this._validatedCurrentProject(projectId);
      const effectiveCalculationId = calculationId || project.active_calculation_id;
      if (!effectiveCalculationId) return [];
      const database = await this._database();
      const transaction = database.transaction("progress", "readonly");
      const records = await requestResult(transaction.objectStore("progress").index("by_calculation_kind").getAll(global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION_ROLLOUT"])));
      await transactionComplete(transaction);
      const valid = [];
      const filtered = records.filter((entry) => entry.project_id === projectId && (!patternExecutionId || entry.state?.patternExecutionId === patternExecutionId || entry.state?.runtimeId === patternExecutionId) && (!adaptationId || entry.state?.adaptationId === adaptationId) && (!adaptationValidationId || entry.state?.adaptationValidationId === adaptationValidationId) && (!adaptationPromotionId || entry.state?.adaptationPromotionId === adaptationPromotionId) && (!filters.lifecycle || entry.state?.lifecycle === filters.lifecycle) && (!filters.verdict || entry.state?.rolloutVerdict === filters.verdict) && (filters.stale === undefined || entry.state?.stale === filters.stale) && (!filters.proofStatus || entry.state?.proofStatus === filters.proofStatus) && (filters.proven === undefined || (entry.state?.proofStatus === "proven") === filters.proven) && (filters.importedUnproven === undefined || (entry.state?.proofStatus === "imported-unproven") === filters.importedUnproven) && (filters.collision === undefined || entry.state?.collision === filters.collision));
      filtered.sort((left, right) => left.epoch - right.epoch || left.state.revision - right.state.revision || (String(left.state.id) < String(right.state.id) ? -1 : String(left.state.id) > String(right.state.id) ? 1 : 0));
      for (const entry of filtered) {
        try { validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION_ROLLOUT"); validateImportedPatternExecutionAdaptationRollout(entry.state, projectId); valid.push(clone(entry)); }
        catch (error) { await this._quarantinePatternExecutionAdaptationRollout(entry, error?.code || "INVALID_PATTERN_EXECUTION_ADAPTATION_ROLLOUT"); }
      }
      return valid;
    }

    async getPatternExecutionAdaptationRollout(projectId, adaptationRolloutId = null, calculationId = null, adaptationId = null, adaptationValidationId = null, adaptationPromotionId = null) {
      const records = await this.listPatternExecutionAdaptationRollouts(projectId, calculationId, null, adaptationId, adaptationValidationId, adaptationPromotionId);
      if (adaptationRolloutId) return records.find((entry) => entry.progress_id === adaptationRolloutId || entry.state?.id === adaptationRolloutId || entry.state?.adaptationRolloutId === adaptationRolloutId) || null;
      return records.at(-1) || null;
    }

    async getLatestPatternExecutionAdaptationRollout(projectId, calculationId = null, patternExecutionId = null, adaptationId = null, adaptationValidationId = null, adaptationPromotionId = null, filters = {}) {
      const records = calculationId && typeof calculationId === "object" ? await this.listPatternExecutionAdaptationRollouts(projectId, calculationId) : await this.listPatternExecutionAdaptationRollouts(projectId, calculationId, patternExecutionId, adaptationId, adaptationValidationId, adaptationPromotionId, filters);
      return records.at(-1) || null;
    }

    async _assertPatternExecutionAdaptationRolloutReferences(projectId, calculationId, state) {
      const api = global.YarnAIPatternExecutionAdaptationRollout;
      if (!api?.loadSource || !api?.calculateSourceProof) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_API_MISSING", "Execution adaptation rollout module is not loaded.");
      const source = await api.loadSource(this, projectId, state.adaptationPromotionId);
      if (source.calculationId !== calculationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_SCOPE_INVALID", "Adaptation rollout does not belong to the active calculation.");
      const proof = api.calculateSourceProof(source, state);
      if (!proof.projectResolved || !proof.calculationResolved || !proof.runtimeResolved || !proof.adaptationResolved || !proof.validationResolved || !proof.promotionResolved || !proof.sameProject || !proof.sameCalculation || !proof.samePatternExecution || !proof.adaptationTargetMatches || !proof.validationTargetMatches || !proof.promotionTargetMatches) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_REFERENCE_INVALID", "Rollout references do not resolve to one local source chain.", { details: { issues: proof.issues } });
      if (!proof.promotionAllowsRollout) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_PROMOTION_BLOCKED", "Promotion verdict does not allow rollout.");
      const expectedConstraints = api.constraintsFromPromotion(source.promotion).map((item) => ({ constraintId: item.constraintId, severity: item.severity, sourceStatus: item.sourceStatus }));
      const actualConstraints = state.constraints.map((item) => ({ constraintId: item.constraintId, severity: item.severity, sourceStatus: item.sourceStatus }));
      if (canonicalize(expectedConstraints) !== canonicalize(actualConstraints)) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_CONSTRAINT_SOURCE_INVALID", "Rollout constraint identities must match the open promotion constraints.");
      return { source, proof };
    }

    async savePatternExecutionAdaptationRollout(projectId, calculationOrState, stateOrOptions = {}, maybeOptions = {}) {
      const directState = calculationOrState && typeof calculationOrState === "object";
      const state = directState ? calculationOrState : stateOrOptions;
      const calculationId = directState ? state.calculationId : calculationOrState;
      const options = directState ? stateOrOptions : maybeOptions;
      const api = global.YarnAIPatternExecutionAdaptationRollout;
      const report = api?.validatePatternExecutionAdaptationRollout?.(state);
      if (!api || state?.kind !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT" || state?.type !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT" || state?.projectId !== projectId || state?.calculationId !== calculationId || !report?.valid) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_ADAPTATION_ROLLOUT_STATE", "Execution adaptation rollout snapshot is corrupted.");
      validateImportedPatternExecutionAdaptationRollout(state, projectId);
      await this._assertPatternExecutionAdaptationRolloutReferences(projectId, calculationId, state);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId);
        if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Adaptation rollout does not belong to the active calculation.");
        const existing = await this.listPatternExecutionAdaptationRollouts(projectId, calculationId);
        if (existing.some((entry) => entry.state?.identity === state.identity && entry.state?.id !== state.id)) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_IDENTITY_COLLISION", "Rollout identity collides with another record; no record was overwritten.");
        const current = options.recordId ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId) : existing.find((entry) => entry.state?.id === state.id);
        const timestamp = options.timestamp || state.updatedAt;
        if (current) {
          if ((options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) || (options.expectedIdentity !== undefined && options.expectedIdentity !== current.state.identity)) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_REVISION_CONFLICT", "Rollout was changed by another operation.");
          if (canonicalize(state) === canonicalize(current.state)) return clone(current);
          const proofReprojection = options.allowProofReprojection === true && options.operationKind === "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_PROOF_REPROJECTED";
          if (["completed", "aborted"].includes(current.state.lifecycle) && !proofReprojection) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_TERMINAL", "Terminal rollout is immutable.");
          if (state.id !== current.state.id || state.adaptationRolloutId !== current.state.adaptationRolloutId || state.epoch !== current.state.epoch || state.revision <= current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_REVISION_CONFLICT", "Rollout revision or identity is invalid.");
          const lifecycleNext = { draft: "preparing", preparing: "deploying", deploying: "monitoring", monitoring: "completed" };
          if (!proofReprojection && state.lifecycle !== current.state.lifecycle && state.lifecycle !== "aborted" && lifecycleNext[current.state.lifecycle] !== state.lifecycle) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_LIFECYCLE_CONFLICT", "Rollout lifecycle can only move one state forward or abort.");
          const immutableFields = ["projectId", "calculationId", "patternExecutionId", "runtimeId", "adaptationId", "adaptationValidationId", "adaptationPromotionId", "sourceIdentities", "projectSnapshot", "calculationSnapshot", "runtimeSnapshot", "adaptationSnapshot", "validationSnapshot", "promotionSnapshot", "epoch", "createdAt"];
          if (immutableFields.some((field) => canonicalize(state[field]) !== canonicalize(current.state[field]))) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_SOURCE_IMMUTABLE", "Rollout source snapshots are immutable.");
          if (["deploying", "monitoring"].includes(current.state.lifecycle)) {
            const planStructure = (value) => value.rolloutPlan.map((item) => ({ rolloutItemId: item.rolloutItemId, title: item.title, required: item.required, sequence: item.sequence, targetScope: item.targetScope, expectedOutcome: item.expectedOutcome, rollbackCondition: item.rollbackCondition }));
            if (state.strategy !== current.state.strategy || canonicalize(state.scope) !== canonicalize(current.state.scope) || canonicalize(planStructure(state)) !== canonicalize(planStructure(current.state))) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_PLAN_LOCKED", "Rollout strategy, scope and plan structure are locked after deployment starts.");
          }
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp;
          const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_rollout_${state.lifecycle}`; nextProject.updated_at = timestamp; nextProject.revision += 1; nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
          const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_ADAPTATION_ROLLOUT_${state.lifecycle.toUpperCase()}`, { calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch, progress_revision: nextProgress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision);
          const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
          const database = await this._database(); const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
          try { const storedProject = await requestResult(transaction.objectStore("projects").get(projectId)); const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id)); if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_REVISION_CONFLICT", "Rollout changed concurrently."); } await allocateOperationMetadata(transaction, operation); transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint); await transactionComplete(transaction); } catch (error) { throw mapStorageError(error); }
          this._notify(projectId, nextProject.revision, operation.kind); return clone(nextProgress);
        }
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_ADAPTATION_ROLLOUT", timestamp); progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1; progress.state = clone(state);
        if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EPOCH_CONFLICT", "Rollout epoch differs from progress epoch.");
        const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_rollout_${state.lifecycle}`; nextProject.updated_at = timestamp; nextProject.revision += 1; nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject));
        const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_CREATED", { calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch, progress_revision: progress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision); const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp);
        const database = await this._database(); const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite");
        try { const storedProject = await requestResult(transaction.objectStore("projects").get(projectId)); if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_REVISION_CONFLICT", "Project changed concurrently."); } await allocateOperationMetadata(transaction, operation); transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint); await transactionComplete(transaction); } catch (error) { throw mapStorageError(error); }
        this._notify(projectId, nextProject.revision, operation.kind); return clone(progress);
      });
    }

    async createPatternExecutionAdaptationRollout(projectId, input = {}) { const api = global.YarnAIPatternExecutionAdaptationRollout; if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_API_MISSING", "Execution adaptation rollout module is not loaded."); return api.createForProject(this, projectId, input); }
    async readPatternExecutionAdaptationRollout(projectId, adaptationRolloutId = null, adaptationPromotionId = null) { const api = global.YarnAIPatternExecutionAdaptationRollout; if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_API_MISSING", "Execution adaptation rollout module is not loaded."); return api.readForProject(this, projectId, adaptationRolloutId, adaptationPromotionId); }
    async reprojectPatternExecutionAdaptationRolloutProof(projectId, adaptationRolloutId, options = {}) { const current = await this.getPatternExecutionAdaptationRollout(projectId, adaptationRolloutId); if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_NOT_FOUND", "Adaptation rollout was not found."); const api = global.YarnAIPatternExecutionAdaptationRollout; const source = await api.loadSource(this, projectId, current.state.adaptationPromotionId); const next = api.reprojectPatternExecutionAdaptationRollout(current.state, { ...source, rolloutStorageRevision: current.revision }, { now: options.timestamp || current.state.updatedAt }); return this.savePatternExecutionAdaptationRollout(projectId, next, { ...options, recordId: current.progress_id, expectedRevision: current.state.revision, expectedIdentity: current.state.identity, operationKind: "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_PROOF_REPROJECTED", allowProofReprojection: true }); }

    async _quarantinePatternExecutionAdaptationRolloutEvaluation(record, reasonCode) {
      const api = global.YarnAIPatternExecutionAdaptationRolloutEvaluation;
      const identity = api?.fingerprint ? api.fingerprint({ progressId: record?.progress_id || null, state: record?.state || null, reasonCode }) : canonicalize({ progressId: record?.progress_id || null, reasonCode });
      const timestamp = record?.state?.updatedAt || record?.updated_at || "1970-01-01T00:00:00.000Z";
      const quarantine = { quarantine_id: `adaptation-rollout-evaluation-quarantine:${identity}`, source_store: "progress", source_key: record?.progress_id || null, reason_code: reasonCode, record: clone(record), created_at: timestamp, expires_at: timestamp };
      const database = await this._database(); const transaction = database.transaction("quarantine", "readwrite"); transaction.objectStore("quarantine").put(quarantine); await transactionComplete(transaction); return clone(quarantine);
    }

    async listPatternExecutionAdaptationRolloutEvaluations(projectId, calculationId = null, rolloutId = null, filters = {}) {
      if (calculationId && typeof calculationId === "object") { filters = calculationId; calculationId = filters.calculationId || null; rolloutId = filters.rolloutId || filters.adaptationRolloutId || null; }
      const project = await this._validatedCurrentProject(projectId); const effectiveCalculationId = calculationId || project.active_calculation_id; if (!effectiveCalculationId) return [];
      const database = await this._database(); const transaction = database.transaction("progress", "readonly"); const records = await requestResult(transaction.objectStore("progress").index("by_calculation_kind").getAll(global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION"]))); await transactionComplete(transaction);
      const filtered = records.filter((entry) => entry.project_id === projectId && (!rolloutId || entry.state?.rolloutId === rolloutId || entry.state?.adaptationRolloutId === rolloutId) && (!filters.lifecycle || entry.state?.lifecycle === filters.lifecycle) && (!filters.verdict || entry.state?.verdict === filters.verdict) && (!filters.strategy || entry.state?.strategy === filters.strategy) && (filters.stale === undefined || entry.state?.stale === filters.stale) && (!filters.proofStatus || entry.state?.proofStatus === filters.proofStatus) && (filters.proven === undefined || (entry.state?.proofStatus === "proven") === filters.proven) && (filters.importedUnproven === undefined || (entry.state?.proofStatus === "imported-unproven") === filters.importedUnproven) && (filters.collision === undefined || entry.state?.collision === filters.collision));
      filtered.sort((a, b) => a.epoch - b.epoch || a.state.revision - b.state.revision || (String(a.state.id) < String(b.state.id) ? -1 : String(a.state.id) > String(b.state.id) ? 1 : 0)); const valid = [];
      for (const entry of filtered) { try { validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION"); validateImportedPatternExecutionAdaptationRolloutEvaluation(entry.state, projectId); valid.push(clone(entry)); } catch (error) { await this._quarantinePatternExecutionAdaptationRolloutEvaluation(entry, error?.code || "INVALID_PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION"); } } return valid;
    }

    async getPatternExecutionAdaptationRolloutEvaluation(projectId, evaluationId = null, calculationId = null, rolloutId = null) { const records = await this.listPatternExecutionAdaptationRolloutEvaluations(projectId, calculationId, rolloutId); if (evaluationId) return records.find((entry) => entry.progress_id === evaluationId || entry.state?.id === evaluationId || entry.state?.evaluationId === evaluationId || entry.state?.adaptationRolloutEvaluationId === evaluationId) || null; return records.at(-1) || null; }
    async getLatestPatternExecutionAdaptationRolloutEvaluation(projectId, calculationId = null, rolloutId = null, filters = {}) { const records = calculationId && typeof calculationId === "object" ? await this.listPatternExecutionAdaptationRolloutEvaluations(projectId, calculationId) : await this.listPatternExecutionAdaptationRolloutEvaluations(projectId, calculationId, rolloutId, filters); return records.at(-1) || null; }

    async _assertPatternExecutionAdaptationRolloutEvaluationReferences(projectId, calculationId, state, evaluationStorageRevision = 0) {
      const api = global.YarnAIPatternExecutionAdaptationRolloutEvaluation; if (!api?.loadSource || !api?.calculateSourceProof) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_API_MISSING", "Rollout evaluation module is not loaded.");
      const source = await api.loadSource(this, projectId, state.rolloutId); if (source.calculationId !== calculationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_SCOPE_INVALID", "Rollout evaluation does not belong to the active calculation."); const proof = api.calculateSourceProof({ ...source, evaluationStorageRevision }, state); if (!proof.recordsResolved || !proof.sameProject || !proof.sameCalculation || !proof.identitiesMatch || !proof.rolloutTerminal || !proof.rolloutVerdictComputed || !proof.snapshotsMatch || !proof.collisionFree) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_REFERENCE_INVALID", "Rollout evaluation references do not resolve to one local source chain.", { details: { issues: proof.issues } }); return { source, proof };
    }

    async savePatternExecutionAdaptationRolloutEvaluation(projectId, calculationOrState, stateOrOptions = {}, maybeOptions = {}) {
      const directState = calculationOrState && typeof calculationOrState === "object"; const state = directState ? calculationOrState : stateOrOptions; const calculationId = directState ? state.calculationId : calculationOrState; const options = directState ? stateOrOptions : maybeOptions; const api = global.YarnAIPatternExecutionAdaptationRolloutEvaluation; const report = api?.validatePatternExecutionAdaptationRolloutEvaluation?.(state);
      if (!api || state?.kind !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION" || state?.type !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION" || state?.projectId !== projectId || state?.calculationId !== calculationId || !report?.valid) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_STATE", "Rollout evaluation snapshot is corrupted."); validateImportedPatternExecutionAdaptationRolloutEvaluation(state, projectId);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId); if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Rollout evaluation does not belong to the active calculation."); const existing = await this.listPatternExecutionAdaptationRolloutEvaluations(projectId, calculationId); if (existing.some((entry) => entry.state?.identity === state.identity && entry.state?.id !== state.id)) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_IDENTITY_COLLISION", "Evaluation identity collides with another record."); const current = options.recordId ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId) : existing.find((entry) => entry.state?.id === state.id); await this._assertPatternExecutionAdaptationRolloutEvaluationReferences(projectId, calculationId, state, current?.revision || 0); const timestamp = options.timestamp || state.updatedAt;
        if (current) {
          if ((options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) || (options.expectedIdentity !== undefined && options.expectedIdentity !== current.state.identity)) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_REVISION_CONFLICT", "Evaluation was changed by another operation."); if (canonicalize(state) === canonicalize(current.state)) return clone(current); const proofReprojection = options.allowProofReprojection === true && options.operationKind === "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_PROOF_REPROJECTED"; if (["completed", "aborted"].includes(current.state.lifecycle) && !proofReprojection) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_TERMINAL", "Terminal evaluation is immutable."); if (state.id !== current.state.id || state.evaluationId !== current.state.evaluationId || state.epoch !== current.state.epoch || state.revision <= current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_REVISION_CONFLICT", "Evaluation revision or identity is invalid."); const lifecycleNext = { draft: "collecting", collecting: "analyzing", analyzing: "reviewing", reviewing: "completed" }; if (!proofReprojection && state.lifecycle !== current.state.lifecycle && state.lifecycle !== "aborted" && lifecycleNext[current.state.lifecycle] !== state.lifecycle) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_LIFECYCLE_CONFLICT", "Evaluation lifecycle can move only one state forward or abort."); const immutableFields = ["projectId", "calculationId", "runtimeId", "adaptationId", "validationId", "promotionId", "rolloutId", "sourceIdentities", "projectSnapshot", "calculationSnapshot", "runtimeSnapshot", "adaptationSnapshot", "validationSnapshot", "promotionSnapshot", "rolloutSnapshot", "expectedImpact", "epoch", "createdAt"]; if (immutableFields.some((field) => canonicalize(state[field]) !== canonicalize(current.state[field]))) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_SOURCE_IMMUTABLE", "Evaluation source snapshots and scope are immutable.");
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp; const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_rollout_evaluation_${state.lifecycle}`; nextProject.updated_at = timestamp; nextProject.revision += 1; nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject)); const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_${state.lifecycle.toUpperCase()}`, { calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch, progress_revision: nextProgress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision); const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp); const database = await this._database(); const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite"); try { const storedProject = await requestResult(transaction.objectStore("projects").get(projectId)); const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id)); if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_REVISION_CONFLICT", "Evaluation changed concurrently."); } await allocateOperationMetadata(transaction, operation); transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint); await transactionComplete(transaction); } catch (error) { throw mapStorageError(error); } this._notify(projectId, nextProject.revision, operation.kind); return clone(nextProgress);
        }
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION", timestamp); progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1; progress.state = clone(state); if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_EPOCH_CONFLICT", "Evaluation epoch differs from progress epoch."); const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_rollout_evaluation_${state.lifecycle}`; nextProject.updated_at = timestamp; nextProject.revision += 1; nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject)); const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_CREATED", { calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch, progress_revision: progress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision); const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp); const database = await this._database(); const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite"); try { const storedProject = await requestResult(transaction.objectStore("projects").get(projectId)); if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_REVISION_CONFLICT", "Evaluation changed concurrently."); } await allocateOperationMetadata(transaction, operation); transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint); await transactionComplete(transaction); } catch (error) { throw mapStorageError(error); } this._notify(projectId, nextProject.revision, operation.kind); return clone(progress);
      });
    }

    async createPatternExecutionAdaptationRolloutEvaluation(projectId, input = {}) { const api = global.YarnAIPatternExecutionAdaptationRolloutEvaluation; if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_API_MISSING", "Rollout evaluation module is not loaded."); return api.createForProject(this, projectId, input); }
    async readPatternExecutionAdaptationRolloutEvaluation(projectId, evaluationId = null, rolloutId = null) { const api = global.YarnAIPatternExecutionAdaptationRolloutEvaluation; if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_API_MISSING", "Rollout evaluation module is not loaded."); return api.readForProject(this, projectId, evaluationId, rolloutId); }
    async reprojectPatternExecutionAdaptationRolloutEvaluationProof(projectId, evaluationId, options = {}) { const current = await this.getPatternExecutionAdaptationRolloutEvaluation(projectId, evaluationId); if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_NOT_FOUND", "Rollout evaluation was not found."); const api = global.YarnAIPatternExecutionAdaptationRolloutEvaluation; const source = await api.loadSource(this, projectId, current.state.rolloutId); const next = api.reprojectPatternExecutionAdaptationRolloutEvaluation(current.state, { ...source, evaluationStorageRevision: current.revision }, { ...options, now: options.timestamp || current.state.updatedAt }); return this.savePatternExecutionAdaptationRolloutEvaluation(projectId, next, { ...options, recordId: current.progress_id, expectedRevision: current.state.revision, expectedIdentity: current.state.identity, operationKind: "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_PROOF_REPROJECTED", allowProofReprojection: true }); }

    async _quarantinePatternExecutionAdaptationClosure(record, reasonCode) {
      const api = global.YarnAIPatternExecutionAdaptationClosure;
      const identity = api?.fingerprint ? api.fingerprint({ progressId: record?.progress_id || null, state: record?.state || null, reasonCode }) : canonicalize({ progressId: record?.progress_id || null, reasonCode });
      const timestamp = record?.state?.updatedAt || record?.updated_at || "1970-01-01T00:00:00.000Z";
      const quarantine = { quarantine_id: `adaptation-closure-quarantine:${identity}`, source_store: "progress", source_key: record?.progress_id || null, reason_code: reasonCode, record: clone(record), created_at: timestamp, expires_at: timestamp };
      const database = await this._database(); const transaction = database.transaction("quarantine", "readwrite"); transaction.objectStore("quarantine").put(quarantine); await transactionComplete(transaction); return clone(quarantine);
    }

    async listPatternExecutionAdaptationClosures(projectId, calculationId = null, evaluationId = null, filters = {}) {
      if (calculationId && typeof calculationId === "object") { filters = calculationId; calculationId = filters.calculationId || null; evaluationId = filters.evaluationId || filters.adaptationRolloutEvaluationId || null; }
      const project = await this._validatedCurrentProject(projectId); const effectiveCalculationId = calculationId || project.active_calculation_id; if (!effectiveCalculationId) return [];
      const database = await this._database(); const transaction = database.transaction("progress", "readonly"); const records = await requestResult(transaction.objectStore("progress").index("by_calculation_kind").getAll(global.IDBKeyRange.only([effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION_CLOSURE"]))); await transactionComplete(transaction);
      const filtered = records.filter((entry) => entry.project_id === projectId && (!evaluationId || entry.state?.evaluationId === evaluationId || entry.state?.adaptationRolloutEvaluationId === evaluationId) && (!filters.lifecycle || entry.state?.lifecycle === filters.lifecycle) && (!filters.verdict || entry.state?.verdict === filters.verdict) && (!filters.decision || entry.state?.decision === filters.decision) && (!filters.closureType || entry.state?.closureType === filters.closureType) && (filters.stale === undefined || entry.state?.stale === filters.stale) && (!filters.proofStatus || entry.state?.proofStatus === filters.proofStatus) && (filters.proven === undefined || (entry.state?.proofStatus === "proven") === filters.proven) && (filters.importedUnproven === undefined || (entry.state?.proofStatus === "imported-unproven") === filters.importedUnproven) && (filters.collision === undefined || entry.state?.collision === filters.collision));
      filtered.sort((a, b) => a.epoch - b.epoch || a.state.revision - b.state.revision || (String(a.state.id) < String(b.state.id) ? -1 : String(a.state.id) > String(b.state.id) ? 1 : 0)); const valid = [];
      for (const entry of filtered) { try { validateProgressRecord(entry, projectId, effectiveCalculationId, "PATTERN_EXECUTION_ADAPTATION_CLOSURE"); validateImportedPatternExecutionAdaptationClosure(entry.state, projectId); valid.push(clone(entry)); } catch (error) { await this._quarantinePatternExecutionAdaptationClosure(entry, error?.code || "INVALID_PATTERN_EXECUTION_ADAPTATION_CLOSURE"); } } return valid;
    }

    async getPatternExecutionAdaptationClosure(projectId, closureId = null, calculationId = null, evaluationId = null) { const records = await this.listPatternExecutionAdaptationClosures(projectId, calculationId, evaluationId); if (closureId) return records.find((entry) => entry.progress_id === closureId || entry.state?.id === closureId || entry.state?.closureId === closureId || entry.state?.adaptationClosureId === closureId) || null; return records.at(-1) || null; }
    async getLatestPatternExecutionAdaptationClosure(projectId, calculationId = null, evaluationId = null, filters = {}) { const records = calculationId && typeof calculationId === "object" ? await this.listPatternExecutionAdaptationClosures(projectId, calculationId) : await this.listPatternExecutionAdaptationClosures(projectId, calculationId, evaluationId, filters); return records.at(-1) || null; }

    async _assertPatternExecutionAdaptationClosureReferences(projectId, calculationId, state, closureStorageRevision = 0) {
      const api = global.YarnAIPatternExecutionAdaptationClosure; if (!api?.loadSource || !api?.calculateSourceProof) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_API_MISSING", "Adaptation closure module is not loaded.");
      const source = await api.loadSource(this, projectId, state.evaluationId); if (source.calculationId !== calculationId) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_SCOPE_INVALID", "Adaptation closure does not belong to the active calculation."); const proof = api.calculateSourceProof({ ...source, closureStorageRevision }, state); if (!proof.recordsResolved || !proof.sameProject || !proof.sameCalculation || !proof.identitiesMatch || !proof.evaluationTerminal || !proof.evaluationVerdictComputed || !proof.snapshotsMatch || !proof.collisionFree || !proof.sourceDigestValid) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_REFERENCE_INVALID", "Adaptation closure references do not resolve to one local source chain.", { details: { issues: proof.issues } }); return { source, proof };
    }

    async savePatternExecutionAdaptationClosure(projectId, calculationOrState, stateOrOptions = {}, maybeOptions = {}) {
      const directState = calculationOrState && typeof calculationOrState === "object"; const state = directState ? calculationOrState : stateOrOptions; const calculationId = directState ? state.calculationId : calculationOrState; const options = directState ? stateOrOptions : maybeOptions; const api = global.YarnAIPatternExecutionAdaptationClosure; const report = api?.validatePatternExecutionAdaptationClosure?.(state);
      if (!api || state?.kind !== "PATTERN_EXECUTION_ADAPTATION_CLOSURE" || state?.type !== "PATTERN_EXECUTION_ADAPTATION_CLOSURE" || state?.projectId !== projectId || state?.calculationId !== calculationId || !report?.valid) throw new ProjectRepositoryError("INVALID_PATTERN_EXECUTION_ADAPTATION_CLOSURE_STATE", "Adaptation closure snapshot is corrupted."); validateImportedPatternExecutionAdaptationClosure(state, projectId);
      return this._serialize(projectId, async () => {
        const before = await this._validatedCurrentProject(projectId); if (before.active_calculation_id !== calculationId) throw new ProjectRepositoryError("CALCULATION_MISMATCH", "Adaptation closure does not belong to the active calculation."); const existing = await this.listPatternExecutionAdaptationClosures(projectId, calculationId); if (existing.some((entry) => entry.state?.identity === state.identity && entry.state?.id !== state.id)) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_IDENTITY_COLLISION", "Closure identity collides with another record."); const current = options.recordId ? existing.find((entry) => entry.progress_id === options.recordId || entry.state?.id === options.recordId) : existing.find((entry) => entry.state?.id === state.id); await this._assertPatternExecutionAdaptationClosureReferences(projectId, calculationId, state, current?.revision || 0); const timestamp = options.timestamp || state.updatedAt;
        if (current) {
          if ((options.expectedRevision !== undefined && options.expectedRevision !== current.state.revision) || (options.expectedIdentity !== undefined && options.expectedIdentity !== current.state.identity)) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_REVISION_CONFLICT", "Closure was changed by another operation."); if (canonicalize(state) === canonicalize(current.state)) return clone(current); const proofReprojection = options.allowProofReprojection === true && options.operationKind === "PATTERN_EXECUTION_ADAPTATION_CLOSURE_PROOF_REPROJECTED"; if (["closed", "rejected", "aborted", "superseded"].includes(current.state.lifecycle) && !proofReprojection) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_TERMINAL", "Terminal closure is immutable."); if (state.id !== current.state.id || state.closureId !== current.state.closureId || state.epoch !== current.state.epoch || state.revision <= current.state.revision) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_REVISION_CONFLICT", "Closure revision or identity is invalid."); const lifecycleNext = { draft: "preparing", preparing: "deciding", deciding: "finalizing", finalizing: "closed" }; if (!proofReprojection && state.lifecycle !== current.state.lifecycle && !["rejected", "aborted", "superseded"].includes(state.lifecycle) && lifecycleNext[current.state.lifecycle] !== state.lifecycle) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_LIFECYCLE_CONFLICT", "Closure lifecycle can move only one state forward or enter an allowed terminal state."); const immutableFields = ["projectId", "calculationId", "runtimeId", "adaptationId", "validationId", "promotionId", "rolloutId", "evaluationId", "sourceIdentities", "sourceRevisions", "projectSnapshot", "calculationSnapshot", "runtimeSnapshot", "adaptationSnapshot", "validationSnapshot", "promotionSnapshot", "rolloutSnapshot", "evaluationSnapshot", "epoch", "createdAt"]; if (immutableFields.some((field) => canonicalize(state[field]) !== canonicalize(current.state[field]))) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_SOURCE_IMMUTABLE", "Closure source snapshots are immutable."); if (current.state.lifecycle === "finalizing" && (canonicalize(state.closureScope) !== canonicalize(current.state.closureScope) || state.decision !== current.state.decision)) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_FINALIZING_IMMUTABLE", "Closure scope and decision are immutable while finalizing.");
          const nextProgress = clone(current); nextProgress.state = clone(state); nextProgress.revision += 1; nextProgress.updated_at = timestamp; const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_closure_${state.lifecycle}`; nextProject.updated_at = timestamp; nextProject.revision += 1; nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject)); const operation = createOperation(nextProject, options.operationKind || `PATTERN_EXECUTION_ADAPTATION_CLOSURE_${state.lifecycle.toUpperCase()}`, { calculation_id: calculationId, progress_id: current.progress_id, progress_epoch: current.epoch, progress_revision: nextProgress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision); const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp); const database = await this._database(); const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite"); try { const storedProject = await requestResult(transaction.objectStore("projects").get(projectId)); const storedProgress = await requestResult(transaction.objectStore("progress").get(current.progress_id)); if (!storedProject || storedProject.revision !== before.revision || !storedProgress || storedProgress.revision !== current.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_REVISION_CONFLICT", "Closure changed concurrently."); } await allocateOperationMetadata(transaction, operation); transaction.objectStore("progress").put(nextProgress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint); await transactionComplete(transaction); } catch (error) { throw mapStorageError(error); } this._notify(projectId, nextProject.revision, operation.kind); return clone(nextProgress);
        }
        const progress = this._initialProgress(projectId, calculationId, "PATTERN_EXECUTION_ADAPTATION_CLOSURE", timestamp); progress.epoch = existing.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1; progress.state = clone(state); if (progress.state.epoch !== progress.epoch) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_EPOCH_CONFLICT", "Closure epoch differs from progress epoch."); const nextProject = clone(before); nextProject.current_stage = `pattern_execution_adaptation_closure_${state.lifecycle}`; nextProject.updated_at = timestamp; nextProject.revision += 1; nextProject.materialized_checksum = await checksumPayload(projectChecksumPayload(nextProject)); const operation = createOperation(nextProject, options.operationKind || "PATTERN_EXECUTION_ADAPTATION_CLOSURE_CREATED", { calculation_id: calculationId, progress_id: progress.progress_id, progress_epoch: progress.epoch, progress_revision: progress.revision, progress_state: clone(state) }, timestamp, before.revision, nextProject.revision); const checkpoint = createCheckpoint(nextProject, nextProject.materialized_checksum, nextProject.revision, timestamp); const database = await this._database(); const transaction = database.transaction(["projects", "progress", "operations", "checkpoints", "meta"], "readwrite"); try { const storedProject = await requestResult(transaction.objectStore("projects").get(projectId)); if (!storedProject || storedProject.revision !== before.revision) { transaction.abort(); throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_REVISION_CONFLICT", "Project changed concurrently."); } await allocateOperationMetadata(transaction, operation); transaction.objectStore("progress").add(progress); transaction.objectStore("projects").put(nextProject); transaction.objectStore("operations").add(operation); transaction.objectStore("checkpoints").add(checkpoint); await transactionComplete(transaction); } catch (error) { throw mapStorageError(error); } this._notify(projectId, nextProject.revision, operation.kind); return clone(progress);
      });
    }

    async createPatternExecutionAdaptationClosure(projectId, input = {}) { const api = global.YarnAIPatternExecutionAdaptationClosure; if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_API_MISSING", "Adaptation closure module is not loaded."); return api.createForProject(this, projectId, input); }
    async readPatternExecutionAdaptationClosure(projectId, closureId = null, evaluationId = null) { const api = global.YarnAIPatternExecutionAdaptationClosure; if (!api) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_API_MISSING", "Adaptation closure module is not loaded."); return api.readForProject(this, projectId, closureId, evaluationId); }
    async reprojectPatternExecutionAdaptationClosureProof(projectId, closureId, options = {}) { const current = await this.getPatternExecutionAdaptationClosure(projectId, closureId); if (!current) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_NOT_FOUND", "Adaptation closure was not found."); const api = global.YarnAIPatternExecutionAdaptationClosure; const source = await api.loadSource(this, projectId, current.state.evaluationId); const next = api.reprojectPatternExecutionAdaptationClosure(current.state, { ...source, closureStorageRevision: current.revision }, { ...options, now: options.timestamp || current.state.updatedAt }); return this.savePatternExecutionAdaptationClosure(projectId, next, { ...options, recordId: current.progress_id, expectedRevision: current.state.revision, expectedIdentity: current.state.identity, operationKind: "PATTERN_EXECUTION_ADAPTATION_CLOSURE_PROOF_REPROJECTED", allowProofReprojection: true }); }
    async addPhoto(projectId, blob, metadata = {}) {
      if (!(blob instanceof Blob) || !blob.type.startsWith("image/")) {
        throw new ProjectRepositoryError(
          "INVALID_PHOTO",
          "Выберите поддерживаемый файл изображения.",
        );
      }
      if (blob.size <= 0 || blob.size > MAX_PHOTO_BYTES) {
        throw new ProjectRepositoryError(
          "PHOTO_TOO_LARGE",
          "Изображение должно быть меньше 20 МБ.",
        );
      }
      const project = await this._validatedCurrentProject(projectId);
      if (project.workspace_status === "DELETED") {
        throw new ProjectRepositoryError(
          "INVALID_LIFECYCLE_TRANSITION",
          "Нельзя добавить фото в проект из корзины.",
        );
      }
      const timestamp = utcNow();
      const bytes = await blob.arrayBuffer();
      const hash = await global.crypto.subtle.digest("SHA-256", bytes);
      const sha256 = [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const photoId = uuidv7();
      const photo = {
        schema_version: 1,
        photo_id: photoId,
        project_id: projectId,
        partition_key: PARTITION_KEY,
        purpose: metadata.purpose ?? "PROJECT_REFERENCE",
        calculation_id: metadata.calculation_id ?? null,
        display_name: String(metadata.display_name ?? "Изображение").slice(0, 120),
        source_mime: blob.type,
        normalized_mime: blob.type,
        byte_size: blob.size,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        orientation: null,
        sha256,
        status: "READY",
        privacy_class: "PRIVATE",
        consent_state: "LOCAL_ONLY",
        sync_policy: "NEVER",
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
        purge_after: null,
        revision: 1,
        remote_object_key: null,
        upload_status: "LOCAL_ONLY",
        server_version: null,
        last_synced_at: null,
      };
      const photoBlob = {
        blob_id: uuidv7(),
        photo_id: photoId,
        variant_kind: "ORIGINAL",
        blob,
        mime: blob.type,
        byte_size: blob.size,
        width: photo.width,
        height: photo.height,
        checksum: sha256,
        storage_state: "LOCAL",
        upload_state: "LOCAL_ONLY",
        created_at: timestamp,
        updated_at: timestamp,
        last_accessed_at: timestamp,
        purge_after: null,
      };
      const operation = createOperation(
        project,
        "PHOTO_ADDED",
        { photo_id: photoId },
        timestamp,
        project.revision,
        project.revision,
      );
      const database = await this._database();
      const transaction = database.transaction(
        ["photos", "photo_blobs", "operations", "meta"],
        "readwrite",
      );
      try {
        await allocateOperationMetadata(transaction, operation);
        transaction.objectStore("photos").add(photo);
        transaction.objectStore("photo_blobs").add(photoBlob);
        transaction.objectStore("operations").add(operation);
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error);
      }
      return clone(photo);
    }

    async exportProject(projectId) {
      const aggregate = await this.getProject(projectId);
      if (aggregate.project.workspace_status === "DELETED") {
        throw new ProjectRepositoryError(
          "EXPORT_DELETED_PROJECT",
          "Восстановите проект из корзины перед экспортом.",
        );
      }
      const payload = {
        project: clone(aggregate.project),
        calculations: clone(aggregate.calculations),
        progress: clone(aggregate.progress),
        events: clone(aggregate.operations),
        photos: aggregate.photos.map((photo) => ({
          ...clone(photo),
          binary_omitted: true,
        })),
        media_policy: "binary_omitted",
      };
      const envelope = {
        format: EXPORT_FORMAT,
        schema_version: EXPORT_SCHEMA_VERSION,
        export_id: uuidv7(),
        exported_at: utcNow(),
        application_version: "0.1.0",
        payload,
        payload_checksum: await checksumPayload(payload),
      };
      return {
        envelope,
        json: `${canonicalize(envelope)}\n`,
        filename: `${projectId}.yarnai-project.json`,
        mime_type: "application/json",
      };
    }

    async _readImportSource(source) {
      if (source instanceof Blob) {
        if (source.size > MAX_IMPORT_BYTES) {
          throw new ProjectRepositoryError(
            "IMPORT_TOO_LARGE",
            "Файл проекта превышает допустимый размер 5 МБ.",
          );
        }
        return source.text();
      }
      if (typeof source === "string") {
        if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES) {
          throw new ProjectRepositoryError(
            "IMPORT_TOO_LARGE",
            "Файл проекта превышает допустимый размер 5 МБ.",
          );
        }
        return source;
      }
      if (source && typeof source === "object") {
        return JSON.stringify(source);
      }
      throw new ProjectRepositoryError(
        "INVALID_IMPORT",
        "Выбранный файл не является проектом YarnAI.",
      );
    }

    async importProject(source) {
      const text = await this._readImportSource(source);
      let envelope;
      try {
        envelope = JSON.parse(text);
      } catch {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_JSON",
          "Файл проекта содержит некорректный JSON.",
        );
      }
      if (!envelope || envelope.format !== EXPORT_FORMAT) {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_FORMAT",
          "Файл не является экспортом проекта YarnAI.",
        );
      }
      if (envelope.schema_version !== EXPORT_SCHEMA_VERSION) {
        throw new ProjectRepositoryError(
          "UNSUPPORTED_SCHEMA_VERSION",
          "Версия импортируемого проекта не поддерживается.",
          { details: { schema_version: envelope.schema_version } },
        );
      }
      if (!isUuidv7(envelope.export_id) || !isTimestamp(envelope.exported_at)) {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_METADATA",
          "Служебные данные файла проекта повреждены.",
        );
      }
      if (!envelope.payload || typeof envelope.payload !== "object") {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_PAYLOAD",
          "В файле отсутствуют данные проекта.",
        );
      }
      const actualChecksum = await checksumPayload(envelope.payload);
      if (actualChecksum !== envelope.payload_checksum) {
        throw new ProjectRepositoryError(
          "IMPORT_CHECKSUM_MISMATCH",
          "Контрольная сумма файла не совпадает. Импорт отменён.",
        );
      }
      const sourceProject = clone(envelope.payload.project);
      validateProjectRecord(sourceProject);
      if (sourceProject.workspace_status === "DELETED") {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_STATUS",
          "Экспорт удалённого проекта не поддерживается.",
        );
      }
      const calculations = Array.isArray(envelope.payload.calculations)
        ? clone(envelope.payload.calculations)
        : null;
      const progress = Array.isArray(envelope.payload.progress)
        ? clone(envelope.payload.progress)
        : null;
      const events = Array.isArray(envelope.payload.events)
        ? clone(envelope.payload.events)
        : null;
      if (!calculations || !progress || !events) {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_STRUCTURE",
          "Файл проекта не содержит обязательные связанные записи.",
        );
      }
      calculations.forEach((entry) =>
        validateCalculationRecord(entry, sourceProject.project_id),
      );
      if (
        sourceProject.active_calculation_id &&
        !calculations.some(
          (entry) =>
            entry.calculation_id === sourceProject.active_calculation_id,
        )
      ) {
        throw new ProjectRepositoryError(
          "INVALID_IMPORT_REFERENCE",
          "Файл ссылается на отсутствующий активный расчёт.",
        );
      }
      const database = await this._database();
      const receiptTransaction = database.transaction(
        "transfer_receipts",
        "readonly",
      );
      const existingReceipt = await requestResult(
        receiptTransaction
          .objectStore("transfer_receipts")
          .index("by_external_checksum")
          .get(["IMPORT", envelope.export_id, envelope.payload_checksum]),
      );
      await transactionComplete(receiptTransaction);
      if (existingReceipt) {
        return {
          status: "ALREADY_IMPORTED",
          project_id: existingReceipt.project_id,
          collision: existingReceipt.collision,
        };
      }
      const existingProject = await this._getRawProject(sourceProject.project_id);
      const collision = Boolean(existingProject);
      const sourceProjectId = sourceProject.project_id;
      const projectId = collision ? uuidv7() : sourceProjectId;
      const calculationMap = new Map();
      if (collision) {
        calculations.forEach((entry) =>
          calculationMap.set(entry.calculation_id, uuidv7()),
        );
      }
      const importedProject = clone(sourceProject);
      importedProject.project_id = projectId;
      importedProject.partition_key = PARTITION_KEY;
      importedProject.owner_user_id = null;
      importedProject.imported_from_project_id = collision
        ? sourceProjectId
        : importedProject.imported_from_project_id;
      if (collision && importedProject.active_calculation_id) {
        importedProject.active_calculation_id = calculationMap.get(
          importedProject.active_calculation_id,
        );
      }
      if (collision) {
        importedProject.created_at = utcNow();
        importedProject.updated_at = importedProject.created_at;
        importedProject.last_opened_at = null;
        importedProject.revision = 1;
      }
      importedProject.materialized_checksum = await checksumPayload(
        projectChecksumPayload(importedProject),
      );
      const importedCalculations = calculations.map((entry) => ({
        ...entry,
        project_id: projectId,
        calculation_id: collision
          ? calculationMap.get(entry.calculation_id)
          : entry.calculation_id,
        supersedes_calculation_id:
          collision && entry.supersedes_calculation_id
            ? calculationMap.get(entry.supersedes_calculation_id) ?? null
            : entry.supersedes_calculation_id,
      }));
      const progressMap = new Map();
      const semanticStateIdMap = new Map();
      const reviewStateIdMap = new Map();
      const technologyStateIdMap = new Map();
      const technologyReviewStateIdMap = new Map();
      const executionPlanStateIdMap = new Map();
      const executionSessionStateIdMap = new Map();
      const executionStepStateIdMap = new Map();
      const executionCheckpointStateIdMap = new Map();
      const executionProgressStateIdMap = new Map();
      const executionCompletionStateIdMap = new Map();
      const executionResultStateIdMap = new Map();
      const executionRuntimeStateIdMap = new Map();
      const executionMonitoringStateIdMap = new Map();
      const executionInterventionStateIdMap = new Map();
      const executionActionStateIdMap = new Map();
      const executionAttemptIdMap = new Map();
      const executionEvidenceStateIdMap = new Map();
      const executionEvidenceItemIdMap = new Map();
      const executionCriterionIdMap = new Map();
      const executionVerificationStateIdMap = new Map();
      const executionDecisionStateIdMap = new Map();
      const executionFollowUpStateIdMap = new Map();
      const executionRuntimeActionIdMap = new Map();
      if (collision) {
        for (const entry of progress) {
          if (entry.kind === "PATTERN_SEMANTIC_ANALYSIS" && entry.state?.id) semanticStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_ANALYSIS_REVIEW" && entry.state?.id) reviewStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_TECHNOLOGY_DRAFT" && entry.state?.id) technologyStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_TECHNOLOGY_REVIEW" && entry.state?.id) technologyReviewStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_PLAN" && entry.state?.id) executionPlanStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_SESSION" && entry.state?.id) executionSessionStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_STEP" && entry.state?.id) executionStepStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_CHECKPOINT" && entry.state?.id) executionCheckpointStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_PROGRESS" && entry.state?.id) executionProgressStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_COMPLETION" && entry.state?.id) executionCompletionStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_RESULT" && entry.state?.id) executionResultStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_RUNTIME" && entry.state?.id) executionRuntimeStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_MONITORING" && entry.state?.id) executionMonitoringStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_INTERVENTION" && entry.state?.id) executionInterventionStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_ACTION" && entry.state?.id) executionActionStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_EVIDENCE" && entry.state?.id) executionEvidenceStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_VERIFICATION" && entry.state?.id) executionVerificationStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_DECISION" && entry.state?.id) executionDecisionStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_FOLLOW_UP" && entry.state?.id) executionFollowUpStateIdMap.set(entry.state.id, uuidv7());
          if (entry.kind === "PATTERN_EXECUTION_EVIDENCE") {
            for (const item of Array.isArray(entry.state?.evidenceItems) ? entry.state.evidenceItems : []) {
              if (item.id && !executionEvidenceItemIdMap.has(item.id)) executionEvidenceItemIdMap.set(item.id, uuidv7());
            }
          }
          if (entry.kind === "PATTERN_EXECUTION_ACTION") {
            for (const attempt of [...(Array.isArray(entry.state?.attemptHistory) ? entry.state.attemptHistory : []), entry.state?.currentAttempt].filter(Boolean)) {
              if (attempt.attemptId && !executionAttemptIdMap.has(attempt.attemptId)) executionAttemptIdMap.set(attempt.attemptId, uuidv7());
            }
          }
          if (entry.kind === "PATTERN_EXECUTION_RUNTIME") {
            for (const action of Array.isArray(entry.state?.actions) ? entry.state.actions : []) {
              if (action?.id && !executionRuntimeActionIdMap.has(action.id)) executionRuntimeActionIdMap.set(action.id, uuidv7());
            }
          }
        }
        for (const entry of progress) {
          if (entry.kind !== "PATTERN_EXECUTION_RESULT") continue;
          const identity = entry.state?.expectedSourceIdentity || entry.state?.resultSnapshot?.sourceIdentity;
          const ensureMapped = (map, value) => { if (value && !map.has(value)) map.set(value, uuidv7()); };
          ensureMapped(executionPlanStateIdMap, identity?.plan?.id);
          ensureMapped(executionSessionStateIdMap, identity?.session?.id);
          for (const step of Array.isArray(identity?.steps) ? identity.steps : []) ensureMapped(executionStepStateIdMap, step?.id);
          for (const checkpoint of Array.isArray(identity?.checkpoints) ? identity.checkpoints : []) ensureMapped(executionCheckpointStateIdMap, checkpoint?.id);
          ensureMapped(executionProgressStateIdMap, identity?.progress?.id);
          ensureMapped(executionCompletionStateIdMap, identity?.completion?.id);
        }
        for (const entry of progress) {
          if (entry.kind !== "PATTERN_EXECUTION_RUNTIME") continue;
          const identity = entry.state?.sourceIdentity?.chain;
          const ensureMapped = (map, value) => { if (value && !map.has(value)) map.set(value, uuidv7()); };
          ensureMapped(executionResultStateIdMap, entry.state?.sourceResultId || entry.state?.sourceIdentity?.result?.id);
          ensureMapped(executionPlanStateIdMap, entry.state?.sourcePlanId || identity?.plan?.id);
          ensureMapped(executionSessionStateIdMap, entry.state?.sourceExecutionId || identity?.session?.id);
          for (const step of Array.isArray(identity?.steps) ? identity.steps : []) ensureMapped(executionStepStateIdMap, step?.id);
          for (const checkpoint of Array.isArray(identity?.checkpoints) ? identity.checkpoints : []) ensureMapped(executionCheckpointStateIdMap, checkpoint?.id);
          ensureMapped(executionProgressStateIdMap, identity?.progress?.id);
          ensureMapped(executionCompletionStateIdMap, identity?.completion?.id);
        }
        for (const entry of progress) {
          if (entry.kind !== "PATTERN_EXECUTION_MONITORING") continue;
          const identity = entry.state?.sourceIdentity;
          const ensureMapped = (map, value) => { if (value && !map.has(value)) map.set(value, uuidv7()); };
          ensureMapped(executionRuntimeStateIdMap, identity?.runtime?.id);
          ensureMapped(executionResultStateIdMap, identity?.result?.id);
          ensureMapped(executionPlanStateIdMap, identity?.executionPlanIdentity?.id);
          ensureMapped(executionSessionStateIdMap, identity?.sessionIdentity?.id);
          ensureMapped(executionProgressStateIdMap, identity?.progressIdentity?.id);
          ensureMapped(executionCompletionStateIdMap, identity?.completionIdentity?.id);
          for (const step of Array.isArray(identity?.stepIdentities) ? identity.stepIdentities : []) ensureMapped(executionStepStateIdMap, step?.id);
          for (const checkpoint of Array.isArray(identity?.checkpointIdentities) ? identity.checkpointIdentities : []) ensureMapped(executionCheckpointStateIdMap, checkpoint?.id);
          for (const item of [...(Array.isArray(entry.state?.blockers) ? entry.state.blockers : []), ...(Array.isArray(entry.state?.warnings) ? entry.state.warnings : []), ...(Array.isArray(entry.state?.timeline) ? entry.state.timeline : [])]) {
            ensureMapped(executionRuntimeActionIdMap, item?.relatedActionId || item?.actionId);
            ensureMapped(executionStepStateIdMap, item?.relatedStepId || item?.stepId);
            ensureMapped(executionCheckpointStateIdMap, item?.checkpointId);
          }
        }
        for (const entry of progress) {
          if (entry.kind !== "PATTERN_EXECUTION_INTERVENTION") continue;
          const identity = entry.state?.sourceIdentity;
          const ensureMapped = (map, value) => { if (value && !map.has(value)) map.set(value, uuidv7()); };
          ensureMapped(executionMonitoringStateIdMap, identity?.monitoring?.id);
          ensureMapped(executionRuntimeStateIdMap, identity?.runtime?.id);
          ensureMapped(executionResultStateIdMap, identity?.result?.id);
          ensureMapped(executionPlanStateIdMap, identity?.executionPlanIdentity?.id);
          ensureMapped(executionSessionStateIdMap, identity?.sessionIdentity?.id);
          ensureMapped(executionProgressStateIdMap, identity?.progressIdentity?.id);
          ensureMapped(executionCompletionStateIdMap, identity?.completionIdentity?.id);
          for (const step of Array.isArray(identity?.stepIdentities) ? identity.stepIdentities : []) ensureMapped(executionStepStateIdMap, step?.id);
          for (const checkpoint of Array.isArray(identity?.checkpointIdentities) ? identity.checkpointIdentities : []) ensureMapped(executionCheckpointStateIdMap, checkpoint?.id);
          for (const item of [...(Array.isArray(entry.state?.observations) ? entry.state.observations : []), ...(Array.isArray(entry.state?.actions) ? entry.state.actions : [])]) {
            ensureMapped(executionRuntimeActionIdMap, item?.relatedActionId || item?.targetIdentity?.actionId);
            ensureMapped(executionStepStateIdMap, item?.relatedStepId || item?.targetIdentity?.stepId);
            ensureMapped(executionCheckpointStateIdMap, item?.relatedCheckpointId || item?.targetIdentity?.checkpointId);
          }
        }
        for (const entry of progress) {
          if (entry.kind !== "PATTERN_EXECUTION_ACTION") continue;
          const identity = entry.state?.sourceIdentity || {};
          const ensureMapped = (map, value) => { if (value && !map.has(value)) map.set(value, uuidv7()); };
          ensureMapped(executionInterventionStateIdMap, entry.state?.interventionIdentity?.id);
          ensureMapped(executionMonitoringStateIdMap, identity?.monitoring?.id);
          ensureMapped(executionRuntimeStateIdMap, identity?.runtime?.id);
          ensureMapped(executionResultStateIdMap, identity?.result?.id);
          ensureMapped(executionPlanStateIdMap, identity?.executionPlanIdentity?.id);
          ensureMapped(executionSessionStateIdMap, identity?.sessionIdentity?.id);
          ensureMapped(executionProgressStateIdMap, identity?.progressIdentity?.id);
          ensureMapped(executionCompletionStateIdMap, identity?.completionIdentity?.id);
          for (const step of Array.isArray(identity?.stepIdentities) ? identity.stepIdentities : []) ensureMapped(executionStepStateIdMap, step?.id);
          for (const checkpoint of Array.isArray(identity?.checkpointIdentities) ? identity.checkpointIdentities : []) ensureMapped(executionCheckpointStateIdMap, checkpoint?.id);
          ensureMapped(executionRuntimeActionIdMap, entry.state?.targetIdentity?.actionId);
          ensureMapped(executionStepStateIdMap, entry.state?.targetIdentity?.stepId);
          ensureMapped(executionCheckpointStateIdMap, entry.state?.targetIdentity?.checkpointId);
        }
        for (const entry of progress) {
          if (entry.kind !== "PATTERN_EXECUTION_EVIDENCE") continue;
          const identity = entry.state?.sourceIdentities || {};
          const ensureMapped = (map, value) => { if (value && !map.has(value)) map.set(value, uuidv7()); };
          ensureMapped(executionActionStateIdMap, entry.state?.actionId || identity.action?.id);
          ensureMapped(executionAttemptIdMap, entry.state?.actionAttemptId || identity.actionAttempt?.id);
          ensureMapped(executionInterventionStateIdMap, entry.state?.interventionId || identity.intervention?.id);
          ensureMapped(executionRuntimeStateIdMap, entry.state?.runtimeId || identity.runtime?.id);
          ensureMapped(executionMonitoringStateIdMap, entry.state?.monitoringId || identity.monitoring?.id);
          ensureMapped(executionResultStateIdMap, entry.state?.resultId || identity.result?.id);
          ensureMapped(executionPlanStateIdMap, identity.plan?.id);
          ensureMapped(executionSessionStateIdMap, identity.session?.id);
          ensureMapped(executionProgressStateIdMap, identity.progress?.id);
          ensureMapped(executionCompletionStateIdMap, identity.completion?.id);
          for (const step of Array.isArray(identity.steps) ? identity.steps : []) ensureMapped(executionStepStateIdMap, step?.id);
          for (const checkpoint of Array.isArray(identity.checkpoints) ? identity.checkpoints : []) ensureMapped(executionCheckpointStateIdMap, checkpoint?.id);
        }
        for (const entry of progress) {
          if (entry.kind !== "PATTERN_EXECUTION_VERIFICATION") continue;
          const ensureMapped = (map, value) => { if (value && !map.has(value)) map.set(value, uuidv7()); };
          ensureMapped(executionActionStateIdMap, entry.state?.actionId);
          for (const id of Array.isArray(entry.state?.evidenceIds) ? entry.state.evidenceIds : []) ensureMapped(executionEvidenceStateIdMap, id);
          for (const result of Array.isArray(entry.state?.criterionResults) ? entry.state.criterionResults : []) {
            for (const id of [...(result.supportingEvidenceIds || []), ...(result.conflictingEvidenceIds || [])]) ensureMapped(executionEvidenceItemIdMap, id);
          }
        }
      }
      const importedProgress = progress.map((entry) => {
        if (
          entry.project_id !== sourceProjectId ||
          !isUuidv7(entry.progress_id) ||
          !SUPPORTED_CALCULATION_PROGRESS_KINDS.includes(entry.kind)
        ) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_PROGRESS",
            "Файл содержит повреждённый прогресс проекта.",
          );
        }
        const progressId = collision ? uuidv7() : entry.progress_id;
        progressMap.set(entry.progress_id, progressId);
        const importedState = clone(entry.state);
        if (entry.kind === "PATTERN_ANALYSIS_REVIEW") {
          validateImportedPatternAnalysisReview(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_TECHNOLOGY_DRAFT") {
          validateImportedPatternTechnologyDraft(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_TECHNOLOGY_REVIEW") {
          validateImportedPatternTechnologyReview(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_PLAN") {
          validateImportedPatternExecutionPlan(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_SESSION") {
          validateImportedPatternExecutionSession(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_STEP") {
          validateImportedPatternExecutionStep(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_CHECKPOINT") {
          validateImportedPatternExecutionCheckpoint(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_PROGRESS") {
          validateImportedPatternExecutionProgress(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_COMPLETION") {
          validateImportedPatternExecutionCompletion(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_RESULT") {
          validateImportedPatternExecutionResult(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_RUNTIME") {
          validateImportedPatternExecutionRuntime(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_MONITORING") {
          validateImportedPatternExecutionMonitoring(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_INTERVENTION") {
          validateImportedPatternExecutionIntervention(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_ACTION") {
          validateImportedPatternExecutionAction(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_EVIDENCE") {
          validateImportedPatternExecutionEvidence(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_VERIFICATION") {
          validateImportedPatternExecutionVerification(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_DECISION") {
          validateImportedPatternExecutionDecision(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_FOLLOW_UP") {
          validateImportedPatternExecutionFollowUp(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_RETROSPECTIVE") {
          validateImportedPatternExecutionRetrospective(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_LEARNING") {
          validateImportedPatternExecutionLearning(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_ADAPTATION") {
          validateImportedPatternExecutionAdaptation(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_ADAPTATION_VALIDATION") {
          validateImportedPatternExecutionAdaptationValidation(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_ADAPTATION_PROMOTION") {
          validateImportedPatternExecutionAdaptationPromotion(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_ADAPTATION_ROLLOUT") {
          validateImportedPatternExecutionAdaptationRollout(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION") {
          validateImportedPatternExecutionAdaptationRolloutEvaluation(importedState, sourceProjectId);
        }
        if (entry.kind === "PATTERN_EXECUTION_ADAPTATION_CLOSURE") {
          validateImportedPatternExecutionAdaptationClosure(importedState, sourceProjectId);
        }
        if (
          collision &&
          entry.kind !== "PATTERN_EXECUTION_INTERVENTION" &&
          entry.kind !== "PATTERN_EXECUTION_ACTION" &&
          entry.kind !== "PATTERN_EXECUTION_EVIDENCE" &&
          entry.kind !== "PATTERN_EXECUTION_VERIFICATION" &&
          entry.kind !== "PATTERN_EXECUTION_DECISION" &&
          entry.kind !== "PATTERN_EXECUTION_FOLLOW_UP" &&
          entry.kind !== "PATTERN_EXECUTION_RETROSPECTIVE" &&
          entry.kind !== "PATTERN_EXECUTION_LEARNING" &&
          entry.kind !== "PATTERN_EXECUTION_ADAPTATION" &&
          entry.kind !== "PATTERN_EXECUTION_ADAPTATION_VALIDATION" &&
          entry.kind !== "PATTERN_EXECUTION_ADAPTATION_PROMOTION" &&
          entry.kind !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT" &&
          entry.kind !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION" &&
          entry.kind !== "PATTERN_EXECUTION_ADAPTATION_CLOSURE" &&
          importedState?.projectId === sourceProjectId
        ) {
          importedState.projectId = projectId;
        }
        if (collision && entry.kind === "PATTERN_SEMANTIC_ANALYSIS" && importedState?.id) {
          importedState.id = semanticStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_ANALYSIS_REVIEW" && importedState?.id) {
          importedState.id = reviewStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_TECHNOLOGY_DRAFT" && importedState?.id) {
          importedState.id = technologyStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_TECHNOLOGY_REVIEW" && importedState?.id) {
          importedState.id = technologyReviewStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_EXECUTION_PLAN" && importedState?.id) {
          importedState.id = executionPlanStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_EXECUTION_SESSION" && importedState?.id) {
          importedState.id = executionSessionStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_EXECUTION_STEP" && importedState?.id) {
          importedState.id = executionStepStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_EXECUTION_CHECKPOINT" && importedState?.id) {
          importedState.id = executionCheckpointStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_EXECUTION_PROGRESS" && importedState?.id) {
          importedState.id = executionProgressStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_EXECUTION_COMPLETION" && importedState?.id) {
          importedState.id = executionCompletionStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_EXECUTION_RESULT" && importedState?.id) {
          importedState.id = executionResultStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_EXECUTION_RUNTIME" && importedState?.id) {
          importedState.id = executionRuntimeStateIdMap.get(importedState.id);
        }
        if (collision && entry.kind === "PATTERN_EXECUTION_MONITORING" && importedState?.id) {
          importedState.id = executionMonitoringStateIdMap.get(importedState.id);
        }
        return {
          ...entry,
          progress_id: progressId,
          project_id: projectId,
          calculation_id: collision
            ? calculationMap.get(entry.calculation_id)
            : entry.calculation_id,
          partition_key: PARTITION_KEY,
          state: importedState,
        };
      });
      const timestamp = utcNow();
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_CONTENT_EXTRACTION") return;
        const sourceImportId = progressMap.get(entry.state?.sourceImportId);
        const sourceAnalysisId = progressMap.get(entry.state?.sourceAnalysisId);
        if (!sourceImportId || !sourceAnalysisId) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_REFERENCE",
            "Запись извлечения ссылается на отсутствующий импорт или анализ.",
          );
        }
        entry.state.sourceImportId = sourceImportId;
        entry.state.sourceAnalysisId = sourceAnalysisId;
        entry.state.status = "failed";
        entry.state.revision = Math.max(1, Number(entry.state.revision) || 1) + 1;
        entry.state.updatedAt = timestamp;
        entry.state.startedAt = entry.state.startedAt || timestamp;
        entry.state.completedAt = timestamp;
        entry.state.processedFilesCount = 0;
        entry.state.successfulFilesCount = 0;
        entry.state.unsupportedFilesCount = 0;
        entry.state.failedFilesCount = 0;
        entry.state.error = {
          code: "file_blob_missing",
          message: "Бинарные материалы не входят в экспорт; добавьте исходные файлы локально и повторите извлечение.",
        };
        entry.state.result = {
          schemaVersion: 1,
          files: [],
          combinedText: "",
          warnings: [
            {
              code: "file_blob_missing",
              message: "Бинарные материалы не были перенесены вместе с проектом.",
            },
          ],
        };
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_SEMANTIC_ANALYSIS") return;
        const remappedExtractionId = progressMap.get(entry.state?.sourceExtractionId);
        const sourceExtraction = importedProgress.find(
          (candidate) =>
            candidate.progress_id === remappedExtractionId &&
            candidate.kind === "PATTERN_CONTENT_EXTRACTION" &&
            candidate.calculation_id === entry.calculation_id,
        );
        entry.state.sourceExtractionId = sourceExtraction
          ? sourceExtraction.progress_id
          : collision
            ? uuidv7()
            : entry.state.sourceExtractionId;
        const code = sourceExtraction
          ? "SEMANTIC_SOURCE_REVISION_MISMATCH"
          : "SEMANTIC_SOURCE_REVISION_MISMATCH";
        const message = sourceExtraction
          ? "Связанный extraction требует повторного извлечения после импорта; завершённый семантический анализ больше не считается актуальным."
          : "Связанный extraction отсутствует в импортированном проекте.";
        entry.state.status = "failed";
        entry.state.revision = Math.max(1, Number(entry.state.revision) || 1) + 1;
        entry.state.updatedAt = timestamp;
        entry.state.startedAt = entry.state.startedAt || timestamp;
        entry.state.completedAt = null;
        entry.state.failedAt = timestamp;
        entry.state.result = entry.state.result && typeof entry.state.result === "object"
          ? entry.state.result
          : {};
        entry.state.result.diagnostics = Array.isArray(entry.state.result.diagnostics)
          ? entry.state.result.diagnostics.filter(
              (diagnostic) => diagnostic?.code !== code,
            )
          : [];
        entry.state.result.diagnostics.push({
          code,
          severity: "error",
          message,
          sourceFileId: null,
          start: null,
          end: null,
        });
        entry.state.warnings = Array.isArray(entry.state.warnings)
          ? entry.state.warnings
          : [];
        entry.state.errors = [{
          code,
          message,
          sourceFileId: null,
          start: null,
          end: null,
        }];
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_ANALYSIS_REVIEW") return;
        const originalSourceId = entry.state?.sourceSemanticAnalysisId;
        if (collision && semanticStateIdMap.has(originalSourceId)) {
          entry.state.sourceSemanticAnalysisId = semanticStateIdMap.get(originalSourceId);
        }
        const sourceSemantic = importedProgress.find(
          (candidate) =>
            candidate.kind === "PATTERN_SEMANTIC_ANALYSIS" &&
            candidate.calculation_id === entry.calculation_id &&
            candidate.state?.id === entry.state?.sourceSemanticAnalysisId,
        );
        if (!sourceSemantic) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_REFERENCE",
            "Импортируемая проверка ссылается на отсутствующий семантический анализ.",
          );
        }
        const sourceMatches =
          entry.state.sourceSemanticAnalysisRevision === sourceSemantic.state.revision &&
          entry.state.sourceSemanticFingerprint === semanticReviewFingerprint(sourceSemantic.state) &&
          entry.state.sourceContentExtractionRevision === sourceSemantic.state.sourceExtractionRevision &&
          entry.state.sourceImportRevision === sourceSemantic.state.sourceImportRevision;
        if (collision) {
          if (entry.state.originalSnapshot) {
            entry.state.originalSnapshot.projectId = projectId;
            entry.state.originalSnapshotFingerprint = fnv1a32Fingerprint(entry.state.originalSnapshot);
          }
          if (entry.state.reviewedData) {
            entry.state.reviewedData.projectId = projectId;
            entry.state.reviewedData.items.forEach((item) => { item.projectId = projectId; });
          }
          if (entry.state.confirmedSnapshot) entry.state.confirmedSnapshot.projectId = projectId;
          if (Array.isArray(entry.state.auditSnapshots)) {
            entry.state.auditSnapshots.forEach((snapshot) => {
              if (snapshot.reviewedData) {
                snapshot.reviewedData.projectId = projectId;
                snapshot.reviewedData.items?.forEach((item) => { item.projectId = projectId; });
              }
            });
          }
        }
        if (!sourceMatches || sourceSemantic.state.status !== "completed") {
          entry.state.status = "needs_attention";
          entry.state.revision = Math.max(1, Number(entry.state.revision) || 1) + 1;
          entry.state.updatedAt = timestamp;
          entry.state.confirmedAt = null;
          entry.state.confirmedSnapshot = null;
          entry.state.operation = null;
          entry.state.lastError = { code: sourceMatches ? "REVIEW_SOURCE_REVISION_STALE" : "REVIEW_SOURCE_FINGERPRINT_STALE" };
          entry.state.validation = entry.state.validation && typeof entry.state.validation === "object"
            ? entry.state.validation
            : {};
          entry.state.validation.isValid = false;
          entry.state.validation.canConfirm = false;
          entry.state.validation.validatedAt = timestamp;
          entry.state.validation.errors = [{ code: entry.state.lastError.code, itemId: null, conflictId: null }];
        }
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_TECHNOLOGY_DRAFT") return;
        const state = entry.state;
        if (collision) {
          state.sourceReviewId = reviewStateIdMap.get(state.sourceReviewId) ?? state.sourceReviewId;
          state.sourceSemanticAnalysisId = semanticStateIdMap.get(state.sourceSemanticAnalysisId) ?? state.sourceSemanticAnalysisId;
          state.sourceProjectId = projectId;
          if (state.immutableSourceSnapshot) {
            state.immutableSourceSnapshot.projectId = projectId;
            state.immutableSourceSnapshot.sourceSemanticAnalysisId = semanticStateIdMap.get(state.immutableSourceSnapshot.sourceSemanticAnalysisId) ?? state.immutableSourceSnapshot.sourceSemanticAnalysisId;
          }
          if (state.draftResult?.projectSummary) state.draftResult.projectSummary.projectId = projectId;
          for (const provenance of state.draftResult?.provenance || []) {
            provenance.sourceProjectId = projectId;
            if (provenance.sourceReviewId) provenance.sourceReviewId = reviewStateIdMap.get(provenance.sourceReviewId) ?? provenance.sourceReviewId;
            provenance.sourceSemanticAnalysisId = semanticStateIdMap.get(provenance.sourceSemanticAnalysisId) ?? provenance.sourceSemanticAnalysisId;
          }
          for (const audit of state.audit || []) {
            if (audit.previousSourceIdentity) {
              audit.previousSourceIdentity.projectId = projectId;
              audit.previousSourceIdentity.sourceReviewId = reviewStateIdMap.get(audit.previousSourceIdentity.sourceReviewId) ?? audit.previousSourceIdentity.sourceReviewId;
              audit.previousSourceIdentity.sourceSemanticAnalysisId = semanticStateIdMap.get(audit.previousSourceIdentity.sourceSemanticAnalysisId) ?? audit.previousSourceIdentity.sourceSemanticAnalysisId;
            }
            if (audit.previousResult?.projectSummary) audit.previousResult.projectSummary.projectId = projectId;
            for (const provenance of audit.previousResult?.provenance || []) {
              provenance.sourceProjectId = projectId;
              if (provenance.sourceReviewId) provenance.sourceReviewId = reviewStateIdMap.get(provenance.sourceReviewId) ?? provenance.sourceReviewId;
              provenance.sourceSemanticAnalysisId = semanticStateIdMap.get(provenance.sourceSemanticAnalysisId) ?? provenance.sourceSemanticAnalysisId;
            }
          }
          state.immutableSourceFingerprint = fnv1a32Fingerprint(state.immutableSourceSnapshot);
          state.sourceConfirmedFingerprint = state.immutableSourceFingerprint;
          if (state.draftResult) state.draftFingerprint = fnv1a32Fingerprint(state.draftResult);
        }
        const sourceReview = importedProgress.find(
          (candidate) =>
            candidate.kind === "PATTERN_ANALYSIS_REVIEW" &&
            candidate.calculation_id === entry.calculation_id &&
            candidate.state?.id === state.sourceReviewId,
        );
        if (!sourceReview) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_REFERENCE",
            "Импортируемый черновик ссылается на отсутствующую проверку Stage 19.",
          );
        }
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp;
        state.operation = null;
        state.lastError = { code: "IMPORT_SOURCE_IDENTITY_UNPROVEN" };
        state.status = state.draftResult ? "needs_attention" : "waiting";
        state.validation = state.validation && typeof state.validation === "object" ? state.validation : {};
        state.validation.isValid = false;
        state.validation.canBecomeReady = false;
        state.validation.validatedAt = timestamp;
        state.validation.validatedRevision = state.revision;
        state.validation.errors = [{ code: "IMPORT_SOURCE_IDENTITY_UNPROVEN", entityId: null, level: "critical" }];
        state.validation.criticalIssueCodes = ["IMPORT_SOURCE_IDENTITY_UNPROVEN"];
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), {
          auditId: uuidv7(), type: "import_remap", at: timestamp,
          revision: state.revision, collision,
          sourceProjectId, projectId,
        }].slice(-24);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_TECHNOLOGY_REVIEW") return;
        const state = entry.state;
        const originalDraftProgressId = state.sourceDraftProgressId;
        const remappedDraftProgressId = progressMap.get(originalDraftProgressId) ?? originalDraftProgressId;
        const sourceDraft = importedProgress.find(
          (candidate) =>
            candidate.kind === "PATTERN_TECHNOLOGY_DRAFT" &&
            candidate.calculation_id === entry.calculation_id &&
            candidate.progress_id === remappedDraftProgressId,
        );
        if (!sourceDraft) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_REFERENCE",
            "Импортируемая проверка технологии ссылается на отсутствующий Stage 20.",
          );
        }
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId],
            ...progressMap.entries(),
            ...semanticStateIdMap.entries(),
            ...reviewStateIdMap.entries(),
            ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(),
            ...executionPlanStateIdMap.entries(),
          ]);
          remapExactReferences(state, referenceMap);
          state.projectId = projectId;
        }
        state.sourceDraftProgressId = sourceDraft.progress_id;
        state.immutableSourceSnapshot.sourceDraftIdentity.progressId = sourceDraft.progress_id;
        state.immutableSourceSnapshotFingerprint = fnv1a32Fingerprint(state.immutableSourceSnapshot);
        state.sourceDraftFingerprint = fnv1a32Fingerprint(state.immutableSourceSnapshot.structuredDraft);
        state.sourceValidationFingerprint = fnv1a32Fingerprint(state.immutableSourceSnapshot.validation);
        if (state.confirmedSnapshot) {
          const payload = clone(state.confirmedSnapshot);
          delete payload.confirmedSnapshotFingerprint;
          state.confirmedSnapshotFingerprint = fnv1a32Fingerprint(payload);
          state.confirmedSnapshot.confirmedSnapshotFingerprint = state.confirmedSnapshotFingerprint;
        }
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp;
        state.status = "stale";
        state.lastError = { code: "IMPORT_SOURCE_IDENTITY_UNPROVEN" };
        if (state.reviewState) state.reviewState.operation = null;
        state.validation = state.validation && typeof state.validation === "object" ? state.validation : {};
        state.validation.isValid = false;
        state.validation.canConfirm = false;
        state.validation.validatedAt = timestamp;
        state.validation.validatedRevision = state.revision;
        state.validation.critical = [{ code: "IMPORT_SOURCE_IDENTITY_UNPROVEN", targetId: null, level: "critical" }];
        state.validation.errors = clone(state.validation.critical);
        const importAudit = [{
          auditId: uuidv7(), type: "imported", at: timestamp,
          revision: state.revision, sourceProjectId, projectId,
        }];
        if (collision) importAudit.push({
          auditId: uuidv7(), type: "collision_remapped", at: timestamp,
          revision: state.revision, sourceProjectId, projectId,
          sourceDraftProgressId: state.sourceDraftProgressId,
        });
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), ...importAudit].slice(-24);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_PLAN") return;
        const state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId],
            ...progressMap.entries(),
            ...semanticStateIdMap.entries(),
            ...reviewStateIdMap.entries(),
            ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(),
            ...executionPlanStateIdMap.entries(),
          ]);
          remapExactReferences(state, referenceMap);
          state.projectId = projectId;
        }
        const sourceTechnologyReview = importedProgress.find(
          (candidate) =>
            candidate.kind === "PATTERN_TECHNOLOGY_REVIEW" &&
            candidate.calculation_id === entry.calculation_id &&
            candidate.state?.id === state.sourceTechnologyReviewId,
        );
        const sourceTechnologyDraft = importedProgress.find(
          (candidate) =>
            candidate.kind === "PATTERN_TECHNOLOGY_DRAFT" &&
            candidate.calculation_id === entry.calculation_id &&
            candidate.state?.id === state.sourceTechnologyDraftId,
        );
        const sourceAnalysisReview = importedProgress.find(
          (candidate) =>
            candidate.kind === "PATTERN_ANALYSIS_REVIEW" &&
            candidate.calculation_id === entry.calculation_id &&
            candidate.state?.id === state.sourceAnalysisReviewId,
        );
        const sourceSemantic = importedProgress.find(
          (candidate) =>
            candidate.kind === "PATTERN_SEMANTIC_ANALYSIS" &&
            candidate.calculation_id === entry.calculation_id &&
            candidate.state?.id === state.sourceSemanticAnalysisId,
        );
        if (!sourceTechnologyReview || !sourceTechnologyDraft || !sourceAnalysisReview || !sourceSemantic) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_REFERENCE",
            "Импортируемый план ссылается на отсутствующий Stage 21/20/19/18.",
          );
        }
        state.sourceTechnologyReviewId = sourceTechnologyReview.state.id;
        state.sourceTechnologyReviewRevision = sourceTechnologyReview.state.revision;
        state.sourceTechnologyReviewFingerprint = patternTechnologyReviewIdentityFingerprint(sourceTechnologyReview.state);
        state.sourceConfirmedSnapshotFingerprint = sourceTechnologyReview.state.confirmedSnapshotFingerprint;
        state.sourceTechnologyDraftId = sourceTechnologyDraft.state.id;
        state.sourceTechnologyDraftRevision = sourceTechnologyDraft.state.revision;
        state.sourceTechnologyDraftFingerprint = sourceTechnologyDraft.state.draftFingerprint;
        state.sourceAnalysisReviewId = sourceAnalysisReview.state.id;
        state.sourceAnalysisReviewRevision = sourceAnalysisReview.state.revision;
        state.sourceAnalysisReviewFingerprint = fnv1a32Fingerprint({
          id: state.sourceAnalysisReviewId,
          revision: state.sourceAnalysisReviewRevision,
          projectId,
        });
        state.sourceSemanticAnalysisId = sourceSemantic.state.id;
        state.sourceSemanticAnalysisRevision = sourceSemantic.state.revision;
        state.sourceImportRevision = sourceSemantic.state.sourceImportRevision;
        state.sourceSemanticAnalysisFingerprint = fnv1a32Fingerprint({
          id: state.sourceSemanticAnalysisId,
          revision: state.sourceSemanticAnalysisRevision,
          projectId,
          sourceImportRevision: state.sourceImportRevision,
        });
        state.sourceAlgorithmVersion = sourceTechnologyDraft.state.algorithmVersion;
        state.planningInputFingerprint = patternExecutionPlanningInputFingerprint(state);
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp;
        state.status = "stale";
        state.error = {
          code: "IMPORT_SOURCE_IDENTITY_UNPROVEN",
          message: "После импорта identity источника должна быть подтверждена повторным построением.",
        };
        state.interruptedOperation = null;
        const importBlockerBase = {
          code: "IMPORT_SOURCE_IDENTITY_UNPROVEN",
          severity: "critical",
          message: "После импорта identity Stage 21/20/19/18 не считается доказанной.",
          relatedPhaseIds: [], relatedComponentIds: [], sourceTargetIds: [],
          details: { collision },
        };
        const importBlocker = {
          id: `blocker:${fnv1a32Fingerprint(importBlockerBase).slice(8)}`,
          ...importBlockerBase,
        };
        state.blockers = [
          ...(Array.isArray(state.blockers) ? state.blockers.filter((item) => item?.code !== importBlocker.code) : []),
          importBlocker,
        ].sort((left, right) => left.code < right.code ? -1 : left.code > right.code ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
        if (state.plan?.firstAction) {
          state.plan.firstAction.ready = false;
          state.plan.firstAction.blockedBy = [...new Set([...(state.plan.firstAction.blockedBy || []), importBlocker.id])].sort();
        }
        state.validation = state.validation && typeof state.validation === "object" ? state.validation : {};
        state.validation.isValid = false;
        state.validation.validatedAt = timestamp;
        state.validation.validatedRevision = state.revision;
        state.validation.source = [{ code: importBlocker.code, severity: "critical", message: importBlocker.message, relatedPhaseIds: [], relatedComponentIds: [], details: importBlocker.details }];
        state.validation.diagnostics = [
          ...(Array.isArray(state.validation.structural) ? state.validation.structural : []),
          ...(Array.isArray(state.validation.semantic) ? state.validation.semantic : []),
          ...state.validation.source,
        ];
        if (state.plan) {
          state.planFingerprint = patternExecutionPlanFingerprint(state);
          state.plan.planFingerprint = state.planFingerprint;
        }
        const importAudit = {
          auditId: uuidv7(), type: "IMPORT_IDENTITY_UNPROVEN", at: timestamp,
          revision: state.revision, projectId, collision,
          previousPlanFingerprint: state.planFingerprint,
        };
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), importAudit].slice(-24);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_SESSION") return;
        const state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId],
            ...progressMap.entries(),
            ...semanticStateIdMap.entries(),
            ...reviewStateIdMap.entries(),
            ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(),
            ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(),
            ...executionStepStateIdMap.entries(),
          ]);
          remapExactReferences(state, referenceMap);
          state.projectId = projectId;
        }
        const sourceExecutionPlan = importedProgress.find(
          (candidate) =>
            candidate.kind === "PATTERN_EXECUTION_PLAN" &&
            candidate.calculation_id === entry.calculation_id &&
            candidate.state?.id === state.sourceExecutionPlanId,
        );
        if (!sourceExecutionPlan) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_EXECUTION_SESSION_REFERENCE",
            "Импортируемая сессия ссылается на отсутствующий Stage 22.",
          );
        }
        if (state.planSnapshot) {
          state.planSnapshot.snapshotFingerprint = patternExecutionSessionSnapshotFingerprint(state.planSnapshot);
        }
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp;
        state.status = "stale";
        state.interruption = null;
        state.failure = {
          code: "imported_identity_unverifiable",
          message: "После импорта identity Stage 22 должна быть явно подтверждена новой сессией.",
        };
        state.blockers = [
          ...(Array.isArray(state.blockers) ? state.blockers.filter((item) => item?.code !== "imported_identity_unverifiable") : []),
          {
            blockerId: "session:imported_identity_unverifiable",
            code: "imported_identity_unverifiable",
            message: "После импорта продолжение старой сессии запрещено.",
          },
        ];
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), {
          event: "import_marked_stale",
          at: timestamp,
          revision: state.revision,
          reasonCode: "imported_identity_unverifiable",
        }].slice(-24);
        state.sessionFingerprint = patternExecutionSessionFingerprint(state);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_STEP") return;
        const state = entry.state;
        const importedStatus = state.status;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId],
            ...progressMap.entries(),
            ...semanticStateIdMap.entries(),
            ...reviewStateIdMap.entries(),
            ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(),
            ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(),
            ...executionStepStateIdMap.entries(),
          ]);
          remapExactReferences(state, referenceMap);
          state.projectId = projectId;
        }
        const sourceSession = importedProgress.find(
          (candidate) =>
            candidate.kind === "PATTERN_EXECUTION_SESSION" &&
            candidate.calculation_id === entry.calculation_id &&
            candidate.state?.id === state.sourceSessionId,
        );
        const sourcePlan = importedProgress.find(
          (candidate) =>
            candidate.kind === "PATTERN_EXECUTION_PLAN" &&
            candidate.calculation_id === entry.calculation_id &&
            candidate.state?.id === state.sourcePlanId,
        );
        if (!sourceSession || !sourcePlan) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_EXECUTION_STEP_REFERENCE",
            "Импортируемый исполняемый шаг ссылается на отсутствующую сессию или план.",
          );
        }
        if (state.immutableSnapshot) {
          state.immutableSnapshot.snapshotFingerprint = patternExecutionStepSnapshotFingerprint(state.immutableSnapshot);
        }
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp;
        state.status = "stale";
        state.lifecycle = {
          ...(state.lifecycle || {}),
          previousState: importedStatus,
          state: "stale",
        };
        state.staleReason = "imported_identity_unverifiable";
        state.failure = null;
        state.blockers = [{
          code: "imported_identity_unverifiable",
          message: "После импорта identity сессии должна быть подтверждена явно.",
          details: {},
        }];
        state.validation = {
          valid: false,
          errors: [{ code: "imported_identity_unverifiable", severity: "error", details: {} }],
          warnings: [],
          stale: true,
          blockers: clone(state.blockers),
          structural: [],
          semantic: [],
          source: [{ code: "imported_identity_unverifiable", severity: "error", details: {} }],
        };
        const audit = [{
          event: "imported",
          at: timestamp,
          revision: state.revision,
          sourceProjectId,
        }];
        if (collision) audit.push({
          event: "collision_remapped",
          at: timestamp,
          revision: state.revision,
          sourceProjectId,
          projectId,
        });
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), ...audit].slice(-24);
        state.stepFingerprint = patternExecutionStepFingerprint(state);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_CHECKPOINT") return;
        const state = entry.state;
        const importedStatus = state.status;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...progressMap.entries(), ...semanticStateIdMap.entries(),
            ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(), ...technologyReviewStateIdMap.entries(),
            ...executionPlanStateIdMap.entries(), ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(),
          ]);
          remapExactReferences(state, referenceMap);
          state.projectId = projectId;
        }
        const sourceSession = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_SESSION" && candidate.calculation_id === entry.calculation_id && candidate.state?.id === state.sourceSessionId);
        const sourcePlan = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_PLAN" && candidate.calculation_id === entry.calculation_id && candidate.state?.id === state.sourcePlanId);
        const sourceStep = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_STEP" && candidate.calculation_id === entry.calculation_id && candidate.state?.id === state.sourceStepId);
        if (!sourceSession || !sourcePlan || !sourceStep) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_CHECKPOINT_REFERENCE", "Импортируемый Stage 25 ссылается на отсутствующий Stage 22/23/24.");
        if (state.immutableSourceSnapshot) state.immutableSourceSnapshot.snapshotFingerprint = patternExecutionCheckpointSnapshotFingerprint(state.immutableSourceSnapshot);
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp; state.status = "stale";
        state.lifecycle = { ...(state.lifecycle || {}), previousState: importedStatus, state: "stale" };
        state.staleReason = "imported_identity_unverifiable"; state.failure = null;
        state.blockers = [{ code: "imported_identity_unverifiable", message: "После импорта identity Stage 18–24 должна быть доказана явным rebuild.", details: {} }];
        state.synchronization = { ...(state.synchronization || {}), status: "unverified", sessionAcknowledgedAt: null, stepAcknowledgedAt: null, confirmedAt: null };
        state.validation = { valid: false, errors: [{ code: "imported_identity_unverifiable", level: "source", details: {} }], structural: [], semantic: [], source: [{ code: "imported_identity_unverifiable", level: "source", details: {} }], complete: false, matchesExpected: false, stale: true };
        const audit = [{ event: "imported", at: timestamp, revision: state.revision, sourceProjectId }];
        if (collision) audit.push({ event: "collision_remapped", at: timestamp, revision: state.revision, sourceProjectId, projectId });
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), ...audit].slice(-32);
        state.operations = (Array.isArray(state.operations) ? state.operations : []).slice(-96);
        state.checkpointFingerprint = patternExecutionCheckpointFingerprint(state);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_PROGRESS") return;
        const state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
          ]);
          remapExactReferences(state, referenceMap);
          state.projectId = projectId;
        }
        const sourcePlan = importedProgress.find((candidate) =>
          candidate.kind === "PATTERN_EXECUTION_PLAN" && candidate.calculation_id === entry.calculation_id && candidate.state?.id === state.sourcePlanId
        );
        const sourceSession = importedProgress.find((candidate) =>
          candidate.kind === "PATTERN_EXECUTION_SESSION" && candidate.calculation_id === entry.calculation_id && candidate.state?.id === state.sourceSessionId
        );
        const sourceFree = !state.sourcePlanId && !state.sourceSessionId && !state.immutableSnapshot;
        if (sourceFree && ["waiting", "failed"].includes(state.status)) {
          if (collision) {
            state.revision = Math.max(1, Number(state.revision) || 1) + 1;
            state.updatedAt = timestamp;
            state.audit = [...(Array.isArray(state.audit) ? state.audit : []), {
              event: "collision_remapped", at: timestamp, revision: state.revision,
              sourceProjectId, projectId,
            }].slice(-32);
            state.progressFingerprint = patternExecutionProgressFingerprint(state);
          }
          return;
        }
        if (!sourcePlan || !sourceSession) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_EXECUTION_PROGRESS_REFERENCE",
            "Импортируемый агрегированный progress ссылается на отсутствующий Stage 22 или Stage 23.",
          );
        }
        if (state.immutableSnapshot) {
          state.immutableSnapshotFingerprint = patternExecutionProgressSnapshotFingerprint(state.immutableSnapshot);
        }
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp;
        state.status = "stale";
        state.interruptedOperation = null;
        state.failure = null;
        state.staleReasons = [{
          code: "import_identity_unproven",
          message: "После импорта identity Stage 22–25 должна быть доказана явным rebuild.",
          details: { collision },
        }];
        state.blockers = [{
          id: `progress-blocker:${fnv1a32Fingerprint({ code: "import_identity_unproven", collision }).slice(8)}`,
          code: "import_identity_unproven",
          message: "Импортированное агрегированное состояние не считается актуальным.",
          details: { collision },
        }];
        state.nextAction = {
          type: "rebuild_progress",
          label: "Перестроить агрегированный progress",
          allowed: true,
          target: {},
        };
        state.validation = {
          valid: false,
          stale: true,
          structural: [],
          semantic: [],
          source: [{ code: "import_identity_unproven", severity: "error", details: { collision } }],
          errors: [{ code: "import_identity_unproven", severity: "error", details: { collision } }],
        };
        const importAudit = [{ event: "imported_identity_unproven", at: timestamp, revision: state.revision, sourceProjectId, collision }];
        if (collision) importAudit.push({ event: "collision_remapped", at: timestamp, revision: state.revision, sourceProjectId, projectId });
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), ...importAudit].slice(-32);
        state.operations = (Array.isArray(state.operations) ? state.operations : []).slice(-96);
        state.progressFingerprint = patternExecutionProgressFingerprint(state);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_COMPLETION") return;
        const state = entry.state;
        const importedStatus = state.status;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(),
          ]);
          remapExactReferences(state, referenceMap);
          state.projectId = projectId;
        }
        const sourceFree = !state.expectedSourceIdentity && !state.completionSnapshot;
        if (sourceFree && ["waiting", "failed"].includes(state.status)) {
          if (collision) {
            state.revision = Math.max(1, Number(state.revision) || 1) + 1;
            state.updatedAt = timestamp;
            state.audit = [...(Array.isArray(state.audit) ? state.audit : []), {
              event: "collision_import_remap", at: timestamp, revision: state.revision, sourceProjectId, projectId,
            }].slice(-32);
            state.operations = [...(Array.isArray(state.operations) ? state.operations : []), {
              operationId: uuidv7(), type: "collision_import_remap", result: "applied", revision: state.revision, at: timestamp,
            }].slice(-96);
          }
          return;
        }
        if (state.completionSnapshot) {
          state.completionSnapshot.completionFingerprint = patternExecutionCompletionFingerprint(state.completionSnapshot);
          state.completionFingerprint = state.completionSnapshot.completionFingerprint;
        }
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp;
        state.status = "stale";
        state.interruptedOperation = null;
        state.failure = null;
        state.staleReasons = [{
          code: "import_identity_unproven",
          message: "После импорта completion source identity должна быть доказана явным rebuild.",
          details: { collision },
        }];
        state.blockers = [{
          id: `completion-blocker:${fnv1a32Fingerprint({ code: "import_identity_unproven", collision }).slice(8)}`,
          code: "import_identity_unproven",
          message: "Imported completion не считается актуальным до явного rebuild.",
          details: { collision },
        }];
        state.verification = { ...(state.verification || {}), valid: false };
        const importAudit = [{ event: "import", at: timestamp, revision: state.revision, sourceProjectId, previousStatus: importedStatus }];
        if (collision) importAudit.push({ event: "collision_import_remap", at: timestamp, revision: state.revision, sourceProjectId, projectId });
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), ...importAudit].slice(-32);
        const importOperations = [{ operationId: uuidv7(), type: "import", result: "stale", revision: state.revision, at: timestamp }];
        if (collision) importOperations.push({ operationId: uuidv7(), type: "collision_import_remap", result: "applied", revision: state.revision, at: timestamp });
        state.operations = [...(Array.isArray(state.operations) ? state.operations : []), ...importOperations].slice(-96);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_RESULT") return;
        const state = entry.state;
        const importedStatus = state.status;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(),
          ]);
          remapExactReferences(state, referenceMap);
          state.projectId = projectId;
        }
        const sourceFree = !state.expectedSourceIdentity && !state.resultSnapshot;
        if (sourceFree && ["waiting", "failed"].includes(state.status)) {
          if (collision) {
            state.revision = Math.max(1, Number(state.revision) || 1) + 1;
            state.updatedAt = timestamp;
            state.audit = [...(Array.isArray(state.audit) ? state.audit : []), {
              event: "collision_import_remap", at: timestamp, revision: state.revision, sourceProjectId, projectId,
            }].slice(-32);
            state.operations = [...(Array.isArray(state.operations) ? state.operations : []), {
              operationId: uuidv7(), type: "collision_import_remap", result: "applied", revision: state.revision, at: timestamp,
            }].slice(-96);
          }
          return;
        }
        if (state.resultSnapshot) {
          if (state.expectedSourceIdentity) {
            const identityPayload = clone(state.expectedSourceIdentity);
            delete identityPayload.sourceIdentityFingerprint;
            state.expectedSourceIdentity.sourceIdentityFingerprint = fnv1a32Fingerprint(identityPayload);
            state.expectedSourceIdentityFingerprint = state.expectedSourceIdentity.sourceIdentityFingerprint;
          }
          if (state.resultSnapshot.sourceIdentity) {
            const snapshotIdentityPayload = clone(state.resultSnapshot.sourceIdentity);
            delete snapshotIdentityPayload.sourceIdentityFingerprint;
            state.resultSnapshot.sourceIdentity.sourceIdentityFingerprint = fnv1a32Fingerprint(snapshotIdentityPayload);
          }
          state.resultSnapshot.fingerprint = patternExecutionResultFingerprint(state.resultSnapshot);
          state.resultFingerprint = state.resultSnapshot.fingerprint;
          state.resultRevision = state.resultSnapshot.resultRevision;
        }
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp;
        state.status = "stale";
        state.interruptedOperation = null;
        state.failure = null;
        state.staleReasons = [{
          code: "import_identity_unproven",
          message: "После импорта identity итогового результата должна быть доказана явным rebuild.",
          details: { collision },
        }];
        state.blockers = [{
          id: `result-blocker:${fnv1a32Fingerprint({ code: "import_identity_unproven", collision }).slice(8)}`,
          code: "import_identity_unproven",
          message: "Импортированный результат сохранён, но не считается актуальным до явного rebuild.",
          details: { collision },
        }];
        const importAudit = [{ event: "import", at: timestamp, revision: state.revision, sourceProjectId, previousStatus: importedStatus }];
        if (collision) importAudit.push({ event: "collision_import_remap", at: timestamp, revision: state.revision, sourceProjectId, projectId });
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), ...importAudit].slice(-32);
        const importOperations = [{ operationId: uuidv7(), type: "import", result: "stale", revision: state.revision, at: timestamp }];
        if (collision) importOperations.push({ operationId: uuidv7(), type: "collision_import_remap", result: "applied", revision: state.revision, at: timestamp });
        state.operations = [...(Array.isArray(state.operations) ? state.operations : []), ...importOperations].slice(-96);
        validateImportedPatternExecutionResult(state, projectId);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_RUNTIME") return;
        const state = entry.state;
        const importedStatus = state.status;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(),
            ...executionRuntimeStateIdMap.entries(), ...executionMonitoringStateIdMap.entries(), ...executionInterventionStateIdMap.entries(),
            ...executionRuntimeActionIdMap.entries(),
          ]);
          remapExactReferences(state, referenceMap);
          state.projectId = projectId;
        }
        const importedResult = importedProgress.find((candidate) =>
          candidate.kind === "PATTERN_EXECUTION_RESULT" && candidate.state?.id === state.sourceResultId
        )?.state;
        if (!importedResult || !importedResult.resultSnapshot) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_EXECUTION_RUNTIME_SOURCE",
            "Runtime ссылается на отсутствующий snapshot Stage 28.",
          );
        }
        state.sourceResultRevision = importedResult.revision;
        state.sourceResultFingerprint = importedResult.resultFingerprint;
        state.sourceExecutionId = importedResult.resultSnapshot.sessionId;
        state.sourcePlanId = importedResult.resultSnapshot.planSummary?.planId || state.sourcePlanId;
        state.sourceIdentity = {
          sourceSchemaVersion: 1,
          result: {
            id: importedResult.id,
            revision: importedResult.revision,
            fingerprint: importedResult.resultFingerprint,
            resultRevision: importedResult.resultRevision,
            status: importedResult.status,
          },
          chain: clone(importedResult.expectedSourceIdentity || importedResult.resultSnapshot.sourceIdentity),
          sourceIdentityFingerprint: null,
        };
        const runtimeIdentityPayload = clone(state.sourceIdentity);
        delete runtimeIdentityPayload.sourceIdentityFingerprint;
        state.sourceIdentity.sourceIdentityFingerprint = fnv1a32Fingerprint(runtimeIdentityPayload);
        state.actions.forEach((action) => {
          if (action.sourceReference) {
            action.sourceReference.resultId = state.sourceResultId;
            action.sourceReference.resultRevision = state.sourceResultRevision;
          }
          if (action.payload?.resultReference) {
            action.payload.resultReference.id = state.sourceResultId;
            action.payload.resultReference.fingerprint = state.sourceResultFingerprint;
          }
          if (action.state === "running" || action.state === "blocked") action.state = "paused";
          action.fingerprint = patternExecutionRuntimeActionFingerprint(action);
        });
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp;
        state.status = "stale";
        state.activeActionId = null;
        state.recovery = null;
        state.lastError = null;
        state.staleReasons = [{
          code: "import_identity_unproven",
          message: "После импорта runtime source identity должна быть доказана явным rebuild.",
          details: { collision },
        }];
        state.completedActionIds = state.actions.filter((action) => action.state === "completed").map((action) => action.id);
        state.failedActionIds = state.actions.filter((action) => action.state === "failed").map((action) => action.id);
        state.skippedActionIds = state.actions.filter((action) => action.state === "skipped").map((action) => action.id);
        state.blockedActionIds = [];
        const importAudit = [{ event: "imported_identity_unproven", at: timestamp, revision: state.revision, sourceProjectId, previousStatus: importedStatus }];
        if (collision) importAudit.push({ event: "collision_remapped", at: timestamp, revision: state.revision, sourceProjectId, projectId });
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), ...importAudit].slice(-64);
        state.operations = [...(Array.isArray(state.operations) ? state.operations : []), {
          operationId: uuidv7(), command: "import", revision: state.revision, at: timestamp,
        }].slice(-128);
        state.runtimeFingerprint = patternExecutionRuntimeFingerprint(state);
        validateImportedPatternExecutionRuntime(state, projectId);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_MONITORING") return;
        const state = entry.state;
        const previousLifecycle = state.lifecycle.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(),
            ...executionRuntimeStateIdMap.entries(), ...executionMonitoringStateIdMap.entries(), ...executionInterventionStateIdMap.entries(),
            ...executionRuntimeActionIdMap.entries(),
          ]);
          remapExactReferences(state, referenceMap);
          state.projectId = projectId;
        }
        const importedRuntime = importedProgress.find((candidate) =>
          candidate.kind === "PATTERN_EXECUTION_RUNTIME" && candidate.state?.id === state.sourceIdentity?.runtime?.id
        )?.state;
        if (!importedRuntime) {
          throw new ProjectRepositoryError(
            "INVALID_IMPORT_EXECUTION_MONITORING_SOURCE",
            "Monitoring snapshot ссылается на отсутствующий runtime.",
          );
        }
        const importedResult = importedProgress.find((candidate) =>
          candidate.kind === "PATTERN_EXECUTION_RESULT" && candidate.state?.id === importedRuntime.sourceResultId
        )?.state || null;
        const chain = clone(importedRuntime.sourceIdentity?.chain || {});
        state.sourceIdentity = {
          sourceSchemaVersion: 1,
          project: { id: projectId, revision: importedProject.revision },
          result: { id: importedRuntime.sourceResultId, revision: importedRuntime.sourceResultRevision, fingerprint: importedRuntime.sourceResultFingerprint },
          runtime: { id: importedRuntime.id, revision: importedRuntime.revision, epoch: importedRuntime.epoch, fingerprint: importedRuntime.runtimeFingerprint },
          calculationIdentity: clone(chain.calculation || null),
          executionPlanIdentity: clone(chain.plan || null),
          sessionIdentity: clone(chain.session || null),
          runtimeSourceIdentity: clone(importedRuntime.sourceIdentity || null),
          progressIdentity: clone(chain.progress || null),
          completionIdentity: clone(chain.completion || null),
          stepIdentities: Array.isArray(chain.steps) ? clone(chain.steps).sort((left, right) => String(left?.id || "").localeCompare(String(right?.id || ""))) : [],
          checkpointIdentities: Array.isArray(chain.checkpoints) ? clone(chain.checkpoints).sort((left, right) => String(left?.id || "").localeCompare(String(right?.id || ""))) : [],
          importRevision: sourceProject.revision,
          sourceIdentityFingerprint: null,
        };
        state.sourceIdentity.sourceIdentityFingerprint = patternExecutionMonitoringSourceIdentityFingerprint(state.sourceIdentity);
        const importDiagnostic = { code: "import_identity_unproven", severity: "critical", details: { collision } };
        const monitoringApi = global.YarnAIPatternExecutionMonitoring;
        const projection = monitoringApi?.projectRuntime?.(importedRuntime, importedResult, [importDiagnostic]) || null;
        if (projection) {
          state.runtimeSummary = clone(projection.runtimeSummary);
          state.progressSummary = clone(projection.progressSummary);
          state.currentActivity = clone(projection.currentActivity);
          state.blockers = clone(projection.blockers);
          state.warnings = clone(projection.warnings);
          state.diagnostics = clone(projection.diagnostics);
          state.recommendedAction = clone(projection.recommendedAction);
        } else {
          state.runtimeSummary.lifecycle = importedRuntime.status;
          state.runtimeSummary.epoch = importedRuntime.epoch;
          state.runtimeSummary.hasStaleUpstream = true;
          state.runtimeSummary.terminalStatus = "stale";
          state.currentActivity = { actionId: null, stepId: null, checkpointId: null, startedAt: null, pausedAt: null, status: "stale", reason: "import_identity_unproven", safeToResume: false, requiresUserDecision: true };
          state.blockers = [{ code: "import_identity_unproven", severity: "critical", source: "source_identity", messageKey: "monitoring.import_identity_unproven", relatedStepId: null, relatedActionId: null, recoverable: false, recommendedCommand: "rebuild_runtime" }];
          state.diagnostics = [importDiagnostic];
          state.progressSummary.blockedCount = state.blockers.length;
          state.progressSummary.warningCount = state.warnings.length;
          state.recommendedAction = { type: "rebuild_runtime", label: "Пересобрать runtime", reason: "stale:stale:stale", targetRoute: "/pattern-execution-runtime", enabled: true, requiresConfirmation: true, sourceRevision: importedRuntime.revision, targetIdentity: { projectId, runtimeId: importedRuntime.id, resultId: importedRuntime.sourceResultId }, fingerprint: null };
        }
        state.recommendedAction.sourceRevision = importedRuntime.revision;
        state.recommendedAction.targetIdentity = { projectId, runtimeId: importedRuntime.id, resultId: importedRuntime.sourceResultId };
        state.recommendedAction.fingerprint = patternExecutionMonitoringRecommendedActionFingerprint(state.recommendedAction);
        state.timeline = (Array.isArray(state.timeline) ? state.timeline : []).map((item, index) => {
          const projected = { ...item, sequence: index + 1, id: null };
          projected.id = `monitoring-timeline:${patternExecutionMonitoringTimelineFingerprint(projected).slice(8)}`;
          return projected;
        }).slice(-32).map((item, index) => ({ ...item, sequence: index + 1 }));
        state.revision = Math.max(1, Number(state.revision) || 1) + 1;
        state.updatedAt = timestamp;
        state.lifecycle = { state: "stale", previousState: previousLifecycle, observedAt: state.lifecycle.observedAt || timestamp };
        state.lastObservationFingerprint = null;
        const auditBase = { event: "monitoring_imported_stale", revision: state.revision, epoch: state.epoch, at: timestamp, runtimeRevision: importedRuntime.revision, fromLifecycle: previousLifecycle, toLifecycle: "stale", operationId: null, reason: "import_identity_unproven" };
        state.audit = [...(Array.isArray(state.audit) ? state.audit : []), { id: `monitoring-audit:${fnv1a32Fingerprint(auditBase).slice(8)}`, ...auditBase }].slice(-24);
        state.operations = [...(Array.isArray(state.operations) ? state.operations : []), { operationId: uuidv7(), command: "import", revision: state.revision, at: timestamp }].slice(-64);
        state.fingerprint = patternExecutionMonitoringFingerprint(state);
        validateImportedPatternExecutionMonitoring(state, projectId);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_INTERVENTION") return;
        const interventionApi = global.YarnAIPatternExecutionIntervention;
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(),
            ...executionRuntimeStateIdMap.entries(), ...executionMonitoringStateIdMap.entries(),
            ...executionInterventionStateIdMap.entries(), ...executionRuntimeActionIdMap.entries(),
          ]);
          state = interventionApi?.remapPatternExecutionIntervention
            ? clone(interventionApi.remapPatternExecutionIntervention(state, referenceMap))
            : remapImportedPatternExecutionIntervention(state, referenceMap);
        }
        state = interventionApi?.makeImportedInterventionStale
          ? clone(interventionApi.makeImportedInterventionStale(state, { now: timestamp, collision, reason: "import_identity_unproven" }))
          : makeImportedPatternExecutionInterventionStale(state, timestamp, collision);
        entry.state = state;
        validateImportedPatternExecutionIntervention(state, projectId);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_ACTION") return;
        const actionApi = global.YarnAIPatternExecutionAction;
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(),
            ...executionRuntimeStateIdMap.entries(), ...executionMonitoringStateIdMap.entries(),
            ...executionInterventionStateIdMap.entries(), ...executionActionStateIdMap.entries(),
            ...executionRuntimeActionIdMap.entries(), ...executionAttemptIdMap.entries(),
          ]);
          state = actionApi?.remapPatternExecutionAction
            ? clone(actionApi.remapPatternExecutionAction(state, referenceMap))
            : remapImportedPatternExecutionAction(state, referenceMap);
        }
        state = actionApi?.makeImportedPatternExecutionActionStale
          ? clone(actionApi.makeImportedPatternExecutionActionStale(state, { now: timestamp, collision, reason: "import_identity_unproven" }))
          : makeImportedPatternExecutionActionStale(state, timestamp, collision);
        entry.state = state;
        validateImportedPatternExecutionAction(state, projectId);
      });
      importedProgress.forEach((entry, importedIndex) => {
        if (entry.kind !== "PATTERN_EXECUTION_EVIDENCE") return;
        const evidenceApi = global.YarnAIPatternExecutionEvidence;
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(),
            ...executionRuntimeStateIdMap.entries(), ...executionMonitoringStateIdMap.entries(),
            ...executionInterventionStateIdMap.entries(), ...executionActionStateIdMap.entries(),
            ...executionAttemptIdMap.entries(), ...executionRuntimeActionIdMap.entries(),
            ...executionEvidenceStateIdMap.entries(), ...executionEvidenceItemIdMap.entries(),
            ...executionCriterionIdMap.entries(),
          ]);
          const fingerprintFields = ["fingerprint", "runtimeFingerprint", "resultFingerprint"];
          for (let index = 0; index < progress.length; index += 1) {
            const originalState = progress[index]?.state;
            const remappedState = importedProgress[index]?.state;
            if (!originalState || !remappedState) continue;
            for (const field of fingerprintFields) {
              if (originalState[field] && remappedState[field]) referenceMap.set(originalState[field], remappedState[field]);
            }
            if (originalState.decision?.fingerprint && remappedState.decision?.fingerprint) referenceMap.set(originalState.decision.fingerprint, remappedState.decision.fingerprint);
            if (originalState.verification?.fingerprint && remappedState.verification?.fingerprint) referenceMap.set(originalState.verification.fingerprint, remappedState.verification.fingerprint);
          }
          state = evidenceApi?.remapPatternExecutionEvidence
            ? clone(evidenceApi.remapPatternExecutionEvidence(state, referenceMap))
            : remapImportedPatternExecutionEvidence(state, referenceMap);
        }
        state = evidenceApi?.makeImportedPatternExecutionEvidenceStale
          ? clone(evidenceApi.makeImportedPatternExecutionEvidenceStale(state, { now: timestamp, collision, reason: "import_identity_unproven" }))
          : makeImportedPatternExecutionEvidenceStale(state, timestamp, collision);
        entry.state = state;
        validateImportedPatternExecutionEvidence(state, projectId);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_VERIFICATION") return;
        const verificationApi = global.YarnAIPatternExecutionVerification;
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(),
            ...executionRuntimeStateIdMap.entries(), ...executionMonitoringStateIdMap.entries(),
            ...executionInterventionStateIdMap.entries(), ...executionActionStateIdMap.entries(),
            ...executionAttemptIdMap.entries(), ...executionRuntimeActionIdMap.entries(),
            ...executionEvidenceStateIdMap.entries(), ...executionEvidenceItemIdMap.entries(),
            ...executionCriterionIdMap.entries(), ...executionVerificationStateIdMap.entries(),
          ]);
          for (let index = 0; index < progress.length; index += 1) {
            const originalState = progress[index]?.state;
            const remappedState = importedProgress[index]?.state;
            if (originalState?.fingerprint && remappedState?.fingerprint) referenceMap.set(originalState.fingerprint, remappedState.fingerprint);
          }
          state = verificationApi?.remapPatternExecutionVerification
            ? clone(verificationApi.remapPatternExecutionVerification(state, referenceMap))
            : remapImportedPatternExecutionVerification(state, referenceMap);
        }
        const linkedAction = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ACTION" && candidate.state?.id === state.actionId);
        const linkedEvidence = new Set(importedProgress.filter((candidate) => candidate.kind === "PATTERN_EXECUTION_EVIDENCE").map((candidate) => candidate.state?.id));
        if (state.actionId && (!linkedAction || state.evidenceIds.some((id) => !linkedEvidence.has(id)))) {
          throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_VERIFICATION_REFERENCE", "Verification ссылается на отсутствующие action или evidence.");
        }
        state = verificationApi?.makeImportedPatternExecutionVerificationStale
          ? clone(verificationApi.makeImportedPatternExecutionVerificationStale(state, { now: timestamp, collision, reason: "import_identity_unproven" }))
          : makeImportedPatternExecutionVerificationStale(state, timestamp, collision);
        entry.state = state;
        validateImportedPatternExecutionVerification(state, projectId);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_DECISION") return;
        const decisionApi = global.YarnAIPatternExecutionDecision;
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(),
            ...executionRuntimeStateIdMap.entries(), ...executionMonitoringStateIdMap.entries(),
            ...executionInterventionStateIdMap.entries(), ...executionActionStateIdMap.entries(),
            ...executionAttemptIdMap.entries(), ...executionRuntimeActionIdMap.entries(),
            ...executionEvidenceStateIdMap.entries(), ...executionEvidenceItemIdMap.entries(),
            ...executionCriterionIdMap.entries(), ...executionVerificationStateIdMap.entries(),
            ...executionDecisionStateIdMap.entries(), ...executionFollowUpStateIdMap.entries(),
          ]);
          for (let index = 0; index < progress.length; index += 1) {
            const originalState = progress[index]?.state;
            const remappedState = importedProgress[index]?.state;
            if (originalState?.fingerprint && remappedState?.fingerprint) referenceMap.set(originalState.fingerprint, remappedState.fingerprint);
          }
          if (entry.kind === "PATTERN_EXECUTION_VERIFICATION") {
            for (const criterion of Array.isArray(entry.state?.expectedCriteria) ? entry.state.expectedCriteria : []) {
              const criterionId = criterion?.id || criterion?.criterionId;
              if (criterionId && !executionCriterionIdMap.has(criterionId)) executionCriterionIdMap.set(criterionId, uuidv7());
            }
          }
          state = clone(decisionApi.remapPatternExecutionDecision(state, referenceMap));
        }
        const linkedVerification = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_VERIFICATION" && candidate.state?.id === state.verificationId);
        const linkedAction = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ACTION" && candidate.state?.id === state.actionId);
        const linkedEvidenceIds = new Set(importedProgress.filter((candidate) => candidate.kind === "PATTERN_EXECUTION_EVIDENCE").flatMap((candidate) => [candidate.state?.id, ...(candidate.state?.evidenceItems || []).map((item) => item.id)]));
        if (!linkedVerification || !linkedAction || state.evidenceReferences.some((item) => !linkedEvidenceIds.has(item.id))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_DECISION_REFERENCE", "Decision references missing verification, action, or evidence.");
        state = clone(decisionApi.makeImportedPatternExecutionDecisionStale(state, { now: timestamp, collision, reason: "import_identity_unproven" }));
        entry.state = state;
        validateImportedPatternExecutionDecision(state, projectId);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_FOLLOW_UP") return;
        const followUpApi = global.YarnAIPatternExecutionFollowUp;
        if (!followUpApi?.remapPatternExecutionFollowUp || !followUpApi?.makeImportedPatternExecutionFollowUpStale) throw new ProjectRepositoryError("PATTERN_EXECUTION_FOLLOW_UP_API_MISSING", "Execution follow-up module is not loaded.");
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(),
            ...executionRuntimeStateIdMap.entries(), ...executionMonitoringStateIdMap.entries(),
            ...executionInterventionStateIdMap.entries(), ...executionActionStateIdMap.entries(),
            ...executionAttemptIdMap.entries(), ...executionRuntimeActionIdMap.entries(),
            ...executionEvidenceStateIdMap.entries(), ...executionEvidenceItemIdMap.entries(),
            ...executionCriterionIdMap.entries(), ...executionVerificationStateIdMap.entries(),
            ...executionDecisionStateIdMap.entries(), ...executionFollowUpStateIdMap.entries(),
          ]);
          for (let index = 0; index < progress.length; index += 1) {
            const originalState = progress[index]?.state;
            const remappedState = importedProgress[index]?.state;
            if (originalState?.fingerprint && remappedState?.fingerprint) referenceMap.set(originalState.fingerprint, remappedState.fingerprint);
          }
          state = clone(followUpApi.remapPatternExecutionFollowUp(state, referenceMap));
        }
        const linkedDecision = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_DECISION" && candidate.state?.id === state.decisionId);
        const linkedVerification = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_VERIFICATION" && candidate.state?.id === state.verificationReference?.id);
        const linkedActionIds = new Set(importedProgress.filter((candidate) => candidate.kind === "PATTERN_EXECUTION_ACTION").map((candidate) => candidate.state?.id));
        const linkedEvidenceIds = new Set(importedProgress.filter((candidate) => candidate.kind === "PATTERN_EXECUTION_EVIDENCE").flatMap((candidate) => [candidate.state?.id, ...(candidate.state?.evidenceItems || []).map((item) => item.id)]));
        if (!linkedDecision || !linkedVerification || state.actionReferences.some((item) => !linkedActionIds.has(item.id)) || state.evidenceReferences.some((item) => !linkedEvidenceIds.has(item.id))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_FOLLOW_UP_REFERENCE", "Follow-up references missing decision, verification, action, or evidence.");
        state = clone(followUpApi.makeImportedPatternExecutionFollowUpStale(state, { now: timestamp, collision, reason: "import_identity_unproven" }));
        entry.state = state;
        validateImportedPatternExecutionFollowUp(state, projectId);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_RETROSPECTIVE") return;
        const retrospectiveApi = global.YarnAIPatternExecutionRetrospective;
        if (!retrospectiveApi?.remapPatternExecutionRetrospective || !retrospectiveApi?.makeImportedPatternExecutionRetrospectiveStale) throw new ProjectRepositoryError("PATTERN_EXECUTION_RETROSPECTIVE_API_MISSING", "Execution retrospective module is not loaded.");
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(),
            ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(),
            ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(),
            ...executionRuntimeStateIdMap.entries(), ...executionMonitoringStateIdMap.entries(),
            ...executionInterventionStateIdMap.entries(), ...executionActionStateIdMap.entries(),
            ...executionAttemptIdMap.entries(), ...executionRuntimeActionIdMap.entries(),
            ...executionEvidenceStateIdMap.entries(), ...executionEvidenceItemIdMap.entries(),
            ...executionCriterionIdMap.entries(), ...executionVerificationStateIdMap.entries(),
            ...executionDecisionStateIdMap.entries(), ...executionFollowUpStateIdMap.entries(),
          ]);
          for (let index = 0; index < progress.length; index += 1) {
            const originalState = progress[index]?.state;
            const remappedState = importedProgress[index]?.state;
            for (const field of ["fingerprint", "resultFingerprint", "runtimeFingerprint", "identity"]) if (originalState?.[field] && remappedState?.[field]) referenceMap.set(originalState[field], remappedState[field]);
          }
          state = clone(retrospectiveApi.remapPatternExecutionRetrospective(state, referenceMap));
        }
        const linkedResult = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RESULT" && candidate.state?.id === state.sourceResultId);
        const linkedRuntime = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RUNTIME" && candidate.state?.id === state.sourceRuntimeId);
        const linkedFollowUp = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_FOLLOW_UP" && candidate.state?.id === state.sourceFollowUpId);
        if (!linkedResult || !linkedRuntime || !linkedFollowUp) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_RETROSPECTIVE_REFERENCE", "Retrospective references missing critical source records.");
        state = clone(retrospectiveApi.makeImportedPatternExecutionRetrospectiveStale(state, { now: state.updatedAt, collision, reason: "import_identity_unproven" }));
        entry.state = state;
        validateImportedPatternExecutionRetrospective(state, projectId);
      });
      importedProgress.forEach((entry) => {
        if (entry.kind !== "PATTERN_EXECUTION_LEARNING") return;
        const learningApi = global.YarnAIPatternExecutionLearning;
        if (!learningApi?.remapPatternExecutionLearning || !learningApi?.makeImportedPatternExecutionLearningStale) throw new ProjectRepositoryError("PATTERN_EXECUTION_LEARNING_API_MISSING", "Execution learning module is not loaded.");
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(), ...executionSessionStateIdMap.entries(),
            ...executionStepStateIdMap.entries(), ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(), ...executionRuntimeStateIdMap.entries(),
            ...executionMonitoringStateIdMap.entries(), ...executionInterventionStateIdMap.entries(), ...executionActionStateIdMap.entries(),
            ...executionAttemptIdMap.entries(), ...executionRuntimeActionIdMap.entries(), ...executionEvidenceStateIdMap.entries(),
            ...executionEvidenceItemIdMap.entries(), ...executionCriterionIdMap.entries(), ...executionVerificationStateIdMap.entries(),
            ...executionDecisionStateIdMap.entries(), ...executionFollowUpStateIdMap.entries(),
          ]);
          for (let index = 0; index < progress.length; index += 1) {
            const originalState = progress[index]?.state;
            const remappedState = importedProgress[index]?.state;
            for (const field of ["id", "fingerprint", "resultFingerprint", "runtimeFingerprint", "identity"]) if (originalState?.[field] && remappedState?.[field]) referenceMap.set(originalState[field], remappedState[field]);
          }
          state = clone(learningApi.remapPatternExecutionLearning(state, referenceMap));
        }
        const linkedResult = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RESULT" && candidate.state?.id === state.sourceResultId);
        const linkedRuntime = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RUNTIME" && candidate.state?.id === state.sourceRuntimeId);
        const linkedFollowUp = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_FOLLOW_UP" && candidate.state?.id === state.sourceFollowUpId);
        const linkedRetrospective = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RETROSPECTIVE" && candidate.state?.id === state.sourceRetrospectiveId);
        if (!linkedResult || !linkedRuntime || !linkedFollowUp || !linkedRetrospective) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_LEARNING_REFERENCE", "Learning references missing critical source records.");
        state = clone(learningApi.makeImportedPatternExecutionLearningStale(state, { now: state.updatedAt, collision, reason: "import_identity_unproven" }));
        entry.state = state;
        validateImportedPatternExecutionLearning(state, projectId);
      });
      importedProgress.forEach((entry, entryIndex) => {
        if (entry.kind !== "PATTERN_EXECUTION_ADAPTATION") return;
        const adaptationApi = global.YarnAIPatternExecutionAdaptation;
        if (!adaptationApi?.remapPatternExecutionAdaptation || !adaptationApi?.makeImportedPatternExecutionAdaptationStale || !adaptationApi?.learningSnapshot) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_API_MISSING", "Execution adaptation module is not loaded.");
        const originalState = progress[entryIndex]?.state;
        const originalLearning = progress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_LEARNING" && candidate.state?.id === originalState?.learningId);
        if (!originalLearning || canonicalize(originalState.learningSnapshot) !== canonicalize(adaptationApi.learningSnapshot(originalLearning.state))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_SNAPSHOT", "Adaptation learning snapshot does not match the imported learning record.");
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(),
            ...technologyReviewStateIdMap.entries(), ...executionPlanStateIdMap.entries(), ...executionSessionStateIdMap.entries(),
            ...executionStepStateIdMap.entries(), ...executionCheckpointStateIdMap.entries(), ...executionProgressStateIdMap.entries(),
            ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(), ...executionRuntimeStateIdMap.entries(),
            ...executionMonitoringStateIdMap.entries(), ...executionInterventionStateIdMap.entries(), ...executionActionStateIdMap.entries(),
            ...executionAttemptIdMap.entries(), ...executionRuntimeActionIdMap.entries(), ...executionEvidenceStateIdMap.entries(),
            ...executionEvidenceItemIdMap.entries(), ...executionCriterionIdMap.entries(), ...executionVerificationStateIdMap.entries(),
            ...executionDecisionStateIdMap.entries(), ...executionFollowUpStateIdMap.entries(),
          ]);
          for (let index = 0; index < progress.length; index += 1) {
            const beforeState = progress[index]?.state;
            const remappedState = importedProgress[index]?.state;
            for (const field of ["id", "fingerprint", "resultFingerprint", "runtimeFingerprint", "identity"]) if (beforeState?.[field] && remappedState?.[field]) referenceMap.set(beforeState[field], remappedState[field]);
          }
          state = clone(adaptationApi.remapPatternExecutionAdaptation(state, referenceMap));
        }
        const linkedResult = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RESULT" && candidate.state?.id === state.resultId);
        const linkedRuntime = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RUNTIME" && candidate.state?.id === state.runtimeId);
        const linkedFollowUp = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_FOLLOW_UP" && candidate.state?.id === state.followUpId);
        const linkedRetrospective = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RETROSPECTIVE" && candidate.state?.id === state.retrospectiveId);
        const linkedLearning = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_LEARNING" && candidate.state?.id === state.learningId);
        if (!linkedResult || !linkedRuntime || !linkedFollowUp || !linkedRetrospective || !linkedLearning) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_REFERENCE", "Adaptation references missing critical source records.");
        state = clone(adaptationApi.makeImportedPatternExecutionAdaptationStale(state, { now: state.updatedAt, collision, reason: "import_identity_unproven" }));
        entry.state = state;
        validateImportedPatternExecutionAdaptation(state, projectId);
      });
      importedProgress.forEach((entry, entryIndex) => {
        if (entry.kind !== "PATTERN_EXECUTION_ADAPTATION_VALIDATION") return;
        const validationApi = global.YarnAIPatternExecutionAdaptationValidation;
        if (!validationApi?.remapPatternExecutionAdaptationValidation || !validationApi?.makeImportedPatternExecutionAdaptationValidationStale || !validationApi?.adaptationSnapshot) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_VALIDATION_API_MISSING", "Execution adaptation validation module is not loaded.");
        const originalState = progress[entryIndex]?.state;
        const originalAdaptation = progress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION" && candidate.state?.id === originalState?.adaptationId);
        if (!originalAdaptation || canonicalize(originalState.adaptationSnapshot) !== canonicalize(validationApi.adaptationSnapshot(originalAdaptation.state))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_VALIDATION_SNAPSHOT", "Validation adaptation snapshot does not match the imported adaptation record.");
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(), ...technologyReviewStateIdMap.entries(),
            ...executionPlanStateIdMap.entries(), ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(), ...executionCheckpointStateIdMap.entries(),
            ...executionProgressStateIdMap.entries(), ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(), ...executionRuntimeStateIdMap.entries(),
            ...executionMonitoringStateIdMap.entries(), ...executionInterventionStateIdMap.entries(), ...executionActionStateIdMap.entries(), ...executionAttemptIdMap.entries(),
            ...executionRuntimeActionIdMap.entries(), ...executionEvidenceStateIdMap.entries(), ...executionEvidenceItemIdMap.entries(), ...executionCriterionIdMap.entries(),
            ...executionVerificationStateIdMap.entries(), ...executionDecisionStateIdMap.entries(), ...executionFollowUpStateIdMap.entries(),
          ]);
          for (let index = 0; index < progress.length; index += 1) {
            const beforeState = progress[index]?.state;
            const remappedState = importedProgress[index]?.state;
            for (const field of ["id", "fingerprint", "resultFingerprint", "runtimeFingerprint", "identity"]) if (beforeState?.[field] && remappedState?.[field]) referenceMap.set(beforeState[field], remappedState[field]);
          }
          state = clone(validationApi.remapPatternExecutionAdaptationValidation(state, referenceMap));
        }
        const linkedAdaptation = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION" && candidate.state?.id === state.adaptationId);
        const linkedResult = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RESULT" && candidate.state?.id === state.resultId);
        const linkedRuntime = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RUNTIME" && candidate.state?.id === state.runtimeId);
        const linkedFollowUp = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_FOLLOW_UP" && candidate.state?.id === state.followUpId);
        const linkedRetrospective = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RETROSPECTIVE" && candidate.state?.id === state.retrospectiveId);
        const linkedLearning = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_LEARNING" && candidate.state?.id === state.learningId);
        if (!linkedAdaptation || !linkedResult || !linkedRuntime || !linkedFollowUp || !linkedRetrospective || !linkedLearning) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_VALIDATION_REFERENCE", "Adaptation validation references missing critical source records.");
        state = clone(validationApi.makeImportedPatternExecutionAdaptationValidationStale(state, { now: state.updatedAt, collision, reason: "import_identity_unproven" }));
        entry.state = state;
        validateImportedPatternExecutionAdaptationValidation(state, projectId);
      });
      importedProgress.forEach((entry, entryIndex) => {
        if (entry.kind !== "PATTERN_EXECUTION_ADAPTATION_PROMOTION") return;
        const promotionApi = global.YarnAIPatternExecutionAdaptationPromotion;
        if (!promotionApi?.remapPatternExecutionAdaptationPromotion || !promotionApi?.makeImportedPatternExecutionAdaptationPromotionUnproven || !promotionApi?.adaptationSnapshot || !promotionApi?.validationSnapshot) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_PROMOTION_API_MISSING", "Execution adaptation promotion module is not loaded.");
        const originalState = progress[entryIndex]?.state;
        const originalAdaptation = progress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION" && candidate.state?.id === originalState?.adaptationId);
        const originalValidation = progress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION_VALIDATION" && (candidate.state?.id === originalState?.adaptationValidationId || candidate.state?.adaptationValidationId === originalState?.adaptationValidationId));
        if (!originalAdaptation || canonicalize(originalState.adaptationSnapshot) !== canonicalize(promotionApi.adaptationSnapshot(originalAdaptation.state))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_PROMOTION_ADAPTATION_SNAPSHOT", "Promotion adaptation snapshot does not match the imported adaptation record.");
        if (!originalValidation || canonicalize(originalState.validationSnapshot) !== canonicalize(promotionApi.validationSnapshot(originalValidation.state))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_PROMOTION_VALIDATION_SNAPSHOT", "Promotion validation snapshot does not match the imported validation record.");
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([
            [sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries(),
            ...semanticStateIdMap.entries(), ...reviewStateIdMap.entries(), ...technologyStateIdMap.entries(), ...technologyReviewStateIdMap.entries(),
            ...executionPlanStateIdMap.entries(), ...executionSessionStateIdMap.entries(), ...executionStepStateIdMap.entries(), ...executionCheckpointStateIdMap.entries(),
            ...executionProgressStateIdMap.entries(), ...executionCompletionStateIdMap.entries(), ...executionResultStateIdMap.entries(), ...executionRuntimeStateIdMap.entries(),
            ...executionMonitoringStateIdMap.entries(), ...executionInterventionStateIdMap.entries(), ...executionActionStateIdMap.entries(), ...executionAttemptIdMap.entries(),
            ...executionRuntimeActionIdMap.entries(), ...executionEvidenceStateIdMap.entries(), ...executionEvidenceItemIdMap.entries(), ...executionCriterionIdMap.entries(),
            ...executionVerificationStateIdMap.entries(), ...executionDecisionStateIdMap.entries(), ...executionFollowUpStateIdMap.entries(),
          ]);
          for (let index = 0; index < progress.length; index += 1) {
            const beforeState = progress[index]?.state;
            const remappedState = importedProgress[index]?.state;
            for (const field of ["id", "adaptationValidationId", "adaptationPromotionId", "fingerprint", "resultFingerprint", "runtimeFingerprint", "identity"]) if (beforeState?.[field] && remappedState?.[field]) referenceMap.set(beforeState[field], remappedState[field]);
          }
          state = clone(promotionApi.remapPatternExecutionAdaptationPromotion(state, referenceMap));
        }
        const linkedAdaptation = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION" && candidate.state?.id === state.adaptationId);
        const linkedValidation = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION_VALIDATION" && (candidate.state?.id === state.adaptationValidationId || candidate.state?.adaptationValidationId === state.adaptationValidationId));
        if (!linkedAdaptation || !linkedValidation || linkedValidation.state?.adaptationId !== linkedAdaptation.state?.id) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_PROMOTION_REFERENCE", "Adaptation promotion references missing or mismatched source records.");
        state = clone(promotionApi.makeImportedPatternExecutionAdaptationPromotionUnproven(state, { now: state.updatedAt, collision, reason: "import_identity_unproven" }));
        entry.state = state;
        validateImportedPatternExecutionAdaptationPromotion(state, projectId);
      });
      importedProgress.forEach((entry, entryIndex) => {
        if (entry.kind !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT") return;
        const rolloutApi = global.YarnAIPatternExecutionAdaptationRollout;
        if (!rolloutApi?.remapPatternExecutionAdaptationRollout || !rolloutApi?.makeImportedPatternExecutionAdaptationRolloutUnproven || !rolloutApi?.projectSnapshot || !rolloutApi?.calculationSnapshot || !rolloutApi?.runtimeSnapshot || !rolloutApi?.adaptationSnapshot || !rolloutApi?.validationSnapshot || !rolloutApi?.promotionSnapshot) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_API_MISSING", "Execution adaptation rollout module is not loaded.");
        const originalState = progress[entryIndex]?.state;
        const originalProject = envelope.payload.project;
        const originalCalculation = calculations.find((candidate) => candidate.calculation_id === originalState?.calculationId);
        const originalRuntime = progress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RUNTIME" && candidate.state?.id === originalState?.patternExecutionId);
        const originalAdaptation = progress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION" && candidate.state?.id === originalState?.adaptationId);
        const originalValidation = progress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION_VALIDATION" && (candidate.state?.id === originalState?.adaptationValidationId || candidate.state?.adaptationValidationId === originalState?.adaptationValidationId));
        const originalPromotion = progress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION_PROMOTION" && candidate.state?.id === originalState?.adaptationPromotionId);
        if (!originalProject || originalState.projectSnapshot?.projectId !== originalProject.project_id || !Number.isInteger(originalState.projectSnapshot?.revision) || originalState.projectSnapshot.revision < 1 || originalState.projectSnapshot.revision > originalProject.revision) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_PROJECT_SNAPSHOT", "Rollout project snapshot does not match the imported project identity or revision history.");
        if (!originalCalculation || canonicalize(originalState.calculationSnapshot) !== canonicalize(rolloutApi.calculationSnapshot(originalCalculation))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_CALCULATION_SNAPSHOT", "Rollout calculation snapshot does not match the imported calculation.");
        if (!originalRuntime || canonicalize(originalState.runtimeSnapshot) !== canonicalize(rolloutApi.runtimeSnapshot(originalRuntime.state, originalAdaptation?.state))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_RUNTIME_SNAPSHOT", "Rollout runtime snapshot does not match the imported runtime.");
        if (!originalAdaptation || canonicalize(originalState.adaptationSnapshot) !== canonicalize(rolloutApi.adaptationSnapshot(originalAdaptation.state))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_ADAPTATION_SNAPSHOT", "Rollout adaptation snapshot does not match the imported adaptation.");
        if (!originalValidation || canonicalize(originalState.validationSnapshot) !== canonicalize(rolloutApi.validationSnapshot(originalValidation.state))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_VALIDATION_SNAPSHOT", "Rollout validation snapshot does not match the imported validation.");
        if (!originalPromotion || canonicalize(originalState.promotionSnapshot) !== canonicalize(rolloutApi.promotionSnapshot(originalPromotion.state))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_PROMOTION_SNAPSHOT", "Rollout promotion snapshot does not match the imported promotion.");
        let state = entry.state;
        if (collision) {
          const referenceMap = new Map([[sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries()]);
          for (let index = 0; index < progress.length; index += 1) {
            const beforeState = progress[index]?.state; const remappedState = importedProgress[index]?.state;
            for (const field of ["id", "runtimeId", "adaptationValidationId", "adaptationPromotionId", "adaptationRolloutId", "fingerprint", "resultFingerprint", "runtimeFingerprint", "identity"]) if (beforeState?.[field] && remappedState?.[field]) referenceMap.set(beforeState[field], remappedState[field]);
            for (const item of beforeState?.rolloutPlan || []) { const mapped = (remappedState?.rolloutPlan || []).find((candidate) => candidate.sequence === item.sequence && candidate.title === item.title); if (mapped) referenceMap.set(item.rolloutItemId, mapped.rolloutItemId); }
          }
          state = clone(rolloutApi.remapPatternExecutionAdaptationRollout(state, referenceMap));
        }
        const linkedRuntime = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_RUNTIME" && candidate.state?.id === state.patternExecutionId);
        const linkedAdaptation = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION" && candidate.state?.id === state.adaptationId);
        const linkedValidation = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION_VALIDATION" && (candidate.state?.id === state.adaptationValidationId || candidate.state?.adaptationValidationId === state.adaptationValidationId));
        const linkedPromotion = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION_PROMOTION" && candidate.state?.id === state.adaptationPromotionId);
        if (!linkedRuntime || !linkedAdaptation || !linkedValidation || !linkedPromotion || linkedValidation.state?.adaptationId !== linkedAdaptation.state?.id || linkedPromotion.state?.adaptationId !== linkedAdaptation.state?.id || linkedPromotion.state?.adaptationValidationId !== linkedValidation.state?.id) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_REFERENCE", "Adaptation rollout references missing or mismatched source records.");
        state = clone(rolloutApi.makeImportedPatternExecutionAdaptationRolloutUnproven(state, { now: state.updatedAt, collision, reason: "import_identity_unproven" }));
        entry.state = state;
        validateImportedPatternExecutionAdaptationRollout(state, projectId);
      });
      importedProgress.forEach((entry, entryIndex) => {
        if (entry.kind !== "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION") return;
        const evaluationApi = global.YarnAIPatternExecutionAdaptationRolloutEvaluation;
        if (!evaluationApi?.remapPatternExecutionAdaptationRolloutEvaluation || !evaluationApi?.makeImportedPatternExecutionAdaptationRolloutEvaluationUnproven || !evaluationApi?.rolloutSnapshot) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_API_MISSING", "Rollout evaluation module is not loaded.");
        const originalState = progress[entryIndex]?.state; const originalRollout = progress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION_ROLLOUT" && candidate.state?.id === originalState?.rolloutId); if (!originalRollout || canonicalize(originalState.rolloutSnapshot) !== canonicalize(evaluationApi.rolloutSnapshot(originalRollout.state))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_ROLLOUT_SNAPSHOT", "Evaluation rollout snapshot does not match the imported rollout."); let state = entry.state;
        if (collision) { const referenceMap = new Map([[sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries()]); for (let index = 0; index < progress.length; index += 1) { const beforeState = progress[index]?.state; const remappedState = importedProgress[index]?.state; for (const field of ["id", "runtimeId", "adaptationValidationId", "adaptationPromotionId", "adaptationRolloutId", "evaluationId", "identity"]) if (beforeState?.[field] && remappedState?.[field]) referenceMap.set(beforeState[field], remappedState[field]); for (const collection of ["rolloutPlan", "observations", "metrics", "evidence", "regressions", "sideEffects"]) for (let itemIndex = 0; itemIndex < (beforeState?.[collection] || []).length; itemIndex += 1) { const beforeItem = beforeState[collection][itemIndex]; const afterItem = remappedState?.[collection]?.[itemIndex]; for (const field of ["id", "rolloutItemId", "metricId", "evidenceId"]) if (beforeItem?.[field] && afterItem?.[field]) referenceMap.set(beforeItem[field], afterItem[field]); } } state = clone(evaluationApi.remapPatternExecutionAdaptationRolloutEvaluation(state, referenceMap)); }
        const linkedRollout = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION_ROLLOUT" && candidate.state?.id === state.rolloutId); if (!linkedRollout) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_REFERENCE", "Evaluation references a missing rollout."); state = clone(evaluationApi.makeImportedPatternExecutionAdaptationRolloutEvaluationUnproven(state, { now: state.updatedAt, collision, reason: "import_identity_unproven" })); entry.state = state; validateImportedPatternExecutionAdaptationRolloutEvaluation(state, projectId);
      });
      importedProgress.forEach((entry, entryIndex) => {
        if (entry.kind !== "PATTERN_EXECUTION_ADAPTATION_CLOSURE") return;
        const closureApi = global.YarnAIPatternExecutionAdaptationClosure;
        if (!closureApi?.remapPatternExecutionAdaptationClosure || !closureApi?.makeImportedPatternExecutionAdaptationClosureUnproven || !closureApi?.evaluationSnapshot) throw new ProjectRepositoryError("PATTERN_EXECUTION_ADAPTATION_CLOSURE_API_MISSING", "Adaptation closure module is not loaded.");
        const originalState = progress[entryIndex]?.state; const originalEvaluation = progress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION" && candidate.state?.id === originalState?.evaluationId); if (!originalEvaluation || canonicalize(originalState.evaluationSnapshot) !== canonicalize(closureApi.evaluationSnapshot(originalEvaluation.state))) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_CLOSURE_EVALUATION_SNAPSHOT", "Closure evaluation snapshot does not match the imported evaluation."); let state = entry.state;
        if (collision) { const referenceMap = new Map([[sourceProjectId, projectId], ...calculationMap.entries(), ...progressMap.entries()]); for (let index = 0; index < progress.length; index += 1) { const beforeState = progress[index]?.state; const remappedState = importedProgress[index]?.state; for (const field of ["id", "runtimeId", "adaptationValidationId", "adaptationPromotionId", "adaptationRolloutId", "evaluationId", "closureId", "identity"]) if (beforeState?.[field] && remappedState?.[field]) referenceMap.set(beforeState[field], remappedState[field]); for (const collection of ["rolloutPlan", "observations", "metrics", "evidence", "regressions", "sideEffects", "permanentChanges", "revertedChanges", "retainedConstraints", "resolvedConstraints", "residualRisks", "obligations", "monitoringCommitments"]) for (let itemIndex = 0; itemIndex < (beforeState?.[collection] || []).length; itemIndex += 1) { const beforeItem = beforeState[collection][itemIndex]; const afterItem = remappedState?.[collection]?.[itemIndex]; for (const field of ["id", "rolloutItemId", "metricId", "evidenceId", "target", "owner"]) if (beforeItem?.[field] && afterItem?.[field]) referenceMap.set(beforeItem[field], afterItem[field]); } } state = clone(closureApi.remapPatternExecutionAdaptationClosure(state, referenceMap)); }
        const linkedEvaluation = importedProgress.find((candidate) => candidate.kind === "PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION" && candidate.state?.id === state.evaluationId); if (!linkedEvaluation) throw new ProjectRepositoryError("INVALID_IMPORT_EXECUTION_ADAPTATION_CLOSURE_REFERENCE", "Closure references a missing rollout evaluation."); state = clone(closureApi.makeImportedPatternExecutionAdaptationClosureUnproven(state, { now: state.updatedAt, collision, reason: "import_identity_unproven" })); entry.state = state; validateImportedPatternExecutionAdaptationClosure(state, projectId);
      });
      const importedEvents = events.map((entry) => ({
        ...entry,
        operation_id: collision ? uuidv7() : entry.operation_id,
        project_id: projectId,
        aggregate_id:
          entry.aggregate_type === "PROJECT" ? projectId : entry.aggregate_id,
        partition_key: PARTITION_KEY,
        device_id: null,
        device_sequence: null,
        sync_status: "LOCAL_ONLY",
      }));
      const importOperation = createOperation(
        importedProject,
        "PROJECT_IMPORTED",
        {
          export_id: envelope.export_id,
          source_project_id: sourceProjectId,
          collision,
        },
        timestamp,
        importedProject.revision,
        importedProject.revision,
      );
      importedEvents.push(importOperation);
      const checkpoint = createCheckpoint(
        importedProject,
        importedProject.materialized_checksum,
        importedProject.revision,
        timestamp,
      );
      const previousCheckpoint = createCheckpoint(
        importedProject,
        importedProject.materialized_checksum,
        0,
        timestamp,
      );
      const receipt = {
        transfer_id: uuidv7(),
        transfer_kind: "IMPORT",
        external_id: envelope.export_id,
        checksum: envelope.payload_checksum,
        project_id: projectId,
        collision,
        created_at: timestamp,
      };
      const transaction = database.transaction(
        [
          "projects",
          "calculations",
          "progress",
          "operations",
          "checkpoints",
          "transfer_receipts",
          "meta",
        ],
        "readwrite",
      );
      try {
        transaction.objectStore("projects").add(importedProject);
        importedCalculations.forEach((entry) =>
          transaction.objectStore("calculations").add(entry),
        );
        importedProgress.forEach((entry) =>
          transaction.objectStore("progress").add(entry),
        );
        for (const operation of importedEvents) {
          await allocateOperationMetadata(transaction, operation);
          transaction.objectStore("operations").add(operation);
        }
        transaction.objectStore("checkpoints").add(previousCheckpoint);
        transaction.objectStore("checkpoints").add(checkpoint);
        transaction.objectStore("transfer_receipts").add(receipt);
        await transactionComplete(transaction);
      } catch (error) {
        throw mapStorageError(error, "IMPORT_ATOMIC_COMMIT_FAILED");
      }
      this._notify(projectId, importedProject.revision, "PROJECT_IMPORTED");
      return {
        status: "IMPORTED",
        project_id: projectId,
        collision,
        source_project_id: sourceProjectId,
      };
    }
  }

  class ProjectAutosave {
    constructor(repository, projectId, options = {}) {
      if (!(repository instanceof ProjectRepository) || !isUuidv7(projectId)) {
        throw new ProjectRepositoryError(
          "INVALID_AUTOSAVE_TARGET",
          "Автосохранение не может быть запущено для этого проекта.",
        );
      }
      this.repository = repository;
      this.projectId = projectId;
      this.delay = Math.min(Math.max(options.delay ?? 500, 0), 750);
      this.onStateChange = options.onStateChange ?? (() => {});
      this.state = "CLEAN";
      this.pendingPatch = {};
      this.timer = null;
      this.writePromise = Promise.resolve();
      this.recoveryTimer = null;
      this.retryDelays = options.retryDelays ?? [200, 500, 1000];
      this.destroyed = false;
    }

    _setState(state, error = null) {
      this.state = state;
      this.onStateChange({ state, error });
    }

    update(patch) {
      if (this.destroyed) {
        return;
      }
      Object.assign(this.pendingPatch, clone(patch));
      this._setState("DIRTY");
      global.clearTimeout(this.timer);
      this.timer = global.setTimeout(() => {
        this.flush().catch(() => undefined);
      }, this.delay);
      global.clearTimeout(this.recoveryTimer);
      this.recoveryTimer = global.setTimeout(() => {
        this.repository
          .stageRecoveryDraft(this.projectId, this.pendingPatch)
          .catch((error) => this._setState("SAVE_FAILED", mapStorageError(error)));
      }, Math.min(100, this.delay));
    }

    async _attempt(patch) {
      let lastError;
      for (let attempt = 0; attempt <= this.retryDelays.length; attempt += 1) {
        try {
          return await this.repository.updateProject(this.projectId, patch);
        } catch (error) {
          lastError = mapStorageError(error);
          if (!lastError.transient || attempt === this.retryDelays.length) {
            throw lastError;
          }
          await new Promise((resolve) =>
            global.setTimeout(resolve, this.retryDelays[attempt]),
          );
        }
      }
      throw lastError;
    }

    async flush() {
      if (this.destroyed || Object.keys(this.pendingPatch).length === 0) {
        return this.writePromise;
      }
      global.clearTimeout(this.timer);
      global.clearTimeout(this.recoveryTimer);
      this.timer = null;
      this.recoveryTimer = null;
      const patch = this.pendingPatch;
      this.pendingPatch = {};
      this.writePromise = this.writePromise
        .catch(() => undefined)
        .then(async () => {
          this._setState("SAVING");
          try {
            const project = await this._attempt(patch);
            await this.repository.clearRecoveryDraft(this.projectId);
            this._setState("SAVED_LOCAL");
            if (Object.keys(this.pendingPatch).length > 0) {
              global.setTimeout(() => {
                this.flush().catch(() => undefined);
              }, 0);
            }
            return project;
          } catch (error) {
            Object.assign(this.pendingPatch, patch, this.pendingPatch);
            this._setState("SAVE_FAILED", mapStorageError(error));
            throw error;
          }
        });
      return this.writePromise;
    }

    async destroy() {
      global.clearTimeout(this.timer);
      global.clearTimeout(this.recoveryTimer);
      try {
        await this.flush();
      } finally {
        this.destroyed = true;
      }
    }
  }

  global.YarnAIProjectSystem = Object.freeze({
    DB_NAME,
    DB_VERSION,
    STORE_NAMES: Object.freeze([...STORE_NAMES]),
    INDEX_MANIFEST: Object.freeze(clone(INDEX_MANIFEST)),
    ProjectRepository,
    ProjectRepositoryError,
    ProjectAutosave,
    uuidv7,
    isUuidv7,
    canonicalize,
    checksumPayload,
    applySchemaMigration,
  });
})(typeof window !== "undefined" ? window : globalThis);
