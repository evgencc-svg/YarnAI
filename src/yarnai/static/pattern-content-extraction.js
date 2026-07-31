"use strict";

(function exposePatternContentExtraction(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "PATTERN_CONTENT_EXTRACTION";
  const STATUSES = Object.freeze(["waiting", "extracting", "completed", "partial", "failed"]);
  const EXTRACTION_STATUSES = Object.freeze([
    "extracted", "metadata_only", "no_text_layer", "unsupported", "failed", "truncated",
  ]);
  const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;
  const MAX_PDF_BYTES = 20 * 1024 * 1024;
  const MAX_COMBINED_TEXT_CHARS = 1_000_000;
  const MAX_FILE_TEXT_CHARS = 500_000;
  const MAX_PDF_PAGES = 200;
  const MAX_PDF_PAGE_TEXT_CHARS = 100_000;
  const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown"]);
  const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "webp"]);
  const activeRuns = new Set();

  class PatternContentExtractionError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternContentExtractionError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function emptyResult() {
    return { schemaVersion: 1, files: [], combinedText: "", warnings: [] };
  }

  function createInitialState(input, now = new Date().toISOString()) {
    requireTimestamp(now);
    for (const field of ["projectId", "sourceImportId", "sourceAnalysisId"]) {
      if (!text(input?.[field])) throw extractionError("source_revision_mismatch", "Нарушена связь источников извлечения.");
    }
    if (!positiveInteger(input.sourceImportRevision) || !positiveInteger(input.sourceAnalysisRevision)) {
      throw extractionError("source_revision_mismatch", "Нарушена ревизия источников извлечения.");
    }
    const filesCount = nonNegativeInteger(input.filesCount);
    if (filesCount === null) throw extractionError("source_import_missing", "Список импортированных файлов недоступен.");
    const state = {
      id: makeId(),
      projectId: input.projectId,
      kind: PROGRESS_KIND,
      version: VERSION,
      revision: 1,
      status: "waiting",
      sourceImportId: input.sourceImportId,
      sourceImportRevision: input.sourceImportRevision,
      sourceAnalysisId: input.sourceAnalysisId,
      sourceAnalysisRevision: input.sourceAnalysisRevision,
      filesCount,
      processedFilesCount: 0,
      successfulFilesCount: 0,
      unsupportedFilesCount: 0,
      failedFilesCount: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      error: null,
      result: emptyResult(),
    };
    requireValidState(state);
    return state;
  }

  function startState(state, now = new Date().toISOString()) {
    requireValidState(state);
    requireTimestamp(now);
    if (!["waiting", "partial", "failed", "completed"].includes(state.status)) {
      throw extractionError("extraction_failed", "Извлечение уже выполняется.");
    }
    const next = copy(state);
    next.status = "extracting";
    next.revision += 1;
    next.updatedAt = now;
    next.startedAt = now;
    next.completedAt = null;
    next.error = null;
    next.processedFilesCount = 0;
    next.successfulFilesCount = 0;
    next.unsupportedFilesCount = 0;
    next.failedFilesCount = 0;
    requireValidState(next);
    return next;
  }

  function finishState(state, result, now = new Date().toISOString(), forcedError = null) {
    requireValidState(state);
    requireTimestamp(now);
    if (state.status !== "extracting") throw extractionError("extraction_failed", "Извлечение не было запущено.");
    const normalized = normalizeResult(result);
    const successful = normalized.files.filter((file) => file.extractionStatus === "extracted").length;
    const failed = normalized.files.filter((file) => file.extractionStatus === "failed").length;
    const unsupported = normalized.files.length - successful - failed;
    const status = forcedError || successful === 0 ? "failed" : unsupported + failed > 0 ? "partial" : "completed";
    const next = copy(state);
    next.status = status;
    next.revision += 1;
    next.updatedAt = now;
    next.completedAt = now;
    next.processedFilesCount = normalized.files.length;
    next.successfulFilesCount = successful;
    next.unsupportedFilesCount = unsupported;
    next.failedFilesCount = failed;
    next.error = forcedError ? normalizeNotice(forcedError) : status === "failed" && normalized.files.length === 0
      ? notice("extraction_failed", "Ни один файл не дал пригодного результата.") : null;
    next.result = normalized;
    requireValidState(next);
    return next;
  }

  function interruptedState(state, now = new Date().toISOString()) {
    return finishState(
      state,
      state.result,
      now,
      notice("interrupted_extraction", "Предыдущий запуск был прерван перезагрузкой страницы. Запустите извлечение снова."),
    );
  }

  function normalizeText(value) {
    return String(value).replace(/^\ufeff/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function classifyFile(material) {
    const mediaType = text(material?.mediaType).toLowerCase();
    const extension = fileExtension(material?.displayName || material?.name || "");
    if (mediaType === "application/pdf" || extension === "pdf") return "pdf";
    if (mediaType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) return "image";
    if (mediaType === "text/plain" || mediaType === "text/markdown" || TEXT_EXTENSIONS.has(extension)) return "text";
    return "unsupported";
  }

  async function extractTextFile(material, blob) {
    const base = fileBase(material);
    if (blob.size > MAX_TEXT_FILE_BYTES) return failedFile(base, "file_too_large", "Текстовый файл превышает лимит 5 МБ.");
    let extracted;
    try {
      extracted = new TextDecoder("utf-8", { fatal: true }).decode(await blob.arrayBuffer());
    } catch {
      return failedFile(base, "text_decode_failed", "Текстовый файл не удалось декодировать как UTF-8.");
    }
    const normalized = normalizeText(extracted);
    if (normalized.length > MAX_FILE_TEXT_CHARS) {
      const warning = notice("file_text_too_long", "Текст файла превышает лимит и сохранён только до безопасной границы.");
      return { ...base, extractionStatus: "truncated", text: normalized.slice(0, MAX_FILE_TEXT_CHARS), textLength: MAX_FILE_TEXT_CHARS, warnings: [warning], error: warning };
    }
    return { ...base, extractionStatus: "extracted", text: normalized, textLength: normalized.length, warnings: [], error: null };
  }

  async function extractPdfFile(material, blob, adapter = defaultPdfAdapter) {
    const base = fileBase(material);
    if (blob.size > MAX_PDF_BYTES) return failedFile(base, "file_too_large", "PDF превышает лимит 20 МБ.");
    try {
      const response = await adapter(blob);
      if (!response || !["extracted", "no_text_layer"].includes(response.status)) throw new Error("contract");
      if (!Number.isInteger(response.pageCount) || response.pageCount < 0 || response.pageCount > MAX_PDF_PAGES) {
        return failedFile(base, "pdf_too_many_pages", "PDF превышает лимит количества страниц.");
      }
      const pages = response.pages.map((page, index) => ({
        pageNumber: index + 1,
        text: normalizeText(page.text || ""),
        textLength: normalizeText(page.text || "").length,
        warnings: Array.isArray(page.warnings) ? page.warnings.map(normalizeNotice) : [],
      }));
      if (pages.some((page) => page.textLength > MAX_PDF_PAGE_TEXT_CHARS)) {
        return failedFile(base, "extraction_failed", "Текст одной страницы PDF превышает безопасный лимит.");
      }
      const pdfText = pages.map((page) => page.text).join("\n");
      return {
        ...base,
        extractionStatus: response.status,
        text: response.status === "extracted" ? pdfText : "",
        textLength: response.status === "extracted" ? pdfText.length : 0,
        warnings: (response.warnings || []).map(normalizeNotice),
        error: response.status === "no_text_layer" ? notice("pdf_no_text_layer", "В PDF нет извлекаемого текстового слоя; OCR не применялся.") : null,
        pageCount: response.pageCount,
        pages,
      };
    } catch (error) {
      const code = text(error?.code) || "extraction_failed";
      const allowed = ["pdf_encrypted", "pdf_invalid", "pdf_too_many_pages", "file_too_large", "extraction_failed"];
      return failedFile(base, allowed.includes(code) ? code : "extraction_failed", error?.userMessage || "Не удалось прочитать текстовый слой PDF.");
    }
  }

  async function extractImageMetadata(material, blob, adapter = defaultImageAdapter) {
    const base = fileBase(material);
    let metadata = {};
    const warnings = [notice("unsupported_file_type", "Для изображений OCR и распознавание схем не выполняются.")];
    try { metadata = await adapter(blob); } catch { warnings.push(notice("image_metadata_unavailable", "Технические размеры изображения недоступны.")); }
    return {
      ...base, extractionStatus: "metadata_only", text: "", textLength: 0,
      warnings, error: null,
      width: nonNegativeInteger(metadata.width), height: nonNegativeInteger(metadata.height),
      format: text(metadata.format) || fileExtension(material.displayName).toUpperCase() || null,
      orientation: metadata.orientation ?? null,
    };
  }

  async function extractOne(material, blob, adapters = {}) {
    const type = classifyFile(material);
    if (!(blob instanceof Blob)) return failedFile(fileBase(material), "file_blob_missing", "Содержимое файла отсутствует в локальном хранилище.");
    if (type === "text") return extractTextFile(material, blob);
    if (type === "pdf") return extractPdfFile(material, blob, adapters.pdf || defaultPdfAdapter);
    if (type === "image") return extractImageMetadata(material, blob, adapters.image || defaultImageAdapter);
    return { ...fileBase(material), extractionStatus: "unsupported", text: "", textLength: 0, warnings: [notice("unsupported_file_type", "Тип файла не поддерживается на этом этапе.")], error: notice("unsupported_file_type", "Тип файла не поддерживается на этом этапе.") };
  }

  function buildResult(files) {
    const ordered = files.map(copy).sort((left, right) => left.order - right.order);
    const sections = [];
    const warnings = [];
    for (const file of ordered) {
      warnings.push(...file.warnings.map((warning) => ({ ...warning, sourceFileId: file.sourceFileId })));
      if (file.extractionStatus !== "extracted" || !file.text) continue;
      const fileSections = [];
      if (Array.isArray(file.pages)) {
        for (const page of file.pages) {
          if (page.text) fileSections.push(`=== FILE: ${file.name} | PAGE: ${page.pageNumber} ===\n${page.text}`);
        }
      } else {
        fileSections.push(`=== FILE: ${file.name} ===\n${file.text}`);
      }
      const candidate = [...sections, ...fileSections].join("\n\n");
      if (candidate.length > MAX_COMBINED_TEXT_CHARS) {
        const warning = notice("combined_text_too_long", "Файл не включён в объединённый текст из-за суммарного лимита.");
        file.extractionStatus = "truncated";
        file.warnings.push(warning);
        file.error = warning;
        warnings.push({ ...warning, sourceFileId: file.sourceFileId });
        continue;
      }
      sections.push(...fileSections);
    }
    const combinedText = sections.join("\n\n");
    return normalizeResult({ schemaVersion: 1, files: ordered, combinedText, warnings });
  }

  async function defaultPdfAdapter(blob) {
    const response = await fetch("/api/v1/pattern-content-extraction/pdf", { method: "POST", headers: { "Content-Type": "application/pdf" }, body: blob });
    const payload = await response.json();
    if (!response.ok) {
      const error = extractionError(payload?.error?.code || "extraction_failed", payload?.error?.message || "Не удалось прочитать PDF.");
      throw error;
    }
    return payload;
  }

  async function defaultImageAdapter(blob) {
    if (typeof globalObject.createImageBitmap !== "function") return {};
    const bitmap = await globalObject.createImageBitmap(blob);
    try { return { width: bitmap.width, height: bitmap.height }; } finally { bitmap.close?.(); }
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project;
    const calculation = (aggregate?.calculations || []).find((entry) => entry.calculation_id === project?.active_calculation_id);
    if (!project || !calculation) return { state: "missing", project: project || null, calculation: calculation || null, extraction: null };
    const sourceProgress = oneProgress(aggregate, "PATTERN_IMPORT", calculation.calculation_id);
    const analysisProgress = oneProgress(aggregate, "PATTERN_ANALYSIS", calculation.calculation_id);
    const extractionProgress = oneProgress(aggregate, PROGRESS_KIND, calculation.calculation_id);
    const sourceImport = sourceProgress?.state;
    const analysis = analysisProgress?.state;
    if (!extractionProgress) return { state: "missing", project, calculation, sourceProgress, sourceImport, analysisProgress, analysis, extractionProgress: null, extraction: null };
    try { requireValidState(extractionProgress.state); } catch (error) { return { state: "corrupted", project, calculation, sourceProgress, sourceImport, analysisProgress, analysis, extractionProgress, extraction: null, diagnostic: notice(error.code || "extraction_failed", error.userMessage || "Запись извлечения повреждена.") }; }
    const extraction = copy(extractionProgress.state);
    if (extraction.projectId !== project.project_id || extraction.sourceImportId !== sourceProgress?.progress_id || extraction.sourceAnalysisId !== analysisProgress?.progress_id || extraction.sourceImportRevision !== sourceImport?.revision || extraction.sourceAnalysisRevision > analysis?.revision || analysis?.sourceImportRevision !== sourceImport?.revision || extraction.filesCount !== sourceImport?.materials?.length) {
      return { state: "corrupted", project, calculation, sourceProgress, sourceImport, analysisProgress, analysis, extractionProgress, extraction: null, diagnostic: notice("source_revision_mismatch", "Ревизии импорта или анализа не совпадают со связями извлечения.") };
    }
    return { state: extraction.status, project, calculation, sourceProgress, sourceImport, analysisProgress, analysis, extractionProgress, extraction, diagnostic: null };
  }

  async function ensureForProject(repository, projectId) {
    let result = inspectAggregate(await repository.getProject(projectId));
    if (result.extraction?.status === "extracting" && !activeRuns.has(projectId)) {
      const recovered = interruptedState(result.extraction);
      await repository.failPatternContentExtraction(projectId, result.calculation.calculation_id, recovered, { operationKind: "PATTERN_CONTENT_EXTRACTION_INTERRUPTED", projectStage: "pattern_content_extraction_failed" });
      return inspectAggregate(await repository.getProject(projectId));
    }
    if (result.extraction || result.state === "corrupted") return result;
    if (!result.sourceProgress) throw extractionError("source_import_missing", "Подтверждённый импорт материалов не найден.");
    if (result.sourceImport?.status !== "completed") throw extractionError("source_import_not_confirmed", "Сначала подтвердите импорт материалов.");
    if (!result.analysisProgress || !result.analysis) throw extractionError("source_analysis_missing", "Запись общего анализа материалов не найдена.");
    if (result.analysis.sourceImportRevision !== result.sourceImport.revision) throw extractionError("source_revision_mismatch", "Ревизия общего анализа не соответствует импорту.");
    const state = createInitialState({
      projectId,
      sourceImportId: result.sourceProgress.progress_id,
      sourceImportRevision: result.sourceImport.revision,
      sourceAnalysisId: result.analysisProgress.progress_id,
      sourceAnalysisRevision: result.analysis.revision,
      filesCount: result.sourceImport.materials.length,
    });
    await repository.ensurePatternContentExtraction(projectId, result.calculation.calculation_id, state, { operationKind: "PATTERN_CONTENT_EXTRACTION_CREATED", projectStage: "pattern_content_extraction_waiting" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function runForProject(repository, projectId, adapters = {}) {
    if (activeRuns.has(projectId)) throw extractionError("extraction_failed", "Извлечение уже выполняется.");
    activeRuns.add(projectId);
    try {
      let result = await ensureForProject(repository, projectId);
      if (result.state === "corrupted") throw extractionError(result.diagnostic.code, result.diagnostic.message);
      const started = startState(result.extraction);
      await repository.startPatternContentExtraction(projectId, result.calculation.calculation_id, started, { operationKind: "PATTERN_CONTENT_EXTRACTION_STARTED", projectStage: "pattern_content_extraction_extracting" });
      await advanceAnalysis(repository, result, projectId);
      const files = [];
      for (const material of [...result.sourceImport.materials].sort((a, b) => a.order - b.order)) {
        const stored = await repository.getPatternFile(projectId, material.id);
        const effectiveMaterial = { ...material, mediaType: stored?.metadata?.media_type || inferredMediaType(material) };
        files.push(await extractOne(effectiveMaterial, stored?.blob || null, adapters));
      }
      const extractionResult = buildResult(files);
      const current = inspectAggregate(await repository.getProject(projectId));
      const finished = finishState(current.extraction, extractionResult);
      const options = { operationKind: "PATTERN_CONTENT_EXTRACTION_FINISHED", projectStage: `pattern_content_extraction_${finished.status}` };
      if (finished.status === "failed") await repository.failPatternContentExtraction(projectId, current.calculation.calculation_id, finished, options);
      else await repository.completePatternContentExtraction(projectId, current.calculation.calculation_id, finished, options);
      return inspectAggregate(await repository.getProject(projectId));
    } finally {
      activeRuns.delete(projectId);
    }
  }

  async function advanceAnalysis(repository, result, projectId) {
    const api = globalObject.YarnAIPatternAnalysis;
    if (!api || !result.analysis) return;
    try {
      if (result.analysis.status === "waiting") await api.changeStatusForProject(repository, projectId, "queued");
      const latest = api.inspectAggregate(await repository.getProject(projectId));
      if (latest.analysis?.status === "queued") await api.changeStatusForProject(repository, projectId, "analyzing");
    } catch { /* Extraction remains independent from lifecycle display updates. */ }
  }

  function requireValidState(value) {
    if (!value || value.kind !== PROGRESS_KIND || value.version !== VERSION || !text(value.id) || !text(value.projectId) || !positiveInteger(value.revision) || !STATUSES.includes(value.status) || !positiveInteger(value.sourceImportRevision) || !positiveInteger(value.sourceAnalysisRevision) || !text(value.sourceImportId) || !text(value.sourceAnalysisId) || nonNegativeInteger(value.filesCount) === null || nonNegativeInteger(value.processedFilesCount) === null || nonNegativeInteger(value.successfulFilesCount) === null || nonNegativeInteger(value.unsupportedFilesCount) === null || nonNegativeInteger(value.failedFilesCount) === null || !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt) || !nullableTimestamp(value.startedAt) || !nullableTimestamp(value.completedAt) || !(value.error === null || validNotice(value.error))) {
      throw extractionError("extraction_failed", "Запись извлечения содержимого повреждена.");
    }
    normalizeResult(value.result);
    if (value.status === "waiting" && (value.startedAt !== null || value.completedAt !== null || JSON.stringify(value.result) !== JSON.stringify(emptyResult()))) throw extractionError("extraction_failed", "Начальный результат извлечения был изменён до запуска.");
    if (value.status === "extracting" && (!value.startedAt || value.completedAt !== null)) throw extractionError("extraction_failed", "Временные отметки извлечения повреждены.");
    if (["completed", "partial", "failed"].includes(value.status) && (!value.startedAt || !value.completedAt)) throw extractionError("extraction_failed", "Итоговые отметки извлечения повреждены.");
    return true;
  }

  function normalizeResult(value) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.files) || typeof value.combinedText !== "string" || !Array.isArray(value.warnings)) throw extractionError("extraction_failed", "Результат извлечения повреждён.");
    const files = value.files.map((file) => {
      if (!text(file.sourceFileId) || !positiveInteger(file.order) || !text(file.name) || !EXTRACTION_STATUSES.includes(file.extractionStatus) || typeof file.text !== "string" || file.textLength !== file.text.length || !Array.isArray(file.warnings) || !(file.error === null || validNotice(file.error))) throw extractionError("extraction_failed", "Результат файла повреждён.");
      return copy(file);
    });
    return { schemaVersion: 1, files, combinedText: value.combinedText, warnings: value.warnings.map(normalizeNotice) };
  }

  function fileBase(material) { return { sourceFileId: material.id, order: material.order, name: material.displayName, mediaType: material.mediaType || inferredMediaType(material), size: material.size }; }
  function inferredMediaType(material) { return material.type === "pdf" ? "application/pdf" : material.type === "image" ? "image/unknown" : material.type === "text" ? "text/plain" : "application/octet-stream"; }
  function failedFile(base, code, message) { const error = notice(code, message); return { ...base, extractionStatus: "failed", text: "", textLength: 0, warnings: [], error }; }
  function notice(code, message) { return { code: text(code), message: text(message) }; }
  function normalizeNotice(value) { if (!validNotice(value)) throw extractionError("extraction_failed", "Диагностика извлечения повреждена."); return notice(value.code, value.message); }
  function validNotice(value) { return Boolean(value) && Boolean(text(value.code)) && Boolean(text(value.message)); }
  function oneProgress(aggregate, kind, calculationId) { const matches = (aggregate?.progress || []).filter((entry) => entry.kind === kind && entry.calculation_id === calculationId && entry.epoch === 1); return matches.length === 1 ? matches[0] : null; }
  function fileExtension(value) { const match = /\.([^.]+)$/.exec(String(value).toLowerCase()); return match ? match[1] : ""; }
  function extractionError(code, message, details = {}) { return new PatternContentExtractionError(code, message, details); }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `pattern-extraction:${Date.now()}`; }
  function requireTimestamp(value) { if (!isTimestamp(value)) throw extractionError("extraction_failed", "Время извлечения повреждено."); }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function nullableTimestamp(value) { return value === null || isTimestamp(value); }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : null; }
  function nonNegativeInteger(value) { return Number.isInteger(value) && value >= 0 ? value : null; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

  const api = { VERSION, PROGRESS_KIND, STATUSES, EXTRACTION_STATUSES, MAX_TEXT_FILE_BYTES, MAX_PDF_BYTES, MAX_COMBINED_TEXT_CHARS, MAX_FILE_TEXT_CHARS, MAX_PDF_PAGES, MAX_PDF_PAGE_TEXT_CHARS, PatternContentExtractionError, emptyResult, createInitialState, startState, finishState, interruptedState, normalizeText, classifyFile, extractTextFile, extractPdfFile, extractImageMetadata, extractOne, buildResult, inspectAggregate, ensureForProject, runForProject, requireValidState };
  globalObject.YarnAIPatternContentExtraction = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
