"use strict";

(function exposeFirstSimpleShaping(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "FIRST_SIMPLE_SHAPING";
  const TITLE = "Первое простое формирование";
  const METHOD_WARNING =
    "Способ выполнения и наклон убавлений выбери по своей модели или инструкции к узору.";
  const STATUSES = Object.freeze([
    "collecting",
    "ready",
    "in_progress",
    "blocked",
    "completed",
  ]);
  const EDGE_STITCHES_MODES = Object.freeze([
    "without_edge_stitches",
    "with_edge_stitches",
  ]);
  const QUESTION_DEFINITIONS = Object.freeze({
    shaping_required: {
      id: "shaping_required",
      text: "Нужно ли теперь уменьшить ширину полотна?",
      type: "choice",
      options: [
        { value: true, label: "Да, нужны убавления" },
        { value: false, label: "Нет, формирование не требуется" },
      ],
    },
    target_stitch_count: {
      id: "target_stitch_count",
      text: "Сколько петель должно остаться?",
      type: "number",
      min: 1,
      step: 1,
      suffix: "петель",
    },
    total_rows: {
      id: "total_rows",
      text: "За сколько рядов выполнить убавления?",
      type: "number",
      min: 1,
      step: 1,
      suffix: "рядов",
    },
    edge_stitches_mode: {
      id: "edge_stitches_mode",
      text: "Учитывать ли кромочные в инструкции?",
      type: "choice",
      options: [
        {
          value: "with_edge_stitches",
          label: "Да, описывать кромочные",
        },
        {
          value: "without_edge_stitches",
          label: "Нет, без описания кромочных",
        },
      ],
    },
  });

  class FirstSimpleShapingError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FirstSimpleShapingError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = details;
    }
  }

  function distributeDecreaseRows(decreaseEventsCount, totalRows) {
    if (
      !positiveInteger(decreaseEventsCount) ||
      !positiveInteger(totalRows) ||
      decreaseEventsCount > totalRows
    ) {
      throw new FirstSimpleShapingError(
        "INVALID_DECREASE_DISTRIBUTION",
        "Число событий убавления и рядов должно быть положительным, а на один ряд может приходиться не более одного события.",
      );
    }
    const rows = [];
    for (let event = 1; event <= decreaseEventsCount; event += 1) {
      rows.push(Math.round((event * totalRows) / decreaseEventsCount));
    }
    if (
      rows.some(
        (row, index) =>
          row < 1 ||
          row > totalRows ||
          (index > 0 && row <= rows[index - 1]),
      )
    ) {
      throw new FirstSimpleShapingError(
        "UNSAFE_DECREASE_DISTRIBUTION",
        "Не удалось безопасно распределить убавления по рядам.",
      );
    }
    return rows;
  }

  function calculateDecreasePlan(input = {}) {
    const startingStitchCount = input.startingStitchCount;
    const targetStitchCount = input.targetStitchCount;
    const totalRows = input.totalRows;
    if (!positiveInteger(startingStitchCount)) {
      throw new FirstSimpleShapingError(
        "INVALID_STARTING_STITCH_COUNT",
        "Исходное число петель должно быть положительным целым числом.",
      );
    }
    if (!positiveInteger(targetStitchCount)) {
      throw new FirstSimpleShapingError(
        "INVALID_TARGET_STITCH_COUNT",
        "Целевое число петель должно быть положительным целым числом.",
      );
    }
    if (targetStitchCount >= startingStitchCount) {
      throw new FirstSimpleShapingError(
        "TARGET_NOT_SMALLER",
        "Целевое число петель должно быть меньше исходного.",
      );
    }
    if (!positiveInteger(totalRows)) {
      throw new FirstSimpleShapingError(
        "INVALID_TOTAL_ROWS",
        "Количество рядов формирования должно быть положительным целым числом.",
      );
    }
    const totalStitchesToDecrease =
      startingStitchCount - targetStitchCount;
    if (totalStitchesToDecrease % 2 !== 0) {
      throw new FirstSimpleShapingError(
        "ODD_STITCH_DIFFERENCE",
        "Разница между исходным и целевым числом петель должна делиться на 2.",
      );
    }
    const decreaseEventsCount = totalStitchesToDecrease / 2;
    if (decreaseEventsCount > totalRows) {
      throw new FirstSimpleShapingError(
        "TOO_MANY_DECREASE_EVENTS",
        "Событий убавления больше, чем доступных рядов.",
      );
    }
    return {
      startingStitchCount,
      targetStitchCount,
      totalRows,
      totalStitchesToDecrease,
      decreaseEventsCount,
      decreaseRows: distributeDecreaseRows(decreaseEventsCount, totalRows),
    };
  }

  function evaluateReadiness(input = {}) {
    const warnings = [{ code: "DECREASE_TECHNIQUE_NOT_SELECTED", message: METHOD_WARNING }];
    const blockers = [];
    const startingStitchCount = input.startingStitchCount;
    const targetStitchCount = input.targetStitchCount;
    const totalRows = input.totalRows;
    const edgeStitchesMode = input.edgeStitchesMode;

    if (!input.sourceSectionPresent) {
      blockers.push({
        code: "SOURCE_SECTION_MISSING",
        message: "Сначала явно заверши первый прямой участок полотна.",
      });
    } else if (!input.sourceSectionValid) {
      blockers.push({
        code: "SOURCE_SECTION_INVALID",
        message: "Данные завершённого первого участка повреждены.",
      });
    }
    if (input.fingerprintMatches === false) {
      blockers.push({
        code: "CALCULATION_FINGERPRINT_MISMATCH",
        message:
          "Fingerprint исходного расчёта не совпадает. Формирование заблокировано без изменения данных.",
      });
    }
    if (input.projectMatches === false) {
      blockers.push({
        code: "PROJECT_ID_MISMATCH",
        message: "Источник формирования относится к другому проекту.",
      });
    }
    if (input.sourceSectionMatches === false) {
      blockers.push({
        code: "SOURCE_SECTION_ID_MISMATCH",
        message:
          "Сохранённый источник формирования не совпадает с завершённым первым участком.",
      });
    }
    if (input.stitchCountMatches === false) {
      blockers.push({
        code: "STITCH_COUNT_MISMATCH",
        message:
          "Текущее число петель не совпадает с завершённым участком. YarnAI не исправляет его автоматически.",
      });
    }
    if (input.knittingMode === "round") {
      blockers.push({
        code: "ROUND_KNITTING_UNSUPPORTED",
        message:
          "Stage 9 поддерживает убавления только в полотне, связанном поворотными рядами.",
      });
    } else if (
      input.knittingMode !== undefined &&
      input.knittingMode !== null &&
      input.knittingMode !== "flat"
    ) {
      blockers.push({
        code: "INVALID_KNITTING_MODE",
        message: "Режим вязания источника не поддерживается.",
      });
    }
    if (input.complexShaping) {
      blockers.push({
        code: "COMPLEX_SHAPING_UNSUPPORTED",
        message:
          "Сохранённые данные требуют более сложного формирования, чем симметричные убавления по одной петле с каждого края.",
      });
    }
    if (input.customPatternRequiresAdaptation) {
      blockers.push({
        code: "CUSTOM_PATTERN_ADAPTATION_UNSUPPORTED",
        message:
          "Пользовательский узор требует адаптации раппорта во время убавлений. Stage 9 этого не выполняет.",
      });
    }
    if (!positiveInteger(startingStitchCount)) {
      blockers.push({
        code: "INVALID_STARTING_STITCH_COUNT",
        message: "Исходное число петель должно быть положительным целым числом.",
      });
    }
    if (blockers.length) {
      return blockedReadiness(warnings, blockers);
    }

    if (targetStitchCount === null || targetStitchCount === undefined) {
      return collectingReadiness(
        warnings,
        QUESTION_DEFINITIONS.target_stitch_count,
      );
    }
    if (totalRows === null || totalRows === undefined) {
      return collectingReadiness(warnings, QUESTION_DEFINITIONS.total_rows);
    }
    if (edgeStitchesMode === null || edgeStitchesMode === undefined) {
      return collectingReadiness(
        warnings,
        QUESTION_DEFINITIONS.edge_stitches_mode,
      );
    }
    if (!EDGE_STITCHES_MODES.includes(edgeStitchesMode)) {
      blockers.push({
        code: "INVALID_EDGE_STITCHES_MODE",
        message: "Режим описания кромочных не распознан.",
      });
      return blockedReadiness(warnings, blockers);
    }

    let plan;
    try {
      plan = calculateDecreasePlan({
        startingStitchCount,
        targetStitchCount,
        totalRows,
      });
    } catch (error) {
      if (!(error instanceof FirstSimpleShapingError)) {
        throw error;
      }
      blockers.push({ code: error.code, message: error.userMessage });
      return blockedReadiness(warnings, blockers);
    }
    return {
      status: "ready",
      nextQuestion: null,
      plan,
      warnings,
      blockers,
    };
  }

  function collectingReadiness(warnings, nextQuestion) {
    return {
      status: "collecting",
      nextQuestion: copy(nextQuestion),
      plan: null,
      warnings,
      blockers: [],
    };
  }

  function blockedReadiness(warnings, blockers) {
    return {
      status: "blocked",
      nextQuestion: null,
      plan: null,
      warnings,
      blockers,
    };
  }

  function createShaping(aggregate, now = new Date().toISOString()) {
    const source = shapingSource(aggregate);
    const answers = answersFromProjectIntent(source.projectIntent);
    if (answers.shaping_required !== true) {
      throw new FirstSimpleShapingError(
        "SHAPING_NOT_REQUESTED",
        "Простое формирование не требуется для этого проекта.",
      );
    }
    const readiness = readinessForSource(source, answers);
    return applyReadiness(
      {
        id: `first-simple-shaping:${source.section.section_id}`,
        project_id: source.project.project_id,
        type: PROGRESS_KIND,
        version: VERSION,
        revision: 1,
        source_calculation_fingerprint: source.calculation.fingerprint,
        source_section_id: source.section.section_id,
        status: readiness.status,
        title: TITLE,
        knitting_mode: source.section.knitting_mode,
        starting_stitch_count: source.stitchCount,
        target_stitch_count: integerOrNull(answers.target_stitch_count),
        total_rows: integerOrNull(answers.total_rows),
        total_stitches_to_decrease: null,
        decrease_events_count: null,
        decrease_rows: [],
        edge_stitches_mode: answers.edge_stitches_mode ?? null,
        current_row: 0,
        current_stitch_count: source.stitchCount,
        completed_decrease_events: 0,
        warnings: [],
        blockers: [],
        answers,
        created_at: now,
        updated_at: now,
        started_at: null,
        completed_at: null,
      },
      readiness,
    );
  }

  function inspectAggregate(aggregate) {
    let source;
    try {
      source = shapingSource(aggregate);
    } catch (error) {
      return inspectionFromError(error);
    }
    const answers = answersFromProjectIntent(source.projectIntent);
    const matches = Array.isArray(aggregate?.progress)
      ? aggregate.progress.filter(
          (entry) =>
            entry?.kind === PROGRESS_KIND &&
            entry?.calculation_id === source.calculation.calculation_id &&
            entry?.epoch === 1,
        )
      : [];
    if (matches.length === 0) {
      if (answers.shaping_required === false) {
        return {
          state: "declined",
          source,
          message: "Формирование сейчас не требуется.",
        };
      }
      if (answers.shaping_required !== true) {
        return {
          state: "collecting",
          reason: "shaping_requirement_unknown",
          source,
          nextQuestion: copy(QUESTION_DEFINITIONS.shaping_required),
          message: "Нужно определить, требуется ли уменьшить ширину полотна.",
        };
      }
      return {
        state: "missing",
        reason: "missing_progress",
        source,
        message: "Состояние формирования ещё не подготовлено.",
      };
    }
    if (matches.length > 1) {
      return {
        state: "invalid",
        source,
        message:
          "Найдено несколько записей формирования. Продолжение заблокировано; данные не удалены.",
      };
    }
    const progress = matches[0];
    const shaping = progress.state;
    if (isPlaceholder(shaping)) {
      return {
        state: "missing",
        reason: "uninitialized",
        source,
        progress,
        message: "Формирование ещё не определено.",
      };
    }
    if (isRecord(shaping) && shaping.version !== VERSION) {
      return {
        state: "unsupported",
        source,
        progress,
        message:
          "Версия данных формирования не поддерживается. Исходная запись сохранена без изменений.",
      };
    }
    if (!isValidShaping(shaping)) {
      return {
        state: "invalid",
        source,
        progress,
        message:
          "Данные формирования повреждены. Продолжение заблокировано; запись не удалена.",
      };
    }
    if (
      progress.project_id !== source.project.project_id ||
      shaping.project_id !== source.project.project_id
    ) {
      return mismatchInspection(
        source,
        progress,
        shaping,
        "PROJECT_ID_MISMATCH",
        "Формирование относится к другому проекту.",
      );
    }
    if (
      shaping.source_calculation_fingerprint !==
      source.calculation.fingerprint
    ) {
      return mismatchInspection(
        source,
        progress,
        shaping,
        "CALCULATION_FINGERPRINT_MISMATCH",
        "Расчёт проекта изменился после создания формирования.",
      );
    }
    if (shaping.source_section_id !== source.section.section_id) {
      return mismatchInspection(
        source,
        progress,
        shaping,
        "SOURCE_SECTION_ID_MISMATCH",
        "Источник формирования не совпадает с завершённым первым участком.",
      );
    }
    if (shaping.starting_stitch_count !== source.stitchCount) {
      return mismatchInspection(
        source,
        progress,
        shaping,
        "STITCH_COUNT_MISMATCH",
        "Количество петель после первого участка не совпадает с сохранённым формированием.",
      );
    }
    if (answers.shaping_required === false) {
      return mismatchInspection(
        source,
        progress,
        shaping,
        "SHAPING_INTENT_MISMATCH",
        "ProjectIntent конфликтует с уже созданным формированием.",
      );
    }
    return {
      state: "ready",
      source,
      progress: copy(progress),
      shaping: copy(shaping),
      nextQuestion:
        shaping.status === "collecting"
          ? readinessForSource(source, shaping.answers).nextQuestion
          : null,
    };
  }

  async function ensureForProject(repository, projectId) {
    let aggregate = await repository.getProject(projectId);
    let inspection = inspectAggregate(aggregate);
    if (
      inspection.state === "ready" ||
      inspection.state === "collecting" ||
      inspection.state === "declined"
    ) {
      return inspection;
    }
    if (inspection.state === "missing" && inspection.reason === "missing_progress") {
      await repository.ensureCalculationProgress(
        projectId,
        inspection.source.calculation.calculation_id,
        PROGRESS_KIND,
        { version: 0, initialized: false },
        { operationKind: "FIRST_SIMPLE_SHAPING_PROGRESS_CREATED" },
      );
      aggregate = await repository.getProject(projectId);
      inspection = inspectAggregate(aggregate);
    }
    if (inspection.state !== "missing" || inspection.reason !== "uninitialized") {
      throw errorFromInspection(inspection);
    }
    const timestamp = new Date().toISOString();
    const shaping = createShaping(aggregate, timestamp);
    await repository.updateCalculationProgress(
      projectId,
      inspection.source.calculation.calculation_id,
      PROGRESS_KIND,
      shaping,
      {
        baseProgressRevision: inspection.progress.revision,
        operationKind: "FIRST_SIMPLE_SHAPING_CREATED",
        projectStage: stageForStatus(shaping.status),
        timestamp,
      },
    );
    return loadForProject(repository, projectId);
  }

  async function loadForProject(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const inspection = inspectAggregate(aggregate);
    if (
      !["ready", "collecting", "declined"].includes(inspection.state)
    ) {
      throw errorFromInspection(inspection);
    }
    return inspection;
  }

  async function answerForProject(repository, projectId, questionId, value) {
    if (!QUESTION_DEFINITIONS[questionId]) {
      throw new FirstSimpleShapingError(
        "UNKNOWN_SHAPING_QUESTION",
        "Неизвестный вопрос формирования.",
      );
    }
    let aggregate = await repository.getProject(projectId);
    let inspection = inspectAggregate(aggregate);
    if (questionId === "shaping_required") {
      if (inspection.state === "ready") {
        throw new FirstSimpleShapingError(
          "SHAPING_ALREADY_CREATED",
          "Ответ о необходимости формирования уже сохранён.",
        );
      }
      if (!["collecting", "declined"].includes(inspection.state)) {
        throw errorFromInspection(inspection);
      }
      const normalized = normalizeAnswer(questionId, value);
      const answers = answersFromProjectIntent(inspection.source.projectIntent);
      answers.shaping_required = normalized;
      await saveIntentOnly(repository, inspection.source, answers);
      if (!normalized) {
        return loadForProject(repository, projectId);
      }
      return ensureForProject(repository, projectId);
    }
    if (inspection.state === "missing") {
      inspection = await ensureForProject(repository, projectId);
    }
    if (inspection.state !== "ready") {
      throw errorFromInspection(inspection);
    }
    const shaping = inspection.shaping;
    if (["in_progress", "completed"].includes(shaping.status)) {
      throw new FirstSimpleShapingError(
        "SHAPING_ALREADY_STARTED",
        "План формирования нельзя менять после начала.",
      );
    }
    const answers = copy(shaping.answers);
    answers[questionId] = normalizeAnswer(questionId, value);
    const readiness = readinessForSource(inspection.source, answers);
    const timestamp = new Date().toISOString();
    const next = applyReadiness(
      {
        ...shaping,
        revision: shaping.revision + 1,
        updated_at: timestamp,
        answers,
      },
      readiness,
    );
    await saveShaping(repository, inspection, next, {
      operationKind: "FIRST_SIMPLE_SHAPING_ANSWERED",
      projectStage: stageForStatus(next.status),
      projectDraftInput: projectDraftWithAnswers(inspection.source, answers),
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function startForProject(repository, projectId) {
    const inspection = await requireReadyInspection(repository, projectId);
    const shaping = inspection.shaping;
    if (["in_progress", "completed"].includes(shaping.status)) {
      return inspection;
    }
    if (shaping.status !== "ready") {
      throw new FirstSimpleShapingError(
        "SHAPING_NOT_READY",
        "Сначала ответь на необходимый вопрос или устрани причину блокировки.",
      );
    }
    const timestamp = new Date().toISOString();
    const next = {
      ...shaping,
      status: "in_progress",
      current_row: 1,
      current_stitch_count: shaping.starting_stitch_count,
      completed_decrease_events: 0,
      started_at: shaping.started_at ?? timestamp,
      updated_at: timestamp,
      revision: shaping.revision + 1,
    };
    await saveShaping(repository, inspection, next, {
      operationKind: "FIRST_SIMPLE_SHAPING_STARTED",
      projectStage: "first_simple_shaping_in_progress",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function completeCurrentRow(repository, projectId) {
    const inspection = await requireReadyInspection(repository, projectId);
    const shaping = inspection.shaping;
    if (shaping.status !== "in_progress") {
      throw new FirstSimpleShapingError(
        "SHAPING_NOT_IN_PROGRESS",
        "Ряд можно отметить только после начала формирования.",
      );
    }
    if (rowsProcessed(shaping)) {
      return inspection;
    }
    const isDecrease = shaping.decrease_rows.includes(shaping.current_row);
    const timestamp = new Date().toISOString();
    const next = {
      ...shaping,
      current_row: shaping.current_row + 1,
      current_stitch_count:
        shaping.current_stitch_count - (isDecrease ? 2 : 0),
      completed_decrease_events:
        shaping.completed_decrease_events + (isDecrease ? 1 : 0),
      updated_at: timestamp,
      revision: shaping.revision + 1,
    };
    await saveShaping(repository, inspection, next, {
      operationKind: "FIRST_SIMPLE_SHAPING_ROW_COMPLETED",
      projectStage: "first_simple_shaping_in_progress",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function decreaseCurrentRow(repository, projectId) {
    const inspection = await requireReadyInspection(repository, projectId);
    const shaping = inspection.shaping;
    if (shaping.status === "completed") {
      throw new FirstSimpleShapingError(
        "COMPLETED_SHAPING_CORRECTION_BLOCKED",
        "Завершённое формирование нельзя исправлять без явного возврата в работу.",
      );
    }
    if (shaping.status !== "in_progress") {
      throw new FirstSimpleShapingError(
        "SHAPING_NOT_IN_PROGRESS",
        "Исправить ряд можно только после начала формирования.",
      );
    }
    if (shaping.current_row <= 1) {
      return inspection;
    }
    const rowToUndo = shaping.current_row - 1;
    const isDecrease = shaping.decrease_rows.includes(rowToUndo);
    const timestamp = new Date().toISOString();
    const next = {
      ...shaping,
      current_row: rowToUndo,
      current_stitch_count:
        shaping.current_stitch_count + (isDecrease ? 2 : 0),
      completed_decrease_events:
        shaping.completed_decrease_events - (isDecrease ? 1 : 0),
      updated_at: timestamp,
      revision: shaping.revision + 1,
    };
    await saveShaping(repository, inspection, next, {
      operationKind: "FIRST_SIMPLE_SHAPING_ROW_CORRECTED",
      projectStage: "first_simple_shaping_in_progress",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  async function completeForProject(repository, projectId) {
    const inspection = await requireReadyInspection(repository, projectId);
    const shaping = inspection.shaping;
    if (shaping.status === "completed") {
      return inspection;
    }
    if (
      shaping.status !== "in_progress" ||
      !rowsProcessed(shaping) ||
      shaping.completed_decrease_events !== shaping.decrease_events_count ||
      shaping.current_stitch_count !== shaping.target_stitch_count
    ) {
      throw new FirstSimpleShapingError(
        "SHAPING_TARGET_NOT_REACHED",
        "Явно завершить формирование можно после всех рядов и всех запланированных убавлений.",
      );
    }
    const timestamp = new Date().toISOString();
    const next = {
      ...shaping,
      status: "completed",
      completed_at: shaping.completed_at ?? timestamp,
      updated_at: timestamp,
      revision: shaping.revision + 1,
    };
    await saveShaping(repository, inspection, next, {
      operationKind: "FIRST_SIMPLE_SHAPING_COMPLETED",
      projectStage: "first_simple_shaping_completed",
      timestamp,
    });
    return loadForProject(repository, projectId);
  }

  function currentInstruction(shaping) {
    if (!isValidShaping(shaping) || shaping.status === "blocked") {
      return "";
    }
    if (rowsProcessed(shaping)) {
      return "Все ряды выполнены. Проверь, что осталось запланированное число петель, и явно заверши этап.";
    }
    const decrease = shaping.decrease_rows.includes(shaping.current_row);
    const afterCount = shaping.current_stitch_count - (decrease ? 2 : 0);
    if (!decrease) {
      return (
        "Провяжи ряд без убавлений. " +
        `После ряда должно остаться ${afterCount} петель.`
      );
    }
    if (shaping.edge_stitches_mode === "with_edge_stitches") {
      return (
        "Провяжи кромочную, убавь 1 петлю. " +
        "Не доходя до последней кромочной, убавь ещё 1 петлю. " +
        "Провяжи кромочную. " +
        `После ряда должно остаться ${afterCount} петель.`
      );
    }
    return (
      "В этом ряду убавь 1 петлю у начала ряда и 1 петлю у конца ряда. " +
      `После ряда должно остаться ${afterCount} петель.`
    );
  }

  function rowsProcessed(shaping) {
    return (
      isRecord(shaping) &&
      positiveInteger(shaping.total_rows) &&
      shaping.current_row > shaping.total_rows
    );
  }

  function completedRowCount(shaping) {
    if (!isRecord(shaping) || shaping.current_row <= 0) {
      return 0;
    }
    return Math.min(shaping.current_row - 1, shaping.total_rows ?? 0);
  }

  function homeState(inspection, projectId) {
    const destination =
      `/shaping-assistant?project=${encodeURIComponent(projectId)}`;
    if (inspection?.state === "collecting") {
      return {
        label: "Определить формирование",
        summary: "Первый прямой участок завершён. Нужен один следующий ответ.",
        href: destination,
        stage: "Нужно определить формирование",
      };
    }
    if (inspection?.state === "declined") {
      return {
        label: "Открыть",
        summary: "Формирование сейчас не требуется",
        href: destination,
        stage: "Формирование не требуется",
      };
    }
    if (inspection?.state !== "ready") {
      return null;
    }
    const shaping = inspection.shaping;
    const labels = {
      collecting: "Уточнить формирование",
      ready: "Начать формирование",
      in_progress: "Продолжить",
      blocked: "Проверить формирование",
      completed: "Открыть",
    };
    const summaries = {
      collecting: "Для плана убавлений нужен один следующий ответ.",
      ready:
        `${shaping.decrease_events_count} событий убавления · ` +
        `${shaping.total_rows} рядов`,
      in_progress:
        `${completedRowCount(shaping)} из ${shaping.total_rows} рядов · ` +
        `${shaping.current_stitch_count} петель`,
      blocked: "Формирование заблокировано: данные не изменены.",
      completed: `Формирование завершено · ${shaping.target_stitch_count} петель`,
    };
    return {
      label: labels[shaping.status],
      summary: summaries[shaping.status],
      href: destination,
      stage: {
        collecting: "Нужно уточнить формирование",
        ready: "Формирование готово",
        in_progress: "Формирование в работе",
        blocked: "Формирование заблокировано",
        completed: "Формирование завершено",
      }[shaping.status],
    };
  }

  function answersFromProjectIntent(intent) {
    const saved = isRecord(intent?.first_simple_shaping)
      ? intent.first_simple_shaping
      : isRecord(intent?.firstSimpleShaping)
        ? intent.firstSimpleShaping
        : {};
    const answers = {};
    assignBoolean(
      answers,
      "shaping_required",
      saved.shaping_required ?? saved.shapingRequired ?? saved.required,
    );
    const target = integerOrNull(
      saved.target_stitch_count ?? saved.targetStitchCount,
    );
    const rows = integerOrNull(saved.total_rows ?? saved.totalRows);
    if (target !== null) {
      answers.target_stitch_count = target;
    }
    if (rows !== null) {
      answers.total_rows = rows;
    }
    const edgeMode =
      saved.edge_stitches_mode ??
      saved.edgeStitchesMode ??
      (typeof saved.include_edge_stitches === "boolean"
        ? saved.include_edge_stitches
          ? "with_edge_stitches"
          : "without_edge_stitches"
        : null);
    if (edgeMode !== null && edgeMode !== undefined) {
      answers.edge_stitches_mode = edgeMode;
    }
    copyOptionalField(answers, saved, "direction");
    copyOptionalField(answers, saved, "operation");
    copyOptionalField(answers, saved, "stitches_per_side");
    copyOptionalField(answers, saved, "complex_shaping");
    copyOptionalField(answers, saved, "shaping_type");
    copyOptionalField(answers, saved, "custom_pattern_requires_adaptation");
    copyOptionalField(
      answers,
      saved,
      "source_calculation_fingerprint",
    );
    copyOptionalField(answers, saved, "source_section_id");
    copyOptionalField(answers, saved, "source_project_id");
    copyOptionalField(answers, saved, "starting_stitch_count");
    return answers;
  }

  function shapingSource(aggregate) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      throw new FirstSimpleShapingError(
        "INVALID_PROJECT",
        "Запись проекта повреждена. Данные не изменены.",
      );
    }
    if (!text(project.active_calculation_id)) {
      throw new FirstSimpleShapingError(
        "CALCULATION_MISSING",
        "В проекте нет активного сохранённого расчёта.",
      );
    }
    const calculation = (Array.isArray(aggregate.calculations)
      ? aggregate.calculations
      : []
    ).find((entry) => entry?.calculation_id === project.active_calculation_id);
    if (!isRecord(calculation) || !text(calculation.fingerprint)) {
      throw new FirstSimpleShapingError(
        "CALCULATION_FINGERPRINT_MISSING",
        "У активного расчёта отсутствует fingerprint.",
      );
    }
    const sectionApi = globalObject.YarnAIFirstFabricSection;
    if (!sectionApi?.inspectAggregate) {
      throw new FirstSimpleShapingError(
        "FIRST_FABRIC_SECTION_MODULE_MISSING",
        "Модуль первого участка недоступен.",
      );
    }
    const sectionInspection = sectionApi.inspectAggregate(aggregate);
    if (
      sectionInspection.state !== "ready" ||
      sectionInspection.section.status !== "completed"
    ) {
      throw new FirstSimpleShapingError(
        sectionInspection.state === "invalid"
          ? "SOURCE_SECTION_INVALID"
          : "SOURCE_SECTION_MISSING",
        sectionInspection.message ||
          "Сначала явно заверши первый прямой участок полотна.",
      );
    }
    const section = sectionInspection.section;
    if (!positiveInteger(section.source_stitch_count)) {
      throw new FirstSimpleShapingError(
        "SOURCE_STITCH_COUNT_INVALID",
        "Число петель завершённого участка повреждено.",
      );
    }
    const structured = isRecord(calculation.request) ? calculation.request : {};
    const draft =
      isRecord(project.draft_input) && project.draft_input.kind === structured.kind
        ? project.draft_input
        : structured;
    const projectIntent = isRecord(draft.project_intent)
      ? draft.project_intent
      : isRecord(structured.project_intent)
        ? structured.project_intent
        : {};
    return {
      project,
      calculation,
      section,
      stitchCount: section.source_stitch_count,
      structured,
      draft,
      projectIntent,
    };
  }

  function readinessForSource(source, answers) {
    return evaluateReadiness({
      sourceSectionPresent: true,
      sourceSectionValid: true,
      sourceSectionMatches:
        !answers.source_section_id ||
        answers.source_section_id === source.section.section_id,
      projectMatches:
        !answers.source_project_id ||
        answers.source_project_id === source.project.project_id,
      fingerprintMatches:
        !answers.source_calculation_fingerprint ||
        answers.source_calculation_fingerprint ===
          source.calculation.fingerprint,
      stitchCountMatches:
        answers.starting_stitch_count === undefined ||
        answers.starting_stitch_count === source.stitchCount,
      knittingMode: source.section.knitting_mode,
      startingStitchCount: source.stitchCount,
      targetStitchCount: answers.target_stitch_count,
      totalRows: answers.total_rows,
      edgeStitchesMode: answers.edge_stitches_mode,
      complexShaping: incompatibleComplexShaping(answers),
      customPatternRequiresAdaptation:
        source.section.fabric_type === "custom" ||
        answers.custom_pattern_requires_adaptation === true,
    });
  }

  function incompatibleComplexShaping(answers) {
    if (answers.complex_shaping === true) {
      return true;
    }
    if (
      answers.direction !== undefined &&
      !["symmetric", "both_sides"].includes(answers.direction)
    ) {
      return true;
    }
    if (
      answers.operation !== undefined &&
      !["decrease", "decreases"].includes(answers.operation)
    ) {
      return true;
    }
    if (
      answers.stitches_per_side !== undefined &&
      answers.stitches_per_side !== 1
    ) {
      return true;
    }
    return [
      "increase",
      "one_sided",
      "bind_off",
      "short_rows",
      "raglan",
      "sleeve_cap",
      "neckline",
      "armhole",
    ].includes(answers.shaping_type);
  }

  function applyReadiness(shaping, readiness) {
    const plan = readiness.plan;
    return {
      ...shaping,
      status: readiness.status,
      target_stitch_count:
        integerOrNull(shaping.answers.target_stitch_count),
      total_rows: integerOrNull(shaping.answers.total_rows),
      total_stitches_to_decrease:
        plan?.totalStitchesToDecrease ?? null,
      decrease_events_count: plan?.decreaseEventsCount ?? null,
      decrease_rows: plan ? copy(plan.decreaseRows) : [],
      edge_stitches_mode: shaping.answers.edge_stitches_mode ?? null,
      warnings: copy(readiness.warnings),
      blockers: copy(readiness.blockers),
    };
  }

  function projectDraftWithAnswers(source, answers) {
    const draft = copy(
      isRecord(source.draft) && Object.keys(source.draft).length
        ? source.draft
        : source.structured,
    );
    const intent = copy(
      isRecord(draft.project_intent)
        ? draft.project_intent
        : source.projectIntent,
    );
    intent.first_simple_shaping = {
      shaping_required:
        typeof answers.shaping_required === "boolean"
          ? answers.shaping_required
          : null,
      target_stitch_count: integerOrNull(answers.target_stitch_count),
      total_rows: integerOrNull(answers.total_rows),
      edge_stitches_mode: answers.edge_stitches_mode ?? null,
      source_calculation_fingerprint: source.calculation.fingerprint,
      source_section_id: source.section.section_id,
      source_project_id: source.project.project_id,
      starting_stitch_count: source.stitchCount,
    };
    for (const key of [
      "direction",
      "operation",
      "stitches_per_side",
      "complex_shaping",
      "shaping_type",
      "custom_pattern_requires_adaptation",
    ]) {
      if (answers[key] !== undefined) {
        intent.first_simple_shaping[key] = copy(answers[key]);
      }
    }
    draft.project_intent = intent;
    return draft;
  }

  async function saveIntentOnly(repository, source, answers) {
    await repository.updateProject(
      source.project.project_id,
      {
        draft_input: projectDraftWithAnswers(source, answers),
        has_unfinished_calculation: false,
      },
      { baseRevision: source.project.revision },
    );
  }

  async function saveShaping(repository, inspection, shaping, options) {
    await repository.updateCalculationProgress(
      inspection.source.project.project_id,
      inspection.source.calculation.calculation_id,
      PROGRESS_KIND,
      shaping,
      {
        baseProgressRevision: inspection.progress.revision,
        ...options,
      },
    );
  }

  async function requireReadyInspection(repository, projectId) {
    const inspection = await loadForProject(repository, projectId);
    if (inspection.state !== "ready") {
      throw new FirstSimpleShapingError(
        "SHAPING_PROGRESS_MISSING",
        "Состояние формирования ещё не создано.",
      );
    }
    return inspection;
  }

  function normalizeAnswer(questionId, value) {
    if (questionId === "shaping_required") {
      if (value === true || value === "true") {
        return true;
      }
      if (value === false || value === "false") {
        return false;
      }
    }
    if (["target_stitch_count", "total_rows"].includes(questionId)) {
      const number = typeof value === "number" ? value : Number(value);
      if (Number.isSafeInteger(number)) {
        return number;
      }
    }
    if (
      questionId === "edge_stitches_mode" &&
      EDGE_STITCHES_MODES.includes(value)
    ) {
      return value;
    }
    throw new FirstSimpleShapingError(
      "INVALID_SHAPING_ANSWER",
      "Ответ имеет неверный формат. Значение не было изменено.",
    );
  }

  function isValidShaping(value) {
    if (
      !isRecord(value) ||
      value.version !== VERSION ||
      value.type !== PROGRESS_KIND ||
      !text(value.id) ||
      !text(value.project_id) ||
      !positiveInteger(value.revision) ||
      !text(value.source_calculation_fingerprint) ||
      !text(value.source_section_id) ||
      !STATUSES.includes(value.status) ||
      value.title !== TITLE ||
      !["flat", "round"].includes(value.knitting_mode) ||
      !positiveInteger(value.starting_stitch_count) ||
      !Array.isArray(value.decrease_rows) ||
      !Array.isArray(value.warnings) ||
      !Array.isArray(value.blockers) ||
      !isRecord(value.answers) ||
      !isTimestamp(value.created_at) ||
      !isTimestamp(value.updated_at) ||
      !nullableTimestamp(value.started_at) ||
      !nullableTimestamp(value.completed_at) ||
      !Number.isInteger(value.current_row) ||
      value.current_row < 0 ||
      !positiveInteger(value.current_stitch_count) ||
      !Number.isInteger(value.completed_decrease_events) ||
      value.completed_decrease_events < 0
    ) {
      return false;
    }
    if (
      !value.warnings.every(validNotice) ||
      !value.blockers.every(validNotice)
    ) {
      return false;
    }
    if (["collecting", "blocked"].includes(value.status)) {
      return (
        value.current_row === 0 &&
        value.current_stitch_count === value.starting_stitch_count &&
        value.completed_decrease_events === 0 &&
        value.started_at === null &&
        value.completed_at === null
      );
    }
    if (value.status === "ready") {
      if (
        value.current_row !== 0 ||
        value.current_stitch_count !== value.starting_stitch_count ||
        value.completed_decrease_events !== 0 ||
        value.started_at !== null ||
        value.completed_at !== null
      ) {
        return false;
      }
    }
    let plan;
    try {
      plan = calculateDecreasePlan({
        startingStitchCount: value.starting_stitch_count,
        targetStitchCount: value.target_stitch_count,
        totalRows: value.total_rows,
      });
    } catch {
      return false;
    }
    if (
      value.total_stitches_to_decrease !== plan.totalStitchesToDecrease ||
      value.decrease_events_count !== plan.decreaseEventsCount ||
      !sameArray(value.decrease_rows, plan.decreaseRows) ||
      !EDGE_STITCHES_MODES.includes(value.edge_stitches_mode)
    ) {
      return false;
    }
    if (["in_progress", "completed"].includes(value.status)) {
      const expectedEvents = value.decrease_rows.filter(
        (row) => row < value.current_row,
      ).length;
      if (
        value.current_row < 1 ||
        value.current_row > value.total_rows + 1 ||
        value.completed_decrease_events !== expectedEvents ||
        value.current_stitch_count !==
          value.starting_stitch_count - expectedEvents * 2 ||
        !isTimestamp(value.started_at)
      ) {
        return false;
      }
    }
    if (value.status === "in_progress" && value.completed_at !== null) {
      return false;
    }
    return value.status !== "completed" ||
      (value.current_row === value.total_rows + 1 &&
        value.completed_decrease_events === value.decrease_events_count &&
        value.current_stitch_count === value.target_stitch_count &&
        isTimestamp(value.completed_at));
  }

  function mismatchInspection(source, progress, shaping, code, message) {
    return {
      state: "mismatch",
      source,
      progress,
      shaping,
      code,
      message: `${message} Продолжение заблокировано; данные не изменены.`,
    };
  }

  function inspectionFromError(error) {
    return {
      state:
        error?.code === "SOURCE_SECTION_MISSING" ? "missing_source" : "invalid",
      code: error?.code ?? "FIRST_SIMPLE_SHAPING_UNAVAILABLE",
      message:
        error?.userMessage ||
        "Формирование недоступно. Сохранённые данные не изменены.",
    };
  }

  function errorFromInspection(inspection) {
    const codes = {
      missing: "FIRST_SIMPLE_SHAPING_MISSING",
      missing_source: "FIRST_SIMPLE_SHAPING_SOURCE_MISSING",
      invalid: "FIRST_SIMPLE_SHAPING_INVALID",
      unsupported: "FIRST_SIMPLE_SHAPING_UNSUPPORTED",
      mismatch: "FIRST_SIMPLE_SHAPING_MISMATCH",
    };
    return new FirstSimpleShapingError(
      codes[inspection.state] ?? "FIRST_SIMPLE_SHAPING_UNAVAILABLE",
      inspection.message || "Формирование недоступно.",
      inspection.code ? { reason: inspection.code } : {},
    );
  }

  function stageForStatus(status) {
    return `first_simple_shaping_${status}`;
  }

  function isPlaceholder(value) {
    return isRecord(value) && value.version === 0 && value.initialized === false;
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  function integerOrNull(value) {
    return Number.isSafeInteger(value) ? value : null;
  }

  function text(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

  function validNotice(value) {
    return isRecord(value) && Boolean(text(value.code)) && Boolean(text(value.message));
  }

  function sameArray(left, right) {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }

  function assignBoolean(target, key, value) {
    if (typeof value === "boolean") {
      target[key] = value;
    }
  }

  function copyOptionalField(target, source, key) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = copy(source[key]);
    }
  }

  function copy(value) {
    return value === undefined
      ? undefined
      : JSON.parse(JSON.stringify(value));
  }

  const api = {
    VERSION,
    PROGRESS_KIND,
    TITLE,
    METHOD_WARNING,
    EDGE_STITCHES_MODES,
    QUESTION_DEFINITIONS,
    FirstSimpleShapingError,
    distributeDecreaseRows,
    calculateDecreasePlan,
    evaluateReadiness,
    createShaping,
    inspectAggregate,
    ensureForProject,
    loadForProject,
    answerForProject,
    startForProject,
    completeCurrentRow,
    decreaseCurrentRow,
    completeForProject,
    currentInstruction,
    rowsProcessed,
    completedRowCount,
    homeState,
    answersFromProjectIntent,
    isValidShaping,
  };

  globalObject.YarnAIFirstSimpleShaping = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
