"use strict";

(function exposeFirstBindOff(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "FIRST_BIND_OFF";
  const SOURCE_PROGRESS_KIND = "FIRST_SIMPLE_SHAPING";
  const TITLE = "Закрытие петель первой детали";
  const STATUSES = Object.freeze([
    "collecting",
    "ready",
    "in_progress",
    "blocked",
    "completed",
  ]);
  const PREPARATION_CHECKLIST = Object.freeze([
    {
      id: "last_row_completed",
      label: "Последний рабочий ряд завершён.",
      required: true,
    },
    {
      id: "stitches_on_working_needle",
      label: "Все петли находятся на одной рабочей спице.",
      required: true,
    },
    {
      id: "working_yarn_intact",
      label: "Рабочая нить не оборвана.",
      required: true,
    },
    {
      id: "scissors_ready",
      label: "Рядом есть ножницы.",
      required: true,
    },
    {
      id: "unravelling_understood",
      label:
        "Я понимаю, что после полного закрытия вернуть петли без распускания будет сложно.",
      required: true,
    },
  ]);
  const SPECIAL_METHODS = new Set([
    "elastic",
    "stretchy",
    "italian",
    "italian_bind_off",
    "sewn",
    "sewn_bind_off",
    "needle",
    "tubular",
    "rib_1x1",
    "rib_2x2",
    "decorative",
    "circular",
    "round",
    "special",
  ]);

  class FirstBindOffError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FirstBindOffError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = details;
    }
  }

  function createBindOff(source, now = new Date().toISOString()) {
    if (!validSource(source)) {
      throw new FirstBindOffError(
        "FIRST_BIND_OFF_SOURCE_INVALID",
        "Не удалось подтвердить завершённый предыдущий участок.",
      );
    }
    const bindOff = {
      id: `first-bind-off:${source.sectionId}`,
      progress_type: PROGRESS_KIND,
      type: PROGRESS_KIND,
      version: VERSION,
      revision: 1,
      project_id: source.projectId,
      section_id: source.sectionId,
      source_progress_type: SOURCE_PROGRESS_KIND,
      source_progress_revision: source.progressRevision,
      source_calculation_fingerprint: source.calculationFingerprint,
      source_stitch_count: source.stitchCount,
      status: "collecting",
      title: TITLE,
      instruction: instructionSummary(source.stitchCount),
      knitting_mode: source.knittingMode,
      initial_stitch_count: source.stitchCount,
      current_stitch_count: source.stitchCount,
      bound_off_stitch_count: 0,
      target_stitch_count: 0,
      remaining_stitch_count: source.stitchCount,
      completed_actions: [],
      blockers: [],
      warnings: [],
      preparation_checklist: checklistState(),
      stitch_instruction_mode: source.stitchInstructionMode,
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null,
    };
    if (!isValidBindOff(bindOff)) {
      throw new FirstBindOffError(
        "FIRST_BIND_OFF_CREATION_INVALID",
        "Не удалось безопасно подготовить закрытие петель.",
      );
    }
    return bindOff;
  }

  function prepareBindOff(bindOff, readiness, now = bindOff.updated_at) {
    requireValidBindOff(bindOff);
    if (bindOff.status !== "collecting") {
      return copy(bindOff);
    }
    const next = {
      ...copy(bindOff),
      status: readiness.blockers.length ? "blocked" : "ready",
      blockers: copy(readiness.blockers),
      warnings: copy(readiness.warnings),
      updated_at: now,
      revision: bindOff.revision + 1,
    };
    requireValidBindOff(next);
    return next;
  }

  function buildReadiness(input = {}) {
    const blockers = [];
    const warnings = [];
    if (!input.sourcePresent) {
      blockers.push(notice(
        "SOURCE_MISSING",
        "Сначала заверши предыдущий участок первой детали.",
      ));
    } else if (!input.sourceCompleted) {
      blockers.push(notice(
        "SOURCE_NOT_COMPLETED",
        "Предыдущий участок ещё не завершён явно.",
      ));
    }
    if (input.sourceValid === false) {
      blockers.push(notice(
        "SOURCE_DAMAGED",
        "Данные предыдущего участка повреждены. Закрытие петель не начато.",
      ));
    }
    if (input.projectMatches === false) {
      blockers.push(notice(
        "SOURCE_PROJECT_MISMATCH",
        "Предыдущий участок относится к другому проекту.",
      ));
    }
    if (input.sectionMatches === false) {
      blockers.push(notice(
        "SOURCE_SECTION_MISMATCH",
        "Предыдущий участок относится к другой детали.",
      ));
    }
    if (input.fingerprintMatches === false) {
      blockers.push(notice(
        "SOURCE_CALCULATION_MISMATCH",
        "Расчёт проекта изменился после завершения предыдущего участка.",
      ));
    }
    if (input.stitchCountMatches === false) {
      blockers.push(notice(
        "SOURCE_STITCH_COUNT_MISMATCH",
        "Число петель не совпадает с сохранённым результатом предыдущего участка.",
      ));
    }
    if (!positiveInteger(input.stitchCount)) {
      blockers.push(notice(
        "INVALID_SOURCE_STITCH_COUNT",
        "Для закрытия должно оставаться положительное число петель.",
      ));
    }
    if (input.knittingMode === "round") {
      blockers.push(notice(
        "ROUND_BIND_OFF_UNSUPPORTED",
        "Сейчас YarnAI поддерживает закрытие только в полотне, связанном поворотными рядами.",
      ));
    } else if (input.knittingMode !== "flat") {
      blockers.push(notice(
        "INVALID_KNITTING_MODE",
        "Не удалось подтвердить, что деталь связана поворотными рядами.",
      ));
    }
    if (input.partial) {
      blockers.push(notice(
        "PARTIAL_BIND_OFF_UNSUPPORTED",
        "Этой детали требуется частичное закрытие. Обычное полное закрытие здесь не подходит.",
      ));
    }
    if (input.stepped || input.multipleRows) {
      blockers.push(notice(
        "STEPPED_BIND_OFF_UNSUPPORTED",
        "Этой детали требуется ступенчатое закрытие в нескольких рядах.",
      ));
    }
    if (input.specialMethod) {
      blockers.push(notice(
        "SPECIAL_BIND_OFF_UNSUPPORTED",
        "Проект требует специального способа закрытия, который этот этап пока не поддерживает.",
      ));
    }
    if (input.complexTechnique) {
      blockers.push(notice(
        "COMPLEX_BIND_OFF_UNSUPPORTED",
        "В проекте указана сложная техника закрытия. YarnAI не заменяет её обычным способом.",
      ));
    }
    if (!blockers.length && !input.methodKnown) {
      warnings.push(notice(
        "ORDINARY_BIND_OFF_ONLY",
        "Инструкция ниже относится только к обычному последовательному закрытию всех петель.",
      ));
    }
    return { blockers: uniqueNotices(blockers), warnings };
  }

  function startBindOff(
    bindOff,
    confirmedChecklistIds,
    now = new Date().toISOString(),
  ) {
    requireValidBindOff(bindOff);
    if (bindOff.status === "in_progress") {
      return copy(bindOff);
    }
    if (bindOff.status === "completed") {
      throw stateError("FIRST_BIND_OFF_COMPLETED", "Первая деталь уже завершена.");
    }
    if (bindOff.status === "blocked") {
      throw stateError(
        "FIRST_BIND_OFF_BLOCKED",
        "Сначала устрани причину блокировки закрытия петель.",
      );
    }
    if (bindOff.status !== "ready") {
      throw stateError(
        "FIRST_BIND_OFF_NOT_READY",
        "Закрытие петель ещё не готово к началу.",
      );
    }
    const confirmed = new Set(
      Array.isArray(confirmedChecklistIds) ? confirmedChecklistIds : [],
    );
    const missing = bindOff.preparation_checklist.filter(
      (item) => item.required && !confirmed.has(item.id),
    );
    if (missing.length) {
      throw new FirstBindOffError(
        "PREPARATION_CHECKLIST_INCOMPLETE",
        "Подтверди все пункты подготовки перед началом.",
        { missing: missing.map((item) => item.id) },
      );
    }
    const next = {
      ...copy(bindOff),
      status: "in_progress",
      preparation_checklist: bindOff.preparation_checklist.map((item) => ({
        ...item,
        confirmed: confirmed.has(item.id),
        confirmed_at: confirmed.has(item.id) ? now : null,
      })),
      started_at: bindOff.started_at ?? now,
      updated_at: now,
      revision: bindOff.revision + 1,
    };
    requireValidBindOff(next);
    return next;
  }

  function addBoundOffStitches(
    bindOff,
    amount,
    actionId,
    now = new Date().toISOString(),
  ) {
    requireValidBindOff(bindOff);
    requireMutable(bindOff);
    const normalizedAmount =
      typeof amount === "number" ? amount : Number(amount);
    if (!positiveInteger(normalizedAmount)) {
      throw new FirstBindOffError(
        "INVALID_BIND_OFF_AMOUNT",
        "Укажи положительное целое число закрытых петель.",
      );
    }
    if (normalizedAmount > bindOff.current_stitch_count) {
      throw new FirstBindOffError(
        "BIND_OFF_AMOUNT_EXCEEDS_REMAINING",
        "Нельзя закрыть больше петель, чем осталось на спице.",
      );
    }
    const id = text(actionId);
    if (!id) {
      throw new FirstBindOffError(
        "BIND_OFF_ACTION_ID_MISSING",
        "Не удалось безопасно сохранить действие. Попробуй ещё раз.",
      );
    }
    if (bindOff.completed_actions.some((action) => action.action_id === id)) {
      return copy(bindOff);
    }
    const before = bindOff.current_stitch_count;
    const action = {
      action_id: id,
      amount: normalizedAmount,
      stitch_count_before: before,
      stitch_count_after: before - normalizedAmount,
      created_at: now,
    };
    const next = derive({
      ...copy(bindOff),
      current_stitch_count: action.stitch_count_after,
      completed_actions: [...copy(bindOff.completed_actions), action],
      updated_at: now,
      revision: bindOff.revision + 1,
    });
    requireValidBindOff(next);
    return next;
  }

  function undoLastAction(bindOff, now = new Date().toISOString()) {
    requireValidBindOff(bindOff);
    requireMutable(bindOff);
    if (!bindOff.completed_actions.length) {
      throw new FirstBindOffError(
        "NO_BIND_OFF_ACTION_TO_UNDO",
        "Пока нет действия, которое можно исправить.",
      );
    }
    const actions = copy(bindOff.completed_actions);
    const last = actions.pop();
    const next = derive({
      ...copy(bindOff),
      current_stitch_count: bindOff.current_stitch_count + last.amount,
      completed_actions: actions,
      updated_at: now,
      revision: bindOff.revision + 1,
    });
    requireValidBindOff(next);
    return next;
  }

  function canComplete(bindOff) {
    return (
      isValidBindOff(bindOff) &&
      bindOff.status === "in_progress" &&
      bindOff.current_stitch_count === 0
    );
  }

  function completeBindOff(
    bindOff,
    explicitlyConfirmed,
    now = new Date().toISOString(),
  ) {
    requireValidBindOff(bindOff);
    if (bindOff.status === "completed") {
      return copy(bindOff);
    }
    if (!explicitlyConfirmed) {
      throw new FirstBindOffError(
        "BIND_OFF_COMPLETION_NOT_CONFIRMED",
        "Подтверди, что все петли закрыты и последняя петля закреплена.",
      );
    }
    if (!canComplete(bindOff)) {
      throw new FirstBindOffError(
        "BIND_OFF_STITCHES_REMAIN",
        "Завершить деталь можно только после закрытия всех оставшихся петель.",
      );
    }
    const next = {
      ...copy(bindOff),
      status: "completed",
      current_stitch_count: 0,
      remaining_stitch_count: 0,
      completed_at: bindOff.completed_at ?? now,
      updated_at: now,
      revision: bindOff.revision + 1,
    };
    requireValidBindOff(next);
    return next;
  }

  function instructionsFor(bindOff) {
    requireValidBindOff(bindOff);
    if (bindOff.initial_stitch_count === 1) {
      return [
        "Обрежь нить, оставив хвост для закрепления.",
        "Протяни хвост через последнюю петлю и аккуратно затяни.",
      ];
    }
    const workStitches =
      bindOff.stitch_instruction_mode === "as_presented"
        ? "Провяжи первые две петли по рисунку."
        : "Провяжи первые две петли так же, как они выглядят в последнем ряду.";
    return [
      workStitches,
      "Левой спицей подними первую из провязанных петель.",
      "Протяни её поверх второй петли.",
      "Провяжи следующую петлю.",
      "Снова протяни предыдущую петлю поверх новой.",
      `Продолжай, пока из ${bindOff.initial_stitch_count} петель на спице не останется одна.`,
      "Обрежь нить, оставив хвост для закрепления.",
      "Протяни хвост через последнюю петлю и затяни.",
    ];
  }

  function serializeBindOff(bindOff) {
    requireValidBindOff(bindOff);
    return JSON.stringify(bindOff);
  }

  function restoreBindOff(serialized) {
    let value;
    try {
      value = typeof serialized === "string" ? JSON.parse(serialized) : copy(serialized);
    } catch (error) {
      throw new FirstBindOffError(
        "FIRST_BIND_OFF_RESTORE_FAILED",
        "Сохранённые данные закрытия петель повреждены.",
        { cause: error?.message },
      );
    }
    requireValidBindOff(value);
    return value;
  }

  function isValidBindOff(value) {
    if (
      !isRecord(value) ||
      value.progress_type !== PROGRESS_KIND ||
      value.type !== PROGRESS_KIND ||
      value.version !== VERSION ||
      !text(value.id) ||
      !text(value.project_id) ||
      !text(value.section_id) ||
      value.source_progress_type !== SOURCE_PROGRESS_KIND ||
      !positiveInteger(value.source_progress_revision) ||
      !text(value.source_calculation_fingerprint) ||
      !positiveInteger(value.source_stitch_count) ||
      !STATUSES.includes(value.status) ||
      value.title !== TITLE ||
      typeof value.instruction !== "string" ||
      !["flat", "round"].includes(value.knitting_mode) ||
      !positiveInteger(value.initial_stitch_count) ||
      value.source_stitch_count !== value.initial_stitch_count ||
      value.target_stitch_count !== 0 ||
      !Number.isSafeInteger(value.current_stitch_count) ||
      value.current_stitch_count < 0 ||
      value.current_stitch_count > value.initial_stitch_count ||
      value.bound_off_stitch_count !==
        value.initial_stitch_count - value.current_stitch_count ||
      value.remaining_stitch_count !== value.current_stitch_count ||
      !positiveInteger(value.revision) ||
      !Array.isArray(value.completed_actions) ||
      !Array.isArray(value.blockers) ||
      !Array.isArray(value.warnings) ||
      !Array.isArray(value.preparation_checklist) ||
      !["as_presented", "match_last_row"].includes(
        value.stitch_instruction_mode,
      ) ||
      !isTimestamp(value.created_at) ||
      !isTimestamp(value.updated_at) ||
      !nullableTimestamp(value.started_at) ||
      !nullableTimestamp(value.completed_at)
    ) {
      return false;
    }
    if (
      !value.blockers.every(validNotice) ||
      !value.warnings.every(validNotice) ||
      !validChecklist(value.preparation_checklist) ||
      !validActionHistory(value)
    ) {
      return false;
    }
    if (value.status === "collecting" || value.status === "ready") {
      return (
        value.current_stitch_count === value.initial_stitch_count &&
        value.completed_actions.length === 0 &&
        value.started_at === null &&
        value.completed_at === null &&
        value.preparation_checklist.every((item) => !item.confirmed)
      );
    }
    if (value.status === "blocked") {
      return (
        value.blockers.length > 0 &&
        value.current_stitch_count === value.initial_stitch_count &&
        value.completed_actions.length === 0 &&
        value.started_at === null &&
        value.completed_at === null
      );
    }
    if (value.knitting_mode !== "flat") {
      return false;
    }
    if (!isTimestamp(value.started_at)) {
      return false;
    }
    if (value.status === "in_progress") {
      return value.completed_at === null;
    }
    return (
      value.status === "completed" &&
      value.current_stitch_count === 0 &&
      value.remaining_stitch_count === 0 &&
      value.bound_off_stitch_count === value.initial_stitch_count &&
      isTimestamp(value.completed_at)
    );
  }

  function inspectAggregate(aggregate) {
    let source;
    try {
      source = sourceFromAggregate(aggregate);
    } catch (error) {
      return {
        state: "blocked",
        code: error?.code ?? "FIRST_BIND_OFF_SOURCE_INVALID",
        message:
          error?.userMessage ||
          "Не удалось подтвердить завершённый предыдущий участок.",
        blockers: [
          notice(
            error?.code ?? "FIRST_BIND_OFF_SOURCE_INVALID",
            error?.userMessage ||
              "Не удалось подтвердить завершённый предыдущий участок.",
          ),
        ],
      };
    }
    const matches = (Array.isArray(aggregate?.progress)
      ? aggregate.progress
      : []
    ).filter(
      (entry) =>
        entry?.kind === PROGRESS_KIND &&
        entry?.calculation_id === source.calculationId &&
        entry?.epoch === 1,
    );
    if (!matches.length) {
      return { state: "missing", source };
    }
    if (matches.length > 1) {
      return blockedInspection(
        source,
        "DUPLICATE_BIND_OFF_PROGRESS",
        "Найдено несколько записей закрытия петель. Продолжение заблокировано.",
      );
    }
    const progress = matches[0];
    const bindOff = progress.state;
    if (isPlaceholder(bindOff)) {
      return { state: "missing", reason: "uninitialized", source, progress };
    }
    if (!isValidBindOff(bindOff)) {
      return blockedInspection(
        source,
        "FIRST_BIND_OFF_DATA_DAMAGED",
        "Сохранённые данные закрытия петель повреждены. Они не были сброшены.",
        progress,
        bindOff,
      );
    }
    const mismatch = sourceMismatch(source, progress, bindOff);
    if (mismatch) {
      return blockedInspection(
        source,
        mismatch.code,
        mismatch.message,
        progress,
        bindOff,
      );
    }
    return {
      state: "ready",
      source,
      progress: copy(progress),
      bindOff: copy(bindOff),
    };
  }

  async function ensureForProject(repository, projectId) {
    let aggregate = await repository.getProject(projectId);
    let inspection = inspectAggregate(aggregate);
    if (inspection.state === "ready") {
      return inspection;
    }
    if (inspection.state === "blocked") {
      throw errorFromInspection(inspection);
    }
    if (inspection.state === "missing" && !inspection.reason) {
      await repository.ensureCalculationProgress(
        projectId,
        inspection.source.calculationId,
        PROGRESS_KIND,
        { version: 0, initialized: false },
        { operationKind: "FIRST_BIND_OFF_PROGRESS_CREATED" },
      );
      aggregate = await repository.getProject(projectId);
      inspection = inspectAggregate(aggregate);
    }
    if (inspection.state !== "missing" || inspection.reason !== "uninitialized") {
      throw errorFromInspection(inspection);
    }
    const timestamp = new Date().toISOString();
    const collecting = createBindOff(inspection.source, timestamp);
    const ready = prepareBindOff(
      collecting,
      buildReadiness(inspection.source.readinessInput),
      timestamp,
    );
    await repository.updateCalculationProgress(
      projectId,
      inspection.source.calculationId,
      PROGRESS_KIND,
      ready,
      {
        baseProgressRevision: inspection.progress.revision,
        operationKind: "FIRST_BIND_OFF_CREATED",
        projectStage: stageForStatus(ready.status),
        timestamp,
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

  async function startForProject(repository, projectId, checklistIds) {
    const inspection = await loadForProject(repository, projectId);
    const next = startBindOff(inspection.bindOff, checklistIds);
    if (next.revision === inspection.bindOff.revision) {
      return inspection;
    }
    return saveAndLoad(repository, inspection, next, {
      operationKind: "FIRST_BIND_OFF_STARTED",
      projectStage: "first_bind_off_in_progress",
    });
  }

  async function addForProject(
    repository,
    projectId,
    amount,
    actionId = makeActionId(),
  ) {
    const inspection = await loadForProject(repository, projectId);
    const next = addBoundOffStitches(
      inspection.bindOff,
      amount,
      actionId,
    );
    if (next.revision === inspection.bindOff.revision) {
      return inspection;
    }
    return saveAndLoad(repository, inspection, next, {
      operationKind: "FIRST_BIND_OFF_STITCHES_RECORDED",
      projectStage: "first_bind_off_in_progress",
    });
  }

  async function undoForProject(repository, projectId) {
    const inspection = await loadForProject(repository, projectId);
    return saveAndLoad(
      repository,
      inspection,
      undoLastAction(inspection.bindOff),
      {
        operationKind: "FIRST_BIND_OFF_LAST_ACTION_CORRECTED",
        projectStage: "first_bind_off_in_progress",
      },
    );
  }

  async function completeForProject(
    repository,
    projectId,
    explicitlyConfirmed,
  ) {
    const inspection = await loadForProject(repository, projectId);
    const next = completeBindOff(
      inspection.bindOff,
      explicitlyConfirmed,
    );
    if (next.revision === inspection.bindOff.revision) {
      return inspection;
    }
    return saveAndLoad(repository, inspection, next, {
      operationKind: "FIRST_BIND_OFF_COMPLETED",
      projectStage: "first_piece_completed",
    });
  }

  async function reportUnsupportedForProject(
    repository,
    projectId,
    requirement,
  ) {
    const definitions = {
      partial: notice(
        "PARTIAL_BIND_OFF_UNSUPPORTED",
        "Этой детали требуется частичное закрытие. Обычное полное закрытие здесь не подходит.",
      ),
      stepped: notice(
        "STEPPED_BIND_OFF_UNSUPPORTED",
        "Этой детали требуется ступенчатое закрытие в нескольких рядах.",
      ),
      special: notice(
        "SPECIAL_BIND_OFF_UNSUPPORTED",
        "Проект требует специального способа закрытия, который этот этап пока не поддерживает.",
      ),
    };
    const blocker = definitions[requirement];
    if (!blocker) {
      throw new FirstBindOffError(
        "UNKNOWN_BIND_OFF_REQUIREMENT",
        "Не удалось распознать требуемый способ закрытия.",
      );
    }
    const inspection = await loadForProject(repository, projectId);
    if (inspection.bindOff.status === "blocked") {
      return inspection;
    }
    if (inspection.bindOff.status !== "ready") {
      throw new FirstBindOffError(
        "BIND_OFF_REQUIREMENT_LOCKED",
        "Способ закрытия нельзя менять после начала работы.",
      );
    }
    const timestamp = new Date().toISOString();
    const next = {
      ...copy(inspection.bindOff),
      status: "blocked",
      blockers: [blocker],
      updated_at: timestamp,
      revision: inspection.bindOff.revision + 1,
    };
    requireValidBindOff(next);
    return saveAndLoad(repository, inspection, next, {
      operationKind: "FIRST_BIND_OFF_UNSUPPORTED_REQUIREMENT_REPORTED",
      projectStage: "first_bind_off_blocked",
      projectDraftInput: draftWithRequirement(
        inspection.source.draftInput,
        requirement,
        inspection.source,
      ),
    });
  }

  function homeState(inspection, projectId) {
    if (!inspection || !["ready", "blocked"].includes(inspection.state)) {
      return null;
    }
    const href = `/bind-off-assistant?project=${encodeURIComponent(projectId)}`;
    if (inspection.state === "blocked") {
      return {
        href,
        label: "Проверить закрытие петель",
        stage: "Закрытие петель заблокировано",
        summary: inspection.message,
      };
    }
    const bindOff = inspection.bindOff;
    const states = {
      collecting: ["Подготовить закрытие", "Закрытие петель подготавливается"],
      ready: [
        "Начать закрытие петель",
        `Предстоит закрыть ${bindOff.initial_stitch_count} петель`,
      ],
      in_progress: [
        "Продолжить закрытие",
        `${bindOff.bound_off_stitch_count} закрыто · ${bindOff.remaining_stitch_count} осталось`,
      ],
      blocked: ["Проверить закрытие", bindOff.blockers[0]?.message],
      completed: [
        "Открыть завершённую деталь",
        `Первая деталь завершена · закрыто ${bindOff.bound_off_stitch_count} петель`,
      ],
    };
    const [label, summary] = states[bindOff.status];
    return {
      href,
      label,
      summary,
      stage:
        bindOff.status === "completed"
          ? "Первая деталь завершена"
          : bindOff.status === "in_progress"
            ? "Закрытие петель в работе"
            : bindOff.status === "blocked"
              ? "Закрытие петель заблокировано"
              : "Закрытие петель готово",
    };
  }

  function sourceFromAggregate(aggregate) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      throw sourceError("INVALID_PROJECT", "Запись проекта повреждена.");
    }
    const calculation = (Array.isArray(aggregate?.calculations)
      ? aggregate.calculations
      : []
    ).find(
      (entry) => entry?.calculation_id === project.active_calculation_id,
    );
    if (!isRecord(calculation) || !text(calculation.fingerprint)) {
      throw sourceError(
        "SOURCE_CALCULATION_MISSING",
        "В проекте нет актуального сохранённого расчёта.",
      );
    }
    const candidates = (Array.isArray(aggregate?.progress)
      ? aggregate.progress
      : []
    ).filter(
      (entry) =>
        entry?.kind === SOURCE_PROGRESS_KIND &&
        entry?.calculation_id === calculation.calculation_id &&
        entry?.epoch === 1,
    );
    if (!candidates.length) {
      throw sourceError(
        "SOURCE_MISSING",
        "Сначала заверши простое формирование первой детали.",
      );
    }
    if (candidates.length !== 1) {
      throw sourceError(
        "SOURCE_DAMAGED",
        "Не удалось однозначно определить завершённый предыдущий участок.",
      );
    }
    const sourceProgress = candidates[0];
    const shaping = sourceProgress.state;
    const shapingApi = globalObject.YarnAIFirstSimpleShaping;
    if (
      !shapingApi?.isValidShaping?.(shaping) ||
      shaping.status !== "completed"
    ) {
      throw sourceError(
        shaping?.status && shaping.status !== "completed"
          ? "SOURCE_NOT_COMPLETED"
          : "SOURCE_DAMAGED",
        shaping?.status && shaping.status !== "completed"
          ? "Сначала явно заверши простое формирование первой детали."
          : "Данные завершённого формирования повреждены.",
      );
    }
    const shapingInspection = shapingApi.inspectAggregate?.(aggregate);
    if (
      shapingInspection?.state !== "ready" ||
      shapingInspection.shaping?.status !== "completed"
    ) {
      throw sourceError(
        shapingInspection?.code ?? "SOURCE_DAMAGED",
        shapingInspection?.message ||
          "Не удалось подтвердить завершённый предыдущий участок.",
      );
    }
    const projectIntent = projectIntentFrom(project, calculation);
    const bindOffIntent = bindOffIntentFrom(projectIntent);
    const expectedCount = integerOrNull(
      bindOffIntent.expected_stitch_count ??
        bindOffIntent.source_stitch_count ??
        bindOffIntent.stitch_count,
    );
    const requestedTarget = integerOrNull(
      bindOffIntent.target_stitch_count ?? bindOffIntent.remaining_stitch_count,
    );
    const method = normalizedMethod(bindOffIntent);
    const stitchCount = shaping.current_stitch_count;
    const source = {
      projectId: project.project_id,
      projectTitle: project.title,
      calculationId: calculation.calculation_id,
      calculationFingerprint: calculation.fingerprint,
      sectionId: shaping.source_section_id,
      progressRevision: sourceProgress.revision,
      stitchCount,
      knittingMode: shaping.knitting_mode,
      stitchInstructionMode:
        bindOffIntent.work_as_presented === true ||
        bindOffIntent.by_pattern === true
          ? "as_presented"
          : "match_last_row",
      draftInput: copy(project.draft_input),
      readinessInput: {
        sourcePresent: true,
        sourceCompleted: shaping.status === "completed",
        sourceValid: true,
        projectMatches:
          shaping.project_id === project.project_id &&
          sourceProgress.project_id === project.project_id,
        sectionMatches:
          !text(bindOffIntent.source_section_id) ||
          bindOffIntent.source_section_id === shaping.source_section_id,
        fingerprintMatches:
          shaping.source_calculation_fingerprint === calculation.fingerprint &&
          (!text(bindOffIntent.source_calculation_fingerprint) ||
            bindOffIntent.source_calculation_fingerprint ===
              calculation.fingerprint),
        stitchCountMatches:
          shaping.current_stitch_count === shaping.target_stitch_count &&
          (expectedCount === null || expectedCount === stitchCount),
        stitchCount,
        knittingMode: shaping.knitting_mode,
        partial:
          bindOffIntent.partial === true ||
          bindOffIntent.bind_off_all === false ||
          (requestedTarget !== null && requestedTarget !== 0) ||
          ["partial", "neckline", "armhole"].includes(method),
        stepped:
          bindOffIntent.stepped === true ||
          bindOffIntent.step_bind_off === true ||
          ["stepped", "stair_step"].includes(method),
        multipleRows:
          bindOffIntent.multiple_rows === true ||
          (positiveInteger(bindOffIntent.row_count) ?? 0) > 1,
        specialMethod: SPECIAL_METHODS.has(method),
        complexTechnique:
          bindOffIntent.complex === true ||
          bindOffIntent.complex_technique === true ||
          ["neckline", "armhole"].includes(method),
        methodKnown: Boolean(method) || bindOffIntent.ordinary === true,
      },
    };
    if (!validSource(source)) {
      throw sourceError(
        "SOURCE_DAMAGED",
        "Данные завершённого формирования повреждены.",
      );
    }
    return source;
  }

  function sourceMismatch(source, progress, bindOff) {
    if (
      progress.project_id !== source.projectId ||
      bindOff.project_id !== source.projectId
    ) {
      return notice(
        "SOURCE_PROJECT_MISMATCH",
        "Закрытие петель относится к другому проекту.",
      );
    }
    if (bindOff.section_id !== source.sectionId) {
      return notice(
        "SOURCE_SECTION_MISMATCH",
        "Закрытие петель относится к другой детали.",
      );
    }
    if (
      bindOff.source_calculation_fingerprint !==
      source.calculationFingerprint
    ) {
      return notice(
        "SOURCE_CALCULATION_MISMATCH",
        "Расчёт проекта изменился после подготовки закрытия петель.",
      );
    }
    if (bindOff.source_progress_revision !== source.progressRevision) {
      return notice(
        "SOURCE_PROGRESS_REVISION_MISMATCH",
        "Предыдущий участок изменился после подготовки закрытия петель.",
      );
    }
    if (
      bindOff.source_stitch_count !== source.stitchCount ||
      bindOff.initial_stitch_count !== source.stitchCount
    ) {
      return notice(
        "SOURCE_STITCH_COUNT_MISMATCH",
        "Число петель предыдущего участка не совпадает с сохранённым закрытием.",
      );
    }
    return null;
  }

  async function saveAndLoad(repository, inspection, bindOff, options) {
    const timestamp = bindOff.updated_at;
    await repository.updateCalculationProgress(
      inspection.source.projectId,
      inspection.source.calculationId,
      PROGRESS_KIND,
      bindOff,
      {
        baseProgressRevision: inspection.progress.revision,
        timestamp,
        ...options,
      },
    );
    return loadForProject(repository, inspection.source.projectId);
  }

  function derive(bindOff) {
    return {
      ...bindOff,
      bound_off_stitch_count:
        bindOff.initial_stitch_count - bindOff.current_stitch_count,
      remaining_stitch_count: bindOff.current_stitch_count,
    };
  }

  function validActionHistory(bindOff) {
    let expected = bindOff.initial_stitch_count;
    const ids = new Set();
    for (const action of bindOff.completed_actions) {
      if (
        !isRecord(action) ||
        !text(action.action_id) ||
        ids.has(action.action_id) ||
        !positiveInteger(action.amount) ||
        action.stitch_count_before !== expected ||
        action.stitch_count_after !== expected - action.amount ||
        action.stitch_count_after < 0 ||
        !isTimestamp(action.created_at)
      ) {
        return false;
      }
      ids.add(action.action_id);
      expected = action.stitch_count_after;
    }
    return expected === bindOff.current_stitch_count;
  }

  function validChecklist(checklist) {
    if (checklist.length !== PREPARATION_CHECKLIST.length) {
      return false;
    }
    return checklist.every((item, index) => {
      const expected = PREPARATION_CHECKLIST[index];
      return (
        isRecord(item) &&
        item.id === expected.id &&
        item.label === expected.label &&
        item.required === expected.required &&
        typeof item.confirmed === "boolean" &&
        nullableTimestamp(item.confirmed_at) &&
        item.confirmed === Boolean(item.confirmed_at)
      );
    });
  }

  function checklistState() {
    return PREPARATION_CHECKLIST.map((item) => ({
      ...item,
      confirmed: false,
      confirmed_at: null,
    }));
  }

  function instructionSummary(count) {
    return count === 1
      ? "Закрепи последнюю оставшуюся петлю и сохрани результат."
      : `Последовательно закрой все ${count} петель обычным способом.`;
  }

  function requireMutable(bindOff) {
    if (bindOff.status === "completed") {
      throw stateError(
        "FIRST_BIND_OFF_COMPLETED",
        "Завершённую деталь нельзя изменить обычным действием.",
      );
    }
    if (bindOff.status === "blocked") {
      throw stateError(
        "FIRST_BIND_OFF_BLOCKED",
        "Закрытие петель заблокировано.",
      );
    }
    if (bindOff.status !== "in_progress") {
      throw stateError(
        "FIRST_BIND_OFF_NOT_IN_PROGRESS",
        "Сначала подтверди подготовку и начни закрытие петель.",
      );
    }
  }

  function requireValidBindOff(bindOff) {
    if (!isValidBindOff(bindOff)) {
      throw new FirstBindOffError(
        "FIRST_BIND_OFF_INVALID",
        "Сохранённые данные закрытия петель повреждены.",
      );
    }
  }

  function validSource(source) {
    return (
      isRecord(source) &&
      Boolean(text(source.projectId)) &&
      Boolean(text(source.calculationId)) &&
      Boolean(text(source.calculationFingerprint)) &&
      Boolean(text(source.sectionId)) &&
      positiveInteger(source.progressRevision) &&
      positiveInteger(source.stitchCount) &&
      ["flat", "round"].includes(source.knittingMode) &&
      ["as_presented", "match_last_row"].includes(
        source.stitchInstructionMode,
      ) &&
      isRecord(source.readinessInput)
    );
  }

  function projectIntentFrom(project, calculation) {
    const draft = isRecord(project.draft_input) ? project.draft_input : {};
    const request = isRecord(calculation.request) ? calculation.request : {};
    return isRecord(draft.project_intent)
      ? draft.project_intent
      : isRecord(request.project_intent)
        ? request.project_intent
        : {};
  }

  function bindOffIntentFrom(intent) {
    if (isRecord(intent.first_bind_off)) {
      return intent.first_bind_off;
    }
    if (isRecord(intent.firstBindOff)) {
      return intent.firstBindOff;
    }
    return isRecord(intent.bind_off) ? intent.bind_off : {};
  }

  function draftWithRequirement(draftInput, requirement, source) {
    const draft = isRecord(draftInput) ? copy(draftInput) : {};
    const intent = isRecord(draft.project_intent)
      ? copy(draft.project_intent)
      : {};
    intent.first_bind_off = {
      source_project_id: source.projectId,
      source_section_id: source.sectionId,
      source_calculation_fingerprint: source.calculationFingerprint,
      source_stitch_count: source.stitchCount,
      bind_off_all: requirement !== "partial",
      partial: requirement === "partial",
      stepped: requirement === "stepped",
      method: requirement === "special" ? "special" : requirement,
    };
    draft.project_intent = intent;
    return draft;
  }

  function normalizedMethod(intent) {
    return text(
      intent.method ??
        intent.technique ??
        intent.bind_off_method ??
        intent.type,
    ).toLowerCase();
  }

  function blockedInspection(
    source,
    code,
    message,
    progress = null,
    bindOff = null,
  ) {
    return {
      state: "blocked",
      source,
      progress: progress ? copy(progress) : null,
      bindOff: bindOff ? copy(bindOff) : null,
      code,
      message,
      blockers: [notice(code, message)],
    };
  }

  function errorFromInspection(inspection) {
    return new FirstBindOffError(
      inspection?.code ?? "FIRST_BIND_OFF_UNAVAILABLE",
      inspection?.message || "Закрытие петель сейчас недоступно.",
      inspection?.code ? { reason: inspection.code } : {},
    );
  }

  function sourceError(code, message) {
    return new FirstBindOffError(code, message);
  }

  function stateError(code, message) {
    return new FirstBindOffError(code, message);
  }

  function notice(code, message) {
    return { code, message };
  }

  function uniqueNotices(notices) {
    const seen = new Set();
    return notices.filter((entry) => {
      if (seen.has(entry.code)) {
        return false;
      }
      seen.add(entry.code);
      return true;
    });
  }

  function validNotice(value) {
    return (
      isRecord(value) &&
      Boolean(text(value.code)) &&
      Boolean(text(value.message))
    );
  }

  function makeActionId() {
    const projectSystem = globalObject.YarnAIProjectSystem;
    if (projectSystem?.uuidv7) {
      return projectSystem.uuidv7();
    }
    if (globalObject.crypto?.randomUUID) {
      return globalObject.crypto.randomUUID();
    }
    return `bind-off-action:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  }

  function stageForStatus(status) {
    return status === "completed"
      ? "first_piece_completed"
      : `first_bind_off_${status}`;
  }

  function isPlaceholder(value) {
    return isRecord(value) && value.version === 0 && value.initialized === false;
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  function integerOrNull(value) {
    const normalized =
      typeof value === "number" ? value : value === undefined ? NaN : Number(value);
    return Number.isSafeInteger(normalized) ? normalized : null;
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

  function copy(value) {
    return value === undefined
      ? undefined
      : JSON.parse(JSON.stringify(value));
  }

  const api = {
    VERSION,
    PROGRESS_KIND,
    SOURCE_PROGRESS_KIND,
    TITLE,
    STATUSES,
    PREPARATION_CHECKLIST,
    FirstBindOffError,
    createBindOff,
    prepareBindOff,
    buildReadiness,
    startBindOff,
    addBoundOffStitches,
    undoLastAction,
    canComplete,
    completeBindOff,
    instructionsFor,
    serializeBindOff,
    restoreBindOff,
    isValidBindOff,
    inspectAggregate,
    ensureForProject,
    loadForProject,
    startForProject,
    addForProject,
    undoForProject,
    completeForProject,
    reportUnsupportedForProject,
    homeState,
    sourceFromAggregate,
    stageForStatus,
    makeActionId,
  };

  globalObject.YarnAIFirstBindOff = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
