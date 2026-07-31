"use strict";

(function exposeFirstAssemblyPreparation(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "FIRST_ASSEMBLY_PREPARATION";
  const FIRST_PIECE_KIND = "FIRST_FINISHED_PIECE";
  const SECOND_PIECE_KIND = "SECOND_IDENTICAL_PIECE";
  const SUPPORTED_OPERATION = "join_two_identical_straight_edges";
  const STATUSES = Object.freeze(["collecting", "ready", "blocked"]);
  const USER_CHECKLIST_IDS = Object.freeze([
    "pieces_laid_side_by_side",
    "joining_edge_identified",
    "needle_and_yarn_ready",
  ]);
  const CHECKLIST = Object.freeze([
    {
      id: "both_pieces_found",
      label: "Обе готовые детали найдены.",
      source: "system",
    },
    {
      id: "both_pieces_completed",
      label: "Обе детали завершены.",
      source: "system",
    },
    {
      id: "same_project",
      label: "Обе детали принадлежат одному проекту.",
      source: "system",
    },
    {
      id: "same_section",
      label: "Обе детали относятся к одному участку.",
      source: "system",
    },
    {
      id: "same_initial_parameters",
      label: "Исходные параметры деталей совпадают.",
      source: "system",
    },
    {
      id: "same_final_stitch_count",
      label: "Итоговое число петель совпадает.",
      source: "system",
    },
    {
      id: "same_shaping_plan",
      label: "План формирования деталей совпадает.",
      source: "system",
    },
    {
      id: "same_bind_off_method",
      label: "Способ закрытия петель совпадает.",
      source: "system",
    },
    {
      id: "pieces_laid_side_by_side",
      label: "Детали разложены рядом.",
      source: "user",
    },
    {
      id: "joining_edge_identified",
      label: "Соединяемый прямой край определён.",
      source: "user",
    },
    {
      id: "needle_and_yarn_ready",
      label: "Подходящие игла и нить готовы.",
      source: "user",
    },
  ]);
  const ACTIONS = Object.freeze([
    "record_created",
    "checklist_item_confirmed",
    "checklist_item_unconfirmed",
    "sources_revalidated",
    "became_ready",
    "became_blocked",
  ]);
  const BLOCKER_MESSAGES = Object.freeze({
    FIRST_PIECE_MISSING: "Первая готовая деталь не найдена.",
    FIRST_PIECE_NOT_COMPLETED: "Первая деталь ещё не завершена.",
    FIRST_PIECE_SOURCE_DAMAGED:
      "Данные первой готовой детали повреждены.",
    SECOND_PIECE_MISSING: "Вторая готовая деталь не найдена.",
    SECOND_PIECE_NOT_COMPLETED: "Вторая деталь ещё не завершена.",
    SECOND_PIECE_SOURCE_DAMAGED:
      "Данные второй готовой детали повреждены.",
    PROJECT_ID_MISMATCH: "Детали принадлежат разным проектам.",
    PROJECT_REVISION_CONFLICT:
      "Версии проекта в источниках деталей не совпадают.",
    SECTION_MISMATCH: "Детали относятся к разным участкам.",
    STITCH_COUNT_MISMATCH: "Число петель у деталей не совпадает.",
    SHAPING_FINGERPRINT_MISMATCH:
      "Планы формирования двух деталей не совпадают.",
    BIND_OFF_METHOD_MISMATCH:
      "Способы закрытия петель у деталей не совпадают.",
    BIND_OFF_FINGERPRINT_MISMATCH:
      "Данные закрытия петель у деталей не совпадают.",
    SOURCE_REVISION_CONFLICT:
      "Версии исходных записей двух деталей конфликтуют.",
    SOURCE_FINGERPRINT_CONFLICT:
      "Контрольные отпечатки исходных записей не совпадают.",
    EXISTING_SNAPSHOT_MISMATCH:
      "Подготовка была создана из другого снимка источников.",
    PIECES_NOT_IDENTICAL: "Детали не являются идентичными.",
    MIRRORED_PIECE_REQUESTED:
      "Зеркальные детали пока нельзя соединить этим способом.",
    EDGE_NOT_STRAIGHT:
      "Выбранный край не является прямым.",
    EASE_REQUIRED:
      "Для соединения требуется посадка, которая пока не поддерживается.",
    EDGE_LENGTH_MISMATCH:
      "Соединяемые края имеют разную длину.",
    UNSUPPORTED_CONSTRUCTION:
      "Конструкция пока не поддерживается первым способом сборки.",
    UNSUPPORTED_OPERATION:
      "Запрошенная операция соединения пока не поддерживается.",
    CHECKLIST_DAMAGED:
      "Контрольный список подготовки повреждён.",
    READY_STATUS_CONFLICT:
      "Состояние готовности противоречит контрольному списку.",
    ACTION_HISTORY_DAMAGED:
      "История действий подготовки повреждена.",
  });
  const SUPPORTED_CONSTRUCTIONS = new Set([
    "simple_flat_piece",
    "straight_flat_piece",
  ]);

  class FirstAssemblyPreparationError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FirstAssemblyPreparationError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function buildSourceSnapshot(input = {}) {
    const project = isRecord(input.project) ? input.project : {};
    const first = isRecord(input.firstPiece) ? input.firstPiece : null;
    const second = isRecord(input.secondPiece) ? input.secondPiece : null;
    const requirements = normalizeRequirements(input.requirements);
    const projectId =
      text(project.projectId) ||
      text(project.project_id) ||
      text(first?.projectId) ||
      text(second?.projectId) ||
      null;
    const snapshot = {
      projectId,
      projectRevision:
        positiveInteger(project.revision) ??
        positiveInteger(input.projectRevision),
      projectStage:
        text(project.currentStage) ||
        text(project.current_stage) ||
        text(input.projectStage) ||
        null,
      calculationFingerprint:
        text(input.calculationFingerprint) ||
        text(first?.calculationFingerprint) ||
        text(second?.calculationFingerprint) ||
        null,
      firstPiece: snapshotPiece(first, FIRST_PIECE_KIND),
      secondPiece: snapshotPiece(second, SECOND_PIECE_KIND),
      section: text(first?.section) || text(second?.section) || null,
      initialStitchCount:
        nonNegativeInteger(first?.initialStitchCount) ??
        nonNegativeInteger(second?.initialStitchCount),
      finalStitchCount:
        nonNegativeInteger(first?.finalStitchCount) ??
        nonNegativeInteger(second?.finalStitchCount),
      shapingPlanFingerprint:
        text(first?.shapingPlanFingerprint) ||
        text(second?.shapingPlanFingerprint) ||
        null,
      bindOffMethod:
        text(first?.bindOffMethod) || text(second?.bindOffMethod) || null,
      bindOffFingerprint:
        text(first?.bindOffFingerprint) ||
        text(second?.bindOffFingerprint) ||
        null,
      constructionType: requirements.constructionType,
      requestedAssemblyOperation: requirements.operation,
      joiningEdge: {
        straight: requirements.straightEdge,
        mirrored: requirements.mirrored,
        requiresEase: requirements.requiresEase,
        firstLength: requirements.firstEdgeLength,
        secondLength: requirements.secondEdgeLength,
      },
    };
    return copy(snapshot);
  }

  function sourceFingerprint(snapshot) {
    if (!isRecord(snapshot)) {
      throw stateError(
        "FIRST_ASSEMBLY_SOURCE_INVALID",
        "Не удалось создать контрольный отпечаток источников.",
      );
    }
    return `assembly-source-v1-${fnv64(stableStringify(snapshot))}`;
  }

  function evaluateSources(input = {}) {
    const first = isRecord(input.firstPiece) ? input.firstPiece : null;
    const second = isRecord(input.secondPiece) ? input.secondPiece : null;
    const requirements = normalizeRequirements(input.requirements);
    const snapshot = buildSourceSnapshot(input);
    const blockers = [];

    if (!first) {
      addBlocker(blockers, "FIRST_PIECE_MISSING");
    } else if (first.completed !== true || !isTimestamp(first.completedAt)) {
      addBlocker(blockers, "FIRST_PIECE_NOT_COMPLETED");
    }
    if (first && first.valid === false) {
      addBlocker(blockers, "FIRST_PIECE_SOURCE_DAMAGED");
    }
    if (!second) {
      addBlocker(blockers, "SECOND_PIECE_MISSING");
    } else if (
      second.completed !== true ||
      !isTimestamp(second.completedAt)
    ) {
      addBlocker(blockers, "SECOND_PIECE_NOT_COMPLETED");
    }
    if (second && second.valid === false) {
      addBlocker(blockers, "SECOND_PIECE_SOURCE_DAMAGED");
    }

    if (first && second) {
      if (
        !text(first.projectId) ||
        !text(second.projectId) ||
        first.projectId !== second.projectId
      ) {
        addBlocker(blockers, "PROJECT_ID_MISMATCH", {
          firstProjectId: first.projectId ?? null,
          secondProjectId: second.projectId ?? null,
        });
      }
      if (
        positiveInteger(first.projectRevision) &&
        positiveInteger(second.projectRevision) &&
        first.projectRevision !== second.projectRevision
      ) {
        addBlocker(blockers, "PROJECT_REVISION_CONFLICT", {
          firstProjectRevision: first.projectRevision,
          secondProjectRevision: second.projectRevision,
        });
      }
      if (!text(first.section) || first.section !== second.section) {
        addBlocker(blockers, "SECTION_MISMATCH", {
          firstSection: first.section ?? null,
          secondSection: second.section ?? null,
        });
      }
      if (
        nonNegativeInteger(first.initialStitchCount) === null ||
        first.initialStitchCount !== second.initialStitchCount ||
        nonNegativeInteger(first.finalStitchCount) === null ||
        first.finalStitchCount !== second.finalStitchCount
      ) {
        addBlocker(blockers, "STITCH_COUNT_MISMATCH", {
          firstInitial: first.initialStitchCount ?? null,
          secondInitial: second.initialStitchCount ?? null,
          firstFinal: first.finalStitchCount ?? null,
          secondFinal: second.finalStitchCount ?? null,
        });
      }
      if (
        !text(first.shapingPlanFingerprint) ||
        first.shapingPlanFingerprint !== second.shapingPlanFingerprint
      ) {
        addBlocker(blockers, "SHAPING_FINGERPRINT_MISMATCH");
      }
      if (
        !text(first.bindOffMethod) ||
        first.bindOffMethod !== second.bindOffMethod
      ) {
        addBlocker(blockers, "BIND_OFF_METHOD_MISMATCH");
      }
      if (
        !text(first.bindOffFingerprint) ||
        first.bindOffFingerprint !== second.bindOffFingerprint
      ) {
        addBlocker(blockers, "BIND_OFF_FINGERPRINT_MISMATCH");
      }
      if (
        !sameOptionalValue(first.sourceRevision, second.sourceRevision)
      ) {
        addBlocker(blockers, "SOURCE_REVISION_CONFLICT");
      }
      if (
        !text(first.sourceFingerprint) ||
        first.sourceFingerprint !== second.sourceFingerprint
      ) {
        addBlocker(blockers, "SOURCE_FINGERPRINT_CONFLICT");
      }
      if (first.identical === false || second.identical === false) {
        addBlocker(blockers, "PIECES_NOT_IDENTICAL");
      }
    }

    if (requirements.operation !== SUPPORTED_OPERATION) {
      addBlocker(blockers, "UNSUPPORTED_OPERATION", {
        requestedOperation: requirements.operation,
      });
    }
    if (requirements.mirrored) {
      addBlocker(blockers, "MIRRORED_PIECE_REQUESTED");
    }
    if (!requirements.straightEdge) {
      addBlocker(blockers, "EDGE_NOT_STRAIGHT");
    }
    if (requirements.requiresEase) {
      addBlocker(blockers, "EASE_REQUIRED");
    }
    if (
      requirements.firstEdgeLength !== requirements.secondEdgeLength
    ) {
      addBlocker(blockers, "EDGE_LENGTH_MISMATCH", {
        firstLength: requirements.firstEdgeLength,
        secondLength: requirements.secondEdgeLength,
      });
    }
    if (!SUPPORTED_CONSTRUCTIONS.has(requirements.constructionType)) {
      addBlocker(blockers, "UNSUPPORTED_CONSTRUCTION", {
        constructionType: requirements.constructionType,
      });
    }
    const checklist = createChecklist(blockers);
    return {
      snapshot,
      fingerprint: sourceFingerprint(snapshot),
      supportedOperation:
        blockers.some((entry) =>
          [
            "UNSUPPORTED_OPERATION",
            "MIRRORED_PIECE_REQUESTED",
            "EDGE_NOT_STRAIGHT",
            "EASE_REQUIRED",
            "EDGE_LENGTH_MISMATCH",
            "UNSUPPORTED_CONSTRUCTION",
          ].includes(entry.code),
        )
          ? null
          : SUPPORTED_OPERATION,
      checklist,
      blockers,
    };
  }

  function createProgress(input, now = new Date().toISOString()) {
    requireTimestamp(now);
    const evaluation = evaluateSources(input);
    const blocked = evaluation.blockers.length > 0;
    const progress = {
      id: makeId("assembly"),
      projectId: evaluation.snapshot.projectId,
      type: PROGRESS_KIND,
      version: VERSION,
      revision: 1,
      status: blocked ? "blocked" : "collecting",
      sourceSnapshot: copy(evaluation.snapshot),
      sourceFingerprint: evaluation.fingerprint,
      supportedOperation: evaluation.supportedOperation,
      checklist: copy(evaluation.checklist),
      blockers: copy(evaluation.blockers),
      warnings: [
        notice(
          "STAGE_12A_PREPARATION_ONLY",
          "Подготовка проверена; само соединение будет доступно на следующем этапе.",
        ),
      ],
      actionHistory: [
        action("record_created", now, {
          sourceFingerprint: evaluation.fingerprint,
        }),
        ...(blocked
          ? [
              action("became_blocked", now, {
                blockerCodes: evaluation.blockers.map((entry) => entry.code),
              }),
            ]
          : []),
      ],
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      readyAt: null,
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
    if (progress.status === "blocked") {
      throw stateError(
        "FIRST_ASSEMBLY_BLOCKED",
        progress.blockers[0]?.message || "Подготовка соединения заблокирована.",
      );
    }
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
    const allConfirmed = checklist.every(
      (item) => !item.required || item.confirmed,
    );
    const becameReady = allConfirmed && progress.status !== "ready";
    const next = {
      ...copy(progress),
      revision: progress.revision + 1,
      status: allConfirmed ? "ready" : "collecting",
      checklist,
      updatedAt: now,
      readyAt: allConfirmed ? progress.readyAt ?? now : null,
      actionHistory: [
        ...copy(progress.actionHistory),
        action(
          confirmed
            ? "checklist_item_confirmed"
            : "checklist_item_unconfirmed",
          now,
          { itemId },
        ),
        ...(becameReady
          ? [action("became_ready", now, { sourceFingerprint: progress.sourceFingerprint })]
          : []),
      ],
    };
    requireValidProgress(next);
    return next;
  }

  function confirmChecklistItem(progress, itemId, now) {
    return setChecklistItem(progress, itemId, true, now);
  }

  function unconfirmChecklistItem(progress, itemId, now) {
    return setChecklistItem(progress, itemId, false, now);
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
    const evaluation = evaluateSources(input);
    if (evaluation.fingerprint !== progress.sourceFingerprint) {
      return blockProgress(
        progress,
        "EXISTING_SNAPSHOT_MISMATCH",
        now,
        {
          savedFingerprint: progress.sourceFingerprint,
          currentFingerprint: evaluation.fingerprint,
        },
        true,
      );
    }
    if (evaluation.blockers.length) {
      return blockProgress(
        progress,
        evaluation.blockers[0].code,
        now,
        evaluation.blockers[0].details,
        false,
        evaluation.blockers,
      );
    }
    const next = {
      ...copy(progress),
      revision: progress.revision + 1,
      updatedAt: now,
      actionHistory: [
        ...copy(progress.actionHistory),
        action("sources_revalidated", now, {
          sourceFingerprint: progress.sourceFingerprint,
        }),
      ],
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
        "FIRST_ASSEMBLY_DATA_DAMAGED",
        "Запись подготовки соединения повреждена.",
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
      !validChecklist(value.checklist) ||
      !Array.isArray(value.blockers) ||
      !value.blockers.every(validNotice) ||
      !Array.isArray(value.warnings) ||
      !value.warnings.every(validNotice) ||
      !validActionHistory(value.actionHistory) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt) ||
      !isTimestamp(value.startedAt) ||
      !nullableTimestamp(value.readyAt)
    ) {
      return false;
    }
    const complete = value.checklist.every(
      (item) => !item.required || item.confirmed,
    );
    if (value.status === "blocked") {
      return value.blockers.length > 0 && value.readyAt === null;
    }
    if (value.blockers.length || value.supportedOperation !== SUPPORTED_OPERATION) {
      return false;
    }
    if (value.status === "ready") {
      return complete && isTimestamp(value.readyAt);
    }
    return !complete && value.readyAt === null;
  }

  function structuralBlocker(value) {
    if (!isRecord(value)) {
      return "ACTION_HISTORY_DAMAGED";
    }
    if (!validChecklist(value.checklist)) {
      return "CHECKLIST_DAMAGED";
    }
    if (!validActionHistory(value.actionHistory)) {
      return "ACTION_HISTORY_DAMAGED";
    }
    if (
      value.status === "ready" &&
      (!value.checklist.every((item) => item.confirmed) ||
        !isTimestamp(value.readyAt) ||
        (Array.isArray(value.blockers) && value.blockers.length))
    ) {
      return "READY_STATUS_CONFLICT";
    }
    if (!isRecord(value.sourceSnapshot) || !text(value.sourceFingerprint)) {
      return "EXISTING_SNAPSHOT_MISMATCH";
    }
    try {
      if (sourceFingerprint(value.sourceSnapshot) !== value.sourceFingerprint) {
        return "EXISTING_SNAPSHOT_MISMATCH";
      }
    } catch {
      return "EXISTING_SNAPSHOT_MISMATCH";
    }
    return null;
  }

  function inspectAggregate(aggregate, requirements = {}) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      return blockedInspection("FIRST_PIECE_MISSING");
    }
    const calculation = activeCalculation(aggregate, project);
    if (!calculation) {
      return blockedInspection("FIRST_PIECE_SOURCE_DAMAGED", { project });
    }
    const matches = progressMatches(
      aggregate,
      PROGRESS_KIND,
      calculation.calculation_id,
    );
    if (matches.length > 1) {
      return blockedInspection("EXISTING_SNAPSHOT_MISMATCH", {
        project,
        calculation,
      });
    }
    const input = inputFromAggregate(
      aggregate,
      project,
      calculation,
      requirements,
    );
    const progressRecord = matches[0] ?? null;
    if (!progressRecord || isPlaceholder(progressRecord.state)) {
      const evaluation = evaluateSources(input);
      return {
        state: evaluation.blockers.length ? "blocked" : "missing",
        status: evaluation.blockers.length ? "blocked" : "collecting",
        project,
        calculation,
        progress: progressRecord,
        input,
        sourceSnapshot: evaluation.snapshot,
        sourceFingerprint: evaluation.fingerprint,
        blockers: evaluation.blockers,
        code: evaluation.blockers[0]?.code ?? null,
        message: evaluation.blockers[0]?.message ?? null,
      };
    }
    const preparation = progressRecord.state;
    const structuralCode = structuralBlocker(preparation);
    if (structuralCode) {
      return blockedInspection(structuralCode, {
        project,
        calculation,
        progress: progressRecord,
        preparation,
        input,
      });
    }
    input.project.revision = preparation.sourceSnapshot.projectRevision;
    input.project.currentStage = preparation.sourceSnapshot.projectStage;
    const evaluation = evaluateSources(input);
    if (evaluation.fingerprint !== preparation.sourceFingerprint) {
      return blockedInspection("EXISTING_SNAPSHOT_MISMATCH", {
        project,
        calculation,
        progress: progressRecord,
        preparation,
        input,
      });
    }
    if (preparation.status === "blocked") {
      return {
        state: "blocked",
        status: "blocked",
        code: preparation.blockers[0].code,
        message: preparation.blockers[0].message,
        blockers: copy(preparation.blockers),
        project,
        calculation,
        progress: copy(progressRecord),
        preparation: copy(preparation),
        input,
      };
    }
    return {
      state: "ready",
      status: preparation.status,
      project,
      calculation,
      progress: copy(progressRecord),
      preparation: copy(preparation),
      input,
    };
  }

  async function ensureForProject(repository, projectId, requirements = {}) {
    let aggregate = await repository.getProject(projectId);
    let inspection = inspectAggregate(aggregate, requirements);
    if (inspection.preparation) {
      if (
        inspection.state === "blocked" &&
        inspection.preparation.status !== "blocked"
      ) {
        const blocked = revalidateProgress(
          inspection.preparation,
          inspection.input,
        );
        return persist(
          repository,
          inspection,
          blocked,
          "FIRST_ASSEMBLY_PREPARATION_BLOCKED",
        );
      }
      return inspection;
    }
    if (!inspection.calculation) {
      throw errorFromInspection(inspection);
    }
    if (!inspection.progress) {
      const sourceInput = copy(inspection.input);
      await repository.ensureCalculationProgress(
        projectId,
        inspection.calculation.calculation_id,
        PROGRESS_KIND,
        { version: 0, initialized: false },
        { operationKind: "FIRST_ASSEMBLY_PREPARATION_PROGRESS_CREATED" },
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
        input: sourceInput,
      };
    }
    const now = new Date().toISOString();
    const state = createProgress(inspection.input, now);
    const options = {
      baseProgressRevision: inspection.progress.revision,
      operationKind: "FIRST_ASSEMBLY_PREPARATION_CREATED",
      timestamp: now,
    };
    if (state.status === "collecting") {
      options.projectStage = "assembly_preparation_collecting";
    } else if (state.status === "ready") {
      options.projectStage = "assembly_preparation_ready";
    }
    await repository.updateCalculationProgress(
      projectId,
      inspection.calculation.calculation_id,
      PROGRESS_KIND,
      state,
      options,
    );
    return inspectAggregate(await repository.getProject(projectId), requirements);
  }

  async function loadForProject(repository, projectId, requirements = {}) {
    return inspectAggregate(await repository.getProject(projectId), requirements);
  }

  async function revalidateForProject(
    repository,
    projectId,
    requirements = {},
  ) {
    const inspection = inspectAggregate(
      await repository.getProject(projectId),
      requirements,
    );
    if (!inspection.progress || !inspection.preparation) {
      return ensureForProject(repository, projectId, requirements);
    }
    const next = revalidateProgress(
      inspection.preparation,
      inspection.input,
    );
    return persist(
      repository,
      inspection,
      next,
      "FIRST_ASSEMBLY_PREPARATION_SOURCES_REVALIDATED",
    );
  }

  async function confirmForProject(
    repository,
    projectId,
    itemId,
  ) {
    return mutateForProject(
      repository,
      projectId,
      (progress) => confirmChecklistItem(progress, itemId),
      "FIRST_ASSEMBLY_PREPARATION_CHECKLIST_CONFIRMED",
    );
  }

  async function unconfirmForProject(
    repository,
    projectId,
    itemId,
  ) {
    return mutateForProject(
      repository,
      projectId,
      (progress) => unconfirmChecklistItem(progress, itemId),
      "FIRST_ASSEMBLY_PREPARATION_CHECKLIST_UNCONFIRMED",
    );
  }

  async function mutateForProject(
    repository,
    projectId,
    mutation,
    operationKind,
  ) {
    const inspection = inspectAggregate(await repository.getProject(projectId));
    if (!inspection.progress || !inspection.preparation) {
      throw errorFromInspection(inspection);
    }
    const currentEvaluation = evaluateSources(inspection.input);
    if (
      currentEvaluation.fingerprint !==
      inspection.preparation.sourceFingerprint
    ) {
      const blocked = blockProgress(
        inspection.preparation,
        "EXISTING_SNAPSHOT_MISMATCH",
        new Date().toISOString(),
        {
          savedFingerprint: inspection.preparation.sourceFingerprint,
          currentFingerprint: currentEvaluation.fingerprint,
        },
        true,
      );
      return persist(
        repository,
        inspection,
        blocked,
        "FIRST_ASSEMBLY_PREPARATION_BLOCKED",
      );
    }
    const next = mutation(inspection.preparation);
    return persist(repository, inspection, next, operationKind);
  }

  async function persist(repository, inspection, state, operationKind) {
    const options = {
      baseProgressRevision: inspection.progress.revision,
      operationKind,
    };
    if (state.status === "ready") {
      options.projectStage = "assembly_preparation_ready";
    } else if (state.status === "collecting") {
      options.projectStage = "assembly_preparation_collecting";
    }
    await repository.updateCalculationProgress(
      inspection.project.project_id,
      inspection.calculation.calculation_id,
      PROGRESS_KIND,
      state,
      options,
    );
    return inspectAggregate(
      await repository.getProject(inspection.project.project_id),
    );
  }

  function inputFromAggregate(
    aggregate,
    project,
    calculation,
    requirements,
  ) {
    const shapingRecord = oneProgress(
      aggregate,
      "FIRST_SIMPLE_SHAPING",
      calculation.calculation_id,
    );
    const bindRecord = oneProgress(
      aggregate,
      "FIRST_BIND_OFF",
      calculation.calculation_id,
    );
    const secondRecord = oneProgress(
      aggregate,
      SECOND_PIECE_KIND,
      calculation.calculation_id,
    );
    const shaping = shapingRecord?.state;
    const bindOff = bindRecord?.state;
    const second = secondRecord?.state;
    const plan = shapingPlan(shaping);
    const planFingerprint = plan
      ? semanticFingerprint("shaping-plan", plan)
      : null;
    const bindMethod =
      bindOff && text(bindOff.stitch_instruction_mode)
        ? "ordinary_sequential"
        : null;
    const bindFingerprint =
      bindOff && bindMethod
        ? semanticFingerprint("bind-off", {
            method: bindMethod,
            stitchInstructionMode: bindOff.stitch_instruction_mode,
            stitchCount: bindOff.initial_stitch_count,
          })
        : null;
    const sourceRevision =
      shapingRecord && bindRecord
        ? {
            shaping: shapingRecord.revision,
            bindOff: bindRecord.revision,
          }
        : null;
    const sharedSourceFingerprint =
      planFingerprint && bindFingerprint
        ? semanticFingerprint("piece-source", {
            calculationFingerprint: calculation.fingerprint,
            section: shaping?.source_section_id,
            initialStitchCount: shaping?.starting_stitch_count,
            finalStitchCount: shaping?.target_stitch_count,
            shapingPlanFingerprint: planFingerprint,
            bindOffMethod: bindMethod,
            bindOffFingerprint: bindFingerprint,
          })
        : null;
    const firstPresent = Boolean(shapingRecord || bindRecord);
    const first = firstPresent
      ? {
          projectId:
            text(shaping?.project_id) ||
            text(bindOff?.project_id) ||
            project.project_id,
          projectRevision:
            positiveInteger(second?.source?.sourceProjectRevision) ?? null,
          calculationFingerprint: calculation.fingerprint,
          revision: bindRecord?.revision ?? shapingRecord?.revision ?? null,
          sourceRevision,
          fingerprint:
            shaping && bindOff
              ? semanticFingerprint("first-finished-piece", {
                  sourceRevision,
                  shapingCompletedAt: shaping.completed_at,
                  bindOffCompletedAt: bindOff.completed_at,
                  sourceFingerprint: sharedSourceFingerprint,
                })
              : null,
          sourceFingerprint: sharedSourceFingerprint,
          completed:
            shaping?.status === "completed" &&
            bindOff?.status === "completed",
          completedAt: bindOff?.completed_at ?? null,
          section:
            text(shaping?.source_section_id) ||
            text(bindOff?.section_id) ||
            null,
          sectionLabel: text(shaping?.title) || null,
          initialStitchCount:
            nonNegativeInteger(shaping?.starting_stitch_count),
          finalStitchCount:
            nonNegativeInteger(shaping?.target_stitch_count),
          shapingPlanFingerprint: planFingerprint,
          shapingPlan: plan,
          bindOffMethod: bindMethod,
          bindOffFingerprint: bindFingerprint,
          bindOffData: bindOff
            ? {
                stitchInstructionMode: bindOff.stitch_instruction_mode,
                initialStitchCount: bindOff.initial_stitch_count,
                completedAt: bindOff.completed_at,
              }
            : null,
          identical: true,
          valid:
            Boolean(shapingRecord && bindRecord) &&
            Boolean(plan && bindFingerprint) &&
            shaping?.project_id === project.project_id &&
            bindOff?.project_id === project.project_id &&
            Boolean(
              globalObject.YarnAIFirstSimpleShaping?.isValidShaping?.(
                shaping,
              ),
            ) &&
            Boolean(
              globalObject.YarnAIFirstBindOff?.isValidBindOff?.(bindOff),
            ),
        }
      : null;
    const secondPresent =
      Boolean(secondRecord) && !isPlaceholder(second);
    const secondPiece = secondPresent
      ? {
          projectId: second.projectId,
          projectRevision:
            positiveInteger(second.source?.sourceProjectRevision) ?? null,
          calculationFingerprint:
            second.source?.calculationFingerprint ??
            calculation.fingerprint,
          revision: secondRecord.revision,
          sourceRevision: second.source
            ? {
                shaping: second.source.shaping?.progressRevision,
                bindOff: second.source.bindOff?.progressRevision,
              }
            : null,
          fingerprint: semanticFingerprint("second-finished-piece", {
            revision: secondRecord.revision,
            progressFingerprint: second.fingerprint,
            completedAt: second.completedAt,
          }),
          sourceFingerprint:
            second.source && second.plan
              ? semanticFingerprint("piece-source", {
                  calculationFingerprint:
                    second.source.calculationFingerprint,
                  section: second.source.section,
                  initialStitchCount: second.plan.initialStitchCount,
                  finalStitchCount: second.plan.targetStitchCount,
                  shapingPlanFingerprint: semanticFingerprint(
                    "shaping-plan",
                    second.plan.shapingPlan,
                  ),
                  bindOffMethod: second.plan.bindOffMethod,
                  bindOffFingerprint: semanticFingerprint("bind-off", {
                    method: second.plan.bindOffMethod,
                    stitchInstructionMode:
                      second.plan.stitchInstructionMode,
                    stitchCount: second.plan.bindOffStitchCount,
                  }),
                })
              : null,
          completed: second.status === "completed",
          completedAt: second.completedAt,
          section: second.source?.section ?? second.plan?.section ?? null,
          sectionLabel: second.source?.sectionLabel ?? null,
          initialStitchCount: second.plan?.initialStitchCount ?? null,
          finalStitchCount: second.plan?.targetStitchCount ?? null,
          shapingPlanFingerprint: second.plan?.shapingPlan
            ? semanticFingerprint("shaping-plan", second.plan.shapingPlan)
            : null,
          shapingPlan: copy(second.plan?.shapingPlan ?? null),
          bindOffMethod: second.plan?.bindOffMethod ?? null,
          bindOffFingerprint: second.plan
            ? semanticFingerprint("bind-off", {
                method: second.plan.bindOffMethod,
                stitchInstructionMode: second.plan.stitchInstructionMode,
                stitchCount: second.plan.bindOffStitchCount,
              })
            : null,
          bindOffData: second.plan
            ? {
                stitchInstructionMode: second.plan.stitchInstructionMode,
                initialStitchCount: second.plan.bindOffStitchCount,
                completedAt: second.completedAt,
              }
            : null,
          identical: true,
          valid: Boolean(
            globalObject.YarnAISecondIdenticalPiece?.isValidProgress?.(second),
          ),
        }
      : null;
    const inferredRequirements = {
      operation: SUPPORTED_OPERATION,
      mirrored: false,
      straightEdge: true,
      requiresEase: false,
      firstEdgeLength: first?.finalStitchCount ?? 0,
      secondEdgeLength: secondPiece?.finalStitchCount ?? 0,
      constructionType:
        shaping?.knitting_mode === "flat"
          ? "simple_flat_piece"
          : "unsupported",
      ...copy(requirements),
    };
    return {
      project: {
        projectId: project.project_id,
        revision: project.revision,
        currentStage: project.current_stage,
      },
      calculationFingerprint: calculation.fingerprint,
      firstPiece: first,
      secondPiece,
      requirements: inferredRequirements,
    };
  }

  function homeState(inspection, projectId) {
    if (!inspection) {
      return null;
    }
    const preparation = inspection.preparation;
    if (inspection.state === "blocked") {
      return {
        stage: "Соединение деталей заблокировано",
        summary:
          inspection.message ||
          preparation?.blockers?.[0]?.message ||
          "Проверьте источники двух деталей.",
        label: "Подготовить соединение деталей",
        status: "blocked",
        preparation: preparation ? copy(preparation) : null,
      };
    }
    if (inspection.state === "missing") {
      return {
        stage: "Можно начать подготовку к соединению",
        summary:
          "Две готовые одинаковые детали найдены. Подготовим один прямой край.",
        label: "Подготовить соединение деталей",
        status: "missing",
        preparation: null,
      };
    }
    if (!preparation) {
      return null;
    }
    if (preparation.status === "ready") {
      return {
        stage: "Stage 12A подготовлен",
        summary:
          "Все проверки и подтверждения выполнены. Соединение будет следующим этапом.",
        label: "Stage 12A подготовлен",
        status: "ready",
        preparation: copy(preparation),
      };
    }
    return {
      stage: "Подготовка соединения уже начата",
      summary: sourceSummary(preparation),
      label: "Продолжить подготовку соединения",
      status: "collecting",
      preparation: copy(preparation),
      projectId,
    };
  }

  function sourceSummary(progress) {
    if (!progress?.sourceSnapshot) {
      return "";
    }
    const snapshot = progress.sourceSnapshot;
    return (
      `${snapshot.firstPiece?.data?.sectionLabel || snapshot.section}: ` +
      `две детали по ${snapshot.finalStitchCount} петель у соединяемого края.`
    );
  }

  function createChecklist(blockers) {
    const codes = new Set(blockers.map((entry) => entry.code));
    const confirmations = {
      both_pieces_found:
        !codes.has("FIRST_PIECE_MISSING") &&
        !codes.has("SECOND_PIECE_MISSING"),
      both_pieces_completed:
        !codes.has("FIRST_PIECE_NOT_COMPLETED") &&
        !codes.has("SECOND_PIECE_NOT_COMPLETED") &&
        !codes.has("FIRST_PIECE_MISSING") &&
        !codes.has("SECOND_PIECE_MISSING"),
      same_project: !codes.has("PROJECT_ID_MISMATCH"),
      same_section: !codes.has("SECTION_MISMATCH"),
      same_initial_parameters: !codes.has("STITCH_COUNT_MISMATCH"),
      same_final_stitch_count: !codes.has("STITCH_COUNT_MISMATCH"),
      same_shaping_plan: !codes.has("SHAPING_FINGERPRINT_MISMATCH"),
      same_bind_off_method:
        !codes.has("BIND_OFF_METHOD_MISMATCH") &&
        !codes.has("BIND_OFF_FINGERPRINT_MISMATCH"),
    };
    return CHECKLIST.map((definition) => {
      const confirmed =
        definition.source === "system"
          ? Boolean(confirmations[definition.id])
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

  function snapshotPiece(piece, type) {
    if (!piece) {
      return null;
    }
    return {
      type,
      revision: positiveInteger(piece.revision),
      sourceRevision: copy(piece.sourceRevision ?? null),
      fingerprint: text(piece.fingerprint) || null,
      sourceFingerprint: text(piece.sourceFingerprint) || null,
      completedAt: piece.completedAt ?? null,
      data: {
        projectId: piece.projectId ?? null,
        projectRevision: piece.projectRevision ?? null,
        calculationFingerprint: piece.calculationFingerprint ?? null,
        section: piece.section ?? null,
        sectionLabel: piece.sectionLabel ?? piece.section ?? null,
        initialStitchCount: piece.initialStitchCount ?? null,
        finalStitchCount: piece.finalStitchCount ?? null,
        shapingPlan: copy(piece.shapingPlan ?? null),
        shapingPlanFingerprint: piece.shapingPlanFingerprint ?? null,
        bindOffMethod: piece.bindOffMethod ?? null,
        bindOffFingerprint: piece.bindOffFingerprint ?? null,
        bindOff: copy(piece.bindOffData ?? null),
        identical: piece.identical !== false,
      },
    };
  }

  function normalizeRequirements(requirements) {
    const value = isRecord(requirements) ? requirements : {};
    const firstLength =
      nonNegativeNumber(value.firstEdgeLength) ??
      nonNegativeNumber(value.edgeLength) ??
      0;
    return {
      operation: text(value.operation) || SUPPORTED_OPERATION,
      mirrored: value.mirrored === true,
      straightEdge: value.straightEdge !== false,
      requiresEase: value.requiresEase === true,
      firstEdgeLength: firstLength,
      secondEdgeLength:
        nonNegativeNumber(value.secondEdgeLength) ?? firstLength,
      constructionType:
        text(value.constructionType) || "simple_flat_piece",
    };
  }

  function repairAsBlocked(progress, code, now) {
    const base = isRecord(progress) ? copy(progress) : {};
    const snapshot = isRecord(base.sourceSnapshot)
      ? base.sourceSnapshot
      : {
          projectId: text(base.projectId) || "unknown",
          damaged: true,
        };
    const repairedChecklist = validChecklist(base.checklist)
      ? base.checklist
      : createChecklist([notice(code, BLOCKER_MESSAGES[code])]);
    const history = validActionHistory(base.actionHistory)
      ? base.actionHistory
      : [
          action("record_created", now, {
            recovered: true,
          }),
        ];
    const repaired = {
      id: text(base.id) || makeId("assembly-recovered"),
      projectId:
        text(base.projectId) || text(snapshot.projectId) || "unknown",
      type: PROGRESS_KIND,
      version: VERSION,
      revision: positiveInteger(base.revision)
        ? base.revision + 1
        : 1,
      status: "blocked",
      sourceSnapshot: copy(snapshot),
      sourceFingerprint: sourceFingerprint(snapshot),
      supportedOperation: null,
      checklist: copy(repairedChecklist).map((item) =>
        item.source === "user"
          ? { ...item, confirmed: false, confirmedAt: null }
          : item,
      ),
      blockers: [notice(code, BLOCKER_MESSAGES[code])],
      warnings: Array.isArray(base.warnings)
        ? base.warnings.filter(validNotice)
        : [],
      actionHistory: [
        ...history,
        action("became_blocked", now, { blockerCodes: [code] }),
      ],
      createdAt: isTimestamp(base.createdAt) ? base.createdAt : now,
      updatedAt: now,
      startedAt: isTimestamp(base.startedAt) ? base.startedAt : now,
      readyAt: null,
    };
    requireValidProgress(repaired);
    return repaired;
  }

  function blockProgress(
    progress,
    code,
    now,
    details = {},
    resetUserChecklist = false,
    blockers = null,
  ) {
    const nextBlockers =
      blockers?.length
        ? copy(blockers)
        : [notice(code, BLOCKER_MESSAGES[code], details)];
    const next = {
      ...copy(progress),
      revision: progress.revision + 1,
      status: "blocked",
      supportedOperation: null,
      checklist: progress.checklist.map((item) =>
        resetUserChecklist && item.source === "user"
          ? { ...copy(item), confirmed: false, confirmedAt: null }
          : copy(item),
      ),
      blockers: nextBlockers,
      updatedAt: now,
      readyAt: null,
      actionHistory: [
        ...copy(progress.actionHistory),
        action("became_blocked", now, {
          blockerCodes: nextBlockers.map((entry) => entry.code),
          ...copy(details),
        }),
      ],
    };
    requireValidProgress(next);
    return next;
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

  function shapingPlan(shaping) {
    if (!isRecord(shaping)) {
      return null;
    }
    const plan = {
      totalRows: shaping.total_rows,
      decreaseEventsCount: shaping.decrease_events_count,
      decreaseRows: copy(shaping.decrease_rows),
      stitchesPerEvent: 2,
      edgeStitchesMode: shaping.edge_stitches_mode,
      knittingMode: shaping.knitting_mode,
    };
    return (
      positiveInteger(plan.totalRows) &&
      nonNegativeInteger(plan.decreaseEventsCount) !== null &&
      Array.isArray(plan.decreaseRows)
    )
      ? plan
      : null;
  }

  function sameOptionalValue(left, right) {
    return (
      left !== null &&
      left !== undefined &&
      right !== null &&
      right !== undefined &&
      stableStringify(left) === stableStringify(right)
    );
  }

  function oneProgress(aggregate, kind, calculationId) {
    const matches = progressMatches(aggregate, kind, calculationId);
    return matches.length === 1 ? matches[0] : null;
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
      BLOCKER_MESSAGES[code] || "Подготовка соединения сейчас недоступна.";
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
      inspection?.code ?? "FIRST_ASSEMBLY_UNAVAILABLE",
      inspection?.message ?? "Подготовка соединения сейчас недоступна.",
    );
  }

  function requireValidProgress(progress) {
    if (!isValidProgress(progress)) {
      throw stateError(
        "FIRST_ASSEMBLY_DATA_DAMAGED",
        "Запись подготовки соединения повреждена.",
      );
    }
  }

  function stateError(code, message, details = {}) {
    return new FirstAssemblyPreparationError(code, message, details);
  }

  function semanticFingerprint(namespace, value) {
    return `${namespace}-v1-${fnv64(stableStringify(value))}`;
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

  function requireTimestamp(value) {
    if (!isTimestamp(value)) {
      throw stateError(
        "FIRST_ASSEMBLY_TIMESTAMP_INVALID",
        "Не удалось сохранить время действия.",
      );
    }
  }

  function isPlaceholder(value) {
    return isRecord(value) && value.version === 0 && value.initialized === false;
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  function nonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  function nonNegativeNumber(value) {
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
      ? value
      : null;
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
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
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
    FIRST_PIECE_KIND,
    SECOND_PIECE_KIND,
    SUPPORTED_OPERATION,
    STATUSES,
    CHECKLIST,
    USER_CHECKLIST_IDS,
    ACTIONS,
    BLOCKER_MESSAGES,
    FirstAssemblyPreparationError,
    buildSourceSnapshot,
    sourceFingerprint,
    evaluateSources,
    createProgress,
    setChecklistItem,
    confirmChecklistItem,
    unconfirmChecklistItem,
    revalidateProgress,
    restoreProgress,
    isValidProgress,
    inspectAggregate,
    ensureForProject,
    loadForProject,
    revalidateForProject,
    confirmForProject,
    unconfirmForProject,
    homeState,
    sourceSummary,
    stableStringify,
  };

  globalObject.YarnAIFirstAssemblyPreparation = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
