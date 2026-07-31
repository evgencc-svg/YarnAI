"use strict";

(function exposeFirstTailSecuring(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "FIRST_TAIL_SECURING";
  const PREPARATION_KIND = "FIRST_ASSEMBLY_PREPARATION";
  const JOIN_KIND = "FIRST_ASSEMBLY_JOIN";
  const INSPECTION_KIND = "FIRST_ASSEMBLY_INSPECTION";
  const STATUSES = Object.freeze([
    "ready",
    "securing",
    "needs_rework",
    "blocked",
    "completed",
  ]);
  const ISSUE_CODES = Object.freeze([
    "tail_too_short",
    "tail_visible",
    "tail_not_secured",
    "fabric_distorted",
    "tail_pulled",
    "other",
  ]);
  const CHECKLIST = Object.freeze([
    {
      id: "inspection_completed",
      label: "Проверка первой сборочной операции Stage 12C завершена.",
      source: "system",
      answer: null,
    },
    {
      id: "inspection_snapshot_unchanged",
      label: "Снимок Stage 12C не изменился.",
      source: "system",
      answer: null,
    },
    {
      id: "sufficient_tail",
      label: "Оставлен достаточный хвост.",
      source: "user",
      answer: "tailLengthConfirmed",
    },
    {
      id: "correct_side",
      label: "Хвост проходит по правильной стороне.",
      source: "user",
      answer: "tailHiddenInsideFabric",
    },
    {
      id: "securing_count_complete",
      label: "Выполнено необходимое количество закреплений.",
      source: "user",
      answer: "securingCountConfirmed",
    },
    {
      id: "fabric_not_distorted",
      label: "Хвост не натягивает полотно.",
      source: "user",
      answer: "fabricNotDistorted",
    },
    {
      id: "no_tail_loop",
      label: "Хвост не образует петли.",
      source: "user",
      answer: "noTailLoop",
    },
    {
      id: "tail_fully_secured",
      label: "Хвост полностью зафиксирован.",
      source: "user",
      answer: "tailSecured",
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
    "securing_created",
    "securing_started",
    "tail_information_updated",
    "checklist_item_checked",
    "checklist_item_unchecked",
    "no_issue_confirmed",
    "issue_marked",
    "rework_acknowledged",
    "issue_resolved_confirmed",
    "securing_checklist_restarted",
    "securing_completed",
    "sources_revalidated",
    "became_blocked",
  ]);
  const REWORK_INSTRUCTIONS = Object.freeze({
    tail_too_short:
      "Не обрезайте нить ещё короче. Если длины недостаточно, добавьте нить вручную подходящим способом и повторите проверку.",
    tail_visible:
      "Проведите хвост на изнаночную сторону и спрячьте его внутри структуры полотна.",
    tail_not_secured:
      "Выполните рекомендованное количество закреплений и проверьте хвост без рывка.",
    fabric_distorted:
      "Ослабьте закрепление и распределите нить так, чтобы полотно сохраняло естественную форму.",
    tail_pulled:
      "Закрепите хвост без натяжения. Нить не должна стягивать рабочее полотно.",
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
  const TAIL_REWORK_INSTRUCTIONS = Object.freeze({
    ...REWORK_INSTRUCTIONS,
    other:
      "Исправьте описанную проблему вручную, затем заново пройдите весь checklist.",
  });

  const BLOCKER_MESSAGES = Object.freeze({
    INSPECTION_MISSING: "Завершённая проверка Stage 12C не найдена.",
    INSPECTION_NOT_COMPLETED: "Stage 12C ещё не завершена.",
    INSPECTION_CORRUPTED: "Запись Stage 12C повреждена.",
    INSPECTION_REVISION_CONFLICT:
      "Ревизия Stage 12C изменилась после начала закрепления хвоста.",
    INSPECTION_FINGERPRINT_CONFLICT:
      "Контрольный отпечаток Stage 12C изменился.",
    STAGE12_SNAPSHOT_CONFLICT:
      "Сохранённый снимок Stage 12C не совпадает с источником.",
    TAIL_INFORMATION_CORRUPTED:
      "Сведения о хвосте повреждены.",
    STAGE13_FINGERPRINT_CONFLICT:
      "Контрольный отпечаток Stage 13 не совпадает с записью.",
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
    SECURING_SNAPSHOT_CONFLICT:
      "Снимок проверки первого шва повреждён или был подменён.",
    SECURING_CHECKLIST_CORRUPTED:
      "Контрольный список проверки первого шва повреждён.",
    SECURING_ANSWERS_CORRUPTED:
      "Ответы проверки первого шва повреждены.",
    SECURING_ISSUE_STATE_CORRUPTED:
      "Состояние обнаруженной проблемы повреждено.",
    SECURING_ACTION_HISTORY_CORRUPTED:
      "История действий проверки первого шва повреждена.",
    COMPLETED_SECURING_CORRUPTED:
      "Завершённая проверка первого шва содержит противоречия.",
  });

  class FirstTailSecuringError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FirstTailSecuringError";
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
    const inspection = isRecord(input.inspection)
      ? input.inspection
      : {};
    return copy({
      projectId:
        text(project.projectId) ||
        text(project.project_id) ||
        text(inspection.projectId) ||
        null,
      stage12C: copy(inspection),
    });
  }

  function stage12Fingerprint(inspectionOrSnapshot) {
    const inspection =
      isRecord(inspectionOrSnapshot?.stage12C)
        ? inspectionOrSnapshot.stage12C
        : inspectionOrSnapshot;
    if (!isRecord(inspection)) {
      return null;
    }
    return `assembly-inspection-completed-v1-${fnv64(
      stableStringify(inspection),
    )}`;
  }

  function sourceFingerprint(snapshot) {
    if (!isRecord(snapshot)) {
      throw stateError(
        "SECURING_SNAPSHOT_CONFLICT",
        BLOCKER_MESSAGES.SECURING_SNAPSHOT_CONFLICT,
      );
    }
    return `tail-securing-source-v1-${fnv64(
      stableStringify(snapshot),
    )}`;
  }

  function evaluateSources(input = {}) {
    const project = isRecord(input.project) ? input.project : null;
    const preparation = isRecord(input.preparation)
      ? input.preparation
      : null;
    const join = isRecord(input.join) ? input.join : null;
    const inspection = isRecord(input.inspection)
      ? input.inspection
      : null;
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

    if (!inspection) {
      addBlocker(blockers, "INSPECTION_MISSING");
    } else {
      const inspectionApi =
        globalObject.YarnAIFirstAssemblyInspection;
      if (
        inspection.type !== INSPECTION_KIND ||
        !text(inspection.id) ||
        !positiveInteger(inspection.revision) ||
        !isRecord(inspection.sourceSnapshot) ||
        !text(inspection.sourceFingerprint)
      ) {
        addBlocker(blockers, "INSPECTION_CORRUPTED");
      }
      if (inspection.status !== "completed") {
        addBlocker(blockers, "INSPECTION_NOT_COMPLETED");
      }
      try {
        if (
          inspectionApi?.isValidProgress &&
          !inspectionApi.isValidProgress(inspection)
        ) {
          addBlocker(blockers, "INSPECTION_CORRUPTED");
        }
        if (
          inspectionApi?.sourceFingerprint &&
          inspectionApi.sourceFingerprint(
            inspection.sourceSnapshot,
          ) !== inspection.sourceFingerprint
        ) {
          addBlocker(
            blockers,
            "INSPECTION_FINGERPRINT_CONFLICT",
          );
        }
      } catch {
        addBlocker(blockers, "INSPECTION_CORRUPTED");
      }
      if (
        inspection.projectId &&
        projectIdOf(project) &&
        inspection.projectId !== projectIdOf(project)
      ) {
        addBlocker(blockers, "STAGE12_SNAPSHOT_CONFLICT");
      }
      if (
        inspection.preparationId &&
        preparation &&
        inspection.preparationId !== preparation.id
      ) {
        addBlocker(blockers, "STAGE12_SNAPSHOT_CONFLICT");
      }
      if (
        inspection.joinId &&
        join &&
        inspection.joinId !== join.id
      ) {
        addBlocker(blockers, "STAGE12_SNAPSHOT_CONFLICT");
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
    const securingId = makeId("tail-securing");
    const progress = {
      securingId,
      id: securingId,
      type: PROGRESS_KIND,
      version: VERSION,
      revision,
      projectId:
        text(evaluation.snapshot.projectId) || "unknown-project",
      references: buildReferences(input),
      sourceSnapshot: copy(evaluation.snapshot),
      sourceFingerprint: evaluation.fingerprint,
      stage12Fingerprint: stage12Fingerprint(
        evaluation.snapshot,
      ),
      stage13Fingerprint: null,
      status,
      stableChecklist: copy(CHECKLIST),
      stableUserChecklist: copy(USER_CHECKLIST_IDS),
      checklist: createChecklist(evaluation.blockers, now),
      assistantAnswers: emptyAnswers(),
      tailInformation: emptyTailInformation(),
      notes: [],
      issueDetected: null,
      issueCode: null,
      issueNote: null,
      reworkAcknowledged: false,
      reworkInstruction: null,
      issueResolvedConfirmed: false,
      actionHistory: [
        createAction(
          null,
          "securing_created",
          now,
          null,
          status,
          revision,
          {
            sourceFingerprint: evaluation.fingerprint,
            stage12Fingerprint: stage12Fingerprint(
              evaluation.snapshot,
            ),
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
      reworkRequiredAt: null,
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
    progress.stage13Fingerprint = stateFingerprint(progress);
    requireValidProgress(progress);
    return progress;
  }

  function startSecuring(
    progress,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireMutable(progress);
    if (progress.status === "securing") {
      return copy(progress);
    }
    if (progress.status !== "ready") {
      throw stateError(
        "SECURING_NOT_READY",
        "Проверку первого шва сейчас нельзя начать.",
      );
    }
    return finalizeMutation(
      progress,
      now,
      {
        status: "securing",
        startedAt: now,
      },
      "securing_started",
      {},
    );
  }

  function updateTailInformation(
    progress,
    patch,
    now = new Date().toISOString(),
  ) {
    requireValidProgress(progress);
    requireTimestamp(now);
    requireInspecting(progress);
    if (!isRecord(patch)) {
      throw stateError(
        "TAIL_INFORMATION_INVALID",
        "Сведения о хвосте имеют неверный формат.",
      );
    }
    const allowed = new Set([
      "tailLengthConfirmed",
      "tailHiddenInsideFabric",
      "tailSecured",
      "recommendedSecuringCount",
      "completedSecuringCount",
      "userConfidence",
      "assistantConfidence",
    ]);
    if (Object.keys(patch).some((key) => !allowed.has(key))) {
      throw stateError(
        "TAIL_INFORMATION_INVALID",
        "Сведения о хвосте содержат неизвестное поле.",
      );
    }
    const next = {
      ...copy(progress.tailInformation),
      ...copy(patch),
    };
    if (!validTailInformation(next)) {
      throw stateError(
        "TAIL_INFORMATION_INVALID",
        "Проверьте длину хвоста, количество закреплений и уверенность.",
      );
    }
    if (
      stableStringify(next) ===
      stableStringify(progress.tailInformation)
    ) {
      return copy(progress);
    }
    return finalizeMutation(
      progress,
      now,
      { tailInformation: next },
      "tail_information_updated",
      { changedFields: Object.keys(patch).sort() },
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
      ...copy(progress.assistantAnswers),
      [definition.answer]: checked,
    };
    const tailInformation = copy(progress.tailInformation);
    if (definition.answer === "tailLengthConfirmed") {
      tailInformation.tailLengthConfirmed = checked;
    }
    if (definition.answer === "tailHiddenInsideFabric") {
      tailInformation.tailHiddenInsideFabric = checked;
    }
    if (definition.answer === "tailSecured") {
      tailInformation.tailSecured = checked;
    }
    if (
      definition.answer === "securingCountConfirmed" &&
      checked &&
      tailInformation.completedSecuringCount <
        tailInformation.recommendedSecuringCount
    ) {
      throw stateError(
        "SECURING_COUNT_INCOMPLETE",
        "Сначала выполните рекомендованное количество закреплений.",
      );
    }
    return finalizeMutation(
      progress,
      now,
      {
        checklist,
        assistantAnswers: answers,
        tailInformation,
      },
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
        reworkAcknowledged: false,
        reworkInstruction: null,
        issueResolvedConfirmed: false,
        reworkRequiredAt: null,
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
        status: "needs_rework",
        issueDetected: true,
        issueCode,
        issueNote: note,
        reworkAcknowledged: false,
        reworkInstruction:
          TAIL_REWORK_INSTRUCTIONS[issueCode],
        issueResolvedConfirmed: false,
        reworkRequiredAt: now,
      },
      "issue_marked",
      {
        issueCode,
        issueNote: note,
        reworkInstruction:
          TAIL_REWORK_INSTRUCTIONS[issueCode],
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
      progress.status !== "needs_rework" ||
      progress.issueDetected !== true
    ) {
      throw stateError(
        "NO_ACTIVE_ISSUE",
        "Активная проблема для подтверждения не найдена.",
      );
    }
    if (progress.reworkAcknowledged) {
      return copy(progress);
    }
    return finalizeMutation(
      progress,
      now,
      { reworkAcknowledged: true },
      "rework_acknowledged",
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
      progress.status !== "needs_rework" ||
      progress.issueDetected !== true
    ) {
      throw stateError(
        "NO_ACTIVE_ISSUE",
        "Активная проблема для исправления не найдена.",
      );
    }
    if (!progress.reworkAcknowledged) {
      throw stateError(
        "REWORK_NOT_ACKNOWLEDGED",
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
        status: "securing",
        checklist,
        assistantAnswers: emptyAnswers(),
        tailInformation: emptyTailInformation(
          progress.tailInformation.recommendedSecuringCount,
        ),
        issueDetected: false,
        reworkAcknowledged: true,
        issueResolvedConfirmed: true,
      },
      "issue_resolved_confirmed",
      {
        issueCode: progress.issueCode,
        issueNote: progress.issueNote,
      },
      [
        {
          type: "securing_checklist_restarted",
          details: {
            reason: "issue_resolved",
            issueCode: progress.issueCode,
          },
        },
      ],
    );
  }

  function completeSecuring(
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
      !ANSWER_KEYS.every((key) =>
        progress.assistantAnswers[key] === true
      ) ||
      progress.tailInformation.tailLengthConfirmed !== true ||
      progress.tailInformation.tailHiddenInsideFabric !== true ||
      progress.tailInformation.tailSecured !== true ||
      progress.tailInformation.completedSecuringCount <
        progress.tailInformation.recommendedSecuringCount ||
      !progress.tailInformation.userConfidence ||
      !progress.tailInformation.assistantConfidence
    ) {
      throw stateError(
        "SECURING_INCOMPLETE",
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
      "securing_completed",
      {
        inspectionId: progress.references.inspection.id,
        stage12Fingerprint: progress.stage12Fingerprint,
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
    if (isRecord(progress) && progress.status === "completed") {
      requireValidProgress(progress);
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
      stage12Fingerprint(evaluation.snapshot) !==
        progress.stage12Fingerprint
    ) {
      return blockProgress(
        progress,
        "STAGE12_SNAPSHOT_CONFLICT",
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
        "SECURING_SNAPSHOT_CONFLICT",
        BLOCKER_MESSAGES.SECURING_SNAPSHOT_CONFLICT,
      );
    }
    if (
      !isValidProgress(value) &&
      !(value?.status === "blocked" && minimalBlockedRecord(value))
    ) {
      throw stateError(
        "SECURING_DATA_DAMAGED",
        "Запись проверки первого шва повреждена.",
      );
    }
    return value;
  }

  function isValidProgress(value) {
    if (
      !isRecord(value) ||
      !text(value.securingId) ||
      value.id !== value.securingId ||
      value.type !== PROGRESS_KIND ||
      value.version !== VERSION ||
      !positiveInteger(value.revision) ||
      !text(value.projectId) ||
      !STATUSES.includes(value.status) ||
      !isRecord(value.sourceSnapshot) ||
      !text(value.sourceFingerprint) ||
      value.sourceFingerprint !==
        sourceFingerprint(value.sourceSnapshot) ||
      !isRecord(value.sourceSnapshot.stage12C) ||
      value.stage12Fingerprint !==
        stage12Fingerprint(value.sourceSnapshot) ||
      !isRecord(value.references) ||
      !validReferences(value.references, value.sourceSnapshot) ||
      !text(value.stage13Fingerprint) ||
      value.stage13Fingerprint !== stateFingerprint(value) ||
      stableStringify(value.stableChecklist) !==
        stableStringify(CHECKLIST) ||
      stableStringify(value.stableUserChecklist) !==
        stableStringify(USER_CHECKLIST_IDS) ||
      !validChecklist(value.checklist) ||
      !validAnswers(value.assistantAnswers) ||
      !validTailInformation(value.tailInformation) ||
      !Array.isArray(value.notes) ||
      !value.notes.every((entry) => typeof entry === "string") ||
      !validIssueState(value) ||
      !validActionHistory(value.actionHistory, value.revision) ||
      !Array.isArray(value.blockers) ||
      !value.blockers.every(validNotice) ||
      !Array.isArray(value.warnings) ||
      !value.warnings.every(validNotice) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt) ||
      !nullableTimestamp(value.startedAt) ||
      !nullableTimestamp(value.reworkRequiredAt) ||
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
    if (value.status === "securing") {
      return (
        isTimestamp(value.startedAt) &&
        value.completedAt === null &&
        value.issueDetected !== true
      );
    }
    if (value.status === "needs_rework") {
      return (
        isTimestamp(value.startedAt) &&
        isTimestamp(value.reworkRequiredAt) &&
        value.completedAt === null &&
        value.issueDetected === true
      );
    }
    return (
      isTimestamp(value.startedAt) &&
      isTimestamp(value.completedAt) &&
      value.issueDetected === false &&
      value.checklist.every((item) => item.checked) &&
      ANSWER_KEYS.every((key) =>
        value.assistantAnswers[key] === true
      ) &&
      tailInformationComplete(value.tailInformation)
    );
  }

  function structuralBlocker(value) {
    if (!isRecord(value)) {
      return "SECURING_SNAPSHOT_CONFLICT";
    }
    if (!validChecklist(value.checklist)) {
      return "SECURING_CHECKLIST_CORRUPTED";
    }
    if (!validAnswers(value.assistantAnswers)) {
      return "SECURING_ANSWERS_CORRUPTED";
    }
    if (!validTailInformation(value.tailInformation)) {
      return "TAIL_INFORMATION_CORRUPTED";
    }
    if (!validIssueState(value)) {
      return "SECURING_ISSUE_STATE_CORRUPTED";
    }
    if (!validActionHistory(value.actionHistory, value.revision)) {
      return "SECURING_ACTION_HISTORY_CORRUPTED";
    }
    if (
      !text(value.stage13Fingerprint) ||
      value.stage13Fingerprint !== stateFingerprint(value)
    ) {
      return "STAGE13_FINGERPRINT_CONFLICT";
    }
    if (
      !isRecord(value.sourceSnapshot) ||
      !text(value.sourceFingerprint)
    ) {
      return "SECURING_SNAPSHOT_CONFLICT";
    }
    try {
      if (
        sourceFingerprint(value.sourceSnapshot) !==
          value.sourceFingerprint ||
        stage12Fingerprint(value.sourceSnapshot) !==
          value.stage12Fingerprint ||
        !validReferences(value.references, value.sourceSnapshot)
      ) {
        return "SECURING_SNAPSHOT_CONFLICT";
      }
    } catch {
      return "SECURING_SNAPSHOT_CONFLICT";
    }
    if (
      value.status === "completed" &&
      (!isTimestamp(value.completedAt) ||
        value.issueDetected !== false ||
        !value.checklist.every((item) => item.checked) ||
        !ANSWER_KEYS.every(
          (key) => value.assistantAnswers[key] === true,
        ) ||
        !tailInformationComplete(value.tailInformation))
    ) {
      return "COMPLETED_SECURING_CORRUPTED";
    }
    if (
      !text(value.securingId) ||
      value.id !== value.securingId ||
      value.type !== PROGRESS_KIND ||
      value.version !== VERSION ||
      !positiveInteger(value.revision) ||
      !STATUSES.includes(value.status) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt)
    ) {
      return value.status === "completed"
        ? "COMPLETED_SECURING_CORRUPTED"
        : "SECURING_SNAPSHOT_CONFLICT";
    }
    return null;
  }

  function sourceConflict(progress, input = {}) {
    const project = input.project;
    const preparation = input.preparation;
    const join = input.join;
    const inspection = input.inspection;
    const references = progress.references;
    if (!project || !projectIdOf(project)) {
      return { code: "PROJECT_MISSING", details: {} };
    }
    if (projectIdOf(project) !== progress.projectId) {
      return {
        code: "STAGE12_SNAPSHOT_CONFLICT",
        details: {
          savedProjectId: progress.projectId,
          currentProjectId: projectIdOf(project),
        },
      };
    }
    if (!preparation) {
      return { code: "PREPARATION_MISSING", details: {} };
    }
    if (preparation.id !== references.preparation.id) {
      return {
        code: "STAGE12_SNAPSHOT_CONFLICT",
        details: {
          savedPreparationId: references.preparation.id,
          currentPreparationId: preparation.id ?? null,
        },
      };
    }
    if (
      preparation.revision !== references.preparation.revision
    ) {
      return {
        code: "PREPARATION_REVISION_CONFLICT",
        details: {
          savedRevision: references.preparation.revision,
          currentRevision: preparation.revision ?? null,
        },
      };
    }
    if (
      preparation.sourceFingerprint !==
      references.preparation.fingerprint
    ) {
      return {
        code: "PREPARATION_FINGERPRINT_CONFLICT",
        details: {},
      };
    }
    if (!join) {
      return { code: "JOIN_MISSING", details: {} };
    }
    if (join.id !== references.join.id) {
      return {
        code: "STAGE12_SNAPSHOT_CONFLICT",
        details: {
          savedJoinId: references.join.id,
          currentJoinId: join.id ?? null,
        },
      };
    }
    if (join.revision !== references.join.revision) {
      return {
        code: "JOIN_REVISION_CONFLICT",
        details: {
          savedRevision: references.join.revision,
          currentRevision: join.revision ?? null,
        },
      };
    }
    if (
      join.sourceFingerprint !== references.join.fingerprint
    ) {
      return {
        code: "JOIN_FINGERPRINT_CONFLICT",
        details: {},
      };
    }
    if (!inspection) {
      return { code: "INSPECTION_MISSING", details: {} };
    }
    if (inspection.id !== references.inspection.id) {
      return {
        code: "STAGE12_SNAPSHOT_CONFLICT",
        details: {
          savedInspectionId: references.inspection.id,
          currentInspectionId: inspection.id ?? null,
        },
      };
    }
    if (
      inspection.revision !== references.inspection.revision
    ) {
      return {
        code: "INSPECTION_REVISION_CONFLICT",
        details: {
          savedRevision: references.inspection.revision,
          currentRevision: inspection.revision ?? null,
        },
      };
    }
    if (
      inspection.sourceFingerprint !==
      references.inspection.fingerprint
    ) {
      return {
        code: "INSPECTION_FINGERPRINT_CONFLICT",
        details: {},
      };
    }
    const currentStage12Fingerprint =
      stage12Fingerprint(inspection);
    if (currentStage12Fingerprint !== progress.stage12Fingerprint) {
      return {
        code: "STAGE12_SNAPSHOT_CONFLICT",
        details: {
          savedFingerprint: progress.stage12Fingerprint,
          currentFingerprint: currentStage12Fingerprint,
        },
      };
    }
    return null;
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      return blockedSecuring("PROJECT_MISSING");
    }
    const calculation = activeCalculation(aggregate, project);
    if (!calculation) {
      return blockedSecuring("PROJECT_MISSING", { project });
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
      INSPECTION_KIND,
      calculation.calculation_id,
    );
    const securingMatches = progressMatches(
      aggregate,
      PROGRESS_KIND,
      calculation.calculation_id,
    );
    if (
      preparationMatches.length > 1 ||
      joinMatches.length > 1 ||
      inspectionMatches.length > 1 ||
      securingMatches.length > 1
    ) {
      return blockedSecuring("JOIN_SNAPSHOT_CONFLICT", {
        project,
        calculation,
      });
    }
    const preparationRecord = preparationMatches[0] ?? null;
    const joinRecord = joinMatches[0] ?? null;
    const inspectionRecord = inspectionMatches[0] ?? null;
    const progressRecord = securingMatches[0] ?? null;
    const preparation =
      preparationRecord && !isPlaceholder(preparationRecord.state)
        ? preparationRecord.state
        : null;
    const join =
      joinRecord && !isPlaceholder(joinRecord.state)
        ? joinRecord.state
        : null;
    const inspection =
      inspectionRecord && !isPlaceholder(inspectionRecord.state)
        ? inspectionRecord.state
        : null;
    const securing =
      progressRecord && !isPlaceholder(progressRecord.state)
        ? progressRecord.state
        : null;
    const input = { project, preparation, join, inspection };
    if (!securing) {
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
        inspectionRecord: copy(inspectionRecord),
        inspection: copy(inspection),
        progress: copy(progressRecord),
        securing: null,
        input,
        blockers: copy(evaluation.blockers),
        code: evaluation.blockers[0]?.code ?? null,
        message: evaluation.blockers[0]?.message ?? null,
      };
    }
    if (
      securing.status === "blocked" ||
      securing.status === "completed"
    ) {
      return securingResult(
        project,
        calculation,
        preparationRecord,
        preparation,
        joinRecord,
        join,
        inspectionRecord,
        inspection,
        progressRecord,
        securing,
        input,
      );
    }
    const structuralCode = structuralBlocker(securing);
    if (structuralCode) {
      return blockedSecuring(structuralCode, {
        project,
        calculation,
        preparationRecord: copy(preparationRecord),
        preparation: copy(preparation),
        joinRecord: copy(joinRecord),
        join: copy(join),
        inspectionRecord: copy(inspectionRecord),
        inspection: copy(inspection),
        progress: copy(progressRecord),
        securing: copy(securing),
        input,
      });
    }
    const conflict = sourceConflict(securing, input);
    if (conflict) {
      return blockedSecuring(conflict.code, {
        project,
        calculation,
        preparationRecord: copy(preparationRecord),
        preparation: copy(preparation),
        joinRecord: copy(joinRecord),
        join: copy(join),
        inspectionRecord: copy(inspectionRecord),
        inspection: copy(inspection),
        progress: copy(progressRecord),
        securing: copy(securing),
        input,
      });
    }
    return securingResult(
      project,
      calculation,
      preparationRecord,
      preparation,
      joinRecord,
      join,
      inspectionRecord,
      inspection,
      progressRecord,
      securing,
      input,
    );
  }

  async function ensureForProject(repository, projectId) {
    let aggregate = await repository.getProject(projectId);
    let result = inspectAggregate(aggregate);
    if (result.securing) {
      const next = revalidateProgress(
        result.securing,
        result.input,
      );
      if (
        stableStringify(next) ===
        stableStringify(result.securing)
      ) {
        return result;
      }
      return persist(
        repository,
        result,
        next,
        next.status === "blocked"
          ? "FIRST_TAIL_SECURING_BLOCKED"
          : "FIRST_TAIL_SECURING_SOURCES_REVALIDATED",
      );
    }
    if (!result.calculation) {
      throw errorFromSecuring(result);
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
            "FIRST_TAIL_SECURING_PROGRESS_CREATED",
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
        operationKind: "FIRST_TAIL_SECURING_CREATED",
        projectStage:
          state.status === "blocked"
            ? "tail_securing_blocked"
            : "tail_securing_ready",
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
    if (!result.securing) {
      return ensureForProject(repository, projectId);
    }
    const next = revalidateProgress(
      result.securing,
      result.input,
    );
    if (
      stableStringify(next) ===
      stableStringify(result.securing)
    ) {
      return result;
    }
    return persist(
      repository,
      result,
      next,
      next.status === "blocked"
        ? "FIRST_TAIL_SECURING_BLOCKED"
        : "FIRST_TAIL_SECURING_SOURCES_REVALIDATED",
    );
  }

  async function startForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      startSecuring,
      "FIRST_TAIL_SECURING_STARTED",
    );
  }

  async function updateTailForProject(
    repository,
    projectId,
    patch,
  ) {
    return mutateForProject(
      repository,
      projectId,
      (progress) => updateTailInformation(progress, patch),
      "FIRST_TAIL_SECURING_INFORMATION_UPDATED",
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
        ? "FIRST_TAIL_SECURING_ITEM_CHECKED"
        : "FIRST_TAIL_SECURING_ITEM_UNCHECKED",
    );
  }

  async function confirmNoIssueForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      confirmNoIssue,
      "FIRST_TAIL_SECURING_NO_ISSUE",
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
      "FIRST_TAIL_SECURING_ISSUE_MARKED",
    );
  }

  async function acknowledgeForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      acknowledgeCorrection,
      "FIRST_TAIL_SECURING_REWORK_ACKNOWLEDGED",
    );
  }

  async function resolveForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      confirmIssueResolved,
      "FIRST_TAIL_SECURING_ISSUE_RESOLVED",
    );
  }

  async function completeForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      completeSecuring,
      "FIRST_TAIL_SECURING_COMPLETED",
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
    if (!result.securing || !result.progress) {
      result = await ensureForProject(repository, projectId);
    }
    if (!result.securing || !result.progress) {
      throw errorFromSecuring(result);
    }
    const validated = revalidateProgress(
      result.securing,
      result.input,
    );
    if (validated.status === "blocked") {
      if (
        stableStringify(validated) ===
        stableStringify(result.securing)
      ) {
        throw stateError(
          "FIRST_TAIL_SECURING_BLOCKED",
          validated.blockers[0]?.message ||
            "Проверка первого шва заблокирована.",
        );
      }
      return persist(
        repository,
        result,
        validated,
        "FIRST_TAIL_SECURING_BLOCKED",
      );
    }
    const next = mutation(validated);
    if (
      stableStringify(next) ===
      stableStringify(result.securing)
    ) {
      return result;
    }
    return persist(repository, result, next, operationKind);
  }

  async function persist(repository, result, state, operationKind) {
    const stages = {
      ready: "tail_securing_ready",
      securing: "tail_securing_in_progress",
      needs_rework:
        "tail_securing_needs_rework",
      blocked: "tail_securing_blocked",
      completed: "tail_securing_completed",
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
    const securing = result.securing;
    if (result.state === "blocked") {
      return {
        stage: "Проверка первого шва заблокирована",
        summary:
          result.message ||
          securing?.blockers?.[0]?.message ||
          "Источник первого соединения требует проверки.",
        label: "Открыть безопасное состояние",
        href: `/first-tail-securing?project=${encodeURIComponent(
          projectId,
        )}`,
        status: "blocked",
        securing: securing ? copy(securing) : null,
      };
    }
    if (!securing) {
      return null;
    }
    const labels = {
      ready: {
        stage: "Первый шов готов к проверке",
        label: "Проверить первый шов",
      },
      securing: {
        stage: "Проверка первого шва продолжается",
        label: "Продолжить проверку",
      },
      needs_rework: {
        stage: "Первый шов требует исправления",
        label: "Продолжить исправление",
      },
      completed: {
        stage: "Первая сборочная операция завершена",
        label: "Посмотреть принятую проверку",
      },
    };
    const display = labels[securing.status] ?? labels.ready;
    return {
      stage: display.stage,
      summary: progressSummary(securing),
      label: display.label,
      href: `/first-tail-securing?project=${encodeURIComponent(
        projectId,
      )}`,
      status: securing.status,
      securing: copy(securing),
    };
  }

  function progressSummary(progress) {
    if (!progress) {
      return "";
    }
    if (progress.status === "completed") {
      return "Первый шов проверен и принят. Первая сборочная операция завершена.";
    }
    if (progress.status === "needs_rework") {
      return (
        progress.reworkInstruction ||
        "Исправьте отмеченную проблему вручную и повторите проверку."
      );
    }
    const checked = progress.checklist.filter(
      (item) => item.source === "user" && item.checked,
    ).length;
    return `Проверено ${checked} из ${USER_CHECKLIST_IDS.length} пользовательских пунктов.`;
  }

  function tailHomeState(result, projectId) {
    if (!result) {
      return null;
    }
    const securing = result.securing;
    const href = `/first-tail-securing?project=${encodeURIComponent(
      projectId,
    )}`;
    if (result.state === "blocked") {
      return {
        stage: "Закрепление хвоста заблокировано",
        summary:
          result.message ||
          securing?.blockers?.[0]?.message ||
          "Источник Stage 12C требует проверки.",
        label: "Открыть безопасное состояние",
        href,
        status: "blocked",
        securing: securing ? copy(securing) : null,
      };
    }
    if (!securing) {
      return null;
    }
    const labels = {
      ready: [
        "Хвост готов к закреплению",
        "Закрепить хвост",
      ],
      securing: [
        "Закрепление хвоста продолжается",
        "Продолжить закрепление",
      ],
      needs_rework: [
        "Закрепление хвоста требует исправления",
        "Продолжить исправление",
      ],
      completed: [
        "Хвост рабочей нити закреплён",
        "Посмотреть завершённый этап",
      ],
    };
    const [stage, label] =
      labels[securing.status] ?? labels.ready;
    return {
      stage,
      summary: tailProgressSummary(securing),
      label,
      href,
      status: securing.status,
      securing: copy(securing),
    };
  }

  function tailProgressSummary(progress) {
    if (!progress) {
      return "";
    }
    if (progress.status === "completed") {
      return "Хвост спрятан и надёжно закреплён. Stage 13 завершена.";
    }
    if (progress.status === "needs_rework") {
      return (
        progress.reworkInstruction ||
        "Исправьте проблему вручную и повторите checklist."
      );
    }
    const checked = progress.checklist.filter(
      (item) => item.source === "user" && item.checked,
    ).length;
    return `Проверено ${checked} из ${USER_CHECKLIST_IDS.length} пунктов; выполнено ${progress.tailInformation.completedSecuringCount} из ${progress.tailInformation.recommendedSecuringCount} закреплений.`;
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

  function securingResult(
    project,
    calculation,
    preparationRecord,
    preparation,
    joinRecord,
    join,
    inspectionRecord,
    inspection,
    progressRecord,
    securing,
    input,
  ) {
    return {
      state:
        securing.status === "blocked" ? "blocked" : "ready",
      status: securing.status,
      project,
      calculation,
      preparationRecord: copy(preparationRecord),
      preparation: copy(preparation),
      joinRecord: copy(joinRecord),
      join: copy(join),
      inspectionRecord: copy(inspectionRecord),
      inspection: copy(inspection),
      progress: copy(progressRecord),
      securing: copy(securing),
      input,
      blockers: copy(securing.blockers),
      code: securing.blockers[0]?.code ?? null,
      message: securing.blockers[0]?.message ?? null,
    };
  }

  function createChecklist(blockers, now) {
    const codes = new Set(blockers.map((entry) => entry.code));
    const inspectionCompleted =
      !codes.has("INSPECTION_MISSING") &&
      !codes.has("INSPECTION_NOT_COMPLETED") &&
      !codes.has("INSPECTION_CORRUPTED");
    const snapshotUnchanged =
      blockers.length === 0 &&
      inspectionCompleted;
    return CHECKLIST.map((definition) => {
      const checked =
        definition.id === "inspection_completed"
          ? inspectionCompleted
          : definition.id === "inspection_snapshot_unchanged"
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
      tailLengthConfirmed: null,
      tailHiddenInsideFabric: null,
      securingCountConfirmed: null,
      fabricNotDistorted: null,
      noTailLoop: null,
      tailSecured: null,
    };
  }

  function emptyTailInformation(recommendedSecuringCount = 3) {
    return {
      tailLengthConfirmed: null,
      tailHiddenInsideFabric: null,
      tailSecured: null,
      recommendedSecuringCount,
      completedSecuringCount: 0,
      userConfidence: null,
      assistantConfidence: null,
    };
  }

  function validTailInformation(value) {
    const confidence = [null, "low", "medium", "high"];
    return (
      isRecord(value) &&
      [null, true, false].includes(value.tailLengthConfirmed) &&
      [null, true, false].includes(
        value.tailHiddenInsideFabric,
      ) &&
      [null, true, false].includes(value.tailSecured) &&
      positiveInteger(value.recommendedSecuringCount) &&
      nonNegativeInteger(value.completedSecuringCount) &&
      value.completedSecuringCount <= 99 &&
      confidence.includes(value.userConfidence) &&
      confidence.includes(value.assistantConfidence)
    );
  }

  function tailInformationComplete(value) {
    return (
      validTailInformation(value) &&
      value.tailLengthConfirmed === true &&
      value.tailHiddenInsideFabric === true &&
      value.tailSecured === true &&
      value.completedSecuringCount >=
        value.recommendedSecuringCount &&
      value.userConfidence !== null &&
      value.assistantConfidence !== null
    );
  }

  function buildReferences(input = {}) {
    const project = input.project ?? {};
    const preparation = input.preparation ?? {};
    const join = input.join ?? {};
    const inspection = input.inspection ?? {};
    return {
      project: {
        id: projectIdOf(project),
        revision:
          positiveInteger(project.revision) ||
          positiveInteger(project.aggregate_revision),
      },
      preparation: {
        id: text(preparation.id) || null,
        revision: positiveInteger(preparation.revision),
        fingerprint:
          text(preparation.sourceFingerprint) || null,
      },
      join: {
        id: text(join.id) || null,
        revision: positiveInteger(join.revision),
        fingerprint: text(join.sourceFingerprint) || null,
      },
      inspection: {
        id: text(inspection.id) || null,
        revision: positiveInteger(inspection.revision),
        fingerprint:
          text(inspection.sourceFingerprint) || null,
      },
    };
  }

  function validReferences(references, sourceSnapshot) {
    const inspection = sourceSnapshot?.stage12C;
    if (!text(inspection?.id)) {
      return (
        isRecord(references) &&
        isRecord(references.project) &&
        references.project.id === sourceSnapshot?.projectId &&
        isRecord(references.preparation) &&
        isRecord(references.join) &&
        isRecord(references.inspection) &&
        references.inspection.id === null &&
        references.inspection.revision === null &&
        references.inspection.fingerprint === null
      );
    }
    return (
      isRecord(references) &&
      isRecord(references.project) &&
      references.project.id === sourceSnapshot.projectId &&
      isRecord(references.preparation) &&
      references.preparation.id ===
        (text(inspection?.preparationId) || null) &&
      references.preparation.revision ===
        positiveInteger(inspection?.preparationRevision) &&
      references.preparation.fingerprint ===
        (text(inspection?.preparationFingerprint) || null) &&
      isRecord(references.join) &&
      references.join.id === (text(inspection?.joinId) || null) &&
      references.join.revision ===
        positiveInteger(inspection?.joinRevision) &&
      references.join.fingerprint ===
        (text(inspection?.joinFingerprint) || null) &&
      isRecord(references.inspection) &&
      references.inspection.id === (text(inspection?.id) || null) &&
      references.inspection.revision ===
        positiveInteger(inspection?.revision) &&
      references.inspection.fingerprint ===
        (text(inspection?.sourceFingerprint) || null)
    );
  }

  function stateFingerprint(progress) {
    if (!isRecord(progress)) {
      return null;
    }
    const payload = copy(progress);
    delete payload.stage13Fingerprint;
    return `first-tail-securing-v1-${fnv64(
      stableStringify(payload),
    )}`;
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
      typeof value.reworkAcknowledged !== "boolean" ||
      !(
        value.reworkInstruction === null ||
        typeof value.reworkInstruction === "string"
      ) ||
      typeof value.issueResolvedConfirmed !== "boolean"
    ) {
      return false;
    }
    if (value.issueDetected === null) {
      return (
        value.issueCode === null &&
        value.issueNote === null &&
        value.reworkAcknowledged === false &&
        value.reworkInstruction === null &&
        value.issueResolvedConfirmed === false
      );
    }
    if (value.issueDetected === true) {
      return (
        ISSUE_CODES.includes(value.issueCode) &&
        value.reworkInstruction ===
          TAIL_REWORK_INSTRUCTIONS[value.issueCode] &&
        value.issueResolvedConfirmed === false
      );
    }
    if (value.issueCode === null) {
      return (
        value.issueNote === null &&
        value.reworkAcknowledged === false &&
        value.reworkInstruction === null &&
        value.issueResolvedConfirmed === false
      );
    }
    return (
      ISSUE_CODES.includes(value.issueCode) &&
      value.reworkAcknowledged === true &&
      value.issueResolvedConfirmed === true &&
      value.reworkInstruction ===
        TAIL_REWORK_INSTRUCTIONS[value.issueCode]
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
      }) && history[0].actionType === "securing_created"
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
    next.stage13Fingerprint = stateFingerprint(next);
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
          "securing_created",
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
    const blocked = {
      ...base,
      status: "blocked",
      revision: nextRevision,
      updatedAt: now,
      completedAt: null,
      blockers: [blocker],
      actionHistory: history,
      corruptionEvidence: evidence,
    };
    blocked.stage13Fingerprint = stateFingerprint(blocked);
    return blocked;
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
      actionId: makeId("securing-action"),
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
        "FIRST_TAIL_SECURING_BLOCKED",
        progress.blockers[0]?.message ||
          "Проверка первого шва заблокирована.",
      );
    }
    if (progress.status === "completed") {
      throw stateError(
        "FIRST_TAIL_SECURING_COMPLETED",
        "Завершённую проверку первого шва нельзя изменять.",
      );
    }
  }

  function requireInspecting(progress) {
    requireMutable(progress);
    if (progress.status !== "securing") {
      throw stateError(
        progress.status === "needs_rework"
          ? "ISSUE_UNRESOLVED"
          : "SECURING_NOT_STARTED",
        progress.status === "needs_rework"
          ? "Сначала исправьте отмеченную проблему."
          : "Сначала начните проверку первого шва.",
      );
    }
  }

  function requireValidProgress(progress) {
    if (!isValidProgress(progress)) {
      throw stateError(
        "SECURING_DATA_DAMAGED",
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
      text(value.securingId) &&
      value.id === value.securingId &&
      positiveInteger(value.revision) &&
      Array.isArray(value.blockers) &&
      value.blockers.length > 0 &&
      value.blockers.every(validNotice)
    );
  }

  function blockedSecuring(code, details = {}) {
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

  function errorFromSecuring(result) {
    return stateError(
      result?.code ?? "FIRST_TAIL_SECURING_UNAVAILABLE",
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
    return new FirstTailSecuringError(
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
        "SECURING_TIMESTAMP_INVALID",
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
    INSPECTION_KIND,
    STATUSES,
    ISSUE_CODES,
    CHECKLIST,
    USER_CHECKLIST_IDS,
    ANSWER_KEYS,
    ACTIONS,
    REWORK_INSTRUCTIONS: TAIL_REWORK_INSTRUCTIONS,
    BLOCKER_MESSAGES,
    FirstTailSecuringError,
    buildJoinSnapshot,
    joinSnapshotFingerprint,
    buildSourceSnapshot,
    stage12Fingerprint,
    sourceFingerprint,
    stateFingerprint,
    evaluateSources,
    createProgress,
    startSecuring,
    updateTailInformation,
    setChecklistItem,
    checkItem,
    uncheckItem,
    confirmNoIssue,
    markIssue,
    acknowledgeCorrection,
    confirmIssueResolved,
    completeSecuring,
    revalidateProgress,
    restoreProgress,
    isValidProgress,
    structuralBlocker,
    inspectAggregate,
    ensureForProject,
    getForProject,
    loadForProject,
    revalidateForProject,
    startForProject,
    updateTailForProject,
    setChecklistForProject,
    confirmNoIssueForProject,
    markIssueForProject,
    acknowledgeForProject,
    resolveForProject,
    completeForProject,
    homeState: tailHomeState,
    progressSummary: tailProgressSummary,
    sourceSummary,
    stableStringify,
  };

  globalObject.YarnAIFirstTailSecuring = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
