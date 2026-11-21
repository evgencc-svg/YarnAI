"use strict";

(function exposePatternExecutionExport(globalObject) {
  const CONTRACT_ID = "ADAPTED_INSTRUCTION_EXPORT_V1";

  class PatternExecutionExportError extends Error {
    constructor(code, userMessage) {
      super(userMessage);
      this.name = "PatternExecutionExportError";
      this.code = code;
      this.userMessage = userMessage;
    }
  }

  function inspectAggregate(aggregate, dependencies = {}) {
    const planApi = dependencies.planApi || globalObject.YarnAIPatternExecutionPlan;
    const sessionApi = dependencies.sessionApi || globalObject.YarnAIPatternExecutionSession;
    if (!planApi?.inspectAggregate || !sessionApi?.inspectAggregate) {
      return blocked("EXPORT_MODULE_MISSING", "Модуль проверки сохранённого плана недоступен.");
    }
    const planInspection = planApi.inspectAggregate(aggregate);
    if (planInspection.state !== "ready" || planInspection.executionPlan?.status !== "ready") {
      return blocked(reasonCode(planInspection), reasonMessage(planInspection));
    }
    const integrity = validateStepIntegrity(planInspection.executionPlan.plan);
    if (!integrity.isValid) return blocked(integrity.code, integrity.message);
    const sessionInspection = sessionApi.inspectAggregate(aggregate);
    if (["stale", "plan_invalid", "plan_missing"].includes(sessionInspection.state)) {
      return blocked("EXPORT_SESSION_BINDING_INVALID", "Статус проверки не связан с текущим готовым планом.");
    }
    try {
      const model = buildExportModel({
        project: planInspection.project,
        review: planInspection.review,
        executionPlan: planInspection.executionPlan,
        executionSession: sessionInspection.executionSession,
      }, dependencies);
      return Object.freeze({ state: "ready", model });
    } catch (error) {
      if (error instanceof PatternExecutionExportError) return blocked(error.code, error.userMessage);
      throw error;
    }
  }

  function buildExportModel(input, dependencies = {}) {
    const formatters = dependencies.formatters || globalObject.YarnAIPatternExecutionUiFormatters;
    const reviewApi = dependencies.reviewApi || globalObject.YarnAIPatternTechnologyReview;
    if (!formatters || !reviewApi?.buildAdaptationExplanation) {
      throw exportError("EXPORT_MODULE_MISSING", "Модуль подготовки печатной инструкции недоступен.");
    }
    const project = input?.project;
    const review = input?.review;
    const state = input?.executionPlan;
    if (!project || !review || state?.status !== "ready" || !state.plan) {
      throw exportError("EXPORT_PLAN_NOT_READY", "Печатная инструкция доступна только для готового Stage 22 plan.");
    }
    const integrity = validateStepIntegrity(state.plan);
    if (!integrity.isValid) throw exportError(integrity.code, integrity.message);

    const explanationInput = review.immutableSourceSnapshot?.executableTechnologyPlanInput;
    const explanation = reviewApi.buildAdaptationExplanation(explanationInput);
    const summary = state.plan.summary || {};
    const profile = explanationInput?.evidence?.userAdaptationProfile || {};
    const beforeStart = buildBeforeStart(summary, profile, formatters);
    const changes = (explanation.changes || []).map((entry) => Object.freeze({
      title: humanize(entry.title),
      before: humanize(entry.before),
      after: humanize(entry.after),
      why: humanize(entry.why),
      practical: humanize(entry.practical),
    }));
    const sections = state.plan.phases.map((phase) => Object.freeze({
      title: humanize(phase.title),
      steps: phase.actions.map((step) => exportStep(step, formatters)),
    }));
    const allSteps = sections.flatMap((section) => section.steps);
    const statuses = buildStatus(input.executionSession, allSteps.length);
    const glossary = buildGlossary(allSteps);

    return deepFreeze({
      contractId: CONTRACT_ID,
      title: text(project.title) || "Проект YarnAI",
      purpose: "Персональная адаптированная инструкция",
      beforeStart,
      changes,
      sections,
      glossary,
      statuses,
      stepCount: allSteps.length,
      legalNotice: "Документ сформирован для владельца загруженного исходника. Он не заменяет лицензию исходной схемы и не предназначен для распространения исходного материала.",
    });
  }

  function validateStepIntegrity(plan) {
    const steps = array(plan?.steps);
    const phases = array(plan?.phases);
    if (!steps.length || !phases.length) return invalid("EXPORT_STEPS_MISSING", "В готовом плане отсутствуют шаги для печати.");
    const flattened = phases.flatMap((phase) => array(phase?.actions));
    if (flattened.length !== steps.length) return invalid("EXPORT_STEP_COUNT_MISMATCH", "Количество шагов в разделах не совпадает с авторитетным планом.");
    const ids = new Set();
    const operations = new Set();
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const sectionStep = flattened[index];
      if (!step || !sectionStep || step.id !== sectionStep.id || step.stepId !== sectionStep.stepId || step.sourceOperationIdentity !== sectionStep.sourceOperationIdentity) {
        return invalid("EXPORT_STEP_ORDER_MISMATCH", "Порядок шагов в разделах не совпадает с авторитетным планом.");
      }
      if (Number(step.order) !== index + 1 || Number(step.globalOrder) !== index + 1) {
        return invalid("EXPORT_STEP_NUMBER_MISMATCH", "Нумерация шагов не является непрерывной.");
      }
      if (ids.has(step.stepId) || operations.has(step.sourceOperationIdentity)) {
        return invalid("EXPORT_STEP_DUPLICATE", "В плане обнаружен повтор шага.");
      }
      ids.add(step.stepId);
      operations.add(step.sourceOperationIdentity);
    }
    const coverage = plan.coverage || {};
    if (coverage.exactOneToOne !== true || Number(coverage.userStepCount) !== steps.length || Number(coverage.sourceOperationCount) !== steps.length) {
      return invalid("EXPORT_COVERAGE_INVALID", "План не доказывает соответствие каждого шага одной исходной операции.");
    }
    return Object.freeze({ isValid: true, count: steps.length });
  }

  function buildBeforeStart(summary, profile, formatters) {
    const items = [];
    addKnown(items, "Плотность", formatters.formatGauge(summary.gauge));
    addKnown(items, "Размер или целевая мерка", summary.selectedSize);
    addKnown(items, "Спицы", formatters.formatNeedles(summary.needles));
    const yarn = knownYarn(summary.yarn, profile.yarn);
    if (yarn) addKnown(items, "Пряжа и материалы", formatters.formatYarn(yarn));
    addKnown(items, "Способ вязания и конструкция", [summary.craft, summary.construction].filter(Boolean).join("; "));
    return items.map((entry) => Object.freeze(entry));
  }

  function knownYarn(summaryYarn, profileYarn) {
    if (!profileYarn || typeof profileYarn !== "object" || Array.isArray(profileYarn) || !Object.keys(profileYarn).length) return null;
    const result = { ...copy(summaryYarn || {}) };
    const quantity = profileYarn.quantity ?? profileYarn.skeins;
    if (quantity === null || quantity === undefined || quantity === "") delete result.quantity;
    else result.quantity = quantity;
    return Object.values(result).some((value) => value !== null && value !== undefined && value !== "") ? result : null;
  }

  function addKnown(items, label, value) {
    const normalized = text(value);
    if (!normalized || /не указан|не распознан|технические данные/i.test(normalized)) return;
    items.push({ label, value: humanize(normalized) });
  }

  function exportStep(step, formatters) {
    const details = [];
    if (Number.isInteger(step.activeStitchesBefore) && Number.isInteger(step.activeStitchesAfter)) {
      details.push(`Активные петли: ${step.activeStitchesBefore} → ${step.activeStitchesAfter}.`);
    }
    const needle = formatters.formatNeedle(step.needles);
    if (needle && !/не распознан|технические данные|по подтверждённому плану/i.test(needle)) details.push(`Спицы: ${needle}.`);
    if (step.rowMode === "row") details.push("Вязать поворотными рядами.");
    if (step.rowMode === "round") details.push("Вязать по кругу.");
    const repeat = formatters.formatRepeat(step.repeat);
    if (repeat && !/технические данные/i.test(repeat)) details.push(`${repeat}.`);
    if (step.criterion?.type === "measurement" && Number.isFinite(Number(step.criterion.value))) {
      const measurement = formatters.formatMeasurement(step.criterion.value, step.criterion.unit);
      if (!/не распознан|технические данные/i.test(measurement)) details.push(`Остановиться по фактической мерке: ${measurement}.`);
    }
    return Object.freeze({
      number: Number(step.order),
      title: humanize(text(step.title).replace(/^Шаг\s+\d+\s*:\s*/i, "")),
      instruction: humanize(formatters.formatKnittingText(step.instruction || step.description)),
      details: details.map(humanize),
    });
  }

  function buildStatus(session, planStepCount) {
    const virtual = session?.virtualDryRun || null;
    const virtualCompleted = new Set(array(virtual?.completedStepIds)).size;
    const virtualTotal = array(virtual?.execution?.actions).length || planStepCount;
    const virtualComplete = virtual?.status === "completed" && virtualCompleted === planStepCount && virtualTotal === planStepCount;
    const actions = array(session?.execution?.actions);
    const physicalCompleted = actions.filter((entry) => entry.status === "completed").length;
    const physicalStarted = session?.started === true || ![null, undefined, "waiting"].includes(session?.status);
    return Object.freeze({
      virtual: virtualComplete
        ? `Виртуальная проверка плана завершена: ${planStepCount} из ${planStepCount} шагов.`
        : `Виртуальная проверка плана: ${virtualCompleted} из ${planStepCount} шагов. Полное завершение не подтверждено.`,
      physical: physicalStarted
        ? `Физическое вязание начато: подтверждено ${physicalCompleted} из ${planStepCount} шагов. Полная физическая проверка не завершена.`
        : "Физическое вязание этого экземпляра ещё не начато и не проверено.",
      virtualComplete,
      physicalStarted,
      virtualCompleted,
      physicalCompleted,
    });
  }

  function buildGlossary(steps) {
    const body = steps.map((entry) => `${entry.instruction} ${entry.details.join(" ")}`).join(" ");
    const definitions = [
      { token: "M1", pattern: /\bM1\b/, meaning: "прибавка одной петли из протяжки между петлями; протяжку провязать скрещённой лицевой" },
    ];
    return definitions.filter((entry) => entry.pattern.test(body)).map((entry) => Object.freeze({ abbreviation: entry.token, meaning: entry.meaning }));
  }

  function humanize(value) {
    return String(value ?? "")
      .replace(/Stage 21 сохранил quotient\/remainder-распределение/gi, "В подтверждённой адаптации сохранено точное распределение с остатком")
      .replace(/одно исполнимое действие Stage 22/gi, "одно действие готового плана")
      .replace(/сохранены как вход выбора инструментов и напрямую связаны с картой спиц исполнимого плана/gi, "сохранены как выбранные инструменты и напрямую используются в шагах готового плана")
      .replace(/сохранена как материал исполнимого плана и связана с обязательной подготовкой материалов/gi, "сохранена как подтверждённый материал для инструкции и включена в подготовку перед началом")
      .replace(/Исполнимый граф материализован/gi, "Последовательность шагов построена")
      .replace(/solver\/materialization/gi, "сохранённого расчёта")
      .replace(/authoritative causal trace/gi, "подтверждённой причинной цепочки")
      .replace(/Stage 21/gi, "принятый расчёт адаптации")
      .replace(/Stage 22/gi, "готового плана")
      .trim();
  }

  function reasonCode(inspection) {
    if (!inspection?.project) return "EXPORT_PROJECT_MISSING";
    if (["stale", "source_invalid"].includes(inspection.state)) return "EXPORT_PLAN_STALE";
    if (inspection.executionPlan?.status === "blocked") return "EXPORT_PLAN_BLOCKED";
    if (inspection.executionPlan?.status === "failed") return "EXPORT_PLAN_FAILED";
    return "EXPORT_PLAN_NOT_READY";
  }

  function reasonMessage(inspection) {
    if (!inspection?.project) return "Сохранённый проект не найден.";
    if (["stale", "source_invalid"].includes(inspection.state)) return "План устарел или не прошёл проверку связи с принятой адаптацией.";
    if (inspection.executionPlan?.status === "blocked") return "План содержит обязательные блокировки и не может быть экспортирован как готовая инструкция.";
    if (inspection.executionPlan?.status === "failed") return "Построение плана завершилось ошибкой; полноценная инструкция недоступна.";
    return "Сначала нужен корректный готовый план Stage 22.";
  }

  function invalid(code, message) { return Object.freeze({ isValid: false, code, message }); }
  function blocked(code, message) { return Object.freeze({ state: "blocked", code, message }); }
  function exportError(code, message) { return new PatternExecutionExportError(code, message); }
  function text(value) { return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }

  const api = Object.freeze({ CONTRACT_ID, PatternExecutionExportError, inspectAggregate, buildExportModel, validateStepIntegrity, buildStatus });
  globalObject.YarnAIPatternExecutionExport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
