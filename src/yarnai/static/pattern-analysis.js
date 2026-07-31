"use strict";

(function exposePatternAnalysis(globalObject) {
  const ANALYSIS_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_ANALYSIS";
  const SOURCE_PROGRESS_KIND = "PATTERN_IMPORT";
  const STATUSES = Object.freeze([
    "waiting",
    "queued",
    "analyzing",
    "completed",
    "failed",
  ]);
  const ALLOWED_TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["queued", "failed"]),
    queued: Object.freeze(["analyzing", "failed"]),
    analyzing: Object.freeze(["completed", "failed"]),
    completed: Object.freeze([]),
    failed: Object.freeze(["queued"]),
  });

  class PatternAnalysisError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternAnalysisError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function emptyResult() {
    return {
      patternDetected: false,
      garmentType: null,
      construction: null,
      confidence: 0,
      missingInformation: [],
      notes: [],
    };
  }

  function createInitialState(input = {}, now = new Date().toISOString()) {
    requireTimestamp(now);
    const projectId = text(input.projectId);
    const sourceImportRevision = positiveInteger(input.sourceImportRevision);
    const filesCount = nonNegativeInteger(input.filesCount);
    if (!projectId || !sourceImportRevision || filesCount === null) {
      throw stateError(
        "PATTERN_ANALYSIS_SOURCE_INVALID",
        "Не удалось связать анализ с подтверждённым импортом материалов.",
      );
    }
    const state = {
      projectId,
      revision: 1,
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      sourceImportRevision,
      filesCount,
      analysisVersion: ANALYSIS_VERSION,
      result: emptyResult(),
      warnings: [],
      errors: [],
    };
    requireValidState(state);
    return state;
  }

  function changeStatus(state, status, now = new Date().toISOString()) {
    requireValidState(state);
    requireTimestamp(now);
    if (!STATUSES.includes(status)) {
      throw stateError(
        "PATTERN_ANALYSIS_STATUS_INVALID",
        "Указан неподдерживаемый статус анализа материалов.",
        { status },
      );
    }
    if (status === state.status) return copy(state);
    if (!ALLOWED_TRANSITIONS[state.status].includes(status)) {
      throw stateError(
        "PATTERN_ANALYSIS_TRANSITION_INVALID",
        "Этот переход состояния анализа материалов недоступен.",
        { from: state.status, to: status },
      );
    }
    const next = copy(state);
    next.status = status;
    next.revision += 1;
    next.updatedAt = now;
    requireValidState(next);
    return next;
  }

  function serializeState(state) {
    requireValidState(state);
    return JSON.stringify(state);
  }

  function restoreState(serialized) {
    let state;
    try {
      state =
        typeof serialized === "string" ? JSON.parse(serialized) : copy(serialized);
    } catch {
      throw stateError(
        "PATTERN_ANALYSIS_DATA_DAMAGED",
        "Запись анализа материалов имеет неверный формат.",
      );
    }
    requireValidState(state);
    return state;
  }

  function safeRestore(serialized) {
    try {
      return { ok: true, state: restoreState(serialized), diagnostic: null };
    } catch (error) {
      return {
        ok: false,
        state: null,
        diagnostic: {
          code: error?.code || "PATTERN_ANALYSIS_DATA_DAMAGED",
          message:
            error?.userMessage ||
            "Запись анализа материалов повреждена и не была изменена.",
        },
      };
    }
  }

  function isValidState(value) {
    try {
      requireValidState(value);
      return true;
    } catch {
      return false;
    }
  }

  function requireValidState(value) {
    if (
      !isRecord(value) ||
      !text(value.projectId) ||
      !positiveInteger(value.revision) ||
      !STATUSES.includes(value.status) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt) ||
      Date.parse(value.updatedAt) < Date.parse(value.createdAt) ||
      !positiveInteger(value.sourceImportRevision) ||
      nonNegativeInteger(value.filesCount) === null ||
      value.analysisVersion !== ANALYSIS_VERSION ||
      !validResult(value.result) ||
      !Array.isArray(value.warnings) ||
      !Array.isArray(value.errors)
    ) {
      throw stateError(
        "PATTERN_ANALYSIS_DATA_DAMAGED",
        "Запись анализа материалов повреждена и не была изменена.",
      );
    }
    return true;
  }

  function validResult(value) {
    return (
      isRecord(value) &&
      value.patternDetected === false &&
      value.garmentType === null &&
      value.construction === null &&
      value.confidence === 0 &&
      Array.isArray(value.missingInformation) &&
      value.missingInformation.length === 0 &&
      Array.isArray(value.notes) &&
      value.notes.length === 0
    );
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      return { state: "missing", project: null, calculation: null, analysis: null };
    }
    const calculation = (aggregate.calculations || []).find(
      (entry) => entry.calculation_id === project.active_calculation_id,
    );
    if (!calculation) {
      return { state: "missing", project, calculation: null, analysis: null };
    }
    const sourceProgress = oneProgress(
      aggregate,
      SOURCE_PROGRESS_KIND,
      calculation.calculation_id,
    );
    const sourceImport = validCompletedImport(sourceProgress?.state)
      ? copy(sourceProgress.state)
      : null;
    const progress = oneProgress(
      aggregate,
      PROGRESS_KIND,
      calculation.calculation_id,
    );
    if (!progress) {
      return {
        state: sourceImport ? "missing" : "unavailable",
        project,
        calculation,
        sourceImport,
        sourceProgress: sourceProgress || null,
        progress: null,
        analysis: null,
      };
    }
    const restored = safeRestore(progress.state);
    if (!restored.ok || restored.state.projectId !== project.project_id) {
      return {
        state: "corrupted",
        project,
        calculation,
        sourceImport,
        sourceProgress: sourceProgress || null,
        progress,
        analysis: null,
        diagnostic: restored.diagnostic || {
          code: "PATTERN_ANALYSIS_PROJECT_MISMATCH",
          message: "Запись анализа материалов относится к другому проекту.",
        },
      };
    }
    return {
      state: restored.state.status,
      project,
      calculation,
      sourceImport,
      sourceProgress,
      progress,
      analysis: restored.state,
      diagnostic: null,
    };
  }

  async function ensureForCompletedImport(repository, projectId) {
    let result = inspectAggregate(await repository.getProject(projectId));
    if (result.analysis || result.state === "corrupted") return result;
    if (!result.calculation || !result.sourceImport) {
      throw stateError(
        "PATTERN_IMPORT_NOT_COMPLETED",
        "Анализ материалов доступен только после подтверждения импорта.",
      );
    }
    const state = createInitialState({
      projectId,
      sourceImportRevision: result.sourceImport.revision,
      filesCount: result.sourceImport.materials.length,
    });
    await repository.ensureCalculationProgress(
      projectId,
      result.calculation.calculation_id,
      PROGRESS_KIND,
      state,
      {
        operationKind: "PATTERN_ANALYSIS_CREATED",
        projectStage: "pattern_analysis_waiting",
      },
    );
    result = inspectAggregate(await repository.getProject(projectId));
    return result;
  }

  async function changeStatusForProject(repository, projectId, status) {
    const result = await ensureForCompletedImport(repository, projectId);
    if (!result.analysis || !result.progress || !result.calculation) {
      throw stateError(
        "PATTERN_ANALYSIS_UNAVAILABLE",
        "Запись анализа материалов недоступна.",
      );
    }
    const next = changeStatus(result.analysis, status);
    if (next.revision === result.analysis.revision) return result;
    await repository.updateCalculationProgress(
      projectId,
      result.calculation.calculation_id,
      PROGRESS_KIND,
      next,
      {
        baseProgressRevision: result.progress.revision,
        operationKind: "PATTERN_ANALYSIS_STATUS_CHANGED",
        projectStage: `pattern_analysis_${next.status}`,
      },
    );
    return inspectAggregate(await repository.getProject(projectId));
  }

  function validCompletedImport(value) {
    return (
      isRecord(value) &&
      value.status === "completed" &&
      positiveInteger(value.revision) &&
      Array.isArray(value.materials) &&
      value.materials.length > 0
    );
  }

  function oneProgress(aggregate, kind, calculationId) {
    const matches = (aggregate?.progress || []).filter(
      (entry) =>
        entry.kind === kind &&
        entry.calculation_id === calculationId &&
        entry.epoch === 1,
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function stateError(code, message, details = {}) {
    return new PatternAnalysisError(code, message, details);
  }

  function requireTimestamp(value) {
    if (!isTimestamp(value)) {
      throw stateError(
        "PATTERN_ANALYSIS_TIMESTAMP_INVALID",
        "Время изменения анализа материалов имеет неверный формат.",
      );
    }
  }

  function isTimestamp(value) {
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value))
    );
  }

  function positiveInteger(value) {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  function nonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function copy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  const api = {
    ANALYSIS_VERSION,
    PROGRESS_KIND,
    SOURCE_PROGRESS_KIND,
    STATUSES,
    PatternAnalysisError,
    emptyResult,
    createInitialState,
    changeStatus,
    serializeState,
    restoreState,
    safeRestore,
    isValidState,
    inspectAggregate,
    ensureForCompletedImport,
    changeStatusForProject,
  };

  globalObject.YarnAIPatternAnalysis = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
