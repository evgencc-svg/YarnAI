"use strict";

(function exposePatternSemanticAnalysis(globalObject) {
  const rules = globalObject.YarnAIPatternSemanticRules || (typeof require === "function" ? require("./pattern-semantic-rules.js") : null);
  const VERSION = 1;
  const PROGRESS_KIND = "PATTERN_SEMANTIC_ANALYSIS";
  const STATUSES = Object.freeze(["waiting", "analyzing", "completed", "partial", "failed"]);
  const activeRuns = new Set();

  class PatternSemanticAnalysisError extends Error {
    constructor(code, userMessage, details = {}) { super(userMessage); this.name = "PatternSemanticAnalysisError"; this.code = code; this.userMessage = userMessage; this.details = copy(details); }
  }

  function emptyResult() { return rules.deepFreeze(rules.emptyResult()); }

  function createInitialState(input, now = new Date().toISOString()) {
    requireTimestamp(now);
    if (!string(input?.projectId) || !string(input?.sourceExtractionId) || !positiveInteger(input?.sourceExtractionRevision) || !positiveInteger(input?.sourceImportRevision) || !validFingerprint(input?.sourceFingerprint)) throw semanticError("SEMANTIC_SOURCE_REVISION_MISMATCH", "Связь с извлечённым содержимым повреждена.");
    const state = {
      id: makeId(), projectId: input.projectId, kind: PROGRESS_KIND, version: VERSION, revision: 1, status: "waiting",
      sourceExtractionId: input.sourceExtractionId, sourceExtractionRevision: input.sourceExtractionRevision, sourceImportRevision: input.sourceImportRevision, sourceFingerprint: input.sourceFingerprint,
      result: emptyResult(), warnings: [], errors: [], createdAt: now, updatedAt: now, startedAt: null, completedAt: null, failedAt: null,
    };
    requireValidState(state); return state;
  }

  function startState(state, now = new Date().toISOString(), source = null) {
    requireValidState(state); requireTimestamp(now);
    if (!["waiting", "partial", "failed"].includes(state.status)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Семантический анализ уже выполняется или завершён.");
    const next = copy(state); next.status = "analyzing"; next.revision += 1; next.updatedAt = now; next.startedAt = now; next.completedAt = null; next.failedAt = null; next.result = rules.emptyResult(); next.warnings = []; next.errors = [];
    if (source) {
      if (!string(source.sourceExtractionId) || !positiveInteger(source.sourceExtractionRevision) || !positiveInteger(source.sourceImportRevision) || !validFingerprint(source.sourceFingerprint)) throw semanticError("SEMANTIC_SOURCE_REVISION_MISMATCH", "Новая связь с extraction повреждена.");
      next.sourceExtractionId = source.sourceExtractionId; next.sourceExtractionRevision = source.sourceExtractionRevision; next.sourceImportRevision = source.sourceImportRevision; next.sourceFingerprint = source.sourceFingerprint;
    }
    requireValidState(next); return next;
  }

  function finishState(state, result, status, now = new Date().toISOString()) {
    requireValidState(state); requireTimestamp(now);
    if (state.status !== "analyzing" || !["completed", "partial"].includes(status)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Недопустимое завершение семантического анализа.");
    validateResult(result); const next = copy(state); next.status = status; next.revision += 1; next.updatedAt = now; next.completedAt = now; next.failedAt = null; next.result = copy(result);
    next.warnings = result.diagnostics.filter((entry) => entry.severity === "warning").map(noticeFromDiagnostic); next.errors = result.diagnostics.filter((entry) => entry.severity === "error").map(noticeFromDiagnostic); requireValidState(next); return next;
  }

  function failureState(state, diagnostic, now = new Date().toISOString(), result = null) {
    requireValidState(state); requireTimestamp(now); const normalized = normalizeDiagnostic(diagnostic);
    const next = copy(state); next.status = "failed"; next.revision += 1; next.updatedAt = now; next.startedAt = next.startedAt || now; next.completedAt = null; next.failedAt = now; next.result = result ? copy(result) : rules.emptyResult();
    if (!next.result.diagnostics.some((entry) => entry.code === normalized.code)) next.result.diagnostics.push(normalized);
    next.result.diagnostics.sort((a, b) => lexical(a.code, b.code) || (a.start ?? -1) - (b.start ?? -1)); next.warnings = next.result.diagnostics.filter((entry) => entry.severity === "warning").map(noticeFromDiagnostic); next.errors = next.result.diagnostics.filter((entry) => entry.severity === "error").map(noticeFromDiagnostic); if (!next.errors.length) next.errors.push(noticeFromDiagnostic({ ...normalized, severity: "error" }));
    requireValidState(next); return next;
  }

  function interruptedState(state, now = new Date().toISOString()) {
    if (state.status !== "analyzing") throw semanticError("SEMANTIC_INTERNAL_ERROR", "Прервать можно только выполняющийся анализ.");
    return failureState(state, diagnostic("SEMANTIC_ANALYSIS_INTERRUPTED", "error", "Предыдущий семантический анализ был прерван перезагрузкой страницы."), now);
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project; const calculation = (aggregate?.calculations || []).find((entry) => entry.calculation_id === project?.active_calculation_id);
    if (!project || !calculation) return { state: "missing", project: project || null, calculation: calculation || null, extractionProgress: null, extraction: null, analysisProgress: null, analysis: null, diagnostic: null };
    const extractionProgress = oneProgress(aggregate, "PATTERN_CONTENT_EXTRACTION", calculation.calculation_id); const analysisProgress = oneProgress(aggregate, PROGRESS_KIND, calculation.calculation_id); const extraction = extractionProgress?.state || null;
    if (!analysisProgress) return { state: "missing", project, calculation, extractionProgress, extraction, analysisProgress: null, analysis: null, diagnostic: null };
    try { requireValidState(analysisProgress.state); } catch (error) { return { state: "corrupted", project, calculation, extractionProgress, extraction, analysisProgress, analysis: null, diagnostic: diagnostic(error.code || "SEMANTIC_INTERNAL_ERROR", "error", error.userMessage || "Запись семантического анализа повреждена.") }; }
    const analysis = copy(analysisProgress.state); const sourceProblem = validateSource(project, extractionProgress, extraction, analysis);
    if (sourceProblem) return { state: "stale", project, calculation, extractionProgress, extraction, analysisProgress, analysis, diagnostic: sourceProblem };
    return { state: analysis.status, project, calculation, extractionProgress, extraction, analysisProgress, analysis, diagnostic: null };
  }

  function validateSource(project, extractionProgress, extraction, analysis = null) {
    if (!extractionProgress || !extraction) return diagnostic("SEMANTIC_SOURCE_REVISION_MISMATCH", "error", "Связанное извлечение содержимого отсутствует.");
    if (extraction.projectId !== project.project_id) return diagnostic("SEMANTIC_SOURCE_REVISION_MISMATCH", "error", "Извлечение принадлежит другому проекту.");
    if (!["completed", "partial"].includes(extraction.status)) return diagnostic("SEMANTIC_SOURCE_REVISION_MISMATCH", "error", "Извлечение не завершено и не может быть проанализировано.");
    if (typeof globalObject.YarnAIPatternContentExtraction?.requireValidState === "function") { try { globalObject.YarnAIPatternContentExtraction.requireValidState(extraction); } catch { return diagnostic("SEMANTIC_SOURCE_REVISION_MISMATCH", "error", "Связанное извлечение повреждено."); } }
    if (analysis) {
      if (analysis.sourceExtractionId !== extractionProgress.progress_id || analysis.sourceExtractionRevision !== extraction.revision || analysis.sourceImportRevision !== extraction.sourceImportRevision) return diagnostic("SEMANTIC_SOURCE_REVISION_MISMATCH", "error", "Ревизия связанного extraction изменилась.");
      if (analysis.sourceFingerprint !== rules.fingerprintExtraction(extraction)) return diagnostic("SEMANTIC_SOURCE_FINGERPRINT_MISMATCH", "error", "Fingerprint связанного extraction не совпадает.");
    }
    return null;
  }

  async function ensureForProject(repository, projectId) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (inspected.analysis?.status === "analyzing" && !activeRuns.has(projectId)) {
      const recovered = interruptedState(inspected.analysis); await repository.failPatternSemanticAnalysis(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_SEMANTIC_ANALYSIS_INTERRUPTED", projectStage: "pattern_semantic_analysis_failed" }); return inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.analysis) {
      if (inspected.state === "stale" && inspected.analysis.status !== "failed") {
        const failed = failureState(inspected.analysis, inspected.diagnostic); await repository.failPatternSemanticAnalysis(projectId, inspected.calculation.calculation_id, failed, { operationKind: "PATTERN_SEMANTIC_ANALYSIS_SOURCE_INVALID", projectStage: "pattern_semantic_analysis_failed" }); return inspectAggregate(await repository.getProject(projectId));
      }
      return inspected;
    }
    const sourceProblem = validateSource(inspected.project, inspected.extractionProgress, inspected.extraction);
    if (sourceProblem) throw semanticError(sourceProblem.code, sourceProblem.message);
    const state = createInitialState({ projectId, sourceExtractionId: inspected.extractionProgress.progress_id, sourceExtractionRevision: inspected.extraction.revision, sourceImportRevision: inspected.extraction.sourceImportRevision, sourceFingerprint: rules.fingerprintExtraction(inspected.extraction) });
    await repository.ensurePatternSemanticAnalysis(projectId, inspected.calculation.calculation_id, state, { operationKind: "PATTERN_SEMANTIC_ANALYSIS_CREATED", projectStage: "pattern_semantic_analysis_waiting" }); return inspectAggregate(await repository.getProject(projectId));
  }

  async function runForProject(repository, projectId, options = {}) {
    if (activeRuns.has(projectId)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Семантический анализ уже выполняется.");
    activeRuns.add(projectId); let started = null; let calculationId = null;
    try {
      let inspected = options.rebaseSource ? inspectAggregate(await repository.getProject(projectId)) : await ensureForProject(repository, projectId); if (inspected.state === "corrupted") throw semanticError(inspected.diagnostic.code, inspected.diagnostic.message); if (inspected.analysis.status === "completed" && inspected.state !== "stale") return inspected;
      const currentSourceProblem = validateSource(inspected.project, inspected.extractionProgress, inspected.extraction, options.rebaseSource ? null : inspected.analysis); if (currentSourceProblem) throw semanticError(currentSourceProblem.code, currentSourceProblem.message);
      const rebasedSource = options.rebaseSource ? { sourceExtractionId: inspected.extractionProgress.progress_id, sourceExtractionRevision: inspected.extraction.revision, sourceImportRevision: inspected.extraction.sourceImportRevision, sourceFingerprint: rules.fingerprintExtraction(inspected.extraction) } : null;
      started = startState(inspected.analysis, undefined, rebasedSource); calculationId = inspected.calculation.calculation_id;
      const startOptions = { operationKind: options.rebaseSource ? "PATTERN_SEMANTIC_ANALYSIS_RETRIED" : "PATTERN_SEMANTIC_ANALYSIS_STARTED", projectStage: "pattern_semantic_analysis_analyzing" };
      if (options.rebaseSource) await repository.retryPatternSemanticAnalysis(projectId, calculationId, started, startOptions); else await repository.startPatternSemanticAnalysis(projectId, calculationId, started, startOptions);
      await yieldToBrowser(); if (typeof options.beforeAnalyze === "function") options.beforeAnalyze();
      const result = await analyzeDeterministically(inspected.extraction, options); const status = rules.determineStatus(inspected.extraction, result); const current = inspectAggregate(await repository.getProject(projectId));
      if (current.state === "stale") throw semanticError(current.diagnostic.code, current.diagnostic.message);
      if (status === "failed") { const primary = result.diagnostics.find((entry) => entry.severity === "error") || diagnostic("SEMANTIC_INTERNAL_ERROR", "error", "Анализ не дал доступного результата."); const failed = failureState(current.analysis, primary, undefined, result); await repository.failPatternSemanticAnalysis(projectId, calculationId, failed, { operationKind: "PATTERN_SEMANTIC_ANALYSIS_FAILED", projectStage: "pattern_semantic_analysis_failed" }); }
      else { const finished = finishState(current.analysis, result, status); await repository.completePatternSemanticAnalysis(projectId, calculationId, finished, { operationKind: "PATTERN_SEMANTIC_ANALYSIS_FINISHED", projectStage: `pattern_semantic_analysis_${status}` }); }
      const finishedAggregate = inspectAggregate(await repository.getProject(projectId));
      if (finishedAggregate.analysis?.status === "completed" && globalObject.YarnAIPatternAnalysisReview?.ensureForProject) await globalObject.YarnAIPatternAnalysisReview.ensureForProject(repository, projectId);
      return inspectAggregate(await repository.getProject(projectId));
    } catch (error) {
      if (started && calculationId) {
        try { const current = await repository.getPatternSemanticAnalysis(projectId, calculationId); if (current?.state?.status === "analyzing") { const code = error?.code === "SEMANTIC_SOURCE_REVISION_MISMATCH" || error?.code === "SEMANTIC_SOURCE_FINGERPRINT_MISMATCH" ? error.code : "SEMANTIC_INTERNAL_ERROR"; const failed = failureState(current.state, diagnostic(code, "error", error?.userMessage || "Семантический анализ завершился контролируемой внутренней ошибкой.")); await repository.failPatternSemanticAnalysis(projectId, calculationId, failed, { operationKind: "PATTERN_SEMANTIC_ANALYSIS_FAILED", projectStage: "pattern_semantic_analysis_failed" }); } } catch { /* Preserve the original controlled error. */ }
      }
      if (error instanceof PatternSemanticAnalysisError) throw error; throw semanticError("SEMANTIC_INTERNAL_ERROR", "Семантический анализ завершился контролируемой внутренней ошибкой.");
    } finally { activeRuns.delete(projectId); }
  }

  async function retryForProject(repository, projectId, options = {}) { let inspected = inspectAggregate(await repository.getProject(projectId)); if (inspected.analysis?.status === "analyzing") inspected = await ensureForProject(repository, projectId); if (inspected.state === "stale" && inspected.analysis?.status === "completed") inspected = await ensureForProject(repository, projectId); if (!["partial", "failed"].includes(inspected.analysis?.status)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Повтор доступен только для partial или failed анализа."); return runForProject(repository, projectId, { ...options, rebaseSource: true }); }

  function requireValidState(value) {
    if (!value || value.kind !== PROGRESS_KIND || value.version !== VERSION || !string(value.id) || !string(value.projectId) || !positiveInteger(value.revision) || !STATUSES.includes(value.status) || !string(value.sourceExtractionId) || !positiveInteger(value.sourceExtractionRevision) || !positiveInteger(value.sourceImportRevision) || !validFingerprint(value.sourceFingerprint) || !Array.isArray(value.warnings) || !Array.isArray(value.errors) || !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt) || !nullableTimestamp(value.startedAt) || !nullableTimestamp(value.completedAt) || !nullableTimestamp(value.failedAt)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Запись семантического анализа повреждена.");
    validateResult(value.result); value.warnings.forEach(validateNotice); value.errors.forEach(validateNotice);
    if (value.status === "waiting" && (value.startedAt !== null || value.completedAt !== null || value.failedAt !== null || JSON.stringify(value.result) !== JSON.stringify(rules.emptyResult()))) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Пустой результат анализа был изменён до запуска.");
    if (value.status === "analyzing" && (!value.startedAt || value.completedAt !== null || value.failedAt !== null)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Временные отметки выполняющегося анализа повреждены.");
    if (["completed", "partial"].includes(value.status) && (!value.startedAt || !value.completedAt || value.failedAt !== null)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Временные отметки завершённого анализа повреждены.");
    if (value.status === "failed" && (!value.startedAt || !value.failedAt || value.completedAt !== null || !value.errors.length)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Состояние ошибки анализа повреждено."); return true;
  }

  function validateResult(value) {
    const empty = rules.emptyResult(); if (!value || value.schemaVersion !== 1) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Результат семантического анализа повреждён.");
    for (const key of Object.keys(empty)) if (!(key in value)) throw semanticError("SEMANTIC_INTERNAL_ERROR", `В результате отсутствует группа ${key}.`);
    if (!Array.isArray(value.evidence) || !Array.isArray(value.diagnostics) || !Array.isArray(value.unsupportedContent) || !Array.isArray(value.rowInstructions) || !Array.isArray(value.repeatInstructions)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Массивы результата анализа повреждены.");
    for (const item of value.evidence) if (!string(item.sourceFileId) || !string(item.sourceFileName) || nonNegativeInteger(item.start) === null || nonNegativeInteger(item.end) === null || item.end < item.start || typeof item.text !== "string" || item.text.length > 500 || !string(item.ruleId)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Evidence семантического анализа повреждён.");
    value.diagnostics.forEach(normalizeDiagnostic); return true;
  }

  function diagnostic(code, severity, message, sourceFileId = null, start = null, end = null) { return { code, severity, message, sourceFileId, start, end }; }
  function normalizeDiagnostic(value) { if (!value || !string(value.code) || !["info", "warning", "error"].includes(value.severity) || !string(value.message) || !(value.sourceFileId === null || typeof value.sourceFileId === "string") || !(value.start === null || nonNegativeInteger(value.start) !== null) || !(value.end === null || nonNegativeInteger(value.end) !== null)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Diagnostic семантического анализа повреждён."); return copy(value); }
  function noticeFromDiagnostic(value) { return { code: value.code, message: value.message, sourceFileId: value.sourceFileId, start: value.start, end: value.end }; }
  function validateNotice(value) { if (!value || !string(value.code) || !string(value.message)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Сообщение семантического анализа повреждено."); }
  function oneProgress(aggregate, kind, calculationId) { const matches = (aggregate?.progress || []).filter((entry) => entry.kind === kind && entry.calculation_id === calculationId && entry.epoch === 1); return matches.length === 1 ? matches[0] : null; }
  function validFingerprint(value) { const text = String(value); if (!text.startsWith("fnv1a32:") || text.length !== 16) return false; for (const character of text.slice(8)) if (!(character >= "0" && character <= "9") && !(character >= "a" && character <= "f")) return false; return true; }
  function semanticError(code, message, details = {}) { return new PatternSemanticAnalysisError(code, message, details); }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `pattern-semantic:${Date.now()}`; }
  function requireTimestamp(value) { if (!isTimestamp(value)) throw semanticError("SEMANTIC_INTERNAL_ERROR", "Временная отметка анализа повреждена."); }
  function isTimestamp(value) { if (typeof value !== "string" || value.length !== 24) return false; for (const index of [4, 7]) if (value[index] !== "-") return false; if (value[10] !== "T" || value[13] !== ":" || value[16] !== ":" || value[19] !== "." || value[23] !== "Z") return false; for (let index = 0; index < value.length; index += 1) if (![4, 7, 10, 13, 16, 19, 23].includes(index) && !(value[index] >= "0" && value[index] <= "9")) return false; return Number.isFinite(Date.parse(value)); }
  function nullableTimestamp(value) { return value === null || isTimestamp(value); }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : null; }
  function nonNegativeInteger(value) { return Number.isInteger(value) && value >= 0 ? value : null; }
  function string(value) { return typeof value === "string" ? value.trim() : ""; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function lexical(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function yieldToBrowser() { return new Promise((resolve) => globalObject.setTimeout(resolve, 0)); }

  function analyzeDeterministically(extraction, options = {}) {
    if (options.synchronous === true || typeof globalObject.Worker !== "function") return Promise.resolve(rules.analyzeExtraction(extraction));
    return new Promise((resolve, reject) => {
      const worker = new globalObject.Worker("/static/pattern-semantic-worker.js");
      worker.onmessage = (event) => { worker.terminate(); if (event.data?.ok) resolve(event.data.result); else reject(semanticError("SEMANTIC_INTERNAL_ERROR", "Фоновый семантический анализ завершился контролируемой ошибкой.")); };
      worker.onerror = () => { worker.terminate(); reject(semanticError("SEMANTIC_INTERNAL_ERROR", "Не удалось выполнить семантический анализ в фоновом процессе.")); };
      worker.postMessage({ extraction: copy(extraction) });
    });
  }

  const api = { VERSION, PROGRESS_KIND, STATUSES, PatternSemanticAnalysisError, emptyResult, createInitialState, startState, finishState, failureState, interruptedState, validateSource, inspectAggregate, ensureForProject, runForProject, retryForProject, analyzeDeterministically, requireValidState, validateResult };
  globalObject.YarnAIPatternSemanticAnalysis = Object.freeze(api); if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
