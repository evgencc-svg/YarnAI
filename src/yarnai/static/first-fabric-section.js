"use strict";

(function exposeFirstFabricSection(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "FIRST_FABRIC_SECTION";
  const MAX_REASONABLE_ROW = 1000000;
  const STATUSES = Object.freeze([
    "collecting",
    "ready",
    "in_progress",
    "completed",
    "blocked",
  ]);
  const KNITTING_MODES = Object.freeze(["flat", "round"]);
  const FABRIC_TYPES = Object.freeze([
    "stockinette",
    "garter",
    "rib_1x1",
    "rib_2x2",
    "custom",
  ]);
  const TARGET_MODES = Object.freeze(["length_cm", "rows", "setup_row"]);

  const QUESTION_DEFINITIONS = Object.freeze({
    knitting_mode: {
      id: "knitting_mode",
      text: "Будешь вязать поворотными рядами или по кругу?",
      type: "choice",
      options: [
        { value: "flat", label: "Поворотными рядами" },
        { value: "round", label: "По кругу" },
      ],
    },
    fabric_type: {
      id: "fabric_type",
      text: "Какое полотно должно быть сразу после набора?",
      type: "choice",
      options: [
        { value: "stockinette", label: "Лицевая гладь" },
        { value: "garter", label: "Платочная вязка" },
        { value: "rib_1x1", label: "Резинка 1×1" },
        { value: "rib_2x2", label: "Резинка 2×2" },
        { value: "custom", label: "У меня есть своя схема или инструкция" },
      ],
    },
    custom_pattern_confirmed: {
      id: "custom_pattern_confirmed",
      text: "У тебя уже есть инструкция или схема выбранного узора?",
      type: "choice",
      options: [
        { value: true, label: "Да, инструкция у меня есть" },
        { value: false, label: "Нет" },
      ],
    },
    shaping_required: {
      id: "shaping_required",
      text: "На этом участке будут прибавки, убавки или другое формирование?",
      type: "choice",
      options: [
        { value: false, label: "Нет, участок прямой" },
        { value: true, label: "Да" },
      ],
    },
    edge_stitches_included: {
      id: "edge_stitches_included",
      text: "Кромочные петли уже входят в рассчитанное количество петель?",
      type: "choice",
      options: [
        { value: true, label: "Да, уже входят" },
        { value: false, label: "Нет, не входят" },
      ],
    },
    target_mode: {
      id: "target_mode",
      text: "Как задана цель этого участка?",
      type: "choice",
      options: [
        { value: "length_cm", label: "Длина в сантиметрах" },
        { value: "rows", label: "Количество рядов" },
        { value: "setup_row", label: "Только установочный ряд" },
      ],
    },
    target_length_cm: {
      id: "target_length_cm",
      text: "До какой длины нужно связать этот участок?",
      type: "number",
      suffix: "см",
      min: 0.1,
      step: 0.1,
    },
    target_row_count: {
      id: "target_row_count",
      text: "Сколько рядов нужно связать?",
      type: "number",
      suffix: "рядов",
      min: 1,
      step: 1,
    },
    row_gauge: {
      id: "row_gauge",
      text: "Измерь образец: сколько рядов приходится на 10 см?",
      type: "number",
      suffix: "рядов на 10 см",
      min: 0.1,
      step: 0.1,
      help: "Плотность рядов нужна только для перевода длины в сантиметрах в число рядов.",
    },
  });

  class FirstFabricSectionError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FirstFabricSectionError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = details;
    }
  }

  function calculateRowCount(targetLengthCm, rowGauge) {
    const length = positiveNumber(targetLengthCm);
    const rows = positiveNumber(rowGauge?.rows);
    const height = positiveNumber(rowGauge?.height_cm ?? rowGauge?.heightCm);
    if (!length) {
      throw new FirstFabricSectionError(
        "INVALID_TARGET_LENGTH",
        "Целевая длина должна быть больше нуля.",
      );
    }
    if (!rows || !height) {
      throw new FirstFabricSectionError(
        "INVALID_ROW_GAUGE",
        "Плотность рядов должна содержать положительное число рядов и длину образца.",
      );
    }
    const exact = (length * rows) / height;
    const rounded = Math.floor(exact + 0.5);
    if (!Number.isSafeInteger(rounded) || rounded < 1) {
      throw new FirstFabricSectionError(
        "INVALID_CALCULATED_ROW_COUNT",
        "По сохранённым данным нельзя безопасно определить число рядов.",
      );
    }
    return {
      exact,
      rows: rounded,
      rule: "nearest_half_up",
      explanation:
        `Расчёт: ${formatNumber(rows)} р. на ${formatNumber(height)} см × ` +
        `${formatNumber(length)} см = ${formatNumber(exact)} р.; ` +
        `округление до ближайшего целого ряда, 0,5 — вверх: ${rounded} р.`,
    };
  }

  function evaluateReadiness(input = {}) {
    const answers = isRecord(input.answers) ? copy(input.answers) : {};
    const stitchCount = positiveInteger(input.stitchCount);
    const rowGauge = normalizedRowGauge(input.rowGauge ?? answers.row_gauge);
    const warnings = [];
    const blockingReasons = [];

    if (answers.shaping_required === true) {
      blockingReasons.push({
        code: "SHAPING_REQUIRED",
        field: "shaping_required",
        message:
          "Следующий участок требует прибавок, убавок или формирования. Stage 8 поддерживает только прямой участок.",
      });
    }
    if (
      answers.fabric_type === "custom" &&
      answers.custom_pattern_confirmed === false
    ) {
      blockingReasons.push({
        code: "CUSTOM_PATTERN_INSTRUCTION_MISSING",
        field: "custom_pattern_confirmed",
        message:
          "Для пользовательского узора нужна готовая схема или инструкция. YarnAI не расшифровывает и не придумывает узор.",
      });
    }
    if (
      answers.knitting_mode === "round" &&
      answers.fabric_type === "garter"
    ) {
      blockingReasons.push({
        code: "UNSUPPORTED_FABRIC_MODE",
        field: "fabric_type",
        message:
          "Платочная вязка по кругу не входит в безопасные встроенные инструкции Stage 8.",
      });
    }
    const repeat = repeatForFabric(answers.fabric_type);
    if (repeat && stitchCount && stitchCount % repeat !== 0) {
      blockingReasons.push({
        code: "INCOMPATIBLE_RIB_REPEAT",
        field: "fabric_type",
        message:
          `Рассчитанные ${stitchCount} петель не делятся на раппорт ${repeat}. ` +
          "YarnAI не изменяет количество петель автоматически.",
        details: { stitch_count: stitchCount, repeat },
      });
    }
    if (
      answers.target_length_cm !== undefined &&
      answers.target_length_cm !== null &&
      !positiveNumber(answers.target_length_cm)
    ) {
      blockingReasons.push({
        code: "INVALID_TARGET_LENGTH",
        field: "target_length_cm",
        message: "Целевая длина должна быть больше нуля.",
      });
    }
    if (
      answers.target_row_count !== undefined &&
      answers.target_row_count !== null &&
      !positiveInteger(answers.target_row_count)
    ) {
      blockingReasons.push({
        code: "INVALID_TARGET_ROW_COUNT",
        field: "target_row_count",
        message: "Целевое количество рядов должно быть положительным целым числом.",
      });
    }
    if (
      answers.row_gauge !== undefined &&
      answers.row_gauge !== null &&
      !normalizedRowGauge(answers.row_gauge)
    ) {
      blockingReasons.push({
        code: "INVALID_ROW_GAUGE",
        field: "row_gauge",
        message: "Плотность рядов должна быть больше нуля.",
      });
    }
    if (blockingReasons.length) {
      return {
        status: "blocked",
        nextQuestion: null,
        calculatedRowCount: null,
        rowCalculation: null,
        rowGauge,
        warnings,
        blockingReasons,
      };
    }

    const nextQuestionId = nextQuestionIdFor(answers, rowGauge);
    if (nextQuestionId) {
      return {
        status: "collecting",
        nextQuestion: copy(QUESTION_DEFINITIONS[nextQuestionId]),
        calculatedRowCount: null,
        rowCalculation: null,
        rowGauge,
        warnings,
        blockingReasons,
      };
    }

    let calculatedRowCount = null;
    let rowCalculation = null;
    if (answers.target_mode === "rows") {
      calculatedRowCount = positiveInteger(answers.target_row_count);
    } else if (answers.target_mode === "setup_row") {
      calculatedRowCount = 1;
    } else if (answers.target_mode === "length_cm") {
      rowCalculation = calculateRowCount(answers.target_length_cm, rowGauge);
      calculatedRowCount = rowCalculation.rows;
      if (Math.abs(rowCalculation.exact - rowCalculation.rows) > 1e-9) {
        warnings.push({
          code: "ROW_COUNT_ROUNDED",
          message: rowCalculation.explanation,
        });
      }
    }
    if (answers.knitting_mode === "flat" && answers.edge_stitches_included === false) {
      warnings.push({
        code: "EDGE_STITCHES_NOT_INCLUDED",
        message:
          "Кромочные петли не входят в расчёт. YarnAI не добавляет их и не вводит правило кромочных автоматически.",
      });
    }
    return {
      status: "ready",
      nextQuestion: null,
      calculatedRowCount,
      rowCalculation,
      rowGauge,
      warnings,
      blockingReasons,
    };
  }

  function nextQuestionIdFor(answers, rowGauge) {
    if (!KNITTING_MODES.includes(answers.knitting_mode)) {
      return "knitting_mode";
    }
    if (!FABRIC_TYPES.includes(answers.fabric_type)) {
      return "fabric_type";
    }
    if (
      answers.fabric_type === "custom" &&
      typeof answers.custom_pattern_confirmed !== "boolean"
    ) {
      return "custom_pattern_confirmed";
    }
    if (typeof answers.shaping_required !== "boolean") {
      return "shaping_required";
    }
    if (
      answers.knitting_mode === "flat" &&
      typeof answers.edge_stitches_included !== "boolean"
    ) {
      return "edge_stitches_included";
    }
    if (!TARGET_MODES.includes(answers.target_mode)) {
      return "target_mode";
    }
    if (
      answers.target_mode === "length_cm" &&
      !positiveNumber(answers.target_length_cm)
    ) {
      return "target_length_cm";
    }
    if (
      answers.target_mode === "rows" &&
      !positiveInteger(answers.target_row_count)
    ) {
      return "target_row_count";
    }
    if (answers.target_mode === "length_cm" && !rowGauge) {
      return "row_gauge";
    }
    return null;
  }

  function answersFromProjectIntent(intent) {
    if (!isRecord(intent)) {
      return {};
    }
    const section = [
      intent.first_fabric_section,
      intent.firstFabricSection,
      intent.next_section,
      intent.nextSection,
    ].find(isRecord) ?? {};
    const target = isRecord(section.target) ? section.target : {};
    const answers = {};
    const knittingMode = normalizeKnittingMode(
      section.knitting_mode ?? section.knittingMode,
    );
    const fabricType = normalizeFabricType(
      section.fabric_type ?? section.fabricType,
    );
    const targetMode = normalizeTargetMode(
      section.target_mode ?? section.targetMode ?? target.mode,
    );
    if (knittingMode) {
      answers.knitting_mode = knittingMode;
    }
    if (fabricType) {
      answers.fabric_type = fabricType;
    }
    if (targetMode) {
      answers.target_mode = targetMode;
    }
    assignBoolean(
      answers,
      "custom_pattern_confirmed",
      section.custom_pattern_confirmed ?? section.customPatternConfirmed,
    );
    assignBoolean(
      answers,
      "shaping_required",
      section.shaping_required ?? section.shapingRequired,
    );
    assignBoolean(
      answers,
      "edge_stitches_included",
      section.edge_stitches_included ?? section.edgeStitchesIncluded,
    );
    const length = numberOrNull(
      section.target_length_cm ?? section.targetLengthCm ?? target.length_cm ?? target.lengthCm,
    );
    const rows = numberOrNull(
      section.target_row_count ?? section.targetRowCount ?? target.row_count ?? target.rows,
    );
    if (length !== null) {
      answers.target_length_cm = length;
    }
    if (rows !== null) {
      answers.target_row_count = rows;
    }
    const reference = text(
      section.custom_pattern_reference ?? section.customPatternReference,
    );
    if (reference) {
      answers.custom_pattern_reference = reference;
      answers.custom_pattern_confirmed = true;
    }
    return answers;
  }

  function createSection(aggregate, now = new Date().toISOString()) {
    const source = sectionSource(aggregate);
    const answers = answersFromProjectIntent(source.projectIntent);
    const readiness = evaluateReadiness({
      answers,
      rowGauge: source.rowGauge,
      stitchCount: source.stitchCount,
    });
    const section = {
      version: VERSION,
      section_id: `first-fabric:${source.firstStep.step_id}`,
      project_id: source.project.project_id,
      revision: 1,
      source_calculation_fingerprint: source.calculation.fingerprint,
      source_first_step_id: source.firstStep.step_id,
      source_stitch_count: source.stitchCount,
      status: readiness.status,
      knitting_mode: answers.knitting_mode ?? null,
      fabric_type: answers.fabric_type ?? null,
      custom_pattern_reference: answers.custom_pattern_reference ?? null,
      custom_pattern_confirmed:
        typeof answers.custom_pattern_confirmed === "boolean"
          ? answers.custom_pattern_confirmed
          : null,
      edge_stitches_included:
        typeof answers.edge_stitches_included === "boolean"
          ? answers.edge_stitches_included
          : null,
      target_mode: answers.target_mode ?? null,
      target_length_cm: positiveNumber(answers.target_length_cm),
      target_row_count: positiveInteger(answers.target_row_count),
      calculated_row_count: readiness.calculatedRowCount,
      row_gauge: readiness.rowGauge,
      row_gauge_source: source.rowGaugeSource,
      row_rounding_rule: readiness.rowCalculation?.rule ?? null,
      row_calculation_explanation:
        readiness.rowCalculation?.explanation ?? null,
      shaping_required:
        typeof answers.shaping_required === "boolean"
          ? answers.shaping_required
          : null,
      instruction_summary: instructionSummary(answers, readiness),
      warnings: readiness.warnings,
      blocking_reasons: readiness.blockingReasons,
      current_row: 0,
      answers,
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null,
    };
    return section;
  }

  function inspectAggregate(aggregate) {
    let source;
    try {
      source = sectionSource(aggregate);
    } catch (error) {
      return inspectionFromError(error);
    }
    const matches = Array.isArray(aggregate?.progress)
      ? aggregate.progress.filter(
          (entry) =>
            entry?.kind === PROGRESS_KIND &&
            entry?.calculation_id === source.calculation.calculation_id &&
            entry?.epoch === 1,
        )
      : [];
    if (matches.length === 0) {
      return {
        state: "missing",
        reason: "missing_progress",
        source,
        message: "Состояние первого участка ещё не подготовлено.",
      };
    }
    if (matches.length > 1) {
      return {
        state: "invalid",
        source,
        message:
          "Найдено несколько записей первого участка. Продолжение заблокировано; данные не удалены.",
      };
    }
    const progress = matches[0];
    const section = progress.state;
    if (isPlaceholder(section)) {
      return {
        state: "missing",
        reason: "uninitialized",
        source,
        progress,
        message: "Первый участок ещё не определён.",
      };
    }
    if (isRecord(section) && section.version !== VERSION) {
      return {
        state: "unsupported",
        source,
        progress,
        message:
          "Версия данных первого участка не поддерживается. Исходная запись сохранена без изменений.",
      };
    }
    if (!isValidSection(section)) {
      return {
        state: "invalid",
        source,
        progress,
        message:
          "Данные первого участка повреждены. Продолжение заблокировано; запись не удалена.",
      };
    }
    if (
      progress.project_id !== source.project.project_id ||
      section.project_id !== source.project.project_id
    ) {
      return mismatchInspection(
        source,
        progress,
        section,
        "PROJECT_ID_MISMATCH",
        "Первый участок относится к другому проекту.",
      );
    }
    if (
      section.source_calculation_fingerprint !== source.calculation.fingerprint
    ) {
      return mismatchInspection(
        source,
        progress,
        section,
        "CALCULATION_FINGERPRINT_MISMATCH",
        "Расчёт проекта изменился после создания участка. Продолжение заблокировано.",
      );
    }
    if (section.source_first_step_id !== source.firstStep.step_id) {
      return mismatchInspection(
        source,
        progress,
        section,
        "FIRST_STEP_ID_MISMATCH",
        "Источник набора петель не совпадает с сохранённым участком.",
      );
    }
    if (section.source_stitch_count !== source.stitchCount) {
      return mismatchInspection(
        source,
        progress,
        section,
        "STITCH_COUNT_MISMATCH",
        "Количество петель изменилось после создания участка. YarnAI не корректирует его автоматически.",
      );
    }
    return {
      state: "ready",
      source,
      progress: copy(progress),
      section: copy(section),
      nextQuestion:
        section.status === "collecting"
          ? evaluateReadiness({
              answers: section.answers,
              rowGauge: section.row_gauge,
              stitchCount: source.stitchCount,
            }).nextQuestion
          : null,
    };
  }

  async function ensureForProject(repository, projectId) {
    let aggregate = await repository.getProject(projectId);
    let inspection = inspectAggregate(aggregate);
    if (inspection.state === "ready") {
      return inspection;
    }
    if (inspection.state === "missing" && inspection.reason === "missing_progress") {
      await repository.ensureCalculationProgress(
        projectId,
        inspection.source.calculation.calculation_id,
        PROGRESS_KIND,
        { version: 0, initialized: false },
        { operationKind: "FIRST_FABRIC_SECTION_PROGRESS_CREATED" },
      );
      aggregate = await repository.getProject(projectId);
      inspection = inspectAggregate(aggregate);
    }
    if (inspection.state !== "missing" || inspection.reason !== "uninitialized") {
      throw errorFromInspection(inspection);
    }
    const timestamp = new Date().toISOString();
    const section = createSection(aggregate, timestamp);
    await repository.updateCalculationProgress(
      projectId,
      inspection.source.calculation.calculation_id,
      PROGRESS_KIND,
      section,
      {
        baseProgressRevision: inspection.progress.revision,
        operationKind: "FIRST_FABRIC_SECTION_CREATED",
        projectStage:
          section.status === "blocked"
            ? "first_fabric_section_blocked"
            : section.status === "ready"
              ? "first_fabric_section_ready"
              : "first_fabric_section_collecting",
        timestamp,
      },
    );
    return loadForProject(repository, projectId);
  }

  async function loadForProject(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const inspection = inspectAggregate(aggregate);
    if (inspection.state !== "ready") {
      throw errorFromInspection(inspection);
    }
    return inspection;
  }

  async function answerForProject(repository, projectId, questionId, value) {
    let inspection;
    try {
      inspection = await loadForProject(repository, projectId);
    } catch (error) {
      if (error.code !== "FIRST_FABRIC_SECTION_MISSING") {
        throw error;
      }
      inspection = await ensureForProject(repository, projectId);
    }
    const section = inspection.section;
    if (["in_progress", "completed"].includes(section.status)) {
      throw new FirstFabricSectionError(
        "SECTION_ALREADY_STARTED",
        "Ответы можно исправить до начала участка.",
      );
    }
    if (!QUESTION_DEFINITIONS[questionId]) {
      throw new FirstFabricSectionError(
        "UNKNOWN_SECTION_QUESTION",
        "Неизвестный вопрос участка.",
      );
    }
    const normalized = normalizeAnswer(questionId, value);
    const answers = copy(section.answers);
    if (questionId === "row_gauge") {
      answers.row_gauge = {
        rows: normalized,
        height_cm: 10,
        source: "user_measurement_10cm",
      };
    } else {
      answers[questionId] = normalized;
    }
    if (sameValue(section.answers[questionId], answers[questionId])) {
      return inspection;
    }
    const rowGauge =
      normalizedRowGauge(answers.row_gauge) ??
      normalizedRowGauge(section.row_gauge) ??
      inspection.source.rowGauge;
    const readiness = evaluateReadiness({
      answers,
      rowGauge,
      stitchCount: inspection.source.stitchCount,
    });
    const timestamp = new Date().toISOString();
    const next = applyReadiness(
      {
        ...section,
        answers,
        revision: section.revision + 1,
        updated_at: timestamp,
      },
      readiness,
      questionId === "row_gauge"
        ? "user_measurement_10cm"
        : section.row_gauge_source,
    );
    const draft = projectDraftWithAnswers(inspection.source, answers, rowGauge);
    await saveSection(repository, inspection, next, {
      operationKind: "FIRST_FABRIC_SECTION_ANSWERED",
      projectStage: stageForStatus(next.status),
      projectDraftInput: draft,
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function clearAnswerForProject(repository, projectId, questionId) {
    const inspection = await loadForProject(repository, projectId);
    const section = inspection.section;
    if (["in_progress", "completed"].includes(section.status)) {
      throw new FirstFabricSectionError(
        "SECTION_ALREADY_STARTED",
        "Ответы можно исправить до начала участка.",
      );
    }
    const answers = copy(section.answers);
    if (questionId === "row_gauge") {
      answers.row_gauge = null;
    } else {
      delete answers[questionId];
    }
    const readiness = evaluateReadiness({
      answers,
      rowGauge:
        questionId === "row_gauge" ? null : section.row_gauge,
      stitchCount: inspection.source.stitchCount,
    });
    const timestamp = new Date().toISOString();
    const next = applyReadiness(
      {
        ...section,
        answers,
        revision: section.revision + 1,
        updated_at: timestamp,
      },
      readiness,
      questionId === "row_gauge" ? null : section.row_gauge_source,
    );
    await saveSection(repository, inspection, next, {
      operationKind: "FIRST_FABRIC_SECTION_ANSWER_CLEARED",
      projectStage: stageForStatus(next.status),
      projectDraftInput: projectDraftWithAnswers(
        inspection.source,
        answers,
        readiness.rowGauge,
      ),
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function startForProject(repository, projectId) {
    const inspection = await loadForProject(repository, projectId);
    const section = inspection.section;
    if (section.status === "in_progress" || section.status === "completed") {
      return inspection;
    }
    if (section.status !== "ready") {
      throw new FirstFabricSectionError(
        "SECTION_NOT_READY",
        "Сначала ответь на необходимый вопрос или устрани причину блокировки.",
      );
    }
    const timestamp = new Date().toISOString();
    const next = {
      ...section,
      status: "in_progress",
      current_row: 1,
      started_at: section.started_at ?? timestamp,
      updated_at: timestamp,
      revision: section.revision + 1,
    };
    await saveSection(repository, inspection, next, {
      operationKind: "FIRST_FABRIC_SECTION_STARTED",
      projectStage: "first_fabric_section_in_progress",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function completeCurrentRow(repository, projectId) {
    const inspection = await loadForProject(repository, projectId);
    const section = inspection.section;
    if (section.status !== "in_progress") {
      throw new FirstFabricSectionError(
        "SECTION_NOT_IN_PROGRESS",
        "Счётчик рядов доступен только после начала участка.",
      );
    }
    if (targetReached(section)) {
      return inspection;
    }
    const nextRow = section.current_row + 1;
    if (nextRow > MAX_REASONABLE_ROW) {
      throw new FirstFabricSectionError(
        "ROW_LIMIT_REACHED",
        "Номер ряда превысил безопасный предел.",
      );
    }
    const timestamp = new Date().toISOString();
    const next = {
      ...section,
      current_row: nextRow,
      updated_at: timestamp,
      revision: section.revision + 1,
    };
    await saveSection(repository, inspection, next, {
      operationKind: "FIRST_FABRIC_SECTION_ROW_COMPLETED",
      projectStage: "first_fabric_section_in_progress",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function decreaseCurrentRow(repository, projectId) {
    const inspection = await loadForProject(repository, projectId);
    const section = inspection.section;
    if (section.status !== "in_progress") {
      throw new FirstFabricSectionError(
        "SECTION_NOT_IN_PROGRESS",
        "Исправить номер ряда можно только для начатого участка.",
      );
    }
    if (section.current_row <= 1) {
      return inspection;
    }
    const timestamp = new Date().toISOString();
    const next = {
      ...section,
      current_row: section.current_row - 1,
      updated_at: timestamp,
      revision: section.revision + 1,
    };
    await saveSection(repository, inspection, next, {
      operationKind: "FIRST_FABRIC_SECTION_ROW_CORRECTED",
      projectStage: "first_fabric_section_in_progress",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function completeForProject(repository, projectId) {
    const inspection = await loadForProject(repository, projectId);
    const section = inspection.section;
    if (section.status === "completed") {
      return inspection;
    }
    if (section.status !== "in_progress" || !targetReached(section)) {
      throw new FirstFabricSectionError(
        "SECTION_TARGET_NOT_REACHED",
        "Явно завершить участок можно после выполнения целевого количества рядов.",
      );
    }
    const timestamp = new Date().toISOString();
    const next = {
      ...section,
      status: "completed",
      completed_at: section.completed_at ?? timestamp,
      updated_at: timestamp,
      revision: section.revision + 1,
    };
    await saveSection(repository, inspection, next, {
      operationKind: "FIRST_FABRIC_SECTION_COMPLETED",
      projectStage: "first_fabric_section_completed",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  function currentInstruction(section) {
    if (!isValidSection(section) || section.status === "blocked") {
      return "";
    }
    if (targetReached(section)) {
      return "Цель участка достигнута. Проверь работу и явно подтверди завершение.";
    }
    const row = section.current_row > 0 ? section.current_row : 1;
    if (section.fabric_type === "custom") {
      return "Вяжи следующий ряд по выбранной схеме";
    }
    if (section.fabric_type === "stockinette") {
      if (section.knitting_mode === "round") {
        return "Все петли лицевые.";
      }
      return row % 2 === 1
        ? "Лицевой ряд: все петли лицевые."
        : "Изнаночный ряд: все петли изнаночные.";
    }
    if (section.fabric_type === "garter") {
      return "Все петли ряда лицевые.";
    }
    if (section.fabric_type === "rib_1x1") {
      return "Чередуй 1 лицевую и 1 изнаночную до конца ряда.";
    }
    if (section.fabric_type === "rib_2x2") {
      return "Чередуй 2 лицевые и 2 изнаночные до конца ряда.";
    }
    return "";
  }

  function targetReached(section) {
    return (
      isRecord(section) &&
      positiveInteger(section.calculated_row_count) &&
      section.current_row > section.calculated_row_count
    );
  }

  function completedRowCount(section) {
    if (!isRecord(section) || section.current_row <= 0) {
      return 0;
    }
    return Math.min(
      Math.max(section.current_row - 1, 0),
      positiveInteger(section.calculated_row_count) ?? 0,
    );
  }

  function homeState(inspection, projectId) {
    const encoded = encodeURIComponent(projectId);
    if (inspection?.state !== "ready") {
      return null;
    }
    const section = inspection.section;
    const destination = `/section-assistant?project=${encoded}`;
    if (section.status === "collecting" || section.status === "blocked") {
      return {
        label: "Уточнить следующий участок",
        summary:
          section.status === "blocked"
            ? "Следующий участок требует уточнения"
            : "Набор завершён. Определим следующий участок.",
        href: destination,
      };
    }
    if (section.status === "ready") {
      return {
        label: "Начать участок",
        summary: targetLabel(section),
        href: destination,
      };
    }
    if (section.status === "in_progress") {
      return {
        label: "Продолжить",
        summary:
          `${completedRowCount(section)} из ${section.calculated_row_count} рядов`,
        href: destination,
      };
    }
    return {
      label: "Открыть",
      summary: "Первый участок завершён",
      href: destination,
    };
  }

  function targetLabel(section) {
    if (section.target_mode === "length_cm") {
      return (
        `${formatNumber(section.target_length_cm)} см · ` +
        `${section.calculated_row_count} рядов`
      );
    }
    if (section.target_mode === "setup_row") {
      return "1 установочный ряд";
    }
    return `${section.calculated_row_count} рядов`;
  }

  function knittingModeLabel(value) {
    return value === "round" ? "По кругу" : "Поворотными рядами";
  }

  function fabricTypeLabel(value) {
    return {
      stockinette: "Лицевая гладь",
      garter: "Платочная вязка",
      rib_1x1: "Резинка 1×1",
      rib_2x2: "Резинка 2×2",
      custom: "Пользовательский узор",
    }[value] ?? "Не определено";
  }

  function sectionSource(aggregate) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      throw new FirstFabricSectionError(
        "INVALID_PROJECT",
        "Запись проекта повреждена. Данные не изменены.",
      );
    }
    if (!text(project.active_calculation_id)) {
      throw new FirstFabricSectionError(
        "CALCULATION_MISSING",
        "В проекте нет активного сохранённого расчёта.",
      );
    }
    const calculation = (Array.isArray(aggregate.calculations)
      ? aggregate.calculations
      : []
    ).find((entry) => entry?.calculation_id === project.active_calculation_id);
    if (!isRecord(calculation) || !text(calculation.fingerprint)) {
      throw new FirstFabricSectionError(
        "CALCULATION_FINGERPRINT_MISSING",
        "У активного расчёта отсутствует fingerprint. Продолжение заблокировано.",
      );
    }
    const firstStepApi = globalObject.YarnAIFirstKnittingStep;
    if (!firstStepApi?.inspectAggregate) {
      throw new FirstFabricSectionError(
        "FIRST_STEP_MODULE_MISSING",
        "Модуль набора петель недоступен.",
      );
    }
    const firstStepInspection = firstStepApi.inspectAggregate(aggregate);
    if (
      firstStepInspection.state !== "ready" ||
      firstStepInspection.step.status !== "completed"
    ) {
      throw new FirstFabricSectionError(
        "CAST_ON_NOT_COMPLETED",
        "Сначала явно заверши набор петель.",
      );
    }
    const firstStep = firstStepInspection.step;
    const structured = isRecord(calculation.request) ? calculation.request : {};
    const draft =
      isRecord(project.draft_input) &&
      project.draft_input.kind === structured.kind
        ? project.draft_input
        : structured;
    const projectIntent = isRecord(draft.project_intent)
      ? draft.project_intent
      : isRecord(structured.project_intent)
        ? structured.project_intent
        : {};
    const rowGaugeCandidate = Object.prototype.hasOwnProperty.call(
      draft,
      "row_gauge",
    )
      ? draft.row_gauge
      : structured.row_gauge ?? rowGaugeFromIntent(projectIntent);
    const rowGauge = normalizedRowGauge(rowGaugeCandidate);
    return {
      project,
      calculation,
      firstStep,
      stitchCount: firstStep.target_stitch_count,
      structured,
      draft,
      projectIntent,
      rowGauge,
      rowGaugeSource: rowGauge
        ? text(rowGaugeCandidate?.source) || "saved_project_gauge"
        : null,
    };
  }

  function projectDraftWithAnswers(source, answers, rowGauge) {
    const draft = copy(
      isRecord(source.draft) && Object.keys(source.draft).length
        ? source.draft
        : source.structured,
    );
    const intent = copy(
      isRecord(draft.project_intent) ? draft.project_intent : source.projectIntent,
    );
    intent.first_fabric_section = {
      knitting_mode: answers.knitting_mode ?? null,
      fabric_type: answers.fabric_type ?? null,
      custom_pattern_reference: answers.custom_pattern_reference ?? null,
      custom_pattern_confirmed:
        typeof answers.custom_pattern_confirmed === "boolean"
          ? answers.custom_pattern_confirmed
          : null,
      shaping_required:
        typeof answers.shaping_required === "boolean"
          ? answers.shaping_required
          : null,
      edge_stitches_included:
        typeof answers.edge_stitches_included === "boolean"
          ? answers.edge_stitches_included
          : null,
      target_mode: answers.target_mode ?? null,
      target_length_cm: numberOrNull(answers.target_length_cm),
      target_row_count: numberOrNull(answers.target_row_count),
    };
    if (rowGauge) {
      intent.gauge = isRecord(intent.gauge) ? intent.gauge : {};
      intent.gauge.rows = rowGauge.rows;
      intent.gauge.heightCm = rowGauge.height_cm;
      draft.row_gauge = copy(rowGauge);
    } else if (
      Object.prototype.hasOwnProperty.call(answers, "row_gauge") &&
      answers.row_gauge === null
    ) {
      intent.gauge = isRecord(intent.gauge) ? intent.gauge : {};
      intent.gauge.rows = null;
      intent.gauge.heightCm = null;
      draft.row_gauge = null;
    }
    draft.project_intent = intent;
    return draft;
  }

  function applyReadiness(section, readiness, rowGaugeSource) {
    return {
      ...section,
      status: readiness.status,
      knitting_mode: section.answers.knitting_mode ?? null,
      fabric_type: section.answers.fabric_type ?? null,
      custom_pattern_reference:
        section.answers.custom_pattern_reference ?? null,
      custom_pattern_confirmed:
        typeof section.answers.custom_pattern_confirmed === "boolean"
          ? section.answers.custom_pattern_confirmed
          : null,
      edge_stitches_included:
        typeof section.answers.edge_stitches_included === "boolean"
          ? section.answers.edge_stitches_included
          : null,
      target_mode: section.answers.target_mode ?? null,
      target_length_cm: positiveNumber(section.answers.target_length_cm),
      target_row_count: positiveInteger(section.answers.target_row_count),
      calculated_row_count: readiness.calculatedRowCount,
      row_gauge: readiness.rowGauge,
      row_gauge_source: rowGaugeSource,
      row_rounding_rule: readiness.rowCalculation?.rule ?? null,
      row_calculation_explanation:
        readiness.rowCalculation?.explanation ?? null,
      shaping_required:
        typeof section.answers.shaping_required === "boolean"
          ? section.answers.shaping_required
          : null,
      instruction_summary: instructionSummary(section.answers, readiness),
      warnings: readiness.warnings,
      blocking_reasons: readiness.blockingReasons,
    };
  }

  function instructionSummary(answers, readiness) {
    if (readiness.status !== "ready") {
      return null;
    }
    const mode =
      answers.knitting_mode === "round" ? "по кругу" : "поворотными рядами";
    return (
      `${fabricTypeLabel(answers.fabric_type)}, ${mode}. ` +
      `Цель: ${readiness.calculatedRowCount} рядов.`
    );
  }

  async function saveSection(repository, inspection, section, options) {
    return repository.updateCalculationProgress(
      section.project_id,
      inspection.source.calculation.calculation_id,
      PROGRESS_KIND,
      section,
      {
        ...options,
        baseProgressRevision: inspection.progress.revision,
      },
    );
  }

  function isValidSection(section) {
    if (
      !isRecord(section) ||
      section.version !== VERSION ||
      !text(section.section_id) ||
      !text(section.project_id) ||
      !positiveInteger(section.revision) ||
      !text(section.source_calculation_fingerprint) ||
      !text(section.source_first_step_id) ||
      !positiveInteger(section.source_stitch_count) ||
      !STATUSES.includes(section.status) ||
      !isRecord(section.answers) ||
      !Array.isArray(section.warnings) ||
      !Array.isArray(section.blocking_reasons) ||
      !Number.isInteger(section.current_row) ||
      section.current_row < 0 ||
      section.current_row > MAX_REASONABLE_ROW ||
      !isTimestamp(section.created_at) ||
      !isTimestamp(section.updated_at) ||
      !nullableTimestamp(section.started_at) ||
      !nullableTimestamp(section.completed_at)
    ) {
      return false;
    }
    if (section.status === "collecting" && section.blocking_reasons.length) {
      return false;
    }
    if (section.status === "blocked" && !section.blocking_reasons.length) {
      return false;
    }
    if (
      ["ready", "in_progress", "completed"].includes(section.status) &&
      !positiveInteger(section.calculated_row_count)
    ) {
      return false;
    }
    if (section.status === "ready" && section.current_row !== 0) {
      return false;
    }
    if (
      positiveInteger(section.calculated_row_count) &&
      section.current_row > section.calculated_row_count + 1
    ) {
      return false;
    }
    if (
      ["collecting", "ready", "blocked"].includes(section.status) &&
      (section.started_at !== null || section.current_row !== 0)
    ) {
      return false;
    }
    if (section.status === "in_progress" && (!section.started_at || section.current_row < 1)) {
      return false;
    }
    if (
      section.status === "completed" &&
      (!section.started_at ||
        !section.completed_at ||
        section.current_row !== section.calculated_row_count + 1)
    ) {
      return false;
    }
    if (section.status !== "completed" && section.completed_at !== null) {
      return false;
    }
    return true;
  }

  function mismatchInspection(source, progress, section, code, message) {
    return {
      state: "mismatch",
      source,
      progress: copy(progress),
      section: copy(section),
      blockingReasons: [{ code, message }],
      message,
    };
  }

  function inspectionFromError(error) {
    return {
      state: "blocked",
      error,
      blockingReasons: [
        {
          code: error?.code ?? "SECTION_SOURCE_UNAVAILABLE",
          message:
            error?.userMessage ||
            "Источник первого участка недоступен. Данные не изменены.",
        },
      ],
      message:
        error?.userMessage ||
        "Источник первого участка недоступен. Данные не изменены.",
    };
  }

  function errorFromInspection(inspection) {
    const codes = {
      missing: "FIRST_FABRIC_SECTION_MISSING",
      invalid: "FIRST_FABRIC_SECTION_INVALID",
      unsupported: "FIRST_FABRIC_SECTION_UNSUPPORTED",
      mismatch: "FIRST_FABRIC_SECTION_MISMATCH",
      blocked: "FIRST_FABRIC_SECTION_BLOCKED",
    };
    return new FirstFabricSectionError(
      codes[inspection.state] ?? "FIRST_FABRIC_SECTION_UNAVAILABLE",
      inspection.message ?? "Первый участок недоступен.",
      { blocking_reasons: inspection.blockingReasons ?? [] },
    );
  }

  function normalizeAnswer(questionId, value) {
    if (questionId === "knitting_mode") {
      const normalized = normalizeKnittingMode(value);
      if (normalized) {
        return normalized;
      }
    } else if (questionId === "fabric_type") {
      const normalized = normalizeFabricType(value);
      if (normalized) {
        return normalized;
      }
    } else if (questionId === "target_mode") {
      const normalized = normalizeTargetMode(value);
      if (normalized) {
        return normalized;
      }
    } else if (
      [
        "custom_pattern_confirmed",
        "shaping_required",
        "edge_stitches_included",
      ].includes(questionId)
    ) {
      if (typeof value === "boolean") {
        return value;
      }
      if (value === "true") {
        return true;
      }
      if (value === "false") {
        return false;
      }
    } else if (questionId === "target_row_count") {
      const number = positiveInteger(value);
      if (number) {
        return number;
      }
    } else if (["target_length_cm", "row_gauge"].includes(questionId)) {
      const number = positiveNumber(value);
      if (number) {
        return number;
      }
    }
    throw new FirstFabricSectionError(
      "INVALID_SECTION_ANSWER",
      "Ответ имеет неверный формат или должен быть больше нуля.",
      { question_id: questionId },
    );
  }

  function normalizeKnittingMode(value) {
    const normalized = text(value).toLowerCase();
    if (["flat", "turning", "поворотными рядами", "поворотное"].includes(normalized)) {
      return "flat";
    }
    if (["round", "in_the_round", "по кругу", "круговое"].includes(normalized)) {
      return "round";
    }
    return null;
  }

  function normalizeFabricType(value) {
    const normalized = text(value).toLowerCase();
    const aliases = {
      stockinette: "stockinette",
      "лицевая гладь": "stockinette",
      garter: "garter",
      "платочная вязка": "garter",
      rib_1x1: "rib_1x1",
      "резинка 1×1": "rib_1x1",
      "резинка 1x1": "rib_1x1",
      rib_2x2: "rib_2x2",
      "резинка 2×2": "rib_2x2",
      "резинка 2x2": "rib_2x2",
      custom: "custom",
      "пользовательский узор": "custom",
    };
    return aliases[normalized] ?? null;
  }

  function normalizeTargetMode(value) {
    const normalized = text(value).toLowerCase();
    const aliases = {
      length_cm: "length_cm",
      length: "length_cm",
      cm: "length_cm",
      rows: "rows",
      row_count: "rows",
      setup_row: "setup_row",
      setup: "setup_row",
    };
    return aliases[normalized] ?? null;
  }

  function repeatForFabric(fabricType) {
    if (fabricType === "rib_1x1") {
      return 2;
    }
    if (fabricType === "rib_2x2") {
      return 4;
    }
    return null;
  }

  function rowGaugeFromIntent(intent) {
    if (!isRecord(intent?.gauge)) {
      return null;
    }
    return {
      rows: intent.gauge.rows,
      height_cm: intent.gauge.heightCm ?? intent.gauge.height_cm,
      source: "project_intent",
    };
  }

  function normalizedRowGauge(value) {
    const rows = positiveNumber(value?.rows);
    const height = positiveNumber(value?.height_cm ?? value?.heightCm);
    return rows && height
      ? {
          rows,
          height_cm: height,
          ...(text(value?.source) ? { source: text(value.source) } : {}),
        }
      : null;
  }

  function stageForStatus(status) {
    return {
      collecting: "first_fabric_section_collecting",
      ready: "first_fabric_section_ready",
      blocked: "first_fabric_section_blocked",
      in_progress: "first_fabric_section_in_progress",
      completed: "first_fabric_section_completed",
    }[status];
  }

  function isPlaceholder(value) {
    return isRecord(value) && value.version === 0 && value.initialized === false;
  }

  function assignBoolean(target, key, value) {
    if (typeof value === "boolean") {
      target[key] = value;
    }
  }

  function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function positiveInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isTimestamp(value) {
    return (
      typeof value === "string" &&
      Number.isFinite(Date.parse(value)) &&
      new Date(Date.parse(value)).toISOString() === value
    );
  }

  function nullableTimestamp(value) {
    return value === null || isTimestamp(value);
  }

  function copy(value) {
    if (globalObject.structuredClone) {
      return globalObject.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ru", {
      maximumFractionDigits: 3,
    }).format(Number(value));
  }

  const api = Object.freeze({
    VERSION,
    PROGRESS_KIND,
    MAX_REASONABLE_ROW,
    STATUSES,
    KNITTING_MODES,
    FABRIC_TYPES,
    TARGET_MODES,
    QUESTION_DEFINITIONS,
    FirstFabricSectionError,
    calculateRowCount,
    evaluateReadiness,
    answersFromProjectIntent,
    createSection,
    inspectAggregate,
    ensureForProject,
    loadForProject,
    answerForProject,
    clearAnswerForProject,
    startForProject,
    completeCurrentRow,
    decreaseCurrentRow,
    completeForProject,
    currentInstruction,
    targetReached,
    completedRowCount,
    homeState,
    targetLabel,
    knittingModeLabel,
    fabricTypeLabel,
    isValidSection,
  });

  globalObject.YarnAIFirstFabricSection = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
