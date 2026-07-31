"use strict";

(function exposeFirstBlocking(globalObject) {
  const VERSION = 1;
  const PROGRESS_KIND = "FIRST_BLOCKING";
  const TAIL_KIND = "FIRST_TAIL_SECURING";
  const STATUSES = Object.freeze([
    "collecting",
    "ready",
    "in_progress",
    "drying",
    "needs_correction",
    "blocked",
    "completed",
  ]);
  const FIBER_TYPES = Object.freeze([
    "wool",
    "superwash_wool",
    "alpaca",
    "cotton",
    "linen",
    "acrylic",
    "silk",
    "blend",
    "unknown",
  ]);
  const BLOCKING_METHODS = Object.freeze([
    "wet_blocking",
    "spray_blocking",
    "steam_blocking",
    "gentle_shaping",
    "unknown",
  ]);
  const MEASUREMENT_KEYS = Object.freeze([
    "width",
    "length",
    "sleeveLength",
    "chestWidth",
    "hemWidth",
    "customMeasurements",
  ]);
  const RESULT_CODES = Object.freeze([
    "all_good",
    "slight_size_difference",
    "stretched",
    "curling_edges",
    "skewed",
    "other",
  ]);
  const LAYOUT_CONFIRMATIONS = Object.freeze([
    "flatSurface",
    "sidesAligned",
    "seamsStraight",
    "measurementsChecked",
    "notOverstretched",
    "pinsOnlyIfNeeded",
  ]);
  const DRY_CONFIRMATIONS = Object.freeze([
    "fullyDry",
    "measurementsChecked",
    "shapeAccepted",
    "seamsCorrect",
    "notDeformed",
  ]);

  class FirstBlockingError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FirstBlockingError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function recommendMethod(fiberType, care = {}) {
    if (!FIBER_TYPES.includes(fiberType)) {
      return {
        method: "unknown",
        reason: "Сначала укажите состав пряжи.",
        requiresConfirmation: false,
      };
    }
    if (care.method && BLOCKING_METHODS.includes(care.method)) {
      return {
        method: care.method,
        reason: "Используем способ, прямо указанный в инструкции по уходу.",
        requiresConfirmation: false,
      };
    }
    const recommendations = {
      wool: [
        "wet_blocking",
        "Мягкая влажная блокировка помогает шерсти принять форму без трения и перепада температуры.",
      ],
      superwash_wool: [
        "wet_blocking",
        "Superwash-шерсть можно блокировать влажным способом, особенно внимательно контролируя растяжение.",
      ],
      alpaca: [
        "wet_blocking",
        "Альпаку безопаснее мягко намочить и сушить горизонтально без трения.",
      ],
      cotton: [
        "wet_blocking",
        "Хлопок допускает влажную блокировку, но мокрое изделие нужно поддерживать целиком.",
      ],
      linen: [
        "wet_blocking",
        "Лён допускает влажную блокировку и должен сушиться разложенным по размерам.",
      ],
      acrylic: [
        "gentle_shaping",
        "Для акрила выбран консервативный способ без прямого горячего пара.",
      ],
      silk: [
        "gentle_shaping",
        "Для шёлка безопаснее щадящее формование с опорой на этикетку.",
      ],
      blend: [
        "gentle_shaping",
        "Для смеси без полной инструкции выбран щадящий способ по самому чувствительному волокну.",
      ],
      unknown: [
        "gentle_shaping",
        "Состав неизвестен, поэтому выбран осторожный способ без агрессивного нагрева.",
      ],
    };
    const [method, reason] = recommendations[fiberType];
    return {
      method,
      reason,
      requiresConfirmation: fiberType === "unknown" || fiberType === "blend",
    };
  }

  function determineWarnings(fiberType, method, careLabelKnown) {
    const warnings = [];
    const add = (code, message) => warnings.push({ code, message });
    if (fiberType === "unknown") {
      add(
        "FIBER_UNKNOWN",
        "Состав неизвестен. Проверьте этикетку; горячий пар и агрессивный нагрев запрещены.",
      );
    }
    if (careLabelKnown === false) {
      add(
        "CARE_LABEL_MISSING",
        "Инструкция по уходу недоступна. Используйте только консервативный способ.",
      );
    }
    if (fiberType === "wool" || fiberType === "alpaca") {
      add(
        "FELTING_RISK",
        "Не трите, не выкручивайте и не меняйте резко температуру воды: полотно может сваляться.",
      );
    }
    if (fiberType === "superwash_wool") {
      add(
        "SUPERWASH_STRETCH",
        "Superwash-полотно может растянуться. Переносите его с полной поддержкой и сверяйте размеры.",
      );
    }
    if (fiberType === "cotton" || fiberType === "linen") {
      add(
        "WET_WEIGHT",
        "Мокрое изделие станет тяжёлым: не поднимайте его за край и не подвешивайте.",
      );
    }
    if (fiberType === "acrylic") {
      add(
        "ACRYLIC_HEAT",
        "Перегрев может необратимо изменить акрил. Утюг не должен касаться полотна.",
      );
    }
    if (fiberType === "silk" || fiberType === "blend") {
      add(
        "DELICATE_FIBER",
        "Ориентируйтесь на этикетку и избегайте агрессивного воздействия.",
      );
    }
    if (method === "steam_blocking") {
      add(
        "STEAM_DISTANCE",
        "Пар допустим только при подтверждённой совместимости. Не касайтесь полотна утюгом.",
      );
    }
    add("NO_WRING", "Не выкручивайте изделие.");
    add(
      "NO_OVERSTRETCH",
      "Не растягивайте полотно сильнее целевых размеров.",
    );
    add(
      "DRY_BEFORE_COMPLETE",
      "Блокировка не завершена, пока изделие полностью не высохло.",
    );
    return uniqueNotices(warnings);
  }

  function validateMethod(fiberType, method, options = {}) {
    if (!BLOCKING_METHODS.includes(method) || method === "unknown") {
      return blocker(
        "METHOD_REQUIRED",
        "Выберите безопасный способ блокировки.",
      );
    }
    if (
      method === "steam_blocking" &&
      (fiberType === "unknown" ||
        fiberType === "acrylic" ||
        options.careLabelKnown !== true ||
        options.steamCompatible !== true)
    ) {
      return blocker(
        "UNSAFE_STEAM",
        "Горячий пар нельзя использовать без подтверждения совместимости состава и инструкции по уходу.",
      );
    }
    if (
      fiberType === "acrylic" &&
      method === "wet_blocking" &&
      options.nonstandardConfirmed !== true
    ) {
      return blocker(
        "NONSTANDARD_CONFIRMATION_REQUIRED",
        "Для нестандартного способа с акрилом подтвердите осознанный выбор или используйте щадящее формование.",
      );
    }
    if (
      fiberType === "unknown" &&
      !["spray_blocking", "gentle_shaping"].includes(method)
    ) {
      return blocker(
        "UNKNOWN_FIBER_CONSERVATIVE_ONLY",
        "При неизвестном составе доступны только осторожное увлажнение или щадящее формование.",
      );
    }
    return null;
  }

  function determineBlockers(state) {
    const blockers = [];
    if (!state.sourceTailSecuringRevision) {
      blockers.push(
        blocker(
          "TAIL_SECURING_NOT_COMPLETED",
          "Сначала завершите Stage 13: без закреплённого хвоста блокировку начинать нельзя.",
        ),
      );
      return blockers;
    }
    if (!text(state.itemKind)) {
      blockers.push(
        blocker("ITEM_KIND_REQUIRED", "Укажите, что именно блокируется."),
      );
    }
    if (!FIBER_TYPES.includes(state.fiberType)) {
      blockers.push(
        blocker("FIBER_REQUIRED", "Укажите состав пряжи или выберите «неизвестен»."),
      );
    } else if (state.fiberTypeConfirmed !== true) {
      blockers.push(
        blocker(
          "FIBER_CONFIRMATION_REQUIRED",
          "Подтвердите указанный состав; YarnAI не определяет его автоматически.",
        ),
      );
    }
    if (typeof state.careLabelKnown !== "boolean") {
      blockers.push(
        blocker(
          "CARE_LABEL_STATUS_REQUIRED",
          "Укажите, найдена ли инструкция по уходу.",
        ),
      );
    }
    if (state.itemReady !== true) {
      blockers.push(
        blocker(
          "ITEM_NOT_READY",
          "Подтвердите, что изделие связано, собрано и готово к обработке.",
        ),
      );
    }
    const unsafe = validateMethod(state.fiberType, state.blockingMethod, {
      careLabelKnown: state.careLabelKnown,
      steamCompatible: state.steamCompatible,
      nonstandardConfirmed: state.nonstandardMethodConfirmed,
    });
    if (unsafe) {
      blockers.push(unsafe);
    }
    return blockers;
  }

  function createInitialState(input = {}, now = new Date().toISOString()) {
    requireTimestamp(now);
    const tail = input.tailSecuring;
    const tailCompleted =
      isRecord(tail) &&
      tail.status === "completed" &&
      positiveInteger(tail.revision);
    const itemKind =
      text(input.itemKind) ||
      text(input.calculation?.request?.garment_type) ||
      text(input.calculation?.request?.project_intent?.garmentType) ||
      "";
    const targetMeasurements = measurementsFromCalculation(
      input.calculation,
    );
    const id = makeId("first-blocking");
    const initial = {
      id,
      projectId:
        text(input.projectId) ||
        text(input.project?.project_id) ||
        "unknown-project",
      type: PROGRESS_KIND,
      version: VERSION,
      revision: 1,
      status: tailCompleted ? "collecting" : "blocked",
      sourceTailSecuringRevision: tailCompleted ? tail.revision : null,
      sourceTailSecuringId: tailCompleted ? tail.id : null,
      sourceCalculationFingerprint:
        text(input.calculation?.fingerprint) ||
        text(tail?.sourceSnapshot?.calculationFingerprint) ||
        null,
      itemKind,
      fiberType: FIBER_TYPES.includes(input.fiberType)
        ? input.fiberType
        : "unknown",
      fiberTypeConfirmed: input.fiberTypeConfirmed === true,
      careLabelKnown:
        typeof input.careLabelKnown === "boolean"
          ? input.careLabelKnown
          : null,
      careLabelText: text(input.careLabelText) || null,
      blockingMethod: "unknown",
      recommendedMethod: "unknown",
      recommendationReason: "",
      nonstandardMethodConfirmed: false,
      steamCompatible: false,
      itemReady: input.itemReady === true,
      targetMeasurements,
      preparationChecklist: [],
      currentStep: "readiness",
      completedSteps: [],
      layoutConfirmation: null,
      postDryConfirmation: null,
      resultCode: null,
      correctionHistory: [],
      actionHistory: [],
      warnings: [],
      blockers: [],
      notes: [],
      diagnostics: [],
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      dryingStartedAt: null,
      completedAt: null,
    };
    const recommendation = recommendMethod(initial.fiberType, {
      careLabelKnown: initial.careLabelKnown,
    });
    initial.recommendedMethod = recommendation.method;
    initial.recommendationReason = recommendation.reason;
    initial.preparationChecklist = createChecklist(initial, now);
    initial.warnings = determineWarnings(
      initial.fiberType,
      initial.blockingMethod,
      initial.careLabelKnown,
    );
    initial.blockers = determineBlockers(initial);
    if (!tailCompleted) {
      initial.status = "blocked";
    }
    initial.actionHistory = [
      action("blocking_created", now, initial.revision, {
        sourceTailSecuringRevision: initial.sourceTailSecuringRevision,
      }),
    ];
    requireValidState(initial);
    return initial;
  }

  function updateDetails(state, patch, now = new Date().toISOString()) {
    requireMutable(state);
    requireTimestamp(now);
    if (!isRecord(patch)) {
      throw stateError("DETAILS_INVALID", "Данные подготовки имеют неверный формат.");
    }
    const allowed = new Set([
      "itemKind",
      "fiberType",
      "fiberTypeConfirmed",
      "careLabelKnown",
      "careLabelText",
      "blockingMethod",
      "nonstandardMethodConfirmed",
      "steamCompatible",
      "itemReady",
    ]);
    if (Object.keys(patch).some((key) => !allowed.has(key))) {
      throw stateError("DETAILS_INVALID", "Передано неизвестное поле подготовки.");
    }
    const next = copy(state);
    if (patch.itemKind !== undefined) next.itemKind = text(patch.itemKind);
    if (patch.fiberType !== undefined) {
      if (!FIBER_TYPES.includes(patch.fiberType)) {
        throw stateError("FIBER_INVALID", "Выберите состав из списка.");
      }
      next.fiberType = patch.fiberType;
      next.fiberTypeConfirmed = false;
    }
    for (const key of [
      "fiberTypeConfirmed",
      "careLabelKnown",
      "nonstandardMethodConfirmed",
      "steamCompatible",
      "itemReady",
    ]) {
      if (patch[key] !== undefined) {
        if (typeof patch[key] !== "boolean") {
          throw stateError("DETAILS_INVALID", "Подтверждение должно быть явным.");
        }
        next[key] = patch[key];
      }
    }
    if (patch.careLabelText !== undefined) {
      next.careLabelText = text(patch.careLabelText) || null;
    }
    if (patch.blockingMethod !== undefined) {
      if (!BLOCKING_METHODS.includes(patch.blockingMethod)) {
        throw stateError("METHOD_INVALID", "Выберите способ из списка.");
      }
      const recommendation = recommendMethod(next.fiberType, {
        careLabelKnown: next.careLabelKnown,
      });
      if (
        patch.blockingMethod !== recommendation.method &&
        next.nonstandardMethodConfirmed !== true
      ) {
        throw stateError(
          "NONSTANDARD_CONFIRMATION_REQUIRED",
          "Подтвердите, что понимаете отличие выбранного способа от рекомендации.",
        );
      }
      const unsafe = validateMethod(next.fiberType, patch.blockingMethod, {
        careLabelKnown: next.careLabelKnown,
        steamCompatible: next.steamCompatible,
        nonstandardConfirmed: next.nonstandardMethodConfirmed,
      });
      if (unsafe) {
        throw stateError(unsafe.code, unsafe.message);
      }
      next.blockingMethod = patch.blockingMethod;
    }
    const recommendation = recommendMethod(next.fiberType, {
      careLabelKnown: next.careLabelKnown,
    });
    next.recommendedMethod = recommendation.method;
    next.recommendationReason = recommendation.reason;
    next.warnings = determineWarnings(
      next.fiberType,
      next.blockingMethod,
      next.careLabelKnown,
    );
    next.blockers = determineBlockers(next);
    if (next.status !== "blocked" || next.sourceTailSecuringRevision) {
      next.status = next.blockers.length ? "collecting" : "ready";
    }
    next.preparationChecklist = reconcileChecklist(
      next.preparationChecklist,
      createChecklist(next, now),
    );
    return commitMutation(state, next, now, "details_updated", {
      changedFields: Object.keys(patch).sort(),
    });
  }

  function setMeasurement(
    state,
    measurement,
    now = new Date().toISOString(),
  ) {
    requireMutable(state);
    requireTimestamp(now);
    if (!isRecord(measurement) || !MEASUREMENT_KEYS.includes(measurement.key)) {
      throw stateError("MEASUREMENT_INVALID", "Измерение имеет неверный формат.");
    }
    const normalized = normalizeMeasurement(measurement, "user");
    const next = copy(state);
    const index = next.targetMeasurements.findIndex(
      (entry) =>
        entry.key === normalized.key &&
        (entry.key !== "customMeasurements" ||
          entry.label === normalized.label),
    );
    if (index >= 0) {
      const previous = next.targetMeasurements[index];
      const sameTarget =
        previous.key === normalized.key &&
        previous.label === normalized.label &&
        previous.value === normalized.value &&
        previous.unit === normalized.unit;
      next.targetMeasurements[index] = {
        ...normalized,
        source: sameTarget ? previous.source : "user_corrected",
      };
    } else {
      next.targetMeasurements.push(normalized);
    }
    next.preparationChecklist = reconcileChecklist(
      next.preparationChecklist,
      createChecklist(next, now),
    );
    return commitMutation(state, next, now, "measurement_saved", {
      key: normalized.key,
      source: next.targetMeasurements[index >= 0 ? index : next.targetMeasurements.length - 1].source,
    });
  }

  function setChecklistItem(
    state,
    itemId,
    checked,
    now = new Date().toISOString(),
  ) {
    requireMutable(state);
    requireTimestamp(now);
    if (!["collecting", "ready"].includes(state.status)) {
      throw stateError(
        "CHECKLIST_NOT_EDITABLE",
        "Подготовительный checklist меняется только до начала блокировки.",
      );
    }
    if (typeof checked !== "boolean") {
      throw stateError("CHECKLIST_INVALID", "Не удалось сохранить пункт checklist.");
    }
    const current = state.preparationChecklist.find((item) => item.id === itemId);
    if (!current || current.source === "system") {
      throw stateError(
        "CHECKLIST_ITEM_INVALID",
        "Этот пункт отсутствует или проверяется системой.",
      );
    }
    if (current.checked === checked) return copy(state);
    const next = copy(state);
    const target = next.preparationChecklist.find((item) => item.id === itemId);
    target.checked = checked;
    target.checkedAt = checked ? now : null;
    return commitMutation(
      state,
      next,
      now,
      checked ? "checklist_checked" : "checklist_unchecked",
      { itemId },
    );
  }

  function checklistReady(state) {
    return (
      Array.isArray(state?.preparationChecklist) &&
      state.preparationChecklist
        .filter((item) => item.required)
        .every((item) => item.checked)
    );
  }

  function startBlocking(state, now = new Date().toISOString()) {
    requireMutable(state);
    requireTimestamp(now);
    if (state.status === "in_progress") return copy(state);
    const blockers = determineBlockers(state);
    if (state.status !== "ready" || blockers.length) {
      throw stateError(
        "BLOCKING_NOT_READY",
        blockers[0]?.message || "Сначала заполните обязательные данные.",
      );
    }
    if (!checklistReady(state)) {
      throw stateError(
        "CHECKLIST_INCOMPLETE",
        "Перед началом отметьте все обязательные пункты подготовки.",
      );
    }
    const next = copy(state);
    next.status = "in_progress";
    next.currentStep = "prepare";
    next.startedAt = next.startedAt || now;
    next.blockers = [];
    return commitMutation(state, next, now, "blocking_started", {});
  }

  function confirmStep(
    state,
    step,
    confirmation = {},
    now = new Date().toISOString(),
  ) {
    requireMutable(state);
    requireTimestamp(now);
    if (state.status !== "in_progress") {
      throw stateError("STEP_NOT_AVAILABLE", "Этот шаг сейчас недоступен.");
    }
    const sequence = requiredSteps(state.blockingMethod);
    const expected = state.currentStep;
    if (step !== expected || !sequence.includes(step)) {
      throw stateError(
        "STEP_OUT_OF_ORDER",
        "Выполните текущий шаг перед переходом дальше.",
        { expected, received: step },
      );
    }
    validateStepConfirmation(step, confirmation);
    const next = copy(state);
    next.completedSteps = addUnique(next.completedSteps, step);
    next.actionHistory.push(
      action("step_confirmed", now, state.revision + 1, {
        step,
        confirmation: copy(confirmation),
      }),
    );
    const index = sequence.indexOf(step);
    const following = sequence[index + 1];
    if (step === "laid_out") {
      next.layoutConfirmation = copy(confirmation);
      next.status = "drying";
      next.currentStep = "drying";
      next.dryingStartedAt = now;
      next.completedSteps = addUnique(next.completedSteps, "laid_out");
      return commitMutation(
        state,
        next,
        now,
        "drying_started",
        {},
        true,
      );
    }
    next.currentStep = following;
    return commitMutation(
      state,
      next,
      now,
      "step_advanced",
      { from: step, to: following },
      true,
    );
  }

  function saveNote(state, note, now = new Date().toISOString()) {
    requireMutable(state);
    requireTimestamp(now);
    const value = text(note);
    if (!value) throw stateError("NOTE_EMPTY", "Введите текст заметки.");
    if (state.notes.includes(value)) return copy(state);
    const next = copy(state);
    next.notes.push(value);
    return commitMutation(state, next, now, "note_saved", {});
  }

  function registerDryResult(
    state,
    resultCode,
    confirmation,
    note = null,
    now = new Date().toISOString(),
  ) {
    requireMutable(state);
    requireTimestamp(now);
    if (state.status !== "drying") {
      throw stateError(
        "DRYING_NOT_ACTIVE",
        "Проверка результата доступна только после раскладывания и сушки.",
      );
    }
    if (!RESULT_CODES.includes(resultCode)) {
      throw stateError("RESULT_INVALID", "Выберите результат проверки.");
    }
    if (resultCode === "all_good") {
      validateDryConfirmation(confirmation);
    } else if (!validProblemConfirmation(confirmation)) {
      throw stateError(
        "DRY_RESULT_UNCONFIRMED",
        "Сначала подтвердите полное высыхание и проверку размеров.",
      );
    }
    const next = copy(state);
    next.postDryConfirmation = copy(confirmation);
    next.resultCode = resultCode;
    next.currentStep = "review";
    next.completedSteps = addUnique(next.completedSteps, "fully_dried");
    if (text(note) && !next.notes.includes(text(note))) next.notes.push(text(note));
    if (resultCode === "all_good") {
      return commitMutation(state, next, now, "dry_result_confirmed", {
        resultCode,
      });
    }
    const correctable = [
      "slight_size_difference",
      "stretched",
      "curling_edges",
      "skewed",
    ].includes(resultCode);
    if (correctable) {
      next.status = "needs_correction";
      next.correctionHistory.push({
        resultCode,
        note: text(note) || null,
        recordedAt: now,
        retryFrom: correctionStep(resultCode, state.blockingMethod),
      });
      return commitMutation(state, next, now, "correction_needed", {
        resultCode,
      });
    }
    next.status = "blocked";
    next.blockers = [
      blocker(
        "UNDIAGNOSED_RESULT",
        "Проблема неясна. Остановитесь и сверьтесь с инструкцией по уходу или специалистом по этой пряже.",
      ),
    ];
    return commitMutation(state, next, now, "result_blocked", { resultCode });
  }

  function restartCorrection(state, now = new Date().toISOString()) {
    requireMutable(state);
    requireTimestamp(now);
    if (state.status !== "needs_correction" || !state.correctionHistory.length) {
      throw stateError("NO_CORRECTION", "Повторная блокировка сейчас не требуется.");
    }
    const next = copy(state);
    const correction = next.correctionHistory.at(-1);
    next.status = "in_progress";
    next.currentStep = correction.retryFrom;
    next.layoutConfirmation = null;
    next.postDryConfirmation = null;
    next.resultCode = null;
    next.dryingStartedAt = null;
    return commitMutation(state, next, now, "correction_restarted", {
      retryFrom: correction.retryFrom,
      attempt: next.correctionHistory.length + 1,
    });
  }

  function completeBlocking(state, now = new Date().toISOString()) {
    requireTimestamp(now);
    if (state.status === "completed") return copy(state);
    requireMutable(state);
    if (
      state.status !== "drying" ||
      state.currentStep !== "review" ||
      state.resultCode !== "all_good" ||
      !validDryConfirmation(state.postDryConfirmation)
    ) {
      throw stateError(
        "EARLY_COMPLETION",
        "Завершить можно только после явного подтверждения полного высыхания, формы и размеров.",
      );
    }
    const blockers = determineBlockers(state);
    if (blockers.length || state.blockers.length) {
      throw stateError(
        "ACTIVE_BLOCKERS",
        "Завершение невозможно, пока есть активная блокировка.",
      );
    }
    const next = copy(state);
    next.status = "completed";
    next.currentStep = "completed";
    next.completedAt = now;
    next.completedSteps = addUnique(next.completedSteps, "result_confirmed");
    return commitMutation(state, next, now, "blocking_completed", {});
  }

  function serializeState(state) {
    requireValidState(state);
    return JSON.stringify(state);
  }

  function restoreState(serialized) {
    let value;
    try {
      value = typeof serialized === "string" ? JSON.parse(serialized) : copy(serialized);
    } catch {
      throw stateError(
        "BLOCKING_DATA_DAMAGED",
        "Запись Stage 14 повреждена и не была изменена.",
      );
    }
    requireValidState(value);
    return value;
  }

  function safeRestore(serialized) {
    try {
      return { ok: true, state: restoreState(serialized), diagnostic: null };
    } catch (error) {
      return {
        ok: false,
        state: null,
        diagnostic: {
          code: error.code || "BLOCKING_DATA_DAMAGED",
          message:
            error.userMessage ||
            "Запись Stage 14 повреждена. Остальные данные проекта не изменены.",
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
      value.version !== VERSION ||
      !positiveInteger(value.revision) ||
      !text(value.projectId) ||
      !STATUSES.includes(value.status) ||
      !FIBER_TYPES.includes(value.fiberType) ||
      !BLOCKING_METHODS.includes(value.blockingMethod) ||
      !Array.isArray(value.targetMeasurements) ||
      !value.targetMeasurements.every(validMeasurement) ||
      !Array.isArray(value.preparationChecklist) ||
      !value.preparationChecklist.every(validChecklistItem) ||
      !Array.isArray(value.completedSteps) ||
      new Set(value.completedSteps).size !== value.completedSteps.length ||
      !Array.isArray(value.warnings) ||
      !Array.isArray(value.blockers) ||
      !Array.isArray(value.notes) ||
      !Array.isArray(value.actionHistory) ||
      !Array.isArray(value.correctionHistory) ||
      !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt) ||
      !nullableTimestamp(value.startedAt) ||
      !nullableTimestamp(value.dryingStartedAt) ||
      !nullableTimestamp(value.completedAt)
    ) {
      throw stateError(
        "BLOCKING_DATA_DAMAGED",
        "Запись Stage 14 повреждена или имеет неподдерживаемую версию.",
      );
    }
    if (
      value.status === "completed" &&
      (!value.completedAt ||
        value.resultCode !== "all_good" ||
        !validDryConfirmation(value.postDryConfirmation) ||
        value.blockers.length)
    ) {
      throw stateError(
        "BLOCKING_DATA_DAMAGED",
        "Завершённая запись Stage 14 не прошла проверку целостности.",
      );
    }
    return true;
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project;
    if (!isRecord(project) || !text(project.project_id)) {
      return aggregateResult("blocked", null, null, null, [
        blocker("PROJECT_MISSING", "Проект не найден."),
      ]);
    }
    const calculation = activeCalculation(aggregate, project);
    if (!calculation) {
      return aggregateResult("blocked", project, null, null, [
        blocker("CALCULATION_MISSING", "Активный расчёт проекта не найден."),
      ]);
    }
    const tailRecord = oneProgress(aggregate, TAIL_KIND, calculation.calculation_id);
    const progressRecord = oneProgress(
      aggregate,
      PROGRESS_KIND,
      calculation.calculation_id,
    );
    const tail =
      tailRecord && !isPlaceholder(tailRecord.state) ? tailRecord.state : null;
    const raw =
      progressRecord && !isPlaceholder(progressRecord.state)
        ? progressRecord.state
        : null;
    if (!raw) {
      const sourceOkay = tail?.status === "completed";
      return {
        ...aggregateResult(
          sourceOkay ? "missing" : "blocked",
          project,
          calculation,
          null,
          sourceOkay
            ? []
            : [
                blocker(
                  "TAIL_SECURING_NOT_COMPLETED",
                  "Stage 14 недоступен, пока FIRST_TAIL_SECURING не completed.",
                ),
              ],
        ),
        tail,
        tailRecord,
        progress: progressRecord,
        input: { project, projectId: project.project_id, calculation, tailSecuring: tail },
      };
    }
    const restored = safeRestore(raw);
    if (!restored.ok) {
      return {
        ...aggregateResult("corrupted", project, calculation, null, [
          restored.diagnostic,
        ]),
        tail,
        tailRecord,
        progress: progressRecord,
        rawState: copy(raw),
        diagnostic: restored.diagnostic,
        input: { project, projectId: project.project_id, calculation, tailSecuring: tail },
      };
    }
    const state = restored.state;
    if (
      state.sourceTailSecuringRevision !== tail?.revision ||
      tail?.status !== "completed"
    ) {
      return {
        ...aggregateResult("blocked", project, calculation, state, [
          blocker(
            "TAIL_SECURING_SOURCE_CHANGED",
            "Источник Stage 13 изменился. Продолжение Stage 14 заблокировано.",
          ),
        ]),
        tail,
        tailRecord,
        progress: progressRecord,
        input: { project, projectId: project.project_id, calculation, tailSecuring: tail },
      };
    }
    return {
      ...aggregateResult(state.status, project, calculation, state, state.blockers),
      tail,
      tailRecord,
      progress: progressRecord,
      input: { project, projectId: project.project_id, calculation, tailSecuring: tail },
    };
  }

  async function ensureForProject(repository, projectId) {
    let result = inspectAggregate(await repository.getProject(projectId));
    if (result.state === "corrupted") return result;
    if (
      result.blocking?.status === "blocked" &&
      !result.blocking.sourceTailSecuringRevision &&
      result.tail?.status === "completed" &&
      result.progress &&
      result.calculation
    ) {
      const recovered = createInitialState(result.input);
      return persist(
        repository,
        result,
        recovered,
        "FIRST_BLOCKING_SOURCE_BECAME_READY",
      );
    }
    if (result.blocking) return result;
    if (!result.calculation) throw errorFromResult(result);
    if (!result.progress) {
      await repository.ensureCalculationProgress(
        projectId,
        result.calculation.calculation_id,
        PROGRESS_KIND,
        { version: 0, initialized: false },
        { operationKind: "FIRST_BLOCKING_PROGRESS_CREATED" },
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
        operationKind: "FIRST_BLOCKING_CREATED",
        projectStage:
          state.status === "blocked" ? "first_blocking_blocked" : "first_blocking_collecting",
      },
    );
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function resetForProject(repository, projectId) {
    const result = inspectAggregate(await repository.getProject(projectId));
    if (!result.progress || !result.calculation) throw errorFromResult(result);
    const state = createInitialState(result.input);
    state.diagnostics.push({
      code: "PREVIOUS_RECORD_REPLACED",
      message: "Повреждённая запись Stage 14 заменена по явной команде пользователя.",
      at: state.createdAt,
    });
    return persist(repository, result, state, "FIRST_BLOCKING_RESET");
  }

  async function mutateForProject(repository, projectId, mutation, operationKind) {
    let result = await ensureForProject(repository, projectId);
    if (result.state === "corrupted" || !result.blocking) {
      throw errorFromResult(result);
    }
    const next = mutation(result.blocking);
    if (stableStringify(next) === stableStringify(result.blocking)) return result;
    return persist(repository, result, next, operationKind);
  }

  async function updateDetailsForProject(repository, projectId, patch) {
    return mutateForProject(
      repository,
      projectId,
      (state) => updateDetails(state, patch),
      "FIRST_BLOCKING_DETAILS_UPDATED",
    );
  }

  async function setMeasurementForProject(repository, projectId, measurement) {
    return mutateForProject(
      repository,
      projectId,
      (state) => setMeasurement(state, measurement),
      "FIRST_BLOCKING_MEASUREMENT_SAVED",
    );
  }

  async function setChecklistForProject(repository, projectId, itemId, checked) {
    return mutateForProject(
      repository,
      projectId,
      (state) => setChecklistItem(state, itemId, checked),
      "FIRST_BLOCKING_CHECKLIST_UPDATED",
    );
  }

  async function startForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      startBlocking,
      "FIRST_BLOCKING_STARTED",
    );
  }

  async function confirmStepForProject(
    repository,
    projectId,
    step,
    confirmation,
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) => confirmStep(state, step, confirmation),
      "FIRST_BLOCKING_STEP_CONFIRMED",
    );
  }

  async function saveNoteForProject(repository, projectId, note) {
    return mutateForProject(
      repository,
      projectId,
      (state) => saveNote(state, note),
      "FIRST_BLOCKING_NOTE_SAVED",
    );
  }

  async function registerResultForProject(
    repository,
    projectId,
    resultCode,
    confirmation,
    note,
  ) {
    return mutateForProject(
      repository,
      projectId,
      (state) => registerDryResult(state, resultCode, confirmation, note),
      "FIRST_BLOCKING_RESULT_RECORDED",
    );
  }

  async function restartForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      restartCorrection,
      "FIRST_BLOCKING_CORRECTION_RESTARTED",
    );
  }

  async function completeForProject(repository, projectId) {
    return mutateForProject(
      repository,
      projectId,
      completeBlocking,
      "FIRST_BLOCKING_COMPLETED",
    );
  }

  async function persist(repository, result, state, operationKind) {
    const stages = {
      collecting: "first_blocking_collecting",
      ready: "first_blocking_ready",
      in_progress: "first_blocking_in_progress",
      drying: "first_blocking_drying",
      needs_correction: "first_blocking_needs_correction",
      blocked: "first_blocking_blocked",
      completed: "first_blocking_completed",
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
    return inspectAggregate(await repository.getProject(result.project.project_id));
  }

  function homeState(result, projectId) {
    if (!result) return null;
    const href = `/first-blocking?project=${encodeURIComponent(projectId)}`;
    if (result.state === "corrupted" || result.state === "blocked") {
      return {
        stage: "Первая блокировка недоступна",
        summary:
          result.diagnostic?.message ||
          result.blockers?.[0]?.message ||
          "Сначала завершите закрепление хвоста.",
        label: "Проверить готовность",
        href,
        status: "blocked",
      };
    }
    if (!result.blocking) return null;
    const labels = {
      collecting: ["Нужно подготовить блокировку", "Подготовить блокировку"],
      ready: ["Блокировку можно начинать", "Начать блокировку"],
      in_progress: ["Первая блокировка продолжается", "Продолжить блокировку"],
      drying: ["Изделие сохнет", "Проверить сушку"],
      needs_correction: ["Нужна повторная блокировка", "Исправить форму"],
      completed: ["Первая блокировка завершена", "Посмотреть результат"],
    };
    const [stage, label] = labels[result.blocking.status] || labels.collecting;
    return {
      stage,
      summary: progressSummary(result.blocking),
      label,
      href,
      status: result.blocking.status,
      blocking: copy(result.blocking),
    };
  }

  function progressSummary(state) {
    if (!state) return "";
    if (state.status === "completed") {
      return "Изделие полностью высохло, форма и размеры подтверждены. Stage 14 завершена.";
    }
    if (state.status === "drying") {
      return "Изделие разложено по размерам и сохнет. Завершение пока недоступно.";
    }
    if (state.status === "needs_correction") {
      return "Результат сохранён; безопасная повторная блокировка не стирает историю.";
    }
    if (state.status === "collecting") {
      return "Уточните состав, уход, способ и готовность изделия.";
    }
    return `Текущий шаг: ${state.currentStep}.`;
  }

  function createChecklist(state, now) {
    const wet = state.blockingMethod === "wet_blocking";
    const pinsNeeded = /кружев|lace/i.test(state.itemKind);
    const hasMeasurements = state.targetMeasurements.length > 0;
    return [
      checklistItem("tail_secured", "Хвост закреплён", true, true, "system", now),
      checklistItem("seams_inspected", "Швы осмотрены", true, false, "user", now),
      checklistItem("markers_removed", "Лишние маркеры удалены", true, false, "user", now),
      checklistItem("loose_threads_removed", "Изделие очищено от посторонних нитей", true, false, "user", now),
      checklistItem(
        "care_label_checked",
        "Этикетка проверена либо отмечено её отсутствие",
        true,
        typeof state.careLabelKnown === "boolean",
        "system",
        now,
      ),
      checklistItem("clean_surface_ready", "Подготовлена чистая ровная поверхность", true, false, "user", now),
      checklistItem("towels_ready", "Подготовлены полотенца", wet, false, "user", now),
      checklistItem("pins_ready", "Подготовлены булавки или блокировочные гребни", pinsNeeded, false, "user", now),
      checklistItem(
        "measurements_recorded",
        hasMeasurements
          ? "Целевые размеры записаны или отмечены как неприменимые"
          : "Размеры не найдены в проекте; подтверждено, что они неприменимы",
        true,
        hasMeasurements && state.targetMeasurements.every((entry) => entry.confirmed),
        "system",
        now,
      ),
    ];
  }

  function reconcileChecklist(current, definitions) {
    return definitions.map((definition) => {
      const previous = current.find((item) => item.id === definition.id);
      if (!previous) return definition;
      if (definition.source === "system") {
        return definition.checked === previous.checked
          ? { ...definition, checkedAt: previous.checkedAt }
          : definition;
      }
      return {
        ...definition,
        checked: previous.checked,
        checkedAt: previous.checkedAt,
      };
    });
  }

  function measurementsFromCalculation(calculation) {
    const request = calculation?.request;
    const target =
      request?.target_width ||
      request?.calculation_input?.width ||
      request?.project_intent?.targetWidth;
    const value = finitePositive(target?.value);
    if (!value) return [];
    return [
      {
        key: "width",
        label: "Ширина",
        value,
        unit: text(target?.unit) || "cm",
        source: "calculation",
        confirmed: false,
      },
    ];
  }

  function normalizeMeasurement(value, fallbackSource) {
    const notApplicable = value.value === null && value.confirmed === true;
    const numeric = finitePositive(Number(value.value));
    if (!notApplicable && !numeric) {
      throw stateError(
        "MEASUREMENT_INVALID",
        "Укажите положительный размер или подтвердите, что он не применяется.",
      );
    }
    const label = text(value.label);
    if (!label) throw stateError("MEASUREMENT_INVALID", "Укажите название размера.");
    return {
      key: value.key,
      label,
      value: notApplicable ? null : numeric,
      unit: text(value.unit) || "cm",
      source: text(value.source) || fallbackSource,
      confirmed: value.confirmed === true,
    };
  }

  function validMeasurement(value) {
    return (
      isRecord(value) &&
      MEASUREMENT_KEYS.includes(value.key) &&
      Boolean(text(value.label)) &&
      (finitePositive(value.value) || value.value === null) &&
      Boolean(text(value.unit)) &&
      Boolean(text(value.source)) &&
      typeof value.confirmed === "boolean"
    );
  }

  function requiredSteps(method) {
    if (method === "wet_blocking") {
      return ["prepare", "treatment", "water_removed", "laid_out"];
    }
    return ["prepare", "treatment", "laid_out"];
  }

  function validateStepConfirmation(step, confirmation) {
    if (!isRecord(confirmation)) {
      throw stateError("STEP_CONFIRMATION_REQUIRED", "Подтвердите выполненные действия.");
    }
    if (step === "laid_out") {
      const missing = LAYOUT_CONFIRMATIONS.filter(
        (key) => confirmation[key] !== true,
      );
      if (missing.length) {
        throw stateError(
          "LAYOUT_INCOMPLETE",
          "Перед сушкой подтвердите ровную поверхность, швы, размеры и отсутствие перерастяжения.",
          { missing },
        );
      }
      return;
    }
    if (confirmation.done !== true) {
      throw stateError("STEP_CONFIRMATION_REQUIRED", "Подтвердите выполнение шага.");
    }
  }

  function validateDryConfirmation(value) {
    if (!validDryConfirmation(value)) {
      throw stateError(
        "NOT_FULLY_DRY",
        "Подтвердите полное высыхание, размеры, форму, швы и отсутствие деформации.",
      );
    }
  }

  function validDryConfirmation(value) {
    return (
      isRecord(value) &&
      DRY_CONFIRMATIONS.every((key) => value[key] === true)
    );
  }

  function validProblemConfirmation(value) {
    return (
      isRecord(value) &&
      value.fullyDry === true &&
      value.measurementsChecked === true &&
      DRY_CONFIRMATIONS.every((key) => typeof value[key] === "boolean")
    );
  }

  function correctionStep(resultCode, method) {
    if (resultCode === "stretched" || resultCode === "skewed") {
      return "treatment";
    }
    return method === "wet_blocking" ? "water_removed" : "laid_out";
  }

  function commitMutation(
    previous,
    next,
    now,
    actionType,
    details,
    actionAlreadyAdded = false,
  ) {
    if (stableStringify(previous) === stableStringify(next)) return copy(previous);
    next.revision = previous.revision + 1;
    next.updatedAt = now;
    if (!actionAlreadyAdded) {
      next.actionHistory.push(action(actionType, now, next.revision, details));
    } else {
      next.actionHistory.push(action(actionType, now, next.revision, details));
    }
    requireValidState(next);
    return next;
  }

  function requireMutable(state) {
    requireValidState(state);
    if (state.status === "completed") {
      throw stateError(
        "FIRST_BLOCKING_COMPLETED",
        "Stage 14 уже завершена и больше не изменяется.",
      );
    }
    if (state.status === "blocked" && state.sourceTailSecuringRevision) {
      throw stateError(
        "FIRST_BLOCKING_BLOCKED",
        state.blockers[0]?.message || "Безопасное продолжение невозможно.",
      );
    }
  }

  function aggregateResult(state, project, calculation, blocking, blockers) {
    return {
      state,
      status: blocking?.status || state,
      project: copy(project),
      calculation: copy(calculation),
      blocking: copy(blocking),
      blockers: copy(blockers || []),
      message: blockers?.[0]?.message || null,
    };
  }

  function errorFromResult(result) {
    return stateError(
      result?.diagnostic?.code || result?.blockers?.[0]?.code || "FIRST_BLOCKING_UNAVAILABLE",
      result?.diagnostic?.message ||
        result?.blockers?.[0]?.message ||
        "Stage 14 сейчас недоступна.",
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

  function checklistItem(id, label, required, checked, source, now) {
    return {
      id,
      label,
      required,
      checked,
      source,
      checkedAt: checked ? now : null,
    };
  }

  function validChecklistItem(value) {
    return (
      isRecord(value) &&
      Boolean(text(value.id)) &&
      Boolean(text(value.label)) &&
      typeof value.required === "boolean" &&
      typeof value.checked === "boolean" &&
      ["system", "user"].includes(value.source) &&
      nullableTimestamp(value.checkedAt)
    );
  }

  function action(type, at, revision, details) {
    return { type, at, revision, details: copy(details || {}) };
  }

  function blocker(code, message) {
    return { code, message };
  }

  function uniqueNotices(notices) {
    const seen = new Set();
    return notices.filter((entry) => {
      if (seen.has(entry.code)) return false;
      seen.add(entry.code);
      return true;
    });
  }

  function addUnique(values, value) {
    return values.includes(value) ? copy(values) : [...values, value];
  }

  function stateError(code, message, details = {}) {
    return new FirstBlockingError(code, message, details);
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

  function finitePositive(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : null;
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
    TAIL_KIND,
    STATUSES,
    FIBER_TYPES,
    BLOCKING_METHODS,
    MEASUREMENT_KEYS,
    RESULT_CODES,
    LAYOUT_CONFIRMATIONS,
    DRY_CONFIRMATIONS,
    FirstBlockingError,
    recommendMethod,
    determineWarnings,
    determineBlockers,
    validateMethod,
    createInitialState,
    updateDetails,
    setMeasurement,
    setChecklistItem,
    checklistReady,
    startBlocking,
    confirmStep,
    saveNote,
    registerDryResult,
    restartCorrection,
    completeBlocking,
    serializeState,
    restoreState,
    safeRestore,
    isValidState,
    inspectAggregate,
    ensureForProject,
    resetForProject,
    updateDetailsForProject,
    setMeasurementForProject,
    setChecklistForProject,
    startForProject,
    confirmStepForProject,
    saveNoteForProject,
    registerResultForProject,
    restartForProject,
    completeForProject,
    homeState,
    progressSummary,
    requiredSteps,
    stableStringify,
  };

  globalObject.YarnAIFirstBlocking = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
