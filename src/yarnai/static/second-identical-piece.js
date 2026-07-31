"use strict";

(function exposeSecondIdenticalPiece(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "SECOND_IDENTICAL_PIECE";
  const SHAPING_KIND = "FIRST_SIMPLE_SHAPING";
  const BIND_OFF_KIND = "FIRST_BIND_OFF";
  const STATUSES = Object.freeze([
    "collecting",
    "ready",
    "in_progress",
    "blocked",
    "completed",
  ]);
  const STEPS = Object.freeze([
    "preparation",
    "cast_on",
    "shaping",
    "bind_off",
    "secure_last_stitch",
    "completed",
  ]);
  const CHECKLIST = Object.freeze([
    {
      id: "identical_piece",
      label: "Вторая деталь должна быть полностью такой же.",
      blockerCode: "NON_IDENTICAL_PIECE_REQUESTED",
    },
    {
      id: "same_yarn",
      label: "Используется та же пряжа.",
      blockerCode: "YARN_CHANGED",
    },
    {
      id: "same_needles",
      label: "Используются те же спицы.",
      blockerCode: "NEEDLES_CHANGED",
    },
    {
      id: "same_gauge",
      label: "Плотность вязания не изменилась.",
      blockerCode: "GAUGE_CHANGED",
    },
    {
      id: "separate_progress",
      label: "Я понимаю, что прогресс второй детали будет отдельным.",
      blockerCode: "SEPARATE_PROGRESS_NOT_CONFIRMED",
    },
  ]);
  const BLOCKER_MESSAGES = Object.freeze({
    PROJECT_MISSING:
      "Проект не найден. Открой сохранённый проект с завершённой первой деталью.",
    FIRST_PIECE_NOT_COMPLETED:
      "Первая деталь ещё не завершена явно. Сначала заверши закрытие и закрепи последнюю петлю.",
    INVALID_PROJECT_STAGE:
      "Проект не находится на этапе завершённой первой детали. Автоматический повтор не начат.",
    SHAPING_PROGRESS_MISSING:
      "Не найден сохранённый план формирования первой детали.",
    SHAPING_NOT_COMPLETED:
      "Формирование первой детали ещё не завершено явно.",
    SHAPING_PROGRESS_DAMAGED:
      "Данные формирования первой детали повреждены. Автоматический повтор заблокирован.",
    BIND_OFF_PROGRESS_MISSING:
      "Не найдено завершённое закрытие петель первой детали.",
    BIND_OFF_NOT_COMPLETED:
      "Закрытие петель первой детали ещё не завершено явно.",
    BIND_OFF_PROGRESS_DAMAGED:
      "Данные закрытия первой детали повреждены. Автоматический повтор заблокирован.",
    SOURCE_PROJECT_ID_CONFLICT:
      "Сохранённые этапы относятся к разным проектам.",
    SOURCE_SECTION_CONFLICT:
      "Формирование и закрытие относятся к разным участкам детали.",
    SOURCE_REVISION_CONFLICT:
      "Исходный этап изменился после подготовки второй детали.",
    SOURCE_FINGERPRINT_CONFLICT:
      "Контрольный отпечаток первой детали больше не совпадает с сохранённым источником.",
    SOURCE_STITCH_COUNT_CONFLICT:
      "Количество петель между формированием и закрытием не совпадает.",
    SHAPING_PLAN_DAMAGED:
      "Сохранённый план формирования повреждён или противоречив.",
    SOURCE_ACTION_HISTORY_DAMAGED:
      "История действий первой детали повреждена или неполна.",
    SOURCE_COMPLETED_STATE_CONFLICT:
      "Завершённое состояние первой детали противоречит истории действий.",
    SECOND_PIECE_DIFFERENT_FINGERPRINT:
      "Для этого проекта уже существует вторая деталь с другим планом.",
    SECOND_PIECE_FINGERPRINT_CONFLICT:
      "Контрольный отпечаток плана второй детали повреждён.",
    NON_IDENTICAL_PIECE_REQUESTED:
      "Автоматический повтор доступен только для полностью идентичной детали.",
    MIRRORED_PIECE_UNSUPPORTED:
      "Зеркальная деталь пока не поддерживается. Нельзя безопасно повторить план без изменений.",
    SIZE_CHANGE_UNSUPPORTED:
      "Размер второй детали нельзя менять в автоматическом повторе.",
    GAUGE_CHANGED:
      "Плотность изменилась. Нужен новый расчёт, поэтому автоматический повтор заблокирован.",
    NEEDLES_CHANGED:
      "Спицы изменились. Вторая деталь больше не считается идентичной.",
    YARN_CHANGED:
      "Пряжа изменилась. Вторая деталь больше не считается идентичной.",
    UNSUPPORTED_CONSTRUCTION:
      "Для второй детали требуется неподдерживаемая конструкция.",
    SEPARATE_PROGRESS_NOT_CONFIRMED:
      "Подтверди, что прогресс второй детали будет отдельным.",
    SECOND_PIECE_DATA_DAMAGED:
      "Сохранённый прогресс второй детали повреждён. Он не был сброшен.",
  });

  class SecondIdenticalPieceError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "SecondIdenticalPieceError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = details;
    }
  }

  function inspectAggregate(aggregate, requirements = {}) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      return blockedInspection("PROJECT_MISSING");
    }
    const calculation = activeCalculation(aggregate, project);
    if (!calculation) {
      return blockedInspection("PROJECT_MISSING", { project });
    }
    const matches = progressMatches(
      aggregate,
      PROGRESS_KIND,
      calculation.calculation_id,
    );
    if (matches.length > 1) {
      return blockedInspection("SECOND_PIECE_DATA_DAMAGED", {
        project,
        calculation,
      });
    }
    if (matches.length === 1 && !isPlaceholder(matches[0].state)) {
      if (
        text(requirements.expectedFingerprint) &&
        requirements.expectedFingerprint !== matches[0].state?.fingerprint
      ) {
        return blockedInspection(
          "SECOND_PIECE_DIFFERENT_FINGERPRINT",
          {
            project,
            calculation,
            progress: matches[0],
            secondPiece: matches[0].state,
          },
        );
      }
      return inspectExisting(
        aggregate,
        project,
        calculation,
        matches[0],
      );
    }
    const sourceResult = buildSourceSnapshot(aggregate, {
      requireFirstPieceStage: true,
    });
    if (!sourceResult.ok) {
      return blockedInspection(sourceResult.code, {
        project,
        calculation,
        progress: matches[0] ?? null,
      });
    }
    const difference = requestedDifference(requirements);
    if (difference) {
      return blockedInspection(difference, {
        project,
        calculation,
        source: sourceResult.source,
        progress: matches[0] ?? null,
      });
    }
    return {
      state: "missing",
      project,
      calculation,
      progress: matches[0] ?? null,
      source: sourceResult.source,
    };
  }

  function buildSourceSnapshot(
    aggregate,
    { requireFirstPieceStage = true } = {},
  ) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      return failure("PROJECT_MISSING");
    }
    const calculation = activeCalculation(aggregate, project);
    if (!calculation) {
      return failure("PROJECT_MISSING");
    }
    if (
      requireFirstPieceStage &&
      project.current_stage !== "first_piece_completed"
    ) {
      return failure(
        !project.current_stage ||
          String(project.current_stage).startsWith("first_")
          ? "FIRST_PIECE_NOT_COMPLETED"
          : "INVALID_PROJECT_STAGE",
      );
    }
    const shapingMatches = progressMatches(
      aggregate,
      SHAPING_KIND,
      calculation.calculation_id,
    );
    if (!shapingMatches.length) {
      return failure("SHAPING_PROGRESS_MISSING");
    }
    if (shapingMatches.length !== 1) {
      return failure("SHAPING_PROGRESS_DAMAGED");
    }
    const shapingProgress = shapingMatches[0];
    const shaping = shapingProgress.state;
    if (shaping?.status && shaping.status !== "completed") {
      return failure("SHAPING_NOT_COMPLETED");
    }
    if (
      shaping?.status === "completed" &&
      (!isTimestamp(shaping.completed_at) ||
        shaping.current_row !== shaping.total_rows + 1 ||
        shaping.current_stitch_count !== shaping.target_stitch_count ||
        shaping.completed_decrease_events !== shaping.decrease_events_count)
    ) {
      return failure("SOURCE_COMPLETED_STATE_CONFLICT");
    }
    const shapingApi = globalObject.YarnAIFirstSimpleShaping;
    if (!shapingApi?.isValidShaping?.(shaping)) {
      return failure(
        looksLikeDamagedPlan(shaping)
          ? "SHAPING_PLAN_DAMAGED"
          : "SHAPING_PROGRESS_DAMAGED",
      );
    }
    if (shaping.status !== "completed") {
      return failure("SHAPING_NOT_COMPLETED");
    }
    const bindMatches = progressMatches(
      aggregate,
      BIND_OFF_KIND,
      calculation.calculation_id,
    );
    if (!bindMatches.length) {
      return failure("BIND_OFF_PROGRESS_MISSING");
    }
    if (bindMatches.length !== 1) {
      return failure("BIND_OFF_PROGRESS_DAMAGED");
    }
    const bindProgress = bindMatches[0];
    const bindOff = bindProgress.state;
    if (bindOff?.status && bindOff.status !== "completed") {
      return failure("BIND_OFF_NOT_COMPLETED");
    }
    if (
      bindOff?.status === "completed" &&
      (!isTimestamp(bindOff.completed_at) ||
        bindOff.current_stitch_count !== 0 ||
        bindOff.remaining_stitch_count !== 0 ||
        bindOff.bound_off_stitch_count !== bindOff.initial_stitch_count)
    ) {
      return failure("SOURCE_COMPLETED_STATE_CONFLICT");
    }
    const bindApi = globalObject.YarnAIFirstBindOff;
    if (!bindApi?.isValidBindOff?.(bindOff)) {
      return failure("BIND_OFF_PROGRESS_DAMAGED");
    }
    if (bindOff.status !== "completed") {
      return failure("BIND_OFF_NOT_COMPLETED");
    }
    if (
      project.project_id !== shapingProgress.project_id ||
      project.project_id !== bindProgress.project_id ||
      project.project_id !== shaping.project_id ||
      project.project_id !== bindOff.project_id
    ) {
      return failure("SOURCE_PROJECT_ID_CONFLICT");
    }
    if (
      shaping.source_section_id !== bindOff.section_id ||
      bindOff.source_progress_type !== SHAPING_KIND
    ) {
      return failure("SOURCE_SECTION_CONFLICT");
    }
    if (
      bindOff.source_progress_revision !== shapingProgress.revision
    ) {
      return failure("SOURCE_REVISION_CONFLICT");
    }
    if (
      shaping.source_calculation_fingerprint !== calculation.fingerprint ||
      bindOff.source_calculation_fingerprint !== calculation.fingerprint
    ) {
      return failure("SOURCE_FINGERPRINT_CONFLICT");
    }
    if (
      shaping.starting_stitch_count <= shaping.target_stitch_count ||
      shaping.current_stitch_count !== shaping.target_stitch_count ||
      bindOff.source_stitch_count !== shaping.target_stitch_count ||
      bindOff.initial_stitch_count !== shaping.target_stitch_count
    ) {
      return failure("SOURCE_STITCH_COUNT_CONFLICT");
    }
    if (
      bindOff.current_stitch_count !== 0 ||
      bindOff.remaining_stitch_count !== 0 ||
      bindOff.bound_off_stitch_count !== bindOff.initial_stitch_count
    ) {
      return failure("SOURCE_COMPLETED_STATE_CONFLICT");
    }
    if (
      !isTimestamp(shaping.completed_at) ||
      !isTimestamp(bindOff.completed_at)
    ) {
      return failure("SOURCE_COMPLETED_STATE_CONFLICT");
    }
    if (!validSourceHistories(aggregate, shapingProgress, bindProgress)) {
      return failure("SOURCE_ACTION_HISTORY_DAMAGED");
    }
    if (
      requireFirstPieceStage &&
      project.current_stage !== "first_piece_completed"
    ) {
      return failure(
        bindOff.status === "completed"
          ? "INVALID_PROJECT_STAGE"
          : "FIRST_PIECE_NOT_COMPLETED",
      );
    }
    const shapingPlan = {
      totalRows: shaping.total_rows,
      decreaseEventsCount: shaping.decrease_events_count,
      decreaseRows: copy(shaping.decrease_rows),
      stitchesPerEvent: 2,
      edgeStitchesMode: shaping.edge_stitches_mode,
      knittingMode: shaping.knitting_mode,
    };
    if (!validShapingPlan(shapingPlan, shaping)) {
      return failure("SHAPING_PLAN_DAMAGED");
    }
    const shapingFingerprint = sourceFingerprint("shaping", {
      projectId: project.project_id,
      calculationFingerprint: calculation.fingerprint,
      progressRevision: shapingProgress.revision,
      section: shaping.source_section_id,
      initialStitchCount: shaping.starting_stitch_count,
      targetStitchCount: shaping.target_stitch_count,
      plan: shapingPlan,
      completedAt: shaping.completed_at,
    });
    const bindOffFingerprint = sourceFingerprint("bind-off", {
      projectId: project.project_id,
      calculationFingerprint: calculation.fingerprint,
      progressRevision: bindProgress.revision,
      sourceProgressRevision: bindOff.source_progress_revision,
      section: bindOff.section_id,
      stitchCount: bindOff.initial_stitch_count,
      method: "ordinary_sequential",
      stitchInstructionMode: bindOff.stitch_instruction_mode,
      completedActions: bindOff.completed_actions,
      completedAt: bindOff.completed_at,
    });
    return {
      ok: true,
      source: {
        projectId: project.project_id,
        projectTitle: project.title,
        sourceProjectRevision: project.revision,
        projectStage: "first_piece_completed",
        calculationId: calculation.calculation_id,
        calculationFingerprint: calculation.fingerprint,
        section: shaping.source_section_id,
        sectionLabel: shaping.title,
        initialStitchCount: shaping.starting_stitch_count,
        targetStitchCount: shaping.target_stitch_count,
        shaping: {
          type: SHAPING_KIND,
          progressRevision: shapingProgress.revision,
          stateRevision: shaping.revision,
          fingerprint: shapingFingerprint,
          section: shaping.source_section_id,
          completedAt: shaping.completed_at,
          plan: shapingPlan,
        },
        bindOff: {
          type: BIND_OFF_KIND,
          progressRevision: bindProgress.revision,
          stateRevision: bindOff.revision,
          fingerprint: bindOffFingerprint,
          section: bindOff.section_id,
          stitchCountBeforeBindOff: bindOff.initial_stitch_count,
          finalMethod: "ordinary_sequential",
          stitchInstructionMode: bindOff.stitch_instruction_mode,
          completedAt: bindOff.completed_at,
          explicitlyConfirmed: true,
        },
      },
    };
  }

  function createProgress(source, now = new Date().toISOString()) {
    if (!validSourceSnapshot(source)) {
      throw stateError(
        "SECOND_PIECE_SOURCE_INVALID",
        "Не удалось создать безопасный снимок первой детали.",
      );
    }
    const plan = planFromSource(source);
    const progress = {
      type: PROGRESS_KIND,
      projectId: source.projectId,
      version: VERSION,
      revision: 1,
      status: "ready",
      fingerprint: planFingerprint(source, plan),
      source: copy(source),
      plan,
      checklist: CHECKLIST.map((item) => ({
        id: item.id,
        label: item.label,
        required: true,
        confirmed: false,
        confirmedAt: null,
      })),
      currentStep: "preparation",
      completedSteps: [],
      completedShapingEvents: [],
      shapingHistory: [],
      bindOffHistory: [],
      currentStitchCount: source.initialStitchCount,
      lastStitchSecured: false,
      blockers: [],
      warnings: [
        notice(
          "IDENTICAL_REPEAT_ONLY",
          "План второй детали зафиксирован по завершённой первой детали и не меняет её историю.",
        ),
      ],
      actionHistory: [],
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    };
    requireValidProgress(progress);
    return progress;
  }

  function startProgress(
    progress,
    checklistIds,
    actionId,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    if (idempotent(progress, actionId)) {
      return copy(progress);
    }
    requireStatus(progress, "ready");
    const confirmed = new Set(
      Array.isArray(checklistIds) ? checklistIds : [],
    );
    const missing = CHECKLIST.filter((item) => !confirmed.has(item.id));
    if (missing.length) {
      throw stateError(
        "SECOND_PIECE_CHECKLIST_INCOMPLETE",
        "Подтверди все пять условий идентичного повтора.",
        { missing: missing.map((item) => item.id) },
      );
    }
    const next = {
      ...copy(progress),
      status: "in_progress",
      checklist: progress.checklist.map((item) => ({
        ...item,
        confirmed: true,
        confirmedAt: now,
      })),
      currentStep: "cast_on",
      completedSteps: ["preparation"],
      startedAt: now,
      updatedAt: now,
      revision: progress.revision + 1,
      actionHistory: appendAction(progress, actionId, "SECOND_PIECE_STARTED", now),
    };
    requireValidProgress(next);
    return next;
  }

  function confirmCastOn(
    progress,
    stitchCount,
    actionId,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    if (idempotent(progress, actionId)) {
      return copy(progress);
    }
    requireCurrentStep(progress, "cast_on");
    const count = integer(stitchCount);
    if (count !== progress.plan.initialStitchCount) {
      throw stateError(
        "CAST_ON_STITCH_COUNT_MISMATCH",
        `Нужно подтвердить набор ровно ${progress.plan.initialStitchCount} петель.`,
      );
    }
    const next = {
      ...copy(progress),
      currentStep: "shaping",
      completedSteps: unique([...progress.completedSteps, "cast_on"]),
      updatedAt: now,
      revision: progress.revision + 1,
      actionHistory: appendAction(progress, actionId, "CAST_ON_CONFIRMED", now, {
        stitchCount: count,
      }),
    };
    requireValidProgress(next);
    return next;
  }

  function completeShapingEvent(
    progress,
    eventId,
    actionId,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    if (idempotent(progress, actionId)) {
      return copy(progress);
    }
    requireCurrentStep(progress, "shaping");
    const expected =
      progress.plan.shapingEvents[progress.completedShapingEvents.length];
    if (!expected) {
      throw stateError(
        "SHAPING_ALREADY_FINISHED",
        "Все сохранённые события формирования уже выполнены.",
      );
    }
    if (text(eventId) !== expected.id) {
      throw stateError(
        "SHAPING_EVENT_OUT_OF_ORDER",
        "Нельзя пропустить событие формирования. Выполни текущий шаг по порядку.",
      );
    }
    const before = progress.currentStitchCount;
    const after = before - expected.stitchesToDecrease;
    const shapingAction = {
      actionId: requiredActionId(actionId),
      eventId: expected.id,
      eventIndex: expected.index,
      row: expected.row,
      stitchCountBefore: before,
      stitchCountAfter: after,
      createdAt: now,
    };
    const completedEvents = [
      ...progress.completedShapingEvents,
      expected.id,
    ];
    const allDone =
      completedEvents.length === progress.plan.shapingEvents.length;
    if (
      after < progress.plan.targetStitchCount ||
      (allDone && after !== progress.plan.targetStitchCount)
    ) {
      throw stateError(
        "SHAPING_PLAN_DAMAGED",
        BLOCKER_MESSAGES.SHAPING_PLAN_DAMAGED,
      );
    }
    const next = {
      ...copy(progress),
      completedShapingEvents: completedEvents,
      shapingHistory: [...copy(progress.shapingHistory), shapingAction],
      currentStitchCount: after,
      completedSteps: allDone
        ? unique([...progress.completedSteps, "shaping"])
        : copy(progress.completedSteps),
      updatedAt: now,
      revision: progress.revision + 1,
      actionHistory: appendAction(
        progress,
        actionId,
        "SHAPING_EVENT_COMPLETED",
        now,
        { eventId: expected.id, stitchCountBefore: before, stitchCountAfter: after },
      ),
    };
    requireValidProgress(next);
    return next;
  }

  function undoLastShapingEvent(
    progress,
    actionId,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    if (idempotent(progress, actionId)) {
      return copy(progress);
    }
    requireCurrentStep(progress, "shaping");
    if (!progress.shapingHistory.length) {
      throw stateError(
        "NO_SHAPING_EVENT_TO_UNDO",
        "Пока нет события формирования, которое можно исправить.",
      );
    }
    const history = copy(progress.shapingHistory);
    const last = history.pop();
    const completedEvents = copy(progress.completedShapingEvents);
    completedEvents.pop();
    const next = {
      ...copy(progress),
      shapingHistory: history,
      completedShapingEvents: completedEvents,
      currentStitchCount: last.stitchCountBefore,
      completedSteps: progress.completedSteps.filter(
        (step) => step !== "shaping",
      ),
      updatedAt: now,
      revision: progress.revision + 1,
      actionHistory: appendAction(
        progress,
        actionId,
        "SHAPING_EVENT_CORRECTED",
        now,
        { eventId: last.eventId, revertedActionId: last.actionId },
      ),
    };
    requireValidProgress(next);
    return next;
  }

  function startBindOff(
    progress,
    actionId,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    if (idempotent(progress, actionId)) {
      return copy(progress);
    }
    requireCurrentStep(progress, "shaping");
    if (
      progress.completedShapingEvents.length !==
        progress.plan.shapingEvents.length ||
      progress.currentStitchCount !== progress.plan.targetStitchCount
    ) {
      throw stateError(
        "SHAPING_NOT_FINISHED",
        "Сначала выполни все события сохранённого формирования.",
      );
    }
    const next = {
      ...copy(progress),
      currentStep: "bind_off",
      updatedAt: now,
      revision: progress.revision + 1,
      actionHistory: appendAction(progress, actionId, "BIND_OFF_STARTED", now),
    };
    requireValidProgress(next);
    return next;
  }

  function addBindOff(
    progress,
    amount,
    actionId,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    if (idempotent(progress, actionId)) {
      return copy(progress);
    }
    requireCurrentStep(progress, "bind_off");
    const count = integer(amount);
    if (!count || count < 1) {
      throw stateError(
        "INVALID_BIND_OFF_AMOUNT",
        "Укажи положительное целое число закрытых петель.",
      );
    }
    if (count > progress.currentStitchCount) {
      throw stateError(
        "BIND_OFF_AMOUNT_EXCEEDS_REMAINING",
        "Нельзя закрыть больше петель, чем осталось на спице.",
      );
    }
    const before = progress.currentStitchCount;
    const after = before - count;
    const entry = {
      actionId: requiredActionId(actionId),
      amount: count,
      stitchCountBefore: before,
      stitchCountAfter: after,
      createdAt: now,
    };
    const next = {
      ...copy(progress),
      bindOffHistory: [...copy(progress.bindOffHistory), entry],
      currentStitchCount: after,
      currentStep: after === 0 ? "secure_last_stitch" : "bind_off",
      completedSteps:
        after === 0
          ? unique([...progress.completedSteps, "bind_off"])
          : copy(progress.completedSteps),
      updatedAt: now,
      revision: progress.revision + 1,
      actionHistory: appendAction(
        progress,
        actionId,
        "BIND_OFF_RECORDED",
        now,
        { amount: count, stitchCountBefore: before, stitchCountAfter: after },
      ),
    };
    requireValidProgress(next);
    return next;
  }

  function undoLastBindOff(
    progress,
    actionId,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    if (idempotent(progress, actionId)) {
      return copy(progress);
    }
    if (!["bind_off", "secure_last_stitch"].includes(progress.currentStep)) {
      requireCurrentStep(progress, "bind_off");
    }
    if (!progress.bindOffHistory.length) {
      throw stateError(
        "NO_BIND_OFF_ACTION_TO_UNDO",
        "Пока нет закрытия, которое можно исправить.",
      );
    }
    const history = copy(progress.bindOffHistory);
    const last = history.pop();
    const next = {
      ...copy(progress),
      bindOffHistory: history,
      currentStitchCount: last.stitchCountBefore,
      currentStep: "bind_off",
      completedSteps: progress.completedSteps.filter(
        (step) => step !== "bind_off",
      ),
      updatedAt: now,
      revision: progress.revision + 1,
      actionHistory: appendAction(
        progress,
        actionId,
        "BIND_OFF_CORRECTED",
        now,
        { amount: last.amount, revertedActionId: last.actionId },
      ),
    };
    requireValidProgress(next);
    return next;
  }

  function completeProgress(
    progress,
    explicitlyConfirmed,
    actionId,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    if (idempotent(progress, actionId)) {
      return copy(progress);
    }
    requireCurrentStep(progress, "secure_last_stitch");
    if (!explicitlyConfirmed) {
      throw stateError(
        "LAST_STITCH_NOT_CONFIRMED",
        "Подтверди, что последняя петля закреплена.",
      );
    }
    if (progress.currentStitchCount !== 0) {
      throw stateError(
        "BIND_OFF_STITCHES_REMAIN",
        "Завершить вторую деталь можно только после закрытия всех петель.",
      );
    }
    const next = {
      ...copy(progress),
      status: "completed",
      currentStep: "completed",
      lastStitchSecured: true,
      completedSteps: unique([
        ...progress.completedSteps,
        "secure_last_stitch",
        "completed",
      ]),
      updatedAt: now,
      completedAt: now,
      revision: progress.revision + 1,
      actionHistory: appendAction(
        progress,
        actionId,
        "SECOND_PIECE_COMPLETED",
        now,
        { lastStitchSecured: true },
      ),
    };
    requireValidProgress(next);
    return next;
  }

  function restoreProgress(serialized) {
    let value;
    try {
      value =
        typeof serialized === "string"
          ? JSON.parse(serialized)
          : copy(serialized);
    } catch {
      throw stateError(
        "SECOND_PIECE_DATA_DAMAGED",
        BLOCKER_MESSAGES.SECOND_PIECE_DATA_DAMAGED,
      );
    }
    requireValidProgress(value);
    return value;
  }

  function isValidProgress(value) {
    if (
      !isRecord(value) ||
      value.type !== PROGRESS_KIND ||
      value.version !== VERSION ||
      !text(value.projectId) ||
      !positiveInteger(value.revision) ||
      !STATUSES.includes(value.status) ||
      !text(value.fingerprint) ||
      !validSourceSnapshot(value.source) ||
      !validPlan(value.plan, value.source) ||
      value.fingerprint !== planFingerprint(value.source, value.plan) ||
      !validChecklist(value.checklist) ||
      !STEPS.includes(value.currentStep) ||
      !Array.isArray(value.completedSteps) ||
      !value.completedSteps.every((step) => STEPS.includes(step)) ||
      new Set(value.completedSteps).size !== value.completedSteps.length ||
      !Array.isArray(value.completedShapingEvents) ||
      !Array.isArray(value.shapingHistory) ||
      !Array.isArray(value.bindOffHistory) ||
      !Array.isArray(value.blockers) ||
      !Array.isArray(value.warnings) ||
      !Array.isArray(value.actionHistory) ||
      !value.blockers.every(validNotice) ||
      !value.warnings.every(validNotice) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt) ||
      !nullableTimestamp(value.startedAt) ||
      !nullableTimestamp(value.completedAt) ||
      typeof value.lastStitchSecured !== "boolean" ||
      !Number.isSafeInteger(value.currentStitchCount) ||
      value.currentStitchCount < 0 ||
      value.currentStitchCount > value.plan.initialStitchCount
    ) {
      return false;
    }
    if (!validProgressHistories(value)) {
      return false;
    }
    if (value.status === "ready") {
      return (
        value.currentStep === "preparation" &&
        value.completedSteps.length === 0 &&
        value.currentStitchCount === value.plan.initialStitchCount &&
        value.checklist.every((item) => !item.confirmed) &&
        value.startedAt === null &&
        value.completedAt === null &&
        !value.lastStitchSecured &&
        !value.blockers.length
      );
    }
    if (value.status === "blocked") {
      return value.blockers.length > 0 && value.completedAt === null;
    }
    if (value.status !== "in_progress" && value.status !== "completed") {
      return false;
    }
    if (
      !isTimestamp(value.startedAt) ||
      !value.checklist.every((item) => item.confirmed)
    ) {
      return false;
    }
    if (value.status === "in_progress") {
      return (
        value.completedAt === null &&
        !value.lastStitchSecured &&
        value.currentStep !== "completed"
      );
    }
    return (
      value.currentStep === "completed" &&
      value.currentStitchCount === 0 &&
      value.lastStitchSecured &&
      isTimestamp(value.completedAt) &&
      ["secure_last_stitch", "completed"].every((step) =>
        value.completedSteps.includes(step),
      )
    );
  }

  async function ensureForProject(repository, projectId, requirements = {}) {
    let aggregate = await repository.getProject(projectId);
    let inspection = inspectAggregate(aggregate, requirements);
    if (inspection.state === "ready") {
      return inspection;
    }
    const calculation = inspection.calculation;
    if (!calculation) {
      throw errorFromInspection(inspection);
    }
    if (!inspection.progress) {
      await repository.ensureCalculationProgress(
        projectId,
        calculation.calculation_id,
        PROGRESS_KIND,
        { version: 0, initialized: false },
        { operationKind: "SECOND_IDENTICAL_PIECE_PROGRESS_CREATED" },
      );
      aggregate = await repository.getProject(projectId);
      inspection = inspectAggregate(aggregate, requirements);
    }
    if (inspection.state === "blocked") {
      throw errorFromInspection(inspection);
    }
    const now = new Date().toISOString();
    const state = createProgress(inspection.source, now);
    await repository.updateCalculationProgress(
      projectId,
      calculation.calculation_id,
      PROGRESS_KIND,
      state,
      {
        baseProgressRevision: inspection.progress.revision,
        operationKind: "SECOND_IDENTICAL_PIECE_CREATED",
        projectStage: "first_piece_completed",
        timestamp: now,
      },
    );
    return loadForProject(repository, projectId);
  }

  async function loadForProject(repository, projectId) {
    const inspection = inspectAggregate(await repository.getProject(projectId));
    if (inspection.state !== "ready") {
      throw errorFromInspection(inspection);
    }
    return inspection;
  }

  async function startForProject(
    repository,
    projectId,
    checklistIds,
    actionId = makeActionId(),
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) => startProgress(state, checklistIds, actionId),
      "SECOND_IDENTICAL_PIECE_STARTED",
      "second_piece_in_progress",
    );
  }

  async function confirmCastOnForProject(
    repository,
    projectId,
    stitchCount,
    actionId = makeActionId(),
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) => confirmCastOn(state, stitchCount, actionId),
      "SECOND_IDENTICAL_PIECE_CAST_ON_CONFIRMED",
      "second_piece_in_progress",
    );
  }

  async function completeShapingEventForProject(
    repository,
    projectId,
    eventId,
    actionId = makeActionId(),
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) => completeShapingEvent(state, eventId, actionId),
      "SECOND_IDENTICAL_PIECE_SHAPING_EVENT_COMPLETED",
      "second_piece_in_progress",
    );
  }

  async function undoShapingForProject(
    repository,
    projectId,
    actionId = makeActionId(),
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) => undoLastShapingEvent(state, actionId),
      "SECOND_IDENTICAL_PIECE_SHAPING_EVENT_CORRECTED",
      "second_piece_in_progress",
    );
  }

  async function startBindOffForProject(
    repository,
    projectId,
    actionId = makeActionId(),
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) => startBindOff(state, actionId),
      "SECOND_IDENTICAL_PIECE_BIND_OFF_STARTED",
      "second_piece_in_progress",
    );
  }

  async function addBindOffForProject(
    repository,
    projectId,
    amount,
    actionId = makeActionId(),
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) => addBindOff(state, amount, actionId),
      "SECOND_IDENTICAL_PIECE_BIND_OFF_RECORDED",
      "second_piece_in_progress",
    );
  }

  async function undoBindOffForProject(
    repository,
    projectId,
    actionId = makeActionId(),
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) => undoLastBindOff(state, actionId),
      "SECOND_IDENTICAL_PIECE_BIND_OFF_CORRECTED",
      "second_piece_in_progress",
    );
  }

  async function completeForProject(
    repository,
    projectId,
    explicitlyConfirmed,
    actionId = makeActionId(),
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) =>
        completeProgress(state, explicitlyConfirmed, actionId),
      "SECOND_IDENTICAL_PIECE_COMPLETED",
      "second_piece_completed",
    );
  }

  async function reportDifferenceForProject(
    repository,
    projectId,
    difference,
    actionId = makeActionId(),
  ) {
    const definitions = {
      non_identical: "NON_IDENTICAL_PIECE_REQUESTED",
      mirrored: "MIRRORED_PIECE_UNSUPPORTED",
      size: "SIZE_CHANGE_UNSUPPORTED",
      gauge: "GAUGE_CHANGED",
      needles: "NEEDLES_CHANGED",
      yarn: "YARN_CHANGED",
      construction: "UNSUPPORTED_CONSTRUCTION",
    };
    const code = definitions[difference];
    if (!code) {
      throw stateError(
        "UNKNOWN_SECOND_PIECE_DIFFERENCE",
        "Не удалось распознать отличие второй детали.",
      );
    }
    return mutateForProject(
      repository,
      projectId,
      (state) => blockProgress(state, code, actionId),
      "SECOND_IDENTICAL_PIECE_DIFFERENCE_REPORTED",
      "second_piece_blocked",
    );
  }

  async function mutateForProject(
    repository,
    projectId,
    mutator,
    operationKind,
    projectStage,
  ) {
    const inspection = await loadForProject(repository, projectId);
    const next = mutator(inspection.secondPiece);
    if (next.revision === inspection.secondPiece.revision) {
      return inspection;
    }
    await repository.updateCalculationProgress(
      projectId,
      inspection.calculation.calculation_id,
      PROGRESS_KIND,
      next,
      {
        baseProgressRevision: inspection.progress.revision,
        operationKind,
        projectStage,
        timestamp: next.updatedAt,
      },
    );
    return loadForProject(repository, projectId);
  }

  function inspectExisting(
    aggregate,
    project,
    calculation,
    progress,
  ) {
    const secondPiece = progress.state;
    if (!isRecord(secondPiece)) {
      return blockedInspection("SECOND_PIECE_DATA_DAMAGED", {
        project,
        calculation,
        progress,
      });
    }
    if (
      isRecord(secondPiece.source) &&
      isRecord(secondPiece.plan) &&
      text(secondPiece.fingerprint) &&
      secondPiece.fingerprint !==
        planFingerprint(secondPiece.source, secondPiece.plan)
    ) {
      return blockedInspection("SECOND_PIECE_FINGERPRINT_CONFLICT", {
        project,
        calculation,
        progress,
        secondPiece,
      });
    }
    if (!isValidProgress(secondPiece)) {
      return blockedInspection("SECOND_PIECE_DATA_DAMAGED", {
        project,
        calculation,
        progress,
        secondPiece,
      });
    }
    if (
      progress.project_id !== project.project_id ||
      secondPiece.projectId !== project.project_id
    ) {
      return blockedInspection("SOURCE_PROJECT_ID_CONFLICT", {
        project,
        calculation,
        progress,
        secondPiece,
      });
    }
    const sourceResult = buildSourceSnapshot(aggregate, {
      requireFirstPieceStage: false,
    });
    if (!sourceResult.ok) {
      return blockedInspection(sourceResult.code, {
        project,
        calculation,
        progress,
        secondPiece,
      });
    }
    const mismatch = snapshotMismatch(secondPiece.source, sourceResult.source);
    if (mismatch) {
      return blockedInspection(mismatch, {
        project,
        calculation,
        progress,
        secondPiece,
      });
    }
    const currentFingerprint = planFingerprint(
      sourceResult.source,
      planFromSource(sourceResult.source),
    );
    if (currentFingerprint !== secondPiece.fingerprint) {
      return blockedInspection("SECOND_PIECE_DIFFERENT_FINGERPRINT", {
        project,
        calculation,
        progress,
        secondPiece,
      });
    }
    const allowedStages = {
      ready: ["first_piece_completed"],
      in_progress: ["second_piece_in_progress"],
      blocked: ["second_piece_blocked", "second_piece_in_progress"],
      completed: ["second_piece_completed"],
    };
    if (
      !allowedStages[secondPiece.status]?.includes(project.current_stage)
    ) {
      return blockedInspection("INVALID_PROJECT_STAGE", {
        project,
        calculation,
        progress,
        secondPiece,
      });
    }
    return {
      state: "ready",
      project,
      calculation,
      progress: copy(progress),
      source: copy(secondPiece.source),
      secondPiece: copy(secondPiece),
    };
  }

  function snapshotMismatch(saved, current) {
    if (
      saved.projectId !== current.projectId ||
      saved.shaping?.section !== current.shaping?.section ||
      saved.bindOff?.section !== current.bindOff?.section
    ) {
      return saved.projectId !== current.projectId
        ? "SOURCE_PROJECT_ID_CONFLICT"
        : "SOURCE_SECTION_CONFLICT";
    }
    if (
      saved.shaping.progressRevision !== current.shaping.progressRevision ||
      saved.bindOff.progressRevision !== current.bindOff.progressRevision ||
      saved.shaping.stateRevision !== current.shaping.stateRevision ||
      saved.bindOff.stateRevision !== current.bindOff.stateRevision
    ) {
      return "SOURCE_REVISION_CONFLICT";
    }
    if (
      saved.calculationFingerprint !== current.calculationFingerprint ||
      saved.shaping.fingerprint !== current.shaping.fingerprint ||
      saved.bindOff.fingerprint !== current.bindOff.fingerprint
    ) {
      return "SOURCE_FINGERPRINT_CONFLICT";
    }
    if (
      saved.initialStitchCount !== current.initialStitchCount ||
      saved.targetStitchCount !== current.targetStitchCount ||
      saved.bindOff.stitchCountBeforeBindOff !==
        current.bindOff.stitchCountBeforeBindOff
    ) {
      return "SOURCE_STITCH_COUNT_CONFLICT";
    }
    return null;
  }

  function planFromSource(source) {
    return {
      immutable: true,
      section: source.section,
      initialStitchCount: source.initialStitchCount,
      targetStitchCount: source.targetStitchCount,
      shapingPlan: copy(source.shaping.plan),
      shapingEvents: source.shaping.plan.decreaseRows.map((row, index) => ({
        id: `decrease-${index + 1}-row-${row}`,
        index,
        row,
        stitchesToDecrease: source.shaping.plan.stitchesPerEvent,
      })),
      bindOffStitchCount: source.bindOff.stitchCountBeforeBindOff,
      bindOffMethod: source.bindOff.finalMethod,
      stitchInstructionMode: source.bindOff.stitchInstructionMode,
      steps: [
        "Подготовка.",
        `Набор ${source.initialStitchCount} петель.`,
        "Простое формирование по сохранённому плану.",
        `Закрытие ${source.bindOff.stitchCountBeforeBindOff} петель тем же способом.`,
        "Подтверждение закрепления последней петли.",
        "Завершение второй детали.",
      ],
    };
  }

  function planFingerprint(source, plan = planFromSource(source)) {
    return sourceFingerprint("second-identical-piece", {
      projectId: source.projectId,
      section: source.section,
      initialStitchCount: source.initialStitchCount,
      targetStitchCount: source.targetStitchCount,
      shapingPlan: plan.shapingPlan,
      bindOffStitchCount: plan.bindOffStitchCount,
      bindOffMethod: plan.bindOffMethod,
      shapingProgressRevision: source.shaping.progressRevision,
      shapingStateRevision: source.shaping.stateRevision,
      shapingFingerprint: source.shaping.fingerprint,
      bindOffProgressRevision: source.bindOff.progressRevision,
      bindOffStateRevision: source.bindOff.stateRevision,
      bindOffFingerprint: source.bindOff.fingerprint,
    });
  }

  function sourceFingerprint(namespace, value) {
    const canonical = stableStringify({ namespace, value });
    const salts = [
      "cbf29ce484222325",
      "84222325cbf29ce4",
      "9e3779b185ebca87",
      "d6e8feb86659fd93",
    ];
    return salts
      .map((salt) => fnv64(`${salt}:${canonical}`))
      .join("");
  }

  function validSourceSnapshot(source) {
    return (
      isRecord(source) &&
      Boolean(text(source.projectId)) &&
      Boolean(text(source.projectTitle)) &&
      positiveInteger(source.sourceProjectRevision) &&
      source.projectStage === "first_piece_completed" &&
      Boolean(text(source.calculationId)) &&
      Boolean(text(source.calculationFingerprint)) &&
      Boolean(text(source.section)) &&
      Boolean(text(source.sectionLabel)) &&
      positiveInteger(source.initialStitchCount) &&
      positiveInteger(source.targetStitchCount) &&
      source.initialStitchCount > source.targetStitchCount &&
      isRecord(source.shaping) &&
      source.shaping.type === SHAPING_KIND &&
      positiveInteger(source.shaping.progressRevision) &&
      positiveInteger(source.shaping.stateRevision) &&
      Boolean(text(source.shaping.fingerprint)) &&
      source.shaping.section === source.section &&
      isTimestamp(source.shaping.completedAt) &&
      validShapingPlan(source.shaping.plan, {
        starting_stitch_count: source.initialStitchCount,
        target_stitch_count: source.targetStitchCount,
      }) &&
      isRecord(source.bindOff) &&
      source.bindOff.type === BIND_OFF_KIND &&
      positiveInteger(source.bindOff.progressRevision) &&
      positiveInteger(source.bindOff.stateRevision) &&
      Boolean(text(source.bindOff.fingerprint)) &&
      source.bindOff.section === source.section &&
      source.bindOff.stitchCountBeforeBindOff ===
        source.targetStitchCount &&
      source.bindOff.finalMethod === "ordinary_sequential" &&
      ["as_presented", "match_last_row"].includes(
        source.bindOff.stitchInstructionMode,
      ) &&
      isTimestamp(source.bindOff.completedAt) &&
      source.bindOff.explicitlyConfirmed === true
    );
  }

  function validPlan(plan, source) {
    return (
      isRecord(plan) &&
      plan.immutable === true &&
      plan.section === source.section &&
      plan.initialStitchCount === source.initialStitchCount &&
      plan.targetStitchCount === source.targetStitchCount &&
      stableStringify(plan.shapingPlan) ===
        stableStringify(source.shaping.plan) &&
      Array.isArray(plan.shapingEvents) &&
      plan.shapingEvents.length === source.shaping.plan.decreaseEventsCount &&
      plan.shapingEvents.every(
        (event, index) =>
          isRecord(event) &&
          event.id ===
            `decrease-${index + 1}-row-${source.shaping.plan.decreaseRows[index]}` &&
          event.index === index &&
          event.row === source.shaping.plan.decreaseRows[index] &&
          event.stitchesToDecrease === source.shaping.plan.stitchesPerEvent,
      ) &&
      plan.bindOffStitchCount === source.targetStitchCount &&
      plan.bindOffMethod === "ordinary_sequential" &&
      plan.stitchInstructionMode === source.bindOff.stitchInstructionMode &&
      Array.isArray(plan.steps) &&
      plan.steps.length === 6
    );
  }

  function validShapingPlan(plan, shaping) {
    if (
      !isRecord(plan) ||
      !positiveInteger(plan.totalRows) ||
      !positiveInteger(plan.decreaseEventsCount) ||
      !Array.isArray(plan.decreaseRows) ||
      plan.decreaseRows.length !== plan.decreaseEventsCount ||
      plan.stitchesPerEvent !== 2 ||
      !["with_edge_stitches", "without_edge_stitches"].includes(
        plan.edgeStitchesMode,
      ) ||
      plan.knittingMode !== "flat"
    ) {
      return false;
    }
    let previous = 0;
    for (const row of plan.decreaseRows) {
      if (
        !positiveInteger(row) ||
        row > plan.totalRows ||
        row <= previous
      ) {
        return false;
      }
      previous = row;
    }
    return (
      shaping.starting_stitch_count -
        plan.decreaseEventsCount * plan.stitchesPerEvent ===
      shaping.target_stitch_count
    );
  }

  function validProgressHistories(progress) {
    const eventIds = new Set();
    let shapingCount = progress.plan.initialStitchCount;
    for (const [index, action] of progress.shapingHistory.entries()) {
      const event = progress.plan.shapingEvents[index];
      if (
        !isRecord(action) ||
        !event ||
        action.eventId !== event.id ||
        action.eventIndex !== event.index ||
        action.row !== event.row ||
        !text(action.actionId) ||
        eventIds.has(action.actionId) ||
        action.stitchCountBefore !== shapingCount ||
        action.stitchCountAfter !==
          shapingCount - event.stitchesToDecrease ||
        !isTimestamp(action.createdAt)
      ) {
        return false;
      }
      eventIds.add(action.actionId);
      shapingCount = action.stitchCountAfter;
    }
    if (
      progress.completedShapingEvents.length !==
        progress.shapingHistory.length ||
      progress.completedShapingEvents.some(
        (id, index) => id !== progress.shapingHistory[index].eventId,
      )
    ) {
      return false;
    }
    let bindCount =
      progress.shapingHistory.length === progress.plan.shapingEvents.length
        ? progress.plan.targetStitchCount
        : shapingCount;
    for (const action of progress.bindOffHistory) {
      if (
        !isRecord(action) ||
        !text(action.actionId) ||
        eventIds.has(action.actionId) ||
        !positiveInteger(action.amount) ||
        action.stitchCountBefore !== bindCount ||
        action.stitchCountAfter !== bindCount - action.amount ||
        action.stitchCountAfter < 0 ||
        !isTimestamp(action.createdAt)
      ) {
        return false;
      }
      eventIds.add(action.actionId);
      bindCount = action.stitchCountAfter;
    }
    const expectedCurrent = progress.bindOffHistory.length
      ? bindCount
      : shapingCount;
    if (progress.currentStitchCount !== expectedCurrent) {
      return false;
    }
    const auditIds = new Set();
    for (const action of progress.actionHistory) {
      if (
        !isRecord(action) ||
        !text(action.actionId) ||
        auditIds.has(action.actionId) ||
        !text(action.kind) ||
        !isTimestamp(action.createdAt)
      ) {
        return false;
      }
      auditIds.add(action.actionId);
    }
    return true;
  }

  function validChecklist(checklist) {
    return (
      Array.isArray(checklist) &&
      checklist.length === CHECKLIST.length &&
      checklist.every((item, index) => {
        const expected = CHECKLIST[index];
        return (
          isRecord(item) &&
          item.id === expected.id &&
          item.label === expected.label &&
          item.required === true &&
          typeof item.confirmed === "boolean" &&
          nullableTimestamp(item.confirmedAt) &&
          item.confirmed === Boolean(item.confirmedAt)
        );
      })
    );
  }

  function validSourceHistories(
    aggregate,
    shapingProgress,
    bindProgress,
  ) {
    const operations = Array.isArray(aggregate?.operations)
      ? aggregate.operations
      : [];
    return (
      validCompletedOperation(
        operations,
        SHAPING_KIND,
        shapingProgress,
        "FIRST_SIMPLE_SHAPING_COMPLETED",
      ) &&
      validCompletedOperation(
        operations,
        BIND_OFF_KIND,
        bindProgress,
        "FIRST_BIND_OFF_COMPLETED",
      )
    );
  }

  function validCompletedOperation(
    operations,
    kind,
    progress,
    completedKind,
  ) {
    const relevant = operations.filter(
      (operation) =>
        operation?.payload?.progress_kind === kind &&
        operation?.payload?.progress_id === progress.progress_id,
    );
    if (!relevant.length) {
      return false;
    }
    const last = relevant[relevant.length - 1];
    return (
      last.kind === completedKind &&
      last.payload.progress_revision === progress.revision &&
      stableStringify(last.payload.progress_state) ===
        stableStringify(progress.state)
    );
  }

  function blockProgress(
    progress,
    code,
    actionId,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    if (idempotent(progress, actionId)) {
      return copy(progress);
    }
    if (progress.status === "completed") {
      throw stateError(
        "SECOND_PIECE_COMPLETED",
        "Завершённую вторую деталь нельзя изменить.",
      );
    }
    const next = {
      ...copy(progress),
      status: "blocked",
      blockers: [notice(code, BLOCKER_MESSAGES[code])],
      updatedAt: now,
      revision: progress.revision + 1,
      actionHistory: appendAction(
        progress,
        actionId,
        "SECOND_PIECE_BLOCKED",
        now,
        { blockerCode: code },
      ),
    };
    requireValidProgress(next);
    return next;
  }

  function requestedDifference(requirements) {
    if (requirements.mirrored === true) {
      return "MIRRORED_PIECE_UNSUPPORTED";
    }
    if (requirements.sizeChanged === true) {
      return "SIZE_CHANGE_UNSUPPORTED";
    }
    if (requirements.gaugeChanged === true) {
      return "GAUGE_CHANGED";
    }
    if (requirements.needlesChanged === true) {
      return "NEEDLES_CHANGED";
    }
    if (requirements.yarnChanged === true) {
      return "YARN_CHANGED";
    }
    if (requirements.unsupportedConstruction === true) {
      return "UNSUPPORTED_CONSTRUCTION";
    }
    if (requirements.identical === false) {
      return "NON_IDENTICAL_PIECE_REQUESTED";
    }
    return null;
  }

  function homeState(inspection, projectId) {
    if (!inspection) {
      return null;
    }
    const href =
      `/second-piece-assistant?project=${encodeURIComponent(projectId)}`;
    if (inspection.state === "blocked") {
      return {
        href,
        label: "Проверить повтор второй детали",
        stage: "Повтор второй детали заблокирован",
        summary: inspection.message,
      };
    }
    if (inspection.state === "missing") {
      return {
        href,
        label: "Связать вторую такую же деталь",
        stage: "Первая деталь завершена",
        summary:
          "Размеры, плотность и проверенный план первой детали будут использованы без повторного ввода.",
      };
    }
    if (inspection.state !== "ready") {
      return null;
    }
    const progress = inspection.secondPiece;
    if (progress.status === "completed") {
      return {
        href,
        label: "Открыть вторую деталь",
        stage: "Вторая одинаковая деталь готова",
        summary: "Вторая одинаковая деталь готова.",
      };
    }
    if (progress.status === "in_progress") {
      return {
        href,
        label: "Продолжить вторую деталь",
        stage: "Вторая деталь в работе",
        summary: progressSummary(progress),
      };
    }
    return {
      href,
      label: "Связать вторую такую же деталь",
      stage: "Повтор второй детали готов",
      summary: "Проверенный план первой детали сохранён отдельно.",
    };
  }

  function progressSummary(progress) {
    const labels = {
      preparation: "Проверь условия идентичного повтора.",
      cast_on: `Подтверди набор ${progress.plan.initialStitchCount} петель.`,
      shaping:
        `Формирование: ${progress.completedShapingEvents.length} из ` +
        `${progress.plan.shapingEvents.length} событий.`,
      bind_off: `Закрытие: осталось ${progress.currentStitchCount} петель.`,
      secure_last_stitch:
        "Все петли закрыты. Осталось подтвердить закрепление последней петли.",
      completed: "Вторая одинаковая деталь готова.",
    };
    return labels[progress.currentStep] ?? "";
  }

  function nextShapingEvent(progress) {
    if (!isValidProgress(progress) || progress.currentStep !== "shaping") {
      return null;
    }
    return copy(
      progress.plan.shapingEvents[progress.completedShapingEvents.length] ??
        null,
    );
  }

  function activeCalculation(aggregate, project) {
    return (Array.isArray(aggregate?.calculations)
      ? aggregate.calculations
      : []
    ).find(
      (entry) =>
        entry?.calculation_id === project.active_calculation_id &&
        text(entry.fingerprint),
    );
  }

  function progressMatches(aggregate, kind, calculationId) {
    return (Array.isArray(aggregate?.progress)
      ? aggregate.progress
      : []
    ).filter(
      (entry) =>
        entry?.kind === kind &&
        entry?.calculation_id === calculationId &&
        entry?.epoch === 1,
    );
  }

  function looksLikeDamagedPlan(shaping) {
    return Boolean(
      isRecord(shaping) &&
        shaping.type === SHAPING_KIND &&
        shaping.status === "completed",
    );
  }

  function blockedInspection(code, details = {}) {
    const message =
      BLOCKER_MESSAGES[code] ?? "Повтор второй детали сейчас недоступен.";
    return {
      state: "blocked",
      status: "blocked",
      code,
      message,
      blockers: [notice(code, message)],
      ...details,
    };
  }

  function failure(code) {
    return { ok: false, code };
  }

  function errorFromInspection(inspection) {
    return stateError(
      inspection?.code ?? "SECOND_PIECE_UNAVAILABLE",
      inspection?.message ?? "Повтор второй детали сейчас недоступен.",
    );
  }

  function requireValidProgress(progress) {
    if (!isValidProgress(progress)) {
      throw stateError(
        "SECOND_PIECE_DATA_DAMAGED",
        BLOCKER_MESSAGES.SECOND_PIECE_DATA_DAMAGED,
      );
    }
  }

  function requireStatus(progress, status) {
    if (progress.status === "completed") {
      throw stateError(
        "SECOND_PIECE_COMPLETED",
        "Завершённую вторую деталь нельзя изменить.",
      );
    }
    if (progress.status === "blocked") {
      throw stateError(
        "SECOND_PIECE_BLOCKED",
        progress.blockers[0]?.message ||
          "Повтор второй детали заблокирован.",
      );
    }
    if (progress.status !== status) {
      throw stateError(
        "SECOND_PIECE_INVALID_STATUS",
        "Это действие недоступно на текущем этапе.",
      );
    }
  }

  function requireCurrentStep(progress, step) {
    requireStatus(progress, "in_progress");
    if (progress.currentStep !== step) {
      throw stateError(
        "SECOND_PIECE_STEP_OUT_OF_ORDER",
        "Сначала правильно заверши текущий этап.",
      );
    }
  }

  function stateError(code, message, details = {}) {
    return new SecondIdenticalPieceError(code, message, details);
  }

  function appendAction(progress, actionId, kind, createdAt, details = {}) {
    return [
      ...copy(progress.actionHistory),
      {
        actionId: requiredActionId(actionId),
        kind,
        createdAt,
        ...copy(details),
      },
    ];
  }

  function idempotent(progress, actionId) {
    const id = requiredActionId(actionId);
    return progress.actionHistory.some((entry) => entry.actionId === id);
  }

  function requiredActionId(actionId) {
    const id = text(actionId);
    if (!id) {
      throw stateError(
        "SECOND_PIECE_ACTION_ID_MISSING",
        "Не удалось безопасно сохранить действие. Попробуй ещё раз.",
      );
    }
    return id;
  }

  function makeActionId() {
    if (globalObject.YarnAIProjectSystem?.uuidv7) {
      return globalObject.YarnAIProjectSystem.uuidv7();
    }
    if (globalObject.crypto?.randomUUID) {
      return globalObject.crypto.randomUUID();
    }
    return `second-piece:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  }

  function isPlaceholder(value) {
    return isRecord(value) && value.version === 0 && value.initialized === false;
  }

  function notice(code, message) {
    return { code, message };
  }

  function validNotice(value) {
    return (
      isRecord(value) &&
      Boolean(text(value.code)) &&
      Boolean(text(value.message))
    );
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  function integer(value) {
    const normalized = typeof value === "number" ? value : Number(value);
    return Number.isSafeInteger(normalized) ? normalized : null;
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

  function text(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function copy(value) {
    return value === undefined
      ? undefined
      : JSON.parse(JSON.stringify(value));
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
    }
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(value[key])}`,
      )
      .join(",")}}`;
  }

  function fnv64(value) {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= BigInt(value.charCodeAt(index));
      hash = BigInt.asUintN(64, hash * prime);
    }
    return hash.toString(16).padStart(16, "0");
  }

  const api = {
    VERSION,
    PROGRESS_KIND,
    SHAPING_KIND,
    BIND_OFF_KIND,
    STATUSES,
    STEPS,
    CHECKLIST,
    BLOCKER_MESSAGES,
    SecondIdenticalPieceError,
    inspectAggregate,
    buildSourceSnapshot,
    createProgress,
    startProgress,
    confirmCastOn,
    completeShapingEvent,
    undoLastShapingEvent,
    startBindOff,
    addBindOff,
    undoLastBindOff,
    completeProgress,
    restoreProgress,
    isValidProgress,
    ensureForProject,
    loadForProject,
    startForProject,
    confirmCastOnForProject,
    completeShapingEventForProject,
    undoShapingForProject,
    startBindOffForProject,
    addBindOffForProject,
    undoBindOffForProject,
    completeForProject,
    reportDifferenceForProject,
    planFromSource,
    planFingerprint,
    sourceFingerprint,
    homeState,
    progressSummary,
    nextShapingEvent,
    makeActionId,
  };

  globalObject.YarnAISecondIdenticalPiece = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
