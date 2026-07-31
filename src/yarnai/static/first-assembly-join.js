"use strict";

(function exposeFirstAssemblyJoin(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "FIRST_ASSEMBLY_JOIN";
  const PREPARATION_KIND = "FIRST_ASSEMBLY_PREPARATION";
  const SUPPORTED_OPERATION = "join_two_identical_straight_edges";
  const UNIT_TYPE = "edge_stitch";
  const STATUSES = Object.freeze([
    "ready",
    "in_progress",
    "blocked",
    "completed",
  ]);
  const USER_CHECKLIST_IDS = Object.freeze([
    "edges_aligned",
    "edge_start_marked",
    "working_thread_ready",
  ]);
  const CHECKLIST = Object.freeze([
    {
      id: "preparation_completed",
      label: "Подготовка Stage 12A завершена.",
      source: "system",
    },
    {
      id: "operation_supported",
      label: "Соединение двух одинаковых прямых краёв поддерживается.",
      source: "system",
    },
    {
      id: "edges_aligned",
      label: "Края совмещены друг с другом.",
      source: "user",
    },
    {
      id: "edge_start_marked",
      label: "Начало соединяемого края зафиксировано.",
      source: "user",
    },
    {
      id: "working_thread_ready",
      label: "Рабочая нить подготовлена.",
      source: "user",
    },
  ]);
  const ACTIONS = Object.freeze([
    "record_created",
    "checklist_item_confirmed",
    "checklist_item_unconfirmed",
    "join_started",
    "unit_completed",
    "unit_undone",
    "unit_repeated",
    "thread_secured",
    "thread_unsecured",
    "join_completed",
    "sources_revalidated",
    "became_blocked",
  ]);
  const JOIN_ACTIONS = Object.freeze([
    "unit_completed",
    "unit_undone",
    "unit_repeated",
  ]);
  const BLOCKER_MESSAGES = Object.freeze({
    PREPARATION_MISSING: "Подготовка Stage 12A не найдена.",
    PREPARATION_NOT_READY:
      "Подготовка Stage 12A ещё не готова к соединению.",
    PREPARATION_BLOCKED: "Подготовка Stage 12A заблокирована.",
    PREPARATION_RECORD_DAMAGED:
      "Запись подготовки Stage 12A повреждена.",
    PROJECT_ID_MISMATCH:
      "Подготовка и соединение относятся к разным проектам.",
    PREPARATION_REVISION_CONFLICT:
      "Версия подготовки изменилась после создания соединения.",
    PREPARATION_FINGERPRINT_CONFLICT:
      "Контрольный отпечаток подготовки изменился.",
    EXISTING_SNAPSHOT_MISMATCH:
      "Соединение было создано из другого снимка подготовки.",
    UNSUPPORTED_OPERATION:
      "Эта операция соединения пока не поддерживается.",
    INVALID_TOTAL_UNITS:
      "Количество условных единиц края должно быть положительным целым числом.",
    JOIN_HISTORY_DAMAGED: "История продвижения по краю повреждена.",
    COMPLETED_UNITS_NEGATIVE:
      "Количество соединённых участков не может быть меньше нуля.",
    COMPLETED_UNITS_EXCEEDS_TOTAL:
      "Количество соединённых участков превышает длину края.",
    REMAINING_UNITS_MISMATCH:
      "Остаток края не соответствует сохранённому прогрессу.",
    THREAD_SECURED_BEFORE_EDGE_COMPLETE:
      "Нить отмечена закреплённой до конца края.",
    COMPLETED_WITHOUT_FULL_EDGE:
      "Соединение завершено до прохождения всего края.",
    COMPLETED_WITHOUT_THREAD_SECURED:
      "Соединение завершено без подтверждения закрепления нити.",
    COMPLETED_WITHOUT_COMPLETED_AT:
      "У завершённого соединения отсутствует время завершения.",
    COMPLETED_AT_WITHOUT_COMPLETED_STATUS:
      "Время завершения установлено у незавершённого соединения.",
    CHECKLIST_DAMAGED: "Контрольный список соединения повреждён.",
    ACTION_HISTORY_DAMAGED: "История действий соединения повреждена.",
  });

  class FirstAssemblyJoinError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FirstAssemblyJoinError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function buildSourceSnapshot(input = {}) {
    const preparation = isRecord(input.preparation)
      ? input.preparation
      : null;
    const preparationSnapshot = isRecord(preparation?.sourceSnapshot)
      ? preparation.sourceSnapshot
      : {};
    const project = isRecord(input.project) ? input.project : {};
    const total = totalUnitsFromPreparation(preparation);
    return copy({
      projectId:
        text(preparation?.projectId) ||
        text(preparationSnapshot.projectId) ||
        text(project.projectId) ||
        text(project.project_id) ||
        null,
      projectRevision:
        positiveInteger(preparationSnapshot.projectRevision) ??
        positiveInteger(project.revision),
      projectStage:
        text(preparationSnapshot.projectStage) ||
        text(project.currentStage) ||
        text(project.current_stage) ||
        null,
      preparationId: text(preparation?.id) || null,
      preparationRevision: positiveInteger(preparation?.revision),
      preparationSourceFingerprint:
        text(preparation?.sourceFingerprint) || null,
      preparationStatus: text(preparation?.status) || null,
      supportedOperation:
        text(preparation?.supportedOperation) || null,
      operation:
        text(preparation?.supportedOperation) || SUPPORTED_OPERATION,
      firstPiece: copy(preparationSnapshot.firstPiece ?? null),
      secondPiece: copy(preparationSnapshot.secondPiece ?? null),
      section: preparationSnapshot.section ?? null,
      stitchCounts: {
        initial: preparationSnapshot.initialStitchCount ?? null,
        final: preparationSnapshot.finalStitchCount ?? null,
      },
      shapingFingerprint:
        preparationSnapshot.shapingPlanFingerprint ?? null,
      bindOffFingerprint: preparationSnapshot.bindOffFingerprint ?? null,
      joiningEdge: copy(preparationSnapshot.joiningEdge ?? null),
      totalUnits: total.value,
      totalUnitsSource: total.source,
      unitType: UNIT_TYPE,
    });
  }

  function sourceFingerprint(snapshot) {
    if (!isRecord(snapshot)) {
      throw stateError(
        "EXISTING_SNAPSHOT_MISMATCH",
        BLOCKER_MESSAGES.EXISTING_SNAPSHOT_MISMATCH,
      );
    }
    return `assembly-join-source-v1-${fnv64(stableStringify(snapshot))}`;
  }

  function evaluatePreparation(input = {}) {
    const preparation = isRecord(input.preparation)
      ? input.preparation
      : null;
    const snapshot = buildSourceSnapshot(input);
    const blockers = [];
    if (!preparation) {
      addBlocker(blockers, "PREPARATION_MISSING");
    } else {
      if (
        preparation.type !== PREPARATION_KIND ||
        !text(preparation.id) ||
        !positiveInteger(preparation.revision) ||
        !isRecord(preparation.sourceSnapshot) ||
        !text(preparation.sourceFingerprint)
      ) {
        addBlocker(blockers, "PREPARATION_RECORD_DAMAGED");
      }
      if (
        globalObject.YarnAIFirstAssemblyPreparation?.isValidProgress &&
        !globalObject.YarnAIFirstAssemblyPreparation.isValidProgress(
          preparation,
        )
      ) {
        addBlocker(blockers, "PREPARATION_RECORD_DAMAGED");
      }
      if (preparation.status === "blocked") {
        addBlocker(blockers, "PREPARATION_BLOCKED");
      } else if (preparation.status !== "ready") {
        addBlocker(blockers, "PREPARATION_NOT_READY");
      }
    }
    const projectId =
      text(input.project?.projectId) ||
      text(input.project?.project_id) ||
      null;
    if (
      preparation &&
      projectId &&
      text(preparation.projectId) &&
      projectId !== preparation.projectId
    ) {
      addBlocker(blockers, "PROJECT_ID_MISMATCH", {
        projectId,
        preparationProjectId: preparation.projectId,
      });
    }
    if (
      preparation &&
      preparation.supportedOperation !== SUPPORTED_OPERATION
    ) {
      addBlocker(blockers, "UNSUPPORTED_OPERATION", {
        operation: preparation.supportedOperation ?? null,
      });
    }
    if (!positiveInteger(snapshot.totalUnits)) {
      addBlocker(blockers, "INVALID_TOTAL_UNITS", {
        totalUnits: snapshot.totalUnits,
      });
    }
    return {
      snapshot,
      fingerprint: sourceFingerprint(snapshot),
      blockers,
    };
  }

  function createProgress(input, now = new Date().toISOString()) {
    requireTimestamp(now);
    const evaluation = evaluatePreparation(input);
    const blocked = evaluation.blockers.length > 0;
    const totalUnits = positiveInteger(evaluation.snapshot.totalUnits) ?? 1;
    const checklist = createChecklist(evaluation.blockers);
    const progress = {
      id: makeId("assembly-join"),
      projectId:
        text(evaluation.snapshot.projectId) ||
        text(input?.project?.projectId) ||
        text(input?.project?.project_id) ||
        "unknown",
      type: PROGRESS_KIND,
      version: VERSION,
      revision: 1,
      status: blocked ? "blocked" : "ready",
      sourceSnapshot: copy(evaluation.snapshot),
      sourceFingerprint: evaluation.fingerprint,
      operation: evaluation.snapshot.operation,
      totalUnits,
      completedUnits: 0,
      remainingUnits: totalUnits,
      joinHistory: [],
      threadSecured: false,
      checklist,
      blockers: copy(evaluation.blockers),
      warnings: [
        notice(
          "STAGE_12B_SINGLE_STRAIGHT_EDGE_ONLY",
          "На этом этапе поддерживается только один прямой край без посадки.",
        ),
      ],
      actionHistory: [
        action("record_created", now, {
          sourceFingerprint: evaluation.fingerprint,
          totalUnits,
          unitType: UNIT_TYPE,
        }),
        ...(blocked
          ? [
              action("became_blocked", now, {
                blockerCodes: evaluation.blockers.map(
                  (entry) => entry.code,
                ),
              }),
            ]
          : []),
      ],
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      joinedAt: null,
      completedAt: null,
    };
    requireValidProgress(progress);
    return progress;
  }

  function setChecklistItem(
    progress,
    itemId,
    confirmed,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireReadyAction(progress);
    if (!USER_CHECKLIST_IDS.includes(itemId)) {
      throw stateError(
        "CHECKLIST_ITEM_NOT_USER_CONFIRMABLE",
        "Этот пункт проверяется системой и не меняется вручную.",
        { itemId },
      );
    }
    const current = progress.checklist.find((item) => item.id === itemId);
    if (current.confirmed === confirmed) {
      return copy(progress);
    }
    const checklist = progress.checklist.map((item) =>
      item.id === itemId
        ? {
            ...copy(item),
            confirmed,
            confirmedAt: confirmed ? now : null,
          }
        : copy(item),
    );
    return finalizeMutation(progress, now, {
      checklist,
      actionHistory: [
        ...copy(progress.actionHistory),
        action(
          confirmed
            ? "checklist_item_confirmed"
            : "checklist_item_unconfirmed",
          now,
          { itemId },
        ),
      ],
    });
  }

  function confirmChecklistItem(progress, itemId, now) {
    return setChecklistItem(progress, itemId, true, now);
  }

  function unconfirmChecklistItem(progress, itemId, now) {
    return setChecklistItem(progress, itemId, false, now);
  }

  function startJoin(progress, now = new Date().toISOString()) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireReadyAction(progress);
    if (!progress.checklist.every((item) => item.confirmed)) {
      throw stateError(
        "CHECKLIST_INCOMPLETE",
        "Перед началом подтвердите все пункты подготовки.",
      );
    }
    return finalizeMutation(progress, now, {
      status: "in_progress",
      startedAt: now,
      actionHistory: [
        ...copy(progress.actionHistory),
        action("join_started", now, {
          totalUnits: progress.totalUnits,
        }),
      ],
    });
  }

  function completeUnit(progress, now = new Date().toISOString()) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireWorkingAction(progress);
    requireThreadUnsecured(progress);
    if (progress.completedUnits >= progress.totalUnits) {
      return copy(progress);
    }
    const unitNumber = progress.completedUnits + 1;
    const event = joinEvent(
      progress,
      "unit_completed",
      unitNumber,
      now,
      "active",
    );
    return finalizeMutation(progress, now, {
      completedUnits: unitNumber,
      remainingUnits: progress.totalUnits - unitNumber,
      joinHistory: [...copy(progress.joinHistory), event],
      actionHistory: [
        ...copy(progress.actionHistory),
        action("unit_completed", now, {
          actionId: event.actionId,
          unitNumber,
        }),
      ],
    });
  }

  function undoLastUnit(progress, now = new Date().toISOString()) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireWorkingAction(progress);
    requireThreadUnsecured(progress);
    if (progress.completedUnits === 0) {
      return copy(progress);
    }
    const derived = deriveJoinHistory(
      progress.joinHistory,
      progress.totalUnits,
    );
    const target = derived.active[derived.active.length - 1];
    const event = joinEvent(
      progress,
      "unit_undone",
      target.unitNumber,
      now,
      "reverted",
      target.actionId,
    );
    const completedUnits = progress.completedUnits - 1;
    return finalizeMutation(progress, now, {
      completedUnits,
      remainingUnits: progress.totalUnits - completedUnits,
      joinHistory: [...copy(progress.joinHistory), event],
      actionHistory: [
        ...copy(progress.actionHistory),
        action("unit_undone", now, {
          actionId: event.actionId,
          unitNumber: target.unitNumber,
          referenceActionId: target.actionId,
        }),
      ],
    });
  }

  function repeatLastUnit(progress, now = new Date().toISOString()) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireWorkingAction(progress);
    requireThreadUnsecured(progress);
    const last = progress.joinHistory.at(-1);
    if (
      !last ||
      last.type !== "unit_undone" ||
      progress.completedUnits >= progress.totalUnits
    ) {
      return copy(progress);
    }
    const event = joinEvent(
      progress,
      "unit_repeated",
      last.unitNumber,
      now,
      "active",
      last.actionId,
    );
    const completedUnits = progress.completedUnits + 1;
    return finalizeMutation(progress, now, {
      completedUnits,
      remainingUnits: progress.totalUnits - completedUnits,
      joinHistory: [...copy(progress.joinHistory), event],
      actionHistory: [
        ...copy(progress.actionHistory),
        action("unit_repeated", now, {
          actionId: event.actionId,
          unitNumber: event.unitNumber,
          referenceActionId: last.actionId,
        }),
      ],
    });
  }

  function confirmThreadSecured(
    progress,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireWorkingAction(progress);
    if (progress.completedUnits !== progress.totalUnits) {
      throw stateError(
        "EDGE_NOT_COMPLETE",
        "Закрепить нить можно только после прохождения всего края.",
      );
    }
    if (progress.threadSecured) {
      return copy(progress);
    }
    return finalizeMutation(progress, now, {
      threadSecured: true,
      actionHistory: [
        ...copy(progress.actionHistory),
        action("thread_secured", now, {
          completedUnits: progress.completedUnits,
        }),
      ],
    });
  }

  function unconfirmThreadSecured(
    progress,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireWorkingAction(progress);
    if (!progress.threadSecured) {
      return copy(progress);
    }
    return finalizeMutation(progress, now, {
      threadSecured: false,
      actionHistory: [
        ...copy(progress.actionHistory),
        action("thread_unsecured", now, {}),
      ],
    });
  }

  function completeJoin(progress, now = new Date().toISOString()) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireWorkingAction(progress);
    if (
      progress.completedUnits !== progress.totalUnits ||
      !progress.threadSecured ||
      progress.blockers.length
    ) {
      throw stateError(
        "JOIN_NOT_READY_TO_COMPLETE",
        "Пройдите весь край и отдельно подтвердите закрепление нити.",
      );
    }
    return finalizeMutation(progress, now, {
      status: "completed",
      joinedAt: now,
      completedAt: now,
      actionHistory: [
        ...copy(progress.actionHistory),
        action("join_completed", now, {
          totalUnits: progress.totalUnits,
        }),
      ],
    });
  }

  function revalidateProgress(
    progress,
    input,
    now = new Date().toISOString(),
  ) {
    requireTimestamp(now);
    const structuralCode = structuralBlocker(progress);
    if (structuralCode) {
      return repairAsBlocked(progress, structuralCode, now);
    }
    const derived = deriveJoinHistory(
      progress.joinHistory,
      progress.totalUnits,
    );
    if (
      progress.completedUnits !== derived.completedUnits &&
      progress.status === "completed"
    ) {
      return repairAsBlocked(progress, "JOIN_HISTORY_DAMAGED", now);
    }
    const evaluation = evaluatePreparation(input);
    const saved = progress.sourceSnapshot;
    const currentPreparation = input?.preparation;
    if (
      currentPreparation &&
      positiveInteger(currentPreparation.revision) !==
        saved.preparationRevision
    ) {
      return blockProgress(
        progress,
        "PREPARATION_REVISION_CONFLICT",
        now,
        {
          savedRevision: saved.preparationRevision,
          currentRevision: currentPreparation.revision ?? null,
        },
      );
    }
    if (
      currentPreparation &&
      text(currentPreparation.sourceFingerprint) !==
        saved.preparationSourceFingerprint
    ) {
      return blockProgress(
        progress,
        "PREPARATION_FINGERPRINT_CONFLICT",
        now,
        {
          savedFingerprint: saved.preparationSourceFingerprint,
          currentFingerprint:
            currentPreparation.sourceFingerprint ?? null,
        },
      );
    }
    if (evaluation.blockers.length) {
      return blockProgress(
        progress,
        evaluation.blockers[0].code,
        now,
        evaluation.blockers[0].details,
        evaluation.blockers,
      );
    }
    if (evaluation.fingerprint !== progress.sourceFingerprint) {
      return blockProgress(
        progress,
        "EXISTING_SNAPSHOT_MISMATCH",
        now,
        {
          savedFingerprint: progress.sourceFingerprint,
          currentFingerprint: evaluation.fingerprint,
        },
      );
    }
    if (progress.status === "completed") {
      return copy(progress);
    }
    const completedUnits = derived.completedUnits;
    return finalizeMutation(progress, now, {
      completedUnits,
      remainingUnits: progress.totalUnits - completedUnits,
      actionHistory: [
        ...copy(progress.actionHistory),
        action("sources_revalidated", now, {
          sourceFingerprint: progress.sourceFingerprint,
          completedUnits,
        }),
      ],
    });
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
        "JOIN_HISTORY_DAMAGED",
        BLOCKER_MESSAGES.JOIN_HISTORY_DAMAGED,
      );
    }
    requireValidProgress(value);
    return value;
  }

  function isValidProgress(value) {
    if (
      !isRecord(value) ||
      !text(value.id) ||
      !text(value.projectId) ||
      value.type !== PROGRESS_KIND ||
      value.version !== VERSION ||
      !positiveInteger(value.revision) ||
      !STATUSES.includes(value.status) ||
      !isRecord(value.sourceSnapshot) ||
      !text(value.sourceFingerprint) ||
      value.sourceFingerprint !== sourceFingerprint(value.sourceSnapshot) ||
      !text(value.operation) ||
      !positiveInteger(value.totalUnits) ||
      !nonNegativeInteger(value.completedUnits) ||
      value.completedUnits > value.totalUnits ||
      value.remainingUnits !== value.totalUnits - value.completedUnits ||
      typeof value.threadSecured !== "boolean" ||
      !validChecklist(value.checklist) ||
      !Array.isArray(value.blockers) ||
      !value.blockers.every(validNotice) ||
      !Array.isArray(value.warnings) ||
      !value.warnings.every(validNotice) ||
      !validActionHistory(value.actionHistory) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt) ||
      !nullableTimestamp(value.startedAt) ||
      !nullableTimestamp(value.joinedAt) ||
      !nullableTimestamp(value.completedAt)
    ) {
      return false;
    }
    let derived;
    try {
      derived = deriveJoinHistory(value.joinHistory, value.totalUnits);
    } catch {
      return false;
    }
    if (derived.completedUnits !== value.completedUnits) {
      return false;
    }
    if (
      value.threadSecured &&
      value.completedUnits !== value.totalUnits
    ) {
      return false;
    }
    if (value.status === "blocked") {
      return value.blockers.length > 0 && value.completedAt === null;
    }
    if (
      value.blockers.length ||
      value.operation !== SUPPORTED_OPERATION
    ) {
      return false;
    }
    if (value.status === "ready") {
      return (
        value.completedUnits === 0 &&
        value.startedAt === null &&
        value.joinedAt === null &&
        value.completedAt === null
      );
    }
    if (value.status === "in_progress") {
      return (
        isTimestamp(value.startedAt) &&
        value.joinedAt === null &&
        value.completedAt === null
      );
    }
    return (
      value.completedUnits === value.totalUnits &&
      value.threadSecured &&
      isTimestamp(value.startedAt) &&
      isTimestamp(value.joinedAt) &&
      isTimestamp(value.completedAt)
    );
  }

  function structuralBlocker(value) {
    if (!isRecord(value)) {
      return "PREPARATION_RECORD_DAMAGED";
    }
    if (!validChecklist(value.checklist)) {
      return "CHECKLIST_DAMAGED";
    }
    if (!validActionHistory(value.actionHistory)) {
      return "ACTION_HISTORY_DAMAGED";
    }
    if (!positiveInteger(value.totalUnits)) {
      return "INVALID_TOTAL_UNITS";
    }
    if (
      Number.isSafeInteger(value.completedUnits) &&
      value.completedUnits < 0
    ) {
      return "COMPLETED_UNITS_NEGATIVE";
    }
    if (
      !Number.isSafeInteger(value.completedUnits) ||
      value.completedUnits > value.totalUnits
    ) {
      return "COMPLETED_UNITS_EXCEEDS_TOTAL";
    }
    if (
      value.remainingUnits !==
      value.totalUnits - value.completedUnits
    ) {
      return "REMAINING_UNITS_MISMATCH";
    }
    try {
      deriveJoinHistory(value.joinHistory, value.totalUnits);
    } catch {
      return "JOIN_HISTORY_DAMAGED";
    }
    if (
      value.threadSecured === true &&
      value.completedUnits !== value.totalUnits
    ) {
      return "THREAD_SECURED_BEFORE_EDGE_COMPLETE";
    }
    if (
      value.status === "completed" &&
      value.completedUnits !== value.totalUnits
    ) {
      return "COMPLETED_WITHOUT_FULL_EDGE";
    }
    if (value.status === "completed" && value.threadSecured !== true) {
      return "COMPLETED_WITHOUT_THREAD_SECURED";
    }
    if (
      value.status === "completed" &&
      !isTimestamp(value.completedAt)
    ) {
      return "COMPLETED_WITHOUT_COMPLETED_AT";
    }
    if (
      value.status !== "completed" &&
      value.completedAt !== null
    ) {
      return "COMPLETED_AT_WITHOUT_COMPLETED_STATUS";
    }
    if (
      !isRecord(value.sourceSnapshot) ||
      !text(value.sourceFingerprint)
    ) {
      return "EXISTING_SNAPSHOT_MISMATCH";
    }
    try {
      if (
        sourceFingerprint(value.sourceSnapshot) !==
        value.sourceFingerprint
      ) {
        return "EXISTING_SNAPSHOT_MISMATCH";
      }
    } catch {
      return "EXISTING_SNAPSHOT_MISMATCH";
    }
    return null;
  }

  function deriveJoinHistory(history, totalUnits) {
    if (!Array.isArray(history)) {
      throw stateError(
        "JOIN_HISTORY_DAMAGED",
        BLOCKER_MESSAGES.JOIN_HISTORY_DAMAGED,
      );
    }
    const active = [];
    const ids = new Set();
    let repeatCandidate = null;
    history.forEach((entry, index) => {
      if (
        !isRecord(entry) ||
        !text(entry.actionId) ||
        ids.has(entry.actionId) ||
        entry.sequence !== index + 1 ||
        !JOIN_ACTIONS.includes(entry.type) ||
        !positiveInteger(entry.unitNumber) ||
        entry.unitNumber > totalUnits ||
        !isTimestamp(entry.timestamp) ||
        !["active", "reverted"].includes(entry.state) ||
        !(
          entry.referenceActionId === null ||
          text(entry.referenceActionId)
        )
      ) {
        throw stateError(
          "JOIN_HISTORY_DAMAGED",
          BLOCKER_MESSAGES.JOIN_HISTORY_DAMAGED,
        );
      }
      if (entry.type === "unit_completed") {
        if (
          entry.state !== "active" ||
          entry.referenceActionId !== null ||
          entry.unitNumber !== active.length + 1
        ) {
          throw stateError(
            "JOIN_HISTORY_DAMAGED",
            BLOCKER_MESSAGES.JOIN_HISTORY_DAMAGED,
          );
        }
        active.push(copy(entry));
        repeatCandidate = null;
      } else if (entry.type === "unit_undone") {
        const target = active.at(-1);
        if (
          entry.state !== "reverted" ||
          !target ||
          entry.referenceActionId !== target.actionId ||
          entry.unitNumber !== target.unitNumber
        ) {
          throw stateError(
            "JOIN_HISTORY_DAMAGED",
            BLOCKER_MESSAGES.JOIN_HISTORY_DAMAGED,
          );
        }
        active.pop();
        repeatCandidate = copy(entry);
      } else {
        if (
          entry.state !== "active" ||
          !repeatCandidate ||
          entry.referenceActionId !== repeatCandidate.actionId ||
          entry.unitNumber !== repeatCandidate.unitNumber ||
          entry.unitNumber !== active.length + 1
        ) {
          throw stateError(
            "JOIN_HISTORY_DAMAGED",
            BLOCKER_MESSAGES.JOIN_HISTORY_DAMAGED,
          );
        }
        active.push(copy(entry));
        repeatCandidate = null;
      }
      ids.add(entry.actionId);
    });
    return {
      active,
      completedUnits: active.length,
      repeatAvailable: Boolean(repeatCandidate),
    };
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      return blockedInspection("PROJECT_ID_MISMATCH");
    }
    const calculation = activeCalculation(aggregate, project);
    if (!calculation) {
      return blockedInspection("PREPARATION_RECORD_DAMAGED", {
        project,
      });
    }
    const preparationMatches = progressMatches(
      aggregate,
      PREPARATION_KIND,
      calculation.calculation_id,
    );
    const joinMatches = progressMatches(
      aggregate,
      PROGRESS_KIND,
      calculation.calculation_id,
    );
    if (preparationMatches.length > 1 || joinMatches.length > 1) {
      return blockedInspection("EXISTING_SNAPSHOT_MISMATCH", {
        project,
        calculation,
      });
    }
    const preparationRecord = preparationMatches[0] ?? null;
    const preparation =
      preparationRecord && !isPlaceholder(preparationRecord.state)
        ? preparationRecord.state
        : null;
    const progressRecord = joinMatches[0] ?? null;
    const join =
      progressRecord && !isPlaceholder(progressRecord.state)
        ? progressRecord.state
        : null;
    const input = { project, preparation };
    if (!join) {
      const evaluation = evaluatePreparation(input);
      return {
        state: evaluation.blockers.length ? "blocked" : "missing",
        status: evaluation.blockers.length ? "blocked" : "ready",
        project,
        calculation,
        preparationRecord: copy(preparationRecord),
        preparation: copy(preparation),
        progress: copy(progressRecord),
        join: null,
        input,
        blockers: copy(evaluation.blockers),
        code: evaluation.blockers[0]?.code ?? null,
        message: evaluation.blockers[0]?.message ?? null,
      };
    }
    const structuralCode = structuralBlocker(join);
    if (structuralCode) {
      return blockedInspection(structuralCode, {
        project,
        calculation,
        preparationRecord: copy(preparationRecord),
        preparation: copy(preparation),
        progress: copy(progressRecord),
        join: copy(join),
        input,
      });
    }
    const sourceConflict = sourceConflictCode(join, input);
    if (sourceConflict) {
      return blockedInspection(sourceConflict, {
        project,
        calculation,
        preparationRecord: copy(preparationRecord),
        preparation: copy(preparation),
        progress: copy(progressRecord),
        join: copy(join),
        input,
      });
    }
    return {
      state: join.status === "blocked" ? "blocked" : "ready",
      status: join.status,
      project,
      calculation,
      preparationRecord: copy(preparationRecord),
      preparation: copy(preparation),
      progress: copy(progressRecord),
      join: copy(join),
      input,
      blockers: copy(join.blockers),
      code: join.blockers[0]?.code ?? null,
      message: join.blockers[0]?.message ?? null,
    };
  }

  async function ensureForProject(repository, projectId) {
    let aggregate = await repository.getProject(projectId);
    let inspection = inspectAggregate(aggregate);
    if (inspection.join) {
      const next = revalidateProgress(
        inspection.join,
        inspection.input,
      );
      if (stableStringify(next) === stableStringify(inspection.join)) {
        return inspection;
      }
      return persist(
        repository,
        inspection,
        next,
        next.status === "blocked"
          ? "FIRST_ASSEMBLY_JOIN_BLOCKED"
          : "FIRST_ASSEMBLY_JOIN_SOURCES_REVALIDATED",
      );
    }
    if (!inspection.calculation) {
      throw errorFromInspection(inspection);
    }
    if (!inspection.progress) {
      const input = copy(inspection.input);
      await repository.ensureCalculationProgress(
        projectId,
        inspection.calculation.calculation_id,
        PROGRESS_KIND,
        { version: 0, initialized: false },
        { operationKind: "FIRST_ASSEMBLY_JOIN_PROGRESS_CREATED" },
      );
      aggregate = await repository.getProject(projectId);
      const project = aggregate.project;
      const calculation = activeCalculation(aggregate, project);
      inspection = {
        ...inspection,
        project,
        calculation,
        progress: oneProgress(
          aggregate,
          PROGRESS_KIND,
          calculation.calculation_id,
        ),
        input,
      };
    }
    const now = new Date().toISOString();
    const state = createProgress(inspection.input, now);
    await repository.updateCalculationProgress(
      projectId,
      inspection.calculation.calculation_id,
      PROGRESS_KIND,
      state,
      {
        baseProgressRevision: inspection.progress.revision,
        operationKind: "FIRST_ASSEMBLY_JOIN_CREATED",
        projectStage:
          state.status === "blocked"
            ? "assembly_join_blocked"
            : "assembly_join_ready",
        timestamp: now,
      },
    );
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function loadForProject(repository, projectId) {
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function revalidateForProject(repository, projectId) {
    const inspection = inspectAggregate(
      await repository.getProject(projectId),
    );
    if (!inspection.join) {
      return ensureForProject(repository, projectId);
    }
    const next = revalidateProgress(
      inspection.join,
      inspection.input,
    );
    if (stableStringify(next) === stableStringify(inspection.join)) {
      return inspection;
    }
    return persist(
      repository,
      inspection,
      next,
      next.status === "blocked"
        ? "FIRST_ASSEMBLY_JOIN_BLOCKED"
        : "FIRST_ASSEMBLY_JOIN_SOURCES_REVALIDATED",
    );
  }

  async function confirmForProject(repository, projectId, itemId) {
    return mutateForProject(
      repository,
      projectId,
      (progress) => confirmChecklistItem(progress, itemId),
      "FIRST_ASSEMBLY_JOIN_CHECKLIST_CONFIRMED",
    );
  }

  async function unconfirmForProject(repository, projectId, itemId) {
    return mutateForProject(
      repository,
      projectId,
      (progress) => unconfirmChecklistItem(progress, itemId),
      "FIRST_ASSEMBLY_JOIN_CHECKLIST_UNCONFIRMED",
    );
  }

  async function startForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      startJoin,
      "FIRST_ASSEMBLY_JOIN_STARTED",
    );
  }

  async function completeUnitForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      completeUnit,
      "FIRST_ASSEMBLY_JOIN_UNIT_COMPLETED",
    );
  }

  async function undoForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      undoLastUnit,
      "FIRST_ASSEMBLY_JOIN_UNIT_UNDONE",
    );
  }

  async function repeatForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      repeatLastUnit,
      "FIRST_ASSEMBLY_JOIN_UNIT_REPEATED",
    );
  }

  async function confirmThreadForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      confirmThreadSecured,
      "FIRST_ASSEMBLY_JOIN_THREAD_SECURED",
    );
  }

  async function unconfirmThreadForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      unconfirmThreadSecured,
      "FIRST_ASSEMBLY_JOIN_THREAD_UNSECURED",
    );
  }

  async function completeForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      completeJoin,
      "FIRST_ASSEMBLY_JOIN_COMPLETED",
    );
  }

  async function mutateForProject(
    repository,
    projectId,
    mutation,
    operationKind,
  ) {
    let inspection = inspectAggregate(
      await repository.getProject(projectId),
    );
    if (!inspection.join || !inspection.progress) {
      inspection = await ensureForProject(repository, projectId);
    }
    if (!inspection.join || !inspection.progress) {
      throw errorFromInspection(inspection);
    }
    if (inspection.state === "blocked") {
      const blocked = revalidateProgress(
        inspection.join,
        inspection.input,
      );
      return persist(
        repository,
        inspection,
        blocked,
        "FIRST_ASSEMBLY_JOIN_BLOCKED",
      );
    }
    const next = mutation(inspection.join);
    if (stableStringify(next) === stableStringify(inspection.join)) {
      return inspection;
    }
    return persist(repository, inspection, next, operationKind);
  }

  async function persist(repository, inspection, state, operationKind) {
    const stages = {
      ready: "assembly_join_ready",
      in_progress: "assembly_join_in_progress",
      blocked: "assembly_join_blocked",
      completed: "assembly_join_completed",
    };
    await repository.updateCalculationProgress(
      inspection.project.project_id,
      inspection.calculation.calculation_id,
      PROGRESS_KIND,
      state,
      {
        baseProgressRevision: inspection.progress.revision,
        operationKind,
        projectStage: stages[state.status],
      },
    );
    return inspectAggregate(
      await repository.getProject(inspection.project.project_id),
    );
  }

  function homeState(inspection, projectId) {
    if (!inspection) {
      return null;
    }
    const join = inspection.join;
    if (inspection.state === "blocked") {
      return {
        stage: "Соединение края заблокировано",
        summary:
          inspection.message ||
          join?.blockers?.[0]?.message ||
          "Проверьте готовность подготовки Stage 12A.",
        label: "Открыть помощник соединения",
        href: `/first-assembly-join?project=${encodeURIComponent(projectId)}`,
        status: "blocked",
        join: join ? copy(join) : null,
      };
    }
    if (!join) {
      return null;
    }
    const labels = {
      ready: {
        stage: "Можно начать соединение края",
        label: "Начать соединение",
      },
      in_progress: {
        stage: "Соединение края в работе",
        label: "Продолжить соединение",
      },
      completed: {
        stage: "Первый край соединён",
        label: "Посмотреть результат соединения",
      },
    };
    const display = labels[join.status] ?? labels.ready;
    return {
      stage: display.stage,
      summary: progressSummary(join),
      label: display.label,
      href: `/first-assembly-join?project=${encodeURIComponent(projectId)}`,
      status: join.status,
      join: copy(join),
    };
  }

  function progressSummary(progress) {
    if (!progress) {
      return "";
    }
    if (progress.status === "completed") {
      return `Край соединён полностью: ${progress.totalUnits} из ${progress.totalUnits} петель, нить закреплена.`;
    }
    if (progress.status === "ready") {
      return `Готов один прямой край длиной ${progress.totalUnits} петель. Соединение ещё не начато.`;
    }
    return `Соединено ${progress.completedUnits} из ${progress.totalUnits}; осталось ${progress.remainingUnits}.`;
  }

  function sourceSummary(progress) {
    const snapshot = progress?.sourceSnapshot;
    if (!snapshot) {
      return "";
    }
    const section =
      snapshot.firstPiece?.data?.sectionLabel ||
      snapshot.section ||
      "прямой участок";
    return `${section}: две одинаковые детали, край по ${snapshot.totalUnits} петель.`;
  }

  function sourceConflictCode(progress, input) {
    const preparation = input?.preparation;
    if (!preparation) {
      return "PREPARATION_MISSING";
    }
    if (
      positiveInteger(preparation.revision) !==
      progress.sourceSnapshot.preparationRevision
    ) {
      return "PREPARATION_REVISION_CONFLICT";
    }
    if (
      text(preparation.sourceFingerprint) !==
      progress.sourceSnapshot.preparationSourceFingerprint
    ) {
      return "PREPARATION_FINGERPRINT_CONFLICT";
    }
    const evaluation = evaluatePreparation(input);
    if (evaluation.blockers.length) {
      return evaluation.blockers[0].code;
    }
    if (evaluation.fingerprint !== progress.sourceFingerprint) {
      return "EXISTING_SNAPSHOT_MISMATCH";
    }
    return null;
  }

  function createChecklist(blockers) {
    const codes = new Set(blockers.map((entry) => entry.code));
    const preparationCompleted =
      !codes.has("PREPARATION_MISSING") &&
      !codes.has("PREPARATION_NOT_READY") &&
      !codes.has("PREPARATION_BLOCKED") &&
      !codes.has("PREPARATION_RECORD_DAMAGED") &&
      !codes.has("PROJECT_ID_MISMATCH");
    const operationSupported =
      preparationCompleted &&
      !codes.has("UNSUPPORTED_OPERATION") &&
      !codes.has("INVALID_TOTAL_UNITS");
    return CHECKLIST.map((definition) => {
      const confirmed =
        definition.id === "preparation_completed"
          ? preparationCompleted
          : definition.id === "operation_supported"
            ? operationSupported
            : false;
      return {
        id: definition.id,
        label: definition.label,
        required: true,
        source: definition.source,
        confirmed,
        confirmedAt: null,
      };
    });
  }

  function totalUnitsFromPreparation(preparation) {
    const snapshot = isRecord(preparation?.sourceSnapshot)
      ? preparation.sourceSnapshot
      : {};
    const finalCount = positiveInteger(snapshot.finalStitchCount);
    if (finalCount) {
      return {
        value: finalCount,
        source: {
          kind: "stitch_count",
          field:
            "preparation.sourceSnapshot.finalStitchCount",
          value: finalCount,
        },
      };
    }
    const edgeCount = positiveInteger(
      snapshot.joiningEdge?.firstLength,
    );
    return {
      value: edgeCount,
      source: {
        kind: "stitch_count",
        field:
          "preparation.sourceSnapshot.joiningEdge.firstLength",
        value: edgeCount,
      },
    };
  }

  function joinEvent(
    progress,
    type,
    unitNumber,
    timestamp,
    state,
    referenceActionId = null,
  ) {
    return {
      actionId: makeId("join-unit"),
      sequence: progress.joinHistory.length + 1,
      type,
      unitNumber,
      timestamp,
      state,
      referenceActionId,
    };
  }

  function finalizeMutation(progress, now, patch) {
    const next = {
      ...copy(progress),
      ...copy(patch),
      revision: progress.revision + 1,
      updatedAt: now,
    };
    requireValidProgress(next);
    return next;
  }

  function repairAsBlocked(progress, code, now) {
    const base = isRecord(progress) ? copy(progress) : {};
    const snapshot = isRecord(base.sourceSnapshot)
      ? base.sourceSnapshot
      : {
          projectId: text(base.projectId) || "unknown",
          damaged: true,
          totalUnits: positiveInteger(base.totalUnits) ?? 1,
          unitType: UNIT_TYPE,
        };
    const totalUnits =
      positiveInteger(base.totalUnits) ??
      positiveInteger(snapshot.totalUnits) ??
      1;
    let joinHistory = [];
    let completedUnits = 0;
    try {
      const derived = deriveJoinHistory(base.joinHistory, totalUnits);
      joinHistory = copy(base.joinHistory);
      completedUnits = derived.completedUnits;
    } catch {
      joinHistory = [];
    }
    const checklist = validChecklist(base.checklist)
      ? copy(base.checklist)
      : createChecklist([notice(code, BLOCKER_MESSAGES[code])]);
    const history = validActionHistory(base.actionHistory)
      ? copy(base.actionHistory)
      : [action("record_created", now, { recovered: true })];
    const repaired = {
      id: text(base.id) || makeId("assembly-join-recovered"),
      projectId:
        text(base.projectId) ||
        text(snapshot.projectId) ||
        "unknown",
      type: PROGRESS_KIND,
      version: VERSION,
      revision: positiveInteger(base.revision)
        ? base.revision + 1
        : 1,
      status: "blocked",
      sourceSnapshot: copy(snapshot),
      sourceFingerprint: sourceFingerprint(snapshot),
      operation: SUPPORTED_OPERATION,
      totalUnits,
      completedUnits,
      remainingUnits: totalUnits - completedUnits,
      joinHistory,
      threadSecured:
        base.threadSecured === true &&
        completedUnits === totalUnits,
      checklist,
      blockers: [notice(code, BLOCKER_MESSAGES[code])],
      warnings: Array.isArray(base.warnings)
        ? base.warnings.filter(validNotice)
        : [],
      actionHistory: [
        ...history,
        action("became_blocked", now, {
          blockerCodes: [code],
        }),
      ],
      createdAt: isTimestamp(base.createdAt)
        ? base.createdAt
        : now,
      updatedAt: now,
      startedAt: isTimestamp(base.startedAt)
        ? base.startedAt
        : null,
      joinedAt: null,
      completedAt: null,
    };
    requireValidProgress(repaired);
    return repaired;
  }

  function blockProgress(
    progress,
    code,
    now,
    details = {},
    blockers = null,
  ) {
    const nextBlockers =
      blockers?.length
        ? copy(blockers)
        : [notice(code, BLOCKER_MESSAGES[code], details)];
    return finalizeMutation(progress, now, {
      status: "blocked",
      blockers: nextBlockers,
      joinedAt: null,
      completedAt: null,
      actionHistory: [
        ...copy(progress.actionHistory),
        action("became_blocked", now, {
          blockerCodes: nextBlockers.map((entry) => entry.code),
          ...copy(details),
        }),
      ],
    });
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
          item.source === expected.source &&
          item.required === true &&
          typeof item.confirmed === "boolean" &&
          nullableTimestamp(item.confirmedAt) &&
          (item.source === "system"
            ? item.confirmedAt === null
            : item.confirmed === Boolean(item.confirmedAt))
        );
      })
    );
  }

  function validActionHistory(history) {
    return (
      Array.isArray(history) &&
      history.length > 0 &&
      history.every(
        (entry) =>
          isRecord(entry) &&
          ACTIONS.includes(entry.type) &&
          isTimestamp(entry.timestamp) &&
          isRecord(entry.data),
      ) &&
      history[0].type === "record_created"
    );
  }

  function requireReadyAction(progress) {
    if (progress.status === "blocked") {
      throw stateError(
        "FIRST_ASSEMBLY_JOIN_BLOCKED",
        progress.blockers[0]?.message ||
          "Соединение заблокировано.",
      );
    }
    if (progress.status !== "ready") {
      throw stateError(
        "JOIN_ALREADY_STARTED",
        "Подготовительный список меняется только до начала соединения.",
      );
    }
  }

  function requireWorkingAction(progress) {
    if (progress.status === "blocked") {
      throw stateError(
        "FIRST_ASSEMBLY_JOIN_BLOCKED",
        progress.blockers[0]?.message ||
          "Соединение заблокировано.",
      );
    }
    if (progress.status === "completed") {
      throw stateError(
        "FIRST_ASSEMBLY_JOIN_COMPLETED",
        "Завершённое соединение нельзя изменять.",
      );
    }
    if (progress.status !== "in_progress") {
      throw stateError(
        "JOIN_NOT_STARTED",
        "Сначала начните соединение.",
      );
    }
  }

  function requireThreadUnsecured(progress) {
    if (progress.threadSecured) {
      throw stateError(
        "THREAD_ALREADY_SECURED",
        "Сначала отмените подтверждение закрепления нити.",
      );
    }
  }

  function action(type, timestamp, data = {}) {
    return { type, timestamp, data: copy(data) };
  }

  function notice(code, message, details = undefined) {
    const value = { code, message };
    if (details && Object.keys(details).length) {
      value.details = copy(details);
    }
    return value;
  }

  function addBlocker(blockers, code, details = {}) {
    if (!blockers.some((entry) => entry.code === code)) {
      blockers.push(notice(code, BLOCKER_MESSAGES[code], details));
    }
  }

  function validNotice(value) {
    return (
      isRecord(value) &&
      Boolean(text(value.code)) &&
      Boolean(text(value.message)) &&
      (value.details === undefined || isRecord(value.details))
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

  function oneProgress(aggregate, kind, calculationId) {
    const matches = progressMatches(aggregate, kind, calculationId);
    return matches.length === 1 ? matches[0] : null;
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

  function blockedInspection(code, details = {}) {
    const message =
      BLOCKER_MESSAGES[code] ||
      "Соединение края сейчас недоступно.";
    return {
      state: "blocked",
      status: "blocked",
      code,
      message,
      blockers: [notice(code, message)],
      ...details,
    };
  }

  function errorFromInspection(inspection) {
    return stateError(
      inspection?.code ?? "FIRST_ASSEMBLY_JOIN_UNAVAILABLE",
      inspection?.message ??
        "Соединение края сейчас недоступно.",
    );
  }

  function requireValidProgress(progress) {
    if (!isValidProgress(progress)) {
      throw stateError(
        "FIRST_ASSEMBLY_JOIN_DATA_DAMAGED",
        "Запись соединения края повреждена.",
      );
    }
  }

  function stateError(code, message, details = {}) {
    return new FirstAssemblyJoinError(code, message, details);
  }

  function makeId(prefix) {
    if (globalObject.YarnAIProjectSystem?.uuidv7) {
      return globalObject.YarnAIProjectSystem.uuidv7();
    }
    if (globalObject.crypto?.randomUUID) {
      return globalObject.crypto.randomUUID();
    }
    return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  }

  function isPlaceholder(value) {
    return (
      isRecord(value) &&
      value.version === 0 &&
      value.initialized === false
    );
  }

  function requireTimestamp(value) {
    if (!isTimestamp(value)) {
      throw stateError(
        "FIRST_ASSEMBLY_JOIN_TIMESTAMP_INVALID",
        "Не удалось сохранить время действия.",
      );
    }
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function isTimestamp(value) {
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
        value,
      ) &&
      Number.isFinite(Date.parse(value))
    );
  }

  function nullableTimestamp(value) {
    return value === null || isTimestamp(value);
  }

  function text(value) {
    return typeof value === "string" && value.trim()
      ? value.trim()
      : "";
  }

  function isRecord(value) {
    return (
      Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
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
      return `[${value
        .map((entry) => stableStringify(entry))
        .join(",")}]`;
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
    PREPARATION_KIND,
    SUPPORTED_OPERATION,
    UNIT_TYPE,
    STATUSES,
    CHECKLIST,
    USER_CHECKLIST_IDS,
    ACTIONS,
    JOIN_ACTIONS,
    BLOCKER_MESSAGES,
    FirstAssemblyJoinError,
    buildSourceSnapshot,
    sourceFingerprint,
    evaluatePreparation,
    createProgress,
    setChecklistItem,
    confirmChecklistItem,
    unconfirmChecklistItem,
    startJoin,
    completeUnit,
    undoLastUnit,
    repeatLastUnit,
    confirmThreadSecured,
    unconfirmThreadSecured,
    completeJoin,
    revalidateProgress,
    restoreProgress,
    isValidProgress,
    structuralBlocker,
    deriveJoinHistory,
    inspectAggregate,
    ensureForProject,
    loadForProject,
    revalidateForProject,
    confirmForProject,
    unconfirmForProject,
    startForProject,
    completeUnitForProject,
    undoForProject,
    repeatForProject,
    confirmThreadForProject,
    unconfirmThreadForProject,
    completeForProject,
    homeState,
    progressSummary,
    sourceSummary,
    stableStringify,
  };

  globalObject.YarnAIFirstAssemblyJoin = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
