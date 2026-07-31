"use strict";

(function exposePatternImport(globalObject) {
  let patternAnalysisApi = globalObject.YarnAIPatternAnalysis;
  if (
    !patternAnalysisApi &&
    typeof module !== "undefined" &&
    module.exports &&
    typeof require === "function"
  ) {
    patternAnalysisApi = require("./pattern-analysis.js");
  }
  if (!patternAnalysisApi) {
    throw new Error("Pattern Analysis intake is unavailable.");
  }
  const VERSION = 1;
  const PROGRESS_KIND = "PATTERN_IMPORT";
  const SOURCE_PROGRESS_KIND = "FIRST_BLOCKING";
  const STATUSES = Object.freeze([
    "not_started",
    "collecting",
    "ready",
    "importing",
    "completed",
    "blocked",
  ]);
  const MATERIAL_TYPES = Object.freeze(["pdf", "image", "text"]);
  const MATERIAL_STATUS = "collected";
  const MAX_MATERIAL_BYTES = 50 * 1024 * 1024;
  const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
  const IMAGE_EXTENSIONS = new Set([
    "avif",
    "bmp",
    "gif",
    "heic",
    "heif",
    "jpeg",
    "jpg",
    "png",
    "svg",
    "webp",
  ]);
  const TEXT_EXTENSIONS = new Set(["md", "markdown", "text", "txt"]);

  class PatternImportError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternImportError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function createInitialState(input = {}, now = new Date().toISOString()) {
    requireTimestamp(now);
    const sourceReady = input.sourceCompleted === true;
    const state = {
      id: makeId("pattern-import"),
      projectId:
        text(input.projectId) ||
        text(input.project?.project_id) ||
        "unknown-project",
      type: PROGRESS_KIND,
      revision: 1,
      version: VERSION,
      status: sourceReady ? "not_started" : "blocked",
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      sourceFingerprint: null,
      materials: [],
      warnings: [],
      blockers: sourceReady
        ? []
        : [
            notice(
              "FIRST_BLOCKING_NOT_COMPLETED",
              "Import Pattern доступен только после полного завершения Stage 14.",
            ),
          ],
      history: [
        historyEntry("pattern_import_created", now, 1, {
          sourceCompleted: sourceReady,
        }),
      ],
    };
    requireValidState(state);
    return state;
  }

  function classifyMaterial(input) {
    const displayName = normalizeDisplayName(input?.displayName ?? input?.name);
    const mime = text(input?.mime ?? input?.type).toLowerCase();
    const extension = fileExtension(displayName);
    if (mime === "application/pdf" || extension === "pdf") return "pdf";
    if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
      return "image";
    }
    if (mime.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
      return "text";
    }
    throw stateError(
      "MATERIAL_TYPE_UNSUPPORTED",
      "Поддерживаются только PDF, изображения и текстовые файлы.",
      { displayName, mime: mime || null },
    );
  }

  function materialFromFile(file) {
    if (!file || typeof file !== "object") {
      throw stateError("MATERIAL_INVALID", "Не удалось прочитать данные файла.");
    }
    return normalizeMaterialInput({
      displayName: file.name,
      size: file.size,
      mime: file.type,
    });
  }

  function addMaterials(state, inputs, now = new Date().toISOString()) {
    requireEditable(state);
    requireTimestamp(now);
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw stateError("MATERIAL_REQUIRED", "Выберите хотя бы один материал.");
    }
    const normalized = inputs.map(normalizeMaterialInput);
    const next = copy(state);
    const firstOrder = next.materials.length + 1;
    const added = normalized.map((entry, index) => ({
      id: makeId("pattern-material"),
      type: entry.type,
      displayName: entry.displayName,
      size: entry.size,
      order: firstOrder + index,
      status: MATERIAL_STATUS,
      createdAt: now,
    }));
    next.materials.push(...added);
    next.status = "ready";
    next.startedAt = next.startedAt || now;
    next.blockers = [];
    next.sourceFingerprint = fingerprintMaterials(next.materials);
    return commitMutation(state, next, now, "materials_added", {
      materialIds: added.map((entry) => entry.id),
      count: added.length,
    });
  }

  function removeMaterial(state, materialId, now = new Date().toISOString()) {
    requireEditable(state);
    requireTimestamp(now);
    const id = text(materialId);
    const index = state.materials.findIndex((entry) => entry.id === id);
    if (index < 0) {
      throw stateError("MATERIAL_NOT_FOUND", "Материал не найден.");
    }
    const next = copy(state);
    const [removed] = next.materials.splice(index, 1);
    normalizeOrders(next.materials);
    next.status = next.materials.length ? "ready" : "collecting";
    next.sourceFingerprint = next.materials.length
      ? fingerprintMaterials(next.materials)
      : null;
    return commitMutation(state, next, now, "material_removed", {
      materialId: removed.id,
    });
  }

  function moveMaterial(
    state,
    materialId,
    targetOrder,
    now = new Date().toISOString(),
  ) {
    requireEditable(state);
    requireTimestamp(now);
    const id = text(materialId);
    const index = state.materials.findIndex((entry) => entry.id === id);
    if (index < 0) {
      throw stateError("MATERIAL_NOT_FOUND", "Материал не найден.");
    }
    if (
      !Number.isSafeInteger(targetOrder) ||
      targetOrder < 1 ||
      targetOrder > state.materials.length
    ) {
      throw stateError("ORDER_INVALID", "Новый порядок материала недопустим.");
    }
    if (state.materials[index].order === targetOrder) return copy(state);
    const next = copy(state);
    const [moving] = next.materials.splice(index, 1);
    next.materials.splice(targetOrder - 1, 0, moving);
    normalizeOrders(next.materials);
    next.status = next.materials.length ? "ready" : "collecting";
    next.sourceFingerprint = fingerprintMaterials(next.materials);
    return commitMutation(state, next, now, "material_reordered", {
      materialId: id,
      from: index + 1,
      to: targetOrder,
    });
  }

  function markImporting(state, now = new Date().toISOString()) {
    requireEditable(state);
    requireTimestamp(now);
    if (state.status !== "ready" || state.materials.length === 0) {
      throw stateError(
        "IMPORT_NOT_READY",
        "Добавьте хотя бы один материал перед импортом.",
      );
    }
    const next = copy(state);
    next.status = "importing";
    return commitMutation(state, next, now, "import_marked_in_progress", {});
  }

  function completeImport(state, confirmed, now = new Date().toISOString()) {
    requireTimestamp(now);
    if (state.status === "completed") return copy(state);
    requireValidState(state);
    if (confirmed !== true) {
      throw stateError(
        "CONFIRMATION_REQUIRED",
        "Подтвердите список материалов перед продолжением.",
      );
    }
    if (
      !["ready", "importing"].includes(state.status) ||
      state.materials.length === 0 ||
      !state.sourceFingerprint
    ) {
      throw stateError(
        "IMPORT_NOT_READY",
        "Добавьте хотя бы один материал перед продолжением.",
      );
    }
    const next = copy(state);
    next.status = "completed";
    next.startedAt = next.startedAt || now;
    next.completedAt = now;
    next.blockers = [];
    return commitMutation(state, next, now, "pattern_import_completed", {
      materialCount: next.materials.length,
      sourceFingerprint: next.sourceFingerprint,
      confirmed: true,
    });
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
        "PATTERN_IMPORT_DATA_DAMAGED",
        "Запись Import Pattern повреждена и не была изменена.",
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
          code: error.code || "PATTERN_IMPORT_DATA_DAMAGED",
          message:
            error.userMessage ||
            "Запись Import Pattern повреждена. Остальные данные проекта не изменены.",
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
      !text(value.id) ||
      value.type !== PROGRESS_KIND ||
      !positiveInteger(value.revision) ||
      value.version !== VERSION ||
      !text(value.projectId) ||
      !STATUSES.includes(value.status) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt) ||
      !nullableTimestamp(value.startedAt) ||
      !nullableTimestamp(value.completedAt) ||
      !(
        value.sourceFingerprint === null ||
        (typeof value.sourceFingerprint === "string" &&
          FINGERPRINT_PATTERN.test(value.sourceFingerprint))
      ) ||
      !Array.isArray(value.materials) ||
      !value.materials.every(validMaterial) ||
      !ordersAreContiguous(value.materials) ||
      new Set(value.materials.map((entry) => entry.id)).size !==
        value.materials.length ||
      !Array.isArray(value.warnings) ||
      !value.warnings.every(validNotice) ||
      !Array.isArray(value.blockers) ||
      !value.blockers.every(validNotice) ||
      !Array.isArray(value.history) ||
      !value.history.every(validHistoryEntry) ||
      !value.history.length ||
      value.history.at(-1).revision !== value.revision
    ) {
      throw stateError(
        "PATTERN_IMPORT_DATA_DAMAGED",
        "Запись Import Pattern повреждена или имеет неподдерживаемую версию.",
      );
    }
    const hasMaterials = value.materials.length > 0;
    const expectedFingerprint = hasMaterials
      ? fingerprintMaterials(value.materials)
      : null;
    if (value.sourceFingerprint !== expectedFingerprint) {
      throw stateError(
        "PATTERN_IMPORT_FINGERPRINT_MISMATCH",
        "Список материалов не прошёл проверку целостности.",
      );
    }
    if (
      (["not_started", "collecting"].includes(value.status) && hasMaterials) ||
      (["ready", "importing", "completed"].includes(value.status) &&
        !hasMaterials) ||
      (value.status === "completed" && !value.completedAt) ||
      (value.status !== "completed" && value.completedAt !== null) ||
      (hasMaterials && !value.startedAt)
    ) {
      throw stateError(
        "PATTERN_IMPORT_DATA_DAMAGED",
        "Статус Import Pattern не соответствует сохранённым материалам.",
      );
    }
    return true;
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      return aggregateResult("blocked", null, null, null, [
        notice("PROJECT_MISSING", "Проект не найден."),
      ]);
    }
    const calculation = activeCalculation(aggregate, project);
    if (!calculation) {
      return aggregateResult("blocked", project, null, null, [
        notice("CALCULATION_MISSING", "Активный расчёт проекта не найден."),
      ]);
    }
    const sourceRecord = oneProgress(
      aggregate,
      SOURCE_PROGRESS_KIND,
      calculation.calculation_id,
    );
    const sourceState = validCompletedSource(sourceRecord?.state)
      ? copy(sourceRecord.state)
      : null;
    const progress = oneProgress(
      aggregate,
      PROGRESS_KIND,
      calculation.calculation_id,
    );
    const raw = progress && !isPlaceholder(progress.state) ? progress.state : null;
    const input = {
      project,
      projectId: project.project_id,
      calculation,
      sourceCompleted: Boolean(sourceState),
    };
    if (!raw) {
      return {
        ...aggregateResult(
          sourceState ? "missing" : "blocked",
          project,
          calculation,
          null,
          sourceState
            ? []
            : [
                notice(
                  "FIRST_BLOCKING_NOT_COMPLETED",
                  "Import Pattern доступен только после полного завершения Stage 14.",
                ),
              ],
        ),
        source: sourceState,
        sourceProgress: sourceRecord || null,
        progress: progress || null,
        input,
      };
    }
    const restored = safeRestore(raw);
    if (!restored.ok) {
      return {
        ...aggregateResult("corrupted", project, calculation, null, [
          restored.diagnostic,
        ]),
        source: sourceState,
        sourceProgress: sourceRecord || null,
        progress,
        rawState: copy(raw),
        diagnostic: restored.diagnostic,
        input,
      };
    }
    if (restored.state.projectId !== project.project_id) {
      return {
        ...aggregateResult("corrupted", project, calculation, null, [
          notice(
            "PATTERN_IMPORT_PROJECT_MISMATCH",
            "Запись Import Pattern относится к другому проекту.",
          ),
        ]),
        source: sourceState,
        sourceProgress: sourceRecord || null,
        progress,
        rawState: copy(raw),
        diagnostic: notice(
          "PATTERN_IMPORT_PROJECT_MISMATCH",
          "Запись Import Pattern относится к другому проекту.",
        ),
        input,
      };
    }
    if (!sourceState) {
      return {
        ...aggregateResult("blocked", project, calculation, restored.state, [
          notice(
            "FIRST_BLOCKING_NOT_COMPLETED",
            "Stage 14 больше не подтверждена. Import Pattern не был изменён.",
          ),
        ]),
        source: null,
        sourceProgress: sourceRecord || null,
        progress,
        input,
      };
    }
    return {
      ...aggregateResult(
        restored.state.status,
        project,
        calculation,
        restored.state,
        restored.state.blockers,
      ),
      source: sourceState,
      sourceProgress: sourceRecord,
      progress,
      input,
    };
  }

  async function ensureForProject(repository, projectId) {
    let result = inspectAggregate(await repository.getProject(projectId));
    if (result.state === "corrupted") return result;
    if (result.patternImport) return result;
    if (!result.calculation || !result.source) throw errorFromResult(result);
    if (!result.progress) {
      await repository.ensureCalculationProgress(
        projectId,
        result.calculation.calculation_id,
        PROGRESS_KIND,
        { version: 0, initialized: false },
        { operationKind: "PATTERN_IMPORT_PROGRESS_CREATED" },
      );
      result = inspectAggregate(await repository.getProject(projectId));
    }
    const state = createInitialState(result.input);
    await repository.updateCalculationProgress(
      projectId,
      result.calculation.calculation_id,
      PROGRESS_KIND,
      state,
      {
        baseProgressRevision: result.progress.revision,
        operationKind: "PATTERN_IMPORT_CREATED",
        projectStage: "pattern_import_not_started",
      },
    );
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function resetForProject(repository, projectId) {
    const result = inspectAggregate(await repository.getProject(projectId));
    if (!result.progress || !result.calculation || !result.source) {
      throw errorFromResult(result);
    }
    const state = createInitialState(result.input);
    state.warnings.push(
      notice(
        "PREVIOUS_RECORD_REPLACED",
        "Повреждённая запись Import Pattern заменена по явной команде пользователя.",
      ),
    );
    return persist(repository, result, state, "PATTERN_IMPORT_RESET");
  }

  async function mutateForProject(repository, projectId, mutation, operationKind) {
    const result = await ensureForProject(repository, projectId);
    if (result.state === "corrupted" || result.state === "blocked") {
      throw errorFromResult(result);
    }
    const next = mutation(result.patternImport);
    if (stableStringify(next) === stableStringify(result.patternImport)) {
      return result;
    }
    return persist(repository, result, next, operationKind);
  }

  async function addMaterialsForProject(repository, projectId, inputs) {
    return mutateForProject(
      repository,
      projectId,
      (state) => addMaterials(state, inputs),
      "PATTERN_IMPORT_MATERIALS_ADDED",
    );
  }

  async function removeMaterialForProject(repository, projectId, materialId) {
    return mutateForProject(
      repository,
      projectId,
      (state) => removeMaterial(state, materialId),
      "PATTERN_IMPORT_MATERIAL_REMOVED",
    );
  }

  async function moveMaterialForProject(
    repository,
    projectId,
    materialId,
    targetOrder,
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) => moveMaterial(state, materialId, targetOrder),
      "PATTERN_IMPORT_MATERIAL_REORDERED",
    );
  }

  async function markImportingForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      markImporting,
      "PATTERN_IMPORT_MARKED_IN_PROGRESS",
    );
  }

  async function completeForProject(repository, projectId, confirmed) {
    const completed = await mutateForProject(
      repository,
      projectId,
      (state) => completeImport(state, confirmed),
      "PATTERN_IMPORT_COMPLETED",
    );
    if (completed.patternImport?.status === "completed") {
      await patternAnalysisApi.ensureForCompletedImport(repository, projectId);
    }
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function persist(repository, result, state, operationKind) {
    const stages = {
      not_started: "pattern_import_not_started",
      collecting: "pattern_import_collecting",
      ready: "pattern_import_ready",
      importing: "pattern_import_importing",
      completed: "pattern_import_completed",
      blocked: "pattern_import_blocked",
    };
    await repository.updateCalculationProgress(
      result.project.project_id,
      result.calculation.calculation_id,
      PROGRESS_KIND,
      state,
      {
        baseProgressRevision: result.progress.revision,
        operationKind,
        projectStage: stages[state.status],
      },
    );
    return inspectAggregate(
      await repository.getProject(result.project.project_id),
    );
  }

  function progressSummary(state) {
    if (!state) return "";
    if (state.status === "completed") {
      return `${state.materials.length} ${materialCountLabel(
        state.materials.length,
      )} сохранено. Анализ не запускался.`;
    }
    if (state.status === "ready") {
      return `${state.materials.length} ${materialCountLabel(
        state.materials.length,
      )} готово к подтверждению.`;
    }
    if (state.status === "importing") {
      return "Список подтверждён. Дополнительные действия запускаются только пользователем.";
    }
    if (state.status === "blocked") {
      return state.blockers[0]?.message || "Import Pattern заблокирован.";
    }
    return "Добавьте PDF, изображения или текстовые файлы одного проекта.";
  }

  function normalizeMaterialInput(input) {
    if (!isRecord(input)) {
      throw stateError("MATERIAL_INVALID", "Материал имеет неверный формат.");
    }
    const displayName = normalizeDisplayName(input.displayName ?? input.name);
    const size = Number(input.size);
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw stateError(
        "MATERIAL_EMPTY",
        `Файл «${displayName}» пуст или имеет неизвестный размер.`,
      );
    }
    if (size > MAX_MATERIAL_BYTES) {
      throw stateError(
        "MATERIAL_TOO_LARGE",
        `Файл «${displayName}» превышает безопасный лимит 50 МБ.`,
      );
    }
    const type = MATERIAL_TYPES.includes(input.type)
      ? input.type
      : classifyMaterial({ ...input, displayName });
    return { type, displayName, size };
  }

  function normalizeDisplayName(value) {
    const normalized = text(value).replace(/[\u0000-\u001f\u007f]/g, "");
    if (!normalized) {
      throw stateError("MATERIAL_NAME_REQUIRED", "У файла отсутствует имя.");
    }
    return [...normalized].slice(0, 200).join("");
  }

  function validMaterial(value) {
    return (
      isRecord(value) &&
      Boolean(text(value.id)) &&
      MATERIAL_TYPES.includes(value.type) &&
      normalizeDisplayName(value.displayName) === value.displayName &&
      Number.isSafeInteger(value.size) &&
      value.size > 0 &&
      value.size <= MAX_MATERIAL_BYTES &&
      positiveInteger(value.order) &&
      value.status === MATERIAL_STATUS &&
      isTimestamp(value.createdAt)
    );
  }

  function validNotice(value) {
    return isRecord(value) && Boolean(text(value.code)) && Boolean(text(value.message));
  }

  function validHistoryEntry(value) {
    return (
      isRecord(value) &&
      Boolean(text(value.type)) &&
      isTimestamp(value.at) &&
      positiveInteger(value.revision) &&
      isRecord(value.details)
    );
  }

  function ordersAreContiguous(materials) {
    return materials.every((entry, index) => entry.order === index + 1);
  }

  function normalizeOrders(materials) {
    materials.forEach((entry, index) => {
      entry.order = index + 1;
    });
  }

  function fingerprintMaterials(materials) {
    if (!materials.length) return null;
    const canonical = stableStringify(
      materials.map((entry) => ({
        id: entry.id,
        type: entry.type,
        displayName: entry.displayName,
        size: entry.size,
        order: entry.order,
      })),
    );
    const seeds = [
      0x811c9dc5, 0x9e3779b1, 0x85ebca77, 0xc2b2ae3d,
      0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5,
    ];
    return seeds
      .map((seed, lane) => {
        let hash = seed >>> 0;
        for (let index = 0; index < canonical.length; index += 1) {
          hash ^= canonical.charCodeAt(index) + lane * 17;
          hash = Math.imul(hash, 0x01000193) >>> 0;
          hash ^= hash >>> 13;
        }
        return (hash >>> 0).toString(16).padStart(8, "0");
      })
      .join("");
  }

  function commitMutation(previous, next, now, type, details) {
    if (stableStringify(previous) === stableStringify(next)) return copy(previous);
    next.revision = previous.revision + 1;
    next.updatedAt = now;
    next.history.push(historyEntry(type, now, next.revision, details));
    requireValidState(next);
    return next;
  }

  function requireEditable(state) {
    requireValidState(state);
    if (state.status === "completed") {
      throw stateError(
        "PATTERN_IMPORT_COMPLETED",
        "Import Pattern уже подтверждён и больше не изменяется.",
      );
    }
    if (state.status === "blocked") {
      throw stateError(
        "PATTERN_IMPORT_BLOCKED",
        state.blockers[0]?.message || "Import Pattern заблокирован.",
      );
    }
    if (state.status === "importing") {
      throw stateError(
        "PATTERN_IMPORT_IN_PROGRESS",
        "Список уже отмечен как импортируемый и доступен только для подтверждения.",
      );
    }
  }

  function validCompletedSource(value) {
    const api = globalObject.YarnAIFirstBlocking;
    return Boolean(
      api?.isValidState?.(value) &&
        value.type === SOURCE_PROGRESS_KIND &&
        value.status === "completed" &&
        value.completedAt,
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

  function activeCalculation(aggregate, project) {
    return (aggregate?.calculations || []).find(
      (entry) => entry.calculation_id === project.active_calculation_id,
    );
  }

  function isPlaceholder(value) {
    return isRecord(value) && value.version === 0 && value.initialized === false;
  }

  function aggregateResult(state, project, calculation, patternImport, blockers) {
    return {
      state,
      status: patternImport?.status || state,
      project: copy(project),
      calculation: copy(calculation),
      patternImport: copy(patternImport),
      blockers: copy(blockers || []),
      message: blockers?.[0]?.message || null,
    };
  }

  function errorFromResult(result) {
    return stateError(
      result?.diagnostic?.code ||
        result?.blockers?.[0]?.code ||
        "PATTERN_IMPORT_UNAVAILABLE",
      result?.diagnostic?.message ||
        result?.blockers?.[0]?.message ||
        "Import Pattern сейчас недоступен.",
    );
  }

  function historyEntry(type, at, revision, details) {
    return { type, at, revision, details: copy(details || {}) };
  }

  function notice(code, message) {
    return { code, message };
  }

  function materialCountLabel(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return "материал";
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
      return "материала";
    }
    return "материалов";
  }

  function fileExtension(value) {
    const match = /\.([^.]+)$/.exec(value.toLowerCase());
    return match ? match[1] : "";
  }

  function stateError(code, message, details = {}) {
    return new PatternImportError(code, message, details);
  }

  function makeId(prefix) {
    if (globalObject.YarnAIProjectSystem?.uuidv7) {
      return globalObject.YarnAIProjectSystem.uuidv7();
    }
    if (globalObject.crypto?.randomUUID) return globalObject.crypto.randomUUID();
    return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  }

  function requireTimestamp(value) {
    if (!isTimestamp(value)) {
      throw stateError("TIMESTAMP_INVALID", "Не удалось сохранить время действия.");
    }
  }

  function isTimestamp(value) {
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value))
    );
  }

  function nullableTimestamp(value) {
    return value === null || isTimestamp(value);
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function text(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function copy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  const api = {
    VERSION,
    PROGRESS_KIND,
    SOURCE_PROGRESS_KIND,
    STATUSES,
    MATERIAL_TYPES,
    MATERIAL_STATUS,
    MAX_MATERIAL_BYTES,
    PatternImportError,
    createInitialState,
    classifyMaterial,
    materialFromFile,
    addMaterials,
    removeMaterial,
    moveMaterial,
    markImporting,
    completeImport,
    fingerprintMaterials,
    serializeState,
    restoreState,
    safeRestore,
    isValidState,
    inspectAggregate,
    ensureForProject,
    resetForProject,
    addMaterialsForProject,
    removeMaterialForProject,
    moveMaterialForProject,
    markImportingForProject,
    completeForProject,
    progressSummary,
    stableStringify,
  };

  globalObject.YarnAIPatternImport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
