"use strict";

(function exposeFirstAssemblyInspection(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "FIRST_ASSEMBLY_INSPECTION";
  const PREPARATION_KIND = "FIRST_ASSEMBLY_PREPARATION";
  const JOIN_KIND = "FIRST_ASSEMBLY_JOIN";
  const STATUSES = Object.freeze([
    "ready",
    "inspecting",
    "needs_correction",
    "blocked",
    "completed",
  ]);
  const ISSUE_CODES = Object.freeze([
    "edges_misaligned",
    "skipped_join_unit",
    "seam_too_tight",
    "seam_too_loose",
    "thread_not_secure",
    "other",
  ]);
  const CHECKLIST = Object.freeze([
    {
      id: "join_completed",
      label: "Соединение Stage 12B завершено полностью.",
      source: "system",
      answer: null,
    },
    {
      id: "thread_secured",
      label: "Рабочая нить закреплена.",
      source: "system",
      answer: null,
    },
    {
      id: "join_snapshot_unchanged",
      label: "Снимок соединения не изменился.",
      source: "system",
      answer: null,
    },
    {
      id: "edges_aligned",
      label: "Края соединены без заметного смещения.",
      source: "user",
      answer: "edgesAligned",
    },
    {
      id: "no_skipped_units",
      label: "В шве нет пропущенных петель или участков.",
      source: "user",
      answer: "noSkippedUnits",
    },
    {
      id: "seam_even",
      label: "Натяжение шва выглядит равномерным.",
      source: "user",
      answer: "seamEven",
    },
    {
      id: "tension_acceptable",
      label: "Шов не стягивает и не растягивает детали.",
      source: "user",
      answer: "tensionAcceptable",
    },
    {
      id: "thread_secure_confirmed",
      label: "Конец нити действительно закреплён.",
      source: "user",
      answer: "threadSecureConfirmed",
    },
  ]);
  const USER_CHECKLIST_IDS = Object.freeze(
    CHECKLIST.filter((item) => item.source === "user").map(
      (item) => item.id,
    ),
  );
  const ANSWER_KEYS = Object.freeze(
    CHECKLIST.filter((item) => item.answer).map((item) => item.answer),
  );
  const ACTIONS = Object.freeze([
    "inspection_created",
    "inspection_started",
    "checklist_item_checked",
    "checklist_item_unchecked",
    "no_issue_confirmed",
    "issue_marked",
    "correction_acknowledged",
    "issue_resolved_confirmed",
    "inspection_checklist_restarted",
    "inspection_completed",
    "sources_revalidated",
    "became_blocked",
  ]);
  const CORRECTION_INSTRUCTIONS = Object.freeze({
    edges_misaligned:
      "Проверь начало и конец соединения. Если края смещены, вернись к шву и вручную переделай участок, где нарушено совмещение.",
    skipped_join_unit:
      "Найди пропущенную петлю или участок. Вернись к соединению и вручную восстанови пропущенное место.",
    seam_too_tight:
      "Разложи детали без натяжения. Если шов стягивает полотно, вручную ослабь и переделай проблемный участок.",
    seam_too_loose:
      "Проверь свободные петли вдоль соединения. Вручную подтяни или переделай участок, не растягивая детали.",
    thread_not_secure:
      "Надёжно закрепи конец рабочей нити вручную, затем снова проверь шов.",
    other:
      "Осмотри отмеченный участок и исправь проблему вручную. Приложение не распускает и не переделывает шов автоматически.",
  });
  const BLOCKER_MESSAGES = Object.freeze({
    PROJECT_MISSING: "Проект не найден.",
    PREPARATION_MISSING: "Подготовка первого соединения не найдена.",
    PREPARATION_NOT_COMPLETED:
      "Подготовка первого соединения ещё не завершена.",
    PREPARATION_CORRUPTED:
      "Запись подготовки первого соединения повреждена.",
    PREPARATION_REVISION_CONFLICT:
      "Версия подготовки изменилась после завершения соединения.",
    PREPARATION_FINGERPRINT_CONFLICT:
      "Контрольный отпечаток подготовки изменился.",
    JOIN_MISSING: "Завершённое первое соединение не найдено.",
    JOIN_NOT_COMPLETED: "Первое соединение ещё не завершено.",
    JOIN_CORRUPTED: "Запись первого соединения повреждена.",
    JOIN_REVISION_CONFLICT:
      "Версия первого соединения изменилась после начала проверки.",
    JOIN_FINGERPRINT_CONFLICT:
      "Контрольный отпечаток источника первого соединения изменился.",
    JOIN_SNAPSHOT_CONFLICT:
      "Сохранённый снимок первого соединения больше не совпадает с источником.",
    JOIN_UNITS_INCOMPLETE:
      "Не все единицы первого соединения отмечены выполненными.",
    JOIN_REMAINING_UNITS_CONFLICT:
      "Остаток единиц первого соединения рассчитан противоречиво.",
    JOIN_THREAD_NOT_SECURED:
      "Закрепление рабочей нити не подтверждено.",
    JOIN_HISTORY_CORRUPTED:
      "История выполнения первого соединения повреждена.",
    INSPECTION_SNAPSHOT_CONFLICT:
      "Снимок проверки первого шва повреждён или был подменён.",
    INSPECTION_CHECKLIST_CORRUPTED:
      "Контрольный список проверки первого шва повреждён.",
    INSPECTION_ANSWERS_CORRUPTED:
      "Ответы проверки первого шва повреждены.",
    INSPECTION_ISSUE_STATE_CORRUPTED:
      "Состояние обнаруженной проблемы повреждено.",
    INSPECTION_ACTION_HISTORY_CORRUPTED:
      "История действий проверки первого шва повреждена.",
    COMPLETED_INSPECTION_CORRUPTED:
      "Завершённая проверка первого шва содержит противоречия.",
  });

  class FirstAssemblyInspectionError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FirstAssemblyInspectionError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function buildJoinSnapshot(join) {
    const source = isRecord(join?.sourceSnapshot)
      ? join.sourceSnapshot
      : {};
    return copy({
      joinId: text(join?.id) || null,
      joinRevision: positiveInteger(join?.revision),
      joinFingerprint: text(join?.sourceFingerprint) || null,
      joinStatus: text(join?.status) || null,
      projectId:
        text(join?.projectId) || text(source.projectId) || null,
      preparationId: text(source.preparationId) || null,
      preparationRevision: positiveInteger(
        source.preparationRevision,
      ),
      preparationFingerprint:
        text(source.preparationSourceFingerprint) || null,
      firstPiece: copy(source.firstPiece ?? null),
      secondPiece: copy(source.secondPiece ?? null),
      section: copy(source.section ?? null),
      joiningEdge: copy(source.joiningEdge ?? null),
      stitchCounts: copy(source.stitchCounts ?? null),
      operation:
        text(join?.operation) || text(source.operation) || null,
      unitType: text(source.unitType) || null,
      totalUnits: join?.totalUnits ?? null,
      completedUnits: join?.completedUnits ?? null,
      remainingUnits: join?.remainingUnits ?? null,
      threadSecured: join?.threadSecured === true,
      joinCompletedAt: join?.completedAt ?? null,
      joinedAt: join?.joinedAt ?? null,
      shapingFingerprint: source.shapingFingerprint ?? null,
      bindOffFingerprint: source.bindOffFingerprint ?? null,
      joinSourceSnapshot: copy(source),
      joinHistory: copy(join?.joinHistory ?? null),
      joinActionHistory: copy(join?.actionHistory ?? null),
    });
  }

  function joinSnapshotFingerprint(joinOrSnapshot) {
    const snapshot =
      isRecord(joinOrSnapshot) &&
      Object.prototype.hasOwnProperty.call(joinOrSnapshot, "joinId")
        ? copy(joinOrSnapshot)
        : buildJoinSnapshot(joinOrSnapshot);
    return `assembly-join-completed-v1-${fnv64(
      stableStringify(snapshot),
    )}`;
  }

  function buildSourceSnapshot(input = {}) {
    const project = isRecord(input.project) ? input.project : {};
    const preparation = isRecord(input.preparation)
      ? input.preparation
      : {};
    const join = isRecord(input.join) ? input.join : {};
    const joinSnapshot = buildJoinSnapshot(join);
    return copy({
      projectId:
        text(project.projectId) ||
        text(project.project_id) ||
        text(join.projectId) ||
        text(preparation.projectId) ||
        null,
      preparationId: text(preparation.id) || null,
      preparationRevision: positiveInteger(preparation.revision),
      preparationFingerprint:
        text(preparation.sourceFingerprint) || null,
      preparationStatus: text(preparation.status) || null,
      joinId: text(join.id) || null,
      joinRevision: positiveInteger(join.revision),
      joinFingerprint: text(join.sourceFingerprint) || null,
      joinStatus: text(join.status) || null,
      firstPiece: copy(joinSnapshot.firstPiece),
      secondPiece: copy(joinSnapshot.secondPiece),
      section: copy(joinSnapshot.section),
      joiningEdge: copy(joinSnapshot.joiningEdge),
      stitchCounts: copy(joinSnapshot.stitchCounts),
      operation: joinSnapshot.operation,
      unitType: joinSnapshot.unitType,
      totalUnits: joinSnapshot.totalUnits,
      completedUnits: joinSnapshot.completedUnits,
      remainingUnits: joinSnapshot.remainingUnits,
      threadSecured: joinSnapshot.threadSecured,
      joinCompletedAt: joinSnapshot.joinCompletedAt,
      shapingFingerprint: joinSnapshot.shapingFingerprint,
      bindOffFingerprint: joinSnapshot.bindOffFingerprint,
      stage12BSourceSnapshot: copy(joinSnapshot.joinSourceSnapshot),
      stage12BSourceFingerprint: joinSnapshot.joinFingerprint,
      stage12BJoinHistory: copy(joinSnapshot.joinHistory),
      stage12BActionHistory: copy(joinSnapshot.joinActionHistory),
      stage12BFingerprint: joinSnapshotFingerprint(joinSnapshot),
    });
  }

  function sourceFingerprint(snapshot) {
    if (!isRecord(snapshot)) {
      throw stateError(
        "INSPECTION_SNAPSHOT_CONFLICT",
        BLOCKER_MESSAGES.INSPECTION_SNAPSHOT_CONFLICT,
      );
    }
    return `assembly-inspection-source-v1-${fnv64(
      stableStringify(snapshot),
    )}`;
  }

  function evaluateSources(input = {}) {
    const project = isRecord(input.project) ? input.project : null;
    const preparation = isRecord(input.preparation)
      ? input.preparation
      : null;
    const join = isRecord(input.join) ? input.join : null;
    const blockers = [];

    if (!project || !projectIdOf(project)) {
      addBlocker(blockers, "PROJECT_MISSING");
    }
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
        addBlocker(blockers, "PREPARATION_CORRUPTED");
      }
      if (!["ready", "completed"].includes(preparation.status)) {
        addBlocker(blockers, "PREPARATION_NOT_COMPLETED");
      }
      const preparationApi =
        globalObject.YarnAIFirstAssemblyPreparation;
      if (
        preparation.status !== "completed" &&
        preparationApi?.isValidProgress &&
        !preparationApi.isValidProgress(preparation)
      ) {
        addBlocker(blockers, "PREPARATION_CORRUPTED");
      }
      try {
        if (
          preparationApi?.sourceFingerprint &&
          preparationApi.sourceFingerprint(
            preparation.sourceSnapshot,
          ) !== preparation.sourceFingerprint
        ) {
          addBlocker(blockers, "PREPARATION_CORRUPTED");
        }
      } catch {
        addBlocker(blockers, "PREPARATION_CORRUPTED");
      }
    }

    if (!join) {
      addBlocker(blockers, "JOIN_MISSING");
    } else {
      if (
        join.type !== JOIN_KIND ||
        !text(join.id) ||
        !positiveInteger(join.revision) ||
        !isRecord(join.sourceSnapshot) ||
        !text(join.sourceFingerprint)
      ) {
        addBlocker(blockers, "JOIN_CORRUPTED");
      }
      if (join.status !== "completed") {
        addBlocker(blockers, "JOIN_NOT_COMPLETED");
      }
      if (
        !positiveInteger(join.totalUnits) ||
        !nonNegativeInteger(join.completedUnits) ||
        join.completedUnits !== join.totalUnits
      ) {
        addBlocker(blockers, "JOIN_UNITS_INCOMPLETE");
      }
      if (
        !nonNegativeInteger(join.remainingUnits) ||
        join.remainingUnits !==
          join.totalUnits - join.completedUnits ||
        join.remainingUnits !== 0
      ) {
        addBlocker(blockers, "JOIN_REMAINING_UNITS_CONFLICT");
      }
      if (join.threadSecured !== true) {
        addBlocker(blockers, "JOIN_THREAD_NOT_SECURED");
      }
      if (!isTimestamp(join.completedAt)) {
        addBlocker(blockers, "JOIN_CORRUPTED");
      }
      if (!validJoinHistory(join)) {
        addBlocker(blockers, "JOIN_HISTORY_CORRUPTED");
      }
      if (!validJoinSourceFingerprint(join)) {
        addBlocker(blockers, "JOIN_FINGERPRINT_CONFLICT");
      }
      const joinApi = globalObject.YarnAIFirstAssemblyJoin;
      if (
        joinApi?.isValidProgress &&
        !joinApi.isValidProgress(join) &&
        !blockers.some((entry) =>
          [
            "JOIN_UNITS_INCOMPLETE",
            "JOIN_REMAINING_UNITS_CONFLICT",
            "JOIN_THREAD_NOT_SECURED",
            "JOIN_HISTORY_CORRUPTED",
            "JOIN_FINGERPRINT_CONFLICT",
          ].includes(entry.code),
        )
      ) {
        addBlocker(blockers, "JOIN_CORRUPTED");
      }
    }

    const currentProjectId = projectIdOf(project);
    for (const source of [preparation, join]) {
      if (
        source &&
        currentProjectId &&
        text(source.projectId) &&
        source.projectId !== currentProjectId
      ) {
        addBlocker(blockers, "JOIN_SNAPSHOT_CONFLICT");
      }
    }
    if (preparation && join && isRecord(join.sourceSnapshot)) {
      if (
        join.sourceSnapshot.preparationId !== preparation.id ||
        join.sourceSnapshot.preparationRevision !==
          preparation.revision
      ) {
        addBlocker(blockers, "PREPARATION_REVISION_CONFLICT");
      }
      if (
        join.sourceSnapshot.preparationSourceFingerprint !==
        preparation.sourceFingerprint
      ) {
        addBlocker(
          blockers,
          "PREPARATION_FINGERPRINT_CONFLICT",
        );
      }
    }

    const snapshot = buildSourceSnapshot(input);
    return {
      snapshot,
      fingerprint: sourceFingerprint(snapshot),
      blockers,
    };
  }

  function createProgress(input = {}, now = new Date().toISOString()) {
    requireTimestamp(now);
    const evaluation = evaluateSources(input);
    const status =
      evaluation.blockers.length > 0 ? "blocked" : "ready";
    const revision = 1;
    const inspectionId = makeId("assembly-inspection");
    const progress = {
      inspectionId,
      id: inspectionId,
      type: PROGRESS_KIND,
      version: VERSION,
      revision,
      projectId:
        text(evaluation.snapshot.projectId) || "unknown-project",
      preparationId: evaluation.snapshot.preparationId,
      preparationRevision:
        evaluation.snapshot.preparationRevision,
      preparationFingerprint:
        evaluation.snapshot.preparationFingerprint,
      joinId: evaluation.snapshot.joinId,
      joinRevision: evaluation.snapshot.joinRevision,
      joinFingerprint: evaluation.snapshot.joinFingerprint,
      joinSnapshotFingerprint:
        evaluation.snapshot.stage12BFingerprint,
      sourceSnapshot: copy(evaluation.snapshot),
      sourceFingerprint: evaluation.fingerprint,
      status,
      checklist: createChecklist(evaluation.blockers, now),
      answers: emptyAnswers(),
      issueDetected: null,
      issueCode: null,
      issueNote: null,
      correctionAcknowledged: false,
      correctionInstruction: null,
      issueResolvedConfirmed: false,
      actionHistory: [
        createAction(
          null,
          "inspection_created",
          now,
          null,
          status,
          revision,
          {
            sourceFingerprint: evaluation.fingerprint,
            joinSnapshotFingerprint:
              evaluation.snapshot.stage12BFingerprint,
          },
        ),
      ],
      blockers: copy(evaluation.blockers),
      warnings: [
        notice(
          "STAGE_12C_FIRST_JOIN_ONLY",
          "Эта проверка относится только к первому выполненному соединению.",
        ),
      ],
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      correctionRequiredAt: null,
      completedAt: null,
    };
    if (status === "blocked") {
      progress.actionHistory.push(
        createAction(
          progress,
          "became_blocked",
          now,
          status,
          status,
          revision,
          {
            blockerCodes: evaluation.blockers.map(
              (entry) => entry.code,
            ),
          },
        ),
      );
    }
    requireValidProgress(progress);
    return progress;
  }

  function startInspection(
    progress,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireMutable(progress);
    if (progress.status === "inspecting") {
      return copy(progress);
    }
    if (progress.status !== "ready") {
      throw stateError(
        "INSPECTION_NOT_READY",
        "Проверку первого шва сейчас нельзя начать.",
      );
    }
    return finalizeMutation(
      progress,
      now,
      {
        status: "inspecting",
        startedAt: now,
      },
      "inspection_started",
      {},
    );
  }

  function setChecklistItem(
    progress,
    itemId,
    checked,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireInspecting(progress);
    if (!USER_CHECKLIST_IDS.includes(itemId)) {
      throw stateError(
        "CHECKLIST_ITEM_NOT_USER_EDITABLE",
        "Этот пункт проверяется системой и не меняется вручную.",
        { itemId },
      );
    }
    if (typeof checked !== "boolean") {
      throw stateError(
        "CHECKLIST_VALUE_INVALID",
        "Не удалось сохранить состояние пункта проверки.",
      );
    }
    const current = progress.checklist.find(
      (item) => item.id === itemId,
    );
    if (current.checked === checked) {
      return copy(progress);
    }
    const definition = CHECKLIST.find(
      (item) => item.id === itemId,
    );
    const checklist = progress.checklist.map((item) =>
      item.id === itemId
        ? {
            ...copy(item),
            checked,
            checkedAt: checked ? now : null,
            updatedAt: now,
          }
        : copy(item),
    );
    const answers = {
      ...copy(progress.answers),
      [definition.answer]: checked,
    };
    return finalizeMutation(
      progress,
      now,
      { checklist, answers },
      checked
        ? "checklist_item_checked"
        : "checklist_item_unchecked",
      { itemId, answer: definition.answer, value: checked },
    );
  }

  function checkItem(progress, itemId, now) {
    return setChecklistItem(progress, itemId, true, now);
  }

  function uncheckItem(progress, itemId, now) {
    return setChecklistItem(progress, itemId, false, now);
  }

  function confirmNoIssue(
    progress,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireInspecting(progress);
    if (
      progress.issueDetected === false &&
      progress.issueCode === null
    ) {
      return copy(progress);
    }
    return finalizeMutation(
      progress,
      now,
      {
        issueDetected: false,
        issueCode: null,
        issueNote: null,
        correctionAcknowledged: false,
        correctionInstruction: null,
        issueResolvedConfirmed: false,
        correctionRequiredAt: null,
      },
      "no_issue_confirmed",
      {},
    );
  }

  function markIssue(
    progress,
    issueCode,
    issueNote = null,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireInspecting(progress);
    if (!ISSUE_CODES.includes(issueCode)) {
      throw stateError(
        "ISSUE_CODE_INVALID",
        "Выберите один из доступных типов проблемы.",
        { issueCode },
      );
    }
    const note = normalizeIssueNote(issueCode, issueNote);
    return finalizeMutation(
      progress,
      now,
      {
        status: "needs_correction",
        issueDetected: true,
        issueCode,
        issueNote: note,
        correctionAcknowledged: false,
        correctionInstruction:
          CORRECTION_INSTRUCTIONS[issueCode],
        issueResolvedConfirmed: false,
        correctionRequiredAt: now,
      },
      "issue_marked",
      {
        issueCode,
        issueNote: note,
        correctionInstruction:
          CORRECTION_INSTRUCTIONS[issueCode],
      },
    );
  }

  function acknowledgeCorrection(
    progress,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireMutable(progress);
    if (
      progress.status !== "needs_correction" ||
      progress.issueDetected !== true
    ) {
      throw stateError(
        "NO_ACTIVE_ISSUE",
        "Активная проблема для подтверждения не найдена.",
      );
    }
    if (progress.correctionAcknowledged) {
      return copy(progress);
    }
    return finalizeMutation(
      progress,
      now,
      { correctionAcknowledged: true },
      "correction_acknowledged",
      { issueCode: progress.issueCode },
    );
  }

  function confirmIssueResolved(
    progress,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireMutable(progress);
    if (
      progress.status !== "needs_correction" ||
      progress.issueDetected !== true
    ) {
      throw stateError(
        "NO_ACTIVE_ISSUE",
        "Активная проблема для исправления не найдена.",
      );
    }
    if (!progress.correctionAcknowledged) {
      throw stateError(
        "CORRECTION_NOT_ACKNOWLEDGED",
        "Сначала подтвердите, что поняли необходимость ручного исправления.",
      );
    }
    const checklist = progress.checklist.map((item) =>
      item.source === "user"
        ? {
            ...copy(item),
            checked: false,
            checkedAt: null,
            updatedAt: now,
          }
        : copy(item),
    );
    return finalizeMutation(
      progress,
      now,
      {
        status: "inspecting",
        checklist,
        answers: emptyAnswers(),
        issueDetected: false,
        correctionAcknowledged: true,
        issueResolvedConfirmed: true,
      },
      "issue_resolved_confirmed",
      {
        issueCode: progress.issueCode,
        issueNote: progress.issueNote,
      },
      [
        {
          type: "inspection_checklist_restarted",
          details: {
            reason: "issue_resolved",
            issueCode: progress.issueCode,
          },
        },
      ],
    );
  }

  function completeInspection(
    progress,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    if (progress.status === "completed") {
      return copy(progress);
    }
    requireInspecting(progress);
    if (
      !progress.checklist.every((item) => item.checked) ||
      !ANSWER_KEYS.every((key) => progress.answers[key] === true)
    ) {
      throw stateError(
        "INSPECTION_INCOMPLETE",
        "Перед подтверждением отметьте все пункты проверки.",
      );
    }
    if (
      progress.issueDetected !== false ||
      (progress.issueCode !== null &&
        progress.issueResolvedConfirmed !== true) ||
      progress.blockers.length
    ) {
      throw stateError(
        "ISSUE_UNRESOLVED",
        "Сначала исправьте обнаруженную проблему и пройдите проверку заново.",
      );
    }
    return finalizeMutation(
      progress,
      now,
      {
        status: "completed",
        completedAt: now,
      },
      "inspection_completed",
      {
        joinId: progress.joinId,
        joinSnapshotFingerprint:
          progress.joinSnapshotFingerprint,
      },
    );
  }

  function revalidateProgress(
    progress,
    input,
    now = new Date().toISOString(),
  ) {
    requireTimestamp(now);
    if (isRecord(progress) && progress.status === "blocked") {
      return copy(progress);
    }
    const structuralCode = structuralBlocker(progress);
    if (structuralCode) {
      return blockCorruptedProgress(progress, structuralCode, now);
    }
    const conflict = sourceConflict(progress, input);
    if (conflict) {
      return blockProgress(
        progress,
        conflict.code,
        now,
        conflict.details,
      );
    }
    const evaluation = evaluateSources(input);
    if (evaluation.blockers.length) {
      return blockProgress(
        progress,
        evaluation.blockers[0].code,
        now,
        evaluation.blockers[0].details,
        evaluation.blockers,
      );
    }
    if (
      evaluation.fingerprint !== progress.sourceFingerprint ||
      evaluation.snapshot.stage12BFingerprint !==
        progress.joinSnapshotFingerprint
    ) {
      return blockProgress(
        progress,
        "JOIN_SNAPSHOT_CONFLICT",
        now,
        {
          savedFingerprint: progress.sourceFingerprint,
          currentFingerprint: evaluation.fingerprint,
        },
      );
    }
    return copy(progress);
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
        "INSPECTION_SNAPSHOT_CONFLICT",
        BLOCKER_MESSAGES.INSPECTION_SNAPSHOT_CONFLICT,
      );
    }
    if (
      !isValidProgress(value) &&
      !(value?.status === "blocked" && minimalBlockedRecord(value))
    ) {
      throw stateError(
        "INSPECTION_DATA_DAMAGED",
        "Запись проверки первого шва повреждена.",
      );
    }
    return value;
  }

  function isValidProgress(value) {
    if (
      !isRecord(value) ||
      !text(value.inspectionId) ||
      value.id !== value.inspectionId ||
      value.type !== PROGRESS_KIND ||
      value.version !== VERSION ||
      !positiveInteger(value.revision) ||
      !text(value.projectId) ||
      !STATUSES.includes(value.status) ||
      !isRecord(value.sourceSnapshot) ||
      !text(value.sourceFingerprint) ||
      value.sourceFingerprint !==
        sourceFingerprint(value.sourceSnapshot) ||
      value.preparationId !== value.sourceSnapshot.preparationId ||
      value.preparationRevision !==
        value.sourceSnapshot.preparationRevision ||
      value.preparationFingerprint !==
        value.sourceSnapshot.preparationFingerprint ||
      value.joinId !== value.sourceSnapshot.joinId ||
      value.joinRevision !== value.sourceSnapshot.joinRevision ||
      value.joinFingerprint !== value.sourceSnapshot.joinFingerprint ||
      value.joinSnapshotFingerprint !==
        value.sourceSnapshot.stage12BFingerprint ||
      !validChecklist(value.checklist) ||
      !validAnswers(value.answers) ||
      !validIssueState(value) ||
      !validActionHistory(value.actionHistory, value.revision) ||
      !Array.isArray(value.blockers) ||
      !value.blockers.every(validNotice) ||
      !Array.isArray(value.warnings) ||
      !value.warnings.every(validNotice) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt) ||
      !nullableTimestamp(value.startedAt) ||
      !nullableTimestamp(value.correctionRequiredAt) ||
      !nullableTimestamp(value.completedAt)
    ) {
      return false;
    }
    if (value.status === "blocked") {
      return value.blockers.length > 0 && value.completedAt === null;
    }
    if (value.blockers.length) {
      return false;
    }
    if (value.status === "ready") {
      return (
        value.startedAt === null &&
        value.completedAt === null &&
        value.issueDetected === null
      );
    }
    if (value.status === "inspecting") {
      return (
        isTimestamp(value.startedAt) &&
        value.completedAt === null &&
        value.issueDetected !== true
      );
    }
    if (value.status === "needs_correction") {
      return (
        isTimestamp(value.startedAt) &&
        isTimestamp(value.correctionRequiredAt) &&
        value.completedAt === null &&
        value.issueDetected === true
      );
    }
    return (
      isTimestamp(value.startedAt) &&
      isTimestamp(value.completedAt) &&
      value.issueDetected === false &&
      value.checklist.every((item) => item.checked) &&
      ANSWER_KEYS.every((key) => value.answers[key] === true)
    );
  }

  function structuralBlocker(value) {
    if (!isRecord(value)) {
      return "INSPECTION_SNAPSHOT_CONFLICT";
    }
    if (!validChecklist(value.checklist)) {
      return "INSPECTION_CHECKLIST_CORRUPTED";
    }
    if (!validAnswers(value.answers)) {
      return "INSPECTION_ANSWERS_CORRUPTED";
    }
    if (!validIssueState(value)) {
      return "INSPECTION_ISSUE_STATE_CORRUPTED";
    }
    if (!validActionHistory(value.actionHistory, value.revision)) {
      return "INSPECTION_ACTION_HISTORY_CORRUPTED";
    }
    if (
      !isRecord(value.sourceSnapshot) ||
      !text(value.sourceFingerprint)
    ) {
      return "INSPECTION_SNAPSHOT_CONFLICT";
    }
    try {
      if (
        sourceFingerprint(value.sourceSnapshot) !==
          value.sourceFingerprint ||
        value.joinSnapshotFingerprint !==
          value.sourceSnapshot.stage12BFingerprint ||
        value.preparationId !==
          value.sourceSnapshot.preparationId ||
        value.joinId !== value.sourceSnapshot.joinId
      ) {
        return "INSPECTION_SNAPSHOT_CONFLICT";
      }
    } catch {
      return "INSPECTION_SNAPSHOT_CONFLICT";
    }
    if (
      value.status === "completed" &&
      (!isTimestamp(value.completedAt) ||
        value.issueDetected !== false ||
        !value.checklist.every((item) => item.checked) ||
        !ANSWER_KEYS.every((key) => value.answers[key] === true))
    ) {
      return "COMPLETED_INSPECTION_CORRUPTED";
    }
    if (
      !text(value.inspectionId) ||
      value.id !== value.inspectionId ||
      value.type !== PROGRESS_KIND ||
      value.version !== VERSION ||
      !positiveInteger(value.revision) ||
      !STATUSES.includes(value.status) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt)
    ) {
      return value.status === "completed"
        ? "COMPLETED_INSPECTION_CORRUPTED"
        : "INSPECTION_SNAPSHOT_CONFLICT";
    }
    return null;
  }

  function sourceConflict(progress, input = {}) {
    const project = input.project;
    const preparation = input.preparation;
    const join = input.join;
    if (!project || !projectIdOf(project)) {
      return { code: "PROJECT_MISSING", details: {} };
    }
    if (projectIdOf(project) !== progress.projectId) {
      return {
        code: "JOIN_SNAPSHOT_CONFLICT",
        details: {
          savedProjectId: progress.projectId,
          currentProjectId: projectIdOf(project),
        },
      };
    }
    if (!preparation) {
      return { code: "PREPARATION_MISSING", details: {} };
    }
    if (preparation.id !== progress.preparationId) {
      return {
        code: "JOIN_SNAPSHOT_CONFLICT",
        details: {
          savedPreparationId: progress.preparationId,
          currentPreparationId: preparation.id ?? null,
        },
      };
    }
    if (preparation.revision !== progress.preparationRevision) {
      return {
        code: "PREPARATION_REVISION_CONFLICT",
        details: {
          savedRevision: progress.preparationRevision,
          currentRevision: preparation.revision ?? null,
        },
      };
    }
    if (
      preparation.sourceFingerprint !==
      progress.preparationFingerprint
    ) {
      return {
        code: "PREPARATION_FINGERPRINT_CONFLICT",
        details: {},
      };
    }
    if (!join) {
      return { code: "JOIN_MISSING", details: {} };
    }
    if (join.id !== progress.joinId) {
      return {
        code: "JOIN_SNAPSHOT_CONFLICT",
        details: {
          savedJoinId: progress.joinId,
          currentJoinId: join.id ?? null,
        },
      };
    }
    if (join.revision !== progress.joinRevision) {
      return {
        code: "JOIN_REVISION_CONFLICT",
        details: {
          savedRevision: progress.joinRevision,
          currentRevision: join.revision ?? null,
        },
      };
    }
    if (join.sourceFingerprint !== progress.joinFingerprint) {
      return {
        code: "JOIN_FINGERPRINT_CONFLICT",
        details: {},
      };
    }
    const currentJoinFingerprint = joinSnapshotFingerprint(join);
    if (
      currentJoinFingerprint !== progress.joinSnapshotFingerprint
    ) {
      return {
        code: "JOIN_SNAPSHOT_CONFLICT",
        details: {
          savedFingerprint: progress.joinSnapshotFingerprint,
          currentFingerprint: currentJoinFingerprint,
        },
      };
    }
    return null;
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      return blockedInspection("PROJECT_MISSING");
    }
    const calculation = activeCalculation(aggregate, project);
    if (!calculation) {
      return blockedInspection("PROJECT_MISSING", { project });
    }
    const preparationMatches = progressMatches(
      aggregate,
      PREPARATION_KIND,
      calculation.calculation_id,
    );
    const joinMatches = progressMatches(
      aggregate,
      JOIN_KIND,
      calculation.calculation_id,
    );
    const inspectionMatches = progressMatches(
      aggregate,
      PROGRESS_KIND,
      calculation.calculation_id,
    );
    if (
      preparationMatches.length > 1 ||
      joinMatches.length > 1 ||
      inspectionMatches.length > 1
    ) {
      return blockedInspection("JOIN_SNAPSHOT_CONFLICT", {
        project,
        calculation,
      });
    }
    const preparationRecord = preparationMatches[0] ?? null;
    const joinRecord = joinMatches[0] ?? null;
    const progressRecord = inspectionMatches[0] ?? null;
    const preparation =
      preparationRecord && !isPlaceholder(preparationRecord.state)
        ? preparationRecord.state
        : null;
    const join =
      joinRecord && !isPlaceholder(joinRecord.state)
        ? joinRecord.state
        : null;
    const inspection =
      progressRecord && !isPlaceholder(progressRecord.state)
        ? progressRecord.state
        : null;
    const input = { project, preparation, join };
    if (!inspection) {
      const evaluation = evaluateSources(input);
      return {
        state: evaluation.blockers.length ? "blocked" : "missing",
        status: evaluation.blockers.length ? "blocked" : "ready",
        project,
        calculation,
        preparationRecord: copy(preparationRecord),
        preparation: copy(preparation),
        joinRecord: copy(joinRecord),
        join: copy(join),
        progress: copy(progressRecord),
        inspection: null,
        input,
        blockers: copy(evaluation.blockers),
        code: evaluation.blockers[0]?.code ?? null,
        message: evaluation.blockers[0]?.message ?? null,
      };
    }
    if (inspection.status === "blocked") {
      return inspectionResult(
        project,
        calculation,
        preparationRecord,
        preparation,
        joinRecord,
        join,
        progressRecord,
        inspection,
        input,
      );
    }
    const structuralCode = structuralBlocker(inspection);
    if (structuralCode) {
      return blockedInspection(structuralCode, {
        project,
        calculation,
        preparationRecord: copy(preparationRecord),
        preparation: copy(preparation),
        joinRecord: copy(joinRecord),
        join: copy(join),
        progress: copy(progressRecord),
        inspection: copy(inspection),
        input,
      });
    }
    const conflict = sourceConflict(inspection, input);
    if (conflict) {
      return blockedInspection(conflict.code, {
        project,
        calculation,
        preparationRecord: copy(preparationRecord),
        preparation: copy(preparation),
        joinRecord: copy(joinRecord),
        join: copy(join),
        progress: copy(progressRecord),
        inspection: copy(inspection),
        input,
      });
    }
    return inspectionResult(
      project,
      calculation,
      preparationRecord,
      preparation,
      joinRecord,
      join,
      progressRecord,
      inspection,
      input,
    );
  }

  async function ensureForProject(repository, projectId) {
    let aggregate = await repository.getProject(projectId);
    let result = inspectAggregate(aggregate);
    if (result.inspection) {
      const next = revalidateProgress(
        result.inspection,
        result.input,
      );
      if (
        stableStringify(next) ===
        stableStringify(result.inspection)
      ) {
        return result;
      }
      return persist(
        repository,
        result,
        next,
        next.status === "blocked"
          ? "FIRST_ASSEMBLY_INSPECTION_BLOCKED"
          : "FIRST_ASSEMBLY_INSPECTION_SOURCES_REVALIDATED",
      );
    }
    if (!result.calculation) {
      throw errorFromInspection(result);
    }
    if (!result.progress) {
      const input = copy(result.input);
      await repository.ensureCalculationProgress(
        projectId,
        result.calculation.calculation_id,
        PROGRESS_KIND,
        { version: 0, initialized: false },
        {
          operationKind:
            "FIRST_ASSEMBLY_INSPECTION_PROGRESS_CREATED",
        },
      );
      aggregate = await repository.getProject(projectId);
      const project = aggregate.project;
      const calculation = activeCalculation(aggregate, project);
      result = {
        ...result,
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
    const state = createProgress(result.input, now);
    await repository.updateCalculationProgress(
      projectId,
      result.calculation.calculation_id,
      PROGRESS_KIND,
      state,
      {
        baseProgressRevision: result.progress.revision,
        operationKind: "FIRST_ASSEMBLY_INSPECTION_CREATED",
        projectStage:
          state.status === "blocked"
            ? "assembly_inspection_blocked"
            : "assembly_inspection_ready",
        timestamp: now,
      },
    );
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function getForProject(repository, projectId) {
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function loadForProject(repository, projectId) {
    return getForProject(repository, projectId);
  }

  async function revalidateForProject(repository, projectId) {
    const result = inspectAggregate(
      await repository.getProject(projectId),
    );
    if (!result.inspection) {
      return ensureForProject(repository, projectId);
    }
    const next = revalidateProgress(
      result.inspection,
      result.input,
    );
    if (
      stableStringify(next) ===
      stableStringify(result.inspection)
    ) {
      return result;
    }
    return persist(
      repository,
      result,
      next,
      next.status === "blocked"
        ? "FIRST_ASSEMBLY_INSPECTION_BLOCKED"
        : "FIRST_ASSEMBLY_INSPECTION_SOURCES_REVALIDATED",
    );
  }

  async function startForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      startInspection,
      "FIRST_ASSEMBLY_INSPECTION_STARTED",
    );
  }

  async function setChecklistForProject(
    repository,
    projectId,
    itemId,
    checked,
  ) {
    return mutateForProject(
      repository,
      projectId,
      (progress) =>
        setChecklistItem(progress, itemId, checked),
      checked
        ? "FIRST_ASSEMBLY_INSPECTION_ITEM_CHECKED"
        : "FIRST_ASSEMBLY_INSPECTION_ITEM_UNCHECKED",
    );
  }

  async function confirmNoIssueForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      confirmNoIssue,
      "FIRST_ASSEMBLY_INSPECTION_NO_ISSUE",
    );
  }

  async function markIssueForProject(
    repository,
    projectId,
    issueCode,
    issueNote = null,
  ) {
    return mutateForProject(
      repository,
      projectId,
      (progress) =>
        markIssue(progress, issueCode, issueNote),
      "FIRST_ASSEMBLY_INSPECTION_ISSUE_MARKED",
    );
  }

  async function acknowledgeForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      acknowledgeCorrection,
      "FIRST_ASSEMBLY_INSPECTION_CORRECTION_ACKNOWLEDGED",
    );
  }

  async function resolveForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      confirmIssueResolved,
      "FIRST_ASSEMBLY_INSPECTION_ISSUE_RESOLVED",
    );
  }

  async function completeForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      completeInspection,
      "FIRST_ASSEMBLY_INSPECTION_COMPLETED",
    );
  }

  async function mutateForProject(
    repository,
    projectId,
    mutation,
    operationKind,
  ) {
    let result = inspectAggregate(
      await repository.getProject(projectId),
    );
    if (!result.inspection || !result.progress) {
      result = await ensureForProject(repository, projectId);
    }
    if (!result.inspection || !result.progress) {
      throw errorFromInspection(result);
    }
    const validated = revalidateProgress(
      result.inspection,
      result.input,
    );
    if (validated.status === "blocked") {
      if (
        stableStringify(validated) ===
        stableStringify(result.inspection)
      ) {
        throw stateError(
          "FIRST_ASSEMBLY_INSPECTION_BLOCKED",
          validated.blockers[0]?.message ||
            "Проверка первого шва заблокирована.",
        );
      }
      return persist(
        repository,
        result,
        validated,
        "FIRST_ASSEMBLY_INSPECTION_BLOCKED",
      );
    }
    const next = mutation(validated);
    if (
      stableStringify(next) ===
      stableStringify(result.inspection)
    ) {
      return result;
    }
    return persist(repository, result, next, operationKind);
  }

  async function persist(repository, result, state, operationKind) {
    const stages = {
      ready: "assembly_inspection_ready",
      inspecting: "assembly_inspection_in_progress",
      needs_correction:
        "assembly_inspection_needs_correction",
      blocked: "assembly_inspection_blocked",
      completed: "assembly_inspection_completed",
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

  function homeState(result, projectId) {
    if (!result) {
      return null;
    }
    const inspection = result.inspection;
    if (result.state === "blocked") {
      return {
        stage: "Проверка первого шва заблокирована",
        summary:
          result.message ||
          inspection?.blockers?.[0]?.message ||
          "Источник первого соединения требует проверки.",
        label: "Открыть безопасное состояние",
        href: `/first-assembly-inspection?project=${encodeURIComponent(
          projectId,
        )}`,
        status: "blocked",
        inspection: inspection ? copy(inspection) : null,
      };
    }
    if (!inspection) {
      return null;
    }
    const labels = {
      ready: {
        stage: "Первый шов готов к проверке",
        label: "Проверить первый шов",
      },
      inspecting: {
        stage: "Проверка первого шва продолжается",
        label: "Продолжить проверку",
      },
      needs_correction: {
        stage: "Первый шов требует исправления",
        label: "Продолжить исправление",
      },
      completed: {
        stage: "Первая сборочная операция завершена",
        label: "Посмотреть принятую проверку",
      },
    };
    const display = labels[inspection.status] ?? labels.ready;
    return {
      stage: display.stage,
      summary: progressSummary(inspection),
      label: display.label,
      href: `/first-assembly-inspection?project=${encodeURIComponent(
        projectId,
      )}`,
      status: inspection.status,
      inspection: copy(inspection),
    };
  }

  function progressSummary(progress) {
    if (!progress) {
      return "";
    }
    if (progress.status === "completed") {
      return "Первый шов проверен и принят. Первая сборочная операция завершена.";
    }
    if (progress.status === "needs_correction") {
      return (
        progress.correctionInstruction ||
        "Исправьте отмеченную проблему вручную и повторите проверку."
      );
    }
    const checked = progress.checklist.filter(
      (item) => item.source === "user" && item.checked,
    ).length;
    return `Проверено ${checked} из ${USER_CHECKLIST_IDS.length} пользовательских пунктов.`;
  }

  function sourceSummary(progress) {
    const source = progress?.sourceSnapshot;
    if (!source) {
      return "";
    }
    const first =
      source.firstPiece?.data?.sectionLabel ||
      source.firstPiece?.sectionLabel ||
      source.firstPiece?.section ||
      "первая деталь";
    const second =
      source.secondPiece?.data?.sectionLabel ||
      source.secondPiece?.sectionLabel ||
      source.secondPiece?.section ||
      "вторая деталь";
    const unitProgress =
      nonNegativeInteger(source.completedUnits) &&
      positiveInteger(source.totalUnits)
        ? `соединено ${source.completedUnits} из ${
            source.totalUnits
          } ${unitLabel(source.unitType)}`
        : "количество соединённых единиц недоступно";
    const threadState = source.threadSecured
      ? "нить закреплена"
      : "закрепление нити не подтверждено";
    return `${first} и ${second}: ${unitProgress}; ${threadState}.`;
  }

  function inspectionResult(
    project,
    calculation,
    preparationRecord,
    preparation,
    joinRecord,
    join,
    progressRecord,
    inspection,
    input,
  ) {
    return {
      state:
        inspection.status === "blocked" ? "blocked" : "ready",
      status: inspection.status,
      project,
      calculation,
      preparationRecord: copy(preparationRecord),
      preparation: copy(preparation),
      joinRecord: copy(joinRecord),
      join: copy(join),
      progress: copy(progressRecord),
      inspection: copy(inspection),
      input,
      blockers: copy(inspection.blockers),
      code: inspection.blockers[0]?.code ?? null,
      message: inspection.blockers[0]?.message ?? null,
    };
  }

  function createChecklist(blockers, now) {
    const codes = new Set(blockers.map((entry) => entry.code));
    const joinCompleted =
      !codes.has("JOIN_MISSING") &&
      !codes.has("JOIN_NOT_COMPLETED") &&
      !codes.has("JOIN_CORRUPTED") &&
      !codes.has("JOIN_UNITS_INCOMPLETE") &&
      !codes.has("JOIN_REMAINING_UNITS_CONFLICT") &&
      !codes.has("JOIN_HISTORY_CORRUPTED");
    const threadSecured =
      joinCompleted && !codes.has("JOIN_THREAD_NOT_SECURED");
    const snapshotUnchanged =
      blockers.length === 0 &&
      joinCompleted &&
      threadSecured;
    return CHECKLIST.map((definition) => {
      const checked =
        definition.id === "join_completed"
          ? joinCompleted
          : definition.id === "thread_secured"
            ? threadSecured
            : definition.id === "join_snapshot_unchanged"
              ? snapshotUnchanged
              : false;
      return {
        id: definition.id,
        label: definition.label,
        required: true,
        source: definition.source,
        checked,
        checkedAt:
          definition.source === "system" && checked ? now : null,
        updatedAt: now,
      };
    });
  }

  function emptyAnswers() {
    return {
      edgesAligned: null,
      seamEven: null,
      noSkippedUnits: null,
      tensionAcceptable: null,
      threadSecureConfirmed: null,
    };
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
          typeof item.checked === "boolean" &&
          nullableTimestamp(item.checkedAt) &&
          isTimestamp(item.updatedAt) &&
          (item.checked
            ? isTimestamp(item.checkedAt)
            : item.checkedAt === null)
        );
      })
    );
  }

  function validAnswers(answers) {
    return (
      isRecord(answers) &&
      Object.keys(answers).sort().join("|") ===
        [...ANSWER_KEYS].sort().join("|") &&
      ANSWER_KEYS.every(
        (key) =>
          answers[key] === null ||
          typeof answers[key] === "boolean",
      )
    );
  }

  function validIssueState(value) {
    if (
      ![null, true, false].includes(value.issueDetected) ||
      !(
        value.issueCode === null ||
        ISSUE_CODES.includes(value.issueCode)
      ) ||
      !(value.issueNote === null || typeof value.issueNote === "string") ||
      typeof value.correctionAcknowledged !== "boolean" ||
      !(
        value.correctionInstruction === null ||
        typeof value.correctionInstruction === "string"
      ) ||
      typeof value.issueResolvedConfirmed !== "boolean"
    ) {
      return false;
    }
    if (value.issueDetected === null) {
      return (
        value.issueCode === null &&
        value.issueNote === null &&
        value.correctionAcknowledged === false &&
        value.correctionInstruction === null &&
        value.issueResolvedConfirmed === false
      );
    }
    if (value.issueDetected === true) {
      return (
        ISSUE_CODES.includes(value.issueCode) &&
        value.correctionInstruction ===
          CORRECTION_INSTRUCTIONS[value.issueCode] &&
        value.issueResolvedConfirmed === false
      );
    }
    if (value.issueCode === null) {
      return (
        value.issueNote === null &&
        value.correctionAcknowledged === false &&
        value.correctionInstruction === null &&
        value.issueResolvedConfirmed === false
      );
    }
    return (
      ISSUE_CODES.includes(value.issueCode) &&
      value.correctionAcknowledged === true &&
      value.issueResolvedConfirmed === true &&
      value.correctionInstruction ===
        CORRECTION_INSTRUCTIONS[value.issueCode]
    );
  }

  function validActionHistory(history, revision) {
    if (!Array.isArray(history) || history.length === 0) {
      return false;
    }
    const ids = new Set();
    let lastRevision = 0;
    return (
      history.every((entry, index) => {
        if (
          !isRecord(entry) ||
          !text(entry.actionId) ||
          ids.has(entry.actionId) ||
          entry.sequence !== index + 1 ||
          !ACTIONS.includes(entry.actionType) ||
          !isTimestamp(entry.timestamp) ||
          !(
            entry.previousStatus === null ||
            STATUSES.includes(entry.previousStatus)
          ) ||
          !STATUSES.includes(entry.resultingStatus) ||
          !positiveInteger(entry.revision) ||
          entry.revision < lastRevision ||
          entry.revision > revision ||
          !isRecord(entry.details)
        ) {
          return false;
        }
        ids.add(entry.actionId);
        lastRevision = entry.revision;
        return true;
      }) && history[0].actionType === "inspection_created"
    );
  }

  function validJoinHistory(join) {
    const joinApi = globalObject.YarnAIFirstAssemblyJoin;
    try {
      if (joinApi?.deriveJoinHistory) {
        const derived = joinApi.deriveJoinHistory(
          join.joinHistory,
          join.totalUnits,
        );
        return derived.completedUnits === join.completedUnits;
      }
    } catch {
      return false;
    }
    return (
      Array.isArray(join?.joinHistory) &&
      join.joinHistory.length >= join.completedUnits &&
      Array.isArray(join?.actionHistory)
    );
  }

  function validJoinSourceFingerprint(join) {
    const joinApi = globalObject.YarnAIFirstAssemblyJoin;
    try {
      return joinApi?.sourceFingerprint
        ? joinApi.sourceFingerprint(join.sourceSnapshot) ===
            join.sourceFingerprint
        : Boolean(
            isRecord(join.sourceSnapshot) &&
              text(join.sourceFingerprint),
          );
    } catch {
      return false;
    }
  }

  function finalizeMutation(
    progress,
    now,
    patch,
    actionType,
    details,
    additionalActions = [],
  ) {
    const nextRevision = progress.revision + 1;
    const resultingStatus = patch.status ?? progress.status;
    const history = [
      ...copy(progress.actionHistory),
      createAction(
        progress,
        actionType,
        now,
        progress.status,
        resultingStatus,
        nextRevision,
        details,
      ),
      ...additionalActions.map((entry) =>
        createAction(
          progress,
          entry.type,
          now,
          resultingStatus,
          resultingStatus,
          nextRevision,
          entry.details,
          progress.actionHistory.length + 2,
        ),
      ),
    ];
    const next = {
      ...copy(progress),
      ...copy(patch),
      revision: nextRevision,
      updatedAt: now,
      actionHistory: history,
    };
    requireValidProgress(next);
    return next;
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
    return finalizeMutation(
      progress,
      now,
      {
        status: "blocked",
        blockers: nextBlockers,
        completedAt: null,
      },
      "became_blocked",
      {
        blockerCodes: nextBlockers.map((entry) => entry.code),
        ...copy(details),
      },
    );
  }

  function blockCorruptedProgress(progress, code, now) {
    const base = isRecord(progress) ? copy(progress) : {};
    const blocker = notice(code, BLOCKER_MESSAGES[code]);
    let history = base.actionHistory;
    const nextRevision = positiveInteger(base.revision)
      ? base.revision + 1
      : 1;
    const evidence = isRecord(base.corruptionEvidence)
      ? copy(base.corruptionEvidence)
      : {};
    if (!validActionHistory(history, base.revision)) {
      evidence.actionHistory = copy(history);
      history = [
        createAction(
          null,
          "inspection_created",
          now,
          null,
          "blocked",
          nextRevision,
          { recoveredAudit: true },
        ),
      ];
    }
    history = [
      ...copy(history),
      createAction(
        base,
        "became_blocked",
        now,
        base.status ?? null,
        "blocked",
        nextRevision,
        { blockerCodes: [code], corruptionPreserved: true },
        history.length + 1,
      ),
    ];
    return {
      ...base,
      status: "blocked",
      revision: nextRevision,
      updatedAt: now,
      completedAt: null,
      blockers: [blocker],
      actionHistory: history,
      corruptionEvidence: evidence,
    };
  }

  function createAction(
    progress,
    actionType,
    timestamp,
    previousStatus,
    resultingStatus,
    revision,
    details = {},
    sequence = null,
  ) {
    return {
      actionId: makeId("inspection-action"),
      sequence:
        sequence ??
        (Array.isArray(progress?.actionHistory)
          ? progress.actionHistory.length + 1
          : 1),
      actionType,
      timestamp,
      previousStatus,
      resultingStatus,
      revision,
      details: copy(details),
    };
  }

  function requireMutable(progress) {
    if (progress.status === "blocked") {
      throw stateError(
        "FIRST_ASSEMBLY_INSPECTION_BLOCKED",
        progress.blockers[0]?.message ||
          "Проверка первого шва заблокирована.",
      );
    }
    if (progress.status === "completed") {
      throw stateError(
        "FIRST_ASSEMBLY_INSPECTION_COMPLETED",
        "Завершённую проверку первого шва нельзя изменять.",
      );
    }
  }

  function requireInspecting(progress) {
    requireMutable(progress);
    if (progress.status !== "inspecting") {
      throw stateError(
        progress.status === "needs_correction"
          ? "ISSUE_UNRESOLVED"
          : "INSPECTION_NOT_STARTED",
        progress.status === "needs_correction"
          ? "Сначала исправьте отмеченную проблему."
          : "Сначала начните проверку первого шва.",
      );
    }
  }

  function requireValidProgress(progress) {
    if (!isValidProgress(progress)) {
      throw stateError(
        "INSPECTION_DATA_DAMAGED",
        "Запись проверки первого шва повреждена.",
      );
    }
  }

  function normalizeIssueNote(issueCode, issueNote) {
    const note =
      typeof issueNote === "string" ? issueNote.trim() : "";
    if (note.length > 240) {
      throw stateError(
        "ISSUE_NOTE_TOO_LONG",
        "Сократите заметку до 240 символов.",
      );
    }
    if (issueCode === "other" && note.length < 3) {
      throw stateError(
        "ISSUE_NOTE_REQUIRED",
        "Кратко опишите другую проблему.",
      );
    }
    return note || null;
  }

  function minimalBlockedRecord(value) {
    return (
      isRecord(value) &&
      value.type === PROGRESS_KIND &&
      text(value.inspectionId) &&
      value.id === value.inspectionId &&
      positiveInteger(value.revision) &&
      Array.isArray(value.blockers) &&
      value.blockers.length > 0 &&
      value.blockers.every(validNotice)
    );
  }

  function blockedInspection(code, details = {}) {
    const message =
      BLOCKER_MESSAGES[code] ||
      "Проверка первого шва сейчас недоступна.";
    return {
      state: "blocked",
      status: "blocked",
      code,
      message,
      blockers: [notice(code, message)],
      ...details,
    };
  }

  function errorFromInspection(result) {
    return stateError(
      result?.code ?? "FIRST_ASSEMBLY_INSPECTION_UNAVAILABLE",
      result?.message ??
        "Проверка первого шва сейчас недоступна.",
    );
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
      blockers.push(
        notice(code, BLOCKER_MESSAGES[code], details),
      );
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
    const matches = progressMatches(
      aggregate,
      kind,
      calculationId,
    );
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

  function projectIdOf(project) {
    return (
      text(project?.projectId) || text(project?.project_id) || null
    );
  }

  function unitLabel(unitType) {
    return unitType === "edge_stitch" ? "петель края" : "единиц";
  }

  function isPlaceholder(value) {
    return (
      isRecord(value) &&
      value.version === 0 &&
      value.initialized === false
    );
  }

  function stateError(code, message, details = {}) {
    return new FirstAssemblyInspectionError(
      code,
      message,
      details,
    );
  }

  function makeId(prefix) {
    if (globalObject.YarnAIProjectSystem?.uuidv7) {
      return globalObject.YarnAIProjectSystem.uuidv7();
    }
    if (globalObject.crypto?.randomUUID) {
      return globalObject.crypto.randomUUID();
    }
    return `${prefix}:${Date.now()}:${Math.random()
      .toString(16)
      .slice(2)}`;
  }

  function requireTimestamp(value) {
    if (!isTimestamp(value)) {
      throw stateError(
        "INSPECTION_TIMESTAMP_INVALID",
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
    JOIN_KIND,
    STATUSES,
    ISSUE_CODES,
    CHECKLIST,
    USER_CHECKLIST_IDS,
    ANSWER_KEYS,
    ACTIONS,
    CORRECTION_INSTRUCTIONS,
    BLOCKER_MESSAGES,
    FirstAssemblyInspectionError,
    buildJoinSnapshot,
    joinSnapshotFingerprint,
    buildSourceSnapshot,
    sourceFingerprint,
    evaluateSources,
    createProgress,
    startInspection,
    setChecklistItem,
    checkItem,
    uncheckItem,
    confirmNoIssue,
    markIssue,
    acknowledgeCorrection,
    confirmIssueResolved,
    completeInspection,
    revalidateProgress,
    repairOrBlockOnLoad: revalidateProgress,
    restoreProgress,
    isValidProgress,
    structuralBlocker,
    inspectAggregate,
    ensureForProject,
    getForProject,
    loadForProject,
    revalidateForProject,
    startForProject,
    setChecklistForProject,
    confirmNoIssueForProject,
    markIssueForProject,
    acknowledgeForProject,
    resolveForProject,
    completeForProject,
    homeState,
    progressSummary,
    sourceSummary,
    stableStringify,
  };

  globalObject.YarnAIFirstAssemblyInspection = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
